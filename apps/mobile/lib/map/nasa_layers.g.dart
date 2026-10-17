// GENERATED from packages/core/src/nasa.ts by tool/gen_nasa.mjs. Do not edit.

import 'dart:ui' show Color;

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
    this.legend,
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

  /// What the colours mean, from GIBS' own colormap; null for photos and layers whose colour is self-explanatory.
  final NasaLegend? legend;
}

/// `classes`: one swatch per category; `ramp`: a continuous scale labelled at a few points.
enum NasaLegendKind { classes, ramp }

class NasaLegendStop {
  const NasaLegendStop({required this.color, required this.labelKey});

  final Color color;

  /// A message key from packages/core/src/i18n/messages.ts (see nasaLegendText).
  final String labelKey;
}

/// NasaLegend in packages/core/src/nasa.ts.
class NasaLegend {
  const NasaLegend({required this.kind, required this.stops, required this.noteKey});

  final NasaLegendKind kind;
  final List<NasaLegendStop> stops;
  final String noteKey;
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
    legend: NasaLegend(
      kind: NasaLegendKind.ramp,
      stops: [
        NasaLegendStop(color: Color(0xff00764e), labelKey: 'nasa.legend.rain.r01'),
        NasaLegendStop(color: Color(0xffc3e400), labelKey: 'nasa.legend.rain.r1'),
        NasaLegendStop(color: Color(0xffff4730), labelKey: 'nasa.legend.rain.r5'),
        NasaLegendStop(color: Color(0xff9c0000), labelKey: 'nasa.legend.rain.r20'),
        NasaLegendStop(color: Color(0xff3f0000), labelKey: 'nasa.legend.rain.r50'),
      ],
      noteKey: 'nasa.legend.rain.note',
    ),
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
    legend: NasaLegend(
      kind: NasaLegendKind.classes,
      stops: [
        NasaLegendStop(color: Color(0xff32d2f5), labelKey: 'nasa.legend.flood.surface'),
        NasaLegendStop(color: Color(0xffffff00), labelKey: 'nasa.legend.flood.recurring'),
        NasaLegendStop(color: Color(0xfffa1e24), labelKey: 'nasa.legend.flood.flood'),
        NasaLegendStop(color: Color(0xffafafaf), labelKey: 'nasa.legend.flood.noData'),
      ],
      noteKey: 'nasa.legend.flood.note',
    ),
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
    legend: NasaLegend(
      kind: NasaLegendKind.ramp,
      stops: [
        NasaLegendStop(color: Color(0xfffffcc7), labelKey: 'nasa.legend.aod.low'),
        NasaLegendStop(color: Color(0xffffc648), labelKey: 'nasa.legend.aod.a02'),
        NasaLegendStop(color: Color(0xffff621b), labelKey: 'nasa.legend.aod.a04'),
        NasaLegendStop(color: Color(0xffd3070c), labelKey: 'nasa.legend.aod.a06'),
        NasaLegendStop(color: Color(0xff9b000e), labelKey: 'nasa.legend.aod.high'),
      ],
      noteKey: 'nasa.legend.aod.note',
    ),
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
