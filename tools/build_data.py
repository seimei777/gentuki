# -*- coding: utf-8 -*-
"""原付マップ データビルダー: JARTIC交通規制情報(兵庫県警) -> GeoJSON(神戸/西宮/宝塚)"""
import csv, sys, json, math, collections, os
csv.field_size_limit(sys.maxsize)
SRCS=[('hyogo/typeD_hyogo/兵庫県警_202607_k_2.1.csv','兵庫県警'),
      ('osaka/typeD_osaka/大阪府警_202607_k_2.1.csv','大阪府警')]
CITIES=[('神戸市','%E5%85%B5%E5%BA%AB%E7%9C%8C%E7%A5%9E%E6%88%B8%E5%B8%82.geojson'),
        ('西宮市','%E5%85%B5%E5%BA%AB%E7%9C%8C%E8%A5%BF%E5%AE%AE%E5%B8%82.geojson'),
        ('宝塚市','%E5%85%B5%E5%BA%AB%E7%9C%8C%E5%AE%9D%E5%A1%9A%E5%B8%82.geojson'),
        ('尼崎市','%E5%85%B5%E5%BA%AB%E7%9C%8C%E5%B0%BC%E5%B4%8E%E5%B8%82.geojson'),
        ('伊丹市','%E5%85%B5%E5%BA%AB%E7%9C%8C%E4%BC%8A%E4%B8%B9%E5%B8%82.geojson'),
        ('芦屋市','%E5%85%B5%E5%BA%AB%E7%9C%8C%E8%8A%A6%E5%B1%8B%E5%B8%82.geojson'),
        ('川西市','%E5%85%B5%E5%BA%AB%E7%9C%8C%E5%B7%9D%E8%A5%BF%E5%B8%82.geojson'),
        ('池田市','%E5%A4%A7%E9%98%AA%E5%BA%9C%E6%B1%A0%E7%94%B0%E5%B8%82.geojson')]

def rings(geom):
    if geom['type']=='Polygon': return [geom['coordinates']]
    return geom['coordinates']
class City:
    def __init__(s,name,path):
        s.name=name
        g=json.load(open(path))['geometry']
        s.polys=[p for p in rings(g)]
        xs=[];ys=[]
        for p in s.polys:
            for x,y in p[0]: xs.append(x);ys.append(y)
        s.bbox=(min(xs),min(ys),max(xs),max(ys))
    def contains(s,x,y):
        bx0,by0,bx1,by1=s.bbox
        if not(bx0<=x<=bx1 and by0<=y<=by1): return False
        for poly in s.polys:
            if _pip(x,y,poly[0]):
                if not any(_pip(x,y,h) for h in poly[1:]): return True
        return False
def _pip(x,y,ring):
    inside=False; n=len(ring); j=n-1
    for i in range(n):
        xi,yi=ring[i]; xj,yj=ring[j]
        if ((yi>y)!=(yj>y)) and (x < (xj-xi)*(y-yi)/((yj-yi) or 1e-12)+xi): inside=not inside
        j=i
    return inside
cities=[City(n,p) for n,p in CITIES]
def which(pts):
    for x,y in pts:
        for c in cities:
            if c.contains(x,y): return c.name
    return None

def coords(s):
    out=[]
    for tok in s.split(';'):
        a=tok.split()
        if len(a)>=2:
            try: out.append((float(a[0]),float(a[1])))
            except ValueError: pass
    return out
def bit(code,i):
    return len(code)>=i and code[-i]=='1'
def hits_moped(row,pre=''):
    A=row[f'{pre}車両コード1_A'];D=row[f'{pre}車両コード1_D']
    return bit(A,1) or bit(D,1) or bit(D,4)
