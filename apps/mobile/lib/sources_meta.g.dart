// GENERATED from packages/core/src/sources-meta.ts by tool/gen_sources.mjs. Do not edit.

class SourceMeta {
  const SourceMeta({required this.id, required this.url, required this.domain, required this.gov});

  final String id;
  final String url;

  /// Display text for the link, shown next to the agency name.
  final String domain;
  final bool gov;
}

const Map<String, SourceMeta> sourceMeta = {
  'tmd': SourceMeta(id: 'tmd', url: 'https://earthquake.tmd.go.th', domain: 'earthquake.tmd.go.th', gov: true),
  'tmd-radar': SourceMeta(id: 'tmd-radar', url: 'https://weather.tmd.go.th', domain: 'weather.tmd.go.th', gov: true),
  'air4thai': SourceMeta(id: 'air4thai', url: 'https://air4thai.pcd.go.th', domain: 'air4thai.pcd.go.th', gov: true),
  'bma-flood': SourceMeta(
    id: 'bma-flood',
    url: 'https://weather.bangkok.go.th/flood',
    domain: 'weather.bangkok.go.th',
    gov: true,
  ),
  'bma-rain': SourceMeta(
    id: 'bma-rain',
    url: 'https://weather.bangkok.go.th/rain',
    domain: 'weather.bangkok.go.th',
    gov: true,
  ),
  'bma-traffic': SourceMeta(id: 'bma-traffic', url: 'http://www.bmatraffic.com', domain: 'bmatraffic.com', gov: true),
  'thaiwater': SourceMeta(id: 'thaiwater', url: 'https://www.thaiwater.net', domain: 'thaiwater.net', gov: true),
  'rid': SourceMeta(id: 'rid', url: 'https://app.rid.go.th/reservoir', domain: 'app.rid.go.th', gov: true),
  'usgs': SourceMeta(id: 'usgs', url: 'https://earthquake.usgs.gov', domain: 'earthquake.usgs.gov', gov: true),
  'gistda': SourceMeta(id: 'gistda', url: 'https://www.gistda.or.th', domain: 'gistda.or.th', gov: true),
  'nasa-firms': SourceMeta(
    id: 'nasa-firms',
    url: 'https://firms.modaps.eosdis.nasa.gov',
    domain: 'firms.modaps.eosdis.nasa.gov',
    gov: true,
  ),
  'nasa-eonet': SourceMeta(
    id: 'nasa-eonet',
    url: 'https://eonet.gsfc.nasa.gov',
    domain: 'eonet.gsfc.nasa.gov',
    gov: true,
  ),
  'nasa-gibs': SourceMeta(
    id: 'nasa-gibs',
    url: 'https://worldview.earthdata.nasa.gov',
    domain: 'worldview.earthdata.nasa.gov',
    gov: true,
  ),
  'open-meteo': SourceMeta(id: 'open-meteo', url: 'https://open-meteo.com', domain: 'open-meteo.com', gov: false),
};

String? sourceUrl(String sourceId) => sourceMeta[sourceId]?.url;

String? sourceDomain(String sourceId) => sourceMeta[sourceId]?.domain;
