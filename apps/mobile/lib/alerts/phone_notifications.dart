import 'dart:io';
import 'dart:ui';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

import '../api/hazard_api.dart';
import '../bma/device_bma.dart';
import '../l10n/gen/app_localizations.dart';
import '../settings.dart';
import '../theme/hw_theme.dart';
import 'alert_check.dart';
import 'area_alerts.dart';

// No push service: the phone polls /v1/area in the background and notifies itself. Android runs the task about every
// 15 minutes (WorkManager's minimum); iOS runs BGAppRefresh tasks when the system chooses, often less often.

/// Must match BGTaskSchedulerPermittedIdentifiers in ios/Runner/Info.plist and AppDelegate.swift.
const alertTaskId = 'com.pdouvch.hazardwatch.alerts';
const _checkEvery = Duration(minutes: 15);
const _channelId = 'area-alerts';

/// Turning phone notifications on and off: permission and the background schedule.
abstract interface class PhoneNotifications {
  /// Asks for permission (Android 13+, iOS); false when refused.
  Future<bool> requestPermission();
  Future<void> start();
  Future<void> stop();
}

bool get _supported => Platform.isAndroid || Platform.isIOS;

class DevicePhoneNotifications implements PhoneNotifications {
  const DevicePhoneNotifications();

  @override
  Future<bool> requestPermission() async {
    if (!_supported) return false;
    final plugin = await _plugin();
    if (Platform.isAndroid) {
      final android = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      return await android?.requestNotificationsPermission() ?? false;
    }
    final ios = plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
    return await ios?.requestPermissions(alert: true, sound: true) ?? false;
  }

  @override
  Future<void> start() async {
    if (!_supported) return;
    await Workmanager().registerPeriodicTask(
      alertTaskId,
      alertTaskId,
      frequency: _checkEvery,
      initialDelay: Platform.isIOS ? _checkEvery : null,
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
    );
  }

  @override
  Future<void> stop() async {
    if (!_supported) return;
    await Workmanager().cancelByUniqueName(alertTaskId);
  }
}

/// Call once from main before runApp; keeps the schedule in step with the saved choice.
Future<void> initPhoneNotifications(AppSettings settings) async {
  if (!_supported) return;
  try {
    await Workmanager().initialize(alertsDispatcher);
    const n = DevicePhoneNotifications();
    await (settings.notify ? n.start() : n.stop());
  } on Object {
    // The app still works without background checks; the next start tries again.
  }
}

FlutterLocalNotificationsPlugin? _initialized;

Future<FlutterLocalNotificationsPlugin> _plugin() async {
  if (_initialized != null) return _initialized!;
  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      // Permission is asked from Settings after explaining why, never at start.
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    ),
  );
  return _initialized = plugin;
}

/// FNV-1a, so the same alert key maps to the same notification id in every run and a newer one replaces it.
int notificationId(String key) {
  var h = 0x811c9dc5;
  for (final c in key.codeUnits) {
    h = ((h ^ c) * 0x01000193) & 0x7fffffff;
  }
  return h;
}

class LocalAlertNotifier implements AlertNotifier {
  @override
  Future<void> show(HazardAlert alert, Locale locale) async {
    final plugin = await _plugin();
    final l = lookupAppLocalizations(locale);
    final urgent = alert.level == HwLevel.danger;
    await plugin.show(
      id: notificationId(alert.key),
      title: alert.title.of(locale),
      body: alert.body.of(locale),
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          l.notifyChannel,
          importance: urgent ? Importance.max : Importance.high,
          priority: urgent ? Priority.max : Priority.high,
          styleInformation: BigTextStyleInformation(alert.body.of(locale)),
        ),
        iOS: DarwinNotificationDetails(
          interruptionLevel: urgent ? InterruptionLevel.timeSensitive : InterruptionLevel.active,
        ),
      ),
    );
  }
}

@pragma('vm:entry-point')
void alertsDispatcher() {
  Workmanager().executeTask((task, _) async {
    DartPluginRegistrant.ensureInitialized();
    final prefs = SharedPreferencesAsync();
    final settings = AppSettings(prefs);
    await settings.load();
    final store = PrefsBmaStore(prefs);
    final api = HttpHazardApi();
    await checkAndNotify(
      settings: settings,
      api: api,
      notifier: LocalAlertNotifier(),
      store: store,
      bma: DeviceBma(fetcher: HttpBmaFetcher(), store: store, relay: (k, raw) => api.relayBma(k.name, raw)),
      now: DateTime.now(),
    );
    return true;
  });
}
