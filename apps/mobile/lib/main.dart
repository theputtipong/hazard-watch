import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/hazard_api.dart';
import 'app.dart';
import 'location.dart';
import 'settings.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final settings = AppSettings(SharedPreferencesAsync());
  await settings.load();
  runApp(HazardWatchApp(settings: settings, api: HttpHazardApi(), location: DeviceLocation()));
}
