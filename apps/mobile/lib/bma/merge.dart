import '../api/models.dart';
import '../theme/hw_theme.dart';
import 'bangkok_districts.g.dart';
import 'bma_parse.dart';
import 'device_bma.dart';
import 'geo.dart';
import 'rules.dart';

/// Flooding and rain as the home screen shows them: from `/v1/area`, or from BMA data fetched on this phone when the
/// server's copy is failing or older.
class HazardView {
  const HazardView({
    required this.rain,
    required this.rainOnDevice,
    required this.flood,
    required this.floodOnDevice,
    required this.floodStale,
    required this.floodAt,
    required this.feeds,
    required this.calm,
  });

  final AreaReading? rain;
  final bool rainOnDevice;
  final FloodCounts? flood;
  final bool floodOnDevice;

  /// Device copy whose refresh failed: show "—" and when it was fetched, never as current.
  final bool floodStale;
  final DateTime? floodAt;
  final List<Feed> feeds;
  final bool calm;
}

Feed? _feed(AreaReport r, BmaKind kind) => r.feeds.where((f) => f.topic == kind.topic).firstOrNull;

/// The server's copy is missing, failing or older than [DeviceBma.maxAge], and BMA covers the district.
bool needsDeviceCopy(AreaReport r, BmaKind kind, DateTime now) {
  if (!isBangkok(r.district.id)) return false;
  final f = _feed(r, kind);
  return f == null ||
      f.state != FeedState.live ||
      f.lastOkAt == null ||
      now.difference(f.lastOkAt!) >= DeviceBma.maxAge;
}

/// The server's copy wins when its feed is live and at least as fresh as the phone's.
bool _useDevice(AreaReport r, BmaKind kind, BmaCopy? copy) {
  if (copy == null) return false;
  final f = _feed(r, kind);
  return !(f != null && f.state == FeedState.live && f.lastOkAt != null && !f.lastOkAt!.isBefore(copy.fetchedAt));
}

double _round1(double n) => (n * 10).round() / 10;

/// Nearest working gauge to the district centre, fresh ones first (nearest() in apps/ingest/src/area.ts).
AreaReading? deviceRain(BmaCopy copy, District d, DateTime now) {
  final usable = copy.items.where((o) => !o.offline && o.value != null).toList();
  final fresh = usable.where((o) => !isStale(o.observedAt, now)).toList();
  final pool = fresh.isNotEmpty ? fresh : usable;
  if (pool.isEmpty) return null;
  double km(BmaObservation o) => _round1(distanceKm(d.lat, d.lng, o.lat, o.lng));
  final o = pool.reduce((a, b) => km(b) < km(a) ? b : a);
  return AreaReading(
    id: o.id,
    kind: 'rain',
    source: 'bma-rain',
    name: o.name,
    value: o.value!,
    unit: 'mm/h',
    level: levelOf(o.severity),
    observedAt: o.observedAt,
    km: km(o),
    stale: copy.failed || isStale(o.observedAt, now),
  );
}

/// Street-flood sensors inside the district (floodCounts in apps/ingest/src/area.ts); null when it has none.
FloodCounts? deviceFlood(BmaCopy copy, String districtId, DateTime now) {
  final zone = bangkokDistricts[districtId];
  if (zone == null) return null;
  final inside = copy.items.where((o) => zone.contains(o.lat, o.lng) && !isStale(o.observedAt, now)).toList();
  if (inside.isEmpty) return null;
  final working = inside.where((o) => !o.offline);
  double? deepest;
  for (final o in working) {
    if (o.value != null && o.value! > (deepest ?? 0)) deepest = o.value;
  }
  return FloodCounts(
    flooded: working.where((o) => rank(o.severity) >= rank('warn')).length,
    minor: working.where((o) => o.severity == 'watch').length,
    normal: working.where((o) => o.severity == 'ok').length,
    offline: inside.length - working.length,
    deepestCm: deepest,
  );
}

HazardView mergeDevice(AreaReport r, {BmaCopy? flood, BmaCopy? rain, required DateTime now}) {
  final rainOnDevice = _useDevice(r, BmaKind.rain, rain);
  final floodOnDevice = _useDevice(r, BmaKind.flood, flood);
  final shownRain = rainOnDevice ? deviceRain(rain!, r.district, now) : r.rain;
  final shownFlood = floodOnDevice ? deviceFlood(flood!, r.district.id, now) : r.flood;
  final floodStale = floodOnDevice && flood!.failed;

  Feed deviceFeed(BmaKind kind, BmaCopy c) => Feed(
    topic: kind.topic,
    state: c.failed ? FeedState.down : FeedState.live,
    lastOkAt: c.fetchedAt,
    failingSince: c.failedAt,
  );
  final replaced = {
    if (floodOnDevice) BmaKind.flood.topic: deviceFeed(BmaKind.flood, flood!),
    if (rainOnDevice) BmaKind.rain.topic: deviceFeed(BmaKind.rain, rain!),
  };
  final feeds = [
    for (final kind in BmaKind.values)
      if (replaced[kind.topic] != null && _feed(r, kind) == null) replaced[kind.topic]!,
    for (final f in r.feeds) replaced[f.topic] ?? f,
  ];

  // The server judged "calm" without this data, so anything at caution or above from the phone cancels it.
  final rainHigh =
      rainOnDevice && shownRain != null && !shownRain.stale && shownRain.level.index >= HwLevel.watch.index;
  final floodHigh = floodOnDevice && !floodStale && (shownFlood?.flooded ?? 0) > 0;

  return HazardView(
    rain: shownRain,
    rainOnDevice: rainOnDevice && shownRain != null,
    flood: shownFlood,
    floodOnDevice: floodOnDevice && shownFlood != null,
    floodStale: floodStale,
    floodAt: floodOnDevice ? flood!.fetchedAt : null,
    feeds: feeds,
    calm: r.calm && !rainHigh && !floodHigh,
  );
}
