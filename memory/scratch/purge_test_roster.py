"""One-off: erase every provisioned test client of the Harbor test partner (preview only)."""
import asyncio, sys
sys.path.insert(0, '/app/backend')
from config import db
from services.erasure import erase_user

PARTNER = '4cdb22b9-b4c0-477d-9cc7-cf48c6a98fcb'
ACTOR = {"id": "system", "email": "founder@carryon.us", "role": "admin"}

async def main():
    ids = [u["id"] async for u in db.users.find({"partner_id": PARTNER, "account_status": "pending_claim"}, {"_id": 0, "id": 1})]
    print("erasing", len(ids))
    for i, uid in enumerate(ids, 1):
        try:
            await erase_user(uid, actor=ACTOR, reason="test_cleanup")
        except Exception as e:
            print("fail", uid, e)
        if i % 100 == 0:
            print("...", i)
    await db.b2b_partners.update_one({"id": PARTNER}, {"$set": {"times_used": 0, "max_uses": 6}})
    await db.roster_imports.delete_many({"partner_id": PARTNER})
    await db.roster_uploads.delete_many({"partner_id": PARTNER})
    print("left", await db.users.count_documents({"partner_id": PARTNER}))

asyncio.run(main())
