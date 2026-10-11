import 'package:flutter/widgets.dart';

import '../api/hazard_api.dart';
import '../api/models.dart';
import '../bma/device_bma.dart';
import '../bma/merge.dart';
import '../settings.dart';
import 'area_alerts.dart';
import 'notify_rules.dart';

abstract interface class AlertNotifier {
  Future<void> show(HazardAlert alert, Locale locale);
}

const notifyStateKey = 'notified';

/// One background check: fetch the district's report (and BMA on the phone when needed), notify what
/// [decideNotifications] picks and remember it. A failed fetch changes nothing, so the next run compares again.
Future<int> checkAndNotify({
  required AppSettings settings,
  required HazardApi api,
  required AlertNotifier notifier,
  required BmaStore store,
  required DateTime now,
  DeviceBma? bma,
}) async {
  final district = settings.district;
  if (!settings.notify || district == null) return 0;
  final AreaReport report;
  try {
    report = await api.area(districtId: district.id);
  } on ApiException {
    return 0;
  }
  BmaCopy? flood, rain;
  if (bma != null) {
    if (needsDeviceCopy(report, BmaKind.flood, now)) flood = await bma.get(BmaKind.flood, now);
    if (needsDeviceCopy(report, BmaKind.rain, now)) rain = await bma.get(BmaKind.rain, now);
  }
  final current = [
    ...areaAlerts(report, flood: flood, rain: rain, now: now).where((a) => a.kind != 'quake'),
    ?personalQuake(report, settings.quake),
  ];
  final decision = decideNotifications(
    current: current,
    last: NotifyState.parse(await store.read(notifyStateKey)),
    now: now,
  );
  for (final a in decision.send) {
    await notifier.show(a, settings.locale);
  }
  await store.write(notifyStateKey, decision.next.toJson());
  return decision.send.length;
}
