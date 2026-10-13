import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/screens/home_screen.dart';
import 'package:hazardwatch/screens/settings_screen.dart';
import 'package:hazardwatch/screens/sources_screen.dart';
import 'package:hazardwatch/sources_meta.g.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';
import 'package:hazardwatch/theme/hw_theme.dart';
import 'package:hazardwatch/widgets/reading_tile.dart';
import 'package:hazardwatch/widgets/source_link.dart';

import 'support.dart';

void main() {
  final realLaunchLink = launchLink;

  /// Records every link opened until the test ends.
  List<Uri> recordLaunches() {
    final opened = <Uri>[];
    launchLink = (uri) async {
      opened.add(uri);
      return true;
    };
    addTearDown(() => launchLink = realLaunchLink);
    return opened;
  }

  /// Activates [node] the way TalkBack/VoiceOver does on a double-tap.
  Future<void> semanticsTap(WidgetTester tester, SemanticsNode node) async {
    node.owner!.performAction(node.id, SemanticsAction.tap);
    await tester.pumpAndSettle();
  }

  testWidgets('sources page lists every agency with its link, then the disclaimer and emergency numbers', (
    tester,
  ) async {
    await pumpThemed(tester, const SizedBox.expand(child: SourcesScreen()));
    expect(find.text('แหล่งข้อมูล'), findsOneWidget);
    for (final (name, url) in [
      ('กรมอุตุฯ', 'www.tmd.go.th'),
      ('กรมควบคุมมลพิษ', 'air4thai.pcd.go.th'),
      ('กทม.', 'weather.bangkok.go.th'),
      ('ThaiWater', 'www.thaiwater.net'),
      ('USGS', 'earthquake.usgs.gov'),
    ]) {
      await tester.scrollUntilVisible(find.text(url), 100);
      expect(find.text(name), findsOneWidget);
    }
    for (final id in SourcesScreen.shown) {
      expect(sourceUrl(id), isNotNull);
    }
    await tester.scrollUntilVisible(find.textContaining('ไม่ได้เป็นของหรือเป็นตัวแทนของหน่วยงานรัฐ'), 100);
    expect(find.widgetWithText(SourceLink, '1784'), findsOneWidget);
    expect(tester.widget<SourceLink>(find.widgetWithText(SourceLink, '191')).url, 'tel:191');
  });

  testWidgets('settings opens the sources page in one tap', (tester) async {
    await pumpApp(tester);
    await tester.tap(find.text('ตั้งค่า'));
    await tester.pumpAndSettle();
    final entry = find.widgetWithText(ListTile, 'แหล่งข้อมูล');
    await tester.scrollUntilVisible(
      entry,
      200,
      scrollable: find.descendant(of: find.byType(SettingsScreen), matching: find.byType(Scrollable)).first,
    );
    await tester.ensureVisible(entry);
    await tester.pumpAndSettle();
    await tester.tap(entry);
    await tester.pumpAndSettle();
    expect(find.byType(SourcesScreen), findsOneWidget);
  });

  testWidgets('home ends with the not-a-government-app note', (tester) async {
    await pumpApp(tester);
    final home = find.descendant(of: find.byType(HomeScreen), matching: find.byType(Scrollable)).first;
    await tester.scrollUntilVisible(find.byType(NotGovernmentNote), 300, scrollable: home);
    expect(find.textContaining('เป็นแอปอิสระ'), findsOneWidget);
  });

  group('SourceText', () {
    testWidgets('links each named source and keeps the rest as plain text', (tester) async {
      await pumpThemed(
        tester,
        const SourceText(
          'ข้อมูลจาก กรมอุตุฯ และ USGS · 17:00 น.',
          sources: [
            (name: 'กรมอุตุฯ', url: 'https://www.tmd.go.th'),
            (name: 'USGS', url: 'https://earthquake.usgs.gov'),
          ],
        ),
      );
      final links = tester.widgetList<SourceLink>(find.byType(SourceLink)).toList();
      expect(links.map((s) => (s.label, s.url)), [
        ('กรมอุตุฯ', 'https://www.tmd.go.th'),
        ('USGS', 'https://earthquake.usgs.gov'),
      ]);
      for (final link in links) {
        final size = tester.getSize(find.byWidget(link));
        expect(size.height, greaterThanOrEqualTo(HwSize.touchTarget));
        expect(size.width, greaterThanOrEqualTo(HwSize.touchTarget));
      }
      final usgs = tester.getSemantics(find.byWidget(links.last));
      expect(usgs.label, 'USGS, เปิดเว็บไซต์ต้นทาง');
      expect(usgs.flagsCollection.isLink, isTrue);
    });

    testWidgets('a tap opens the link outside the app', (tester) async {
      final opened = recordLaunches();
      await pumpThemed(tester, const SourceLink(label: 'USGS', url: 'https://earthquake.usgs.gov'));
      await tester.tap(find.byType(SourceLink));
      await tester.pumpAndSettle();
      expect(opened, [Uri.parse('https://earthquake.usgs.gov')]);
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('a link that cannot be opened is copied instead', (tester) async {
      launchLink = (_) async => false;
      addTearDown(() => launchLink = realLaunchLink);
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
        if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
        return null;
      });
      await pumpThemed(tester, const SourceLink(label: 'USGS', url: 'https://earthquake.usgs.gov'));
      await tester.tap(find.byType(SourceLink));
      await tester.pumpAndSettle();
      expect(copied, 'https://earthquake.usgs.gov');
      expect(find.textContaining('https://earthquake.usgs.gov'), findsOneWidget);
    });
  });

  group('screen readers', () {
    testWidgets('a link is its own node that opens on activation', (tester) async {
      final handle = tester.ensureSemantics();
      final opened = recordLaunches();
      await pumpThemed(tester, const SourceLink(label: 'USGS', url: 'https://earthquake.usgs.gov'));
      final node = tester.getSemantics(find.byType(SourceLink));
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
      await semanticsTap(tester, node);
      expect(opened, [Uri.parse('https://earthquake.usgs.gov')]);
      handle.dispose();
    });

    for (final tappable in [false, true]) {
      testWidgets('two links in a ReadingTile meta line are separate nodes (tile onTap: $tappable)', (tester) async {
        final handle = tester.ensureSemantics();
        final opened = recordLaunches();
        var tileTaps = 0;
        await pumpThemed(
          tester,
          SizedBox(
            width: 400,
            child: ReadingList(
              children: [
                ReadingTile(
                  label: 'แผ่นดินไหว',
                  value: '4.5',
                  level: HwLevel.watch,
                  note: 'ห่าง 300 กม.',
                  meta: 'ข้อมูลจาก กรมอุตุฯ · USGS',
                  sources: const [
                    (name: 'กรมอุตุฯ', url: 'https://www.tmd.go.th'),
                    (name: 'USGS', url: 'https://earthquake.usgs.gov'),
                  ],
                  semantics: 'แผ่นดินไหว 4.5',
                  onTap: tappable ? () => tileTaps++ : null,
                ),
              ],
            ),
          ),
        );
        final tmd = tester.getSemantics(find.widgetWithText(SourceLink, 'กรมอุตุฯ'));
        final usgs = tester.getSemantics(find.widgetWithText(SourceLink, 'USGS'));
        expect(tmd.id, isNot(usgs.id));
        for (final node in [tmd, usgs]) {
          final data = node.getSemanticsData();
          expect(data.hasAction(SemanticsAction.tap), isTrue);
          expect(data.flagsCollection.isLink, isTrue);
        }
        expect(tmd.label, 'กรมอุตุฯ, เปิดเว็บไซต์ต้นทาง');
        await semanticsTap(tester, usgs);
        await semanticsTap(tester, tmd);
        expect(opened, [Uri.parse('https://earthquake.usgs.gov'), Uri.parse('https://www.tmd.go.th')]);
        expect(tileTaps, 0);
        handle.dispose();
      });
    }

    testWidgets('each row on the sources page opens its site on activation', (tester) async {
      final handle = tester.ensureSemantics();
      final opened = recordLaunches();
      await pumpThemed(tester, const SizedBox.expand(child: SourcesScreen()));
      final row = find.bySemanticsLabel(RegExp('www.tmd.go.th'));
      final node = tester.getSemantics(row);
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
      expect(node.getSemanticsData().flagsCollection.isLink, isTrue);
      await semanticsTap(tester, node);
      expect(opened, [Uri.parse(sourceUrl('tmd')!)]);
      handle.dispose();
    });
  });

  group('sourceRef', () {
    test('uses an https page from the API', () {
      expect(sourceRef('USGS', 'usgs', url: 'https://earthquake.usgs.gov/x')?.url, 'https://earthquake.usgs.gov/x');
    });

    test('falls back to the source page for anything but https', () {
      for (final url in ['http://earthquake.usgs.gov/x', 'javascript:alert(1)', 'intent://x', '', '::not a url']) {
        expect(sourceRef('USGS', 'usgs', url: url)?.url, sourceUrl('usgs'), reason: url);
      }
      expect(sourceRef('USGS', 'usgs')?.url, sourceUrl('usgs'));
    });
  });
}
