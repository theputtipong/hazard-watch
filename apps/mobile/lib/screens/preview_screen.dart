import 'package:flutter/material.dart';

import '../l10n/gen/app_localizations.dart';
import '../settings.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/hw_card.dart';
import '../widgets/severity.dart';

/// Phase 1 placeholder home: shows the mobile design system so it can be checked against its previews.
/// Replaced by the four-tab app (home, map, alerts, settings) in phase 2.
class PreviewScreen extends StatelessWidget {
  const PreviewScreen({super.key, required this.settings});

  final AppSettings settings;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.appName, style: text.titleMedium),
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(HwSize.space4),
          children: [
            Text(l.appTagline, style: text.bodyLarge!.copyWith(color: c.inkMuted)),
            const SizedBox(height: HwSize.space6),
            // Design system `.m-calm`: what home shows when nothing needs care.
            Container(
              padding: const EdgeInsets.all(HwSize.space4),
              decoration: BoxDecoration(color: c.surfaceSunken, borderRadius: BorderRadius.circular(HwSize.radiusCard)),
              child: Text(l.homeAllClear, style: text.bodyLarge!.copyWith(color: c.inkMuted)),
            ),
            const SizedBox(height: HwSize.space3),
            HwCard(
              title: 'PM2.5',
              status: const SeverityBadge(level: HwLevel.warning),
              note: l.commonStale,
              source: '${l.commonSource} Air4Thai',
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                spacing: HwSize.space2,
                children: [
                  Text('62', style: text.displaySmall),
                  Text('µg/m³', style: text.labelLarge!.copyWith(color: c.inkMuted)),
                ],
              ),
            ),
            const SizedBox(height: HwSize.space3),
            HwCard(
              child: Wrap(
                spacing: HwSize.space2,
                runSpacing: HwSize.space2,
                children: [for (final level in HwLevel.values) SeverityBadge(level: level)],
              ),
            ),
            const SizedBox(height: HwSize.space3),
            HwCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: HwSize.space2,
                children: [
                  FilledButton(onPressed: () {}, child: Text(l.locationUseMine)),
                  OutlinedButton(onPressed: () {}, child: Text(l.locationPick)),
                  TextButton(onPressed: () {}, child: Text(l.commonRetry)),
                ],
              ),
            ),
            const SizedBox(height: HwSize.space6),
            HwCard(
              title: l.a11yDisplay,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: HwSize.space3,
                children: [
                  Row(
                    spacing: HwSize.space3,
                    children: [
                      for (final level in HwLevel.values)
                        SeverityMeter(level: level, large: true, color: c.solid(level)),
                    ],
                  ),
                  SegmentedButton<ThemeMode>(
                    segments: [
                      ButtonSegment(value: ThemeMode.system, label: Text(l.a11yThemeSystem)),
                      ButtonSegment(value: ThemeMode.light, label: Text(l.a11yThemeLight)),
                      ButtonSegment(value: ThemeMode.dark, label: Text(l.a11yThemeDark)),
                    ],
                    selected: {settings.themeMode},
                    onSelectionChanged: (v) => settings.themeMode = v.first,
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(l.a11yCvd, style: text.bodyLarge),
                    value: settings.cvd,
                    onChanged: (v) => settings.cvd = v,
                  ),
                  Row(
                    spacing: HwSize.space3,
                    children: [
                      Text(l.commonLanguage, style: text.labelLarge),
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(value: 'th', label: Text('ไทย')),
                          ButtonSegment(value: 'en', label: Text('English')),
                        ],
                        selected: {settings.locale.languageCode},
                        onSelectionChanged: (v) => settings.locale = Locale(v.first),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
