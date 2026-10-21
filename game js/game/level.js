// Builds an area into live state and runs its furniture: targets and the Seal,
// moving ledges, melting wax, eclipse floors, wall eyes, pickups, checkpoints,
// hints and the exit.
import { AREAS } from "./areas.js";
import { ENEMY_GLYPHS } from "./bestiary.js";
import { COLS, ROWS } from "./config.js";
import { key } from "./world.js";
import { spawnEnemy } from "./enemies.js";
import { healPlayer, hurtPlayer } from "./combat.js";
import { spark, effect, text, toast, shake } from "./fx.js";
import { sfx, haptic } from "./audio.js";

const TILE_GLYPHS = new Set(["#", "=", "p", "S", "D", "|", "u", "q", "d", "b", "^", "~", "v", ":"]);

const TARGET_KIND = {
  B: "bell",
  M: "magnet",
  o: "core",
  e: "emitter",
  R: "mirror",
  r: "receiver",
  F: "furnace",
  V: "valve",
  O: "orb",
  "!": "sigil",
  T: "terminal",
  Z: "rod",
  f: "flood",
  N: "lantern",
  J: "spool",
  Y: "eye",
  G: "eclipse",
};

export function buildLevel(s, index) {
  const area = AREAS[index];
  const rows = area.grid.map((r) => r.split(""));
  const L = {
    grid: [],
    sealOpen: false,
    broken: {},
    crack: {},
    webCut: {},
    waxRuns: [],
    waxRunOf: {},
    platforms: [],
    targets: [],
    anchors: [],
    pickups: [],
    checkpoints: [],
    hints: [],
    decor: [],
    spawners: [],
    vents: [],
    gates: null,
    bossSpawn: null,
    exit: null,
    start: { x: 3.5, y: 39 },
    total: 0,
    litCount: 0,
  };
  s.enemies = [];
  const pending = [];
  // Moving ledges: merge horizontal runs of H / U into one platform each.
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = rows[y][x];
      if (ch !== "H" && ch !== "U") continue;
      let w = 1;
      while (x + w < COLS && rows[y][x + w] === ch) w++;
      L.platforms.push({ id: ++s.nextId, x0: x, y0: y, w, axis: ch === "H" ? "h" : "v", range: 3, speed: 0.9, phase: x * 0.37, x, y, dx: 0, dy: 0 });
      for (let i = 0; i < w; i++) rows[y][x + i] = ".";
      x += w - 1;
    }
  }
  let gx0 = 1e9;
  let gx1 = -1;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = rows[y][x];
      if (TILE_GLYPHS.has(ch)) {
        if (ch === "|") {
          gx0 = Math.min(gx0, x);
          gx1 = Math.max(gx1, x);
        }
        continue;
      }
      if (ch === ".") continue;
      rows[y][x] = ".";
      const cx = x + 0.5;
      if (TARGET_KIND[ch]) {
        const t = { id: ++s.nextId, x: cx, y: y + 0.5, bx: cx, by: y + 0.5, glyph: ch, kind: TARGET_KIND[ch], lit: false, weak: y < 15, relight: 0, platId: null, open: true, eyeT: Math.random() * 3, aimT: 0 };
        const plat = L.platforms.find((pl) => pl.y0 === y + 1 && x >= pl.x0 && x < pl.x0 + pl.w);
        if (plat) t.platId = plat.id;
        L.targets.push(t);
        if (!t.weak && ch !== "G") L.total++;
        continue;
      }
      switch (ch) {
        case "P":
          L.start = { x: cx, y: y + 1 };
          break;
        case "E":
          L.exit = { x: cx, y: y + 1 };
          break;
        case "&":
          L.bossSpawn = { x: cx, y: y + 1 };
          break;
        case "C":
        case "X":
          L.checkpoints.push({ id: ++s.nextId, x: cx, y: y + 1, active: false });
          break;
        case "?":
          L.hints.push({ id: ++s.nextId, x: cx, y: y + 1, shown: false });
          break;
        case "A":
        case "Q":
          L.anchors.push({ id: ++s.nextId, x: cx, y: y + 0.5 });
          break;
        case "*":
          L.pickups.push({ id: ++s.nextId, x: cx, y: y + 1, type: "shard", taken: false });
          break;
        case "@":
          L.pickups.push({ id: ++s.nextId, x: cx, y: y + 1, type: "heal", taken: false });
          break;
        case "$":
          L.pickups.push({ id: ++s.nextId, x: cx, y: y + 1, type: "rune", taken: false });
          break;
        case "n":
        case "L":
        case "I":
          L.pickups.push({ id: ++s.nextId, x: cx, y: y + 1, type: "scroll", taken: false });
          break;
        case "s":
          L.vents.push({ x: cx, y: y + 1 });
          break;
        case "W":
          L.decor.push({ x: cx, y: y + 1, type: "well" });
          break;
        case "_":
          L.decor.push({ x: cx, y: y + 1, type: "plate" });
          break;
        case "+":
          L.spawners.push({ id: ++s.nextId, x: cx, y: y + 0.5, used: false });
          break;
        default: {
          const type = ch === "a" ? area.monster : ch === "1" || ch === "2" || ch === "3" ? area.extra[Number(ch) - 1] : ENEMY_GLYPHS[ch];
          if (type) pending.push({ type, x: cx, y: y + 1 });
        }
      }
    }
  }
  if (gx1 >= 0) L.gates = { x0: gx0, x1: gx1 };
  // Wax ledges melt as a run.
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (rows[y][x] !== "u" || L.waxRunOf[key(x, y)] !== undefined) continue;
      const id = L.waxRuns.length;
      L.waxRuns.push({ heat: 0, gone: 0 });
      let xx = x;
      while (xx < COLS && rows[y][xx] === "u") {
        L.waxRunOf[key(xx, y)] = id;
        xx++;
      }
    }
  }
  L.grid = rows.map((r) => r.join(""));
  s.level = L;
  for (const pe of pending) spawnEnemy(s, pe.type, pe.x, pe.y);
  return L;
}

