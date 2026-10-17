import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import 'package:vector_map_tiles/vector_map_tiles.dart';
import 'package:vector_tile_renderer/vector_tile_renderer.dart' as vtr;

import '../l10n/gen/app_localizations.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/source_link.dart';

/// The web's map settings (WEB.map in apps/web/src/config.ts and the Greater Bangkok region in
/// packages/core/src/regions.ts). test/map_test.dart fails if they drift.
abstract final class MapConfig {
  /// Positron: a quiet grey basemap so the coloured pins stand out.
  static const styleLight = 'https://tiles.openfreemap.org/styles/positron';
  static const styleDark = 'https://tiles.openfreemap.org/styles/dark';
  static const maxZoom = 19.0;

  /// Emergency fallback only: tile.openstreetmap.org forbids heavy use.
  static const osmUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  /// Covers both the vector tiles and the OSM fallback.
  static const attribution = 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors';
  static const List<SourceRef> attributionLinks = [
    (name: 'OpenFreeMap', url: 'https://openfreemap.org/'),
    (name: 'OpenMapTiles', url: 'https://openmaptiles.org/'),
    (name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright'),
  ];

  static const regionCenter = LatLng(13.7563, 100.5018);
  static const regionZoom = 11.0;
  static const areaZoom = 12.0;
  static const locateZoom = 14.0;

  /// Credit/legend panels over the map: at 0.9 their muted text stays 4.5:1 over any base map or satellite image
  /// (0.8 let a dark image pull it to 3.5:1).
  static const creditPanelAlpha = 0.9;
}

/// OpenMapTiles `name:xx` in the app language, falling back to the local `name` (applyLabels in
/// apps/web/src/lib/vectorBaseMap.ts). Shields show `ref` and are left alone.
Map<String, dynamic> localizeLabels(Map<String, dynamic> style, String lang) {
  for (final layer in (style['layers'] as List).cast<Map<String, dynamic>>()) {
    if (layer['type'] != 'symbol') continue;
    final layout = layer['layout'] as Map<String, dynamic>?;
    final field = layout?['text-field'];
    if (field == null || !jsonEncode(field).contains('"name')) continue;
    layout!['text-field'] = [
      'coalesce',
      ['get', 'name:$lang'],
      ['get', 'name'],
    ];
  }
  return style;
}

final _styles = <String, Future<Style>>{};

/// Like StyleReader in vector_map_tiles, plus [localizeLabels]. One download per theme and language per run.
Future<Style> loadStyle(String url, String lang, {http.Client? client}) {
  final key = '$url|$lang';
  return _styles[key] ??= _loadStyle(url, lang, client ?? http.Client()).catchError((Object e) {
    _styles.remove(key);
    throw e;
  });
}

Future<Style> _loadStyle(String url, String lang, http.Client client) async {
  Future<Object?> getJson(String u) async {
    final res = await client.get(Uri.parse(u)).timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) throw http.ClientException('HTTP ${res.statusCode}', Uri.parse(u));
    return jsonDecode(utf8.decode(res.bodyBytes));
  }

  final style = localizeLabels((await getJson(url))! as Map<String, dynamic>, lang);
  final providers = <String, VectorTileProvider>{};
  for (final MapEntry(key: name, value: source as Map<String, dynamic>) in (style['sources'] as Map).entries) {
    final type = TileProviderType.values.where((t) => t.name.replaceAll('_', '-') == source['type']).firstOrNull;
    if (type == null) continue;
    final tileJson = source['url'] is String ? (await getJson(source['url'] as String))! as Map : source;
    final tiles = tileJson['tiles'];
    if (tiles is! List || tiles.isEmpty) continue;
    providers[name as String] = NetworkVectorTileProvider(
      type: type,
      urlTemplate: tiles.first as String,
      maximumZoom: tileJson['maxzoom'] as int? ?? 14,
      minimumZoom: tileJson['minzoom'] as int? ?? 1,
    );
  }
  if (providers.isEmpty) throw StateError('No tile sources in $url');

  SpriteStyle? sprites;
  if (style['sprite'] case final String sprite) {
    try {
      final index = (await getJson('$sprite@2x.json'))! as Map<String, dynamic>;
      sprites = SpriteStyle(
        atlasProvider: () async => (await client.get(Uri.parse('$sprite@2x.png'))).bodyBytes,
        index: vtr.SpriteIndexReader().read(index),
      );
    } on Object {
      // Map icons are optional; the map still works without them.
    }
  }
  return Style(theme: vtr.ThemeReader().read(style), providers: TileProviders(providers), sprites: sprites);
}

/// OpenFreeMap vector tiles in the app's theme and language. When they fail (no network, style changed beyond what the
/// renderer reads) it falls back to OSM raster tiles, darkened in dark mode, as the web does without WebGL.
class BaseMap extends StatefulWidget {
  const BaseMap({super.key, required this.dark, required this.lang});

  final bool dark;
  final String lang;

  @override
  State<BaseMap> createState() => _BaseMapState();
}

class _BaseMapState extends State<BaseMap> {
  late Future<Style> _style = _load();

  Future<Style> _load() => loadStyle(widget.dark ? MapConfig.styleDark : MapConfig.styleLight, widget.lang);

  @override
  void didUpdateWidget(BaseMap old) {
    super.didUpdateWidget(old);
    if (old.dark != widget.dark || old.lang != widget.lang) _style = _load();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: _style,
      builder: (context, snap) {
        final style = snap.data;
        if (style != null) {
          return VectorTileLayer(
            key: ValueKey('${widget.dark}|${widget.lang}'),
            theme: style.theme,
            sprites: style.sprites,
            tileProviders: style.providers,
          );
        }
        if (snap.hasError) {
          return TileLayer(
            urlTemplate: MapConfig.osmUrl,
            userAgentPackageName: 'com.pdouvch.hazardwatch',
            maxNativeZoom: MapConfig.maxZoom.toInt(),
            tileBuilder: widget.dark ? darkModeTileBuilder : null,
          );
        }
        return const SizedBox.shrink();
      },
    );
  }
}

/// Credits the tile data, as the map licences require: a small ⓘ in the map's corner (a full touch target) that opens
/// the linked credit, so the credit line never covers the map.
class BaseMapAttribution extends StatelessWidget {
  const BaseMapAttribution({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    return Align(
      alignment: Alignment.bottomLeft,
      child: IconButton(
        key: const ValueKey('base-map-credit'),
        tooltip: AppLocalizations.of(context).mapBaseCredit,
        constraints: const BoxConstraints.tightFor(width: HwSize.touchTarget, height: HwSize.touchTarget),
        padding: EdgeInsets.zero,
        onPressed: () => showModalBottomSheet<void>(
          context: context,
          showDragHandle: true,
          builder: (context) => SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(HwSize.space4, 0, HwSize.space4, HwSize.space4),
              child: SourceText(
                MapConfig.attribution,
                sources: MapConfig.attributionLinks,
                style: Theme.of(context).textTheme.bodySmall!.copyWith(color: context.hw.inkMuted),
              ),
            ),
          ),
        ),
        icon: Material(
          key: const ValueKey('base-map-credit-panel'),
          color: c.surface.withValues(alpha: MapConfig.creditPanelAlpha),
          shape: const CircleBorder(),
          child: Padding(
            padding: const EdgeInsets.all(2),
            child: Icon(Icons.info_outline, size: 16, color: c.inkMuted),
          ),
        ),
      ),
    );
  }
}
