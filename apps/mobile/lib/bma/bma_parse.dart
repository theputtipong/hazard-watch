import '../api/models.dart';
import 'rules.dart';

/// One BMA sensor reading, as parseBmaFlood / parseBmaRain in packages/sources/src/adapters/bma.ts build it.
class BmaObservation {
  const BmaObservation({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    required this.observedAt,
    required this.value,
    required this.severity,
    required this.offline,
  });

  BmaObservation.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      name = LocalizedText.fromJson(j['name'] as Map<String, dynamic>),
      lat = (j['lat'] as num).toDouble(),
      lng = (j['lng'] as num).toDouble(),
      observedAt = DateTime.parse(j['observedAt'] as String),
      value = (j['value'] as num?)?.toDouble(),
      severity = j['severity'] as String,
      offline = j['offline'] as bool;

  final String id;
  final LocalizedText name;
  final double lat;
  final double lng;
  final DateTime observedAt;
  final double? value;
  final String severity;
  final bool offline;

  Map<String, Object?> toJson() => {
    'id': id,
    'name': {'th': name.th, 'en': name.en},
    'lat': lat,
    'lng': lng,
    'observedAt': observedAt.toUtc().toIso8601String(),
    'value': value,
    'severity': severity,
    'offline': offline,
  };
}

/// ASP.NET JSON date "/Date(1791039300000)/" (aspNetDate in packages/sources/src/time.ts).
DateTime? aspNetDate(String? value) {
  final ms = value == null ? null : RegExp(r'\d+').firstMatch(value)?.group(0);
  return ms == null ? null : DateTime.fromMillisecondsSinceEpoch(int.parse(ms), isUtc: true);
}

double? _num(Object? v) => (v as num?)?.toDouble();
String _str(Object? v) => (v as String? ?? '').trim();

List<BmaObservation> parseBmaFlood(List<Object?> points, DateTime now) {
  final out = <BmaObservation>[];
  final seen = <String, int>{};
  for (final p in points.cast<Map<String, dynamic>>()) {
    final lat = _num(p['latitude']), lng = _num(p['longitude']);
    if (lat == null || lat == 0 || lng == null || lng == 0) continue;
    final offline = p['status'] == 0;
    final depth = _num(p['flood']);
    String sub(Object? s) => _str(s).isEmpty ? '' : ' (${_str(s)})';
    final subEn = _str(p['tunnel_sub_name_en']);
    var id = 'bma-flood:${p['flood_id']}${subEn.isEmpty ? '' : ':$subEn'}';
    // A few BMA points share an id with no other distinguishing field; suffix repeats so ids stay unique.
    final n = seen[id] ?? 0;
    seen[id] = n + 1;
    if (n > 0) id = '$id#$n';
    out.add(
      BmaObservation(
        id: id,
        name: LocalizedText(
          _str(p['flood_name']) + sub(p['tunnel_sub_name']),
          _str(p['flood_name_en']) + sub(p['tunnel_sub_name_en']),
        ),
        lat: lat,
        lng: lng,
        observedAt: aspNetDate(p['site_timestamp'] as String?) ?? now,
        value: offline ? null : depth,
        severity: offline ? 'ok' : bmaFloodSeverity((p['flood_sub_status'] as num?)?.toInt() ?? 0, depth),
        offline: offline,
      ),
    );
  }
  return out;
}

List<BmaObservation> parseBmaRain(List<Object?> gauges, DateTime now) => [
  for (final g in gauges.cast<Map<String, dynamic>>()) _rain(g, now),
];

BmaObservation _rain(Map<String, dynamic> g, DateTime now) {
  final offline = g['status'] == 0;
  final hour = _num(g['rf1hr']);
  return BmaObservation(
    id: 'bma-rain:${g['rain_code']}',
    name: LocalizedText(_str(g['rain_name']), _str(g['rain_name_en'])),
    lat: _num(g['latitude']) ?? 0,
    lng: _num(g['longitude']) ?? 0,
    observedAt: aspNetDate(g['site_timestamp'] as String?) ?? now,
    value: offline ? null : hour,
    severity: offline || hour == null ? 'ok' : rainSeverity(hour, _num(g['rf24hr'])),
    offline: offline,
  );
}
