// The twenty areas, drawn as 60×40 glyph grids at module load. Every area is
// three floors: the bottom room (start), the middle room (strike every target
// to open the Seal in its ceiling) and the upper floor (boss arena and exit).
//
// Glyphs
//  terrain  # solid   = one-way   p moon bridge   S seal   D cracked door
//           | arena gate   ^ spikes   ~ water   v updraft   : web
//           u wax ledge (melts)   q flesh ledge (pulses)   d shadow floor
//           b crate   H/U moving ledge (horizontal / vertical)
//  targets  B bell  M magnet  o core  e emitter  R mirror  r receiver  F furnace
//           V valve  O moon orb  ! sigil  T terminal  Z rod  f flood valve
//           N lantern  J string spool  Y wall eye   (G eclipse bell toggles d)
//  things   P start  E exit  & boss  C/X checkpoint  ? hint  A/Q anchor
//           * heart shard  @ full heal  $ rune  n/L/I scroll  s steam vent
//           W well  _ plate  + hanging cocoon
//  enemies  see ENEMY_GLYPHS in bestiary.js; 'a' is the area's own monster.
//  extra    1 2 3 — the area's three new monsters (EXTRA below)
//
// Each map is 180 wide. The hand-built 60-tile layout of every area is drawn
// at the right end (ORIGINAL_X); extend() then builds two more parts per floor
// to its left from a seeded recipe, so every floor is three parts long: start
// far left, climb at the right, light every target on the middle floor, fight
// the boss, then run the upper floor back left to the exit.
import { COLS as W, ROWS as H, ORIGINAL_X as OX } from "./config.js";
import { ENEMIES } from "./bestiary.js";

function area() {
  const g = Array.from({ length: H }, () => Array(W).fill("."));
  const abs = (x, y, ch) => {
    if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = ch;
  };
  const api = {
    g,
    abs,
    absRect(x, y, w, h, ch = "#") {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) abs(xx, yy, ch);
    },
    // Hand-built coordinates are 0–59 inside the original part.
    put(x, y, ch) {
      if (x >= 0 && x < 60) abs(x + OX, y, ch);
    },
    rect(x, y, w, h, ch = "#") {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) api.put(xx, yy, ch);
    },
    plat(x, y, w) {
      api.rect(x, y, w, 1, "=");
    },
    clear(x, y, w, h) {
      api.rect(x, y, w, h, ".");
    },
    skeleton({ hole, seal }) {
      api.absRect(0, 0, W, 1);
      api.absRect(0, H - 1, W, 1);
      api.absRect(0, 0, 1, H);
      api.absRect(W - 1, 0, 1, H);
      api.absRect(1, 27, W - 2, 1);
      api.plat(hole, 27, 4);
      api.absRect(1, 15, W - 2, 1);
      api.rect(seal, 15, 4, 1, "S");
    },
    holeSteps(hole) {
      if (hole > 30) {
        api.plat(hole - 4, 36, 3);
        api.plat(hole + 1, 33, 3);
        api.plat(hole - 1, 30, 4);
      } else {
        api.plat(hole + 4, 36, 3);
        api.plat(hole - 1 < 1 ? 1 : hole - 1, 33, 3);
        api.plat(hole, 30, 4);
      }
    },
    sealSteps(seal, ch = "=") {
      api.rect(seal + 10, 24, 3, 1, ch);
      api.rect(seal + 5, 21, 3, 1, ch);
      api.rect(seal - 1, 18, 4, 1, ch);
    },
    exitSteps(x) {
      api.plat(x, 12, 4);
      api.plat(x + 5, 9, 4);
      api.plat(x, 6, 4);
      api.put(x + 2, 4, "E");
    },
  };
  return api;
}

// Three new monsters per area, in plan order (glyphs 1, 2, 3).
const EXTRA = [
  ["root_crawler", "rot_firefly", "spore_shroom"],
  ["bell_crow", "scarecrow", "ghost_windmill"],
  ["mine_rat", "ore_golem", "mine_bat"],
  ["mirror_frog", "glass_dragonfly", "marsh_leech"],
  ["ember_salamander", "lava_crust", "walking_furnace"],
  ["moon_moth", "silk_weaver", "moon_rabbit"],
  ["storm_eagle", "rail_warden", "thunder_cloud"],
  ["flying_book", "ink_eel", "living_ink"],
  ["clock_soldier", "cuckoo_bird", "pendulum"],
  ["star_golem", "forge_spirit", "small_meteor"],
  ["ghost_hair", "well_child", "ghost_bucket"],
  ["jump_spider", "hanged_corpse", "spider_egg"],
  ["kasa_obake", "noppera_bo", "flying_mask"],
  ["bone_croc", "marsh_wisp", "skull_crab"],
  ["wax_angel", "melt_choir", "walking_candle"],
  ["vein_worm", "blood_bubble", "flesh_blob"],
  ["doll_head", "string_clown", "rocking_horse"],
  ["eye_spider", "eye_bat", "crawling_eye"],
  ["shadow_archer", "shadow_hound", "shadow_witch"],
  ["void_maw", "void_seraph", "dead_star"],
];
// Sky monsters each sky area keeps mixing in (ENEMY_GLYPHS).
const OLD_POOL = ["mg", "ty", "xm", "iw", "ck", "hw", "zy", "lh", "ji", "zj"];
const SKY_TARGET = ["B", "B", "M", "R", "F", "O", "T", "f", "B", "!"];

function rng(seed) {
  let t = (seed * 9973 + 17) % 4294967296;
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296;
    return t / 4294967296;
  };
}

