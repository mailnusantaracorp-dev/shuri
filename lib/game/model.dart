import 'dart:math' as math;

typedef Json = Map<String, dynamic>;
double number(Json d, String key, [double fallback = 0]) =>
    (d[key] as num?)?.toDouble() ?? fallback;

class Body {
  Body(this.x, this.y, {this.w = .7, this.h = 1.45});
  double x, y, w, h, vx = 0, vy = 0;
  bool grounded = false;
  int wall = 0;
  double get cy => y - h / 2;
  bool near(double px, double py, double r) =>
      (px - x).abs() < w / 2 + r && py > y - h - r && py < y + r;
}

class Player extends Body {
  Player(super.x, super.y, int hearts)
    : hp = hearts, maxHp = hearts, spawnX = x, spawnY = y;
  int hp, maxHp, facing = 1, jumps = 0, kills = 0, hits = 0;
  double spawnX, spawnY, inv = 0, hurt = 0, dash = 0, dashCd = 0,
      skillCd = 0, skillTime = 0, throwTime = 0, catchTime = 0,
      coyote = 0, jumpBuffer = 0, drop = 0, death = 0, mist = 0,
      frenzy = 0, wallLock = 0;
  bool charged = false, water = false, glide = false;
  Thing? pull;
  Platform? platform;
  bool get dead => hp <= 0;
}

class Foe extends Body {
  Foe(this.type, this.data, double x, double y, {this.boss = false})
    : hp = number(data, 'hp'), maxHp = number(data, 'hp'),
      homeX = x, homeY = y,
      super(x, y, w: number(data, 'w', boss ? number(data, 'size') * .5 : 1),
          h: number(data, 'h', boss ? number(data, 'size') * .6 : 1));
  final String type;
  final Json data;
  final bool boss;
  double hp, maxHp, homeX, homeY, timer = 0, cooldown = 1.4,
      hurt = 0, death = 0, root = 0, slow = 0, burn = 0, burnTick = 0;
  int direction = -1, phase = 1;
  bool active = false;
  String state = 'idle';
  bool get dead => hp <= 0;
  bool get flying => data['fly'] == true || data['ai'] == 'flyer';
}

class Thing {
  Thing(this.glyph, this.x, this.y);
  final String glyph;
  double x, y, timer = 0;
  bool lit = false, taken = false;
  bool get weak => y < 15;
}

class Platform {
  Platform(this.x0, this.y0, this.w, this.vertical)
    : x = x0, y = y0;
  final double x0, y0, w;
  final bool vertical;
  double x, y, dx = 0, dy = 0;
  void update(double time) {
    final offset = math.sin(time * .9 + x0 * .37) * 3;
    final nx = x0 + (vertical ? 0 : offset);
    final ny = y0 + (vertical ? offset : 0);
    dx = nx - x;
    dy = ny - y;
    x = nx;
    y = ny;
  }
}

class Projectile {
  Projectile(this.x, this.y, this.vx, this.vy, {
    this.kuro = false, this.hostile = false, this.damage = 1,
    this.life = 1.4, this.radius = .35, this.pierce = false,
    this.homing = false, this.color = '#5fffd6', this.hitsLeft = 1,
  });
  double x, y, vx, vy, damage, life, radius, distance = 0;
  final bool kuro, hostile, homing;
  bool returning = false, lodged = false, pierce;
  int hitsLeft;
  String color;
  Thing? anchor;
  final Set<Foe> hit = {};
}

class Particle {
  Particle(this.x, this.y, this.vx, this.vy, this.color, this.life);
  double x, y, vx, vy, life;
  String color;
}

class InputState {
  double axis = 0, vertical = 0;
  bool jumpHeld = false, jump = false, dash = false,
      attack = false, skill = false, down = false;
  double? aimX, aimY;
  void clear() {
    axis = vertical = 0;
    jumpHeld = jump = dash = attack = skill = down = false;
    aimX = aimY = null;
  }
}
