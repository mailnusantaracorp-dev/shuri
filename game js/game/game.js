// Feedback helpers: particles, floating text, sheet effects, screen shake and
// toasts. All of it lives on state and ages in update(); render only draws.
export function spark(s, x, y, color, n = 8, speed = 6, life = 0.45, size = 0.12) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    s.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life, max: life, color, size: size * (0.6 + Math.random() * 0.8), g: 14 });
  }
  if (s.particles.length > 400) s.particles.splice(0, s.particles.length - 400);
}

export function text(s, x, y, str, color = "#fff", big = false) {
  s.texts.push({ x, y, str, color, big, life: 0.9, max: 0.9 });
  if (s.texts.length > 40) s.texts.shift();
}

// A sheet animation (key + row, or key + named anim for frames.json sheets).
export function effect(s, sheet, row, x, y, size, dur = 0.45, opts = {}) {
  s.fx.push({ sheet, row, x, y, size, t: 0, dur, follow: opts.follow || null, loop: !!opts.loop, until: opts.until || 0, flip: !!opts.flip, alpha: opts.alpha ?? 1 });
  if (s.fx.length > 60) s.fx.shift();
}

export function shake(s, amount) {
  s.cam.shake = Math.max(s.cam.shake, amount);
}

export function toast(s, str, dur = 2.2) {
  s.toast = { text: str, t: dur, id: (s.toast?.id || 0) + 1 };
}

export function updateFx(s, dt) {
  for (const p of s.particles) {
    p.life -= dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  s.particles = s.particles.filter((p) => p.life > 0);
  for (const t of s.texts) {
    t.life -= dt;
    t.y -= 1.4 * dt;
  }
  s.texts = s.texts.filter((t) => t.life > 0);
  for (const f of s.fx) {
    f.t += dt;
    if (f.follow === "player") {
      f.x = s.player.x;
      f.y = s.player.y - 0.8;
    }
  }
  s.fx = s.fx.filter((f) => (f.loop ? f.t < f.until : f.t < f.dur));
  if (s.toast) {
    s.toast.t -= dt;
    if (s.toast.t <= 0) s.toast = null;
  }
  s.cam.shake = Math.max(0, s.cam.shake - dt * 1.8);
  s.flash = Math.max(0, (s.flash || 0) - dt * 2.5);
}
