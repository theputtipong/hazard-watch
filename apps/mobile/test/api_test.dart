import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/theme/hw_theme.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support.dart';

void main() {
  test('area sends coordinates rounded to about 1 km', () async {
    late Uri sent;
    final api = HttpHazardApi(
      base: 'https://api.test',
      client: MockClient((req) async {
        sent = req.url;
        return http.Response.bytes(utf8.encode(jsonEncode(fixtureJson())), 200);
      }),
    );
    await api.area(lat: 13.756331, lng: 100.501765);
    expect(sent.queryParameters, {'lat': '13.76', 'lng': '100.50'});
  });

  group('nasa', () {
    test('parses fires and events from the ingest fixture', () {
      final n = AreaReport.fromJson(fixtureJson()).nasa!;
      expect(n.fires.count, 2);
      expect(n.fires.nearestKm, 2.4);
      expect(n.fires.radiusKm, 25);
      expect(n.quiet, isFalse);
      final e = n.events.single;
      expect(e.category, 'severeStorms');
      expect(e.title, 'Typhoon Test');
      expect(e.km, 366.8);
      expect(e.updatedAt, DateTime.utc(2026, 10, 5, 6));
      expect(e.windKts, 55);
      expect(e.url, startsWith('https://'));
    });

    test('null, or missing on an older deploy, means no NASA data', () {
      expect(AreaReport.fromJson(fixtureJson()..['nasa'] = null).nasa, isNull);
      expect(AreaReport.fromJson(fixtureJson()..remove('nasa')).nasa, isNull);
    });

    test('nothing near: no nearest distance, no wind, quiet', () {
      final j = fixtureJson()
        ..['nasa'] = {
          'fires': {'count': 0, 'nearestKm': null, 'radiusKm': 25},
          'events': [
            {
              'id': 'E',
              'category': 'volcanoes',
              'title': 'V',
              'km': 12,
              'updatedAt': '2026-10-05T06:00:00Z',
              'windKts': null,
              'url': null,
            },
          ],
        };
      final n = AreaReport.fromJson(j).nasa!;
      expect(n.fires.nearestKm, isNull);
      expect(n.events.single.windKts, isNull);
      expect(n.events.single.url, isNull);
      expect(n.events.single.km, 12.0);
      expect(n.quiet, isFalse);
      expect(NasaNear.fromJson({'fires': j['nasa']['fires'], 'events': <Object>[]}).quiet, isTrue);
    });
  });

  group('dams', () {
    test('parses ThaiWater dams from the ingest fixture, nearest first', () {
      final dams = AreaReport.fromJson(fixtureJson()).dams;
      expect(dams.map((d) => d.id), ['thaiwater-dam:medium:m1', 'thaiwater-dam:large:pasak']);
      final m = dams.first;
      expect((m.size, m.status, m.level, m.km), (DamSize.medium, DamStatus.critical, HwLevel.normal, 34.7));
      expect((m.inflowMcm, m.releaseMcm, m.usablePct), (null, null, 20.0));
      expect(m.name.en, m.name.th); // medium reservoirs have a Thai name only
      final l = dams.last;
      expect((l.size, l.status, l.level), (DamSize.large, DamStatus.over, HwLevel.danger));
      expect((l.storagePct, l.usablePct, l.storageMcm, l.capacityMcm), (105.2, 55.1, 600.5, 960.8));
      expect((l.inflowMcm, l.releaseMcm), (4.2, 1.5));
      expect((l.province, l.basin, l.stale), ('ลพบุรี', 'ลุ่มน้ำป่าสัก', false));
      expect(l.observedAt, DateTime.utc(2026, 10, 4, 17));
    });

    test('missing on an older deploy, or null, means no dams', () {
      expect(AreaReport.fromJson(fixtureJson()..remove('dams')).dams, isEmpty);
      expect(AreaReport.fromJson(fixtureJson()..['dams'] = null).dams, isEmpty);
    });

    test('status colour follows damSeverity: only over and high are coloured', () {
      expect(
        {for (final s in DamStatus.values) s: s.level},
        {
          DamStatus.critical: HwLevel.normal,
          DamStatus.low: HwLevel.normal,
          DamStatus.normal: HwLevel.normal,
          DamStatus.high: HwLevel.watch,
          DamStatus.over: HwLevel.danger,
        },
      );
    });

    test('optional fields may be missing; an unknown status reads as normal', () {
      final d = DamReading.fromJson({
        'id': 'thaiwater-dam:medium:x',
        'name': {'th': 'อ่าง x', 'en': 'อ่าง x'},
        'size': 'medium',
        'km': 3,
        'storagePct': 60,
        'status': 'brandNew',
        'observedAt': '2026-10-04T17:00:00.000Z',
      });
      expect(
        (d.usablePct, d.storageMcm, d.capacityMcm, d.basin, d.province, d.stale),
        (null, null, null, null, '', false),
      );
      expect(d.status, DamStatus.normal);
    });
  });

  group('relayBma', () {
    final raw = <Object?>[
      {'id': 1, 'level': 12.5, 'time': '/Date(1760000000000)/'},
      {'id': 2, 'level': null},
    ];

    for (final kind in ['flood', 'rain']) {
      test('posts the raw $kind list as JSON', () async {
        late http.Request sent;
        final api = HttpHazardApi(
          base: 'https://api.test',
          client: MockClient((req) async {
            sent = req;
            return http.Response('{"ok":true,"written":true}', 200);
          }),
        );
        await api.relayBma(kind, raw);
        expect(sent.method, 'POST');
        expect(sent.url.toString(), 'https://api.test/v1/relay/bma/$kind');
        expect(sent.headers['content-type'], startsWith('application/json'));
        expect(sent.body, jsonEncode(raw));
      });
    }

    // The relay runs in the background after a good BMA download; a failure must never reach the UI.
    test('a server error does not throw', () async {
      final api = HttpHazardApi(base: 'https://api.test', client: MockClient((_) async => http.Response('nope', 500)));
      await expectLater(api.relayBma('flood', raw), completes);
    });

    test('a 403 from a non-Thai IP does not throw', () async {
      final api = HttpHazardApi(
        base: 'https://api.test',
        client: MockClient((_) async => http.Response('{"error":"forbidden"}', 403)),
      );
      await expectLater(api.relayBma('rain', raw), completes);
    });

    test('a client that throws does not throw', () async {
      final api = HttpHazardApi(
        base: 'https://api.test',
        client: MockClient((_) async => throw http.ClientException('offline')),
      );
      await expectLater(api.relayBma('flood', raw), completes);
    });

    test('a non-Exception error does not throw', () async {
      final api = HttpHazardApi(base: 'https://api.test', client: MockClient((_) async => throw StateError('boom')));
      await expectLater(api.relayBma('rain', raw), completes);
    });
  });
}
