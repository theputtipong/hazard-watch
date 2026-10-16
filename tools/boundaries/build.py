#!/usr/bin/env python3
"""
Usage: python3 tools/boundaries/build.py [--subdistricts]   (re-downloads only missing files into .cache)

Provinces and districts cover the whole country. Tambon stay limited to SUBDISTRICT_PROVINCES and are only rebuilt with
--subdistricts (that needs the ~180 MB OCHA download); otherwise the committed subdistricts.json is kept as is.

Sources and licences:
  - geoBoundaries THA ADM1 (OSM / ODbL) and ADM2 (RTSD via OCHA / CC BY-IGO)
  - OCHA COD-AB Thailand name table (CC BY-IGO)
  - BMA GIS (cpudgiapp.bangkok.go.th) layer 16: Bangkok's 180 khwaeng
  - OCHA COD-AB tha_admin3 tambon polygons outside Bangkok: only the admin3 members of the 377 MB zip
    are range-fetched (~180 MB) and parsed without GDAL.

Thai names are attached by locating OCHA centre points inside polygons, so English spelling differences don't matter.
"""
import json, os, re, struct, sys, urllib.request, zipfile, zlib
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
OUT = os.path.join(HERE, '..', '..', 'apps', 'web', 'public', 'geo')

# Bangkok + 5 metropolitan provinces: the only ones with tambon (subdistricts.json is large).
SUBDISTRICT_PROVINCES = ['TH10', 'TH11', 'TH12', 'TH13', 'TH73', 'TH74']
DECIMALS = 5  # ~1 m; keeps files small
# Degrees (~33 m); OCHA tambon polygons are very detailed.
SIMPLIFY_DEG = 0.0003
# Provinces and districts nationwide: ~11 m precision is far below the simplification below.
ADMIN_DECIMALS = 4
# Simplification per output: (max degrees, max share of a polygon's size). 0.001 deg ~ 110 m. The size cap keeps
# Bangkok districts (a few km across) from collapsing to triangles at the rural tolerance.
PROVINCE_TOL = (0.004, 0.05)
DISTRICT_TOL = (0.004, 0.05)       # districts.json: web map (budget 1.2 MB)
DISTRICT_LITE_TOL = (0.015, 0.06)  # districts-lite.json: worker/extension/phone lookups (budget 600 KB / 200 KB gzip)
# Push alerts and the phone's Bangkok zones match stations to districts in these provinces, so districts-lite keeps
# them (and their borders with neighbours) exactly as in districts.json; only the rest of the country is coarser.
LITE_EXACT_PROVINCES = set(SUBDISTRICT_PROVINCES)

OCHA_SHP_ZIP = 'https://data.humdata.org/dataset/d24bdc45-eb4c-4e3d-8b16-44db02667c27/resource/10dde461-b781-4904-9559-7deb3e960913/download/tha_admin_boundaries.shp.zip'

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


def fetch_zip_members(url, names):
    """Download only the named members of a remote zip (range requests on the central directory and data)."""
    out = {n: os.path.join(CACHE, n) for n in names}
    if all(os.path.exists(p) for p in out.values()):
        return out
    os.makedirs(CACHE, exist_ok=True)

    def get(start, end):
        req = urllib.request.Request(url, headers={'Range': f'bytes={start}-{end}'})
        with urllib.request.urlopen(req) as r:
            total = int(r.headers['Content-Range'].split('/')[-1])
            return r.read(), total

    _, total = get(0, 0)
    start = max(0, total - 65536)  # the zip's central directory sits at the end
    data, _ = get(start, total - 1)
    i = data.rfind(b'PK\x05\x06')
    cd_size, cd_off = struct.unpack('<II', data[i + 12:i + 20])
    cd = data[cd_off - start:cd_off - start + cd_size]
    entries, p = {}, 0
    while p < len(cd) and cd[p:p + 4] == b'PK\x01\x02':
        method = struct.unpack('<H', cd[p + 10:p + 12])[0]
        comp = struct.unpack('<I', cd[p + 20:p + 24])[0]
        nl, el, cl = struct.unpack('<HHH', cd[p + 28:p + 34])
        off = struct.unpack('<I', cd[p + 42:p + 46])[0]
        entries[cd[p + 46:p + 46 + nl].decode()] = (method, comp, off)
        p += 46 + nl + el + cl
    for name in names:
        method, comp, off = entries[name]
        header, _ = get(off, off + 29)
        nl, el = struct.unpack('<HH', header[26:30])
        start = off + 30 + nl + el
        print(f'download {name} ({comp / 1e6:.1f} MB)')
        raw, _ = get(start, start + comp - 1)
        with open(out[name], 'wb') as f:
            f.write(zlib.decompress(raw, -15) if method == 8 else raw)
    return out


