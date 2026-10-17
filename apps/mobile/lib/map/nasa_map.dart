import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../l10n/gen/app_localizations.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/source_link.dart';
import 'base_map.dart';
import 'map_data.dart';
import 'nasa_layers.g.dart';

/// NASA settings from WEB.map in apps/web/src/config.ts (test/map_test.dart fails if they drift).
abstract final class NasaMapConfig {
  /// Zoomed all the way out the map shows the whole world; below 2 the tiles repeat side by side.
  static const worldMinZoom = 2.0;

  /// Below this zoom FIRMS hotspots draw as small dots so a busy burning season stays readable.
  static const firmsMinZoom = 6.0;
  static const firmsRadiusSmall = 2.5;
  static const firmsRadiusFull = 5.0;
  static const eventIconSize = 28.0;
}

/// Menu order (NASA_RASTER_IDS on the web): the hazard layers first, the plain photo last.
const nasaRasterIds = ['imergRain', 'flood', 'aod', 'fireWms', 'trueColor'];

/// Which NASA layers are on. At most one GIBS raster: GIBS sends no-store, so each extra layer refetches on every pan.
@immutable
class NasaLayerState {
  const NasaLayerState({required this.firms, required this.events, this.raster});

  final bool firms;
  final bool events;
  final String? raster;

  /// Only FIRMS points start on (product owner, 2026-10-16), straight from packages/core.
  static final initial = NasaLayerState(
    firms: nasaPointLayers['firms']!.defaultOn,
    events: nasaPointLayers['events']!.defaultOn,
    raster: nasaLayers.values.where((l) => l.defaultOn).firstOrNull?.id,
  );

  bool get anyOn => firms || events || raster != null;

  NasaLayerState copyWith({bool? firms, bool? events, String? Function()? raster}) => NasaLayerState(
    firms: firms ?? this.firms,
    events: events ?? this.events,
    raster: raster == null ? this.raster : raster(),
  );

  Map<String, Object?> toJson() => {'firms': firms, 'events': events, 'raster': raster};

