"""CarryOn™ — Cloud Storage Abstraction

Provides a unified interface for document blob storage:
- LocalStorage: for dev/preview (filesystem-backed)
- S3Storage: for production (AWS S3 / GovCloud)

Documents are already AES-256-GCM encrypted at the application layer
BEFORE being passed to storage. S3 adds SSE-S3 as a second layer.
"""

import os
from abc import ABC, abstractmethod
from pathlib import Path

from config import logger


class StorageBackend(ABC):
    """Abstract storage interface for encrypted document blobs."""

    @abstractmethod
    async def upload(
        self,
        blob: bytes,
        estate_id: str,
        doc_id: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload an encrypted blob. Returns the storage key."""

    @abstractmethod
    async def download(self, storage_key: str) -> bytes:
        """Download an encrypted blob by storage key."""

    @abstractmethod
    async def delete(self, storage_key: str) -> bool:
        """Delete a blob. Returns True if deleted."""

    @abstractmethod
    async def exists(self, storage_key: str) -> bool:
        """Check if a blob exists."""

    async def upload_raw(
        self,
        blob: bytes,
        key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload a blob at an arbitrary key. Returns the key."""
        raise NotImplementedError

    async def download_raw(self, key: str) -> bytes:
        """Download a blob by arbitrary key."""
        return await self.download(key)

    async def purge_prefix(self, prefix: str) -> int:
        """Delete every blob whose key starts with `prefix`. Returns the count
        deleted. Used for estate/user deletion finality. Default no-op."""
        return 0

    def presign_get_url(
        self,
        storage_key: str,
        *,
        expires_in: int = 300,
        download_filename: str | None = None,
    ) -> str | None:
        """Return a short-lived presigned GET URL, or None if backend can't presign.

        Production (S3) returns a real URL. LocalStorage (dev/preview)
        returns None — callers should fall back to streaming the bytes
        through the backend instead of redirecting.
        """
        return None


class LocalStorage(StorageBackend):
    """Filesystem-backed storage for dev/preview environments."""

    def __init__(self, base_path: str = "/app/backend/vault_storage"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _key_to_path(self, storage_key: str) -> Path:
        # Storage keys are like: estates/{estate_id}/{doc_id}
        return self.base_path / storage_key

    async def upload(
        self,
        blob: bytes,
        estate_id: str,
        doc_id: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        storage_key = f"estates/{estate_id}/{doc_id}"
        file_path = self._key_to_path(storage_key)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(blob)
        logger.info(f"LocalStorage: uploaded {len(blob)} bytes to {storage_key}")
        return storage_key

    async def download(self, storage_key: str) -> bytes:
        file_path = self._key_to_path(storage_key)
        if not file_path.exists():
            raise FileNotFoundError(f"Blob not found: {storage_key}")
        return file_path.read_bytes()

    async def delete(self, storage_key: str) -> bool:
        file_path = self._key_to_path(storage_key)
        if file_path.exists():
            file_path.unlink()
            # Clean up empty parent dirs
            try:
                file_path.parent.rmdir()
            except OSError:
                pass
            return True
        return False

    async def exists(self, storage_key: str) -> bool:
        return self._key_to_path(storage_key).exists()

    async def upload_raw(
        self,
        blob: bytes,
        key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        file_path = self._key_to_path(key)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(blob)
        logger.info(f"LocalStorage: uploaded {len(blob)} bytes to {key}")
        return key

    async def purge_prefix(self, prefix: str) -> int:
        import shutil

        target = self._key_to_path(prefix)
        if not target.exists():
            return 0
        count = sum(1 for p in target.rglob("*") if p.is_file())
        shutil.rmtree(target, ignore_errors=True)
        logger.info(f"LocalStorage: purged prefix {prefix} ({count} files)")
        return count


class S3Storage(StorageBackend):
    """AWS S3 storage for production. Adds SSE-S3 as a second encryption layer."""

    def __init__(self):
        import boto3

        self.bucket = os.environ.get("S3_BUCKET_NAME", "carryon-vault")
        self.region = os.environ.get("S3_REGION", "us-east-1")
        self.client = boto3.client(
            "s3",
            region_name=self.region,
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )
        logger.info(f"S3Storage: initialized bucket={self.bucket} region={self.region}")

    async def upload(
        self,
        blob: bytes,
        estate_id: str,
        doc_id: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        import asyncio

        storage_key = f"estates/{estate_id}/{doc_id}"
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=storage_key,
            Body=blob,
            ContentType=content_type,
            ServerSideEncryption="AES256",  # SSE-S3 second layer
        )
        logger.info(f"S3Storage: uploaded {len(blob)} bytes to s3://{self.bucket}/{storage_key}")
        return storage_key

    async def download(self, storage_key: str) -> bytes:
        import asyncio

        response = await asyncio.to_thread(
            self.client.get_object,
            Bucket=self.bucket,
            Key=storage_key,
        )
        return response["Body"].read()

    async def delete(self, storage_key: str) -> bool:
        import asyncio

        try:
            await asyncio.to_thread(
                self.client.delete_object,
                Bucket=self.bucket,
                Key=storage_key,
            )
            return True
        except Exception:
            return False

    async def exists(self, storage_key: str) -> bool:
        import asyncio

        try:
            await asyncio.to_thread(
                self.client.head_object,
                Bucket=self.bucket,
                Key=storage_key,
            )
            return True
        except Exception:
            return False

    async def upload_raw(
        self,
        blob: bytes,
        key: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        import asyncio

        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=blob,
            ContentType=content_type,
            ServerSideEncryption="AES256",  # SSE-S3 — encrypt raw uploads at rest (audit #5391e8b #5)
        )
        logger.info(f"S3Storage: uploaded {len(blob)} bytes to s3://{self.bucket}/{key}")
        return key

    async def purge_prefix(self, prefix: str) -> int:
        import asyncio

        def _purge() -> int:
            paginator = self.client.get_paginator("list_objects_v2")
            total = 0
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
                for i in range(0, len(objs), 1000):
                    batch = objs[i : i + 1000]
                    self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": batch})
                    total += len(batch)
            return total

        total = await asyncio.to_thread(_purge)
        logger.info(f"S3Storage: purged prefix s3://{self.bucket}/{prefix} ({total} objects)")
        return total

    def presign_get_url(
        self,
        storage_key: str,
        *,
        expires_in: int = 300,
        download_filename: str | None = None,
    ) -> str:
        """Return a short-lived presigned GET URL for `storage_key`.

        Default 5-minute expiry. Pass `download_filename` to force the
        browser to save with a friendly name via Content-Disposition.

        Use case: the share-link recipient endpoint redirects (302) to
        this URL so the actual PDF bytes stream from S3 directly,
        skipping our backend entirely. Default `application/pdf` content
        type is preserved by S3 from the original PUT.
        """
        params = {"Bucket": self.bucket, "Key": storage_key}
        if download_filename:
            # Force a friendly download filename without trusting the
            # recipient to pick one. Escape quotes defensively.
            safe = download_filename.replace('"', "")[:200]
            params["ResponseContentDisposition"] = f'attachment; filename="{safe}"'
        return self.client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=int(expires_in),
        )


def get_storage_backend() -> StorageBackend:
    """Factory: returns S3Storage if configured, else LocalStorage."""
    if os.environ.get("S3_BUCKET_NAME") and os.environ.get("AWS_ACCESS_KEY_ID"):
        return S3Storage()
    return LocalStorage()


# Module-level singleton
storage = get_storage_backend()
