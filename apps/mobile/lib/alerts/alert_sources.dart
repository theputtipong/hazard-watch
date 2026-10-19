import '../l10n/gen/app_localizations.dart';
import '../sources_meta.g.dart';
import '../widgets/source_link.dart';

/// Source ids behind an alert of [kind]: each reading kind comes from one adapter in packages/sources. Dams are display
/// only and never an alert, so they have no entry here.
List<String> alertSourceIds(String kind) => switch (kind) {
  'flood' => const ['bma-flood'],
  'rain' => const ['bma-rain'],
  'water' => const ['thaiwater'],
  'pm25' => const ['air4thai'],
  'quake' => const ['tmd', 'usgs'],
  _ => const [],
};

/// "ข้อมูลจาก กรมอุตุนิยมวิทยา · earthquake.tmd.go.th" so a notification away from the app still names the agency and its
/// site (Google Play source-link policy); null for a kind with no known source. An alert does not say which adapter it
/// came from (a quake may be TMD's or USGS's), so a kind with several sources credits them all, joined by " / ".
String? alertCreditLine(AppLocalizations l, String kind) {
  final credits = <String>[];
  for (final id in alertSourceIds(kind)) {
    final agency = sourceAgency(l, id);
    final domain = sourceDomain(id);
    if (agency == null || domain == null) continue;
    credits.add(credits.isEmpty ? l.sourceDataFrom(agency, domain) : '$agency · $domain');
  }
  return credits.isEmpty ? null : credits.join(' / ');
}
