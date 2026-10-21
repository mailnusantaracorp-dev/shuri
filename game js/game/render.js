// Canvas renderer. Terrain is drawn in code as black silhouettes with a glowing
// rim in the area's accent; every character, monster, boss, prop and effect is
// a generated sheet. The camera is the one transform everything shares.
import { COLS, ROWS, ANIM } from "./config.js";
import { AREAS } from "./areas.js";
import { ENEMIES, BOSSES } from "./bestiary.js";
import { sheetKey, kuroKey, SKINS } from "./skins.js";
import { getImage, gridCell } from "./images.js";
import { tileType, fleshPhase, toxicLevel, key, SOLID } from "./world.js";

const PLAYER_DRAW = 2.55;
const FX_NAMES = {
  FX_SKILLS_A: ["ash_flame", "feather_storm", "oni_shock", "mist_veil"],
  FX_SKILLS_B: ["giant_web", "soul_scythe", "lightning_strike", "foxfire"],
  FX_SKILLS_C: ["blood_frenzy", "eclipse"],
};
const SHADOW_PROPS = ["old_well", "hanging_cocoon", "lantern_unlit", "lantern_lit", "wax_candle", "flesh_pod", "string_spool", "wall_eye_open", "wall_eye_closed", "eclipse_bell", "shadow_gate", "shadow_shrine"];

let canvas = null;
let ctx = null;
let dark = null;
let dctx = null;
let vw = 0;
let vh = 0;
let dpr = 1;
let T = 32;
let camL = 0;
let camT = 0;
let zoom = 1;

export function mountRenderer(c) {
  canvas = c;
  ctx = c.getContext("2d");
  dark = document.createElement("canvas");
  dctx = dark.getContext("2d");
  const ro = new ResizeObserver(() => resize());
  ro.observe(c);
  resize();
  return () => ro.disconnect();
}

export function resize() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dark.width = canvas.width;
  dark.height = canvas.height;
  vw = rect.width;
  vh = rect.height;
  updateTile();
}

function updateTile() {
  T = Math.max(18, Math.min(vw / 13, vh / 11)) * zoom;
}

export function setZoom(z) {
  zoom = z || 1;
  updateTile();
}

export function viewTiles() {
  return { w: vw / T || 15, h: vh / T || 12 };
}

export function screenToWorld(x, y) {
  return { x: camL + x / T, y: camT + y / T };
}

export function worldRect(x, y, w, h) {
  const r = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
  return { x: r.left + (x - camL) * T, y: r.top + (y - camT) * T, w: w * T, h: h * T };
}

// Camera follows Shuri with a little look-ahead; lives in state so the
// creator's freeze holds it still. Called from update().
export function updateCamera(s, dt, snap = false) {
  const p = s.player;
  const v = viewTiles();
  const tx = p.x + p.facing * 1.6;
  const ty = p.y - 1.6;
  const k = snap ? 1 : Math.min(1, dt * 6);
  s.cam.x += (tx - s.cam.x) * k;
  s.cam.y += (ty - s.cam.y) * k;
  s.cam.x = Math.max(v.w / 2, Math.min(COLS - v.w / 2, s.cam.x));
  s.cam.y = v.h >= ROWS ? ROWS / 2 : Math.max(v.h / 2, Math.min(ROWS - v.h / 2, s.cam.y));
}

// ------------------------------------------------------------ sprite helpers
function drawCell(entry, sx, sy, sw, sh, cx, bottom, size, flip, alpha = 1) {
  const dh = size;
  const dw = size * (sw / sh);
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.translate(cx, bottom - dh);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(entry.canvas, sx, sy, sw, sh, -dw / 2, 0, dw, dh);
  ctx.restore();
}

// The props atlas cells touch their neighbours, so its draws trim the top of
// each cell (crop) to keep the cell above from bleeding in.
function gridSprite(key, cols, row, col, cx, bottom, size, flip = false, alpha = 1, crop = key === "PROPS_ATLAS" ? 0.14 : 0) {
  const e = getImage(key);
  if (!e) return false;
  const c = gridCell(e, cols, row, col);
  const cut = c.sh * crop;
  drawCell(e, c.sx, c.sy + cut, c.sw, c.sh - cut, cx, bottom, size * (1 - crop), flip, alpha);
  return true;
}

// Sheets with .frames.json: cells are 320px at 56 + 384·i in source pixels.
function framedSprite(key, row, col, cx, cy, size, flip = false, alpha = 1) {
  const e = getImage(key);
  if (!e) return false;
  const k = e.scale;
  const pad = 32;
  const sx = (56 + 384 * col - pad) * k;
  const sy = (56 + 384 * row - pad) * k;
  const sw = (320 + pad * 2) * k;
  drawCell(e, Math.max(0, sx), Math.max(0, sy), sw, sw, cx, cy + size / 2, size, flip, alpha);
  return true;
}

function shadowProp(name, cx, bottom, size, alpha = 1) {
  const i = SHADOW_PROPS.indexOf(name);
  return framedSprite("SHADOW_PROPS", Math.floor(i / 4), i % 4, cx, bottom - size / 2, size, false, alpha);
}

