// Synthesised sound: every effect is a short Web Audio recipe and the music is
// one looping buffer rendered once per world. The context comes from the SDK
// and unlocks on the first real tap; until then everything is silent.
let sdkRef = null;
let audio = null;
let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let musicSrc = null;
let musicWorld = null;
let wantWorld = null;
const loops = {};
let vol = { music: 0.5, sfx: 0.8, mute: false };
let lastHaptic = 0;
let hapticClock = 0;

export function initAudio(sdk) {
  sdkRef = sdk;
}

export function setVolumes(v) {
  vol = { ...vol, ...v };
  if (!ctx) return;
  master.gain.value = vol.mute ? 0 : 1;
  sfxBus.gain.value = vol.sfx;
  musicBus.gain.value = vol.music * 0.55;
}

// Called from the first genuine gameplay input. Never awaited by gameplay.
export function unlockAudio() {
  if (!sdkRef || audio === "pending") return;
  if (ctx) {
    if (ctx.state === "suspended" && audio?.unlock) audio.unlock().catch(() => {});
    return;
  }
  audio = "pending";
  sdkRef.audio
    .getContext()
    .then((a) => {
      audio = a;
      ctx = a.context;
      master = ctx.createGain();
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.connect(master);
      setVolumes({});
      const n = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, n, n);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return a.unlock ? a.unlock() : null;
    })
    .then(() => {
      if (wantWorld) playMusic(wantWorld);
    })
    .catch(() => {
      audio = null;
    });
}

// Advances the haptic rate limiter; called from update with the game's dt.
export function tickAudio(dt) {
  hapticClock += dt;
}

export function haptic(ms) {
  if (!sdkRef || hapticClock - lastHaptic < 0.06) return;
  lastHaptic = hapticClock;
  try {
    if (sdkRef.device.haptics.isSupported()) sdkRef.device.haptics.vibrate(ms).catch(() => {});
  } catch {
    /* optional */
  }
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(type, f0, f1, dur, peak = 0.3, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, 0.006, peak, dur);
  o.connect(g);
  g.connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, f0, f1, peak = 0.3, q = 1, type = "bandpass", delay = 0) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, 0.004, peak, dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const RECIPES = {
  throw: () => noise(0.18, 2400, 700, 0.22, 2),
  recall: () => noise(0.22, 600, 2600, 0.18, 2),
  catch: () => tone("triangle", 880, 660, 0.08, 0.14),
  perfect: () => {
    tone("triangle", 988, 988, 0.12, 0.18);
    tone("triangle", 1319, 1319, 0.2, 0.16, 0.07);
  },
  hit: () => {
    noise(0.07, 3000, 1200, 0.3, 3);
    tone("square", 320, 120, 0.06, 0.08);
  },
  clang: () => {
    tone("square", 1250, 1180, 0.16, 0.08);
    noise(0.1, 5000, 3000, 0.12, 6);
  },
  clink: () => tone("triangle", 1800, 1400, 0.06, 0.08),
  enemyDie: () => {
    noise(0.35, 900, 120, 0.3, 1, "lowpass");
    tone("sawtooth", 220, 60, 0.3, 0.08);
  },
  bossDie: () => {
    noise(1.4, 1200, 40, 0.5, 0.7, "lowpass");
    tone("sawtooth", 160, 30, 1.2, 0.2);
  },
  hurt: () => {
    tone("sawtooth", 300, 90, 0.22, 0.16);
    noise(0.15, 1500, 400, 0.18, 1);
  },
  death: () => tone("sawtooth", 260, 40, 0.9, 0.2),
  spit: () => noise(0.12, 1800, 500, 0.12, 4),
  bossShot: () => {
    noise(0.25, 900, 200, 0.22, 2);
    tone("sawtooth", 140, 70, 0.2, 0.1);
  },
  pull: () => noise(0.3, 400, 2400, 0.16, 1.5),
  anchor: () => tone("triangle", 1500, 1500, 0.1, 0.1),
  snap: () => noise(0.06, 3500, 2500, 0.2, 5),
  break: () => {
    noise(0.4, 1400, 150, 0.35, 0.8, "lowpass");
    tone("square", 110, 50, 0.25, 0.08);
  },
  bell: () => {
    tone("sine", 784, 784, 1.2, 0.22);
    tone("sine", 1568, 1568, 0.8, 0.08);
    tone("sine", 2350, 2350, 0.5, 0.04);
  },
  sigil: () => {
    tone("triangle", 523, 523, 0.5, 0.16);
    tone("triangle", 784, 784, 0.6, 0.12, 0.08);
  },
  seal: () => {
    tone("sine", 262, 262, 1.6, 0.2);
    tone("sine", 392, 392, 1.6, 0.16, 0.12);
    tone("sine", 523, 523, 1.8, 0.14, 0.24);
  },
  melt: () => noise(0.5, 600, 200, 0.15, 1, "lowpass"),
  pickup: () => {
    tone("triangle", 660, 660, 0.08, 0.14);
    tone("triangle", 990, 990, 0.12, 0.14, 0.06);
  },
  secret: () => {
    tone("triangle", 523, 523, 0.1, 0.14);
    tone("triangle", 659, 659, 0.1, 0.14, 0.08);
    tone("triangle", 1047, 1047, 0.3, 0.16, 0.16);
  },
  checkpoint: () => {
    tone("sine", 440, 440, 0.4, 0.14);
    tone("sine", 660, 660, 0.5, 0.12, 0.1);
  },
  roar: () => {
    noise(1.1, 300, 80, 0.4, 0.8, "lowpass");
    tone("sawtooth", 90, 55, 1, 0.18);
  },
  slam: () => {
    noise(0.5, 400, 40, 0.45, 0.7, "lowpass");
    tone("sine", 80, 35, 0.4, 0.3);
  },
  whoosh: () => noise(0.35, 300, 1800, 0.2, 1),
  blink: () => tone("sine", 1400, 300, 0.2, 0.12),
  jump: () => tone("triangle", 330, 560, 0.09, 0.06),
  dash: () => noise(0.16, 900, 3200, 0.16, 1.5),
  skill: () => {
    noise(0.6, 200, 3000, 0.3, 0.8);
    tone("sawtooth", 110, 440, 0.5, 0.12);
  },
  thunder: () => {
    noise(0.8, 4000, 100, 0.5, 0.5, "lowpass");
    tone("square", 70, 40, 0.5, 0.1);
  },
  clear: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.4, 0.15, i * 0.1));
  },
  ui: () => tone("triangle", 700, 700, 0.05, 0.08),
};

