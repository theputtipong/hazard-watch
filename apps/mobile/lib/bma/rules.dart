/// The DEFAULT_CONFIG values (packages/core/src/config.ts) the app needs to judge BMA data it fetched itself, so it
/// shows the same severities as the web. test/bma_test.dart fails if they drift from config.ts.
abstract final class CoreConfig {
  static const rainWatchMmPerHour = 10.0;
  static const rainWarnMmPerHour = 30.0;
  static const rainDangerMmPerHour = 60.0;
  static const rainWatch24hMm = 35.1;
  static const rainWarn24hMm = 60.0;
  static const rainDanger24hMm = 90.1;

  /// BMA `flood_sub_status` → severity; unlisted codes (1 normal, 0/5 offline) are 'ok'.
  static const floodBmaSubStatus = {2: 'watch', 3: 'warn'};
  static const floodDangerDepthCm = 30.0;

  static const staleAfterMinutes = 90;

  static const pm25PushAt = 37.5;
  static const pushCooldownHours = 3;
  static const quakeLookbackHours = 24 * 7;

  /// Loosest central quake tier: the limit when the person has not picked one (quakeAlertFloor).
  static const quakeFloorMinMagnitude = 6.0;
  static const quakeFloorMaxDistanceKm = 1500;

  /// push.quakeChoices: the only personal quake limits the web and server accept.
  static const quakeMinMagnitudeChoices = [5.0, 6.0, 7.0];
  static const quakeMaxDistanceKmChoices = [500, 1000, 1500];

  /// Most severe matching tier wins; no match is 'ok'.
  static const quakeTiers = [
    (severity: 'danger', minMagnitude: 7.0, maxDistanceKm: 1500.0),
    (severity: 'warn', minMagnitude: 6.0, maxDistanceKm: 1500.0),
  ];

  /// USGS and TMD often report the same event: reports this close in time and space are one.
  static const quakeDuplicateWithinSeconds = 90;
  static const quakeDuplicateWithinKm = 50.0;

  /// DEFAULT_CONFIG.dam: ThaiWater's own storage bands (% of normal storage) and the usable-water floor.
  static const damOverPct = 100.0;
  static const damHighPct = 80.0;
  static const damLowPct = 50.0;
  static const damCriticalPct = 30.0;
  static const damCriticalUsablePct = 30.0;

  /// damStale in apps/ingest/src/area.ts: the dams feed's 36 h limit plus the report day (observedAt is its start).
  static const damStaleHours = 36 + 24;
}

/// damStatus() in packages/core/src/severity.ts, for dam pins on the map (the snapshot carries no status).
String damStatusOf(double storagePct, double? usablePct) {
  if (storagePct > CoreConfig.damOverPct) return 'over';
  if (storagePct > CoreConfig.damHighPct) return 'high';
  if (usablePct != null && usablePct.isFinite) {
    if (usablePct <= CoreConfig.damCriticalUsablePct) return 'critical';
  } else if (storagePct <= CoreConfig.damCriticalPct) {
    return 'critical';
  }
  return storagePct > CoreConfig.damLowPct ? 'normal' : 'low';
}

const severities = ['ok', 'watch', 'warn', 'danger'];

int rank(String severity) => severities.indexOf(severity);

String worst(Iterable<String> list) => list.fold('ok', (a, b) => rank(b) > rank(a) ? b : a);

/// Port of rainSeverity in packages/core/src/severity.ts.
String rainSeverity(double mmPerHour, [double? mm24h]) {
  final hourly = mmPerHour >= CoreConfig.rainDangerMmPerHour
      ? 'danger'
      : mmPerHour >= CoreConfig.rainWarnMmPerHour
      ? 'warn'
      : mmPerHour >= CoreConfig.rainWatchMmPerHour
      ? 'watch'
      : 'ok';
  if (mm24h == null) return hourly;
  final daily = mm24h >= CoreConfig.rainDanger24hMm
      ? 'danger'
      : mm24h >= CoreConfig.rainWarn24hMm
      ? 'warn'
      : mm24h >= CoreConfig.rainWatch24hMm
      ? 'watch'
      : 'ok';
  return worst([hourly, daily]);
}

/// Port of bmaFloodSeverity in packages/core/src/severity.ts.
String bmaFloodSeverity(int subStatus, double? depthCm) {
  final base = CoreConfig.floodBmaSubStatus[subStatus] ?? 'ok';
  if (base == 'ok') return 'ok';
  return depthCm != null && depthCm >= CoreConfig.floodDangerDepthCm ? 'danger' : base;
}

/// Port of quakeSeverity in packages/core/src/severity.ts, [km] from the place being judged.
String quakeSeverity(double magnitude, double km) {
  final tiers = [...CoreConfig.quakeTiers]..sort((a, b) => rank(b.severity) - rank(a.severity));
  for (final t in tiers) {
    if (magnitude >= t.minMagnitude && km <= t.maxDistanceKm) return t.severity;
  }
  return 'ok';
}

/// Widest tier: quakes beyond it never matter to the place (quakeAlertFloor in severity.ts).
double get quakeMaxDistanceKm => CoreConfig.quakeTiers.map((t) => t.maxDistanceKm).reduce((a, b) => a > b ? a : b);

bool isStale(DateTime observedAt, DateTime now) =>
    now.difference(observedAt) > const Duration(minutes: CoreConfig.staleAfterMinutes);
