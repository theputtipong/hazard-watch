import 'package:intl/intl.dart';

import 'api/models.dart';
import 'l10n/gen/app_localizations.dart';

/// Ports of agoText / clockText / feedAgeText in packages/core/src/feeds.ts, so the app and web word time the same.

int _minutesSince(DateTime t, DateTime now) {
  final m = (now.difference(t).inSeconds / 60).round();
  return m < 0 ? 0 : m;
}

String agoText(AppLocalizations l, DateTime t, DateTime now) {
  final min = _minutesSince(t, now);
  if (min < 2) return l.timeJustNow;
  return min < 120 ? l.timeMinAgo('$min') : l.timeHourAgo('${(min / 60).round()}');
}

/// "17:00 น.", with the date when not today so an old time never reads as today.
String clockText(AppLocalizations l, DateTime t, DateTime now) {
  final local = t.toLocal();
  final today = now.toLocal();
  final sameDay = local.year == today.year && local.month == today.month && local.day == today.day;
  final time = DateFormat('HH:mm', l.localeName).format(local);
  final day = sameDay ? '' : '${DateFormat('d MMM', l.localeName).format(local)} ';
  // Non-breaking spaces keep "5 ต.ค. 21:40 น." on one line.
  return l.timeClock('$day$time').replaceAll(' ', ' ');
}

String feedAgeText(AppLocalizations l, Feed f, DateTime now) {
  if (f.state == FeedState.down) {
    return f.failingSince != null ? l.feedsDown(clockText(l, f.failingSince!, now)) : l.feedsDownNever;
  }
  if (f.lastOkAt == null) return l.feedsDownNever;
  if (f.state == FeedState.live) return agoText(l, f.lastOkAt!, now);
  final min = _minutesSince(f.lastOkAt!, now);
  return l.feedsStale(min < 120 ? l.timeMins('$min') : l.timeHours('${(min / 60).round()}'));
}

String feedName(AppLocalizations l, String topic) => switch (topic) {
  'flood' => l.feedsNameFlood,
  'rain' => l.feedsNameRain,
  'waterlevel' => l.feedsNameWaterlevel,
  'radar' => l.feedsNameRadar,
  'pm25' => l.feedsNamePm25,
  'quakes' => l.feedsNameQuakes,
  _ => topic,
};

/// Names people know (design system: กทม., กรมอุตุฯ, กรมควบคุมมลพิษ, ThaiWater).
String sourceName(AppLocalizations l, String source) => switch (source) {
  'air4thai' => l.sourceNameAir4thai,
  'bma-flood' || 'bma-rain' || 'bma-traffic' => l.sourceNameBma,
  'thaiwater' => l.sourceNameThaiwater,
  'tmd' => l.sourceNameTmd,
  'usgs' => l.sourceNameUsgs,
  _ => l.sourceNameOther,
};

/// Readings as the source reports them, at most one decimal: "62", "24.3".
String numberText(double v) => v == v.roundToDouble() ? '${v.round()}' : v.toStringAsFixed(1);

String kmText(double km) => km < 10 ? km.toStringAsFixed(1) : km.round().toString();
