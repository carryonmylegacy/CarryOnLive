# Estate Guardian AI - Implementation Specification

## Overview

The Estate Guardian AI uses a **hybrid architecture**:
- **Local AI** (air-gapped Llama 3.1): Handles 80% of queries, never connects to internet
- **Cloud AI** (AWS Bedrock Claude): Handles complex queries with explicit user consent

---

## 1. Query Classification System

### Query Types & Routing

```python
QUERY_CLASSIFICATION = {
    # LOCAL AI - Fast, private, always available
    "local": {
        "document_summary": {
            "description": "Summarize uploaded documents",
            "example": "What does my will say about property distribution?",
            "avg_response_time": "2-3 seconds"
        },
        "checklist_generation": {
            "description": "Generate action items based on documents",
            "example": "What should I do to complete my estate plan?",
            "avg_response_time": "3-5 seconds"
        },
        "basic_legal_guidance": {
            "description": "General estate planning information",
            "example": "What is a living trust?",
            "avg_response_time": "1-2 seconds"
        },
        "beneficiary_suggestions": {
            "description": "Recommendations for beneficiary management",
            "example": "How should I structure inheritance for minor children?",
            "avg_response_time": "2-3 seconds"
        },
        "readiness_assessment": {
            "description": "Evaluate estate plan completeness",
            "example": "Is my estate plan complete?",
            "avg_response_time": "4-6 seconds"
        },
        "document_qa": {
            "description": "Answer questions about specific documents",
            "example": "Who is named as executor in my will?",
            "avg_response_time": "2-3 seconds"
        }
    },
    
    # CLOUD AI - Complex, requires consent
    "cloud": {
        "complex_legal_analysis": {
            "description": "In-depth legal strategy analysis",
            "example": "How can I minimize estate taxes across multiple states?",
            "requires_consent": True,
            "data_sent": "Anonymized document summaries only"
        },
        "multi_document_comparison": {
            "description": "Cross-reference multiple documents for conflicts",
            "example": "Are there any conflicts between my will and trust?",
            "requires_consent": True,
            "data_sent": "Document structure analysis (no PII)"
        },
        "estate_planning_strategy": {
            "description": "Comprehensive planning recommendations",
            "example": "What's the best way to pass my business to my children?",
            "requires_consent": True,
            "data_sent": "Asset categories and family structure (anonymized)"
        },
        "tax_optimization": {
            "description": "Tax-efficient wealth transfer strategies",
            "example": "How can I use gifting to reduce my taxable estate?",
            "requires_consent": True,
            "data_sent": "Asset values (ranges, not exact)"
        },
        "cross_jurisdiction": {
            "description": "Multi-state or international considerations",
            "example": "I own property in 3 states - what do I need to know?",
            "requires_consent": True,
            "data_sent": "State/country list and property types"
        }
    }
}
```

---

## 2. Local AI Implementation

### Hardware Specification

```yaml
Instance: EC2 g5.xlarge
  vCPU: 4
  RAM: 16 GB
  GPU: NVIDIA A10G (24 GB VRAM)
  Storage: 200 GB gp3 SSD
  
Model: Llama 3.1 70B Instruct (4-bit quantized)
  VRAM Usage: ~20 GB
  Context Window: 8,192 tokens
  Inference Speed: ~30 tokens/second
```

### Isolation Configuration

```yaml
# Network Configuration
NetworkInterfaces:
  - SubnetId: subnet-isolated-ai
    Groups:
      - sg-ai-isolated
    
SecurityGroup (sg-ai-isolated):
  Ingress:
    - Port: 8080
      Source: sg-api-service
      Description: "API requests only"
  Egress:
    - Port: 443
      Destination: pl-s3-endpoint  # S3 VPC Endpoint prefix list
      Description: "S3 access via VPC endpoint only"
    # NO OTHER EGRESS RULES - completely air-gapped from internet
    
RouteTable:
  Routes:
    - Destination: 10.0.0.0/16
      Target: local
    - Destination: pl-s3-endpoint
      Target: vpce-s3-gateway
    # NO route to NAT Gateway or Internet Gateway
```

### AI Service Code