  /// Anything missing or unknown keeps its default; a raster id from an older build is dropped.
  factory NasaLayerState.fromJson(Object? j) {
    if (j is! Map) return initial;
    final raster = j['raster'];
    return NasaLayerState(
      firms: j['firms'] is bool ? j['firms'] as bool : initial.firms,
      events: j['events'] is bool ? j['events'] as bool : initial.events,
      raster: raster is String && nasaLayers.containsKey(raster) ? raster : null,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is NasaLayerState && other.firms == firms && other.events == events && other.raster == raster;

  @override
  int get hashCode => Object.hash(firms, events, raster);
}

/// Where the NASA layer choices are remembered (this device only, like the web's localStorage).
abstract interface class NasaLayerStore {
  Future<NasaLayerState?> read();
  Future<void> write(NasaLayerState state);
}

class DeviceNasaLayerStore implements NasaLayerStore {
  static const _key = 'mapNasaLayers';

  SharedPreferencesAsync? _prefs;

  /// Null where no preferences plugin is registered (widget tests): choices then last for this run only.
  SharedPreferencesAsync? get _p {
    try {
      return _prefs ??= SharedPreferencesAsync();
    } on Object {
      return null;
    }
  }

  @override
  Future<NasaLayerState?> read() async {
    try {
      final raw = await _p?.getString(_key);
      return raw == null ? null : NasaLayerState.fromJson(jsonDecode(raw));
    } on Object {
      return null;
    }
  }

  @override
  Future<void> write(NasaLayerState state) async {
    try {
      await _p?.setString(_key, jsonEncode(state.toJson()));
    } on Object {
      // Not remembered, still applied.
    }
  }
}

class MemoryNasaLayerStore implements NasaLayerStore {
  MemoryNasaLayerStore([this.saved]);

  NasaLayerState? saved;

  @override
  Future<NasaLayerState?> read() async => saved;

  @override
  Future<void> write(NasaLayerState state) async => saved = state;
}

/// The GIBS layer for flutter_map. Same day all day: [now] is reduced to its UTC day by the URL builders.
TileLayer gibsTileLayer(NasaLayer l, DateTime now, {TileProvider? tileProvider}) {
  final common = (
    maxNativeZoom: l.maxNativeZoom,
    // Overzoom to the base map's maximum: GIBS answers 400 above maxNativeZoom.
    maxZoom: MapConfig.maxZoom,
  );
  if (l.service == GibsService.wms) {
    final p = gibsWmsParams(l, now);
    return TileLayer(
      key: ValueKey('gibs:${l.id}:${p['TIME']}'),
      // flutter_map appends "&service=WMS…", so the base URL needs its "?".
      wmsOptions: WMSTileLayerOptions(
        baseUrl: '${gibsTileUrl(l, now)}?',
        layers: [p['LAYERS']!],
        format: p['FORMAT']!,
        // 1.3.0 is the version tested against GIBS; EPSG:3857 keeps x/y axis order there.
        version: '1.3.0',
        otherParameters: {'time': p['TIME']!},
      ),
      maxNativeZoom: common.maxNativeZoom,
      maxZoom: common.maxZoom,
      tileProvider: tileProvider,
      userAgentPackageName: 'com.pdouvch.hazardwatch',
    );
  }
  final url = gibsTileUrl(l, now);
  return TileLayer(
    key: ValueKey('gibs:${l.id}:$url'),
    urlTemplate: url,
    maxNativeZoom: common.maxNativeZoom,
    maxZoom: common.maxZoom,
    tileProvider: tileProvider,
    userAgentPackageName: 'com.pdouvch.hazardwatch',
  );
}

/// The day shown with a raster. WMS asks for an explicit day, so that one is exact; TIME=default lets GIBS pick its
/// newest day (usually yesterday UTC, give or take one), so it is shown as approximate.
({String date, bool approx}) gibsDataDate(NasaLayer l, DateTime now) {
  final day = gibsUtcYesterday(now);
  final wms = l.service == GibsService.wms;
  return (date: wms ? gibsWmsParams(l, now)['TIME']! : day, approx: l.time == GibsTime.defaultDay && !wms);
}

/// One FIRMS hotspot from runner.feeds.fires (FireHotspot in packages/core/src/types.ts).
class FirePoint {
  FirePoint.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      lat = ((j['location'] as Map)['lat'] as num).toDouble(),
      lng = ((j['location'] as Map)['lng'] as num).toDouble(),
      at = DateTime.parse(j['detectedAt'] as String),
      frp = (j['frp'] as num?)?.toDouble(),
      satellite = j['satellite'] as String;

  final String id;
  final double lat;
  final double lng;
  final DateTime at;

  /// Fire radiative power, MW.
  final double? frp;
  final String satellite;
}

/// One open EONET event from runner.feeds.events (NasaEvent in packages/core/src/types.ts).
class EventPoint {
  EventPoint.fromJson(Map<String, dynamic> j)
    : id = j['id'] as String,
      category = j['category'] as String,
      title = j['title'] as String,
      lat = ((j['location'] as Map)['lat'] as num).toDouble(),
      lng = ((j['location'] as Map)['lng'] as num).toDouble(),
      updatedAt = DateTime.parse(j['updatedAt'] as String),
      url = j['url'] as String?,
      track = [
        for (final p in (j['track'] as List? ?? const []).cast<Map<String, dynamic>>())
          (
            at: DateTime.parse(p['at'] as String),
            lat: ((p['location'] as Map)['lat'] as num).toDouble(),
            lng: ((p['location'] as Map)['lng'] as num).toDouble(),
            windKts: (p['windKts'] as num?)?.toDouble(),
          ),
      ]..sort((a, b) => a.at.compareTo(b.at));

  final String id;

  /// severeStorms, volcanoes, floods or landslides.
  final String category;

  /// English only from EONET; the UI prefixes a localized category word.
  final String title;
  final double lat;
  final double lng;
  final DateTime updatedAt;
  final String? url;

  /// Oldest first.
  final List<({DateTime at, double lat, double lng, double? windKts})> track;

  /// Wind of the newest track point.
  double? get windKts => track.lastOrNull?.windKts;
}

/// Unreadable rows are skipped rather than failing the whole map.
List<T> _parse<T>(SourceFeed? f, T Function(Map<String, dynamic>) read) => [
  for (final j in f?.items ?? const <Map<String, dynamic>>[])
    if (_tryParse(j, read) case final T v) v,
];

T? _tryParse<T>(Map<String, dynamic> j, T Function(Map<String, dynamic>) read) {
  try {
    return read(j);
  } on Object {
    return null;
  }
}

List<FirePoint> firePoints(MapSnapshot s) => _parse(s.feeds['fires'], FirePoint.fromJson);
List<EventPoint> eventPoints(MapSnapshot s) => _parse(s.feeds['events'], EventPoint.fromJson);

/// Newest item time, falling back to when the runner fetched the feed (feedTime on the web).
DateTime? nasaFeedTime(MapSnapshot? s, String key) {
  final f = s?.feeds[key];
  if (f == null) return null;
  DateTime? best;
  for (final j in f.items) {
    final v = DateTime.tryParse((key == 'fires' ? j['detectedAt'] : j['updatedAt']) as String? ?? '');
    if (v != null && (best == null || v.isAfter(best))) best = v;
  }
  return best ?? f.fetchedAt;
}

/// Orange like the warning tone, but small dots so it is not read as a severity (WEB.map.fireColor). Taken from the
/// base palettes, not the colour-blind swap, since it is not a severity: the light theme's warning ink (the warning fill
/// is 2.8:1 on the light base map), the dark theme's warning fill (5.9:1 on the dark base map).
Color fireColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? HwColors.dark.sevWarning : HwColors.light.sevWarningInk;

/// WEB.map.eventColor: brand navy in light. In dark the navy disappears into the dark base map (1.1:1), so events use
/// the theme's ink (light on dark) with its onInk glyph instead.
Color eventColor(BuildContext context) => context.hw.ink;

IconData eventIcon(String category) => switch (category) {
  'severeStorms' => Icons.cyclone,
  'volcanoes' => Icons.volcano,
  'floods' => Icons.water,
  'landslides' => Icons.landslide,
  _ => Icons.public,
};

String eventName(AppLocalizations l, String category) => switch (category) {
  'severeStorms' => l.nasaEventSevereStorms,
  'volcanoes' => l.nasaEventVolcanoes,
  'floods' => l.nasaEventFloods,
  'landslides' => l.nasaEventLandslides,
  _ => l.layerNasaEvents,
};

String nasaLayerName(AppLocalizations l, String id) => switch (id) {
  'firms' => l.layerNasaFirms,
  'events' => l.layerNasaEvents,
  'imergRain' => l.layerNasaImergRain,
  'flood' => l.layerNasaFlood,
  'aod' => l.layerNasaAod,
  'trueColor' => l.layerNasaTrueColor,
  'fireWms' => l.layerNasaFireWms,
  _ => id,
};

/// FIRMS hotspots: up to a few thousand in burning season, so one canvas layer of dots with a shared tap handler
/// instead of a widget per point.
class FireLayer extends StatefulWidget {
  const FireLayer({super.key, required this.fires, required this.onTap});

  final List<FirePoint> fires;
  final void Function(FirePoint fire) onTap;

  @override
  State<FireLayer> createState() => _FireLayerState();
}

class _FireLayerState extends State<FireLayer> {
  final _hit = LayerHitNotifier<FirePoint>(null);

  @override
  void dispose() {
    _hit.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final full = MapCamera.of(context).zoom >= NasaMapConfig.firmsMinZoom;
    final radius = full ? NasaMapConfig.firmsRadiusFull : NasaMapConfig.firmsRadiusSmall;
    final fire = fireColor(context).withValues(alpha: 0.9);
    return GestureDetector(
      onTap: () {
        final hit = _hit.value?.hitValues.firstOrNull;
        if (hit != null) widget.onTap(hit);
      },
      child: CircleLayer<FirePoint>(
        hitNotifier: _hit,
        circles: [
          for (final f in widget.fires)
            CircleMarker(
              point: LatLng(f.lat, f.lng),
              radius: radius,
              color: fire,
              borderColor: Colors.white,
              borderStrokeWidth: full ? 1 : 0.5,
              hitValue: f,
            ),
        ],
      ),
    );
  }
}

/// Storms' recent tracks as dashed lines, under the event markers.
PolylineLayer eventTrackLayer(BuildContext context, List<EventPoint> events) => PolylineLayer(
  polylines: [
    for (final e in events)
      if (e.track.length > 1)
        Polyline(
          points: [for (final p in e.track) LatLng(p.lat, p.lng)],
          color: eventColor(context).withValues(alpha: 0.7),
          strokeWidth: 2,
          pattern: StrokePattern.dashed(segments: const [6, 6]),
        ),
  ],
);

/// An EONET event: brand circle with its own glyph, ringed so it reads as "far away, satellite".
class EventPin extends StatelessWidget {
  const EventPin({super.key, required this.category});

  final String category;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    return Container(
      width: NasaMapConfig.eventIconSize,
      height: NasaMapConfig.eventIconSize,
      decoration: BoxDecoration(
        color: eventColor(context),
        shape: BoxShape.circle,
        border: Border.all(color: c.surface, width: 2),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 3, offset: Offset(0, 1))],
      ),
      child: Icon(eventIcon(category), size: NasaMapConfig.eventIconSize * 0.62, color: c.onInk),
    );
  }
}

