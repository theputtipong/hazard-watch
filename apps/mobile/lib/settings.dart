import 'package:flutter/material.dart';

/// Display choices, same as the web's A11yControls. Kept in memory for now; saved on the device from phase 2.
class AppSettings extends ChangeNotifier {
  ThemeMode _themeMode = ThemeMode.system;
  bool _cvd = false;
  Locale _locale = const Locale('th');

  ThemeMode get themeMode => _themeMode;
  bool get cvd => _cvd;
  Locale get locale => _locale;

  set themeMode(ThemeMode v) => _set(() => _themeMode = v);
  set cvd(bool v) => _set(() => _cvd = v);
  set locale(Locale v) => _set(() => _locale = v);

  void _set(VoidCallback change) {
    change();
    notifyListeners();
  }
}