function glow(x, y, r, color, a = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(color, a));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ------------------------------------------------------------------ frame
export function render(s) {
  if (!ctx || !vw || !s.level) return;
  const area = AREAS[s.areaIndex];
  camL = s.cam.x - vw / T / 2;
  camT = s.cam.y - vh / T / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = area.world === "shadow" ? "#07060b" : "#0d1018";
  ctx.fillRect(0, 0, vw, vh);
  drawBackdrop(s, area);

  const sh = s.cam.shake > 0 ? s.cam.shake * 0.35 : 0;
  const ox = sh ? (Math.sin(s.time * 91) * sh) : 0;
  const oy = sh ? (Math.cos(s.time * 77) * sh) : 0;
  ctx.save();
  ctx.translate(ox * T, oy * T);
  ctx.scale(T, T);
  ctx.translate(-camL, -camT);
  const x0 = Math.max(0, Math.floor(camL) - 1);
  const x1 = Math.min(COLS - 1, Math.ceil(camL + vw / T) + 1);
  const y0 = Math.max(0, Math.floor(camT) - 1);
  const y1 = Math.min(ROWS - 1, Math.ceil(camT + vh / T) + 1);
  const vis = { x0, x1, y0, y1 };

  drawTerrainBack(s, area, vis);
  drawProps(s, area, vis);
  drawTerrain(s, area, vis);
  drawPickups(s, vis);
  drawBossExtras(s);
  drawEnemies(s, vis);
  drawBoss(s);
  drawKuros(s);
  drawPlayer(s);
  drawShots(s);
  drawFx(s);
  drawParticles(s);
  if (area.toxic) drawToxic(s, vis);
  if (s.debugBoxes) drawBoxes(s);
  ctx.restore();

  if (area.dark > 0) drawDarkness(s, area);
  drawTexts(s, ox, oy);
  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,248,235,${Math.min(0.7, s.flash * 0.6)})`;
    ctx.fillRect(0, 0, vw, vh);
  }
  if (s.player.hurtT > 0) {
    ctx.fillStyle = `rgba(160,0,20,${s.player.hurtT * 0.5})`;
    ctx.fillRect(0, 0, vw, vh);
  }
}

function drawBackdrop(s, area) {
  const e = getImage(area.bg);
  if (!e) return;
  // Cover the view, a little oversized, and pan across it with the camera.
  const sc = Math.max(vw / e.w, vh / e.h) * 1.18;
  const w = e.w * sc;
  const h = e.h * sc;
  const v = viewTiles();
  const px = COLS - v.w > 0 ? (s.cam.x - v.w / 2) / (COLS - v.w) : 0.5;
  const py = ROWS - v.h > 0 ? (s.cam.y - v.h / 2) / (ROWS - v.h) : 0.5;
  ctx.globalAlpha = area.world === "shadow" ? 0.85 : 0.95;
  ctx.drawImage(e.canvas, -(w - vw) * px, -(h - vh) * py, w, h);
  ctx.globalAlpha = 1;
  // A soft veil so black silhouettes always read against the art.
  ctx.fillStyle = area.world === "shadow" ? "rgba(8,6,14,0.28)" : "rgba(10,14,24,0.12)";
  ctx.fillRect(0, 0, vw, vh);
}

// Water, updrafts and webs sit behind the solid rock.
function drawTerrainBack(s, area, v) {
  const L = s.level;
  for (let y = v.y0; y <= v.y1; y++) {
    const row = L.grid[y];
    for (let x = v.x0; x <= v.x1; x++) {
      const ch = row[x];
      if (ch === "~") {
        ctx.fillStyle = "rgba(40,70,140,0.45)";
        ctx.fillRect(x, y, 1, 1);
        if (row[x] === "~" && L.grid[y - 1] && L.grid[y - 1][x] !== "~") {
          ctx.fillStyle = "rgba(160,200,255,0.5)";
          ctx.fillRect(x, y + Math.sin(s.time * 2 + x) * 0.05, 1, 0.06);
        }
      } else if (ch === "v") {
        ctx.fillStyle = "rgba(255,230,160,0.06)";
        ctx.fillRect(x, y, 1, 1);
        const t = (s.time * 1.6 + x * 0.37 + y * 0.11) % 1;
        ctx.fillStyle = "rgba(255,240,200,0.35)";
        ctx.fillRect(x + 0.45, y + 1 - t, 0.06, 0.35);
      } else if (ch === ":" && !L.webCut[key(x, y)]) {
        ctx.strokeStyle = "rgba(235,230,255,0.45)";
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 1, y + 1);
        ctx.moveTo(x + 1, y);
        ctx.lineTo(x, y + 1);
        ctx.moveTo(x + 0.5, y);
        ctx.lineTo(x + 0.5, y + 1);
        ctx.stroke();
      }
    }
  }
}

function drawTerrain(s, area, v) {
  const L = s.level;
  const accent = area.accent;
  const rock = area.world === "shadow" ? "#050407" : "#07080c";
  for (let y = v.y0; y <= v.y1; y++) {
    const row = L.grid[y];
    for (let x = v.x0; x <= v.x1; x++) {
      const ch = row[x];
      if (ch === "." || ch === "~" || ch === "v" || ch === ":") continue;
      switch (ch) {
        case "#": {
          ctx.fillStyle = rock;
          ctx.fillRect(x - 0.01, y - 0.01, 1.02, 1.02);
          if (tileType(s, x, y - 1) !== SOLID) {
            ctx.fillStyle = hexA(accent, 0.55);
            ctx.fillRect(x, y, 1, 0.07);
            // Little grass / crystal tufts on exposed tops.
            if ((x * 7 + y * 3) % 5 === 0) {
              ctx.fillStyle = rock;
              ctx.beginPath();
              ctx.moveTo(x + 0.2, y);
              ctx.lineTo(x + 0.32, y - 0.28);
              ctx.lineTo(x + 0.45, y);
              ctx.fill();
            }
          }
          break;
        }
        case "=":
        case "p": {
          ctx.fillStyle = ch === "p" ? "rgba(200,205,255,0.85)" : rock;
          ctx.fillRect(x, y, 1, 0.24);
          ctx.fillStyle = hexA(ch === "p" ? "#ffffff" : accent, 0.6);
          ctx.fillRect(x, y, 1, 0.05);
          break;
        }
        case "S": {
          if (L.sealOpen) {
            ctx.fillStyle = hexA(accent, 0.18);
            ctx.fillRect(x, y, 1, 0.24);
          } else {
            ctx.fillStyle = "#120c1a";
            ctx.fillRect(x, y, 1, 1);
            const pulse = 0.45 + Math.sin(s.time * 3 + x) * 0.2;
            ctx.fillStyle = hexA(accent, pulse);
            ctx.fillRect(x + 0.1, y + 0.42, 0.8, 0.12);
            ctx.fillRect(x + 0.44, y + 0.15, 0.12, 0.7);
          }
          break;
        }
        case "D":
        case "b": {
          if (L.broken[key(x, y)]) break;
          if (ch === "b") {
            if (!gridSprite("PROPS_ATLAS", 5, 0, 1, x + 0.5, y + 1.05, 1.15)) {
              ctx.fillStyle = "#2a1d14";
              ctx.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
            }
          } else {
            ctx.fillStyle = "#1d1510";
            ctx.fillRect(x, y, 1, 1);
            ctx.strokeStyle = "rgba(220,170,120,0.55)";
            ctx.lineWidth = 0.05;
            const c = L.crack[key(x, y)] || 0;
            ctx.beginPath();
            ctx.moveTo(x + 0.2, y + 0.1);
            ctx.lineTo(x + 0.55, y + 0.5);
            ctx.lineTo(x + 0.35, y + 0.9);
            if (c > 0) {
              ctx.moveTo(x + 0.55, y + 0.5);
              ctx.lineTo(x + 0.9, y + 0.35);
            }
            if (c > 1) {
              ctx.moveTo(x + 0.1, y + 0.6);
              ctx.lineTo(x + 0.55, y + 0.5);
            }
            ctx.stroke();
          }
          break;
        }
        case "|": {
          if (!(s.boss && s.boss.active)) break;
          ctx.fillStyle = "rgba(255,60,80,0.75)";
          ctx.fillRect(x + 0.35, y, 0.3, 1);
          glow(x + 0.5, y + 0.5, 1, "#ff3a5a", 0.25);
          break;
        }
        case "u": {
          const run = L.waxRuns[L.waxRunOf[key(x, y)]];
          if (run && run.gone > 0) break;
          const heat = run ? Math.min(1, run.heat / 1.4) : 0;
          ctx.fillStyle = `rgb(${232},${217 - heat * 80},${184 - heat * 120})`;
          ctx.fillRect(x, y, 1, 0.3);
          ctx.fillRect(x + 0.3, y + 0.3, 0.12, 0.18 + heat * 0.2);
          break;
        }
        case "q": {
          const ph = fleshPhase(s, x);
          const solid = ph < 0.62;
          ctx.fillStyle = solid ? "#6e1426" : "rgba(110,20,38,0.25)";
          const swell = solid ? 0.06 * Math.sin(ph * Math.PI * 3) : 0;
          ctx.fillRect(x, y - swell, 1, 0.32 + swell);
          break;
        }
        case "d": {
          if (s.eclipseT > 0) {
            ctx.fillStyle = "rgba(150,90,255,0.85)";
            ctx.fillRect(x, y, 1, 0.24);
          } else {
            ctx.fillStyle = "rgba(150,90,255,0.18)";
            ctx.fillRect(x + 0.1, y, 0.35, 0.08);
          }
          break;
        }
        case "^": {
          if (!gridSprite("PROPS_ATLAS", 5, 2, 2, x + 0.5, y + 1.05, 1.5, false, 1, 0.4)) {
            ctx.fillStyle = "#1b1b22";
            ctx.beginPath();
            ctx.moveTo(x, y + 1);
            ctx.lineTo(x + 0.25, y + 0.3);
            ctx.lineTo(x + 0.5, y + 1);
            ctx.lineTo(x + 0.75, y + 0.3);
            ctx.lineTo(x + 1, y + 1);
            ctx.fill();
          }
          break;
        }
        default:
          break;
      }
    }
  }
}

const SKY_TARGET_ART = {
  bell: ["MECH_A", 0],
  magnet: ["MECH_A", 1],
  core: ["MECH_A", 2],
  furnace: ["MECH_A", 3],
  valve: ["MECH_B", 1],
  sigil: ["MECH_B", 2],
  rod: ["MECH_B", 3],
};
const PROP_TARGET_ART = {
  terminal: [1, 2],
  mirror: [1, 0],
  receiver: [3, 4],
  emitter: [2, 4],
  orb: [1, 1],
  flood: [3, 1],
};

function inView(v, x, y, m = 3) {
  return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
}

function drawTarget(s, area, t) {
  const fight = s.boss && s.boss.active;
  if (t.weak && !fight && !t.lit) return drawWeakIdle(t);
  const lit = t.lit;
  const bottom = t.y + 0.75;
  if (!lit && !(t.weak && !fight)) {
    const pulse = 0.25 + 0.2 * Math.sin(s.time * 4 + t.x);
    glow(t.x, t.y, 1.2, area.accent, pulse);
  }
  if (lit) glow(t.x, t.y, 1.6, "#fff1c4", 0.45);
  let drawn = false;
  if (area.world === "shadow") {
    let name = "shadow_shrine";
    if (t.kind === "lantern") name = lit ? "lantern_lit" : "lantern_unlit";
    else if (t.kind === "spool") name = "string_spool";
    else if (t.kind === "eye") name = t.open && !lit ? "wall_eye_open" : "wall_eye_closed";
    else if (t.kind === "eclipse") name = "eclipse_bell";
    else if (area.target === "candle") name = "wax_candle";
    else if (area.target === "flesh") name = "flesh_pod";
    drawn = shadowProp(name, t.x, bottom + 0.15, 1.7, 1);
  } else if (SKY_TARGET_ART[t.kind]) {
    const [sheet, row] = SKY_TARGET_ART[t.kind];
    const col = lit ? 1 + (Math.floor(s.time * 8) % 4) : 0;
    drawn = gridSprite(sheet, 5, row, col, t.x, bottom + 0.15, 1.7);
  } else if (PROP_TARGET_ART[t.kind]) {
    const [row, col] = PROP_TARGET_ART[t.kind];
    drawn = gridSprite("PROPS_ATLAS", 5, row, col, t.x, bottom + 0.15, 1.6, false, lit ? 1 : 0.85);
  } else if (t.kind === "eclipse") {
    drawn = shadowProp("eclipse_bell", t.x, bottom + 0.15, 1.7);
  } else if (t.kind === "lantern") {
    drawn = shadowProp(lit ? "lantern_lit" : "lantern_unlit", t.x, bottom + 0.15, 1.7);
  } else if (t.kind === "spool") {
    drawn = shadowProp("string_spool", t.x, bottom + 0.15, 1.6);
  } else if (t.kind === "eye") {
    drawn = shadowProp(t.open && !lit ? "wall_eye_open" : "wall_eye_closed", t.x, bottom + 0.15, 1.6);
  }
  if (!drawn) {
    ctx.fillStyle = lit ? "#fff1c4" : area.accent;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  if (t.kind === "eye" && t.open && !lit && t.aimT > 0) {
    ctx.strokeStyle = `rgba(255,40,40,${Math.min(1, t.aimT)})`;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(s.player.x, s.player.y - 0.8);
    ctx.stroke();
  }
}

function drawWeakIdle(t) {
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(t.x, t.y, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawProps(s, area, v) {
  const L = s.level;
  for (const d of L.decor) {
    if (!inView(v, d.x, d.y)) continue;
    if (d.type === "well") shadowProp("old_well", d.x, d.y + 0.1, 2.4);
    else gridSprite("PROPS_ATLAS", 5, 0, 3, d.x, d.y + 0.1, 1.1);
  }
  for (const c of L.checkpoints) {
    if (!inView(v, c.x, c.y)) continue;
    if (c.active) glow(c.x, c.y - 0.6, 1.6, "#7fffe0", 0.4);
    if (!gridSprite("PROPS_ATLAS", 5, 1, 4, c.x, c.y + 0.12, 1.3, false, c.active ? 1 : 0.7)) {
      ctx.fillStyle = c.active ? "#7fffe0" : "#3a5a52";
      ctx.fillRect(c.x - 0.4, c.y - 0.15, 0.8, 0.15);
    }
  }
  for (const h of L.hints) {
    if (!inView(v, h.x, h.y)) continue;
    gridSprite("PROPS_ATLAS", 5, 1, 3, h.x, h.y + 0.1, 1.4);
    glow(h.x, h.y - 0.7, 0.9, area.accent, 0.25 + Math.sin(s.time * 3) * 0.1);
  }
  for (const a of L.anchors) {
    if (!inView(v, a.x, a.y)) continue;
    glow(a.x, a.y, 1, "#7fffe0", 0.18);
    gridSprite("PROPS_ATLAS", 5, 0, 0, a.x, a.y + 0.7, 1.4);
  }
  for (const sp of L.spawners) {
    if (sp.used || !inView(v, sp.x, sp.y)) continue;
    shadowProp("hanging_cocoon", sp.x, sp.y + 1.2, 2.2);
  }
  for (const vt of L.vents) {
    if (!inView(v, vt.x, vt.y)) continue;
    ctx.fillStyle = "#15151c";
    ctx.fillRect(vt.x - 0.4, vt.y - 0.2, 0.8, 0.2);
    if ((s.time + vt.x * 0.13) % 2.6 < 0.9) {
      for (let i = 0; i < 5; i++) {
        const t = (s.time * 2 + i * 0.2) % 1;
        ctx.fillStyle = `rgba(230,230,240,${0.35 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(vt.x + Math.sin(i * 3 + s.time * 4) * 0.2, vt.y - 0.3 - t * 4, 0.25 + t * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  for (const pl of L.platforms) {
    if (!inView(v, pl.x, pl.y, pl.w + 3)) continue;
    ctx.fillStyle = "#0a0a10";
    ctx.fillRect(pl.x, pl.y, pl.w, 0.35);
    ctx.fillStyle = hexA(area.accent, 0.7);
    ctx.fillRect(pl.x, pl.y, pl.w, 0.06);
  }
  for (const t of L.targets) if (inView(v, t.x, t.y)) drawTarget(s, area, t);
  // The exit: a gate of light far left on the upper floor.
  const ex = L.exit;
  if (ex && inView(v, ex.x, ex.y, 5)) {
    const open = !AREAS[s.areaIndex].boss || s.bossDone;
    glow(ex.x, ex.y - 1.4, 2.6, open ? "#fff1c4" : "#555566", open ? 0.55 : 0.25);
    ctx.strokeStyle = open ? "#fff1c4" : "#6a6a7a";
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(ex.x - 1, ex.y);
    ctx.lineTo(ex.x - 1, ex.y - 2.6);
    ctx.moveTo(ex.x + 1, ex.y);
    ctx.lineTo(ex.x + 1, ex.y - 2.6);
    ctx.moveTo(ex.x - 1.4, ex.y - 2.6);
    ctx.lineTo(ex.x + 1.4, ex.y - 2.6);
    ctx.moveTo(ex.x - 1.1, ex.y - 2.1);
    ctx.lineTo(ex.x + 1.1, ex.y - 2.1);
    ctx.stroke();
  }
}

function drawPickups(s, v) {
  for (const pk of s.level.pickups) {
    if (pk.taken || !inView(v, pk.x, pk.y)) continue;
    const bob = Math.sin(s.time * 3 + pk.x) * 0.12;
    const x = pk.x;
    const y = pk.y - 0.55 + bob;
    if (pk.type === "shard" || pk.type === "heal") {
      const r = pk.type === "heal" ? 0.42 : 0.28;
      glow(x, y, r * 3, "#ff3b6a", 0.35);
      heart(x, y, r, "#ff3b6a");
    } else if (pk.type === "rune") {
      glow(x, y, 1, "#b88bff", 0.45);
      ctx.fillStyle = "#d9c2ff";
      ctx.beginPath();
      ctx.moveTo(x, y - 0.4);
      ctx.lineTo(x + 0.28, y);
      ctx.lineTo(x, y + 0.4);
      ctx.lineTo(x - 0.28, y);
      ctx.fill();
    } else {
      glow(x, y, 0.9, "#ffe27a", 0.35);
      ctx.fillStyle = "#e9dcb8";
      ctx.fillRect(x - 0.3, y - 0.18, 0.6, 0.36);
      ctx.fillStyle = "#8a5a2a";
      ctx.fillRect(x - 0.36, y - 0.22, 0.1, 0.44);
      ctx.fillRect(x + 0.26, y - 0.22, 0.1, 0.44);
    }
  }
}

function heart(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
  ctx.fill();
}

function enemyRow(e) {
  if (e.dead) return 3;
  if (e.hurtT > 0) return 2;
  if (e.state === "wind" || e.state === "lunge" || e.state === "fuse") return 1;
  return 0;
}

function drawEnemies(s, v) {
  for (const e of s.enemies) {
    if (!inView(v, e.x, e.y, 4)) continue;
    const d = ENEMIES[e.type];
    const row = enemyRow(e);
    let col;
    if (row === 3) col = Math.min(4, Math.floor((e.deadT / 0.6) * 5));
    else if (row === 1) col = Math.min(4, Math.floor(e.t * 7));
    else if (row === 2) col = Math.min(4, Math.floor((1 - e.hurtT / 0.22) * 5));
    else col = Math.floor(s.time * 8 + e.phase) % 5;
    const size = d.size * e.scale;
    const fly = d.ai === "flyer";
    const bottom = fly ? e.y - e.h / 2 + size / 2 : e.y + size * (1 - (d.foot || 0.9));
    const flip = e.dir > 0;
    const alpha = e.dead ? Math.max(0, 1 - e.deadT / 0.6) : 1;
    if (e.state === "fuse") glow(e.x, e.y - e.h / 2, 1.6, "#ffb347", 0.4 + Math.sin(e.t * 30) * 0.2);
    const ok = gridSprite(d.key, 5, row, col, e.x, bottom, size, flip, alpha);
    if (!ok) {
      ctx.fillStyle = "#111";
      ctx.fillRect(e.x - e.w / 2, e.y - e.h, e.w, e.h);
    }
    if (e.flash > 0 && ok) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      gridSprite(d.key, 5, row, col, e.x, bottom, size, flip, 0.55);
      ctx.restore();
    }
    if (e.rootT > 0) {
      ctx.strokeStyle = "rgba(240,235,255,0.7)";
      ctx.lineWidth = 0.05;
      ctx.strokeRect(e.x - e.w / 2 - 0.1, e.y - e.h - 0.1, e.w + 0.2, e.h + 0.2);
    }
    if (!e.dead && e.hp < e.maxHp) {
      const w = Math.max(0.8, e.w);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(e.x - w / 2, e.y - e.h - 0.45, w, 0.1);
      ctx.fillStyle = "#ff5a6a";
      ctx.fillRect(e.x - w / 2, e.y - e.h - 0.45, (w * e.hp) / e.maxHp, 0.1);
    }
  }
}

function drawBossExtras(s) {
  const b = s.boss;
  if (!b || !b.strings || b.dead) return;
  for (const st of b.strings) {
    if (st.cut) continue;
    ctx.strokeStyle = "rgba(255,80,90,0.8)";
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(st.x, st.y);
    ctx.lineTo(st.x + st.o * 0.5, 1);
    ctx.stroke();
    glow(st.x, st.y, 0.5, "#ff5050", 0.5);
  }
}

function drawBoss(s) {
  const b = s.boss;
  if (!b) return;
  if (!b.active && !b.dead) {
    // Dormant: a dark shape waiting in the arena.
    if (s.bossDone) return;
  }
  if (b.dead && b.deadT > 1.2) return;
  const d = BOSSES[b.type];
  const rowOf = { idle: 0, lunge: 1, slam: 2, shoot: 3 };
  const row = rowOf[b.state] ?? 0;
  const col = b.state === "idle" ? Math.floor(s.time * 6) % 5 : Math.min(4, Math.floor(b.t * 6));
  const size = d.size;
  const bottom = b.fly ? b.y - b.h / 2 + size / 2 : b.y + size * (1 - (d.foot || 0.9));
  const flip = b.dir > 0;
  const alpha = b.dead ? Math.max(0, 1 - b.deadT / 1.2) : b.active ? 1 : 0.55;
  if (b.active && b.state !== "idle") glow(b.x, b.y - b.h / 2, size * 0.6, d.shot, 0.2);
  const ok = gridSprite(d.key, 5, row, col, b.x, bottom, size, flip, alpha);
  if (!ok) {
    ctx.fillStyle = "#000";
    ctx.fillRect(b.x - b.w / 2, b.y - b.h, b.w, b.h);
  }
  if (b.flash > 0 && ok) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    gridSprite(d.key, 5, row, col, b.x, bottom, size, flip, 0.5);
    ctx.restore();
  }
  if (b.stun > 0) {
    for (let i = 0; i < 3; i++) {
      const a = s.time * 4 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = "#ffd27a";
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(a) * 0.8, b.y - b.h - 0.3 + Math.sin(a) * 0.25, 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawKuros(s) {
  const sheet = kuroKey(s.skin, "SHEET");
  const forms = kuroKey(s.skin, "FORMS");
  const color = SKINS[s.skin].color;
  for (const k of s.kuros) {
    const moving = k.mode === "out" || k.mode === "return";
    if (moving) {
      for (let i = 1; i <= 3; i++) {
        const tx = k.x - k.vx * 0.018 * i;
        const ty = k.y - k.vy * 0.018 * i;
        glow(tx, ty, 0.5, color, 0.18 / i);
      }
    }
    glow(k.x, k.y, 0.9, color, 0.25);
    const col = Math.floor(k.spin) % 5;
    let ok;
    if (k.charged) ok = gridSprite(forms, 5, 1, col, k.x, k.y + 0.7, 1.4);
    else if (k.mode === "anchored" || k.mode === "held") ok = gridSprite(sheet, 5, 1, Math.floor(s.time * 6) % 5, k.x, k.y + 0.7, 1.4);
    else ok = gridSprite(sheet, 5, 0, col, k.x, k.y + 0.7, 1.4);
    if (!ok) {
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(k.x, k.y, 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function playerPose(s) {
  const p = s.player;
  const f5 = (t, dur) => Math.min(4, Math.max(0, Math.floor((t / dur) * 5)));
  const loop = (rate) => Math.floor(s.time * rate) % 5;
  if (p.dead) return ["STATUS", ANIM.STATUS.death, f5(1.4 - p.deadT, 1)];
  if (s.cleared) return ["STATUS", ANIM.STATUS.victory, loop(6)];
  if (p.hurtT > 0) return ["STATUS", ANIM.STATUS.hurt, f5(0.32 - p.hurtT, 0.32)];
  if (p.pull) return ["SKILLS", ANIM.SKILLS.lunge, loop(12)];
  if (p.skillT > 0) {
    const id = p.skillAnim;
    const pr = f5(0.45 - p.skillT, 0.45);
    if (id === "echo") return ["EXTRA", ANIM.EXTRA.shoot, pr];
    if (id === "ashstep") return ["AGILITY", ANIM.AGILITY.dash, pr];
    if (id === "slam" || id === "harvest") return ["SKILLS", ANIM.SKILLS.wave, pr];
    if (id === "mist" || id === "frenzy" || id === "eclipse") return ["SKILLS", ANIM.SKILLS.power, pr];
    return ["SKILLS", ANIM.SKILLS.cast, pr];
  }
  if (p.dashT > 0) return ["AGILITY", ANIM.AGILITY.dash, loop(18)];
  if (!p.onGround && p.wall !== 0 && Math.sign(s.input.ax) === p.wall) return ["AGILITY", ANIM.AGILITY.wall, loop(8)];
  if (p.throwT > 0) return ["COMBAT", ANIM.COMBAT.throw, f5(0.26 - p.throwT, 0.26)];
  if (p.recallT > 0) return ["COMBAT", ANIM.COMBAT.recall, f5(0.22 - p.recallT, 0.22)];
  if (p.catchT > 0) return ["COMBAT", ANIM.COMBAT.catch, f5(0.2 - p.catchT, 0.2)];
  if (!p.onGround) {
    if (p.inWater) return ["MOVE", ANIM.MOVE.fall, loop(5)];
    if (p.jumpsUsed >= 2 && p.vy < 2) return ["AGILITY", ANIM.AGILITY.flip, loop(14)];
    if (p.vy < 0) return ["MOVE", ANIM.MOVE.jump, Math.min(4, Math.floor((1 - Math.min(1, -p.vy / 18)) * 5))];
    return ["MOVE", ANIM.MOVE.fall, loop(8)];
  }
  if (p.landT > 0) return ["STATUS", ANIM.STATUS.land, f5(0.18 - p.landT, 0.18)];
  if (Math.abs(p.vx) > 0.6) return ["MOVE", ANIM.MOVE.run, loop(12)];
  return ["MOVE", ANIM.MOVE.idle, loop(6)];
}

function drawPlayer(s) {
  const p = s.player;
  const sk = SKINS[s.skin];
  const [part, row, col] = playerPose(s);
  let alpha = 1;
  if (p.invT > 0 && !p.dead && Math.floor(s.time * 20) % 2 === 0) alpha = 0.4;
  if (p.mistT > 0) alpha = 0.45;
  if (p.charged) glow(p.x + p.facing * 0.3, p.y - 0.95, 0.9, "#ffe27a", 0.35 + Math.sin(s.time * 10) * 0.1);
  if (p.frenzyT > 0) glow(p.x, p.y - 0.8, 1.8, "#ff2448", 0.25);
  if (s.skin >= 6) glow(p.x, p.y - 0.8, 1.6, sk.color, 0.08 + s.skin * 0.006);
  const k = sheetKey(s.skin, part);
  const ok = gridSprite(k, 5, row, col, p.x, p.y + PLAYER_DRAW * 0.05, PLAYER_DRAW, p.facing < 0, alpha);
  if (!ok) {
    ctx.fillStyle = "#000";
    ctx.fillRect(p.x - p.w / 2, p.y - p.h, p.w, p.h);
  }
  if (p.frenzyT > 0 && ok) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    gridSprite(k, 5, row, col, p.x, p.y + PLAYER_DRAW * 0.05, PLAYER_DRAW, p.facing < 0, 0.18);
    ctx.restore();
  }
}

function drawShots(s) {
  for (const b of s.pshots) {
    if (b.beam) {
      glow(b.x, b.y, 1.1, b.color, 0.5);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - 0.7, b.y - 0.12, 1.4, 0.24);
    } else if (b.wave) {
      glow(b.x, b.y, 1, b.color, 0.5);
      ctx.fillStyle = hexA(b.color, 0.8);
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 0.35, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.feather) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(b.angle) * 0.4, b.y - Math.sin(b.angle) * 0.4);
      ctx.lineTo(b.x + Math.cos(b.angle) * 0.4, b.y + Math.sin(b.angle) * 0.4);
      ctx.stroke();
      glow(b.x, b.y, 0.5, b.color, 0.4);
    } else if (b.fire) {
      glow(b.x, b.y, 0.7, "#ff7a2a", 0.45 * Math.min(1, b.life));
    } else {
      glow(b.x, b.y, 0.8, b.color, 0.6);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const b of s.shots) {
    if (b.tongue) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 0.18;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.ox, b.oy);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      continue;
    }
    if (b.bolt) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - 1);
      ctx.lineTo(b.x + 0.2, b.y - 0.6);
      ctx.lineTo(b.x - 0.15, b.y - 0.3);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      glow(b.x, b.y, 0.6, b.color, 0.5);
      continue;
    }
    const r = b.big ? 0.42 : b.wave ? 0.5 : 0.3;
    glow(b.x, b.y, r * 2.4, b.color, 0.55);
    ctx.fillStyle = b.wave ? hexA(b.color, 0.7) : "#fff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const bo of s.bolts) {
    ctx.strokeStyle = bo.color;
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(bo.x1, bo.y1);
    const n = 6;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ctx.lineTo(bo.x1 + (bo.x2 - bo.x1) * t + Math.sin(i * 12.9 + s.time * 40) * 0.25, bo.y1 + (bo.y2 - bo.y1) * t + Math.cos(i * 7.1 + s.time * 33) * 0.25);
    }
    ctx.lineTo(bo.x2, bo.y2);
    ctx.stroke();
  }
}

