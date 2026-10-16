// GENERATED from packages/core/src/nasa.ts by tool/gen_nasa.mjs. Do not edit.

enum GibsService { wmts, wms }

/// `defaultDay` lets GIBS pick its newest day; `yesterday` is the UTC day before (WMS has no TIME=default).
enum GibsTime { defaultDay, yesterday }

/// One GIBS raster layer (NasaLayer in packages/core/src/nasa.ts).
class NasaLayer {
  const NasaLayer({
    required this.id,
    required this.gibsLayer,
    required this.service,
    required this.format,
    required this.maxNativeZoom,
    required this.time,
    required this.opacity,
    required this.defaultOn,
    required this.attribution,
  });

  final String id;
  final String gibsLayer;
  final GibsService service;
  final String format;

  /// GIBS answers 400 above this zoom, so the map must overzoom.
  final int maxNativeZoom;
  final GibsTime time;
  final double opacity;
  final bool defaultOn;
  final String attribution;
}

/// Drawn from our own snapshot, not GIBS.
class NasaPointLayer {
  const NasaPointLayer({required this.id, required this.defaultOn, required this.attribution});

  final String id;
  final bool defaultOn;
  final String attribution;
}

abstract final class Gibs {
  static const wmts = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
  static const wms = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
}

abstract final class NasaAttribution {
  static const gibs = 'Imagery: NASA EOSDIS GIBS / Worldview';
  static const firms = 'Fires: NASA FIRMS (LANCE/ESDIS)';
  static const eonet = 'Events: NASA EONET';
}

const Map<String, NasaLayer> nasaLayers = {
  'imergRain': NasaLayer(
    id: 'imergRain',
    gibsLayer: 'IMERG_Precipitation_Rate_30min',
    service: GibsService.wmts,
    format: 'png',
    maxNativeZoom: 6,
    time: GibsTime.defaultDay,
    opacity: 0.7,
    defaultOn: false,
    attribution: 'Imagery: NASA EOSDIS GIBS / Worldview · IMERG: NASA GPM',
  ),
  'flood': NasaLayer(
    id: 'flood',
    gibsLayer: 'VIIRS_Combined_Flood_2-Day',
    service: GibsService.wmts,
    format: 'png',
    maxNativeZoom: 9,
    time: GibsTime.defaultDay,
    opacity: 0.8,
    defaultOn: false,
    attribution: 'Imagery: NASA EOSDIS GIBS / Worldview · Flood: NASA LANCE MODIS/VIIRS NRT Global Flood Product',
  ),
  'aod': NasaLayer(
    id: 'aod',
    gibsLayer: 'VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean',
    service: GibsService.wmts,
    format: 'png',
    maxNativeZoom: 6,
    time: GibsTime.defaultDay,
    opacity: 0.6,
    defaultOn: false,
    attribution: 'Imagery: NASA EOSDIS GIBS / Worldview',
  ),
  'trueColor': NasaLayer(
    id: 'trueColor',
    gibsLayer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    service: GibsService.wmts,
    format: 'jpg',
    maxNativeZoom: 9,
    time: GibsTime.defaultDay,
    opacity: 1.0,
    defaultOn: false,
    attribution: 'Imagery: NASA EOSDIS GIBS / Worldview',
  ),
  'fireWms': NasaLayer(
    id: 'fireWms',
    gibsLayer: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
    service: GibsService.wms,
    format: 'png',
    maxNativeZoom: 8,
    time: GibsTime.yesterday,
    opacity: 1.0,
    defaultOn: false,
    attribution: 'Imagery: NASA EOSDIS GIBS / Worldview · Fires: NASA FIRMS (LANCE/ESDIS)',
  ),
};

const Map<String, NasaPointLayer> nasaPointLayers = {
  'firms': NasaPointLayer(id: 'firms', defaultOn: true, attribution: 'Fires: NASA FIRMS (LANCE/ESDIS)'),
  'events': NasaPointLayer(id: 'events', defaultOn: false, attribution: 'Events: NASA EONET'),
};

/// GIBS dates daily products by UTC day.
String gibsUtcYesterday(DateTime now) =>
    now.toUtc().subtract(const Duration(days: 1)).toIso8601String().substring(0, 10);

/// WMTS template with {z}/{y}/{x}; WMS layers get the base URL (pair with [gibsWmsParams]).
String gibsTileUrl(NasaLayer l, DateTime now) {
  if (l.service == GibsService.wms) return Gibs.wms;
  final time = l.time == GibsTime.defaultDay ? 'default' : gibsUtcYesterday(now);
  return '${Gibs.wmts}/${l.gibsLayer}/default/$time/GoogleMapsCompatible_Level${l.maxNativeZoom}/{z}/{y}/{x}.${l.format}';
}

/// WMS has no TIME=default, so any layer asked for over WMS uses yesterday: today's file is still filling.
Map<String, String> gibsWmsParams(NasaLayer l, DateTime now) => {
  'LAYERS': l.gibsLayer,
  'FORMAT': 'image/${l.format == 'jpg' ? 'jpeg' : 'png'}',
  'TRANSPARENT': 'true',
  'TIME': gibsUtcYesterday(now),
};
