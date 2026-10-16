import 'package:flutter/material.dart';

import '../api/models.dart';
import '../format.dart';
import '../l10n/gen/app_localizations.dart';
import '../theme/hw_app_theme.dart';
import 'hw_card.dart';
import 'source_link.dart';

/// NASA_ATTRIBUTION in packages/core/src/nasa.ts. Kept in English on purpose: it is NASA's credit line.
const nasaFirmsCredit = 'Fires: NASA FIRMS (LANCE/ESDIS)';
const nasaEonetCredit = 'Events: NASA EONET';

String nasaEventName(AppLocalizations l, String category) => switch (category) {
  'severeStorms' => l.nasaEventSevereStorms,
  'volcanoes' => l.nasaEventVolcanoes,
  'floods' => l.nasaEventFloods,
  'landslides' => l.nasaEventLandslides,
  _ => category,
};

/// Fires and open NASA events near the chosen district (web NasaCard). Display only: satellite data lags hours and is
/// never an alert, so there is no severity pill or sev* colour. Nothing near → one calm line.
class NasaCard extends StatelessWidget {
  const NasaCard({super.key, required this.near, required this.now, this.updatedAt, this.note});

  final NasaNear near;
  final DateTime now;

  /// When the NASA feeds last loaded; null hides the time.
  final DateTime? updatedAt;

  /// Data-age note (a failed feed), shown in the card's neutral note box.
  final String? note;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final fires = near.fires;
    final credit = [
      nasaFirmsCredit,
      nasaEonetCredit,
      if (updatedAt != null) '${l.commonUpdated} ${clockText(l, updatedAt!, now)}',
    ].join(' · ');
    return HwCard(
      title: l.nasaCardTitle,
      note: note,
      source: SourceText(
        credit,
        sources: [?sourceRef('NASA FIRMS', 'nasa-firms'), ?sourceRef('NASA EONET', 'nasa-eonet')],
      ),
      child: near.quiet
          ? Text(l.nasaFiresNone, style: text.bodyLarge!.copyWith(color: c.inkMuted))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: HwSize.space2,
              children: [
                if (fires.count > 0) ...[
                  Text(l.nasaFiresCount('${fires.count}', numberText(fires.radiusKm)), style: text.bodyLarge),
                  if (fires.nearestKm != null)
                    Text(
                      l.nasaFiresNearest(kmText(fires.nearestKm!)),
                      style: text.bodySmall!.copyWith(color: c.inkMuted),
                    ),
                ] else
                  Text(l.nasaFiresNone, style: text.bodyLarge!.copyWith(color: c.inkMuted)),
                if (near.events.isNotEmpty) ...[
                  Divider(height: 1, color: c.line),
                  for (final e in near.events)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: HwSize.space2,
                      children: [
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: nasaEventName(l, e.category),
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                ),
                                TextSpan(text: ' ${e.title}'),
                              ],
                            ),
                            style: text.bodyLarge,
                          ),
                        ),
                        Text(l.nasaEventKm('${e.km.round()}'), style: text.bodyLarge!.copyWith(color: c.inkMuted)),
                      ],
                    ),
                ],
                Text(l.nasaDisclaimer, style: text.bodySmall!.copyWith(color: c.inkMuted)),
              ],
            ),
    );
  }
}
