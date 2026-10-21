import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'safe_zone.dart';
import 'shuri_game.dart';

// Flutter port of game js/game/hud.js: hearts, skill cooldown, boss bar, toast,
// touch stick, on-screen buttons and the menus. Buttons only call the game's
// actions; they never change state themselves.

const Color _accent = Color(0xFF3FD0B6);
const Color _panelColor = Color(0xEE0E1220);

String fmtTime(double t) {
  final m = (t / 60).floor();
  final sec = (t % 60).floor();
  return '$m:${sec.toString().padLeft(2, '0')}';
}

class TutorialStep {
  const TutorialStep(this.icon, this.title, this.lines);

  final IconData icon;
  final String title;
  final List<String> lines;
}

const List<TutorialStep> tutorialSteps = [
  TutorialStep(Icons.flag, 'Tujuan', [
    'Nyalakan semua target di lantai tengah dengan Kuro untuk membuka Segel di langit-langit.',
    'Naik ke lantai atas, kalahkan bos penjaga, lalu masuk ke gerbang cahaya di sisi kiri.',
    'Titik simpan menyimpan progresmu otomatis.',
  ]),
  TutorialStep(Icons.directions_run, 'Bergerak & lompat', [
    'Keyboard: A / D atau panah untuk berjalan, Spasi / K / W untuk lompat.',
    'Sentuh: geser di sisi kiri layar untuk stick, tombol panah atas untuk lompat.',
    'Lompat lagi di udara untuk lompat ganda, dan lompat dari dinding untuk memanjat.',
  ]),
  TutorialStep(Icons.star, 'Kuro', [
    'Lempar Kuro dengan J, klik mouse, ketuk sisi kanan layar, atau tombol bintang.',
    'Tekan lagi untuk memanggil Kuro kembali; menangkapnya dari dekat memberi serangan ekstra.',
    'Tempelkan Kuro di jangkar, lalu lompat atau dash untuk tertarik ke sana.',
  ]),
  TutorialStep(Icons.bolt, 'Dash, skill & skin', [
    'Dash: L atau Shift. Skill: U. Masing-masing punya tombolnya di layar sentuh.',
    'Ganti skin lewat tombol di kiri atas atau Tab, tiap skin punya skill sendiri.',
    'Esc membuka menu jeda. Tombol ? di kanan atas membuka tutorial ini lagi.',
  ]),
];

class ShuriHud extends StatelessWidget {
  const ShuriHud({super.key, required this.game});

  final ShuriGame game;

