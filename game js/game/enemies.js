// Monster behaviour: walkers lunge, hoppers leap, shooters spit, flyers swoop.
import { ENEMIES, OLD_SKY } from "./bestiary.js";
import { AREAS } from "./areas.js";
import { COLS, PHYS } from "./config.js";
import { moveBody, tileType, groundAhead, SOLID, isSolidAt } from "./world.js";
import { boxHit, hurtPlayer, damage } from "./combat.js";
import { spark } from "./fx.js";
import { sfx } from "./audio.js";

export function enemyHpScale(s) {
  const i = s.areaIndex;
  const tier = i < 10 ? 1 + i * 0.08 : 1.2 + (i - 10) * 0.12;
  return tier * (s.tune.enemyHp || 1);
}

export function spawnEnemy(s, type, x, y, opts = {}) {
  const d = ENEMIES[type];
  if (!d) return null;
  const scale = opts.scale || 1;
  const oldInShadow = s.areaIndex >= 10 && OLD_SKY.has(type) ? 2 : 1;
  const hp = Math.max(1, Math.round((opts.hp || d.hp) * enemyHpScale(s) * oldInShadow));
  const e = {
    id: ++s.nextId,
    type,
    x,
    y,
    w: d.w * scale,
    h: d.h * scale,
    vx: 0,
    vy: 0,
    dir: -1,
    hp,
    maxHp: hp,
    state: "move",
    t: Math.random(),
    atkCd: 1 + Math.random() * 1.5,
    hurtT: 0,
    flash: 0,
    slowT: 0,
    rootT: 0,
    burnT: 0,
    burnTick: 0,
    dead: false,
    deadT: 0,
    homeX: x,
    homeY: y,
    onGround: false,
    scale,
    small: !!opts.small,
    phase: Math.random() * 6.28,
  };
  s.enemies.push(e);
  return e;
}

function shoot(s, e, d, tx, ty) {
  const cx = e.x + e.dir * e.w * 0.4;
  const cy = e.y - e.h * 0.6;
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  const speed = d.tongue ? 16 : d.ai === "flyer" ? 9 : 10;
  if (d.drop) {
    // Storm clouds drop a bolt straight down.
    s.shots.push({ x: e.x, y: e.y, vx: 0, vy: 14, r: 0.3, color: d.shot, life: 1.6, dmg: 1, ghost: true, bolt: true });
    sfx("spit");
    return;
  }
  s.shots.push({ x: cx, y: cy, vx: (dx / len) * speed, vy: (dy / len) * speed, r: d.tongue ? 0.3 : 0.25, color: d.shot || "#ff5a5a", life: d.tongue ? 0.32 : 2.6, dmg: 1, tongue: !!d.tongue, ox: cx, oy: cy });
  sfx("spit");
}

// Candles and dead stars light a fuse when close, then burst.
function fuse(s, e) {
  const p = s.player;
  const dist = Math.hypot(p.x - e.x, p.y - 0.7 - (e.y - e.h / 2));
  if (e.state !== "fuse" && dist < 1.9 && !p.dead) {
    e.state = "fuse";
    e.t = 0;
  }
  if (e.state !== "fuse") return false;
  e.vx *= 0.8;
  e.vy = e.vy * 0.8;
  e.flash = Math.sin(e.t * 30) > 0 ? 0.1 : 0;
  if (e.t > 0.65) {
    spark(s, e.x, e.y - e.h / 2, "#ffb347", 18, 9);
    if (Math.hypot(p.x - e.x, p.y - 0.7 - (e.y - e.h / 2)) < 2.4) hurtPlayer(s, 1, e.x);
    damage(s, e, e.hp + 1, { color: "#ffb347" });
    sfx("slam");
  }
  return true;
}

// Shadow witches step through shadow to a spot beside Shuri before casting.
function blinkNear(s, e) {
  const p = s.player;
  for (const side of [-1, 1]) {
    const nx = p.x + side * (4 + Math.random() * 2);
    if (nx < 2 || nx > COLS - 2) continue;
    if (groundAhead(s, nx, p.y) && !isSolidAt(s, nx, p.y - 0.5) && !isSolidAt(s, nx, p.y - 1.5)) {
      spark(s, e.x, e.y - e.h / 2, "#c58bff", 10, 4);
      e.x = nx;
      e.y = p.y;
      e.vy = 0;
      e.dir = Math.sign(p.x - nx) || 1;
      spark(s, e.x, e.y - e.h / 2, "#c58bff", 10, 4);
      sfx("blink");
      return;
    }
  }
}

