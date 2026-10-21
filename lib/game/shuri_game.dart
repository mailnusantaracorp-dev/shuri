import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flame/game.dart';
import 'package:flame/input.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart' show KeyEventResult;

import 'audio.dart';
import 'model.dart';
import 'simulation.dart';
import 'sprites.dart';
import 'world_renderer.dart';

// Flame shell around the Simulation. Input is recorded into sim.input and
// update() acts on it, the same split as input.js. Menus and the HUD read the
// notifiers below; render() only draws the world.

final Set<LogicalKeyboardKey> _leftKeys = {
  LogicalKeyboardKey.arrowLeft, LogicalKeyboardKey.keyA,
};
final Set<LogicalKeyboardKey> _rightKeys = {
  LogicalKeyboardKey.arrowRight, LogicalKeyboardKey.keyD,
};
final Set<LogicalKeyboardKey> _upKeys = {
  LogicalKeyboardKey.arrowUp, LogicalKeyboardKey.keyW,
};
final Set<LogicalKeyboardKey> _downKeys = {
  LogicalKeyboardKey.arrowDown, LogicalKeyboardKey.keyS,
};
final Set<LogicalKeyboardKey> _jumpKeys = {
  LogicalKeyboardKey.space, LogicalKeyboardKey.keyK,
  LogicalKeyboardKey.arrowUp, LogicalKeyboardKey.keyW,
};
final Set<LogicalKeyboardKey> _throwKeys = {LogicalKeyboardKey.keyJ};
final Set<LogicalKeyboardKey> _dashKeys = {
  LogicalKeyboardKey.keyL, LogicalKeyboardKey.shiftLeft,
  LogicalKeyboardKey.shiftRight,
};
final Set<LogicalKeyboardKey> _skillKeys = {LogicalKeyboardKey.keyU};

class ShuriGame extends FlameGame with KeyboardEvents {
  ShuriGame({
    required this.data,
    required this.sprites,
    required this.onPersist,
    required this.audio,
    required this.onVolume,
    required this.onTutorialDone,
    required this.onExit,
    Json? save,
  })  : sim = Simulation(data, save: save),
        _renderer = WorldRenderer(sprites) {
    sim.onSound = audio.play;
  }

  final Json data;
  final Sprites sprites;
  final void Function(Json save) onPersist;
  final GameAudio audio;
  final void Function(double volume) onVolume;
  final VoidCallback onTutorialDone;
  final VoidCallback onExit;
  final Simulation sim;
  final WorldRenderer _renderer;

  /// Current tutorial page while the 'tutorial' menu is open.
  final ValueNotifier<int> tutorialPage = ValueNotifier(0);

  /// Whether the small volume slider under the top bar is showing.
  final ValueNotifier<bool> volumePanel = ValueNotifier(false);

  /// True while sheets decode, so nothing is drawn half-loaded.
  final ValueNotifier<bool> loading = ValueNotifier(false);

  double _saveClock = 0;
  double _hudClock = 0;

  /// Open menu: 'pause', 'skins', 'areas', 'clear' or null while playing.
  final ValueNotifier<String?> menu = ValueNotifier(null);

  /// Bumped every frame so the HUD rebuilds with the simulation.
  final ValueNotifier<int> frame = ValueNotifier(0);

  double camX = 0;
  double camY = 0;
  int _area = -1;

  Set<LogicalKeyboardKey> _keys = {};
  bool _btnJump = false;
  int? _stickId;
  Offset _stickOrigin = Offset.zero;
  Offset _stickPos = Offset.zero;

  /// Stick anchor and knob while a finger drives it; null otherwise.
  Offset? get stickOrigin => _stickId == null ? null : _stickOrigin;
  Offset get stickPos => _stickPos;

  /// Pixels per world unit; same rule as updateTile() in render.js.
  double get tile => math.max(18, math.min(size.x / 13, size.y / 11));

  double get _camLeft => camX - size.x / tile / 2;
  double get _camTop => camY - size.y / tile / 2;

  @override
  void update(double dt) {
    super.update(dt);
    sim.update(dt);
    final snap = sim.areaIndex != _area;
    _area = sim.areaIndex;
    _updateCamera(dt, snap);
    if (sim.cleared && menu.value == null) menu.value = 'clear';
    if (sim.input.aimX != null) {
      _aimAge += dt;
      if (_aimAge > _aimHold) {
        sim.input.aimX = null;
        sim.input.aimY = null;
      }
    }
    _updateMusic();
    // Auto save: on every change, and at least every few seconds of play.
    _saveClock += dt;
    if (sim.dirty || _saveClock >= 5) {
      saveNow();
    }
    // The HUD is a widget tree; refresh it 15 times a second, not every frame.
    _hudClock += dt;
    if (_hudClock >= 1 / 15) {
      _hudClock = 0;
      // The HUD sits under the menu cover while one is open: skip the rebuild.
      if (menu.value == null) frame.value++;
    }
  }

  // Music follows the situation: the boss arena, the ending, then the world.
  // Area where the current boss fight started. A death recreates the boss
  // dormant, so the fight is remembered here and its music keeps playing until
  // the boss dies or the player leaves the area.
  int _bossArea = -1;

