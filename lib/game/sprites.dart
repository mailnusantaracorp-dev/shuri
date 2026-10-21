import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/services.dart';

/// Sprite sheets by key (SKIN0_MOVE, BG_AREA1, ...). Keys map to file names in
/// assets/json/asset_paths.json, the same manifest the JavaScript game reads.
///
/// Like image.js, sheets are downscaled once when they load, so twenty skins'
/// worth of sheets never sit in memory at full size and drawing stays cheap.
/// The decoder does the resize itself, so a full-size copy is never uploaded.
/// A sheet loads on first use, or earlier through [preload].
///
/// Character sheets are also measured once: where the body sits inside each
/// cell varies from frame to frame in the generated art, which made a standing
/// character slide left and right. [centerShift] corrects that.
class Sprites {
  Sprites(this._files);

  final Map<String, String> _files;
  final Map<String, ui.Image> _ready = {};
  final Map<String, double> _scale = {};
  final Map<String, List<double>> _shift = {};
  final Map<String, Future<void>> _loading = {};
  final Set<String> _failed = {};

  /// Same factors as scaleFor() in image.js.
  static double scaleFor(String key) {
    if (key.startsWith('BG_')) return 1;
    if (key.startsWith('BOSS_')) return .8;
    if (key.startsWith('FX_SKILLS') || key == 'SHADOW_PROPS' || key == 'SKIN_ICONS') {
      return .6;
    }
    return .5;
  }

  // Sheets laid out as 5 columns of equal cells.
  static bool _isGrid(String key) =>
      !key.startsWith('BG_') &&
      !key.startsWith('FX_SKILLS') &&
      key != 'SHADOW_PROPS' &&
      key != 'SKIN_ICONS';

  static bool _isCharacter(String key) =>
      (key.startsWith('SKIN') && key != 'SKIN_ICONS') ||
      key.startsWith('KURO') ||
      key.startsWith('ENEMY_') ||
      key.startsWith('BOSS_');

  /// The sheet if it is ready; otherwise starts loading it and returns null.
  ui.Image? get(String key) {
    final image = _ready[key];
    if (image != null) return image;
    _ensure(key);
    return null;
  }

  /// How much the sheet was shrunk from its source size.
  double scale(String key) => _scale[key] ?? scaleFor(key);

  /// Horizontal nudge, as a fraction of the cell width, that puts the body in
  /// this cell on the cell's centre line. Zero for anything but characters.
  double centerShift(String key, int row, int col) {
    final list = _shift[key];
    final i = row * 5 + col;
    return list != null && i >= 0 && i < list.length ? list[i] : 0;
  }

  /// Completes when every key is loaded or has failed; a failed picture never
  /// blocks play.
  Future<void> preload(Iterable<String> keys) =>
      Future.wait(keys.toSet().map(_ensure));

  Future<void> _ensure(String key) {
    if (_ready.containsKey(key) || _failed.contains(key)) return Future.value();
    final file = _files[key];
    if (file == null) {
      _failed.add(key);
      return Future.value();
    }
    return _loading.putIfAbsent(
      key,
      // A block body: remove() returns the very future being awaited here.
      () => _decode(key, file).whenComplete(() {
        _loading.remove(key);
      }),
    );
  }

  Future<void> _decode(String key, String file) async {
    try {
      final data = await rootBundle.load('assets/images/$file');
      final buffer = await ui.ImmutableBuffer.fromUint8List(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      );
      final descriptor = await ui.ImageDescriptor.encoded(buffer);
      final s = scaleFor(key);
      var tw = (descriptor.width * s).round();
      var th = (descriptor.height * s).round();
      if (_isGrid(key) && s != 1) {
        // Whole-pixel cells: no cell edge lands between two pixels.
        final rows = math.max(1, (descriptor.height / (descriptor.width / 5)).round());
        tw = math.max(5, (tw / 5).round() * 5);
        th = math.max(rows, (th / rows).round() * rows);
      }
      final codec = s == 1
          ? await descriptor.instantiateCodec()
          : await descriptor.instantiateCodec(targetWidth: tw, targetHeight: th);
      final frame = await codec.getNextFrame();
      final image = frame.image;
      _scale[key] = image.width / descriptor.width;
      if (_isCharacter(key)) await _measure(key, image);
      _ready[key] = image;
      codec.dispose();
      descriptor.dispose();
      buffer.dispose();
    } catch (_) {
      _failed.add(key);
    }
  }

  // Finds where the body sits in every cell (centre of mass of the visible
  // pixels). The first row, the standing loop, is centred frame by frame so it
  // stays in place. Other rows keep their own sway and only move as a whole.
  Future<void> _measure(String key, ui.Image image) async {
    final bytes = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (bytes == null) return;
    final w = image.width;
    final h = image.height;
    final cw = w ~/ 5;
    final rows = math.max(1, (h / cw).round());
    final ch = h ~/ rows;
    final centre = List<double>.filled(rows * 5, .5);
    final seen = List<bool>.filled(rows * 5, false);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < 5; c++) {
        var sum = 0.0;
        var count = 0;
        // Every third pixel is plenty for a centre of mass, and keeps the
        // work small enough not to stall a skin change.
        for (var y = r * ch; y < (r + 1) * ch; y += 3) {
          for (var x = c * cw; x < (c + 1) * cw; x += 3) {
            if (bytes.getUint8((y * w + x) * 4 + 3) > 40) {
              sum += x - c * cw + .5;
              count++;
            }
          }
        }
        if (count > 20) {
          centre[r * 5 + c] = sum / count / cw;
          seen[r * 5 + c] = true;
        }
      }
    }
    final shift = List<double>.filled(rows * 5, 0);
    final perFrame = key.startsWith('KURO');
    for (var r = 0; r < rows; r++) {
      var total = 0.0;
      var n = 0;
      for (var c = 0; c < 5; c++) {
        if (seen[r * 5 + c]) {
          total += centre[r * 5 + c];
          n++;
        }
      }
      final average = n == 0 ? .5 : total / n;
      for (var c = 0; c < 5; c++) {
        if (!seen[r * 5 + c]) continue;
        final target = perFrame || r == 0 ? centre[r * 5 + c] : average;
        shift[r * 5 + c] = (.5 - target).clamp(-.3, .3);
      }
    }
    _shift[key] = shift;
  }
}
