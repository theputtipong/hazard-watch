// HazardWatch Mobile — Flutter theme generated from the design system's tokens.json.
// Requires Flutter 3.27+ (Material 3, CardThemeData). Do not edit by hand: change tokens.json and regenerate.
//
// pubspec.yaml:
//   flutter:
//     fonts:
//       - family: IBMPlexSansThai
//         fonts:
//           - asset: assets/fonts/IBMPlexSansThai-Regular.ttf
//           - asset: assets/fonts/IBMPlexSansThai-Medium.ttf
//             weight: 500
//           - asset: assets/fonts/IBMPlexSansThai-SemiBold.ttf
//             weight: 600
//           - asset: assets/fonts/IBMPlexSansThai-Bold.ttf
//             weight: 700
//
// Usage:
//   MaterialApp(theme: hwTheme(Brightness.light), darkTheme: hwTheme(Brightness.dark), themeMode: ThemeMode.system)
//   final c = Theme.of(context).extension<HwColors>()!;

import 'dart:ui' show FontFeature;
import 'package:flutter/material.dart';

const String hwFontFamily = 'IBMPlexSansThai';

/// Spacing, sizes and corner radii in logical pixels (dp).
abstract final class HwSize {
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space6 = 24;
  static const double space8 = 32;
  static const double touchTarget = 48;
  static const double radiusTiny = 4;
  static const double radiusSmall = 8;
  static const double radiusControl = 12;
  static const double radiusCard = 16;
  static const double radiusSheet = 28;
  static const double radiusPill = 999;
}

/// Severity level shared by every hazard. Thresholds live in packages/core/src/config.ts.
enum HwLevel {
  normal('ปกติ', 'Normal'),
  watch('ระวัง', 'Caution'),
  warning('ระวังมาก', 'Warning'),
  danger('อันตราย', 'Danger');

  const HwLevel(this.th, this.en);
  final String th;
  final String en;
  String label(Locale locale) => locale.languageCode == 'th' ? th : en;
}

/// Every colour token, per theme. Read with Theme.of(context).extension<HwColors>()!.
@immutable
class HwColors extends ThemeExtension<HwColors> {
  const HwColors({
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
    required this.scrim,
  });

  /// พื้นของทุกหน้าจอ (Scaffold) และพื้นที่รอบแผนที่
  final Color bg;
  /// การ์ด bottom sheet แถบเมนูล่าง (NavigationBar) และ dialog
  final Color surface;
  /// ช่องกรอก ราง gauge ตัวบ่งชี้เมนูที่เลือก และ badge ระดับปกติ ในธีมมืดสว่างกว่า surface เพื่อให้แยกได้
  final Color surfaceSunken;
  /// เส้นขอบการ์ดและเส้นคั่นรายการ (Divider) ไม่ใช่ขอบของปุ่มหรือช่องกรอก
  final Color line;
  /// ขอบของช่องกรอก ปุ่ม outlined สวิตช์ checkbox และแถบจับของ bottom sheet (3:1 บน surface)
  final Color lineControl;
  /// ข้อความหลักบน bg, surface และ surface-sunken; และพื้นปุ่ม FilledButton
  final Color ink;
  /// ป้ายกำกับ หน่วย แหล่งข้อมูล และเวลาอัปเดต บน bg, surface และ surface-sunken (≥4.5:1)
  final Color inkMuted;
  /// ข้อความบนพื้น ink (ปุ่ม FilledButton)
  final Color onInk;
  /// กรมท่าของแบรนด์ ใช้กับไอคอน แบรนด์ และ cover เท่านั้น ไม่ใช้ใน UI (ธีมมืดยกให้สว่างขึ้นเพื่อไม่ให้จมหายไปกับ bg)
  final Color brand;
  /// ลิงก์ วงแหวน focus และสถานะที่เลือก ไม่ใช่สีของความเสี่ยง
  final Color accent;
  /// ข้อความบนพื้น accent
  final Color onAccent;
  /// คลื่นน้ำในไอคอนและเส้นระดับน้ำบนแผนที่
  final Color water;
  /// สถานะปกติ: แท่ง meter ที่ว่าง และจุดบนแผนที่เมื่อไม่มีความเสี่ยง ปกติไม่ใช้สี
  final Color sevNormal;
  /// ระดับ 1 ระวัง: พื้นทึบบนแผนที่และแท่ง meter บน surface (3:1)
  final Color sevWatch;
  /// ข้อความระดับระวังบน sev-watch-soft และ surface
  final Color sevWatchInk;
  /// พื้น badge และ AlertCard ระดับระวัง
  final Color sevWatchSoft;
  /// ระดับ 2 ระวังมาก: พื้นทึบบนแผนที่และแท่ง meter บน surface (3:1)
  final Color sevWarning;
  /// ข้อความระดับระวังมากบน sev-warning-soft และ surface
  final Color sevWarningInk;
  /// พื้น badge และ AlertCard ระดับระวังมาก
  final Color sevWarningSoft;
  /// ระดับ 3 อันตราย: พื้นทึบบนแผนที่และแท่ง meter
  final Color sevDanger;
  /// ข้อความระดับอันตรายบน sev-danger-soft และ surface
  final Color sevDangerInk;
  /// พื้น badge และ AlertCard ระดับอันตราย
  final Color sevDangerSoft;
  /// ข้อความบนพื้นทึบ sev-watch และ sev-warning (เช่น ป้ายบนแผนที่)
  final Color onSev;
  /// ข้อความบนพื้นทึบ sev-danger
  final Color onSevDanger;
  /// ชั้นมืดหลัง dialog และ bottom sheet แบบเต็มจอ
  final Color scrim;

