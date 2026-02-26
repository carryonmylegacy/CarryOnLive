# CarryOn™ Production Architecture

## Executive Summary

This document outlines the production infrastructure for CarryOn™, a secure estate planning platform. The architecture prioritizes:

1. **Data Sovereignty** - All user data remains within AWS, never touching external services
2. **AI Isolation** - Estate Guardian AI runs on air-gapped infrastructure with no internet access
3. **Hybrid Intelligence** - Local LLM handles standard queries; cloud AI (with explicit consent) for complex analysis
4. **Zero-Trust Security** - End-to-end encryption, minimal access principles

---

## 1. Infrastructure Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AWS Region (us-east-1)                              │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                         VPC: carryon-prod (10.0.0.0/16)                    │  │
│  │                                                                            │  │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────────────┐   │  │
│  │  │   PUBLIC SUBNET          │    │   PRIVATE SUBNET (Isolated)         │   │  │
│  │  │   10.0.1.0/24           │    │   10.0.10.0/24                       │   │  │
│  │  │                         │    │                                      │   │  │
│  │  │  ┌─────────────────┐    │    │  ┌─────────────────────────────┐    │   │  │
│  │  │  │ ALB (HTTPS)     │    │    │  │  Estate Guardian AI          │    │   │  │
│  │  │  │ CloudFront CDN  │    │    │  │  EC2 g5.xlarge               │    │   │  │
│  │  │  └────────┬────────┘    │    │  │  - Llama 3.1 70B             │    │   │  │
│  │  │           │             │    │  │  - NO INTERNET ACCESS        │    │   │  │
│  │  │           │             │    │  │  - S3 VPC Endpoint only      │    │   │  │
│  │  └───────────┼─────────────┘    │  └─────────────────────────────┘    │   │  │
│  │              │                   │                                      │   │  │
│  │  ┌───────────▼─────────────┐    │  ┌─────────────────────────────┐    │   │  │
│  │  │   PRIVATE SUBNET        │    │  │  S3: carryon-vault-prod     │    │   │  │
│  │  │   10.0.2.0/24          │    │  │  - AES-256 Encryption       │    │   │  │
│  │  │                         │    │  │  - Versioning Enabled       │    │   │  │
│  │  │  ┌─────────────────┐    │    │  │  - No Public Access         │    │   │  │
│  │  │  │ ECS Fargate     │    │    │  └─────────────────────────────┘    │   │  │
│  │  │  │ - API Service   │    │    │                                      │   │  │
│  │  │  │ - Web Service   │    │    │  ┌─────────────────────────────┐    │   │  │
│  │  │  └─────────────────┘    │    │  │  DocumentDB Cluster         │    │   │  │
│  │  │                         │    │  │  - 3-node replica set       │    │   │  │
│  │  │  ┌─────────────────┐    │    │  │  - Encrypted at rest        │    │   │  │
│  │  │  │ ElastiCache     │    │    │  │  - Private subnet only      │    │   │  │
│  │  │  │ (Redis)         │    │    │  └─────────────────────────────┘    │   │  │
│  │  │  └─────────────────┘    │    │                                      │   │  │
│  │  └─────────────────────────┘    └──────────────────────────────────────┘   │  │
│  │                                                                            │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  VPC Endpoints (No Internet Required):                                          │
│  - com.amazonaws.us-east-1.s3 (Gateway)                                        │
│  - com.amazonaws.us-east-1.secretsmanager (Interface)                          │
│  - com.amazonaws.us-east-1.kms (Interface)                                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Secure Document Vault (SDV) Architecture

### S3 Configuration

```yaml
Bucket: carryon-vault-prod
Region: us-east-1

Encryption:
  Type: SSE-KMS
  KMS Key: arn:aws:kms:us-east-1:ACCOUNT:key/carryon-vault-key
  
Versioning: Enabled

Access:
  PublicAccessBlock: ALL BLOCKED
  BucketPolicy: VPC Endpoint Only
  
Lifecycle:
  - Transition to S3-IA after 90 days
  - Transition to Glacier Deep Archive after 365 days (for beneficiary-unclaimed docs)
  
Replication:
  - Cross-region to us-west-2 for disaster recovery
```

### Document Storage Structure

```
carryon-vault-prod/
├── estates/
│   └── {estate_id}/
│       ├── documents/
│       │   └── {doc_id}/
│       │       ├── original/          # Encrypted original file
│       │       ├── metadata.json      # Encrypted metadata
│       │       └── thumbnail/         # For previews (if image/PDF)
│       ├── messages/
│       │   └── {message_id}/
│       │       ├── content.json       # Text/triggers
│       │       └── media/             # Video/audio files
│       └── ai-context/
│           └── embeddings.json        # Pre-computed for local AI
└── system/
    └── ai-models/
        └── llama-3.1-70b-instruct/    # Model weights (for AI instance)
```

