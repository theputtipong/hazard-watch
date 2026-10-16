import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/hazard_api.dart';
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