def read_dbf(path):
    with open(path, 'rb') as f:
        n, header_len, rec_len = struct.unpack('<xxxxIHH20x', f.read(32))
        fields = []
        while True:
            d = f.read(32)
            if d[0] == 0x0D:
                break
            fields.append((d[:11].split(b'\0')[0].decode(), d[16]))
        f.seek(header_len)
        rows = []
        for _ in range(n):
            rec = f.read(rec_len)
            pos, row = 1, {}
            for name, size in fields:
                row[name] = rec[pos:pos + size].decode('utf-8', 'replace').strip()
                pos += size
            rows.append(row)
    return rows


def read_shp_polygons(shp_path, shx_path, wanted):
    with open(shx_path, 'rb') as shx:
        shx.seek(100)
        index = [struct.unpack('>ii', shx.read(8)) for _ in range((os.path.getsize(shx_path) - 100) // 8)]
    with open(shp_path, 'rb') as shp:
        for i in sorted(wanted):
            offset_words, _ = index[i]
            shp.seek(offset_words * 2 + 8)
            shape_type = struct.unpack('<i', shp.read(4))[0]
            if shape_type not in (5, 15, 25):
                continue
            shp.read(32)  # bbox
            num_parts, num_points = struct.unpack('<ii', shp.read(8))
            parts = list(struct.unpack(f'<{num_parts}i', shp.read(4 * num_parts))) + [num_points]
            pts = struct.unpack(f'<{2 * num_points}d', shp.read(16 * num_points))
            ring_list = [[[pts[2 * k], pts[2 * k + 1]] for k in range(parts[j], parts[j + 1])] for j in range(num_parts)]
            # Outer rings are clockwise in shapefiles; holes counter-clockwise.
            polys = []
            for ring in ring_list:
                area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
                if area < 0 or not polys:
                    polys.append([ring])
                else:
                    polys[-1].append(ring)
            yield i, ({'type': 'Polygon', 'coordinates': polys[0]} if len(polys) == 1 else {'type': 'MultiPolygon', 'coordinates': polys})


def _dp(points, tol):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[b]
        dx, dy = x2 - x1, y2 - y1
        norm = (dx * dx + dy * dy) ** 0.5
        best, idx = 0.0, -1
        for k in range(a + 1, b):
            px, py = points[k]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm if norm else ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
            if d > best:
                best, idx = d, k
        if best > tol and idx > 0:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tol):
    """Split at the farthest vertex first: Douglas-Peucker does nothing on a closed ring (both ends coincide)."""
    if len(ring) <= 4:
        return ring
    x0, y0 = ring[0]
    far = max(range(1, len(ring) - 1), key=lambda k: (ring[k][0] - x0) ** 2 + (ring[k][1] - y0) ** 2)
    out = _dp(ring[:far + 1], tol)[:-1] + _dp(ring[far:], tol)
    return out if len(out) >= 4 else ring


def simplify(geom, tol):
    polys = rings(geom)
    simple = [[simplify_ring(r, tol) for r in poly] for poly in polys]
    return {'type': 'Polygon', 'coordinates': simple[0]} if geom['type'] == 'Polygon' else {'type': 'MultiPolygon', 'coordinates': simple}


def admin_tolerances(geoms, max_tol, ratio):
    """Per-polygon tolerance: max_tol, or ratio * size (sqrt of the bbox area) for small polygons."""
    tols = []
    for geom in geoms:
        x0, y0, x1, y1 = bbox(geom)
        tols.append(min(max_tol, ratio * ((x1 - x0) * (y1 - y0)) ** 0.5))
    return tols


def simplify_shared(geoms, tols, exact=(), exact_tols=None):
    """Simplify polygons that share borders so neighbours keep identical edges (no gaps or overlaps for lookups).

    The sources share exact vertices along common borders. Rings are cut wherever the set of polygons using a vertex
    changes; each piece is simplified once (in a fixed direction, with the smallest tolerance among its owners) and
    every ring then keeps only the surviving vertices.

    Pieces owned by any polygon in `exact` use the smallest of `exact_tols` among their owners instead, so those
    polygons come out identical to a run with `exact_tols` for every polygon.
    """
    owners = {}
    for i, geom in enumerate(geoms):
        for poly in rings(geom):
            for ring in poly:
                for c in ring:
                    owners.setdefault((c[0], c[1]), set()).add(i)
    nodes = {p for p, o in owners.items() if len(o) >= 3}
    all_rings = [[(c[0], c[1]) for c in ring] for geom in geoms for poly in rings(geom) for ring in poly]
    for pts in all_rings:
        for a, b in zip(pts, pts[1:]):
            # Where a shared border ends, cut at the vertex that still belongs to more polygons.
            if owners[a] != owners[b]:
                nodes.update(q for q, other in ((a, b), (b, a)) if not owners[q] < owners[other])
    for pts in all_rings:
        # A ring with no junctions (island, or enclosed by one neighbour): cut at points any copy of it agrees on.
        if not nodes.intersection(pts):
            first = min(pts)
            nodes.update((first, max(pts, key=lambda q: (q[0] - first[0]) ** 2 + (q[1] - first[1]) ** 2)))
    keep, done = set(nodes), set()
    for pts in all_rings:
        start = next(k for k, q in enumerate(pts) if q in nodes)
        seq = pts[start:-1] + pts[:start + 1]
        cuts = [k for k, q in enumerate(seq) if q in nodes]
        for a, b in zip(cuts, cuts[1:]):
            piece = seq[a:b + 1]
            if piece[0] > piece[-1] or (piece[0] == piece[-1] and piece[1] > piece[-2]):
                piece = piece[::-1]
            key = tuple(piece)
            if len(piece) < 3 or key in done:
                continue
            done.add(key)
            own = owners[piece[1]]
            tol = min((exact_tols if own & exact else tols)[o] for o in own)
            keep.update(_dp(list(piece), tol))
    out = []
    for geom in geoms:
        simple = []
        for poly in rings(geom):
            kept = [[c for c in ring if (c[0], c[1]) in keep] for ring in poly]
            simple.append([k if len(k) >= 4 else ring for k, ring in zip(kept, poly)])
        out.append({'type': 'Polygon', 'coordinates': simple[0]} if geom['type'] == 'Polygon'
                   else {'type': 'MultiPolygon', 'coordinates': simple})
    return out


def read_xlsx(path):
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


def rounded(geom, decimals=DECIMALS):
    def r(c):
        return [round(c[0], decimals), round(c[1], decimals)]

    def ring_of(ring):
        out = [r(c) for c in ring]
        if decimals == DECIMALS:
            return out
        # Coarser rounding can merge neighbouring vertices; drop the repeats (deterministic, so shared borders match).
        dedup = [c for k, c in enumerate(out) if k == 0 or c != out[k - 1]]
        return dedup if len(dedup) >= 4 else out
    return {'type': geom['type'], 'coordinates': [[ring_of(ring) for ring in poly] for poly in rings(geom)]
            if geom['type'] == 'MultiPolygon' else [ring_of(ring) for ring in geom['coordinates']]}


def bbox(geom, decimals=DECIMALS):
    xs = [c[0] for poly in rings(geom) for ring in poly for c in ring]
    ys = [c[1] for poly in rings(geom) for ring in poly for c in ring]
    return [round(min(xs), decimals), round(min(ys), decimals), round(max(xs), decimals), round(max(ys), decimals)]


def feature(geom, decimals=DECIMALS, **props):
    return {'type': 'Feature', 'properties': {**props, 'bbox': bbox(geom, decimals)}, 'geometry': rounded(geom, decimals)}


def match(polygons, table, pcode_key, lat_key='center_lat', lng_key='center_lon'):
    found = {}
    for row in table:
        lat, lng = float(row[lat_key]), float(row[lng_key])
        for i, f in enumerate(polygons):
            if i not in found and contains(f['geometry'], lng, lat):
                found[i] = row
                break
    return found


def admin_features(polygons, matched, tol, exact_tol=None, exact_parents=(), **props_of):
    """Simplified features for the matched polygons; props_of maps property name -> OCHA column (or a fixed value).

    Polygons whose parent is in exact_parents are simplified with exact_tol (shared borders included).
    """
    items = sorted(matched.items(), key=lambda kv: kv[1][props_of['id']])
    geoms = [polygons[i]['geometry'] for i, _ in items]
    exact = {k for k, (_, r) in enumerate(items) if r.get(props_of['parent']) in exact_parents} if exact_tol else set()
    simple = simplify_shared(geoms, admin_tolerances(geoms, *tol), exact,
                             admin_tolerances(geoms, *exact_tol) if exact_tol else None)
    return [feature(g, ADMIN_DECIMALS, **{k: (r[v] if isinstance(v, str) else v[0]) for k, v in props_of.items()})
            for g, (_, r) in zip(simple, items)]


def write(name, feats):
    feats.sort(key=lambda f: f['properties']['id'])
    path = os.path.join(OUT, f'{name}.json')
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(path, 'w'), ensure_ascii=False, separators=(',', ':'))
    print(f'{name:15} {len(feats):4} features  {os.path.getsize(path) / 1024:7.0f} KB')


