/* げんつきマップ — 神戸・西宮・宝塚 / 原付一種のルート＆規制ビューア */
'use strict';

var C = { amber:'#f5871f', blue:'#1a73e8', danger:'#ea4335', express:'#b31412',
          grey:'#9aa0a6', route:'#1a73e8', routeCasing:'#1557b0' };
var VALHALLA = 'https://valhalla1.openstreetmap.de/route';
var ALERT_IN = 300, ALERT_OUT = 430;
var $ = function(s){ return document.querySelector(s); };

/* ---------------- 標識グリフ ---------------- */
var GLYPH = {
  est:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="'+C.amber+'" stroke-width="2.6"/><path d="M12 18v-5h4.5" fill="none" stroke="'+C.amber+'" stroke-width="2" stroke-linecap="round"/><path d="M16.5 13l-1.6-1.6M16.5 13l-1.6 1.6" fill="none" stroke="'+C.amber+'" stroke-width="2" stroke-linecap="round"/><path d="M12 13V7.5" fill="none" stroke="'+C.amber+'" stroke-width="2" stroke-linecap="round" opacity=".55"/></svg>',
  req:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="'+C.amber+'"/><path d="M9.5 18.5v-5H15" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 13.5l-1.8-1.8M15 13.5l-1.8 1.8" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round"/><path d="M15 9.2V5.6" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round"/><path d="M15 5.6l-1.6 1.7M15 5.6l1.6 1.7" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round"/></svg>',
  no:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="'+C.blue+'"/><path d="M10 18V11.5h4" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11.5l-2-2M14 11.5l-2 2" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/></svg>',
  ban:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="'+C.danger+'" stroke-width="3"/><path d="M6 17.5L18 6.5" stroke="'+C.danger+'" stroke-width="3" stroke-linecap="round"/></svg>',
  exp:'<svg class="gl" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="'+C.express+'" stroke-width="2"/><path d="M5.5 12h4M11 12h2.5M15.5 12h3" stroke="'+C.express+'" stroke-width="2" stroke-linecap="round"/></svg>'
};
var LAYERS = [
  {key:'two_stage_likely', glyph:'est', label:'二段階右折（推定）', ids:['ts_line','ts_pt']},
  {key:'two_stage_required_sign', glyph:'req', label:'二段階右折 標識', ids:['ts_sign']},
  {key:'two_stage_forbidden', glyph:'no', label:'小回り（禁止）', ids:['ts_no']},
  {key:'moped_banned', glyph:'ban', label:'原付通行禁止', ids:['ban_line','ban_pt']},
  {key:'expressway', glyph:'exp', label:'自動車専用道路', ids:['expw']}
];

/* ---------------- 地図 ---------------- */
/* 背景地図は OpenFreeMap のベクタータイル（APIキー不要・商用可・日本語ラベルあり）。
   以前は地理院タイルのラスタを明度反転して使っていたため、道路の階層色が全部潰れていた。 */
var BASEMAP = {
  day:   'https://tiles.openfreemap.org/styles/liberty',
  night: 'https://tiles.openfreemap.org/styles/dark'
};
var theme = (localStorage.getItem('gentuki.theme')) ||
            ((new Date().getHours() >= 18 || new Date().getHours() < 6) ? 'night' : 'day');

var map = new maplibregl.Map({
  container:'map',
  style: BASEMAP[theme],
  center:[135.30,34.73], zoom:10.6, minZoom:9, maxZoom:19,
  maxPitch:60,
  attributionControl:{ compact:true, customAttribution:[
    '「交通規制情報」（<a href="https://www.jartic.or.jp/service/opendata/" target="_blank" rel="noopener">日本道路交通情報センター</a>）を加工して作成',
    '道路データ <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
    '経路 <a href="https://github.com/valhalla/valhalla" target="_blank" rel="noopener">Valhalla</a>（FOSSGIS）'
  ]}
});

/* liberty は既定で「Kobe / 神戸市」の2段表示になるので日本語だけにする */
var JA_LABEL = ['coalesce',['get','name:ja'],['get','name'],['get','name:latin']];
function forceJapaneseLabels(){
  var layers = map.getStyle().layers || [];
  for (var i=0;i<layers.length;i++){
    var L=layers[i];
    if (L.type!=='symbol' || !L.layout) continue;
    var tf=L.layout['text-field'];
    if (tf===undefined) continue;
    if (JSON.stringify(tf).indexOf('"ref"')>=0) continue;  // 道路番号はそのまま
    try { map.setLayoutProperty(L.id,'text-field',JA_LABEL); } catch(e){}
  }
}

/* 自前レイヤを挿し込む位置：ラベルの下、道路の上 */
function firstSymbolLayerId(){
  var layers = map.getStyle().layers || [];
  for (var i=0;i<layers.length;i++) if (layers[i].type==='symbol') return layers[i].id;
  return undefined;
}

