import 'dart:math' as math;
import 'dart:ui' as ui;

import 'model.dart';
import 'simulation.dart';
import 'sprites.dart';

// Port of game js/game/render.js. Terrain is drawn in code as black silhouettes
// with a glowing rim in the area's accent; characters, monsters, bosses and
// props are sprite sheets. The camera is the one transform everything shares.

const double _playerDraw = 2.55;
const int _cols = 180;
const int _rows = 40;

const List<String> _shadowProps = [
  'old_well', 'hanging_cocoon', 'lantern_unlit', 'lantern_lit', 'wax_candle',
  'flesh_pod', 'string_spool', 'wall_eye_open', 'wall_eye_closed',
  'eclipse_bell', 'shadow_gate', 'shadow_shrine',
];

// Target glyph -> kind, as the area legend in areas.js names them.
const Map<String, String> _targetKind = {
  'B': 'bell', 'M': 'magnet', 'o': 'core', 'e': 'emitter', 'R': 'mirror',
  'r': 'receiver', 'F': 'furnace', 'V': 'valve', 'O': 'orb', '!': 'sigil',
  'T': 'terminal', 'Z': 'rod', 'f': 'flood', 'N': 'lantern', 'J': 'spool',
  'Y': 'eye', 'G': 'eclipse',
};
const Map<String, (String, int)> _skyTargetArt = {
  'bell': ('MECH_A', 0), 'magnet': ('MECH_A', 1), 'core': ('MECH_A', 2),
  'furnace': ('MECH_A', 3), 'valve': ('MECH_B', 1), 'sigil': ('MECH_B', 2),
  'rod': ('MECH_B', 3),
};
const Map<String, (int, int)> _propTargetArt = {
  'terminal': (1, 2), 'mirror': (1, 0), 'receiver': (3, 4), 'emitter': (2, 4),
  'orb': (1, 1), 'flood': (3, 1),
};
const Map<String, int> _bossRow = {'idle': 0, 'lunge': 1, 'slam': 2, 'shoot': 3};

// Sheet rows and columns (config.js ANIM).
const int _moveIdle = 0, _moveRun = 1, _moveJump = 2, _moveFall = 3;
const int _combatThrow = 0, _combatCatch = 2;
const int _agilityDash = 0, _agilityWall = 1, _agilityFlip = 2;
const int _skillsLunge = 0, _skillsWave = 1, _skillsPower = 2, _skillsCast = 3;
const int _statusHurt = 0, _statusDeath = 1, _statusVictory = 2;
const int _extraShoot = 0;

ui.Color _hex(String hex, [double alpha = 1]) {
  final n = int.parse(hex.substring(1), radix: 16);
  return ui.Color(0xFF000000 | n).withValues(alpha: alpha);
}

ui.Color _rgba(int r, int g, int b, double a) => ui.Color.fromRGBO(r, g, b, a);

class WorldRenderer {
  WorldRenderer(this._sprites);

  final Sprites _sprites;
  late ui.Canvas _c;
  late Simulation _s;
  late Json _area;
  late double _t;
  late double _vw;
  late double _vh;
  late double _camL;
  late double _camT;
  int _x0 = 0, _x1 = 0, _y0 = 0, _y1 = 0;
  final ui.Paint _fill = ui.Paint();
  final ui.Paint _spritePaint = ui.Paint()..filterQuality = ui.FilterQuality.low;

  double get _time => _s.time;

  /// Draws one frame. [tile] is the size of one world unit in pixels.
  void draw(ui.Canvas canvas, double vw, double vh, Simulation s,
      double camX, double camY, double tile) {
    _c = canvas;
    _s = s;
    _area = s.area;
    _vw = vw;
    _vh = vh;
    _t = tile;
    _camL = camX - vw / tile / 2;
    _camT = camY - vh / tile / 2;
    final shadow = _area['world'] == 'shadow';
    _rect(0, 0, vw, vh, shadow ? _rgba(7, 6, 11, 1) : _rgba(13, 16, 24, 1));
    _backdrop(camX, camY);

    final sh = s.shake > 0 ? s.shake * 0.35 : 0.0;
    final ox = sh > 0 ? math.sin(s.time * 91) * sh : 0.0;
    final oy = sh > 0 ? math.cos(s.time * 77) * sh : 0.0;
    canvas.save();
    canvas.translate(ox * tile, oy * tile);
    canvas.scale(tile, tile);
    canvas.translate(-_camL, -_camT);
    _x0 = math.max(0, _camL.floor() - 1);
    _x1 = math.min(_cols - 1, (_camL + vw / tile).ceil() + 1);
    _y0 = math.max(0, _camT.floor() - 1);
    _y1 = math.min(_rows - 1, (_camT + vh / tile).ceil() + 1);

    _terrainBack();
    _props();
    _terrain();
    _pickups();
    _enemies();
    _boss();
    _kuros();
    _player();
    _shots();
    _particles();
    if (_area['toxic'] == true) _toxic();
    canvas.restore();

    final dark = (_area['dark'] as num?)?.toDouble() ?? 0;
    if (dark > 0) _darkness(dark);
    if (s.player.hurt > 0) {
      _rect(0, 0, vw, vh, _rgba(160, 0, 20, math.min(1, s.player.hurt / .22) * .5));
    }
  }

