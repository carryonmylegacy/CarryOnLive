"""Purge a QA account created during testing: python purge_qa_user.py <user_id>"""
import asyncio
import os
import sys

sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')


async def main(uid: str):
    from services.erasure import erase_user
    from config import db
    u = await db.users.find_one({'id': uid}, {'_id': 0, 'email': 1, 'username': 1})
    print('found:', u)
    if u:
        r = await erase_user(uid, actor={'id': 'agent-purge', 'email': 'agent@preview', 'role': 'admin'}, reason='qa_purge')
        print('receipt:', {k: v for k, v in r.items() if k != 'collections'})
    print('after:', await db.users.find_one({'id': uid}))


asyncio.run(main(sys.argv[1]))
