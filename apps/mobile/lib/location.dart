import 'package:geolocator/geolocator.dart';

sealed class LocationResult {}

class LocationFound extends LocationResult {
  LocationFound(this.lat, this.lng);
  final double lat;
  final double lng;
}

/// Permission refused, location off, or no fix in time: the person picks a district instead.
class LocationUnavailable extends LocationResult {
  LocationUnavailable({required this.denied});
  final bool denied;
}

abstract interface class LocationService {
  /// Call only after showing why (design system: the reason comes before the system prompt).
  Future<LocationResult> current();
}

/// District-level only, so a coarse fix is enough and nothing is stored.
class DeviceLocation implements LocationService {
  @override
  Future<LocationResult> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return LocationUnavailable(denied: false);
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        return LocationUnavailable(denied: true);
      }
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.low, timeLimit: Duration(seconds: 15)),
      );
      return LocationFound(p.latitude, p.longitude);
    } on Exception {
      return LocationUnavailable(denied: false);
    }
  }
}
