// Boss fights. Every boss shares one attack grammar read from its sheet rows —
// idle, lunge, slam, shoot — and a few carry a twist: Jantung Raksasa never
// moves, Sang Dalang hides behind four strings, Shuri Bayangan blinks behind
// you, and Yomi changes phase twice.
import { BOSSES } from "./bestiary.js";
import { AREAS } from "./areas.js";
import { PHYS, ORIGINAL_X } from "./config.js";
import { moveBody } from "./world.js";
import { boxHit, hurtPlayer } from "./combat.js";
import { spawnEnemy } from "./enemies.js";
import { spark, effect, shake, toast, text } from "./fx.js";
import { sfx, haptic } from "./audio.js";

export function createBoss(s) {
  const area = AREAS[s.areaIndex];
  const sp = s.level.bossSpawn;
  if (!area.boss || !sp) return null;
  const d = BOSSES[area.boss];
  const hp = Math.round(d.hp * (s.tune.bossHp || 1));
  const twin = !!d.twin;
  const b = {
    type: area.boss,
    name: d.name,
    x: sp.x,
    y: d.still ? 13.4 : d.fly ? 9 : sp.y,
    w: twin ? 0.8 : d.size * 0.5,
    h: twin ? 1.5 : d.size * 0.6,
    size: d.size,
    fly: !!d.fly,
    still: !!d.still,
    twin,
    hp,
    maxHp: hp,
    active: false,
    dead: false,
    deadT: 0,
    intro: 0,
    state: "idle",
    t: 0,
    dir: -1,
    vx: 0,
    vy: 0,
    onGround: false,
    stun: 0,
    flash: 0,
    slowT: 0,
    cd: 1.4,
    phase: 1,
    strings: d.strings ? makeStrings() : null,
    exposed: 0,
    homeX: sp.x,
    homeY: d.still ? 13.4 : d.fly ? 9 : sp.y,
    aimX: 0,
    aimY: 0,
    landed: false,
  };
  return b;
}

function makeStrings() {
  return [-1.5, -0.5, 0.5, 1.5].map((o) => ({ o, cut: false, x: 0, y: 0 }));
}

export function arenaBounds(s) {
  const g = s.level.gates;
  return g ? { x0: g.x0 + 1.2, x1: g.x1 - 0.2 } : { x0: ORIGINAL_X + 1.5, x1: ORIGINAL_X + 58.5 };
}

export function maybeStartFight(s) {
  const b = s.boss;
  const p = s.player;
  if (!b || b.active || b.dead || s.bossDone || p.dead) return;
  if (p.y > 15.05 || !p.onGround) return;
  const g = s.level.gates;
  if (g && (p.x < g.x0 + 1.4 || p.x > g.x1 - 0.4)) return;
  b.active = true;
  b.intro = 1.5;
  b.state = "idle";
  b.t = 0;
  b.cd = 1.2;
  toast(s, b.name, 2.2);
  sfx("roar");
  shake(s, 0.7);
  haptic(80);
}

export function resetBoss(s) {
  const fresh = createBoss(s);
  if (fresh) s.boss = fresh;
}

function pickAttack(s, b) {
  if (b.still) return ["lunge", "slam", "shoot"][Math.floor(Math.random() * 3)];
  const r = Math.random();
  if (b.twin) return r < 0.35 ? "shoot" : r < 0.65 ? "lunge" : "slam";
  return r < 0.34 ? "lunge" : r < 0.62 ? "slam" : "shoot";
}

function fire(s, b, count, speed, opts = {}) {
  const p = s.player;
  const d = BOSSES[b.type];
  const cx = b.x + b.dir * b.w * 0.4;
  const cy = b.y - b.h * 0.65;
  const base = Math.atan2(p.y - 0.8 - cy, p.x - cx);
  const spread = opts.spread ?? 0.22;
  for (let i = 0; i < count; i++) {
    const a = opts.radial ? (i / count) * Math.PI * 2 : base + (i - (count - 1) / 2) * spread;
    s.shots.push({ x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 0.36, color: d.shot, life: 3.2, dmg: 1, ghost: !!opts.ghost, grav: opts.grav || 0, big: true });
  }
  sfx("bossShot");
}