def simplify(pts,tol=8.0):
    if len(pts)<3: return pts
    mx=111320*math.cos(math.radians(pts[0][1])); my=110540
    def rdp(p):
        if len(p)<3: return p
        x0,y0=p[0]; x1,y1=p[-1]
        dx=(x1-x0)*mx; dy=(y1-y0)*my; L=math.hypot(dx,dy)
        idx=0;dm=-1
        for i in range(1,len(p)-1):
            px=(p[i][0]-x0)*mx; py=(p[i][1]-y0)*my
            d=abs(px*dy-py*dx)/L if L>1e-9 else math.hypot(px,py)
            if d>dm: dm=d;idx=i
        if dm>tol: return rdp(p[:idx+1])[:-1]+rdp(p[idx:])
        return [p[0],p[-1]]
    return rdp(pts)
def rnd(pts): return [[round(x,5),round(y,5)] for x,y in pts]

DOW={'1':'平日','2':'土曜','3':'日曜・休日','4':'土曜・日曜・休日','5':'日曜','6':'休日','7':'その他'}
def hhmm(v):
    v=(v or '').strip()
    if not v: return ''
    v=v.zfill(4)
    return f"{int(v[:2])}:{v[2:]}"
def timetext(row):
    parts=[]
    for i in (1,2,3):
        st=row.get(f'規制時間{i}_開始','').strip()
        en=row.get(f'規制時間{i}_終了','').strip()
        dw=DOW.get(row.get(f'規制曜日コード{i}','').strip(),'')
        if (st,en) in (('0','2400'),('0000','2400'),('','')):
            seg='終日' if (st or en) else ''
        else:
            seg=f"{hhmm(st)}-{hhmm(en)}"
        if dw: seg=(dw+'　'+seg).strip('　')
        if seg: parts.append(seg)
    return ' / '.join(parts)

raw=collections.defaultdict(list)
KEEP={'55','56','58','98','4','5','7'}
import os
for src,pref in SRCS:
    if not os.path.exists(src):
        print('見つからないので飛ばす:', src); continue
    n=0
    for row in csv.DictReader(open(src,encoding='cp932',newline='')):
        c=row['共通規制種別コード']
        if c not in KEEP: continue
        pts=coords(row['規制場所の経度緯度'])
        if not pts: continue
        city=which(pts)
        if not city: continue
        row['_pref']=pref
        raw[c].append((row,pts,city))
        n+=1
    print(f'{pref}: {n}件')
print({k:len(v) for k,v in raw.items()})

# --- 二段階右折レイヤ ---
feats=[]
for row,pts,city in raw['55']:
    feats.append({'type':'Feature','geometry':{'type':'Point','coordinates':rnd(pts)[0]},
      'properties':{'layer':'two_stage_required_sign','city':city,'title':'二段階右折 指定（標識あり）',
        'detail':'「原動機付自転車の右折方法（二段階）」の標識。車線数に関係なく二段階右折が必要。',
        'cond':row['規制条件'],'src':row['_pref']+'/JARTIC交通規制情報','uk':row['ユニークキー'],'confidence':'sign'}})
for row,pts,city in raw['56']:
    feats.append({'type':'Feature','geometry':{'type':'Point','coordinates':rnd(pts)[0]},
      'properties':{'layer':'two_stage_forbidden','city':city,'title':'二段階右折 禁止（小回り指定）',
        'detail':'「原動機付自転車の右折方法（小回り）」の標識。車線が多くても普通に右折レーンから右折する。',
        'cond':row['規制条件'],'src':row['_pref']+'/JARTIC交通規制情報','uk':row['ユニークキー'],'confidence':'sign'}})

sig=[p[0] for _,p,_ in raw['98']]
koma=[p[0] for _,p,_ in raw['56']]
def grid(ps,c=0.004):
    g=collections.defaultdict(list)
    for p in ps: g[(int(p[0]/c),int(p[1]/c))].append(p)
    return g