  @override
  Widget build(BuildContext context) {
    final zone = safeZone(context);
    return Stack(
      children: [
        ValueListenableBuilder<int>(
          valueListenable: game.frame,
          builder: (context, frame, child) => Stack(
            children: [
              Positioned(
                left: zone.left,
                right: zone.right,
                top: zone.top,
                child: _topBar(),
              ),
              Positioned(
                left: zone.left + 60,
                right: zone.right + 60,
                top: zone.top + 52,
                child: IgnorePointer(child: _bossBar()),
              ),
              Positioned(
                left: zone.left,
                right: zone.right,
                top: zone.top + 100,
                child: IgnorePointer(child: _toast()),
              ),
              if (game.stickOrigin != null) _stick(),
              if (game.volumePanel.value) _volumePanel(zone),
              Positioned(
                right: zone.right,
                bottom: zone.bottom,
                child: _pad(),
              ),
            ],
          ),
        ),
        ValueListenableBuilder<String?>(
          valueListenable: game.menu,
          builder: (context, menu, child) {
            if (menu == null) return const SizedBox.shrink();
            return _overlay(menu, zone);
          },
        ),
        ValueListenableBuilder<bool>(
          valueListenable: game.loading,
          builder: (context, loading, child) {
            if (!loading) return const SizedBox.shrink();
            return const Positioned.fill(
              child: ColoredBox(
                color: Color(0xFF0D1018),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 12),
                      Text('Memuat…', style: TextStyle(color: Colors.white70)),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  // ------------------------------------------------------------ top bar
  Widget _topBar() {
    final sim = game.sim;
    final p = sim.player;
    final skill = sim.skin['skill'] as Map<String, dynamic>;
    final cdMax = (skill['cd'] as num).toDouble();
    return Row(
      children: [
        _iconButton(
          onTap: () => game.openMenu('skins'),
          child: SkinIcon(
            image: game.sprites.get('SKIN_ICONS'),
            scale: game.sprites.scale('SKIN_ICONS'),
            index: sim.skinIndex,
          ),
        ),
        const SizedBox(width: 8),
        Wrap(
          spacing: 3,
          children: [
            for (var i = 0; i < p.maxHp; i++)
              Icon(
                Icons.favorite,
                size: 18,
                color: i < p.hp ? const Color(0xFFFF3B6A) : Colors.white24,
              ),
          ],
        ),
        const SizedBox(width: 8),
        _chip(
          Icons.auto_awesome,
          p.skillCd > 0 ? p.skillCd.ceil().toString() : '',
          dim: p.skillCd > 0,
          title: '${skill['name']} (U) · ${cdMax.toStringAsFixed(0)}s',
        ),
        const Spacer(),
        _iconButton(
          onTap: () => game.volumePanel.value = !game.volumePanel.value,
          child: Icon(
            game.audio.volume <= 0
                ? Icons.volume_off
                : game.audio.volume < .5
                    ? Icons.volume_down
                    : Icons.volume_up,
            color: Colors.white,
          ),
        ),
        const SizedBox(width: 8),
        _iconButton(
          onTap: game.showTutorial,
          child: const Icon(Icons.question_mark, color: Colors.white),
        ),
        const SizedBox(width: 8),
        _iconButton(
          onTap: () => game.openMenu('pause'),
          child: const Icon(Icons.menu, color: Colors.white),
        ),
      ],
    );
  }

  Widget _volumePanel(EdgeInsets zone) {
    return Positioned(
      right: 0,
      top: 0,
      child: Padding(
        padding: EdgeInsets.fromLTRB(0, zone.top + 48, zone.right, 0),
        child: Container(
          width: 230,
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(
            color: _panelColor,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white24),
          ),
          child: Row(
            children: [
              IconButton(
                onPressed: () => game.setVolume(game.audio.volume > 0 ? 0 : .8),
                icon: Icon(
                  game.audio.volume > 0 ? Icons.volume_up : Icons.volume_off,
                  color: Colors.white,
                ),
              ),
              Expanded(
                child: Slider(
                  value: game.audio.volume,
                  onChanged: game.setVolume,
                  activeColor: _accent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String label, {bool dim = false, String? title}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: dim ? Colors.white12 : _accent),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: dim ? Colors.white38 : _accent),
          if (label.isNotEmpty) ...[
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w700)),
          ],
        ],
      ),
    );
  }

  Widget _iconButton({required VoidCallback onTap, required Widget child}) {
    return Material(
      color: Colors.black54,
      shape: const CircleBorder(side: BorderSide(color: Colors.white24)),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () {
          game.audio.play('ui');
          onTap();
        },
        child: SizedBox(width: 40, height: 40, child: Center(child: child)),
      ),
    );
  }

  // ------------------------------------------------------------ boss, toast, stick
  Widget _bossBar() {
    final boss = game.sim.boss;
    if (boss == null || !boss.active || boss.dead) return const SizedBox.shrink();
    return Column(
      children: [
        Text(
          boss.data['name'] as String? ?? '',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: (boss.hp / boss.maxHp).clamp(0.0, 1.0),
            minHeight: 8,
            color: const Color(0xFFFF5A6A),
            backgroundColor: Colors.black54,
          ),
        ),
      ],
    );
  }

  Widget _toast() {
    final sim = game.sim;
    if (sim.toastTime <= 0 || sim.toast.isEmpty) return const SizedBox.shrink();
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xB3000000),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          sim.toast,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  Widget _stick() {
    final origin = game.stickOrigin!;
    final knob = game.stickPos;
    return Positioned(
      left: origin.dx - 42,
      top: origin.dy - 42,
      child: IgnorePointer(
        child: Container(
          width: 84,
          height: 84,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white38, width: 2),
            color: Colors.white10,
          ),
          child: Transform.translate(
            offset: knob - origin,
            child: Center(
              child: Container(
                width: 34,
                height: 34,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white54,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------ touch pad
  Widget _pad() {
    final sim = game.sim;
    final skill = sim.skin['skill'] as Map<String, dynamic>;
    final cdMax = (skill['cd'] as num).toDouble();
    final cdLeft = sim.player.skillCd;
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _padButton('dash', Icons.double_arrow, 56),
            const SizedBox(height: 10),
            _padButton('skill', Icons.auto_awesome, 56,
                cooldown: cdLeft > 0 ? cdLeft / cdMax : 0),
          ],
        ),
        const SizedBox(width: 10),
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _padButton('jump', Icons.arrow_upward, 68),
            const SizedBox(height: 10),
            _padButton('throw', Icons.star, 84),
          ],
        ),
      ],
    );
  }

  Widget _padButton(String action, IconData icon, double size,
      {double cooldown = 0}) {
    return Listener(
      onPointerDown: (_) => game.buttonDown(action),
      onPointerUp: (_) => game.buttonUp(action),
      onPointerCancel: (_) => game.buttonUp(action),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black54,
          border: Border.all(color: _accent.withValues(alpha: .6), width: 2),
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(icon, color: Colors.white, size: size * .42),
            if (cooldown > 0)
              Positioned.fill(
                child: CircularProgressIndicator(
                  value: cooldown,
                  strokeWidth: 3,
                  color: Colors.white24,
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------------ menus
  Widget _overlay(String menu, EdgeInsets zone) {
    return Positioned.fill(
      child: ColoredBox(
        color: const Color(0x99000000),
        child: Padding(
          padding: zone,
          child: Center(
            child: Container(
              margin: const EdgeInsets.all(4),
              padding: const EdgeInsets.all(16),
              constraints: const BoxConstraints(maxWidth: 720),
              decoration: BoxDecoration(
                color: _panelColor,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white12),
              ),
              child: SingleChildScrollView(child: _menuBody(menu)),
            ),
          ),
        ),
      ),
    );
  }

  Widget _menuBody(String menu) {
    switch (menu) {
      case 'pause':
        return _pauseMenu();
      case 'skins':
        return _skinMenu();
      case 'areas':
        return _areaMenu();
      case 'clear':
        return _clearMenu();
      case 'tutorial':
        return _tutorialMenu();
    }
    return const SizedBox.shrink();
  }

  Widget _head(String title) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
          ),
        ),
        if (game.menu.value != 'clear')
          IconButton(
            onPressed: game.closeMenu,
            icon: const Icon(Icons.close, color: Colors.white),
          ),
      ],
    );
  }

