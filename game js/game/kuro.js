// Kuro, the living shuriken: flies out, cuts on the way and on the way back,
// lodges in anchors, lights targets, and is caught for a Perfect Catch.
import { KURO } from "./config.js";
import { tileType, tileChar, SOLID, key } from "./world.js";
import { circleBox, kuroStrike, skinOf } from "./combat.js";
import { lightTarget } from "./level.js";
import { spark, effect, text, toast } from "./fx.js";
import { sfx, haptic } from "./audio.js";

const handPoint = (p) => ({ x: p.x + p.facing * 0.25, y: p.y - 0.95 });

export function kuroOut(s) {
  return s.kuros.length > 0;
}

// Aim: mouse cursor, then joystick direction, then auto-aim at the nearest
// thing worth hitting in front, then straight ahead.
function aimDir(s) {
  const p = s.player;
  const h = handPoint(p);
  const inp = s.input;
  if (inp.aim) {
    const dx = inp.aim.x - h.x;
    const dy = inp.aim.y - h.y;
    const l = Math.hypot(dx, dy);
    if (l > 0.3) return { x: dx / l, y: dy / l };
  }
  if (Math.hypot(inp.ax, inp.ay) > 0.45) {
    const l = Math.hypot(inp.ax, inp.ay);
    return { x: inp.ax / l, y: inp.ay / l };
  }
  const range = s.tune.kuroRange || KURO.range;
  let best = null;
  let bestScore = 1e9;
  const consider = (x, y, weight) => {
    const dx = x - h.x;
    const dy = y - h.y;
    const d = Math.hypot(dx, dy);
    if (d > range * 0.95 || d < 0.4) return;
    if (dx * p.facing < -0.3) return;
    if (Math.abs(dy) > 7) return;
    const score = d * weight;
    if (score < bestScore) {
      bestScore = score;
      best = { x: dx / d, y: dy / d };
    }
  };
  for (const e of s.enemies) if (!e.dead) consider(e.x, e.y - e.h / 2, 1);
  if (s.boss && s.boss.active && !s.boss.dead) consider(s.boss.x, s.boss.y - s.boss.h / 2, 0.8);
  for (const t of s.level.targets) if (!t.lit && (!t.weak || (s.boss && s.boss.active))) consider(t.x, t.y, 1.25);
  if (best) return best;
  return { x: p.facing, y: 0 };
}

export function throwKuro(s) {
  const p = s.player;
  const sk = skinOf(s);
  const dir = aimDir(s);
  if (Math.abs(dir.x) > 0.2) p.facing = Math.sign(dir.x);
  const h = handPoint(p);
  const speed = KURO.speed * (s.tune.kuroSpeed || 1);
  const range = s.tune.kuroRange || KURO.range;
  const spreads = sk.kuroCount === 3 ? [-0.24, 0, 0.24] : [0];
  const base = Math.atan2(dir.y, dir.x);
  for (const off of spreads) {
    const a = base + off;
    s.kuros.push({
      id: ++s.nextId,
      x: h.x,
      y: h.y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      mode: "out",
      t: 0,
      maxT: range / speed,
      pass: 1,
      hit: {},
      charged: p.charged,
      main: off === 0,
      spin: 0,
      anchor: null,
      retT: 0,
    });
  }
  p.charged = false;
  p.throwT = 0.26;
  sfx("throw");
  haptic(8);
}

export function recallKuros(s) {
  for (const k of s.kuros) {
    if (k.mode !== "return") {
      k.mode = "return";
      k.pass = 2;
      k.retT = 0;
      k.anchor = null;
    }
  }
  s.player.recallT = 0.22;
  sfx("recall");
}

// Throw button: throw → recall → (close enough) Perfect Catch.
export function pressThrow(s) {
  const p = s.player;
  if (p.dead) return;
  if (!kuroOut(s)) {
    throwKuro(s);
    return;
  }
  const h = handPoint(p);
  const anyOut = s.kuros.some((k) => k.mode !== "return");
  if (anyOut) {
    recallKuros(s);
    return;
  }
  const near = s.kuros.filter((k) => Math.hypot(k.x - h.x, k.y - h.y) < KURO.perfectRadius);
  if (near.length) {
    for (const k of near) catchKuro(s, k, true);
    s.kuros = s.kuros.filter((k) => !k.caught);
  }
}

function catchKuro(s, k, perfect) {
  const p = s.player;
  k.caught = true;
  p.catchT = 0.2;
  if (perfect && !p.charged) {
    p.charged = true;
    p.skillCd = Math.max(0, p.skillCd - 1.5);
    effect(s, "FX_COMBAT", 1, p.x, p.y - 1, 2.2, 0.4);
    text(s, p.x, p.y - 2.2, "Tangkap Sempurna!", "#ffe27a", true);
    sfx("perfect");
    haptic(18);
  } else {
    sfx("catch");
  }
}

// Anchor Pull: jump or dash while Kuro sits in an anchor flies Shuri to it.
export function tryAnchorPull(s) {
  const k = s.kuros.find((q) => q.mode === "anchored");
  if (!k) return false;
  const p = s.player;
  p.pull = { x: k.x, y: k.y + 1.0 };
  p.dashT = 0;
  k.mode = "held";
  sfx("pull");
  return true;
}