export function targetsLeft(s) {
  return s.level.total - s.level.litCount;
}

export function lightTarget(s, t) {
  const L = s.level;
  if (t.kind === "eclipse") {
    s.eclipseT = 10;
    t.lit = true;
    t.relight = 10;
    effect(s, "FX_COMBAT", 3, t.x, t.y, 3, 0.6);
    sfx("bell");
    toast(s, "Gerhana! Lantai bayangan muncul.", 1.8);
    return;
  }
  t.lit = true;
  if (t.kind === "eye") t.open = false;
  effect(s, "FX_COMBAT", 3, t.x, t.y, 2.4, 0.5);
  spark(s, t.x, t.y, AREAS[s.areaIndex].accent, 12, 5);
  sfx(t.kind === "bell" || t.kind === "lantern" ? "bell" : "sigil");
  haptic(14);
  if (t.weak) {
    // Arena weak points hurt the boss and come back later.
    t.relight = 8;
    const b = s.boss;
    if (b && b.active && !b.dead) {
      b.stun = 2.4;
      b.hp = Math.max(1, b.hp - b.maxHp * 0.1);
      text(s, b.x, b.y - b.h - 0.4, "Lumpuh!", "#ffd27a", true);
      shake(s, 0.4);
    }
    return;
  }
  L.litCount++;
  const left = L.total - L.litCount;
  if (left > 0) {
    text(s, t.x, t.y - 1, `${left} lagi`, "#fff1c4");
  } else if (!L.sealOpen) {
    L.sealOpen = true;
    s.sealFxT = 1.2;
    shake(s, 0.5);
    sfx("seal");
    haptic(60);
    toast(s, "Segel terbuka! Naik ke atas.", 2.4);
    for (let x = 0; x < COLS; x++) if (L.grid[15][x] === "S") effect(s, "FX_WORLD", 1, x + 0.5, 15.5, 2, 0.8);
  }
}

function platformById(L, id) {
  return L.platforms.find((p) => p.id === id);
}