function shockwave(s, b) {
  const d = BOSSES[b.type];
  for (const dir of [-1, 1]) {
    s.shots.push({ x: b.x + dir * b.w * 0.5, y: b.y - 0.35, vx: dir * 11, vy: 0, r: 0.42, color: d.shot, life: 1.6, dmg: 1, ghost: true, wave: true });
  }
  effect(s, "FX_SKILLS_A", "oni_shock", b.x, b.y - 0.8, Math.max(3, b.size * 0.8), 0.45);
  shake(s, 0.6);
  sfx("slam");
}

export function updateBoss(s, dt) {
  const b = s.boss;
  if (!b) return;
  b.flash = Math.max(0, b.flash - dt);
  if (b.dead) {
    b.deadT += dt;
    return;
  }
  if (!b.active) return;
  const p = s.player;
  const d = BOSSES[b.type];
  const A = arenaBounds(s);
  b.t += dt;
  b.slowT = Math.max(0, b.slowT - dt);
  if (b.strings) {
    b.strings.forEach((st) => {
      st.x = b.x + st.o * b.size * 0.22;
      st.y = b.y - b.h - 0.6 - Math.abs(st.o) * 0.3;
    });
    if (b.exposed > 0) {
      b.exposed -= dt;
      if (b.exposed <= 0) {
        b.strings = makeStrings();
        text(s, b.x, b.y - b.h - 1, "Benang tumbuh lagi!", "#ff9a9a");
      }
    }
  }
  if (b.intro > 0) {
    b.intro -= dt;
    return;
  }
  // Yomi grows angrier at two thirds and one third.
  if (d.phases) {
    const want = b.hp < b.maxHp * 0.34 ? 3 : b.hp < b.maxHp * 0.67 ? 2 : 1;
    if (want > b.phase) {
      b.phase = want;
      toast(s, want === 2 ? "Yomi memanggil bayangan!" : "Yomi mengamuk!", 2);
      sfx("roar");
      shake(s, 0.8);
      for (const off of [-4, 4]) spawnEnemy(s, "void_shard", Math.max(A.x0 + 1, Math.min(A.x1 - 1, b.x + off)), 10);
    }
  }
  if (b.stun > 0) {
    b.stun -= dt;
    b.vx = 0;
    if (b.fly) b.vy = 0;
    physics(s, b, dt, A);
    return;
  }
  const angry = (b.hp < b.maxHp * 0.5 ? 1.25 : 1) * (b.phase === 3 ? 1.2 : 1) * (b.slowT > 0 ? 0.55 : 1);
  const toP = p.x - b.x;
  // The upper floor's surface: every arena stands on row 15.
  const floorY = 15;
  if (b.state === "idle") {
    if (!b.still) b.dir = Math.sign(toP) || b.dir;
    if (b.fly && !b.still) {
      const tx = Math.max(A.x0 + 2, Math.min(A.x1 - 2, p.x - Math.sign(toP || 1) * 4));
      const ty = floorY - 6 + Math.sin(s.time * 1.6) * 0.8;
      b.vx += ((tx - b.x) * 1.6 - b.vx) * Math.min(1, dt * 2);
      b.vy += ((ty - b.y) * 1.6 - b.vy) * Math.min(1, dt * 2);
    } else if (!b.still) {
      b.vx = Math.abs(toP) > 3 ? b.dir * d.speed * 0.35 * angry : 0;
    }
    if (b.t > b.cd / angry) {
      b.state = pickAttack(s, b);
      b.t = 0;
      b.landed = false;
      b.aimX = p.x;
      b.aimY = p.y - 0.8;
      if (b.twin && b.state === "slam") {
        // Shuri Bayangan blinks behind you.
        effect(s, "FX_WORLD", 3, b.x, b.y - 0.8, 2.4, 0.4);
        b.x = Math.max(A.x0 + 1, Math.min(A.x1 - 1, p.x - p.facing * 2.6));
        b.y = floorY;
        b.vx = 0;
        b.vy = 0;
        b.dir = Math.sign(p.x - b.x) || 1;
        effect(s, "FX_WORLD", 3, b.x, b.y - 0.8, 2.4, 0.4);
        sfx("blink");
      }
    }
  } else if (b.state === "lunge") {
    const wind = b.twin ? 0.25 : 0.55;
    if (b.t < wind) {
      b.vx *= 0.8;
      if (b.fly) b.vy *= 0.8;
    } else if (b.still) {
      if (!b.landed) {
        b.landed = true;
        fire(s, b, 1, 16, { spread: 0 });
        fire(s, b, 2, 12, { spread: 0.18 });
      }
      if (b.t > 1.1) endAttack(b);
    } else if (b.fly) {
      if (!b.landed) {
        b.landed = true;
        const dx = b.aimX - b.x;
        const dy = b.aimY - (b.y - b.h / 2);
        const l = Math.hypot(dx, dy) || 1;
        b.vx = (dx / l) * 15 * angry;
        b.vy = (dy / l) * 15 * angry;
        sfx("whoosh");
      }
      if (b.t > wind + 0.75) endAttack(b);
    } else {
      b.vx = b.dir * d.speed * (b.twin ? 2.6 : 2.2) * angry;
      if (b.t > wind + 0.8) endAttack(b);
    }
  } else if (b.state === "slam") {
    if (b.still) {
      if (b.t > 0.6 && !b.landed) {
        b.landed = true;
        fire(s, b, b.phase === 3 ? 16 : 12, 7.5, { radial: true, ghost: true });
        shake(s, 0.5);
      }
      if (b.t > 1.2) endAttack(b);
    } else if (b.fly) {
      if (b.t < 0.5) {
        b.vx = (b.aimX - b.x) * 2;
        b.vy = (floorY - 8 - b.y) * 3;
      } else if (!b.landed) {
        b.vy = 24;
        b.vx = 0;
        if (b.y >= floorY - 0.05) {
          b.y = floorY;
          b.landed = true;
          shockwave(s, b);
        }
      } else {
        b.vy = -6;
        if (b.t > 1.6) endAttack(b);
      }
    } else if (b.twin) {
      // After the blink: a fast kick.
      if (b.t > 0.2 && !b.landed) {
        b.landed = true;
        b.vx = b.dir * 13;
      }
      if (b.t > 0.65) endAttack(b);
    } else {
      if (b.t > 0.35 && !b.landed && b.onGround && b.vy >= 0 && !b.jumped) {
        b.vy = -17;
        b.vx = Math.max(-9, Math.min(9, (b.aimX - b.x) * 1.1));
        b.jumped = true;
      } else if (b.jumped && b.onGround && !b.landed) {
        b.landed = true;
        b.vx = 0;
        shockwave(s, b);
      }
      if (b.landed && b.t > 1.4) {
        b.jumped = false;
        endAttack(b);
      }
      if (b.t > 3) {
        b.jumped = false;
        endAttack(b);
      }
    }
  } else if (b.state === "shoot") {
    if (!b.fly) b.vx = 0;
    else {
      b.vx *= 0.9;
      b.vy *= 0.9;
    }
    if (b.t > 0.6 && !b.landed) {
      b.landed = true;
      const n = (b.hp < b.maxHp * 0.5 ? 5 : 3) + (b.phase === 3 ? 2 : 0);
      if (b.twin) {
        // A shadow Kuro that flies out and comes back.
        fire(s, b, 1, 15, { spread: 0, ghost: true });
        s.shots[s.shots.length - 1].boomerang = 0.55;
      } else if (b.still) {
        fire(s, b, n, 9, { spread: 0.35, grav: 9 });
      } else fire(s, b, n, 9 * angry, { spread: 0.2 });
    }
    if (b.t > 1.2) endAttack(b);
  }
  physics(s, b, dt, A);
  if (!p.dead && boxHit(b, p)) hurtPlayer(s, 1, b.x);
}

function endAttack(b) {
  b.state = "idle";
  b.t = 0;
  b.cd = 0.9 + Math.random() * 0.8;
  b.landed = false;
}

function physics(s, b, dt, A) {
  if (b.still) {
    b.vx = 0;
    b.vy = 0;
    b.y = b.homeY + Math.sin(s.time * 2.4) * 0.25;
    return;
  }
  if (b.fly) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.y = Math.max(b.h + 1.2, Math.min(15, b.y));
  } else {
    b.vy = Math.min(PHYS.maxFall, b.vy + PHYS.gravity * dt);
    moveBody(s, b, dt);
  }
  b.x = Math.max(A.x0 + b.w / 2, Math.min(A.x1 - b.w / 2, b.x));
}

// Boomerang shots (Shuri Bayangan's shadow Kuro) turn around mid-flight.
export function updateBoomerangs(s, dt) {
  for (const sh of s.shots) {
    if (sh.boomerang === undefined) continue;
    sh.boomerang -= dt;
    if (sh.boomerang <= 0 && !sh.turned) {
      sh.turned = true;
      sh.vx *= -1;
      sh.vy *= -1;
      sh.life = 1.2;
      spark(s, sh.x, sh.y, "#b06bff", 6, 3);
    }
  }
}
