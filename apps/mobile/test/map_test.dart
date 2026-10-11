import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/bma/bma_parse.dart';
import 'package:hazardwatch/bma/device_bma.dart';
import 'package:hazardwatch/bma/rules.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/map/base_map.dart';
import 'package:hazardwatch/map/map_data.dart';
import 'package:hazardwatch/map/map_markers.dart';
import 'package:hazardwatch/screens/map_screen.dart';
import 'package:hazardwatch/settings.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';
import 'package:hazardwatch/widgets/reading_tile.dart';

import 'support.dart';

final _ref = fixtureDistrict();

MapData _build(Map<String, dynamic> snapshot, {BmaCopy? flood, BmaCopy? rain}) => buildMapData(
  MapSnapshot.fromJson(snapshot),
  deviceFlood: flood,
  deviceRain: rain,
  refLat: _ref.lat,
  refLng: _ref.lng,
  now: fixtureNow,
);

MapPoint _point(MapData d, String id) => d.points.firstWhere((p) => p.id == id);

Map<String, dynamic> _quake(String id, String source, double mag, double lat, double lng, String at) => {
  'id': id,
  'source': source,
  'magnitude': mag,
  'depthKm': 10,
  'location': {'lat': lat, 'lng': lng},
  'place': {'th': source == 'usgs' ? '' : 'ที่ $id', 'en': 'At $id'},
  'occurredAt': at,
};

Map<String, dynamic> _feeds(Map<String, dynamic> s, String group) =>
    (s[group] as Map<String, dynamic>)['feeds'] as Map<String, dynamic>;

BmaCopy _deviceFlood({DateTime? failedAt}) => BmaCopy(
  fetchedAt: fixtureNow,
  failedAt: failedAt,
  items: [
    BmaObservation(
      id: 'bma-flood:1',
      name: const LocalizedText('ถ.ดินสอ', 'Din So Rd'),
      lat: 13.755,
      lng: 100.5,
      observedAt: fixtureNow.subtract(const Duration(minutes: 5)),
      value: 35,
      severity: 'danger',
      offline: false,
    ),
    BmaObservation(
      id: 'bma-flood:2',
      name: const LocalizedText('ปิด', 'Down'),
      lat: 13.75,
      lng: 100.49,
      observedAt: fixtureNow,
      value: null,
      severity: 'ok',
      offline: true,
    ),
  ],
);

