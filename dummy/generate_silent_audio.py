"""Create valid, silent MP3 placeholders for URSA's replaceable audio set.

Install the one-off encoder first with: py -m pip install lameenc
"""

from pathlib import Path

import lameenc


OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "audio"
SFX = [
    "jump",
    "land",
    "shift",
    "claw",
    "tackle",
    "break",
    "pickup",
    "eat",
    "hurt",
    "checkpoint",
    "claw_collect",
    "win",
    "sniff",
    "pound",
    "enemy_hit",
    "steam",
    "ice_crack",
    "avalanche",
    "menu_open",
    "menu_confirm",
    "restart",
    "powerup",
    "wind_gust",
]
AMBIENCE = [
    "forest_ambience",
    "wind_ambience",
    "water_ambience",
    "steam_ambience",
    "winter_ambience",
]
BGM = [
    "bgm",
    "bgm_menu",
    "bgm_summer",
    "bgm_autumn",
    "bgm_winter",
    "bgm_year2",
    "bgm_ending",
]


def silent_mp3(seconds: float) -> bytes:
    sample_rate = 44100
    sample_count = round(sample_rate * seconds)
    pcm_silence = bytes(sample_count * 2 * 2)  # signed 16-bit stereo silence
    encoder = lameenc.Encoder()
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(2)
    encoder.set_bit_rate(128)
    encoder.set_quality(5)
    return encoder.encode(pcm_silence) + encoder.flush()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name in SFX:
        (OUTPUT / f"{name}.mp3").write_bytes(silent_mp3(0.4))
    for name in AMBIENCE:
        (OUTPUT / f"{name}.mp3").write_bytes(silent_mp3(2.0))
    for name in BGM:
        (OUTPUT / f"{name}.mp3").write_bytes(silent_mp3(4.0))
    print(f"Created {len(SFX) + len(AMBIENCE) + len(BGM)} silent MP3 placeholders in {OUTPUT}")


if __name__ == "__main__":
    main()
