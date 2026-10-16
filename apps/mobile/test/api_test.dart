import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
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
