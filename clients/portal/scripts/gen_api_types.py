"""Writes bazaar/api_types.py from the API contract.

    python scripts/gen_api_types.py            # regenerate
    python scripts/gen_api_types.py --check    # fail if it's out of date (CI)

Every schema in backend/openapi.json becomes a TypedDict, so editors and type
checkers know the shape of what the API sends back. The contract stays the
single source of truth: when the backend changes, rerun this.
"""

import json
import keyword
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONTRACT = HERE.parents[2] / "backend" / "openapi.json"
OUT = HERE.parent / "bazaar" / "api_types.py"


def py_name(name: str) -> str:
    return re.sub(r"\W", "_", name)


def annotation(schema: dict) -> str:
    if "$ref" in schema:
        return f'"{py_name(schema["$ref"].rsplit("/", 1)[-1])}"'
    if "anyOf" in schema:
        parts = []
        for s in schema["anyOf"]:
            a = annotation(s)
            if a not in parts:
                parts.append(a)
        return " | ".join(parts)
    if "enum" in schema:
        return "Literal[" + ", ".join(json.dumps(v) for v in schema["enum"]) + "]"
    if "const" in schema:
        return f"Literal[{json.dumps(schema['const'])}]"
    kind = schema.get("type")
    if kind == "array":
        return f"list[{annotation(schema.get('items', {}))}]"
    if kind == "object":
        extra = schema.get("additionalProperties")
        if isinstance(extra, dict) and extra:
            return f"dict[str, {annotation(extra)}]"
        return "dict[str, Any]"
    return {"string": "str", "integer": "int", "number": "float", "boolean": "bool", "null": "None"}.get(kind, "Any")


def render(contract: dict) -> str:
    out = [
        f'"""Types for the Bazaar API {contract["info"]["version"]}, generated from backend/openapi.json.',
        "",
        "Do not edit by hand: run python scripts/gen_api_types.py.",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        "from typing import Any, Literal, NotRequired, TypedDict",
        "",
    ]
    for name, schema in sorted(contract["components"]["schemas"].items()):
        cls = py_name(name)
        props = schema.get("properties")
        if schema.get("type") != "object" or props is None:
            out += ["", f"{cls} = {annotation(schema)}", ""]
            continue
        required = set(schema.get("required", []))
        out += ["", f"class {cls}(TypedDict):"]
        if schema.get("description"):
            out.append(f'    """{schema["description"].splitlines()[0].replace(chr(34) * 3, "")}"""')
        if not props:
            out.append("    pass")
        for prop, sub in props.items():
            if not prop.isidentifier() or keyword.iskeyword(prop):
                continue
            a = annotation(sub)
            out.append(f"    {prop}: {a if prop in required else f'NotRequired[{a}]'}")
        out.append("")
    paths = sorted(f"{m.upper()} {p}" for p, ops in contract["paths"].items() for m in ops)
    out += ["", "# Every operation in the contract, for reference and for tests.", "OPERATIONS = ("]
    out += [f"    {json.dumps(p)}," for p in paths]
    out += [")", ""]
    return "\n".join(out)


def main() -> None:
    text = render(json.loads(CONTRACT.read_text()))
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != text:
            raise SystemExit("bazaar/api_types.py is out of date: run python scripts/gen_api_types.py")
        print("api_types.py matches the contract")
        return
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