function glyphType(i, ch) {
  if (ch === "1" || ch === "2" || ch === "3") return EXTRA[i][Number(ch) - 1];
  return null;
}

// One generated 60-tile part of one floor. floorRow is the solid floor under
// it (39, 27 or 15); the floor above is its ceiling, 12 rows higher.
function part(a, i, meta, r, x0, floorRow, floor, last) {
  const stand = floorRow - 1;
  const top = floorRow - 12;
  const ledge = i === 14 ? "u" : i === 15 ? "q" : i === 5 ? "p" : "=";
  const pool = ["1", "2", "3", "1", "2", "3"];
  if (meta.monster) pool.push("a", "a");
  else pool.push(...OLD_POOL[i].split(""));
  const toxic = meta.toxic && floor === 0;
  const target = i < 10 ? SKY_TARGET[i] : { lantern: "N", spool: "J", eye: "Y" }[meta.target] || "!";
  let targets = floor === 1 ? 3 : 0;
  let door = floor !== 1 && r() < 0.7;
  a.abs(x0 + 2, stand, "C");
  let x = x0 + 6;
  const enemies = [];
  while (x < x0 + 54) {
    const w = 7 + Math.floor(r() * 3);
    const kind = door && x > x0 + 24 ? 4 : Math.floor(r() * 4);
    if (kind === 4) door = false;
    if (kind === 0) {
      a.absRect(x + 1, stand, 4, 1, "^");
      a.absRect(x, stand - 3, 6, 1, ledge);
    } else if (kind === 1) {
      a.absRect(x + 2, stand - 1, 3, 2);
      enemies.push([x + 3, stand - 2, true]);
    } else if (kind === 2) {
      a.absRect(x, stand - 3, 4, 1, ledge);
      a.absRect(x + 4, stand - 6, 4, 1, ledge);
      if (r() < 0.35) a.abs(x + 6, stand - 7, "*");
      else enemies.push([x + 6, stand - 7, true]);
    } else if (kind === 3) {
      a.abs(x + 3, stand, "b");
      a.abs(x + 3, stand - 1, "b");
    } else {
      // A wall from the ceiling with a cracked door: only Kuro opens it.
      a.absRect(x + 3, top + 1, 1, stand - 2 - (top + 1));
      a.absRect(x + 3, stand - 2, 1, 3, "D");
    }
    // Toxic swamp: always a perch above the high water line.
    if (toxic && kind !== 0 && kind !== 2) a.absRect(x + 5, stand - 4, 3, 1, ledge);
    const n = (r() < 0.8 ? 1 : 0) + (last && r() < 0.35 ? 1 : 0);
    for (let k = 0; k < n; k++) enemies.push([x + 1 + Math.floor(r() * (w - 2)), stand, false]);
    if (targets > 0 && r() < 0.55) {
      a.abs(x + Math.floor(w / 2), stand - 2 - Math.floor(r() * 4), target);
      targets--;
    }
    x += w;
  }
  // Any target the walk did not place goes near the end of the part.
  for (let k = 0; k < targets; k++) a.abs(x0 + 50 + k * 2, stand - 3 - k, target);
  for (const [ex, ey, onTop] of enemies) {
    const g = pool[Math.floor(r() * pool.length)];
    const type = glyphType(i, g) || (g === "a" ? meta.monster : null);
    const fly = type && ENEMIES[type] && ENEMIES[type].ai === "flyer";
    let y = fly ? Math.max(top + 2, ey - 4) : ey;
    if (!fly && onTop) y = ey;
    if (a.g[y][ex] === ".") a.abs(ex, y, g);
  }
  if (r() < 0.4) a.abs(x0 + 31, stand, "*");
  // A second checkpoint halfway through every part.
  if (a.g[stand][x0 + 30] === ".") a.abs(x0 + 30, stand, "C");
}

function extend(a, i, meta) {
  const r = rng(i + 1);
  // The start and the exit move to the far left of the map.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (a.g[y][x] === "P" || a.g[y][x] === "E") a.g[y][x] = ".";
    }
  }
  a.abs(3, 38, "P");
  a.abs(7, 38, "?");
  a.abs(3, 14, "E");
  for (let f = 0; f < 3; f++) {
    const floorRow = [39, 27, 15][f];
    part(a, i, meta, r, 1, floorRow, f, false);
    part(a, i, meta, r, 60, floorRow, f, true);
  }
  // Clear the spot by the start and the exit so neither is buried.
  a.absRect(1, 34, 6, 5, ".");
  a.abs(3, 38, "P");
  a.abs(7, 38, "?");
  a.absRect(1, 11, 6, 4, ".");
  a.abs(3, 14, "E");
  a.abs(20, 14, "$");
  a.abs(40, 14, "@");
}

const defs = [];
const add = (meta, a) => {
  const i = defs.length;
  extend(a, i, meta);
  defs.push({ ...meta, extra: EXTRA[i], grid: a.g.map((row) => row.join("")) });
};

