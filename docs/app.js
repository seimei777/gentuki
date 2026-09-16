/* げんつきマップ — 神戸・西宮・宝塚 / 原付一種のルート＆規制ビューア */
'use strict';

var C = { amber:'#f5871f', blue:'#1a73e8', danger:'#ea4335', express:'#b31412',
          grey:'#9aa0a6', route:'#1a73e8', routeCasing:'#1557b0', ped:'#1f8a4c' };
var VALHALLA = 'https://valhalla1.openstreetmap.de/route';
var ALERT_IN = 300, ALERT_OUT = 430;
var $ = function(s){ return document.querySelector(s); };

/* ---------------- 標識グリフ ---------------- */
var GLYPH = {
  est:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="'+C.amber+'" stroke-width="2.6"/><path d="M12 18v-5h4.5" fill="none" stroke="'+C.amber+'" stroke-width="2" stroke-linecap="round"/><path d="M16.5 13l-1.6-1.6M16.5 13l-1.6 1.6" fill="none" stroke="'+C.amber+'" stroke-width="2" stroke-linecap="round"/><path d="M12 13V7.5" fill="none" stroke="'+C.amber+'" stroke-width="2" stroke-linecap="round" opacity=".55"/></svg>',
  req:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="'+C.amber+'"/><path d="M9.5 18.5v-5H15" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 13.5l-1.8-1.8M15 13.5l-1.8 1.8" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round"/><path d="M15 9.2V5.6" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round"/><path d="M15 5.6l-1.6 1.7M15 5.6l1.6 1.7" fill="none" stroke="#141414" stroke-width="2" stroke-linecap="round"/></svg>',
  no:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="'+C.blue+'"/><path d="M10 18V11.5h4" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 11.5l-2-2M14 11.5l-2 2" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/></svg>',
  ban:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.2" fill="none" stroke="'+C.danger+'" stroke-width="3"/><path d="M6 17.5L18 6.5" stroke="'+C.danger+'" stroke-width="3" stroke-linecap="round"/></svg>',
  ped:'<svg class="gl" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1f8a4c"/><circle cx="12" cy="6.4" r="1.9" fill="#fff"/><path d="M12 8.6c-1.7 0-2.6 1-2.6 2.3v3.2h1.3V19h2.6v-4.9h1.3v-3.2c0-1.3-.9-2.3-2.6-2.3z" fill="#fff"/></svg>',
  exp:'<svg class="gl" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="none" stroke="'+C.express+'" stroke-width="2"/><path d="M5.5 12h4M11 12h2.5M15.5 12h3" stroke="'+C.express+'" stroke-width="2" stroke-linecap="round"/></svg>'
};
var LAYERS = [
  {key:'two_stage_likely', glyph:'est', label:'二段階右折', ids:['ts_line','ts_pt']},
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
function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
var theme = lsGet('gentuki.theme') ||
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

/* 自前レイヤを挿し込む位置：ラベルの下、道路の上。
   「最初の symbol レイヤ」を基準にしてはいけない。夜スタイル(dark)では
   index 8 の water_name が最初の symbol で、道路レイヤ18個すべてがその後ろに来る。
   そこを基準にすると自前レイヤが道路の下に潜って見えなくなる。
   道路の geometry を最後まで数えてから、その先の最初のラベルを基準にする。 */
function firstSymbolLayerId(){
  var layers = map.getStyle().layers || [], lastRoad = -1;
  for (var i=0;i<layers.length;i++){
    if (layers[i]['source-layer']==='transportation') lastRoad = i;
  }
  for (var j=lastRoad+1;j<layers.length;j++){
    if (layers[j].type==='symbol') return layers[j].id;
  }
  return undefined;   // 道路より上にラベルが無ければ最前面へ
}

function setTheme(t){
  theme=t;
  lsSet('gentuki.theme',t);
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
                'moped_banned','expressway','two_stage_likely_line','pedestrian_only'];
var CITY_NAME=['神戸市','西宮市','宝塚市','尼崎市','伊丹市','芦屋市','川西市','池田市'];
var SRC_REG='兵庫県警/JARTIC交通規制情報';
var SRC_EST='兵庫県警・大阪府警/JARTIC交通規制情報（車両通行帯＋信号機から判定）';
var SRC_OSM='© OpenStreetMap contributors (ODbL)';
function expand(doc){
  var titles=doc.titles||[];
  doc.features.forEach(function(f){
    var q=f.properties, lay=LAYER_NAME[q.l], p={layer:lay};
    if(q.c!=null) p.city=CITY_NAME[q.c];
    if(q.n!=null) p.lanes=q.n;
    if (q.k!=null) p.koma = q.k;
    if(lay==='two_stage_likely'||lay==='two_stage_likely_line'){
      p.title='二段階右折　片側'+(q.n||3)+'車線';
      p.strong = (q.o!=null && q.o>=3);            // OSMの車線数でも裏が取れたもの
      p.detail = '車両通行帯が3以上、かつ信号機あり。道交法ではこの条件だけで、'
        + '標識が無くても原付一種は二段階右折が義務です。'
        + (q.k!=null ? 'ただし近くに小回り標識があります。標識がある場合はそちらが優先で、二段階右折をしてはいけません。' : '');
      p.src=SRC_EST; p.confidence='estimated';
    } else if(lay==='two_stage_required_sign'){
      p.title='二段階右折 標識';
      p.detail='「原動機付自転車の右折方法（二段階）」の標識。車線数に関係なく二段階右折が必要です。この標識自体は稀で、通常は標識が無くても車線数と信号で義務が決まります。';
      p.src=SRC_REG; p.confidence='sign';
    } else if(lay==='two_stage_forbidden'){
      p.title='二段階右折 禁止（小回り指定）';
      p.detail='「原動機付自転車の右折方法（小回り）」の標識。車線が多くても右折レーンから普通に右折する。';
      p.src=SRC_REG; p.confidence='sign';
    } else if(lay==='pedestrian_only'){
      p.title=titles[q.t]||'歩行者用道路';
      p.always=!!q.a;
      p.detail=p.always?'歩行者用道路。原付を含む車両は進入できません。'
                       :'歩行者用道路（時間帯指定）。指定時間内は原付を含む車両が進入できません。通学路が多く、朝の時間帯だけ規制されている道が多いです。';
      if(q.h) p.time=q.h;
      if(q.d) p.cond=q.d;
      if(q.x) p.excl=q.x;
      p.src=SRC_REG; p.confidence='sign'; p.uk='ped'+q.t+'@'+f.geometry.coordinates[0];
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
  fetch('data/genki.min.geojson?v=6').then(function(r){ return r.json(); }).then(expand),
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

  add({id:'ped_line',type:'line',source:'g',filter:['==',['get','layer'],'pedestrian_only'],
    layout:{'line-cap':'round'},
    paint:{'line-color':C.ped,'line-width':['interpolate',['linear'],['zoom'],11,1.5,16,5],
           'line-opacity':['case',['get','always'],.85,.5],
           'line-dasharray':['case',['get','always'],['literal',[1,0]],['literal',[3,2]]]}});
  add({id:'ped_pt',type:'circle',source:'g',
    filter:['all',['==',['get','layer'],'pedestrian_only'],['==',['geometry-type'],'Point']],
    minzoom:13,
    paint:{'circle-radius':4,'circle-color':C.ped,'circle-stroke-width':1.5,'circle-stroke-color':'#fff'}});

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
           'circle-stroke-color':['case',['has','koma'],C.grey,C.amber]}});
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
  ['expw','ban_line','ban_pt','ped_line','ped_pt','ts_line','ts_no','ts_pt','ts_sign','route_turn'].forEach(function(id){
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
  e.preventDefault(); $('#q').blur(); search($('#q').value.trim());
});
var searchTimer=null, searchSeq=0;
$('#q').addEventListener('input',function(){
  var v=this.value.trim();
  clearTimeout(searchTimer);
  if (v.length<2){ results.hidden=true; return; }
  searchTimer=setTimeout(function(){ search(v,true); }, 280);
});
$('#q').addEventListener('focus',function(){
  if (this.value.trim().length>=2 && results.children.length) results.hidden=false;
});
function search(q, incremental){
  if(!q) return;
  var seq=++searchSeq;                        // 古い応答で新しい結果を上書きしない
  if(!incremental) results.hidden=true;
  var btn=$('#goBtn');
  if(!incremental){ btn.disabled=true; btn.textContent='検索中'; }
  var acc=[], seen={}, done=0;

  function push(list){
    list.forEach(function(r){
      if(!r || !isFinite(r.x) || !isFinite(r.y)) return;
      var k=r.name+'@'+r.x.toFixed(3)+','+r.y.toFixed(3);
      if(seen[k]) return; seen[k]=1;
      r.near = (r.x>134.9&&r.x<135.5&&r.y>34.55&&r.y<34.98) ? 0 : 1;
      var t=r.name||'';
      r.fit = (t===q) ? 0 : (t.indexOf(q)===0 ? 1 : (t.indexOf(q)>=0 ? 2 : 3));
      acc.push(r);
    });
    acc.sort(function(p,q2){ return (p.near-q2.near) || (p.fit-q2.fit) ||
      (p.name.length - q2.name.length); });
    if (seq!==searchSeq) return;
    if (acc.length) renderResults(acc.slice(0,8));
  }
  function finish(){
    if (++done < 2 || seq!==searchSeq) return;
    btn.disabled=false; btn.textContent='検索';
    if (!acc.length && !incremental) toast('見つかりませんでした');
  }

  /* 地理院の住所検索は速いので先に表示する */
  fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent(q))
    .then(function(r){ return r.json(); })
    .then(function(a){ if(seq!==searchSeq) return; push((a||[]).map(function(f){
        return { name:f.properties.title, sub:'地理院 住所検索',
                 x:f.geometry.coordinates[0], y:f.geometry.coordinates[1] }; })); })
    .catch(function(){}).then(finish);

  /* Nominatim は店名などを拾えるが遅いので後追いで足す */
  fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=jp&viewbox=134.9,34.98,135.5,34.55&bounded=0&q='+encodeURIComponent(q),
      {headers:{'Accept':'application/json'}})
    .then(function(r){ return r.json(); })
    .then(function(a){ if(seq!==searchSeq) return; push((a||[]).map(function(o){
        var n=o.display_name.split(',');
        return { name:o.name||n[0], sub:n.slice(1,4).join('、').trim(),
                 x:parseFloat(o.lon), y:parseFloat(o.lat) }; })); })
    .catch(function(){}).then(finish);
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

function valhalla(from, to, exclude, heading){
  var origin={lat:from[1],lon:from[0]};
  if (heading!=null){ origin.heading=heading; origin.heading_tolerance=45; }  // 来た道へ戻されるのを防ぐ
  var body={ locations:[origin,{lat:to[1],lon:to[0]}],
    costing:'motor_scooter',
    costing_options:{ motor_scooter:{
      top_speed:30,            // 法定速度。これを超える道を避ける効果も持つ
      use_primary:0.35,        // 幹線を軽く避ける。0.2まで下げると国道428号を避けて
                               // 三宮→谷上が13.7km→22.2kmになったので効かせすぎない
      use_hills:0.4,           // 登坂力を考慮（FOSSGISの公開インスタンスでは標高データが
                               // 無いようで実測では効いていない）
      use_tracks:0.1,          // 既定0.5だと未舗装の農道に入りうる
      use_living_streets:0.3,
      use_highways:0, use_tolls:0,
      maneuver_penalty:10      // 曲がりの少ない素直なルートにする
    }},
    directions_options:{ language:'ja-JP', units:'kilometers' } };
  if(exclude && exclude.length) body.exclude_locations=
    exclude.slice(0,50).map(function(p){ return {lat:p[1],lon:p[0]}; });   // Valhallaの上限は50
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
             say:m.verbal_pre_transition_instruction||m.instruction,
             sayShort:m.verbal_succinct_transition_instruction||m.verbal_pre_transition_instruction||m.instruction,
             at:shape[Math.min(m.begin_shape_index, shape.length-1)],
             shapeIndex:m.begin_shape_index,
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
  var hits={}, keep={}, hitPts={}, n0=r.shape.length;
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
        if(distToSeg(c, sg.a, sg.b) <= 12){
          touched[id]=1; hits[id]=(hits[id]||0)+1; keep[id]=sg.p;
          (hitPts[id]||(hitPts[id]=[])).push(c);
        }
      }
    }
  }
  Object.keys(hits).forEach(function(id){
    if(hits[id] >= 5) passBan.push(keep[id]);   // 連続5点以上＝おおむね200m以上の重なり
  });
  /* 右折する交差点に小回り標識があれば、そこは二段階右折をしてはいけない */
  var komaTurn=[];
  r.maneuvers.forEach(function(m,idx){
    if(!RIGHT_TURN[m.type] || !m.at) return;
    if (need.some(function(n){ return n.mi===idx; })) return;   // 二段階側で拾えていれば省く
    var best=null;
    nearPts(m.at[0],m.at[1]).forEach(function(p){
      if (p.p.layer!=='two_stage_forbidden') return;
      var d=meters(m.at,[p.x,p.y]);
      if (d<=55 && (!best||d<best.d)) best={p:p,d:d};
    });
    if (best) komaTurn.push({mi:idx, pt:best.p});
  });
  r.komaTurn=komaTurn;

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
/* Valhalla の motor_scooter は自動車専用道路は避けるが、
   公安委員会の二輪通行禁止（県警データ側）は知らない。
   終日禁止の区間と重なっていたら、その地点を除外して取り直す。 */
