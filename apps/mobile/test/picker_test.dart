import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/screens/area_picker_screen.dart';

import 'support.dart';

/// The real shape of `/v1/districts`: 928 districts across 77 provinces, Bangkok's 50 first.
List<District> nationwide() {
  final out = <District>[
    for (var i = 1; i <= 50; i++)
      District(
        id: 'TH10${i.toString().padLeft(2, '0')}',
        name: i == 30 ? const LocalizedText('จตุจักร', 'Chatuchak') : LocalizedText('เขต$i', 'Khet $i'),
        province: const LocalizedText('กรุงเทพมหานคร', 'Bangkok'),
        lat: 13.75,
        lng: 100.5,
      ),
  ];
  // 878 more over 76 provinces (11 or 12 each).
  for (var p = 0; p < 76; p++) {
    final province = p == 0
        ? const LocalizedText('เชียงใหม่', 'Chiang Mai')
        : LocalizedText('จังหวัด$p', 'Changwat $p');
    final n = p < 42 ? 12 : 11;
    for (var i = 0; i < n; i++) {
      out.add(
        District(
          id: 'TH${(p + 11).toString().padLeft(2, '0')}${i.toString().padLeft(2, '0')}',
          name: p == 0 && i == 0
              ? const LocalizedText('เมืองเชียงใหม่', 'Mueang Chiang Mai')
              : LocalizedText('อำเภอ$p-$i', 'Amphoe $p-$i'),
          province: province,
          lat: 18.0,
          lng: 99.0,
        ),
      );
    }
  }
  return out;
}

class NationwideApi extends FakeApi {
  final all = nationwide();

  @override
  Future<List<District>> districts() async => all;
}

