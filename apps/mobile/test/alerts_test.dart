import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/alerts/alert_check.dart';
import 'package:hazardwatch/alerts/area_alerts.dart';
import 'package:hazardwatch/alerts/notify_rules.dart';
import 'package:hazardwatch/alerts/phone_notifications.dart';
import 'package:hazardwatch/api/hazard_api.dart';
import 'package:hazardwatch/api/models.dart';
import 'package:hazardwatch/bma/bma_parse.dart';
import 'package:hazardwatch/bma/device_bma.dart';
import 'package:hazardwatch/bma/rules.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/screens/alerts_screen.dart';
import 'package:hazardwatch/screens/home_screen.dart' show NotGovernmentBanner;
import 'package:hazardwatch/screens/settings_screen.dart';
import 'package:hazardwatch/screens/sources_screen.dart';
import 'package:hazardwatch/settings.dart';
import 'package:hazardwatch/theme/hw_theme.dart';
import 'package:hazardwatch/widgets/alert_card.dart';
import 'package:hazardwatch/widgets/source_link.dart';

import 'support.dart';

final t0 = DateTime.utc(2026, 10, 5, 10);

/// Every tab stays built (IndexedStack), so name the alerts tab's list.
final _alertsList = find.descendant(of: find.byType(AlertsScreen), matching: find.byType(Scrollable)).first;

HazardAlert alert(String key, HwLevel level, {String kind = 'flood'}) => HazardAlert(
  key: key,
  kind: kind,
  level: level,
  title: LocalizedText(key, key),
  body: const LocalizedText('', ''),
  at: t0,
);

/// Runs [decideNotifications] over a sequence of polls and returns the keys sent at each.
List<List<String>> polls(List<(Duration, List<HazardAlert>)> steps) {
  var state = const NotifyState();
  final out = <List<String>>[];
  for (final (after, current) in steps) {
    final d = decideNotifications(current: current, last: state, now: t0.add(after));
    out.add([for (final a in d.send) '${a.key}@${a.level.name}']);
    state = NotifyState.parse(d.next.toJson());
  }
  return out;
}

const m15 = Duration(minutes: 15);

Map<String, dynamic> withFeedsDown(Map<String, dynamic> j) {
  for (final f in j['feeds'] as List) {
    final feed = f as Map<String, dynamic>;
    if (feed['topic'] == 'flood' || feed['topic'] == 'rain') {
      feed['state'] = 'down';
      feed['lastOkAt'] = null;
    }
  }
  return j;
}

BmaObservation obs(String id, String severity, double value, DateTime at) => BmaObservation(
  id: id,
  name: LocalizedText(id, id),
  // Phra Nakhon's centre, inside TH1001.
  lat: 13.75565,
  lng: 100.49867,
  observedAt: at,
  value: value,
  severity: severity,
  offline: false,
);

class RecordingNotifier implements AlertNotifier {
  final shown = <String>[];

  @override
  Future<void> show(HazardAlert alert, Locale locale) async => shown.add(alert.title.of(locale));
}

class MemoryStore implements BmaStore {
  final values = <String, String>{};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;
}

class FakePhoneNotifications implements PhoneNotifications {
  FakePhoneNotifications({this.grant = true});

  bool grant;
  bool running = false;

  @override
  Future<bool> requestPermission() async => grant;

  @override
  Future<void> start() async => running = true;

  @override
  Future<void> stop() async => running = false;
}

