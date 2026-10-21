// Tile queries and body movement. One function decides what every grid cell
// is this frame (solid, one-way or empty); physics, Kuro and rendering all ask
// it, so a seal that opens or a wax ledge that melts changes everywhere at once.
import { COLS, ROWS } from "./config.js";
import { AREAS } from "./areas.js";

export const EMPTY = 0;
export const SOLID = 1;
export const ONEWAY = 2;

export const key = (x, y) => `${x},${y}`;

export function tileChar(s, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return "#";
  return s.level.grid[y][x];
}

export function fleshPhase(s, x) {
  return (s.time / 3.2 + x * 0.045) % 1;
}

export function fleshSolid(s, x) {
  return fleshPhase(s, x) < 0.62;
}

export function tileType(s, x, y) {
  const L = s.level;
  const ch = tileChar(s, x, y);
  switch (ch) {
    case "#":
      return SOLID;
    case "=":
    case "p":
      return ONEWAY;
    case "S":
      return L.sealOpen ? ONEWAY : SOLID;
    case "D":
    case "b":
      return L.broken[key(x, y)] ? EMPTY : SOLID;
    case "|":
      return s.boss && s.boss.active ? SOLID : EMPTY;
    case "u": {
      const run = L.waxRuns[L.waxRunOf[key(x, y)]];
      return run && run.gone > 0 ? EMPTY : ONEWAY;
    }
    case "q":
      return fleshSolid(s, x) ? ONEWAY : EMPTY;
    case "d":
      return s.eclipseT > 0 ? ONEWAY : EMPTY;
    default:
      return EMPTY;
  }
}

export function isSolidAt(s, px, py) {
  return tileType(s, Math.floor(px), Math.floor(py)) === SOLID;
}

function collideX(s, b, res) {
  const y0 = Math.floor(b.y - b.h + 0.02);
  const y1 = Math.floor(b.y - 0.02);
  if (b.vx > 0) {
    const cx = Math.floor(b.x + b.w / 2);
    for (let y = y0; y <= y1; y++) {
      if (tileType(s, cx, y) === SOLID) {
        b.x = cx - b.w / 2 - 0.0005;
        b.vx = 0;
        res.hitWall = 1;
        return;
      }
    }
  } else if (b.vx < 0) {
    const cx = Math.floor(b.x - b.w / 2);
    for (let y = y0; y <= y1; y++) {
      if (tileType(s, cx, y) === SOLID) {
        b.x = cx + 1 + b.w / 2 + 0.0005;
        b.vx = 0;
        res.hitWall = -1;
        return;
      }
    }
  }
}

function collideY(s, b, prevY, res, drop) {
  const x0 = Math.floor(b.x - b.w / 2 + 0.02);
  const x1 = Math.floor(b.x + b.w / 2 - 0.02);
  if (b.vy >= 0) {
    const cy = Math.floor(b.y);
    for (let x = x0; x <= x1; x++) {
      const t = tileType(s, x, cy);
      if (t === SOLID || (t === ONEWAY && !drop && prevY <= cy + 0.001)) {
        b.y = cy;
        b.vy = 0;
        b.onGround = true;
        res.landed = true;
        res.groundX = x;
        res.groundY = cy;
        return;
      }
    }
  } else {
    const cy = Math.floor(b.y - b.h);
    for (let x = x0; x <= x1; x++) {
      if (tileType(s, x, cy) === SOLID) {
        b.y = cy + 1 + b.h;
        b.vy = 0;
        res.hitCeil = true;
        return;
      }
    }
  }
}

// b: { x (centre), y (feet), w, h, vx, vy }. Sub-steps keep fast bodies from
// tunnelling through one-tile floors.
export function moveBody(s, b, dt, drop = false) {
  const res = { hitWall: 0, landed: false, hitCeil: false, groundX: -1, groundY: -1 };
  const dist = Math.max(Math.abs(b.vx * dt), Math.abs(b.vy * dt));
  const steps = Math.max(1, Math.ceil(dist / 0.3));
  b.onGround = false;
  for (let i = 0; i < steps; i++) {
    b.x += (b.vx * dt) / steps;
    collideX(s, b, res);
    const prevY = b.y;
    b.y += (b.vy * dt) / steps;
    collideY(s, b, prevY, res, drop);
  }
  b.x = Math.max(b.w / 2, Math.min(COLS - b.w / 2, b.x));
  b.y = Math.max(b.h, Math.min(ROWS, b.y));
  return res;
}

// True when any tile under the box is of the given glyph (hazards, water…).
export function overlapsGlyph(s, b, glyph, inset = 0.1) {
  const x0 = Math.floor(b.x - b.w / 2 + inset);
  const x1 = Math.floor(b.x + b.w / 2 - inset);
  const y0 = Math.floor(b.y - b.h + inset);
  const y1 = Math.floor(b.y - inset);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (tileChar(s, x, y) === glyph) return { x, y };
  return null;
}

export function groundAhead(s, x, y) {
  const t = tileType(s, Math.floor(x), Math.floor(y + 0.05));
  return t !== EMPTY;
}

// Toxic swamp water rises in the bottom room of Rawa Tulang.
export function toxicLevel(s) {
  if (!AREAS[s.areaIndex].toxic) return 99;
  const t = (s.time % 12) / 12;
  // 0–0.35 low, 0.35–0.5 rising, 0.5–0.78 high, 0.78–0.93 falling.
  let h = 0;
  if (t < 0.35) h = 0;
  else if (t < 0.5) h = (t - 0.35) / 0.15;
  else if (t < 0.78) h = 1;
  else if (t < 0.93) h = 1 - (t - 0.78) / 0.15;
  return 39.05 - h * 3.3;
}
