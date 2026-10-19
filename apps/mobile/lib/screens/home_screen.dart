import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';

import '../api/hazard_api.dart';
import '../api/models.dart';
import '../bma/device_bma.dart';
import '../bma/geo.dart';
import '../bma/merge.dart';
import '../format.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../settings.dart';
import '../sources_meta.g.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/alert_card.dart';
import '../widgets/dam_card.dart';
import '../widgets/feed_status.dart';
import '../widgets/hw_card.dart';
import '../widgets/nasa_card.dart';
import '../widgets/reading_tile.dart';
import '../widgets/river_gauge.dart';
import '../widgets/source_link.dart';
import 'area_picker_screen.dart';
import 'sources_screen.dart';

/// Home (design system app structure): district name → alerts → readings → data freshness. Pull down to reload.
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.settings,
    required this.api,
    required this.location,
    required this.clock,
    this.bma,
  });

  final AppSettings settings;
  final HazardApi api;

  /// BMA flood/rain fetched on this phone when the server's copy fails; null turns it off.
  final DeviceBma? bma;
  final LocationService location;
  final DateTime Function() clock;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

/// How close a gauge must be to speak for a district (LOCAL_KM in apps/web/src/lib/derive.ts). BMA rain gauges are
/// Bangkok-only and river gauges thin out upcountry: past these distances the reading is left out rather than showing
/// Bangkok's numbers as if they were local.
const localKm = (rain: 20.0, water: 60.0);

/// Feed names, including the NASA topics the shared formatter does not know yet.
String homeFeedName(AppLocalizations l, String topic) => switch (topic) {
  'fires' => l.feedsNameFires,
  'events' => l.feedsNameEvents,
  _ => feedName(l, topic),
};

/// The sources behind each feed topic Home lists (ids in lib/sources_meta.g.dart), each linked from its row. A topic
/// with none here ("radar": the app shows no radar) is left out of the list, so every feed named on Home links to the
/// agency it comes from (Google Play: government data must name and link its source where it is shown).
List<String> feedSourceIds(String topic) => switch (topic) {
  'flood' => const ['bma-flood'],
  'rain' => const ['bma-rain'],
  'waterlevel' => const ['thaiwater'],
  'pm25' => const ['air4thai'],
  'quakes' => const ['tmd', 'usgs'],
  'fires' => const ['nasa-firms'],
  'events' => const ['nasa-eonet'],
  'dams' => const ['thaiwater', 'rid'],
  _ => const [],
};

class _HomeScreenState extends State<HomeScreen> {
  static const _maxAlerts = 3;

  AreaReport? _report;
  ApiException? _error;
  bool _loading = false;
  bool _showAllAlerts = false;
  String? _districtId;
  Map<BmaKind, BmaCopy?> _device = const {};
  final _announced = <String>{};

  @override
  void initState() {
    super.initState();
    widget.settings.addListener(_onSettings);
    _onSettings();
  }

  @override
  void dispose() {
    widget.settings.removeListener(_onSettings);
    super.dispose();
  }

  void _onSettings() {
    final id = widget.settings.district?.id;
    if (id == _districtId) return;
    _districtId = id;
    setState(() {
      _report = null;
      _device = const {};
      _error = null;
      _showAllAlerts = false;
    });
    if (id != null) _load();
  }

