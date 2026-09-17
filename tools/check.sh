#!/bin/sh
# 公開する前に必ず通す確認。どれか一つでも落ちたら公開しない。
# 「直したつもりで片側だけ古いまま」を機械で止めるために置いている。
set -e
cd "$(dirname "$0")/.."

echo "1/3 app.js の文法"
node --check docs/app.js

echo "2/3 規制の種別が、使う側すべてに載っているか"
python3 tools/audit_layers.py

echo "3/3 キャッシュ避けの版が app.js と style.css で揃っているか"
python3 - <<'PY'
import re, sys
h = open('docs/index.html', encoding='utf-8').read()
js  = re.search(r'app\.js\?v=(\d+)', h)
css = re.search(r'style\.css\?v=(\d+)', h)
if not js or not css:
    print('  ★ 版が見つからない'); sys.exit(1)
if js.group(1) != css.group(1):
    print('  ★ 版が食い違っている app.js=%s style.css=%s' % (js.group(1), css.group(1))); sys.exit(1)
print('  版', js.group(1))
PY

echo
echo "全部通った。公開してよい。"
