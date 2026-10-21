// The skill button: one signature move per skin, from a single energy shot up
// to an eclipse that ends every monster on screen. Player projectiles (pshots)
// live here too: they cut each body once and may pierce or home in.
import { skinOf, damage, center, circleBox } from "./combat.js";
import { startDash } from "./player.js";
import { effect, spark, shake, text, toast } from "./fx.js";
import { sfx, haptic } from "./audio.js";

const VIEW_X = 14;
const VIEW_Y = 9;

function onScreen(s, e) {
  const p = s.player;
  return Math.abs(e.x - p.x) < VIEW_X && Math.abs(e.y - p.y) < VIEW_Y;
}

function liveFoes(s) {
  const list = s.enemies.filter((e) => !e.dead && onScreen(s, e));
  const b = s.boss;
  if (b && b.active && !b.dead) list.push(b);
  return list;
}

function shot(s, x, y, vx, vy, opts) {
  s.pshots.push({ id: ++s.nextId, x, y, vx, vy, r: 0.4, dmg: 2, life: 1.2, color: "#fff", pierce: true, hit: {}, ...opts });
}

export function castSkill(s) {
  const p = s.player;
  const sk = skinOf(s);
  if (p.dead || s.cleared || p.skillCd > 0) return false;
  p.skillCd = sk.skill.cd * (s.tune.skillCooldown || 1);
  p.skillT = 0.45;
  p.skillAnim = sk.skill.id;
  const cx = p.x;
  const cy = p.y - 0.8;
  const f = p.facing;
  sfx("skill");
  haptic(30);
  switch (sk.skill.id) {
    case "echo":
      shot(s, cx + f * 0.6, cy, f * 22, 0, { r: 0.55, dmg: 3, life: 0.9, color: "#5fffd6", beam: true });
      break;
    case "ashstep":
      startDash(s, true);
      effect(s, "FX_SKILLS_A", "ash_flame", cx, cy, 3, 0.5);
      break;
    case "feathers":
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        shot(s, cx, cy, Math.cos(a) * 16, Math.sin(a) * 16, { dmg: 2, life: 0.7, color: "#c9a8ff", feather: true, angle: a });
      }
      effect(s, "FX_SKILLS_A", "feather_storm", cx, cy, 4.5, 0.6);
      break;
    case "slam":
      for (const dir of [-1, 1]) shot(s, cx + dir * 0.6, p.y - 0.4, dir * 15, 0, { r: 0.75, dmg: 4, life: 0.8, color: "#ff4a3a", wave: true });
      effect(s, "FX_SKILLS_A", "oni_shock", cx, p.y - 0.8, 5, 0.5);
      shake(s, 0.6);
      sfx("slam");
      break;
    case "mist":
      p.mistT = 3;
      effect(s, "FX_SKILLS_A", "mist_veil", cx, cy, 3.4, 3, { follow: "player", loop: true, until: 3 });
      break;
    case "web": {
      for (const e of liveFoes(s)) {
        if (e === s.boss) e.slowT = 3;
        else e.rootT = 3;
        effect(s, "FX_SKILLS_B", "giant_web", e.x, e.y - e.h / 2, Math.max(2, e.h * 2), 0.6);
      }
      effect(s, "FX_SKILLS_B", "giant_web", cx, cy, 8, 0.7, { alpha: 0.7 });
      break;
    }
    case "harvest": {
      effect(s, "FX_SKILLS_B", "soul_scythe", cx + f * 1.2, cy, 6, 0.5, { flip: f < 0 });
      let killed = 0;
      for (const e of liveFoes(s)) {
        if (circleBox(cx + f * 1.2, cy, 3.6, e) && damage(s, e, 5, { color: "#f2ead8" })) killed++;
      }
      p.hp = Math.min(p.maxHp, p.hp + 1 + Math.floor(killed / 2));
      text(s, p.x, p.y - 2.2, "Panen Jiwa", "#f2ead8", true);
      break;
    }
    case "thunder": {
      const foes = liveFoes(s)
        .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);
      for (const { e } of foes) {
        const c = center(e);
        s.bolts.push({ x1: c.x + 0.3, y1: c.y - 9, x2: c.x, y2: c.y, life: 0.35, color: "#fff27a" });
        effect(s, "FX_SKILLS_B", "lightning_strike", c.x, c.y - 1.2, 4, 0.45);
        damage(s, e, e === s.boss ? 6 : 5, { color: "#fff27a" });
      }
      s.flash = 0.35;
      sfx("thunder");
      shake(s, 0.5);
      break;
    }
    case "foxfire":
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.32;
        shot(s, cx, cy - 0.4, Math.cos(a) * 9, Math.sin(a) * 9, { dmg: 2, life: 2.4, color: "#55b8ff", homing: true, pierce: false, fox: true });
      }
      effect(s, "FX_SKILLS_B", "foxfire", cx, cy, 3.4, 0.5);
      break;
    case "frenzy":
      p.frenzyT = 5;
      effect(s, "FX_SKILLS_C", "blood_frenzy", cx, cy, 3.4, 5, { follow: "player", loop: true, until: 5 });
      toast(s, "Pesta Darah!", 1.4);
      break;
    case "eclipse": {
      effect(s, "FX_SKILLS_C", "eclipse", cx, cy - 2, 9, 1.1);
      s.flash = 0.9;
      s.eclipseT = Math.max(s.eclipseT, 6);
      for (const e of liveFoes(s)) {
        if (e === s.boss) damage(s, e, (e.maxHp * 0.25) / sk.bossMult, { color: "#c58bff" });
        else damage(s, e, e.hp + 99, { color: "#c58bff" });
      }
      shake(s, 1);
      toast(s, "Gerhana!", 1.4);
      break;
    }
    default:
      break;
  }
  return true;
}

export function updatePlayerShots(s, dt) {
  const sk = skinOf(s);
  for (const b of s.pshots) {
    b.life -= dt;
    if (b.homing) {
      let best = null;
      let bd = 12;
      for (const e of liveFoes(s)) {
        const c = center(e);
        const d = Math.hypot(c.x - b.x, c.y - b.y);
        if (d < bd && !b.hit[e.id || "boss"]) {
          bd = d;
          best = c;
        }
      }
      if (best) {
        const dx = best.x - b.x;
        const dy = best.y - b.y;
        const l = Math.hypot(dx, dy) || 1;
        b.vx += ((dx / l) * 15 - b.vx) * Math.min(1, dt * 4);
        b.vy += ((dy / l) * 15 - b.vy) * Math.min(1, dt * 4);
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.fire && Math.random() < 0.3) spark(s, b.x, b.y, "#ff9a3a", 1, 2, 0.4, 0.1);
    for (const e of liveFoes(s)) {
      const id = e === s.boss ? "boss" : e.id;
      if (b.hit[id]) continue;
      if (!circleBox(b.x, b.y, b.r, e)) continue;
      b.hit[id] = true;
      const per = b.dmg * (s.player.frenzyT > 0 ? 2 : 1);
      damage(s, e, per, { color: b.color, x: b.x, y: b.y });
      if (sk.burn && e !== s.boss) e.burnT = 2.1;
      spark(s, b.x, b.y, b.color, 6, 5);
      if (!b.pierce) {
        b.life = 0;
        break;
      }
    }
  }
  s.pshots = s.pshots.filter((b) => b.life > 0);
}
