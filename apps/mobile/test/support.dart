import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/app.dart';
import 'package:hazardwatch/l10n/gen/app_localizations.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/settings.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';

/// Written by apps/ingest/test/area.test.ts from the real report builder.
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
}

class FakeLocation implements LocationService {
  FakeLocation(this.result);
  LocationResult result;
  int calls = 0;

  @override
  Future<LocationResult> current() async {
    calls++;
    return result;
  }
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
      clock: () => fixtureNow,
    ),
  );
  await tester.pumpAndSettle();
  return settings;
}

/// A single widget under the app theme, for component tests.
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
