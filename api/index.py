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


class _StripApiPrefix:
    """Tiny ASGI shim that removes the ``/engine`` mount prefix Vercel routes on, so
    the engine's un-prefixed routes match. Everything else passes through untouched."""

    def __init__(self, application, prefix: str = "/api"):
        self._app = application
        self._prefix = prefix

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            path = scope.get("path", "")
            if path == self._prefix:
                path = "/"
            elif path.startswith(self._prefix + "/"):
                path = path[len(self._prefix) :]
            scope = {**scope, "path": path}
            raw = scope.get("raw_path")
            if raw:
                pfx = self._prefix.encode()
                if raw.startswith(pfx):
                    scope["raw_path"] = raw[len(pfx) :] or b"/"
        await self._app(scope, receive, send)


# Vercel's @vercel/python runtime serves the ASGI app exported as ``app``.
app = _StripApiPrefix(_engine_app, "/engine")
