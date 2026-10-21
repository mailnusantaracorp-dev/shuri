import json
import os
import re
import sys
from urllib.parse import urlsplit


def frame_url(url):
    # Mirror game js/assets.js frameUrl(): .webp -> .frames.json
    return re.sub(r"\.webp(?:\?.*)?$", ".frames.json", url)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    game_assets = os.path.join(here, "..", "game js", "assets.json")
    game_data = os.path.join(here, "..", "game js", "game", "data.js")
    links_file = os.path.join(here, "link.json")
    out_file = os.path.join(here, "link-json.json")

    with open(game_assets, "r") as f:
        assets = json.load(f)
    with open(game_data, "r", encoding="utf-8") as f:
        source = f.read()
    with open(links_file, "r") as f:
        links = json.load(f)

    match = re.search(r"export const SHEET_KEYS = \[(.*?)\];", source, re.S)
    if not match:
        raise ValueError("SHEET_KEYS not found in game/data.js")
    sheet_keys = re.findall(r'"([^"]+)"', match.group(1))

    # Derive base URL from link.json using the matching asset path in assets.json
    base_url = None
    for key, rel in assets.items():
        if key in links and links[key].endswith(rel):
            base_url = links[key][: len(links[key]) - len(rel)]
            break
    if base_url is None:
        sample = next(iter(links.values()))
        base_url = re.sub(r"/generated-assets/.*$", "", sample)

    out = {}
    for key in sheet_keys:
        rel = assets.get(key)
        if not rel or key not in links:
            raise ValueError(f"Missing asset path or URL for spritesheet {key}")
        asset_path = urlsplit(rel).path
        full = base_url.rstrip("/") + "/" + asset_path.lstrip("/")
        out[key] = frame_url(full)

    with open(out_file, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    print(f"Wrote {len(out)} entries to {out_file}")


if __name__ == "__main__":
    main()
