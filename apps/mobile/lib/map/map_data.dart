import '../api/models.dart';
import '../bma/bma_parse.dart';
import '../bma/device_bma.dart';
import '../bma/geo.dart';
import '../bma/rules.dart';
import '../theme/hw_theme.dart';

/// Parsed from `/v1/snapshot`, the same public data the web map draws (DashboardSnapshot in packages/core/src/types.ts).
/// test/fixtures/snapshot.json is written by apps/ingest/test/area.test.ts, so a change on either side fails a test.

enum MapLayer { flood, rain, water, pm25, quake }

/// What the map shows first, as the web's WEB.map.defaultLayers (PM2.5 is off there too).
const defaultMapLayers = {MapLayer.flood, MapLayer.rain, MapLayer.water, MapLayer.quake};

class SourceFeed {
  SourceFeed.fromJson(Map<String, dynamic> j)
    : ok = j['ok'] as bool,
      items = (j['items'] as List).cast<Map<String, dynamic>>(),
      lastOkAt = j['lastOkAt'] != null
          ? DateTime.parse(j['lastOkAt'] as String)
          : (j['ok'] as bool ? DateTime.parse(j['fetchedAt'] as String) : null);

  final bool ok;
  final DateTime? lastOkAt;
  final List<Map<String, dynamic>> items;
}

class MapSnapshot {
  MapSnapshot.fromJson(Map<String, dynamic> j)
    : feeds = {
        for (final group in ['edge', 'runner'])
          if (j[group] case {'feeds': final Map<String, dynamic> feeds})
            for (final e in feeds.entries) e.key: SourceFeed.fromJson(e.value as Map<String, dynamic>),
      };

  /// By snapshot key: pm25, quakesTmd, quakesUsgs, flood, rain, waterlevel, radar, cctv.
  final Map<String, SourceFeed> feeds;
}

/// One marker. [value] is flood depth (cm), rain (mm/h), % of bank-full, PM2.5 (µg/m³) or quake magnitude.
class MapPoint {
  const MapPoint({
    required this.id,
    required this.layer,
    required this.source,
    required this.name,
    required this.lat,
    required this.lng,
    required this.value,
    required this.unit,
    required this.level,
    required this.at,
    this.stale = false,
    this.onDevice = false,
    this.depthKm,
    this.km,
  });

  final String id;
  final MapLayer layer;
  final String source;
  final LocalizedText name;
  final double lat;
  final double lng;
  final double? value;
  final String unit;
  final HwLevel level;
  final DateTime at;

  /// Older than staleAfterMinutes, or a phone copy whose refresh failed: drawn faded.
  final bool stale;
  final bool onDevice;

  /// Quakes only: depth, and distance from the place the severity was judged for.
  final double? depthKm;
  final double? km;
}

/// The server's BMA copy is missing, failing or older than [DeviceBma.maxAge], so the phone should fetch its own.
bool needsDeviceFeed(SourceFeed? f, DateTime now) =>
    f == null || !f.ok || f.lastOkAt == null || now.difference(f.lastOkAt!) >= DeviceBma.maxAge;

/// The server's copy wins when it is working and at least as fresh as the phone's.
bool useDeviceCopy(SourceFeed? f, BmaCopy? copy) =>
    copy != null && (f == null || !f.ok || f.lastOkAt == null || f.lastOkAt!.isBefore(copy.fetchedAt));

double? _numOrNull(Object? v) => (v as num?)?.toDouble();

MapPoint _fromObservation(Map<String, dynamic> o, MapLayer layer, DateTime now) {
  final loc = o['location'] as Map<String, dynamic>;
  final at = DateTime.parse(o['observedAt'] as String);
  return MapPoint(
    id: o['id'] as String,
    layer: layer,
    source: o['source'] as String,
    name: LocalizedText.fromJson(o['name'] as Map<String, dynamic>),
    lat: (loc['lat'] as num).toDouble(),
    lng: (loc['lng'] as num).toDouble(),
    value: _numOrNull(o['value']),
    unit: o['unit'] as String,
    level: levelOf(o['severity'] as String),
    at: at,
    stale: isStale(at, now),
  );
}

MapPoint _fromDevice(BmaObservation o, MapLayer layer, BmaCopy copy, DateTime now) => MapPoint(
  id: o.id,
  layer: layer,
  source: layer == MapLayer.flood ? 'bma-flood' : 'bma-rain',
  name: o.name,
  lat: o.lat,
  lng: o.lng,
  value: o.value,
  unit: layer == MapLayer.flood ? 'cm' : 'mm/h',
  level: levelOf(o.severity),
  at: o.observedAt,
  stale: copy.failed || isStale(o.observedAt, now),
  onDevice: true,
);

