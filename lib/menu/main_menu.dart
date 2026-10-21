import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../game/safe_zone.dart';
import '../game/sprites.dart';

const Color _teal = Color(0xFF3FD0B6);
const Color _ember = Color(0xFFFFB347);
const Color _blood = Color(0xFFFF4D6D);
const Color _ink = Color(0xFF07060B);

const List<String> _tips = [
  'Lempar Kuro ke target untuk menyalakannya.',
  'Tempelkan Kuro di jangkar, lalu lompat untuk tertarik ke sana.',
  'Tangkap Kuro dari dekat untuk lemparan berikutnya yang lebih kuat.',
  'Lompat dari dinding untuk memanjat lebih tinggi.',
  'Setiap skin punya skill dan gaya bermain sendiri.',
];

/// Title screen. Layers, back to front: the Shadow World backdrop drifting
/// slowly, light shafts, a boss silhouette, Shuri and Kuro from their sprite
/// sheets, rising embers, ground fog, then the menu itself inside the safe
/// zone so notches and rounded corners never cover it.
class MainMenu extends StatefulWidget {
  const MainMenu({
    super.key,
    required this.sprites,
    required this.volume,
    required this.onVolume,
    required this.onPlay,
    required this.onReset,
    required this.onClick,
    this.progress,
  });

  final Sprites sprites;
  final double volume;
  final ValueChanged<double> onVolume;
  final VoidCallback onPlay;
  final Future<void> Function() onReset;
  final VoidCallback onClick;

  /// e.g. "Area 3 · Hollow Bell"; null when there is no saved progress.
  final String? progress;

  @override
  State<MainMenu> createState() => _MainMenuState();
}