function setTheme(t){
  theme=t;
  try { localStorage.setItem('gentuki.theme',t); } catch(e){}
  var btn=$('#themeBtn');
  if (btn){ btn.setAttribute('aria-pressed', String(t==='night')); }
  document.body.dataset.theme=t;
  map.setStyle(BASEMAP[t]);
  map.once('styledata', function(){       // MapLibre は style.load を発火しないので styledata を使う
    forceJapaneseLabels();
    if (DATA) addLayers();                // ソース・レイヤはスタイル差し替えで消えるので貼り直す
  });
}

var DATA=null, PTS=[], on={}, grid={}, GSTEP=0.004, lastRouteGeo=null;

/* 配信用の圧縮データを、アプリが使う形に戻す */
var LAYER_NAME=['two_stage_likely','two_stage_required_sign','two_stage_forbidden',
                'moped_banned','expressway','two_stage_likely_line'];
var CITY_NAME=['神戸市','西宮市','宝塚市','尼崎市','伊丹市','芦屋市','川西市'];
var SRC_REG='兵庫県警/JARTIC交通規制情報';
var SRC_EST='兵庫県警/JARTIC交通規制情報（車両通行帯＋信号機から推定）';
var SRC_OSM='© OpenStreetMap contributors (ODbL)';
function expand(doc){
  var titles=doc.titles||[];
  doc.features.forEach(function(f){
    var q=f.properties, lay=LAYER_NAME[q.l], p={layer:lay};
    if(q.c!=null) p.city=CITY_NAME[q.c];
    if(q.n!=null) p.lanes=q.n;
    p.koma = (q.k==null? null : q.k);
    if(lay==='two_stage_likely'||lay==='two_stage_likely_line'){
      p.title='二段階右折（推定）片側'+(q.n||3)+'車線';
      p.detail='車両通行帯が3以上の信号交差点への進入路。原付一種はこの方向から右折するとき二段階右折。※推定（現地の標識が優先）';
      p.src=SRC_EST; p.confidence='estimated';
    } else if(lay==='two_stage_required_sign'){
      p.title='二段階右折 指定（標識あり）';
      p.detail='「原動機付自転車の右折方法（二段階）」の標識。車線数に関係なく二段階右折が必要。';
      p.src=SRC_REG; p.confidence='sign';
    } else if(lay==='two_stage_forbidden'){
      p.title='二段階右折 禁止（小回り指定）';
      p.detail='「原動機付自転車の右折方法（小回り）」の標識。車線が多くても右折レーンから普通に右折する。';
      p.src=SRC_REG; p.confidence='sign';
    } else if(lay==='moped_banned'){
      p.title=titles[q.t]||'通行止め';
      p.always=!!q.a;
      p.detail=p.always?'原付一種が進入できない区間（公安委員会規制）。'
                       :'時間・曜日限定で原付一種が進入できない区間（公安委員会規制）。';
      if(q.h) p.time=q.h;
      if(q.d) p.cond=q.d;
      p.src=SRC_REG; p.confidence='sign'; p.uk=q.t+'@'+f.geometry.coordinates[0];
    } else {
      p.title=titles[q.t]||'自動車専用道路';
      p.detail=q.e?'原付（50cc以下）通行禁止の路線としてOSMに登録。'
                  :'高速道路・自動車専用道路。原付一種（50cc以下）は進入禁止。';
      p.src=SRC_OSM; p.confidence='osm';
    }
    f.properties=p;
  });
  return doc;
}

var styleReady = new Promise(function(res){ map.once('load', res); });
var ready = Promise.all([
  fetch('data/genki.min.geojson').then(function(r){ return r.json(); }).then(expand),
  styleReady
]);
ready.then(function(a){
  DATA = a[0];
  DATA.features.forEach(function(f){
    if(f.geometry.type!=='Point') return;
    var p={ i:PTS.length, x:f.geometry.coordinates[0], y:f.geometry.coordinates[1], p:f.properties };
    PTS.push(p);
    var k = gkey(p.x,p.y); (grid[k]||(grid[k]=[])).push(p);
  });
  buildBanIndex(); forceJapaneseLabels(); addLayers(); buildChips(); hideToast();
}).catch(function(e){ console.error(e); toast('データを読み込めませんでした'); });

