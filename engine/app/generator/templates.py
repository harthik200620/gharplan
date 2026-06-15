"""Template registry — loads parametric Plan templates from /fixtures/templates."""

from __future__ import annotations

import json
from functools import lru_cache

from app import config


@lru_cache(maxsize=1)
def load_templates() -> dict[str, dict]:
    registry: dict[str, dict] = {}
    if config.TEMPLATES_DIR.exists():
        for path in sorted(config.TEMPLATES_DIR.glob("*.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            registry[data["id"]] = data
    return registry


def get_template(template_id: str) -> dict | None:
    return load_templates().get(template_id)


def template_for_facing(facing: str) -> dict | None:
    """v1 stub: only the 30x40 East template exists, matched by facing."""
    for t in load_templates().values():
        if t.get("facing") == facing:
            return t
    return None
