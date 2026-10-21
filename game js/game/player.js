// Shuri's body: running, jumping (extra air jumps per skin), wall slides,
// dashes, swimming, gliding, anchor pulls, hazards, death and respawn.
import { PHYS, PLAYER_BOX, COLS } from "./config.js";
import { AREAS } from "./areas.js";
import { moveBody, tileChar, tileType, overlapsGlyph, toxicLevel, ONEWAY, key } from "./world.js";
import { skinOf, hurtPlayer } from "./combat.js";
import { tryAnchorPull, finishPull } from "./kuro.js";
import { hurtByToxic } from "./level.js";
import { resetBoss } from "./boss.js";
import { spark, effect, toast } from "./fx.js";
import { sfx, haptic } from "./audio.js";

export function createPlayer(s, x, y) {
  const sk = skinOf(s);
  return {
    x,
    y,
    w: PLAYER_BOX.w,
    h: PLAYER_BOX.h,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    hp: sk.hearts,
    maxHp: sk.hearts,
    invT: 0,
    hurtT: 0,
    dashT: 0,
    dashCd: 0,
    dashLong: false,
    jumpsUsed: 0,
    coyote: 0,
    jumpBuf: 0,
    wall: 0,
    dead: false,
    deadT: 0,
    throwT: 0,
    recallT: 0,
    catchT: 0,
    landT: 0,
    skillT: 0,
    skillAnim: null,
    charged: false,
    skillCd: 0,
    mistT: 0,
    frenzyT: 0,
    pull: null,
    kills: 0,
    hits: 0,
    respawn: { x, y },
    groundChar: null,
    groundKey: null,
    inWater: false,
    gliding: false,
    platform: null,
    fireT: 0,
  };
}

// Moving ledges are not tiles: Shuri lands on them from above and rides them.
function ridePlatforms(s, p, prevY) {
  p.platform = null;
  if (p.vy < 0) return;
  for (const pl of s.level.platforms) {
    if (p.x + p.w / 2 <= pl.x || p.x - p.w / 2 >= pl.x + pl.w) continue;
    if (prevY <= pl.y + 0.06 && p.y >= pl.y - 0.02 && !s.input.downHeld) {
      p.y = pl.y;
      p.vy = 0;
      p.onGround = true;
      p.platform = pl;
      return;
    }
  }
}