def build_subdistricts():
    bma = json.load(open(fetch('bma_subdistricts.geojson')))['features']
    subdistricts = [feature(f['geometry'], id='TH' + f['properties']['SUBDISTRICT_CODE'], parent='TH' + f['properties']['DISTRICT_CODE'],
                            level=3, name_th=f['properties']['SUBDISTRICT_NAME_T'].strip(),
                            name_en=f['properties']['SUBDISTRICT_NAME_E'].strip().title())
                    for f in bma if f.get('geometry')]

    # Tambon outside Bangkok come from OCHA (Bangkok uses the BMA layer above).
    others = [pc for pc in SUBDISTRICT_PROVINCES if pc != 'TH10']
    if others:
        files = fetch_zip_members(OCHA_SHP_ZIP, ['tha_admin3.shp', 'tha_admin3.shx', 'tha_admin3.dbf'])
        rows = read_dbf(files['tha_admin3.dbf'])
        wanted = {i for i, r in enumerate(rows) if r.get('adm1_pcode') in others}
        for i, geom in read_shp_polygons(files['tha_admin3.shp'], files['tha_admin3.shx'], wanted):
            r = rows[i]
            subdistricts.append(feature(simplify(geom, SIMPLIFY_DEG), id=r['adm3_pcode'], parent=r['adm2_pcode'], level=3,
                                        name_th=r['adm3_name1'], name_en=r['adm3_name']))
    return subdistricts


