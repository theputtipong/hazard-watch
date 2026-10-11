import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'alerts/area_alerts.dart';
import 'api/models.dart';
import 'bma/rules.dart';

/// Display choices (same as the web's A11yControls), the district the person follows and phone notification choices,
/// saved on the device. The background alert check reads the same values.
class AppSettings extends ChangeNotifier {
  /// Without [_prefs] (tests) nothing is saved.
  AppSettings([this._prefs]);

  final SharedPreferencesAsync? _prefs;

  ThemeMode _themeMode = ThemeMode.system;
  bool _cvd = false;
  Locale _locale = const Locale('th');
  District? _district;
  bool _notify = false;
  QuakePrefs _quake = QuakePrefs.standard;

  ThemeMode get themeMode => _themeMode;
  bool get cvd => _cvd;
  Locale get locale => _locale;
  District? get district => _district;
  bool get notify => _notify;
  QuakePrefs get quake => _quake;

  set themeMode(ThemeMode v) => _set(() => _themeMode = v, () => _prefs?.setString(_kTheme, v.name));
  set cvd(bool v) => _set(() => _cvd = v, () => _prefs?.setBool(_kCvd, v));
  set locale(Locale v) => _set(() => _locale = v, () => _prefs?.setString(_kLang, v.languageCode));
  set district(District? v) => _set(
    () => _district = v,
    () => v == null ? _prefs?.remove(_kDistrict) : _prefs?.setString(_kDistrict, jsonEncode(_districtJson(v))),
  );

  set notify(bool v) => _set(() => _notify = v, () => _prefs?.setBool(_kNotify, v));
  set quake(QuakePrefs v) => _set(() => _quake = v, () async {
    await _prefs?.setDouble(_kQuakeMag, v.minMagnitude);
    await _prefs?.setInt(_kQuakeKm, v.maxDistanceKm);
  });

  static const _kTheme = 'theme', _kCvd = 'cvd', _kLang = 'lang', _kDistrict = 'district';
  static const _kNotify = 'notify', _kQuakeMag = 'quakeMinMag', _kQuakeKm = 'quakeMaxKm';

  /// Reads saved choices; anything missing or unreadable keeps its default.
  Future<void> load() async {
    final p = _prefs;
    if (p == null) return;
    final theme = await p.getString(_kTheme);
    _themeMode = ThemeMode.values.where((m) => m.name == theme).firstOrNull ?? _themeMode;
    _cvd = await p.getBool(_kCvd) ?? _cvd;
    final lang = await p.getString(_kLang);
    if (lang == 'th' || lang == 'en') _locale = Locale(lang!);
    _notify = await p.getBool(_kNotify) ?? _notify;
    final mag = await p.getDouble(_kQuakeMag);
    final km = await p.getInt(_kQuakeKm);
    _quake = QuakePrefs(
      minMagnitude: CoreConfig.quakeMinMagnitudeChoices.contains(mag) ? mag! : _quake.minMagnitude,
      maxDistanceKm: CoreConfig.quakeMaxDistanceKmChoices.contains(km) ? km! : _quake.maxDistanceKm,
    );
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
