import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/app.dart';
import 'package:hazardwatch/bma/device_bma.dart';
import 'package:hazardwatch/l10n/gen/app_localizations.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/map/map_data.dart';
import 'package:hazardwatch/settings.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';

/// Written by apps/ingest/test/area.test.ts from the real report builder.
/// Written by apps/ingest/test/area.test.ts: the snapshot that area_report.json is built from.
Map<String, dynamic> snapshotJson() =>
    jsonDecode(File('test/fixtures/snapshot.json').readAsStringSync()) as Map<String, dynamic>;

Map<String, dynamic> fixtureJson() =>
    jsonDecode(File('test/fixtures/area_report.json').readAsStringSync()) as Map<String, dynamic>;

/// The fixture's own clock, so "8 นาทีที่แล้ว" style text is stable.
final fixtureNow = DateTime.parse(fixtureJson()['generatedAt'] as String);

class FakeApi implements HazardApi {
  FakeApi({Map<String, dynamic>? report, this.error}) : report = report ?? fixtureJson();

  Map<String, dynamic> report;
  ApiException? error;
  int areaCalls = 0;
  ({String? districtId, double? lat, double? lng})? lastQuery;

  @override
  Future<AreaReport> area({String? districtId, double? lat, double? lng}) async {
    areaCalls++;
    lastQuery = (districtId: districtId, lat: lat, lng: lng);
    if (error != null) throw error!;
    return AreaReport.fromJson(report);
  }

  @override
  Future<List<District>> districts() async => [
    District.fromJson(report['district'] as Map<String, dynamic>),
    const District(
      id: 'TH1030',
      name: LocalizedText('จตุจักร', 'Chatuchak'),
      province: LocalizedText('กรุงเทพมหานคร', 'Bangkok'),
      lat: 13.82,
      lng: 100.56,
    ),
  ];

  Map<String, dynamic>? snapshotData;
  int snapshotCalls = 0;

  @override
  Future<MapSnapshot> snapshot() async {
    snapshotCalls++;
    if (error != null) throw error!;
    return MapSnapshot.fromJson(snapshotData ?? snapshotJson());
  }

  /// Every relayBma call, in order, so BMA tests can check what was handed to the server.
  final relays = <({String kind, List<Object?> raw})>[];

  @override
  Future<void> relayBma(String kind, List<Object?> raw) async {
    relays.add((kind: kind, raw: raw));
  }
}

class FakeLocation implements LocationService {
  FakeLocation(this.result);

  /// Any outcome: `LocationFound(lat, lng, stale: true)` or `LocationUnavailable(reason: LocationFailure.timeout)`.
  LocationResult result;
  int calls = 0;
  int locationSettingsOpened = 0;
  int appSettingsOpened = 0;

  /// Set to hold the answer until the test completes it (to see progress and cancel).
  Completer<LocationResult>? pending;

  @override
  Future<LocationResult> current() async {
    calls++;
    return pending?.future ?? result;
  }

  @override
  Future<void> openLocationSettings() async => locationSettingsOpened++;

  @override
  Future<void> openAppSettings() async => appSettingsOpened++;
}

District fixtureDistrict() => District.fromJson(fixtureJson()['district'] as Map<String, dynamic>);

Future<AppSettings> pumpApp(
  WidgetTester tester, {
  HazardApi? api,
  LocationService? location,
  ThemeMode mode = ThemeMode.light,
  bool cvd = false,
  String lang = 'th',
  bool withDistrict = true,
  DeviceBma? bma,
  DateTime? now,
}) async {
  final settings = AppSettings()
    ..themeMode = mode
    ..cvd = cvd
    ..locale = Locale(lang)
    ..district = withDistrict ? fixtureDistrict() : null;
  await tester.pumpWidget(
    HazardWatchApp(
      settings: settings,
      api: api ?? FakeApi(),
      location: location ?? FakeLocation(LocationUnavailable(denied: true)),
      clock: () => now ?? fixtureNow,
      bma: bma,
    ),
  );
  await tester.pumpAndSettle();
  return settings;
}

Future<void> pumpThemed(
  WidgetTester tester,
  Widget child, {
  Brightness brightness = Brightness.light,
  bool cvd = false,
  String lang = 'th',
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: hwAppTheme(brightness, cvd: cvd),
      locale: Locale(lang),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: Center(child: child)),
    ),
  );
  await tester.pumpAndSettle();
}
