import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/app.dart';
import 'package:hazardwatch/location.dart';
import 'package:hazardwatch/screens/home_screen.dart';
import 'package:hazardwatch/screens/sources_screen.dart';
import 'package:hazardwatch/settings.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';

import 'support.dart';

void main() {
  final day1 = DateTime(2026, 10, 18, 7);
  final day1Late = DateTime(2026, 10, 18, 23, 59);
  final day2 = DateTime(2026, 10, 19, 0, 1);

  group('when the not-government notice shows', () {
    test('once a day, until it is turned off', () {
      final s = AppSettings();
      expect(s.shouldShowNotGov(day1), isTrue);
      s.notGovShownOn = AppSettings.dayKey(day1);
      expect(s.shouldShowNotGov(day1Late), isFalse);
      expect(s.shouldShowNotGov(day2), isTrue);
      s.notGovHidden = true;
      expect(s.shouldShowNotGov(day2), isFalse);
    });
  });

  group('the notice on opening the app', () {
    Future<void> open(WidgetTester tester, AppSettings settings, DateTime now) async {
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(
        HazardWatchApp(
          settings: settings,
          api: FakeApi(),
          location: FakeLocation(LocationUnavailable(denied: true)),
          clock: () => now,
        ),
      );
      await tester.pumpAndSettle();
    }

    AppSettings fresh() => AppSettings()..district = fixtureDistrict();
    final dialog = find.byKey(const ValueKey('not-gov-dialog'));

    testWidgets('shows on the first open of the day in bold red, and not again that day', (tester) async {
      final settings = fresh();
      await open(tester, settings, day1);
      expect(dialog, findsOneWidget);
      final c = tester.element(dialog).hw;
      final title = tester.widget<Text>(find.text('แอปนี้ไม่ใช่แอปของรัฐ'));
      expect(title.style!.color, c.sevDangerInk);
      expect(title.style!.fontWeight, FontWeight.w700);
      expect(
        find.descendant(of: dialog, matching: find.textContaining('ไม่ใช่แอปของรัฐ ไม่ได้สังกัด')),
        findsOneWidget,
      );

      await tester.tap(find.text('รับทราบ'));
      await tester.pumpAndSettle();
      expect(dialog, findsNothing);

      await open(tester, settings, day1Late);
      expect(dialog, findsNothing);
      await open(tester, settings, day2);
      expect(dialog, findsOneWidget);
    });

    testWidgets('"don\'t show again" stops it for good', (tester) async {
      final settings = fresh();
      await open(tester, settings, day1);
      await tester.tap(find.text('ไม่ต้องแสดงอีก'));
      await tester.pump();
      await tester.tap(find.text('รับทราบ'));
      await tester.pumpAndSettle();
      expect(settings.notGovHidden, isTrue);
      await open(tester, settings, day2);
      expect(dialog, findsNothing);
    });

    testWidgets('closing without ticking the box keeps it on for tomorrow', (tester) async {
      final settings = fresh();
      await open(tester, settings, day1);
      await tester.tap(find.text('รับทราบ'));
      await tester.pumpAndSettle();
      expect(settings.notGovHidden, isFalse);
    });
  });

  testWidgets('the not-government lines on Home and the sources page are bold red', (tester) async {
    await pumpThemed(tester, const NotGovernmentBanner());
    final c = tester.element(find.byType(NotGovernmentBanner)).hw;
    final banner = tester.widget<Text>(find.textContaining('ไม่ใช่แอปของรัฐ'));
    expect((banner.style!.color, banner.style!.fontWeight), (c.sevDangerInk, FontWeight.w700));

    await pumpThemed(tester, const SizedBox.expand(child: SourcesScreen()));
    final note = tester.widget<Text>(
      find.descendant(of: find.byKey(const ValueKey('not-gov')), matching: find.byType(Text)),
    );
    expect((note.style!.color, note.style!.fontWeight), (c.sevDangerInk, FontWeight.w700));
  });
}
