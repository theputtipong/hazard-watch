import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/screens/home_screen.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';
import 'package:hazardwatch/widgets/alert_card.dart';
import 'package:hazardwatch/widgets/nasa_card.dart';
import 'package:hazardwatch/widgets/reading_tile.dart';
import 'package:hazardwatch/widgets/severity.dart';
import 'package:hazardwatch/widgets/source_link.dart';

import 'support.dart';

/// Every tab stays built (IndexedStack), so name the home tab's list.
final _homeList = find.descendant(of: find.byType(HomeScreen), matching: find.byType(Scrollable)).first;

void main() {
  test('the ingest contract fixture parses', () {
    final r = AreaReport.fromJson(fixtureJson());
    expect(r.district.name.th, 'พระนคร');
    expect(r.level, HwLevel.warning);
    expect(r.calm, isFalse);
    expect(r.alerts.map((a) => a.kind), ['flood', 'pm25']);
    expect(r.pm25!.value, 48.2);
    expect(r.rivers, hasLength(2));
    expect(r.flood!.flooded, 1);
    expect(r.feeds.firstWhere((f) => f.topic == 'radar').state, FeedState.down);
  });

  testWidgets(
    'home shows district, alerts heaviest first, readings and data freshness',
    (tester) async {
      await pumpApp(tester);
      expect(find.text('พระนคร'), findsOneWidget);
      expect(find.text('กรุงเทพมหานคร'), findsOneWidget);

      final titles = tester.widgetList<AlertCard>(find.byType(AlertCard)).map((a) => a.title).toList();
      expect(titles, ['ระวังมาก: น้ำท่วมบนถนนที่พระนคร', 'ระวังมาก: ฝุ่นเยอะที่พระนคร']);
      final credits = find.descendant(of: find.byType(AlertCard), matching: find.byType(SourceLink));
      expect(tester.widgetList<SourceLink>(credits).map((s) => s.label), ['กทม.', 'กรมควบคุมมลพิษ']);
      // Something is at caution or above, so the calm message must not show.
      expect(find.text('แถวนี้ตอนนี้ปกติดี'), findsNothing);

      await tester.scrollUntilVisible(find.text('น้ำในคลองและแม่น้ำ'), 300, scrollable: _homeList);
      expect(find.byType(ReadingTile), findsNWidgets(4)); // PM2.5, rain, street flooding, quake
      expect(find.text('48.2'), findsOneWidget);
      expect(find.text('ฝุ่นเยอะ ถ้าออกนอกบ้านควรใส่หน้ากาก'), findsOneWidget);
      // Clock text is in the device's time zone; CI runs in UTC.
      expect(
        tester.widgetList<SourceText>(find.byType(SourceText)).map((s) => s.text),
        contains(matches(RegExp(r'^ข้อมูลจาก กรมควบคุมมลพิษ · \d\d:\d\d\u00a0น\. · 0\.2 กม\.$'))),
      );
      // Play policy: every credited source is a link to its original page.
      final pcd = tester.widget<SourceLink>(find.widgetWithText(SourceLink, 'กรมควบคุมมลพิษ'));
      expect(pcd.url, 'https://air4thai.pcd.go.th');
      expect(tester.getSize(find.byWidget(pcd)).height, greaterThanOrEqualTo(HwSize.touchTarget));
      expect(find.text('น้ำสูง ยังไม่ล้น · 86%'), findsOneWidget);

      await tester.scrollUntilVisible(find.text('เรดาร์ฝน'), 300, scrollable: _homeList);
      expect(find.textContaining('แหล่งข้อมูลมีปัญหา ตั้งแต่'), findsOneWidget); // radar is down
    },
    variant: const TargetPlatformVariant({TargetPlatform.android}),
  );

  testWidgets('a calm district shows the all-clear box and no alert cards', (tester) async {
    final calm = fixtureJson()
      ..['severity'] = 'ok'
      ..['calm'] = true
      ..['alerts'] = <Object>[];
    await pumpApp(tester, api: FakeApi(report: calm));
    expect(find.text('แถวนี้ตอนนี้ปกติดี'), findsOneWidget);
    expect(find.byType(AlertCard), findsNothing);
  });

  testWidgets('no alerts but a high reading nearby: no all-clear message', (tester) async {
    final notCalm = fixtureJson()
      ..['severity'] = 'ok'
      ..['calm'] = false
      ..['alerts'] = <Object>[];
    await pumpApp(tester, api: FakeApi(report: notCalm));
    expect(find.text('แถวนี้ตอนนี้ปกติดี'), findsNothing);
    expect(find.byType(AlertCard), findsNothing);
  });

  testWidgets('offline keeps the last report and says how old it is', (tester) async {
    final api = FakeApi();
    await pumpApp(tester, api: api);
    api.error = OfflineException();
    await tester.drag(_homeList, const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(api.areaCalls, 2);
    expect(find.textContaining('ไม่มีอินเทอร์เน็ต กำลังแสดงข้อมูลเมื่อ'), findsOneWidget);
    expect(find.byType(AlertCard), findsNWidgets(2));
  });

  testWidgets('an API without /v1/area says so instead of a blank screen', (tester) async {
    await pumpApp(tester, api: FakeApi(error: NotSupportedException()));
    expect(find.text('เซิร์ฟเวอร์ยังไม่รองรับแอปเวอร์ชันนี้'), findsOneWidget);
    expect(find.text('ลองใหม่'), findsOneWidget);
  });

  testWidgets('first run: pick a district by location, explained before asking', (tester) async {
    final api = FakeApi();
    final location = FakeLocation(LocationFound(13.755, 100.5));
    final settings = await pumpApp(tester, api: api, location: location, withDistrict: false);
    await tester.tap(find.text('เลือกพื้นที่'));
    await tester.pumpAndSettle();
    expect(find.text('ใช้ตำแหน่งเพื่อหาว่าคุณอยู่เขตไหนเท่านั้น ไม่มีการเก็บไว้'), findsOneWidget);
    expect(location.calls, 0);
    await tester.tap(find.text('ใช้ตำแหน่งของฉัน'));
    await tester.pumpAndSettle();
    expect(location.calls, 1);
    expect(api.lastQuery, (districtId: 'TH1001', lat: null, lng: null)); // resolved, then loaded by id
    expect(settings.district?.id, 'TH1001');
    expect(find.byType(AlertCard), findsNWidgets(2));
  });

  testWidgets('outside coverage or no permission falls back to the list', (tester) async {
    final api = FakeApi(error: OutsideCoverageException());
    await pumpApp(tester, api: api, location: FakeLocation(LocationFound(18.79, 98.98)), withDistrict: false);
    await tester.tap(find.text('เลือกพื้นที่'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ใช้ตำแหน่งของฉัน'));
    await tester.pumpAndSettle();
    expect(find.textContaining('นอกพื้นที่ที่เรามีข้อมูล'), findsOneWidget);
    api.error = null;
    await tester.tap(find.text('กรุงเทพมหานคร'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('จตุจักร'));
    await tester.pumpAndSettle();
    expect(find.text('จตุจักร'), findsOneWidget); // home header
  });

  testWidgets('four tabs with labels always shown', (tester) async {
    await pumpApp(tester);
    for (final label in ['หน้าแรก', 'แผนที่', 'แจ้งเตือน', 'ตั้งค่า']) {
      expect(find.text(label), findsOneWidget);
    }
    await tester.tap(find.text('ตั้งค่า'));
    await tester.pumpAndSettle();
    expect(find.text('เขตที่ติดตาม'), findsOneWidget);
    await tester.tap(find.text('มืด'));
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('เขตที่ติดตาม'))).brightness, Brightness.dark);
  });

  group('NASA card', () {
    Future<void> showNasa(WidgetTester tester) =>
        tester.scrollUntilVisible(find.text('ไฟและพายุจากดาวเทียม NASA'), 300, scrollable: _homeList);

    testWidgets('fires within 25 km and storms with distance, credited to NASA, no severity', (tester) async {
      await pumpApp(tester);
      await showNasa(tester);
      expect(find.text('พบจุดความร้อน 2 จุดในระยะ 25 กม. ช่วง 24 ชม.'), findsOneWidget);
      expect(find.text('จุดที่ใกล้ที่สุดห่าง 2.4 กม.'), findsOneWidget);
      expect(find.textContaining('Typhoon Test'), findsOneWidget);
      expect(find.text('ห่าง 367 กม.'), findsOneWidget);
      expect(find.textContaining('ไม่ใช่ประกาศเตือนภัยทางการ'), findsOneWidget);
      final card = find.byType(NasaCard);
      final credit = tester.widget<SourceText>(find.descendant(of: card, matching: find.byType(SourceText)));
      expect(credit.text, startsWith('Fires: NASA FIRMS (LANCE/ESDIS) · Events: NASA EONET'));
      final links = tester.widgetList<SourceLink>(find.descendant(of: card, matching: find.byType(SourceLink)));
      expect(links.map((s) => s.url), ['https://firms.modaps.eosdis.nasa.gov', 'https://eonet.gsfc.nasa.gov']);
      // Display only: never an alert card, never a severity pill.
      expect(find.descendant(of: card, matching: find.byType(AlertCard)), findsNothing);
      expect(find.descendant(of: card, matching: find.byType(SeverityBadge)), findsNothing);
      expect(find.descendant(of: card, matching: find.byType(SeverityMeter)), findsNothing);
    });

    testWidgets('hidden when the report has no NASA data', (tester) async {
      await pumpApp(tester, api: FakeApi(report: fixtureJson()..['nasa'] = null));
      await tester.scrollUntilVisible(find.text('ข้อมูลอัปเดตล่าสุดเมื่อไหร่'), 300, scrollable: _homeList);
      expect(find.byType(NasaCard), findsNothing);
      expect(find.text('ไฟและพายุจากดาวเทียม NASA'), findsNothing);
    });

    testWidgets('nothing near: one calm line, no disclaimer', (tester) async {
      final quiet = fixtureJson()
        ..['nasa'] = {
          'fires': {'count': 0, 'nearestKm': null, 'radiusKm': 25},
          'events': <Object>[],
        };
      await pumpApp(tester, api: FakeApi(report: quiet));
      await showNasa(tester);
      expect(find.text('ไม่พบจุดความร้อนใกล้คุณในช่วง 24 ชม.'), findsOneWidget);
      expect(find.textContaining('ไม่ใช่ประกาศเตือนภัยทางการ'), findsNothing);
      expect(find.textContaining('ห่าง'), findsNothing);
    });
  });

  testWidgets('outside Bangkok: far BMA rain and river gauges are left out, province shown', (tester) async {
    final j = fixtureJson();
    (j['district'] as Map<String, dynamic>)
      ..['id'] = 'TH5001'
      ..['name'] = {'th': 'เมืองเชียงใหม่', 'en': 'Mueang Chiang Mai'}
      ..['province'] = {'th': 'เชียงใหม่', 'en': 'Chiang Mai'};
    j
      ..['severity'] = 'ok'
      ..['calm'] = false
      ..['alerts'] = <Object>[]
      ..['flood'] = null
      ..['quake'] = null;
    (j['readings'] as Map<String, dynamic>)['rain'] = {
      ...(j['readings'] as Map<String, dynamic>)['rain'] as Map<String, dynamic>,
      'km': 580.2,
    };
    (j['readings'] as Map<String, dynamic>)['pm25'] = {
      ...(j['readings'] as Map<String, dynamic>)['pm25'] as Map<String, dynamic>,
      'severity': 'ok',
    };
    j['rivers'] = [
      for (final r in j['rivers'] as List) {...r as Map<String, dynamic>, 'km': 300},
    ];
    await pumpApp(tester, api: FakeApi(report: j));
    expect(find.text('เชียงใหม่'), findsOneWidget);
    expect(find.byType(ReadingTile), findsOneWidget); // PM2.5 only
    expect(find.text('น้ำในคลองและแม่น้ำ'), findsNothing);
    // The server counted the far rain gauge; what is shown is all normal.
    expect(find.text('แถวนี้ตอนนี้ปกติดี'), findsOneWidget);
  });
}