  // ------------------------------------------------------------ primitives
  void _rect(double x, double y, double w, double h, ui.Color color) {
    _c.drawRect(ui.Rect.fromLTWH(x, y, w, h), _fill..color = color);
  }

  void _circle(double x, double y, double r, ui.Color color) {
    _c.drawCircle(ui.Offset(x, y), r, _fill..color = color);
  }

  void _glow(double x, double y, double r, String hex, double a) {
    final color = _hex(hex);
    final paint = ui.Paint()
      ..shader = ui.Gradient.radial(ui.Offset(x, y), r, [
        color.withValues(alpha: a),
        color.withValues(alpha: 0),
      ]);
    _c.drawRect(ui.Rect.fromLTWH(x - r, y - r, r * 2, r * 2), paint);
  }

  void _lines(List<double> xy, ui.Color color, double width) {
    final path = ui.Path();
    for (var i = 0; i + 3 < xy.length; i += 4) {
      path.moveTo(xy[i], xy[i + 1]);
      path.lineTo(xy[i + 2], xy[i + 3]);
    }
    _c.drawPath(
      path,
      ui.Paint()
        ..color = color
        ..style = ui.PaintingStyle.stroke
        ..strokeWidth = width
        ..strokeCap = ui.StrokeCap.round,
    );
  }

  void _heart(double x, double y, double r, ui.Color color) {
    final path = ui.Path()
      ..moveTo(x, y + r)
      ..cubicTo(x - r * 1.6, y - r * .2, x - r * .6, y - r * 1.4, x, y - r * .5)
      ..cubicTo(x + r * .6, y - r * 1.4, x + r * 1.6, y - r * .2, x, y + r);
    _c.drawPath(path, ui.Paint()..color = color);
  }

  // ------------------------------------------------------------ sprites
  void _drawCell(ui.Image img, double sx, double sy, double sw, double sh,
      double cx, double bottom, double size, bool flip, double alpha,
      {ui.BlendMode blend = ui.BlendMode.srcOver, double shift = 0}) {
    final dh = size;
    final dw = size * (sw / sh);
    _c.save();
    _c.translate(cx, bottom - dh);
    if (flip) _c.scale(-1, 1);
    _c.drawImageRect(
      img,
      ui.Rect.fromLTWH(sx, sy, sw, sh),
      ui.Rect.fromLTWH(-dw / 2 + shift * dw, 0, dw, dh),
      _spritePaint
        ..color = _rgba(255, 255, 255, alpha)
        ..blendMode = blend,
    );
    _c.restore();
  }

  // Grid sheets: [cols] frames per row, rows follow from the aspect ratio. The
  // props atlas cells touch their neighbours, so its draws trim the top.
  bool _grid(String key, int cols, int row, int col, double cx, double bottom,
      double size, {bool flip = false, double alpha = 1,
      double? crop, ui.BlendMode blend = ui.BlendMode.srcOver}) {
    final img = _sprites.get(key);
    if (img == null) return false;
    final cut0 = crop ?? (key == 'PROPS_ATLAS' ? .14 : 0.0);
    final cw = img.width / cols;
    final rows = math.max(1, (img.height / cw).round());
    final ch = img.height / rows;
    final r = math.min(rows - 1, math.max(0, row));
    final c = math.min(cols - 1, math.max(0, col));
    final cut = ch * cut0;
    _drawCell(img, c * cw, r * ch + cut, cw, ch - cut, cx, bottom,
        size * (1 - cut0), flip, alpha,
        blend: blend, shift: _sprites.centerShift(key, r, c));
    return true;
  }

  // Framed sheets: cells are 320px at 56 + 384·i, padded by 32px each side.
  bool _framed(String key, int row, int col, double cx, double cy, double size,
      {bool flip = false, double alpha = 1}) {
    final img = _sprites.get(key);
    if (img == null) return false;
    const pad = 32.0;
    final k = _sprites.scale(key);
    final sx = math.max(0.0, (56 + 384 * col - pad) * k);
    final sy = math.max(0.0, (56 + 384 * row - pad) * k);
    final sw = (320 + pad * 2) * k;
    _drawCell(img, sx, sy, sw, sw, cx, cy + size / 2, size, flip, alpha);
    return true;
  }

