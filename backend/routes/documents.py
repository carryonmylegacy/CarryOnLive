"""CarryOn™ Backend — Document & Voice Routes"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Response, Form
from pydantic import BaseModel
from typing import Optional
from config import db, logger
from utils import get_current_user, encrypt_data, decrypt_data, hash_password, verify_password, generate_backup_code, log_activity, update_estate_readiness
import os

from models import Document, DocumentUnlockRequest

router = APIRouter()

# ===================== DOCUMENT ROUTES =====================

@router.get("/documents/{estate_id}")
async def get_documents(estate_id: str, current_user: dict = Depends(get_current_user)):
    """List all documents for an estate."""
    documents = await db.documents.find(
        {"estate_id": estate_id}, 
        {"_id": 0, "file_data": 0, "lock_password_hash": 0, "backup_code": 0}
    ).to_list(100)
    return documents

@router.post("/documents/upload")
async def upload_document(
    estate_id: str,
    name: str,
    category: str,
    lock_type: Optional[str] = None,
    lock_password: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a new document to the estate vault."""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can upload documents")
    
    content = await file.read()
    
    # Encrypt the file data
    encrypted_data = encrypt_data(content)
    
    # Generate backup code for locked documents
    backup_code = generate_backup_code() if lock_type else None
    
    # Hash password if provided
    password_hash = hash_password(lock_password) if lock_password and lock_type == "password" else None
    
    document = Document(
        estate_id=estate_id,
        name=name,
        category=category,
        file_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        file_data=encrypted_data,
        is_locked=lock_type is not None,
        lock_type=lock_type,
        lock_password_hash=password_hash,
        backup_code=backup_code,
        is_encrypted=True,
        uploaded_by=current_user["id"]
    )
    await db.documents.insert_one(document.model_dump())
    
    # Update estate readiness
    await update_estate_readiness(estate_id)
    
    # Log activity
    await log_activity(
        estate_id=estate_id,
        user_id=current_user["id"],
        user_name=current_user["name"],
        action="document_uploaded",
        description=f"Uploaded document: {name} ({category})",
        metadata={"document_name": name, "category": category, "is_locked": lock_type is not None}
    )
    
    response = {"id": document.id, "name": document.name, "message": "Document uploaded and encrypted"}
    if backup_code:
        response["backup_code"] = backup_code
        response["backup_message"] = "Save this backup code securely - it can be used to unlock this document"
    
    return response

