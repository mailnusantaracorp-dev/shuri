import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Player-chosen settings that outlive a progress reset.
class Settings {
  Settings({this.volume = .8, this.tutorialSeen = false});

  double volume;
  bool tutorialSeen;
}

/// Progress between sessions, the same data save.js keeps: unlocked areas,
/// checkpoint, lit targets, boss beaten, chosen skin and best times. Also the
/// volume and whether the tutorial has been shown.
class SaveStore {
  static const _saveKey = 'shuri-save';
  static const _volumeKey = 'shuri-volume';
  static const _tutorialKey = 'shuri-tutorial';

  Future<Map<String, dynamic>?> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_saveKey);
      if (raw == null) return null;
      final data = jsonDecode(raw);
      return data is Map<String, dynamic> ? data : null;
    } catch (_) {
      // A missing or broken save starts a fresh game.
      return null;
    }
  }

  Future<void> save(Map<String, dynamic> data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_saveKey, jsonEncode(data));
    } catch (_) {
      // Saving is best effort; play continues without it.
    }
  }

  Future<Settings> loadSettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return Settings(
        volume: prefs.getDouble(_volumeKey) ?? .8,
        tutorialSeen: prefs.getBool(_tutorialKey) ?? false,
      );
    } catch (_) {
      return Settings();
    }
  }

  Future<void> saveSettings(Settings settings) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble(_volumeKey, settings.volume);
      await prefs.setBool(_tutorialKey, settings.tutorialSeen);
    } catch (_) {
      // Settings are best effort too.
    }
  }

  /// Erases progress. Volume stays; the tutorial shows again on the next start.
  Future<void> reset() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_saveKey);
      await prefs.remove(_tutorialKey);
    } catch (_) {
      // Nothing to clear if storage is unavailable.
    }
  }
}
