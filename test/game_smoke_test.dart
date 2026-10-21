import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter_test/flutter_test.dart';
import 'package:shuri/game/simulation.dart';
import 'package:shuri/game/sprites.dart';
import 'package:shuri/game/world_renderer.dart';

void main() {
  test('every area loads, simulates and draws without sprites', () {
    final data = jsonDecode(File('assets/json/game_data.json').readAsStringSync())
        as Map<String, dynamic>;
    final renderer = WorldRenderer(Sprites({}));
    final sim = Simulation(data);
    for (var area = 0; area < 20; area++) {
      sim.loadArea(area);
      for (var frame = 0; frame < 180; frame++) {
        sim.update(1 / 60);
      }
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      renderer.draw(canvas, 800, 600, sim, sim.player.x, sim.player.y, 40);
      recorder.endRecording();
    }
  });
}
