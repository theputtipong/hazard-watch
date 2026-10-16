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

/// Every agency whose data the app shows, each linked to its own site, then the not-a-government-app note.
class SourcesScreen extends StatelessWidget {
  const SourcesScreen({super.key});

  /// Source ids as the API sends them; the BMA feeds share one entry.
  static const shown = ['tmd', 'air4thai', 'bma-flood', 'thaiwater', 'usgs', 'nasa-firms', 'nasa-eonet', 'nasa-gibs'];

  /// NASA product names are proper nouns, the same in every language.
  static String name(AppLocalizations l, String id) => switch (id) {
    'nasa-firms' => 'NASA FIRMS',
    'nasa-eonet' => 'NASA EONET',
    'nasa-gibs' => 'NASA GIBS',
    _ => sourceName(l, id),
  };

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
    'bma-flood' => l.sourcesDescBma,
    'thaiwater' => l.sourcesDescThaiwater,
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
  const _SourceRow({required this.name, required this.description, required this.url, this.credit});

  final String name;
  final String description;
  final String? credit;
  final String url;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final c = context.hw;
    final text = Theme.of(context).textTheme;
    final shownUrl = url.replaceFirst(RegExp(r'^https?://'), '');
    return Semantics(
      container: true,
      link: true,
      label: [name, description, ?credit, shownUrl, l.sourcesOpenLink].join(', '),
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
                      Text(description, style: text.bodyMedium!.copyWith(color: c.inkMuted)),
                      if (credit != null) Text(credit!, style: text.bodySmall!.copyWith(color: c.inkMuted)),
                      Text(
                        shownUrl,
                        style: text.bodySmall!.copyWith(
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