  Widget _button(String label, VoidCallback onPressed, {bool primary = false}) {
    void click() {
      game.audio.play('ui');
      onPressed();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: SizedBox(
        width: double.infinity,
        child: primary
            ? FilledButton(onPressed: click, child: Text(label))
            : OutlinedButton(onPressed: click, child: Text(label)),
      ),
    );
  }

  Widget _pauseMenu() {
    final sim = game.sim;
    final area = sim.area;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _head('${sim.areaIndex + 1}. ${area['name']}'),
        const SizedBox(height: 8),
        _button('Lanjut', game.closeMenu, primary: true),
        _button('Ganti skin', () => game.openMenu('skins')),
        _button('Pilih area', () => game.openMenu('areas')),
        _button('Ulang dari titik simpan', game.retryCheckpoint),
        _button('Tutorial', game.showTutorial),
        _button('Menu utama', game.exitToMenu),
      ],
    );
  }

  Widget _skinMenu() {
    final sim = game.sim;
    final skins = (game.data['skins'] as List).cast<Map<String, dynamic>>();
    final icons = game.sprites.get('SKIN_ICONS');
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _head('Skin'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (var i = 0; i < skins.length; i++)
              _card(
                onTap: () => game.pickSkin(i),
                selected: i == sim.skinIndex,
                accent: Color(_hexInt(skins[i]['color'] as String)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkinIcon(
                        image: icons,
                        scale: game.sprites.scale('SKIN_ICONS'),
                        index: i,
                        size: 56),
                    const SizedBox(height: 6),
                    Text(skins[i]['name'] as String,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                    Text((skins[i]['skill'] as Map)['name'] as String,
                        style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    Text(skins[i]['buff'] as String,
                        style: const TextStyle(color: Colors.white38, fontSize: 11)),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _areaMenu() {
    final sim = game.sim;
    final areas = (game.data['areas'] as List).cast<Map<String, dynamic>>();
    final bosses = game.data['bosses'] as Map<String, dynamic>;
    Widget card(int i) {
      final a = areas[i];
      final locked = i >= sim.unlocked;
      final best = sim.best[i];
      final bossId = a['boss'] as String?;
      final sub = best > 0
          ? fmtTime(best)
          : bossId != null
              ? (bosses[bossId] as Map)['name'] as String
              : '—';
      return _card(
        onTap: locked ? null : () => game.pickArea(i),
        selected: i == sim.areaIndex,
        accent: Color(_hexInt(a['accent'] as String)),
        child: SizedBox(
          width: 150,
          child: Row(
            children: [
              SizedBox(
                width: 28,
                child: locked
                    ? const Icon(Icons.lock, size: 18, color: Colors.white38)
                    : Text('${i + 1}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a['name'] as String,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    Text(sub, style: const TextStyle(color: Colors.white38, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _head('Area'),
        const SizedBox(height: 8),
        const Text('Langit', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w700)),
        Wrap(spacing: 10, runSpacing: 10, children: [for (var i = 0; i < 10; i++) card(i)]),
        const SizedBox(height: 12),
        const Text('Dunia Bayangan', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w700)),
        Wrap(spacing: 10, runSpacing: 10, children: [for (var i = 10; i < areas.length; i++) card(i)]),
      ],
    );
  }

  Widget _tutorialMenu() {
    return ValueListenableBuilder<int>(
      valueListenable: game.tutorialPage,
      builder: (context, page, child) {
        final step = tutorialSteps[page];
        final last = page == tutorialSteps.length - 1;
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(step.icon, color: _accent, size: 28),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(step.title,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            for (final line in step.lines)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(line,
                    style: const TextStyle(color: Colors.white70, fontSize: 15, height: 1.35)),
              ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < tutorialSteps.length; i++)
                  Container(
                    width: i == page ? 18 : 8,
                    height: 8,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: i == page ? _accent : Colors.white24,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                TextButton(onPressed: game.closeMenu, child: const Text('Lewati')),
                const Spacer(),
                if (page > 0)
                  TextButton(
                    onPressed: () => game.tutorialPage.value = page - 1,
                    child: const Text('Kembali'),
                  ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: last
                      ? game.closeMenu
                      : () => game.tutorialPage.value = page + 1,
                  child: Text(last ? 'Mulai main' : 'Lanjut'),
                ),
              ],
            ),
          ],
        );
      },
    );
  }

  Widget _clearMenu() {
    final sim = game.sim;
    final last = sim.areaIndex >= sim.areas.length - 1;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _head('Area bersih!'),
        const SizedBox(height: 12),
        Row(
          children: [
            _stat(fmtTime(sim.areaTime), 'Waktu'),
            _stat('${sim.player.kills}', 'Monster'),
            _stat('${sim.secrets}', 'Rahasia'),
          ],
        ),
        const SizedBox(height: 16),
        if (last)
          const Text(
            'Yomi telah jatuh. Dunia Bayangan sunyi.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white70),
          )
        else
          _button(
            sim.areaIndex == 9 ? 'Turun ke Dunia Bayangan' : 'Area berikutnya',
            game.nextArea,
            primary: true,
          ),
        _button('Pilih area', () => game.openMenu('areas')),
      ],
    );
  }

  Widget _stat(String value, String label) {
    return Expanded(
      child: Column(
        children: [
          Text(value,
              style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
          Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _card({
    required VoidCallback? onTap,
    required bool selected,
    required Color accent,
    required Widget child,
  }) {
    return Material(
      color: Colors.white.withValues(alpha: .04),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: selected ? accent : Colors.white12, width: selected ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(padding: const EdgeInsets.all(10), child: child),
      ),
    );
  }

  int _hexInt(String hex) => 0xFF000000 | int.parse(hex.substring(1), radix: 16);
}

/// One cell of the 4×3 skin icon atlas (320px cells at 56 + 384·i).
class SkinIcon extends StatelessWidget {
  const SkinIcon({
    super.key,
    required this.image,
    required this.index,
    required this.scale,
    this.size = 30,
  });

  final ui.Image? image;
  final double scale;
  final int index;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _IconPainter(image, index, scale)),
    );
  }
}

class _IconPainter extends CustomPainter {
  _IconPainter(this.image, this.index, this.scale);

  final ui.Image? image;
  final int index;
  final double scale;

  @override
  void paint(Canvas canvas, Size size) {
    final img = image;
    if (img == null) return;
    final col = index % 4;
    final row = index ~/ 4;
    final src = Rect.fromLTWH(
        (56 + 384.0 * col) * scale, (56 + 384.0 * row) * scale, 320 * scale, 320 * scale);
    canvas.drawImageRect(img, src, Offset.zero & size, Paint()..filterQuality = FilterQuality.medium);
  }

  @override
  bool shouldRepaint(covariant _IconPainter old) => old.image != image || old.index != index || old.scale != scale;
}