function walker(s, e, d, dt, spd) {
  const p = s.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  if (e.state === "move") {
    let v = spd;
    if (d.jerky) v *= Math.sin(s.time * 8 + e.phase) > 0 ? 1.7 : 0.15;
    e.vx = e.dir * v;
    const ax = e.x + e.dir * (e.w / 2 + 0.15);
    if (e.onGround && (!groundAhead(s, ax, e.y) || isSolidAt(s, ax, e.y - 0.5))) {
      e.dir *= -1;
      e.vx = 0;
    }
    if (!p.dead && Math.abs(dx) < 4.5 && Math.abs(dy) < 1.8 && e.atkCd <= 0 && e.onGround) {
      e.dir = Math.sign(dx) || e.dir;
      e.state = "wind";
      e.t = 0;
    }
  } else if (e.state === "wind") {
    e.vx = 0;
    if (e.t > 0.42) {
      e.state = "lunge";
      e.t = 0;
      e.vx = e.dir * Math.max(6.5, spd * 3.2);
      e.vy = -4;
    }
  } else if (e.state === "lunge") {
    if (e.t > 0.42) {
      e.state = "move";
      e.atkCd = 1.5 + Math.random();
    }
  }
}

function hopper(s, e, d, dt, spd) {
  const p = s.player;
  if (e.onGround) {
    e.vx *= Math.max(0, 1 - dt * 10);
    e.state = "move";
    if (e.t > 0.85) {
      const near = Math.abs(p.x - e.x) < 9 && Math.abs(p.y - e.y) < 4 && !p.dead;
      e.dir = near ? Math.sign(p.x - e.x) || e.dir : Math.random() < 0.5 ? -1 : 1;
      e.vy = -(d.hopV || 11);
      e.vx = e.dir * spd * 1.5;
      e.t = 0;
      e.state = "lunge";
    }
  }
}

function shooter(s, e, d, dt, spd) {
  const p = s.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const inRange = !p.dead && Math.abs(dx) < d.range && Math.abs(dy) < 5;
  if (e.state === "move") {
    e.vx = e.dir * spd * 0.6;
    const ax = e.x + e.dir * (e.w / 2 + 0.15);
    if (e.onGround && (!groundAhead(s, ax, e.y) || isSolidAt(s, ax, e.y - 0.5))) e.dir *= -1;
    if (inRange) e.dir = Math.sign(dx) || e.dir;
    if (inRange && e.atkCd <= 0) {
      if (d.blink && Math.random() < 0.6) blinkNear(s, e);
      e.state = "wind";
      e.t = 0;
    }
  } else if (e.state === "wind") {
    e.vx = 0;
    if (e.t > 0.5) {
      shoot(s, e, d, p.x, p.y - 0.8);
      e.state = "lunge";
      e.t = 0;
    }
  } else if (e.state === "lunge") {
    e.vx = 0;
    if (e.t > 0.35) {
      e.state = "move";
      e.atkCd = 2 + Math.random() * 0.8;
    }
  }
}

function flyer(s, e, d, dt, spd) {
  const p = s.player;
  const dx = p.x - e.x;
  const dy = p.y - 0.8 - (e.y - e.h / 2);
  const near = !p.dead && Math.abs(dx) < 9 && Math.abs(dy) < 6 && Math.abs(e.x - e.homeX) < 14;
  if (e.state === "lunge") {
    if (e.t > 0.55) {
      e.state = "move";
      e.atkCd = 2 + Math.random();
    }
  } else if (e.state === "wind") {
    e.vx *= 0.85;
    e.vy *= 0.85;
    if (e.t > 0.5) {
      e.t = 0;
      if (d.shooter) {
        shoot(s, e, d, p.x, p.y - 0.8);
        e.state = "move";
        e.atkCd = 2.2 + Math.random();
      } else {
        const len = Math.hypot(dx, dy) || 1;
        e.vx = (dx / len) * 10;
        e.vy = (dy / len) * 10;
        e.state = "lunge";
      }
    }
  } else {
    let tx;
    let ty;
    if (near) {
      tx = d.drop ? p.x : p.x - Math.sign(dx || 1) * 3;
      ty = (d.drop ? p.y - 5 : p.y - 2.6) + Math.sin(s.time * (d.zigzag ? 7 : 2) + e.phase) * (d.zigzag ? 1.6 : 0.6);
      e.dir = Math.sign(dx) || e.dir;
      if (e.atkCd <= 0) {
        e.state = "wind";
        e.t = 0;
      }
    } else {
      tx = e.homeX + Math.sin(s.time * 0.7 + e.phase) * 3;
      ty = e.homeY + Math.sin(s.time * 1.3 + e.phase) * 0.8;
      e.dir = Math.sign(tx - e.x) || e.dir;
    }
    const ax = tx - e.x;
    const ay = ty - e.y;
    e.vx += (ax * 3 - e.vx) * Math.min(1, dt * 2.5);
    e.vy += (ay * 3 - e.vy) * Math.min(1, dt * 2.5);
    const sp = Math.hypot(e.vx, e.vy);
    if (sp > spd * 1.6) {
      e.vx *= (spd * 1.6) / sp;
      e.vy *= (spd * 1.6) / sp;
    }
  }
  e.x = Math.max(1.5, Math.min(COLS - 1.5, e.x + e.vx * dt));
  e.y = Math.max(2, Math.min(39, e.y + e.vy * dt));
}

