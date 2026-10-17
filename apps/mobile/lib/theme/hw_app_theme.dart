import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'hw_theme.dart';
import 'web_palettes.g.dart';

export 'hw_theme.dart';

/// The design system's theme (hw_theme.dart, copied verbatim from the mobile design system) plus the web's colour-blind
/// mode, which the mobile design system does not define yet. CVD swaps only the severity colours, as on the web.
ThemeData hwAppTheme(Brightness brightness, {required bool cvd}) {
  final base = hwTheme(brightness);
  final c = cvd
      ? _withCvd(
          base.extension<HwColors>()!,
          brightness == Brightness.dark ? WebPalettes.darkCvd : WebPalettes.lightCvd,
        )
      : base.extension<HwColors>()!;
  return _complete(cvd ? base.copyWith(extensions: [c]) : base, c);
}

/// hwTheme sets only the ColorScheme roles the design system names. M3 widgets fall back on the rest (a selected
/// FilterChip's label is onSecondaryContainer, for one), and the unset ones default to colours that vanish on our
/// surfaces, so every container role is mapped to an hw token pair that reads in all four modes.
ThemeData _complete(ThemeData t, HwColors c) {
  final text = t.textTheme;
  bool selected(Set<WidgetState> s) => s.contains(WidgetState.selected);
  return t.copyWith(
    colorScheme: t.colorScheme.copyWith(
      primaryContainer: c.surfaceSunken,
      onPrimaryContainer: c.ink,
      secondaryContainer: c.surfaceSunken,
      onSecondaryContainer: c.ink,
      tertiary: c.accent,
      onTertiary: c.onAccent,
      tertiaryContainer: c.surfaceSunken,
      onTertiaryContainer: c.ink,
      error: c.sevDanger,
      onError: c.onSevDanger,
      errorContainer: c.sevDangerSoft,
      onErrorContainer: c.sevDangerInk,
      surfaceContainerLowest: c.surface,
      surfaceContainerLow: c.surface,
      surfaceContainer: c.surface,
      surfaceContainerHigh: c.surfaceSunken,
      inverseSurface: c.ink,
      onInverseSurface: c.onInk,
      inversePrimary: c.accent,
    ),
    badgeTheme: t.badgeTheme.copyWith(backgroundColor: c.sevDanger, textColor: c.onSevDanger),
    chipTheme: ChipThemeData(
      backgroundColor: c.surface,
      selectedColor: c.surfaceSunken,
      checkmarkColor: c.ink,
      side: BorderSide(color: c.line),
      labelStyle: text.labelLarge!.copyWith(
        color: WidgetStateColor.resolveWith((s) => selected(s) ? c.ink : c.inkMuted),
      ),
      iconTheme: IconThemeData(color: c.ink, size: 18),
    ),
    // The design system's unselected thumb (lineControl) is 2.7:1 on its sunken track; inkMuted is 5.5:1.
    switchTheme: t.switchTheme.copyWith(
      thumbColor: WidgetStateProperty.resolveWith((s) => selected(s) ? c.onInk : c.inkMuted),
    ),
  );
}

/// WCAG 2 contrast ratio of two opaque colours (1 to 21).
double contrastRatio(Color a, Color b) {
  final la = a.computeLuminance(), lb = b.computeLuminance();
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
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