  bool _shadowProp(String name, double cx, double bottom, double size,
      {double alpha = 1}) {
    final i = _shadowProps.indexOf(name);
    return _framed('SHADOW_PROPS', i ~/ 4, i % 4, cx, bottom - size / 2, size,
        alpha: alpha);
  }

  bool _inView(double x, double y, [double m = 3]) =>
      x > _x0 - m && x < _x1 + m && y > _y0 - m && y < _y1 + m;

  // ------------------------------------------------------------ backdrop
  void _backdrop(double camX, double camY) {
    final img = _sprites.get(_area['bg'] as String);
    if (img == null) return;
    final iw = img.width.toDouble();
    final ih = img.height.toDouble();
    // Cover the view, a little oversized, and pan across it with the camera.
    final sc = math.max(_vw / iw, _vh / ih) * 1.18;
    final w = iw * sc;
    final h = ih * sc;
    final vw = _vw / _t;
    final vh = _vh / _t;
    final px = _cols - vw > 0 ? (camX - vw / 2) / (_cols - vw) : .5;
    final py = _rows - vh > 0 ? (camY - vh / 2) / (_rows - vh) : .5;
    final shadow = _area['world'] == 'shadow';
    _c.drawImageRect(
      img,
      ui.Rect.fromLTWH(0, 0, iw, ih),
      ui.Rect.fromLTWH(-(w - _vw) * px, -(h - _vh) * py, w, h),
      ui.Paint()..color = _rgba(255, 255, 255, shadow ? .85 : .95),
    );
    // A soft veil so black silhouettes always read against the art.
    _rect(0, 0, _vw, _vh,
        shadow ? _rgba(8, 6, 14, .28) : _rgba(10, 14, 24, .12));
  }

  // ------------------------------------------------------------ terrain
  // Water, updrafts and webs sit behind the solid rock.
  void _terrainBack() {
    final g = _s.grid;
    for (var y = _y0; y <= _y1; y++) {
      for (var x = _x0; x <= _x1; x++) {
        final ch = g[y][x];
        if (ch == '~') {
          _rect(x.toDouble(), y.toDouble(), 1, 1, _rgba(40, 70, 140, .45));
          if (y > 0 && g[y - 1][x] != '~') {
            _rect(x.toDouble(), y + math.sin(_time * 2 + x) * .05, 1, .06,
                _rgba(160, 200, 255, .5));
          }
        } else if (ch == 'v') {
          _rect(x.toDouble(), y.toDouble(), 1, 1, _rgba(255, 230, 160, .06));
          final t = (_time * 1.6 + x * .37 + y * .11) % 1;
          _rect(x + .45, y + 1 - t, .06, .35, _rgba(255, 240, 200, .35));
        } else if (ch == ':') {
          final fx = x.toDouble();
          final fy = y.toDouble();
          _lines([fx, fy, fx + 1, fy + 1, fx + 1, fy, fx, fy + 1,
              fx + .5, fy, fx + .5, fy + 1],
              _rgba(235, 230, 255, .45), .035);
        }
      }
    }
  }

