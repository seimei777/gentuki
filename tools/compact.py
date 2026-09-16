# -*- coding: utf-8 -*-
"""genki.geojson を配信用に圧縮する。
   全フィーチャに同じ文字列を繰り返し持たせていた分（detail/src/title/confidence/kind）を落とし、
   アプリ側の表テーブルから復元する。geometry も表示用に間引く。"""
import json, math, sys, os

SRC = sys.argv[1] if len(sys.argv) > 1 else 'data/genki.geojson'
DST = sys.argv[2] if len(sys.argv) > 2 else 'web/data/genki.min.geojson'

L = {'two_stage_likely':0,'two_stage_required_sign':1,'two_stage_forbidden':2,
     'moped_banned':3,'expressway':4,'two_stage_likely_line':5,'pedestrian_only':6}
CITY = {'神戸市':0,'西宮市':1,'宝塚市':2,'尼崎市':3,'伊丹市':4,'芦屋市':5,'川西市':6,'池田市':7}

def simplify(pts, tol):
    if len(pts) < 3: return pts
    mx = 111320*math.cos(math.radians(pts[0][1])); my = 110540
    keep = {0, len(pts)-1}; st = [(0, len(pts)-1)]
    while st:
        a,b = st.pop()
        if b-a < 2: continue
        x0,y0 = pts[a]; x1,y1 = pts[b]
        dx,dy = (x1-x0)*mx, (y1-y0)*my; Ln = math.hypot(dx,dy)
        best = -1; bi = a
        for i in range(a+1, b):
            px,py = (pts[i][0]-x0)*mx, (pts[i][1]-y0)*my
            d = abs(px*dy-py*dx)/Ln if Ln > 1e-9 else math.hypot(px,py)
            if d > best: best = d; bi = i
        if best > tol:
            keep.add(bi); st.append((a,bi)); st.append((bi,b))
    return [pts[i] for i in sorted(keep)]

def rnd(pts): return [[round(x,5), round(y,5)] for x,y in pts]

src = json.load(open(SRC, encoding='utf-8'))
titles = []          # moped_banned / expressway の名称テーブル
tindex = {}
out = []
for f in src['features']:
    p = f['properties']; g = f['geometry']; lay = p['layer']
    q = {'l': L[lay]}
    if p.get('city') in CITY: q['c'] = CITY[p['city']]
    if lay in ('two_stage_likely','two_stage_likely_line'):
        if p.get('lanes'): q['n'] = int(p['lanes'])
        if p.get('koma') is not None: q['k'] = p['koma']
        if p.get('osm') is not None: q['o'] = p['osm']      # OSMの片側車線数
        if p.get('road'):
            r = p['road']
            if r not in tindex:
                tindex[r] = len(titles); titles.append(r)
            q['r'] = tindex[r]
    if lay in ('moped_banned','expressway','pedestrian_only'):
        t = p.get('title') or ''
        if t not in tindex:
            tindex[t] = len(titles); titles.append(t)
        q['t'] = tindex[t]
    if lay in ('moped_banned','pedestrian_only'):
        if p.get('excl'): q['x'] = p['excl']
        if p.get('time'): q['h'] = p['time']
        if p.get('cond'): q['d'] = p['cond']
        q['a'] = 1 if p.get('always') else 0
    if lay == 'expressway':
        q['e'] = 1 if p.get('kind') == 'moped_no' else 0

    if g['type'] == 'LineString':
        tol = 20 if lay == 'expressway' else (12 if lay == 'moped_banned' else 6)
        geom = {'type':'LineString','coordinates':rnd(simplify(g['coordinates'], tol))}
    else:
        geom = {'type':'Point','coordinates':[round(g['coordinates'][0],5), round(g['coordinates'][1],5)]}
    out.append({'type':'Feature','properties':q,'geometry':geom})

doc = {'type':'FeatureCollection','titles':titles,'features':out}
json.dump(doc, open(DST,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
print('features', len(out), 'titles', len(titles))
print('in ', os.path.getsize(SRC))
print('out', os.path.getsize(DST))