void main() {
  // If this fails, packages/core/src/config.ts changed: update CoreConfig in lib/bma/rules.dart to match.
  test('push and quake values match DEFAULT_CONFIG in packages/core/src/config.ts', () {
    final src = File('../../packages/core/src/config.ts').readAsStringSync();
    final defaults = src.substring(src.indexOf('export const DEFAULT_CONFIG'));
    double value(String key) => double.parse(RegExp('\\b$key: ([\\d.]+)').firstMatch(defaults)!.group(1)!);
    List<double> list(String key) => [
      for (final n in RegExp('\\b$key: \\[([^\\]]*)\\]').firstMatch(defaults)!.group(1)!.split(','))
        double.parse(n.trim()),
    ];

    expect(CoreConfig.pm25PushAt, value('pushAt'));
    expect(CoreConfig.pm25PushAt, value('watch'), reason: 'pm25 notifications assume pushAt starts the warning band');
    expect(CoreConfig.pushCooldownHours, value('cooldownHours'));
    expect(CoreConfig.quakeMinMagnitudeChoices, list('minMagnitude'));
    expect(CoreConfig.quakeMaxDistanceKmChoices.map((n) => n.toDouble()), list('maxDistanceKm'));

    final lookback = RegExp(r'lookbackHours: 24 \* (\d+)').firstMatch(defaults)!.group(1)!;
    expect(CoreConfig.quakeLookbackHours, 24 * int.parse(lookback));
    final tiers = RegExp(r'minMagnitude: ([\d.]+), maxDistanceKm: (\d+)').allMatches(defaults);
    expect(
      CoreConfig.quakeFloorMinMagnitude,
      tiers.map((m) => double.parse(m.group(1)!)).reduce((a, b) => a < b ? a : b),
    );
    expect(
      CoreConfig.quakeFloorMaxDistanceKm,
      tiers.map((m) => int.parse(m.group(2)!)).reduce((a, b) => a > b ? a : b),
    );
  });

  group('decideNotifications', () {
    test('sends a new alert once, then only when its level rises', () {
      expect(
        polls([
          (Duration.zero, [alert('flood:A', HwLevel.warning)]),
          (m15, [alert('flood:A', HwLevel.warning)]),
          (m15 * 2, [alert('flood:A', HwLevel.danger)]),
          (m15 * 3, [alert('flood:A', HwLevel.danger)]),
        ]),
        [
          ['flood:A@warning'],
          <String>[],
          ['flood:A@danger'],
          <String>[],
        ],
      );
    });

    test('a level that dips and comes back within the cooldown is not sent again', () {
      expect(
        polls([
          (Duration.zero, [alert('flood:A', HwLevel.danger)]),
          (m15, [alert('flood:A', HwLevel.warning)]),
          (m15 * 2, [alert('flood:A', HwLevel.danger)]),
        ]),
        [
          ['flood:A@danger'],
          <String>[],
          <String>[],
        ],
      );
    });

    test('after the cooldown a dip resets the level, so a rise is sent', () {
      expect(
        polls([
          (Duration.zero, [alert('flood:A', HwLevel.danger)]),
          (const Duration(hours: 2), [alert('flood:A', HwLevel.danger)]),
          (const Duration(hours: 3), [alert('flood:A', HwLevel.warning)]),
          (const Duration(hours: 3, minutes: 15), [alert('flood:A', HwLevel.danger)]),
        ]),
        [
          ['flood:A@danger'],
          <String>[],
          <String>[],
          ['flood:A@danger'],
        ],
      );
    });

    test('an alert that clears and returns is sent again only after the cooldown', () {
      final a = alert('rain:A', HwLevel.warning, kind: 'rain');
      expect(
        polls([
          (Duration.zero, [a]),
          (m15, []),
          (m15 * 2, [a]),
          (const Duration(hours: 1), []),
          (const Duration(hours: 4, minutes: 15), [a]),
        ]),
        [
          ['rain:A@warning'],
          <String>[],
          <String>[],
          <String>[],
          ['rain:A@warning'],
        ],
      );
    });

    test('an earthquake is sent once, even days later', () {
      final q = alert('quake:2026-10-05T08:00:00.000Z', HwLevel.watch, kind: 'quake');
      expect(
        polls([
          (Duration.zero, [q]),
          (const Duration(hours: 5), [q]),
          (const Duration(days: 3), []),
          (const Duration(days: 4), [q]),
        ]),
        [
          ['${q.key}@watch'],
          <String>[],
          <String>[],
          <String>[],
        ],
      );
    });

    test('PM2.5 is sent from the warning band (push.pm25.pushAt), most severe first', () {
      final d = decideNotifications(
        current: [
          alert('pm25:A', HwLevel.watch, kind: 'pm25'),
          alert('rain:A', HwLevel.warning, kind: 'rain'),
          alert('flood:A', HwLevel.danger),
        ],
        last: const NotifyState(),
        now: t0,
      );
      expect(d.send.map((a) => a.key), ['flood:A', 'rain:A']);
      final warn = decideNotifications(
        current: [alert('pm25:A', HwLevel.warning, kind: 'pm25')],
        last: const NotifyState(),
        now: t0,
      );
      expect(warn.send.map((a) => a.key), ['pm25:A']);
    });

    test('unreadable saved state starts fresh', () {
      expect(NotifyState.parse('{oops').byKey, isEmpty);
      expect(NotifyState.parse(null).byKey, isEmpty);
    });
  });

  group('areaAlerts', () {
    test('server alerts, most severe first, timed by the report', () {
      final r = AreaReport.fromJson(fixtureJson());
      final list = areaAlerts(r, now: fixtureNow);
      expect(list.map((a) => a.key), ['flood:TH1001', 'pm25:TH1001']);
      expect(list.first.at, r.updatedAt);
      expect(list.first.onDevice, isFalse);
    });

    test('a quake below the central tiers is added when inside the personal limit', () {
      final r = AreaReport.fromJson(fixtureJson());
      expect(personalQuake(r, QuakePrefs.standard), isNull);
      final q = personalQuake(r, const QuakePrefs(minMagnitude: 5, maxDistanceKm: 1000))!;
      expect(q.level, HwLevel.watch);
      expect(q.title.th, 'ระวัง: แผ่นดินไหวขนาด 5.1');
      expect(q.body.en, 'Mae Sai, Chiang Rai, 702 km away');
      expect(q.event, isTrue);
      expect(personalQuake(r, const QuakePrefs(minMagnitude: 5, maxDistanceKm: 500)), isNull);
      final list = areaAlerts(r, now: fixtureNow, quake: const QuakePrefs(minMagnitude: 5, maxDistanceKm: 1000));
      expect(list.map((a) => a.kind), ['flood', 'pm25', 'quake']);
    });

    test("flood comes from the phone's BMA copy when the server's feed is down", () {
      final r = AreaReport.fromJson(withFeedsDown(fixtureJson()));
      final copy = BmaCopy(
        fetchedAt: fixtureNow,
        items: [
          obs('a', 'danger', 34.6, fixtureNow),
          obs('b', 'warn', 12, fixtureNow),
          obs('c', 'watch', 3, fixtureNow),
        ],
      );
      final list = areaAlerts(r, flood: copy, now: fixtureNow);
      final flood = list.firstWhere((a) => a.kind == 'flood');
      expect(flood.onDevice, isTrue);
      expect(flood.level, HwLevel.danger);
      expect(flood.title.th, 'อันตราย: น้ำท่วมบนถนนที่พระนคร');
      expect(flood.body.th, 'น้ำท่วม 2 จุด ลึกสุด 35 ซม. ถ้าไม่จำเป็นให้เลี่ยงถนนแถวนั้น');
      expect(list.where((a) => a.kind == 'flood'), hasLength(1));
      expect(list.first.kind, 'flood');

      final calm = BmaCopy(fetchedAt: fixtureNow, items: [obs('c', 'watch', 3, fixtureNow)]);
      expect(areaAlerts(r, flood: calm, now: fixtureNow).where((a) => a.kind == 'flood'), isEmpty);
    });
  });

  group('checkAndNotify', () {
    Future<(AppSettings, FakeApi, RecordingNotifier, MemoryStore)> setUpCheck({bool notify = true}) async {
      final settings = AppSettings()
        ..district = fixtureDistrict()
        ..notify = notify
        ..locale = const Locale('en');
      return (settings, FakeApi(), RecordingNotifier(), MemoryStore());
    }

    test('notifies new alerts once and remembers them', () async {
      final (settings, api, notifier, store) = await setUpCheck();
      Future<int> run(DateTime now) =>
          checkAndNotify(settings: settings, api: api, notifier: notifier, store: store, now: now);
      expect(await run(fixtureNow), 2);
      expect(notifier.shown, ['Warning: street flooding in Phra Nakhon', 'Warning: high PM2.5 in Phra Nakhon']);
      expect(await run(fixtureNow.add(m15)), 0);

      settings.quake = const QuakePrefs(minMagnitude: 5, maxDistanceKm: 1000);
      expect(await run(fixtureNow.add(m15 * 2)), 1);
      expect(notifier.shown.last, 'Caution: magnitude 5.1 earthquake');
    });

    test('does nothing when turned off, and keeps state when offline', () async {
      final (settings, api, notifier, store) = await setUpCheck(notify: false);
      expect(await checkAndNotify(settings: settings, api: api, notifier: notifier, store: store, now: fixtureNow), 0);
      expect(api.areaCalls, 0);

      settings.notify = true;
      api.error = OfflineException();
      expect(await checkAndNotify(settings: settings, api: api, notifier: notifier, store: store, now: fixtureNow), 0);
      expect(store.values, isEmpty);
    });
  });

  test('notification ids are stable per alert key', () {
    expect(notificationId('flood:TH1001'), notificationId('flood:TH1001'));
    expect(notificationId('flood:TH1001'), isNot(notificationId('rain:TH1001')));
    expect(notificationId('flood:TH1001'), greaterThanOrEqualTo(0));
  });

  group('notification text', () {
    HazardAlert of(String kind) => HazardAlert(
      key: '$kind:x',
      kind: kind,
      level: HwLevel.warning,
      title: const LocalizedText('หัวเรื่อง', 'Title'),
      body: const LocalizedText('รายละเอียด', 'Details'),
      at: t0,
    );

    test('every alert credits its agency and site under the body', () {
      final th = {
        'quake':
            'ข้อมูลจาก กรมอุตุนิยมวิทยา · earthquake.tmd.go.th / สำนักสำรวจธรณีวิทยาสหรัฐฯ (USGS) · earthquake.usgs.gov',
        'flood': 'ข้อมูลจาก กรุงเทพมหานคร · weather.bangkok.go.th',
        'rain': 'ข้อมูลจาก กรุงเทพมหานคร · weather.bangkok.go.th',
        'water': 'ข้อมูลจาก สถาบันสารสนเทศทรัพยากรน้ำ (สสน.) · thaiwater.net',
        'pm25': 'ข้อมูลจาก กรมควบคุมมลพิษ · air4thai.pcd.go.th',
      };
      for (final MapEntry(key: kind, value: credit) in th.entries) {
        final n = alertNotificationText(of(kind), const Locale('th'));
        expect(n.title, 'หัวเรื่อง');
        expect(n.credit, credit, reason: kind);
        expect(n.body, 'รายละเอียด\n$credit', reason: kind);
      }
      final en = alertNotificationText(of('quake'), const Locale('en'));
      expect(
        en.body,
        'Details\nData from Thai Meteorological Department (TMD) · earthquake.tmd.go.th / '
        'U.S. Geological Survey (USGS) · earthquake.usgs.gov',
      );
    });

    test('a kind with no known source keeps the body as it is', () {
      final n = alertNotificationText(of('other'), const Locale('th'));
      expect(n.credit, isNull);
      expect(n.body, 'รายละเอียด');
    });
  });

  group('notification tap', () {
    int tab(WidgetTester tester) => tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex;

    testWidgets('opens the Alerts tab, from any page on top', (tester) async {
      await pumpApp(tester, lang: 'en');
      expect(tab(tester), 0);
      await tester.tap(find.widgetWithText(TextButton, 'Data sources').first);
      await tester.pumpAndSettle();
      expect(find.byType(SourcesScreen), findsOneWidget);

      onNotificationTap(alertsTabPayload);
      await tester.pumpAndSettle();
      expect(find.byType(SourcesScreen), findsNothing);
      expect(tab(tester), 2);
      expect(alertsTabRequest.pending, isFalse);
    });

    testWidgets('a tap that started the app opens it on the Alerts tab', (tester) async {
      onNotificationTap(alertsTabPayload);
      await pumpApp(tester, lang: 'en');
      expect(tab(tester), 2);
      expect(alertsTabRequest.pending, isFalse);
    });

    testWidgets('any other payload leaves the tab alone', (tester) async {
      await pumpApp(tester, lang: 'en');
      onNotificationTap(null);
      onNotificationTap('something-else');
      await tester.pumpAndSettle();
      expect(tab(tester), 0);
    });
  });

  testWidgets('alerts tab loads when shown, grouped by level, with times', (tester) async {
    final api = FakeApi();
    await pumpApp(tester, api: api, lang: 'en');
    final calls = api.areaCalls;
    expect(find.descendant(of: find.byType(AlertsScreen), matching: find.byType(AlertCard)), findsNothing);

    await tester.tap(find.text('Alerts'));
    await tester.pumpAndSettle();
    expect(api.areaCalls, calls + 1);
    final cards = find.descendant(of: find.byType(AlertsScreen), matching: find.byType(AlertCard));
    expect(tester.widgetList<AlertCard>(cards).map((c) => c.title), [
      'Warning: street flooding in Phra Nakhon',
      'Warning: high PM2.5 in Phra Nakhon',
    ]);
    // Play policy: each alert credits its source, linked to the original page.
    final credits = find.descendant(of: cards, matching: find.byType(SourceText));
    expect(tester.widgetList<SourceText>(credits).map((t) => t.text), [
      'Data from BMA · Updated 10 min ago',
      'Data from Pollution Control Department · Updated 10 min ago',
    ]);
    final links = find.descendant(of: cards, matching: find.byType(SourceLink));
    expect(tester.widgetList<SourceLink>(links).map((s) => s.url), [
      'https://weather.bangkok.go.th/flood',
      'https://air4thai.pcd.go.th',
    ]);
    final notifyOff = find.text('Phone notifications are off. You can turn them on in Settings');
    await tester.scrollUntilVisible(notifyOff, 300, scrollable: _alertsList);
    expect(notifyOff, findsOneWidget);
    // Not a government app: said once, at the top, above the first alert.
    final notGov = find.byType(NotGovernmentBanner);
    await tester.scrollUntilVisible(notGov, -300, scrollable: _alertsList);
    expect(notGov, findsOneWidget);
    expect(find.descendant(of: notGov, matching: find.textContaining('It is not a government app')), findsOneWidget);
    expect(tester.getTopLeft(notGov).dy, lessThan(tester.getTopLeft(cards.first).dy));
  });

  testWidgets('an alert whose source is unknown links the sources list', (tester) async {
    final j = fixtureJson();
    ((j['alerts'] as List).first as Map<String, dynamic>)['kind'] = 'other';
    await pumpApp(
      tester,
      api: FakeApi(report: j),
      lang: 'en',
    );
    await tester.tap(find.text('Alerts'));
    await tester.pumpAndSettle();
    final cards = find.descendant(of: find.byType(AlertsScreen), matching: find.byType(AlertCard));
    final button = find.descendant(of: cards, matching: find.widgetWithText(TextButton, 'Data sources'));
    expect(button, findsOneWidget);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(find.byType(SourcesScreen), findsOneWidget);
  });

  testWidgets('alerts tab says so when there are none', (tester) async {
    final calm = fixtureJson()
      ..['severity'] = 'ok'
      ..['calm'] = true
      ..['alerts'] = <Object>[];
    await pumpApp(
      tester,
      api: FakeApi(report: calm),
      lang: 'en',
    );
    await tester.tap(find.text('Alerts'));
    await tester.pumpAndSettle();
    expect(find.text('No alerts for this district right now'), findsOneWidget);
  });

  testWidgets('with no district, alerts says it is not a government app above the pick button', (tester) async {
    await pumpApp(tester, lang: 'en', withDistrict: false);
    await tester.tap(find.text('Alerts'));
    await tester.pumpAndSettle();
    final notGov = find.descendant(of: find.byType(AlertsScreen), matching: find.byType(NotGovernmentBanner));
    expect(notGov, findsOneWidget);
    expect(find.descendant(of: notGov, matching: find.textContaining('It is not a government app')), findsOneWidget);
    final pick = find.descendant(
      of: find.byType(AlertsScreen),
      matching: find.widgetWithText(FilledButton, 'Choose area'),
    );
    expect(pick, findsOneWidget);
    expect(tester.getTopLeft(notGov).dy, lessThan(tester.getTopLeft(pick).dy));
  });

  testWidgets('notifications switch asks permission first and shows quake choices once on', (tester) async {
    final settings = AppSettings()
      ..district = fixtureDistrict()
      ..locale = const Locale('en');
    final phone = FakePhoneNotifications(grant: false);
    tester.view.physicalSize = const Size(800, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await pumpThemed(
      tester,
      ListenableBuilder(
        listenable: settings,
        builder: (_, _) => SettingsScreen(
          settings: settings,
          api: FakeApi(),
          location: FakeLocation(LocationUnavailable(denied: true)),
          notifications: phone,
        ),
      ),
      lang: 'en',
    );
    await tester.tap(find.text('Notify me on this phone'));
    await tester.pumpAndSettle();
    expect(settings.notify, isFalse);
    expect(phone.running, isFalse);
    expect(find.text("Notifications are blocked for this app. Allow them in your phone's settings"), findsOneWidget);

    phone.grant = true;
    await tester.tap(find.text('Notify me on this phone'));
    await tester.pumpAndSettle();
    expect(settings.notify, isTrue);
    expect(phone.running, isTrue);
    expect(find.text('1,500 km'), findsOneWidget);

    await tester.tap(find.text('5.0'));
    await tester.pumpAndSettle();
    expect(settings.quake.minMagnitude, 5);
    expect(settings.quake.maxDistanceKm, 1500);

    await tester.tap(find.text('Notify me on this phone'));
    await tester.pumpAndSettle();
    expect(settings.notify, isFalse);
    expect(phone.running, isFalse);
  });
}
