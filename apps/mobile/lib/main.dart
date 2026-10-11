import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'alerts/phone_notifications.dart';
import 'api/hazard_api.dart';
import 'app.dart';
import 'bma/device_bma.dart';
import 'location.dart';
import 'settings.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = SharedPreferencesAsync();
  final settings = AppSettings(prefs);
  await settings.load();
  await initPhoneNotifications(settings);
  runApp(
    HazardWatchApp(
      settings: settings,
      api: HttpHazardApi(),
      location: DeviceLocation(),
      bma: DeviceBma(fetcher: HttpBmaFetcher(), store: PrefsBmaStore(prefs)),
    ),
  );
}
