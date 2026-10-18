#!/usr/bin/env python3
"""Regenerate the <script> tags for data + sims in index.html."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
files = sorted(p.relative_to(root).as_posix() for d in ("sims", "data") for p in (root / d).rglob("*.js"))
tags = "\n".join(f'  <script src="{f}"></script>' for f in files)
html = (root / "index.html").read_text()
html = re.sub(r"(<!-- DATA:START.*?-->)(.*?)(\s*<!-- DATA:END -->)", lambda m: f"{m.group(1)}\n{tags}{m.group(3)}", html, flags=re.S)
(root / "index.html").write_text(html)
print(f"index.html: {len(files)} data/sim scripts linked")
