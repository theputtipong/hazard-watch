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
}
