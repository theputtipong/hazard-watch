import 'package:flutter/widgets.dart';

import '../theme/hw_theme.dart';

/// Parsed from `/v1/area` and `/v1/districts` (apps/ingest/src/area.ts). test/fixtures/area_report.json is written by
/// the ingest tests, so a change on either side fails one of them.

class LocalizedText {
  const LocalizedText(this.th, this.en);
  LocalizedText.fromJson(Map<String, dynamic> j) : th = j['th'] as String, en = j['en'] as String;

  final String th;
  final String en;

  String of(Locale locale) => locale.languageCode == 'th' ? th : en;
}

/// API severities ('ok' | 'watch' | 'warn' | 'danger', packages/core) to the design system's levels.
HwLevel levelOf(String severity) => switch (severity) {
  'watch' => HwLevel.watch,
  'warn' => HwLevel.warning,
  'danger' => HwLevel.danger,
  _ => HwLevel.normal,
};

DateTime _time(Object? v) => DateTime.parse(v! as String);
DateTime? _timeOrNull(Object? v) => v == null ? null : DateTime.parse(v as String);
double _num(Object? v) => (v! as num).toDouble();

class District {
  const District({required this.id, required this.name, this.province, required this.lat, required this.lng});

  District.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      name = LocalizedText.fromJson(j['name'] as Map<String, dynamic>),
      province = j['province'] == null ? null : LocalizedText.fromJson(j['province'] as Map<String, dynamic>),
      lat = _num((j['center'] as Map)['lat']),
      lng = _num((j['center'] as Map)['lng']);

  final String id;
  final LocalizedText name;
  final LocalizedText? province;
  final double lat;
  final double lng;
}

class AreaAlert {
  AreaAlert.fromJson(Map<String, dynamic> j)
    : key = j['key'] as String,
      kind = j['kind'] as String,
      level = levelOf(j['severity'] as String),
      title = LocalizedText.fromJson(j['title'] as Map<String, dynamic>),
      body = LocalizedText.fromJson(j['body'] as Map<String, dynamic>);

  final String key;
  final String kind;
  final HwLevel level;
  final LocalizedText title;
  final LocalizedText body;
}

class AreaReading {
  AreaReading.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      kind = j['kind'] as String,
      source = j['source'] as String,
      name = LocalizedText.fromJson(j['name'] as Map<String, dynamic>),
      value = _num(j['value']),
      unit = j['unit'] as String,
      level = levelOf(j['severity'] as String),
      observedAt = _time(j['observedAt']),
      km = _num(j['km']),
      stale = j['stale'] as bool;

  final String id;
  final String kind;
  final String source;
  final LocalizedText name;
  final double value;
  final String unit;
  final HwLevel level;
  final DateTime observedAt;
  final double km;
  final bool stale;
}

class FloodCounts {
  FloodCounts.fromJson(Map<String, dynamic> j)
    : flooded = j['flooded'] as int,
      minor = j['minor'] as int,
      normal = j['normal'] as int,
      offline = j['offline'] as int,
      deepestCm = (j['deepestCm'] as num?)?.toDouble();

  final int flooded;
  final int minor;
  final int normal;
  final int offline;
  final double? deepestCm;

  HwLevel get level => flooded > 0 ? HwLevel.warning : (minor > 0 ? HwLevel.watch : HwLevel.normal);
}

class Quake {
  Quake.fromJson(Map<String, dynamic> j)
    : magnitude = _num(j['magnitude']),
      place = LocalizedText.fromJson(j['place'] as Map<String, dynamic>),
      occurredAt = _time(j['occurredAt']),
      km = _num(j['km']),
      level = levelOf(j['severity'] as String);

  final double magnitude;
  final LocalizedText place;
  final DateTime occurredAt;
  final double km;
  final HwLevel level;
}

enum FeedState { live, stale, down }

class Feed {
  Feed.fromJson(Map<String, dynamic> j)
    : topic = j['topic'] as String,
      state = FeedState.values.byName(j['state'] as String),
      lastOkAt = _timeOrNull(j['lastOkAt']),
      failingSince = _timeOrNull(j['failingSince']);

  final String topic;
  final FeedState state;
  final DateTime? lastOkAt;
  final DateTime? failingSince;
}

class AreaReport {
  AreaReport.fromJson(Map<String, dynamic> j)
    : generatedAt = _time(j['generatedAt']),
      updatedAt = _timeOrNull(j['updatedAt']),
      district = District.fromJson(j['district'] as Map<String, dynamic>),
      level = levelOf(j['severity'] as String),
      calm = j['calm'] as bool,
      alerts = [for (final a in j['alerts'] as List) AreaAlert.fromJson(a as Map<String, dynamic>)],
      pm25 = _reading((j['readings'] as Map)['pm25']),
      rain = _reading((j['readings'] as Map)['rain']),
      flood = j['flood'] == null ? null : FloodCounts.fromJson(j['flood'] as Map<String, dynamic>),
      rivers = [for (final r in j['rivers'] as List) AreaReading.fromJson(r as Map<String, dynamic>)],
      quake = j['quake'] == null ? null : Quake.fromJson(j['quake'] as Map<String, dynamic>),
      feeds = [for (final f in j['feeds'] as List) Feed.fromJson(f as Map<String, dynamic>)];

  static AreaReading? _reading(Object? j) => j == null ? null : AreaReading.fromJson(j as Map<String, dynamic>);

  final DateTime generatedAt;
  final DateTime? updatedAt;
  final District district;

  /// The district's level: worst of its alerts (same rules as Web Push).
  final HwLevel level;

  /// No alerts and nothing shown at caution or above, so "all normal" may show. A high gauge just outside the district
  /// makes this false without being the district's alert.
  final bool calm;
  final List<AreaAlert> alerts;
  final AreaReading? pm25;
  final AreaReading? rain;
  final FloodCounts? flood;
  final List<AreaReading> rivers;
  final Quake? quake;
  final List<Feed> feeds;
}
