# -*- coding: utf-8 -*-
"""規制の種別が、アプリの「使う側」すべてに載っているかを機械的に突き合わせる。

   地図に種別を足したのに、アラート・タップ時の表示・凡例の数に載せ忘れる、
   という取りこぼしが実際に起きた（指定方向外進行禁止が接近アラートに無く、
   一番近くに来るたびに警告ごと消えていた）。同じことを繰り返さないために置く。
   使い方:  python3 tools/audit_layers.py     （問題があれば終了コード 1）"""
import re, json, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app  = open(os.path.join(ROOT,'docs/app.js'),     encoding='utf-8').read()
html = open(os.path.join(ROOT,'docs/index.html'), encoding='utf-8').read()
data = json.load(open(os.path.join(ROOT,'data/genki.geojson'), encoding='utf-8'))

DERIVED = {'two_stage_likely_line','no_entry_dir_line'}   # 点から作る表示専用の線

counts = {}
for f in data['features']:
    L = f['properties']['layer']
    if L in DERIVED: continue
    c = counts.setdefault(L, {'pt':0,'line':0})
    c['pt' if f['geometry']['type']=='Point' else 'line'] += 1

def keys_of(pattern):
    m = re.search(pattern, app, re.S)
    return set(re.findall(r"([a-z_]{4,})\s*:", m.group(1))) if m else set()

chips    = set(re.findall(r"key:'([a-z_]+)'", app))
kind     = keys_of(r"\nvar KIND\s*=\s*\{(.*?)\n\};")
tag      = keys_of(r"var TAG\s*=\s*\{(.*?)\};")
gkey     = keys_of(r"var GKEY\s*=\s*\{(.*?)\};")
# alertKind() の中で名指しで扱っているものも「アラートあり」とみなす
m = re.search(r"function alertKind\(p\)\{(.*?)\n\}", app, re.S)
kind |= set(re.findall(r"layer==='([a-z_]+)'", m.group(1))) if m else set()
# タップできるレイヤ（規制側のクリック一覧）
click_ids = set(re.findall(r"'([a-z_]+)'", re.search(r"\['expw',(.*?)\]", app).group(0)))
LAYER_IDS = dict(re.findall(r"key:'([a-z_]+)'[^}]*?ids:\[([^\]]*)\]", app))

CHECKS = [
    ('チップ',     lambda L,c: L in chips,                    'LAYERS に無く、表示の出し入れも件数も出ない'),
    ('アラート',   lambda L,c: c['pt']==0 or L in kind,        '点があるのに接近アラートに載っていない（他の警告を潰す）'),
    ('タップ見出し',lambda L,c: L in tag,                       'TAG に無く、タップしたとき種別のラベルが空になる'),
    ('タップ図',   lambda L,c: L in gkey,                      'GKEY に無く、タップしたとき図が出ない'),
]

bad=[]
w=max(len(L) for L in counts)
print('種別'.ljust(w+2), '点'.rjust(5), '線'.rjust(6), ' ', '  '.join(n for n,_,_ in CHECKS))
for L in sorted(counts):
    c=counts[L]; res=[fn(L,c) for _,fn,_ in CHECKS]
    print(L.ljust(w+2), str(c['pt']).rjust(5), str(c['line']).rjust(6), ' ',
          '   '.join(('○' if r else '✗').center(len(n)) for r,(n,_,_) in zip(res,CHECKS)))
    for r,(n,_,why) in zip(res,CHECKS):
        if not r: bad.append('%s: %s … %s' % (L, n, why))

# 二段階右折は「本当に二段階する」と「小回り標識で打ち消される」に分けて出している。
# 合計ではなく分けた数が凡例に出ているのが正しいので、データから同じように数える。
komaN = sum(1 for f in data['features']
            if f['properties']['layer']=='two_stage_likely'
            and f['geometry']['type']=='Point'
            and f['properties'].get('koma') not in (None,''))
SHOWN = {'two_stage_likely': [counts['two_stage_likely']['pt'] - komaN, komaN]}

print('\n■ 凡例の件数がデータと合っているか')
for L in sorted(counts):
    want = SHOWN.get(L) or [counts[L]['pt'] or counts[L]['line']]
    for n in want:
        ok = re.search(r'>\s*%d\s*<' % n, html) is not None
        print('  ', L.ljust(w), str(n).rjust(5), '→', 'あり' if ok else '★ index.html に見当たらない')
        if not ok: bad.append('%s: 凡例の件数 %d が index.html に無い' % (L, n))

if bad:
    print('\n■ 取りこぼし %d件' % len(bad))
    for b in bad: print('   -', b)
    sys.exit(1)
print('\n取りこぼしなし')