  void _updateMusic() {
    final boss = sim.boss;
    final alive = boss != null && !boss.dead && !sim.bossDone;
    if (alive && boss.active) _bossArea = sim.areaIndex;
    if (alive && _bossArea == sim.areaIndex) {
      audio.playBgm('bgm_boss');
    } else if (sim.areaIndex == sim.areas.length - 1 && sim.cleared) {
      audio.playBgm('bgm_ending');
    } else {
      audio.playBgm(sim.areaIndex < 10 ? 'bgm_sky' : 'bgm_shadow');
    }
  }

  void saveNow() {
    sim.dirty = false;
    _saveClock = 0;
    onPersist(sim.save());
  }

  void setVolume(double v) {
    audio.volume = v;
    onVolume(audio.volume);
    frame.value++;
  }

  /// Called when the app goes to the background: save and pause.
  void pauseForBackground() {
    saveNow();
    audio.pause();
    if (menu.value == null) openMenu('pause');
  }

  void exitToMenu() {
    saveNow();
    onExit();
  }

  void showTutorial() {
    tutorialPage.value = 0;
    openMenu('tutorial');
  }

  // While a menu is open the world is drawn once into a still image, and that
  // image is all that is painted each frame. A phone then spends its frames on
  // the menu (taps, ripples, scrolling) instead of redrawing a frozen world.
  ui.Image? _still;