function avoidBannedIfNeeded(){
  if (!routeData || !routeData.banPts || !routeData.banPts.length) return;
  var ex=routeData.banPts.slice(0,50);          // Valhalla の exclude_locations は上限50
  var before=routeData.km;
  toast('原付が通れない区間を避けて計算し直しています…',0);
  valhalla(me, dest, ex).then(function(r2){
    var a2=analyse(r2);
    var stillBanned=a2.passBan.filter(function(p){ return p.always; }).length;
    var wasBanned=routeData.passBan.filter(function(p){ return p.always; }).length;
    hideToast();
    if (stillBanned < wasBanned && a2.km < before*1.35){   // 35%以上遠回りになるなら
                                                          // 迂回せず警告に留める
      routeData=a2; showingAlt=false; altData=null;
      drawRoute(routeData); renderRoute(routeData,false);
      if (routeData.need.length) prepareAlternative();
      toast('原付が通れない区間を避けたルートに差し替えました（+'+
            (Math.round((a2.km-before)*10)/10)+'km）', 6000);
    } else if (stillBanned < wasBanned){
      toast('禁止区間を避けると大きく遠回りになるため、元のルートのまま警告を出しています',7000);
    }
  }).catch(function(){ hideToast(); });
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
        title:(n.sign?'二段階右折 標識あり':'ここで二段階右折'),
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
    li.innerHTML='<span class="d">'+(m.km?d:'')+'</span><span>'+escapeHtml(cleanSay(m.text||''))+
      (n?('<br><b>▲ ここは二段階右折'+(n.sign?'（標識あり）':'')+
          (n.koma!=null&&n.koma!==''?'　※近くに小回り標識あり':'')+'</b>'):'')+'</span>';
    ol.appendChild(li);
  });
  resetSheetHeight($('#route'));
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


