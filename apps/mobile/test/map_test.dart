import 'dart:io';

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/bma/bma_parse.dart';
import 'package:hazardwatch/bma/device_bma.dart';
import 'package:hazardwatch/bma/rules.dart';
import 'package:hazardwatch/l10n/gen/app_localizations.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/map/base_map.dart';
import 'package:hazardwatch/map/map_data.dart';
import 'package:hazardwatch/map/map_markers.dart';
import 'package:hazardwatch/map/nasa_layers.g.dart';
import 'package:hazardwatch/map/nasa_map.dart';
import 'package:hazardwatch/screens/map_screen.dart';
import 'package:hazardwatch/settings.dart';
import 'package:hazardwatch/sources_meta.g.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';
import 'package:hazardwatch/widgets/reading_tile.dart';
import 'package:hazardwatch/widgets/source_link.dart';

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

/// A 1×1 transparent PNG, so GIBS layers draw without the network.
final _png = Uint8List.fromList(const [
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, //
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, //
  0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, //
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, //
  0x42, 0x60, 0x82,
]);

class _FakeTiles extends TileProvider {
  final urls = <String>[];

  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) {
    urls.add(getTileUrl(coordinates, options));
    return MemoryImage(_png);
  }
}

/// FIRMS rows as runner.feeds.fires carries them (FireHotspot in packages/core/src/types.ts).
Map<String, dynamic> _fire(String id, double lat, double lng, {double? frp = 12.4}) => {
  'id': id,
  'location': {'lat': lat, 'lng': lng},
  'detectedAt': fixtureNow.subtract(const Duration(hours: 3)).toUtc().toIso8601String(),
  'frp': frp,
  'confidence': 'nominal',
  'satellite': 'N20',
  'day': true,
};

Map<String, dynamic> _feed(String source, List<Map<String, dynamic>> items) => {
  'source': source,
  'fetchedAt': fixtureNow.toUtc().toIso8601String(),
  'ok': true,
  'items': items,
};

/// A ThaiWater dam as runner.feeds.dams carries it (Observation with a DamExtra, packages/sources thaiwater.ts).
Map<String, dynamic> _dam(
  String id, {
  String size = 'large',
  double pct = 60,
  double? usable = 45,
  double dLat = 0.03,
  double dLng = 0.05,
  String observedAt = '2026-10-04T17:00:00.000Z',
}) => {
  'id': 'thaiwater-dam:$size:$id',
  'kind': 'dam',
  'source': 'thaiwater',
  'name': {'th': 'เขื่อน $id', 'en': size == 'large' ? 'Dam $id' : 'เขื่อน $id'},
  'location': {'lat': _ref.lat + dLat, 'lng': _ref.lng + dLng},
  'observedAt': observedAt,
  'value': pct,
  'unit': '%',
  'severity': pct > 100 ? 'danger' : (pct > 80 ? 'watch' : 'ok'),
  'extra': {
    'storageMcm': 600.5,
    'capacityMcm': 960.8,
    'usablePct': usable,
    'inflowMcm': size == 'large' ? 4.2 : null,
    'releaseMcm': size == 'large' ? 1.5 : null,
    'size': size,
    'basin': 'ลุ่มน้ำป่าสัก',
    'province': 'ลพบุรี',
    'agency': 'กรมชลประทาน',
  },
};

Map<String, dynamic> _withDams(Map<String, dynamic> s) {
  _feeds(s, 'runner')['dams'] = _feed('thaiwater', [
    _dam('pasak', pct: 105.2, usable: 55.1),
    _dam('m1', size: 'medium', pct: 35, usable: 20, dLat: -0.03),
  ]);
  return s;
}

