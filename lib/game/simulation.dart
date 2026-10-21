import 'dart:math' as math;
import 'model.dart';

/// Tile-space port of config/world/player/level/kuro/combat/skills/boss.js.
/// Rendering and platform services deliberately stay outside this class.
class Simulation {
  Simulation(this.data, {Json? save}) {
    final s = save?['version'] == 1 ? save! : <String, dynamic>{};
    // Every area is open from the start; skins were never locked.
    unlocked = areas.length;
    skinIndex = integer(s['skin'], 0, skins.length - 1, 0);
    best = List.generate(areas.length, (i) {
      final list = s['best'];
      return list is List && i < list.length && list[i] is num
          ? (list[i] as num).toDouble() : 0.0;
    });
    loadArea(integer(s['area'], 0, unlocked - 1, 0));
    final lit = s['lit'];
    if (lit is List) {
      for (final i in lit.whereType<int>()) {
        if (i >= 0 && i < targets.length && !targets[i].weak) {
          targets[i].lit = true;
        }
      }
    }
    bossDone = s['bossDone'] == true;
    if (bossDone) boss?.hp = 0;
    final cp = integer(s['checkpoint'], -1, checkpoints.length - 1, -1);
    if (cp >= 0) {
      checkpoint = cp;
      final c = checkpoints[cp]..lit = true;
      player.x = player.spawnX = c.x;
      player.y = player.spawnY = c.y;
    }
    dirty = false;
  }
  final Json data;
  /// Receives the name of each sound effect at the moment it happens.
  void Function(String sound)? onSound;
  void sound(String name) => onSound?.call(name);
  final InputState input = InputState();
  final math.Random random = math.Random(42);
  List<dynamic> get areas => data['areas'] as List;
  List<dynamic> get skins => data['skins'] as List;
  Json get area => areas[areaIndex] as Json;
  Json get skin => skins[skinIndex] as Json;
  Json get physics => data['physics'] as Json;
  double phys(String key) => number(physics, key);
  int areaIndex = 0, skinIndex = 0, unlocked = 1, checkpoint = -1, secrets = 0;
  late List<double> best;
  late Player player;
  late List<List<String>> grid;
  Foe? boss;
  final List<Foe> enemies = [];
  final List<Thing> targets = [], pickups = [], checkpoints = [],
      anchors = [], hints = [], decor = [], vents = [], spawners = [];
  final List<Platform> platforms = [];
  final List<Projectile> projectiles = [];
  final List<Particle> particles = [];
  final Map<String, double> wax = {}, waxGone = {};
  Thing? exit;
  double? gateLeft, gateRight;
  bool paused = false, cleared = false, bossDone = false, dirty = false;
  double time = 0, areaTime = 0, eclipse = 0, toastTime = 4, shake = 0;
  String toast = '';
  static const targetGlyphs = 'BMoerRFVO!TZfNJYG';
  static const tiles = '#=pSD|uqdb^~v:';
  int get targetsLeft => targets.where((t) => !t.weak && t.glyph != 'G' && !t.lit).length;
  bool get sealOpen => targetsLeft == 0;
  int get maxHearts => (skin['hearts'] as num).toInt();
  Iterable<Foe> get foes sync* {
    yield* enemies.where((e) => !e.dead);
    if (boss != null && boss!.active && !boss!.dead) yield boss!;
  }
  Iterable<Foe> get visibleFoes => foes.where((e) =>
      (e.x - player.x).abs() < 14 && (e.y - player.y).abs() < 9);
  static int integer(dynamic v, int lo, int hi, int fallback) =>
      v is int && v >= lo && v <= hi ? v : fallback;

