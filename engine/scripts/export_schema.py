"""Generate /packages/shared/plan.schema.json from the pydantic Plan model.

The pydantic models are the single source of truth; this keeps the JSON Schema
(consumed by the web app for client-side validation) from drifting. TS types in
/packages/shared/src/plan.ts are hand-kept in sync — regenerate them with:

    npx json-schema-to-typescript packages/shared/plan.schema.json \
        -o packages/shared/src/plan.ts

Run:  python scripts/export_schema.py
"""

from __future__ import annotations

import json
from pathlib import Path

from app.models.plan import Plan

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT = REPO_ROOT / "packages" / "shared" / "plan.schema.json"


def main() -> None:
    schema = Plan.model_json_schema(by_alias=True)
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = "https://gharplan.app/schemas/plan-1.0.json"
    schema["title"] = "GharPlan Plan"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote JSON Schema to {OUT}")


if __name__ == "__main__":
    main()
