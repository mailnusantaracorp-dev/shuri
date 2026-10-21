// Shared constants. World units are tiles: one grid cell = 1 unit.
// Every area is 180 wide: three 60-tile parts per floor.
export const COLS = 180;
// The hand-built third of each area sits at the right end of the map.
export const ORIGINAL_X = 120;
export const ROWS = 40;

export const PHYS = {
  gravity: 40,
  maxFall: 22,
  runSpeed: 7.4,
  groundAccel: 70,
  airAccel: 45,
  jumpV: 18.2, // ≈ 4.1 tiles of rise
  airJumpV: 17.2,
  coyote: 0.1,
  jumpBuffer: 0.13,
  wallSlide: 3.4,
  wallJumpVX: 9,
  dashSpeed: 23,
  dashTime: 0.17,
  dashCooldown: 0.5,
  invuln: 1.0,
};

export const PLAYER_BOX = { w: 0.7, h: 1.45 };

export const KURO = {
  speed: 24,
  range: 9,
  returnSpeed: 20,
  returnMax: 32,
  radius: 0.45,
  catchRadius: 0.75,
  perfectRadius: 2.3,
};

// Row numbers inside each skin sheet (all sheets are 5 frames wide).
export const ANIM = {
  MOVE: { idle: 0, run: 1, jump: 2, fall: 3 },
  COMBAT: { throw: 0, recall: 1, catch: 2, kick: 3 },
  AGILITY: { dash: 0, wall: 1, flip: 2, climb: 3 },
  SKILLS: { lunge: 0, wave: 1, power: 2, cast: 3 },
  STATUS: { hurt: 0, death: 1, victory: 2, land: 3 },
  EXTRA: { shoot: 0, hang: 1 },
};

export const SHEET_PARTS = ["MOVE", "COMBAT", "AGILITY", "SKILLS", "STATUS", "EXTRA"];