export function updateLevel(s, dt) {
  const L = s.level;
  const p = s.player;
  for (const pl of L.platforms) {
    const off = Math.sin(s.time * pl.speed + pl.phase) * pl.range;
    const nx = pl.axis === "h" ? pl.x0 + off : pl.x0;
    const ny = pl.axis === "v" ? pl.y0 + off : pl.y0;
    pl.dx = nx - pl.x;
    pl.dy = ny - pl.y;
    pl.x = nx;
    pl.y = ny;
  }
  if (s.eclipseT > 0) s.eclipseT = Math.max(0, s.eclipseT - dt);
  for (const t of L.targets) {
    if (t.platId) {
      const pl = platformById(L, t.platId);
      if (pl) {
        t.x = t.bx + (pl.x - pl.x0);
        t.y = t.by + (pl.y - pl.y0);
      }
    }
    if (t.relight > 0) {
      t.relight -= dt;
      if (t.relight <= 0) t.lit = false;
    }
    if (t.kind === "eye" && !t.lit) updateEye(s, t, dt);
  }
  // Wax ledges heat up under Shuri's feet, melt, then re-form.
  for (const run of L.waxRuns) {
    if (run.gone > 0) {
      run.gone -= dt;
      if (run.gone <= 0) run.heat = 0;
    } else run.heat = Math.max(0, run.heat - dt * 0.4);
  }
  if (p.onGround && p.groundChar === "u" && p.groundKey) {
    const run = L.waxRuns[L.waxRunOf[p.groundKey]];
    if (run && run.gone <= 0) {
      run.heat += dt * 1.6;
      if (run.heat >= 1.4) {
        run.gone = 3.5;
        spark(s, p.x, p.y, "#ffe6b8", 10, 3);
        sfx("melt");
      }
    }
  }
  // Hanging cocoons drop a monster when Shuri passes under them.
  for (const sp of L.spawners) {
    if (sp.used) continue;
    if (Math.abs(p.x - sp.x) < 2.2 && p.y > sp.y && p.y - sp.y < 9) {
      sp.used = true;
      const e = spawnEnemy(s, "cocoon", sp.x, sp.y + 1);
      if (e) {
        e.vy = 2;
        e.dir = Math.sign(p.x - sp.x) || 1;
      }
      sfx("snap");
    }
  }
  // Steam vents launch Shuri upward in short bursts.
  for (const v of L.vents) {
    const on = (s.time + v.x * 0.13) % 2.6 < 0.9;
    v.on = on;
    if (on && Math.abs(p.x - v.x) < 0.8 && p.y <= v.y + 0.05 && p.y > v.y - 4.5) {
      p.vy = Math.min(p.vy, -17);
      p.jumpsUsed = 1;
    }
  }
  if (p.dead) return;
  for (const pk of L.pickups) {
    if (pk.taken) continue;
    if (Math.abs(pk.x - p.x) < 0.8 && pk.y - 1.2 < p.y && p.y - p.h < pk.y) {
      pk.taken = true;
      if (pk.type === "shard") {
        if (p.hp < p.maxHp) healPlayer(s, 1);
        else text(s, pk.x, pk.y - 1, "Penuh", "#ffd0d8");
        sfx("pickup");
      } else if (pk.type === "heal") {
        healPlayer(s, p.maxHp);
        sfx("pickup");
      } else {
        s.secrets++;
        text(s, pk.x, pk.y - 1, pk.type === "rune" ? "Rune!" : "Gulungan!", "#ffe27a", true);
        sfx("secret");
      }
    }
  }
  for (const c of L.checkpoints) {
    if (c.active) continue;
    if (Math.abs(c.x - p.x) < 1 && Math.abs(c.y - p.y) < 1.6) {
      for (const o of L.checkpoints) o.active = false;
      c.active = true;
      p.respawn = { x: c.x, y: c.y };
      s.checkpointIndex = L.checkpoints.indexOf(c);
      s.wantSave = true;
      healPlayer(s, p.maxHp);
      effect(s, "FX_COMBAT", 3, c.x, c.y - 0.8, 2.4, 0.6);
      sfx("checkpoint");
      text(s, c.x, c.y - 2, "Titik simpan", "#a9ffe8");
    }
  }
  for (const h of L.hints) {
    const near = Math.abs(h.x - p.x) < 1.6 && Math.abs(h.y - p.y) < 1.6;
    if (near && !h.shown) {
      h.shown = true;
      toast(s, AREAS[s.areaIndex].hint, 3.4);
    } else if (!near && Math.abs(h.x - p.x) > 5) h.shown = false;
  }
}

// Wall eyes blink open and closed; an open eye that sees Shuri charges and fires.
function updateEye(s, t, dt) {
  const p = s.player;
  t.eyeT += dt;
  const cycle = t.eyeT % 4.5;
  const wasOpen = t.open;
  t.open = cycle < 2.6;
  if (!wasOpen && t.open) t.aimT = 0;
  if (!t.open || p.dead) return;
  const dx = p.x - t.x;
  const dy = p.y - 0.8 - t.y;
  if (Math.abs(dx) < 8 && Math.abs(dy) < 4) {
    t.aimT += dt;
    if (t.aimT > 0.8) {
      t.aimT = -0.9;
      const l = Math.hypot(dx, dy) || 1;
      s.shots.push({ x: t.x, y: t.y, vx: (dx / l) * 13, vy: (dy / l) * 13, r: 0.28, color: "#ff2a2a", life: 1.4, dmg: 1, ghost: true });
      sfx("spit");
    }
  } else t.aimT = Math.max(0, t.aimT - dt);
}

export function hurtByToxic(s) {
  hurtPlayer(s, 1, s.player.x);
  s.player.vy = -15;
}