class _MainMenuState extends State<MainMenu> with TickerProviderStateMixin {
  late final AnimationController _clock =
      AnimationController(vsync: this, duration: const Duration(seconds: 120))..repeat();
  late final AnimationController _intro =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))
        ..forward();
  late double _volume = widget.volume;

  @override
  void initState() {
    super.initState();
    // Warm the sheets the stage draws so the heroes appear without a pop.
    widget.sprites.preload(['SKIN0_MOVE', 'KURO0_SHEET', 'BOSS_YOMI']);
  }

  @override
  void dispose() {
    _clock.dispose();
    _intro.dispose();
    super.dispose();
  }

  double get _t => _clock.value * 120;

  Future<void> _confirmReset() async {
    widget.onClick();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF14182A),
        title: const Text('Reset progres?'),
        content: const Text(
            'Semua titik simpan, skin pilihan, dan waktu terbaik akan dihapus, dan tutorial muncul lagi. Tindakan ini tidak bisa dibatalkan.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false), child: const Text('Batal')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFD64560)),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Hapus progres'),
          ),
        ],
      ),
    );
    if (ok == true) await widget.onReset();
  }

  Future<void> _volumeDialog() {
    widget.onClick();
    return showDialog<void>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          backgroundColor: const Color(0xFF14182A),
          title: const Text('Volume'),
          content: Row(
            children: [
              Icon(_volume <= 0 ? Icons.volume_off : Icons.volume_up, color: Colors.white70),
              Expanded(
                child: Slider(
                  value: _volume,
                  activeColor: _teal,
                  onChanged: (v) {
                    setLocal(() => _volume = v);
                    setState(() {});
                    widget.onVolume(v);
                  },
                ),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Selesai')),
          ],
        ),
      ),
    );
  }

  // Fades and slides an element in during its slice of the intro.
  Widget _appear(double from, double to, Widget child, {Offset slide = const Offset(0, .12)}) {
    final curve = CurvedAnimation(
      parent: _intro,
      curve: Interval(from, to, curve: Curves.easeOutCubic),
    );
    return FadeTransition(
      opacity: curve,
      child: SlideTransition(
        position: Tween<Offset>(begin: slide, end: Offset.zero).animate(curve),
        child: child,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _ink,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Backdrop with a slow push-in and drift.
          AnimatedBuilder(
            animation: _clock,
            builder: (context, child) {
              final t = _t;
              return Transform.translate(
                offset: Offset(math.sin(t * .12) * 14, math.cos(t * .09) * 8),
                child: Transform.scale(scale: 1.1 + .03 * math.sin(t * .07), child: child),
              );
            },
            child: Image.asset('assets/images/bg_area11.webp', fit: BoxFit.cover),
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(-.35, .1),
                radius: 1.15,
                colors: [Color(0x1107060B), Color(0xBB07060B), Color(0xF007060B)],
                stops: [0, .65, 1],
              ),
            ),
          ),
          AnimatedBuilder(
            animation: _clock,
            builder: (context, child) => CustomPaint(painter: _RaysPainter(_t)),
          ),
          AnimatedBuilder(
            animation: _clock,
            builder: (context, child) =>
                CustomPaint(painter: _StagePainter(widget.sprites, _t)),
          ),
          AnimatedBuilder(
            animation: _clock,
            builder: (context, child) => CustomPaint(painter: _EmberPainter(_t)),
          ),
          AnimatedBuilder(
            animation: _clock,
            builder: (context, child) => CustomPaint(painter: _FogPainter(_t)),
          ),
          SafeZone(
            child: LayoutBuilder(
              builder: (context, box) {
                final wide = box.maxWidth > box.maxHeight * 1.15;
                final compact = box.maxHeight < 380;
                final menu = _menu(compact: compact);
                return Stack(
                  children: [
                    wide
                        ? Row(
                            children: [
                              const Spacer(flex: 4),
                              Expanded(flex: 5, child: Center(child: menu)),
                            ],
                          )
                        : Align(alignment: const Alignment(0, .5), child: menu),
                    Positioned(
                      right: 0,
                      top: 0,
                      child: _appear(.5, 1,
                          _RoundButton(
                            icon: _volume <= 0 ? Icons.volume_off : Icons.volume_up,
                            onTap: _volumeDialog,
                          ),
                          slide: const Offset(0, -.4)),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: _appear(.6, 1, _tipLine()),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _tipLine() {
    return AnimatedBuilder(
      animation: _clock,
      builder: (context, child) {
        final tip = _tips[(_t / 5).floor() % _tips.length];
        return AnimatedSwitcher(
          duration: const Duration(milliseconds: 700),
          child: Text(
            tip,
            key: ValueKey(tip),
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 12,
              fontStyle: FontStyle.italic,
              letterSpacing: .4,
            ),
          ),
        );
      },
    );
  }

  Widget _menu({required bool compact}) {
    return SingleChildScrollView(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 380),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _appear(0, .5, _title(compact), slide: const Offset(0, -.15)),
            SizedBox(height: compact ? 14 : 26),
            _appear(
              .25,
              .8,
              _MenuButton(
                clock: _clock,
                label: widget.progress == null ? 'MULAI' : 'LANJUTKAN',
                sub: widget.progress,
                icon: Icons.play_arrow_rounded,
                primary: true,
                onTap: () {
                  widget.onClick();
                  widget.onPlay();
                },
              ),
            ),
            const SizedBox(height: 12),
            _appear(
              .4,
              .95,
              _MenuButton(
                clock: _clock,
                label: 'RESET PROGRES',
                icon: Icons.restart_alt,
                danger: true,
                onTap: widget.progress == null ? null : _confirmReset,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _title(bool compact) {
    return AnimatedBuilder(
      animation: _clock,
      builder: (context, child) {
        final pulse = .5 + .5 * math.sin(_t * 2);
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: compact ? 58 : 84,
              height: compact ? 58 : 84,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white24),
                boxShadow: [
                  BoxShadow(
                    color: _teal.withValues(alpha: .25 + .3 * pulse),
                    blurRadius: 22 + 18 * pulse,
                    spreadRadius: 1 + 2 * pulse,
                  ),
                ],
              ),
              child: ClipOval(child: Image.asset('assets/images/logo.png', fit: BoxFit.cover)),
            ),
            const SizedBox(height: 12),
            ShaderMask(
              shaderCallback: (rect) => const LinearGradient(
                colors: [Colors.white, Color(0xFF9FF3E3), _teal],
              ).createShader(rect),
              child: Text(
                'SHURI & KURO',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: compact ? 28 : 40,
                  fontWeight: FontWeight.w900,
                  letterSpacing: compact ? 4 : 6,
                  shadows: [Shadow(color: _teal.withValues(alpha: .7), blurRadius: 24)],
                ),
              ),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _rule(),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text(
                    'IN SHADOWFALL',
                    style: TextStyle(
                      color: _ember,
                      fontSize: compact ? 12 : 15,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 7,
                      shadows: [Shadow(color: _ember.withValues(alpha: .6), blurRadius: 12)],
                    ),
                  ),
                ),
                _rule(),
              ],
            ),
          ],
        );
      },
    );
  }

  Widget _rule() => Container(
        width: 28,
        height: 1.5,
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: [Colors.transparent, _ember.withValues(alpha: .8)]),
        ),
      );
}

