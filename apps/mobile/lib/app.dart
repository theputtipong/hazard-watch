import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'l10n/gen/app_localizations.dart';
import 'screens/preview_screen.dart';
import 'settings.dart';
import 'theme/hw_app_theme.dart';

class HazardWatchApp extends StatelessWidget {
  const HazardWatchApp({super.key, required this.settings});

  final AppSettings settings;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: settings,
      builder: (context, _) => MaterialApp(
        onGenerateTitle: (context) => AppLocalizations.of(context).appName,
        debugShowCheckedModeBanner: false,
        theme: hwAppTheme(Brightness.light, cvd: settings.cvd),
        darkTheme: hwAppTheme(Brightness.dark, cvd: settings.cvd),
        themeMode: settings.themeMode,
        locale: settings.locale,
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: PreviewScreen(settings: settings),
      ),
    );
  }
}
