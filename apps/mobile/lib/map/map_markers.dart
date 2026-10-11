import 'package:flutter/material.dart';

import '../format.dart';
import '../theme/hw_app_theme.dart';
import 'map_data.dart';

/// Pin sizes from WEB.map.iconSize / markerRadius in apps/web/src/config.ts. Each hazard has its own shape, not just
/// colour, so they can be told apart without colour (apps/web/src/components/mapIcons.ts).
abstract final class PinSize {
  static const floodNormal = 8.0;
  static const floodWatch = 26.0;
  static const floodWarn = 30.0;
  static const floodDanger = 34.0;
  static const pm25 = 30.0;
  static const water = 30.0;
  static const rain = 28.0;
  static const quake = 32.0;
  static const you = 34.0;

  /// The tappable area around a pin; normal flood dots are packed too tightly for a full touch target.
  static const hit = HwSize.touchTarget;
  static const hitSmall = 24.0;
}

enum PinShape { dot, circle, roundedSquare, pill, diamond }

/// How one point is drawn: [label] is the text inside the pin, if any.
class PinStyle {
  const PinStyle({required this.shape, required this.size, required this.level, this.label, this.icon});

  final PinShape shape;
  final Size size;
  final HwLevel level;
  final String? label;
  final IconData? icon;

  bool get badge => level == HwLevel.danger;
}

PinStyle pinStyle(MapPoint p) {
  final v = p.value;
  return switch (p.layer) {
    // Normal flood points stay small grey dots so problems stand out.
    MapLayer.flood when p.level == HwLevel.normal => const PinStyle(
      shape: PinShape.dot,
      size: Size.square(PinSize.floodNormal),
      level: HwLevel.normal,
    ),
    MapLayer.flood => PinStyle(
      shape: PinShape.circle,
      size: Size.square(switch (p.level) {
        HwLevel.danger => PinSize.floodDanger,
        HwLevel.warning => PinSize.floodWarn,
        _ => PinSize.floodWatch,
      }),
      level: p.level,
      icon: Icons.water_drop,
    ),
    MapLayer.pm25 => PinStyle(
      shape: PinShape.circle,
      size: const Size.square(PinSize.pm25),
      level: p.level,
      label: '${v!.round()}',
    ),
    // Rounded square, not a circle, so it isn't confused with PM2.5.
    MapLayer.water => PinStyle(
      shape: PinShape.roundedSquare,
      size: const Size.square(PinSize.water),
      level: p.level,
      label: '${v!.round()}%',
    ),
    MapLayer.rain => PinStyle(
      shape: PinShape.pill,
      size: Size(PinSize.rain + 8.0 * numberText(v!).length, PinSize.rain),
      level: p.level,
      icon: Icons.umbrella,
      label: numberText(v),
    ),
    MapLayer.quake => PinStyle(
      shape: PinShape.diamond,
      size: const Size.square(PinSize.quake),
      level: p.level,
      label: v!.toStringAsFixed(1),
    ),
  };
}

/// Ink or white, whichever contrasts more on [fill] (design system on-sev / on-sev-danger; onFill in mapIcons.ts).
Color onFill(Color fill) {
  const ink = Color(0xFF0F1B2E);
  final l = fill.computeLuminance();
  return (l + 0.05) / (ink.computeLuminance() + 0.05) >= 1.05 / (l + 0.05) ? ink : Colors.white;
}

const _shadow = [BoxShadow(color: Color(0x730F1B2D), blurRadius: 4, offset: Offset(0, 1))];

/// One hazard pin. White outline and shadow keep it readable on both map styles.
class HazardPin extends StatelessWidget {
  const HazardPin({super.key, required this.style});

  final PinStyle style;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    final fill = c.solid(style.level);
    final on = onFill(fill);
    final s = style.size;
    final text = TextStyle(
      color: on,
      fontSize: style.shape == PinShape.diamond || (style.label?.length ?? 0) > 3 ? 10 : 11,
      fontWeight: FontWeight.w700,
      height: 1,
    );
    // Pin text is part of the artwork: it shrinks to fit rather than grow with the system text size.
    final content = Padding(
      padding: const EdgeInsets.all(3),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: 2,
          children: [
            if (style.icon != null) Icon(style.icon, size: s.height * (style.label == null ? 0.6 : 0.5), color: on),
            if (style.label != null)
              Text(style.label!, style: text, maxLines: 1, softWrap: false, textScaler: TextScaler.noScaling),
          ],
        ),
      ),
    );

    final Widget pin = switch (style.shape) {
      PinShape.dot => _box(fill, s, const CircleBorder()),
      PinShape.circle => _box(fill, s, const CircleBorder(), content),
      PinShape.roundedSquare => _box(fill, s, _rounded(HwSize.radiusSmall), content),
      PinShape.pill => _box(fill, s, const StadiumBorder(), content),
      PinShape.diamond => SizedBox.fromSize(
        size: s,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Transform.rotate(angle: 0.785398, child: _box(fill, s * 0.72, _rounded(HwSize.radiusTiny))),
            content,
          ],
        ),
      ),
    };
    if (!style.badge) return pin;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        pin,
        Positioned(top: -4, right: -4, child: _AlertBadge(color: c.sevDanger)),
      ],
    );
  }

  static ShapeBorder _rounded(double r) => RoundedRectangleBorder(borderRadius: BorderRadius.circular(r));

  Widget _box(Color fill, Size size, ShapeBorder shape, [Widget? child]) => Container(
    width: size.width,
    height: size.height,
    alignment: Alignment.center,
    decoration: ShapeDecoration(
      color: fill,
      shape: shape is OutlinedBorder ? shape.copyWith(side: const BorderSide(color: Colors.white, width: 1.5)) : shape,
      shadows: _shadow,
    ),
    child: child,
  );
}

/// "!" on danger pins, so the worst level reads without colour.
class _AlertBadge extends StatelessWidget {
  const _AlertBadge({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: 14,
    height: 14,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: Colors.white,
      shape: BoxShape.circle,
      border: Border.all(color: color, width: 1.5),
    ),
    child: Text(
      '!',
      style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700, height: 1),
    ),
  );
}

/// Where the person is (only after they asked for it).
class YouPin extends StatelessWidget {
  const YouPin({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    return Container(
      width: PinSize.you,
      height: PinSize.you,
      decoration: BoxDecoration(
        color: c.accent,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 1.5),
        boxShadow: _shadow,
      ),
      child: Icon(Icons.person, size: PinSize.you * 0.62, color: c.onAccent),
    );
  }
}
