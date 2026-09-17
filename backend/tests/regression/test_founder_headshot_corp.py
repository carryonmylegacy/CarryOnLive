"""Regression — founder headshot must be embeddable cross-origin.

Prod serves the marketing site from carryon.us and the API from another host.
SecurityHeadersMiddleware defaults Cross-Origin-Resource-Policy to same-origin,
which makes browsers silently drop a cross-origin <img>. The public headshot
route must opt out with "cross-origin", and the middleware must not clobber it.
(Founder report Sep 17 2026: green "uploaded" toast, but About page kept "BH".)
"""

import asyncio
from types import SimpleNamespace

from fastapi import Request, Response


def _request(path="/api/public/founder-headshot"):
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "scheme": "https",
        "server": ("api.test", 443),
        "client": ("1.2.3.4", 1234),
    }
    return Request(scope)


def test_middleware_defaults_corp_same_origin_but_preserves_handler_value():
    from middleware import SecurityHeadersMiddleware

    mw = SecurityHeadersMiddleware(app=None)

    async def plain(_req):
        return Response(b"{}", media_type="application/json")

    async def opted_out(_req):
        return Response(b"jpg", media_type="image/jpeg", headers={"Cross-Origin-Resource-Policy": "cross-origin"})

    r1 = asyncio.run(mw.dispatch(_request("/api/public/site-content"), plain))
    r2 = asyncio.run(mw.dispatch(_request(), opted_out))
    assert r1.headers["cross-origin-resource-policy"] == "same-origin"
    assert r2.headers["cross-origin-resource-policy"] == "cross-origin"


def test_founder_headshot_route_sets_corp_cross_origin(monkeypatch):
    import routes.public_content as pc

    class _Assets:
        async def find_one(self, *_a, **_k):
            return {
                "_id": "founder_headshot",
                "data": b"\xff\xd8\xff",
                "content_type": "image/jpeg",
                "updated_at": "2026-09-17T13:11:48+00:00",
            }

    monkeypatch.setattr(pc, "db", SimpleNamespace(site_assets=_Assets()))
    resp = asyncio.run(pc.get_founder_headshot())
    assert resp.status_code == 200
    assert resp.media_type == "image/jpeg"
    assert resp.headers["cross-origin-resource-policy"] == "cross-origin"
    assert "max-age=300" in resp.headers["cache-control"]