/* ==================== ボトムシートのドラッグ ====================
   グリップを掴んで上下に引くと、peek（内容ぶん）と full（画面の88%）を行き来する。
   離した瞬間の速度を見てスナップするのが、iOSらしい手触りの8割。 */
function makeDraggable(el){
  var grip = el.querySelector('.grip'); if (!grip) return;
  var startY=0, startH=0, lastY=0, lastT=0, v=0, dragging=false;
  function vh(f){ return window.innerHeight*f; }
  function peekH(){ return Math.min(vh(0.46), el.scrollHeight + 8); }
  function fullH(){ return Math.min(vh(0.88), Math.max(el.scrollHeight + 8, vh(0.5))); }
  function snapTo(h){
    el.style.transition='height .28s cubic-bezier(.32,.72,0,1)';
    el.style.height=Math.round(h)+'px';
    setTimeout(function(){ el.style.transition=''; },300);
  }
  grip.addEventListener('pointerdown',function(e){
    dragging=true; startY=lastY=e.clientY; lastT=Date.now();
    startH=el.getBoundingClientRect().height;
    el.style.transition='';
    try{ grip.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  });
  grip.addEventListener('pointermove',function(e){
    if(!dragging) return;
    var now=Date.now(), dt=Math.max(1, now-lastT);
    v=(lastY-e.clientY)/dt; lastY=e.clientY; lastT=now;
    var h=startH + (startY-e.clientY);
    h=Math.max(120, Math.min(vh(0.92), h));
    el.style.height=Math.round(h)+'px';
    e.preventDefault();
  });
  ['pointerup','pointercancel'].forEach(function(ev){
    grip.addEventListener(ev,function(e){
      if(!dragging) return; dragging=false;
      var h=el.getBoundingClientRect().height, p=peekH(), f=fullH();
      if (v>0.4) snapTo(f);
      else if (v<-0.4){ if (h < p*0.7) { el.hidden=true; el.style.height=''; } else snapTo(p); }
      else snapTo(h > (p+f)/2 ? f : p);
      v=0;
    });
  });
  /* グリップのタップでも開閉できるようにする（引っ張れると気づかない人向け） */
  grip.addEventListener('click',function(){
    var h=el.getBoundingClientRect().height;
    snapTo(h > (peekH()+fullH())/2 ? peekH() : fullH());
  });
}
function resetSheetHeight(el){ el.style.transition=''; el.style.height=''; }

/* ---------------- 詳細シート ---------------- */
var TAG={ pedestrian_only:['標識',C.ped], two_stage_likely:['義務',C.amber], two_stage_required_sign:['標識',C.amber],
  two_stage_forbidden:['標識',C.blue], moped_banned:['規制データ',C.danger], expressway:['OSM',C.express] };
var GKEY={ pedestrian_only:'ped', two_stage_likely:'est', two_stage_required_sign:'req', two_stage_forbidden:'no',
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
  if(p.lanes) rows.push(['車両通行帯（県警データ）',p.lanes]);
  if(p.osm!=null) rows.push(['参考：地図データの車線数','片側 '+p.osm+' 車線'+
    (p.osm>=3?'（一致）':'（交差点で右折レーンが増える場所はこうなります）')]);
  if(p.road) rows.push(['道路',p.road]);
  if(p.time) rows.push(['規制時間',p.time]);
  if(p.cond) rows.push(['条件',p.cond]);
  if(p.excl) rows.push(['除外される車両',p.excl+
    (/原付|二輪全般|車両全般/.test(p.excl)?'':'　※原付は含まれません（軽車両・自転車に原付は入らない）')]);
  if(p.koma!=null&&p.koma!=='') rows.push(['注記','約'+p.koma+'m先に小回り標識あり。現地の標識が優先']);
  if(p.src) rows.push(['出典',p.src]);
  $('#sMeta').innerHTML=rows.map(function(r){
    return '<dt>'+escapeHtml(r[0])+'</dt><dd>'+escapeHtml(r[1])+'</dd>'; }).join('');
  renderFeedback(p);
  resetSheetHeight($('#sheet'));
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



/* ==================== 地図上の建物・店をタップして目的地にする ====================
   背景地図（OpenFreeMap）のベクタータイルに poi レイヤが含まれていて、name:ja も入っている。
   Google Places は「結果を Google の地図に表示すること」が条件なので使えないが、
   そもそも自前の地図が POI を持っているので必要ない。 */
var POI_LAYERS=['poi_r1','poi_r7','poi_r20','poi_transit'];
var POI_JA={
  fuel:'ガソリンスタンド', parking:'駐車場', motorcycle_parking:'バイク駐車場',
  bicycle_parking:'駐輪場', convenience:'コンビニ', supermarket:'スーパー',
  restaurant:'飲食店', cafe:'カフェ', fast_food:'ファストフード', bakery:'パン屋',
  hospital:'病院', clinic:'クリニック', pharmacy:'薬局', bank:'銀行', atm:'ATM',
  post_office:'郵便局', police:'交番・警察署', school:'学校', university:'大学',
  library:'図書館', park:'公園', hotel:'ホテル', bus_stop:'バス停',
  railway:'駅', subway:'駅', station:'駅', tram_stop:'停留所',
  convenience_store:'コンビニ', department_store:'百貨店', mall:'ショッピングモール',
  car_repair:'自動車整備', motorcycle:'バイク店', museum:'博物館', temple:'寺',
  shinto:'神社', hairdresser:'美容室', laundry:'コインランドリー', toilets:'トイレ',
  drinking_water:'水飲み場', shelter:'休憩所', viewpoint:'展望台'
};
function poiLabel(p){
  return POI_JA[p.subclass] || POI_JA[p.class] || p.subclass || p.class || '地点';
}
function openPoiSheet(f, lngLat){
  var pr=f.properties||{};
  var named = pr['name:ja'] || pr.name || pr['name:latin'];
  var name = named || poiLabel(pr);
  sheetPt=[lngLat.lng, lngLat.lat];
  var tag=$('#sTag'); tag.textContent='地図'; tag.style.color=C.route;
  $('#sGlyph').innerHTML='';
  $('#sTitle').textContent=name;
  $('#sDetail').textContent = named ? poiLabel(pr) : '名称のない地点です。ここを目的地にできます。';
  var rows=[];
  if (me) rows.push(['現在地から', (function(){
    var d=meters(me,[lngLat.lng,lngLat.lat]);
    return d>=1000 ? (Math.round(d/100)/10)+' km' : d+' m';
  })()]);
  rows.push(['出典','OpenStreetMap（背景地図の地点データ）']);
  $('#sMeta').innerHTML=rows.map(function(r){
    return '<dt>'+escapeHtml(r[0])+'</dt><dd>'+escapeHtml(r[1])+'</dd>'; }).join('');
  $('#fb').hidden=true;
  resetSheetHeight($('#sheet'));
  $('#sheet').hidden=false;
}
function existingLayers(ids){ return ids.filter(function(i){ return map.getLayer(i); }); }
map.on('click', function(e){
  if (nav.on) return;
  var ours=existingLayers(['expw','ban_line','ban_pt','ped_line','ped_pt','ts_line','ts_no','ts_pt','ts_sign','route_turn']);
  if (ours.length && map.queryRenderedFeatures(e.point,{layers:ours}).length) return; // 規制の方を優先

  var pad=12, box=[[e.point.x-pad,e.point.y-pad],[e.point.x+pad,e.point.y+pad]];
  var poi=map.queryRenderedFeatures(box,{layers:existingLayers(POI_LAYERS)});
  if (poi.length){ openPoiSheet(poi[0], e.lngLat); return; }

  /* 何も無い場所をタップしたとき：シートが開いていれば閉じる、閉じていればピンを落とす。
     POI はズーム15以上でしか地図に存在しないので、これが無いと
     「建物を押しても何も出ない」状態になる */
  if (!$('#sheet').hidden){ $('#sheet').hidden=true; return; }
  dropPin(e.lngLat);
});

function dropPin(lngLat){
  sheetPt=[lngLat.lng, lngLat.lat];
  var tag=$('#sTag'); tag.textContent='地点'; tag.style.color=C.route;
  $('#sGlyph').innerHTML='';
  $('#sTitle').textContent='この地点';
  $('#sDetail').textContent='住所を調べています…';
  var rows=[];
  if (me){
    var d=meters(me,[lngLat.lng,lngLat.lat]);
    rows.push(['現在地から', d>=1000 ? (Math.round(d/100)/10)+' km' : d+' m']);
  }
  $('#sMeta').innerHTML=rows.map(function(r){
    return '<dt>'+escapeHtml(r[0])+'</dt><dd>'+escapeHtml(r[1])+'</dd>'; }).join('');
  $('#sheet').hidden=false;
  /* 地理院の逆ジオコーダで住所を引く（失敗しても地点として使える） */
  fetch('https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat='+
        lngLat.lat+'&lon='+lngLat.lng)
    .then(function(r){ return r.json(); })
    .then(function(j){
      var nm=j && j.results && j.results.lv01Nm;
      $('#sDetail').textContent = nm ? nm : 'この場所を目的地にできます。';
    })
    .catch(function(){ $('#sDetail').textContent='この場所を目的地にできます。'; });
}

map.on('mousemove', function(e){
  if (nav.on) return;
  var ls=existingLayers(POI_LAYERS);
  if (!ls.length) return;
  var hit=map.queryRenderedFeatures(e.point,{layers:ls}).length;
  if (hit) map.getCanvas().style.cursor='pointer';
});


/* ==================== Supabase（報告の共有） ====================
   端末に貯めるだけだと、走った人の確認がその人の中で終わってしまう。
   集計だけを共有して、地図の確度を上げていく。
   キーは publishable（公開前提）。RLS で insert しか通らず、生ログは誰も読めない。 */
var SB = {
  url: 'https://mqthgpyeakqdzjfkhxzx.supabase.co',
  key: 'sb_publishable_J9I23hktgFkgb736aDMYGg_tMJxqjW7'  /* 公開前提のキー。RLS で insert しか通らない */
};
function sbOn(){ return !!(SB.url && SB.key); }

function clientId(){
  var id = lsGet('gentuki.cid');
  if (!id){
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
       : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
           var r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16);
         });
    lsSet('gentuki.cid', id);
  }
  return id;
}
function sbHeaders(extra){
  var h = {apikey:SB.key, Authorization:'Bearer '+SB.key, 'Content-Type':'application/json'};
  if (extra) for (var k in extra) h[k]=extra[k];
  return h;
}