```python
# /app/ai_service/main.py

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from llama_cpp import Llama
import boto3
from typing import Optional
import json

app = FastAPI()

# Initialize model on startup
MODEL_PATH = "/opt/models/llama-3.1-70b-instruct-q4.gguf"
llm = None

@app.on_event("startup")
async def load_model():
    global llm
    llm = Llama(
        model_path=MODEL_PATH,
        n_ctx=8192,
        n_gpu_layers=-1,  # Use all GPU layers
        n_threads=4
    )
    print("Model loaded successfully")

class QueryRequest(BaseModel):
    query: str
    context: Optional[str] = None
    estate_id: str
    query_type: str

class QueryResponse(BaseModel):
    response: str
    tokens_used: int
    processing_time_ms: int

# S3 client for document access (via VPC endpoint)
s3 = boto3.client('s3', region_name='us-east-1')

def get_document_context(estate_id: str, doc_ids: list[str]) -> str:
    """Fetch document content from S3 for context"""
    context_parts = []
    for doc_id in doc_ids[:5]:  # Limit to 5 docs
        try:
            obj = s3.get_object(
                Bucket='carryon-vault-prod',
                Key=f'estates/{estate_id}/documents/{doc_id}/content.txt'
            )
            content = obj['Body'].read().decode('utf-8')
            context_parts.append(f"Document {doc_id}:\n{content[:2000]}")
        except Exception as e:
            print(f"Error fetching doc {doc_id}: {e}")
    return "\n\n".join(context_parts)

SYSTEM_PROMPT = """You are the Estate Guardian AI for CarryOn™, a secure estate planning platform.

Your role:
- Help users understand their estate planning documents
- Provide general guidance on estate planning best practices
- Generate actionable checklists based on their documents
- Answer questions about their uploaded documents

Important:
- Never provide specific legal advice - recommend consulting an attorney for complex matters
- Be compassionate - users may be dealing with end-of-life planning
- Be concise but thorough
- If you're unsure, say so

Context about the user's documents will be provided below."""

@app.post("/query", response_model=QueryResponse)
async def process_query(request: QueryRequest):
    import time
    start = time.time()
    
    # Build prompt
    prompt = f"""<|begin_of_text|><|start_header_id|>system<|end_header_id|>
{SYSTEM_PROMPT}

{request.context or "No document context provided."}
<|eot_id|><|start_header_id|>user<|end_header_id|>
{request.query}
<|eot_id|><|start_header_id|>assistant<|end_header_id|>"""
    
    # Generate response
    output = llm(
        prompt,
        max_tokens=1024,
        temperature=0.7,
        top_p=0.9,
        stop=["<|eot_id|>"]
    )
    
    response_text = output['choices'][0]['text'].strip()
    tokens = output['usage']['total_tokens']
    
    elapsed_ms = int((time.time() - start) * 1000)
    
    return QueryResponse(
        response=response_text,
        tokens_used=tokens,
        processing_time_ms=elapsed_ms
    )

@app.get("/health")
async def health():
    return {"status": "healthy", "model_loaded": llm is not None}
```

---

## 3. Cloud AI Integration (AWS Bedrock)

### When Cloud AI is Used

```python
# /app/backend/ai_router.py

import boto3
from typing import Tuple

bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

def should_use_cloud_ai(query: str, query_type: str) -> Tuple[bool, str]:
    """
    Determine if query needs cloud AI
    Returns: (needs_cloud, reason)
    """
    CLOUD_INDICATORS = [
        ("tax", "Tax optimization analysis"),
        ("multiple states", "Cross-jurisdiction analysis"),
        ("minimize estate", "Estate reduction strategies"),
        ("business succession", "Complex business planning"),
        ("conflict", "Document conflict analysis"),
        ("compare", "Multi-document comparison"),
    ]
    
    query_lower = query.lower()
    
    for indicator, reason in CLOUD_INDICATORS:
        if indicator in query_lower:
            return True, reason
    
    # Check query type
    if query_type in ["tax_optimization", "cross_jurisdiction", "complex_legal_analysis"]:
        return True, f"Query type '{query_type}' requires enhanced analysis"
    
    return False, ""

def anonymize_for_cloud(estate_data: dict) -> dict:
    """
    Remove PII before sending to cloud AI
    """
    return {
        "asset_categories": [a["type"] for a in estate_data.get("assets", [])],
        "asset_value_ranges": [
            "under_100k" if a["value"] < 100000 else
            "100k_500k" if a["value"] < 500000 else
            "500k_1m" if a["value"] < 1000000 else
            "over_1m"
            for a in estate_data.get("assets", [])
        ],
        "beneficiary_count": len(estate_data.get("beneficiaries", [])),
        "beneficiary_relationships": [b["relation"] for b in estate_data.get("beneficiaries", [])],
        "document_types": [d["category"] for d in estate_data.get("documents", [])],
        "states_involved": list(set(estate_data.get("states", []))),
        "has_business": estate_data.get("has_business", False),
        "has_real_estate": estate_data.get("has_real_estate", False),
    }

async def query_cloud_ai(query: str, anonymized_context: dict) -> str:
    """
    Send query to AWS Bedrock (Claude)
    """
    prompt = f"""You are an estate planning advisor. The user has the following estate profile (anonymized):

{json.dumps(anonymized_context, indent=2)}

User question: {query}

Provide detailed, actionable guidance. Note that you don't have access to specific document contents - only the profile above."""

    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-sonnet-20240229-v1:0',
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": prompt}]
        })
    )
    
    result = json.loads(response['body'].read())
    return result['content'][0]['text']
```

