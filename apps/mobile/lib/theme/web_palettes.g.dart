// GENERATED from packages/tokens/tokens.json by scripts/generate.mjs. Do not edit.

import 'dart:ui' show Color;

/// The web's colour tokens resolved for one mode (same names as HwColors).
class WebPalette {
  const WebPalette({
    required this.bg,
    required this.surface,
    required this.surfaceSunken,
    required this.line,
    required this.lineControl,
    required this.ink,
    required this.inkMuted,
    required this.onInk,
    required this.brand,
    required this.accent,
    required this.onAccent,
    required this.water,
    required this.sevNormal,
    required this.sevWatch,
    required this.sevWatchInk,
    required this.sevWatchSoft,
    required this.sevWarning,
    required this.sevWarningInk,
    required this.sevWarningSoft,
    required this.sevDanger,
    required this.sevDangerInk,
    required this.sevDangerSoft,
    required this.onSev,
    required this.onSevDanger,
  });

  final Color bg;
  final Color surface;
  final Color surfaceSunken;
  final Color line;
  final Color lineControl;
  final Color ink;
  final Color inkMuted;
  final Color onInk;
  final Color brand;
  final Color accent;
  final Color onAccent;
  final Color water;
  final Color sevNormal;
  final Color sevWatch;
  final Color sevWatchInk;
  final Color sevWatchSoft;
  final Color sevWarning;
  final Color sevWarningInk;
  final Color sevWarningSoft;
  final Color sevDanger;
  final Color sevDangerInk;
  final Color sevDangerSoft;
  final Color onSev;
  final Color onSevDanger;
}

abstract final class WebPalettes {
  static const light = WebPalette(
    bg: Color(0xFFF6F7F9),
    surface: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFEEF0F3),
    line: Color(0xFFE2E5EA),
    lineControl: Color(0xFF8A93A3),
    ink: Color(0xFF0F1B2E),
    inkMuted: Color(0xFF566072),
    onInk: Color(0xFFFFFFFF),
    brand: Color(0xFF0F1B2E),
    accent: Color(0xFF2457D6),
    onAccent: Color(0xFFFFFFFF),
    water: Color(0xFF3D7BFF),
    sevNormal: Color(0xFF8A93A3),
    sevWatch: Color(0xFFB07F00),
    sevWatchInk: Color(0xFF7A5500),
    sevWatchSoft: Color(0xFFFDF3D3),
    sevWarning: Color(0xFFE0640A),
    sevWarningInk: Color(0xFF9C4006),
    sevWarningSoft: Color(0xFFFDE8D6),
    sevDanger: Color(0xFFC81E1E),
    sevDangerInk: Color(0xFFA3171B),
    sevDangerSoft: Color(0xFFFBE1E1),
    onSev: Color(0xFF0F1B2E),
    onSevDanger: Color(0xFFFFFFFF),
  );
  static const dark = WebPalette(
    bg: Color(0xFF0A111E),
    surface: Color(0xFF111B2C),
    surfaceSunken: Color(0xFF1A263A),
    line: Color(0xFF1F2B40),
    lineControl: Color(0xFF5D6B84),
    ink: Color(0xFFE6EBF3),
    inkMuted: Color(0xFF94A1B8),
    onInk: Color(0xFF0A111E),
    brand: Color(0xFF1E3254),
    accent: Color(0xFF8DBBFF),
    onAccent: Color(0xFF0A111E),
    water: Color(0xFF3D7BFF),
    sevNormal: Color(0xFF5D6B84),
    sevWatch: Color(0xFFF5C542),
    sevWatchInk: Color(0xFFF5C542),
    sevWatchSoft: Color(0xFF2E2610),
    sevWarning: Color(0xFFFF9440),
    sevWarningInk: Color(0xFFFF9440),
    sevWarningSoft: Color(0xFF35200F),
    sevDanger: Color(0xFFFF6464),
    sevDangerInk: Color(0xFFFF7A7A),
    sevDangerSoft: Color(0xFF3A1519),
    onSev: Color(0xFF0A111E),
    onSevDanger: Color(0xFF0A111E),
  );

  /// Colour-blind safe severity colours (Paul Tol "muted"); hues also differ in lightness.
  static const lightCvd = WebPalette(
    bg: Color(0xFFF6F7F9),
    surface: Color(0xFFFFFFFF),
    surfaceSunken: Color(0xFFEEF0F3),
    line: Color(0xFFE2E5EA),
    lineControl: Color(0xFF8A93A3),
    ink: Color(0xFF0F1B2E),
    inkMuted: Color(0xFF566072),
    onInk: Color(0xFFFFFFFF),
    brand: Color(0xFF0F1B2E),
    accent: Color(0xFF2457D6),
    onAccent: Color(0xFFFFFFFF),
    water: Color(0xFF3D7BFF),
    sevNormal: Color(0xFF8A93A3),
    sevWatch: Color(0xFFDDCC77),
    sevWatchInk: Color(0xFF5C4F10),
    sevWatchSoft: Color(0xFFF6F0D6),
    sevWarning: Color(0xFFCC6677),
    sevWarningInk: Color(0xFF7A2F3F),
    sevWarningSoft: Color(0xFFF5DDE2),
    sevDanger: Color(0xFF882255),
    sevDangerInk: Color(0xFF5A0F33),
    sevDangerSoft: Color(0xFFECD3DF),
    onSev: Color(0xFF0F1B2E),
    onSevDanger: Color(0xFFFFFFFF),
  );
  static const darkCvd = WebPalette(
    bg: Color(0xFF0A111E),
    surface: Color(0xFF111B2C),
    surfaceSunken: Color(0xFF1A263A),
    line: Color(0xFF1F2B40),
    lineControl: Color(0xFF5D6B84),
    ink: Color(0xFFE6EBF3),
    inkMuted: Color(0xFF94A1B8),
    onInk: Color(0xFF0A111E),
    brand: Color(0xFF1E3254),
    accent: Color(0xFF8DBBFF),
    onAccent: Color(0xFF0A111E),
    water: Color(0xFF3D7BFF),
    sevNormal: Color(0xFF5D6B84),
    sevWatch: Color(0xFFDDCC77),
    sevWatchInk: Color(0xFFEADF9E),
    sevWatchSoft: Color(0xFF3A3519),
    sevWarning: Color(0xFFCC6677),
    sevWarningInk: Color(0xFFF0A9B6),
    sevWarningSoft: Color(0xFF42232B),
    sevDanger: Color(0xFFE59AC0),
    sevDangerInk: Color(0xFFE59AC0),
    sevDangerSoft: Color(0xFF3A1427),
    onSev: Color(0xFF0A111E),
    onSevDanger: Color(0xFF0A111E),
  );
}
