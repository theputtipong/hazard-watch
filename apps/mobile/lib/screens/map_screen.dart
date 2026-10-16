import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../api/hazard_api.dart';
import '../bma/device_bma.dart';
import '../format.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../map/base_map.dart';
import '../map/map_data.dart';
import '../map/map_markers.dart';
import '../map/nasa_layers.g.dart';
import '../map/nasa_map.dart';
import '../settings.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/reading_tile.dart';
import '../widgets/source_link.dart';

/// The web map's hazards on OpenFreeMap tiles: street flooding, rain, canal levels, PM2.5 and earthquakes, coloured by
/// severity, plus NASA layers (FIRMS hotspots, EONET events, one GIBS raster) that reach out to the whole world.
/// Tap a pin for its reading. Loads only once the tab is first opened.
class MapScreen extends StatefulWidget {
  const MapScreen({
    super.key,
    required this.settings,
    required this.api,
    required this.location,
    required this.clock,
    this.bma,
    this.baseMap,
    this.nasaStore,
    this.tileProvider,
  });

  final AppSettings settings;
  final HazardApi api;
  final LocationService location;
  final DateTime Function() clock;

  /// BMA flood/rain fetched on this phone when the server's copy fails; null turns it off.
  final DeviceBma? bma;

  /// Replaces the network base map (tests).
  final Widget Function(BuildContext context, bool dark, String lang)? baseMap;

  /// Where NASA layer choices are remembered; defaults to this device's preferences.
  final NasaLayerStore? nasaStore;

  /// Replaces the network GIBS tile fetcher (tests).
  final TileProvider? tileProvider;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  /// Same as WEB.refreshMs: reopening the tab after this reloads.
  static const _refreshAfter = Duration(minutes: 2);

  final _map = MapController();
  bool _mapReady = false;
  bool _shown = false;
  MapSnapshot? _snapshot;
  Map<BmaKind, BmaCopy?> _device = const {};
  ApiException? _error;
  bool _loading = false;
  DateTime? _loadedAt;
  Set<MapLayer> _layers = {...defaultMapLayers};
  LatLng? _you;
  bool _locating = false;
  String? _hint;
  String? _districtId;
  late final NasaLayerStore _nasaStore = widget.nasaStore ?? DeviceNasaLayerStore();
  NasaLayerState _nasa = NasaLayerState.initial;
  bool _nasaTouched = false;

  @override
  void initState() {
    super.initState();
    _districtId = widget.settings.district?.id;
    widget.settings.addListener(_onSettings);
    _loadNasa();
  }

  Future<void> _loadNasa() async {
    final saved = await _nasaStore.read();
    // A choice made while the read was pending wins over the saved one.
    if (saved != null && mounted && !_nasaTouched) setState(() => _nasa = saved);
  }

  void _setNasa(NasaLayerState next) {
    _nasaTouched = true;
    setState(() => _nasa = next);
    _nasaStore.write(next);
  }

