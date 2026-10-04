#!/usr/bin/env python3
"""
Builds the zone boundary files used by the map (apps/web/public/geo/*.json).

Sources (downloaded into tools/boundaries/.cache, not committed):
  - geoBoundaries THA ADM1 (provinces, OSM / ODbL) and ADM2 (districts, RTSD via OCHA / CC BY-IGO), simplified
  - OCHA COD-AB Thailand name table (Thai/English names, pcodes, centres; CC BY-IGO)
  - BMA GIS (cpudgiapp.bangkok.go.th) layer 16: Bangkok's 180 subdistricts (khwaeng)

Thai names are attached by finding which polygon contains each OCHA centre point, so differences in
English spelling between sources do not matter.

Usage:  python3 tools/boundaries/build.py            (re-downloads only missing files)
Change which provinces are built in PROVINCES below (pcodes; keep in sync with packages/core/src/regions.ts).
"""
import json, os, re, sys, urllib.request, zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, '..', '..', 'apps', 'web', 'public', 'geo')

# Bangkok + 5 metropolitan provinces.
PROVINCES = ['TH10', 'TH11', 'TH12', 'TH13', 'TH73', 'TH74']
DECIMALS = 5  # ~1 m; keeps files small

SOURCES = {
    'gb_adm1.geojson': 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/THA/ADM1/geoBoundaries-THA-ADM1_simplified.geojson',
    'gb_adm2.geojson': 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/THA/ADM2/geoBoundaries-THA-ADM2_simplified.geojson',
    'ocha_names.xlsx': 'https://data.humdata.org/dataset/d24bdc45-eb4c-4e3d-8b16-44db02667c27/resource/a925b917-01ae-48c4-9279-7efe680a6b11/download/tha_admin_boundaries.xlsx',
    'bma_subdistricts.geojson': (
        'https://cpudgiapp.bangkok.go.th/arcgis/rest/services/PWD/BMAGI_Basemap_2564/MapServer/16/query'
        '?where=1%3D1&outFields=SUBDISTRICT_CODE,SUBDISTRICT_NAME_T,SUBDISTRICT_NAME_E,DISTRICT_CODE'
        '&outSR=4326&maxAllowableOffset=0.0002&geometryPrecision=5&f=geojson'
    ),
}


def fetch(name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        print('download', name)
        urllib.request.urlretrieve(SOURCES[name], path)
    return path


def read_xlsx(path):
    """Minimal .xlsx reader (no openpyxl needed): returns {sheet_name: [row dicts]}."""
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    z = zipfile.ZipFile(path)
    shared = [''.join(t.text or '' for t in si.iter('{%s}t' % ns['m']))
              for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    names = [s.get('name') for s in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', ns)]
    out = {}
    for i, sheet in enumerate(names):
        rows = []
        for r in ET.fromstring(z.read(f'xl/worksheets/sheet{i + 1}.xml')).iter('{%s}row' % ns['m']):
            row = {}
            for c in r.findall('m:c', ns):
                col = re.match(r'[A-Z]+', c.get('r')).group()
                v = c.find('m:v', ns)
                row[col] = None if v is None else (shared[int(v.text)] if c.get('t') == 's' else v.text)
            rows.append(row)
        header = rows[0]
        out[sheet] = [{header[k]: r.get(k) for k in header} for r in rows[1:]]
    return out


def rings(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates']]
    return geom['coordinates']


def contains(geom, lng, lat):
    """Ray casting; holes handled by even-odd across all rings of each polygon."""
    for poly in rings(geom):
        inside = False
        for ring in poly:
            j = len(ring) - 1
            for i in range(len(ring)):
                xi, yi = ring[i][0], ring[i][1]
                xj, yj = ring[j][0], ring[j][1]
                if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i
        if inside:
            return True
    return False


def rounded(geom):
    def r(c):
        return [round(c[0], DECIMALS), round(c[1], DECIMALS)]
    return {'type': geom['type'], 'coordinates': [[[r(c) for c in ring] for ring in poly] for poly in rings(geom)]
            if geom['type'] == 'MultiPolygon' else [[r(c) for c in ring] for ring in geom['coordinates']]}


def bbox(geom):
    xs = [c[0] for poly in rings(geom) for ring in poly for c in ring]
    ys = [c[1] for poly in rings(geom) for ring in poly for c in ring]
    return [round(min(xs), DECIMALS), round(min(ys), DECIMALS), round(max(xs), DECIMALS), round(max(ys), DECIMALS)]


def feature(geom, **props):
    return {'type': 'Feature', 'properties': {**props, 'bbox': bbox(geom)}, 'geometry': rounded(geom)}


def match(polygons, table, pcode_key, lat_key='center_lat', lng_key='center_lon'):
    """Return {polygon index: name row} by locating each name row's centre inside a polygon."""
    found = {}
    for row in table:
        lat, lng = float(row[lat_key]), float(row[lng_key])
        for i, f in enumerate(polygons):
            if i not in found and contains(f['geometry'], lng, lat):
                found[i] = row
                break
    return found


def main():
    names = read_xlsx(fetch('ocha_names.xlsx'))
    adm1 = [r for r in names['tha_admin1'] if r['adm1_pcode'] in PROVINCES]
    adm2 = [r for r in names['tha_admin2'] if r['adm1_pcode'] in PROVINCES]

    gb1 = json.load(open(fetch('gb_adm1.geojson')))['features']
    gb2 = json.load(open(fetch('gb_adm2.geojson')))['features']

    provinces = [feature(gb1[i]['geometry'], id=r['adm1_pcode'], parent=None, level=1,
                         name_th=r['adm1_name1'], name_en=r['adm1_name'])
                 for i, r in match(gb1, adm1, 'adm1_pcode').items()]
    districts = [feature(gb2[i]['geometry'], id=r['adm2_pcode'], parent=r['adm1_pcode'], level=2,
                         name_th=r['adm2_name1'], name_en=r['adm2_name'])
                 for i, r in match(gb2, adm2, 'adm2_pcode').items()]

    bma = json.load(open(fetch('bma_subdistricts.geojson')))['features']
    subdistricts = [feature(f['geometry'], id='TH' + f['properties']['SUBDISTRICT_CODE'], parent='TH' + f['properties']['DISTRICT_CODE'],
                            level=3, name_th=f['properties']['SUBDISTRICT_NAME_T'].strip(),
                            name_en=f['properties']['SUBDISTRICT_NAME_E'].strip().title())
                    for f in bma if f.get('geometry')]

    missing = {'provinces': len(adm1) - len(provinces), 'districts': len(adm2) - len(districts)}
    os.makedirs(OUT, exist_ok=True)
    for name, feats in [('provinces', provinces), ('districts', districts), ('subdistricts', subdistricts)]:
        feats.sort(key=lambda f: f['properties']['id'])
        path = os.path.join(OUT, f'{name}.json')
        json.dump({'type': 'FeatureCollection', 'features': feats}, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
        print(f'{name:13} {len(feats):4} features  {os.path.getsize(path) / 1024:7.0f} KB')
    if any(missing.values()):
        print('WARNING: unmatched', missing, file=sys.stderr)


if __name__ == '__main__':
    main()