function drawFx(s) {
  for (const f of s.fx) {
    const prog = f.loop ? (f.t % f.dur) / Math.min(f.dur, 0.6) : f.t / f.dur;
    const col = f.loop ? Math.floor(f.t * 9) % 5 : Math.min(4, Math.floor(prog * 5));
    const alpha = f.alpha * (f.loop && f.until - f.t < 0.4 ? Math.max(0, (f.until - f.t) / 0.4) : 1);
    if (typeof f.row === "string") {
      const names = FX_NAMES[f.sheet] || [];
      const row = names.indexOf(f.row);
      if (row >= 0) framedSprite(f.sheet, row, col, f.x, f.y, f.size, f.flip, alpha);
    } else {
      gridSprite(f.sheet, 5, f.row, col, f.x, f.y + f.size / 2, f.size, f.flip, alpha);
    }
  }
}

function drawParticles(s) {
  for (const p of s.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawToxic(s, v) {
  const lvl = toxicLevel(s);
  if (lvl > 40) return;
  ctx.fillStyle = "rgba(120,190,40,0.42)";
  ctx.beginPath();
  ctx.moveTo(v.x0, 40);
  for (let x = v.x0; x <= v.x1 + 1; x += 0.5) ctx.lineTo(x, lvl + Math.sin(x * 1.3 + s.time * 3) * 0.08);
  ctx.lineTo(v.x1 + 1, 40);
  ctx.fill();
  ctx.fillStyle = "rgba(200,255,120,0.5)";
  for (let x = v.x0; x <= v.x1; x += 2) ctx.fillRect(x + ((s.time * 0.7 + x) % 1), lvl + 0.15, 0.12, 0.12);
}

function drawBoxes(s) {
  ctx.strokeStyle = "#0f0";
  ctx.lineWidth = 0.04;
  const p = s.player;
  ctx.strokeRect(p.x - p.w / 2, p.y - p.h, p.w, p.h);
  for (const e of s.enemies) ctx.strokeRect(e.x - e.w / 2, e.y - e.h, e.w, e.h);
  if (s.boss) ctx.strokeRect(s.boss.x - s.boss.w / 2, s.boss.y - s.boss.h, s.boss.w, s.boss.h);
}

// Darkness: a dim layer with holes punched by Shuri, lanterns and Kuro.
function drawDarkness(s, area) {
  const W = dark.width;
  const H = dark.height;
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalCompositeOperation = "source-over";
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = `rgba(2,2,6,${area.dark})`;
  dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = "destination-out";
  const hole = (x, y, r, a = 1) => {
    const sx = (x - camL) * T * dpr;
    const sy = (y - camT) * T * dpr;
    const rr = r * T * dpr;
    if (sx < -rr || sy < -rr || sx > W + rr || sy > H + rr) return;
    const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(0.55, `rgba(0,0,0,${a * 0.7})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g;
    dctx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
  };
  const p = s.player;
  hole(p.x, p.y - 0.8, 5.2);
  for (const k of s.kuros) hole(k.x, k.y, 2.2, 0.8);
  for (const t of s.level.targets) if (t.lit) hole(t.x, t.y, t.kind === "lantern" ? 7 : 3.5);
  for (const c of s.level.checkpoints) if (c.active) hole(c.x, c.y - 0.8, 3);
  if (s.level.exit) hole(s.level.exit.x, s.level.exit.y - 1.2, 3.5, 0.8);
  for (const b of s.pshots) hole(b.x, b.y, 1.6, 0.6);
  for (const b of s.shots) hole(b.x, b.y, 1.1, 0.5);
  if (s.boss && s.boss.active) hole(s.boss.x, s.boss.y - s.boss.h / 2, 3, 0.4);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(dark, 0, 0);
  ctx.restore();
}

function drawTexts(s, ox, oy) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of s.texts) {
    const sx = (t.x - camL + ox) * T;
    const sy = (t.y - camT + oy) * T;
    if (sx < -50 || sy < -50 || sx > vw + 50 || sy > vh + 50) continue;
    const a = Math.min(1, t.life / (t.max * 0.5));
    const px = Math.round(Math.max(12, Math.min(T * (t.big ? 0.62 : 0.45), t.big ? 26 : 18)));
    ctx.font = `${t.big ? 800 : 700} ${px}px Inter, system-ui, sans-serif`;
    ctx.globalAlpha = a;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(t.str, sx, sy);
    ctx.fillStyle = t.color;
    ctx.fillText(t.str, sx, sy);
  }
  ctx.globalAlpha = 1;
}

