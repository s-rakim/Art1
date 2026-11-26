"""Tidies backend/openapi.json for the C# generator.

FastAPI writes operation ids like "list_products_api_v1_products_get" and
describes optional values as anyOf [T, null]. Both make for an awkward C#
client, so before NSwag runs this script:

  * names each operation after its summary and area: ListProducts, SellerStats,
    AdminRiderApplications ...
  * turns anyOf [T, null] into T marked nullable.

The contract itself is untouched; the result goes to obj/openapi.csharp.json.

    python3 scripts/prepare_contract.py && (cd src/Bazaar.Api && dotnet nswag run nswag.json)
"""

import json
import re
from pathlib import Path

HUB = Path(__file__).resolve().parents[1]
SRC = HUB.parents[1] / "backend" / "openapi.json"
OUT = HUB / "obj" / "openapi.csharp.json"


def pascal(text: str) -> str:
    return "".join(w[:1].upper() + w[1:] for w in re.split(r"[^A-Za-z0-9]+", text) if w)


def unnull(node):
    if isinstance(node, list):
        return [unnull(n) for n in node]
    if not isinstance(node, dict):
        return node
    node = {k: unnull(v) for k, v in node.items()}
    options = node.get("anyOf")
    if isinstance(options, list):
        real = [o for o in options if o != {"type": "null"}]
        if len(real) == 1 and len(real) < len(options):
            merged = {k: v for k, v in node.items() if k != "anyOf"}
            target = real[0]
            if "$ref" in target:
                merged["allOf"] = [target]
            else:
                merged.update(target)
            merged["nullable"] = True
            return merged
    return node


def main() -> None:
    spec = json.loads(SRC.read_text())
    seen: dict[str, str] = {}
    for path, ops in spec["paths"].items():
        area = path.removeprefix("/api/v1/").split("/")[0]
        for method, op in ops.items():
            name = pascal(op.get("summary") or op["operationId"])
            prefix = pascal(area) if area in {"seller", "rider", "admin"} else ""
            if prefix and not name.startswith(prefix):
                name = prefix + name
            if name in seen:
                name = name + pascal(method)
            seen[name] = path
            op["operationId"] = name
    spec = unnull(spec)
    # NSwag reads OpenAPI 3.0 "nullable"; say so.
    spec["openapi"] = "3.0.3"
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(spec, indent=1))
    print(f"wrote {OUT.relative_to(HUB)} ({len(seen)} operations)")


if __name__ == "__main__":
    main()