  void _terrain() {
    final g = _s.grid;
    final accent = _area['accent'] as String;
    final rock = _area['world'] == 'shadow' ? _rgba(5, 4, 7, 1) : _rgba(7, 8, 12, 1);
    for (var y = _y0; y <= _y1; y++) {
      for (var x = _x0; x <= _x1; x++) {
        final ch = g[y][x];
        final fx = x.toDouble();
        final fy = y.toDouble();
        switch (ch) {
          case '#':
            _rect(fx - .01, fy - .01, 1.02, 1.02, rock);
            if (_s.tileType(x, y - 1) != 1) {
              _rect(fx, fy, 1, .07, _hex(accent, .55));
              // Little grass / crystal tufts on exposed tops.
              if ((x * 7 + y * 3) % 5 == 0) {
                _c.drawPath(
                  ui.Path()
                    ..moveTo(fx + .2, fy)
                    ..lineTo(fx + .32, fy - .28)
                    ..lineTo(fx + .45, fy)
                    ..close(),
                  ui.Paint()..color = rock,
                );
              }
            }
            break;
          case '=':
          case 'p':
            _rect(fx, fy, 1, .24,
                ch == 'p' ? _rgba(200, 205, 255, .85) : rock);
            _rect(fx, fy, 1, .05,
                ch == 'p' ? _rgba(255, 255, 255, .6) : _hex(accent, .6));
            break;
          case 'S':
            if (_s.sealOpen) {
              _rect(fx, fy, 1, .24, _hex(accent, .18));
            } else {
              _rect(fx, fy, 1, 1, _rgba(18, 12, 26, 1));
              final pulse = .45 + math.sin(_time * 3 + x) * .2;
              _rect(fx + .1, fy + .42, .8, .12, _hex(accent, pulse));
              _rect(fx + .44, fy + .15, .12, .7, _hex(accent, pulse));
            }
            break;
          case 'D':
            _rect(fx, fy, 1, 1, _rgba(29, 21, 16, 1));
            _lines([fx + .2, fy + .1, fx + .55, fy + .5,
                fx + .55, fy + .5, fx + .35, fy + .9],
                _rgba(220, 170, 120, .55), .05);
            break;
          case 'b':
            if (!_grid('PROPS_ATLAS', 5, 0, 1, fx + .5, fy + 1.05, 1.15)) {
              _rect(fx + .05, fy + .05, .9, .9, _rgba(42, 29, 20, 1));
            }
            break;
          case '|':
            if (_s.boss?.active != true || _s.bossDone) break;
            _rect(fx + .35, fy, .3, 1, _rgba(255, 60, 80, .75));
            _glow(fx + .5, fy + .5, 1, '#ff3a5a', .25);
            break;
          case 'u':
            final key = _waxKey(x, y);
            if ((_s.waxGone[key] ?? 0) > 0) break;
            final heat = math.min(1.0, (_waxRunHeat(x, y)) / 1.4);
            _rect(fx, fy, 1, .3, _rgba(232, 217 - (heat * 80).round(),
                184 - (heat * 120).round(), 1));
            _rect(fx + .3, fy + .3, .12, .18 + heat * .2, _rgba(232, 217, 184, 1));
            break;
          case 'q':
            final ph = (_time / 3.2 + x * .045) % 1;
            final solid = ph < .62;
            final swell = solid ? .06 * math.sin(ph * math.pi * 3) : 0.0;
            _rect(fx, fy - swell, 1, .32 + swell,
                solid ? _rgba(110, 20, 38, 1) : _rgba(110, 20, 38, .25));
            break;
          case 'd':
            if (_s.eclipse > 0) {
              _rect(fx, fy, 1, .24, _rgba(150, 90, 255, .85));
            } else {
              _rect(fx + .1, fy, .35, .08, _rgba(150, 90, 255, .18));
            }
            break;
          case '^':
            if (!_grid('PROPS_ATLAS', 5, 2, 2, fx + .5, fy + 1.05, 1.5,
                crop: .4)) {
              _c.drawPath(
                ui.Path()
                  ..moveTo(fx, fy + 1)
                  ..lineTo(fx + .25, fy + .3)
                  ..lineTo(fx + .5, fy + 1)
                  ..lineTo(fx + .75, fy + .3)
                  ..lineTo(fx + 1, fy + 1)
                  ..close(),
                ui.Paint()..color = _rgba(27, 27, 34, 1),
              );
            }
            break;
        }
      }
    }
  }

  String _waxKey(int x, int y) => '$x,$y';

  // A wax ledge is a run of 'u' tiles; its heat lives under the run's first tile.
  double _waxRunHeat(int x, int y) {
    var x0 = x;
    while (x0 - 1 >= 0 && _s.grid[y][x0 - 1] == 'u') {
      x0--;
    }
    return _s.wax['$x0,$y'] ?? 0;
  }