export function updatePlayer(s, dt) {
  const p = s.player;
  const inp = s.input;
  const sk = skinOf(s);
  const area = AREAS[s.areaIndex];
  p.invT = Math.max(0, p.invT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.throwT = Math.max(0, p.throwT - dt);
  p.recallT = Math.max(0, p.recallT - dt);
  p.catchT = Math.max(0, p.catchT - dt);
  p.landT = Math.max(0, p.landT - dt);
  p.skillT = Math.max(0, p.skillT - dt);
  p.skillCd = Math.max(0, p.skillCd - dt);
  p.mistT = Math.max(0, p.mistT - dt);
  p.frenzyT = Math.max(0, p.frenzyT - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.wallLock = Math.max(0, (p.wallLock || 0) - dt);
  if (p.dead) {
    p.deadT -= dt;
    p.vx = 0;
    p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);
    moveBody(s, p, dt);
    if (p.deadT <= 0) respawn(s);
    return;
  }
  if (s.cleared) {
    p.vx *= 0.8;
    p.vy = Math.min(PHYS.maxFall, p.vy + PHYS.gravity * dt);
    moveBody(s, p, dt);
    return;
  }

  // Anchor pull: fly to the lodged Kuro, ignoring gravity.
  if (p.pull) {
    const dx = p.pull.x - p.x;
    const dy = p.pull.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) {
      p.pull = null;
      finishPull(s);
      p.vy = -9;
      p.vx = 0;
      p.jumpsUsed = 1;
    } else {
      p.vx = (dx / d) * 26;
      p.vy = (dy / d) * 26;
      const res = moveBody(s, p, dt);
      if (res.hitWall || res.hitCeil) {
        p.pull = null;
        finishPull(s);
      }
      return;
    }
  }

  const water = overlapsGlyph(s, p, "~", 0.3);
  p.inWater = !!water;
  const web = overlapsGlyph(s, p, ":", 0.2);
  const inWeb = web && !s.level.webCut[key(web.x, web.y)];
  const updraft = overlapsGlyph(s, p, "v", 0.2);
  const speedMul = sk.speed * (s.tune.playerSpeed || 1) * (inWeb ? 0.45 : 1) * (p.inWater ? 0.7 : 1);

  // Timers that make jumps forgiving.
  if (p.onGround) {
    p.coyote = PHYS.coyote;
    p.jumpsUsed = 0;
  } else p.coyote = Math.max(0, p.coyote - dt);
  if (inp.jumpPressed) {
    p.jumpBuf = PHYS.jumpBuffer;
    inp.jumpPressed = false;
    // A Kuro sitting in an anchor turns the jump into a pull.
    if (tryAnchorPull(s)) {
      p.jumpBuf = 0;
      return;
    }
  } else p.jumpBuf = Math.max(0, p.jumpBuf - dt);

  if (inp.dashPressed) {
    inp.dashPressed = false;
    if (!tryAnchorPull(s) && p.dashCd <= 0) startDash(s, false);
  }

  // Horizontal control.
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.vy = 0;
    if (p.dashLong) {
      p.fireT -= dt;
      if (p.fireT <= 0) {
        p.fireT = 0.05;
        s.pshots.push({ id: ++s.nextId, x: p.x, y: p.y - 0.4, vx: 0, vy: 0, r: 0.6, dmg: 1, life: 1.4, color: "#ff8a2a", pierce: true, hit: {}, fire: true });
      }
    }
    if (p.dashT <= 0) {
      p.vx *= 0.35;
      p.dashLong = false;
    }
  } else if (p.hurtT <= 0 && !(p.wallLock > 0)) {
    const target = inp.ax * PHYS.runSpeed * speedMul;
    const accel = p.onGround ? PHYS.groundAccel : PHYS.airAccel;
    const dv = target - p.vx;
    p.vx += Math.sign(dv) * Math.min(Math.abs(dv), accel * dt);
    if (Math.abs(inp.ax) > 0.15) p.facing = Math.sign(inp.ax);
  }

  // Wall slide: airborne, pressing into a wall.
  const touching = !p.onGround && p.wall !== 0 && Math.sign(inp.ax) === p.wall;
  // Jump.
  if (p.jumpBuf > 0 && p.dashT <= 0) {
    const onOneWay = p.onGround && inp.downHeld && p.groundChar && tileType(s, Math.floor(p.x), Math.floor(p.y + 0.05)) === ONEWAY;
    if (onOneWay) {
      p.y += 0.12;
      p.onGround = false;
      p.jumpBuf = 0;
      p.dropT = 0.25;
    } else if (p.inWater) {
      p.vy = -10.5;
      p.jumpBuf = 0;
      sfx("jump");
    } else if (p.onGround || p.coyote > 0) {
      p.vy = -PHYS.jumpV;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuf = 0;
      p.jumpsUsed = 1;
      sfx("jump");
    } else if (touching || (p.wallT > 0 && p.wall !== 0)) {
      p.vy = -PHYS.jumpV * 0.95;
      p.vx = -p.wall * PHYS.wallJumpVX;
      p.facing = -p.wall;
      p.jumpBuf = 0;
      p.jumpsUsed = 1;
      p.hurtT = 0;
      p.wallLock = 0.16;
      sfx("jump");
    } else if (p.jumpsUsed < sk.jumps) {
      p.vy = -PHYS.airJumpV;
      p.jumpsUsed = Math.max(2, p.jumpsUsed + 1);
      p.jumpBuf = 0;
      spark(s, p.x, p.y, sk.color, 8, 4);
      sfx("jump");
    }
  }
  // Short hop when the jump is released early.
  if (!inp.jumpHeld && p.vy < -6 && !p.inWater && p.dashT <= 0) p.vy += PHYS.gravity * 1.2 * dt;

  // Gravity.
  if (p.dashT <= 0) {
    let g = PHYS.gravity * (area.gravity || 1);
    let maxFall = PHYS.maxFall;
    p.gliding = sk.glide && inp.jumpHeld && p.vy > 0 && !p.onGround && !p.inWater;
    if (p.gliding) maxFall = 3;
    if (p.inWater) {
      g *= 0.3;
      maxFall = 4;
    }
    if (touching && p.vy > 0) maxFall = PHYS.wallSlide;
    p.vy = Math.min(maxFall, p.vy + g * dt);
    if (updraft) p.vy = Math.max(-11, p.vy - 70 * dt);
  }

  const prevY = p.y;
  const wasGround = p.onGround;
  const fallV = p.vy;
  if (p.platform && p.onGround) {
    p.x += p.platform.dx;
    p.y += p.platform.dy;
  }
  p.dropT = Math.max(0, (p.dropT || 0) - dt);
  const res = moveBody(s, p, dt, p.dropT > 0);
  ridePlatforms(s, p, prevY);
  p.x = Math.max(p.w / 2, Math.min(COLS - p.w / 2, p.x));
  if (res.hitWall) {
    p.wall = res.hitWall;
    p.wallT = 0.12;
  } else {
    p.wallT = Math.max(0, (p.wallT || 0) - dt);
    if (p.wallT <= 0) p.wall = 0;
  }
  if (p.onGround) {
    if (res.landed) {
      p.groundChar = tileChar(s, res.groundX, res.groundY);
      p.groundKey = key(res.groundX, res.groundY);
    } else if (p.platform) {
      p.groundChar = null;
      p.groundKey = null;
    }
    if (!wasGround && fallV > 14) {
      p.landT = 0.18;
      spark(s, p.x, p.y, "#9a9aa8", 6, 3, 0.3, 0.08);
    }
  }

  // Hazards.
  if (overlapsGlyph(s, p, "^", 0.2)) {
    if (hurtPlayer(s, 1, p.x - p.facing)) p.vy = -13;
  }
  if (p.y > toxicLevel(s) + 0.4) hurtByToxic(s);
}

export function startDash(s, long) {
  const p = s.player;
  p.dashT = PHYS.dashTime * (long ? 2.2 : 1);
  p.dashLong = long;
  p.fireT = 0;
  p.dashCd = PHYS.dashCooldown;
  p.vx = p.facing * PHYS.dashSpeed * (s.tune.playerSpeed || 1);
  p.vy = 0;
  effect(s, "FX_COMBAT", 2, p.x - p.facing * 0.8, p.y - 0.7, 2, 0.3, { flip: p.facing < 0 });
  sfx("dash");
  haptic(6);
}

export function respawn(s) {
  const p = s.player;
  const r = p.respawn;
  p.x = r.x;
  p.y = r.y;
  p.vx = 0;
  p.vy = 0;
  p.dead = false;
  p.hp = p.maxHp;
  p.invT = 1.5;
  p.hurtT = 0;
  p.pull = null;
  p.dashT = 0;
  s.kuros = [];
  s.shots = [];
  s.pshots = [];
  if (s.boss && s.boss.active && !s.boss.dead) {
    resetBoss(s);
    toast(s, "Coba lagi!", 1.6);
  }
  effect(s, "FX_WORLD", 2, p.x, p.y - 1, 2.4, 0.6, { follow: "player" });
}
