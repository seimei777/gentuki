# -*- coding: utf-8 -*-
"""進入路の線の向きを直し、地点を信号に合わせ直す。

元データは「車両通行帯（交差点）」の点列で、交差点側が pts[-1] のものと
pts[0] のものが混在している（build_data.py は両方を順に試して、信号が
80m以内にある方を交差点側としている）。

前回の fix_positions.py は、それを見ずに cs[-1] を信号へ差し替えた。
交差点側が pts[0] だったものは、間違った端を動かしたうえ、線の向きが
逆のまま残った。その結果、進入方位が約180度ずれ、
「この方向から右折するときだけ二段階右折」の判定が働かなくなっていた。

ここでは線をCSVから作り直し、必ず「交差点側が最後」になるよう並べる。
"""
import csv, sys, json, math, collections, os
csv.field_size_limit(sys.maxsize)
SRCS=[('hyogo/typeD_hyogo/兵庫県警_202607_k_2.1.csv','兵庫県警'),
      ('osaka/typeD_osaka/大阪府警_202607_k_2.1.csv','大阪府警')]
BASE, GEO = sys.argv[1], sys.argv[2]

def coords(s):
    out=[]
    for tok in (s or '').split(';'):
        a=tok.split()
        if len(a)>=2:
            try: out.append((float(a[0]),float(a[1])))
            except ValueError: pass
    return out

def simplify(pts, tol=8.0):
    if len(pts)<3: return pts
    mx=111320*math.cos(math.radians(pts[0][1])); my=110540
    keep={0,len(pts)-1}; st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop()
        if b-a<2: continue
        x0,y0=pts[a]; x1,y1=pts[b]
        dx,dy=(x1-x0)*mx,(y1-y0)*my; L=math.hypot(dx,dy)
        best=-1; bi=a
        for i in range(a+1,b):
            px,py=(pts[i][0]-x0)*mx,(pts[i][1]-y0)*my
            d=abs(px*dy-py*dx)/L if L>1e-9 else math.hypot(px,py)
            if d>best: best=d; bi=i
        if best>tol: keep.add(bi); st.append((a,bi)); st.append((bi,b))
    return [pts[i] for i in sorted(keep)]

sig=[]; lane={}
for rel,pref in SRCS:
    path=os.path.join(BASE,rel)
    if not os.path.exists(path): print('見つからない:',path); continue
    for row in csv.DictReader(open(path,encoding='cp932',newline='')):
        c=row['共通規制種別コード']
        if c=='98':
            p=coords(row['規制場所の経度緯度'])
            if p: sig.append(p[0])
        elif c=='58':
            ln=row['車両通行帯数']
            if not ln.isdigit() or int(ln)<3: continue
            p=coords(row['規制場所の経度緯度'])
            if p: lane[row['ユニークキー']]=p

C=0.004
G=collections.defaultdict(list)
for p in sig: G[(int(p[0]/C),int(p[1]/C))].append(p)
def nearest(x,y,rad):
    mx=111320*math.cos(math.radians(y)); my=110540; b=None; bd=1e9
    kx,ky=int(x/C),int(y/C)
    for i in (-1,0,1):
        for j in (-1,0,1):
            for p in G.get((kx+i,ky+j),()):
                d=math.hypot((p[0]-x)*mx,(p[1]-y)*my)
                if d<bd: bd=d; b=p
    return (b,bd) if bd<=rad else (None,bd)

def resolve(uk):
    """交差点側の端を決め、(信号, 交差点側が末尾の点列) を返す。

    build_data.py は pts[-1] から順に試し「80m以内に信号があれば即採用」
    していた。進入路は中央値43mしかないので、両端とも同じ信号の80m以内に
    入る。その結果、実際には反対側が交差点でも pts[-1] が選ばれ、
    進入方向が180度ずれていた。信号に近い方の端を採る。
    """
    pts=lane.get(uk)
    if not pts: return None
    best=None
    for idx,cand in ((-1,pts[-1]), (0,pts[0])):
        s,d=nearest(cand[0],cand[1],80)
        if s and (best is None or d<best[2]): best=(idx,s,d)
    if not best: return None
    idx,s,_=best
    seq=simplify(pts)
    if idx==0: seq=list(reversed(seq))               # 交差点側を末尾へ
    return s, seq

doc=json.load(open(GEO,encoding='utf-8'))
fixed={}; rev=0; moved=0
for f in doc['features']:
    p=f['properties']
    if p['layer']!='two_stage_likely': continue
    r=resolve(p.get('uk'))
    if not r: continue
    s,seq=r
    f['geometry']['coordinates']=[round(s[0],5),round(s[1],5)]
    fixed[p['uk']]=(s,seq)
    moved+=1
for f in doc['features']:
    p=f['properties']
    if p['layer']!='two_stage_likely_line': continue
    r=fixed.get(p.get('uk'))
    if not r: continue
    s,seq=r
    cs=[[round(x,5),round(y,5)] for x,y in seq]
    if len(cs)>=2:
        was=cs[-1]
        cs[-1]=[round(s[0],5),round(s[1],5)]
        f['geometry']['coordinates']=cs
json.dump(doc,open(GEO,'w',encoding='utf-8'),ensure_ascii=False)
print(f'地点を信号へ: {moved} 件 / 線を作り直し: {len(fixed)} 件')