void main() {
  // If this fails, the web map or packages/core changed: update MapConfig / CoreConfig to match.
  test('map settings match the web and packages/core', () {
    final web = File('../web/src/config.ts').readAsStringSync();
    expect(web, contains("light: '${MapConfig.styleLight}'"));
    expect(web, contains("dark: '${MapConfig.styleDark}'"));
    expect(web, contains('maxZoom: ${MapConfig.maxZoom.round()},'));
    expect(web, contains('pm25: false'));

    final regions = File('../../packages/core/src/regions.ts').readAsStringSync();
    expect(
      regions,
      contains('center: { lat: ${MapConfig.regionCenter.latitude}, lng: ${MapConfig.regionCenter.longitude} }'),
    );
    expect(regions, contains('zoom: ${MapConfig.regionZoom.round()},'));

    final config = File('../../packages/core/src/config.ts').readAsStringSync();
    final defaults = config.substring(config.indexOf('export const DEFAULT_CONFIG'));
    final tiers = RegExp(
      r"\{ severity: '(\w+)', minMagnitude: ([\d.]+), maxDistanceKm: (\d+) \}",
    ).allMatches(defaults).map((m) => (m.group(1), double.parse(m.group(2)!), double.parse(m.group(3)!)));
    expect(tiers, [for (final t in CoreConfig.quakeTiers) (t.severity, t.minMagnitude, t.maxDistanceKm)]);
    expect(defaults, contains('lookbackHours: 24 * 7,'));
    expect(CoreConfig.quakeLookbackHours, 24 * 7);
    expect(defaults, contains('duplicateWithinSeconds: ${CoreConfig.quakeDuplicateWithinSeconds},'));
    expect(defaults, contains('duplicateWithinKm: ${CoreConfig.quakeDuplicateWithinKm.round()},'));
  });

  test('quake severity follows packages/core/src/severity.ts', () {
    expect(quakeSeverity(5.9, 100), 'ok');
    expect(quakeSeverity(6.0, 1500), 'warn');
    expect(quakeSeverity(7.0, 1500), 'danger');
    expect(quakeSeverity(7.5, 1501), 'ok');
  });

  test('base map labels follow the app language, shields keep their ref', () {
    final style = localizeLabels({
      'layers': [
        {
          'id': 'label_city',
          'type': 'symbol',
          'layout': {
            'text-field': [
              'coalesce',
              ['get', 'name_en'],
              ['get', 'name'],
            ],
          },
        },
        {
          'id': 'shield',
          'type': 'symbol',
          'layout': {
            'text-field': [
              'to-string',
              ['get', 'ref'],
            ],
          },
        },
        {'id': 'water', 'type': 'fill'},
      ],
    }, 'th');
    final layers = style['layers'] as List;
    expect((layers[0] as Map)['layout']['text-field'], [
      'coalesce',
      ['get', 'name:th'],
      ['get', 'name'],
    ]);
    expect((layers[1] as Map)['layout']['text-field'], [
      'to-string',
      ['get', 'ref'],
    ]);
  });

  group('map data from /v1/snapshot', () {
    test('keeps server severities, drops offline sensors and fades old readings', () {
      final d = _build(snapshotJson());
      expect(d.points.map((p) => p.id), isNot(contains('f4'))); // offline
      expect(_point(d, 'f1').level, HwLevel.warning);
      expect(_point(d, 'f2').level, HwLevel.watch);
      expect(_point(d, 'f3').level, HwLevel.normal);
      expect(_point(d, 'r1').value, 12.5);
      expect(_point(d, 'pm-near').level, HwLevel.warning);
      expect(_point(d, 'w-old').stale, isTrue);
      expect(_point(d, 'w1').stale, isFalse);
      // Worst drawn last, on top.
      expect(d.points.last.level, HwLevel.danger);
      expect(d.points.first.level, HwLevel.normal);
    });

    test('dry rain gauges get no pin; 24 h heavy rain does', () {
      final s = snapshotJson();
      final rain = _feeds(s, 'runner')['rain'] as Map<String, dynamic>;
      rain['items'] = [
        {...(rain['items'] as List).first as Map<String, dynamic>, 'id': 'dry', 'value': 0, 'severity': 'ok'},
        {...(rain['items'] as List).first as Map<String, dynamic>, 'id': 'soaked', 'value': 0, 'severity': 'watch'},
      ];
      expect(_build(s).points.where((p) => p.layer == MapLayer.rain).map((p) => p.id), ['soaked']);
    });

    test('quakes: judged from the district, recent and in range only, TMD wins duplicates', () {
      final s = snapshotJson();
      final edge = _feeds(s, 'edge');
      (edge['quakesTmd'] as Map<String, dynamic>)['items'] = [
        _quake('big', 'tmd', 7.2, 19.9, 99.0, '2026-10-05T08:00:00Z'),
        _quake('old', 'tmd', 6.5, 19.9, 99.0, '2026-09-20T08:00:00Z'),
        _quake('far', 'tmd', 7.5, 35.0, 139.0, '2026-10-05T08:00:00Z'),
      ];
      (edge['quakesUsgs'] as Map<String, dynamic>)['items'] = [
        _quake('big-usgs', 'usgs', 7.1, 19.95, 99.05, '2026-10-05T08:00:30Z'),
        _quake('mid', 'usgs', 6.1, 16.0, 96.0, '2026-10-04T08:00:00Z'),
      ];
      final quakes = _build(s).points.where((p) => p.layer == MapLayer.quake).toList();
      expect(quakes.map((q) => q.id), unorderedEquals(['big', 'mid']));
      final big = quakes.firstWhere((q) => q.id == 'big');
      expect(big.level, HwLevel.danger);
      expect(big.km, closeTo(690, 20));
      final mid = quakes.firstWhere((q) => q.id == 'mid');
      expect(mid.level, HwLevel.warning);
      expect(mid.name.th, 'At mid'); // USGS has no Thai text
    });

    test("the phone's BMA copy replaces a failing server feed", () {
      final s = snapshotJson();
      final flood = _feeds(s, 'runner')['flood'] as Map<String, dynamic>;
      flood['ok'] = false;
      final copy = _deviceFlood();

      expect(needsDeviceFeed(MapSnapshot.fromJson(s).feeds['flood'], fixtureNow), isTrue);
      final d = _build(s, flood: copy);
      expect(d.floodOnDevice, isTrue);
      final floods = d.points.where((p) => p.layer == MapLayer.flood).toList();
      expect(floods.map((p) => p.id), ['bma-flood:1']);
      expect(floods.single.onDevice, isTrue);
      expect(floods.single.level, HwLevel.danger);
      expect(floods.single.stale, isFalse);

      // A failed refresh keeps the old copy, faded.
      final failed = _build(s, flood: _deviceFlood(failedAt: fixtureNow));
      expect(failed.points.firstWhere((p) => p.id == 'bma-flood:1').stale, isTrue);
    });

    test("a working server feed at least as fresh as the phone's copy wins", () {
      final s = snapshotJson();
      final flood = _feeds(s, 'runner')['flood'] as Map<String, dynamic>;
      flood['lastOkAt'] = fixtureNow.toIso8601String();
      final d = _build(s, flood: _deviceFlood());
      expect(d.floodOnDevice, isFalse);
      expect(d.points.map((p) => p.id), contains('f1'));
      expect(needsDeviceFeed(MapSnapshot.fromJson(s).feeds['flood'], fixtureNow), isFalse);
    });
  });

  group('pins', () {
    MapPoint point(MapLayer layer, HwLevel level, double? value) => MapPoint(
      id: 'x',
      layer: layer,
      source: 'bma-flood',
      name: const LocalizedText('x', 'x'),
      lat: 0,
      lng: 0,
      value: value,
      unit: '',
      level: level,
      at: fixtureNow,
    );

    test('each hazard has its own shape; flood pins grow with severity', () {
      expect(pinStyle(point(MapLayer.flood, HwLevel.normal, 0)).shape, PinShape.dot);
      expect(pinStyle(point(MapLayer.flood, HwLevel.watch, 5)).size.width, PinSize.floodWatch);
      expect(pinStyle(point(MapLayer.flood, HwLevel.warning, 20)).size.width, PinSize.floodWarn);
      final deep = pinStyle(point(MapLayer.flood, HwLevel.danger, 40));
      expect((deep.shape, deep.size.width, deep.badge), (PinShape.circle, PinSize.floodDanger, true));
      expect(pinStyle(point(MapLayer.water, HwLevel.watch, 86.4)).label, '86%');
      expect(pinStyle(point(MapLayer.water, HwLevel.watch, 86)).shape, PinShape.roundedSquare);
      expect(pinStyle(point(MapLayer.pm25, HwLevel.warning, 48.2)).label, '48');
      expect(pinStyle(point(MapLayer.rain, HwLevel.watch, 12.5)).shape, PinShape.pill);
      expect(pinStyle(point(MapLayer.quake, HwLevel.danger, 7.24)).label, '7.2');
      expect(pinStyle(point(MapLayer.quake, HwLevel.danger, 7.2)).shape, PinShape.diamond);
    });

    Color fillOf(WidgetTester tester) {
      final box = tester.widget<Container>(
        find.descendant(of: find.byType(HazardPin), matching: find.byType(Container)).first,
      );
      return (box.decoration! as ShapeDecoration).color!;
    }

    for (final (name, brightness, cvd, colors) in [
      ('light', Brightness.light, false, HwColors.light),
      ('dark', Brightness.dark, false, HwColors.dark),
    ]) {
      testWidgets('pins use the design system severity colours ($name)', (tester) async {
        for (final level in HwLevel.values) {
          await pumpThemed(
            tester,
            HazardPin(style: pinStyle(point(MapLayer.pm25, level, 20))),
            brightness: brightness,
            cvd: cvd,
          );
          expect(fillOf(tester), colors.solid(level));
        }
      });
    }

    testWidgets('colour-blind mode swaps pin colours', (tester) async {
      await pumpThemed(tester, HazardPin(style: pinStyle(point(MapLayer.pm25, HwLevel.danger, 90))), cvd: true);
      final ctx = tester.element(find.byType(HazardPin));
      expect(fillOf(tester), ctx.hw.sevDanger);
      expect(fillOf(tester), isNot(HwColors.light.sevDanger));
      expect(find.text('!'), findsOneWidget); // danger badge
    });

    test('pin text picks ink or white for contrast', () {
      expect(onFill(Colors.white), const Color(0xFF0F1B2E));
      expect(onFill(const Color(0xFF0F1B2E)), Colors.white);
    });
  });

  group('map screen', () {
    Future<(AppSettings, FakeApi)> pumpMap(
      WidgetTester tester, {
      LocationService? location,
      Brightness brightness = Brightness.light,
    }) async {
      final settings = AppSettings()..district = fixtureDistrict();
      // The fixture puts most sensors on one spot; move f1 clear of the others so it can be tapped.
      final snapshot = snapshotJson();
      final f1 = ((_feeds(snapshot, 'runner')['flood'] as Map)['items'] as List).first as Map<String, dynamic>;
      f1['location'] = {'lat': 13.77, 'lng': 100.48};
      final api = FakeApi()..snapshotData = snapshot;
      await pumpThemed(
        tester,
        SizedBox.expand(
          child: MapScreen(
            settings: settings,
            api: api,
            location: location ?? FakeLocation(LocationUnavailable(denied: true)),
            clock: () => fixtureNow,
            baseMap: (_, _, _) => const SizedBox.shrink(),
          ),
        ),
        brightness: brightness,
      );
      return (settings, api);
    }

    testWidgets('shows hazard pins and opens a reading sheet on tap', (tester) async {
      final (_, api) = await pumpMap(tester);
      expect(api.snapshotCalls, 1);
      expect(find.byKey(const ValueKey('f1')), findsOneWidget);
      expect(find.byKey(const ValueKey('pm-near')), findsNothing); // PM2.5 starts off, as on the web

      await tester.tap(find.byKey(const ValueKey('f1')));
      await tester.pumpAndSettle();
      expect(find.text('จุด f1'), findsOneWidget);
      final tile = tester.widget<ReadingTile>(find.byType(ReadingTile));
      expect((tile.value, tile.unit, tile.level, tile.note), ('25', 'ซม.', HwLevel.warning, 'น้ำท่วม'));
      expect(tile.meta, startsWith('ข้อมูลจาก กทม. · เวลาวัด '));
    });

    testWidgets('layer chips show and hide pins', (tester) async {
      await pumpMap(tester);
      await tester.tap(find.widgetWithText(FilterChip, 'ฝุ่น PM2.5'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('pm-near')), findsOneWidget);

      await tester.tap(find.widgetWithText(FilterChip, 'น้ำท่วมบนถนน'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('f1')), findsNothing);
    });

    testWidgets('my location adds a "you" pin; refused permission explains how to allow it', (tester) async {
      final location = FakeLocation(LocationUnavailable(denied: true));
      await pumpMap(tester, location: location);
      await tester.tap(find.byTooltip('กลับไปที่ตำแหน่งของฉัน'));
      await tester.pumpAndSettle();
      expect(find.text('เปิดสิทธิ์ตำแหน่งในการตั้งค่าเครื่องก่อน แล้วกดอีกครั้ง'), findsOneWidget);
      expect(find.byType(YouPin), findsNothing);

      location.result = LocationFound(13.756, 100.5);
      await tester.tap(find.byTooltip('กลับไปที่ตำแหน่งของฉัน'));
      await tester.pumpAndSettle();
      expect(find.byType(YouPin), findsOneWidget);
      expect(find.byTooltip('ไปที่เขตที่ติดตาม'), findsOneWidget);
    });

    testWidgets('a failed load says so and offers a retry', (tester) async {
      final settings = AppSettings()..district = fixtureDistrict();
      final api = FakeApi(error: OfflineException());
      await pumpThemed(
        tester,
        SizedBox.expand(
          child: MapScreen(
            settings: settings,
            api: api,
            location: FakeLocation(LocationUnavailable(denied: true)),
            clock: () => fixtureNow,
            baseMap: (_, _, _) => const SizedBox.shrink(),
          ),
        ),
      );
      expect(find.text('โหลดข้อมูลไม่ได้ ลองอีกครั้ง'), findsOneWidget);
      api.error = null;
      await tester.tap(find.widgetWithText(TextButton, 'ลองใหม่'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('f1')), findsOneWidget);
    });
  });
}
