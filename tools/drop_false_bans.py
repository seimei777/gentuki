# -*- coding: utf-8 -*-
"""「○○以外通行止め」を原付通行禁止から取り除く。

「二輪車以外通行止め」は "二輪車以外が通行止め" つまり原付は通れる道。
対象車両コードのビットだけを見ていたため禁止として取り込んでいた。
build_data.py 側は修正済みだが、元CSVが手元に無い間は生成物を直接直す。
元CSVを揃えて build_data.py を回し直せば、このスクリプトは不要になる。
"""
import json, re, sys

PAT = re.compile(r'(二輪|原動機付自転車|自動二輪)[^、]{0,6}以外')

def fix_full(path):
    d = json.load(open(path, encoding='utf-8'))
    before = len(d['features'])
    d['features'] = [f for f in d['features']
                     if not (f['properties'].get('layer') == 'moped_banned'
                             and PAT.search(f['properties'].get('title', '')))]
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    return before, len(d['features'])

def fix_min(path):
    d = json.load(open(path, encoding='utf-8'))
    bad = {i for i, t in enumerate(d['titles']) if PAT.search(t)}
    before = len(d['features'])
    d['features'] = [f for f in d['features']
                     if not (f['properties'].get('l') == 3       # 3 = moped_banned
                             and f['properties'].get('t') in bad)]
    json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
    return before, len(d['features'])

for path, fn in (('data/genki.geojson', fix_full),
                 ('docs/data/genki.min.geojson', fix_min)):
    b, a = fn(path)
    print(f'{path}: {b} -> {a} ({b-a} 件を除外)')