### Access Pattern

```
User Request → API → Generate Pre-Signed URL (5 min expiry) → Direct S3 Upload/Download
                     ↓
              CloudWatch Logging (access audit)
```

---

## 3. Estate Guardian AI - Hybrid Architecture

### The Air-Gapped Local AI

```
┌─────────────────────────────────────────────────────────────────┐
│                    ISOLATED PRIVATE SUBNET                       │
│                    (No Internet Gateway)                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                  EC2 g5.xlarge Instance                     │ │
│  │                                                              │ │
│  │  ┌──────────────────┐    ┌───────────────────────────────┐ │ │
│  │  │ Llama 3.1 70B    │    │ Document Processor             │ │ │
│  │  │ (Quantized 4-bit)│    │ - PDF text extraction         │ │ │
│  │  │                  │    │ - Image OCR                    │ │ │
│  │  │ VRAM: 24GB       │    │ - Embedding generation        │ │ │
│  │  │ Response: <3s    │    │                               │ │ │
│  │  └──────────────────┘    └───────────────────────────────┘ │ │
│  │                                                              │ │
│  │  Security:                                                   │ │
│  │  - No NAT Gateway attached                                  │ │
│  │  - Security Group: Inbound from API subnet only (port 8080) │ │
│  │  - Outbound: S3 VPC Endpoint only                          │ │
│  │  - No SSH access (SSM Session Manager for maintenance)      │ │
│  │                                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                      │
│                           │ S3 VPC Endpoint                     │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     S3 Vault Bucket                         │ │
│  │  - Read documents for analysis                              │ │
│  │  - Write AI-generated insights                              │ │
│  │  - Load model weights on startup                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Hybrid AI Routing Logic

```python
# ai_router.py - Determines local vs cloud processing

class AIRouter:
    """Routes queries to appropriate AI backend"""
    
    LOCAL_CAPABILITIES = [
        "document_summary",
        "checklist_generation", 
        "basic_legal_guidance",
        "beneficiary_suggestions",
        "readiness_score_calculation",
        "simple_qa"
    ]
    
    CLOUD_CAPABILITIES = [
        "complex_legal_analysis",
        "multi_document_comparison",
        "estate_planning_strategy",
        "tax_optimization_advice",
        "cross_state_compliance"
    ]
    
    def route_query(self, query_type: str, user_consent: bool) -> str:
        """
        Returns: 'local' | 'cloud' | 'denied'
        """
        if query_type in self.LOCAL_CAPABILITIES:
            return 'local'
        
        if query_type in self.CLOUD_CAPABILITIES:
            if user_consent:
                return 'cloud'
            else:
                return 'denied'  # Prompt for consent
        
        return 'local'  # Default to local for unknown types
```

### User Consent Flow for Cloud AI

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUD AI CONSENT MODAL                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │   🔒 Enhanced Analysis Available                            │ │
│  │                                                              │ │
│  │   Your question requires advanced analysis that uses our    │ │
│  │   secure cloud AI partner.                                  │ │
│  │                                                              │ │
│  │   What happens:                                              │ │
│  │   ✓ Your question is sent to our secure AI (AWS Bedrock)   │ │
│  │   ✓ Analysis is performed in an isolated environment       │ │
│  │   ✓ No document content is sent - only anonymized context  │ │
│  │   ✓ Query is deleted immediately after response            │ │
│  │                                                              │ │
│  │   ┌─────────────────┐  ┌─────────────────────────────────┐ │ │
│  │   │  Use Local AI   │  │  Allow Enhanced Analysis ✓      │ │ │
│  │   │  (Limited)      │  │  (Recommended)                  │ │ │
│  │   └─────────────────┘  └─────────────────────────────────┘ │ │
│  │                                                              │ │
│  │   [ ] Remember my choice for this session                   │ │
│  │                                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Application Services Architecture

### ECS Fargate Services

```yaml
Services:
  carryon-api:
    Image: carryon/api:latest
    CPU: 1024
    Memory: 2048
    DesiredCount: 2
    AutoScaling:
      Min: 2
      Max: 10
      TargetCPU: 70%
    Environment:
      - MONGODB_URI: (from Secrets Manager)
      - S3_BUCKET: carryon-vault-prod
      - AI_ENDPOINT: http://ai.internal:8080
      - REDIS_URL: (from ElastiCache endpoint)
    
  carryon-web:
    Image: carryon/web:latest
    CPU: 512
    Memory: 1024
    DesiredCount: 2
    
  carryon-worker:
    Image: carryon/worker:latest
    CPU: 512
    Memory: 1024
    DesiredCount: 1
    Purpose: Background jobs (email, notifications, AI preprocessing)
