// Progress kept between sessions: unlocked areas, where Shuri stopped (area,
// checkpoint, lit targets, boss beaten), chosen skin and best times.
import { AREAS } from "./areas.js";
import { SKINS } from "./skins.js";

export function normalizeSave(raw) {
  const d = raw && typeof raw === "object" && raw.version === 1 ? raw : {};
  const int = (v, lo, hi, def) => (Number.isInteger(v) && v >= lo && v <= hi ? v : def);
  const unlocked = int(d.unlocked, 1, AREAS.length, 1);
  const area = Math.min(unlocked - 1, int(d.area, 0, AREAS.length - 1, 0));
  return {
    version: 1,
    unlocked,
    area,
    checkpoint: int(d.checkpoint, -1, 99, -1),
    lit: Array.isArray(d.lit) ? d.lit.filter((n) => Number.isInteger(n)).slice(0, 80) : [],
    bossDone: !!d.bossDone,
    skin: int(d.skin, 0, SKINS.length - 1, 0),
    best: Array.isArray(d.best) ? AREAS.map((_, i) => (Number.isFinite(d.best[i]) && d.best[i] > 0 ? d.best[i] : 0)) : AREAS.map(() => 0),
    allCleared: !!d.allCleared,
    replay: !!d.replay,
  };
}

export function persist(sdk, data) {
  if (!sdk || !sdk.gameState) return;
  sdk.gameState.save(data).catch(() => {});
}
