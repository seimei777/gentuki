# -*- coding: utf-8 -*-
"""一方通行（規制種別コード11）と指定方向外進行禁止（コード12）を取り込む。

これまで原付が入れない場所として見ていたのは通行止めと歩行者用道路だけで、
「そもそもその向きに進めない」規制を一切見ていなかった。

  コード11 一方通行: 全件が線。線の向きがそのまま通行できる向き。
  コード12 指定方向外進行禁止: 全件が点で、進入方向(座標)と
      指定する方向(座標)の両方が入っている。
      進入方向→規制地点 が来る向き、規制地点→指定する方向 が進める向き。
      同じ地点・同じ進入に対して複数行あり、それぞれが許された方向を表す。

対象車両の判定は既存の build_data.py と同じ（車両／二輪／原付のいずれか）。
「自転車を除く」等で原付が除外されていないかも同じ規則で見る。
"""
import csv, sys, json, math, collections, os, urllib.parse

SRCS = [('hyogo/typeD_hyogo/兵庫県警_202607_k_2.1.csv', '兵庫県警'),
        ('osaka/typeD_osaka/大阪府警_202607_k_2.1.csv', '大阪府警')]
CITIES = [('神戸市','兵庫県神戸市'),('西宮市','兵庫県西宮市'),('宝塚市','兵庫県宝塚市'),
          ('尼崎市','兵庫県尼崎市'),('伊丹市','兵庫県伊丹市'),('芦屋市','兵庫県芦屋市'),
          ('川西市','兵庫県川西市'),('池田市','大阪府池田市')]
BASE, BND, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
csv.field_size_limit(sys.maxsize)

def coords(s):
    out = []
    for tok in (s or '').split(';'):
        a = tok.split()
        if len(a) >= 2:
            try: out.append((float(a[0]), float(a[1])))
            except ValueError: pass
    return out

def bit(code, i):
    code = (code or '')
    return len(code) >= i and code[-i] == '1'

def hits_moped(row, pre=''):
    """車両(A1) か 二輪(D1) か 原付(D4) が対象なら原付に効く。
       自動車(A2)だけの指定は原付に効かない。"""
    A = row[f'対象{pre}車両コード1_A'] if pre else row['対象車両コード1_A']
    D = row[f'対象{pre}車両コード1_D'] if pre else row['対象車両コード1_D']
    return bit(A, 1) or bit(D, 1) or bit(D, 4)

def excluded_moped(row):
    A = row.get('除外車両コード1_A'); D = row.get('除外車両コード1_D')
    return bit(A, 1) or bit(D, 1) or bit(D, 4)

def rings(g):
    return [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']

class City:
    def __init__(s, name, path):
        d = json.load(open(path, encoding='utf-8'))
        g = d.get('geometry') or d['features'][0]['geometry']
        s.name = name; s.polys = rings(g)
        xs = []; ys = []
        for p in s.polys:
            for x, y in p[0]: xs.append(x); ys.append(y)
        s.bbox = (min(xs), min(ys), max(xs), max(ys))
    def contains(s, x, y):
        bx0, by0, bx1, by1 = s.bbox
        if not (bx0 <= x <= bx1 and by0 <= y <= by1): return False
        for poly in s.polys:
            ring = poly[0]; inside = False; n = len(ring)
            for i in range(n):
                x1, y1 = ring[i]; x2, y2 = ring[(i+1) % n]
                if (y1 > y) != (y2 > y):
                    if x < (x2-x1)*(y-y1)/(y2-y1)+x1: inside = not inside
            if inside: return True
        return False

CS = [City(n, os.path.join(BND, f + '.geojson')) for n, f in CITIES]
def which(pts):
    for x, y in pts:
        for c in CS:
            if c.contains(x, y): return c.name
    return None

def brg(a, b):
    la = math.radians((a[1]+b[1])/2)
    return (math.degrees(math.atan2((b[0]-a[0])*math.cos(la), b[1]-a[1])) + 360) % 360

def rnd(pts): return [[round(x, 5), round(y, 5)] for x, y in pts]

feats = []
ow = 0
dirs = collections.defaultdict(list)     # (地点, 進入方位) -> [進める方位]
dirmeta = {}
skipped = collections.Counter()

for rel, pref in SRCS:
    path = os.path.join(BASE, rel)
    if not os.path.exists(path):
        print('見つからない:', path); continue
    for row in csv.DictReader(open(path, encoding='cp932', newline='')):
        c = row['共通規制種別コード']
        if c not in ('11', '12'): continue
        if not hits_moped(row):  skipped[c + ':原付対象外'] += 1; continue
        if excluded_moped(row):  skipped[c + ':原付除外'] += 1; continue
        pts = coords(row['規制場所の経度緯度'])
        if not pts: continue
        city = which(pts)
        if not city: skipped[c + ':対象8市の外'] += 1; continue

        if c == '11':
            if len(pts) < 2: continue
            feats.append({'type': 'Feature',
                'geometry': {'type': 'LineString', 'coordinates': rnd(pts)},
                'properties': {'layer': 'oneway', 'city': city,
                    'title': '一方通行',
                    'detail': '線の向きにしか進めません。逆向きは通行できません。',
                    'brg': round(brg(pts[0], pts[-1])),
                    'src': pref + '/JARTIC交通規制情報',
                    'uk': row['ユニークキー'], 'confidence': 'sign'}})
            ow += 1
        else:
            ap = coords(row['進入方向(座標)']); to = coords(row['指定する方向(座標)'])
            if not ap or not to: continue
            p = pts[0]
            key = (round(p[0], 5), round(p[1], 5), round(brg(ap[0], p)))
            dirs[key].append(round(brg(p, to[0])))
            dirmeta[key] = (city, pref, row['ユニークキー'])

# 進入ごとに「進める方向」をまとめ、右折できるかどうかを出す
RIGHT = lambda d: 35 <= d <= 145          # 右折とみなす角度
for (x, y, ab), outs in dirs.items():
    city, pref, uk = dirmeta[(x, y, ab)]
    rel = sorted(set(((o - ab + 540) % 360) - 180 for o in outs))
    can_right = any(RIGHT(d) for d in rel)
    def nm(d):
        return '直進' if -35 < d < 35 else ('右折' if RIGHT(d) else ('左折' if -145 <= d <= -35 else 'Uターン'))
    feats.append({'type': 'Feature',
        'geometry': {'type': 'Point', 'coordinates': [x, y]},
        'properties': {'layer': 'no_entry_dir', 'city': city,
            'title': '指定方向外進行禁止',
            'detail': 'この方向から進入したときは、' + '・'.join(sorted(set(nm(d) for d in rel))) + 'しかできません。',
            'brg': ab, 'ok': sorted(set(nm(d) for d in rel)),
            'right': 1 if can_right else 0,
            'src': pref + '/JARTIC交通規制情報', 'uk': uk, 'confidence': 'sign'}})

nd = sum(1 for f in feats if f['properties']['layer'] == 'no_entry_dir')
nr = sum(1 for f in feats if f['properties']['layer'] == 'no_entry_dir' and not f['properties']['right'])
print(f'一方通行 {ow} 件 / 指定方向外進行禁止 {nd} 件（うち右折できない進入 {nr} 件）')
for k, v in skipped.most_common(): print(f'   除外 {k}: {v:,}')
json.dump({'type': 'FeatureCollection', 'features': feats},
          open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print('書き出し:', OUT)
