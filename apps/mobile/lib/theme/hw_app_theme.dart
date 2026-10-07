import 'package:flutter/material.dart';

import 'hw_theme.dart';
import 'web_palettes.g.dart';

export 'hw_theme.dart';

/// The design system's theme (hw_theme.dart, copied verbatim from the mobile design system) plus the web's colour-blind
/// mode, which the mobile design system does not define yet. CVD swaps only the severity colours, as on the web.
ThemeData hwAppTheme(Brightness brightness, {required bool cvd}) {
  final base = hwTheme(brightness);
  if (!cvd) return base;
  final c = _withCvd(
    base.extension<HwColors>()!,
    brightness == Brightness.dark ? WebPalettes.darkCvd : WebPalettes.lightCvd,
  );
  return base.copyWith(
    extensions: [c],
    colorScheme: base.colorScheme.copyWith(error: c.sevDanger, onError: c.onSevDanger),
    badgeTheme: base.badgeTheme.copyWith(backgroundColor: c.sevDanger, textColor: c.onSevDanger),
  );
}

HwColors _withCvd(HwColors c, WebPalette p) => HwColors(
  bg: c.bg,
  surface: c.surface,
  surfaceSunken: c.surfaceSunken,
  line: c.line,
  lineControl: c.lineControl,
  ink: c.ink,
  inkMuted: c.inkMuted,
  onInk: c.onInk,
  brand: c.brand,
  accent: c.accent,
  onAccent: c.onAccent,
  water: c.water,
  sevNormal: p.sevNormal,
  sevWatch: p.sevWatch,
  sevWatchInk: p.sevWatchInk,
  sevWatchSoft: p.sevWatchSoft,
  sevWarning: p.sevWarning,
  sevWarningInk: p.sevWarningInk,
  sevWarningSoft: p.sevWarningSoft,
  sevDanger: p.sevDanger,
  sevDangerInk: p.sevDangerInk,
  sevDangerSoft: p.sevDangerSoft,
  onSev: p.onSev,
  onSevDanger: p.onSevDanger,
  scrim: c.scrim,
);

extension HwContext on BuildContext {
  HwColors get hw => Theme.of(this).extension<HwColors>()!;
}