var banGrid={};
function buildBanIndex(){
  DATA.features.forEach(function(f){
    if(f.properties.layer!=='moped_banned' || f.geometry.type!=='LineString') return;
    var cs=f.geometry.coordinates;
    for(var i=0;i<cs.length-1;i++){
      var seg={a:cs[i], b:cs[i+1], p:f.properties};
      var x0=Math.min(cs[i][0],cs[i+1][0]), x1=Math.max(cs[i][0],cs[i+1][0]);
      var y0=Math.min(cs[i][1],cs[i+1][1]), y1=Math.max(cs[i][1],cs[i+1][1]);
      for(var gx=Math.floor(x0/GSTEP); gx<=Math.floor(x1/GSTEP); gx++)
        for(var gy=Math.floor(y0/GSTEP); gy<=Math.floor(y1/GSTEP); gy++){
          var k=gx+'|'+gy; (banGrid[k]||(banGrid[k]=[])).push(seg);
        }
    }
  });
}
function distToSeg(p, a, b){
  var la=p[1]*Math.PI/180, mx=111320*Math.cos(la), my=110540;
  var ax=(a[0]-p[0])*mx, ay=(a[1]-p[1])*my, bx=(b[0]-p[0])*mx, by=(b[1]-p[1])*my;
  var dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy;
  var t = L===0 ? 0 : Math.max(0, Math.min(1, -(ax*dx+ay*dy)/L));
  return Math.sqrt(Math.pow(ax+t*dx,2)+Math.pow(ay+t*dy,2));
}
function gkey(x,y){ return Math.floor(x/GSTEP)+'|'+Math.floor(y/GSTEP); }
function nearPts(x,y){
  var out=[], kx=Math.floor(x/GSTEP), ky=Math.floor(y/GSTEP);
  for(var i=-1;i<=1;i++) for(var j=-1;j<=1;j++){
    var a=grid[(kx+i)+'|'+(ky+j)]; if(a) out=out.concat(a);
  }
  return out;
}
function meters(a,b){
  var la=(a[1]+b[1])/2*Math.PI/180;
  var dx=(b[0]-a[0])*Math.PI/180*Math.cos(la), dy=(b[1]-a[1])*Math.PI/180;
  return Math.round(Math.sqrt(dx*dx+dy*dy)*6371000);
}

function addLayers(){
  var before = firstSymbolLayerId();   // ラベルの下に入れる
  if (!map.getSource('g'))     map.addSource('g',{type:'geojson',data:DATA});
  if (!map.getSource('route')) map.addSource('route',{type:'geojson',
    data: lastRouteGeo || {type:'FeatureCollection',features:[]}});
  if (!map.getSource('me'))    map.addSource('me',{type:'geojson',
    data:{type:'FeatureCollection',features:[]}});

  function add(def){ if (!map.getLayer(def.id)) map.addLayer(def, before); }

  /* --- 規制レイヤ --- */
  add({id:'expw',type:'line',source:'g',filter:['==',['get','layer'],'expressway'],
    paint:{'line-color':C.express,'line-width':['interpolate',['linear'],['zoom'],10,1.6,16,4],
           'line-dasharray':[2,1.6],'line-opacity':.8}});
  add({id:'ban_line',type:'line',source:'g',filter:['==',['get','layer'],'moped_banned'],
    layout:{'line-cap':'round'},
    paint:{'line-color':C.danger,'line-width':['interpolate',['linear'],['zoom'],10,2.5,16,8],
           'line-opacity':['case',['get','always'],.85,.5]}});
  add({id:'ban_pt',type:'circle',source:'g',
    filter:['all',['==',['get','layer'],'moped_banned'],['==',['geometry-type'],'Point']],
    paint:{'circle-radius':5,'circle-color':C.danger,'circle-stroke-width':2,
           'circle-stroke-color':'#fff'}});

  /* --- ルート（casing を先、本線を後） --- */
  add({id:'route_casing',type:'line',source:'route',filter:['==',['get','k'],'line'],
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':C.routeCasing,
           'line-width':['interpolate',['linear'],['zoom'],10,6,14,10,17,16,19,22]}});
  add({id:'route_line',type:'line',source:'route',filter:['==',['get','k'],'line'],
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':C.route,
           'line-width':['interpolate',['linear'],['zoom'],10,4,14,7,17,12,19,17]}});

  /* --- 二段階右折など --- */
  add({id:'ts_line',type:'line',source:'g',filter:['==',['get','layer'],'two_stage_likely_line'],
    minzoom:12,
    layout:{'line-cap':'round'},
    paint:{'line-color':C.amber,'line-width':['interpolate',['linear'],['zoom'],11,2,17,9],
           'line-opacity':.35}});
  add({id:'ts_no',type:'circle',source:'g',filter:['==',['get','layer'],'two_stage_forbidden'],
    minzoom:12.5,
    paint:{'circle-radius':['interpolate',['linear'],['zoom'],12.5,3,14,5,17,9],
           'circle-color':C.blue,
           'circle-opacity':['interpolate',['linear'],['zoom'],11,.55,14,.9],
           'circle-stroke-width':1.2,'circle-stroke-color':'#fff','circle-stroke-opacity':.7}});
  add({id:'ts_pt',type:'circle',source:'g',filter:['==',['get','layer'],'two_stage_likely'],
    minzoom:11.5,
    paint:{'circle-radius':['interpolate',['linear'],['zoom'],11.5,3.5,14,6.5,17,12],
           'circle-color':'#fff',
           'circle-stroke-width':['interpolate',['linear'],['zoom'],11.5,2,17,3.5],
           'circle-stroke-color':['case',['!=',['get','koma'],null],C.grey,C.amber]}});
  add({id:'ts_sign',type:'circle',source:'g',filter:['==',['get','layer'],'two_stage_required_sign'],
    minzoom:10,
    paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,6,17,14],'circle-color':C.amber,
           'circle-stroke-width':3,'circle-stroke-color':'#fff'}});
  add({id:'route_turn',type:'circle',source:'route',filter:['==',['get','k'],'turn'],
    paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,6,17,13],'circle-color':C.amber,
           'circle-stroke-width':3,'circle-stroke-color':'#fff'}});

  /* --- 現在地の精度円（青ドット本体は DOM マーカー） --- */
  if (!map.getLayer('me_acc')) map.addLayer({id:'me_acc',type:'circle',source:'me',
    paint:{'circle-color':C.route,'circle-opacity':.12,
           'circle-stroke-width':1,'circle-stroke-color':C.route,'circle-stroke-opacity':.3,
           'circle-radius':['interpolate',['exponential',2],['zoom'],
             0,0, 20,['/',['get','accuracy'],0.14929]]}});

  /* 表示中のフィルタ状態を反映 */
  LAYERS.forEach(function(L){
    if (on[L.key]===false) L.ids.forEach(function(id){
      if (map.getLayer(id)) map.setLayoutProperty(id,'visibility','none');
    });
  });
  bindClicks();
}