/* 書き込みは追記のみ（更新も削除も許していない）。押し直しは新しい行を積み、
   集計ビューが (地点, 端末) ごとの最新だけを数える。
   走行中は普通に圏外になる。送れなかった分は溜めて、繋がった時にまとめて送る。
   失敗しても画面には出さない（記録自体は端末に残っているので実害がない）。 */
function outbox(){ try { return JSON.parse(lsGet('gentuki.outbox')||'[]'); } catch(e){ return []; } }
function outboxSet(a){ lsSet('gentuki.outbox', JSON.stringify(a.slice(-200))); }

var sbBusy=false;
function sbFlush(){
  if (!sbOn() || sbBusy || !navigator.onLine) return;
  var rows = outbox();
  if (!rows.length) return;
  sbBusy = true;
  fetch(SB.url+'/rest/v1/spot_reports', {
    method:'POST',
    headers: sbHeaders({Prefer:'return=minimal'}),
    body: JSON.stringify(rows)
  }).then(function(r){
    if (r.ok) outboxSet(outbox().slice(rows.length));  /* 送信中に足された分は残す */
  }).catch(function(){}).then(function(){ sbBusy=false; });
}
window.addEventListener('online', sbFlush);

/* 集計の取得。同じ地点を何度も開くのでセッション中はメモリに置く。 */
var countCache = {};
function sbCounts(uk, cb){
  if (!sbOn() || !uk) return;
  if (countCache[uk]) { cb(countCache[uk]); return; }
  fetch(SB.url+'/rest/v1/spot_report_counts?select=ok_count,ng_count&uk=eq.'+encodeURIComponent(uk),
        {headers: sbHeaders()})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){
      if (!j) return;
      var c = j[0] || {ok_count:0, ng_count:0};
      countCache[uk]=c; cb(c);
    }).catch(function(){});
}

/* ==================== 現地確認のフィードバック ====================
   データが実際の交差点と合っているかは現地でしか分からない。走った人の記録を貯める。 */
function reportsAll(){
  try { return JSON.parse(lsGet('gentuki.reports')||'{}'); } catch(e){ return {}; }
}
function reportSet(uk, v, meta){
  var all=reportsAll();
  all[uk]={v:v, t:new Date().toISOString(), lanes:(meta&&meta.lanes)||null,
           road:(meta&&meta.road)||'', city:(meta&&meta.city)||''};
  lsSet('gentuki.reports', JSON.stringify(all));
  updateReportCount();
  var q=outbox();
  q.push({uk:uk, verdict:v, lanes:(meta&&meta.lanes)||null,
          road:(meta&&meta.road)||'', city:(meta&&meta.city)||'',
          client_id:clientId()});
  outboxSet(q);
  delete countCache[uk];          /* 自分の1件が増えるので取り直す */
  sbFlush();
}
function updateReportCount(){
  var n=Object.keys(reportsAll()).length, el=$('#repCount');
  if (el) el.textContent = n ? (n+' 件の確認を記録しています') : 'まだ記録はありません';
  var b=$('#repShare'); if (b) b.hidden = !n;
}
function renderFeedback(p){
  var box=$('#fb');
  if (!p || p.layer!=='two_stage_likely' || !p.uk){ box.hidden=true; return; }
  box.hidden=false;
  var cur=reportsAll()[p.uk];
  box.dataset.uk=p.uk;
  box.dataset.meta=JSON.stringify({lanes:p.lanes, road:p.road, city:p.city});
  $('#fbYes').setAttribute('aria-pressed', String(cur && cur.v==='ok'));
  $('#fbNo').setAttribute('aria-pressed', String(cur && cur.v==='ng'));
  var base = cur
    ? (cur.v==='ok' ? '「実際に二段階右折だった」と記録済み' : '「違った」と記録済み')
    : '現地を見た人だけが分かる部分です。走ったあとで教えてください。';
  $('#fbNote').textContent = base;
  sbCounts(p.uk, function(c){
    if (box.dataset.uk !== p.uk) return;   /* 待っている間に別の地点へ移っていたら捨てる */
    var ok=c.ok_count||0, ng=c.ng_count||0;
    if (!(ok+ng)) return;
    $('#fbNote').textContent = base + '  ／ 現地報告 合ってた ' + ok + '・違った ' + ng;
  });
}
function bindFb(id, v){
  $(id).addEventListener('click', function(){
    var box=$('#fb'); if (!box.dataset.uk) return;
    var meta={}; try{ meta=JSON.parse(box.dataset.meta||'{}'); }catch(e){}
    reportSet(box.dataset.uk, v, meta);
    renderFeedback({layer:'two_stage_likely', uk:box.dataset.uk, lanes:meta.lanes,
                    road:meta.road, city:meta.city});
    toast(v==='ok'?'ありがとうございます。記録しました':'記録しました。次の更新で見直します',3000);
  });
}
bindFb('#fbYes','ok'); bindFb('#fbNo','ng');

