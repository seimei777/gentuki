# -*- coding: utf-8 -*-
"""一方通行と指定方向外進行禁止を genki.geojson に取り込み、
   右折できない交差点を二段階右折から外す。

二段階右折は「右折するときの方法」の規制なので、指定方向外進行禁止で
その進入から右折できない交差点は、そもそも二段階右折の出番がない。
出しておくと「ここで二段階右折」と読めてしまうため、二段階右折からは外し、
指定方向外進行禁止として出す。
"""
import json, math, sys

EXTRA, GEO = sys.argv[1], sys.argv[2]

def m(a, b):
    la = math.radians((a[1]+b[1])/2)
    return math.hypot((b[0]-a[0])*111320*math.cos(la), (b[1]-a[1])*110540)
def brg(a, b):
    la = math.radians((a[1]+b[1])/2)
    return (math.degrees(math.atan2((b[0]-a[0])*math.cos(la), b[1]-a[1])) + 360) % 360
def ad(a, b):
    d = abs(a-b) % 360
    return 360-d if d > 180 else d

ex = json.load(open(EXTRA, encoding='utf-8'))['features']
doc = json.load(open(GEO, encoding='utf-8'))
nd = [f for f in ex if f['properties']['layer'] == 'no_entry_dir']

lines = {f['properties']['uk']: f['geometry']['coordinates']
         for f in doc['features'] if f['properties']['layer'] == 'two_stage_likely_line'}

drop = set()
for f in doc['features']:
    p = f['properties']
    if p['layer'] != 'two_stage_likely': continue
    cs = lines.get(p.get('uk'))
    if not cs or len(cs) < 2: continue
    ab = brg(cs[0], cs[-1]); c = f['geometry']['coordinates']
    for g in nd:
        q = g['geometry']['coordinates']; gp = g['properties']
        if m(c, q) > 40 or ad(ab, gp['brg']) > 45: continue
        if not gp['right']: drop.add(p['uk'])
        break

before = len(doc['features'])
doc['features'] = [f for f in doc['features']
                   if not (f['properties']['layer'] in ('two_stage_likely', 'two_stage_likely_line')
                           and f['properties'].get('uk') in drop)]
doc['features'].extend(ex)
json.dump(doc, open(GEO, 'w', encoding='utf-8'), ensure_ascii=False)

import collections
c = collections.Counter(f['properties']['layer'] for f in doc['features'])
print(f'右折できないため二段階右折から外した交差点: {len(drop)} 件')
print(f'フィーチャ {before} -> {len(doc["features"])}')
for k, v in sorted(c.items()): print(f'   {k:26} {v}')