export function updateKuros(s, dt) {
  const p = s.player;
  const sk = skinOf(s);
  const L = s.level;
  const h = handPoint(p);
  for (const k of s.kuros) {
    k.t += dt;
    k.spin += dt * 22;
    if (k.mode === "out") {
      const nx = k.x + k.vx * dt;
      const ny = k.y + k.vy * dt;
      const tx = Math.floor(nx);
      const ty = Math.floor(ny);
      const ch = tileChar(s, tx, ty);
      if ((ch === "D" || ch === "b") && !L.broken[key(tx, ty)]) {
        hitBreakable(s, tx, ty, ch);
        if (!sk.pierce) {
          k.mode = "return";
          k.pass = 2;
        }
      } else if (ch === ":" && !L.webCut[key(tx, ty)]) {
        cutWeb(s, tx, ty);
      }
      if (k.mode === "out" && tileType(s, tx, ty) === SOLID && !sk.wallPass && !sk.pierce) {
        spark(s, k.x, k.y, "#d8d8d8", 5, 4);
        sfx("clink");
        k.mode = "return";
        k.pass = 2;
      } else {
        k.x = nx;
        k.y = ny;
      }
      if (k.t >= k.maxT && k.mode === "out") {
        k.mode = "return";
        k.pass = 2;
      }
      if (k.main && k.mode === "out") {
        for (const a of L.anchors) {
          if (Math.hypot(a.x - k.x, a.y - k.y) < 1.1) {
            k.mode = "anchored";
            k.x = a.x;
            k.y = a.y;
            k.anchor = a.id;
            spark(s, a.x, a.y, "#7fffe0", 8, 4);
            sfx("anchor");
            text(s, a.x, a.y - 1, "Lompat!", "#7fffe0");
            break;
          }
        }
      }
    } else if (k.mode === "anchored" || k.mode === "held") {
      // Sits in the anchor until recalled or pulled.
    } else if (k.mode === "return") {
      k.retT += dt;
      const dx = h.x - k.x;
      const dy = h.y - k.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.min(KURO.returnMax, KURO.returnSpeed + k.retT * 26);
      k.vx = (dx / d) * sp;
      k.vy = (dy / d) * sp;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (d < KURO.catchRadius || k.retT > 3) catchKuro(s, k, false);
    }
    if (k.mode === "out" || k.mode === "return") {
      // Cut monsters and the boss; each pass hits a body once.
      for (const e of s.enemies) {
        if (e.dead || k.hit[e.id] === k.pass) continue;
        if (circleBox(k.x, k.y, KURO.radius, e)) {
          k.hit[e.id] = k.pass;
          const r = kuroStrike(s, k, e);
          if (r === "blocked" && k.mode === "out") {
            k.mode = "return";
            k.pass = 2;
            k.hit[e.id] = 2;
          }
        }
      }
      const b = s.boss;
      if (b && b.active && !b.dead && k.hit.boss !== k.pass) {
        if (b.strings) {
          for (const st of b.strings) {
            if (!st.cut && Math.hypot(st.x - k.x, st.y - k.y) < 0.9) {
              st.cut = true;
              spark(s, st.x, st.y, "#ff5050", 10, 5);
              sfx("snap");
              const left = b.strings.filter((q) => !q.cut).length;
              text(s, st.x, st.y - 0.6, left ? `${left} benang lagi` : "Dalang terbuka!", "#ff9a9a", !left);
              if (!left) b.exposed = 8;
            }
          }
        }
        if (circleBox(k.x, k.y, KURO.radius + 0.15, b)) {
          k.hit.boss = k.pass;
          kuroStrike(s, k, b);
        }
      }
      for (const t of L.targets) {
        if (t.lit || Math.hypot(t.x - k.x, t.y - k.y) > 1.05) continue;
        if (t.weak && !(s.boss && s.boss.active)) continue;
        if (t.kind === "eye" && !t.open) continue;
        lightTarget(s, t);
      }
    }
  }
  if (p.pull) {
    const held = s.kuros.find((q) => q.mode === "held");
    if (!held) p.pull = null;
  }
  s.kuros = s.kuros.filter((k) => !k.caught);
}

export function finishPull(s) {
  const k = s.kuros.find((q) => q.mode === "held");
  if (k) k.caught = true;
  s.kuros = s.kuros.filter((q) => !q.caught);
}

function hitBreakable(s, x, y, ch) {
  const L = s.level;
  const id = key(x, y);
  L.crack[id] = (L.crack[id] || 0) + 1;
  spark(s, x + 0.5, y + 0.5, "#c9b8a0", 6, 4);
  sfx("clink");
  const need = ch === "b" ? 2 : 3;
  if (L.crack[id] >= need) {
    // Break the whole run of this glyph so a door opens in one piece.
    const row = L.grid[y];
    let x0 = x;
    let x1 = x;
    while (x0 > 0 && row[x0 - 1] === ch && !L.broken[key(x0 - 1, y)]) x0--;
    while (x1 < row.length - 1 && row[x1 + 1] === ch && !L.broken[key(x1 + 1, y)]) x1++;
    if (ch === "b") {
      x0 = x;
      x1 = x;
    }
    for (let xx = x0; xx <= x1; xx++) L.broken[key(xx, y)] = true;
    effect(s, "FX_WORLD", 3, x + 0.5, y + 0.5, 2, 0.5);
    sfx("break");
    if (ch === "b" && Math.random() < 0.5) L.pickups.push({ id: ++s.nextId, x: x + 0.5, y: y + 1, type: "shard", taken: false });
    if (ch === "D") toast(s, "Pintu retak hancur!");
  }
}

function cutWeb(s, x, y) {
  const L = s.level;
  // Cut a 3×3 patch so one throw clears a path through the web.
  for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (tileChar(s, xx, yy) === ":") L.webCut[key(xx, yy)] = true;
  spark(s, x + 0.5, y + 0.5, "#f4f0ff", 8, 3);
  sfx("snap");
}
