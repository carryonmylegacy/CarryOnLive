"""CarryOn™ — AES-256-GCM Encryption Service

Provides true AES-256 encryption with:
- Per-estate derived keys (master key + estate-specific salt)
- Unique nonces per encryption operation
- Authenticated encryption (GCM mode prevents tampering)
- Backward compatibility with legacy Fernet (AES-128) data
"""

import base64
import os
import struct

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from config import ENCRYPTION_KEY, ENCRYPTION_SALT, logger

# Version byte prefixed to all new ciphertexts for format detection
_V2_HEADER = b"\x02"  # Version 2 = AES-256-GCM
_NONCE_SIZE = 12  # 96-bit nonce recommended for GCM
_KEY_LENGTH = 32  # 256 bits


def _derive_key_v1() -> bytes:
    """Legacy Fernet key derivation (AES-128). Used only for backward compat decryption."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=ENCRYPTION_SALT,
        iterations=480000,
    )
    return base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))


def derive_estate_key(estate_salt: bytes) -> bytes:
    """Derive a unique AES-256 key for an estate.

    Uses PBKDF2-SHA256 with the master key and estate-specific salt.
    Each estate gets a unique 256-bit key.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=_KEY_LENGTH,
        salt=estate_salt,
        iterations=600_000,
    )
    return kdf.derive(ENCRYPTION_KEY.encode())


def generate_estate_salt() -> bytes:
    """Generate a cryptographically random salt for a new estate."""
    return os.urandom(32)


def encrypt_aes256(plaintext: bytes, estate_salt: bytes) -> str:
    """Encrypt data with AES-256-GCM using an estate-derived key.

    Output format (base64 encoded):
        [1 byte version] [12 byte nonce] [ciphertext + 16 byte GCM tag]

    Returns:
        Base64-encoded ciphertext string.
    """
    key = derive_estate_key(estate_salt)
    nonce = os.urandom(_NONCE_SIZE)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    # Pack: version + nonce + ciphertext (includes GCM tag)
    payload = _V2_HEADER + nonce + ciphertext
    return base64.b64encode(payload).decode("ascii")


def decrypt_aes256(encrypted_b64: str, estate_salt: bytes) -> bytes:
    """Decrypt AES-256-GCM data using an estate-derived key.

    Also handles legacy Fernet data transparently.
    """
    raw = base64.b64decode(encrypted_b64)

    # Check version header
    if raw[:1] == _V2_HEADER:
        # V2: AES-256-GCM
        nonce = raw[1 : 1 + _NONCE_SIZE]
        ciphertext = raw[1 + _NONCE_SIZE :]
        key = derive_estate_key(estate_salt)
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ciphertext, None)
    else:
        # Legacy V1: Fernet (AES-128-CBC)
        return _decrypt_fernet_legacy(encrypted_b64)


def _decrypt_fernet_legacy(encrypted_b64: str) -> bytes:
    """Decrypt legacy Fernet-encrypted data (backward compat)."""
    key = _derive_key_v1()
    f = Fernet(key)
    return f.decrypt(base64.b64decode(encrypted_b64.encode()))


def is_v2_encrypted(encrypted_b64: str) -> bool:
    """Check if data uses the new AES-256-GCM format."""
    try:
        raw = base64.b64decode(encrypted_b64)
        return raw[:1] == _V2_HEADER
    except Exception:
        return False


def reencrypt_to_v2(encrypted_b64: str, estate_salt: bytes) -> str:
    """Re-encrypt legacy Fernet data to AES-256-GCM.

    Returns the new ciphertext, or the original if already V2.
    """
    if is_v2_encrypted(encrypted_b64):
        return encrypted_b64
    plaintext = _decrypt_fernet_legacy(encrypted_b64)
    return encrypt_aes256(plaintext, estate_salt)


# --- Simple field encryption for short strings (messages, wallet entries) ---


def encrypt_field(value: str, estate_salt: bytes) -> str:
    """Encrypt a short string field (message content, wallet password, etc.)."""
    return encrypt_aes256(value.encode("utf-8"), estate_salt)


def decrypt_field(encrypted_b64: str, estate_salt: bytes) -> str:
    """Decrypt a short string field."""
    return decrypt_aes256(encrypted_b64, estate_salt).decode("utf-8")


async def get_estate_salt(estate_id: str) -> bytes:
    """Get the encryption salt for an estate. Lazily generates one for legacy estates."""
    from config import db

    estate = await db.estates.find_one(
        {"id": estate_id}, {"_id": 0, "id": 1, "encryption_salt": 1}
    )
    if not estate:
        raise ValueError(f"Estate not found: {estate_id}")

    salt_hex = estate.get("encryption_salt")
    if salt_hex:
        return bytes.fromhex(salt_hex)

    # Legacy estate: generate and persist a salt
    new_salt = generate_estate_salt()
    await db.estates.update_one(
        {"id": estate_id},
        {"$set": {"encryption_salt": new_salt.hex()}},
    )
    logger.info(f"Generated encryption salt for legacy estate {estate_id}")
    return new_salt
