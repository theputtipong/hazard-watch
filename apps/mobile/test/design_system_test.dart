import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/app.dart';
import 'package:hazardwatch/settings.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';
import 'package:hazardwatch/theme/web_palettes.g.dart';
import 'package:hazardwatch/widgets/severity.dart';

Future<AppSettings> pumpApp(
  WidgetTester tester, {
  ThemeMode mode = ThemeMode.light,
  bool cvd = false,
  String lang = 'th',
}) async {
  final settings = AppSettings()
    ..themeMode = mode
    ..cvd = cvd
    ..locale = Locale(lang);
  await tester.pumpWidget(HazardWatchApp(settings: settings));
  await tester.pumpAndSettle();
  return settings;
}

/// Every colour role both systems share, by the same name.
Map<String, Color> shared(HwColors c) => {
  'bg': c.bg,
  'surface': c.surface,
  'surfaceSunken': c.surfaceSunken,
  'line': c.line,
  'lineControl': c.lineControl,
  'ink': c.ink,
  'inkMuted': c.inkMuted,
  'onInk': c.onInk,
  'brand': c.brand,
  'accent': c.accent,
  'onAccent': c.onAccent,
  'water': c.water,
  'sevNormal': c.sevNormal,
  'sevWatch': c.sevWatch,
  'sevWatchInk': c.sevWatchInk,
  'sevWatchSoft': c.sevWatchSoft,
  'sevWarning': c.sevWarning,
  'sevWarningInk': c.sevWarningInk,
  'sevWarningSoft': c.sevWarningSoft,
  'sevDanger': c.sevDanger,
  'sevDangerInk': c.sevDangerInk,
  'sevDangerSoft': c.sevDangerSoft,
  'onSev': c.onSev,
  'onSevDanger': c.onSevDanger,
};

Map<String, Color> web(WebPalette p) => {
  'bg': p.bg,
  'surface': p.surface,
  'surfaceSunken': p.surfaceSunken,
  'line': p.line,
  'lineControl': p.lineControl,
  'ink': p.ink,
  'inkMuted': p.inkMuted,
  'onInk': p.onInk,
  'brand': p.brand,
  'accent': p.accent,
  'onAccent': p.onAccent,
  'water': p.water,
  'sevNormal': p.sevNormal,
  'sevWatch': p.sevWatch,
  'sevWatchInk': p.sevWatchInk,
  'sevWatchSoft': p.sevWatchSoft,
  'sevWarning': p.sevWarning,
  'sevWarningInk': p.sevWarningInk,
  'sevWarningSoft': p.sevWarningSoft,
  'sevDanger': p.sevDanger,
  'sevDangerInk': p.sevDangerInk,
  'sevDangerSoft': p.sevDangerSoft,
  'onSev': p.onSev,
  'onSevDanger': p.onSevDanger,
};

void main() {
  // If this fails, the mobile design system and packages/tokens/tokens.json disagree on a colour: fix one of them.
  test('mobile design system colours match the web tokens', () {
    expect(shared(HwColors.light), web(WebPalettes.light));
    expect(shared(HwColors.dark), web(WebPalettes.dark));
  });

  test('CVD mode swaps only the severity colours', () {
    for (final (b, base, cvd) in [
      (Brightness.light, HwColors.light, WebPalettes.lightCvd),
      (Brightness.dark, HwColors.dark, WebPalettes.darkCvd),
    ]) {
      final c = hwAppTheme(b, cvd: true).extension<HwColors>()!;
      expect(shared(c), web(cvd), reason: '$b');
      expect(c.scrim, base.scrim);
      expect(hwAppTheme(b, cvd: false).extension<HwColors>(), same(base));
    }
  });

  test('Thai text styles keep line-height of at least 1.5x', () {
    final t = hwTheme(Brightness.light).textTheme;
    // text-heading (24/34 = 1.417) is below the design system's own 1.5 rule; reported upstream, not checked here
    // until the design system decides.
    for (final (name, s) in [
      ('title', t.titleMedium),
      ('body', t.bodyLarge),
      ('label', t.labelLarge),
      ('caption', t.bodySmall),
    ]) {
      expect(s!.height, greaterThanOrEqualTo(1.5), reason: name);
    }
  });

  testWidgets('badges show the level word in Thai and English', (tester) async {
    await pumpApp(tester);
    for (final level in HwLevel.values) {
      expect(find.text(level.th), findsWidgets);
    }
    await pumpApp(tester, lang: 'en');
    for (final level in HwLevel.values) {
      expect(find.text(level.en), findsWidgets);
    }
  });

  testWidgets('screen readers hear the level, not the bars', (tester) async {
    final handle = tester.ensureSemantics();
    await pumpApp(tester);
    // Cards merge their children into one sentence for screen readers, so match within the label.
    expect(find.bySemanticsLabel(RegExp('PM2.5\nระดับ ระวังมาก\n62')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('ระดับ อันตราย')), findsOneWidget);
    handle.dispose();
  });

  testWidgets('meter fills one bar per level', (tester) async {
    await pumpApp(tester);
    for (final level in HwLevel.values) {
      final meter = find.byWidgetPredicate((w) => w is SeverityMeter && w.level == level && !w.large).first;
      final bars = tester
          .widgetList<Container>(find.descendant(of: meter, matching: find.byType(Container)))
          .map((c) => (c.decoration! as BoxDecoration).color!);
      expect(bars.where((c) => c.a == 1).length, level.index, reason: level.name);
    }
  });

  testWidgets('badge is 28dp with soft background and level ink, in every mode', (tester) async {
    for (final (mode, cvd, colors) in [
      (ThemeMode.light, false, web(WebPalettes.light)),
      (ThemeMode.dark, false, web(WebPalettes.dark)),
      (ThemeMode.light, true, web(WebPalettes.lightCvd)),
      (ThemeMode.dark, true, web(WebPalettes.darkCvd)),
    ]) {
      await pumpApp(tester, mode: mode, cvd: cvd);
      final badge = find.byWidgetPredicate((w) => w is SeverityBadge && w.level == HwLevel.danger).first;
      final box = find.descendant(of: badge, matching: find.byType(Container)).first;
      expect(tester.getSize(box).height, 28);
      expect((tester.widget<Container>(box).decoration! as BoxDecoration).color, colors['sevDangerSoft']);
      final word = tester.widget<Text>(find.descendant(of: badge, matching: find.byType(Text)));
      expect(word.style!.color, colors['sevDangerInk'], reason: '$mode cvd=$cvd');
    }
  });

  testWidgets('buttons meet the 48dp touch target', (tester) async {
    await pumpApp(tester);
    for (final type in [FilledButton, OutlinedButton, TextButton]) {
      expect(tester.getSize(find.byType(type).first).height, greaterThanOrEqualTo(48), reason: '$type');
    }
  });

  testWidgets('changing settings re-themes the app', (tester) async {
    final settings = await pumpApp(tester);
    final badge = find.byType(SeverityBadge).first;
    expect(Theme.of(tester.element(badge)).brightness, Brightness.light);
    settings.themeMode = ThemeMode.dark;
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(badge)).brightness, Brightness.dark);
  });
}
