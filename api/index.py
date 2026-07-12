"""Vercel serverless entrypoint for the Vastukala AI engine.

The Next.js frontend and this Python engine deploy as ONE Vercel project. Vercel
routes ``/engine/*`` to this function (see the root ``vercel.json``) — a separate
mount from the app's own Next.js ``/api/*`` routes — and we strip the ``/engine``
prefix so the engine's own routes (``/plan``, ``/export``, ``/health`` …) match.
The engine package lives in ``../engine`` and its ``fixtures`` data at the repo
root — both are force-bundled into the Lambda via ``includeFiles``.
"""

import os
import sys

# Make the engine package importable from the bundled ../engine directory.
_ENGINE_DIR = os.path.join(os.path.dirname(__file__), "..", "engine")
if _ENGINE_DIR not in sys.path:
    sys.path.insert(0, _ENGINE_DIR)

from app.main import app as _engine_app  # noqa: E402  — FastAPI ASGI instance


# The frontend calls the engine at /engine/*; Vercel rewrites that to this function.
# Depending on how Vercel presents the rewritten request the ASGI ``path`` may arrive
# as "/engine/plan/...", "/api/index/plan/..." or "/api/plan/..." — strip whichever
# mount prefix is present (longest first) so the engine's own "/plan", "/export",
# "/health" routes match. An already-unprefixed path passes through untouched.
_MOUNT_PREFIXES = ("/engine", "/api/index", "/api")


class _StripMountPrefix:
    def __init__(self, application):
        self._app = application

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            path = scope.get("path", "")
            for pfx in _MOUNT_PREFIXES:
                if path == pfx:
                    path = "/"
                    break
                if path.startswith(pfx + "/"):
                    path = path[len(pfx) :]
                    break
            scope = {**scope, "path": path, "raw_path": path.encode()}
        await self._app(scope, receive, send)


# Vercel's Python runtime serves the ASGI app exported as ``app``.
app = _StripMountPrefix(_engine_app)