  Future<void> _load() async {
    final id = _districtId;
    if (id == null) return;
    setState(() => _loading = true);
    try {
      final report = await widget.api.area(districtId: id);
      if (!mounted || id != _districtId) return;
      setState(() {
        _report = report;
        _error = null;
      });
      _announceDanger(report);
      await _loadDevice(report);
    } on UnknownDistrictException {
      widget.settings.district = null;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadDevice(AreaReport report) async {
    final bma = widget.bma;
    if (bma == null) return;
    final id = _districtId;
    final now = widget.clock();
    final kinds = [
      for (final k in BmaKind.values)
        if (needsDeviceCopy(report, k, now)) k,
    ];
    final copies = await Future.wait([for (final k in kinds) bma.get(k, now)]);
    if (!mounted || id != _districtId) return;
    setState(() => _device = {for (var i = 0; i < kinds.length; i++) kinds[i]: copies[i]});
  }

  /// Design system: a danger card that newly appears is announced and gives one medium haptic tap.
  void _announceDanger(AreaReport report) {
    final locale = Localizations.localeOf(context);
    final fresh = report.alerts.where((a) => a.level == HwLevel.danger && _announced.add(a.key)).toList();
    if (fresh.isEmpty) return;
    HapticFeedback.mediumImpact();
    for (final a in fresh) {
      SemanticsService.sendAnnouncement(View.of(context), a.title.of(locale), Directionality.of(context));
    }
  }

  Future<void> _pick() async {
    final d = await pickDistrict(context, widget.api, widget.location, current: widget.settings.district);
    if (d != null) widget.settings.district = d;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final district = widget.settings.district;

    if (district == null) {
      return SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(HwSize.space4),
          children: [
            Semantics(header: true, child: Text(l.appName, style: text.headlineSmall)),
            const SizedBox(height: HwSize.space2),
            const NotGovernmentBanner(),
            const SizedBox(height: HwSize.space3),
            Text(l.homePickFirst, style: text.bodyLarge),
            const SizedBox(height: HwSize.space6),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(HwSize.touchTarget)),
              onPressed: _pick,
              child: Text(l.locationPick),
            ),
          ],
        ),
      );
    }

    final locale = Localizations.localeOf(context);
    final report = _report;
    final now = widget.clock();
    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        color: c.ink,
        backgroundColor: c.surface,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(HwSize.space4),
          children: [
            // The report knows the province even when an older saved pick did not store it.
            _Header(district: district, province: report?.district.province ?? district.province, onChange: _pick),
            const NotGovernmentBanner(),
            const SizedBox(height: HwSize.space3),
            if (_error != null) ...[
              CalmBox(text: _errorText(l, _error!, report, now)),
              if (report == null) ...[
                const SizedBox(height: HwSize.space2),
                OutlinedButton(onPressed: _loading ? null : _load, child: Text(l.commonRetry)),
              ],
              const SizedBox(height: HwSize.space3),
            ],
            if (report == null && _error == null) CalmBox(text: l.commonLoading),
            if (report != null) ..._content(context, report, now, locale),
          ],
        ),
      ),
    );
  }

  String _errorText(AppLocalizations l, ApiException e, AreaReport? report, DateTime now) => switch (e) {
    NotSupportedException() => l.homeNotDeployed,
    _ when report != null => l.commonOfflineAt(clockText(l, report.updatedAt ?? report.generatedAt, now)),
    _ => l.extLoadFailed,
  };

  List<Widget> _content(BuildContext context, AreaReport r, DateTime now, Locale locale) {
    final l = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    final c = context.hw;
    final shown = _showAllAlerts ? r.alerts : r.alerts.take(_maxAlerts).toList();
    final meta = r.updatedAt == null ? null : l.homeAlertsMeta(agoText(l, r.updatedAt!, now));
    final v = mergeDevice(r, flood: _device[BmaKind.flood], rain: _device[BmaKind.rain], now: now);
    // Inside Bangkok the BMA gauges are the district's own network; elsewhere only a gauge just over the border counts.
    final rain = v.rain != null && (isBangkok(r.district.id) || v.rain!.km <= localKm.rain) ? v.rain : null;
    final rivers = [
      for (final g in r.rivers)
        if (g.km <= localKm.water) g,
    ];
    // The server's calm counts every reading it sends; one that is too far to show must not hide the all-clear.
    bool high(AreaReading? x) => x != null && !x.stale && x.level.index >= HwLevel.watch.index;
    final calm =
        v.calm ||
        (r.alerts.isEmpty &&
            !high(r.pm25) &&
            !high(rain) &&
            !rivers.any(high) &&
            (v.flood == null || v.floodStale || v.flood!.flooded == 0));
    final nasa = r.nasa;
    final tiles = [
      if (r.pm25 != null) _pm25Tile(context, r.pm25!, now),
      if (rain != null) _rainTile(context, rain, now, onDevice: v.rainOnDevice),
      if (v.flood != null) _floodTile(context, v, now),
      if (r.quake != null) _quakeTile(context, r.quake!, now),
    ];
    return [
      // Calm only when nothing shown is at caution or above (design system AlertCard rule).
      if (calm) CalmBox(text: l.extAllClear),
      for (final a in shown) ...[
        creditedAlertCard(
          context,
          kind: a.kind,
          level: a.level,
          title: a.title.of(locale),
          body: a.body.of(locale),
          time: meta,
        ),
        const SizedBox(height: HwSize.space3),
      ],
      if (r.alerts.length > _maxAlerts && !_showAllAlerts)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () => setState(() => _showAllAlerts = true),
            child: Text(l.extSeeAll('${r.alerts.length}')),
          ),
        ),
      const SizedBox(height: HwSize.space3),
      if (tiles.isNotEmpty) ReadingList(children: tiles),
      if (rivers.isNotEmpty) ...[
        const SizedBox(height: HwSize.space3),
        HwCard(
          title: l.cardWater,
          source: _riverSource(l, rivers),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: HwSize.space4,
            children: [
              Text(l.gaugeIntro, style: text.labelLarge!.copyWith(color: c.inkMuted)),
              for (final g in rivers) _gauge(context, g, now),
            ],
          ),
        ),
      ],
      // Display only: never part of calm or the alerts above.
      if (r.dams.isNotEmpty) ...[const SizedBox(height: HwSize.space3), DamCard(dams: r.dams)],
      if (nasa != null) ...[const SizedBox(height: HwSize.space3), _nasaCard(l, r, nasa, now)],
      const SizedBox(height: HwSize.space3),
      // One card of small tiles, two to a row, so the list stays short.
      HwCard(
        key: const ValueKey('feeds-card'),
        title: l.feedsTitle,
        // Each feed links its own agencies; the sources page lists them all.
        source: Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            key: const ValueKey('feeds-sources'),
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: const Size(HwSize.touchTarget, HwSize.touchTarget),
            ),
            onPressed: () => openSources(context),
            child: Text(l.homeAllSources),
          ),
        ),
        child: LayoutBuilder(
          builder: (context, box) {
            final width = (box.maxWidth - HwSize.space2) / 2;
            return Wrap(
              spacing: HwSize.space2,
              runSpacing: HwSize.space2,
              children: [
                for (final feed in v.feeds.where((f) => feedSourceIds(f.topic).isNotEmpty))
                  Container(
                    key: ValueKey('feed-tile:${feed.topic}'),
                    width: width,
                    padding: const EdgeInsets.symmetric(horizontal: HwSize.space3, vertical: HwSize.space2),
                    decoration: BoxDecoration(
                      color: c.surfaceSunken,
                      borderRadius: BorderRadius.circular(HwSize.radiusControl),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        FeedStatusRow(
                          name: homeFeedName(l, feed.topic),
                          state: feed.state,
                          age: feedAgeText(l, feed, now),
                        ),
                        _FeedSources(key: ValueKey('feed-sources:${feed.topic}'), ids: feedSourceIds(feed.topic)),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    ];
  }

  /// FIRMS lags ~3 h by design, so only a failed fetch earns a note, not its age (as on the web).
  Widget _nasaCard(AppLocalizations l, AreaReport r, NasaNear nasa, DateTime now) {
    final fires = r.feeds.where((f) => f.topic == 'fires').firstOrNull;
    final events = r.feeds.where((f) => f.topic == 'events').firstOrNull;
    final at = fires?.lastOkAt ?? events?.lastOkAt;
    final failed = fires?.state == FeedState.down;
    return NasaCard(
      near: nasa,
      now: now,
      updatedAt: at,
      note: !failed
          ? null
          : at == null
          ? l.freshFailedNoData
          : l.freshFailed(clockText(l, at, now)),
    );
  }

  Widget _riverSource(AppLocalizations l, List<AreaReading> rivers) {
    final ids = {for (final g in rivers) g.source};
    final names = [for (final id in ids) sourceName(l, id)];
    return SourceText(
      '${l.commonSource} ${names.join(' · ')}',
      sources: [for (final id in ids) ?sourceRef(sourceName(l, id), id)],
    );
  }

  String _metaFor(AppLocalizations l, AreaReading r, DateTime now, {bool onDevice = false}) {
    final meta = l.readingMeta(sourceName(l, r.source), clockText(l, r.observedAt, now), kmText(r.km));
    return onDevice ? '$meta · ${l.readingOnDevice}' : meta;
  }

  Widget _tile(
    BuildContext context, {
    required String what,
    required AreaReading r,
    required String value,
    String? unit,
    required String note,
    required DateTime now,
    bool onDevice = false,
  }) {
    final l = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    final place = r.name.of(locale);
    final shownNote = r.stale ? l.freshStale(clockText(l, r.observedAt, now)) : note;
    return ReadingTile(
      label: l.readingAt(what, place),
      value: value,
      unit: unit,
      level: r.level,
      stale: r.stale,
      note: shownNote,
      meta: _metaFor(l, r, now, onDevice: onDevice),
      sources: [?sourceRef(sourceName(l, r.source), r.source)],
      semantics: l.readingSemantics(what, place, r.stale ? '—' : value, r.level.label(locale), shownNote),
    );
  }

  Widget _pm25Tile(BuildContext context, AreaReading r, DateTime now) {
    final l = AppLocalizations.of(context);
    return _tile(
      context,
      what: l.feedsNamePm25,
      r: r,
      value: numberText(r.value),
      unit: r.unit,
      now: now,
      note: switch (r.level) {
        HwLevel.normal => l.notePm25Ok,
        HwLevel.watch => l.notePm25Watch,
        HwLevel.warning => l.notePm25Warn,
        HwLevel.danger => l.notePm25Danger,
      },
    );
  }

  Widget _rainTile(BuildContext context, AreaReading r, DateTime now, {required bool onDevice}) {
    final l = AppLocalizations.of(context);
    return _tile(
      context,
      onDevice: onDevice,
      what: l.readingRain,
      r: r,
      value: numberText(r.value),
      unit: l.unitMm,
      now: now,
      note: switch (r.level) {
        HwLevel.normal => l.noteRainOk,
        HwLevel.watch => l.noteRainWatch,
        HwLevel.warning => l.noteRainWarn,
        HwLevel.danger => l.noteRainDanger,
      },
    );
  }

  Widget _floodTile(BuildContext context, HazardView v, DateTime now) {
    final l = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    final f = v.flood!;
    final note = v.floodStale
        ? l.freshStale(clockText(l, v.floodAt!, now))
        : f.flooded > 0
        ? l.noteFloodSome('${(f.deepestCm ?? 0).round()}')
        : f.minor > 0
        ? l.zoneSumMinor('${f.minor}')
        : l.noteFloodOk;
    final value = v.floodStale ? '—' : '${f.flooded}';
    return ReadingTile(
      label: l.extFlood,
      value: value,
      unit: l.readingFloodUnit,
      level: f.level,
      stale: v.floodStale,
      note: note,
      meta: [
        '${l.commonSource} ${l.sourceNameBma}',
        l.extFloodCount('${f.flooded}', '${f.normal}'),
        if (v.floodOnDevice) l.readingOnDevice,
      ].join(' · '),
      sources: [?sourceRef(l.sourceNameBma, 'bma-flood')],
      semantics: '${l.extFlood} $value ${l.readingFloodUnit}, ${l.levelSemantics(f.level.label(locale))}. $note',
    );
  }

  Widget _quakeTile(BuildContext context, Quake q, DateTime now) {
    final l = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    final note = l.readingQuakeNote(q.place.of(locale), kmText(q.km));
    final value = 'M${q.magnitude.toStringAsFixed(1)}';
    return ReadingTile(
      label: l.cardQuake,
      value: value,
      level: q.level,
      note: note,
      meta: '${l.sourceQuake} · ${clockText(l, q.occurredAt, now)}',
      sources: [?sourceRef(l.sourceNameTmd, 'tmd'), ?sourceRef(l.sourceNameUsgs, 'usgs')],
      semantics: l.readingSemantics(l.cardQuake, q.place.of(locale), value, q.level.label(locale), note),
    );
  }

  Widget _gauge(BuildContext context, AreaReading g, DateTime now) {
    final l = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context);
    final state = switch (g.level) {
      HwLevel.normal => l.gaugeStateOk,
      HwLevel.watch => l.gaugeStateWatch,
      HwLevel.warning => l.gaugeStateWarn,
      HwLevel.danger => l.gaugeStateDanger,
    };
    return RiverGauge(
      name: g.name.of(locale),
      pct: g.value,
      level: g.level,
      state: state,
      semantics: l.gaugeAria(state, '${g.value.round()}'),
      tickLabels: (l.gaugeTickWatch, l.gaugeTickWarn, l.gaugeTickDanger),
    );
  }
}

/// At the top of Home, before any data: the app is independent, not a government app, with the way to the sources
/// page (Google Play government-information policy: a reviewer must see it without scrolling). The longer note stays
/// at the bottom.
class NotGovernmentBanner extends StatelessWidget {
  const NotGovernmentBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return Column(
      key: const ValueKey('home-not-gov'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Bold red so it is the first thing read on Home.
        Text(
          l.disclaimerNotGov,
          style: text.bodySmall!.copyWith(color: c.sevDangerInk, fontWeight: FontWeight.w700),
        ),
        TextButton(
          style: TextButton.styleFrom(
            padding: EdgeInsets.zero,
            minimumSize: const Size(HwSize.touchTarget, HwSize.touchTarget),
          ),
          onPressed: () => openSources(context),
          child: Text(l.sourcesTitle),
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.district, required this.province, required this.onChange});

  final District district;
  final LocalizedText? province;
  final VoidCallback onChange;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    final locale = Localizations.localeOf(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      spacing: HwSize.space3,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text(district.name.of(locale), style: text.headlineSmall)),
              if (province != null) Text(province!.of(locale), style: text.bodySmall),
            ],
          ),
        ),
        TextButton(onPressed: onChange, child: Text(l.locationPickChange)),
      ],
    );
  }
}

/// Under a feed's name, on one line: "ข้อมูลจาก กทม." for its first source by short name, then the rest's short names,
/// each a link to the source's page. Indented to line up with the feed's name, past its status mark.
class _FeedSources extends StatelessWidget {
  const _FeedSources({super.key, required this.ids});

  final List<String> ids;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final style = Theme.of(context).textTheme.bodySmall!.copyWith(color: c.inkMuted);
    final links = [
      for (final id in ids)
        if (sourceUrl(id) case final url?) (name: sourceShortName(l, id), url: url),
    ];
    return Padding(
      padding: const EdgeInsets.only(left: FeedStatusRow.markWidth + HwSize.space2),
      // One line, so a tile stays three lines; a name that does not fit is cut with ….
      child: Row(
        children: [
          for (final (i, s) in links.indexed) ...[
            if (i > 0) ExcludeSemantics(child: Text(', ', style: style)),
            Flexible(
              child: SourceLink(
                label: i == 0 ? '${l.commonSource} ${s.name}' : s.name,
                url: s.url,
                style: style,
                oneLine: true,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
