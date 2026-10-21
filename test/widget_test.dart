import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:shuri/game/audio.dart';
import 'package:shuri/main.dart';

void main() {
  flowTests();
  testWidgets('app boots into the loading screen', (tester) async {
    await tester.pumpWidget(const ShuriApp());
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });
}

void flowTests() {
  testWidgets('menu, tutorial on first start, skip, then play', (tester) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(ShuriApp(audio: GameAudio(silent: true)));
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 2)));
    await tester.pump();
    expect(find.text('MULAI'), findsOneWidget);
    expect(find.text('RESET PROGRES'), findsOneWidget);

    await tester.tap(find.text('MULAI'));
    // Sheets decode behind a loading cover before the tutorial shows.
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Memuat…'), findsOneWidget);
    for (var i = 0; i < 40 && find.text('Memuat…').evaluate().isNotEmpty; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 250)));
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect(find.text('Memuat…'), findsNothing);
    expect(find.text('Tujuan'), findsOneWidget);

    await tester.tap(find.text('Lewati'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Tujuan'), findsNothing);
    expect(find.byIcon(Icons.question_mark), findsOneWidget);
    expect(find.byIcon(Icons.menu), findsOneWidget);

    await tester.tap(find.byIcon(Icons.question_mark));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Tujuan'), findsOneWidget);
  });
}