  void loadArea(int index) {
    areaIndex = index.clamp(0, areas.length - 1);
    grid = (area['grid'] as List).map((r) => (r as String).split('')).toList();
    enemies.clear(); targets.clear(); pickups.clear(); checkpoints.clear();
    anchors.clear(); hints.clear(); decor.clear(); vents.clear(); spawners.clear();
    platforms.clear(); projectiles.clear(); particles.clear(); wax.clear(); waxGone.clear();
    boss = null; exit = null; gateLeft = gateRight = null;
    bossDone = cleared = false; checkpoint = -1; secrets = 0;
    time = areaTime = eclipse = 0;
    player = Player(3.5, 39, maxHearts);
    for (var y = 0; y < 40; y++) {
      for (var x = 0; x < 180; x++) {
        final ch = grid[y][x];
        if (ch == 'H' || ch == 'U') {
          var w = 1;
          while (x + w < 180 && grid[y][x + w] == ch) { w++; }
          platforms.add(Platform(x.toDouble(), y.toDouble(), w.toDouble(), ch == 'U'));
          for (var i = 0; i < w; i++) { grid[y][x + i] = '.'; }
          continue;
        }
        if (tiles.contains(ch)) {
          if (ch == '|') {
            gateLeft = math.min(gateLeft ?? x.toDouble(), x.toDouble());
            gateRight = math.max(gateRight ?? x.toDouble(), x.toDouble());
          }
          continue;
        }
        grid[y][x] = '.';
        if (ch == '.') continue;
        final t = Thing(ch, x + .5, y + 1.0);
        if (targetGlyphs.contains(ch)) {
          t.y -= .5;
          targets.add(t);
          continue;
        }
        switch (ch) {
          case 'P': player = Player(t.x, t.y, maxHearts);
          case 'E': exit = t;
          case '&':
            final name = area['boss'];
            final def = (data['bosses'] as Json)[name];
            if (def is Json) {
              boss = Foe(name as String, def, t.x,
                  def['still'] == true ? 13.4 : def['fly'] == true ? 9 : t.y, boss: true);
            }
          case 'C': case 'X': checkpoints.add(t);
          case '?': hints.add(t);
          case 'A': case 'Q': t.y -= .5; anchors.add(t);
          case '*': case '@': case '\$': case 'n': case 'L': case 'I': pickups.add(t);
          case 's': vents.add(t);
          case 'W': case '_': decor.add(t);
          case '+': t.y -= .5; spawners.add(t);
          default:
            final type = ch == 'a' ? area['monster']
                : '123'.contains(ch) ? (area['extra'] as List)[int.parse(ch) - 1]
                : (data['enemyGlyphs'] as Json)[ch];
            if (type is String) spawn(type, t.x, t.y);
        }
      }
    }
    input.clear();
    notify('${areaIndex + 1}. ${area['name']} — ${area['hint']}', 5);
    dirty = true;
  }

  void spawn(String type, double x, double y) {
    final def = (data['enemies'] as Json)[type];
    if (def is Json) enemies.add(Foe(type, def, x, y));
  }
  void notify(String message, [double duration = 2.4]) {
    toast = message; toastTime = duration;
  }
  Json save() => {
    'version': 1, 'area': areaIndex, 'skin': skinIndex, 'unlocked': unlocked,
    'checkpoint': checkpoint, 'bossDone': bossDone, 'best': best,
    'lit': [for (var i = 0; i < targets.length; i++)
      if (targets[i].lit && !targets[i].weak) i],
    'allCleared': areaIndex == 19 && cleared,
  };
  void pickSkin(int index) {
    skinIndex = index.clamp(0, skins.length - 1);
    player.maxHp = maxHearts; player.hp = maxHearts;
    player.skillCd = 0; projectiles.clear(); dirty = true;
  }
  void respawn() {
    player = Player(player.spawnX, player.spawnY, maxHearts)..inv = 1.5;
    projectiles.clear();
    if (boss != null && !bossDone) {
      final b = boss!;
      boss = Foe(b.type, b.data, b.homeX, b.homeY, boss: true);
    }
    input.clear(); cleared = false; paused = false;
  }
  String tile(int x, int y) => x < 0 || x >= 180 || y < 0 || y >= 40 ? '#' : grid[y][x];
  int tileType(int x, int y) {
    return switch (tile(x, y)) {
      '#' || 'D' || 'b' => 1,
      '=' || 'p' => 2,
      'S' => sealOpen ? 2 : 1,
      '|' => boss?.active == true && !bossDone ? 1 : 0,
      'u' => (waxGone['$x,$y'] ?? 0) > 0 ? 0 : 2,
      'q' => (time / 3.2 + x * .045) % 1 < .62 ? 2 : 0,
      'd' => eclipse > 0 ? 2 : 0,
      _ => 0,
    };
  }
  bool overlaps(Body b, String ch) {
    for (var y = (b.y - b.h + .2).floor(); y <= (b.y - .2).floor(); y++) {
      for (var x = (b.x - b.w / 2 + .2).floor(); x <= (b.x + b.w / 2 - .2).floor(); x++) {
        if (tile(x, y) == ch) return true;
      }
    }
    return false;
  }
  void move(Body b, double dt, {bool drop = false}) {
    final steps = math.max(1, (math.max((b.vx * dt).abs(), (b.vy * dt).abs()) / .3).ceil());
    b.grounded = false; b.wall = 0;
    for (var i = 0; i < steps; i++) {
      b.x += b.vx * dt / steps;
      final cx = (b.x + (b.vx > 0 ? b.w / 2 : -b.w / 2)).floor();
      for (var y = (b.y - b.h + .02).floor(); y <= (b.y - .02).floor(); y++) {
        if (b.vx != 0 && tileType(cx, y) == 1) {
          b.wall = b.vx > 0 ? 1 : -1;
          b.x = b.vx > 0 ? cx - b.w / 2 - .0005 : cx + 1 + b.w / 2 + .0005;
          b.vx = 0; break;
        }
      }
      final prev = b.y;
      b.y += b.vy * dt / steps;
      final cy = (b.vy >= 0 ? b.y : b.y - b.h).floor();
      for (var x = (b.x - b.w / 2 + .02).floor(); x <= (b.x + b.w / 2 - .02).floor(); x++) {
        final t = tileType(x, cy);
        if (b.vy >= 0 && (t == 1 || t == 2 && !drop && prev <= cy + .001)) {
          b.y = cy.toDouble(); b.vy = 0; b.grounded = true; break;
        } else if (b.vy < 0 && t == 1) {
          b.y = cy + 1 + b.h; b.vy = 0; break;
        }
      }
    }
    b.x = b.x.clamp(b.w / 2, 180 - b.w / 2);
    b.y = b.y.clamp(b.h, 40);
  }

