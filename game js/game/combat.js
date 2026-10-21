// Damage rules shared by Kuro, skills, enemies and bosses. The skin's numbers
// (hits per contact, damage, burn, slow, chain, life steal) are applied here
// and nowhere else.
import { SKINS } from "./skins.js";
import { ENEMIES } from "./bestiary.js";
import { PHYS } from "./config.js";
import { spark, text, effect, shake } from "./fx.js";
import { sfx, haptic } from "./audio.js";

export const skinOf = (s) => SKINS[s.skin];

export function center(e) {
  return { x: e.x, y: e.y - e.h / 2 };
}

export function boxHit(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - a.h / 2 - (b.y - b.h / 2)) * 2 < a.h + b.h;
}

export function circleBox(cx, cy, r, e) {
  const nx = Math.max(e.x - e.w / 2, Math.min(cx, e.x + e.w / 2));
  const ny = Math.max(e.y - e.h, Math.min(cy, e.y));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

export function healPlayer(s, n) {
  const p = s.player;
  if (p.dead || p.hp >= p.maxHp) return;
  p.hp = Math.min(p.maxHp, p.hp + n);
  effect(s, "FX_WORLD", 2, p.x, p.y - 1, 2.2, 0.6, { follow: "player" });
  text(s, p.x, p.y - 2, `+${n} ♥`, "#ff6b8a");
}

export function hurtPlayer(s, dmg, fromX) {
  const p = s.player;
  if (p.dead || p.invT > 0 || p.mistT > 0 || s.cleared) return false;
  if (p.dashT > 0 && skinOf(s).dashPhase) return false;
  p.hp -= dmg;
  p.invT = PHYS.invuln;
  p.hurtT = 0.32;
  p.dashT = 0;
  p.pull = null;
  const dir = Math.sign(p.x - fromX) || -p.facing;
  p.vx = dir * 8;
  p.vy = -8;
  spark(s, p.x, p.y - 0.8, "#ff3b5c", 10, 6);
  shake(s, 0.35);
  sfx("hurt");
  haptic(40);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.deadT = 1.4;
    p.vx = 0;
    sfx("death");
  }
  return true;
}

// Apply raw damage to an enemy or the boss. Returns true when it died.
export function damage(s, e, amount, opts = {}) {
  if (!e || e.dead || amount <= 0) return false;
  const isBoss = e === s.boss;
  if (isBoss) {
    if (!e.active || e.intro > 0) return false;
    if (e.strings && e.strings.some((st) => !st.cut)) {
      spark(s, opts.x ?? e.x, opts.y ?? e.y - e.h / 2, "#ffffff", 4, 4);
      text(s, e.x, e.y - e.h - 0.3, "KEBAL", "#ff9a9a");
      sfx("clang");
      return false;
    }
    amount *= skinOf(s).bossMult;
  }
  amount = Math.round(amount * 10) / 10;
  e.hp -= amount;
  e.flash = 0.12;
  if (!isBoss) {
    e.hurtT = 0.22;
    if (opts.knock) e.vx = opts.knock;
  }
  const cx = opts.x ?? e.x;
  const cy = opts.y ?? e.y - e.h / 2;
  const label = opts.hits > 1 ? `${amount / opts.hits}×${opts.hits}` : `${amount}`;
  text(s, cx, cy - 0.4, label, opts.color || "#ffe9b0", opts.hits > 1);
  if (e.hp <= 0) {
    e.hp = 0;
    if (isBoss) {
      bossDefeated(s);
    } else {
      killEnemy(s, e);
    }
    return true;
  }
  return false;
}

export function killEnemy(s, e) {
  e.dead = true;
  e.deadT = 0;
  e.vx = 0;
  s.player.kills++;
  effect(s, "FX_WORLD", 3, e.x, e.y - e.h / 2, Math.max(1.6, e.h * 1.6), 0.5);
  sfx("enemyDie");
  const sk = skinOf(s);
  if (sk.killHeal && s.player.kills % sk.killHeal === 0) healPlayer(s, 1);
  const d = ENEMIES[e.type];
  if (d?.split && !e.small) s.pendingSplits.push({ x: e.x, y: e.y, type: d.splitInto || e.type });
  // Occasional heart shard so long fights stay forgiving.
  if (Math.random() < 0.1) s.level.pickups.push({ id: ++s.nextId, x: e.x, y: e.y, type: "shard", taken: false, drop: true });
}

function bossDefeated(s) {
  const b = s.boss;
  b.dead = true;
  b.deadT = 0;
  b.active = false;
  s.bossDone = true;
  s.shots = [];
  effect(s, "FX_WORLD", 3, b.x, b.y - b.h / 2, b.h * 2.2, 1.2);
  effect(s, "FX_WORLD", 1, b.x, b.y - b.h / 2, b.h * 1.8, 0.9);
  shake(s, 1);
  s.flash = 1;
  sfx("bossDie");
  haptic(120);
  healPlayer(s, s.player.maxHp);
}

// One Kuro contact: the skin decides how many times it lands and what rides on it.
export function kuroStrike(s, k, e) {
  const sk = skinOf(s);
  const p = s.player;
  const isBoss = e === s.boss;
  // Shields block a Kuro flying into their face unless the skin pierces.
  if (!isBoss && ENEMIES[e.type]?.shield && !sk.pierce && !e.dead) {
    const facing = e.dir;
    if (Math.sign(k.vx) === -facing && Math.abs(k.vx) > 2) {
      spark(s, k.x, k.y, "#dfe8ff", 6, 5);
      text(s, e.x, e.y - e.h - 0.2, "Tameng!", "#cfe3ff");
      sfx("clang");
      return "blocked";
    }
  }
  let per = sk.dmg + (k.charged ? 1 : 0);
  if (p.frenzyT > 0) per *= 2;
  const hits = sk.hits;
  const killed = damage(s, e, per * hits, { hits, x: k.x, y: k.y, color: sk.color, knock: Math.sign(k.vx || 1) * 3 });
  sfx("hit");
  for (let i = 0; i < hits; i++) effect(s, "FX_COMBAT", 0, k.x + (Math.random() - 0.5) * 0.6, k.y + (Math.random() - 0.5) * 0.6, 1.4, 0.3);
  spark(s, k.x, k.y, sk.color, 4 + hits * 3, 7);
  if (hits > 1) shake(s, 0.12 * hits);
  if (!isBoss && !killed) {
    if (sk.burn) e.burnT = 2.1;
    if (sk.slow) e.slowT = 2.5;
  }
  if (sk.slow && isBoss) e.slowT = 1.5;
  p.hits++;
  if (sk.hitHeal && p.hits % sk.hitHeal === 0) healPlayer(s, 1);
  if (p.frenzyT > 0 && p.hits % 3 === 0) healPlayer(s, 1);
  if (sk.chain) chainLightning(s, e, per * hits);
  return killed ? "killed" : "hit";
}

function chainLightning(s, from, amount) {
  const sk = skinOf(s);
  const c0 = center(from);
  const pool = s.enemies
    .filter((o) => o !== from && !o.dead)
    .map((o) => ({ o, d: Math.hypot(o.x - c0.x, o.y - o.h / 2 - c0.y) }))
    .filter((q) => q.d < 6.5)
    .sort((a, b) => a.d - b.d)
    .slice(0, sk.chain);
  let prev = c0;
  for (const { o } of pool) {
    const c = center(o);
    s.bolts.push({ x1: prev.x, y1: prev.y, x2: c.x, y2: c.y, life: 0.25, color: "#fff27a" });
    damage(s, o, amount * 0.6, { color: "#fff27a" });
    prev = c;
  }
}