// ---------------------------------------------------------------- Langit
// 1 — Whispering Roots
{
  const a = area();
  a.skeleton({ hole: 50, seal: 28 });
  a.put(3, 38, "P");
  a.put(7, 38, "?");
  a.put(13, 38, "m");
  a.rect(16, 36, 3, 3);
  a.rect(21, 38, 4, 1, "^");
  a.plat(21, 35, 4);
  a.put(27, 38, "m");
  a.plat(31, 35, 3);
  a.put(37, 38, "g");
  a.rect(41, 36, 2, 3);
  a.put(46, 38, "C");
  a.holeSteps(50);
  a.put(57, 38, "L");
  a.put(57, 31, "*");
  a.rect(17, 22, 1, 5);
  a.plat(19, 24, 2);
  a.put(4, 26, "n");
  a.put(10, 26, "m");
  a.put(36, 25, "B");
  a.put(28, 25, "B");
  a.put(22, 22, "B");
  a.plat(38, 24, 3);
  a.plat(33, 21, 3);
  a.plat(27, 18, 4);
  a.put(41, 26, "?");
  a.put(44, 26, "C");
  a.put(34, 26, "m");
  a.plat(52, 24, 3);
  a.plat(55, 21, 3);
  a.rect(54, 18, 5, 1);
  a.put(57, 17, "*");
  a.rect(16, 10, 1, 5, "|");
  a.rect(47, 10, 1, 5, "|");
  a.put(40, 14, "&");
  a.plat(20, 12, 4);
  a.plat(25, 9, 4);
  a.plat(31, 6, 4);
  a.put(33, 4, "E");
  a.put(5, 14, "$");
  a.plat(8, 11, 4);
  a.put(12, 14, "X");
  add({ name: "Whispering Roots", boss: "rootjaw", accent: "#7fbf5a", hint: "Lempar Kuro ke lonceng untuk membuka Segel di atas." }, a);
}
// 2 — Bellwind Village
{
  const a = area();
  a.skeleton({ hole: 52, seal: 28 });
  a.put(3, 38, "P");
  a.clear(14, 39, 4, 1);
  a.clear(30, 39, 4, 1);
  a.rect(14, 39, 4, 1, "^");
  a.rect(30, 39, 4, 1, "^");
  a.plat(13, 35, 6);
  a.plat(29, 35, 6);
  a.put(22, 38, "t");
  a.rect(42, 34, 5, 1);
  a.put(44, 33, "y");
  a.put(46, 38, "@");
  a.put(40, 38, "C");
  a.holeSteps(52);
  a.rect(1, 32, 6, 1);
  a.put(4, 31, "A");
  a.put(2, 31, "n");
  a.put(8, 38, "?");
  a.put(10, 23, "B");
  a.put(20, 20, "B");
  a.put(32, 23, "B");
  a.put(42, 19, "B");
  a.put(26, 26, "?");
  a.plat(15, 24, 3);
  a.plat(45, 24, 3);
  a.put(30, 26, "m");
  a.put(6, 26, "t");
  a.put(48, 26, "C");
  a.put(3, 26, "X");
  a.plat(36, 24, 3);
  a.plat(31, 21, 3);
  a.plat(27, 18, 4);
  a.plat(22, 12, 3);
  a.plat(16, 9, 3);
  a.plat(22, 6, 4);
  a.put(32, 5, "A");
  a.rect(37, 3, 10, 1);
  a.put(38, 2, "A");
  a.put(45, 1, "E");
  a.rect(48, 14, 6, 1, "^");
  a.put(56, 14, "$");
  a.rect(2, 6, 8, 1);
  a.put(4, 5, "k");
  a.put(12, 14, "y");
  add({ name: "Bellwind Village", boss: null, accent: "#e7c46a", hint: "Kuro tertancap di cincin jangkar? Tekan lompat untuk ditarik." }, a);
}
// 3 — Ironvein Mine
{
  const a = area();
  a.skeleton({ hole: 50, seal: 28 });
  a.put(3, 38, "P");
  a.put(20, 38, "x");
  a.put(30, 38, "m");
  a.put(36, 38, "I");
  a.rect(24, 32, 5, 1);
  a.put(26, 31, "A");
  a.put(25, 31, "*");
  a.put(44, 38, "C");
  a.put(8, 38, "?");
  a.holeSteps(50);
  a.rect(2, 22, 20, 1);
  a.put(12, 21, "o");
  a.put(3, 21, "M");
  a.put(41, 26, "M");
  a.put(40, 26, "_");
  a.put(31, 26, "D");
  a.rect(26, 24, 5, 1);
  a.put(28, 23, "_");
  a.put(25, 23, "b");
  a.put(18, 26, "?");
  a.put(1, 26, "X");
  a.put(46, 26, "C");
  a.put(55, 26, "@");
  a.put(48, 26, "m");
  a.put(14, 26, "x");
  a.plat(35, 24, 3);
  a.plat(31, 21, 3);
  a.plat(27, 18, 4);
  a.rect(10, 10, 1, 5, "|");
  a.rect(49, 10, 1, 5, "|");
  a.put(30, 14, "&");
  a.plat(40, 12, 4);
  a.plat(45, 9, 4);
  a.plat(40, 6, 4);
  a.put(42, 4, "E");
  a.put(55, 14, "*");
  a.plat(51, 12, 3);
  a.rect(54, 9, 5, 1);
  a.put(56, 8, "$");
  a.put(3, 14, "n");
  add({ name: "Ironvein Mine", boss: "twin_drillers", accent: "#d08a4a", hint: "Magnet dan inti juga berbunyi kalau kena Kuro." }, a);
}
// 4 — Mirrorfen Marsh
{
  const a = area();
  a.skeleton({ hole: 52, seal: 40 });
  a.put(3, 38, "P");
  a.put(20, 38, "i");
  a.put(30, 34, "w");
  a.put(40, 38, "@");
  a.put(46, 38, "C");
  a.put(8, 38, "?");
  a.holeSteps(52);
  a.rect(56, 30, 3, 1);
  a.put(57, 29, "*");
  a.rect(1, 23, 4, 1);
  a.put(3, 22, "e");
  a.rect(13, 23, 3, 1);
  a.put(14, 22, "R");
  a.rect(13, 26, 3, 1);
  a.put(14, 25, "R");
  a.rect(33, 26, 3, 1);
  a.put(34, 25, "R");
  a.rect(25, 23, 3, 1);
  a.put(26, 22, "R");
  a.rect(35, 19, 2, 1);
  a.put(34, 19, "r");
  a.put(8, 26, "?");
  a.put(6, 26, "X");
  a.put(25, 20, "w");
  a.put(45, 26, "i");
  a.put(48, 26, "C");
  a.plat(46, 24, 3);
  a.plat(42, 21, 3);
  a.plat(39, 18, 4);
  a.put(57, 26, "n");
  a.rect(1, 11, 49, 1);
  a.rect(9, 7, 50, 1);
  a.plat(53, 13, 3);
  a.plat(4, 9, 3);
  a.put(56, 5, "E");
  a.put(30, 14, "i");
  a.put(25, 10, "i");
  a.put(35, 6, "i");
  a.put(45, 13, "w");
  a.put(2, 14, "$");
  a.put(52, 6, "n");
  add({ name: "Mirrorfen Marsh", boss: null, accent: "#8fd6d0", hint: "Kenai setiap cermin dengan Kuro." }, a);
}
// 5 — Emberkiln Foundry
{
  const a = area();
  a.skeleton({ hole: 52, seal: 46 });
  a.put(3, 38, "P");
  a.put(20, 38, "c");
  a.put(34, 38, "c");
  a.put(46, 38, "K");
  a.rect(47, 31, 4, 1);
  a.put(48, 30, "k");
  a.put(40, 38, "C");
  a.put(8, 38, "?");
  a.holeSteps(52);
  a.put(10, 26, "F");
  a.put(24, 26, "F");
  a.put(38, 26, "F");
  a.rect(5, 23, 3, 1);
  a.put(6, 22, "V");
  a.rect(19, 23, 3, 1);
  a.put(20, 22, "V");
  a.rect(33, 23, 3, 1);
  a.put(34, 22, "V");
  a.put(16, 26, "s");
  a.put(30, 26, "s");
  a.put(44, 26, "s");
  a.put(28, 26, "c");
  a.put(2, 26, "X");
  a.put(13, 26, "?");
  a.put(50, 26, "C");
  a.put(57, 26, "n");
  a.plat(52, 24, 3);
  a.plat(48, 21, 3);
  a.plat(45, 18, 4);
  a.rect(6, 10, 1, 5, "|");
  a.rect(57, 10, 1, 5, "|");
  a.put(30, 14, "&");
  a.rect(49, 12, 3, 1);
  a.put(50, 11, "V");
  a.rect(54, 8, 3, 1);
  a.put(55, 7, "V");
  a.plat(14, 12, 4);
  a.plat(9, 9, 4);
  a.plat(14, 6, 4);
  a.put(16, 4, "E");
  a.put(2, 14, "*");
  a.plat(2, 11, 3);
  a.put(3, 8, "*");
  add({ name: "Emberkiln Foundry", boss: "kiln_mother", accent: "#ff8a3a", hint: "Tebas katup di arena untuk melukai Kiln Mother." }, a);
}
// 6 — Moonthread Gardens
{
  const a = area();
  a.skeleton({ hole: 3, seal: 46 });
  a.put(10, 38, "P");
  a.plat(2, 36, 3);
  a.plat(6, 33, 3);
  a.plat(2, 30, 4);
  a.put(20, 38, "h");
  a.put(30, 38, "m");
  a.rect(48, 38, 6, 1, "^");
  a.put(56, 38, "$");
  a.put(14, 38, "C");
  a.put(17, 38, "?");
  a.clear(18, 27, 22, 1);
  a.rect(18, 24, 10, 1, "p");
  a.rect(30, 21, 10, 1, "p");
  a.put(15, 26, "O");
  a.rect(30, 18, 3, 1);
  a.put(31, 17, "O");
  a.put(52, 25, "!");
  a.put(10, 26, "n");
  a.put(8, 26, "?");
  a.put(5, 26, "X");
  a.put(12, 26, "C");
  a.put(44, 26, "h");
  a.plat(52, 24, 3);
  a.plat(48, 21, 3);
  a.plat(45, 18, 4);
  a.rect(55, 21, 4, 1);
  a.put(57, 20, "*");
  a.put(50, 26, "C");
  a.put(42, 14, "L");
  a.plat(41, 11, 4);
  a.plat(36, 8, 4);
  a.plat(30, 5, 4);
  a.put(32, 3, "E");
  a.put(20, 14, "w");
  add({ name: "Moonthread Gardens", boss: null, accent: "#b9b4ff", hint: "Bola bulan menyala kalau kena Kuro." }, a);
}
// 7 — Stormrail Heights
{
  const a = area();
  a.skeleton({ hole: 5, seal: 46 });
  a.put(12, 38, "P");
  a.plat(4, 36, 3);
  a.plat(9, 33, 3);
  a.plat(5, 30, 4);
  a.put(25, 34, "z");
  a.put(40, 32, "z");
  a.rect(48, 34, 4, 1);
  a.put(50, 33, "y");
  a.put(2, 38, "n");
  a.put(30, 38, "C");
  a.put(16, 38, "?");
  a.rect(10, 22, 1, 5);
  a.put(12, 26, "T");
  a.put(16, 26, "Z");
  a.put(14, 26, "A");
  a.rect(24, 20, 5, 1);
  a.put(26, 19, "T");
  a.put(23, 19, "Z");
  a.put(28, 19, "A");
  a.rect(38, 23, 7, 1);
  a.put(40, 22, "T");
  a.put(44, 22, "Z");
  a.put(38, 22, "A");
  a.plat(19, 23, 3);
  a.plat(31, 23, 3);
  a.put(4, 26, "?");
  a.put(2, 26, "X");
  a.put(50, 26, "C");
  a.put(57, 25, "$");
  a.put(34, 26, "z");
  a.plat(52, 24, 3);
  a.plat(48, 21, 3);
  a.plat(45, 18, 4);
  a.rect(8, 9, 1, 6, "|");
  a.rect(52, 9, 1, 6, "|");
  a.put(30, 10, "&");
  a.plat(16, 11, 4);
  a.plat(28, 7, 4);
  a.plat(44, 12, 4);
  a.plat(48, 9, 3);
  a.put(50, 7, "E");
  a.put(4, 14, "*");
  a.put(56, 14, "*");
  add({ name: "Stormrail Heights", boss: "thunder_roc", accent: "#8fd8ff", hint: "Terminal dan penangkal petir harus kena Kuro." }, a);
}
// 8 — The Drowned Archive
{
  const a = area();
  a.skeleton({ hole: 52, seal: 29 });
  a.put(3, 38, "P");
  a.put(20, 38, "l");
  a.put(34, 38, "h");
  a.rect(1, 32, 4, 1);
  a.put(5, 31, "A");
  a.put(2, 31, "k");
  a.put(44, 38, "C");
  a.put(8, 38, "?");
  a.holeSteps(52);
  a.rect(10, 16, 36, 11, "~");
  a.put(20, 26, "f");
  a.put(30, 26, "f");
  a.put(40, 26, "f");
  a.put(2, 24, "Q");
  a.put(2, 20, "Q");
  a.put(2, 17, "Q");
  a.put(30, 17, "!");
  a.put(14, 26, "l");
  a.put(48, 26, "l");
  a.put(7, 26, "X");
  a.put(5, 26, "?");
  a.put(50, 26, "C");
  a.put(57, 20, "n");
  a.rect(55, 21, 4, 1);
  a.put(30, 14, "&");
  a.rect(8, 10, 1, 5, "|");
  a.rect(52, 10, 1, 5, "|");
  a.plat(24, 12, 4);
  a.plat(34, 9, 4);
  a.plat(26, 6, 4);
  a.plat(34, 3, 4);
  a.put(36, 1, "E");
  add({ name: "The Drowned Archive", boss: "ink_leviathan", accent: "#6f8cff", hint: "Di air, tekan lompat untuk berenang ke atas." }, a);
}
// 9 — Clockroot Citadel
{
  const a = area();
  a.skeleton({ hole: 6, seal: 50 });
  a.put(14, 38, "P");
  a.plat(5, 36, 3);
  a.plat(10, 33, 3);
  a.plat(6, 30, 4);
  a.rect(22, 38, 10, 1, "^");
  a.rect(24, 36, 4, 1, "H");
  a.put(20, 38, "j");
  a.put(40, 38, "j");
  a.put(36, 38, "C");
  a.put(2, 38, "*");
  a.put(17, 38, "?");
  a.rect(13, 22, 3, 1, "U");
  a.put(14, 21, "B");
  a.rect(28, 24, 3, 1, "H");
  a.put(29, 23, "B");
  a.rect(42, 20, 3, 1, "U");
  a.put(43, 19, "B");
  a.put(4, 26, "?");
  a.put(2, 26, "X");
  a.put(46, 26, "C");
  a.put(22, 26, "i");
  a.put(36, 26, "j");
  a.plat(55, 24, 3);
  a.plat(51, 21, 3);
  a.plat(49, 18, 4);
  a.put(57, 26, "n");
  a.rect(10, 9, 1, 6, "|");
  a.rect(50, 9, 1, 6, "|");
  a.put(30, 14, "&");
  a.plat(15, 11, 4);
  a.plat(36, 12, 4);
  a.plat(41, 9, 4);
  a.plat(46, 6, 3);
  a.put(47, 4, "E");
  a.put(3, 14, "*");
  a.put(57, 14, "$");
  add({ name: "Clockroot Citadel", boss: "hollow_keeper", accent: "#c9e07a", hint: "Lonceng ikut bergerak bersama pijakannya." }, a);
}
// 10 — Skyforge Heart
{
  const a = area();
  a.skeleton({ hole: 52, seal: 46 });
  a.put(3, 38, "P");
  a.rect(20, 38, 10, 1, "^");
  a.rect(19, 28, 12, 10, "v");
  a.put(36, 38, "z");
  a.put(44, 38, "C");
  a.put(8, 38, "?");
  a.holeSteps(52);
  a.rect(20, 16, 1, 7);
  a.rect(40, 16, 1, 7);
  a.rect(2, 22, 10, 1);
  a.put(7, 21, "o");
  a.put(3, 21, "M");
  a.put(17, 26, "M");
  a.put(16, 26, "_");
  a.rect(7, 16, 1, 2);
  a.rect(13, 16, 1, 2);
  a.rect(7, 18, 7, 1);
  a.rect(9, 18, 3, 1, "D");
  a.put(10, 17, "!");
  a.put(1, 26, "X");
  a.rect(27, 16, 1, 2);
  a.rect(33, 16, 1, 2);
  a.rect(27, 18, 7, 1);
  a.rect(29, 18, 3, 1, "D");
  a.put(30, 17, "!");
  a.put(24, 26, "?");
  a.put(36, 26, "i");
  a.put(50, 21, "!");
  a.put(55, 26, "j");
  a.put(44, 23, "z");
  a.put(48, 26, "C");
  a.plat(52, 24, 3);
  a.plat(48, 21, 3);
  a.plat(45, 18, 4);
  a.rect(6, 9, 1, 6, "|");
  a.rect(53, 9, 1, 6, "|");
  a.put(30, 12, "&");
  a.plat(14, 11, 5);
  a.plat(40, 11, 5);
  a.plat(26, 7, 8);
  a.plat(44, 8, 4);
  a.put(46, 6, "E");
  a.put(2, 14, "n");
  add({ name: "Skyforge Heart", boss: "astra", accent: "#ffd86a", hint: "Pintu retak bisa dihancurkan Kuro dari bawah." }, a);
}

