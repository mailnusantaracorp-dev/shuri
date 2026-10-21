// DOM HUD and menus. Builds the shell once; render() only writes what changed.
// Buttons never touch game state directly: they call the game's actions.
import { SKINS } from "./skins.js";
import { AREAS } from "./areas.js";
import { BOSSES } from "./bestiary.js";

const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  throw: '<svg viewBox="0 0 24 24"><path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/><circle cx="12" cy="12" r="1.6"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  dash: '<svg viewBox="0 0 24 24"><path d="M5 6l6 6-6 6M12 6l6 6-6 6"/></svg>',
  skill: '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/><circle cx="12" cy="12" r="2.4"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/></svg>',
  skull: '<svg viewBox="0 0 24 24"><path d="M6 15a7 7 0 1 1 12 0v3H6z"/><path d="M9.5 12h.01M14.5 12h.01M10 18v2M14 18v2"/></svg>',
  door: '<svg viewBox="0 0 24 24"><path d="M5 21V6l7-3 7 3v15M3 21h18M12 12v3"/></svg>',
  seal: '<svg viewBox="0 0 24 24"><path d="M4 14h16M8 14V9a4 4 0 0 1 8 0v5"/><path d="M12 4v2"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

// SKIN_ICONS: 4×3 grid, 320px cells at 56 + 384·i in a 1584×1200 atlas.
function iconStyle(url, i) {
  const c = i % 4;
  const r = Math.floor(i / 4);
  const px = ((56 + 384 * c) / (1584 - 320)) * 100;
  const py = ((56 + 384 * r) / (1200 - 320)) * 100;
  return `background-image:url("${url}");background-size:${(1584 / 320) * 100}% ${(1200 / 320) * 100}%;background-position:${px}% ${py}%`;
}

