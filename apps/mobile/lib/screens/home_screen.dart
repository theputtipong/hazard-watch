import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';

import '../api/hazard_api.dart';
import '../api/models.dart';
import '../bma/device_bma.dart';
import '../bma/merge.dart';
import '../format.dart';
import '../l10n/gen/app_localizations.dart';
import '../location.dart';
import '../settings.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/alert_card.dart';
import '../widgets/feed_status.dart';
import '../widgets/hw_card.dart';
import '../widgets/reading_tile.dart';
import '../widgets/river_gauge.dart';
import 'area_picker_screen.dart';

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
    final d = await pickDistrict(context, widget.api, widget.location);
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
            _Header(district: district, onChange: _pick),
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
    final tiles = [
      if (r.pm25 != null) _pm25Tile(context, r.pm25!, now),
      if (v.rain != null) _rainTile(context, v.rain!, now, onDevice: v.rainOnDevice),
      if (v.flood != null) _floodTile(context, v, now),
      if (r.quake != null) _quakeTile(context, r.quake!, now),
    ];
    return [
      // Calm only when nothing shown is at caution or above (design system AlertCard rule).
      if (v.calm) CalmBox(text: l.extAllClear),
      for (final a in shown) ...[
        AlertCard(level: a.level, title: a.title.of(locale), body: a.body.of(locale), meta: meta),
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
      if (r.rivers.isNotEmpty) ...[
        const SizedBox(height: HwSize.space3),
        HwCard(
          title: l.cardWater,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: HwSize.space4,
            children: [
              Text(l.gaugeIntro, style: text.labelLarge!.copyWith(color: c.inkMuted)),
              for (final g in r.rivers) _gauge(context, g, now),
            ],
          ),
        ),
      ],
      const SizedBox(height: HwSize.space6),
      Text(l.feedsTitle, style: text.labelLarge!.copyWith(color: c.inkMuted)),
      const SizedBox(height: HwSize.space2),
      for (var i = 0; i < v.feeds.length; i++) ...[
        if (i > 0) Divider(height: 1, color: c.line),
        FeedStatusRow(
          name: feedName(l, v.feeds[i].topic),
          state: v.feeds[i].state,
          age: feedAgeText(l, v.feeds[i], now),
        ),
      ],
    ];
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

class _Header extends StatelessWidget {
  const _Header({required this.district, required this.onChange});

  final District district;
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
              if (district.province != null) Text(district.province!.of(locale), style: text.bodySmall),
            ],
          ),
        ),
        TextButton(onPressed: onChange, child: Text(l.locationPickChange)),
      ],
    );
  }
}
