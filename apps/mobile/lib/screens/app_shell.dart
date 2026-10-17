import 'package:flutter/material.dart';

import '../alerts/phone_notifications.dart';
import '../api/hazard_api.dart';
import '../bma/device_bma.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../settings.dart';
import '../theme/hw_app_theme.dart';
import 'alerts_screen.dart';
import 'home_screen.dart';
import 'map_screen.dart';
import 'settings_screen.dart';
import 'sources_screen.dart';

/// Design system NavigationBar: four fixed destinations, labels always shown, `line` along the top.
class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    required this.settings,
    required this.api,
    required this.location,
    required this.clock,
    this.bma,
  });

  final AppSettings settings;
  final HazardApi api;
  final LocationService location;
  final DateTime Function() clock;
  final DeviceBma? bma;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  static const _alertsTab = 2;
  int _tab = 0;
  late final AppLifecycleListener _lifecycle;
  bool _notGovOpen = false;

  @override
  void initState() {
    super.initState();
    alertsTabRequest.addListener(_openAlerts);
    // A notification tap that started the app came in before this shell existed.
    if (alertsTabRequest.take()) _tab = _alertsTab;
    // Opening the app, or coming back to it on a new day.
    _lifecycle = AppLifecycleListener(onResume: _showNotGov);
    WidgetsBinding.instance.addPostFrameCallback((_) => _showNotGov());
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    alertsTabRequest.removeListener(_openAlerts);
    super.dispose();
  }

  /// The not-government notice, on the first open of the day unless turned off.
  Future<void> _showNotGov() async {
    final settings = widget.settings;
    if (!mounted || _notGovOpen || !settings.shouldShowNotGov(widget.clock())) return;
    _notGovOpen = true;
    settings.notGovShownOn = AppSettings.dayKey(widget.clock());
    final hide = await showDialog<bool>(context: context, builder: (_) => const NotGovernmentDialog());
    _notGovOpen = false;
    if (hide ?? false) settings.notGovHidden = true;
  }

  /// A tapped alert notification: back to the shell from any page on top of it, on the Alerts tab.
  void _openAlerts() {
    if (!alertsTabRequest.take() || !mounted) return;
    Navigator.of(context).popUntil((r) => r.isFirst);
    setState(() => _tab = _alertsTab);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          HomeScreen(
            settings: widget.settings,
            api: widget.api,
            location: widget.location,
            clock: widget.clock,
            bma: widget.bma,
          ),
          MapScreen(
            settings: widget.settings,
            api: widget.api,
            location: widget.location,
            clock: widget.clock,
            bma: widget.bma,
          ),
          AlertsScreen(
            settings: widget.settings,
            api: widget.api,
            location: widget.location,
            clock: widget.clock,
            bma: widget.bma,
          ),
          SettingsScreen(settings: widget.settings, api: widget.api, location: widget.location),
        ],
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: c.line)),
        ),
        child: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: [
            NavigationDestination(icon: const Icon(Icons.home_outlined), label: l.navHome),
            NavigationDestination(icon: const Icon(Icons.map_outlined), label: l.navMap),
            NavigationDestination(icon: const Icon(Icons.notifications_none_rounded), label: l.navAlerts),
            NavigationDestination(icon: const Icon(Icons.settings_outlined), label: l.navSettings),
          ],
        ),
      ),
    );
  }
}
