# データのライセンス

このリポジトリには、出所の異なる3種類のデータが含まれます。**混ぜないように分離してあります。**

## 1. 交通規制情報（JARTIC 由来）

対象：`data/genki.geojson` および `docs/data/genki.min.geojson` のうち、
`two_stage_likely` / `two_stage_required_sign` / `two_stage_forbidden` / `moped_banned` の各レイヤ。

> 「交通規制情報」（公益財団法人日本道路交通情報センター）
> https://www.jartic.or.jp/service/opendata/ を**加工して作成**
> （2026年7月版データ）

JARTIC オープンデータ利用規約に基づき、出典表示と加工の明示を条件に、商用利用・再配布・加工が
認められています。同規約は CC BY 4.0 と互換です。
加工内容：CSV から対象7市を切り出し、車両通行帯数と信号機の位置を突き合わせて
二段階右折が必要な進入路を推定し、GeoJSON に変換しています。
**この推定はJARTICおよび兵庫県警の見解ではなく、本リポジトリの作者によるものです。**

## 2. 道路データ（OpenStreetMap 由来）— ODbL

対象：
- `data/basemap.geojson`
- `artifact/genki-base.js`
- `data/genki.geojson` / `docs/data/genki.min.geojson` のうち `expressway` レイヤ

> © OpenStreetMap contributors
> https://www.openstreetmap.org/copyright

これらは OpenStreetMap の派生データベースにあたるため、**ODbL 1.0** で提供します。
https://opendatacommons.org/licenses/odbl/1-0/

OSM 由来データと JARTIC 由来データは意図的に別ファイル・別レイヤに分けてあります。
再利用する際もこの分離を維持してください。

## 3. 行政区域

`data/boundary_*.geojson` — Linked Open Addresses Japan（uedayou.net）

## 4. コード

`docs/`, `tools/`, `artifact/index.html` のソースコードは MIT License。

## 実行時に利用している外部サービス

| | 提供 | 条件 |
|---|---|---|
| 背景地図 | OpenFreeMap © OpenMapTiles | APIキー不要・商用可 |
| 経路探索 | Valhalla（FOSSGIS e.V. 公開インスタンス） | **本番サービスでの利用は想定されていない**。`X-Client-Id` を付与のうえ小規模利用に留めている。規模拡大時はセルフホストへ移行が必須 |
| 地点検索 | 国土地理院 住所検索API / Nominatim | fair use |