@router.post("/documents/{document_id}/unlock")
async def unlock_document(
    document_id: str,
    unlock_data: DocumentUnlockRequest,
    current_user: dict = Depends(get_current_user)
):
    """Unlock a protected document"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.get("is_locked"):
        return {"message": "Document is not locked", "unlocked": True}
    
    lock_type = document.get("lock_type")
    
    # Verify unlock credentials
    if lock_type == "password":
        if not unlock_data.password:
            raise HTTPException(status_code=400, detail="Password required")
        if not document.get("lock_password_hash"):
            raise HTTPException(status_code=400, detail="Document has no password set")
        if not verify_password(unlock_data.password, document["lock_password_hash"]):
            # Try backup code
            if unlock_data.backup_code and document.get("backup_code") == unlock_data.backup_code:
                pass  # Backup code valid
            else:
                raise HTTPException(status_code=401, detail="Invalid password")
    
    elif lock_type == "backup":
        if not unlock_data.backup_code:
            raise HTTPException(status_code=400, detail="Backup code required")
        if document.get("backup_code") != unlock_data.backup_code:
            raise HTTPException(status_code=401, detail="Invalid backup code")
    
    elif lock_type == "voice":
        # Voice verification would be implemented with a voice recognition API
        # For now, accept backup code as fallback
        if not unlock_data.backup_code:
            raise HTTPException(status_code=400, detail="Voice verification not available. Use backup code.")
        if document.get("backup_code") != unlock_data.backup_code:
            raise HTTPException(status_code=401, detail="Invalid backup code")
    
    return {"message": "Document unlocked successfully", "unlocked": True, "document_id": document_id}

@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: str,
    password: Optional[str] = None,
    backup_code: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Download a document (decrypted)"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check if document is locked and verify credentials
    if document.get("is_locked"):
        lock_type = document.get("lock_type")
        
        if lock_type == "password" and document.get("lock_password_hash"):
            if password and verify_password(password, document["lock_password_hash"]):
                pass  # Valid password
            elif backup_code and document.get("backup_code") == backup_code:
                pass  # Valid backup code
            else:
                raise HTTPException(status_code=401, detail="Invalid credentials for locked document")
        
        elif lock_type in ["backup", "voice"]:
            if not backup_code or document.get("backup_code") != backup_code:
                raise HTTPException(status_code=401, detail="Invalid backup code")
    
    # Decrypt the file data
    if not document.get("file_data"):
        raise HTTPException(status_code=404, detail="Document data not found")
    
    try:
        decrypted_data = decrypt_data(document["file_data"])
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        raise HTTPException(status_code=500, detail="Failed to decrypt document")
    
    return Response(
        content=decrypted_data,
        media_type=document.get("file_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'attachment; filename="{document["name"]}"'
        }
    )

@router.get("/documents/{document_id}/preview")
async def preview_document(
    document_id: str,
    password: Optional[str] = None,
    backup_code: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Preview a document (for PDFs and images) - returns inline content"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check if document is locked and verify credentials
    if document.get("is_locked"):
        lock_type = document.get("lock_type")
        
        if lock_type == "password" and document.get("lock_password_hash"):
            if password and verify_password(password, document["lock_password_hash"]):
                pass
            elif backup_code and document.get("backup_code") == backup_code:
                pass
            else:
                raise HTTPException(status_code=401, detail="Invalid credentials for locked document")
        
        elif lock_type in ["backup", "voice"]:
            if not backup_code or document.get("backup_code") != backup_code:
                raise HTTPException(status_code=401, detail="Invalid backup code")
    
    # Decrypt the file data
    if not document.get("file_data"):
        raise HTTPException(status_code=404, detail="Document data not found")
    
    try:
        decrypted_data = decrypt_data(document["file_data"])
    except Exception as e:
        logger.error(f"Decryption error: {e}")
        raise HTTPException(status_code=500, detail="Failed to decrypt document")
    
    # Return inline for preview (not as attachment)
    return Response(
        content=decrypted_data,
        media_type=document.get("file_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'inline; filename="{document["name"]}"'
        }
    )

# ===================== VOICE VERIFICATION ROUTES =====================

class VoicePassphraseSetup(BaseModel):
    document_id: str
    passphrase: str  # The passphrase the user will speak

class VoiceVerifyRequest(BaseModel):
    document_id: str
    spoken_text: str  # Text from speech recognition

@router.post("/voice/transcribe")
async def transcribe_voice(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Transcribe audio using OpenAI Whisper for voice verification"""
    from emergentintegrations.llm.openai import OpenAISpeechToText
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="Voice service not configured")
    
    try:
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large. Max 25MB.")
        
        # Save to temp file
        import tempfile
        suffix = '.' + (file.filename or 'audio.webm').split('.')[-1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        
        stt = OpenAISpeechToText(api_key=api_key)
        with open(tmp_path, 'rb') as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                language="en"
            )
        
        # Clean up
        os.unlink(tmp_path)
        
        transcription = response.text.strip()
        logger.info(f"Voice transcription for {current_user['email']}: '{transcription}'")
        
        return {"transcription": transcription}
    except Exception as e:
        logger.error(f"Voice transcription error: {e}")
        raise HTTPException(status_code=500, detail="Voice transcription failed")