class _MenuButton extends StatefulWidget {
  const _MenuButton({
    required this.clock,
    required this.label,
    required this.icon,
    required this.onTap,
    this.sub,
    this.primary = false,
    this.danger = false,
  });

  final Animation<double> clock;
  final String label;
  final String? sub;
  final IconData icon;
  final VoidCallback? onTap;
  final bool primary;
  final bool danger;

  @override
  State<_MenuButton> createState() => _MenuButtonState();
}

class _MenuButtonState extends State<_MenuButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    final accent = widget.danger ? _blood : _teal;
    final primary = widget.primary;
    final radius = BorderRadius.circular(18);
    return Opacity(
      opacity: enabled ? 1 : .4,
      child: GestureDetector(
        onTapDown: enabled ? (_) => setState(() => _down = true) : null,
        onTapCancel: () => setState(() => _down = false),
        onTapUp: (_) => setState(() => _down = false),
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _down ? .96 : 1,
          duration: const Duration(milliseconds: 90),
          child: AnimatedBuilder(
            animation: widget.clock,
            builder: (context, child) {
              // A bright band sweeps across the primary button every few seconds.
              final sweep = ((widget.clock.value * 120) % 4) / 4;
              return Container(
                width: double.infinity,
                padding: EdgeInsets.symmetric(vertical: primary ? 15 : 11, horizontal: 20),
                decoration: BoxDecoration(
                  borderRadius: radius,
                  gradient: primary
                      ? LinearGradient(
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                          colors: const [Color(0xFF3FD0B6), Color(0xFF2B9BC9), Color(0xFF3FD0B6)],
                          stops: [
                            (sweep - .25).clamp(0.0, 1.0),
                            sweep.clamp(0.0, 1.0),
                            (sweep + .25).clamp(0.0, 1.0),
                          ],
                        )
                      : null,
                  color: primary ? null : Colors.black.withValues(alpha: .45),
                  border: Border.all(
                    color: primary ? Colors.white70 : accent.withValues(alpha: .55),
                    width: primary ? 1.6 : 1,
                  ),
                  boxShadow: primary
                      ? [BoxShadow(color: _teal.withValues(alpha: .5), blurRadius: 22)]
                      : null,
                ),
                child: child,
              );
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(widget.icon,
                    color: primary ? _ink : accent, size: primary ? 30 : 22),
                const SizedBox(width: 10),
                Flexible(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.label,
                        style: TextStyle(
                          color: primary ? _ink : accent,
                          fontSize: primary ? 20 : 14,
                          fontWeight: FontWeight.w900,
                          letterSpacing: primary ? 3 : 2,
                        ),
                      ),
                      if (widget.sub != null)
                        Text(widget.sub!,
                            style: const TextStyle(color: Color(0xCC07060B), fontSize: 12),
                            overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black54,
      shape: const CircleBorder(side: BorderSide(color: Colors.white24)),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(width: 44, height: 44, child: Icon(icon, color: Colors.white)),
      ),
    );
  }
}

/// Slanted shafts of light that breathe in and out.
class _RaysPainter extends CustomPainter {
  _RaysPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < 5; i++) {
      final phase = .5 + .5 * math.sin(t * .5 + i * 1.7);
      final x = size.width * (.05 + i * .17) + math.sin(t * .1 + i) * 20;
      final w = size.width * (.05 + .02 * (i % 3));
      final path = Path()
        ..moveTo(x, -10)
        ..lineTo(x + w, -10)
        ..lineTo(x + w + size.height * .55, size.height)
        ..lineTo(x + size.height * .45, size.height)
        ..close();
      canvas.drawPath(
        path,
        Paint()
          ..shader = ui.Gradient.linear(
            Offset(x, 0),
            Offset(x + size.height * .5, size.height),
            [
              _teal.withValues(alpha: .10 * phase),
              _teal.withValues(alpha: 0),
            ],
          ),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RaysPainter old) => old.t != t;
}

/// A boss looming on the right, Shuri and Kuro standing on the left.
class _StagePainter extends CustomPainter {
  _StagePainter(this.sprites, this.t);

  final Sprites sprites;
  final double t;

  void _cell(Canvas canvas, ui.Image img, String key, int row, int col, Offset bottomCenter,
      double height,
      {bool flip = false, Paint? paint}) {
    final cw = img.width / 5;
    final rows = math.max(1, (img.height / cw).round());
    final ch = img.height / rows;
    final w = height * cw / ch;
    canvas.save();
    canvas.translate(bottomCenter.dx, bottomCenter.dy - height);
    if (flip) canvas.scale(-1, 1);
    canvas.drawImageRect(
      img,
      Rect.fromLTWH(col * cw, row * ch, cw, ch),
      Rect.fromLTWH(-w / 2 + sprites.centerShift(key, row, col) * w, 0, w, height),
      paint ?? (Paint()..filterQuality = FilterQuality.low),
    );
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    final wide = size.width > size.height * 1.15;
    final h = math.min(size.height * .82, size.width * (wide ? .36 : .8));
    final heroX = wide ? size.width * .22 : size.width * .5;
    final ground = Offset(heroX, size.height * .93);

    // The boss: a dark silhouette with a red glow, fading into the dark.
    final boss = sprites.get('BOSS_YOMI');
    if (boss != null && wide) {
      final bh = size.height * 1.05;
      final at = Offset(size.width * .8, size.height * 1.02 + math.sin(t * .8) * 6);
      canvas.drawCircle(
        at.translate(0, -bh * .5),
        bh * .5,
        Paint()
          ..shader = ui.Gradient.radial(at.translate(0, -bh * .5), bh * .5, [
            _blood.withValues(alpha: .22),
            _blood.withValues(alpha: 0),
          ]),
      );
      _cell(canvas, boss, 'BOSS_YOMI', 0, (t * 5).floor() % 5, at, bh,
          flip: true,
          paint: Paint()
            ..filterQuality = FilterQuality.low
            ..colorFilter = const ColorFilter.mode(Color(0xAA150818), BlendMode.srcATop));
    }

    // Ground glow under the heroes.
    canvas.drawOval(
      Rect.fromCenter(center: ground, width: h * .8, height: h * .1),
      Paint()..color = _teal.withValues(alpha: .2),
    );

    final bob = math.sin(t * 2.2) * h * .008;
    final shuri = sprites.get('SKIN0_MOVE');
    if (shuri != null) {
      _cell(canvas, shuri, 'SKIN0_MOVE', 0, (t * 6).floor() % 5, ground.translate(0, bob), h);
    }
    final kuro = sprites.get('KURO0_SHEET');
    if (kuro != null) {
      final k = Offset(
        ground.dx + h * .42 + math.cos(t * 1.6) * h * .07,
        ground.dy - h * .62 + math.sin(t * 2.2) * h * .06,
      );
      canvas.drawCircle(
        k,
        h * .2,
        Paint()
          ..shader = ui.Gradient.radial(k, h * .2, [
            _teal.withValues(alpha: .45),
            _teal.withValues(alpha: 0),
          ]),
      );
      _cell(canvas, kuro, 'KURO0_SHEET', 0, (t * 12).floor() % 5, k.translate(0, h * .1), h * .2);
    }
  }

  @override
  bool shouldRepaint(covariant _StagePainter old) => true;
}

/// Embers rising through the dark. Positions come from the clock, so the
/// painter holds no state.
class _EmberPainter extends CustomPainter {
  _EmberPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < 56; i++) {
      final seed = math.Random(i * 97 + 13);
      final speed = .015 + seed.nextDouble() * .04;
      final rise = (t * speed + seed.nextDouble()) % 1;
      final x = seed.nextDouble() * size.width + math.sin(t * .8 + i) * 22;
      final y = size.height * (1 - rise);
      final r = .8 + seed.nextDouble() * 2.4;
      final fade = math.sin(rise * math.pi);
      final color = i % 3 == 0 ? _teal : (i % 3 == 1 ? _ember : _blood);
      canvas.drawCircle(Offset(x, y), r * 3.2, Paint()..color = color.withValues(alpha: .09 * fade));
      canvas.drawCircle(Offset(x, y), r, Paint()..color = color.withValues(alpha: .85 * fade));
    }
  }

  @override
  bool shouldRepaint(covariant _EmberPainter old) => old.t != t;
}

/// Low fog drifting across the bottom of the screen.
class _FogPainter extends CustomPainter {
  _FogPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < 3; i++) {
      final x = ((t * (8 + i * 5) + i * size.width * .4) % (size.width * 1.6)) - size.width * .3;
      final center = Offset(x, size.height * (.92 - i * .03));
      final rect = Rect.fromCenter(center: center, width: size.width * .9, height: size.height * .3);
      canvas.drawOval(
        rect,
        Paint()
          ..shader = ui.Gradient.radial(center, size.width * .45, [
            Colors.white.withValues(alpha: .07),
            Colors.white.withValues(alpha: 0),
          ]),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _FogPainter old) => old.t != t;
}