```

### Internal Service Communication

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   CloudFront │ ───▶ │     ALB     │ ───▶ │  ECS Tasks  │
│   (CDN)      │      │  (HTTPS)    │      │             │
└─────────────┘      └─────────────┘      └──────┬──────┘
                                                  │
                     AWS Cloud Map (Service Discovery)
                                                  │
          ┌───────────────────┬───────────────────┼───────────────────┐
          ▼                   ▼                   ▼                   ▼
   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
   │ DocumentDB  │     │ ElastiCache │     │  S3 Vault   │     │  AI Service │
   │ (MongoDB)   │     │  (Redis)    │     │             │     │  (Private)  │
   └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

---

## 5. Security Architecture

### Encryption Strategy

| Data Type | At Rest | In Transit | Key Management |
|-----------|---------|------------|----------------|
| Documents | AES-256 (KMS) | TLS 1.3 | AWS KMS with automatic rotation |
| Database | AES-256 (DocumentDB native) | TLS 1.2+ | AWS managed |
| Passwords | bcrypt (cost 12) | TLS 1.3 | N/A |
| API Keys | AES-256 (Secrets Manager) | TLS 1.3 | AWS KMS |
| Session Tokens | JWT (RS256) | TLS 1.3 | Rotated daily |

### Network Security

```yaml
SecurityGroups:
  
  sg-alb:
    Inbound:
      - 443 from 0.0.0.0/0 (HTTPS)
    Outbound:
      - 8000 to sg-api
      
  sg-api:
    Inbound:
      - 8000 from sg-alb
    Outbound:
      - 27017 to sg-db
      - 6379 to sg-cache
      - 8080 to sg-ai
      - 443 to S3 VPC Endpoint
      
  sg-ai:
    Inbound:
      - 8080 from sg-api
    Outbound:
      - 443 to S3 VPC Endpoint ONLY
      
  sg-db:
    Inbound:
      - 27017 from sg-api
    Outbound: NONE
