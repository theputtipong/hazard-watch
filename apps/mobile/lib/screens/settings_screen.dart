import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../alerts/area_alerts.dart';
import '../alerts/phone_notifications.dart';
import '../api/hazard_api.dart';
import '../bma/rules.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../settings.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/hw_card.dart';
import 'area_picker_screen.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({
    super.key,
    required this.settings,
    required this.api,
    required this.location,
    this.notifications = const DevicePhoneNotifications(),
  });

  final AppSettings settings;
  final HazardApi api;
  final LocationService location;
  final PhoneNotifications notifications;

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
          _NotificationsCard(settings: settings, notifications: notifications),
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

/// Phone notifications: the reason comes before the system prompt (design system), and the quake limit uses the same
/// choices as the web's alert settings.
class _NotificationsCard extends StatefulWidget {
  const _NotificationsCard({required this.settings, required this.notifications});

  final AppSettings settings;
  final PhoneNotifications notifications;

  @override
  State<_NotificationsCard> createState() => _NotificationsCardState();
}

class _NotificationsCardState extends State<_NotificationsCard> {
  bool _denied = false;
  bool _busy = false;

  Future<void> _toggle(bool on) async {
    setState(() => _busy = true);
    try {
      if (on) {
        final granted = await widget.notifications.requestPermission();
        setState(() => _denied = !granted);
        if (!granted) return;
        widget.settings.notify = true;
        await widget.notifications.start();
      } else {
        widget.settings.notify = false;
        await widget.notifications.stop();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    final c = context.hw;
    final s = widget.settings;
    final quake = s.quake;
    final muted = text.bodySmall!.copyWith(color: c.inkMuted);
    return HwCard(
      title: l.settingsNotifications,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: HwSize.space3,
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(l.notifyToggle, style: text.bodyLarge),
            subtitle: Text(l.permissionNotifications),
            value: s.notify,
            onChanged: _busy || (s.district == null && !s.notify) ? null : _toggle,
          ),
          if (s.district == null && !s.notify) Text(l.notifyPickArea, style: muted),
          if (_denied) Text(l.notifyDenied, style: text.bodyMedium!.copyWith(color: c.text(HwLevel.warning))),
          if (s.notify) ...[
            Text(l.notifyHow, style: muted),
            Text(l.pushQuakeMag, style: text.labelLarge),
            SegmentedButton<double>(
              segments: [
                for (final m in CoreConfig.quakeMinMagnitudeChoices)
                  ButtonSegment(value: m, label: Text(m.toStringAsFixed(1))),
              ],
              selected: {quake.minMagnitude},
              onSelectionChanged: (v) =>
                  s.quake = QuakePrefs(minMagnitude: v.first, maxDistanceKm: quake.maxDistanceKm),
            ),
            Text(l.pushQuakeKm, style: text.labelLarge),
            SegmentedButton<int>(
              segments: [
                for (final km in CoreConfig.quakeMaxDistanceKmChoices)
                  ButtonSegment(
                    value: km,
                    label: Text(l.pushQuakeKmOption(NumberFormat.decimalPattern('en_US').format(km))),
                  ),
              ],
              selected: {quake.maxDistanceKm},
              onSelectionChanged: (v) => s.quake = QuakePrefs(minMagnitude: quake.minMagnitude, maxDistanceKm: v.first),
            ),
          ],
        ],
      ),
    );
  }
}