  void update(double dt) {
    if (paused || cleared) return;
    // Fixed substeps prevent projectiles and bodies skipping narrow targets.
    var left = math.min(dt, .1);
    while (left > .000001) {
      final step = math.min(left, 1 / 120);
      tick(step);
      left -= step;
    }
  }
  void tick(double dt) {
    time += dt; areaTime += dt;
    toastTime = math.max(0, toastTime - dt);
    eclipse = math.max(0, eclipse - dt);
    shake = math.max(0, shake - dt * 1.8);
    for (final pl in platforms) { pl.update(time); }
    updatePlayer(dt);
    updateLevel(dt);
    for (final e in List<Foe>.of(enemies)) { updateEnemy(e, dt); }
    updateBoss(dt);
    if (!player.dead) {
      if (input.attack) { throwKuro(); }
      if (input.skill) { castSkill(); }
    }
    input.attack = input.skill = false;
    updateProjectiles(dt);
    for (final p in particles) {
      p.life -= dt; p.vy += 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    particles.removeWhere((p) => p.life <= 0);
    enemies.removeWhere((e) => e.dead && e.death <= 0);
    if (exit != null && (boss == null || bossDone) && !player.dead &&
        (player.x - exit!.x).abs() < 1 && (player.y - exit!.y).abs() < 2) {
      cleared = true; sound('clear');
      unlocked = math.max(unlocked, math.min(areas.length, areaIndex + 2));
      if (best[areaIndex] == 0 || areaTime < best[areaIndex]) best[areaIndex] = areaTime;
      dirty = true; input.clear();
    }
  }
  void updatePlayer(double dt) {
    final p = player;
    p.inv = math.max(0, p.inv - dt); p.hurt = math.max(0, p.hurt - dt);
    p.dashCd = math.max(0, p.dashCd - dt);
    p.skillCd = math.max(0, p.skillCd - dt);
    p.skillTime = math.max(0, p.skillTime - dt);
    p.throwTime = math.max(0, p.throwTime - dt);
    p.catchTime = math.max(0, p.catchTime - dt);
    p.mist = math.max(0, p.mist - dt); p.frenzy = math.max(0, p.frenzy - dt);
    p.wallLock = math.max(0, p.wallLock - dt); p.drop = math.max(0, p.drop - dt);
    if (p.dead) {
      p.death -= dt;
      if (p.death <= 0) respawn();
      return;
    }
    if (p.pull != null) {
      final a = p.pull!;
      final dx = a.x - p.x, dy = a.y - p.y;
      final d = math.sqrt(dx * dx + dy * dy);
      if (d < .6) {
        p.pull = null; p.vy = -9; p.jumps = 1; projectiles.removeWhere((k) => k.kuro);
      } else {
        p.vx = dx / d * 26; p.vy = dy / d * 26; move(p, dt);
        if (p.wall != 0) p.pull = null;
      }
      return;
    }
    p.water = overlaps(p, '~');
    if (p.grounded) { p.coyote = phys('coyote'); p.jumps = 0; }
    else { p.coyote = math.max(0, p.coyote - dt); }
    if (input.jump || input.dash) {
      for (final k in projectiles) {
        if (k.kuro && k.anchor != null) {
          p.pull = k.anchor; sound('pull'); input.jump = input.dash = false; return;
        }
      }
    }
    p.jumpBuffer = input.jump ? phys('jumpBuffer') : math.max(0, p.jumpBuffer - dt);
    input.jump = false;
    if (input.dash && p.dashCd <= 0) startDash();
    input.dash = false;
    final wall = p.wall;
    if (p.dash > 0) {
      p.dash -= dt; p.vy = 0;
      if (p.dash <= 0) p.vx *= .35;
    } else if (p.hurt <= 0 && p.wallLock <= 0) {
      final speed = phys('runSpeed') * number(skin, 'speed', 1) *
          (p.water ? .7 : 1) * (overlaps(p, ':') ? .45 : 1);
      final dv = input.axis * speed - p.vx;
      p.vx += dv.sign * math.min(dv.abs(), phys(p.grounded ? 'groundAccel' : 'airAccel') * dt);
      if (input.axis.abs() > .15) p.facing = input.axis.sign.toInt();
    }
    if (p.jumpBuffer > 0 && p.dash <= 0) {
      if (p.grounded && input.down && tileType(p.x.floor(), (p.y + .05).floor()) == 2) {
        p.y += .12; p.drop = .25; p.jumpBuffer = 0;
      } else if (p.water || p.grounded || p.coyote > 0) {
        p.vy = p.water ? -10.5 : -phys('jumpV');
        p.grounded = false; p.coyote = 0; p.jumps = 1; p.jumpBuffer = 0; sound('jump');
      } else if (wall != 0) {
        p.vy = -phys('jumpV') * .95; p.vx = -wall * phys('wallJumpVX');
        p.facing = -wall; p.wallLock = .16; p.jumps = 1; p.jumpBuffer = 0; sound('jump');
      } else if (p.jumps < number(skin, 'jumps', 2)) {
        p.vy = -phys('airJumpV'); p.jumps = math.max(2, p.jumps + 1); p.jumpBuffer = 0; sound('jump');
        burst(p.x, p.y, skin['color'] as String);
      }
    }
    if (p.dash <= 0) {
      if (!input.jumpHeld && p.vy < -6 && !p.water) p.vy += phys('gravity') * 1.2 * dt;
      p.glide = skin['glide'] == true && input.jumpHeld && p.vy > 0 && !p.grounded;
      final maxFall = p.water ? 4.0 : p.glide ? 3.0 :
          wall != 0 && input.axis.sign == wall && p.vy > 0 ? phys('wallSlide') : phys('maxFall');
      p.vy = math.min(maxFall, p.vy + phys('gravity') * number(area, 'gravity', 1) * (p.water ? .3 : 1) * dt);
      if (overlaps(p, 'v')) p.vy = math.max(-11, p.vy - 70 * dt);
    }
    if (p.platform != null && p.grounded) {
      p.x += p.platform!.dx; p.y += p.platform!.dy;
    }
    final prevY = p.y;
    move(p, dt, drop: p.drop > 0);
    p.platform = null;
    for (final pl in platforms) {
      if (p.vy >= 0 && !input.down && p.x + p.w / 2 > pl.x && p.x - p.w / 2 < pl.x + pl.w &&
          prevY <= pl.y + .06 && p.y >= pl.y - .02) {
        p.y = pl.y; p.vy = 0; p.grounded = true; p.platform = pl;
      }
    }
    if (overlaps(p, '^') || p.y >= 39.95 || area['toxic'] == true && p.y > toxicLevel + .4) {
      hurtPlayer(p.x - p.facing); p.vy = -13;
    }
  }
  double get toxicLevel {
    final t = (time % 12) / 12;
    final h = t < .35 ? 0 : t < .5 ? (t - .35) / .15 : t < .78 ? 1 :
        t < .93 ? 1 - (t - .78) / .15 : 0;
    return 39.05 - h * 3.3;
  }
  void startDash({bool long = false}) {
    sound('dash');
    player.dash = phys('dashTime') * (long ? 2.2 : 1);
    player.dashCd = phys('dashCooldown');
    player.vx = player.facing * phys('dashSpeed'); player.vy = 0;
    burst(player.x, player.cy, skin['color'] as String);
  }
  void hurtPlayer(double fromX) {
    final p = player;
    if (p.dead || p.inv > 0 || p.mist > 0 || p.dash > 0 && skin['dashPhase'] == true) return;
    p.hp--; p.inv = phys('invuln'); p.hurt = .22; sound('hurt');
    p.vx = (p.x >= fromX ? 1 : -1) * 6; p.vy = -5; shake = .35;
    burst(p.x, p.cy, '#ff3b6a');
    if (p.hp <= 0) { p.death = 1.1; sound('death'); notify('Coba lagi!'); }
  }
  void burst(double x, double y, String color, [int count = 10]) {
    for (var i = 0; i < count && particles.length < 400; i++) {
      final a = random.nextDouble() * math.pi * 2;
      final v = 2 + random.nextDouble() * 5;
      particles.add(Particle(x, y, math.cos(a) * v, math.sin(a) * v - 2, color, .45));
    }
  }

  void updateLevel(double dt) {
    final p = player;
    for (final key in waxGone.keys.toList()) { waxGone[key] = math.max(0, waxGone[key]! - dt); }
    if (p.grounded && tile(p.x.floor(), p.y.floor()) == 'u') {
      final y = p.y.floor();
      var x0 = p.x.floor(), x1 = x0;
      while (tile(x0 - 1, y) == 'u') { x0--; }
      while (tile(x1 + 1, y) == 'u') { x1++; }
      final key = '$x0,$y';
      wax[key] = (wax[key] ?? 0) + dt;
      if (wax[key]! >= 1.4) {
        sound('melt');
        for (var x = x0; x <= x1; x++) { waxGone['$x,$y'] = 3.5; }
        wax[key] = 0;
      }
    }
    for (final t in targets) {
      if (t.timer > 0) { t.timer -= dt; if (t.timer <= 0) t.lit = false; }
      if (t.glyph == 'Y' && !t.lit && (p.x - t.x).abs() < 8 &&
          (p.cy - t.y).abs() < 4 && (time + t.x) % 4.5 < 2.6) {
        if ((time * 1.1).floor() != ((time - dt) * 1.1).floor()) {
          fireEnemy(t.x, t.y, '#ff2a2a');
        }
      }
    }
    for (final v in vents) {
      if ((time + v.x * .13) % 2.6 < .9 && (p.x - v.x).abs() < .8 &&
          p.y <= v.y + .05 && p.y > v.y - 4.5) p.vy = math.min(p.vy, -17);
    }
    for (final sp in spawners) {
      if (!sp.taken && (p.x - sp.x).abs() < 2.2 && p.y > sp.y && p.y - sp.y < 9) {
        sp.taken = true; spawn('cocoon', sp.x, sp.y + 1);
      }
    }
    if (p.dead) return;
    for (final pk in pickups) {
      if (!pk.taken && p.near(pk.x, pk.y - .5, .5)) {
        pk.taken = true; sound(pk.glyph == '*' || pk.glyph == '@' ? 'pickup' : 'secret');
        if (pk.glyph == '*') { p.hp = math.min(p.maxHp, p.hp + 1); }
        else if (pk.glyph == '@') { p.hp = p.maxHp; }
        else { secrets++; notify(pk.glyph == '\$' ? 'Rune!' : 'Gulungan!'); }
        burst(pk.x, pk.y - .5, '#ffe27a');
      }
    }
    for (var i = 0; i < checkpoints.length; i++) {
      final c = checkpoints[i];
      if (!c.lit && (p.x - c.x).abs() < 1 && (p.y - c.y).abs() < 1.6) {
        for (final other in checkpoints) { other.lit = false; }
        c.lit = true; checkpoint = i; sound('checkpoint');
        p.spawnX = c.x; p.spawnY = c.y; p.hp = p.maxHp;
        dirty = true; notify('Titik simpan');
      }
    }
    for (final h in hints) {
      if (!h.taken && (p.x - h.x).abs() < 1.6 && (p.y - h.y).abs() < 1.6) {
        h.taken = true; notify(area['hint'] as String, 4);
      }
    }
  }
  void light(Thing t) {
    if (t.lit) return;
    t.lit = true; burst(t.x, t.y, area['accent'] as String);
    sound(t.weak ? 'clink' : t.glyph == 'B' || t.glyph == 'N' ? 'bell' : 'sigil');
    if (t.glyph == 'G') { eclipse = t.timer = 10; notify('Gerhana! Lantai bayangan muncul.'); }
    else if (t.weak) {
      t.timer = 8;
      if (boss?.active == true && !boss!.dead) {
        boss!.root = 2.4; boss!.hp = math.max(1, boss!.hp - boss!.maxHp * .1);
      }
    } else {
      dirty = true;
      if (sealOpen) sound('seal');
      notify(sealOpen ? 'Segel terbuka! Naik ke atas.' : '$targetsLeft lagi');
    }
  }

  void throwKuro() {
    final live = projectiles.where((k) => k.kuro).toList();
    if (live.isNotEmpty) {
      for (final k in live) {
        k.returning = true; k.lodged = false; k.anchor = null; k.hit.clear();
      }
      player.throwTime = .3; sound('recall'); return;
    }
    final p = player;
    var dx = input.aimX != null ? input.aimX! - p.x : p.facing.toDouble();
    var dy = input.aimY != null ? input.aimY! - p.cy : input.vertical.abs() > .35 ? input.vertical : 0.0;
    if (input.aimX == null && input.axis.abs() < .2 && dy != 0) dx = 0;
    final a = math.atan2(dy, dx);
    final count = number(skin, 'kuroCount', 1).toInt();
    for (var i = 0; i < count; i++) {
      final angle = a + (i - (count - 1) / 2) * .2;
      projectiles.add(Projectile(p.x, p.cy, math.cos(angle) * 24, math.sin(angle) * 24,
        kuro: true, life: 30, radius: .45, damage: number(skin, 'dmg', 1) * (p.charged ? 2 : 1),
        hitsLeft: number(skin, 'hits', 1).toInt(), pierce: skin['pierce'] == true,
        color: skin['color'] as String));
    }
    p.charged = false; p.throwTime = .3; sound('throw');
  }
  void damage(Foe e, double amount, {bool secondary = false}) {
    if (e.dead) return;
    e.hp -= amount * (e.boss ? number(skin, 'bossMult', 1) : 1) * (player.frenzy > 0 ? 2 : 1);
    e.hurt = .22; burst(e.x, e.cy, skin['color'] as String, 5); sound('hit');
    if (!secondary) {
      player.hits++;
      if (skin['burn'] == true) e.burn = 2;
      if (skin['slow'] == true) e.slow = 2;
      final heal = number(skin, 'hitHeal').toInt();
      if (player.frenzy > 0 || heal > 0 && player.hits % heal == 0) {
        player.hp = math.min(player.maxHp, player.hp + 1);
      }
      var chain = number(skin, 'chain').toInt();
      for (final other in foes.toList()) {
        if (chain > 0 && other != e && (other.x - e.x).abs() < 5 && (other.y - e.y).abs() < 4) {
          damage(other, 1, secondary: true); chain--;
        }
      }
    }
    if (e.dead) {
      e.death = .6; player.kills++; sound('die');
      final heal = number(skin, 'killHeal').toInt();
      if (heal > 0 && player.kills % heal == 0) player.hp = math.min(player.maxHp, player.hp + 1);
      if (e.boss) {
        bossDone = true; e.active = false; dirty = true; shake = .8;
        notify('Boss dikalahkan! Menuju gerbang di kiri.', 4);
      } else if (e.data['split'] == true && !secondary) {
        spawn(e.data['splitInto'] as String? ?? 'moss_skitter', e.x - .6, e.y);
        spawn(e.data['splitInto'] as String? ?? 'moss_skitter', e.x + .6, e.y);
      }
    }
  }
  void updateProjectiles(double dt) {
    for (final k in List<Projectile>.of(projectiles)) {
      k.life -= dt;
      if (k.kuro && k.returning) {
        final dx = player.x - k.x, dy = player.cy - k.y;
        final d = math.sqrt(dx * dx + dy * dy);
        if (d < .75) {
          k.life = 0; player.catchTime = .25; sound('catch');
          if (d < 2.3) player.charged = true;
          continue;
        }
        final speed = math.min(32.0, 20 + d);
        k.vx = dx / d * speed; k.vy = dy / d * speed;
      }
      if (k.homing) {
        final list = visibleFoes.where((e) => !k.hit.contains(e)).toList()
          ..sort((a, b) => distance(a.x - k.x, a.cy - k.y).compareTo(distance(b.x - k.x, b.cy - k.y)));
        if (list.isNotEmpty) {
          final e = list.first, d = math.max(.01, distance(list.first.x - k.x, list.first.cy - k.y));
          k.vx += ((e.x - k.x) / d * 16 - k.vx) * dt * 5;
          k.vy += ((e.cy - k.y) / d * 16 - k.vy) * dt * 5;
        }
      }
      if (!k.lodged) { k.x += k.vx * dt; k.y += k.vy * dt; }
      k.distance += distance(k.vx, k.vy) * dt;
      if (k.kuro && !k.returning && !k.lodged && k.distance >= 9) {
        sound('clink');
        k.lodged = true; k.vx = k.vy = 0;
      }
      if (k.hostile) {
        if (player.near(k.x, k.y, k.radius)) { hurtPlayer(k.x); k.life = 0; }
      } else {
        for (final t in targets) {
          if (!t.lit && distance(t.x - k.x, t.y - k.y) < .8) light(t);
        }
        if (k.kuro && !k.returning) {
          for (final a in anchors) {
            if (distance(a.x - k.x, a.y - k.y) < .8) {
              k.anchor = a; k.lodged = true; k.x = a.x; k.y = a.y; sound('anchor');
            }
          }
        }
        if (!k.lodged || k.returning) {
          for (final e in foes.toList()) {
            if (!k.hit.contains(e) && e.near(k.x, k.y, k.radius)) {
              // Shielded enemies can be hit from behind or by returning Kuro.
              if (e.data['shield'] == true && !k.returning && (k.x - e.x).sign == e.direction) {
                if (k.kuro) k.returning = true; else { k.life = 0; }
                continue;
              }
              k.hit.add(e); damage(e, k.damage);
              if (!k.pierce && !k.returning && --k.hitsLeft <= 0) {
                if (k.kuro) { k.returning = true; k.hit.clear(); } else { k.life = 0; }
                break;
              }
            }
          }
        }
      }
      final tx = k.x.floor(), ty = k.y.floor();
      final ch = tile(tx, ty);
      if (!k.hostile && ('Db:'.contains(ch))) {
        if (tx >= 0 && tx < 180 && ty >= 0 && ty < 40) {
          grid[ty][tx] = '.'; burst(k.x, k.y, '#ffe2aa'); sound('break');
        }
      } else if (tileType(tx, ty) == 1 && !k.returning &&
          !(k.kuro && skin['wallPass'] == true)) {
        if (k.kuro) { sound('clink'); k.lodged = true; k.vx = k.vy = 0; } else { k.life = 0; }
      }
    }
    projectiles.removeWhere((k) => k.life <= 0);
  }
  static double distance(double x, double y) => math.sqrt(x * x + y * y);
  void castSkill() {
    final p = player;
    if (p.skillCd > 0 || p.dead) return;
    final skill = skin['skill'] as Json;
    p.skillCd = number(skill, 'cd'); p.skillTime = .45;
    final id = skill['id'];
    void shot(double vx, double vy, double dmg, {bool homing = false, double life = 1.2}) {
      projectiles.add(Projectile(p.x, p.cy, vx, vy, damage: dmg,
        pierce: !homing, homing: homing, life: life, radius: .55,
        color: skin['color'] as String));
    }
    switch (id) {
      case 'echo': shot(p.facing * 22.0, 0, 3, life: .9);
      case 'ashstep':
        startDash(long: true);
        for (var i = 0; i < 8; i++) {
          projectiles.add(Projectile(p.x + p.facing * i, p.cy, 0, 0,
            damage: 1, life: 1.4, pierce: true, color: '#ff8a2a'));
        }
      case 'feathers':
        for (var i = 0; i < 8; i++) { shot(math.cos(i * math.pi / 4) * 16, math.sin(i * math.pi / 4) * 16, 2, life: .7); }
      case 'slam': shot(-15, 0, 4, life: .8); shot(15, 0, 4, life: .8); shake = .6;
      case 'mist': p.mist = 3;
      case 'web':
        for (final e in visibleFoes) { if (e.boss) { e.slow = 3; } else { e.root = 3; } }
      case 'harvest':
        for (final e in visibleFoes.toList()) {
          if (distance(e.x - p.x - p.facing * 1.2, e.cy - p.cy) < 3.6) damage(e, 5);
        }
        p.hp = math.min(p.maxHp, p.hp + 1);
      case 'thunder':
        final list = visibleFoes.toList()..sort((a, b) =>
            distance(a.x - p.x, a.y - p.y).compareTo(distance(b.x - p.x, b.y - p.y)));
        for (final e in list.take(5)) { damage(e, e.boss ? 6 : 5); }
        shake = .5;
      case 'foxfire':
        for (var i = 0; i < 9; i++) {
          final a = -math.pi / 2 + (i - 4) * .32;
          shot(math.cos(a) * 9, math.sin(a) * 9, 2, homing: true, life: 2.4);
        }
      case 'frenzy': p.frenzy = 5;
      case 'eclipse':
        eclipse = 6; shake = 1;
        for (final e in visibleFoes.toList()) {
          damage(e, e.boss ? e.maxHp * .25 / number(skin, 'bossMult', 1) : e.hp + 99);
        }
    }
    burst(p.x, p.cy, skin['color'] as String, 24);
    sound(id == 'thunder' ? 'thunder' : id == 'slam' ? 'slam' : 'skill');
    notify(skill['name'] as String, 1.3);
  }

  void fireEnemy(double x, double y, String color, {double angle = 0}) {
    sound('shot');
    final a = math.atan2(player.cy - y, player.x - x) + angle;
    projectiles.add(Projectile(x, y, math.cos(a) * 10, math.sin(a) * 10,
      hostile: true, color: color, life: 2.5, radius: .25));
  }
  void updateEnemy(Foe e, double dt) {
    e.hurt = math.max(0, e.hurt - dt);
    if (e.dead) { e.death -= dt; return; }
    if ((e.x - player.x).abs() > 25 || (e.y - player.y).abs() > 16) return;
    e.root = math.max(0, e.root - dt); e.slow = math.max(0, e.slow - dt);
    if (e.burn > 0) {
      e.burn -= dt; e.burnTick += dt;
      if (e.burnTick > .6) { e.burnTick = 0; damage(e, 1, secondary: true); }
    }
    if (e.root > 0 || e.dead) return;
    final step = dt * (e.slow > 0 ? .5 : 1);
    e.timer += step; e.cooldown -= step;
    final dx = player.x - e.x, dy = player.cy - e.cy;
    final sees = dx.abs() < 11 && dy.abs() < 5;
    final speed = number(e.data, 'speed', 2);
    if (e.flying) {
      if (sees) {
        final dist = math.max(.01, distance(dx, dy));
        e.vx = dx / dist * speed; e.vy = dy / dist * speed;
        e.direction = dx >= 0 ? 1 : -1;
      } else {
        e.vx = math.cos(e.timer) * speed * .4;
        e.vy = math.sin(e.timer * 2) * .6;
      }
      e.x += e.vx * step; e.y += e.vy * step;
    } else {
      if (e.wall != 0 || e.grounded && tileType((e.x + e.direction * (e.w / 2 + .4)).floor(), (e.y + .1).floor()) == 0) {
        e.direction *= -1;
      } else if (sees && e.cooldown <= 0) { e.direction = dx >= 0 ? 1 : -1; }
      e.vx = e.direction * speed;
      if (e.data['ai'] == 'shooter') e.vx *= .3;
      if (e.data['ai'] == 'hopper' && e.grounded && e.cooldown <= 0) {
        e.vy = -number(e.data, 'hopV', 10); e.cooldown = 1.4;
      }
      e.vy = math.min(22, e.vy + 40 * step); move(e, step);
    }
    if ((e.data['ai'] == 'shooter' || e.data['shooter'] == true) && sees && e.cooldown <= 0) {
      fireEnemy(e.x, e.cy, e.data['shot'] as String? ?? '#ff8b62'); e.cooldown = 2.2;
    }
    if (!player.dead && player.near(e.x, e.cy, math.min(e.w, e.h) * .4)) hurtPlayer(e.x);
  }
  void updateBoss(double dt) {
    final b = boss;
    if (b == null || bossDone) return;
    final p = player;
    if (!b.active) {
      if (!p.dead && p.y <= 15.05 && p.grounded &&
          p.x > (gateLeft ?? 120) + 1.4 && p.x < (gateRight ?? 178) - .4) {
        b.active = true; b.cooldown = 1.5; sound('roar'); notify(b.data['name'] as String); shake = .7;
      }
      return;
    }
    if (b.dead) return;
    b.hurt = math.max(0, b.hurt - dt); b.root = math.max(0, b.root - dt);
    b.slow = math.max(0, b.slow - dt);
    if (b.root > 0) return;
    final step = dt * (b.slow > 0 ? .5 : 1);
    b.timer += step; b.cooldown -= step;
    b.phase = b.data['phases'] == true ? (b.hp / b.maxHp < .33 ? 3 : b.hp / b.maxHp < .66 ? 2 : 1) : 1;
    b.direction = p.x >= b.x ? 1 : -1;
    if (b.cooldown <= 0) {
      final attack = (b.timer / 2).floor() % 3;
      b.state = ['lunge', 'slam', 'shoot'][attack];
      if (attack == 0) sound('whoosh');
      if (attack == 1) sound('roar');
      b.cooldown = 2.4 / b.phase;
      if (b.type == 'shadow_shuri') b.x = (p.x - p.facing * 3).clamp(122, 177);
      if (attack == 0 && b.data['still'] != true) {
        b.vx = b.direction * number(b.data, 'speed', 5) * 2;
        if (!b.flying) b.vy = -8;
      } else if (attack == 1 && !b.flying) {
        b.vy = -15; b.vx = b.direction * 3;
      } else {
        for (var i = -b.phase; i <= b.phase; i++) {
          fireEnemy(b.x, b.cy, b.data['shot'] as String? ?? '#ff6b4a', angle: i * .2);
        }
      }
    }
    if (b.flying) {
      if (b.data['still'] != true) {
        b.x += (p.x - b.x).sign * number(b.data, 'speed', 4) * step * .4;
        b.y = b.homeY + math.sin(time * 1.4) * 1.5;
      }
    } else {
      b.vy = math.min(22, b.vy + 40 * step);
      final falling = b.vy;
      move(b, step);
      if (b.grounded && falling > 10 && b.state == 'slam') {
        shake = .7;
        sound('slam');
        for (final dir in [-1, 1]) {
          projectiles.add(Projectile(b.x, b.y - .35, dir * 12.0, 0,
            hostile: true, radius: .5, life: 2, color: b.data['shot'] as String? ?? '#ff8a2a'));
        }
        b.state = 'idle';
      }
      b.vx *= math.pow(.12, step).toDouble();
    }
    b.x = b.x.clamp((gateLeft ?? 120) + b.w / 2 + 1, (gateRight ?? 179) - b.w / 2);
    if (!p.dead && p.near(b.x, b.cy, math.min(b.w, b.h) * .4)) hurtPlayer(b.x);
  }
}