/* 記録をまとめてコピー（友達の端末からでも渡せるように） */
$('#repShare').addEventListener('click', function(){
  var all=reportsAll(), lines=['げんつきマップ 現地確認の記録'];
  Object.keys(all).forEach(function(k){
    var r=all[k];
    lines.push([k, r.v, r.lanes||'', r.road||'', r.city||'', r.t].join('\t'));
  });
  var txt=lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast('記録をコピーしました。そのまま送ってください',4000); })
      .catch(function(){ prompt('この内容をコピーして送ってください', txt); });
  } else prompt('この内容をコピーして送ってください', txt);
});

/* ナビ中：地点を通り過ぎたら「合ってた？」を出し、さらに進んだら引っ込める */
var passCard=null, passTimer=null;
function checkPassed(alongM){
  var r=nav.r; if(!r||!r.need) return;
  for (var i=0;i<r.need.length;i++){
    var n=r.need[i];
    var at=nav.manAt[n.mi];
    if (at==null) continue;
    var d=alongM-at;
    if (d>25 && d<160){                 // 通過直後だけ出す
      if (passCard!==n.pt.i){
        passCard=n.pt.i;
        $('#passUk').value=n.pt.p.uk||'';
        $('#passCard').hidden=false;
        clearTimeout(passTimer);
        passTimer=setTimeout(function(){ $('#passCard').hidden=true; }, 20000);
      }
      return;
    }
  }
  if (passCard!=null){ passCard=null; $('#passCard').hidden=true; }
}
$('#passYes').addEventListener('click',function(){ passAnswer('ok'); });
$('#passClose').addEventListener('click',function(){ $('#passCard').hidden=true; passCard=-1; });
$('#passNo').addEventListener('click',function(){ passAnswer('ng'); });
function passAnswer(v){
  var uk=$('#passUk').value;
  if (uk) reportSet(uk, v, {});
  $('#passCard').hidden=true; passCard=-1; clearTimeout(passTimer);
  if (navigator.vibrate) navigator.vibrate(40);
}

/* ==================== ナビゲーション（ターンバイターン） ==================== */
/* Valhalla の maneuver.type。日本は左側通行なので、交差する側＝右折 */
var MTYPE_RIGHT={9:1,10:1,11:1}, MTYPE_LEFT={14:1,15:1,16:1};
var MICON={1:'↑',2:'↑',3:'↑',4:'◉',5:'◉',6:'◉',7:'↑',8:'↑',
  9:'↗',10:'↱',11:'⤳',12:'⤺',13:'⤻',14:'⤾',15:'↰',16:'↖',
  17:'↑',18:'↗',19:'↖',20:'↗',21:'↖',22:'↑',23:'↗',24:'↖',
  25:'⤭',26:'⟳',27:'⟳',37:'⤭',38:'⤭'};

var nav = { on:false, r:null, cum:[], manAt:[], step:0, said:{}, banSaid:{}, off:0,
            lastReroute:0, wakeLock:null, follow:true };

/* 現在地から一定距離以内にある原付通行禁止区間を探す */
function nearestBan(c, rad){
  var kx=Math.floor(c[0]/GSTEP), ky=Math.floor(c[1]/GSTEP), best=null;
  for (var i=-1;i<=1;i++) for (var j=-1;j<=1;j++){
    var segs=banGrid[(kx+i)+'|'+(ky+j)]; if(!segs) continue;
    for (var n=0;n<segs.length;n++){
      var d=distToSeg(c, segs[n].a, segs[n].b);
      if (d<=rad && (!best || d<best.d))
        best={d:d, p:segs[n].p, id:(segs[n].p.uk||segs[n].p.title)};
    }
  }
  return best;
}

function navDistText(m){
  if (m>=1000) return (Math.round(m/100)/10)+' km';
  if (m>=300)  return (Math.round(m/50)*50)+' m';
  if (m>=100)  return (Math.round(m/10)*10)+' m';
  if (m>=30)   return (Math.round(m/10)*10)+' m';
  return 'まもなく';
}
function cumulative(shape){
  var c=[0];
  for (var i=1;i<shape.length;i++) c.push(c[i-1]+meters(shape[i-1],shape[i]));
  return c;
}
/* 現在地をルートに投影し、進行距離・残距離・次の案内までの距離を返す */
function project(r, pt){
  var best=null, from=Math.max(0, nav.step>0 ? nav.lastIdx-40 : 0);
  var to=Math.min(r.shape.length-1, (nav.lastIdx||0)+200);
  if (nav.lastIdx==null){ from=0; to=r.shape.length-1; }
  for (var i=from;i<to;i++){
    var d=distToSeg(pt, r.shape[i], r.shape[i+1]);
    if (!best || d<best.d) best={d:d,i:i};
  }
  if (!best) return null;
  nav.lastIdx=best.i;
  var along = nav.cum[best.i] + meters(r.shape[best.i], pt);
  return { dist:best.d, idx:best.i, along:Math.min(along, nav.cum[nav.cum.length-1]) };
}

