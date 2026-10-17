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

/// "ข้อมูลจาก กรมอุตุนิยมวิทยา · earthquake.tmd.go.th" for the alert's main source, so a notification away from the app
/// still names the agency and its site (Google Play source-link policy); null for a kind with no known source.
String? alertCreditLine(AppLocalizations l, String kind) {
  for (final id in alertSourceIds(kind)) {
    final agency = sourceAgency(l, id);
    final domain = sourceDomain(id);
    if (agency != null && domain != null) return l.sourceDataFrom(agency, domain);
  }
  return null;
}