  // ------------------------------------------------------------ props
  void _props() {
    for (final d in _s.decor) {
      if (!_inView(d.x, d.y)) continue;
      if (d.glyph == 'W') {
        _shadowProp('old_well', d.x, d.y + .1, 2.4);
      } else {
        _grid('PROPS_ATLAS', 5, 0, 3, d.x, d.y + .1, 1.1);
      }
    }
    for (final c in _s.checkpoints) {
      if (!_inView(c.x, c.y)) continue;
      if (c.lit) _glow(c.x, c.y - .6, 1.6, '#7fffe0', .4);
      if (!_grid('PROPS_ATLAS', 5, 1, 4, c.x, c.y + .12, 1.3,
          alpha: c.lit ? 1 : .7)) {
        _rect(c.x - .4, c.y - .15, .8, .15,
            c.lit ? _hex('#7fffe0') : _hex('#3a5a52'));
      }
    }
    for (final h in _s.hints) {
      if (!_inView(h.x, h.y)) continue;
      _grid('PROPS_ATLAS', 5, 1, 3, h.x, h.y + .1, 1.4);
      _glow(h.x, h.y - .7, .9, _area['accent'] as String,
          .25 + math.sin(_time * 3) * .1);
    }
    for (final a in _s.anchors) {
      if (!_inView(a.x, a.y)) continue;
      _glow(a.x, a.y, 1, '#7fffe0', .18);
      _grid('PROPS_ATLAS', 5, 0, 0, a.x, a.y + .7, 1.4);
    }
    for (final sp in _s.spawners) {
      if (sp.taken || !_inView(sp.x, sp.y)) continue;
      _shadowProp('hanging_cocoon', sp.x, sp.y + 1.2, 2.2);
    }
    for (final vt in _s.vents) {
      if (!_inView(vt.x, vt.y)) continue;
      _rect(vt.x - .4, vt.y - .2, .8, .2, _rgba(21, 21, 28, 1));
      if ((_time + vt.x * .13) % 2.6 < .9) {
        for (var i = 0; i < 5; i++) {
          final t = (_time * 2 + i * .2) % 1;
          _circle(
            vt.x + math.sin(i * 3 + _time * 4) * .2,
            vt.y - .3 - t * 4,
            .25 + t * .4,
            _rgba(230, 230, 240, .35 * (1 - t)),
          );
        }
      }
    }
    for (final pl in _s.platforms) {
      if (!(pl.x > _x0 - pl.w - 3 && pl.x < _x1 + 3 + pl.w &&
          pl.y > _y0 - 3 && pl.y < _y1 + 3)) {
        continue;
      }
      _rect(pl.x, pl.y, pl.w, .35, _rgba(10, 10, 16, 1));
      _rect(pl.x, pl.y, pl.w, .06, _hex(_area['accent'] as String, .7));
    }
    for (final t in _s.targets) {
      if (_inView(t.x, t.y)) _target(t);
    }
    // The exit: a gate of light on the upper floor.
    final ex = _s.exit;
    if (ex != null && _inView(ex.x, ex.y, 5)) {
      final open = _area['boss'] == null || _s.bossDone;
      _glow(ex.x, ex.y - 1.4, 2.6, open ? '#fff1c4' : '#555566',
          open ? .55 : .25);
      final color = open ? _hex('#fff1c4') : _hex('#6a6a7a');
      _lines([
        ex.x - 1, ex.y, ex.x - 1, ex.y - 2.6,
        ex.x + 1, ex.y, ex.x + 1, ex.y - 2.6,
        ex.x - 1.4, ex.y - 2.6, ex.x + 1.4, ex.y - 2.6,
        ex.x - 1.1, ex.y - 2.1, ex.x + 1.1, ex.y - 2.1,
      ], color, .14);
    }
  }

  void _target(Thing t) {
    final fight = _s.boss?.active == true;
    // Weak targets only glow faintly until a boss fight wakes them.
    if (t.weak && !fight && !t.lit) {
      _circle(t.x, t.y, .3, _rgba(255, 255, 255, .12));
      return;
    }
    final lit = t.lit;
    final kind = _targetKind[t.glyph] ?? '';
    final bottom = t.y + .75;
    if (!lit) {
      _glow(t.x, t.y, 1.2, _area['accent'] as String,
          .25 + .2 * math.sin(_time * 4 + t.x));
    } else {
      _glow(t.x, t.y, 1.6, '#fff1c4', .45);
    }
    var drawn = false;
    if (_area['world'] == 'shadow') {
      var name = 'shadow_shrine';
      if (kind == 'lantern') {
        name = lit ? 'lantern_lit' : 'lantern_unlit';
      } else if (kind == 'spool') {
        name = 'string_spool';
      } else if (kind == 'eye') {
        name = lit ? 'wall_eye_closed' : 'wall_eye_open';
      } else if (kind == 'eclipse') {
        name = 'eclipse_bell';
      } else if (_area['target'] == 'candle') {
        name = 'wax_candle';
      } else if (_area['target'] == 'flesh') {
        name = 'flesh_pod';
      }
      drawn = _shadowProp(name, t.x, bottom + .15, 1.7);
    } else if (_skyTargetArt.containsKey(kind)) {
      final (sheet, row) = _skyTargetArt[kind]!;
      final col = lit ? 1 + (_time * 8).floor() % 4 : 0;
      drawn = _grid(sheet, 5, row, col, t.x, bottom + .15, 1.7);
    } else if (_propTargetArt.containsKey(kind)) {
      final (row, col) = _propTargetArt[kind]!;
      drawn = _grid('PROPS_ATLAS', 5, row, col, t.x, bottom + .15, 1.6,
          alpha: lit ? 1 : .85);
    } else if (kind == 'eclipse') {
      drawn = _shadowProp('eclipse_bell', t.x, bottom + .15, 1.7);
    } else if (kind == 'lantern') {
      drawn = _shadowProp(lit ? 'lantern_lit' : 'lantern_unlit', t.x,
          bottom + .15, 1.7);
    } else if (kind == 'spool') {
      drawn = _shadowProp('string_spool', t.x, bottom + .15, 1.6);
    } else if (kind == 'eye') {
      drawn = _shadowProp(lit ? 'wall_eye_closed' : 'wall_eye_open', t.x,
          bottom + .15, 1.6);
    }
    if (!drawn) {
      _circle(t.x, t.y, .35, lit ? _rgba(255, 241, 196, 1) : _hex(_area['accent'] as String));
    }
  }

