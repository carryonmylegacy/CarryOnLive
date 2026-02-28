"""
AES-256-GCM Encryption Upgrade Tests

Tests for the major backend encryption architecture change:
- AES-256-GCM encryption (upgraded from Fernet AES-128-CBC)
- Per-estate derived encryption keys
- Cloud storage abstraction (LocalStorage in dev)
- Encrypted milestone messages
- Encrypted digital wallet entries
- SOC 2 audit trail
- Vault security info endpoint
"""

import os
import time
import uuid
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ============= DOCUMENT ENCRYPTION TESTS =============


class TestDocumentUpload:
    """Document upload with AES-256-GCM encryption and cloud storage"""

    def test_upload_document_creates_encrypted_file(self, benefactor_token, test_estate_id):
        """POST /api/documents/upload - Encrypt with AES-256-GCM and store in cloud"""
        test_content = f"TEST_ENCRYPTED_DOCUMENT_{uuid.uuid4().hex[:8]}"
        doc_name = f"TEST_aes256_doc_{uuid.uuid4().hex[:8]}.txt"

        resp = requests.post(
            f"{BASE_URL}/api/documents/upload",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            params={
                "estate_id": test_estate_id,
                "name": doc_name,
                "category": "other",
            },
            files={"file": ("test.txt", test_content.encode(), "text/plain")},
        )
        assert resp.status_code == 200, f"Upload failed: {resp.text}"
        data = resp.json()

        # Verify response
        assert "id" in data, "Missing document ID"
        assert "AES-256-GCM" in data.get("message", ""), "Should confirm AES-256-GCM encryption"
        print(f"✅ Document uploaded with ID: {data['id']}")
        print(f"   Message: {data.get('message', '')}")

    def test_list_documents_shows_encryption_info(self, benefactor_token, test_estate_id):
        """GET /api/documents/{estate_id} - Show encryption_version and storage_type"""
        resp = requests.get(
            f"{BASE_URL}/api/documents/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert resp.status_code == 200, f"List failed: {resp.text}"
        docs = resp.json()

        assert isinstance(docs, list), "Should return list of documents"
        
        # Find any recent test document
        test_doc = None
        for doc in docs:
            if doc.get("name", "").startswith("TEST_"):
                test_doc = doc
                break
        
        if test_doc:
            assert test_doc.get("encryption_version") == "aes-256-gcm", f"Expected aes-256-gcm, got {test_doc.get('encryption_version')}"
            assert test_doc.get("storage_type") == "cloud", f"Expected cloud storage, got {test_doc.get('storage_type')}"
            print(f"✅ Document encryption_version: {test_doc.get('encryption_version')}")
            print(f"   storage_type: {test_doc.get('storage_type')}")
        else:
            print("⚠️ Test document not found in list, checking any doc for encryption fields")
            if docs:
                assert "encryption_version" in docs[0], "Documents should have encryption_version field"
                assert "storage_type" in docs[0], "Documents should have storage_type field"


class TestDocumentDownload:
    """Document download and decryption"""

    def test_download_document_decrypts_aes256(self, benefactor_token, test_estate_id):
        """GET /api/documents/{doc_id}/download - Decrypt AES-256-GCM and return plaintext"""
        test_content = f"DOWNLOAD_TEST_CONTENT_{uuid.uuid4().hex[:8]}"
        doc_name = f"TEST_download_test_{uuid.uuid4().hex[:8]}.txt"

        upload_resp = requests.post(
            f"{BASE_URL}/api/documents/upload",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            params={"estate_id": test_estate_id, "name": doc_name, "category": "other"},
            files={"file": ("test.txt", test_content.encode(), "text/plain")},
        )
        assert upload_resp.status_code == 200, f"Upload failed: {upload_resp.text}"
        doc_id = upload_resp.json()["id"]

        # Download and verify content matches
        download_resp = requests.get(
            f"{BASE_URL}/api/documents/{doc_id}/download",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert download_resp.status_code == 200, f"Download failed: {download_resp.text}"
        
        downloaded_content = download_resp.content.decode("utf-8")
        assert downloaded_content == test_content, f"Content mismatch: expected '{test_content}', got '{downloaded_content}'"
        print("✅ Document downloaded and decrypted correctly")
        print(f"   Content verified: {downloaded_content[:50]}...")

    def test_preview_document_decrypts_inline(self, benefactor_token, test_estate_id):
        """GET /api/documents/{doc_id}/preview - Decrypt and return inline"""
        test_content = f"PREVIEW_TEST_CONTENT_{uuid.uuid4().hex[:8]}"
        doc_name = f"TEST_preview_test_{uuid.uuid4().hex[:8]}.txt"

        upload_resp = requests.post(
            f"{BASE_URL}/api/documents/upload",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            params={"estate_id": test_estate_id, "name": doc_name, "category": "other"},
            files={"file": ("test.txt", test_content.encode(), "text/plain")},
        )
        assert upload_resp.status_code == 200
        doc_id = upload_resp.json()["id"]

        # Preview
        preview_resp = requests.get(
            f"{BASE_URL}/api/documents/{doc_id}/preview",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert preview_resp.status_code == 200, f"Preview failed: {preview_resp.text}"
        
        # Check Content-Disposition is inline (not attachment)
        content_disp = preview_resp.headers.get("Content-Disposition", "")
        assert "inline" in content_disp, f"Expected inline disposition, got: {content_disp}"
        
        preview_content = preview_resp.content.decode("utf-8")
        assert preview_content == test_content, "Preview content mismatch"
        print("✅ Document preview decrypted with inline disposition")


class TestDocumentDelete:
    """Document deletion from MongoDB and cloud storage"""

    def test_delete_document_removes_from_storage(self, benefactor_token, test_estate_id):
        """DELETE /api/documents/{doc_id} - Remove from MongoDB AND cloud storage"""
        doc_name = f"TEST_delete_test_{uuid.uuid4().hex[:8]}.txt"
        upload_resp = requests.post(
            f"{BASE_URL}/api/documents/upload",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            params={"estate_id": test_estate_id, "name": doc_name, "category": "other"},
            files={"file": ("delete_me.txt", b"DELETE_ME", "text/plain")},
        )
        assert upload_resp.status_code == 200
        doc_id = upload_resp.json()["id"]

        # Delete
        delete_resp = requests.delete(
            f"{BASE_URL}/api/documents/{doc_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        print(f"✅ Document {doc_id} deleted")

        # Verify it's gone - download should 404
        verify_resp = requests.get(
            f"{BASE_URL}/api/documents/{doc_id}/download",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert verify_resp.status_code == 404, f"Expected 404, got {verify_resp.status_code}"
        print("✅ Verified document is removed (404 on download)")


# ============= MESSAGE ENCRYPTION TESTS =============


class TestMessageEncryption:
    """Milestone message encryption tests"""

    def test_create_message_encrypts_title_content(self, benefactor_token, test_estate_id):
        """POST /api/messages - Encrypt title and content with AES-256-GCM"""
        unique_id = uuid.uuid4().hex[:8]
        message_data = {
            "estate_id": test_estate_id,
            "title": f"TEST_MESSAGE_TITLE_{unique_id}",
            "content": f"TEST_MESSAGE_CONTENT_This is encrypted content for testing {unique_id}",
            "message_type": "text",
            "recipients": [],
            "trigger_type": "immediate",
        }

        resp = requests.post(
            f"{BASE_URL}/api/messages",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            json=message_data,
        )
        assert resp.status_code == 200, f"Create message failed: {resp.text}"
        data = resp.json()

        assert "id" in data, "Missing message ID"
        assert data.get("title") == message_data["title"], "Title should match"
        print(f"✅ Message created with ID: {data['id']}")

    def test_list_messages_decrypts_content(self, benefactor_token, test_estate_id):
        """GET /api/messages/{estate_id} - Decrypt and return plaintext title/content"""
        resp = requests.get(
            f"{BASE_URL}/api/messages/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert resp.status_code == 200, f"List messages failed: {resp.text}"
        messages = resp.json()

        assert isinstance(messages, list), "Should return list"
        
        # Find our test message
        test_msg = None
        for msg in messages:
            if msg.get("title", "").startswith("TEST_MESSAGE_TITLE_"):
                test_msg = msg
                break

        if test_msg:
            # Verify decrypted content
            assert "TEST_MESSAGE_TITLE_" in test_msg.get("title", ""), "Title should be decrypted"
            assert "TEST_MESSAGE_CONTENT_" in test_msg.get("content", ""), "Content should be decrypted"
            print(f"✅ Message title decrypted: {test_msg.get('title')[:50]}...")
            print(f"   Content decrypted: {test_msg.get('content')[:50]}...")
        else:
            print(f"⚠️ Test message not found in list of {len(messages)} messages")


# ============= DIGITAL WALLET ENCRYPTION TESTS =============


class TestDigitalWalletEncryption:
    """Digital wallet encryption tests"""

    def test_create_wallet_entry_encrypts_password(self, benefactor_token):
        """POST /api/digital-wallet - Encrypt password with per-estate key"""
        unique_id = uuid.uuid4().hex[:8]
        wallet_data = {
            "account_name": f"TEST_WALLET_{unique_id}",
            "login_username": f"testuser_{unique_id}@example.com",
            "password": f"SuperSecret_{unique_id}!@#",
            "additional_access": f"2FA Code: {unique_id}",
            "notes": "Test wallet entry for encryption verification",
            "category": "other",
        }

        resp = requests.post(
            f"{BASE_URL}/api/digital-wallet",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            json=wallet_data,
        )
        assert resp.status_code == 200, f"Create wallet failed: {resp.text}"
        data = resp.json()

        assert "id" in data, "Missing entry ID"
        print(f"✅ Wallet entry created with ID: {data['id']}")

    def test_list_wallet_decrypts_passwords(self, benefactor_token, test_estate_id):
        """GET /api/digital-wallet/{estate_id} - Decrypt passwords for owner"""
        resp = requests.get(
            f"{BASE_URL}/api/digital-wallet/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert resp.status_code == 200, f"List wallet failed: {resp.text}"
        entries = resp.json()

        assert isinstance(entries, list), "Should return list"
        
        # Find our test entry
        test_entry = None
        for entry in entries:
            if entry.get("account_name", "").startswith("TEST_WALLET_"):
                test_entry = entry
                break

        if test_entry:
            # Password should be decrypted for the owner
            assert "password" in test_entry, "Password should be present in response"
            assert "SuperSecret_" in test_entry.get("password", ""), "Password should be decrypted"
            print(f"✅ Wallet password decrypted: {test_entry.get('password')[:20]}...")
        else:
            print(f"⚠️ Test wallet entry not found in list of {len(entries)} entries")


# ============= VAULT SECURITY INFO TESTS =============


class TestVaultSecurityInfo:
    """Vault security and encryption metadata endpoint tests"""

    def test_vault_security_info_returns_metadata(self, benefactor_token, test_estate_id):
        """GET /api/vault/security-info/{estate_id} - Return encryption metadata"""
        resp = requests.get(
            f"{BASE_URL}/api/vault/security-info/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert resp.status_code == 200, f"Security info failed: {resp.text}"
        data = resp.json()

        # Verify encryption metadata
        assert "encryption" in data, "Missing encryption section"
        encryption = data["encryption"]
        assert encryption.get("algorithm") == "AES-256-GCM", f"Expected AES-256-GCM, got {encryption.get('algorithm')}"
        assert "PBKDF2" in encryption.get("key_derivation", ""), "Should mention PBKDF2 key derivation"
        assert "Per-estate" in encryption.get("key_scope", ""), "Should mention per-estate keys"
        print(f"✅ Encryption algorithm: {encryption.get('algorithm')}")
        print(f"   Key derivation: {encryption.get('key_derivation')}")
        print(f"   Key scope: {encryption.get('key_scope')}")

        # Verify storage metadata
        assert "storage" in data, "Missing storage section"
        storage = data["storage"]
        assert "AES-256-GCM" in storage.get("encryption_at_rest", ""), "Should mention AES-256-GCM at rest"
        print(f"   Encryption at rest: {storage.get('encryption_at_rest')}")

        # Verify vault stats
        assert "vault_stats" in data, "Missing vault_stats section"
        stats = data["vault_stats"]
        assert "total_documents" in stats, "Should have total_documents"
        assert "aes256_encrypted" in stats, "Should have aes256_encrypted count"
        assert "audit_entries" in stats, "Should have audit_entries count"
        print(f"   Total documents: {stats.get('total_documents')}")
        print(f"   AES-256 encrypted: {stats.get('aes256_encrypted')}")
        print(f"   Cloud stored: {stats.get('cloud_stored')}")
        print(f"   Audit entries: {stats.get('audit_entries')}")

        # Verify compliance
        compliance = encryption.get("compliance", [])
        assert "SOC 2" in str(compliance), "Should mention SOC 2 compliance"


# ============= AUDIT TRAIL TESTS =============


class TestAuditTrail:
    """SOC 2 audit trail tests"""

    def test_upload_creates_audit_entry(self, benefactor_token, test_estate_id):
        """Document upload should create audit entry in security_audit_log"""
        # Get current audit count
        info_resp1 = requests.get(
            f"{BASE_URL}/api/vault/security-info/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        initial_audit_count = info_resp1.json().get("vault_stats", {}).get("audit_entries", 0)

        # Upload a document
        upload_resp = requests.post(
            f"{BASE_URL}/api/documents/upload",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            params={
                "estate_id": test_estate_id,
                "name": f"TEST_audit_test_{uuid.uuid4().hex[:8]}.txt",
                "category": "other",
            },
            files={"file": ("audit.txt", b"AUDIT_TEST", "text/plain")},
        )
        assert upload_resp.status_code == 200

        # Wait a moment for audit to be written
        time.sleep(0.5)

        # Get new audit count
        info_resp2 = requests.get(
            f"{BASE_URL}/api/vault/security-info/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        new_audit_count = info_resp2.json().get("vault_stats", {}).get("audit_entries", 0)

        assert new_audit_count > initial_audit_count, f"Audit count should increase. Initial: {initial_audit_count}, New: {new_audit_count}"
        print(f"✅ Audit entry created for upload (count: {initial_audit_count} -> {new_audit_count})")

    def test_download_creates_audit_entry(self, benefactor_token, test_estate_id):
        """Document download should create audit entry"""
        # Upload a doc first
        upload_resp = requests.post(
            f"{BASE_URL}/api/documents/upload",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            params={
                "estate_id": test_estate_id,
                "name": f"TEST_audit_download_{uuid.uuid4().hex[:8]}.txt",
                "category": "other",
            },
            files={"file": ("audit.txt", b"AUDIT_DOWNLOAD_TEST", "text/plain")},
        )
        assert upload_resp.status_code == 200, f"Upload failed: {upload_resp.text}"
        doc_id = upload_resp.json()["id"]

        # Get audit count before download
        info_resp1 = requests.get(
            f"{BASE_URL}/api/vault/security-info/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        initial_count = info_resp1.json().get("vault_stats", {}).get("audit_entries", 0)

        # Download
        download_resp = requests.get(
            f"{BASE_URL}/api/documents/{doc_id}/download",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert download_resp.status_code == 200

        time.sleep(0.5)

        # Check audit increased
        info_resp2 = requests.get(
            f"{BASE_URL}/api/vault/security-info/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        new_count = info_resp2.json().get("vault_stats", {}).get("audit_entries", 0)

        assert new_count > initial_count, f"Audit count should increase on download. Initial: {initial_count}, New: {new_count}"
        print(f"✅ Audit entry created for download (count: {initial_count} -> {new_count})")


# ============= ESTATE ENCRYPTION SALT TESTS =============


class TestEstateEncryptionSalt:
    """Per-estate encryption salt tests"""

    def test_new_estate_has_encryption_salt(self, benefactor_token):
        """POST /api/estates - New estates should have encryption_salt field"""
        estate_name = f"TEST_ESTATE_{uuid.uuid4().hex[:8]}"
        
        resp = requests.post(
            f"{BASE_URL}/api/estates",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            json={"name": estate_name},
        )
        assert resp.status_code == 200, f"Create estate failed: {resp.text}"
        data = resp.json()

        assert "id" in data, "Missing estate ID"
        estate_id = data["id"]
        print(f"✅ New estate created: {estate_id}")

        # Get estate and verify encryption_salt exists
        get_resp = requests.get(
            f"{BASE_URL}/api/estates/{estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert get_resp.status_code == 200
        estate = get_resp.json()

        assert "encryption_salt" in estate, "New estate should have encryption_salt"
        salt = estate["encryption_salt"]
        assert len(salt) == 64, f"Salt should be 32 bytes hex-encoded (64 chars), got {len(salt)}"
        print(f"✅ Estate has encryption_salt: {salt[:16]}...")

    def test_existing_estate_has_encryption_salt(self, benefactor_token, test_estate_id):
        """Existing estate should have encryption_salt (lazily generated)"""
        resp = requests.get(
            f"{BASE_URL}/api/estates/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        assert resp.status_code == 200, f"Get estate failed: {resp.text}"
        estate = resp.json()

        assert "encryption_salt" in estate, "Estate should have encryption_salt (lazily generated)"
        salt = estate["encryption_salt"]
        assert len(salt) == 64, f"Salt should be 32 bytes hex-encoded (64 chars), got {len(salt)}"
        print(f"✅ Existing estate has encryption_salt: {salt[:16]}...")


# ============= PER-ESTATE KEY ISOLATION TESTS =============


class TestPerEstateKeyIsolation:
    """Verify documents from different estates use different encryption keys"""

    def test_different_estates_different_keys(self, benefactor_token):
        """Documents from different estates should use different encryption keys"""
        # Create two estates
        estate1_resp = requests.post(
            f"{BASE_URL}/api/estates",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            json={"name": f"TEST_ISOLATION_ESTATE_1_{uuid.uuid4().hex[:8]}"},
        )
        estate1_id = estate1_resp.json()["id"]

        estate2_resp = requests.post(
            f"{BASE_URL}/api/estates",
            headers={"Authorization": f"Bearer {benefactor_token}"},
            json={"name": f"TEST_ISOLATION_ESTATE_2_{uuid.uuid4().hex[:8]}"},
        )
        estate2_id = estate2_resp.json()["id"]

        # Get their salts
        estate1 = requests.get(
            f"{BASE_URL}/api/estates/{estate1_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        ).json()
        estate2 = requests.get(
            f"{BASE_URL}/api/estates/{estate2_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        ).json()

        salt1 = estate1.get("encryption_salt", "")
        salt2 = estate2.get("encryption_salt", "")

        assert salt1 != salt2, "Different estates should have different encryption salts"
        print(f"✅ Estate 1 salt: {salt1[:16]}...")
        print(f"   Estate 2 salt: {salt2[:16]}...")
        print("   Salts are different: ✓")


# ============= CLEANUP =============


class TestCleanup:
    """Cleanup test data"""

    def test_cleanup_test_documents(self, benefactor_token, test_estate_id):
        """Clean up test documents"""
        resp = requests.get(
            f"{BASE_URL}/api/documents/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        if resp.status_code == 200:
            docs = resp.json()
            deleted = 0
            for doc in docs:
                if doc.get("name", "").startswith("TEST_"):
                    del_resp = requests.delete(
                        f"{BASE_URL}/api/documents/{doc['id']}",
                        headers={"Authorization": f"Bearer {benefactor_token}"},
                    )
                    if del_resp.status_code == 200:
                        deleted += 1
            print(f"✅ Cleaned up {deleted} test documents")

    def test_cleanup_test_messages(self, benefactor_token, test_estate_id):
        """Clean up test messages"""
        resp = requests.get(
            f"{BASE_URL}/api/messages/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        if resp.status_code == 200:
            messages = resp.json()
            deleted = 0
            for msg in messages:
                if msg.get("title", "").startswith("TEST_"):
                    del_resp = requests.delete(
                        f"{BASE_URL}/api/messages/{msg['id']}",
                        headers={"Authorization": f"Bearer {benefactor_token}"},
                    )
                    if del_resp.status_code == 200:
                        deleted += 1
            print(f"✅ Cleaned up {deleted} test messages")

    def test_cleanup_test_wallet_entries(self, benefactor_token, test_estate_id):
        """Clean up test wallet entries"""
        resp = requests.get(
            f"{BASE_URL}/api/digital-wallet/{test_estate_id}",
            headers={"Authorization": f"Bearer {benefactor_token}"},
        )
        if resp.status_code == 200:
            entries = resp.json()
            deleted = 0
            for entry in entries:
                if entry.get("account_name", "").startswith("TEST_"):
                    del_resp = requests.delete(
                        f"{BASE_URL}/api/digital-wallet/{entry['id']}",
                        headers={"Authorization": f"Bearer {benefactor_token}"},
                    )
                    if del_resp.status_code == 200:
                        deleted += 1
            print(f"✅ Cleaned up {deleted} test wallet entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