var clicksBound=false;
function bindClicks(){
  if (clicksBound) return; clicksBound=true;
  ['expw','ban_line','ban_pt','ts_line','ts_no','ts_pt','ts_sign','route_turn'].forEach(function(id){
    map.on('click',id,function(e){ openSheet(e.features[0].properties, e.lngLat); });
    map.on('mouseenter',id,function(){ map.getCanvas().style.cursor='pointer'; });
    map.on('mouseleave',id,function(){ map.getCanvas().style.cursor=''; });
  });
}

function buildChips(){
  var counts={};
  DATA.features.forEach(function(f){ var l=f.properties.layer; counts[l]=(counts[l]||0)+1; });
  var wrap=$('#chips');
  LAYERS.forEach(function(L){
    on[L.key]=true;
    var b=document.createElement('button');
    b.className='chip'; b.type='button'; b.setAttribute('aria-pressed','true');
    b.innerHTML=GLYPH[L.glyph]+'<span>'+L.label+'</span><span class="n">'+(counts[L.key]||0)+'</span>';
    b.addEventListener('click',function(){
      on[L.key]=!on[L.key];
      b.setAttribute('aria-pressed',String(on[L.key]));
      L.ids.forEach(function(id){
        if(map.getLayer(id)) map.setLayoutProperty(id,'visibility',on[L.key]?'visible':'none');
      });
    });
    wrap.appendChild(b);
  });
}

/* ---------------- トースト ---------------- */
var toastT=null;
function toast(msg,ms){
  var el=$('#toast'); el.textContent=msg; el.hidden=false;
  clearTimeout(toastT);
  if(ms!==0) toastT=setTimeout(hideToast, ms||3200);
}
function hideToast(){ $('#toast').hidden=true; }

/* ---------------- 検索 ---------------- */
var results=$('#results');
$('#searchForm').addEventListener('submit',function(e){
  e.preventDefault(); search($('#q').value.trim());
});
function search(q){
  if(!q) return;
  toast('検索中…',0); results.hidden=true;
  var gsi=fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(q))
    .then(function(r){ return r.json(); })
    .then(function(a){ return (a||[]).map(function(f){
        return { name:f.properties.title, sub:'地理院 住所検索',
                 x:f.geometry.coordinates[0], y:f.geometry.coordinates[1] }; }); })
    .catch(function(){ return []; });
  var nom=fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=jp&viewbox=134.9,34.98,135.5,34.55&bounded=0&q='+encodeURIComponent(q),
      {headers:{'Accept':'application/json'}})
    .then(function(r){ return r.json(); })
    .then(function(a){ return (a||[]).map(function(o){
        var n=o.display_name.split(',');
        return { name:o.name||n[0], sub:n.slice(1,4).join('、').trim(),
                 x:parseFloat(o.lon), y:parseFloat(o.lat) }; }); })
    .catch(function(){ return []; });

  Promise.all([gsi,nom]).then(function(a){
    var list=[], seen={};
    // 3市の範囲に近いものを優先
    a[0].concat(a[1]).forEach(function(r){
      if(!r || !isFinite(r.x) || !isFinite(r.y)) return;
      var k=r.name+'@'+r.x.toFixed(3)+','+r.y.toFixed(3);
      if(seen[k]) return; seen[k]=1;
      r.near = (r.x>134.9&&r.x<135.5&&r.y>34.55&&r.y<34.98) ? 0 : 1;
      var t=r.name||'';
      r.fit = (t===q) ? 0 : (t.indexOf(q)===0 ? 1 : (t.indexOf(q)>=0 ? 2 : 3));
      list.push(r);
    });
    list.sort(function(p,q2){ return (p.near-q2.near) || (p.fit-q2.fit) ||
      (p.name.length - q2.name.length); });
    hideToast();
    if(!list.length){ toast('見つかりませんでした'); return; }
    renderResults(list.slice(0,8));
  });
}
function renderResults(list){
  results.innerHTML='';
  list.forEach(function(r){
    var li=document.createElement('li');
    li.tabIndex=0;
    li.innerHTML=escapeHtml(r.name)+'<span>'+escapeHtml(r.sub||'')+(r.near?'　（対象3市の外）':'')+'</span>';
    li.addEventListener('click',function(){ results.hidden=true; setDestination([r.x,r.y], r.name); });
    results.appendChild(li);
  });
  results.hidden=false;
}
function escapeHtml(s){ return String(s).replace(/[<>&"]/g,function(c){
  return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; }); }

