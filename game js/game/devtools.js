// The game's Creator Tools vocabulary: what exists (catalog), what is on
// screen (describeScene), and what the editor may drive. The SDK talks to
// the editor; this file only describes the game. Areas are built in code
// (areas.js), so they are listed as levels the editor can jump between.
import { AREAS } from "./areas.js";
import { ENEMIES } from "./bestiary.js";
import { worldRect } from "./render.js";

export function createDevtools({ mount, game }) {
  const s = game.state;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  return {
    game: "Shuri & Kuro: Dunia Bayangan",

    catalog({ definition, level, keysFor }) {
      return {
        // levels are fixed: the twenty areas are generated from areas.js.
        levels: AREAS.map((a, i) => level(`level:area-${i + 1}`, `${i + 1}. ${a.name}`, { index: i })),
        screens: [],
        definitions: [
          definition("def:player", "Shuri", { tweakKeys: keysFor("def:player"), nodeKinds: ["player"], sprite: "SKIN0_MOVE", category: "characters" }),
          definition("def:kuro", "Kuro", { tweakKeys: keysFor("def:kuro"), nodeKinds: ["kuro"], sprite: "KURO0_SHEET", singleton: false, category: "characters" }),
          definition("def:enemy", "Monster", { tweakKeys: keysFor("def:enemy"), nodeKinds: ["enemy"], sprite: "ENEMY_MOSS_SKITTER", singleton: false, category: "characters" }),
          definition("def:boss", "Bos", { tweakKeys: keysFor("def:boss"), nodeKinds: ["boss"], sprite: "BOSS_ROOTJAW", category: "characters" }),
          definition("def:world", "Area", { tweakKeys: keysFor("def:world"), nodeKinds: ["world"], sprite: "BG_AREA1", category: "world" }),
          definition("def:hud", "HUD", { tweakKeys: keysFor("def:hud"), nodeKinds: ["hud"], category: "interface" }),
          definition("def:controls", "Tombol sentuh", { tweakKeys: keysFor("def:controls"), nodeKinds: ["controls"], category: "interface" }),
        ],
      };
    },

    describeScene() {
      const nodes = [];
      const stage = mount.querySelector(".stage");
      if (!stage || !s.player) return { nodes };
      nodes.push({ id: "world", defId: "def:world", kind: "world", label: AREAS[s.areaIndex].name, rect: box(stage), instance: { area: s.areaIndex + 1 } });
      const p = s.player;
      nodes.push({ id: "player", defId: "def:player", kind: "player", label: "Shuri", rect: worldRect(p.x - 0.7, p.y - 2.2, 1.4, 2.2), instance: { hp: p.hp, skin: s.skin } });
      for (const k of s.kuros) nodes.push({ id: `kuro-${k.id}`, defId: "def:kuro", kind: "kuro", label: "Kuro", rect: worldRect(k.x - 0.6, k.y - 0.6, 1.2, 1.2), instance: { mode: k.mode } });
      for (const e of s.enemies) {
        if (e.dead || Math.abs(e.x - p.x) > 16 || Math.abs(e.y - p.y) > 12) continue;
        nodes.push({ id: `enemy-${e.id}`, defId: "def:enemy", kind: "enemy", label: ENEMIES[e.type].name, rect: worldRect(e.x - e.w / 2, e.y - e.h, e.w, e.h), instance: { hp: e.hp, type: e.type } });
      }
      const b = s.boss;
      if (b && !b.dead) nodes.push({ id: "boss", defId: "def:boss", kind: "boss", label: b.name, rect: worldRect(b.x - b.w / 2, b.y - b.h, b.w, b.h), instance: { hp: b.hp, active: b.active } });
      const top = mount.querySelector(".hud-top");
      if (top) nodes.push({ id: "hud", defId: "def:hud", kind: "hud", label: "HUD", rect: box(top), instance: {} });
      const pad = mount.querySelector(".pad");
      if (pad && pad.offsetParent) nodes.push({ id: "controls", defId: "def:controls", kind: "controls", label: "Tombol sentuh", rect: box(pad), instance: {} });
      return { nodes };
    },

    getState: () => ({
      started: !!s.level,
      over: !!s.cleared,
      level: { id: `level:area-${(s.areaIndex || 0) + 1}`, index: s.areaIndex || 0 },
    }),
    gotoLevel: (index) => {
      game.unlockAll();
      game.startArea(index);
    },
    commands: {
      "clear-monsters": { label: "Bersihkan monster", description: "Remove every monster in view", mutates: true, run: () => game.clearScreen() },
      "unlock-areas": { label: "Buka semua area", description: "Unlock all twenty areas", mutates: false, run: () => game.unlockAll() },
    },
  };
}
