import 'dart:math' as math;

import 'package:flutter/widgets.dart';

/// Smallest gap kept from each screen edge. Phones round their corners, hide
/// notches in the long edge and mark gesture bars; in fullscreen the system
/// does not always report those, so the game keeps its own margin as well.
const double _minSide = 28;
const double _minTop = 14;
const double _minBottom = 18;

/// Screen insets the HUD and menus must stay inside: the larger of what the
/// system reports (cutouts, bars) and the game's own minimum margin.
EdgeInsets safeZone(BuildContext context) {
  final media = MediaQuery.of(context);
  final report = EdgeInsets.fromLTRB(
    math.max(media.padding.left, media.viewPadding.left),
    math.max(media.padding.top, media.viewPadding.top),
    math.max(media.padding.right, media.viewPadding.right),
    math.max(media.padding.bottom, media.viewPadding.bottom),
  );
  return EdgeInsets.fromLTRB(
    math.max(report.left, _minSide),
    math.max(report.top, _minTop),
    math.max(report.right, _minSide),
    math.max(report.bottom, _minBottom),
  );
}

/// Pads [child] so it stays inside the [safeZone].
class SafeZone extends StatelessWidget {
  const SafeZone({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(padding: safeZone(context), child: child);
  }
}
