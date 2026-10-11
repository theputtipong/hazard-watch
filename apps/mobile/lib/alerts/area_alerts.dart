import 'package:flutter/widgets.dart';

import '../api/models.dart';
import '../bma/bangkok_districts.g.dart';
import '../bma/bma_parse.dart';
import '../bma/device_bma.dart';
import '../bma/merge.dart';
import '../bma/rules.dart';
import '../format.dart';
import '../l10n/gen/app_localizations.dart';
import '../theme/hw_theme.dart';

/// One alert for the followed district, from `/v1/area` or built from BMA data fetched on this phone.
class HazardAlert {
  const HazardAlert({
    required this.key,
    required this.kind,
    required this.level,
    required this.title,
    required this.body,
    required this.at,
    this.onDevice = false,
    this.event = false,
  });

  /// Stable per hazard and area (`flood:TH1001`, `quake:…`), as in packages/core/src/alerts.ts.
  final String key;
  final String kind;
  final HwLevel level;
  final LocalizedText title;
  final LocalizedText body;

  /// When the data behind it was read, or see [event].
  final DateTime at;
  final bool onDevice;

  /// [at] is when the event happened rather than when data was read.
  final bool event;
}

/// The person's earthquake limit (push.quakeChoices); [standard] is the central tiers' floor.
class QuakePrefs {
  const QuakePrefs({required this.minMagnitude, required this.maxDistanceKm});

  static const standard = QuakePrefs(
    minMagnitude: CoreConfig.quakeFloorMinMagnitude,
    maxDistanceKm: CoreConfig.quakeFloorMaxDistanceKm,
  );

  final double minMagnitude;
  final int maxDistanceKm;

  bool matches(Quake q) => q.magnitude >= minMagnitude && q.km <= maxDistanceKm;
}

LocalizedText _text(
  String Function(AppLocalizations l, String Function(HwLevel) level, String Function(LocalizedText) of) f,
) {
  String make(String lang) {
    final locale = Locale(lang);
    return f(lookupAppLocalizations(locale), (v) => v.label(locale), (t) => t.of(locale));
  }

  return LocalizedText(make('th'), make('en'));
}

/// Same rule as districtAlerts in packages/core/src/alerts.ts: fresh, working sensors inside the district.
List<BmaObservation> _inside(BmaCopy copy, String districtId, DateTime now) {
  final zone = bangkokDistricts[districtId];
  if (zone == null) return const [];
  return copy.items
      .where((o) => !o.offline && o.value != null && !isStale(o.observedAt, now) && zone.contains(o.lat, o.lng))
      .toList();
}

HazardAlert? _deviceFlood(BmaCopy copy, District d, DateTime now) {
  final flooded = _inside(copy, d.id, now).where((o) => rank(o.severity) >= rank('warn')).toList();
  if (flooded.isEmpty) return null;
  final level = levelOf(flooded.any((o) => o.severity == 'danger') ? 'danger' : 'warn');
  final deepest = flooded.map((o) => o.value!).reduce((a, b) => a > b ? a : b);
  return HazardAlert(
    key: 'flood:${d.id}',
    kind: 'flood',
    level: level,
    title: _text((l, lv, of) => l.alertFloodTitle(lv(level), of(d.name))),
    body: _text((l, _, _) => l.alertFloodBody('${flooded.length}', '${deepest.round()}')),
    at: copy.fetchedAt,
    onDevice: true,
  );
}

HazardAlert? _deviceRain(BmaCopy copy, District d, DateTime now) {
  final heavy = _inside(copy, d.id, now).where((o) => rank(o.severity) >= rank('warn')).toList();
  if (heavy.isEmpty) return null;
  final top = heavy.reduce(
    (a, b) => rank(a.severity) > rank(b.severity) || (a.severity == b.severity && a.value! >= b.value!) ? a : b,
  );
  final level = levelOf(top.severity);
  return HazardAlert(
    key: 'rain:${d.id}',
    kind: 'rain',
    level: level,
    title: _text((l, lv, of) => l.alertRainTitle(lv(level), of(d.name))),
    body: _text((l, _, _) => l.alertRainBody(numberText(top.value!))),
    at: copy.fetchedAt,
    onDevice: true,
  );
}

/// The district's latest regional earthquake as an alert when it is inside the person's limit; below every central
/// tier it alerts as caution (quakeAlerts with a personal limit).
HazardAlert? personalQuake(AreaReport r, QuakePrefs prefs) {
  final q = r.quake;
  if (q == null || !prefs.matches(q)) return null;
  final level = q.level == HwLevel.normal ? HwLevel.watch : q.level;
  return HazardAlert(
    key: 'quake:${q.occurredAt.toUtc().toIso8601String()}',
    kind: 'quake',
    level: level,
    title: _text((l, lv, _) => l.alertQuakeTitle(lv(level), q.magnitude.toStringAsFixed(1))),
    body: _text((l, _, of) => l.alertQuakeBody(of(q.place), kmText(q.km))),
    at: q.occurredAt,
    event: true,
  );
}

/// Alerts for the district, most severe first. Flood and rain come from the phone's BMA copy when that copy is the one
/// shown (same choice as the home screen), since the server cannot reach BMA.
List<HazardAlert> areaAlerts(
  AreaReport r, {
  BmaCopy? flood,
  BmaCopy? rain,
  required DateTime now,
  QuakePrefs quake = QuakePrefs.standard,
}) {
  final floodOnDevice = usesDeviceCopy(r, BmaKind.flood, flood);
  final rainOnDevice = usesDeviceCopy(r, BmaKind.rain, rain);
  final at = r.updatedAt ?? r.generatedAt;
  final mine = personalQuake(r, quake);
  final list = [
    for (final a in r.alerts)
      if (!(floodOnDevice && a.kind == 'flood') && !(rainOnDevice && a.kind == 'rain'))
        HazardAlert(key: a.key, kind: a.kind, level: a.level, title: a.title, body: a.body, at: at),
    if (floodOnDevice) ?_deviceFlood(flood!, r.district, now),
    if (rainOnDevice) ?_deviceRain(rain!, r.district, now),
    // At a central tier the server already lists it.
    if (mine != null && r.quake!.level == HwLevel.normal) mine,
  ];
  // Stable: equal levels keep the server's order.
  return _stableSort(list, (a, b) => b.level.index - a.level.index);
}

List<T> _stableSort<T>(List<T> list, int Function(T a, T b) compare) {
  final indexed = [for (var i = 0; i < list.length; i++) (i, list[i])];
  indexed.sort((a, b) {
    final c = compare(a.$2, b.$2);
    return c != 0 ? c : a.$1 - b.$1;
  });
  return [for (final e in indexed) e.$2];
}
