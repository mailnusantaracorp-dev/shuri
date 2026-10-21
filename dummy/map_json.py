import json
import os
import re

here = os.path.dirname(os.path.abspath(__file__))
assets_file = os.path.join(here, "..", "game js", "assets.json")
links_file = os.path.join(here, "link.json")
out_file = os.path.join(here, "link-json.json")

with open(assets_file, "r") as f:
    assets = json.load(f)
with open(links_file, "r") as f:
    links = json.load(f)

# Derive base URL from link.json using a key present in both files
base_url = None
for key, rel in assets.items():
    if key in links and links[key].endswith(rel):
        base_url = links[key][: len(links[key]) - len(rel)]
        break
if base_url is None:
    sample = next(iter(links.values()))
    base_url = re.sub(r"/generated-assets/.*$", "", sample)

out = {}
for key, rel in assets.items():
    if not key.endswith("_FRAMES"):
        continue
    if not rel.endswith(".frames.json"):
        continue
    out[key] = base_url.rstrip("/") + "/" + rel.lstrip("/")

with open(out_file, "w") as f:
    json.dump(out, f, indent=2)
    f.write("\n")

print(f"Wrote {len(out)} entries to {out_file}")