function startNav(){
  var r = showingAlt? altData : routeData;
  if (!r) return;
  if (!me){ toast('先に現在地をオンにしてください',4000); startLocate(function(){ startNav(); }); return; }
  nav.on=true; nav.r=r; nav.said={}; nav.banSaid={}; nav.off=0; nav.lastIdx=null; nav.follow=true;
  /* 最初の案内は「出発」なので、表示は最初の曲がり角から始める */
  nav.step = (r.maneuvers[0] && r.maneuvers[0].type<=3 && r.maneuvers.length>1) ? 1 : 0;
  nav.cum = cumulative(r.shape);
  nav.manAt = r.maneuvers.map(function(m){
    var i=Math.min(m.shapeIndex!=null?m.shapeIndex:0, nav.cum.length-1);
    return nav.cum[i];
  });
  document.body.dataset.nav='1';
  $('#navBand').hidden=false; $('#navBar').hidden=false; $('#navRecenter').hidden=true;
  syncNavHeight();                      // 表示してから測る（隠れている間は 0 になる）
  $('#route').hidden=true; $('#sheet').hidden=true;
  nav.userBearing=false;
  acquireWakeLock();
  if (!voiceOn) $('#voiceBtn').click();      // 案内は音声が主役なので自動でオンにする
  renderNav(nav.step, r.km*1000, nav.manAt[nav.step]||0);
  say('案内を開始します。' + (r.need.length? ('この先、二段階右折が'+r.need.length+'か所あります。') : ''));
}
function stopNav(){
  nav.on=false; nav.r=null; nav.follow=true;
  document.body.dataset.nav='';
  $('#navBand').hidden=true; $('#navBar').hidden=true; $('#navRecenter').hidden=true;
  syncNavHeight();

  releaseWakeLock();
  try{ speechSynthesis.cancel(); }catch(e){}
  map.easeTo({pitch:0, bearing:0, duration:600});
  if (routeData) $('#route').hidden=false;
}

function navUpdate(pos){
  if (!nav.on || !nav.r) return;
  var r=nav.r, c=[pos.coords.longitude,pos.coords.latitude];
  var acc=pos.coords.accuracy||0, sp=pos.coords.speed||0;
  var p=project(r, c);
  if (!p) return;

  /* --- 逸脱判定：GPS精度を閾値に足す。固定値だと市街地で誤検知が止まらない --- */
  var thr = 45 + Math.min(acc, 40);
  if (p.dist > thr){
    nav.off++;
    if (nav.off>=3 && Date.now()-nav.lastReroute > 12000){
      nav.off=0; nav.lastReroute=Date.now();
      toast('ルートを再検索しています…',0);
      var hd = (lastHeading!=null)? Math.round(lastHeading) : null;
      valhalla(c, dest, null, hd).then(function(nr){
        nav.r = routeData = analyse(nr);
        nav.cum = cumulative(nr.shape);
        nav.manAt = nr.maneuvers.map(function(m){
          return nav.cum[Math.min(m.shapeIndex!=null?m.shapeIndex:0, nav.cum.length-1)]; });
        nav.step=0; nav.said={}; nav.lastIdx=null;
        drawRoute(nav.r); renderRoute(nav.r,false); $('#route').hidden=true;
        hideToast(); say('ルートを再検索しました。');
      }).catch(function(){ hideToast(); toast('ルートを更新できませんでした',4000); });
    }
  } else nav.off=0;

  /* --- 進行状況 --- */
  var total=nav.cum[nav.cum.length-1];
  while (nav.step < nav.manAt.length-1 &&
         (p.along > nav.manAt[nav.step]+12 || r.maneuvers[nav.step].type<=3)) nav.step++;
  var toMan = Math.max(0, nav.manAt[nav.step]-p.along);
  var remain = Math.max(0, total-p.along);
  renderNav(nav.step, remain, toMan);
  checkPassed(p.along);

  /* --- 音声：300m / 100m / 直前 の3回だけ --- */
  var m=r.maneuvers[nav.step];
  if (m){
    var key=nav.step+':';
    var two=(r.need||[]).filter(function(n){ return n.mi===nav.step; })[0];
    var koma=(r.komaTurn||[]).filter(function(n){ return n.mi===nav.step; })[0];
    var twoIsKoma = two && two.koma!=null;      // 二段階の条件だが小回り標識がある
    if (toMan<=320 && toMan>150 && !nav.said[key+'far']){
      nav.said[key+'far']=1;
      say('およそ'+navDistText(toMan)+'先、'+(m.sayShort||m.text)+
          (twoIsKoma ? '。この交差点は小回り標識があります。'
                     : two ? '。この交差点は二段階右折です。'
                     : koma ? '。この交差点は小回り右折です。' : ''));
    } else if (toMan<=140 && toMan>45 && !nav.said[key+'near']){
      nav.said[key+'near']=1;
      say((two&&!twoIsKoma ? '二段階右折です。' : '')+ (m.say||m.text));
    } else if (toMan<=45 && !nav.said[key+'now']){
      nav.said[key+'now']=1;
      if (twoIsKoma || koma)
        say('ここは小回り右折です。二段階右折はしないで、右折レーンから曲がってください。');
      else if (two)
        say('ここで二段階右折。左端を直進して、向きを変えて待ってください。');
      else say('まもなくです。');
    }
  }

  /* --- 原付通行禁止への接近（ナビ中は通常のアラートを隠しているので専用に出す） --- */
  var ban=nearestBan(c, 150);
  var bEl=$('#navBan');
  if (ban){
    bEl.hidden=false;
    bEl.textContent = '⚠ ' + ban.p.title + (ban.p.always?'':('（'+(ban.p.time||ban.p.cond||'時間限定')+'）')) +
                      ' まで約' + (Math.round(ban.d/10)*10) + 'm';
    if (!nav.banSaid[ban.id] && ban.d<110 && ban.d>35){
      nav.banSaid[ban.id]=1;
      say('この先およそ'+(Math.round(ban.d/10)*10)+'メートルに、'+
          (ban.p.always?'原付が通行できない区間':'時間帯によって原付が通行できない区間')+'があります。標識を確認してください。');
    }
  } else bEl.hidden=true;

  /* --- カメラ追従 --- */
  if (nav.follow){
    var z = sp>11 ? 16.5 : sp>5.5 ? 17.0 : 17.5;
    var b = nav.userBearing ? map.getBearing() : headingNow(sp);
    map.easeTo({ center:c, bearing:b, pitch:(nav.userPitch!=null?nav.userPitch:60), zoom:z,
      padding:{top:0,bottom:Math.round(map.getContainer().clientHeight*0.5),left:0,right:0},
      duration:900, easing:function(t){return t;}, essential:true });
  }
}
function renderNav(step, remainM, toManM){
  /* 残りの二段階右折と、次の次の案内を出す */
  (function(){
    var r=nav.r; if(!r) return;
    var left=(r.need||[]).filter(function(n){ return n.mi>=step; }).length;
    var lb=$('#navLeft');
    if (lb) lb.textContent = left ? ('この先 二段階右折 '+left+'か所') : '二段階右折はもうありません';
    var nx=r.maneuvers[step+1], ne=$('#navNext');
    if (ne) ne.textContent = nx ? ('つぎに　'+cleanSay(nx.text||'').replace(/。$/,'')) : '';
  })();
  var r=nav.r; if(!r) return;
  var m=r.maneuvers[step]||{};
  if (m.type<=3 && r.maneuvers[step+1]){ step=step+1; m=r.maneuvers[step]; }  // 「出発」は表示しない
  var two=(r.need||[]).filter(function(n){ return n.mi===step; })[0];
  var koma=(r.komaTurn||[]).filter(function(n){ return n.mi===step; })[0];
  var twoIsKoma = two && two.koma!=null;
  $('#navIcon').textContent = (two&&!twoIsKoma)? '↱' : (MICON[m.type]||'↑');
  $('#navDist').textContent = navDistText(toManM);
  $('#navText').textContent = cleanSay(m.text||'').replace(/^つぎに、/,'');
  var mode = (twoIsKoma||koma) ? 'koma' : (two ? '1' : '');
  $('#navBand').dataset.two = mode;
  $('#navTwo').hidden = !mode;
  if (mode==='koma') $('#navTwo').textContent='小回り標識あり — 二段階右折はしない。右折レーンから曲がる';
  else if (mode==='1') $('#navTwo').textContent='この交差点は二段階右折 — 左端を直進して向きを変える';
  var min = Math.max(1, Math.round(remainM/1000 / 25 * 60));   // 実効25km/h
  var eta = new Date(Date.now()+min*60000);
  $('#navEta').textContent = ('0'+eta.getHours()).slice(-2)+':'+('0'+eta.getMinutes()).slice(-2);
  $('#navMin').textContent = min+'分';
  $('#navRemain').textContent = (remainM>=1000? (Math.round(remainM/100)/10)+' km' : Math.round(remainM)+' m');
}