  static const light = HwColors(
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
    scrim: Color.fromRGBO(15, 27, 46, 0.45),
  );

  static const dark = HwColors(
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
    scrim: Color.fromRGBO(0, 0, 0, 0.6),
  );

  /// Solid fill for map pins and gauge bars.
  Color solid(HwLevel l) => switch (l) {
        HwLevel.normal => sevNormal,
        HwLevel.watch => sevWatch,
        HwLevel.warning => sevWarning,
        HwLevel.danger => sevDanger,
      };

  /// Text and meter bars on [soft] or surface.
  Color text(HwLevel l) => switch (l) {
        HwLevel.normal => inkMuted,
        HwLevel.watch => sevWatchInk,
        HwLevel.warning => sevWarningInk,
        HwLevel.danger => sevDangerInk,
      };

  /// Background of badges and AlertCards.
  Color soft(HwLevel l) => switch (l) {
        HwLevel.normal => surfaceSunken,
        HwLevel.watch => sevWatchSoft,
        HwLevel.warning => sevWarningSoft,
        HwLevel.danger => sevDangerSoft,
      };

  @override
  HwColors copyWith() => this; // tokens are fixed; change tokens.json instead

  @override
  HwColors lerp(ThemeExtension<HwColors>? other, double t) {
    if (other is! HwColors) return this;
    return HwColors(
      bg: Color.lerp(bg, other.bg, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceSunken: Color.lerp(surfaceSunken, other.surfaceSunken, t)!,
      line: Color.lerp(line, other.line, t)!,
      lineControl: Color.lerp(lineControl, other.lineControl, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      inkMuted: Color.lerp(inkMuted, other.inkMuted, t)!,
      onInk: Color.lerp(onInk, other.onInk, t)!,
      brand: Color.lerp(brand, other.brand, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      onAccent: Color.lerp(onAccent, other.onAccent, t)!,
      water: Color.lerp(water, other.water, t)!,
      sevNormal: Color.lerp(sevNormal, other.sevNormal, t)!,
      sevWatch: Color.lerp(sevWatch, other.sevWatch, t)!,
      sevWatchInk: Color.lerp(sevWatchInk, other.sevWatchInk, t)!,
      sevWatchSoft: Color.lerp(sevWatchSoft, other.sevWatchSoft, t)!,
      sevWarning: Color.lerp(sevWarning, other.sevWarning, t)!,
      sevWarningInk: Color.lerp(sevWarningInk, other.sevWarningInk, t)!,
      sevWarningSoft: Color.lerp(sevWarningSoft, other.sevWarningSoft, t)!,
      sevDanger: Color.lerp(sevDanger, other.sevDanger, t)!,
      sevDangerInk: Color.lerp(sevDangerInk, other.sevDangerInk, t)!,
      sevDangerSoft: Color.lerp(sevDangerSoft, other.sevDangerSoft, t)!,
      onSev: Color.lerp(onSev, other.onSev, t)!,
      onSevDanger: Color.lerp(onSevDanger, other.onSevDanger, t)!,
      scrim: Color.lerp(scrim, other.scrim, t)!,
    );
  }
}

TextTheme hwTextTheme(Color ink, Color muted) => TextTheme(
    displaySmall: TextStyle(fontFamily: hwFontFamily, fontSize: 40, height: 1.100, fontWeight: FontWeight.w600, color: ink, letterSpacing: -0.80, fontFeatures: [FontFeature.tabularFigures()]),
    headlineMedium: TextStyle(fontFamily: hwFontFamily, fontSize: 28, height: 1.143, fontWeight: FontWeight.w600, color: ink, letterSpacing: -0.28, fontFeatures: [FontFeature.tabularFigures()]),
    headlineSmall: TextStyle(fontFamily: hwFontFamily, fontSize: 24, height: 1.417, fontWeight: FontWeight.w600, color: ink),
    titleMedium: TextStyle(fontFamily: hwFontFamily, fontSize: 18, height: 1.556, fontWeight: FontWeight.w600, color: ink),
    bodyLarge: TextStyle(fontFamily: hwFontFamily, fontSize: 16, height: 1.625, fontWeight: FontWeight.w400, color: ink),
    bodyMedium: TextStyle(fontFamily: hwFontFamily, fontSize: 16, height: 1.625, fontWeight: FontWeight.w400, color: ink),
    labelLarge: TextStyle(fontFamily: hwFontFamily, fontSize: 14, height: 1.571, fontWeight: FontWeight.w500, color: ink),
    bodySmall: TextStyle(fontFamily: hwFontFamily, fontSize: 13, height: 1.538, fontWeight: FontWeight.w400, color: muted),
    );

ThemeData hwTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? HwColors.dark : HwColors.light;
  final text = hwTextTheme(c.ink, c.inkMuted);
  final control = RoundedRectangleBorder(borderRadius: BorderRadius.circular(HwSize.radiusControl));
  const tap = Size(HwSize.touchTarget, HwSize.touchTarget);

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    fontFamily: hwFontFamily,
    colorScheme: ColorScheme(
      brightness: brightness,
      primary: c.ink,
      onPrimary: c.onInk,
      secondary: c.accent,
      onSecondary: c.onAccent,
      error: c.sevDanger,
      onError: c.onSevDanger,
      surface: c.surface,
      onSurface: c.ink,
      onSurfaceVariant: c.inkMuted,
      surfaceContainerHighest: c.surfaceSunken,
      outline: c.lineControl,
      outlineVariant: c.line,
      scrim: c.scrim,
    ),
    scaffoldBackgroundColor: c.bg,
    textTheme: text,
    extensions: [c],
    materialTapTargetSize: MaterialTapTargetSize.padded,
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.ink, foregroundColor: c.onInk,
        minimumSize: tap, shape: control, textStyle: text.labelLarge,
        padding: const EdgeInsets.symmetric(horizontal: HwSize.space6),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.ink, side: BorderSide(color: c.lineControl),
        minimumSize: tap, shape: control, textStyle: text.labelLarge,
        padding: const EdgeInsets.symmetric(horizontal: HwSize.space6),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: c.ink, minimumSize: tap, shape: control, textStyle: text.labelLarge),
    ),
    cardTheme: CardThemeData(
      color: c.surface, elevation: 0, margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(HwSize.radiusCard), side: BorderSide(color: c.line),
      ),
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
    navigationBarTheme: NavigationBarThemeData(
      height: 80, backgroundColor: c.surface, indicatorColor: c.surfaceSunken, elevation: 0,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => (text.bodySmall ?? const TextStyle()).copyWith(
            color: s.contains(WidgetState.selected) ? c.ink : c.inkMuted,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
          )),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(
            size: 24, color: s.contains(WidgetState.selected) ? c.ink : c.inkMuted,
          )),
    ),
    badgeTheme: BadgeThemeData(backgroundColor: c.sevDanger, textColor: c.onSevDanger),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface, modalBackgroundColor: c.surface, showDragHandle: true,
      dragHandleColor: c.lineControl, dragHandleSize: const Size(32, 4),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(HwSize.radiusSheet))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HwSize.radiusSheet)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: c.surfaceSunken,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(HwSize.radiusControl), borderSide: BorderSide(color: c.lineControl)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(HwSize.radiusControl), borderSide: BorderSide(color: c.lineControl)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(HwSize.radiusControl), borderSide: BorderSide(color: c.accent, width: 2)),
    ),
    focusColor: c.accent.withValues(alpha: 0.12),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.ink : Colors.transparent),
      checkColor: WidgetStatePropertyAll(c.onInk),
      side: BorderSide(color: c.lineControl, width: 2),
    ),
    switchTheme: SwitchThemeData(
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.ink : c.surfaceSunken),
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.onInk : c.lineControl),
      trackOutlineColor: WidgetStatePropertyAll(c.lineControl),
    ),
  );
}
