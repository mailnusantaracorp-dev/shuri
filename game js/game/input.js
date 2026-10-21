// Input records intent into state.input; update() acts on it. Keyboard, mouse
// (aim + click to throw) and touch (floating joystick + buttons) all write the
// same fields, so every control path drives the same game functions.
const KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  jump: ["Space", "KeyK", "ArrowUp", "KeyW"],
  throw: ["KeyJ"],
  dash: ["KeyL", "ShiftLeft", "ShiftRight"],
  skill: ["KeyU"],
};

export function freshInput() {
  return {
    ax: 0,
    ay: 0,
    jumpHeld: false,
    jumpPressed: false,
    throwPressed: false,
    dashPressed: false,
    skillPressed: false,
    downHeld: false,
    aim: null,
    aimScreen: null,
    aimAge: 99,
    stick: null,
    touch: false,
  };
}

export function bindInput({ state, canvas, root, onFirstInput, onMenu, onSkins }) {
  const held = new Set();
  const stickState = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const btnHeld = { jump: false };
  const inp = () => state.input;

  const recompute = () => {
    const i = inp();
    if (!i) return;
    let ax = 0;
    let ay = 0;
    if (KEYS.left.some((k) => held.has(k))) ax -= 1;
    if (KEYS.right.some((k) => held.has(k))) ax += 1;
    if (KEYS.up.some((k) => held.has(k))) ay -= 1;
    if (KEYS.down.some((k) => held.has(k))) ay += 1;
    if (stickState.id !== null) {
      const dx = stickState.x - stickState.ox;
      const dy = stickState.y - stickState.oy;
      const r = 42;
      const l = Math.hypot(dx, dy);
      const k = l > r ? r / l : 1;
      ax = Math.abs(dx) > 8 ? (dx * k) / r : 0;
      ay = Math.abs(dy) > 12 ? (dy * k) / r : 0;
      i.stick = { ox: stickState.ox, oy: stickState.oy, x: stickState.ox + dx * k, y: stickState.oy + dy * k };
    } else i.stick = null;
    i.ax = Math.max(-1, Math.min(1, ax));
    i.ay = Math.max(-1, Math.min(1, ay));
    i.downHeld = i.ay > 0.5;
    i.jumpHeld = btnHeld.jump || KEYS.jump.some((k) => held.has(k));
  };

  const press = (action) => {
    const i = inp();
    if (!i) return;
    onFirstInput();
    if (action === "jump") i.jumpPressed = true;
    else if (action === "throw") i.throwPressed = true;
    else if (action === "dash") i.dashPressed = true;
    else if (action === "skill") i.skillPressed = true;
  };

  const onKeyDown = (e) => {
    if (e.target && e.target.closest && e.target.closest("input, textarea")) return;
    if (e.code === "Escape") {
      onMenu();
      e.preventDefault();
      return;
    }
    if (e.code === "Tab") {
      onSkins();
      e.preventDefault();
      return;
    }
    if (state.paused) return;
    if (!held.has(e.code)) {
      if (KEYS.jump.includes(e.code)) press("jump");
      if (KEYS.throw.includes(e.code)) press("throw");
      if (KEYS.dash.includes(e.code)) press("dash");
      if (KEYS.skill.includes(e.code)) press("skill");
    }
    held.add(e.code);
    onFirstInput();
    if (inp()) inp().aimAge = 99;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    recompute();
  };
  const onKeyUp = (e) => {
    held.delete(e.code);
    recompute();
  };
  const onBlur = () => {
    held.clear();
    stickState.id = null;
    btnHeld.jump = false;
    recompute();
  };

  // Canvas: mouse aims and clicks to throw; touch on the left drives the stick.
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
  };
  const onDown = (e) => {
    if (e.target.closest("button, [role='button'], .overlay")) return;
    if (state.paused) return;
    const pt = local(e);
    if (e.pointerType === "mouse") {
      if (e.button === 0) {
        inp().aimScreen = { x: pt.x, y: pt.y };
        inp().aimAge = 0;
        press("throw");
      }
      return;
    }
    inp().touch = true;
    if (pt.x < pt.w * 0.55 && stickState.id === null) {
      e.preventDefault();
      stickState.id = e.pointerId;
      stickState.ox = pt.x;
      stickState.oy = pt.y;
      stickState.x = pt.x;
      stickState.y = pt.y;
      canvas.setPointerCapture?.(e.pointerId);
      onFirstInput();
      recompute();
    } else {
      // Tapping the open right side throws toward the tap.
      inp().aimScreen = { x: pt.x, y: pt.y };
      inp().aimAge = 0;
      press("throw");
    }
  };
  const onMove = (e) => {
    const pt = local(e);
    if (e.pointerType === "mouse") {
      if (inp()) {
        inp().aimScreen = { x: pt.x, y: pt.y };
        inp().aimAge = 0;
      }
      return;
    }
    if (e.pointerId === stickState.id) {
      stickState.x = pt.x;
      stickState.y = pt.y;
      recompute();
    }
  };
  const onUp = (e) => {
    if (e.pointerId === stickState.id) {
      stickState.id = null;
      recompute();
    }
  };

  // On-screen buttons: data-action on each .pad-btn.
  const onBtnDown = (e) => {
    const b = e.target.closest("[data-action]");
    if (!b || !root.contains(b)) return;
    e.preventDefault();
    if (state.paused) return;
    const a = b.dataset.action;
    if (inp()) inp().touch = e.pointerType !== "mouse" || inp().touch;
    if (a === "jump") btnHeld.jump = true;
    b.classList.add("down");
    press(a);
    recompute();
  };
  const onBtnUp = (e) => {
    const b = e.target.closest("[data-action]");
    if (b) b.classList.remove("down");
    if (b && b.dataset.action === "jump") btnHeld.jump = false;
    recompute();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  root.addEventListener("pointerdown", onBtnDown);
  root.addEventListener("pointerup", onBtnUp);
  root.addEventListener("pointercancel", onBtnUp);
  root.addEventListener("pointerleave", onBtnUp);

  return {
    reset: onBlur,
    destroy() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      root.removeEventListener("pointerdown", onBtnDown);
      root.removeEventListener("pointerup", onBtnUp);
      root.removeEventListener("pointercancel", onBtnUp);
      root.removeEventListener("pointerleave", onBtnUp);
    },
  };
}