/* ---------------- 目的地・ルート ---------------- */
var destMarker=null, dest=null, destName='', routeData=null, altData=null, showingAlt=false;

function setDestination(lngLat, name){
  dest=lngLat; destName=name||'選択した地点';
  if(destMarker) destMarker.remove();
  var el=document.createElement('div');
  el.style.cssText='width:16px;height:16px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);'+
    'background:'+C.route+';border:3px solid #06251b;box-shadow:0 0 0 5px rgba(56,211,159,.2)';
  destMarker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(lngLat).addTo(map);
  map.easeTo({center:lngLat, zoom:Math.max(map.getZoom(),14)});
  if(me) requestRoute();
  else {
    toast('現在地をオンにするとルートを出します',4200);
    startLocate(function(){ requestRoute(); });
  }
}

function valhalla(from, to, exclude){
  var body={ locations:[{lat:from[1],lon:from[0]},{lat:to[1],lon:to[0]}],
    costing:'motor_scooter',
    costing_options:{ motor_scooter:{ top_speed:30, use_highways:0, use_tolls:0 } },
    directions_options:{ language:'ja-JP', units:'kilometers' } };
  if(exclude && exclude.length) body.exclude_locations=exclude.map(function(p){ return {lat:p[1],lon:p[0]}; });
  return fetch(VALHALLA+'?json='+encodeURIComponent(JSON.stringify(body)),
      { headers:{ 'X-Client-Id':'seimei777.github.io/gentuki' } })
    .then(function(r){ if(!r.ok) throw new Error('route '+r.status); return r.json(); })
    .then(function(j){ if(!j.trip) throw new Error('no trip'); return parseTrip(j.trip); });
}

/* Valhalla polyline6 */
function decodePolyline(str, precision){
  var index=0, lat=0, lng=0, coords=[], factor=Math.pow(10, precision||6);
  while(index<str.length){
    var b, shift=0, result=0;
    do { b=str.charCodeAt(index++)-63; result|=(b&0x1f)<<shift; shift+=5; } while(b>=0x20);
    lat += ((result&1)?~(result>>1):(result>>1));
    shift=0; result=0;
    do { b=str.charCodeAt(index++)-63; result|=(b&0x1f)<<shift; shift+=5; } while(b>=0x20);
    lng += ((result&1)?~(result>>1):(result>>1));
    coords.push([lng/factor, lat/factor]);
  }
  return coords;
}

function parseTrip(trip){
  var leg=trip.legs[0];
  var shape=decodePolyline(leg.shape,6);
  var maneuvers=leg.maneuvers.map(function(m){
    return { type:m.type, text:m.instruction, km:m.length||0,
             at:shape[Math.min(m.begin_shape_index, shape.length-1)],
             streets:(m.street_names||[]).join('/') };
  });
  return { shape:shape, maneuvers:maneuvers,
           km:trip.summary.length, min:Math.round(trip.summary.time/60) };
}

var RIGHT_TURN={9:1,10:1,11:1};   // slight right / right / sharp right
function analyse(r){
  // ルート沿いの二段階右折（右折する交差点のみを「必要」とする）
  var need=[], passBan=[], seen={};
  r.maneuvers.forEach(function(m,idx){
    if(!RIGHT_TURN[m.type] || !m.at) return;
    var cands=nearPts(m.at[0],m.at[1]), best=null;
    cands.forEach(function(p){
      if(p.p.layer!=='two_stage_likely' && p.p.layer!=='two_stage_required_sign') return;
      var d=meters(m.at,[p.x,p.y]);
      if(d<=55 && (!best||d<best.d)) best={p:p,d:d};
    });
    if(best && !seen[best.p.i]){
      seen[best.p.i]=1;
      need.push({ mi:idx, at:m.at, pt:best.p, sign:best.p.p.layer==='two_stage_required_sign',
                  koma:best.p.p.koma });
    }
  });
  // 原付通行禁止区間との「重なり」判定（並行する別の道を拾わないよう線分距離で見る）
  // 出発・到着の前後120mは地点スナップの影響が出るので除外する
  var hits={}, keep={}, n0=r.shape.length;
  var skipHead=0, skipTail=n0-1, acc=0;
  for(var k=1;k<n0;k++){ acc+=meters(r.shape[k-1],r.shape[k]); if(acc>120){ skipHead=k; break; } }
  acc=0;
  for(var k2=n0-1;k2>0;k2--){ acc+=meters(r.shape[k2],r.shape[k2-1]); if(acc>120){ skipTail=k2; break; } }
  for(var si=skipHead; si<=skipTail; si++){
    var c=r.shape[si], kx=Math.floor(c[0]/GSTEP), ky=Math.floor(c[1]/GSTEP), touched={};
    for(var i=-1;i<=1;i++) for(var j=-1;j<=1;j++){
      var segs=banGrid[(kx+i)+'|'+(ky+j)]; if(!segs) continue;
      for(var n=0;n<segs.length;n++){
        var sg=segs[n], id=sg.p.uk||sg.p.title;
        if(touched[id]) continue;
        if(distToSeg(c, sg.a, sg.b) <= 12){ touched[id]=1; hits[id]=(hits[id]||0)+1; keep[id]=sg.p; }
      }
    }
  }
  Object.keys(hits).forEach(function(id){
    if(hits[id] >= 5) passBan.push(keep[id]);   // 連続5点以上＝おおむね200m以上の重なり
  });
  r.need=need; r.passBan=passBan;
  return r;
}

