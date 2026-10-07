import 'package:flutter/material.dart';

import '../api/hazard_api.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../settings.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/hw_card.dart';
import 'area_picker_screen.dart';

/// Alert choices arrive with app push notifications (phase 4).
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.settings, required this.api, required this.location});

  final AppSettings settings;
  final HazardApi api;
  final LocationService location;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    final c = context.hw;
    final locale = Localizations.localeOf(context);
    final district = settings.district;
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(HwSize.space4),
        children: [
          Semantics(header: true, child: Text(l.navSettings, style: text.headlineSmall)),
          const SizedBox(height: HwSize.space3),
          HwCard(
            title: l.settingsArea,
            child: Row(
              spacing: HwSize.space3,
              children: [
                Expanded(
                  child: Text(
                    district == null
                        ? l.commonNoData
                        : [district.name.of(locale), district.province?.of(locale)].nonNulls.join(' · '),
                    style: text.bodyLarge!.copyWith(color: district == null ? c.inkMuted : null),
                  ),
                ),
                OutlinedButton(
                  onPressed: () async {
                    final d = await pickDistrict(context, api, location);
                    if (d != null) settings.district = d;
                  },
                  child: Text(district == null ? l.locationPick : l.locationPickChange),
                ),
              ],
            ),
          ),
          const SizedBox(height: HwSize.space3),
          HwCard(
            title: l.settingsDisplay,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: HwSize.space3,
              children: [
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
          ),
        ],
      ),
    );
  }
}
