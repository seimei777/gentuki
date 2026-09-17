# -*- coding: utf-8 -*-
"""対応8市の外側を薄くグレーで覆うためのマスク（穴あきポリゴン）を作る。
   外枠は日本全体を覆う四角、穴が対応エリア。

   入力 data/bnd/*.geojson は「日本の市区町村界データ」（uedayou.net/loa/・
   国土数値情報の行政区域データ由来 / CC BY 4.0）。8市ぶんを置いてある。
   市境で隙間が出ないよう少し太らせてから戻し、15m 相当で間引いている。"""
import json, glob, os
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sorted(glob.glob(os.path.join(ROOT, 'data', 'bnd', '*.geojson')))
if not SRC:
    raise SystemExit('data/bnd/ に市境の geojson がありません')

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

DST = os.path.join(ROOT, 'docs', 'data', 'mask.min.geojson')
json.dump(doc, open(DST,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
print('out', os.path.getsize(DST), 'bytes')