function requestRoute(){
  if(!me || !dest){ return; }
  toast('ルートを計算中…',0);
  showingAlt=false; altData=null; $('#avoidChk').checked=false; $('#avoidNote').textContent='';
  valhalla(me, dest).then(function(r){
    routeData=analyse(r);
    drawRoute(routeData); renderRoute(routeData,false); hideToast();
    if(routeData.need.length) prepareAlternative();
  }).catch(function(e){
    console.error(e); toast('ルートを計算できませんでした。少し時間をおいて試してください',5000);
  });
}
function prepareAlternative(){
  var ex=routeData.need.map(function(n){ return [n.pt.x, n.pt.y]; });
  var note=$('#avoidNote'); note.textContent='計算中…';
  valhalla(me, dest, ex).then(function(r){
    altData=analyse(r);
    var extra=Math.round((altData.km-routeData.km)*10)/10;
    if(altData.need.length>=routeData.need.length){
      note.textContent='迂回路なし'; altData=null; return;
    }
    note.textContent = (extra>0?('+'+extra+'km'):'短縮') + '／二段階 '+altData.need.length+'か所';
  }).catch(function(){ note.textContent='—'; altData=null; });
}
$('#avoidChk').addEventListener('change',function(){
  if(this.checked && altData){ showingAlt=true; drawRoute(altData); renderRoute(altData,true); }
  else { this.checked=false; showingAlt=false; if(routeData){ drawRoute(routeData); renderRoute(routeData,false); } }
});

function drawRoute(r){
  var feats=[{type:'Feature',properties:{k:'line'},
    geometry:{type:'LineString',coordinates:r.shape}}];
  r.need.forEach(function(n){
    feats.push({type:'Feature',
      properties:{k:'turn',layer:'two_stage_likely',
        title:(n.sign?'二段階右折 標識あり':'ここで二段階右折（推定）'),
        detail:'このルートはこの交差点で右折します。原付一種は二段階右折です。',
        lanes:n.pt.p.lanes, koma:n.koma, city:n.pt.p.city, src:n.pt.p.src},
      geometry:{type:'Point',coordinates:[n.pt.x,n.pt.y]}});
  });
  lastRouteGeo={type:'FeatureCollection',features:feats};
  map.getSource('route').setData(lastRouteGeo);
  var b=r.shape.reduce(function(acc,c){ return acc.extend(c); },
    new maplibregl.LngLatBounds(r.shape[0], r.shape[0]));
  map.fitBounds(b,{padding:{top:150,bottom:window.innerWidth<760?330:80,left:40,right:40},duration:700});
}

function renderRoute(r, isAlt){
  $('#rDest').textContent = destName + (isAlt?'（二段階右折を避けるルート）':'');
  $('#rDist').textContent = (Math.round(r.km*10)/10) + ' km';
  $('#rTime').textContent = 'およそ ' + r.min + ' 分';

  var w=$('#rWarn'); w.innerHTML='';
  if(r.need.length){
    w.insertAdjacentHTML('beforeend',
      '<div class="wrow">'+GLYPH.est+'<div>この先<b> '+r.need.length+' </b>か所で<b> 二段階右折 </b>が必要です</div></div>');
  } else {
    w.insertAdjacentHTML('beforeend',
      '<div class="wrow ok">'+GLYPH.est+'<div>ルート上に二段階右折が必要な右折はありません</div></div>');
  }
  var timed=r.passBan.filter(function(p){ return !p.always; });
  var always=r.passBan.filter(function(p){ return p.always; });
  if(timed.length){
    var tn={}; timed.forEach(function(p){ tn[p.title+(p.time?('　'+p.time):'')]=1; });
    w.insertAdjacentHTML('beforeend',
      '<div class="wrow hot">'+GLYPH.ban+'<div><b>時間・曜日限定の通行禁止</b>と重なる区間があります（'+
      escapeHtml(Object.keys(tn).join('、'))+'）。経路探索はこの規制を知りません。現地の標識で必ず確認してください</div></div>');
  }
  if(always.length){
    var an={}; always.forEach(function(p){ an[p.title]=1; });
    w.insertAdjacentHTML('beforeend',
      '<div class="wrow ok">'+GLYPH.ban+'<div>原付通行禁止の区間（'+escapeHtml(Object.keys(an).join('、'))+
      '）に沿って走る箇所があります。並走する別の道の可能性もあるので、標識を確認してください</div></div>');
  }

  var ol=$('#rSteps'); ol.innerHTML='';
  var needByMi={}; r.need.forEach(function(n){ needByMi[n.mi]=n; });
  r.maneuvers.forEach(function(m,i){
    var li=document.createElement('li');
    var n=needByMi[i];
    if(n) li.className='two';
    var d=m.km>=1 ? (Math.round(m.km*10)/10+' km') : (Math.round(m.km*1000/10)*10+' m');
    li.innerHTML='<span class="d">'+(m.km?d:'')+'</span><span>'+escapeHtml(m.text||'')+
      (n?('<br><b>▲ ここは二段階右折'+(n.sign?'（標識あり）':'（推定）')+
          (n.koma!=null&&n.koma!==''?'　※近くに小回り標識あり':'')+'</b>'):'')+'</span>';
    ol.appendChild(li);
  });
  $('#route').hidden=false;
  $('#sheet').hidden=true;
}
$('#rClose').addEventListener('click',function(){
  $('#route').hidden=true; routeData=null; altData=null;
  if(destMarker){ destMarker.remove(); destMarker=null; } dest=null;
  lastRouteGeo=null;
  map.getSource('route').setData({type:'FeatureCollection',features:[]});
});

