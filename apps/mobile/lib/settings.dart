import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/models.dart';

/// Display choices (same as the web's A11yControls) and the district the person follows, saved on the device.
class AppSettings extends ChangeNotifier {
  /// Without [_prefs] (tests) nothing is saved.
  AppSettings([this._prefs]);

  final SharedPreferencesAsync? _prefs;

  ThemeMode _themeMode = ThemeMode.system;
  bool _cvd = false;
  Locale _locale = const Locale('th');
  District? _district;

  ThemeMode get themeMode => _themeMode;
  bool get cvd => _cvd;
  Locale get locale => _locale;
  District? get district => _district;

  set themeMode(ThemeMode v) => _set(() => _themeMode = v, () => _prefs?.setString(_kTheme, v.name));
  set cvd(bool v) => _set(() => _cvd = v, () => _prefs?.setBool(_kCvd, v));
  set locale(Locale v) => _set(() => _locale = v, () => _prefs?.setString(_kLang, v.languageCode));
  set district(District? v) => _set(
    () => _district = v,
    () => v == null ? _prefs?.remove(_kDistrict) : _prefs?.setString(_kDistrict, jsonEncode(_districtJson(v))),
  );

  static const _kTheme = 'theme', _kCvd = 'cvd', _kLang = 'lang', _kDistrict = 'district';

  /// Reads saved choices; anything missing or unreadable keeps its default.
  Future<void> load() async {
    final p = _prefs;
    if (p == null) return;
    final theme = await p.getString(_kTheme);
    _themeMode = ThemeMode.values.where((m) => m.name == theme).firstOrNull ?? _themeMode;
    _cvd = await p.getBool(_kCvd) ?? _cvd;
    final lang = await p.getString(_kLang);
    if (lang == 'th' || lang == 'en') _locale = Locale(lang!);
    final saved = await p.getString(_kDistrict);
    if (saved != null) {
      try {
        _district = District.fromJson(jsonDecode(saved) as Map<String, dynamic>);
      } on Object {
        await p.remove(_kDistrict);
      }
    }
    notifyListeners();
  }

  void _set(VoidCallback change, Future<void>? Function() save) {
    change();
    notifyListeners();
    save();
  }

  static Map<String, Object?> _districtJson(District d) => {
    'id': d.id,
    'name': {'th': d.name.th, 'en': d.name.en},
    'province': d.province == null ? null : {'th': d.province!.th, 'en': d.province!.en},
    'center': {'lat': d.lat, 'lng': d.lng},
  };
}