  // ------------------------------------------------------------ pickups
  void _pickups() {
    for (final pk in _s.pickups) {
      if (pk.taken || !_inView(pk.x, pk.y)) continue;
      final bob = math.sin(_time * 3 + pk.x) * .12;
      final x = pk.x;
      final y = pk.y - .55 + bob;
      if (pk.glyph == '*' || pk.glyph == '@') {
        final r = pk.glyph == '@' ? .42 : .28;
        _glow(x, y, r * 3, '#ff3b6a', .35);
        _heart(x, y, r, _hex('#ff3b6a'));
      } else if (pk.glyph == r'$') {
        _glow(x, y, 1, '#b88bff', .45);
        _c.drawPath(
          ui.Path()
            ..moveTo(x, y - .4)
            ..lineTo(x + .28, y)
            ..lineTo(x, y + .4)
            ..lineTo(x - .28, y)
            ..close(),
          ui.Paint()..color = _hex('#d9c2ff'),
        );
      } else {
        _glow(x, y, .9, '#ffe27a', .35);
        _rect(x - .3, y - .18, .6, .36, _rgba(233, 220, 184, 1));
        _rect(x - .36, y - .22, .1, .44, _rgba(138, 90, 42, 1));
        _rect(x + .26, y - .22, .1, .44, _rgba(138, 90, 42, 1));
      }
    }
  }

  // ------------------------------------------------------------ enemies
  int _enemyRow(Foe e) {
    if (e.dead) return 3;
    if (e.hurt > 0) return 2;
    if (e.state == 'wind' || e.state == 'lunge' || e.state == 'fuse') return 1;
    return 0;
  }

  void _enemies() {
    for (final e in _s.enemies) {
      if (!_inView(e.x, e.y, 4)) continue;
      final d = e.data;
      final key = d['key'] as String;
      final row = _enemyRow(e);
      final int col;
      if (row == 3) {
        col = math.min(4, ((.6 - e.death) / .6 * 5).floor());
      } else if (row == 1) {
        col = math.min(4, (e.timer * 7).floor());
      } else if (row == 2) {
        col = math.min(4, ((1 - e.hurt / .22) * 5).floor());
      } else {
        col = ((_time * 8 + e.phase) % 5).floor();
      }
      final size = number(d, 'size', 1);
      final foot = number(d, 'foot', .9);
      final bottom = e.flying
          ? e.y - e.h / 2 + size / 2
          : e.y + size * (1 - foot);
      final flip = e.direction > 0;
      final alpha = e.dead ? math.max(0.0, e.death / .6) : 1.0;
      if (e.state == 'fuse') {
        _glow(e.x, e.y - e.h / 2, 1.6, '#ffb347',
            .4 + math.sin(e.timer * 30) * .2);
      }
      final ok = _grid(key, 5, row, col, e.x, bottom, size,
          flip: flip, alpha: alpha);
      if (!ok) {
        _rect(e.x - e.w / 2, e.y - e.h, e.w, e.h, _rgba(17, 17, 17, 1));
      }
      if (e.hurt > 0 && ok) {
        _grid(key, 5, row, col, e.x, bottom, size,
            flip: flip, alpha: .55, blend: ui.BlendMode.plus);
      }
      if (e.root > 0) {
        _c.drawRect(
          ui.Rect.fromLTWH(e.x - e.w / 2 - .1, e.y - e.h - .1, e.w + .2, e.h + .2),
          ui.Paint()
            ..color = _rgba(240, 235, 255, .7)
            ..style = ui.PaintingStyle.stroke
            ..strokeWidth = .05,
        );
      }
      if (!e.dead && e.hp < e.maxHp) {
        final w = math.max(.8, e.w);
        _rect(e.x - w / 2, e.y - e.h - .45, w, .1, _rgba(0, 0, 0, .6));
        _rect(e.x - w / 2, e.y - e.h - .45, w * e.hp / e.maxHp, .1,
            _rgba(255, 90, 106, 1));
      }
    }
  }

