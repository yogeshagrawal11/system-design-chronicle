#!/usr/bin/env python3
"""Generate sitemap.xml for The System Design Chronicle.

The site is a hash-routed single-page app. Each content item is reachable at a
URL fragment such as ``#/concept/<id>``. Search engines largely ignore URL
fragments for indexing, so this sitemap is primarily useful as a structured
inventory of the site and for tools/crawlers that do follow fragments. The
canonical crawlable page is the site root.

Usage:
    python3 tools/gen-sitemap.py [BASE_URL]

BASE_URL defaults to https://sd.agentic-solutions.net/ (trailing slash kept).
Run from the ``site/`` directory (or anywhere — paths are resolved relative to
this file).
"""
import datetime
import glob
import os
import re
import sys

SITE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BASE = "https://sd.agentic-solutions.net/"

# kind -> (glob of data files, route prefix used in the hash router)
CONTENT = {
    "concept": ("data/concepts/*.js", "#/concept/"),
    "design": ("data/designs/*.js", "#/design/"),
    "company": ("data/companies/*.js", "#/company/"),
    "paper": ("data/papers/*.js", "#/paper/"),
}

# Static (list / tool) routes defined in js/app.js router.
STATIC_ROUTES = [
    ("#/", "1.0"),
    ("#/path", "0.9"),
    ("#/concepts", "0.8"),
    ("#/designs", "0.8"),
    ("#/companies", "0.8"),
    ("#/papers", "0.7"),
    ("#/playground", "0.7"),
    ("#/framework", "0.7"),
    ("#/cert", "0.6"),
    ("#/progress", "0.4"),
]

ID_RE = re.compile(r"id:\s*'([^']+)'")
SIM_RE = re.compile(r"SD\.sim\('([^']+)'")


def first_id(path):
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = ID_RE.search(line)
            if m:
                return m.group(1)
    return None


def collect():
    urls = []  # (loc_fragment, priority)
    urls.extend(STATIC_ROUTES)

    for _kind, (pattern, prefix) in CONTENT.items():
        ids = set()
        for f in sorted(glob.glob(os.path.join(SITE_DIR, pattern))):
            cid = first_id(f)
            if cid:
                ids.add(cid)
        for cid in sorted(ids):
            urls.append((f"{prefix}{cid}", "0.6"))

    # Simulators: #/playground#<simId>
    sim_ids = set()
    for f in sorted(glob.glob(os.path.join(SITE_DIR, "sims/*.js"))):
        with open(f, encoding="utf-8") as fh:
            for m in SIM_RE.finditer(fh.read()):
                sim_ids.add(m.group(1))
    for sid in sorted(sim_ids):
        urls.append((f"#/playground#{sid}", "0.5"))

    return urls


def build(base_url):
    today = datetime.date.today().isoformat()
    urls = collect()
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for frag, prio in urls:
        loc = base_url + frag
        loc = loc.replace("&", "&amp;")
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <lastmod>{today}</lastmod>")
        lines.append(f"    <priority>{prio}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    lines.append("")
    return "\n".join(lines), len(urls)


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE
    if not base.endswith("/"):
        base += "/"
    xml, n = build(base)
    out = os.path.join(SITE_DIR, "sitemap.xml")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(xml)
    print(f"Wrote {out} with {n} URLs (base: {base})")


if __name__ == "__main__":
    main()