  Future<void> _openNasaSheet() => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (context) => StatefulBuilder(
      // The sheet keeps its own copy so its switches move as they are tapped.
      builder: (context, setSheet) => NasaLayerSheet(
        state: _nasa,
        snapshot: _snapshot,
        now: widget.clock(),
        onChanged: (next) {
          _setNasa(next);
          setSheet(() {});
        },
      ),
    ),
  );

  @override
  void dispose() {
    widget.settings.removeListener(_onSettings);
    _map.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Every tab stays built (IndexedStack), and hidden tabs have tickers off: wait until this one is shown.
    if (!TickerMode.valuesOf(context).enabled) return;
    _shown = true;
    if (_loading) return;
    final at = _loadedAt;
    if (at == null || widget.clock().difference(at) >= _refreshAfter) _load();
  }

  void _onSettings() {
    final id = widget.settings.district?.id;
    if (id == _districtId) return;
    _districtId = id;
    setState(() {});
    if (_mapReady) _goToArea();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final snapshot = await widget.api.snapshot();
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _error = null;
        _loadedAt = widget.clock();
      });
      await _loadDevice(snapshot);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadDevice(MapSnapshot s) async {
    final bma = widget.bma;
    if (bma == null) return;
    final now = widget.clock();
    final kinds = [
      for (final k in BmaKind.values)
        if (needsDeviceFeed(s.feeds[k.topic], now)) k,
    ];
    if (kinds.isEmpty) return;
    final copies = await Future.wait([for (final k in kinds) bma.get(k, now)]);
    if (!mounted) return;
    setState(() => _device = {for (var i = 0; i < kinds.length; i++) kinds[i]: copies[i]});
  }

  LatLng get _areaCenter {
    final d = widget.settings.district;
    return d == null ? MapConfig.regionCenter : LatLng(d.lat, d.lng);
  }

  double get _areaZoom => widget.settings.district == null ? MapConfig.regionZoom : MapConfig.areaZoom;

  void _goToArea() {
    setState(() => _hint = null);
    _map.move(_areaCenter, _areaZoom);
  }

  Future<void> _goToMe() async {
    final l = AppLocalizations.of(context);
    final you = _you;
    if (you != null) {
      _map.move(you, MapConfig.locateZoom);
      return;
    }
    // Design system: the reason shows before the system prompt.
    setState(() {
      _locating = true;
      _hint = l.mapLocationWhy;
    });
    final fix = await widget.location.current();
    if (!mounted) return;
    setState(() {
      _locating = false;
      _hint = switch (fix) {
        LocationFound() => null,
        LocationUnavailable(denied: true) => l.mapLocationOff,
        LocationUnavailable() => l.mapNoFix,
      };
      if (fix is LocationFound) _you = LatLng(fix.lat, fix.lng);
    });
    if (_you != null) _map.move(_you!, MapConfig.locateZoom);
  }

  @override
  Widget build(BuildContext context) {
    // No tiles are downloaded until the person opens the map.
    if (!_shown) return const SizedBox.expand();
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final lang = Localizations.localeOf(context).languageCode;
    final now = widget.clock();
    final center = _areaCenter;
    final snapshot = _snapshot;
    final data = snapshot == null
        ? null
        : buildMapData(
            snapshot,
            deviceFlood: _device[BmaKind.flood],
            deviceRain: _device[BmaKind.rain],
            refLat: center.latitude,
            refLng: center.longitude,
            now: now,
          );
    final points = [
      for (final p in data?.points ?? const <MapPoint>[])
        if (_layers.contains(p.layer)) p,
    ];
    final nasa = _nasa;
    final fires = nasa.firms && snapshot != null ? firePoints(snapshot) : const <FirePoint>[];
    final events = nasa.events && snapshot != null ? eventPoints(snapshot) : const <EventPoint>[];

    return Stack(
      children: [
        ColoredBox(
          color: c.surfaceSunken,
          child: FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: center,
              initialZoom: _areaZoom,
              minZoom: NasaMapConfig.worldMinZoom,
              maxZoom: MapConfig.maxZoom,
              backgroundColor: c.surfaceSunken,
              interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
              onMapReady: () => _mapReady = true,
            ),
            children: [
              widget.baseMap?.call(context, dark, lang) ?? BaseMap(dark: dark, lang: lang),
              if (nasa.raster case final id?) gibsTileLayer(nasaLayers[id]!, now, tileProvider: widget.tileProvider),
              if (events.isNotEmpty) eventTrackLayer(events),
              if (fires.isNotEmpty) FireLayer(fires: fires, onTap: (f) => _showFire(f, now)),
              if (events.isNotEmpty) MarkerLayer(markers: [for (final e in events) _eventMarker(context, e, now)]),
              MarkerLayer(
                markers: [
                  for (final p in points) _marker(context, p, now),
                  if (_you != null)
                    Marker(
                      point: _you!,
                      width: PinSize.you,
                      height: PinSize.you,
                      child: Semantics(label: l.mapYou, child: const YouPin()),
                    ),
                ],
              ),
              if (nasa.anyOn) _NasaCredits(state: nasa, snapshot: snapshot, now: now),
              const BaseMapAttribution(),
            ],
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.only(top: HwSize.space2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _LayerChips(
                  selected: _layers,
                  onChanged: (layer, on) =>
                      setState(() => _layers = on ? {..._layers, layer} : ({..._layers}..remove(layer))),
                ),
                if (_status(l, snapshot, now) case final status?)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(HwSize.space4, HwSize.space2, HwSize.space4, 0),
                    child: _StatusPill(text: status, onRetry: _error != null && !_loading ? _load : null),
                  ),
              ],
            ),
          ),
        ),
        Positioned(
          right: HwSize.space4,
          bottom: HwSize.space6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            spacing: HwSize.space2,
            children: [
              if (_hint != null)
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 240),
                  child: _StatusPill(text: _hint!),
                ),
              // NASA layers get their own sheet (seven of them) rather than more chips; outlined while any is on.
              _MapButton(
                key: const ValueKey('nasa-button'),
                icon: Icons.satellite_alt,
                tooltip: 'NASA · ${l.mapLayers}',
                active: nasa.anyOn,
                onPressed: _openNasaSheet,
              ),
              _MapButton(
                icon: Icons.my_location,
                tooltip: _locating ? l.mapLocating : l.mapLocate,
                busy: _locating,
                onPressed: _locating ? null : _goToMe,
              ),
              _MapButton(
                icon: widget.settings.district == null ? Icons.zoom_out_map : Icons.home_work_outlined,
                tooltip: widget.settings.district == null ? l.mapFitRegion : l.mapArea,
                onPressed: _goToArea,
              ),
            ],
          ),
        ),
      ],
    );
  }

  String? _status(AppLocalizations l, MapSnapshot? snapshot, DateTime now) {
    final e = _error;
    if (e != null) {
      if (e is NotSupportedException) return l.homeNotDeployed;
      final at = _loadedAt;
      return snapshot != null && at != null ? l.commonOfflineAt(clockText(l, at, now)) : l.extLoadFailed;
    }
    return snapshot == null ? l.commonLoading : null;
  }

  Marker _marker(BuildContext context, MapPoint p, DateTime now) {
    final l = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    final style = pinStyle(p);
    final hit = style.shape == PinShape.dot ? PinSize.hitSmall : PinSize.hit;
    return Marker(
      key: ValueKey(p.id),
      point: LatLng(p.lat, p.lng),
      width: style.size.width < hit ? hit : style.size.width,
      height: hit,
      child: Semantics(
        button: true,
        label: l.mapPin(layerName(l, p.layer), p.name.of(locale), p.level.label(locale)),
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => showPointSheet(context, p, now: now, area: _areaName(l, locale)),
          child: Center(
            child: Opacity(
              opacity: p.stale ? _staleOpacity : 1,
              child: HazardPin(style: style),
            ),
          ),
        ),
      ),
    );
  }

  Marker _eventMarker(BuildContext context, EventPoint e, DateTime now) {
    final l = AppLocalizations.of(context);
    const hit = PinSize.hit;
    return Marker(
      key: ValueKey('event:${e.id}'),
      point: LatLng(e.lat, e.lng),
      width: hit,
      height: hit,
      child: Semantics(
        button: true,
        label: '${eventName(l, e.category)}: ${e.title}',
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => _showSheet(
            title: '${eventName(l, e.category)}: ${e.title}',
            lines: [if (e.windKts != null) '${numberText(e.windKts!)} kt', clockText(l, e.updatedAt, now)],
            credit: NasaAttribution.eonet,
            // The event's own EONET page when the feed gives one, else EONET itself.
            source: sourceRef('NASA EONET ↗', 'nasa-eonet', url: e.url),
          ),
          child: Center(child: EventPin(category: e.category)),
        ),
      ),
    );
  }

  void _showFire(FirePoint f, DateTime now) {
    final l = AppLocalizations.of(context);
    _showSheet(
      title: l.layerNasaFirms,
      lines: [
        [if (f.frp != null) 'FRP ${f.frp!.round()} MW', f.satellite].join(' · '),
        clockText(l, f.at, now),
      ],
      credit: NasaAttribution.firms,
      source: sourceRef('NASA FIRMS ↗', 'nasa-firms'),
    );
  }

  Future<void> _showSheet({
    required String title,
    required List<String> lines,
    required String credit,
    SourceRef? source,
  }) => showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (context) {
      final text = Theme.of(context).textTheme;
      final c = context.hw;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(HwSize.space4, 0, HwSize.space4, HwSize.space4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: HwSize.space2,
            children: [
              Semantics(header: true, child: Text(title, style: text.titleLarge)),
              for (final line in lines) Text(line, style: text.bodyLarge),
              if (source != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: SourceLink(label: source.name, url: source.url),
                ),
              Text(credit, style: text.bodySmall!.copyWith(color: c.inkMuted)),
            ],
          ),
        ),
      );
    },
  );

  String _areaName(AppLocalizations l, Locale locale) => widget.settings.district?.name.of(locale) ?? l.mapBangkok;
}