  void _boss() {
    final b = _s.boss;
    if (b == null) return;
    if (!b.active && !b.dead && _s.bossDone) return;
    if (b.dead && b.death <= 0) return;
    final d = b.data;
    final key = d['key'] as String;
    final row = _bossRow[b.state] ?? 0;
    final col = b.state == 'idle'
        ? (_time * 6).floor() % 5
        : math.min(4, (b.timer * 6).floor());
    final size = number(d, 'size', 4);
    final foot = number(d, 'foot', .9);
    final bottom = b.flying
        ? b.y - b.h / 2 + size / 2
        : b.y + size * (1 - foot);
    final flip = b.direction > 0;
    final alpha = b.dead
        ? math.max(0.0, b.death / .6)
        : (b.active ? 1.0 : .55);
    final shot = d['shot'] as String? ?? '#ff8a2a';
    if (b.active && b.state != 'idle') {
      _glow(b.x, b.y - b.h / 2, size * .6, shot, .2);
    }
    final ok = _grid(key, 5, row, col, b.x, bottom, size,
        flip: flip, alpha: alpha);
    if (!ok) {
      _rect(b.x - b.w / 2, b.y - b.h, b.w, b.h, _rgba(0, 0, 0, 1));
    }
    if (b.hurt > 0 && ok) {
      _grid(key, 5, row, col, b.x, bottom, size,
          flip: flip, alpha: .5, blend: ui.BlendMode.plus);
    }
    if (b.root > 0) {
      for (var i = 0; i < 3; i++) {
        final a = _time * 4 + i * math.pi * 2 / 3;
        _circle(b.x + math.cos(a) * .8, b.y - b.h - .3 + math.sin(a) * .25,
            .12, _rgba(255, 210, 122, 1));
      }
    }
  }

  // ------------------------------------------------------------ kuro
  void _kuros() {
    final sheet = 'KURO${_s.skinIndex}_SHEET';
    final forms = 'KURO${_s.skinIndex}_FORMS';
    for (final k in _s.projectiles) {
      if (!k.kuro) continue;
      if (!k.lodged) {
        for (var i = 1; i <= 3; i++) {
          _glow(k.x - k.vx * .018 * i, k.y - k.vy * .018 * i, .5, k.color,
              .18 / i);
        }
      }
      _glow(k.x, k.y, .9, k.color, .25);
      final spin = (_time * 12).floor() % 5;
      bool ok;
      if (k.returning && _s.player.charged) {
        ok = _grid(forms, 5, 1, spin, k.x, k.y + .7, 1.4);
      } else if (k.lodged) {
        ok = _grid(sheet, 5, 1, (_time * 6).floor() % 5, k.x, k.y + .7, 1.4);
      } else {
        ok = _grid(sheet, 5, 0, spin, k.x, k.y + .7, 1.4);
      }
      if (!ok) _circle(k.x, k.y, .35, _rgba(17, 17, 17, 1));
    }
  }

  // ------------------------------------------------------------ player
  // Picks the sheet part, row and column for Shuri's current state.
  (String, int, int) _pose() {
    final p = _s.player;
    int f5(double t, double dur) => math.min(4, math.max(0, (t / dur * 5).floor()));
    int loop(double rate) => (_time * rate).floor() % 5;
    if (p.dead) return ('STATUS', _statusDeath, f5(1.1 - p.death, 1.1));
    if (_s.cleared) return ('STATUS', _statusVictory, loop(6));
    if (p.hurt > 0) return ('STATUS', _statusHurt, f5(.22 - p.hurt, .22));
    if (p.pull != null) return ('SKILLS', _skillsLunge, loop(12));
    if (p.skillTime > 0) {
      final id = (_s.skin['skill'] as Json)['id'];
      final pr = f5(.45 - p.skillTime, .45);
      if (id == 'echo') return ('EXTRA', _extraShoot, pr);
      if (id == 'ashstep') return ('AGILITY', _agilityDash, pr);
      if (id == 'slam' || id == 'harvest') return ('SKILLS', _skillsWave, pr);
      if (id == 'mist' || id == 'frenzy' || id == 'eclipse') {
        return ('SKILLS', _skillsPower, pr);
      }
      return ('SKILLS', _skillsCast, pr);
    }
    if (p.dash > 0) return ('AGILITY', _agilityDash, loop(18));
    if (!p.grounded && p.wall != 0 && _s.input.axis.sign == p.wall) {
      return ('AGILITY', _agilityWall, loop(8));
    }
    if (p.throwTime > 0) return ('COMBAT', _combatThrow, f5(.26 - p.throwTime, .26));
    if (p.catchTime > 0) return ('COMBAT', _combatCatch, f5(.2 - p.catchTime, .2));
    if (!p.grounded) {
      if (p.water) return ('MOVE', _moveFall, loop(5));
      if (p.jumps >= 2 && p.vy < 2) return ('AGILITY', _agilityFlip, loop(14));
      if (p.vy < 0) {
        return ('MOVE', _moveJump,
            math.min(4, ((1 - math.min(1, -p.vy / 18)) * 5).floor()));
      }
      return ('MOVE', _moveFall, loop(8));
    }
    if (p.vx.abs() > .6) return ('MOVE', _moveRun, loop(12));
    return ('MOVE', _moveIdle, loop(6));
  }

