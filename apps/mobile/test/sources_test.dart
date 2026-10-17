import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hazardwatch/l10n/gen/app_localizations.dart';
import 'package:hazardwatch/screens/home_screen.dart';
import 'package:hazardwatch/screens/settings_screen.dart';
import 'package:hazardwatch/screens/sources_screen.dart';
import 'package:hazardwatch/sources_meta.g.dart';
import 'package:hazardwatch/theme/hw_app_theme.dart';
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

  testWidgets('sources page opens with the not-government note, then lists every agency with its site and link', (
    tester,
  ) async {
    await pumpThemed(tester, const SizedBox.expand(child: SourcesScreen()));
    expect(find.text('แหล่งข้อมูล'), findsOneWidget);
    // The note is the first thing on the page, above the intro and the list.
    final note = find.byKey(const ValueKey('not-gov'));
    expect(find.descendant(of: note, matching: find.textContaining('ไม่ใช่แอปของรัฐ')), findsOneWidget);
    expect(
      tester.getRect(note).bottom,
      lessThan(tester.getRect(find.textContaining('แตะเพื่อเปิดเว็บไซต์ต้นทาง')).top),
    );
    for (final (name, domain, url) in [
      ('กรมอุตุนิยมวิทยา', 'earthquake.tmd.go.th', 'https://earthquake.tmd.go.th'),
      ('กรมควบคุมมลพิษ', 'air4thai.pcd.go.th', 'https://air4thai.pcd.go.th'),
      ('กรุงเทพมหานคร', 'weather.bangkok.go.th', 'https://weather.bangkok.go.th/flood'),
      ('กรุงเทพมหานคร', 'weather.bangkok.go.th', 'https://weather.bangkok.go.th/rain'),
      ('สถาบันสารสนเทศทรัพยากรน้ำ (สสน.)', 'thaiwater.net', 'https://www.thaiwater.net'),
      ('กรมชลประทาน', 'app.rid.go.th', 'https://app.rid.go.th/reservoir'),
      ('สำนักสำรวจธรณีวิทยาสหรัฐฯ (USGS)', 'earthquake.usgs.gov', 'https://earthquake.usgs.gov'),
    ]) {
      await tester.scrollUntilVisible(find.text(url), 100);
      // Each row is one link: its agency, site and full address together (BMA has two rows, flood and rain).
      final row = find.ancestor(of: find.text(url), matching: find.byType(InkWell)).first;
      expect(
        find.descendant(of: row, matching: find.text(name)),
        findsOneWidget,
        reason: url,
      );
      expect(
        find.descendant(of: row, matching: find.text(domain)),
        findsOneWidget,
        reason: url,
      );
    }
    final rain = find.ancestor(of: find.text('https://weather.bangkok.go.th/rain'), matching: find.byType(InkWell));
    expect(find.descendant(of: rain.first, matching: find.text('ปริมาณฝนจากเครื่องวัดฝนในกรุงเทพฯ')), findsOneWidget);
    // Every government page the app links, each with its own row: TMD, PCD, BMA flood + rain, HII, RID, USGS, NASA ×3.
    expect(SourcesScreen.shown, [
      'tmd',
      'air4thai',
      'bma-flood',
      'bma-rain',
      'thaiwater',
      'rid',
      'usgs',
      'nasa-firms',
      'nasa-eonet',
      'nasa-gibs',
    ]);
    for (final lang in ['th', 'en']) {
      final l = lookupAppLocalizations(Locale(lang));
      final descriptions = SourcesScreen.shown.map((id) => SourcesScreen.description(l, id)).toList();
      expect(descriptions, everyElement(isNotEmpty), reason: lang);
      expect(descriptions.toSet(), hasLength(descriptions.length), reason: '$lang: each row says what it is');
    }
    for (final id in SourcesScreen.shown) {
      expect(sourceUrl(id), isNotNull);
      expect(sourceDomain(id), isNotNull);
    }
    await tester.scrollUntilVisible(find.textContaining('ไม่ได้เป็นของหรือเป็นตัวแทนของหน่วยงานรัฐ'), 100);
    await tester.scrollUntilVisible(find.widgetWithText(SourceLink, '191'), 100);
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
    testWidgets('links each source by its full agency name and site, and keeps the rest as plain text', (tester) async {
      await pumpThemed(
        tester,
        const SourceText(
          'ข้อมูลจาก กรมอุตุฯ และ USGS · 17:00 น.',
          sources: [
            (name: 'กรมอุตุฯ', url: 'https://earthquake.tmd.go.th'),
            (name: 'USGS', url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us1'),
          ],
        ),
      );
      final links = tester.widgetList<SourceLink>(find.byType(SourceLink)).toList();
      // "ข้อมูลจาก" joins the first link, which then reads as sourceDataFrom.
      expect(links.map((s) => (s.label, s.url)), [
        ('ข้อมูลจาก กรมอุตุนิยมวิทยา · earthquake.tmd.go.th', 'https://earthquake.tmd.go.th'),
        (
          'สำนักสำรวจธรณีวิทยาสหรัฐฯ (USGS) · earthquake.usgs.gov',
          'https://earthquake.usgs.gov/earthquakes/eventpage/us1',
        ),
      ]);
      final rich = tester.widget<RichText>(find.byType(RichText).first).text.toPlainText();
      expect(rich, isNot(startsWith('ข้อมูลจาก ข้อมูลจาก')));
      expect(find.textContaining(' · 17:00 น.', findRichText: true), findsOneWidget);
      for (final link in links) {
        final size = tester.getSize(find.byWidget(link));
        expect(size.height, greaterThanOrEqualTo(HwSize.touchTarget));
        expect(size.width, greaterThanOrEqualTo(HwSize.touchTarget));
      }
      final usgs = tester.getSemantics(find.byWidget(links.last));
      expect(usgs.label, 'สำนักสำรวจธรณีวิทยาสหรัฐฯ (USGS) · earthquake.usgs.gov, เปิดเว็บไซต์ต้นทาง');
      expect(usgs.flagsCollection.isLink, isTrue);
    });

    testWidgets('a link is underlined in the link colour and never smaller than 14', (tester) async {
      late HwColors c;
      await pumpThemed(
        tester,
        Builder(
          builder: (context) {
            c = context.hw;
            return SourceText(
              'ข้อมูลจาก กทม.',
              sources: const [(name: 'กทม.', url: 'https://weather.bangkok.go.th/rain')],
              style: Theme.of(context).textTheme.bodySmall,
            );
          },
        ),
      );
      final text = tester.widget<Text>(find.descendant(of: find.byType(SourceLink), matching: find.byType(Text)));
      expect(text.data, 'ข้อมูลจาก กรุงเทพมหานคร · weather.bangkok.go.th');
      expect(text.style!.decoration, TextDecoration.underline);
      expect(text.style!.color, c.accent);
      expect(text.style!.fontSize, greaterThanOrEqualTo(14));
    });

    testWidgets('describe: false keeps the credit wording as written', (tester) async {
      await pumpThemed(
        tester,
        const SourceText(
          'Fires: NASA FIRMS',
          sources: [(name: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov')],
          describe: false,
        ),
      );
      expect(tester.widget<SourceLink>(find.byType(SourceLink)).label, 'NASA FIRMS');
    });

    testWidgets('a link without a label names the agency and site of its url', (tester) async {
      await pumpThemed(tester, const SourceLink(url: 'https://app.rid.go.th/reservoir'));
      expect(find.text('ข้อมูลจาก กรมชลประทาน · app.rid.go.th'), findsOneWidget);
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
                    (name: 'กรมอุตุฯ', url: 'https://earthquake.tmd.go.th'),
                    (name: 'USGS', url: 'https://earthquake.usgs.gov'),
                  ],
                  semantics: 'แผ่นดินไหว 4.5',
                  onTap: tappable ? () => tileTaps++ : null,
                ),
              ],
            ),
          ),
        );
        final tmd = tester.getSemantics(
          find.widgetWithText(SourceLink, 'ข้อมูลจาก กรมอุตุนิยมวิทยา · earthquake.tmd.go.th'),
        );
        final usgs = tester.getSemantics(
          find.widgetWithText(SourceLink, 'สำนักสำรวจธรณีวิทยาสหรัฐฯ (USGS) · earthquake.usgs.gov'),
        );
        expect(tmd.id, isNot(usgs.id));
        for (final node in [tmd, usgs]) {
          final data = node.getSemanticsData();
          expect(data.hasAction(SemanticsAction.tap), isTrue);
          expect(data.flagsCollection.isLink, isTrue);
        }
        expect(tmd.label, 'ข้อมูลจาก กรมอุตุนิยมวิทยา · earthquake.tmd.go.th, เปิดเว็บไซต์ต้นทาง');
        await semanticsTap(tester, usgs);
        await semanticsTap(tester, tmd);
        expect(opened, [Uri.parse('https://earthquake.usgs.gov'), Uri.parse('https://earthquake.tmd.go.th')]);
        expect(tileTaps, 0);
        handle.dispose();
      });
    }

    testWidgets('each row on the sources page opens its site on activation', (tester) async {
      final handle = tester.ensureSemantics();
      final opened = recordLaunches();
      await pumpThemed(tester, const SizedBox.expand(child: SourcesScreen()));
      final row = find.bySemanticsLabel(
        RegExp('กรมอุตุนิยมวิทยา, earthquake.tmd.go.th, .*https://earthquake.tmd.go.th'),
      );
      final node = tester.getSemantics(row);
      expect(node.getSemanticsData().hasAction(SemanticsAction.tap), isTrue);
      expect(node.getSemanticsData().flagsCollection.isLink, isTrue);
      await semanticsTap(tester, node);
      expect(opened, [Uri.parse(sourceUrl('tmd')!)]);
      handle.dispose();
    });
  });

  group('source links', () {
    test('find the source by its site, the deeper page winning where two share it', () {
      expect(sourceIdForUrl('https://earthquake.tmd.go.th/inside.html?id=1'), 'tmd');
      expect(sourceIdForUrl('https://weather.bangkok.go.th/rain'), 'bma-rain');
      expect(sourceIdForUrl('https://weather.bangkok.go.th/flood'), 'bma-flood');
      expect(sourceIdForUrl('https://www.thaiwater.net/water/dam'), 'thaiwater');
      expect(sourceIdForUrl('https://example.com'), isNull);
      expect(sourceIdForUrl('tel:1784'), isNull);
      expect(linkDomain('https://www.thaiwater.net/x'), 'thaiwater.net');
    });

    test('point at the pages Google Play reviewers check', () {
      expect(sourceUrl('tmd'), 'https://earthquake.tmd.go.th');
      expect(sourceUrl('bma-flood'), 'https://weather.bangkok.go.th/flood');
      expect(sourceUrl('bma-rain'), 'https://weather.bangkok.go.th/rain');
      expect(sourceUrl('rid'), 'https://app.rid.go.th/reservoir');
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