/// NASA credits for the layers that are on, shown on the map above the base map credits.
List<String> nasaCredits(NasaLayerState s) => [
  if (s.raster case final id?) nasaLayers[id]!.attribution,
  if (s.firms && !(s.raster != null && nasaLayers[s.raster]!.attribution.contains(NasaAttribution.firms)))
    NasaAttribution.firms,
  if (s.events) NasaAttribution.eonet,
];

/// The NASA names inside the credit lines above, each linked to its own site (ids in lib/sources_meta.g.dart), in the
/// order they appear in a credit line. Pass to [SourceText] with the credit text: the visible text stays NASA's own.
List<SourceRef> get nasaSourceRefs => [
  ?sourceRef('NASA EOSDIS GIBS / Worldview', 'nasa-gibs'),
  ?sourceRef('NASA FIRMS', 'nasa-firms'),
  ?sourceRef('NASA EONET', 'nasa-eonet'),
];

/// Legend text for a message key from packages/core (NasaLegend.stops[].labelKey / noteKey).
String nasaLegendText(AppLocalizations l, String key) => switch (key) {
  'nasa.legend.flood.surface' => l.nasaLegendFloodSurface,
  'nasa.legend.flood.recurring' => l.nasaLegendFloodRecurring,
  'nasa.legend.flood.flood' => l.nasaLegendFloodFlood,
  'nasa.legend.flood.noData' => l.nasaLegendFloodNoData,
  'nasa.legend.flood.note' => l.nasaLegendFloodNote,
  'nasa.legend.rain.r01' => l.nasaLegendRainR01,
  'nasa.legend.rain.r1' => l.nasaLegendRainR1,
  'nasa.legend.rain.r5' => l.nasaLegendRainR5,
  'nasa.legend.rain.r20' => l.nasaLegendRainR20,
  'nasa.legend.rain.r50' => l.nasaLegendRainR50,
  'nasa.legend.rain.note' => l.nasaLegendRainNote,
  'nasa.legend.aod.low' => l.nasaLegendAodLow,
  'nasa.legend.aod.a02' => l.nasaLegendAodA02,
  'nasa.legend.aod.a04' => l.nasaLegendAodA04,
  'nasa.legend.aod.a06' => l.nasaLegendAodA06,
  'nasa.legend.aod.high' => l.nasaLegendAodHigh,
  'nasa.legend.aod.note' => l.nasaLegendAodNote,
  _ => key,
};

