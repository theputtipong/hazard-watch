import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

sealed class LocationResult {}

class LocationFound extends LocationResult {
  LocationFound(this.lat, this.lng, {this.stale = false});
  final double lat;
  final double lng;

  /// The phone's last known position rather than a fresh fix (still fine for picking a district).
  final bool stale;
}

/// Why no position came back. Each one has its own message and way out in the picker.
enum LocationFailure {
  /// Location is switched off on the phone.
  serviceOff,

  /// The person said no this time; asking again can still show the system prompt.
  denied,

  /// Blocked for good: only the app's settings page can turn it back on.
  deniedForever,

  /// No fix in time and no recent last-known position.
  timeout,

  /// Anything else.
  error,
}

/// No position: the person picks a district instead (or fixes the cause and tries again).
class LocationUnavailable extends LocationResult {
  LocationUnavailable({bool denied = false, LocationFailure? reason})
    : reason = reason ?? (denied ? LocationFailure.denied : LocationFailure.error);

  final LocationFailure reason;

  /// Permission refused, now or for good.
  bool get denied => reason == LocationFailure.denied || reason == LocationFailure.deniedForever;
}

abstract interface class LocationService {
  /// Call only after showing why (design system: the reason comes before the system prompt).
  Future<LocationResult> current();

  /// The phone's location switch, for [LocationFailure.serviceOff].
  Future<void> openLocationSettings();

  /// This app's settings page, for [LocationFailure.deniedForever].
  Future<void> openAppSettings();
}

/// District-level only, so a coarse fix is enough (the manifest asks for ACCESS_COARSE_LOCATION only) and nothing
/// is stored.
class DeviceLocation implements LocationService {
  DeviceLocation({this.platform, DateTime Function()? clock, this.target}) : _clock = clock ?? DateTime.now;

  /// Tests pass a fake; the app uses the plugin.
  final GeolocatorPlatform? platform;
  final TargetPlatform? target;
  final DateTime Function() _clock;

  GeolocatorPlatform get _geo => platform ?? GeolocatorPlatform.instance;

  /// A last-known position this recent is used straight away, without waiting for a fix.
  static const recent = Duration(minutes: 10);

  /// When no fix comes in time, a last-known position up to this old still beats nothing.
  static const fallbackAge = Duration(hours: 1);

  /// Balanced power can take a while indoors; the picker shows progress with a cancel meanwhile.
  static const timeLimit = Duration(seconds: 25);

  /// Balanced power (cell + Wi-Fi, GPS if needed), which still works with coarse permission. Low power never wakes
  /// anything and only answers from a cached fix, which is why "use my location" used to time out.
  LocationSettings get _settings => switch (target ?? defaultTargetPlatform) {
    TargetPlatform.android => AndroidSettings(accuracy: LocationAccuracy.medium, timeLimit: timeLimit),
    _ => const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: timeLimit),
  };

  @override
  Future<LocationResult> current() async {
    try {
      if (!await _geo.isLocationServiceEnabled()) return LocationUnavailable(reason: LocationFailure.serviceOff);
      var permission = await _geo.checkPermission();
      if (permission == LocationPermission.denied) permission = await _geo.requestPermission();
      if (permission == LocationPermission.deniedForever) {
        return LocationUnavailable(reason: LocationFailure.deniedForever);
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.unableToDetermine) {
        return LocationUnavailable(reason: LocationFailure.denied);
      }

      final last = await _lastKnown();
      if (last != null && _age(last) <= recent) return LocationFound(last.latitude, last.longitude, stale: true);

      try {
        final p = await _geo.getCurrentPosition(locationSettings: _settings);
        return LocationFound(p.latitude, p.longitude);
      } on TimeoutException {
        if (last != null && _age(last) <= fallbackAge) return LocationFound(last.latitude, last.longitude, stale: true);
        return LocationUnavailable(reason: LocationFailure.timeout);
      }
    } on LocationServiceDisabledException {
      return LocationUnavailable(reason: LocationFailure.serviceOff);
    } on PermissionDeniedException {
      return LocationUnavailable(reason: LocationFailure.denied);
    } on Exception {
      return LocationUnavailable(reason: LocationFailure.error);
    }
  }

  /// Not supported everywhere (e.g. web), so a failure here just means "none".
  Future<Position?> _lastKnown() async {
    try {
      return await _geo.getLastKnownPosition();
    } on Exception {
      return null;
    }
  }

  Duration _age(Position p) => _clock().difference(p.timestamp);

  @override
  Future<void> openLocationSettings() async {
    try {
      await _geo.openLocationSettings();
    } on Exception {
      // Nothing to open on this platform; the message still says what to do.
    }
  }

  @override
  Future<void> openAppSettings() async {
    try {
      await _geo.openAppSettings();
    } on Exception {
      // As above.
    }
  }
}