// ---------------------------------------------------------- Dunia Bayangan
// 11 — Sumur Bisikan
{
  const a = area();
  a.skeleton({ hole: 50, seal: 28 });
  a.put(3, 38, "P");
  a.put(7, 38, "?");
  a.put(11, 38, "W");
  a.put(15, 38, "a");
  a.put(20, 35, "N");
  a.rect(24, 36, 3, 3);
  a.put(30, 38, "a");
  a.put(34, 34, "N");
  a.put(38, 38, "w");
  a.put(42, 38, "C");
  a.holeSteps(50);
  a.put(57, 38, "*");
  a.put(3, 26, "C");
  a.put(8, 23, "N");
  a.put(13, 26, "a");
  a.rect(18, 22, 1, 5);
  a.plat(22, 24, 4);
  a.put(24, 21, "N");
  a.put(30, 26, "a");
  a.put(44, 23, "N");
  a.put(46, 26, "a");
  a.sealSteps(28);
  a.rect(53, 21, 6, 1);
  a.put(56, 20, "$");
  a.rect(8, 10, 1, 5, "|");
  a.rect(52, 10, 1, 5, "|");
  a.put(30, 14, "&");
  a.exitSteps(40);
  a.put(3, 14, "*");
  a.put(56, 14, "n");
  add({ name: "Sumur Bisikan", boss: "okiku", monster: "well_hand", dark: 0.93, target: "lantern", accent: "#5fa8c8", hint: "Gelap. Nyalakan lentera dengan Kuro." }, a);
}
// 12 — Hutan Gantung
{
  const a = area();
  a.skeleton({ hole: 6, seal: 44 });
  a.put(14, 38, "P");
  a.put(17, 38, "?");
  a.plat(5, 36, 3);
  a.plat(10, 33, 3);
  a.plat(6, 30, 4);
  a.rect(22, 33, 3, 6, ":");
  a.put(28, 38, "a");
  a.put(27, 29, "+");
  a.put(37, 29, "+");
  a.put(33, 35, "!");
  a.rect(40, 36, 2, 3);
  a.put(46, 38, "a");
  a.plat(48, 35, 4);
  a.put(50, 32, "!");
  a.put(55, 38, "C");
  a.put(2, 38, "*");
  a.put(3, 26, "C");
  a.put(10, 23, "!");
  a.rect(14, 20, 3, 7, ":");
  a.put(20, 26, "a");
  a.put(24, 16, "+");
  a.put(32, 16, "+");
  a.plat(26, 23, 4);
  a.put(28, 21, "!");
  a.put(36, 26, "a");
  a.sealSteps(44);
  a.rect(1, 20, 5, 1);
  a.put(2, 19, "$");
  a.rect(6, 10, 1, 5, "|");
  a.rect(56, 10, 1, 5, "|");
  a.put(30, 14, "&");
  a.plat(14, 12, 4);
  a.plat(9, 9, 4);
  a.plat(14, 6, 4);
  a.put(16, 4, "E");
  a.put(58, 14, "n");
  add({ name: "Hutan Gantung", boss: "tsuchigumo", monster: "cocoon", dark: 0.35, target: "sigil", accent: "#c3b6e8", hint: "Jaring memperlambatmu. Potong dengan Kuro." }, a);
}
// 13 — Pasar Hantu
{
  const a = area();
  a.skeleton({ hole: 52, seal: 30 });
  a.put(3, 38, "P");
  a.put(6, 38, "?");
  a.put(12, 36, "N");
  a.put(14, 38, "a");
  a.rect(18, 35, 6, 1);
  a.put(20, 38, "k");
  a.put(26, 36, "N");
  a.put(30, 38, "a");
  a.rect(34, 35, 6, 1);
  a.put(36, 34, "$");
  a.put(42, 36, "N");
  a.put(45, 38, "C");
  a.holeSteps(52);
  a.put(3, 26, "C");
  a.put(8, 23, "N");
  a.put(12, 26, "a");
  a.rect(16, 23, 6, 1);
  a.put(18, 21, "N");
  a.put(24, 26, "a");
  a.put(34, 23, "N");
  a.sealSteps(30);
  a.put(46, 26, "a");
  a.put(50, 23, "N");
  a.rect(54, 21, 5, 1);
  a.put(56, 20, "*");
  a.rect(8, 10, 1, 5, "|");
  a.rect(54, 10, 1, 5, "|");
  a.put(32, 14, "&");
  a.exitSteps(40);
  a.put(3, 14, "n");
  add({ name: "Pasar Hantu", boss: "mask_merchant", monster: "lantern_tongue", dark: 0.78, target: "lantern", accent: "#ff6a4a", hint: "Nyalakan lentera supaya jalan terlihat." }, a);
}
// 14 — Rawa Tulang
{
  const a = area();
  a.skeleton({ hole: 52, seal: 28 });
  a.put(3, 38, "P");
  a.plat(1, 35, 5);
  a.put(8, 38, "?");
  a.plat(10, 35, 4);
  a.put(14, 38, "a");
  a.plat(18, 34, 4);
  a.put(20, 31, "!");
  a.plat(25, 35, 4);
  a.put(30, 38, "a");
  a.plat(32, 34, 4);
  a.put(38, 31, "!");
  a.plat(38, 35, 4);
  a.put(44, 38, "a");
  a.plat(44, 34, 3);
  a.put(45, 33, "C");
  a.holeSteps(52);
  a.put(3, 26, "C");
  a.put(9, 26, "a");
  a.plat(12, 23, 4);
  a.put(14, 21, "!");
  a.put(22, 24, "l");
  a.put(28, 26, "a");
  a.put(34, 24, "!");
  a.sealSteps(28);
  a.put(46, 26, "a");
  a.put(50, 22, "!");
  a.rect(54, 21, 5, 1);
  a.put(56, 20, "$");
  a.rect(6, 10, 1, 5, "|");
  a.rect(56, 10, 1, 5, "|");
  a.put(32, 14, "&");
  a.plat(14, 12, 4);
  a.plat(9, 9, 4);
  a.plat(14, 6, 4);
  a.put(16, 4, "E");
  a.put(58, 14, "*");
  add({ name: "Rawa Tulang", boss: "gashadokuro", monster: "bone_fish", dark: 0.3, toxic: true, target: "sigil", accent: "#a6d84a", hint: "Air racun naik. Naik ke pijakan!" }, a);
}
// 15 — Katedral Lilin
{
  const a = area();
  a.skeleton({ hole: 50, seal: 46 });
  a.put(3, 38, "P");
  a.put(6, 38, "?");
  a.put(12, 38, "a");
  a.rect(18, 38, 12, 1, "^");
  a.rect(18, 35, 3, 1, "u");
  a.rect(23, 34, 3, 1, "u");
  a.rect(28, 35, 3, 1, "u");
  a.put(24, 31, "!");
  a.put(34, 38, "a");
  a.put(38, 35, "!");
  a.put(42, 38, "C");
  a.holeSteps(50);
  a.put(3, 26, "C");
  a.put(8, 26, "a");
  a.rect(12, 24, 3, 1, "u");
  a.rect(17, 21, 3, 1, "u");
  a.put(18, 19, "!");
  a.put(24, 26, "a");
  a.put(30, 23, "!");
  a.rect(34, 23, 3, 1, "u");
  a.put(40, 26, "a");
  a.sealSteps(46);
  a.put(52, 26, "w");
  a.rect(1, 20, 4, 1);
  a.put(2, 19, "$");
  a.rect(6, 10, 1, 5, "|");
  a.rect(57, 10, 1, 5, "|");
  a.put(30, 14, "&");
  a.rect(14, 12, 4, 1, "u");
  a.plat(9, 9, 4);
  a.rect(14, 6, 4, 1, "u");
  a.put(16, 4, "E");
  a.put(3, 14, "*");
  add({ name: "Katedral Lilin", boss: "candle_saint", monster: "wax_monk", dark: 0.62, target: "candle", accent: "#ffbf6a", hint: "Lilin meleleh kalau diinjak terlalu lama." }, a);
}
// 16 — Tambang Jantung
{
  const a = area();
  a.skeleton({ hole: 6, seal: 28 });
  a.put(14, 38, "P");
  a.put(17, 38, "?");
  a.plat(5, 36, 3);
  a.plat(10, 33, 3);
  a.plat(6, 30, 4);
  a.put(22, 38, "a");
  a.rect(26, 36, 3, 3);
  a.put(30, 38, "a");
  a.put(34, 36, "!");
  a.rect(38, 35, 4, 1, "q");
  a.put(40, 32, "!");
  a.rect(44, 32, 4, 1, "q");
  a.put(48, 38, "a");
  a.put(54, 38, "C");
  a.rect(55, 37, 4, 1);
  a.put(57, 36, "*");
  a.put(3, 26, "C");
  a.put(10, 26, "a");
  a.rect(14, 23, 4, 1, "q");
  a.put(16, 21, "!");
  a.rect(21, 20, 4, 1, "q");
  a.put(26, 26, "a");
  a.sealSteps(28);
  a.put(44, 26, "a");
  a.rect(46, 23, 4, 1, "q");
  a.put(48, 21, "!");
  a.rect(53, 20, 6, 1);
  a.put(56, 19, "$");
  a.rect(8, 10, 1, 5, "|");
  a.rect(52, 10, 1, 5, "|");
  a.put(30, 10, "&");
  a.exitSteps(40);
  add({ name: "Tambang Jantung", boss: "giant_heart", monster: "flesh_tick", dark: 0.4, target: "flesh", accent: "#ff4a5a", hint: "Daging berdenyut: pijak saat mengembang." }, a);
}
// 17 — Taman Boneka
{
  const a = area();
  a.skeleton({ hole: 52, seal: 28 });
  a.put(3, 38, "P");
  a.put(6, 38, "?");
  a.put(12, 38, "a");
  a.put(16, 38, "J");
  a.rect(20, 35, 4, 1);
  a.put(22, 34, "h");
  a.put(28, 38, "a");
  a.put(33, 38, "J");
  a.rect(37, 36, 3, 3);
  a.put(43, 38, "a");
  a.put(46, 38, "C");
  a.holeSteps(52);
  a.put(3, 26, "C");
  a.put(8, 26, "J");
  a.put(13, 26, "a");
  a.rect(18, 22, 1, 5);
  a.plat(20, 24, 4);
  a.put(22, 23, "J");
  a.put(30, 26, "a");
  a.put(44, 26, "a");
  a.put(48, 26, "J");
  a.sealSteps(28);
  a.rect(53, 21, 6, 1);
  a.put(56, 20, "*");
  a.rect(6, 10, 1, 5, "|");
  a.rect(56, 10, 1, 5, "|");
  a.put(30, 9, "&");
  a.plat(14, 12, 4);
  a.plat(9, 9, 4);
  a.plat(14, 6, 4);
  a.put(16, 4, "E");
  a.put(58, 14, "$");
  add({ name: "Taman Boneka", boss: "puppeteer", monster: "cracked_doll", dark: 0.45, target: "spool", accent: "#ff5a6a", hint: "Potong benang Sang Dalang dengan Kuro. Ia kebal selama benangnya utuh." }, a);
}
// 18 — Lembah Mata
{
  const a = area();
  a.skeleton({ hole: 50, seal: 46 });
  a.put(3, 38, "P");
  a.put(6, 38, "?");
  a.put(16, 34, "Y");
  a.put(22, 38, "a");
  a.rect(26, 35, 3, 4);
  a.put(32, 33, "Y");
  a.put(36, 36, "a");
  a.put(42, 38, "C");
  a.holeSteps(50);
  a.put(3, 26, "C");
  a.put(9, 22, "Y");
  a.put(14, 24, "a");
  a.rect(20, 21, 1, 6);
  a.put(26, 21, "Y");
  a.put(30, 24, "a");
  a.put(36, 19, "Y");
  a.sealSteps(46);
  a.put(42, 24, "a");
  a.rect(1, 19, 4, 1);
  a.put(2, 18, "$");
  a.rect(6, 10, 1, 5, "|");
  a.rect(57, 10, 1, 5, "|");
  a.put(30, 14, "&");
  a.plat(14, 12, 4);
  a.plat(9, 9, 4);
  a.plat(14, 6, 4);
  a.put(16, 4, "E");
  a.put(58, 14, "*");
  add({ name: "Lembah Mata", boss: "hyakume", monster: "float_eye", dark: 0.5, target: "eye", accent: "#ff3a3a", hint: "Mata yang terbuka menembak. Tutup dengan Kuro." }, a);
}
// 19 — Istana Gerhana
{
  const a = area();
  a.skeleton({ hole: 52, seal: 28 });
  a.put(3, 38, "P");
  a.put(6, 38, "?");
  a.put(10, 35, "G");
  a.rect(14, 38, 14, 1, "^");
  a.rect(14, 35, 14, 1, "d");
  a.put(20, 32, "!");
  a.put(32, 38, "a");
  a.put(38, 35, "!");
  a.put(44, 38, "C");
  a.holeSteps(52);
  a.put(3, 26, "C");
  a.put(9, 26, "a");
  a.put(14, 23, "!");
  a.put(22, 24, "G");
  a.put(26, 26, "a");
  a.sealSteps(28, "d");
  a.put(44, 23, "G");
  a.put(46, 26, "a");
  a.put(50, 22, "!");
  a.rect(54, 21, 5, 1);
  a.put(56, 20, "*");
  a.rect(6, 10, 1, 5, "|");
  a.rect(56, 10, 1, 5, "|");
  a.put(30, 14, "&");
  a.exitSteps(40);
  a.put(3, 14, "$");
  add({ name: "Istana Gerhana", boss: "shadow_shuri", monster: "shadow_knight", dark: 0.35, target: "sigil", accent: "#b46bff", hint: "Pukul lonceng gerhana: lantai bayangan muncul." }, a);
}
// 20 — Inti Hampa
{
  const a = area();
  a.skeleton({ hole: 6, seal: 46 });
  a.put(14, 38, "P");
  a.put(17, 38, "?");
  a.plat(5, 36, 3);
  a.plat(10, 33, 3);
  a.plat(6, 30, 4);
  a.put(22, 38, "a");
  a.put(26, 35, "N");
  a.rect(30, 36, 4, 1, "q");
  a.put(32, 33, "J");
  a.put(38, 38, "a");
  a.put(42, 34, "Y");
  a.rect(44, 35, 3, 1, "u");
  a.put(50, 38, "C");
  a.put(56, 38, "a");
  a.put(3, 26, "C");
  a.put(9, 26, "a");
  a.put(13, 22, "!");
  a.rect(18, 23, 3, 1, "q");
  a.put(24, 20, "N");
  a.put(28, 26, "a");
  a.put(34, 22, "Y");
  a.put(40, 26, "a");
  a.sealSteps(46);
  a.rect(1, 20, 4, 1);
  a.put(2, 19, "*");
  a.rect(5, 9, 1, 6, "|");
  a.rect(56, 9, 1, 6, "|");
  a.put(30, 9, "&");
  a.plat(14, 12, 4);
  a.plat(9, 9, 4);
  a.plat(14, 6, 4);
  a.put(16, 4, "E");
  add({ name: "Inti Hampa", boss: "yomi", monster: "void_shard", dark: 0.55, gravity: 0.72, target: "sigil", accent: "#c08bff", hint: "Gravitasi ringan. Semua bahaya bercampur di sini." }, a);
}

export const AREAS = defs.map((d, i) => ({
  index: i,
  world: i < 10 ? "sky" : "shadow",
  bg: `BG_AREA${i + 1}`,
  monster: null,
  extra: [],
  dark: 0,
  gravity: 1,
  toxic: false,
  target: null,
  ...d,
}));