Future<void> openPicker(WidgetTester tester, NationwideApi api, {District? current}) async {
  await pumpThemed(
    tester,
    Builder(
      builder: (context) => TextButton(
        onPressed: () => pickDistrict(context, api, FakeLocation(LocationUnavailable(denied: true)), current: current),
        child: const Text('open'),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

void main() {
  test('the fixture is the real size', () {
    final all = nationwide();
    expect(all, hasLength(928));
    expect({for (final d in all) d.province!.th}, hasLength(77));
  });

  test('search ignores case and spaces, Thai or English, and matches the province', () {
    final index = DistrictIndex(nationwide());
    expect(index.provinces, hasLength(77));
    expect(index.search('chatu chak').map((d) => d.id), ['TH1030']);
    expect(index.search('จตุ จักร').map((d) => d.id), ['TH1030']);
    expect(index.search('MUEANGCHIANG').map((d) => d.id), ['TH1100']);
    expect(index.search('Chiang Mai'), hasLength(12)); // the province name finds all its districts
    expect(index.search('   '), isEmpty);
    expect(index.search('zzz'), isEmpty);
  });

  testWidgets('opens on 77 provinces quickly, building only the rows on screen', (tester) async {
    final api = NationwideApi();
    final watch = Stopwatch()..start();
    await openPicker(tester, api);
    watch.stop();
    expect(find.text('กรุงเทพมหานคร'), findsOneWidget);
    expect(find.byType(ListTile).evaluate().length, lessThan(77));
    expect(watch.elapsedMilliseconds, lessThan(1500)); // generous for CI; real budget is 300 ms on a device
  });

  testWidgets('province then district returns the district', (tester) async {
    final api = NationwideApi();
    District? picked;
    await pumpThemed(
      tester,
      Builder(
        builder: (context) => TextButton(
          onPressed: () async =>
              picked = await pickDistrict(context, api, FakeLocation(LocationUnavailable(denied: true))),
          child: const Text('open'),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('กรุงเทพมหานคร'));
    await tester.pumpAndSettle();
    expect(find.text('เขต1'), findsOneWidget);
    expect(find.text('เลือกจังหวัด'), findsWidgets); // the way back to all provinces
    await tester.scrollUntilVisible(find.text('จตุจักร'), 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('จตุจักร'));
    await tester.pumpAndSettle();
    expect(picked?.id, 'TH1030');
  });

  testWidgets('system back from a province returns to the province list', (tester) async {
    await openPicker(tester, NationwideApi());
    await tester.tap(find.text('เชียงใหม่'));
    await tester.pumpAndSettle();
    expect(find.text('เมืองเชียงใหม่'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('กรุงเทพมหานคร'), findsOneWidget);
    expect(find.byType(AreaPickerScreen), findsOneWidget);
  });

  testWidgets('a broad search over 928 districts stays lazy and reaches the last row', (tester) async {
    await openPicker(tester, NationwideApi());
    await tester.enterText(find.byType(TextField), 'amphoe');
    await tester.pumpAndSettle();
    expect(find.byType(ListTile).evaluate().length, lessThan(40));
    await tester.scrollUntilVisible(find.text('อำเภอ75-10'), 2000, scrollable: find.byType(Scrollable).first);
    expect(find.text('อำเภอ75-10'), findsOneWidget);
  });

  testWidgets('search shows the province under each hit, and says when nothing matches', (tester) async {
    await openPicker(tester, NationwideApi());
    await tester.enterText(find.byType(TextField), 'chatuchak');
    await tester.pumpAndSettle();
    expect(find.text('จตุจักร'), findsOneWidget);
    expect(find.text('กรุงเทพมหานคร'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'xyz');
    await tester.pumpAndSettle();
    expect(find.text('ไม่พบเขต/อำเภอที่ตรงกับคำค้น'), findsOneWidget);
  });

  testWidgets('a saved pick opens on its province; an old id the list lacks still opens', (tester) async {
    await openPicker(tester, NationwideApi(), current: fixtureDistrict());
    expect(find.text('เขต1'), findsOneWidget); // Bangkok's districts, not the province list
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    const gone = District(id: 'TH9999', name: LocalizedText('เก่า', 'Old'), lat: 13.7, lng: 100.5);
    await openPicker(tester, NationwideApi(), current: gone);
    expect(find.text('กรุงเทพมหานคร'), findsOneWidget);
  });

  group('use my location', () {
    Future<District?> Function() openWith(WidgetTester tester, FakeApi api, FakeLocation location) {
      District? picked;
      var done = false;
      return () async {
        if (!done) {
          done = true;
          await pumpThemed(
            tester,
            Builder(
              builder: (context) => TextButton(
                onPressed: () async => picked = await pickDistrict(context, api, location),
                child: const Text('open'),
              ),
            ),
          );
          await tester.tap(find.text('open'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('ใช้ตำแหน่งของฉัน'));
          await tester.pumpAndSettle();
        }
        return picked;
      };
    }

    for (final stale in [false, true]) {
      testWidgets('a ${stale ? 'last-known' : 'fresh'} position becomes the district from the API', (tester) async {
        final api = NationwideApi();
        final location = FakeLocation(LocationFound(13.755, 100.5, stale: stale));
        final picked = await openWith(tester, api, location)();
        expect(api.lastQuery, (districtId: null, lat: 13.755, lng: 100.5));
        expect(picked?.id, fixtureDistrict().id);
        expect(find.byType(AreaPickerScreen), findsNothing);
      });
    }

    final cases = <LocationFailure, (String, String?)>{
      LocationFailure.serviceOff: ('ตำแหน่งในเครื่องปิดอยู่ เปิดแล้วลองใหม่ หรือเลือกเขต/อำเภอเอง', 'เปิดตำแหน่ง'),
      LocationFailure.denied: ('ไม่ได้รับสิทธิ์ใช้ตำแหน่ง เลือกเขต/อำเภอเองได้', null),
      LocationFailure.deniedForever: (
        'แอปถูกปิดสิทธิ์ใช้ตำแหน่ง เปิดได้ในการตั้งค่าแอป หรือเลือกเขต/อำเภอเอง',
        'เปิดการตั้งค่าแอป',
      ),
      LocationFailure.timeout: ('หาตำแหน่งไม่ทัน ลองใหม่ หรือเลือกเขต/อำเภอเองด้านล่าง', 'ลองใหม่'),
      LocationFailure.error: ('หาตำแหน่งไม่ได้ เลือกเขต/อำเภอแทนได้', 'ลองใหม่'),
    };
    for (final MapEntry(key: reason, value: (message, action)) in cases.entries) {
      testWidgets('${reason.name}: says so, offers its fix, and keeps the list', (tester) async {
        final api = NationwideApi();
        final location = FakeLocation(LocationUnavailable(reason: reason));
        await openWith(tester, api, location)();
        expect(find.text(message), findsOneWidget);
        expect(find.text('กรุงเทพมหานคร'), findsOneWidget); // manual pick still there
        expect(api.areaCalls, 0);
        expect(find.byType(OutlinedButton), action == null ? findsNothing : findsOneWidget);
        if (action == null) return;
        await tester.tap(find.widgetWithText(OutlinedButton, action));
        await tester.pumpAndSettle();
        switch (reason) {
          case LocationFailure.serviceOff:
            expect(location.locationSettingsOpened, 1);
          case LocationFailure.deniedForever:
            expect(location.appSettingsOpened, 1);
          default:
            expect(location.calls, 2); // tried again
        }
      });
    }

    testWidgets('shows progress while locating, and cancel ignores a late answer', (tester) async {
      final api = NationwideApi();
      final location = FakeLocation(LocationFound(13.755, 100.5))..pending = Completer();
      await pumpThemed(
        tester,
        Builder(
          builder: (context) =>
              TextButton(onPressed: () => pickDistrict(context, api, location), child: const Text('open')),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('ใช้ตำแหน่งของฉัน'));
      await tester.pump();
      expect(find.text('กำลังหาตำแหน่ง…'), findsOneWidget);
      expect(find.text('อาจใช้เวลาถึงครึ่งนาที ระหว่างนี้เลือกเขต/อำเภอเองได้'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      await tester.tap(find.text('ยกเลิก'));
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.text('ใช้ตำแหน่งของฉัน'), findsOneWidget);
      location.pending!.complete(LocationFound(13.755, 100.5));
      await tester.pumpAndSettle();
      expect(api.areaCalls, 0);
      expect(find.byType(AreaPickerScreen), findsOneWidget);
    });
  });

  group('DeviceLocation', () {
    final now = DateTime.utc(2026, 10, 17, 10);
    DeviceLocation device(FakeGeo geo) =>
        DeviceLocation(platform: geo, clock: () => now, target: TargetPlatform.android);

    test('location off', () async {
      final r = await device(FakeGeo()..serviceOn = false).current();
      expect((r as LocationUnavailable).reason, LocationFailure.serviceOff);
    });

    test('asks once when not yet decided; no means denied, blocked means deniedForever', () async {
      final geo = FakeGeo()..permission = LocationPermission.denied;
      expect(((await device(geo).current()) as LocationUnavailable).reason, LocationFailure.denied);
      expect(geo.requests, 1);
      geo.permission = LocationPermission.deniedForever;
      expect(((await device(geo).current()) as LocationUnavailable).reason, LocationFailure.deniedForever);
      expect(geo.requests, 1);
    });

    test('a last-known position under 10 minutes old is used without waiting for a fix', () async {
      final geo = FakeGeo()..last = pos(13.7, 100.5, now.subtract(const Duration(minutes: 9)));
      final r = await device(geo).current() as LocationFound;
      expect((r.lat, r.lng, r.stale), (13.7, 100.5, true));
      expect(geo.fixes, 0);
    });

    test('otherwise a balanced-power fix, the platform way, within 25 s', () async {
      final geo = FakeGeo()
        ..last = pos(1, 1, now.subtract(const Duration(minutes: 30)))
        ..fix = pos(13.8, 100.6, now);
      final r = await device(geo).current() as LocationFound;
      expect((r.lat, r.lng, r.stale), (13.8, 100.6, false));
      final settings = geo.settings! as AndroidSettings;
      expect(settings.accuracy, LocationAccuracy.medium);
      expect(settings.forceLocationManager, isFalse);
      expect(settings.timeLimit, const Duration(seconds: 25));
    });

    test('on timeout a last-known position up to an hour old still counts', () async {
      final geo = FakeGeo()..last = pos(13.7, 100.5, now.subtract(const Duration(minutes: 50)));
      final r = await device(geo).current() as LocationFound;
      expect(r.stale, isTrue);
      expect(geo.fixes, 1);
    });

    test('on timeout with nothing recent: timeout; any other failure: error', () async {
      final geo = FakeGeo()..last = pos(13.7, 100.5, now.subtract(const Duration(hours: 2)));
      expect(((await device(geo).current()) as LocationUnavailable).reason, LocationFailure.timeout);
      geo
        ..last = null
        ..error = Exception('plugin failed');
      expect(((await device(geo).current()) as LocationUnavailable).reason, LocationFailure.error);
      geo.error = const LocationServiceDisabledException();
      expect(((await device(geo).current()) as LocationUnavailable).reason, LocationFailure.serviceOff);
    });
  });
}

Position pos(double lat, double lng, DateTime at) => Position(
  latitude: lat,
  longitude: lng,
  timestamp: at,
  accuracy: 1000,
  altitude: 0,
  altitudeAccuracy: 0,
  heading: 0,
  headingAccuracy: 0,
  speed: 0,
  speedAccuracy: 0,
);

class FakeGeo extends GeolocatorPlatform {
  bool serviceOn = true;
  LocationPermission permission = LocationPermission.whileInUse;
  Position? last;

  /// Null means no fix in time.
  Position? fix;
  Exception? error;
  LocationSettings? settings;
  int requests = 0;
  int fixes = 0;

  @override
  Future<bool> isLocationServiceEnabled() async => serviceOn;

  @override
  Future<LocationPermission> checkPermission() async => permission;

  @override
  Future<LocationPermission> requestPermission() async {
    requests++;
    return permission;
  }

  @override
  Future<Position?> getLastKnownPosition({bool forceLocationManager = false}) async => last;

  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) async {
    fixes++;
    settings = locationSettings;
    if (error != null) throw error!;
    return fix ?? (throw TimeoutException('no fix', locationSettings?.timeLimit));
  }
}