---

## 4. Frontend Integration

### AI Query Component

```jsx
// /app/frontend/src/components/GuardianChat.jsx

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, Lock, Cloud, Cpu } from 'lucide-react';

const GuardianChat = ({ estateId }) => {
  const { getAuthHeaders } = useAuth();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [consentModal, setConsentModal] = useState(null);
  const [cloudConsent, setCloudConsent] = useState(false);

  const sendQuery = async (forceLocal = false) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/guardian/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders().headers
        },
        body: JSON.stringify({
          query,
          estate_id: estateId,
          allow_cloud: !forceLocal && cloudConsent
        })
      });
      
      const data = await res.json();
      
      if (data.requires_consent && !cloudConsent) {
        setConsentModal({
          reason: data.consent_reason,
          onAccept: () => {
            setCloudConsent(true);
            setConsentModal(null);
            sendQuery();
          },
          onDecline: () => {
            setConsentModal(null);
            sendQuery(true); // Force local
          }
        });
        return;
      }
      
      setResponse(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Query Input */}
      <div className="flex gap-2">
        <input
          className="input-field flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask the Estate Guardian..."
        />
        <button 
          className="gold-button"
          onClick={() => sendQuery()}
          disabled={loading}
        >
          Ask
        </button>
      </div>
      
      {/* Response Display */}
      {response && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2 text-xs text-[var(--t5)]">
            {response.processed_by === 'local' ? (
              <>
                <Cpu className="w-4 h-4 text-green-500" />
                <span>Processed securely on-device</span>
                <Lock className="w-3 h-3" />
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4 text-blue-500" />
                <span>Enhanced analysis (anonymized)</span>
              </>
            )}
          </div>
          <p className="text-[var(--t)]">{response.answer}</p>
        </div>
      )}
      
      {/* Consent Modal */}
      {consentModal && (
        <ConsentModal
          reason={consentModal.reason}
          onAccept={consentModal.onAccept}
          onDecline={consentModal.onDecline}
        />
      )}
    </div>
  );
};

const ConsentModal = ({ reason, onAccept, onDecline }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
    <div className="glass-card p-6 max-w-md">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="w-8 h-8 text-[var(--gold)]" />
        <h3 className="text-lg font-bold text-[var(--t)]">Enhanced Analysis Available</h3>
      </div>
      
      <p className="text-[var(--t3)] mb-4">
        Your question ({reason}) would benefit from our enhanced AI analysis.
      </p>
      
      <div className="bg-[var(--s)] rounded-lg p-4 mb-4">
        <h4 className="font-bold text-[var(--t)] text-sm mb-2">What we send (anonymized):</h4>
        <ul className="text-xs text-[var(--t4)] space-y-1">
          <li>✓ Asset categories (not values)</li>
          <li>✓ Document types (not contents)</li>
          <li>✓ Family structure (not names)</li>
          <li>✗ No personal information</li>
          <li>✗ No document text</li>
        </ul>
      </div>
      
      <div className="flex gap-3">
        <button
          className="flex-1 border border-[var(--b)] text-[var(--t3)] rounded-lg py-2"
          onClick={onDecline}
        >
          Use Local AI Only
        </button>
        <button
          className="flex-1 gold-button"
          onClick={onAccept}
        >
          Allow Enhanced Analysis
        </button>
      </div>
    </div>
  </div>
);

export default GuardianChat;
```

---

## 5. Security Audit Trail

### AI Query Logging

```python
# All AI queries are logged (without PII)

AI_QUERY_LOG_SCHEMA = {
    "timestamp": "2026-02-26T10:30:00Z",
    "estate_id_hash": "sha256_hash",  # Not actual ID
    "query_type": "document_summary",
    "processed_by": "local",  # or "cloud"
    "tokens_used": 450,
    "response_time_ms": 2340,
    "user_consented_cloud": False,
    "anonymized_context_sent": False
}

# Stored in CloudWatch Logs with 90-day retention
# Used for:
# - Performance monitoring
# - Usage analytics
# - Security auditing
# - NOT for training or data collection
```

---

## 6. Failover Behavior

```yaml
AI Failover Strategy:

  Primary: Local AI (air-gapped)
    - Always attempted first
    - 99.9% uptime target
    
  Fallback: Cloud AI (with consent)
    - Used when local AI unavailable
    - Requires explicit user opt-in
    - Anonymized data only
    
  Degraded Mode:
    - If both unavailable
    - Show cached responses for common queries
    - Display "AI temporarily unavailable" for custom queries
    - Queue queries for later processing
```

---

*This specification ensures user data privacy while providing powerful AI capabilities.*
