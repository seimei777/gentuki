import json,math,os
SRC='osm_base.json'
CITY=['%E5%85%B5%E5%BA%AB%E7%9C%8C%E7%A5%9E%E6%88%B8%E5%B8%82.geojson','%E5%85%B5%E5%BA%AB%E7%9C%8C%E8%A5%BF%E5%AE%AE%E5%B8%82.geojson','%E5%85%B5%E5%BA%AB%E7%9C%8C%E5%AE%9D%E5%A1%9A%E5%B8%82.geojson']
polys=[]
for p in CITY:
    g=json.load(open(p))['geometry']
    rs=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
    polys+= [r[0] for r in rs]
bb=[]
for r in polys:
    xs=[c[0] for c in r]; ys=[c[1] for c in r]
    bb.append((min(xs),min(ys),max(xs),max(ys)))
def pip(x,y,ring):
    ins=False;n=len(ring);j=n-1
    for i in range(n):
        xi,yi=ring[i];xj,yj=ring[j]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/((yj-yi) or 1e-12)+xi: ins=not ins
        j=i
    return ins
def inside(x,y):
    for (b,r) in zip(bb,polys):
        if b[0]<=x<=b[2] and b[1]<=y<=b[3] and pip(x,y,r): return True
    return False
def simplify(pts,tol):
    if len(pts)<3: return pts
    mx=111320*math.cos(math.radians(pts[0][1]));my=110540
    st=[(0,len(pts)-1)];keep={0,len(pts)-1}
    while st:
        a,b=st.pop()
        if b-a<2: continue
        x0,y0=pts[a];x1,y1=pts[b]
        dx,dy=(x1-x0)*mx,(y1-y0)*my;L=math.hypot(dx,dy)
        best=-1;bi=a
        for i in range(a+1,b):
            px,py=(pts[i][0]-x0)*mx,(pts[i][1]-y0)*my
            d=abs(px*dy-py*dx)/L if L>1e-9 else math.hypot(px,py)
            if d>best: best=d;bi=i
        if best>tol:
            keep.add(bi);st.append((a,bi));st.append((bi,b))
    return [pts[i] for i in sorted(keep)]
def rnd(p): return [[round(x,5),round(y,5)] for x,y in p]

feats=[];ROAD={'motorway':1,'trunk':1,'primary':2,'secondary':3,'tertiary':4}
for e in json.load(open(SRC))['elements']:
    t=e.get('tags',{});g=e.get('geometry') or []
    pts=[(p['lon'],p['lat']) for p in g]
    if len(pts)<2: continue
    if not any(inside(x,y) for x,y in pts[::max(1,len(pts)//6)]): continue
    hw=t.get('highway')
    if hw in ROAD:
        feats.append({'type':'Feature','geometry':{'type':'LineString','coordinates':rnd(simplify(pts,18))},
                      'properties':{'k':'road','c':ROAD[hw]}})
    elif t.get('railway')=='rail':
        feats.append({'type':'Feature','geometry':{'type':'LineString','coordinates':rnd(simplify(pts,25))},
                      'properties':{'k':'rail'}})
    elif t.get('natural')=='coastline':
        feats.append({'type':'Feature','geometry':{'type':'LineString','coordinates':rnd(simplify(pts,25))},
                      'properties':{'k':'coast'}})
    elif t.get('natural')=='water':
        xs=[p[0] for p in pts];ys=[p[1] for p in pts]
        if (max(xs)-min(xs))*(max(ys)-min(ys))<2e-6: continue
        if pts[0]!=pts[-1]: pts=pts+[pts[0]]
        feats.append({'type':'Feature','geometry':{'type':'Polygon','coordinates':[rnd(simplify(pts,25))]},
                      'properties':{'k':'water'}})
gj={'type':'FeatureCollection','features':feats}
json.dump(gj,open('basemap.geojson','w'),ensure_ascii=False,separators=(',',':'))
import collections
print(collections.Counter(f['properties']['k'] for f in feats))
print('bytes',os.path.getsize('basemap.geojson'))