GS,GK=grid(sig),grid(koma)
def nearest(g,x,y,rad,c=0.004):
    mx=111320*math.cos(math.radians(y));my=110540;b=None;bd=1e9
    kx,ky=int(x/c),int(y/c)
    for i in (-1,0,1):
        for j in (-1,0,1):
            for p in g.get((kx+i,ky+j),()):
                d=math.hypot((p[0]-x)*mx,(p[1]-y)*my)
                if d<bd: bd=d;b=p
    return (b,bd) if bd<=rad else (None,bd)

approach=[]
for row,pts,city in raw['58']:
    ln=row['車両通行帯数']
    if not ln.isdigit() or int(ln)<3: continue
    end=None
    for cand in (pts[-1],pts[0]):
        s,d=nearest(GS,cand[0],cand[1],80)
        if s: end=(cand,s,d);break
    if not end: continue
    cand,s,d=end
    k,kd=nearest(GK,cand[0],cand[1],45)
    approach.append({'geom':simplify(pts),'end':cand,'sig':s,'lanes':int(ln),'city':city,
                     'uk':row['ユニークキー'],'cond':row['規制条件'],'pref':row['_pref'],
                     'koma':(round(kd) if k else None)})
# --- OSM の車線数で裏を取る ---------------------------------------------------
# 県警データの「車両通行帯数」は交差点での通行帯（右折レーンを含む）を指すのに対し、
# OSM の lanes は交差点手前ではなく区間の車線数であることが多い。完全には一致しないが、
# 「幹線道路上か、生活道路上か」の判別には十分使える。
import os as _os
_osm_side=[]
if _os.path.exists('osm_lanes.json'):
    for w in json.load(open('osm_lanes.json'))['elements']:
        t=w.get('tags',{}); g=w.get('geometry') or []
        try: ln=int(str(t.get('lanes')).split(';')[0])
        except Exception: continue
        fw=t.get('lanes:forward')
        oneway = t.get('oneway') in ('yes','1','-1')
        if fw and str(fw).isdigit(): side=int(fw)
        elif oneway: side=ln
        else: side=max(1, ln//2)
        nm=t.get('name') or t.get('ref') or ''
        for a1,b1 in zip(g,g[1:]):
            _osm_side.append((a1['lon'],a1['lat'],b1['lon'],b1['lat'],side,nm))
_lg=collections.defaultdict(list)
for i,sg in enumerate(_osm_side): _lg[(int(sg[0]/0.004),int(sg[1]/0.004))].append(i)
def _dseg(px,py,x1,y1,x2,y2):
    mx=111320*math.cos(math.radians(py)); my=110540
    ax,ay=(x1-px)*mx,(y1-py)*my; bx,by=(x2-px)*mx,(y2-py)*my
    dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
    tt=0 if L==0 else max(0,min(1,-(ax*dx+ay*dy)/L))
    return math.hypot(ax+tt*dx, ay+tt*dy)
def osm_lanes_at(x,y):
    kx,ky=int(x/0.004),int(y/0.004); best=None
    for i in (-1,0,1):
        for j in (-1,0,1):
            for si in _lg.get((kx+i,ky+j),()):
                sg=_osm_side[si]; dd=_dseg(x,y,sg[0],sg[1],sg[2],sg[3])
                if dd<=35 and (best is None or dd<best[0]): best=(dd,sg[4],sg[5])
    return (best[1],best[2]) if best else (None,None)
for a in approach:
    a['osm'], a['road'] = osm_lanes_at(a['end'][0], a['end'][1])
print('OSMで裏が取れた:', sum(1 for a in approach if a['osm'] is not None),
      '/ うち片側3車線以上:', sum(1 for a in approach if (a['osm'] or 0)>=3))

for a in approach:
    feats.append({'type':'Feature','geometry':{'type':'LineString','coordinates':rnd(a['geom'])},
      'properties':{'layer':'two_stage_likely_line','city':a['city'],'lanes':a['lanes'],
        'title':f"二段階右折 の可能性（片側{a['lanes']}車線・信号交差点）",'uk':a['uk'],'confidence':'estimated','koma':a['koma']}})
    feats.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(a['end'][0],5),round(a['end'][1],5)]},
      'properties':{'layer':'two_stage_likely','city':a['city'],'lanes':a['lanes'],
        'osm':a.get('osm'), 'road':a.get('road') or '',
        'title':f"二段階右折（推定）片側{a['lanes']}車線",
        'detail':'車両通行帯が3以上の信号交差点への進入路。原付一種はこの方向から右折するとき二段階右折。※推定（現地の標識が優先）',
        'cond':a['cond'],'src':a.get('pref','兵庫県警')+'/JARTIC交通規制情報（車両通行帯＋信号機から推定）','uk':a['uk'],'confidence':'estimated','koma':a['koma']}})

