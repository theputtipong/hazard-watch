import 'package:flutter/material.dart';

import '../format.dart';
import '../l10n/gen/app_localizations.dart';
import '../map/nasa_layers.g.dart';
import '../sources_meta.g.dart';
import '../theme/hw_app_theme.dart';
import '../widgets/hw_card.dart';
import '../widgets/source_link.dart';

Future<void> openSources(BuildContext context) =>
    Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => const SourcesScreen()));

/// The not-a-government-app note first, then every agency whose data the app shows: its full name, site and page,
/// each row a link to that page (Google Play: government information must name and link its source).
class SourcesScreen extends StatelessWidget {
  const SourcesScreen({super.key});

  /// Source ids as the API sends them; BMA's flood and rain pages are separate links, so each has its own row.
  static const shown = [
    'tmd',
    'air4thai',
    'bma-flood',
    'bma-rain',
    'thaiwater',
    'rid',
    'usgs',
    'nasa-firms',
    'nasa-eonet',
    'nasa-gibs',
  ];

  /// The agency's full name; NASA product names are proper nouns, the same in every language.
  static String name(AppLocalizations l, String id) => sourceAgency(l, id) ?? sourceName(l, id);

  /// The credit line NASA asks for, kept in English as NASA words it; null for other agencies.
  static String? credit(String id) => switch (id) {
    'nasa-firms' => NasaAttribution.firms,
    'nasa-eonet' => NasaAttribution.eonet,
    'nasa-gibs' => NasaAttribution.gibs,
    _ => null,
  };

  static String description(AppLocalizations l, String id) => switch (id) {
    'tmd' => l.sourcesDescTmd,
    'air4thai' => l.sourcesDescAir4thai,
    'bma-flood' => l.sourcesDescBmaFlood,
    'bma-rain' => l.sourcesDescBmaRain,
    'thaiwater' => l.sourcesDescThaiwater,
    'rid' => l.sourcesDescRid,
    'usgs' => l.sourcesDescUsgs,
    'nasa-firms' => l.sourcesDescNasaFirms,
    'nasa-eonet' => l.sourcesDescNasaEonet,
    'nasa-gibs' => l.sourcesDescNasaGibs,
    _ => '',
  };

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(l.sourcesTitle), backgroundColor: c.bg, surfaceTintColor: Colors.transparent),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(HwSize.space4),
          children: [
            // First thing on the page: this app is not the government.
            Semantics(
              container: true,
              child: Container(
                key: const ValueKey('not-gov'),
                padding: const EdgeInsets.all(HwSize.space4),
                decoration: BoxDecoration(
                  color: c.surfaceSunken,
                  borderRadius: BorderRadius.circular(HwSize.radiusControl),
                  border: Border.all(color: c.line),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: HwSize.space3,
                  children: [
                    Icon(Icons.info_outline_rounded, color: c.ink),
                    Expanded(
                      child: Text(
                        l.disclaimerNotGov,
                        style: text.bodyLarge!.copyWith(color: c.ink, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: HwSize.space4),
            Text(l.sourcesIntro, style: text.bodyLarge!.copyWith(color: c.inkMuted)),
            const SizedBox(height: HwSize.space3),
            HwCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final (i, id) in shown.indexed) ...[
                    if (i > 0) Divider(height: 1, color: c.line),
                    _SourceRow(
                      name: name(l, id),
                      description: description(l, id),
                      credit: credit(id),
                      domain: sourceDomain(id)!,
                      url: sourceUrl(id)!,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: HwSize.space6),
            Text(l.sourcesDisclaimer, style: text.bodyMedium),
            const SizedBox(height: HwSize.space3),
            SourceText(
              l.sourcesEmergency,
              sources: const [(name: '1784', url: 'tel:1784'), (name: '191', url: 'tel:191')],
              style: text.bodyMedium!.copyWith(fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _SourceRow extends StatelessWidget {
  const _SourceRow({
    required this.name,
    required this.description,
    required this.domain,
    required this.url,
    this.credit,
  });

  final String name;

  /// The site, shown under the name ("earthquake.tmd.go.th").
  final String domain;
  final String description;
  final String? credit;
  final String url;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return Semantics(
      container: true,
      link: true,
      label: [name, domain, description, ?credit, url, l.sourcesOpenLink].join(', '),
      onTap: () => openLink(context, url),
      excludeSemantics: true,
      child: InkWell(
        onTap: () => openLink(context, url),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: HwSize.touchTarget),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: HwSize.space3),
            child: Row(
              spacing: HwSize.space3,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Text(name, style: text.titleMedium),
                      Text(domain, style: text.bodyMedium!.copyWith(fontWeight: FontWeight.w600)),
                      Text(description, style: text.bodyMedium!.copyWith(color: c.inkMuted)),
                      if (credit != null) Text(credit!, style: text.bodySmall!.copyWith(color: c.inkMuted)),
                      // The full address, so it is plain where the link goes.
                      Text(
                        url,
                        style: text.bodyMedium!.copyWith(
                          color: c.accent,
                          decoration: TextDecoration.underline,
                          decorationColor: c.accent,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.open_in_new_rounded, size: 20, color: c.accent),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Short note that the app is not a government service, with the way to the sources page.
class NotGovernmentNote extends StatelessWidget {
  const NotGovernmentNote({super.key});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l.sourcesDisclaimer, style: text.bodySmall!.copyWith(color: c.inkMuted)),
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