def main():
    names = read_xlsx(fetch('ocha_names.xlsx'))
    adm1 = names['tha_admin1']
    adm2 = names['tha_admin2']

    gb1 = json.load(open(fetch('gb_adm1.geojson')))['features']
    gb2 = json.load(open(fetch('gb_adm2.geojson')))['features']

    m1, m2 = match(gb1, adm1, 'adm1_pcode'), match(gb2, adm2, 'adm2_pcode')
    province_props = dict(id='adm1_pcode', parent=(None,), level=(1,), name_th='adm1_name1', name_en='adm1_name')
    district_props = dict(id='adm2_pcode', parent='adm1_pcode', level=(2,), name_th='adm2_name1', name_en='adm2_name')
    provinces = admin_features(gb1, m1, PROVINCE_TOL, **province_props)
    districts = admin_features(gb2, m2, DISTRICT_TOL, **district_props)
    districts_lite = admin_features(gb2, m2, DISTRICT_LITE_TOL, DISTRICT_TOL, LITE_EXACT_PROVINCES, **district_props)

    os.makedirs(OUT, exist_ok=True)
    if '--subdistricts' in sys.argv:
        subdistricts = build_subdistricts()
        write('subdistricts', subdistricts)
    else:
        subdistricts = json.load(open(os.path.join(OUT, 'subdistricts.json')))['features']
        print(f'subdistricts    {len(subdistricts):4} features  kept (pass --subdistricts to rebuild)')

    missing = {'provinces': len(adm1) - len(provinces), 'districts': len(adm2) - len(districts)}
    for name, feats in [('provinces', provinces), ('districts', districts), ('districts-lite', districts_lite)]:
        write(name, feats)
    # Lets the server name ids for link previews without loading the polygons.
    names = {f['properties']['id']: [f['properties']['name_th'], f['properties']['name_en']]
             for f in provinces + districts + subdistricts}
    path = os.path.join(OUT, 'names.json')
    json.dump(names, open(path, 'w'), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    print(f'names           {len(names):4} entries   {os.path.getsize(path) / 1024:7.0f} KB')
    # Thai province names in pcode order, for provincesTh in packages/core/src/regions.ts.
    print('provincesTh', json.dumps([f['properties']['name_th'] for f in provinces], ensure_ascii=False))
    if any(missing.values()):
        print('WARNING: unmatched', missing, file=sys.stderr)


if __name__ == '__main__':
    main()