```

### IAM Roles

```yaml
Roles:
  
  CarryOnAPIRole:
    Permissions:
      - s3:PutObject, s3:GetObject (carryon-vault-prod/*)
      - secretsmanager:GetSecretValue (carryon/*)
      - kms:Decrypt (carryon-vault-key)
      - logs:CreateLogStream, logs:PutLogEvents
      
  CarryOnAIRole:
    Permissions:
      - s3:GetObject (carryon-vault-prod/estates/*/documents/*)
      - s3:GetObject (carryon-vault-prod/system/ai-models/*)
      - s3:PutObject (carryon-vault-prod/estates/*/ai-context/*)
      # NO OTHER PERMISSIONS - especially no internet access
```

---

## 6. Transition Flow Architecture

When a benefactor passes away:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TRANSITION FLOW                                      │
│                                                                              │
│  1. DEATH CERTIFICATE UPLOAD                                                │
│     Beneficiary uploads certificate                                          │
│              │                                                               │
│              ▼                                                               │
│  2. TVT VERIFICATION                                                        │
│     Human review by Transition Verification Team                            │
│              │                                                               │
│              ▼                                                               │
│  3. ACCESS TRANSFER                                                          │
│     ┌─────────────────────────────────────────────────────────────────┐    │
│     │  - S3 bucket policies updated to include beneficiary IAM        │    │
│     │  - Database records updated (estate.transitioned = true)        │    │
│     │  - Benefactor's login disabled                                  │    │
│     │  - Beneficiary gains read access to vault                       │    │
│     │  - Milestone messages with "on_transition" trigger released     │    │
│     └─────────────────────────────────────────────────────────────────┘    │
│              │                                                               │
│              ▼                                                               │
│  4. DTS EXECUTION                                                           │
│     Designated Trustee Services tasks are executed                          │
│              │                                                               │
│              ▼                                                               │
│  5. RECORD DESTRUCTION (for DTS)                                            │
│     DTS records permanently deleted after execution                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Monitoring & Observability

### CloudWatch Dashboards

```yaml
Dashboards:
  
  CarryOn-Operations:
    Widgets:
      - API Response Times (p50, p95, p99)
      - Error Rate by Endpoint
      - Active Users (real-time)
      - Document Upload/Download Volume
      
  CarryOn-Security:
    Widgets:
      - Failed Login Attempts
      - Unusual S3 Access Patterns
      - AI Query Volume
      - Certificate Verification Queue
      
  CarryOn-AI:
    Widgets:
      - Local AI Response Times
      - Cloud AI Consent Rate
      - Query Types Distribution
      - Model Memory Usage
```

### Alerting

```yaml
Alerts:
  
  Critical:
    - API 5xx rate > 1% for 5 minutes
    - Database connection failures
    - S3 bucket access denied (unexpected)
    - AI service unavailable
    
  Warning:
    - API latency p95 > 2 seconds
    - Storage approaching 80% capacity
    - Certificate verification backlog > 10
    
  Info:
    - New user registration spike
    - Unusual document upload patterns
```

---

## 8. Disaster Recovery

### Backup Strategy

| Component | Backup Frequency | Retention | Recovery Time |
|-----------|------------------|-----------|---------------|
| S3 Documents | Real-time (versioning) | Indefinite | Minutes |
| DocumentDB | Continuous + Daily snapshots | 35 days | < 1 hour |
| AI Model Weights | On-change | Latest 3 versions | < 30 minutes |
| Configuration | Git (Infrastructure as Code) | Indefinite | < 15 minutes |

### Multi-Region Failover

```
Primary: us-east-1
├── Active services
├── S3 bucket (source)
└── DocumentDB cluster

Secondary: us-west-2 (Warm Standby)
├── Scaled-down ECS services
├── S3 bucket (replication target)
└── DocumentDB read replica

Failover Trigger:
- Route 53 health check failure (3 consecutive)
- Manual trigger via AWS Console
```

---

## 9. Cost Estimates (Monthly)

### Production Environment

| Service | Configuration | Estimated Cost |
|---------|--------------|----------------|
| ECS Fargate | 4 vCPU, 8GB (API x2) | $150 |
| EC2 g5.xlarge | AI instance (24/7) | $850 |
| DocumentDB | db.r6g.medium (3 nodes) | $450 |
| ElastiCache | cache.t3.medium | $70 |
| S3 | 500GB + requests | $30 |
| CloudFront | 1TB transfer | $85 |
| ALB | Standard | $25 |
| KMS | Key usage | $10 |
| Secrets Manager | 10 secrets | $5 |
| CloudWatch | Logs + metrics | $50 |
| **Total** | | **~$1,725/month** |

### Scaling Considerations

- AI instance can be spot instance during off-peak (60% savings)
- ECS auto-scaling handles traffic spikes
- S3 costs scale linearly with storage
- Consider Reserved Instances for 1-year commitment (30% savings)

---

## 10. Implementation Phases

### Phase 1: Foundation (Weeks 1-4)
- [ ] Set up VPC, subnets, security groups
- [ ] Deploy DocumentDB cluster
- [ ] Configure S3 bucket with encryption
- [ ] Set up ECS cluster and deploy API
- [ ] Migrate from MongoDB to DocumentDB

### Phase 2: AI Infrastructure (Weeks 5-8)
- [ ] Deploy isolated AI subnet
- [ ] Set up EC2 GPU instance
- [ ] Install and configure Llama 3.1
- [ ] Implement AI routing logic
- [ ] Build consent flow UI

### Phase 3: Security Hardening (Weeks 9-10)
- [ ] Implement all IAM policies
- [ ] Set up VPC endpoints
- [ ] Configure CloudWatch alarms
- [ ] Penetration testing
- [ ] Security audit

### Phase 4: Production Launch (Weeks 11-12)
- [ ] Load testing
- [ ] Failover testing
- [ ] Documentation
- [ ] Team training
- [ ] Go-live

---

## Appendix A: Security Compliance

This architecture supports compliance with:
- **SOC 2 Type II** - Access controls, encryption, monitoring
- **HIPAA** - If medical documents stored (with BAA)
- **GDPR** - Data isolation, right to deletion
- **State Privacy Laws** - California, Virginia, etc.

---

## Appendix B: API Integration Points

For third-party integrations that DO require internet:

```yaml
Allowed External Connections (via NAT Gateway):
  
  Payment Processing:
    - Stripe API (api.stripe.com)
    - Reason: Payment method storage, charging
    
  Email/SMS:
    - Resend API (api.resend.com)
    - Twilio API (api.twilio.com)
    - Reason: OTP delivery, notifications
    
  Cloud AI (with consent):
    - AWS Bedrock (bedrock.us-east-1.amazonaws.com)
    - Reason: Complex analysis queries only
```

All other traffic is blocked at the NAT Gateway level.

---

*Document Version: 1.0*
*Last Updated: February 2026*
*Author: CarryOn™ Engineering Team*
