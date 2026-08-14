"""Repository-root ASGI entrypoint.

This keeps ``uvicorn server:app`` working when launched from the repository
root. The canonical module remains ``backend.server``.
"""

from backend.server import app

__all__ = ["app"]
