import 'package:flutter/material.dart';

import '../alerts/area_alerts.dart';
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
import '../widgets/severity.dart';
import 'area_picker_screen.dart';
import 'sources_screen.dart';

/// Every current alert for the followed district, grouped by level, most severe first. Loads when the tab is shown
/// (it stays built in the shell's IndexedStack) and on pull down.
class AlertsScreen extends StatefulWidget {
  const AlertsScreen({
    super.key,
    required this.settings,
    required this.api,
    required this.location,
    required this.clock,
    this.bma,
  });

  final AppSettings settings;
  final HazardApi api;
  final LocationService location;
  final DateTime Function() clock;
  final DeviceBma? bma;

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  /// Switching back to the tab within this time shows what is there instead of reloading.
  static const _reuseFor = Duration(minutes: 1);

  AreaReport? _report;
  Map<BmaKind, BmaCopy?> _device = const {};
  ApiException? _error;
  bool _loading = false;
  bool _visible = false;
  String? _districtId;
  DateTime? _loadedAt;

  @override
  void initState() {
    super.initState();
    widget.settings.addListener(_onSettings);
    _districtId = widget.settings.district?.id;
  }

  @override
  void dispose() {
    widget.settings.removeListener(_onSettings);
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visible = Visibility.of(context);
    if (visible && !_visible) _loadIfOld();
    _visible = visible;
  }

  void _onSettings() {
    final id = widget.settings.district?.id;
    if (id == _districtId) {
      setState(() {});
      return;
    }
    setState(() {
      _districtId = id;
      _report = null;
      _device = const {};
      _error = null;
      _loadedAt = null;
    });
    if (_visible) _loadIfOld();
  }

  void _loadIfOld() {
    final at = _loadedAt;
    if (at != null && widget.clock().difference(at) < _reuseFor) return;
    _load();
  }

  Future<void> _load() async {
    final id = _districtId;
    if (id == null) return;
    setState(() => _loading = true);
    try {
      final report = await widget.api.area(districtId: id);
      if (!mounted || id != _districtId) return;
      final now = widget.clock();
      final bma = widget.bma;
      final kinds = [
        if (bma != null)
          for (final k in BmaKind.values)
            if (needsDeviceCopy(report, k, now)) k,
      ];
      final copies = await Future.wait([for (final k in kinds) bma!.get(k, now)]);
      if (!mounted || id != _districtId) return;
      setState(() {
        _report = report;
        _device = {for (var i = 0; i < kinds.length; i++) kinds[i]: copies[i]};
        _error = null;
        _loadedAt = now;
      });
    } on UnknownDistrictException {
      widget.settings.district = null;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
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
    final locale = Localizations.localeOf(context);
    final district = widget.settings.district;
    final heading = Semantics(header: true, child: Text(l.navAlerts, style: text.headlineSmall));

    if (district == null) {
      return SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(HwSize.space4),
          children: [
            heading,
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

    final report = _report;
    final now = widget.clock();
    final alerts = report == null
        ? const <HazardAlert>[]
        : areaAlerts(
            report,
            flood: _device[BmaKind.flood],
            rain: _device[BmaKind.rain],
            now: now,
            quake: widget.settings.quake,
          );
    final levels = [
      for (final level in HwLevel.values.reversed)
        if (alerts.any((a) => a.level == level)) level,
    ];

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _load,
        color: c.ink,
        backgroundColor: c.surface,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(HwSize.space4),
          children: [
            heading,
            Text([district.name.of(locale), district.province?.of(locale)].nonNulls.join(' · '), style: text.bodySmall),
            const SizedBox(height: HwSize.space4),
            if (_error != null) ...[
              CalmBox(text: _errorText(l, _error!, report, now)),
              if (report == null) ...[
                const SizedBox(height: HwSize.space2),
                OutlinedButton(onPressed: _loading ? null : _load, child: Text(l.commonRetry)),
              ],
              const SizedBox(height: HwSize.space3),
            ],
            if (report == null && _error == null) CalmBox(text: l.commonLoading),
            if (report != null && alerts.isEmpty) CalmBox(text: l.alertsEmpty),
            for (final level in levels) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: HwSize.space2),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: SeverityBadge(level: level),
                ),
              ),
              for (final a in alerts.where((a) => a.level == level)) ...[
                creditedAlertCard(
                  context,
                  kind: a.kind,
                  level: a.level,
                  title: a.title.of(locale),
                  body: a.body.of(locale),
                  time: _meta(l, a, now),
                ),
                const SizedBox(height: HwSize.space3),
              ],
              const SizedBox(height: HwSize.space2),
            ],
            if (!widget.settings.notify) ...[
              const SizedBox(height: HwSize.space2),
              Text(l.alertsNotifyOff, style: text.bodySmall!.copyWith(color: c.inkMuted)),
            ],
            const SizedBox(height: HwSize.space6),
            const NotGovernmentNote(),
          ],
        ),
      ),
    );
  }

  String _meta(AppLocalizations l, HazardAlert a, DateTime now) {
    final time = a.event ? l.alertsQuakeAt(clockText(l, a.at, now)) : l.homeAlertsMeta(agoText(l, a.at, now));
    return a.onDevice ? '$time · ${l.readingOnDevice}' : time;
  }

  String _errorText(AppLocalizations l, ApiException e, AreaReport? report, DateTime now) => switch (e) {
    NotSupportedException() => l.homeNotDeployed,
    _ when report != null => l.commonOfflineAt(clockText(l, report.updatedAt ?? report.generatedAt, now)),
    _ => l.extLoadFailed,
  };
}