  void _player() {
    final p = _s.player;
    final skin = _s.skinIndex;
    final color = _s.skin['color'] as String;
    final (part, row, col) = _pose();
    final key = 'SKIN${skin}_$part';
    var alpha = 1.0;
    if (p.inv > 0 && !p.dead && (_time * 20).floor() % 2 == 0) alpha = .4;
    if (p.mist > 0) alpha = .45;
    if (p.charged) {
      _glow(p.x + p.facing * .3, p.y - .95, .9, '#ffe27a',
          .35 + math.sin(_time * 10) * .1);
    }
    if (p.frenzy > 0) _glow(p.x, p.y - .8, 1.8, '#ff2448', .25);
    if (skin >= 6) _glow(p.x, p.y - .8, 1.6, color, .08 + skin * .006);
    final drawY = p.y + _playerDraw * .05;
    final ok = _grid(key, 5, row, col, p.x, drawY, _playerDraw,
        flip: p.facing < 0, alpha: alpha);
    if (!ok) _rect(p.x - p.w / 2, p.y - p.h, p.w, p.h, _rgba(0, 0, 0, 1));
    if (p.frenzy > 0 && ok) {
      _grid(key, 5, row, col, p.x, drawY, _playerDraw,
          flip: p.facing < 0, alpha: .18, blend: ui.BlendMode.plus);
    }
  }

  // ------------------------------------------------------------ shots
  void _shots() {
    for (final b in _s.projectiles) {
      if (b.kuro) continue;
      final r = b.radius;
      _glow(b.x, b.y, r * 2.4, b.color, .55);
      _circle(b.x, b.y, r * .5, _rgba(255, 255, 255, 1));
    }
  }

  void _particles() {
    for (final p in _s.particles) {
      final a = math.max(0.0, p.life / .45);
      _rect(p.x - .06, p.y - .06, .12, .12, _hex(p.color, a));
    }
  }

  void _toxic() {
    final lvl = _s.toxicLevel;
    if (lvl > 40) return;
    final x0 = _x0.toDouble();
    final x1 = _x1.toDouble();
    final path = ui.Path()..moveTo(x0, 40);
    for (var x = x0; x <= x1 + 1; x += .5) {
      path.lineTo(x, lvl + math.sin(x * 1.3 + _time * 3) * .08);
    }
    path
      ..lineTo(x1 + 1, 40)
      ..close();
    _c.drawPath(path, ui.Paint()..color = _rgba(120, 190, 40, .42));
    for (var x = _x0; x <= _x1; x += 2) {
      _rect(x + ((_time * .7 + x) % 1), lvl + .15, .12, .12,
          _rgba(200, 255, 120, .5));
    }
  }

  // ------------------------------------------------------------ darkness
  // A dim layer with holes punched by Shuri, lanterns, Kuro and the exit.
  void _darkness(double dark) {
    final bounds = ui.Rect.fromLTWH(0, 0, _vw, _vh);
    _c.saveLayer(bounds, ui.Paint());
    _c.drawRect(bounds, ui.Paint()..color = _rgba(2, 2, 6, dark));
    void hole(double x, double y, double r, [double a = 1]) {
      final sx = (x - _camL) * _t;
      final sy = (y - _camT) * _t;
      final rr = r * _t;
      if (sx < -rr || sy < -rr || sx > _vw + rr || sy > _vh + rr) return;
      _c.drawCircle(
        ui.Offset(sx, sy),
        rr,
        ui.Paint()
          ..blendMode = ui.BlendMode.dstOut
          ..shader = ui.Gradient.radial(ui.Offset(sx, sy), rr, [
            _rgba(0, 0, 0, a),
            _rgba(0, 0, 0, a * .7),
            _rgba(0, 0, 0, 0),
          ], [0, .55, 1]),
      );
    }

    final p = _s.player;
    hole(p.x, p.y - .8, 5.2);
    for (final k in _s.projectiles) {
      if (k.kuro) hole(k.x, k.y, 2.2, .8);
    }
    for (final t in _s.targets) {
      if (t.lit) hole(t.x, t.y, t.glyph == 'N' ? 7 : 3.5);
    }
    for (final c in _s.checkpoints) {
      if (c.lit) hole(c.x, c.y - .8, 3);
    }
    final ex = _s.exit;
    if (ex != null) hole(ex.x, ex.y - 1.2, 3.5, .8);
    for (final b in _s.projectiles) {
      if (!b.kuro) hole(b.x, b.y, b.hostile ? 1.1 : 1.6, b.hostile ? .5 : .6);
    }
    final boss = _s.boss;
    if (boss != null && boss.active) {
      hole(boss.x, boss.y - boss.h / 2, 3, .4);
    }
    _c.restore();
  }
}
