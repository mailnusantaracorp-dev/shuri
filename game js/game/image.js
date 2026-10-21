// Lazy image cache. Every picture comes from the registered asset handle, and
// big sprite sheets are copied once into a downscaled canvas so twenty skins'
// worth of sheets never sit decoded at full size in memory.
const cache = new Map(); // key -> { status, canvas, w, h, scale }
let handle = null;

export function initImages(assets) {
  handle = assets;
}

function scaleFor(key) {
  if (key.startsWith("BG_")) return 1;
  if (key.startsWith("BOSS_")) return 0.8;
  if (key.startsWith("FX_SKILLS") || key === "SHADOW_PROPS" || key === "SKIN_ICONS") return 0.6;
  return 0.5;
}

export function requestImage(key) {
  let entry = cache.get(key);
  if (entry) return entry;
  entry = { status: "loading", canvas: null, w: 0, h: 0, scale: 1 };
  cache.set(key, entry);
  const url = handle ? handle.get(key) : null;
  if (!url) {
    entry.status = "error";
    return entry;
  }
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    const s = scaleFor(key);
    const w = Math.max(1, Math.round(img.naturalWidth * s));
    const h = Math.max(1, Math.round(img.naturalHeight * s));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true;
    cx.imageSmoothingQuality = "high";
    cx.drawImage(img, 0, 0, w, h);
    if (/^(SKIN|KURO)([1-9]|10)_/.test(key)) despill(cx, w, h);
    entry.canvas = c;
    entry.w = w;
    entry.h = h;
    entry.scale = s;
    entry.status = "ready";
  };
  img.onerror = () => {
    entry.status = "error";
  };
  img.src = url;
  return entry;
}

// The new skins were drawn from Shuri's sheets, whose energy is green; any
// green fleck left on them is neutralised so every skin keeps its own colours.
function despill(cx, w, h) {
  let data;
  try {
    data = cx.getImageData(0, 0, w, h);
  } catch {
    return;
  }
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (g > r * 1.25 + 20 && g > b * 1.15 + 14) px[i + 1] = Math.round((r + b) / 2 + Math.min(r, b) * 0.2);
  }
  cx.putImageData(data, 0, 0);
}

export function requestAll(keys) {
  for (const k of keys) requestImage(k);
}

// Settled = loaded or failed; a failed picture never blocks play.
export function settled(keys) {
  return keys.every((k) => {
    const e = cache.get(k);
    return e && e.status !== "loading";
  });
}

export function failedAny(keys) {
  return keys.some((k) => cache.get(k)?.status === "error");
}

export function getImage(key) {
  const e = cache.get(key);
  return e && e.status === "ready" ? e : null;
}

// Drop sheets we no longer need (another skin's sheets) to keep memory flat.
export function releaseWhere(test) {
  for (const k of [...cache.keys()]) {
    const e = cache.get(k);
    if (test(k) && e.status !== "loading") cache.delete(k);
  }
}

// Grid sheets: `cols` frames per row; rows follow from the image's aspect.
export function gridCell(entry, cols, row, col) {
  const cw = entry.w / cols;
  const rows = Math.max(1, Math.round(entry.h / cw));
  const ch = entry.h / rows;
  const r = Math.min(rows - 1, Math.max(0, row));
  const c = Math.min(cols - 1, Math.max(0, col));
  return { sx: c * cw, sy: r * ch, sw: cw, sh: ch };
}