export function createHud({ mount, assets, actions }) {
  const iconUrl = assets ? assets.get("SKIN_ICONS") : "";
  const shell = document.createElement("div");
  shell.className = "shell";
  shell.innerHTML = `
    <canvas class="stage" aria-label="Arena"></canvas>
    <div class="hud">
      <div class="hud-top">
        <div class="cluster cluster-left">
          <button class="icon-btn skin-btn" data-ui="skins" aria-label="Ganti skin"><span class="skin-ico"></span></button>
          <div class="pip-row hearts" aria-label="Nyawa"></div>
          <div class="skill-chip" aria-label="Skill (U)">${ICON.skill}<b class="cd"></b></div>
        </div>
        <div class="cluster cluster-mid">
          <div class="goal-chip"><span class="goal-ico"></span><span class="goal-num"></span><span class="goal-dir"></span></div>
        </div>
        <div class="cluster cluster-right">
          <button class="icon-btn" data-ui="menu" aria-label="Menu">${ICON.menu}</button>
        </div>
      </div>
      <div class="boss-bar" hidden><span class="boss-name"></span><div class="bar"><i></i></div></div>
      <div class="toast" hidden></div>
      <div class="stick" hidden><i></i></div>
      <div class="pad">
        <div class="pad-col">
          <button class="pad-btn small" data-action="dash" aria-label="Dash">${ICON.dash}</button>
          <button class="pad-btn small skill" data-action="skill" aria-label="Skill">${ICON.skill}<b class="cd"></b></button>
        </div>
        <div class="pad-col">
          <button class="pad-btn" data-action="jump" aria-label="Lompat">${ICON.jump}</button>
          <button class="pad-btn big" data-action="throw" aria-label="Lempar atau panggil Kuro">${ICON.throw}</button>
        </div>
      </div>
    </div>
    <div class="overlay" hidden></div>
    <div class="loading"><div class="spin"></div><span class="control-label">Memuat…</span></div>
  `;
  mount.replaceChildren(shell);
  const $ = (sel) => shell.querySelector(sel);
  const el = {
    canvas: $(".stage"),
    hud: $(".hud"),
    hearts: $(".hearts"),
    skinIco: $(".skin-ico"),
    goal: $(".goal-chip"),
    goalIco: $(".goal-ico"),
    goalNum: $(".goal-num"),
    goalDir: $(".goal-dir"),
    boss: $(".boss-bar"),
    bossName: $(".boss-name"),
    bossFill: $(".boss-bar i"),
    toast: $(".toast"),
    stick: $(".stick"),
    stickKnob: $(".stick i"),
    pad: $(".pad"),
    skillBtn: $(".pad-btn.skill"),
    skillChip: $(".skill-chip"),
    overlay: $(".overlay"),
    loading: $(".loading"),
    loadingLabel: $(".loading .control-label"),
  };
  const last = {};
  const set = (k, v, fn) => {
    if (last[k] === v) return;
    last[k] = v;
    fn(v);
  };

  shell.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ui]");
    if (!b) return;
    actions.uiClick();
    const ui = b.dataset.ui;
    if (ui === "menu") actions.openMenu("pause");
    else if (ui === "skins") actions.openMenu("skins");
    else if (ui === "close" || ui === "resume") actions.closeMenu();
    else if (ui === "areas") actions.openMenu("areas");
    else if (ui === "retry") actions.retryCheckpoint();
    else if (ui === "skin") actions.pickSkin(Number(b.dataset.i));
    else if (ui === "area") actions.pickArea(Number(b.dataset.i));
    else if (ui === "next") actions.nextArea();
    else if (ui === "replay") actions.toggleReplay();
  });

  function buildOverlay(s, menu) {
    const area = AREAS[s.areaIndex];
    const head = (title) => `<div class="ov-head"><h2>${title}</h2><button class="icon-btn" data-ui="close" aria-label="Tutup">${ICON.close}</button></div>`;
    if (menu === "pause") {
      return `<div class="panel">${head(`${s.areaIndex + 1}. ${area.name}`)}
        <div class="menu-list">
          <button class="control-btn primary" data-ui="resume"><span class="control-label">Lanjut</span></button>
          <button class="control-btn" data-ui="skins"><span class="control-label">Ganti skin</span></button>
          <button class="control-btn" data-ui="areas"><span class="control-label">Pilih area</span></button>
          <button class="control-btn" data-ui="retry"><span class="control-label">Ulang dari titik simpan</span></button>
        </div></div>`;
    }
    if (menu === "skins") {
      const cards = SKINS.map(
        (sk, i) => `<button class="card skin-card${i === s.skin ? " on" : ""}" data-ui="skin" data-i="${i}" style="--c:${sk.color}">
          <span class="card-ico" style='${iconStyle(iconUrl, i)}'></span>
          <span class="card-name">${sk.name}</span>
          <span class="card-sub">${sk.skill.name}</span>
          <span class="card-sub dim">${sk.buff}</span>
        </button>`
      ).join("");
      return `<div class="panel wide">${head("Skin")}<div class="grid">${cards}</div></div>`;
    }
    if (menu === "areas") {
      const card = (a, i) => {
        const locked = i >= s.unlocked;
        const best = s.best[i];
        return `<button class="card area-card${i === s.areaIndex ? " on" : ""}" data-ui="area" data-i="${i}" ${locked ? "disabled" : ""} style="--c:${a.accent}">
          <span class="card-num">${locked ? ICON.lock : i + 1}</span>
          <span class="card-name">${a.name}</span>
          <span class="card-sub dim">${best ? fmtTime(best) : a.boss ? BOSSES[a.boss].name : "—"}</span>
        </button>`;
      };
      const sky = AREAS.slice(0, 10).map((a, i) => card(a, i)).join("");
      const shadow = AREAS.slice(10).map((a, i) => card(a, i + 10)).join("");
      const replay = s.allCleared
        ? `<button class="control-btn toggle${s.replay ? " on" : ""}" data-ui="replay"><span class="control-label">Ulang Bayangan: ${s.replay ? "aktif" : "mati"}</span></button>`
        : "";
      return `<div class="panel wide">${head("Area")}${replay}<h3>Langit</h3><div class="grid">${sky}</div><h3>Dunia Bayangan</h3><div class="grid">${shadow}</div></div>`;
    }
    if (menu === "clear") {
      const last20 = s.areaIndex >= AREAS.length - 1;
      return `<div class="panel">
        <div class="ov-head"><h2>Area bersih!</h2></div>
        <div class="stats"><div><b>${fmtTime(s.areaTime)}</b><span>Waktu</span></div><div><b>${s.player.kills}</b><span>Monster</span></div><div><b>${s.secrets}</b><span>Rahasia</span></div></div>
        <div class="menu-list">
          ${last20 ? `<p class="end-line">Yomi telah jatuh. Dunia Bayangan sunyi.</p>` : `<button class="control-btn primary" data-ui="next"><span class="control-label">${s.areaIndex === 9 ? "Turun ke Dunia Bayangan" : "Area berikutnya"}</span></button>`}
          <button class="control-btn" data-ui="areas"><span class="control-label">Pilih area</span></button>
        </div></div>`;
    }
    return "";
  }

  function render(s, opts) {
    const p = s.player;
    if (!p) return;
    const sk = SKINS[s.skin];
    // Loading
    set("loading", s.loading ? (s.loadError ? "err" : "on") : "off", (v) => {
      el.loading.hidden = v === "off";
      el.loadingLabel.textContent = v === "err" ? "Sebagian gambar gagal dimuat" : "Memuat…";
    });
    set("touch", opts.showTouch, (v) => shell.classList.toggle("touch", v));
    set("skin", s.skin, (v) => {
      el.skinIco.setAttribute("style", iconStyle(iconUrl, v));
      shell.style.setProperty("--skin", SKINS[v].color);
    });
    set("hearts", `${p.hp}/${p.maxHp}`, () => {
      el.hearts.innerHTML = Array.from({ length: p.maxHp }, (_, i) => `<span class="pip${i < p.hp ? " full" : ""}">${ICON.heart}</span>`).join("");
    });
    // Objective chip
    const g = s.goal;
    if (g) {
      set("goal", `${g.kind}|${g.count ?? ""}|${g.dir}|${g.dist}`, () => {
        el.goalIco.innerHTML = ICON[g.kind] || "";
        el.goalNum.textContent = g.count !== undefined ? String(g.count) : "";
        el.goalNum.hidden = g.count === undefined;
        el.goalDir.innerHTML = g.dir ? `${ICON[g.dir]}<em>${g.dist}</em>` : "";
      });
    }
    // Skill cooldown
    const cdFrac = p.skillCd > 0 ? p.skillCd / (sk.skill.cd * (s.tune.skillCooldown || 1)) : 0;
    set("cd", Math.round(cdFrac * 40), (v) => {
      for (const node of [el.skillBtn, el.skillChip]) {
        node.style.setProperty("--cd", String(v / 40));
        node.classList.toggle("ready", v === 0);
      }
    });
    // Boss bar
    const b = s.boss;
    const showBoss = !!(b && b.active && !b.dead);
    set("bossOn", showBoss, (v) => {
      el.boss.hidden = !v;
    });
    if (showBoss) {
      set("bossName", b.name, (v) => (el.bossName.textContent = v));
      set("bossHp", Math.round((b.hp / b.maxHp) * 200), (v) => (el.bossFill.style.width = `${v / 2}%`));
    }
    // Toast
    set("toast", s.toast ? s.toast.id : 0, () => {
      if (s.toast) {
        el.toast.textContent = s.toast.text;
        el.toast.hidden = false;
        el.toast.classList.remove("pop");
        void el.toast.offsetWidth;
        el.toast.classList.add("pop");
      } else el.toast.hidden = true;
    });
    // Stick
    const st = s.input && s.input.stick;
    set("stick", st ? `${st.ox|0},${st.oy|0},${st.x|0},${st.y|0}` : "", () => {
      el.stick.hidden = !st;
      if (st) {
        el.stick.style.left = `${st.ox}px`;
        el.stick.style.top = `${st.oy}px`;
        el.stickKnob.style.transform = `translate(${st.x - st.ox}px, ${st.y - st.oy}px)`;
      }
    });
    // Menus
    const menu = s.menu || "";
    set("menu", `${menu}|${s.skin}|${s.unlocked}|${s.replay}|${s.areaIndex}`, () => {
      el.overlay.hidden = !menu;
      el.overlay.innerHTML = menu ? buildOverlay(s, menu) : "";
      el.overlay.className = `overlay${menu ? ` ov-${menu}` : ""}`;
    });
  }

  return { shell, el, render };
}

export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