export function sfx(name) {
  if (!ctx || ctx.state !== "running") return;
  const r = RECIPES[name];
  if (r) r();
}

// One steady noise loop (water, wind) whose loudness follows the game.
export function setLoop(name, level) {
  if (!ctx || ctx.state !== "running") return;
  let l = loops[name];
  if (!l) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(sfxBus);
    src.start();
    l = loops[name] = { g };
  }
  l.g.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.2);
}

// ---------------------------------------------------------------- music
const SCALES = {
  sky: { root: 146.83, steps: [0, 3, 5, 7, 10, 12, 15], bpm: 84, bright: 1 },
  shadow: { root: 110, steps: [0, 1, 3, 6, 7, 8, 12], bpm: 72, bright: 0.55 },
};
const cacheBuf = {};

function renderLoop(world) {
  const sc = SCALES[world];
  const rate = 22050;
  const beat = 60 / sc.bpm;
  const bars = 8;
  const len = Math.floor(beat * 4 * bars * rate);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  const freq = (step, oct = 0) => sc.root * Math.pow(2, step / 12 + oct);
  // Drone: root and fifth, slowly breathing.
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    const sw = 0.5 + 0.5 * Math.sin((t / (beat * 16)) * Math.PI * 2);
    d[i] = (Math.sin(2 * Math.PI * freq(0, -1) * t) * 0.16 + Math.sin(2 * Math.PI * freq(7, -1) * t) * 0.08) * (0.6 + sw * 0.4);
  }
  // A plucked koto-like line, seeded so the loop is the same every time.
  let seed = world === "sky" ? 7 : 13;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const notes = bars * 8;
  for (let n = 0; n < notes; n++) {
    if (rnd() < (world === "sky" ? 0.32 : 0.45)) continue;
    const step = sc.steps[Math.floor(rnd() * sc.steps.length)];
    const f = freq(step, rnd() < 0.3 ? 1 : 0);
    const start = Math.floor(n * (beat / 2) * rate);
    const dur = Math.floor(rate * 1.4);
    for (let i = 0; i < dur && start + i < len; i++) {
      const t = i / rate;
      const e = Math.exp(-t * (world === "sky" ? 3.2 : 2.2));
      const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * sc.bright * Math.sin(4 * Math.PI * f * t)) * e * 0.13;
      d[start + i] += v;
    }
  }
  // Low taiko hit on each bar.
  for (let b = 0; b < bars; b++) {
    const start = Math.floor(b * beat * 4 * rate);
    for (let i = 0; i < rate * 0.5 && start + i < len; i++) {
      const t = i / rate;
      d[start + i] += Math.sin(2 * Math.PI * (70 - t * 40) * t) * Math.exp(-t * 9) * 0.3;
    }
  }
  return buf;
}

export function playMusic(world) {
  wantWorld = world;
  if (!ctx || musicWorld === world) return;
  if (musicSrc) {
    try {
      musicSrc.stop();
    } catch {
      /* already stopped */
    }
  }
  if (!cacheBuf[world]) cacheBuf[world] = renderLoop(world);
  const src = ctx.createBufferSource();
  src.buffer = cacheBuf[world];
  src.loop = true;
  src.connect(musicBus);
  src.start();
  musicSrc = src;
  musicWorld = world;
}
