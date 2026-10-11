import 'dart:convert';

import '../bma/rules.dart';
import '../theme/hw_theme.dart';
import 'area_alerts.dart';

/// What was last notified for one alert key.
class Notified {
  const Notified({required this.level, required this.at, required this.seenAt});

  final HwLevel level;

  /// When it was last notified.
  final DateTime at;

  /// When the alert was last present; old keys are forgotten from here.
  final DateTime seenAt;
}

/// Saved between background runs as JSON.
class NotifyState {
  const NotifyState([this.byKey = const {}]);

  final Map<String, Notified> byKey;

  static NotifyState parse(String? json) {
    if (json == null) return const NotifyState();
    try {
      final j = jsonDecode(json) as Map<String, dynamic>;
      return NotifyState({
        for (final MapEntry(:key, :value) in j.entries)
          key: Notified(
            level: HwLevel.values.byName((value as Map)['level'] as String),
            at: DateTime.parse(value['at'] as String),
            seenAt: DateTime.parse(value['seenAt'] as String),
          ),
      });
    } on Object {
      return const NotifyState();
    }
  }

  String toJson() => jsonEncode({
    for (final MapEntry(:key, :value) in byKey.entries)
      key: {
        'level': value.level.name,
        'at': value.at.toUtc().toIso8601String(),
        'seenAt': value.seenAt.toUtc().toIso8601String(),
      },
  });
}

const _cooldown = Duration(hours: CoreConfig.pushCooldownHours);
const _quakeMemory = Duration(hours: CoreConfig.quakeLookbackHours);

/// Same filter as `wanted` in apps/ingest/src/push/run.ts with default prefs. PM2.5 alerts start at the lowest band;
/// push.pm25.pushAt (37.5) is where the warning band starts, so below warning is not sent.
bool _wanted(HazardAlert a) => a.kind != 'pm25' || a.level.index >= HwLevel.warning.index;

/// Decides which alerts to notify, in the extension's dedupe spirit: an alert is sent when it is new or its level rose
/// above what was last sent. Within [CoreConfig.pushCooldownHours] of a send, a level that dips and comes back does not
/// re-send, and an alert that clears and returns does not either. Earthquakes are sent once per event.
///
/// [current] should be the district's non-quake alerts plus [personalQuake].
({List<HazardAlert> send, NotifyState next}) decideNotifications({
  required List<HazardAlert> current,
  required NotifyState last,
  required DateTime now,
}) {
  Duration memory(String key) => key.startsWith('quake:') ? _quakeMemory : _cooldown;
  final remembered = {
    for (final MapEntry(:key, :value) in last.byKey.entries)
      if (now.difference(value.seenAt) < memory(key)) key: value,
  };
  final send = <HazardAlert>[];
  final next = <String, Notified>{};
  for (final a in current.where(_wanted)) {
    final prev = remembered[a.key];
    if (prev == null || a.level.index > prev.level.index) {
      send.add(a);
      next[a.key] = Notified(level: a.level, at: now, seenAt: now);
      continue;
    }
    final cooled = now.difference(prev.at) >= _cooldown;
    next[a.key] = Notified(level: cooled ? a.level : prev.level, at: prev.at, seenAt: now);
  }
  for (final MapEntry(:key, :value) in remembered.entries) {
    next.putIfAbsent(key, () => value);
  }
  send.sort((a, b) => b.level.index - a.level.index);
  return (send: send, next: NotifyState(next));
}