/* 画面を消させない（Webでは画面ロック中に位置取得自体が止まるため、これが唯一の手段） */
function acquireWakeLock(){
  if (!('wakeLock' in navigator)) return;
  navigator.wakeLock.request('screen').then(function(w){
    nav.wakeLock=w;
    w.addEventListener('release',function(){ nav.wakeLock=null; });
  }).catch(function(){});
}
function releaseWakeLock(){ try{ nav.wakeLock && nav.wakeLock.release(); }catch(e){} nav.wakeLock=null; }
document.addEventListener('visibilitychange',function(){
  if (nav.on && document.visibilityState==='visible' && !nav.wakeLock) acquireWakeLock();
});

$('#navStart').addEventListener('click', startNav);
$('#navEnd').addEventListener('click', stopNav);
$('#navRecenter').addEventListener('click', function(){
  nav.follow=true; nav.userBearing=false; nav.userPitch=null; this.hidden=true;
});
map.on('dragstart', function(e){
  if (nav.on && e && e.originalEvent){ nav.follow=false; $('#navRecenter').hidden=false; }
});
/* ナビ中に自分で回したら、その向きを尊重する（再センターで戻る） */
map.on('rotatestart', function(e){
  if (nav.on && e && e.originalEvent){ nav.userBearing=true; $('#navRecenter').hidden=false; }
});
map.on('pitchstart', function(e){
  if (nav.on && e && e.originalEvent){ nav.userPitch=map.getPitch(); }
});


/* ==================== 方角と 2D/3D ====================
   進行方向モードでは、止まっているときは GPS の course が当てにならないので
   端末のコンパス（磁気センサー）を使う。走り出したら GPS の進行方向に切り替える。 */
var deviceHeading=null, compassOn=false;
function headingNow(speed){
  if (speed!=null && speed>2 && lastHeading!=null) return lastHeading;  // 走行中はGPSが正確
  if (deviceHeading!=null) return deviceHeading;                        // 停止中はコンパス
  if (lastHeading!=null) return lastHeading;
  return map.getBearing();
}
function onDeviceOrientation(e){
  var h = (e.webkitCompassHeading!=null) ? e.webkitCompassHeading
        : (e.absolute && e.alpha!=null ? (360 - e.alpha) : null);
  if (h!=null && isFinite(h)){ deviceHeading = (h+360)%360; queuePuck(); }
}

/* 青いドットの扇の向き。走っていれば GPS の進行方向、止まっていれば端末のコンパス。
   止まっていると GPS の fix がほとんど来ないので、GPS 側だけで更新してはいけない。
   センサーは秒間数十回飛んでくるので、描画は次のフレームに1回だけまとめる。 */
var puckRaf=0;
function updatePuck(){
  puckRaf=0;
  if (!meMarker) return;
  var el=meMarker.getElement();
  var h = (lastSpeed!=null && lastSpeed>2 && lastHeading!=null) ? lastHeading
        : (deviceHeading!=null ? deviceHeading : lastHeading);
  if (h==null){ el.classList.remove('has-hd'); return; }
  el.style.setProperty('--hd', h.toFixed(1)+'deg');
  el.classList.add('has-hd');
}
function queuePuck(){ if (!puckRaf) puckRaf=requestAnimationFrame(updatePuck); }
function enableCompass(){
  if (compassOn) return;
  compassOn=true;
  var DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission==='function'){
    /* iOS 13以降は許可が要る。必ずタップの中から呼ぶこと */
    DOE.requestPermission().then(function(r){
      if (r==='granted') window.addEventListener('deviceorientation', onDeviceOrientation);
      else toast('端末の方角センサーが使えないため、GPSの進行方向で向きを合わせます',5000);
    }).catch(function(){});
  } else {
    window.addEventListener('deviceorientationabsolute', onDeviceOrientation);
    window.addEventListener('deviceorientation', onDeviceOrientation);
  }
}

/* 北に戻すコンパス。回転か傾きがあるときだけ出す */
function updateCompass(){
  var b=map.getBearing(), p=map.getPitch();
  var el=$('#compass');
  if (!el) return;
  el.hidden = (Math.abs(b)<0.5 && p<1);
  el.querySelector('.cmp-needle').style.transform='rotate('+(-b)+'deg)';
}
map.on('rotate', updateCompass);
map.on('pitch', updateCompass);
$('#compass').addEventListener('click',function(){
  if (nav.on){ nav.userBearing=false; nav.userPitch=null; }
  if (locMode===2) setLocMode(1);
  map.easeTo({bearing:0, pitch:0, duration:500});
});

/* 2D / 3D */
function updatePitchBtn(){
  var b=$('#pitchBtn'); if(!b) return;
  var is3d = map.getPitch() > 20;
  b.dataset.mode = is3d ? '3d' : '2d';
  b.querySelector('span').textContent = is3d ? '3D' : '2D';
}
$('#pitchBtn').addEventListener('click',function(){
  var to = map.getPitch() > 20 ? 0 : 55;
  if (nav.on) nav.userPitch = to;
  map.easeTo({pitch:to, duration:500});
  setTimeout(updatePitchBtn, 520);
});
map.on('pitchend', updatePitchBtn);

/* ---------------- 現在地・近接アラート ---------------- */
var watch=null, meMarker=null, me=null, voiceOn=false, alerted={}, lastHeading=null, lastSpeed=null, lowAccTried=false;
var alertBox=$('#alert');
alertBox.querySelector('.a-close').addEventListener('click',function(){ alertBox.hidden=true; });

/* 現在地ボタンは Google マップと同じ3段階で回す
   0=追従なし / 1=追従（北固定） / 2=追従＋進行方向を上に向ける
   地図をドラッグしたら 0 に戻る（位置の取得自体は止めない） */
var locMode = 0;
function setLocMode(m){
  locMode = m;
  var b=$('#locBtn');
  b.setAttribute('aria-pressed', String(m>0));
  b.dataset.mode = String(m);
  b.querySelector('span').textContent = m===2 ? '進行方向' : (m===1 ? '追従中' : '現在地');
  lsSet('gentuki.locMode', String(m));
  if (m>0 && me) applyFollow(me, lastHeading, lastSpeed);
}
function applyFollow(c, heading, speed){
  if (nav.on || locMode===0) return;
  var z = map.getZoom();
  if (z < 15) z = 16.5;                         // 追従に入ったら自動で寄る
  if (locMode===2 && speed!=null){              // 進行方向モードは速度でズームを可変
    z = speed>11 ? 15.8 : speed>5.5 ? 16.4 : 16.9;
  }
  var opt = { center:c, zoom:z, duration:900, easing:function(t){return t;}, essential:true };
  if (locMode===2) opt.bearing = headingNow(speed);
  if (locMode===1) opt.bearing = 0;
  map.easeTo(opt);
}