export function updateEnemies(s, dt) {
  const p = s.player;
  const grav = PHYS.gravity * (AREAS[s.areaIndex].gravity || 1);
  for (const e of s.enemies) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.hurtT = Math.max(0, e.hurtT - dt);
    if (e.dead) {
      e.deadT += dt;
      continue;
    }
    const d = ENEMIES[e.type];
    e.atkCd -= dt;
    e.slowT = Math.max(0, e.slowT - dt);
    e.rootT = Math.max(0, e.rootT - dt);
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.burnTick -= dt;
      if (e.burnTick <= 0) {
        e.burnTick = 0.7;
        spark(s, e.x, e.y - e.h / 2, "#ff8a2a", 5, 3);
        damage(s, e, 1, { color: "#ff9a3a" });
        if (e.dead) continue;
      }
    }
    // Far-away monsters sleep so the whole area is not simulated at once.
    if (Math.abs(e.x - p.x) > 20 || Math.abs(e.y - p.y) > 14) continue;
    const spd = d.speed * (e.slowT > 0 ? 0.5 : 1) * (e.small ? 1.3 : 1);
    if (d.explode && e.rootT <= 0 && fuse(s, e)) {
      if (e.dead) continue;
      if (d.ai === "flyer") {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
    } else if (e.rootT > 0) {
      e.vx = 0;
      if (d.ai === "flyer") e.vy = 0;
    } else if (d.ai === "walker") walker(s, e, d, dt, spd);
    else if (d.ai === "hopper") hopper(s, e, d, dt, spd);
    else if (d.ai === "shooter") shooter(s, e, d, dt, spd);
    else if (d.ai === "flyer") flyer(s, e, d, dt, spd);
    if (d.ai !== "flyer") {
      if (e.hurtT > 0) e.vx *= 0.9;
      e.vy = Math.min(PHYS.maxFall, e.vy + grav * dt);
      const res = moveBody(s, e, dt);
      if (res.hitWall && e.state !== "lunge") e.dir = -res.hitWall;
      if (d.ai === "walker" && e.state === "lunge" && res.hitWall) e.state = "move";
    }
    if (!p.dead && boxHit(e, p)) hurtPlayer(s, 1, e.x);
  }
  s.enemies = s.enemies.filter((e) => !e.dead || e.deadT < 0.6);
  // Void shards split into two smaller shards.
  for (const sp of s.pendingSplits) {
    for (const off of [-0.6, 0.6]) {
      const n = spawnEnemy(s, sp.type, sp.x + off, sp.y, { scale: 0.62, small: true, hp: 2 });
      if (n) {
        n.vx = off * 6;
        n.vy = -4;
        n.atkCd = 1.2;
      }
    }
  }
  s.pendingSplits = [];
}

export function updateShots(s, dt) {
  const p = s.player;
  for (const b of s.shots) {
    b.life -= dt;
    if (b.grav) b.vy += b.grav * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (!b.ghost && tileType(s, Math.floor(b.x), Math.floor(b.y)) === SOLID) {
      b.life = 0;
      spark(s, b.x, b.y, b.color, 4, 3);
      continue;
    }
    if (!p.dead) {
      const hx = Math.max(p.x - p.w / 2, Math.min(b.x, p.x + p.w / 2));
      const hy = Math.max(p.y - p.h, Math.min(b.y, p.y));
      if ((b.x - hx) ** 2 + (b.y - hy) ** 2 < b.r * b.r) {
        if (hurtPlayer(s, b.dmg, b.x)) b.life = 0;
      }
    }
  }
  s.shots = s.shots.filter((b) => b.life > 0 && b.x > -2 && b.x < COLS + 2 && b.y > -2 && b.y < 42);
}