/* 長押し / 右クリックで目的地 */
map.on('contextmenu', function(e){ setDestination([e.lngLat.lng,e.lngLat.lat],'選択した地点'); });
var pressT=null, pressPt=null;
map.on('touchstart', function(e){
  if(e.points.length!==1) return;
  pressPt=e.lngLat;
  pressT=setTimeout(function(){
    if(navigator.vibrate) navigator.vibrate(30);
    setDestination([pressPt.lng,pressPt.lat],'選択した地点');
  }, 620);
});
['touchend','touchcancel','touchmove','movestart'].forEach(function(ev){
  map.on(ev, function(){ clearTimeout(pressT); });
});

/* ---------------- 詳細シート ---------------- */
var TAG={ two_stage_likely:['推定',C.amber], two_stage_required_sign:['標識',C.amber],
  two_stage_forbidden:['標識',C.blue], moped_banned:['規制データ',C.danger], expressway:['OSM',C.express] };
var GKEY={ two_stage_likely:'est', two_stage_required_sign:'req', two_stage_forbidden:'no',
  moped_banned:'ban', expressway:'exp' };
var sheetPt=null;
function openSheet(p, lngLat){
  if(p.layer==='two_stage_likely_line') p.layer='two_stage_likely';
  sheetPt = lngLat ? [lngLat.lng, lngLat.lat] : null;
  var t=TAG[p.layer]||['',C.grey];
  var tag=$('#sTag'); tag.textContent=t[0]; tag.style.color=t[1];
  $('#sGlyph').innerHTML=GLYPH[GKEY[p.layer]]||'';
  $('#sTitle').textContent=p.title||'';
  $('#sDetail').textContent=p.detail||'';
  var rows=[];
  if(p.city) rows.push(['市',p.city]);
  if(p.lanes) rows.push(['車両通行帯',p.lanes+' 以上']);
  if(p.time) rows.push(['規制時間',p.time]);
  if(p.cond) rows.push(['条件',p.cond]);
  if(p.koma!=null&&p.koma!=='') rows.push(['注記','約'+p.koma+'m先に小回り標識あり。現地の標識が優先']);
  if(p.src) rows.push(['出典',p.src]);
  $('#sMeta').innerHTML=rows.map(function(r){
    return '<dt>'+escapeHtml(r[0])+'</dt><dd>'+escapeHtml(r[1])+'</dd>'; }).join('');
  $('#sheet').hidden=false;
}
$('#sClose').addEventListener('click',function(){ $('#sheet').hidden=true; });
$('#sHere').addEventListener('click',function(){
  if(sheetPt){ $('#sheet').hidden=true; setDestination(sheetPt,'選択した地点'); }
});
$('#infoBtn').addEventListener('click',function(){ $('#info').hidden=false; });
$('#iClose').addEventListener('click',function(){ $('#info').hidden=true; });
ready.then(function(){
  document.querySelectorAll('#info [data-glyph]').forEach(function(el){
    el.outerHTML=GLYPH[el.dataset.glyph];
  });
});

/* ---------------- 現在地・近接アラート ---------------- */
var watch=null, meMarker=null, me=null, voiceOn=false, alerted={}, lastHeading=null;
var alertBox=$('#alert');
alertBox.querySelector('.a-close').addEventListener('click',function(){ alertBox.hidden=true; });

