import json
import os
import re

here = os.path.dirname(os.path.abspath(__file__))
game_js = os.path.join(here, "..", "game js")
links_file = os.path.join(here, "link.json")
out_file = os.path.join(here, "link-json.json")

base_url = None
# Base URL lives in the full URLs of link-json.json (https://.../generated-assets/...).
if os.path.exists(out_file):
    try:
        with open(out_file, "r") as f:
            existing = json.load(f)
        samples = existing.values() if isinstance(existing, dict) else existing
        for s in samples:
            if isinstance(s, str) and s.startswith("http"):
                base_url = re.sub(r"/generated-assets/.*$", "", s).rstrip("/")
                break
    except (json.JSONDecodeError, ValueError):
        pass

# Fallback: derive from link.json if it already holds full URLs.
if not base_url and os.path.exists(links_file):
    with open(links_file, "r") as f:
        links = json.load(f)
    sample = links[0] if isinstance(links, list) else next(iter(links.values()))
    if isinstance(sample, str) and sample.startswith("http"):
        base_url = re.sub(r"/generated-assets/.*$", "", sample).rstrip("/")

# Fallback: build the ide base URL from the project id found in assets.json refs.
if not base_url:
    assets_path = os.path.join(game_js, "assets.json")
    with open(assets_path, "r") as f:
        assets = json.load(f)
    m = None
    for entry in assets.values():
        ref = entry.get("recipe", {}).get("refs", [None])[0]
        if ref:
            m = re.search(r"playabl\.ai/ai-reference-images/([^/]+)/", ref)
            if m:
                break
    if m:
        base_url = f"https://{m.group(1)}.ide.playabl.ai"

if not base_url:
    raise SystemExit("Could not derive base URL")

out = {}
for root, _, files in os.walk(game_js):
    for fn in files:
        if not fn.endswith(".json"):
            continue
        full = os.path.join(root, fn)
        rel = os.path.relpath(full, game_js).replace(os.sep, "/")
        out[rel] = base_url + "/" + rel

with open(out_file, "w") as f:
    json.dump(out, f, indent=2)
    f.write("\n")

print(f"Wrote {len(out)} entries to {out_file}")
for k, v in out.items():
    print(f"  {k} -> {v}")
