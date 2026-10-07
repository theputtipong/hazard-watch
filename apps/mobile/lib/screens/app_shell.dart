import 'package:flutter/material.dart';

import '../api/hazard_api.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../settings.dart';
import '../theme/hw_app_theme.dart';
import 'home_screen.dart';
import 'settings_screen.dart';
import 'soon_screen.dart';

/// Design system NavigationBar: four fixed destinations, labels always shown, `line` along the top.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.settings, required this.api, required this.location, required this.clock});

  final AppSettings settings;
  final HazardApi api;
  final LocationService location;
  final DateTime Function() clock;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    return Scaffold(
      body: IndexedStack(
        index: _tab,
        children: [
          HomeScreen(settings: widget.settings, api: widget.api, location: widget.location, clock: widget.clock),
          SoonScreen(title: l.navMap),
          // Alert history arrives with app push notifications (phase 4).
          SoonScreen(title: l.navAlerts),
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