/// The legend of the raster that is on, if it has one (photos and the fire layer do not).
NasaLegend? nasaLegend(NasaLayerState s) => s.raster == null ? null : nasaLayers[s.raster]?.legend;

/// What a raster's colours mean: swatches for classes, a gradient bar for a ramp, always with text labels so the
/// colour is never the only cue. Screen readers hear the layer name and the labels in order. [note] adds the
/// layer's caveat (resolution, cloud) below, for the layer sheet; the map shows the compact form.
class NasaLegendView extends StatelessWidget {
  const NasaLegendView({super.key, required this.layerId, required this.legend, this.note = false});

  final String layerId;
  final NasaLegend legend;
  final bool note;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final style = Theme.of(context).textTheme.labelSmall!.copyWith(color: c.ink);
    final labels = [for (final s in legend.stops) nasaLegendText(l, s.labelKey)];
    final scale = switch (legend.kind) {
      NasaLegendKind.classes => Wrap(
        spacing: HwSize.space2,
        runSpacing: 2,
        children: [
          for (final (i, s) in legend.stops.indexed)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  key: ValueKey('nasa-legend-swatch:${s.labelKey}'),
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: s.color,
                    border: Border.all(color: c.line),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: HwSize.space1),
                Text(labels[i], style: style),
              ],
            ),
        ],
      ),
      NasaLegendKind.ramp => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            key: const ValueKey('nasa-legend-ramp'),
            height: 8,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [for (final s in legend.stops) s.color]),
              border: Border.all(color: c.line),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 2),
          // Low end left, high end right; wraps instead of overflowing at large text sizes.
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: HwSize.space1,
            children: [for (final t in labels) Text(t, style: style)],
          ),
        ],
      ),
    };
    final labelled = Semantics(
      container: true,
      label: '${nasaLayerName(l, layerId)}: ${labels.join(', ')}',
      excludeSemantics: true,
      child: scale,
    );
    return Column(
      key: ValueKey('nasa-legend:$layerId'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        labelled,
        if (note) ...[
          const SizedBox(height: HwSize.space1),
          Text(
            nasaLegendText(l, legend.noteKey),
            key: ValueKey('nasa-legend-note:$layerId'),
            style: Theme.of(context).textTheme.bodySmall!.copyWith(color: c.inkMuted),
          ),
        ],
      ],
    );
  }
}
