import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/models.dart';
import '../format.dart';
import '../l10n/gen/app_localizations.dart';
import '../theme/hw_app_theme.dart';
import 'hw_card.dart';
import 'river_gauge.dart';
import 'source_link.dart';

/// At most this many dams on the home card (the API sends up to 3).
const damCardMax = 3;

/// The storage bar spans 0–120 % of normal capacity, with a tick at 100 % (full).
const _barMax = 120.0;

String damStatusText(AppLocalizations l, DamStatus s) => switch (s) {
  DamStatus.over => l.damStatusOver,
  DamStatus.high => l.damStatusHigh,
  DamStatus.normal => l.damStatusNormal,
  DamStatus.low => l.damStatusLow,
  DamStatus.critical => l.damStatusCritical,
};

String damSizeText(AppLocalizations l, DamSize s) => s == DamSize.large ? l.damSizeLarge : l.damSizeMedium;

/// The report day in Thai time ("5 ต.ค."): the data is daily and observedAt is 00:00 ICT, so a clock time would mislead
/// and the phone's own time zone could shift the day.
String damDayText(AppLocalizations l, DateTime observedAt) =>
    DateFormat('d MMM', l.localeName).format(observedAt.toUtc().add(const Duration(hours: 7)));

/// The status text's colour: ink when normal, else the level's text tone (as the river gauge).
Color damStatusColor(HwColors c, DamStatus s) => s.level == HwLevel.normal ? c.ink : c.text(s.level);

/// "ข้อมูลเขื่อนจาก ThaiWater (สสน.) และกรมชลประทาน", with both agencies linked to their own sites (Google Play
/// source-link policy): ThaiWater to thaiwater.net, the Royal Irrigation Department to app.rid.go.th. Also the credit
/// on the map's dam sheet.
class DamCredit extends StatelessWidget {
  const DamCredit({super.key, this.style});

  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SourceText(
      l.damCredit,
      sources: [?sourceRef(l.sourceNameThaiwater, 'thaiwater'), ?sourceRef(l.agencyRid, 'rid')],
      style: style,
    );
  }
}

/// One dam: name and status, size and distance, a storage bar, usable water, volumes, flows and the report day.
class DamRow extends StatelessWidget {
  const DamRow({super.key, required this.dam, this.showKm = true});

  final DamReading dam;

  /// The map sheet measures from the map's area, not the district, so it leaves the distance out.
  final bool showKm;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final locale = Localizations.localeOf(context);
    final d = dam;
    final status = damStatusText(l, d.status);
    final pct = '${numberText(d.storagePct)}%';
    final muted = text.bodySmall!.copyWith(color: c.inkMuted);
    final volume = [
      if (d.usablePct != null) '${l.damUsable} ${numberText(d.usablePct!)}%',
      if (d.storageMcm != null && d.capacityMcm != null)
        '${numberText(d.storageMcm!)} / ${numberText(d.capacityMcm!)} ${l.damUnitMcm}',
    ].join(' · ');
    final flow = [
      if (d.inflowMcm != null) '${l.damInflow} ${numberText(d.inflowMcm!)}',
      if (d.releaseMcm != null) '${l.damRelease} ${numberText(d.releaseMcm!)}',
    ];
    final day = damDayText(l, d.observedAt);
    final when = d.stale ? l.freshStale(day) : l.damDataDate(day);
    return Column(
      key: ValueKey('dam:${d.id}'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: HwSize.space1,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: HwSize.space3,
          children: [
            Expanded(
              child: Text(d.name.of(locale), style: text.labelLarge!.copyWith(fontWeight: FontWeight.w600)),
            ),
            // The status in words, never colour alone.
            Text(
              '$status · $pct',
              key: ValueKey('dam-status:${d.id}'),
              textAlign: TextAlign.right,
              style: text.labelLarge!.copyWith(
                fontWeight: FontWeight.w600,
                fontFeatures: const [FontFeature.tabularFigures()],
                color: damStatusColor(c, d.status),
              ),
            ),
          ],
        ),
        Text([damSizeText(l, d.size), if (showKm) l.extKm(kmText(d.km)), ?d.basin].join(' · '), style: muted),
        Semantics(
          label: l.damStoragePct(numberText(d.storagePct)),
          child: DamBar(pct: d.storagePct, level: d.level),
        ),
        if (volume.isNotEmpty) Text(volume, style: text.bodyMedium),
        if (flow.isNotEmpty) Text('${flow.join(' · ')} ${l.damUnitMcmPerDay}', style: text.bodyMedium),
        Text(when, style: muted),
      ],
    );
  }
}

/// Storage as a bar on the sunken track, filled in the status colour; the tick marks full (100 %).
class DamBar extends StatelessWidget {
  const DamBar({super.key, required this.pct, required this.level});

  final double pct;
  final HwLevel level;

  @override
  Widget build(BuildContext context) {
    final c = context.hw;
    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth;
        double x(double p) => w * (p.clamp(0, _barMax) / _barMax);
        return SizedBox(
          height: 16,
          child: Stack(
            children: [
              Positioned(
                left: 0,
                right: 0,
                top: 3,
                height: 10,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: c.surfaceSunken,
                    borderRadius: BorderRadius.circular(HwSize.radiusPill),
                  ),
                ),
              ),
              Positioned(
                key: const ValueKey('dam-bar-fill'),
                left: 0,
                top: 3,
                height: 10,
                width: x(pct),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: gaugeBarColor(c, level),
                    borderRadius: BorderRadius.circular(HwSize.radiusPill),
                  ),
                ),
              ),
              Positioned(
                left: x(100) - 1,
                top: 0,
                width: 2,
                height: 16,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: c.lineControl,
                    borderRadius: BorderRadius.circular(HwSize.radiusTiny),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Dams and reservoirs near the district (web DamCard). Display only: ThaiWater reports once a day and a dam is never
/// an alert, so the card says so and has no severity pill.
class DamCard extends StatelessWidget {
  const DamCard({super.key, required this.dams});

  final List<DamReading> dams;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final shown = dams.take(damCardMax).toList();
    return HwCard(
      key: const ValueKey('dam-card'),
      title: l.cardDam,
      source: const DamCredit(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: HwSize.space3,
        children: [
          Text(l.damNote, style: text.labelLarge!.copyWith(color: c.inkMuted)),
          for (final (i, d) in shown.indexed) ...[if (i > 0) Divider(height: 1, color: c.line), DamRow(dam: d)],
        ],
      ),
    );
  }
}
