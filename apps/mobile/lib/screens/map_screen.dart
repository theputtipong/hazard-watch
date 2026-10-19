import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../api/hazard_api.dart';
import '../api/models.dart';
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
import '../sources_meta.g.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/dam_card.dart';
import '../widgets/reading_tile.dart';
import '../widgets/source_link.dart';
import 'sources_screen.dart';

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
  /// Not-government, refresh, zoom in/out, NASA, locate, area.
  static const _mapButtonCount = 7;

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

  /// The way out shown with [_hint] (turn location on, open app settings, try again).
  ({String label, VoidCallback onPressed})? _hintAction;
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

  /// [thaiOnly] (the refresh button) takes only the Thai feeds from the new snapshot; USGS and NASA stay as they were.
  Future<void> _load({bool thaiOnly = false}) async {
    setState(() => _loading = true);
    try {
      final fresh = await widget.api.snapshot();
      if (!mounted) return;
      final old = _snapshot;
      final snapshot = thaiOnly && old != null ? old.withThaiFeedsFrom(fresh) : fresh;
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

  void _zoomBy(double step) {
    final camera = _map.camera;
    _map.move(camera.center, (camera.zoom + step).clamp(NasaMapConfig.worldMinZoom, MapConfig.maxZoom));
  }

  void _goToArea() {
    setState(() {
      _hint = null;
      _hintAction = null;
    });
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
      _hintAction = null;
    });
    final fix = await widget.location.current();
    if (!mounted) return;
    final location = widget.location;
    final (hint, action) = switch (fix) {
      LocationFound() => (null, null),
      LocationUnavailable(reason: LocationFailure.serviceOff) => (
        l.mapServiceOff,
        (label: l.locationTurnOn, onPressed: location.openLocationSettings),
      ),
      LocationUnavailable(reason: LocationFailure.deniedForever) => (
        l.mapBlocked,
        (label: l.locationOpenSettings, onPressed: location.openAppSettings),
      ),
      LocationUnavailable(reason: LocationFailure.denied) => (l.mapLocationOff, null),
      LocationUnavailable(reason: LocationFailure.timeout) => (
        l.mapTimeout,
        (label: l.commonRetry, onPressed: _goToMe),
      ),
      LocationUnavailable(reason: LocationFailure.error) => (l.mapNoFix, null),
    };
    setState(() {
      _locating = false;
      _hint = hint;
      _hintAction = action;
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

    final credit = mapCreditSourceIds(_layers, nasa);
    final map = Stack(
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
              if (events.isNotEmpty) eventTrackLayer(context, events),
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
        Positioned.fill(
          child: Padding(
            padding: const EdgeInsets.only(right: HwSize.space4, bottom: HwSize.space6),
            child: LayoutBuilder(
              builder: (context, box) {
                // On short screens a tighter gap keeps the not-government button clear of the layer chips.
                const needed = _mapButtonCount * HwSize.touchTarget + (_mapButtonCount - 1) * HwSize.space2;
                final chipsBottom = MediaQuery.paddingOf(context).top + HwSize.space2 + HwSize.touchTarget;
                final tight = box.maxHeight - chipsBottom < needed;
                return OverflowBox(
                  alignment: Alignment.bottomRight,
                  minHeight: 0,
                  maxHeight: double.infinity,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    spacing: tight ? HwSize.space1 : HwSize.space2,
                    children: [
                      if (_hint != null)
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 240),
                          child: _StatusPill(
                            key: const ValueKey('map-hint'),
                            text: _hint!,
                            actionLabel: _hintAction?.label,
                            onRetry: _locating ? null : _hintAction?.onPressed,
                          ),
                        ),
                      // Google Play: screens showing government data must say the app is not a government app.
                      _MapButton(
                        key: const ValueKey('map-not-gov'),
                        icon: Icons.info_outline_rounded,
                        tooltip: l.notGovTitle,
                        iconColor: c.sevDangerInk,
                        onPressed: () => openSources(context),
                      ),
                      _MapButton(
                        key: const ValueKey('refresh-thai'),
                        icon: Icons.refresh,
                        tooltip: l.mapRefreshThai,
                        busy: _loading,
                        onPressed: _loading ? null : () => _load(thaiOnly: true),
                      ),
                      _MapButton(
                        key: const ValueKey('zoom-in'),
                        icon: Icons.add,
                        tooltip: l.mapZoomIn,
                        onPressed: () => _zoomBy(1),
                      ),
                      _MapButton(
                        key: const ValueKey('zoom-out'),
                        icon: Icons.remove,
                        tooltip: l.mapZoomOut,
                        onPressed: () => _zoomBy(-1),
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
                );
              },
            ),
          ),
        ),
      ],
    );
    if (credit.isEmpty) return map;
    // Under the map, not over it, so it never hides a control or a pin and always sits on a solid panel.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(child: map),
        ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.4),
          child: _MapCredits(
            state: nasa,
            snapshot: snapshot,
            now: now,
            dams: _layers.contains(MapLayer.dam),
            sources: credit,
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
        label: l.mapPin(
          layerName(l, p.layer),
          p.name.of(locale),
          p.dam == null ? p.level.label(locale) : damStatusText(l, p.dam!.status),
        ),
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
            source: eventSheetLinks(l, e.url).source,
            page: eventSheetLinks(l, e.url).page,
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
      source: sourceRef('NASA FIRMS', 'nasa-firms'),
    );
  }

  Future<void> _showSheet({
    required String title,
    required List<String> lines,
    required String credit,
    SourceRef? source,
    SourceRef? page,
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
                  // "ข้อมูลจาก NASA EONET · eonet.gsfc.nasa.gov": agency and site, as Google Play asks.
                  child: SourceLink(url: source.url),
                ),
              if (page != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: SourceLink(key: const ValueKey('sheet-page'), label: page.name, url: page.url),
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
  MapLayer.dam => l.layerDam,
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
  MapLayer.dam => const PinStyle(shape: PinShape.hexagon, size: Size.square(20), level: HwLevel.normal),
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
  const _StatusPill({super.key, required this.text, this.onRetry, this.actionLabel});

  final String text;
  final VoidCallback? onRetry;

  /// The button's text; "Try again" when null.
  final String? actionLabel;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final label = Text(text, style: Theme.of(context).textTheme.bodySmall!.copyWith(color: c.onInk));
    final button = onRetry == null
        ? null
        : TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(foregroundColor: c.onInk),
            child: Text(actionLabel ?? l.commonRetry),
          );
    return Align(
      alignment: Alignment.center,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: HwSize.space3, vertical: HwSize.space2),
        decoration: BoxDecoration(
          color: c.ink.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(HwSize.radiusControl),
        ),
        // A longer action ("Open app settings") goes under the text so neither gets squeezed.
        child: actionLabel != null && button != null
            ? Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [label, button],
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                spacing: HwSize.space2,
                children: [
                  Flexible(child: label),
                  ?button,
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
    this.iconColor,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool busy;
  final bool active;
  final Color? iconColor;

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
            : Icon(icon, color: iconColor ?? c.accent),
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
    if (p.dam case final dam?) return _DamSheet(dam: dam, title: what);
    final v = p.value;
    final (value, unit) = switch (p.layer) {
      MapLayer.flood => (v == null ? '—' : numberText(v), v == null ? null : l.unitCm),
      MapLayer.rain => (numberText(v!), l.mapRainUnit),
      MapLayer.water => ('${v!.round()}%', l.waterOfBank),
      MapLayer.pm25 => (numberText(v!), p.unit),
      MapLayer.quake => ('M${v!.toStringAsFixed(1)}', null),
      MapLayer.dam => ('${v!.round()}%', null),
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
            // Dam points always carry [MapPoint.dam] and take the sheet above.
            MapLayer.dam => '',
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

/// A dam's sheet: the home card's row, the display-only note and the linked ThaiWater credit.
class _DamSheet extends StatelessWidget {
  const _DamSheet({required this.dam, required this.title});

  final DamReading dam;

  /// The layer's name; the dam's own name heads its row, as on the home card.
  final String title;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(HwSize.space4, 0, HwSize.space4, HwSize.space4),
        child: Column(
          key: const ValueKey('dam-sheet'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: HwSize.space3,
          children: [
            Semantics(header: true, child: Text(title, style: text.titleLarge)),
            DamRow(dam: dam, showKm: false),
            Text(
              [dam.province, if (dam.province.isNotEmpty) '·', l.damNote].join(' '),
              style: text.bodySmall!.copyWith(color: c.inkMuted),
            ),
            DamCredit(style: text.bodySmall!.copyWith(color: c.inkMuted)),
          ],
        ),
      ),
    );
  }
}

/// What dam pins mean: colour and words for each status, and size for large dams vs medium reservoirs, then the
/// linked credit. Low and critically low share the normal colour (damSeverity), so the words carry them.
class DamLegend extends StatelessWidget {
  const DamLegend({super.key, this.credit = true});

  /// False on the map, whose credit strip already links both dam sources.
  final bool credit;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final style = Theme.of(context).textTheme.labelSmall!.copyWith(color: c.inkMuted);
    Widget item(PinStyle pin, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      spacing: HwSize.space1,
      children: [
        HazardPin(style: pin),
        Flexible(child: Text(label, style: style)),
      ],
    );
    PinStyle hex(HwLevel level, double size) =>
        PinStyle(shape: PinShape.hexagon, size: Size.square(size), level: level);
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 260),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 2,
        children: [
          Wrap(
            spacing: HwSize.space2,
            runSpacing: 2,
            children: [
              item(hex(DamStatus.over.level, 12), l.damStatusOver),
              item(hex(DamStatus.high.level, 12), l.damStatusHigh),
              item(
                hex(DamStatus.normal.level, 12),
                [l.damStatusNormal, l.damStatusLow, l.damStatusCritical].join(' · '),
              ),
              item(hex(HwLevel.normal, 16), l.damSizeLarge),
              item(hex(HwLevel.normal, 11), l.damSizeMedium),
            ],
          ),
          if (credit) DamCredit(style: style),
        ],
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

/// An EONET event's links: its page when EONET hosts it ("ข้อมูลจาก NASA EONET · eonet.gsfc.nasa.gov"), else EONET
/// itself as the source plus "หน้าเหตุการณ์ · gdacs.org" for the page the event came from (GDACS, JTWC…), so no link
/// shows a bare address or puts NASA's name on another site.
({SourceRef? source, SourceRef? page}) eventSheetLinks(AppLocalizations l, String? url) {
  final eonet = sourceRef('NASA EONET', 'nasa-eonet');
  final https = url != null && Uri.tryParse(url)?.scheme == 'https';
  if (!https) return (source: eonet, page: null);
  if (sourceIdForUrl(url) == 'nasa-eonet') return (source: sourceRef('NASA EONET', 'nasa-eonet', url: url), page: null);
  final domain = linkDomain(url);
  return (source: eonet, page: domain == null ? null : (name: l.mapEventPage(domain), url: url));
}

/// Every agency whose data the map is showing, in layer order, each once: the map layers' sources, then NASA's.
List<String> mapCreditSourceIds(Set<MapLayer> layers, NasaLayerState nasa) {
  final ids = <String>{
    for (final layer in MapLayer.values)
      if (layers.contains(layer)) ...layerSourceIds(layer),
    if (nasa.raster != null) 'nasa-gibs',
    if (nasa.firms) 'nasa-firms',
    if (nasa.events) 'nasa-eonet',
  };
  return ids.toList();
}

/// "ข้อมูลบนแผนที่: กทม. · ThaiWater · กรมอุตุฯ · … ⓘ": one line (scrolling sideways when long) naming the agencies
/// behind what the map shows, each short name a link to its page; ⓘ lists them by full name and site. Always on while
/// any layer is (Google Play: government data must name and link its source where it is shown).
class MapDataCredit extends StatelessWidget {
  const MapDataCredit({super.key, required this.sourceIds});

  final List<String> sourceIds;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final style = Theme.of(context).textTheme.bodySmall!.copyWith(color: c.inkMuted);
    final [before, after] = l.mapDataCredit('\u0000').split('\u0000');
    final links = _mapCreditLinks(l, sourceIds);
    return Semantics(
      container: true,
      label: before.trim(),
      // One line however many layers are on: the names scroll sideways and ⓘ stays at the end.
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  if (before.isNotEmpty) Text(before, style: style),
                  for (final (i, (:short, full: _, :url)) in links.indexed) ...[
                    if (i > 0) ExcludeSemantics(child: Text(' · ', style: style)),
                    SourceLink(key: ValueKey('map-credit:$url'), label: short, url: url, style: style),
                  ],
                  if (after.isNotEmpty) Text(after, style: style),
                ],
              ),
            ),
          ),
          IconButton(
            key: const ValueKey('map-credit-more'),
            tooltip: l.mapDataCreditAll,
            constraints: const BoxConstraints.tightFor(width: HwSize.touchTarget, height: HwSize.touchTarget),
            padding: EdgeInsets.zero,
            icon: Icon(Icons.info_outline, size: 16, color: c.inkMuted),
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              showDragHandle: true,
              isScrollControlled: true,
              builder: (context) => SafeArea(
                child: SingleChildScrollView(
                  key: const ValueKey('map-credit-sheet'),
                  padding: const EdgeInsets.fromLTRB(HwSize.space4, 0, HwSize.space4, HwSize.space4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                        header: true,
                        child: Text(l.mapDataCreditAll, style: Theme.of(context).textTheme.titleMedium),
                      ),
                      for (final (short: _, :full, :url) in links) SourceLink(label: full, url: url, style: style),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Each agency once, by short name ("กทม.") and full name and site ("กรุงเทพมหานคร · weather.bangkok.go.th").
/// BMA flood and rain share a name and site: one link, to the first layer's page.
List<({String short, String full, String url})> _mapCreditLinks(AppLocalizations l, List<String> sourceIds) {
  final links = <String, ({String short, String full, String url})>{};
  for (final id in sourceIds) {
    final url = sourceUrl(id);
    final domain = sourceDomain(id);
    if (url == null || domain == null) continue;
    final full = '${sourceAgency(l, id) ?? sourceShortName(l, id)} · $domain';
    links.putIfAbsent(full, () => (short: sourceShortName(l, id), full: full, url: url));
  }
  return links.values.toList();
}

/// The map's one credit panel, under the map so the map buttons stay clear: the dam legend, NASA's credit (with the
/// raster's day) and colour legend, then the linked agencies for every layer that is on.
class _MapCredits extends StatelessWidget {
  const _MapCredits({
    required this.state,
    required this.snapshot,
    required this.now,
    required this.dams,
    required this.sources,
  });

  final NasaLayerState state;
  final MapSnapshot? snapshot;
  final DateTime now;
  final bool dams;
  final List<String> sources;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final raster = state.raster == null ? null : nasaLayers[state.raster];
    final text = [if (raster != null) nasaRasterDate(l, raster, now), ...nasaCredits(state)].join(' · ');
    return DecoratedBox(
      key: const ValueKey('map-credits'),
      decoration: BoxDecoration(
        color: c.surface,
        border: Border(top: BorderSide(color: c.line)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: HwSize.space4, vertical: HwSize.space1),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (dams) const DamLegend(key: ValueKey('dam-map-legend'), credit: false),
            if (state.anyOn)
              // NASA's own credit wording, each NASA name linked to its site.
              SourceText(
                key: const ValueKey('nasa-credits'),
                text,
                sources: nasaSourceRefs,
                describe: false,
                style: Theme.of(context).textTheme.bodySmall!.copyWith(color: c.inkMuted),
              ),
            // What the raster's colours mean, compact; the layer sheet adds the caveat note.
            if (nasaLegend(state) case final legend?)
              ConstrainedBox(
                key: const ValueKey('nasa-map-legend'),
                constraints: const BoxConstraints(maxWidth: 260),
                child: NasaLegendView(layerId: state.raster!, legend: legend),
              ),
            MapDataCredit(key: const ValueKey('map-data-credit'), sourceIds: sources),
          ],
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
      child: SourceText(text, sources: nasaSourceRefs, style: note, describe: false),
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
              if (state.raster == id) ...[
                credit('${nasaRasterDate(l, nasaLayers[id]!, now)} · ${nasaLayers[id]!.attribution}'),
                if (nasaLayers[id]!.legend case final legend?)
                  Padding(
                    padding: const EdgeInsets.only(bottom: HwSize.space2),
                    child: NasaLegendView(layerId: id, legend: legend, note: true),
                  ),
              ],
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
