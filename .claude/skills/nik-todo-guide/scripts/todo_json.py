#!/usr/bin/env python3
"""Generate the machine-readable twin of Nik's To-do page (for TITAN OS) from its checklist table.

Usage: python3 todo_json.py docs/nik/todo/TODO.md docs/nik/todo/TODO.json
Keeps any extra fields (links, subtasks) already present in the existing JSON for the same id.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROW = re.compile(r"^\| (\d+) \| \[([^\]]+)\]\(#([^)]+)\) \|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|", re.M)


def main(md_path, json_path):
    md = Path(md_path).read_text(encoding="utf-8")
    old = {}
    if Path(json_path).exists():
        old = {i["id"]: i for i in json.loads(Path(json_path).read_text()).get("items", [])}
    items = []
    for n, title, anchor, why, time, cost, blocks, status, verify in ROW.findall(md):
        iid = f"todo-{int(n):02d}"
        item = {"id": iid, "title": title.strip(), "anchor": anchor, "why": why.strip(), "time": time.strip(),
                "cost": cost.strip(), "blocks_launch": blocks.strip(), "status": status.strip(), "verify": verify.strip(),
                "links": []}
        for k, v in old.get(iid, {}).items():
            if k not in item or (k == "links" and v):
                item[k] = v
        items.append(item)
    out = {"source": str(md_path), "updated": date.today().isoformat(), "items": items}
    Path(json_path).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(items)} items -> {json_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
