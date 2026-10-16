import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
}
