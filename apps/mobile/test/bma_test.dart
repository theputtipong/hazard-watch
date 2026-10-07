import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/bma/bangkok_districts.g.dart';
import 'package:hazardwatch/bma/bma_parse.dart';
import 'package:hazardwatch/bma/device_bma.dart';
import 'package:hazardwatch/bma/geo.dart';
import 'package:hazardwatch/bma/merge.dart';
import 'package:hazardwatch/bma/rules.dart';
import 'package:hazardwatch/screens/home_screen.dart';
import 'package:hazardwatch/theme/hw_theme.dart';
import 'package:hazardwatch/widgets/reading_tile.dart';

import 'support.dart';

List<Object?> sourceFixture(String name) =>
    jsonDecode(File('../../packages/sources/test/fixtures/$name').readAsStringSync()) as List<Object?>;

/// Same clock as packages/sources/test/adapters.test.ts.
final parseNow = DateTime.utc(2026, 10, 3, 15);

class FakeFetcher implements BmaFetcher {
  final calls = <BmaKind>[];
  bool fail = false;

  @override
  Future<List<Object?>> fetch(BmaKind kind) async {
    calls.add(kind);
    if (fail) throw const SocketException('blocked');
    return sourceFixture(kind == BmaKind.flood ? 'bma-flood.json' : 'bma-rain.json');
  }
}

class MemoryStore implements BmaStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;
}

const latKrabang = District(
  id: 'TH1011',
  name: LocalizedText('ลาดกระบัง', 'Lat Krabang'),
  province: LocalizedText('กรุงเทพมหานคร', 'Bangkok'),
  lat: 13.744975,
  lng: 100.79272,
);

Map<String, dynamic> reportFor(District d, {required String floodState, required String rainState, String? lastOkAt}) {
  final j = fixtureJson();
  j['district'] = {
    'id': d.id,
    'name': {'th': d.name.th, 'en': d.name.en},
    'province': {'th': 'กรุงเทพมหานคร', 'en': 'Bangkok'},
    'center': {'lat': d.lat, 'lng': d.lng},
  };
  j['generatedAt'] = parseNow.toIso8601String();
  j['calm'] = true;
  for (final f in j['feeds'] as List) {
    final feed = f as Map<String, dynamic>;
    if (feed['topic'] == 'flood' || feed['topic'] == 'rain') {
      feed['state'] = feed['topic'] == 'flood' ? floodState : rainState;
      feed['lastOkAt'] = lastOkAt;
      feed['failingSince'] = feed['state'] == 'down' ? '2026-10-03T10:00:00Z' : null;
    }
  }
  return j;
}