@router.post("/voice/verify-passphrase")
async def verify_voice_passphrase(
    file: UploadFile = File(...),
    expected_passphrase: str = "",
    current_user: dict = Depends(get_current_user)
):
    """Transcribe audio and verify against expected passphrase"""
    from emergentintegrations.llm.openai import OpenAISpeechToText
    
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="Voice service not configured")
    
    try:
        content = await file.read()
        import tempfile
        suffix = '.' + (file.filename or 'audio.webm').split('.')[-1]
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        
        stt = OpenAISpeechToText(api_key=api_key)
        with open(tmp_path, 'rb') as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                response_format="json",
                language="en"
            )
        
        os.unlink(tmp_path)
        
        transcription = response.text.strip().lower()
        expected = expected_passphrase.strip().lower()
        
        # Fuzzy match — allow minor differences
        from difflib import SequenceMatcher
        similarity = SequenceMatcher(None, transcription, expected).ratio()
        verified = similarity >= 0.7  # 70% match threshold
        
        logger.info(f"Voice verify: '{transcription}' vs '{expected}' = {similarity:.2f} ({'PASS' if verified else 'FAIL'})")
        
        return {
            "verified": verified,
            "transcription": transcription,
            "similarity": round(similarity, 2),
            "message": "Voice verified successfully" if verified else "Voice verification failed. Please try again."
        }
    except Exception as e:
        logger.error(f"Voice verification error: {e}")
        raise HTTPException(status_code=500, detail="Voice verification failed")

@router.post("/documents/{document_id}/voice/setup")
async def setup_voice_passphrase(
    document_id: str,
    passphrase: str,
    current_user: dict = Depends(get_current_user)
):
    """Set up voice verification passphrase for a document"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can set up voice verification")
    
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if document.get("lock_type") != "voice":
        raise HTTPException(status_code=400, detail="Document is not set up for voice verification")
    
    # Store the passphrase (hashed for comparison)
    # We store both hash and normalized version for flexible matching
    normalized_passphrase = passphrase.lower().strip()
    
    await db.documents.update_one(
        {"id": document_id},
        {"$set": {
            "voice_passphrase_hash": hash_password(normalized_passphrase),
            "voice_passphrase_hint": passphrase[:3] + "..." if len(passphrase) > 3 else passphrase
        }}
    )
    
    return {"message": "Voice passphrase set up successfully", "hint": passphrase[:3] + "..."}

@router.post("/documents/{document_id}/voice/verify")
async def verify_document_voice_passphrase(
    document_id: str,
    data: VoiceVerifyRequest,
    current_user: dict = Depends(get_current_user)
):
    """Verify spoken passphrase for voice-locked document"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.get("voice_passphrase_hash"):
        raise HTTPException(status_code=400, detail="Voice passphrase not set up. Use backup code.")
    
    # Normalize and verify
    normalized_spoken = data.spoken_text.lower().strip()
    
    if verify_password(normalized_spoken, document["voice_passphrase_hash"]):
        return {"verified": True, "message": "Voice verification successful"}
    
    # Allow some flexibility - check if spoken text contains the passphrase
    # This helps with speech recognition variations
    raise HTTPException(status_code=401, detail="Voice verification failed. Try again or use backup code.")

@router.get("/documents/{document_id}/voice/hint")
async def get_voice_hint(
    document_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get voice passphrase hint"""
    document = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        "has_passphrase": bool(document.get("voice_passphrase_hash")),
        "hint": document.get("voice_passphrase_hint", "Not set")
    }

@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a document from the vault."""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can delete documents")
    
    result = await db.documents.delete_one({"id": document_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {"message": "Document deleted"}

@router.put("/documents/{document_id}")
async def update_document(document_id: str, current_user: dict = Depends(get_current_user), name: str = Form(None), category: str = Form(None), notes: str = Form(None)):
    """Update document metadata (name, category, notes)"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can update documents")
    
    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if category is not None:
        update_data["category"] = category
    if notes is not None:
        update_data["notes"] = notes
    
    if update_data:
        await db.documents.update_one({"id": document_id}, {"$set": update_data})
    
    updated = await db.documents.find_one({"id": document_id}, {"_id": 0})
    return updated


