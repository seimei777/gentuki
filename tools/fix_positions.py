# -*- coding: utf-8 -*-
"""二段階右折の地点を、信号機の座標へ置き直す。

これまでは「車両通行帯（交差点）」の区間の端に置いていた。信号は
そこから80m以内にあれば採用という作りなので、交差点との最大80mの
ズレが構造的に入り、交差点の手前や曲がった先の道に円が乗って見えていた。
交差点そのものは信号機（規制種別コード98）の座標なので、そちらへ移す。
進入路の線も、信号まで届くように終端を差し替える。

元CSVから uk で引き当てて動かすだけで、判定条件は一切変えない。
"""
import csv, sys, json, math, collections, os
csv.field_size_limit(sys.maxsize)

SRCS = [('hyogo/typeD_hyogo/兵庫県警_202607_k_2.1.csv', '兵庫県警'),
        ('osaka/typeD_osaka/大阪府警_202607_k_2.1.csv', '大阪府警')]
BASE = sys.argv[1]
GEO  = sys.argv[2]

def coords(s):
    out = []
    for tok in s.split(';'):
        a = tok.split()
        if len(a) >= 2:
            try: out.append((float(a[0]), float(a[1])))
            except ValueError: pass
    return out

sig = []
lane = {}                       # uk -> 区間の点列
for rel, pref in SRCS:
    path = os.path.join(BASE, rel)
    if not os.path.exists(path):
        print('見つからない:', path); continue
    n = 0
    for row in csv.DictReader(open(path, encoding='cp932', newline='')):
        c = row['共通規制種別コード']
        if c == '98':
            p = coords(row['規制場所の経度緯度'])
            if p: sig.append(p[0])
        elif c == '58':
            ln = row['車両通行帯数']
            if not ln.isdigit() or int(ln) < 3: continue
            p = coords(row['規制場所の経度緯度'])
            if p: lane[row['ユニークキー']] = p
        n += 1
    print(f'{pref}: {n:,} 行を読んだ')
print(f'信号 {len(sig):,} 件 / 通行帯3以上 {len(lane):,} 件')

C = 0.004
G = collections.defaultdict(list)
for p in sig: G[(int(p[0]/C), int(p[1]/C))].append(p)

def nearest(x, y, rad):
    mx = 111320*math.cos(math.radians(y)); my = 110540
    b = None; bd = 1e9
    kx, ky = int(x/C), int(y/C)
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for p in G.get((kx+i, ky+j), ()):
                d = math.hypot((p[0]-x)*mx, (p[1]-y)*my)
                if d < bd: bd = d; b = p
    return (b, bd) if bd <= rad else (None, bd)

def signal_for(uk):
    """build_data.py と同じ順で端点を選び、その近くの信号を返す。"""
    pts = lane.get(uk)
    if not pts: return None
    for cand in (pts[-1], pts[0]):
        s, d = nearest(cand[0], cand[1], 80)
        if s: return s, cand, d
    return None

doc = json.load(open(GEO, encoding='utf-8'))
moved = 0; miss = 0; dists = []
sigpos = {}
for f in doc['features']:
    p = f['properties']
    if p.get('layer') != 'two_stage_likely': continue
    r = signal_for(p.get('uk'))
    if not r: miss += 1; continue
    s, cand, d = r
    old = f['geometry']['coordinates']
    mx = 111320*math.cos(math.radians(old[1])); my = 110540
    dists.append(math.hypot((s[0]-old[0])*mx, (s[1]-old[1])*my))
    f['geometry']['coordinates'] = [round(s[0], 5), round(s[1], 5)]
    sigpos[p['uk']] = f['geometry']['coordinates']
    moved += 1

# 進入路の線も信号まで伸ばす（終端が交差点に届いていないと向きが読めない）
ext = 0
for f in doc['features']:
    p = f['properties']
    if p.get('layer') != 'two_stage_likely_line': continue
    s = sigpos.get(p.get('uk'))
    if not s: continue
    cs = f['geometry']['coordinates']
    if len(cs) >= 2 and cs[-1] != s:
        cs[-1] = s; ext += 1

dists.sort()
def q(x): return round(dists[int(len(dists)*x)]) if dists else 0
print(f'移動 {moved} 件 / 元CSVに無く据え置き {miss} 件 / 線の終端を伸ばした {ext} 件')
print(f'移動距離: 中央値 {q(.5)}m / 75% {q(.75)}m / 90% {q(.9)}m / 最大 {round(dists[-1]) if dists else 0}m')
json.dump(doc, open(GEO, 'w', encoding='utf-8'), ensure_ascii=False)
print('書き出し:', GEO)