  bool get _showsStill => menu.value != null && !loading.value;

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    _dropStill();
  }

  void _dropStill() {
    _still?.dispose();
    _still = null;
  }

  ui.Image _captureStill() {
    final ratio = ui.PlatformDispatcher.instance.views.first.devicePixelRatio;
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder)..scale(ratio);
    _renderer.draw(canvas, size.x, size.y, sim, camX, camY, tile);
    final picture = recorder.endRecording();
    final image = picture.toImageSync(
      (size.x * ratio).round(),
      (size.y * ratio).round(),
    );
    picture.dispose();
    return image;
  }

  @override
  void render(ui.Canvas canvas) {
    super.render(canvas);
    if (size.x <= 0 || size.y <= 0) return;
    if (_showsStill) {
      final still = _still ??= _captureStill();
      canvas.drawImageRect(
        still,
        ui.Rect.fromLTWH(0, 0, still.width.toDouble(), still.height.toDouble()),
        ui.Rect.fromLTWH(0, 0, size.x, size.y),
        ui.Paint()..filterQuality = ui.FilterQuality.low,
      );
      return;
    }
    if (_still != null) _dropStill();
    _renderer.draw(canvas, size.x, size.y, sim, camX, camY, tile);
  }

  // Camera follows Shuri with a little look-ahead, clamped to the map.
  void _updateCamera(double dt, bool snap) {
    final p = sim.player;
    final vw = size.x / tile;
    final vh = size.y / tile;
    final tx = p.x + p.facing * 1.6;
    final ty = p.y - 1.6;
    final k = snap ? 1.0 : math.min(1.0, dt * 6);
    camX += (tx - camX) * k;
    camY += (ty - camY) * k;
    camX = math.max(vw / 2, math.min(180 - vw / 2, camX));
    camY = vh >= 40 ? 20 : math.max(vh / 2, math.min(40 - vh / 2, camY));
  }

  // ------------------------------------------------------------ keyboard
  @override
  KeyEventResult onKeyEvent(
      KeyEvent event, Set<LogicalKeyboardKey> keysPressed) {
    _keys = keysPressed;
    if (event is KeyDownEvent) {
      final key = event.logicalKey;
      if (key == LogicalKeyboardKey.escape) {
        toggleMenu();
      } else if (key == LogicalKeyboardKey.tab) {
        openMenu('skins');
      } else if (!sim.paused) {
        if (_jumpKeys.contains(key)) sim.input.jump = true;
        if (_throwKeys.contains(key)) sim.input.attack = true;
        if (_dashKeys.contains(key)) sim.input.dash = true;
        if (_skillKeys.contains(key)) sim.input.skill = true;
        // Keyboard play hands aiming back to the facing direction.
        sim.input.aimX = null;
        sim.input.aimY = null;
      }
    }
    _recompute();
    return KeyEventResult.handled;
  }

  bool _anyHeld(Set<LogicalKeyboardKey> group) => _keys.any(group.contains);

  // Merges keys, the touch stick and the jump button into sim.input.
  void _recompute() {
    var ax = 0.0;
    var ay = 0.0;
    if (_anyHeld(_leftKeys)) ax -= 1;
    if (_anyHeld(_rightKeys)) ax += 1;
    if (_anyHeld(_upKeys)) ay -= 1;
    if (_anyHeld(_downKeys)) ay += 1;
    if (_stickId != null) {
      final dx = _stickPos.dx - _stickOrigin.dx;
      final dy = _stickPos.dy - _stickOrigin.dy;
      const r = 42.0;
      final l = math.sqrt(dx * dx + dy * dy);
      final k = l > r ? r / l : 1.0;
      ax = dx.abs() > 8 ? dx * k / r : 0;
      ay = dy.abs() > 12 ? dy * k / r : 0;
    }
    final input = sim.input;
    input.axis = ax.clamp(-1.0, 1.0);
    input.vertical = ay.clamp(-1.0, 1.0);
    input.down = input.vertical > .5;
    input.jumpHeld = _btnJump || _anyHeld(_jumpKeys);
    frame.value++;
  }

  // ------------------------------------------------------------ pointer
  // Mouse aims and throws with the primary button. Touch on the left drives
  // the stick; a tap on the open right side throws toward the tap.
  void pointerDown(Offset p, {required bool mouse, required int id}) {
    if (sim.paused) return;
    if (mouse) {
      _aimAt(p);
      sim.input.attack = true;
      return;
    }
    if (p.dx < size.x * .55 && _stickId == null) {
      _stickId = id;
      _stickOrigin = p;
      _stickPos = p;
      _recompute();
    } else {
      _aimAt(p);
      sim.input.attack = true;
    }
  }

  void pointerMove(Offset p, {required bool mouse, required int id}) {
    if (mouse) {
      if (!sim.paused) _aimAt(p);
      return;
    }
    if (id == _stickId) {
      _stickPos = p;
      _recompute();
    }
  }

  void pointerUp(int id) {
    if (id == _stickId) {
      _stickId = null;
      _recompute();
    }
  }

  // A tap or drag aims for a moment. Once the pointer has been idle for
  // [_aimHold] seconds the aim lapses and throws follow the facing direction
  // again, instead of flying to the last spot that was touched.
  static const double _aimHold = 1.5;
  double _aimAge = 0;

  void _aimAt(Offset p) {
    sim.input.aimX = _camLeft + p.dx / tile;
    sim.input.aimY = _camTop + p.dy / tile;
    _aimAge = 0;
  }

  // On-screen buttons call these with their action name.
  void buttonDown(String action) {
    if (sim.paused) return;
    if (action == 'jump') _btnJump = true;
    final input = sim.input;
    if (action == 'jump') input.jump = true;
    if (action == 'throw') input.attack = true;
    if (action == 'dash') input.dash = true;
    if (action == 'skill') input.skill = true;
    _recompute();
  }

  void buttonUp(String action) {
    if (action == 'jump') _btnJump = false;
    _recompute();
  }

  // ------------------------------------------------------------ menus
  void openMenu(String name) {
    menu.value = name;
    sim.paused = true;
    _recompute();
  }

  void closeMenu() {
    if (menu.value == 'tutorial') onTutorialDone();
    menu.value = null;
    sim.paused = false;
    _recompute();
  }

  void toggleMenu() {
    // The clear screen is left through its own buttons only.
    if (menu.value == 'clear') return;
    menu.value == null ? openMenu('pause') : closeMenu();
  }

  Future<void> pickSkin(int index) async {
    await _whileLoading(sprites.preload(_skinKeys(index)));
    sim.pickSkin(index);
    closeMenu();
  }

  Future<void> pickArea(int index) async {
    _bossArea = -1;
    sim.loadArea(index);
    await prepare();
    closeMenu();
  }

  Future<void> nextArea() async {
    _bossArea = -1;
    sim.loadArea(sim.areaIndex + 1);
    await prepare();
    closeMenu();
  }

  /// Loads every sheet the current area and skin draw, behind a loading cover.
  /// Like requestAll()/settled() in image.js, this keeps sprites from popping
  /// in (or showing as black boxes) mid-play.
  Future<void> prepare() => _whileLoading(sprites.preload([
        ..._skinKeys(sim.skinIndex),
        ..._areaKeys(),
      ]));

  Future<void> _whileLoading(Future<void> job) async {
    loading.value = true;
    sim.paused = true;
    await job;
    loading.value = false;
    sim.paused = menu.value != null;
  }

  List<String> _skinKeys(int skin) => [
        for (final part in const ['MOVE', 'COMBAT', 'AGILITY', 'SKILLS', 'STATUS', 'EXTRA'])
          'SKIN${skin}_$part',
        'KURO${skin}_SHEET',
        'KURO${skin}_FORMS',
        'SKIN_ICONS',
      ];

  List<String> _areaKeys() {
    final keys = <String>{
      sim.area['bg'] as String,
      'PROPS_ATLAS', 'SHADOW_PROPS', 'MECH_A', 'MECH_B',
    };
    final defs = data['enemies'] as Json;
    final types = <String>{'cocoon', for (final e in sim.enemies) e.type};
    for (final type in types.toList()) {
      final split = (defs[type] as Json?)?['splitInto'];
      if (split is String) types.add(split);
    }
    for (final type in types) {
      final key = (defs[type] as Json?)?['key'];
      if (key is String) keys.add(key);
    }
    final bossKey = sim.boss?.data['key'];
    if (bossKey is String) keys.add(bossKey);
    return keys.toList();
  }

  void retryCheckpoint() {
    sim.respawn();
    closeMenu();
  }
}
