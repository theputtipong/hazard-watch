import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/l10n/gen/app_localizations.dart';
import 'package:hazardwatch/map/base_map.dart';
import 'package:hazardwatch/map/map_markers.dart';
import 'package:hazardwatch/map/nasa_map.dart';
import 'package:hazardwatch/screens/map_screen.dart';
import 'package:hazardwatch/screens/sources_screen.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';
import 'package:hazardwatch/widgets/dam_card.dart';
import 'package:hazardwatch/widgets/river_gauge.dart';
import 'package:hazardwatch/widgets/severity.dart';
import 'package:hazardwatch/widgets/source_link.dart';

/// WCAG 2.1 AA: 4.5:1 for text (1.4.3), 3:1 for meaningful graphics and control parts (1.4.11).
const _text = 4.5;
const _nonText = 3.0;

/// Base map land colours (OpenFreeMap positron / dark) the NASA marks are drawn on.
const _lightMap = Color(0xFFF2EFE9);
const _darkMap = Color(0xFF262626);

const _modes = [
  ('light', Brightness.light, false),
  ('dark', Brightness.dark, false),
  ('light colour-blind', Brightness.light, true),
  ('dark colour-blind', Brightness.dark, true),
];

Future<BuildContext> _pump(WidgetTester tester, Widget child, Brightness brightness, bool cvd) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: hwAppTheme(brightness, cvd: cvd),
      locale: const Locale('th'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: Center(child: child)),
    ),
  );
  await tester.pumpAndSettle();
  return tester.element(find.byType(Scaffold).first);
}

Color _textColour(WidgetTester tester, Finder within) =>
    tester.widget<RichText>(find.descendant(of: within, matching: find.byType(RichText)).first).text.style!.color!;

/// [fg] composited over [bg] when it is translucent, so ratios are for what is actually on screen.
double _ratio(Color fg, Color bg) => contrastRatio(Color.alphaBlend(fg, bg), bg);

