import 'dart:convert';

import 'package:flame/game.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'game/audio.dart';
import 'game/hud.dart';
import 'game/save_store.dart';
import 'game/shuri_game.dart';
import 'game/sprites.dart';
import 'menu/main_menu.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // A phone game: landscape, edge to edge. The HUD and menus stay inside the
  // safe area, so notches and gesture bars never cover them.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const ShuriApp());
}

class ShuriApp extends StatelessWidget {
  const ShuriApp({super.key, this.audio});

  /// Replaces the real audio, e.g. with a silent one in tests.
  final GameAudio? audio;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Shuri and Kuro in Shadowfall',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3FD0B6),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: RootScreen(audio: audio),
    );
  }
}

/// Everything the game needs before the first frame: the data the JavaScript
/// game shipped as game_data.json, the sprite key map, saved progress and
/// settings.
class _Boot {
  _Boot(this.data, this.sprites, this.save, this.settings);

  final Map<String, dynamic> data;
  final Sprites sprites;
  Map<String, dynamic>? save;
  final Settings settings;
}

/// Switches between the main menu and the game, and keeps progress saved when
/// the app leaves the screen.
class RootScreen extends StatefulWidget {
  const RootScreen({super.key, this.audio});

  final GameAudio? audio;

  @override
  State<RootScreen> createState() => _RootScreenState();
}

class _RootScreenState extends State<RootScreen> with WidgetsBindingObserver {
  final SaveStore _store = SaveStore();
  late final Future<_Boot> _boot = _load();
  late final GameAudio _audio = widget.audio ?? GameAudio();
  ShuriGame? _game;

  Future<_Boot> _load() async {
    final data = jsonDecode(await rootBundle.loadString('assets/json/game_data.json'))
        as Map<String, dynamic>;
    final paths = (jsonDecode(await rootBundle.loadString('assets/json/asset_paths.json'))
            as Map<String, dynamic>)
        .cast<String, String>();
    final settings = await _store.loadSettings();
    _audio.volume = settings.volume;
    _audio.warmUp();
    _audio.playBgm('bgm_menu');
    return _Boot(data, Sprites(paths), await _store.load(), settings);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _audio.dispose();
    super.dispose();
  }

  // Leaving the app saves at once and pauses the game behind a menu.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _audio.resume();
    } else {
      _game?.pauseForBackground();
    }
  }

  String? _progress(_Boot boot) {
    final save = boot.save;
    if (save == null || save['version'] != 1) return null;
    final areas = boot.data['areas'] as List;
    final index = save['area'];
    if (index is! int || index < 0 || index >= areas.length) return null;
    return 'Area ${index + 1} · ${(areas[index] as Map)['name']}';
  }

  void _play(_Boot boot) {
    final game = ShuriGame(
      data: boot.data,
      sprites: boot.sprites,
      save: boot.save,
      audio: _audio,
      onPersist: (json) {
        boot.save = json;
        _store.save(json);
      },
      onVolume: (v) {
        boot.settings.volume = v;
        _store.saveSettings(boot.settings);
      },
      onTutorialDone: () {
        boot.settings.tutorialSeen = true;
        _store.saveSettings(boot.settings);
      },
      onExit: () {
        _audio.playBgm('bgm_menu');
        setState(() => _game = null);
      },
    );
    // The tutorial opens on a first start and can always be skipped.
    if (!boot.settings.tutorialSeen) game.showTutorial();
    game.prepare();
    setState(() => _game = game);
  }

  Future<void> _reset(_Boot boot) async {
    await _store.reset();
    boot.settings.tutorialSeen = false;
    setState(() => boot.save = null);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_Boot>(
      future: _boot,
      builder: (context, snapshot) {
        final boot = snapshot.data;
        if (boot == null) {
          return const Scaffold(
            backgroundColor: Color(0xFF0D1018),
            body: Center(child: CircularProgressIndicator()),
          );
        }
        final game = _game;
        if (game == null) {
          return MainMenu(
            sprites: boot.sprites,
            progress: _progress(boot),
            volume: boot.settings.volume,
            onVolume: (v) {
              _audio.volume = v;
              boot.settings.volume = v;
              _store.saveSettings(boot.settings);
            },
            onClick: () => _audio.play('ui'),
            onPlay: () => _play(boot),
            onReset: () => _reset(boot),
          );
        }
        return Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            children: [
              Positioned.fill(child: GameWidget(game: game)),
              Positioned.fill(child: _PointerLayer(game: game)),
              ShuriHud(game: game),
            ],
          ),
        );
      },
    );
  }
}

/// Feeds mouse and touch into the game. The HUD sits above this layer, so its
/// buttons take their own pointers and never reach the game.
class _PointerLayer extends StatelessWidget {
  const _PointerLayer({required this.game});

  final ShuriGame game;

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (e) => game.pointerDown(
        e.localPosition,
        mouse: e.kind == PointerDeviceKind.mouse,
        id: e.pointer,
      ),
      onPointerMove: (e) => game.pointerMove(
        e.localPosition,
        mouse: e.kind == PointerDeviceKind.mouse,
        id: e.pointer,
      ),
      onPointerUp: (e) => game.pointerUp(e.pointer),
      onPointerCancel: (e) => game.pointerUp(e.pointer),
    );
  }
}