/// Which points each layer shows. Offline sensors and empty readings are left out, as on the web.
bool _shown(MapPoint p) => switch (p.layer) {
  MapLayer.flood => true,
  // Hundreds of BMA gauges read 0 on a dry day; only rain that is falling (or heavy over 24 h) is worth a pin.
  MapLayer.rain => p.value != null && (p.value! > 0 || p.level != HwLevel.normal),
  _ => p.value != null,
};

class MapData {
  const MapData({required this.points, required this.floodOnDevice, required this.rainOnDevice});

  /// Least severe first, so the worst are drawn on top.
  final List<MapPoint> points;
  final bool floodOnDevice;
  final bool rainOnDevice;
}

/// Everything the map draws. Quake severity is judged from ([refLat], [refLng]): the followed district, or Bangkok.
MapData buildMapData(
  MapSnapshot s, {
  BmaCopy? deviceFlood,
  BmaCopy? deviceRain,
  required double refLat,
  required double refLng,
  required DateTime now,
}) {
  final floodOnDevice = useDeviceCopy(s.feeds['flood'], deviceFlood);
  final rainOnDevice = useDeviceCopy(s.feeds['rain'], deviceRain);

  List<MapPoint> server(String key, MapLayer layer) => [
    for (final o in s.feeds[key]?.items ?? const <Map<String, dynamic>>[])
      if (o['offline'] != true) _fromObservation(o, layer, now),
  ];
  List<MapPoint> device(BmaCopy copy, MapLayer layer) => [
    for (final o in copy.items)
      if (!o.offline) _fromDevice(o, layer, copy, now),
  ];

  final points = [
    ...floodOnDevice ? device(deviceFlood!, MapLayer.flood) : server('flood', MapLayer.flood),
    ...rainOnDevice ? device(deviceRain!, MapLayer.rain) : server('rain', MapLayer.rain),
    ...server('waterlevel', MapLayer.water),
    ...server('pm25', MapLayer.pm25),
    ...quakePoints(s, refLat: refLat, refLng: refLng, now: now),
  ].where(_shown).toList();
  points.sort((a, b) => a.level.index - b.level.index);

  return MapData(points: points, floodOnDevice: floodOnDevice, rainOnDevice: rainOnDevice);
}

/// Recent quakes within reach of the reference point; TMD and USGS reports of one event count once (mergeQuakes in
/// packages/core/src/alerts.ts, which keeps TMD for its Thai text).
List<MapPoint> quakePoints(MapSnapshot s, {required double refLat, required double refLng, required DateTime now}) {
  ({String id, String source, double mag, double? depth, double lat, double lng, LocalizedText place, DateTime at})
  parse(Map<String, dynamic> q) {
    final loc = q['location'] as Map<String, dynamic>;
    return (
      id: q['id'] as String,
      source: q['source'] as String,
      mag: (q['magnitude'] as num).toDouble(),
      depth: _numOrNull(q['depthKm']),
      lat: (loc['lat'] as num).toDouble(),
      lng: (loc['lng'] as num).toDouble(),
      place: LocalizedText.fromJson(q['place'] as Map<String, dynamic>),
      at: DateTime.parse(q['occurredAt'] as String),
    );
  }

  final tmd = [for (final q in s.feeds['quakesTmd']?.items ?? const <Map<String, dynamic>>[]) parse(q)];
  final usgs = [for (final q in s.feeds['quakesUsgs']?.items ?? const <Map<String, dynamic>>[]) parse(q)];
  final merged = [
    ...tmd,
    for (final q in usgs)
      if (!tmd.any(
        (x) =>
            x.at.difference(q.at).inSeconds.abs() < CoreConfig.quakeDuplicateWithinSeconds &&
            distanceKm(x.lat, x.lng, q.lat, q.lng) < CoreConfig.quakeDuplicateWithinKm,
      ))
        q,
  ];
  final since = now.subtract(const Duration(hours: CoreConfig.quakeLookbackHours));
  return [
    for (final q in merged)
      if (!q.at.isBefore(since))
        if (distanceKm(refLat, refLng, q.lat, q.lng) case final km when km <= quakeMaxDistanceKm)
          MapPoint(
            id: q.id,
            layer: MapLayer.quake,
            source: q.source,
            // USGS gives English only.
            name: LocalizedText(q.place.th.isEmpty ? q.place.en : q.place.th, q.place.en),
            lat: q.lat,
            lng: q.lng,
            value: q.mag,
            unit: '',
            level: levelOf(quakeSeverity(q.mag, km)),
            at: q.at,
            depthKm: q.depth,
            km: km,
          ),
  ];
}
