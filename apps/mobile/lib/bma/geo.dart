import 'dart:math' as math;

import 'bangkok_districts.g.dart';

/// A district outline: bbox [minLng, minLat, maxLng, maxLat] and rings as "lng,lat lng,lat ...".
class Zone {
  const Zone({required this.bbox, required this.rings});

  final List<double> bbox;
  final List<String> rings;

  static final _parsed = Expando<List<List<(double, double)>>>();

  List<List<(double, double)>> get _points => _parsed[this] ??= [
    for (final ring in rings)
      [
        for (final pair in ring.split(' '))
          (double.parse(pair.substring(0, pair.indexOf(','))), double.parse(pair.substring(pair.indexOf(',') + 1))),
      ],
  ];

  /// Port of inZone in packages/core/src/zones.ts (even-odd across outer ring and holes).
  bool contains(double lat, double lng) {
    if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) return false;
    var inside = false;
    for (final ring in _points) {
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        final (xi, yi) = ring[i];
        final (xj, yj) = ring[j];
        if ((yi > lat) != (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }
}

/// BMA's sensors only cover Bangkok, so device-side fetching is limited to these districts.
bool isBangkok(String districtId) => bangkokDistricts.containsKey(districtId);

const _earthRadiusKm = 6371.0;

/// Port of distanceKm in packages/core/src/geo.ts.
double distanceKm(double lat1, double lng1, double lat2, double lng2) {
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  final h =
      math.pow(math.sin(dLat / 2), 2) + math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * _earthRadiusKm * math.asin(math.sqrt(h));
}
