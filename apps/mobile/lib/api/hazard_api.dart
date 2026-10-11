import 'dart:convert';

import 'package:http/http.dart' as http;

import '../map/map_data.dart';
import 'models.dart';

/// Same public API as the web. Point at a local worker with
/// `flutter run --dart-define=API_BASE=http://10.0.2.2:8787` (Android emulator) or `http://localhost:8787` (iOS).
const apiBase = String.fromEnvironment('API_BASE', defaultValue: 'https://api.hazard.pdouvch.com');

sealed class ApiException implements Exception {}

/// No network, timeout or a 5xx: the app keeps the last report and says how old it is.
class OfflineException extends ApiException {}

/// The point is outside every district we cover.
class OutsideCoverageException extends ApiException {}

/// A saved district id the API no longer knows: ask the person to pick again.
class UnknownDistrictException extends ApiException {}

/// The API does not have the endpoint yet (an older deploy).
class NotSupportedException extends ApiException {}

abstract interface class HazardApi {
  Future<AreaReport> area({String? districtId, double? lat, double? lng});
  Future<List<District>> districts();

  /// Every point the web map draws.
  Future<MapSnapshot> snapshot();
}

class HttpHazardApi implements HazardApi {
  HttpHazardApi({http.Client? client, this.base = apiBase}) : _client = client ?? http.Client();

  final http.Client _client;
  final String base;
  static const _timeout = Duration(seconds: 15);

  Future<Object?> _get(String path, Map<String, String> query) async {
    final http.Response res;
    try {
      res = await _client
          .get(Uri.parse('$base$path').replace(queryParameters: query.isEmpty ? null : query))
          .timeout(_timeout);
    } on Exception {
      throw OfflineException();
    }
    if (res.statusCode == 200) return jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode == 404) {
      // An older deploy answers unknown paths with plain text, not JSON.
      Object? error;
      try {
        error = (jsonDecode(utf8.decode(res.bodyBytes)) as Map?)?['error'];
      } on FormatException {
        error = null;
      }
      throw switch (error) {
        'outside coverage' => OutsideCoverageException(),
        'unknown district' => UnknownDistrictException(),
        _ => NotSupportedException(),
      };
    }
    throw OfflineException();
  }

  @override
  Future<AreaReport> area({String? districtId, double? lat, double? lng}) async {
    // Rounded to ~1 km like the web, as the privacy policy promises.
    final query = districtId != null
        ? {'district': districtId}
        : {'lat': lat!.toStringAsFixed(2), 'lng': lng!.toStringAsFixed(2)};
    return AreaReport.fromJson((await _get('/v1/area', query))! as Map<String, dynamic>);
  }

  @override
  Future<List<District>> districts() async => [
    for (final d in (await _get('/v1/districts', {}))! as List) District.fromJson(d as Map<String, dynamic>),
  ];

  @override
  Future<MapSnapshot> snapshot() async =>
      MapSnapshot.fromJson((await _get('/v1/snapshot', {}))! as Map<String, dynamic>);
}
