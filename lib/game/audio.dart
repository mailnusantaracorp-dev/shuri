import 'dart:async';

import 'package:audioplayers/audioplayers.dart';

/// Sound effects and background music, played from assets/audio/sfx and
/// assets/audio/bgm.
///
/// * Music and effects run side by side: every player uses a context without
///   audio focus, so starting an effect never pauses the music (the Android
///   default requests focus and stops other players).
/// * Each effect has its own [AudioPool], preloaded with its file. A broken or
///   empty file only silences itself; it can never poison a player that other
///   effects share.
/// * Every call is best effort and never throws into the game.
class GameAudio {
  /// A [silent] instance plays nothing; tests use it where no audio plugin exists.
  GameAudio({double volume = .8, this.silent = false})
      : _volume = volume.clamp(0.0, 1.0);

  final bool silent;

  /// Every effect the game can trigger, one file each in assets/audio/sfx.
  static const List<String> sfxNames = [
    'throw', 'recall', 'catch', 'hit', 'clang', 'clink', 'snap', 'pull',
    'anchor', 'break', 'die', 'hurt', 'death', 'shot', 'roar', 'slam',
    'whoosh', 'blink', 'jump', 'dash', 'skill', 'thunder', 'bell', 'sigil',
    'seal', 'melt', 'pickup', 'secret', 'checkpoint', 'clear', 'ui',
  ];

  static const double _musicMix = .55;
  static const int _voicesPerSound = 4;

  double _volume;
  final Map<String, Future<AudioPool?>> _pools = {};
  AudioPlayer? _music;
  String? _track;

  double get volume => _volume;

  set volume(double v) {
    _volume = v.clamp(0.0, 1.0);
    _quiet(_music?.setVolume(_volume * _musicMix));
  }

  /// Shared by every player so none of them takes audio focus from another.
  static AudioContext _context() => AudioContext(
        android: AudioContextAndroid(
          isSpeakerphoneOn: false,
          stayAwake: false,
          contentType: AndroidContentType.sonification,
          usageType: AndroidUsageType.game,
          audioFocus: AndroidAudioFocus.none,
        ),
        iOS: AudioContextIOS(
          category: AVAudioSessionCategory.playback,
          options: const <AVAudioSessionOptions>{
            AVAudioSessionOptions.mixWithOthers,
          },
        ),
      );

  Future<AudioPool?> _pool(String name) {
    return _pools.putIfAbsent(name, () async {
      try {
        return await AudioPool.create(
          source: AssetSource('audio/sfx/$name.mp3'),
          maxPlayers: _voicesPerSound,
          audioContext: _context(),
        );
      } catch (_) {
        // Missing or unreadable file: this effect stays silent.
        return null;
      }
    });
  }

  /// Loads every effect ahead of time so the first play has no delay.
  void warmUp() {
    if (silent) return;
    for (final name in sfxNames) {
      unawaited(_pool(name));
    }
  }

  void play(String name) {
    if (silent || _volume <= 0) return;
    unawaited(_start(name));
  }

  Future<void> _start(String name) async {
    try {
      final pool = await _pool(name);
      await pool?.start(volume: _volume);
    } catch (_) {
      // Audio is optional.
    }
  }

  /// Starts a looping track. Asking for the track already playing does nothing.
  void playBgm(String name) {
    if (silent || name == _track) return;
    _track = name;
    final old = _music;
    _music = null;
    _quiet(old?.dispose());
    final player = AudioPlayer();
    _music = player;
    _quiet(player.setAudioContext(_context()));
    _quiet(player.setReleaseMode(ReleaseMode.loop));
    _quiet(player.setVolume(_volume * _musicMix));
    _quiet(player.play(AssetSource('audio/bgm/$name.mp3')));
  }

  void pause() => _quiet(_music?.pause());

  void resume() => _quiet(_music?.resume());

  void dispose() {
    for (final pool in _pools.values) {
      pool.then((p) => p?.dispose(), onError: (Object _) {});
    }
    _pools.clear();
    _quiet(_music?.dispose());
    _music = null;
    _track = null;
  }

  void _quiet(Future<void>? future) {
    future?.catchError((Object _) {});
  }
}
