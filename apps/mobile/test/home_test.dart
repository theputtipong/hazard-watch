import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/screens/home_screen.dart';
import 'package:hazardwatch/screens/sources_screen.dart';
import 'package:hazardwatch/sources_meta.g.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';
import 'package:hazardwatch/widgets/alert_card.dart';
import 'package:hazardwatch/widgets/dam_card.dart';
import 'package:hazardwatch/widgets/feed_status.dart';
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
      // Value and unit are one paragraph (the unit wraps under it on a narrow phone).
      expect(find.textContaining(RegExp('^48\\.2\uFFFC')), findsOneWidget);
      expect(find.text('ฝุ่นเยอะ ถ้าออกนอกบ้านควรใส่หน้ากาก'), findsOneWidget);
      // Clock text is in the device's time zone; CI runs in UTC.
      expect(
        tester.widgetList<SourceText>(find.byType(SourceText)).map((s) => s.text),
        contains(matches(RegExp(r'^ข้อมูลจาก กรมควบคุมมลพิษ · \d\d:\d\d\u00a0น\. · 0\.2 กม\.$'))),
      );
      // Play policy: every credited source is a link to its original page.
      final pcd = tester.widget<SourceLink>(find.widgetWithText(SourceLink, 'กรมควบคุมมลพิษ').first);
      expect(pcd.url, 'https://air4thai.pcd.go.th');
      expect(tester.getSize(find.byWidget(pcd)).height, greaterThanOrEqualTo(HwSize.touchTarget));
      expect(find.text('น้ำสูง ยังไม่ล้น · 86%'), findsOneWidget);

      // The app shows no radar, so its feed (down in the fixture) is not listed: every feed named links its source.
      await tester.scrollUntilVisible(find.byType(NotGovernmentNote), 300, scrollable: _homeList);
      expect(find.text('เรดาร์ฝน'), findsNothing);
      expect(find.textContaining('แหล่งข้อมูลมีปัญหา ตั้งแต่'), findsNothing);
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
      expect(find.textContaining('ไม่ใช่ประกาศเตือนภัยของหน่วยงานใด'), findsOneWidget);
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
      expect(find.textContaining('ไม่ใช่ประกาศเตือนภัยของหน่วยงานใด'), findsNothing);
      expect(find.textContaining('ห่าง'), findsNothing);
    });
  });

  group('not a government app', () {
    final banner = find.byKey(const ValueKey('home-not-gov'));
    const notGov = 'HazardWatch เป็นแอปอิสระ ไม่ใช่แอปของรัฐ';

    testWidgets('says so at the top of Home, on screen without scrolling, with a link to the sources page', (
      tester,
    ) async {
      await pumpApp(tester);
      expect(banner, findsOneWidget);
      expect(find.descendant(of: banner, matching: find.textContaining(notGov)), findsOneWidget);
      // Above the first alert and inside the first screen.
      expect(tester.getTopLeft(banner).dy, lessThan(tester.getTopLeft(find.byType(AlertCard).first).dy));
      final screen = tester.view.physicalSize / tester.view.devicePixelRatio;
      expect(tester.getBottomLeft(banner).dy, lessThan(screen.height));
      // The longer note stays at the bottom.
      await tester.scrollUntilVisible(find.byType(NotGovernmentNote), 300, scrollable: _homeList);
      expect(find.byType(NotGovernmentNote), findsOneWidget);
      await tester.scrollUntilVisible(banner, -300, scrollable: _homeList);
      await tester.tap(find.descendant(of: banner, matching: find.widgetWithText(TextButton, 'แหล่งข้อมูล')));
      await tester.pumpAndSettle();
      expect(find.byType(SourcesScreen), findsOneWidget);
    });

    testWidgets('also before a district is picked, in English too', (tester) async {
      await pumpApp(tester, withDistrict: false, lang: 'en');
      expect(find.descendant(of: banner, matching: find.textContaining('It is not a government app')), findsOneWidget);
      expect(find.descendant(of: banner, matching: find.widgetWithText(TextButton, 'Data sources')), findsOneWidget);
    });

    testWidgets('data freshness is one card of small tiles, two to a row', (tester) async {
      await pumpApp(tester);
      final card = find.byKey(const ValueKey('feeds-card'));
      await tester.scrollUntilVisible(card, 300, scrollable: _homeList);
      expect(find.descendant(of: card, matching: find.text('ข้อมูลอัปเดตล่าสุดเมื่อไหร่')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.byType(FeedStatusRow)), findsNWidgets(8));
      expect(find.descendant(of: card, matching: find.byKey(const ValueKey('feeds-sources'))), findsOneWidget);
      final flood = tester.getRect(find.byKey(const ValueKey('feed-tile:flood')));
      final rain = tester.getRect(find.byKey(const ValueKey('feed-tile:rain')));
      final water = tester.getRect(find.byKey(const ValueKey('feed-tile:waterlevel')));
      // Side by side, then the next row.
      expect(rain.top, flood.top);
      expect(rain.left, greaterThan(flood.right));
      expect(water.top, greaterThan(flood.bottom));
      expect(flood.width, lessThan(tester.getRect(card).width / 2));
    });

    testWidgets('each freshness tile is at most three lines: name, age, links; longer text is cut with …', (
      tester,
    ) async {
      final j = fixtureJson();
      // The quakes tile's age as long as a failing feed's note gets, in English (longer words).
      for (final f in (j['feeds'] as List).cast<Map<String, dynamic>>()) {
        if (f['topic'] == 'quakes') {
          f['state'] = 'down';
          f['failingSince'] = j['generatedAt'];
        }
      }
      await pumpApp(
        tester,
        api: FakeApi(report: j),
        lang: 'en',
      );
      final card = find.byKey(const ValueKey('feeds-card'));
      await tester.scrollUntilVisible(card, 300, scrollable: _homeList);
      final heights = {
        for (final topic in ['flood', 'quakes', 'dams'])
          topic: tester.getSize(find.byKey(ValueKey('feed-tile:$topic'))).height,
      };
      // Two links (quakes, dams) or a long failing note never make a tile taller than a one-link tile.
      expect(heights.values.toSet(), hasLength(1), reason: '$heights');
      for (final t in tester.widgetList<Text>(find.descendant(of: card, matching: find.byType(Text)))) {
        if (find
            .descendant(of: find.byKey(const ValueKey('feeds-sources')), matching: find.byWidget(t))
            .evaluate()
            .isNotEmpty) {
          continue;
        }
        if (t.data == 'When the data last updated' || t.data == ', ') continue; // the card title, a link separator
        expect((t.maxLines, t.overflow), (1, TextOverflow.ellipsis), reason: t.data);
      }
      // The full wording stays for screen readers.
      final quakes = tester.widget<FeedStatusRow>(
        find.descendant(of: find.byKey(const ValueKey('feed-tile:quakes')), matching: find.byType(FeedStatusRow)),
      );
      expect(tester.getSemantics(find.byWidget(quakes)).label, '${quakes.name}, ${quakes.age}');
    });

    testWidgets('the data freshness list links every source behind its feeds', (tester) async {
      await pumpApp(tester);
      final link = find.byKey(const ValueKey('feeds-sources'));
      await tester.scrollUntilVisible(link, 300, scrollable: _homeList);
      expect(find.descendant(of: link, matching: find.text('แหล่งข้อมูลทั้งหมด')), findsOneWidget);
      // Right after the last feed row.
      expect(tester.getTopLeft(link).dy, greaterThan(tester.getTopLeft(find.byType(FeedStatusRow).last).dy));
      // The card is one list item: built before it is on screen.
      await tester.ensureVisible(link);
      await tester.pumpAndSettle();
      await tester.tap(link);
      await tester.pumpAndSettle();
      expect(find.byType(SourcesScreen), findsOneWidget);
    });

    testWidgets('each feed row links its own agency and site; radar, which the app does not show, is left out', (
      tester,
    ) async {
      final j = fixtureJson();
      // A failing feed still names and links its source.
      for (final f in (j['feeds'] as List).cast<Map<String, dynamic>>()) {
        if (f['topic'] == 'quakes') {
          f['state'] = 'down';
          f['failingSince'] = j['generatedAt'];
        }
      }
      await pumpApp(tester, api: FakeApi(report: j));
      await tester.scrollUntilVisible(find.text('ข้อมูลอัปเดตล่าสุดเมื่อไหร่'), 300, scrollable: _homeList);
      final names = <String>{};
      Future<List<(String, String)>> linksOf(String topic) async {
        final row = find.byKey(ValueKey('feed-sources:$topic'));
        // Small steps: the one-line rows are short, and a big step skips a feed's name row before it is ever built.
        await tester.scrollUntilVisible(row, 50, scrollable: _homeList);
        names.addAll(tester.widgetList<FeedStatusRow>(find.byType(FeedStatusRow)).map((r) => r.name));
        return [
          for (final link in tester.widgetList<SourceLink>(find.descendant(of: row, matching: find.byType(SourceLink))))
            (link.label, link.url),
        ];
      }

      expect(await linksOf('flood'), [('ข้อมูลจาก กทม.', 'https://weather.bangkok.go.th/flood')]);
      expect(await linksOf('rain'), [('ข้อมูลจาก กทม.', 'https://weather.bangkok.go.th/rain')]);
      expect(await linksOf('waterlevel'), [('ข้อมูลจาก ThaiWater', 'https://www.thaiwater.net')]);
      expect(await linksOf('pm25'), [('ข้อมูลจาก กรมควบคุมมลพิษ', 'https://air4thai.pcd.go.th')]);
      expect(await linksOf('quakes'), [
        ('ข้อมูลจาก กรมอุตุฯ', 'https://earthquake.tmd.go.th'),
        ('USGS', 'https://earthquake.usgs.gov'),
      ]);
      expect(find.textContaining('แหล่งข้อมูลมีปัญหา ตั้งแต่'), findsOneWidget); // the quakes feed is down
      expect(await linksOf('fires'), [('ข้อมูลจาก NASA FIRMS', 'https://firms.modaps.eosdis.nasa.gov')]);
      expect(await linksOf('events'), [('ข้อมูลจาก NASA EONET', 'https://eonet.gsfc.nasa.gov')]);
      expect(await linksOf('dams'), [
        ('ข้อมูลจาก ThaiWater', 'https://www.thaiwater.net'),
        ('กรมชลประทาน', 'https://app.rid.go.th/reservoir'),
      ]);
      await tester.scrollUntilVisible(find.byType(NotGovernmentNote), 300, scrollable: _homeList);
      expect(find.byKey(const ValueKey('feed-sources:radar')), findsNothing);
      expect(names, isNot(contains('เรดาร์ฝน')));
      expect(names, hasLength((j['feeds'] as List).length - 1));
      // Each link a full touch target.
      await tester.scrollUntilVisible(find.byKey(const ValueKey('feed-sources:pm25')), -100, scrollable: _homeList);
      for (final link in tester.widgetList<SourceLink>(
        find.descendant(of: find.byKey(const ValueKey('feed-sources:pm25')), matching: find.byType(SourceLink)),
      )) {
        expect(tester.getSize(find.byWidget(link)).height, greaterThanOrEqualTo(HwSize.touchTarget));
      }

      final opened = <Uri>[];
      final realLaunchLink = launchLink;
      launchLink = (uri) async {
        opened.add(uri);
        return true;
      };
      addTearDown(() => launchLink = realLaunchLink);
      final rain = find.descendant(
        of: find.byKey(const ValueKey('feed-sources:rain')),
        matching: find.byType(SourceLink),
      );
      await tester.scrollUntilVisible(rain, -100, scrollable: _homeList);
      // The card is one list item: built before it is on screen.
      await tester.ensureVisible(rain);
      await tester.pumpAndSettle();
      await tester.tap(rain);
      await tester.pumpAndSettle();
      expect(opened, [Uri.parse('https://weather.bangkok.go.th/rain')]);
    });

    test('feed topics map to the sources the app links; radar has none', () {
      for (final topic in ['flood', 'rain', 'waterlevel', 'pm25', 'quakes', 'fires', 'events', 'dams']) {
        expect(feedSourceIds(topic), isNotEmpty, reason: topic);
        for (final id in feedSourceIds(topic)) {
          expect(sourceUrl(id), startsWith('https://'), reason: id);
        }
      }
      expect(feedSourceIds('radar'), isEmpty);
    });
  });

  group('dam card', () {
    final card = find.byKey(const ValueKey('dam-card'));
    Future<void> showDams(WidgetTester tester) =>
        tester.scrollUntilVisible(find.text('เขื่อนและอ่างเก็บน้ำ'), 300, scrollable: _homeList);

    testWidgets('after the rivers card: each dam with status in words, storage, flows, day and source links', (
      tester,
    ) async {
      await pumpApp(tester);
      await showDams(tester);
      expect(card, findsOneWidget);
      // Below the river gauges.
      expect(tester.getTopLeft(card).dy, greaterThan(tester.getTopLeft(find.text('น้ำในคลองและแม่น้ำ')).dy));
      await tester.scrollUntilVisible(find.byType(DamCredit), 200, scrollable: _homeList);
      Finder inCard(String text) => find.descendant(of: card, matching: find.text(text));
      expect(inCard('ข้อมูลประกอบ ไม่ใช่การแจ้งเตือน'), findsOneWidget);
      expect(inCard('เขื่อน m1'), findsOneWidget);
      expect(inCard('น้ำน้อยวิกฤต · 35%'), findsOneWidget);
      expect(inCard('อ่างเก็บน้ำขนาดกลาง · 35 กม. · ลุ่มน้ำบางปะกง'), findsOneWidget);
      expect(inCard('เกินความจุ · 105.2%'), findsOneWidget);
      expect(inCard('เขื่อนขนาดใหญ่ · 138 กม. · ลุ่มน้ำป่าสัก'), findsOneWidget);
      expect(inCard('น้ำใช้การได้ 55.1% · 600.5 / 960.8 ล้าน ลบ.ม.'), findsOneWidget);
      expect(inCard('ไหลเข้า 4.2 · ระบาย 1.5 ล้าน ลบ.ม./วัน'), findsOneWidget);
      // No flow figures for m1, so no flow line: only pasak's.
      expect(find.descendant(of: card, matching: find.textContaining('ไหลเข้า')), findsOneWidget);
      // Daily data: the day in Thai time, never a clock time.
      expect(inCard('ข้อมูลวันที่ 5 ต.ค.'), findsNWidgets(2));
      // Status colour: over is the danger text tone, critical stays ink (display only, words carry it).
      final c = tester.element(card).hw;
      Color colour(String id) => tester.widget<Text>(find.byKey(ValueKey('dam-status:$id'))).style!.color!;
      expect(colour('thaiwater-dam:large:pasak'), c.sevDangerInk);
      expect(colour('thaiwater-dam:medium:m1'), c.ink);
      // Play policy: the credit links both agencies behind the dam data, ThaiWater and the Royal Irrigation Department.
      final links = tester.widgetList<SourceLink>(find.descendant(of: card, matching: find.byType(SourceLink)));
      expect(links.map((s) => s.url), ['https://www.thaiwater.net', 'https://app.rid.go.th/reservoir']);
      expect(links.map((s) => s.label), ['ThaiWater', 'กรมชลประทาน']);
      for (final link in links) {
        expect(tester.getSize(find.byWidget(link)).height, greaterThanOrEqualTo(HwSize.touchTarget));
      }
      // Display only: no alert card or severity pill.
      expect(find.descendant(of: card, matching: find.byType(AlertCard)), findsNothing);
      expect(find.descendant(of: card, matching: find.byType(SeverityBadge)), findsNothing);
    });

    testWidgets('a stale dam says when its last report was', (tester) async {
      final j = fixtureJson();
      ((j['dams'] as List).last as Map<String, dynamic>)['stale'] = true;
      await pumpApp(tester, api: FakeApi(report: j));
      await showDams(tester);
      await tester.scrollUntilVisible(find.byType(DamCredit), 200, scrollable: _homeList);
      expect(find.descendant(of: card, matching: find.text('ยังไม่มีค่าใหม่ ค่าล่าสุดเมื่อ 5 ต.ค.')), findsOneWidget);
      expect(find.descendant(of: card, matching: find.text('ข้อมูลวันที่ 5 ต.ค.')), findsOneWidget);
    });

    testWidgets('at most three dams', (tester) async {
      final j = fixtureJson();
      final one = (j['dams'] as List).first as Map<String, dynamic>;
      j['dams'] = [
        for (var i = 0; i < 5; i++) {...one, 'id': 'thaiwater-dam:medium:$i'},
      ];
      await pumpApp(tester, api: FakeApi(report: j));
      await showDams(tester);
      expect(find.descendant(of: card, matching: find.byType(DamRow)), findsNWidgets(3));
    });

    for (final (why, dams) in [('empty', <Object>[]), ('missing', null)]) {
      testWidgets('hidden when dams are $why', (tester) async {
        final j = fixtureJson();
        if (dams == null) {
          j.remove('dams');
        } else {
          j['dams'] = dams;
        }
        await pumpApp(tester, api: FakeApi(report: j));
        await tester.scrollUntilVisible(find.text('ข้อมูลอัปเดตล่าสุดเมื่อไหร่'), 300, scrollable: _homeList);
        expect(card, findsNothing);
        expect(find.byType(DamRow), findsNothing);
      });
    }

    testWidgets('the dams feed has a name in the freshness list', (tester) async {
      final j = fixtureJson();
      if (!(j['feeds'] as List).any((f) => (f as Map)['topic'] == 'dams')) {
        (j['feeds'] as List).add({
          'topic': 'dams',
          'state': 'live',
          'lastOkAt': j['generatedAt'],
          'failingSince': null,
        });
      }
      await pumpApp(tester, api: FakeApi(report: j));
      await tester.scrollUntilVisible(find.text('ข้อมูลอัปเดตล่าสุดเมื่อไหร่'), 300, scrollable: _homeList);
      await tester.scrollUntilVisible(find.byType(NotGovernmentNote), 300, scrollable: _homeList);
      final names = tester.widgetList<FeedStatusRow>(find.byType(FeedStatusRow)).map((r) => r.name);
      expect(names, contains('เขื่อนและอ่างเก็บน้ำ'));
      expect(names, isNot(contains('dams')));
    });
  });

  for (final width in [360.0, 400.0]) {
    testWidgets('nothing on Home overflows a ${width.round()}dp phone, top to bottom', (tester) async {
      tester.view.physicalSize = Size(width, 800) * tester.view.devicePixelRatio;
      addTearDown(tester.view.resetPhysicalSize);
      await pumpApp(tester);
      await tester.scrollUntilVisible(find.byType(NotGovernmentNote), 200, scrollable: _homeList);
      expect(tester.takeException(), isNull);
    });
  }

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