Map<String, dynamic> _storm({String url = 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1'}) => {
  'id': 'EONET_1',
  'category': 'severeStorms',
  'title': 'Typhoon Test',
  'location': {'lat': 16.0, 'lng': 112.0},
  'track': [
    {
      'at': '2026-10-04T00:00:00Z',
      'location': {'lat': 15.0, 'lng': 115.0},
      'windKts': 60,
    },
    {
      'at': '2026-10-05T00:00:00Z',
      'location': {'lat': 16.0, 'lng': 112.0},
      'windKts': 85,
    },
  ],
  'updatedAt': '2026-10-05T00:00:00Z',
  'url': url,
};

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

  // If this fails, packages/core/src/config.ts changed: update the dam values in CoreConfig to match.
  test('dam bands match DEFAULT_CONFIG.dam and damStatus in packages/core', () {
    final config = File('../../packages/core/src/config.ts').readAsStringSync();
    final defaults = config.substring(config.indexOf('export const DEFAULT_CONFIG'));
    final dam = defaults.substring(defaults.indexOf('dam: {'));
    double value(String key) => double.parse(RegExp('\\b$key: ([\\d.]+)').firstMatch(dam)!.group(1)!);
    expect(CoreConfig.damOverPct, value('overPct'));
    expect(CoreConfig.damHighPct, value('highPct'));
    expect(CoreConfig.damLowPct, value('lowPct'));
    expect(CoreConfig.damCriticalPct, value('criticalPct'));
    expect(CoreConfig.damCriticalUsablePct, value('criticalUsablePct'));

    expect(damStatusOf(100.1, 90), 'over');
    expect(damStatusOf(100, 90), 'high');
    expect(damStatusOf(80.5, 10), 'high'); // storage above highPct wins over low usable water
    expect(damStatusOf(80, 50), 'normal');
    expect(damStatusOf(50, 40), 'low');
    expect(damStatusOf(60, 30), 'critical');
    expect(damStatusOf(30, null), 'critical');
    expect(damStatusOf(31, null), 'low');
    expect(damStatusOf(25, 35), 'low'); // usable known: storage alone is not critical
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
        _quake('mid', 'usgs', 6.1, 16.0, 96.0, '2026-10-04T08:00:00Z')
          ..['url'] = 'https://earthquake.usgs.gov/earthquakes/eventpage/mid',
      ];
      final quakes = _build(s).points.where((p) => p.layer == MapLayer.quake).toList();
      expect(quakes.map((q) => q.id), unorderedEquals(['big', 'mid']));
      final big = quakes.firstWhere((q) => q.id == 'big');
      expect(big.level, HwLevel.danger);
      expect(big.km, closeTo(690, 20));
      final mid = quakes.firstWhere((q) => q.id == 'mid');
      expect(mid.level, HwLevel.warning);
      expect(mid.name.th, 'At mid'); // USGS has no Thai text
      expect(mid.url, 'https://earthquake.usgs.gov/earthquakes/eventpage/mid');
      expect(big.url, isNull);
    });

    test('dams: status worked out as on the server, coloured by damSeverity, faded after 60 h', () {
      final d = _build(_withDams(snapshotJson()));
      final pasak = _point(d, 'thaiwater-dam:large:pasak');
      expect((pasak.layer, pasak.level, pasak.value, pasak.stale), (MapLayer.dam, HwLevel.danger, 105.2, false));
      expect((pasak.dam!.status, pasak.dam!.size, pasak.dam!.inflowMcm), (DamStatus.over, DamSize.large, 4.2));
      expect(pasak.dam!.km, closeTo(6.3, 0.5));
      final m1 = _point(d, 'thaiwater-dam:medium:m1');
      expect((m1.level, m1.dam!.status, m1.dam!.size), (HwLevel.normal, DamStatus.critical, DamSize.medium));

      final s = snapshotJson();
      _feeds(s, 'runner')['dams'] = _feed('thaiwater', [
        _dam('old', observedAt: '2026-10-01T17:00:00.000Z'),
        _dam('none')..['value'] = null,
      ]);
      final old = _build(s).points.where((p) => p.layer == MapLayer.dam).toList();
      expect(old.map((p) => p.id), ['thaiwater-dam:large:old']);
      expect((old.single.stale, old.single.dam!.stale), (true, true));
      // No dams feed (older server): no dam points, nothing else changes.
      expect(_build(snapshotJson()).points.where((p) => p.layer == MapLayer.dam), isEmpty);
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

    test('dam pins are hexagons, large dams bigger and labelled, and never carry the alert "!"', () {
      final dams = MapData(
        points: buildMapData(
          MapSnapshot.fromJson(_withDams(snapshotJson())),
          refLat: _ref.lat,
          refLng: _ref.lng,
          now: fixtureNow,
        ).points.where((p) => p.layer == MapLayer.dam).toList(),
        floodOnDevice: false,
        rainOnDevice: false,
      );
      final large = pinStyle(_point(dams, 'thaiwater-dam:large:pasak'));
      final medium = pinStyle(_point(dams, 'thaiwater-dam:medium:m1'));
      expect(
        (large.shape, large.size.width, large.label, large.level),
        (PinShape.hexagon, PinSize.damLarge, '105%', HwLevel.danger),
      );
      expect((medium.shape, medium.size.width, medium.label), (PinShape.hexagon, PinSize.damMedium, null));
      expect(PinSize.damLarge, greaterThan(PinSize.damMedium));
      expect(large.badge, isFalse); // display only
    });

    testWidgets('dam pins are filled with the status colour inside an ink ring', (tester) async {
      await pumpThemed(
        tester,
        const HazardPin(
          style: PinStyle(
            shape: PinShape.hexagon,
            size: Size.square(PinSize.damLarge),
            level: HwLevel.watch,
            label: '90%',
          ),
        ),
      );
      final ctx = tester.element(find.byType(HazardPin));
      final deco =
          tester
                  .widget<Container>(
                    find.descendant(of: find.byType(HazardPin), matching: find.byType(Container)).first,
                  )
                  .decoration!
              as ShapeDecoration;
      expect(deco.color, ctx.hw.sevWatch);
      expect((deco.shape as StarBorder).side.color, ctx.hw.ink);
      expect(find.text('!'), findsNothing);
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
      expect(tile.sources, [(name: 'กทม.', url: 'https://weather.bangkok.go.th/flood')]);
      // The link keeps the short name; the sources page has the full name and site.
      expect(
        find.descendant(of: find.byType(ReadingTile), matching: find.widgetWithText(SourceLink, 'กทม.')),
        findsOneWidget,
      );
    });

    /// (shown text, url) of each link in the credit strip under the map.
    List<(String, String)> creditLinks(WidgetTester tester) => [
      for (final link in tester.widgetList<SourceLink>(
        find.descendant(of: find.byKey(const ValueKey('map-data-credit')), matching: find.byType(SourceLink)),
      ))
        (link.label, link.url),
    ];

    testWidgets('zoom buttons step the map in and out by one level', (tester) async {
      await pumpMap(tester);
      final map = MapController.of(tester.element(find.byType(MarkerLayer).first));
      final start = map.camera.zoom;
      for (final key in ['zoom-in', 'zoom-out']) {
        final size = tester.getSize(find.byKey(ValueKey(key)));
        expect(size.width, greaterThanOrEqualTo(HwSize.touchTarget));
        expect(size.height, greaterThanOrEqualTo(HwSize.touchTarget));
      }
      await tester.tap(find.byKey(const ValueKey('zoom-in')));
      await tester.pump();
      expect(map.camera.zoom, start + 1);
      await tester.tap(find.byKey(const ValueKey('zoom-out')));
      await tester.tap(find.byKey(const ValueKey('zoom-out')));
      await tester.pump();
      expect(map.camera.zoom, start - 1);
    });

    testWidgets('the base map credit is an ⓘ button that opens its linked sources', (tester) async {
      final opened = <Uri>[];
      final realLaunchLink = launchLink;
      launchLink = (uri) async {
        opened.add(uri);
        return true;
      };
      addTearDown(() => launchLink = realLaunchLink);
      await pumpMap(tester);
      expect(find.text('OpenStreetMap contributors'), findsNothing);
      final button = find.byKey(const ValueKey('base-map-credit'));
      expect(tester.getSize(button).height, greaterThanOrEqualTo(HwSize.touchTarget));
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect([
        for (final link in tester.widgetList<SourceLink>(find.byType(SourceLink))) link.url,
      ], containsAllInOrder(MapConfig.attributionLinks.map((s) => s.url)));
      await tester.tap(find.widgetWithText(SourceLink, 'OpenStreetMap contributors'));
      await tester.pumpAndSettle();
      expect(opened, [Uri.parse('https://www.openstreetmap.org/copyright')]);
    });

    testWidgets('the default map credits and links every agency it shows, under the map and clear of its controls', (
      tester,
    ) async {
      await pumpMap(tester);
      final strip = find.byKey(const ValueKey('map-data-credit'));
      expect(strip, findsOneWidget);
      expect(find.descendant(of: strip, matching: find.text('ข้อมูลบนแผนที่: ')), findsOneWidget);
      // One compact line of short names, each still a link to its page.
      expect(creditLinks(tester), [
        ('กทม.', 'https://weather.bangkok.go.th/flood'),
        ('ThaiWater', 'https://www.thaiwater.net'),
        ('กรมอุตุฯ', 'https://earthquake.tmd.go.th'),
        ('USGS', 'https://earthquake.usgs.gov'),
        ('NASA FIRMS', 'https://firms.modaps.eosdis.nasa.gov'),
      ]);
      // Below the map itself, so no map button or pin sits over it.
      final map = tester.getRect(find.byType(FlutterMap));
      expect(tester.getRect(strip).top, greaterThanOrEqualTo(map.bottom));
      for (final button in tester.widgetList<IconButton>(find.byType(IconButton))) {
        if (find.descendant(of: strip, matching: find.byWidget(button)).evaluate().isNotEmpty) continue;
        expect(tester.getRect(find.byWidget(button)).bottom, lessThanOrEqualTo(map.bottom));
      }
      for (final link in tester.widgetList<SourceLink>(find.descendant(of: strip, matching: find.byType(SourceLink)))) {
        final size = tester.getSize(find.byWidget(link));
        expect(size.height, greaterThanOrEqualTo(HwSize.touchTarget));
        expect(tester.getSemantics(find.byWidget(link)).flagsCollection.isLink, isTrue);
      }

      final opened = <Uri>[];
      final realLaunchLink = launchLink;
      launchLink = (uri) async {
        opened.add(uri);
        return true;
      };
      addTearDown(() => launchLink = realLaunchLink);
      await tester.tap(find.widgetWithText(SourceLink, 'กรมอุตุฯ'));
      await tester.pumpAndSettle();
      expect(opened, [Uri.parse('https://earthquake.tmd.go.th')]);

      // ⓘ at the end of the line lists every agency by its full name and site.
      final more = find.byKey(const ValueKey('map-credit-more'));
      expect(tester.getSize(more).height, greaterThanOrEqualTo(HwSize.touchTarget));
      await tester.tap(more);
      await tester.pumpAndSettle();
      expect(
        [
          for (final link in tester.widgetList<SourceLink>(
            find.descendant(of: find.byKey(const ValueKey('map-credit-sheet')), matching: find.byType(SourceLink)),
          ))
            (link.label, link.url),
        ],
        [
          ('กรุงเทพมหานคร · weather.bangkok.go.th', 'https://weather.bangkok.go.th/flood'),
          ('สถาบันสารสนเทศทรัพยากรน้ำ (สสน.) · thaiwater.net', 'https://www.thaiwater.net'),
          ('กรมอุตุนิยมวิทยา · earthquake.tmd.go.th', 'https://earthquake.tmd.go.th'),
          ('สำนักสำรวจธรณีวิทยาสหรัฐฯ (USGS) · earthquake.usgs.gov', 'https://earthquake.usgs.gov'),
          ('NASA FIRMS · firms.modaps.eosdis.nasa.gov', 'https://firms.modaps.eosdis.nasa.gov'),
        ],
      );
      await tester.tap(find.widgetWithText(SourceLink, 'สำนักสำรวจธรณีวิทยาสหรัฐฯ (USGS) · earthquake.usgs.gov'));
      await tester.pumpAndSettle();
      expect(opened.last, Uri.parse('https://earthquake.usgs.gov'));
    });

    testWidgets('the credit strip stays one line on a narrow phone with every source on; ⓘ stays in view', (
      tester,
    ) async {
      const ids = ['bma-flood', 'air4thai', 'thaiwater', 'tmd', 'usgs', 'rid', 'nasa-gibs', 'nasa-firms', 'nasa-eonet'];
      await pumpThemed(tester, const SizedBox(width: 320, child: MapDataCredit(sourceIds: ids)));
      expect(tester.takeException(), isNull);
      final strip = tester.getRect(find.byType(MapDataCredit));
      expect(strip.height, HwSize.touchTarget);
      final more = tester.getRect(find.byKey(const ValueKey('map-credit-more')));
      expect(more.right, lessThanOrEqualTo(strip.right));
      // Every source is still a link on the line, reached by scrolling it sideways.
      expect(find.byType(SourceLink, skipOffstage: false), findsNWidgets(9));
    });

    testWidgets('the credit strip follows the layers: BMA rain links its own page once flood is off', (tester) async {
      await pumpMap(tester);
      await tester.tap(find.widgetWithText(FilterChip, 'ฝุ่น PM2.5'));
      await tester.pumpAndSettle();
      expect(creditLinks(tester), contains(('กรมควบคุมมลพิษ', 'https://air4thai.pcd.go.th')));
      final flood = find.widgetWithText(FilterChip, 'น้ำท่วมบนถนน');
      await tester.ensureVisible(flood);
      await tester.tap(flood);
      await tester.pumpAndSettle();
      expect(creditLinks(tester).first, ('กทม.', 'https://weather.bangkok.go.th/rain'));
    });

    test('a Thai refresh takes only Thai feeds from the new snapshot; USGS and NASA stay as they were', () {
      Map<String, dynamic> feed(String id) => {
        'ok': true,
        'fetchedAt': '2026-10-05T08:00:00Z',
        'items': [
          {'id': id},
        ],
      };
      MapSnapshot snap(String tag) => MapSnapshot.fromJson({
        'edge': {
          'feeds': {
            for (final k in ['pm25', 'quakesTmd', 'quakesUsgs', 'fires', 'events']) k: feed('$k-$tag'),
          },
        },
        'runner': {
          'feeds': {
            for (final k in ['flood', 'rain', 'waterlevel', 'radar', 'cctv', 'dams']) k: feed('$k-$tag'),
          },
        },
      });
      final merged = snap('old').withThaiFeedsFrom(snap('new'));
      expect(
        {for (final e in merged.feeds.entries) e.key: e.value.items.single['id']},
        {
          'pm25': 'pm25-new',
          'quakesTmd': 'quakesTmd-new',
          'flood': 'flood-new',
          'rain': 'rain-new',
          'waterlevel': 'waterlevel-new',
          'radar': 'radar-new',
          'cctv': 'cctv-new',
          'dams': 'dams-new',
          'quakesUsgs': 'quakesUsgs-old',
          'fires': 'fires-old',
          'events': 'events-old',
        },
      );
    });

    testWidgets('the Thai refresh button reloads the map data', (tester) async {
      final (_, api) = await pumpMap(tester);
      expect(find.byKey(const ValueKey('f2')), findsOneWidget);
      final fresh = snapshotJson();
      final flood = _feeds(fresh, 'runner')['flood'] as Map<String, dynamic>;
      flood['items'] = [
        for (final o in flood['items'] as List)
          if ((o as Map)['id'] != 'f2') o,
      ];
      api.snapshotData = fresh;
      final button = find.byKey(const ValueKey('refresh-thai'));
      expect(tester.getSize(button).height, greaterThanOrEqualTo(HwSize.touchTarget));
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(api.snapshotCalls, 2);
      expect(find.byKey(const ValueKey('f2')), findsNothing);
    });

    test('credit sources come from the active layers, each once', () {
      expect(mapCreditSourceIds(defaultMapLayers, const NasaLayerState(firms: false, events: false)), [
        'bma-flood',
        'bma-rain',
        'thaiwater',
        'tmd',
        'usgs',
      ]);
      expect(
        mapCreditSourceIds({
          MapLayer.water,
          MapLayer.dam,
        }, const NasaLayerState(firms: true, events: true, raster: 'flood')),
        ['thaiwater', 'rid', 'nasa-gibs', 'nasa-firms', 'nasa-eonet'],
      );
      expect(mapCreditSourceIds({}, const NasaLayerState(firms: false, events: false)), isEmpty);
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

    for (final brightness in Brightness.values) {
      testWidgets('layer chip labels read on the chip, on or off (${brightness.name})', (tester) async {
        await pumpMap(tester, brightness: brightness);
        final chips = tester.widgetList<FilterChip>(find.byType(FilterChip)).toList();
        expect(chips.map((c) => c.selected), containsAll([true, false]));
        for (final chip in chips) {
          final label = tester
              .widget<RichText>(find.descendant(of: find.byWidget(chip), matching: find.byType(RichText)).first)
              .text
              .style!
              .color!;
          final bg = chip.selected ? chip.selectedColor! : chip.backgroundColor!;
          expect(
            contrastRatio(label, bg),
            greaterThanOrEqualTo(4.5),
            reason: '${chip.label} selected=${chip.selected}',
          );
        }
      });
    }

    group('dams', () {
      Future<void> pumpDamMap(WidgetTester tester) async {
        await pumpThemed(
          tester,
          SizedBox.expand(
            child: MapScreen(
              settings: AppSettings()..district = fixtureDistrict(),
              api: FakeApi()..snapshotData = _withDams(snapshotJson()),
              location: FakeLocation(LocationUnavailable(denied: true)),
              clock: () => fixtureNow,
              baseMap: (_, _, _) => const SizedBox.shrink(),
              nasaStore: MemoryNasaLayerStore(const NasaLayerState(firms: false, events: false)),
            ),
          ),
        );
        await tester.pumpAndSettle();
      }

      const pasak = ValueKey('thaiwater-dam:large:pasak');
      const m1 = ValueKey('thaiwater-dam:medium:m1');
      final legend = find.byKey(const ValueKey('dam-map-legend'));

      Future<void> turnOn(WidgetTester tester) async {
        final chip = find.widgetWithText(FilterChip, 'เขื่อนและอ่างเก็บน้ำ');
        await tester.ensureVisible(chip);
        await tester.tap(chip);
        await tester.pumpAndSettle();
      }

      test('the dam layer starts off', () {
        expect(MapLayer.values, contains(MapLayer.dam));
        expect(defaultMapLayers, isNot(contains(MapLayer.dam)));
      });

      testWidgets('off by default; the chip shows size-distinct pins and a legend linking ThaiWater', (tester) async {
        await pumpDamMap(tester);
        expect(find.byKey(pasak), findsNothing);
        expect(legend, findsNothing);
        expect(tester.widget<FilterChip>(find.widgetWithText(FilterChip, 'เขื่อนและอ่างเก็บน้ำ')).selected, isFalse);

        await turnOn(tester);
        expect(find.byKey(pasak), findsOneWidget);
        expect(find.byKey(m1), findsOneWidget);
        double pinWidth(Key k) =>
            tester.getSize(find.descendant(of: find.byKey(k), matching: find.byType(HazardPin))).width;
        expect(pinWidth(pasak), greaterThan(pinWidth(m1)));
        expect(tester.getSemantics(find.byKey(pasak)).label, 'เขื่อนและอ่างเก็บน้ำ เขื่อน pasak ระดับเกินความจุ');

        expect(legend, findsOneWidget);
        for (final t in [
          'เกินความจุ',
          'น้ำมาก',
          'ปกติ · น้ำน้อย · น้ำน้อยวิกฤต',
          'เขื่อนขนาดใหญ่',
          'อ่างเก็บน้ำขนาดกลาง',
        ]) {
          expect(
            find.descendant(of: legend, matching: find.text(t)),
            findsOneWidget,
            reason: t,
          );
        }
        // The credit strip under the map links both dam sources; the legend itself carries no second copy.
        expect(find.descendant(of: legend, matching: find.byType(SourceLink)), findsNothing);
        expect(creditLinks(tester).sublist(creditLinks(tester).length - 1), [
          ('กรมชลประทาน', 'https://app.rid.go.th/reservoir'),
        ]);
        expect(creditLinks(tester), contains(('ThaiWater', 'https://www.thaiwater.net')));
        // NASA credits stay off: only the dam legend.
        expect(find.byKey(const ValueKey('nasa-credits')), findsNothing);

        await turnOn(tester); // off again
        expect(find.byKey(pasak), findsNothing);
        expect(legend, findsNothing);
      });

      testWidgets('tapping a dam shows its reading, display-only note and ThaiWater link', (tester) async {
        await pumpDamMap(tester);
        await turnOn(tester);
        await tester.tap(find.byKey(pasak));
        await tester.pumpAndSettle();
        final sheet = find.byKey(const ValueKey('dam-sheet'));
        expect(sheet, findsOneWidget);
        Finder inSheet(String t) => find.descendant(of: sheet, matching: find.text(t));
        expect(inSheet('เขื่อน pasak'), findsOneWidget);
        expect(inSheet('เกินความจุ · 105.2%'), findsOneWidget);
        expect(inSheet('เขื่อนขนาดใหญ่ · ลุ่มน้ำป่าสัก'), findsOneWidget);
        expect(inSheet('น้ำใช้การได้ 55.1% · 600.5 / 960.8 ล้าน ลบ.ม.'), findsOneWidget);
        expect(inSheet('ไหลเข้า 4.2 · ระบาย 1.5 ล้าน ลบ.ม./วัน'), findsOneWidget);
        expect(inSheet('ข้อมูลวันที่ 5 ต.ค.'), findsOneWidget);
        expect(inSheet('ลพบุรี · ข้อมูลประกอบ ไม่ใช่การแจ้งเตือน'), findsOneWidget);
        expect(find.byType(ReadingTile), findsNothing);
        final link = tester
            .widgetList<SourceLink>(find.descendant(of: sheet, matching: find.byType(SourceLink)))
            .firstWhere((l) => l.url == sourceUrl('thaiwater'));
        expect(link.label, 'ThaiWater');
        expect(tester.getSemantics(find.byWidget(link)).flagsCollection.isLink, isTrue);
      });
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

    group('my location says why it failed and offers the way out', () {
      const locate = 'กลับไปที่ตำแหน่งของฉัน';
      Finder hint(String text) =>
          find.descendant(of: find.byKey(const ValueKey('map-hint')), matching: find.text(text));
      Finder action(String label) =>
          find.descendant(of: find.byKey(const ValueKey('map-hint')), matching: find.widgetWithText(TextButton, label));

      Future<FakeLocation> tapLocate(WidgetTester tester, LocationFailure reason) async {
        final location = FakeLocation(LocationUnavailable(reason: reason));
        await pumpMap(tester, location: location);
        await tester.tap(find.byTooltip(locate));
        await tester.pumpAndSettle();
        expect(find.byType(YouPin), findsNothing);
        return location;
      }

      testWidgets('location off: turn it on', (tester) async {
        final location = await tapLocate(tester, LocationFailure.serviceOff);
        expect(hint('ตำแหน่งในเครื่องปิดอยู่ เปิดแล้วกดอีกครั้ง'), findsOneWidget);
        await tester.tap(action('เปิดตำแหน่ง'));
        await tester.pumpAndSettle();
        expect((location.locationSettingsOpened, location.appSettingsOpened), (1, 0));
      });

      testWidgets('blocked for good: open app settings', (tester) async {
        final location = await tapLocate(tester, LocationFailure.deniedForever);
        expect(hint('แอปถูกปิดสิทธิ์ใช้ตำแหน่ง เปิดได้ในการตั้งค่าแอป'), findsOneWidget);
        await tester.tap(action('เปิดการตั้งค่าแอป'));
        await tester.pumpAndSettle();
        expect((location.locationSettingsOpened, location.appSettingsOpened), (0, 1));
      });

      testWidgets('refused this time: tap again to be asked', (tester) async {
        final location = await tapLocate(tester, LocationFailure.denied);
        expect(hint('เปิดสิทธิ์ตำแหน่งในการตั้งค่าเครื่องก่อน แล้วกดอีกครั้ง'), findsOneWidget);
        expect(
          find.descendant(of: find.byKey(const ValueKey('map-hint')), matching: find.byType(TextButton)),
          findsNothing,
        );
        expect((location.locationSettingsOpened, location.appSettingsOpened), (0, 0));
      });

      testWidgets('no fix in time: try again finds it', (tester) async {
        final location = await tapLocate(tester, LocationFailure.timeout);
        expect(hint('หาตำแหน่งไม่ทัน ลองอีกครั้ง'), findsOneWidget);
        location.result = LocationFound(13.756, 100.5);
        await tester.tap(action('ลองใหม่'));
        await tester.pumpAndSettle();
        expect(location.calls, 2);
        expect(find.byType(YouPin), findsOneWidget);
        expect(find.byKey(const ValueKey('map-hint')), findsNothing);
      });

      testWidgets('anything else: the plain no-fix hint', (tester) async {
        final location = await tapLocate(tester, LocationFailure.error);
        expect(hint('หาตำแหน่งไม่เจอ ลองอีกครั้ง'), findsOneWidget);
        expect(
          find.descendant(of: find.byKey(const ValueKey('map-hint')), matching: find.byType(TextButton)),
          findsNothing,
        );
        expect((location.locationSettingsOpened, location.appSettingsOpened), (0, 0));
      });
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

  group('NASA layers', () {
    final now = DateTime.utc(2026, 10, 16, 3);

    test('only FIRMS points start on; every GIBS raster starts off', () {
      expect(NasaLayerState.initial, const NasaLayerState(firms: true, events: false));
      expect(nasaLayers.values.where((l) => l.defaultOn), isEmpty);
      expect(nasaPointLayers['firms']!.defaultOn, isTrue);
      expect(nasaPointLayers['events']!.defaultOn, isFalse);
      expect(nasaRasterIds.toSet(), nasaLayers.keys.toSet());
    });

    test('NASA map settings match the web', () {
      final web = File('../web/src/config.ts').readAsStringSync();
      expect(web, contains('worldMinZoom: ${NasaMapConfig.worldMinZoom.round()},'));
      expect(web, contains('nasaRaster: null as NasaLayerId | null,'));
      expect(web, contains('firmsMinZoom: ${NasaMapConfig.firmsMinZoom.round()},'));
      expect(
        web,
        contains(
          'firmsRadius: { small: ${NasaMapConfig.firmsRadiusSmall}, full: ${NasaMapConfig.firmsRadiusFull.round()} },',
        ),
      );
      expect(web, contains('eventIconSize: ${NasaMapConfig.eventIconSize.round()},'));
    });

    test('WMTS URLs carry the layer, TIME=default and the max zoom GIBS serves', () {
      const base = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
      final expected = {
        'imergRain': (
          6,
          '$base/IMERG_Precipitation_Rate_30min/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
        ),
        'flood': (9, '$base/VIIRS_Combined_Flood_2-Day/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png'),
        'aod': (
          6,
          '$base/VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
        ),
        'trueColor': (
          9,
          '$base/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
        ),
      };
      for (final MapEntry(key: id, value: (zoom, url)) in expected.entries) {
        final l = nasaLayers[id]!;
        expect(gibsTileUrl(l, now), url, reason: id);
        final layer = gibsTileLayer(l, now);
        expect((layer.urlTemplate, layer.maxNativeZoom, layer.wmsOptions), (url, zoom, null), reason: id);
        // Overzooms past the native level instead of asking GIBS for tiles it answers 400 to.
        expect(layer.maxZoom, MapConfig.maxZoom, reason: id);
        expect(gibsDataDate(l, now), (date: '2026-10-15', approx: true), reason: id);
      }
    });

    test('the fire raster goes over WMS with an explicit UTC-yesterday TIME', () {
      final l = nasaLayers['fireWms']!;
      expect(l.service, GibsService.wms);
      expect(gibsTileUrl(l, now), 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi');
      expect(gibsWmsParams(l, now), {
        'LAYERS': 'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
        'FORMAT': 'image/png',
        'TRANSPARENT': 'true',
        'TIME': '2026-10-15',
      });
      final layer = gibsTileLayer(l, now);
      expect((layer.urlTemplate, layer.maxNativeZoom), (null, 8));
      final url = Uri.parse(layer.wmsOptions!.getUrl(const TileCoordinates(0, 0, 1), 256, false));
      expect(url.path, '/wms/epsg3857/best/wms.cgi');
      expect(url.queryParameters, containsPair('service', 'WMS'));
      expect(url.queryParameters, containsPair('request', 'GetMap'));
      expect(url.queryParameters, containsPair('layers', 'VIIRS_NOAA20_Thermal_Anomalies_375m_All'));
      expect(url.queryParameters, containsPair('version', '1.3.0'));
      expect(url.queryParameters, containsPair('crs', 'EPSG:3857'));
      expect(url.queryParameters, containsPair('time', '2026-10-15'));
      expect(gibsDataDate(l, now), (date: '2026-10-15', approx: false));

      // Early morning in Bangkok is still the previous UTC day, so "yesterday" is two Thai days back.
      final bangkokMorning = DateTime.parse('2026-10-16T06:30:00+07:00');
      expect(gibsWmsParams(l, bangkokMorning)['TIME'], '2026-10-14');
    });

    test('saved choices round-trip; unknown rasters and junk fall back to defaults', () {
      const s = NasaLayerState(firms: false, events: true, raster: 'flood');
      expect(NasaLayerState.fromJson(s.toJson()), s);
      expect(NasaLayerState.fromJson({'firms': true, 'raster': 'gone'}), NasaLayerState.initial);
      expect(NasaLayerState.fromJson('junk'), NasaLayerState.initial);
    });

    test('fires and events parse from the snapshot; bad rows are skipped', () {
      final s = snapshotJson();
      _feeds(s, 'runner')['fires'] = _feed('nasa-firms', [
        _fire('a', 13.7, 100.4),
        {'id': 'broken'},
      ]);
      _feeds(s, 'runner')['events'] = _feed('nasa-eonet', [_storm()]);
      final snap = MapSnapshot.fromJson(s);
      expect(firePoints(snap).map((f) => (f.id, f.frp, f.satellite)), [('a', 12.4, 'N20')]);
      final e = eventPoints(snap).single;
      expect((e.category, e.windKts, e.track.first.lat), ('severeStorms', 85.0, 15.0));
      expect(nasaFeedTime(snap, 'fires'), fixtureNow.subtract(const Duration(hours: 3)));
      expect(nasaFeedTime(MapSnapshot.fromJson(snapshotJson()), 'fires'), isNull);
    });

    test('credits list each NASA source once', () {
      expect(nasaCredits(NasaLayerState.initial), [NasaAttribution.firms]);
      expect(nasaCredits(const NasaLayerState(firms: true, events: true, raster: 'fireWms')), [
        nasaLayers['fireWms']!.attribution,
        NasaAttribution.eonet,
      ]);
      expect(nasaCredits(const NasaLayerState(firms: false, events: false)), isEmpty);
    });

    Future<(MemoryNasaLayerStore, _FakeTiles)> pumpNasaMap(
      WidgetTester tester, {
      NasaLayerState? saved,
      String? stormUrl,
    }) async {
      final settings = AppSettings()..district = fixtureDistrict();
      final s = snapshotJson();
      // West of the district centre, clear of the sensor pins; the other one is far outside the view.
      _feeds(s, 'runner')['fires'] = _feed('nasa-firms', [
        _fire('fire-near', _ref.lat, _ref.lng - 0.04),
        _fire('fire-far', 18.8, 98.9, frp: null),
      ]);
      _feeds(s, 'runner')['events'] = _feed('nasa-eonet', [if (stormUrl == null) _storm() else _storm(url: stormUrl)]);
      final store = MemoryNasaLayerStore(saved);
      final tiles = _FakeTiles();
      await pumpThemed(
        tester,
        SizedBox.expand(
          child: MapScreen(
            settings: settings,
            api: FakeApi()..snapshotData = s,
            location: FakeLocation(LocationUnavailable(denied: true)),
            clock: () => fixtureNow,
            baseMap: (_, _, _) => const SizedBox.shrink(),
            nasaStore: store,
            tileProvider: tiles,
          ),
        ),
      );
      await tester.pumpAndSettle();
      return (store, tiles);
    }

    /// The source links inside [of], as (shown text, url).
    List<(String, String)> links(WidgetTester tester, Finder of) => [
      for (final link in tester.widgetList<SourceLink>(find.descendant(of: of, matching: find.byType(SourceLink))))
        (tester.widget<Text>(find.descendant(of: find.byWidget(link), matching: find.byType(Text))).data!, link.url),
    ];

    final credits = find.byKey(const ValueKey('nasa-credits'));

    Future<void> openSheet(WidgetTester tester) async {
      await tester.tap(find.byKey(const ValueKey('nasa-button')));
      await tester.pumpAndSettle();
    }

    Future<void> closeSheet(WidgetTester tester) async {
      Navigator.of(tester.element(find.byType(NasaLayerSheet))).pop();
      await tester.pumpAndSettle();
    }

    testWidgets('FIRMS hotspots draw by default with their credit; events and rasters stay off', (tester) async {
      await pumpNasaMap(tester);
      final circles = tester.widget<CircleLayer<FirePoint>>(find.byType(CircleLayer<FirePoint>)).circles;
      expect(circles.map((c) => c.hitValue!.id), ['fire-near', 'fire-far']);
      expect(find.byType(EventPin), findsNothing);
      expect(find.byType(TileLayer), findsNothing);
      expect(find.descendant(of: credits, matching: find.textContaining('Fires: ')), findsOneWidget);
      expect(links(tester, credits), [('NASA FIRMS', sourceUrl('nasa-firms'))]);
      expect(tester.widget<FlutterMap>(find.byType(FlutterMap)).options.minZoom, NasaMapConfig.worldMinZoom);
      // The existing hazard pins are untouched.
      expect(find.byKey(const ValueKey('f1')), findsOneWidget);
    });

    testWidgets('tapping a hotspot shows its reading', (tester) async {
      await pumpNasaMap(tester);
      final map = tester.getRect(find.byType(FlutterMap));
      // 0.04° of longitude at zoom 12 is 0.04 × 256 × 2^12 / 360 px.
      await tester.tapAt(map.center - Offset(0.04 * 256 * 4096 / 360, 0));
      await tester.pumpAndSettle();
      final sheet = find.byType(BottomSheet);
      expect(find.descendant(of: sheet, matching: find.text('จุดความร้อน (ไฟ)')), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text('FRP 12 MW · N20')), findsOneWidget);
      expect(find.descendant(of: sheet, matching: find.text(NasaAttribution.firms)), findsOneWidget);
      // NASA is US-government data: the sheet links FIRMS itself (Google Play's source-link rule).
      expect(sourceUrl('nasa-firms'), 'https://firms.modaps.eosdis.nasa.gov');
      // The link says whose data it is.
      expect(links(tester, sheet), [('ข้อมูลจาก NASA FIRMS', sourceUrl('nasa-firms'))]);
      final semantics = tester.getSemantics(find.descendant(of: sheet, matching: find.byType(SourceLink)));
      expect(semantics.flagsCollection.isLink, isTrue);
      expect(semantics.label, startsWith('ข้อมูลจาก NASA FIRMS, '));
    });

    testWidgets('a storm sheet links its EONET page', (tester) async {
      await pumpNasaMap(tester, saved: const NasaLayerState(firms: false, events: true));
      // Out of the district view at first, so bring the storm in.
      MapController.of(tester.element(find.byType(MarkerLayer).first)).move(const LatLng(16, 112), 6);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(EventPin));
      await tester.pumpAndSettle();
      expect(links(tester, find.byType(BottomSheet)), [
        ('ข้อมูลจาก NASA EONET', 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1'),
      ]);
    });

    testWidgets('a storm from another site links EONET as its source and the event page by its site', (tester) async {
      await pumpNasaMap(
        tester,
        saved: const NasaLayerState(firms: false, events: true),
        stormUrl: 'https://www.gdacs.org/report.aspx?eventid=1001',
      );
      MapController.of(tester.element(find.byType(MarkerLayer).first)).move(const LatLng(16, 112), 6);
      await tester.pumpAndSettle();
      await tester.tap(find.byType(EventPin));
      await tester.pumpAndSettle();
      expect(links(tester, find.byType(BottomSheet)), [
        ('ข้อมูลจาก NASA EONET', 'https://eonet.gsfc.nasa.gov'),
        ('หน้าเหตุการณ์ · gdacs.org', 'https://www.gdacs.org/report.aspx?eventid=1001'),
      ]);
      // No bare address anywhere in the sheet.
      expect(find.textContaining('https://'), findsNothing);
    });

    test('event sheet links: EONET pages as they are, other sites as the event page, no https no page', () {
      final l = lookupAppLocalizations(const Locale('en'));
      final own = eventSheetLinks(l, 'https://eonet.gsfc.nasa.gov/api/v3/events/E1');
      expect(own.source?.url, 'https://eonet.gsfc.nasa.gov/api/v3/events/E1');
      expect(own.page, isNull);
      final other = eventSheetLinks(l, 'https://www.metoc.navy.mil/jtwc/jtwc.html');
      expect(other.source?.url, 'https://eonet.gsfc.nasa.gov');
      expect(other.page, (name: 'Event page · metoc.navy.mil', url: 'https://www.metoc.navy.mil/jtwc/jtwc.html'));
      expect(eventSheetLinks(l, 'http://example.com/x'), (source: other.source, page: null));
      expect(eventSheetLinks(l, null).page, isNull);
    });

    testWidgets('the layer sheet turns on one raster at a time with its day and credit, and remembers it', (
      tester,
    ) async {
      final (store, tiles) = await pumpNasaMap(tester);
      await openSheet(tester);
      expect(find.byType(SwitchListTile), findsNWidgets(2 + nasaRasterIds.length));

      await tester.tap(find.byKey(const ValueKey('nasa-raster:flood')));
      await tester.pumpAndSettle();
      expect(store.saved, const NasaLayerState(firms: true, events: false, raster: 'flood'));
      // The credit under the active raster links GIBS (and keeps the rest of NASA's credit line as text).
      final sheet = find.byType(NasaLayerSheet);
      expect(
        find.descendant(of: sheet, matching: find.textContaining('Flood: NASA LANCE MODIS/VIIRS')),
        findsOneWidget,
      );
      expect(links(tester, sheet), [
        ('NASA FIRMS', sourceUrl('nasa-firms')),
        ('NASA EOSDIS GIBS / Worldview', sourceUrl('nasa-gibs')),
      ]);

      // The flood legend and note push the rest of the list down; the sheet scrolls.
      await tester.ensureVisible(find.byKey(const ValueKey('nasa-raster:fireWms')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('nasa-raster:fireWms')));
      await tester.pumpAndSettle();
      expect(store.saved!.raster, 'fireWms');
      await closeSheet(tester);

      final layer = tester.widget<TileLayer>(find.byType(TileLayer));
      expect((layer.maxNativeZoom, layer.wmsOptions != null), (8, true));
      // Flood at zoom 12 asked GIBS for level-9 tiles (overzoom), then the fire raster for yesterday's day.
      expect(tiles.urls.first, contains('/GoogleMapsCompatible_Level9/9/'));
      expect(tiles.urls.last, contains('time=${gibsUtcYesterday(fixtureNow)}'));
      // Data date and NASA credit on the map itself, each NASA source a link to its site.
      expect(find.descendant(of: credits, matching: find.textContaining('ภาพดาวเทียมวันที่')), findsOneWidget);
      expect(find.descendant(of: credits, matching: find.textContaining('Imagery: ')), findsOneWidget);
      expect(sourceUrl('nasa-gibs'), 'https://worldview.earthdata.nasa.gov');
      expect(links(tester, credits), [
        ('NASA EOSDIS GIBS / Worldview', sourceUrl('nasa-gibs')),
        ('NASA FIRMS', sourceUrl('nasa-firms')),
      ]);
      final gibs = tester.getSemantics(find.widgetWithText(SourceLink, 'NASA EOSDIS GIBS / Worldview'));
      expect(gibs.flagsCollection.isLink, isTrue);
      expect(gibs.label, startsWith('NASA EOSDIS GIBS / Worldview, '));
      final opened = <Uri>[];
      final realLaunchLink = launchLink;
      launchLink = (uri) async {
        opened.add(uri);
        return true;
      };
      addTearDown(() => launchLink = realLaunchLink);
      await tester.tap(find.widgetWithText(SourceLink, 'NASA EOSDIS GIBS / Worldview'));
      await tester.pumpAndSettle();
      expect(opened, [Uri.parse(sourceUrl('nasa-gibs')!)]);
    });

    testWidgets('events show storms with their track; all NASA off removes the credits', (tester) async {
      await pumpNasaMap(tester, saved: const NasaLayerState(firms: false, events: true));
      expect(find.byType(CircleLayer<FirePoint>), findsNothing);
      expect(find.byType(EventPin), findsNothing); // the storm is outside the district view
      final track = tester.widget<PolylineLayer>(find.byType(PolylineLayer));
      expect(track.polylines.single.points.length, 2);
      expect(links(tester, credits), [('NASA EONET', sourceUrl('nasa-eonet'))]);

      await openSheet(tester);
      await tester.tap(find.widgetWithText(SwitchListTile, 'พายุและภัยทั่วโลก'));
      await tester.pumpAndSettle();
      await closeSheet(tester);
      expect(find.byKey(const ValueKey('nasa-credits')), findsNothing);
      expect(find.byType(PolylineLayer), findsNothing);
    });

    test('legends come from packages/core with the official GIBS colours; every key has text', () {
      Iterable<(int, String)> stops(String id) => [
        for (final s in nasaLayers[id]!.legend!.stops) (s.color.toARGB32(), s.labelKey),
      ];
      // MODIS_Flood.xml LegendEntry colours ("No Water" is transparent, so it has no swatch).
      expect(nasaLayers['flood']!.legend!.kind, NasaLegendKind.classes);
      expect(stops('flood'), [
        (0xff32d2f5, 'nasa.legend.flood.surface'),
        (0xffffff00, 'nasa.legend.flood.recurring'),
        (0xfffa1e24, 'nasa.legend.flood.flood'),
        (0xffafafaf, 'nasa.legend.flood.noData'),
      ]);
      expect(nasaLayers['imergRain']!.legend!.kind, NasaLegendKind.ramp);
      expect(nasaLayers['aod']!.legend!.kind, NasaLegendKind.ramp);
      expect(nasaLayers['trueColor']!.legend, isNull);
      expect(nasaLayers['fireWms']!.legend, isNull);
      for (final lang in ['th', 'en']) {
        final l = lookupAppLocalizations(Locale(lang));
        for (final legend in nasaLayers.values.map((x) => x.legend).nonNulls) {
          for (final key in [...legend.stops.map((s) => s.labelKey), legend.noteKey]) {
            expect(nasaLegendText(l, key), isNot(key), reason: '$key has no $lang text');
            expect(nasaLegendText(l, key), isNotEmpty);
          }
        }
      }
    });

    final mapLegend = find.byKey(const ValueKey('nasa-map-legend'));

    testWidgets('the flood layer shows its four classes, labelled, under the credit and in the sheet with the note', (
      tester,
    ) async {
      await pumpNasaMap(tester, saved: const NasaLayerState(firms: false, events: false, raster: 'flood'));
      final l = lookupAppLocalizations(const Locale('th'));
      const labels = ['แหล่งน้ำปกติ', 'ท่วมเป็นประจำ', 'น้ำท่วม', 'เมฆบัง ไม่มีข้อมูล'];
      for (final t in labels) {
        expect(find.descendant(of: mapLegend, matching: find.text(t)), findsOneWidget);
      }
      Color swatch(String key) =>
          (tester
                      .widget<Container>(
                        find.descendant(of: mapLegend, matching: find.byKey(ValueKey('nasa-legend-swatch:$key'))),
                      )
                      .decoration!
                  as BoxDecoration)
              .color!;
      expect(
        [
          for (final k in ['surface', 'recurring', 'flood', 'noData']) swatch('nasa.legend.flood.$k').toARGB32(),
        ],
        [0xff32d2f5, 0xffffff00, 0xfffa1e24, 0xffafafaf],
      );
      // Under the credit, and compact: no note on the map.
      expect(tester.getRect(mapLegend).top, greaterThanOrEqualTo(tester.getRect(credits).bottom));
      expect(find.descendant(of: mapLegend, matching: find.text(l.nasaLegendFloodNote)), findsNothing);
      // Screen readers hear the layer and every class in words, not colours.
      expect(find.bySemanticsLabel('${l.layerNasaFlood}: ${labels.join(', ')}'), findsOneWidget);

      await openSheet(tester);
      final sheet = find.byType(NasaLayerSheet);
      for (final t in labels) {
        expect(find.descendant(of: sheet, matching: find.text(t)), findsOneWidget);
      }
      expect(find.descendant(of: sheet, matching: find.text(l.nasaLegendFloodNote)), findsOneWidget);
      expect(l.nasaLegendFloodNote, contains('300 ม.'));
    });

    for (final (id, low, high) in [('imergRain', '0.1', '≥50 มม./ชม.'), ('aod', '0 อากาศใส', '≥1 ควันหรือฝุ่นหนา')]) {
      testWidgets('$id shows a labelled colour ramp, with its note in the sheet', (tester) async {
        await pumpNasaMap(tester, saved: NasaLayerState(firms: false, events: false, raster: id));
        final legend = nasaLayers[id]!.legend!;
        final ramp = tester.widget<Container>(
          find.descendant(of: mapLegend, matching: find.byKey(const ValueKey('nasa-legend-ramp'))),
        );
        expect(((ramp.decoration! as BoxDecoration).gradient! as LinearGradient).colors, [
          for (final s in legend.stops) s.color,
        ]);
        expect(legend.stops.length, 5);
        expect(find.descendant(of: mapLegend, matching: find.text(low)), findsOneWidget);
        expect(find.descendant(of: mapLegend, matching: find.text(high)), findsOneWidget);
        final l = lookupAppLocalizations(const Locale('th'));
        final note = nasaLegendText(l, legend.noteKey);
        expect(find.text(note), findsNothing);
        await openSheet(tester);
        expect(find.descendant(of: find.byType(NasaLayerSheet), matching: find.text(note)), findsOneWidget);
      });
    }

    for (final raster in ['trueColor', 'fireWms', null]) {
      testWidgets('no legend for ${raster ?? 'no raster'}', (tester) async {
        await pumpNasaMap(tester, saved: NasaLayerState(firms: true, events: false, raster: raster));
        expect(credits, findsOneWidget);
        expect(mapLegend, findsNothing);
        expect(find.byType(NasaLegendView), findsNothing);
        await openSheet(tester);
        expect(find.byType(NasaLegendView), findsNothing);
      });
    }
  });
}