/// WEB.map.staleOpacity: old readings stay visible but fade back.
const _staleOpacity = 0.4;

String layerName(AppLocalizations l, MapLayer layer) => switch (layer) {
  MapLayer.flood => l.layerFlood,
  MapLayer.rain => l.layerRain,
  MapLayer.water => l.layerWater,
  MapLayer.pm25 => l.layerPm25,
  MapLayer.quake => l.layerQuake,
};

/// A sample pin per layer, so the chips double as the legend.
PinStyle _legendPin(MapLayer layer) => switch (layer) {
  MapLayer.flood => const PinStyle(
    shape: PinShape.circle,
    size: Size.square(18),
    level: HwLevel.watch,
    icon: Icons.water_drop,
  ),
  MapLayer.rain => const PinStyle(shape: PinShape.pill, size: Size(26, 18), level: HwLevel.watch, icon: Icons.umbrella),
  MapLayer.water => const PinStyle(shape: PinShape.roundedSquare, size: Size.square(18), level: HwLevel.watch),
  MapLayer.pm25 => const PinStyle(shape: PinShape.circle, size: Size.square(18), level: HwLevel.watch),
  MapLayer.quake => const PinStyle(shape: PinShape.diamond, size: Size.square(20), level: HwLevel.watch),
};

class _LayerChips extends StatelessWidget {
  const _LayerChips({required this.selected, required this.onChanged});

