# -*- coding: utf-8 -*-
"""対応8市の外側を薄くグレーで覆うためのマスク（穴あきポリゴン）を作る。
   外枠は日本全体を覆う四角、穴が対応エリア。"""
import json, glob, os
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

SRC = sorted(glob.glob(os.path.join(os.path.dirname(__file__), '..', 'scratch_bnd', '*.geojson')))
if not SRC:
    SRC = sorted(glob.glob('/private/tmp/claude-501/-Users-sazanamiseimei-Claude/4f339d54-7a82-4203-b907-013b86d570f6/scratchpad/bnd/*.geojson'))

polys = []
for p in SRC:
    d = json.load(open(p, encoding='utf-8'))
    feats = d['features'] if d.get('type') == 'FeatureCollection' else [d]
    for f in feats:
        g = shape(f['geometry'])
        if not g.is_valid: g = g.buffer(0)
        polys.append(g)
print('parts', len(polys))

u = unary_union(polys)
u = u.buffer(0.00012).buffer(-0.00012)       # 市境の隙間を埋める（約12m）
u = u.simplify(0.00015, preserve_topology=True)  # 約15m
print('union bounds', [round(v,4) for v in u.bounds])

# 外枠は地図を十分覆う大きさ
mask = box(120.0, 20.0, 155.0, 50.0).difference(u)

doc = {'type':'FeatureCollection','features':[
    {'type':'Feature','properties':{},'geometry':json.loads(json.dumps(mapping(mask)))}]}

def rnd(o):
    if isinstance(o, float): return round(o, 5)
    if isinstance(o, list): return [rnd(x) for x in o]
    if isinstance(o, tuple): return [rnd(x) for x in o]
    if isinstance(o, dict): return {k: rnd(v) for k,v in o.items()}
    return o
doc = rnd(doc)

DST = 'docs/data/mask.min.geojson'
json.dump(doc, open(DST,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
print('out', os.path.getsize(DST), 'bytes')
