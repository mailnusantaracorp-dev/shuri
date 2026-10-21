import json
import os
import re
import sys
from urllib.parse import urlsplit


def frame_url(url):
    # Mirror game js/assets.js frameUrl(): .webp -> .frames.json
    return re.sub(r"\.webp(?:\?.*)?$", ".frames.json", url)


def main():
    links_file = sys.argv[1] if len(sys.argv) > 1 else "link.json"
    out_file = sys.argv[2] if len(sys.argv) > 2 else "link-json.json"
    here = os.path.dirname(os.path.abspath(links_file)) or "."
    manifest_file = os.path.join(here, "..", "game js", "assets.json")

    with open(links_file, "r") as f:
        links = json.load(f)
    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    out = {}
    base_url = None
    for key, entry in manifest.items():
        rel = entry.get("src", "")
        if key in links and rel and links[key].endswith(rel):
            base_url = links[key][:-len(rel)]
            break
    if base_url is None:
        sample = next((url for url in links.values() if url.strip()), "")
        base_url = re.sub(r"/generated-assets/.*$", "", sample)

    for key, entry in manifest.items():
        rel = entry.get("src", "")
        if not rel or key not in links:
            continue
        # The runtime does not fetch frame metadata for backgrounds/layers.
        if re.search(r"(SKY_BG|_LAYER|^LAYER_)", key):
            continue
        image_url = base_url.rstrip("/") + "/" + urlsplit(rel).path.lstrip("/")
        out[key] = frame_url(image_url)

    with open(out_file, "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")

    print(f"Wrote {len(out)} entries to {out_file}")


if __name__ == "__main__":
    main()