void main() {
  test('contrastRatio matches WCAG reference values', () {
    expect(contrastRatio(Colors.black, Colors.white), closeTo(21, 0.01));
    expect(contrastRatio(Colors.white, Colors.white), 1);
    expect(contrastRatio(const Color(0xFF767676), Colors.white), closeTo(4.54, 0.01));
  });

  for (final (name, brightness, cvd) in _modes) {
    group(name, () {
      testWidgets('filter chip labels read on the chip, selected or not', (tester) async {
        await _pump(
          tester,
          Builder(
            builder: (context) {
              final c = context.hw;
              return Column(
                children: [
                  // As the map's layer chips draw them (map_screen.dart _LayerChips).
                  for (final selected in [true, false])
                    FilterChip(
                      key: ValueKey('map-$selected'),
                      label: const Text('น้ำท่วม'),
                      selected: selected,
                      showCheckmark: false,
                      backgroundColor: c.surface,
                      selectedColor: c.surface,
                      onSelected: (_) {},
                    ),
                  // And with the theme's own chip colours.
                  for (final selected in [true, false])
                    FilterChip(
                      key: ValueKey('theme-$selected'),
                      label: const Text('ฝุ่น'),
                      selected: selected,
                      onSelected: (_) {},
                    ),
                ],
              );
            },
          ),
          brightness,
          cvd,
        );
        final ctx = tester.element(find.byKey(const ValueKey('map-true')));
        final c = ctx.hw;
        final chipTheme = Theme.of(ctx).chipTheme;
        for (final (key, bg) in [
          ('map-true', c.surface),
          ('map-false', c.surface),
          ('theme-true', chipTheme.selectedColor!),
          ('theme-false', chipTheme.backgroundColor!),
        ]) {
          final fg = _textColour(tester, find.byKey(ValueKey(key)));
          expect(contrastRatio(fg, bg), greaterThanOrEqualTo(_text), reason: '$key label $fg on $bg');
        }
        expect(_textColour(tester, find.byKey(const ValueKey('map-true'))), c.ink);
        expect(_textColour(tester, find.byKey(const ValueKey('map-false'))), c.inkMuted);
      });

      testWidgets('the "!" on danger pins reads on its badge', (tester) async {
        await _pump(
          tester,
          const HazardPin(
            style: PinStyle(
              shape: PinShape.circle,
              size: Size.square(PinSize.floodDanger),
              level: HwLevel.danger,
              icon: Icons.water_drop,
            ),
          ),
          brightness,
          cvd,
        );
        final mark = find.text('!');
        final fg = tester.widget<Text>(mark).style!.color!;
        final badge = tester.widget<Container>(find.ancestor(of: mark, matching: find.byType(Container)).first);
        final fill = (badge.decoration! as BoxDecoration).color!;
        expect(contrastRatio(fg, fill), greaterThanOrEqualTo(_text), reason: '"!" $fg on $fill');
      });

      testWidgets('empty severity meter bars stand out from the badge', (tester) async {
        await _pump(
          tester,
          Column(children: [for (final l in HwLevel.values) SeverityBadge(level: l)]),
          brightness,
          cvd,
        );
        final c = tester.element(find.byType(SeverityBadge).first).hw;
        for (final level in HwLevel.values) {
          final badge = find.byWidgetPredicate((w) => w is SeverityBadge && w.level == level);
          final bars = tester
              .widgetList<Container>(
                find.descendant(
                  of: find.descendant(of: badge, matching: find.byType(SeverityMeter)),
                  matching: find.byType(Container),
                ),
              )
              .map((b) => b.decoration! as BoxDecoration)
              .toList();
          expect(bars, hasLength(3));
          for (final (i, bar) in bars.indexed) {
            final bg = c.soft(level);
            if (i < level.index) {
              expect(_ratio(bar.color!, bg), greaterThanOrEqualTo(_nonText), reason: '$level filled bar $i');
            } else {
              // An empty bar is seen by its outline.
              final edge = (bar.border! as Border).top.color;
              expect(_ratio(edge, bg), greaterThanOrEqualTo(_nonText), reason: '$level empty bar $i edge $edge on $bg');
            }
          }
        }
      });

      testWidgets('control parts and map marks reach 3:1', (tester) async {
        final ctx = await _pump(tester, const SizedBox(), brightness, cvd);
        final theme = Theme.of(ctx);
        final c = ctx.hw;
        final off = <WidgetState>{};
        final track = theme.switchTheme.trackColor!.resolve(off)!;
        final thumb = theme.switchTheme.thumbColor!.resolve(off)!;
        expect(contrastRatio(thumb, track), greaterThanOrEqualTo(_nonText), reason: 'switch off thumb');
        final on = {WidgetState.selected};
        expect(
          contrastRatio(theme.switchTheme.thumbColor!.resolve(on)!, theme.switchTheme.trackColor!.resolve(on)!),
          greaterThanOrEqualTo(_nonText),
          reason: 'switch on thumb',
        );

        for (final level in HwLevel.values) {
          expect(
            contrastRatio(gaugeBarColor(c, level), c.surfaceSunken),
            greaterThanOrEqualTo(_nonText),
            reason: 'river gauge $level bar on its track',
          );
        }

        final map = brightness == Brightness.dark ? _darkMap : _lightMap;
        expect(contrastRatio(eventColor(ctx), map), greaterThanOrEqualTo(_nonText), reason: 'event pin');
        expect(contrastRatio(eventColor(ctx), c.surface), greaterThanOrEqualTo(_nonText), reason: 'event pin ring');
        expect(contrastRatio(c.onInk, eventColor(ctx)), greaterThanOrEqualTo(_nonText), reason: 'event glyph');
        expect(
          _ratio(eventColor(ctx).withValues(alpha: 0.7), map),
          greaterThanOrEqualTo(_nonText),
          reason: 'storm track',
        );
        expect(_ratio(fireColor(ctx).withValues(alpha: 0.9), map), greaterThanOrEqualTo(_nonText), reason: 'fire dot');
      });

      testWidgets('dam status words, bars and pins read in every status', (tester) async {
        DamReading dam(DamStatus status) => DamReading(
          id: status.name,
          name: const LocalizedText('เขื่อน', 'Dam'),
          size: DamSize.large,
          km: 12,
          storagePct: 90,
          usablePct: 40,
          storageMcm: 600,
          capacityMcm: 960,
          inflowMcm: 4,
          releaseMcm: 1,
          status: status,
          province: 'ลพบุรี',
          basin: null,
          observedAt: DateTime.utc(2026, 10, 4, 17),
          stale: false,
        );
        await _pump(
          tester,
          SingleChildScrollView(
            child: Column(
              children: [
                for (final s in DamStatus.values) DamCard(dams: [dam(s)]),
              ],
            ),
          ),
          brightness,
          cvd,
        );
        final ctx = tester.element(find.byType(DamCard).first);
        final c = ctx.hw;
        final map = brightness == Brightness.dark ? _darkMap : _lightMap;
        for (final s in DamStatus.values) {
          // The status words on the card (and the map sheet, also on surface).
          final fg = tester.widget<Text>(find.byKey(ValueKey('dam-status:${s.name}'))).style!.color!;
          expect(fg, damStatusColor(c, s));
          expect(contrastRatio(fg, c.surface), greaterThanOrEqualTo(_text), reason: 'dam $s text on card');
          expect(
            contrastRatio(gaugeBarColor(c, s.level), c.surfaceSunken),
            greaterThanOrEqualTo(_nonText),
            reason: 'dam $s bar on its track',
          );
          // Pins: the ring carries the shape on either base map, the label reads on the fill.
          final fill = c.solid(s.level);
          expect(contrastRatio(damPinRing(c), map), greaterThanOrEqualTo(_nonText), reason: 'dam pin ring on map');
          expect(contrastRatio(onFill(fill), fill), greaterThanOrEqualTo(_text), reason: 'dam $s pin label');
        }
        // Size, distance, day and the display-only note: muted text on the card.
        final muted = tester.widget<Text>(find.text('ข้อมูลประกอบ ไม่ใช่การแจ้งเตือน').first).style!.color!;
        expect(contrastRatio(muted, c.surface), greaterThanOrEqualTo(_text), reason: 'dam note');
      });

      testWidgets('dam legend text reads on its panel over any base map', (tester) async {
        await _pump(tester, const DamLegend(), brightness, cvd);
        final ctx = tester.element(find.byType(DamLegend));
        final c = ctx.hw;
        final panel = c.surface.withValues(alpha: MapConfig.creditPanelAlpha);
        final fg = tester.widget<Text>(find.text('น้ำมาก')).style!.color!;
        for (final under in [_lightMap, _darkMap, Colors.black, Colors.white]) {
          final bg = Color.alphaBlend(panel, under);
          expect(contrastRatio(fg, bg), greaterThanOrEqualTo(_text), reason: 'dam legend $fg over $under');
        }
      });

      testWidgets('map credit text reads on its panel over any base map', (tester) async {
        await _pump(tester, const SizedBox(width: 400, height: 80, child: BaseMapAttribution()), brightness, cvd);
        final panel = tester
            .widget<Container>(find.descendant(of: find.byType(BaseMapAttribution), matching: find.byType(Container)))
            .color!;
        expect(panel.a, closeTo(MapConfig.creditPanelAlpha, 0.01));
        final fg = _textColour(tester, find.byType(BaseMapAttribution));
        // Whatever is under it: either theme's land colour, a satellite image anywhere from black to white.
        for (final under in [_lightMap, _darkMap, Colors.black, Colors.white]) {
          final bg = Color.alphaBlend(panel, under);
          expect(contrastRatio(fg, bg), greaterThanOrEqualTo(_text), reason: 'credit $fg on panel over $under');
        }
      });

      testWidgets('map data credit strip: plain text and every link read on its solid panel', (tester) async {
        await _pump(
          tester,
          const SizedBox(width: 400, child: MapDataCredit(sourceIds: ['bma-flood', 'thaiwater', 'tmd', 'usgs', 'rid'])),
          brightness,
          cvd,
        );
        final c = tester.element(find.byType(MapDataCredit)).hw;
        // The panel under the map is opaque surface (map_screen.dart _MapCredits).
        final muted = tester.widget<Text>(find.text('ข้อมูลบนแผนที่: ')).style!.color!;
        expect(contrastRatio(muted, c.surface), greaterThanOrEqualTo(_text), reason: 'credit label');
        final links = find.descendant(of: find.byType(SourceLink), matching: find.byType(Text));
        expect(links, findsNWidgets(5));
        for (final link in tester.widgetList<Text>(links)) {
          final fg = link.style!.color!;
          expect(_ratio(fg, c.surface), greaterThanOrEqualTo(_text), reason: '${link.data}: $fg on ${c.surface}');
          expect(link.style!.decoration, TextDecoration.underline);
        }
      });

      testWidgets('the not-government note at the top of the sources page reads on its box', (tester) async {
        await _pump(tester, const SizedBox(width: 400, height: 800, child: SourcesScreen()), brightness, cvd);
        final c = tester.element(find.byType(SourcesScreen)).hw;
        final note = tester.widget<Text>(
          find.descendant(of: find.byKey(const ValueKey('not-gov')), matching: find.byType(Text)),
        );
        expect(contrastRatio(note.style!.color!, c.surfaceSunken), greaterThanOrEqualTo(_text));
      });

      testWidgets('every ColorScheme container pair M3 widgets fall back on reads as text', (tester) async {
        final s = Theme.of(await _pump(tester, const SizedBox(), brightness, cvd)).colorScheme;
        for (final (pair, fg, bg) in [
          ('primary', s.onPrimary, s.primary),
          ('primaryContainer', s.onPrimaryContainer, s.primaryContainer),
          ('secondary', s.onSecondary, s.secondary),
          ('secondaryContainer', s.onSecondaryContainer, s.secondaryContainer),
          ('tertiary', s.onTertiary, s.tertiary),
          ('tertiaryContainer', s.onTertiaryContainer, s.tertiaryContainer),
          ('errorContainer', s.onErrorContainer, s.errorContainer),
          ('surface', s.onSurface, s.surface),
          ('surfaceVariant text', s.onSurfaceVariant, s.surface),
          ('surfaceContainerHighest', s.onSurface, s.surfaceContainerHighest),
          ('surfaceContainerHigh', s.onSurface, s.surfaceContainerHigh),
          ('inverseSurface', s.onInverseSurface, s.inverseSurface),
        ]) {
          expect(contrastRatio(fg, bg), greaterThanOrEqualTo(_text), reason: '$pair: $fg on $bg');
        }
      });
    });
  }
}