  final Set<MapLayer> selected;
  final void Function(MapLayer layer, bool on) onChanged;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    return Semantics(
      label: l.mapLayers,
      container: true,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: HwSize.space4),
        child: Row(
          spacing: HwSize.space2,
          children: [
            for (final layer in MapLayer.values)
              FilterChip(
                avatar: HazardPin(style: _legendPin(layer)),
                label: Text(layerName(l, layer)),
                selected: selected.contains(layer),
                showCheckmark: false,
                backgroundColor: c.surface,
                selectedColor: c.surface,
                side: BorderSide(
                  color: selected.contains(layer) ? c.ink : c.line,
                  width: selected.contains(layer) ? 2 : 1,
                ),
                elevation: 1,
                onSelected: (on) => onChanged(layer, on),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.text, this.onRetry});

  final String text;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    return Align(
      alignment: Alignment.center,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: HwSize.space3, vertical: HwSize.space2),
        decoration: BoxDecoration(
          color: c.ink.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(HwSize.radiusControl),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: HwSize.space2,
          children: [
            Flexible(
              child: Text(text, style: Theme.of(context).textTheme.bodySmall!.copyWith(color: c.onInk)),
            ),
            if (onRetry != null)
              TextButton(
                onPressed: onRetry,
                style: TextButton.styleFrom(foregroundColor: c.onInk),
                child: Text(l.commonRetry),
              ),
          ],
        ),
      ),
    );
  }
}

