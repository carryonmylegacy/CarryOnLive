"""0001_baseline — Records that the schema migration system is now active.

This is a no-op migration. Its purpose is purely to set the marker so the
schema_migrations collection has one row and admins/operators can see the
runner is working. All schema changes prior to Feb 12, 2026 were applied
imperatively via ad-hoc scripts (see db_indexes.py + git history).
"""

from __future__ import annotations


async def up(db) -> None:
    # No-op baseline. Just ensure the indexes module has fully run.
    pass