# --- 原付通行禁止レイヤ ---
banned=0
for c in ('4','5','7'):
    for row,pts,city in raw[c]:
        if not hits_moped(row,'対象'): continue
        if hits_moped(row,'除外'): continue
        nm=row['県別規制種別名称']
        cond=row['規制条件']
        # 規制条件で対象が別の車種に限定されているものは原付には効かない
        if any(w in cond for w in ('危険物','積載車両','タンク車')): continue
        t=timetext(row)
        always = (t=='' or t=='終日')
        if always: t=''
        g={'type':'LineString','coordinates':rnd(simplify(pts))} if len(pts)>1 else {'type':'Point','coordinates':rnd(pts)[0]}
        feats.append({'type':'Feature','geometry':g,
          'properties':{'layer':'moped_banned','city':city,'title':nm,
            'detail':('原付一種が進入できない区間（公安委員会規制）。' if always else '時間・曜日限定で原付一種が進入できない区間（公安委員会規制）。'),
            'time':t,'cond':cond,'always':always,'src':row['_pref']+'/JARTIC交通規制情報','uk':row['ユニークキー'],'confidence':'sign'}})
        banned+=1
# --- OSM: 自動車専用道路・moped=no（原付進入不可） ---
osm=json.load(open('osm_mw7.json'))['elements']
seen=set(); nosm=0
for e in osm:
    t=e.get('tags',{}); g=e.get('geometry') or []
    pts=[(p['lon'],p['lat']) for p in g]
    if len(pts)<2: continue
    city=which(pts)
    if not city: continue
    hw=t.get('highway','')
    if t.get('moped')=='no': kind='moped_no'
    elif hw in ('motorway','motorway_link'): kind='motorroad'
    else: continue
    name=t.get('name') or t.get('ref') or ('自動車専用道路' if kind=='motorroad' else '原付通行禁止路線')
    key=(name,round(pts[0][0],4),round(pts[0][1],4),round(pts[-1][0],4),round(pts[-1][1],4))
    if key in seen: continue
    seen.add(key)
    feats.append({'type':'Feature','geometry':{'type':'LineString','coordinates':rnd(simplify(pts,12))},
      'properties':{'layer':'expressway','city':city,'title':name,
        'detail':('高速道路・自動車専用道路。原付一種（50cc以下）は進入禁止。' if kind=='motorroad' else '原付（50cc以下）通行禁止の路線としてOSMに登録。'),
        'kind':kind,'src':'© OpenStreetMap contributors (ODbL)','confidence':'osm'}})
    nosm+=1
print('osm feats',nosm)
gj={'type':'FeatureCollection','features':feats}
json.dump(gj,open('genki.geojson','w'),ensure_ascii=False,separators=(',',':'))
cnt=collections.Counter(f['properties']['layer'] for f in feats)
bycity=collections.Counter((f['properties']['city'],f['properties']['layer']) for f in feats)
print('features',len(feats),dict(cnt))
for k,v in sorted(bycity.items()): print(k,v)
print('bytes',os.path.getsize('genki.geojson'))
