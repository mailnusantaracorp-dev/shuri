"""Create valid, silent MP3 placeholders for the Flutter audio asset set."""
from pathlib import Path


OUT = Path(__file__).parent.parent / "assets" / "audio"
NAMES = [
    "bgm", "tap", "select", "tool", "scrub", "spray", "water", "foam",
    "polish", "clean", "wrong", "complete", "level_start", "pause",
    "resume", "purchase", "win", "jump", "hit", "click", "error",
    "splash", "bubble", "wipe", "coin", "star", "level_complete",
    "menu_bgm", "sponge", "squeegee", "cloth", "brush", "scraper",
    "electric_scrubber", "steam", "glass_cleaner",
]


def silent_mp3(seconds=1):
    # MPEG-1 Layer III, 128 kbps / 44.1 kHz, repeated zero-content frames.
    frame_size = 417
    frame = bytes.fromhex("FF FB 90 64") + bytes(frame_size - 4)
    return frame * max(1, round(seconds * 44100 / 1152))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        (OUT / f"{name}.mp3").write_bytes(silent_mp3(8 if name == "bgm" else 1))
    print(f"Generated {len(NAMES)} silent MP3 placeholders in {OUT}")


if __name__ == "__main__":
    main()