class _MapButton extends StatelessWidget {
  const _MapButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.busy = false,
    this.active = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool busy;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    return Material(
      color: c.surface,
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(HwSize.radiusControl),
        side: BorderSide(color: active ? c.ink : c.line, width: active ? 2 : 1),
      ),
      child: IconButton(
        tooltip: tooltip,
        onPressed: onPressed,
        constraints: const BoxConstraints.tightFor(width: HwSize.touchTarget, height: HwSize.touchTarget),
        icon: busy
            ? SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2, color: c.accent))
            : Icon(icon, color: c.accent),
      ),
    );
  }
}

/// One point's reading, worded as the home screen words it.
Future<void> showPointSheet(BuildContext context, MapPoint p, {required DateTime now, required String area}) =>
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => PointSheet(point: p, now: now, area: area),
    );

class PointSheet extends StatelessWidget {
  const PointSheet({super.key, required this.point, required this.now, required this.area});

  final MapPoint point;
  final DateTime now;

  /// The place quake distances are measured from.
  final String area;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    final text = Theme.of(context).textTheme;
    final p = point;
    final place = p.name.of(locale);
    final what = layerName(l, p.layer);
    final v = p.value;
    final (value, unit) = switch (p.layer) {
      MapLayer.flood => (v == null ? '—' : numberText(v), v == null ? null : l.unitCm),
      MapLayer.rain => (numberText(v!), l.mapRainUnit),
      MapLayer.water => ('${v!.round()}%', l.waterOfBank),
      MapLayer.pm25 => (numberText(v!), p.unit),
      MapLayer.quake => ('M${v!.toStringAsFixed(1)}', null),
    };
    final note = p.stale
        ? l.freshStale(clockText(l, p.at, now))
        : switch (p.layer) {
            MapLayer.flood => switch (p.level) {
              HwLevel.danger => l.floodDeep,
              HwLevel.warning => l.floodFlooded,
              HwLevel.watch => l.floodMinor,
              HwLevel.normal => l.floodNormal,
            },
            MapLayer.rain => switch (p.level) {
              HwLevel.normal => l.noteRainOk,
              HwLevel.watch => l.noteRainWatch,
              HwLevel.warning => l.noteRainWarn,
              HwLevel.danger => l.noteRainDanger,
            },
            MapLayer.water => switch (p.level) {
              HwLevel.normal => l.gaugeStateOk,
              HwLevel.watch => l.gaugeStateWatch,
              HwLevel.warning => l.gaugeStateWarn,
              HwLevel.danger => l.gaugeStateDanger,
            },
            MapLayer.pm25 => switch (p.level) {
              HwLevel.normal => l.notePm25Ok,
              HwLevel.watch => l.notePm25Watch,
              HwLevel.warning => l.notePm25Warn,
              HwLevel.danger => l.notePm25Danger,
            },
            MapLayer.quake => [
              l.mapQuakeFrom(area, kmText(p.km!)),
              if (p.depthKm != null) l.mapQuakeDepth(numberText(p.depthKm!)),
            ].join(' · '),
          };
    final meta = [
      '${l.commonSource} ${sourceName(l, p.source)}',
      '${l.popupTime} ${clockText(l, p.at, now)}',
      if (p.onDevice) l.readingOnDevice,
    ].join(' · ');

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(HwSize.space4, 0, HwSize.space4, HwSize.space4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: HwSize.space3,
          children: [
            Semantics(header: true, child: Text(place, style: text.titleLarge)),
            ReadingList(
              children: [
                ReadingTile(
                  label: what,
                  value: value,
                  unit: unit,
                  level: p.level,
                  stale: p.stale,
                  note: note,
                  meta: meta,
                  sources: [?sourceRef(sourceName(l, p.source), p.source, url: p.url)],
                  semantics: l.readingSemantics(what, place, p.stale ? '—' : value, p.level.label(locale), note),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _day(AppLocalizations l, String isoDay) => DateFormat('d MMM', l.localeName).format(DateTime.parse(isoDay));

/// "Satellite image from ≈ 15 Oct" for a raster; WMS days are exact.
String nasaRasterDate(AppLocalizations l, NasaLayer layer, DateTime now) {
  final d = gibsDataDate(layer, now);
  return l.nasaDataDate('${d.approx ? '≈ ' : ''}${_day(l, d.date)}');
}

/// Credits (and the raster's day) for the NASA layers that are on, bottom-left so the map buttons stay clear.
/// Google Play requires the government source to be linked wherever its data is credited.
class _NasaCredits extends StatelessWidget {
  const _NasaCredits({required this.state, required this.snapshot, required this.now});

  final NasaLayerState state;
  final MapSnapshot? snapshot;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final raster = state.raster == null ? null : nasaLayers[state.raster];
    final text = [if (raster != null) nasaRasterDate(l, raster, now), ...nasaCredits(state)].join(' · ');
    return Align(
      alignment: Alignment.bottomLeft,
      child: Padding(
        padding: const EdgeInsets.only(bottom: HwSize.touchTarget + HwSize.space2, right: HwSize.touchTarget * 2),
        child: Container(
          key: const ValueKey('nasa-credits'),
          padding: const EdgeInsets.symmetric(horizontal: HwSize.space1, vertical: 2),
          color: c.surface.withValues(alpha: 0.8),
          // Each NASA name links to its site; the credit text itself is unchanged.
          child: SourceText(
            text,
            sources: nasaSourceRefs,
            style: Theme.of(context).textTheme.labelSmall!.copyWith(color: c.inkMuted),
          ),
        ),
      ),
    );
  }
}

/// NASA layer choices: FIRMS and EONET points, then one GIBS raster at a time. Each active layer says what day its
/// data is from and who it is from.
class NasaLayerSheet extends StatelessWidget {
  const NasaLayerSheet({
    super.key,
    required this.state,
    required this.snapshot,
    required this.now,
    required this.onChanged,
  });

  final NasaLayerState state;
  final MapSnapshot? snapshot;
  final DateTime now;
  final ValueChanged<NasaLayerState> onChanged;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final note = text.bodySmall!.copyWith(color: c.inkMuted);
    String feedNote(String key, String credit) {
      final at = nasaFeedTime(snapshot, key);
      return [if (at != null) clockText(l, at, now), credit].join(' · ');
    }

    // Below its switch, not as the switch's subtitle: a switch tile merges its children into one toggle, which would
    // swallow the link for screen readers and taps.
    Widget credit(String text) => Padding(
      padding: const EdgeInsets.only(bottom: HwSize.space2),
      child: SourceText(text, sources: nasaSourceRefs, style: note),
    );

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(HwSize.space4, 0, HwSize.space4, HwSize.space4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Text('NASA', style: text.titleLarge)),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(nasaLayerName(l, 'firms')),
              value: state.firms,
              onChanged: (v) => onChanged(state.copyWith(firms: v)),
            ),
            if (state.firms) credit(feedNote('fires', NasaAttribution.firms)),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(nasaLayerName(l, 'events')),
              value: state.events,
              onChanged: (v) => onChanged(state.copyWith(events: v)),
            ),
            if (state.events) credit(feedNote('events', NasaAttribution.eonet)),
            const Divider(),
            for (final id in nasaRasterIds) ...[
              SwitchListTile(
                key: ValueKey('nasa-raster:$id'),
                contentPadding: EdgeInsets.zero,
                title: Text(nasaLayerName(l, id)),
                value: state.raster == id,
                // One raster at a time; turning the active one off leaves none.
                onChanged: (v) => onChanged(state.copyWith(raster: () => v ? id : null)),
              ),
              if (state.raster == id)
                credit('${nasaRasterDate(l, nasaLayers[id]!, now)} · ${nasaLayers[id]!.attribution}'),
            ],
            if (state.anyOn)
              Padding(
                padding: const EdgeInsets.only(top: HwSize.space2),
                child: Text(l.nasaDisclaimer, style: note),
              ),
          ],
        ),
      ),
    );
  }
}