function startLocate(cb){
  if(watch!=null){ if(cb) cb(); return; }
  if(!navigator.geolocation){ toast('この端末では現在地を取得できません'); return; }
  $('#locBtn').setAttribute('aria-pressed','true');
  var first=true;
  watch=navigator.geolocation.watchPosition(function(pos){
    var c=[pos.coords.longitude,pos.coords.latitude];
    var acc=pos.coords.accuracy||0, hd=pos.coords.heading, sp=pos.coords.speed||0;
    me=c;
    // 精度円
    if (map.getSource('me')) map.getSource('me').setData({type:'FeatureCollection',
      features:[{type:'Feature',properties:{accuracy:acc},
                 geometry:{type:'Point',coordinates:c}}]});
    if(!meMarker){
      var el=document.createElement('div');
      el.className='puck';
      el.innerHTML='<span class="puck-cone"></span><span class="puck-ring"></span>';
      meMarker=new maplibregl.Marker({element:el,pitchAlignment:'map',rotationAlignment:'map'})
        .setLngLat(c).addTo(map);
      if(!dest) map.easeTo({center:me,zoom:Math.max(map.getZoom(),15)});
    } else meMarker.setLngLat(c);
    // 方位：停止中の heading は暴れるので速度が出ているときだけ更新する
    var el2=meMarker.getElement();
    if (hd!=null && isFinite(hd) && sp>1.5){
      lastHeading=hd;
      el2.style.setProperty('--hd', hd+'deg');
      el2.classList.add('has-hd');
    } else if (lastHeading==null){
      el2.classList.remove('has-hd');
    }
    // 精度が悪いときは灰色にして正直に伝える
    el2.classList.toggle('weak', acc>65);
    if(first){ first=false; if(cb) cb(); }
    checkNear();
  }, function(err){
    $('#locBtn').setAttribute('aria-pressed','false'); watch=null;
    toast('現在地を取得できません（'+err.message+'）',5000);
  }, {enableHighAccuracy:true,maximumAge:3000,timeout:15000});
}
function stopLocate(){
  if(watch!=null) navigator.geolocation.clearWatch(watch);
  watch=null; me=null; alerted={}; lastHeading=null;
  if (map.getSource('me')) map.getSource('me').setData({type:'FeatureCollection',features:[]});
  $('#locBtn').setAttribute('aria-pressed','false');
  if(meMarker){ meMarker.remove(); meMarker=null; }
  alertBox.hidden=true;
}
$('#locBtn').addEventListener('click',function(){ watch!=null ? stopLocate() : startLocate(); });

var KIND={
  two_stage_likely:{t:'二段階右折',k:'',say:'二段階右折の交差点です'},
  two_stage_required_sign:{t:'二段階右折 標識',k:'',say:'二段階右折の標識があります'},
  two_stage_forbidden:{t:'小回り右折',k:'no',say:'ここは二段階右折禁止です'},
  moped_banned:{t:'原付通行禁止',k:'ban',say:'この先、原付は通行できません'}
};
function checkNear(){
  if(!me || !PTS.length) return;
  var active = routeNeedSet();
  var best=null;
  nearPts(me[0],me[1]).forEach(function(q){
    if(!on[q.p.layer]) return;
    if(active && !active[q.i] && q.p.layer==='two_stage_likely') return; // ルート中は経路上のものを優先
    var d=meters(me,[q.x,q.y]);
    if(d<=ALERT_IN && (!best||d<best.d)) best={q:q,d:d};
  });
  Object.keys(alerted).forEach(function(k){
    var q=PTS[k]; if(!q || meters(me,[q.x,q.y])>ALERT_OUT) delete alerted[k];
  });
  if(!best){ alertBox.hidden=true; return; }
  var kd=KIND[best.q.p.layer]; if(!kd){ alertBox.hidden=true; return; }
  alertBox.dataset.kind=kd.k;
  alertBox.querySelector('.a-kind').textContent=kd.t;
  alertBox.querySelector('.a-dist').textContent='約 '+best.d+' m';
  alertBox.querySelector('.a-note').textContent=
    (best.q.p.lanes?('片側'+best.q.p.lanes+'車線・信号交差点（推定）'):'')+
    (best.q.p.time?(' '+best.q.p.time):'');
  alertBox.hidden=false;
  if(!alerted[best.q.i]){
    alerted[best.q.i]=1;
    if(navigator.vibrate) navigator.vibrate([120,60,120]);
    if(voiceOn) say('およそ'+(Math.round(best.d/10)*10)+'メートル先、'+kd.say);
  }
}
function routeNeedSet(){
  var r = showingAlt? altData : routeData;
  if(!r || !r.need.length) return null;
  var s={}; r.need.forEach(function(n){ s[n.pt.i]=1; }); return s;
}
function say(text){
  try{ var u=new SpeechSynthesisUtterance(text); u.lang='ja-JP'; u.rate=1.05;
    speechSynthesis.cancel(); speechSynthesis.speak(u); }catch(e){}
}
$('#themeBtn').addEventListener('click',function(){
  setTheme(theme==='night'?'day':'night');
});
$('#voiceBtn').addEventListener('click',function(){
  voiceOn=!voiceOn;
  this.setAttribute('aria-pressed',String(voiceOn));
  if(voiceOn) say('音声案内をオンにしました');
});

document.body.dataset.theme=theme;
$('#themeBtn').setAttribute('aria-pressed',String(theme==='night'));
toast('規制データを読み込み中…',0);