function startLocate(cb){
  if(watch!=null){ if(cb) cb(); return; }
  if(!navigator.geolocation){ toast('この端末では現在地を取得できません'); return; }
  if(!window.isSecureContext){ toast('安全な接続（https）でないため現在地を取得できません',8000); return; }
  var first=true;
  function onFix(pos){
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
      if(!dest && locMode===0) map.easeTo({center:me,zoom:Math.max(map.getZoom(),15)});
    } else meMarker.setLngLat(c);
    // 方位：停止中の GPS heading は暴れるので、速度が出ているときだけ採用する
    if (hd!=null && isFinite(hd) && sp>1.5) lastHeading=hd;
    // 精度が悪いときは灰色にして正直に伝える
    meMarker.getElement().classList.toggle('weak', acc>65);
    lastSpeed=sp;
    updatePuck();
    applyFollow(c, lastHeading, sp);
    if(first){ first=false; if(cb) cb(); }
    checkNear();
    navUpdate(pos);
  }
  watch=navigator.geolocation.watchPosition(onFix, function(err){
    watch=null; setLocMode(0);
    var msg;
    if (err.code===1){
      msg='位置情報がブロックされています。Safariなら アドレスバー左の「ぁA」→ Webサイトの設定 →「位置情報」を「許可」に。' +
          'iPhoneは 設定 → プライバシーとセキュリティ → 位置情報サービス → Safari Webサイト も確認してください。';
    } else if (err.code===2){
      msg='現在地を特定できませんでした。屋内や地下だと失敗します。屋外で試してください。';
    } else {
      msg='現在地の取得がタイムアウトしました。もう一度お試しください。';
      // 高精度が取れない端末向けに一段落として再挑戦する
      if (!lowAccTried){
        lowAccTried=true;
        watch=navigator.geolocation.watchPosition(onFix, function(){}, 
          {enableHighAccuracy:false, maximumAge:10000, timeout:30000});
        toast('精度を下げて再取得しています…',4000);
        return;
      }
    }
    toast(msg, 9000);
  }, {enableHighAccuracy:true,maximumAge:3000,timeout:20000});
}
function stopLocate(){
  if(watch!=null) navigator.geolocation.clearWatch(watch);
  watch=null; me=null; alerted={}; lastHeading=null; lastSpeed=null; setLocMode(0);
  if (map.getSource('me')) map.getSource('me').setData({type:'FeatureCollection',features:[]});
  $('#locBtn').setAttribute('aria-pressed','false');
  if(meMarker){ meMarker.remove(); meMarker=null; }
  alertBox.hidden=true;
}
$('#locBtn').addEventListener('click',function(){
  /* iOS は方角センサーの許可をタップの中でしか求められないので、ここで有効化する。
     進行方向モードに入る時だけでは、止まっている間ドットの向きが分からない。 */
  enableCompass();
  if (watch==null){ startLocate(function(){ setLocMode(1); }); setLocMode(1); return; }
  setLocMode(locMode===1 ? 2 : 1);
});
/* 長押しで現在地をオフ */
(function(){
  var t=null, btn=$('#locBtn');
  btn.addEventListener('pointerdown',function(){ t=setTimeout(function(){ stopLocate(); toast('現在地をオフにしました'); },700); });
  ['pointerup','pointerleave','pointercancel'].forEach(function(ev){
    btn.addEventListener(ev,function(){ clearTimeout(t); });
  });
})();
/* 地図を触ったら追従を解除（Googleマップと同じ） */
map.on('dragstart',function(e){
  if(!nav.on && locMode>0 && e && e.originalEvent) setLocMode(0);
});
map.on('rotatestart',function(e){
  if(!nav.on && locMode===2 && e && e.originalEvent) setLocMode(1);
});

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
    (best.q.p.lanes?('片側'+best.q.p.lanes+'車線・信号交差点'):'')+
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
/* Valhalla の日本語文は「山手幹線, Yamate Trunk Roadです」のようにローマ字が併記され、
   句点が重なることがある。読み上げ用に整える。 */
function cleanSay(t){
  return String(t||'')
    .replace(/,\s*[A-Za-z][A-Za-z0-9 .'\-]*/g,'')   // 併記されたローマ字名を落とす
    .replace(/。。+/g,'。')
    .replace(/です。その先/g,'です。つぎに、')
    .replace(/\/[A-Za-z][A-Za-z0-9 .'\u2019\-]*/g,'')   // 「/Yamate Trunk Road」のような
                                                      // ローマ字の併記だけを削る（日本語は残す）
    .replace(/\s{2,}/g,' ')
    .trim();
}
function say(text){
  text = cleanSay(text);
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

/* すでに位置情報を許可している端末では、開いた時点で自動的に追従を始める。
   許可ダイアログは出さない（未許可ならボタンを押したときだけ出る） */
(function autoLocate(){
  if (!navigator.permissions || !navigator.permissions.query) return;
  var q;
  try { q = navigator.permissions.query({name:'geolocation'}); } catch(e){ return; }
  if (!q || !q.then) return;
  q.then(function(st){
    if (st.state!=='granted') return;
    var m = parseInt(lsGet('gentuki.locMode')||'1',10);
    startLocate(function(){ setLocMode(m>0?m:1); });
  }).catch(function(){});
})();
document.body.dataset.theme=theme;
$('#themeBtn').setAttribute('aria-pressed',String(theme==='night'));
window.addEventListener('error', function(ev){
  var el=document.getElementById('crash');
  if (!el) return;
  el.textContent='エラー: '+(ev.message||'')+' @'+((ev.filename||'').split('/').pop())+':'+(ev.lineno||'');
  el.hidden=false;
});
window.addEventListener('unhandledrejection', function(ev){
  var el=document.getElementById('crash');
  if (!el) return;
  el.textContent='エラー(非同期): '+((ev.reason&&(ev.reason.message||ev.reason))||'');
  el.hidden=false;
});
/* iOS Safari の下部ツールバーに隠れないよう、実際の可視領域から下余白を算出する。
   これをやらないと「終了ボタンが無い」ように見える。 */
function syncSafeBottom(){
  var vv=window.visualViewport;
  var gap = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  document.documentElement.style.setProperty('--vvb', gap+'px');
}
if (window.visualViewport){
  ['resize','scroll'].forEach(function(ev){ window.visualViewport.addEventListener(ev, syncSafeBottom); });
}
window.addEventListener('orientationchange', function(){ setTimeout(syncSafeBottom,300); });
syncSafeBottom();

/* ナビ中の下バーの高さを測って CSS に渡す。右下のボタンをその分だけ持ち上げる。
   残り距離の桁が増えたり、狭い画面で折り返したりで高さが変わるので実測する。 */
function syncNavHeight(){
  var el=$('#navBar');
  var h = (el && !el.hidden && document.body.dataset.nav==='1') ? el.offsetHeight : 0;
  document.documentElement.style.setProperty('--navh', h+'px');
}
if (window.ResizeObserver){
  new ResizeObserver(syncNavHeight).observe($('#navBar'));
} else {
  window.addEventListener('resize', syncNavHeight);
}
syncNavHeight();

updateCompass(); updatePitchBtn();
makeDraggable($('#sheet'));
makeDraggable($('#route'));
toast('規制データを読み込み中…',0);

/* 前回オフラインで送れなかった報告を、起動時に送る */
sbFlush();