void main() {
  // If this fails, packages/core/src/config.ts changed: update CoreConfig in lib/bma/rules.dart to match.
  test('thresholds match DEFAULT_CONFIG in packages/core/src/config.ts', () {
    final src = File('../../packages/core/src/config.ts').readAsStringSync();
    final defaults = src.substring(src.indexOf('export const DEFAULT_CONFIG'));
    double value(String key) => double.parse(RegExp('\\b$key: ([\\d.]+)').firstMatch(defaults)!.group(1)!);

    expect(CoreConfig.rainWatchMmPerHour, value('watchMmPerHour'));
    expect(CoreConfig.rainWarnMmPerHour, value('warnMmPerHour'));
    expect(CoreConfig.rainDangerMmPerHour, value('dangerMmPerHour'));
    expect(CoreConfig.rainWatch24hMm, value('watch24hMm'));
    expect(CoreConfig.rainWarn24hMm, value('warn24hMm'));
    expect(CoreConfig.rainDanger24hMm, value('danger24hMm'));
    expect(CoreConfig.floodDangerDepthCm, value('dangerDepthCm'));
    expect(CoreConfig.staleAfterMinutes, value('staleAfterMinutes'));

    final subStatus = RegExp(r'bmaSubStatus: \{([^}]*)\}').firstMatch(defaults)!.group(1)!;
    expect(CoreConfig.floodBmaSubStatus, {
      for (final m in RegExp(r"(\d+): '(\w+)'").allMatches(subStatus)) int.parse(m.group(1)!): m.group(2)!,
    });
  });

  test('severity rules follow packages/core/src/severity.ts', () {
    expect(rainSeverity(9.9), 'ok');
    expect(rainSeverity(10), 'watch');
    expect(rainSeverity(30), 'warn');
    expect(rainSeverity(60), 'danger');
    expect(rainSeverity(0, 35.1), 'watch');
    expect(rainSeverity(12, 90.1), 'danger');
    expect(rainSeverity(42.5, 0.5), 'warn');

    expect(bmaFloodSeverity(1, 50), 'ok');
    expect(bmaFloodSeverity(2, 10), 'watch');
    expect(bmaFloodSeverity(3, 20), 'warn');
    expect(bmaFloodSeverity(3, 30), 'danger');
    expect(bmaFloodSeverity(2, 30), 'danger');
    expect(bmaFloodSeverity(3, null), 'warn');
    expect(bmaFloodSeverity(5, 40), 'ok');
  });

  group('parsers (same fixtures and expectations as adapters.test.ts)', () {
    test('flood points', () {
      final obs = parseBmaFlood(sourceFixture('bma-flood.json'), parseNow);
      expect(obs.map((o) => o.severity), ['warn', 'warn', 'watch', 'ok', 'ok', 'ok']);
      expect(obs[5].offline, isTrue);
      expect(obs[5].value, isNull);
      expect(obs[0].observedAt.toIso8601String(), startsWith('2026-10-03T'));
      expect(obs[0].id, 'bma-flood:264:Inbound');
      expect(obs[0].name.th, 'ถ.หลวงแพ่ง ช่วงโลตัสลาดกระบัง * (ขาเข้า)');
      expect(obs[0].value, 20);
    });

    test('rain gauges', () {
      final obs = parseBmaRain(sourceFixture('bma-rain.json'), parseNow);
      expect(obs[1].id, 'bma-rain:RF.KTY.02');
      expect(obs[1].value, 42.5);
      expect(obs[1].severity, 'warn');
    });

    test('ASP.NET dates and repeated ids', () {
      expect(aspNetDate('/Date(1791039300000)/'), DateTime.utc(2026, 10, 3, 14, 55));
      expect(aspNetDate(null), isNull);
      final point = (sourceFixture('bma-flood.json').first! as Map<String, dynamic>);
      final ids = parseBmaFlood([
        point,
        point,
        {...point, 'latitude': 0},
      ], parseNow).map((o) => o.id);
      expect(ids, ['bma-flood:264:Inbound', 'bma-flood:264:Inbound#1']);
    });
  });

  test('district outlines place sensors like the server', () {
    expect(bangkokDistricts, hasLength(50));
    expect(isBangkok('TH1011'), isTrue);
    expect(isBangkok('TH5001'), isFalse);
    expect(bangkokDistricts['TH1011']!.contains(13.721, 100.79265), isTrue);
    expect(bangkokDistricts['TH1033']!.contains(13.721, 100.79265), isFalse);
    expect(distanceKm(13.75, 100.5, 13.75, 100.5), 0);
  });

  group('DeviceBma', () {
    test('reuses a copy for 10 minutes, also after a restart', () async {
      final fetcher = FakeFetcher();
      final store = MemoryStore();
      final first = await DeviceBma(fetcher: fetcher, store: store).get(BmaKind.flood, parseNow);
      expect(first!.items, hasLength(6));
      expect(fetcher.calls, [BmaKind.flood]);

      final restarted = DeviceBma(fetcher: fetcher, store: store);
      final again = await restarted.get(BmaKind.flood, parseNow.add(const Duration(minutes: 9)));
      expect(fetcher.calls, hasLength(1));
      expect(again!.fetchedAt, parseNow);
      expect(again.items.first.name.th, first.items.first.name.th);

      await restarted.get(BmaKind.flood, parseNow.add(const Duration(minutes: 10)));
      expect(fetcher.calls, hasLength(2));
    });

    test('a failed refresh keeps the old copy, marked failed, and retries next time', () async {
      final fetcher = FakeFetcher();
      final bma = DeviceBma(fetcher: fetcher);
      await bma.get(BmaKind.rain, parseNow);
      fetcher.fail = true;
      final later = parseNow.add(const Duration(minutes: 20));
      final old = await bma.get(BmaKind.rain, later);
      expect(old!.failed, isTrue);
      expect(old.fetchedAt, parseNow);
      expect(old.failedAt, later);

      fetcher.fail = false;
      final fresh = await bma.get(BmaKind.rain, later.add(const Duration(minutes: 1)));
      expect(fresh!.failed, isFalse);
      expect(fetcher.calls, hasLength(3));
    });

    test('nothing to show when the first download fails', () async {
      final bma = DeviceBma(fetcher: FakeFetcher()..fail = true);
      expect(await bma.get(BmaKind.flood, parseNow), isNull);
    });
  });

  group('merge', () {
    Future<BmaCopy> copy(BmaKind kind, {bool failed = false}) async {
      final fetcher = FakeFetcher();
      final bma = DeviceBma(fetcher: fetcher);
      final c = (await bma.get(kind, parseNow))!;
      if (!failed) return c;
      fetcher.fail = true;
      return (await bma.get(kind, parseNow.add(const Duration(minutes: 11))))!;
    }

    test('fetches only in Bangkok, when the server copy is failing or old', () {
      final down = AreaReport.fromJson(reportFor(latKrabang, floodState: 'down', rainState: 'down'));
      expect(needsDeviceCopy(down, BmaKind.flood, parseNow), isTrue);

      final live = AreaReport.fromJson(
        reportFor(latKrabang, floodState: 'live', rainState: 'live', lastOkAt: '2026-10-03T14:55:00Z'),
      );
      expect(needsDeviceCopy(live, BmaKind.flood, parseNow), isFalse);
      expect(needsDeviceCopy(live, BmaKind.flood, parseNow.add(const Duration(minutes: 6))), isTrue);

      final chiangMai = reportFor(latKrabang, floodState: 'down', rainState: 'down');
      (chiangMai['district'] as Map)['id'] = 'TH5001';
      expect(needsDeviceCopy(AreaReport.fromJson(chiangMai), BmaKind.flood, parseNow), isFalse);
    });

    test('a failing server feed is replaced by the phone copy, judged like the server', () async {
      final r = AreaReport.fromJson(reportFor(latKrabang, floodState: 'down', rainState: 'down'));
      final v = mergeDevice(r, flood: await copy(BmaKind.flood), rain: await copy(BmaKind.rain), now: parseNow);
      expect(v.floodOnDevice, isTrue);
      expect(v.flood!.flooded, 2);
      expect(v.flood!.minor, 0);
      expect(v.flood!.normal, 2);
      expect(v.flood!.offline, 0);
      expect(v.flood!.deepestCm, 20);
      expect(v.flood!.level, HwLevel.warning);
      expect(v.rainOnDevice, isTrue);
      expect(v.rain!.source, 'bma-rain');
      expect(v.calm, isFalse);
      final floodFeed = v.feeds.firstWhere((f) => f.topic == 'flood');
      expect(floodFeed.state, FeedState.live);
      expect(floodFeed.lastOkAt, parseNow);
    });

    test('a live, fresher server feed wins', () async {
      final r = AreaReport.fromJson(
        reportFor(latKrabang, floodState: 'live', rainState: 'live', lastOkAt: '2026-10-03T15:00:00Z'),
      );
      final v = mergeDevice(r, flood: await copy(BmaKind.flood), rain: await copy(BmaKind.rain), now: parseNow);
      expect(v.floodOnDevice, isFalse);
      expect(v.rainOnDevice, isFalse);
      expect(v.flood!.flooded, r.flood!.flooded);
      expect(v.feeds.map((f) => f.state), r.feeds.map((f) => f.state));
    });

    test('an old copy after a failed refresh is shown as stale, never as current', () async {
      final r = AreaReport.fromJson(reportFor(latKrabang, floodState: 'down', rainState: 'down'));
      final now = parseNow.add(const Duration(minutes: 11));
      final v = mergeDevice(
        r,
        flood: await copy(BmaKind.flood, failed: true),
        rain: await copy(BmaKind.rain, failed: true),
        now: now,
      );
      expect(v.floodStale, isTrue);
      expect(v.floodAt, parseNow);
      expect(v.rain!.stale, isTrue);
      expect(v.feeds.firstWhere((f) => f.topic == 'rain').state, FeedState.down);
    });
  });

  testWidgets('home shows BMA data fetched on this phone when the server feed is down', (tester) async {
    final fetcher = FakeFetcher();
    final api = FakeApi(
      report: reportFor(latKrabang, floodState: 'down', rainState: 'down'),
    );
    await pumpApp(
      tester,
      api: api,
      bma: DeviceBma(fetcher: fetcher),
      now: parseNow,
    );
    expect(fetcher.calls.toSet(), {BmaKind.flood, BmaKind.rain});
    // The server judged calm without BMA data; two flooded spots from the phone cancel it.
    expect(find.text('แถวนี้ตอนนี้ปกติดี'), findsNothing);

    final list = find.descendant(of: find.byType(HomeScreen), matching: find.byType(Scrollable)).first;
    final flood = find.byWidgetPredicate((w) => w is ReadingTile && w.label == 'น้ำท่วมบนถนนในเขตนี้');
    await tester.scrollUntilVisible(flood, 300, scrollable: list);
    final tile = tester.widget<ReadingTile>(flood);
    expect(tile.value, '2');
    expect(tile.level, HwLevel.warning);
    expect(tile.meta, startsWith('ข้อมูลจาก กทม.'));
    expect(tile.meta, endsWith('โหลดบนเครื่องนี้'));
    final rain = tester.widget<ReadingTile>(
      find.byWidgetPredicate((w) => w is ReadingTile && w.label.startsWith('ฝน')),
    );
    expect(rain.meta, endsWith('โหลดบนเครื่องนี้'));
  });
}
