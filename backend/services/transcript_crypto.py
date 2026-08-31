"""Field-level encryption for AI chat transcripts (EGA + BEC) at rest."""

from config import logger
from services.encryption import decrypt_aes256, encrypt_aes256, get_estate_salt

ENC_VERSION = 1


async def salt_for(estate_id):
    """Estate salt or None when the row can't be estate-scoped."""
    if not estate_id:
        return None
    try:
        return await get_estate_salt(estate_id)
    except Exception as e:
        logger.warning(f"transcript_crypto: no salt for estate {estate_id}: {e}")
        return None


def enc(text, salt):
    """Encrypt a transcript field. Returns (stored_value, enc_v_or_None)."""
    if salt is None or not text:
        return text, None
    return encrypt_aes256(text.encode("utf-8"), salt), ENC_VERSION


def dec(value, salt, enc_v):
    """Decrypt a transcript field; passthrough for legacy plaintext rows."""
    if not enc_v or not value:
        return value
    if salt is None:
        return "[encrypted]"
    try:
        return decrypt_aes256(value, salt).decode("utf-8")
    except Exception:
        logger.warning("transcript_crypto: decrypt failed; returning stored value")
        return value
