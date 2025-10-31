/* ========= 基本ストレージ ========= */
const DB_NAME='nameboard-db', STORE='projects', KEY='default';
function openDB(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });}
async function putData(value){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(value,KEY); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });}
async function getData(){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const q=tx.objectStore(STORE).get(KEY); q.onsuccess=()=>res(q.result||null); q.onerror=()=>rej(q.error); });}

/* ========= 要素参照 ========= */
const pagesRoot = document.getElementById('pages');
const btnPointer = document.getElementById('modePointer');
const btnText    = document.getElementById('modeText');
const btnPanel   = document.getElementById('modePanel');

const btnAddBefore = document.getElementById('addPageBefore');
const btnAddAfter  = document.getElementById('addPageAfter');
const btnDelPage   = document.getElementById('delPage');

const fontSnap = document.getElementById('fontSnap');
const bubbleGroup = document.getElementById('bubbleGroup');
const bubbleBtns = [...document.querySelectorAll('.bubbleBtn')];

const btnExportText = document.getElementById('exportText');
const btnImportText = document.getElementById('importText');
const btnExportPNG  = document.getElementById('exportPNG');

/* ========= 状態 ========= */
let saveTimer=null;
let currentPage=null;
let currentTextbox=null;

const SIZE_PRESETS = [12,14,16,18,20,24,28,32,36,40]; // 段階サイズ
let defaultFontSize = SIZE_PRESETS[Number(fontSnap.value)||4];

let mode = 'pointer'; // 'pointer' | 'text' | 'panel'
function setMode(m){
  mode=m;
  [btnPointer,btnText,btnPanel].forEach(b=>b.classList.remove('mode-on'));
  if(m==='pointer') btnPointer.classList.add('mode-on');
  if(m==='text')    btnText.classList.add('mode-on');
  if(m==='panel')   btnPanel.classList.add('mode-on');
}
setMode('pointer');

btnPointer.onclick = ()=> setMode('pointer');
btnText.onclick    = ()=> setMode(mode==='text'?'pointer':'text');
btnPanel.onclick   = ()=> setMode(mode==='panel'?'pointer':'panel');

fontSnap.oninput = ()=>{
  const idx = Number(fontSnap.value)||0;
  const snapped = SIZE_PRESETS[idx];
  if(currentTextbox){
    currentTextbox.style.setProperty('--fs', snapped+'px');
    currentTextbox.querySelector('.content').style.fontSize = snapped+'px';
    scheduleSave();
  }else{
    defaultFontSize = snapped;
  }
};

/* ========= ページ生成 ========= */
function scheduleSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>putData(serialize()),350); }

function makeSVG(w,h){ const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('width',w); svg.setAttribute('height',h); svg.setAttribute('viewBox',`0 0 ${w} ${h}`); return svg; }

function newPage(data){
  const wrap = document.createElement('div'); wrap.className='page-wrap';
  const page = document.createElement('div'); page.className='page';
  wrap.appendChild(page);
  const panelLayer = document.createElement('div'); panelLayer.className='panel-layer'; panelLayer.appendChild(makeSVG(100,100));
  const lineLayer  = document.createElement('div'); lineLayer.className='line-layer';  lineLayer.appendChild(makeSVG(100,100));
  const preview    = document.createElement('div'); preview.className='panel-preview'; preview.innerHTML='<svg></svg>';
  page.append(panelLayer,lineLayer,preview);
  pagesRoot.appendChild(wrap);

  // ページ状態
  const state = {
    el: page,
    panels: [],    // {id, poly:[[x,y],...]}
    splits: [],    // {id, panelId, x,y, angle, snapped, gw}
    tboxes: []     // 管理用
  };
  page._state = state;

  // 初期パネル＝ページ全面
  const wpx = page.clientWidth, hpx = page.clientHeight;
  state.panels = [{ id: genId(), poly:[[0,0],[wpx,0],[wpx,hpx],[0,hpx]] }];

  // イベント（選択）
  page.addEventListener('pointerdown', (e)=>{
    setCurrentPage(page);
    if(mode==='text' && e.target===page){
      // 文字追加
      const r = page.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const tb = addTextbox(page, {x,y});
      focusTextbox(tb);
      scheduleSave();
      e.preventDefault();
    }
  });

  // パネル分割操作
  setupPanelSplitInteraction(page);

  // 復元
  if(data){
    if(data.panels) state.panels = data.panels;
    if(data.splits) state.splits = data.splits;
    renderPanels(page);
    (data.texts||[]).forEach(t=> addTextbox(page, t));
  }else{
    renderPanels(page);
  }

  setCurrentPage(page);
  scheduleSave();
  return page;
}

function setCurrentPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('current'));
  currentPage = page;
  if(page) page.classList.add('current');
  selectTextbox(null);
}

btnAddBefore.onclick = ()=>{
  const ref = currentPage?.parentElement || pagesRoot.firstElementChild;
  const p = newPage();
  pagesRoot.insertBefore(p.parentElement, ref);
  setCurrentPage(p);
};
btnAddAfter.onclick = ()=>{
  const ref = currentPage?.parentElement || pagesRoot.lastElementChild;
  const p = newPage();
  if(ref && ref.nextSibling) pagesRoot.insertBefore(p.parentElement, ref.nextSibling);
  else pagesRoot.appendChild(p.parentElement);
  setCurrentPage(p);
};
btnDelPage.onclick = ()=>{
  if(!currentPage) return;
  const nxt = currentPage.parentElement.nextElementSibling?.firstElementChild || currentPage.parentElement.previousElementSibling?.firstElementChild;
  currentPage.parentElement.remove();
  setCurrentPage(nxt||null);
  scheduleSave();
};

/* ========= IDユーティリティ ========= */
function genId(){ return Math.random().toString(36).slice(2,9); }

/* ========= 幾何ユーティリティ ========= */
function centroid(poly){ let a=0,cx=0,cy=0; for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const p=poly[i], q=poly[j]; const f = p[0]*q[1]-q[0]*p[1]; a+=f; cx+=(p[0]+q[0])*f; cy+=(p[1]+q[1])*f;
} a*=0.5; if(!a) return [ (poly[0][0]+poly[2][0])/2, (poly[0][1]+poly[2][1])/2 ]; return [cx/(6*a), cy/(6*a)]; }

function splitPolygonByLine(poly, x0,y0, angle){
  // 線：点(x0,y0)、方向ベクトル v=(cos,sin)
  const vx=Math.cos(angle), vy=Math.sin(angle);
  const side = (x,y)=> (x-x0)*vy - (y-y0)*vx; // 左が正
  const left=[], right=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length];
    const sa=side(a[0],a[1]), sb=side(b[0],b[1]);
    if(sa>=0) left.push(a); else right.push(a);
    if((sa>=0 && sb<0)||(sa<0 && sb>=0)){
      // 交点
      const t = sa/(sa - sb);
      const ix = a[0] + t*(b[0]-a[0]);
      const iy = a[1] + t*(b[1]-a[1]);
      left.push([ix,iy]); right.push([ix,iy]);
    }
  }
  if(left.length<3 || right.length<3) return null;
  return {left, right};
}

/* ========= パネル（コマ）描画 ========= */
function renderPanels(page){
  const st = page._state;
  const w = page.clientWidth, h=page.clientHeight;
  const svgP = page.querySelector('.panel-layer svg'); svgP.setAttribute('viewBox',`0 0 ${w} ${h}`);
  const svgL = page.querySelector('.line-layer svg');  svgL.setAttribute('viewBox',`0 0 ${w} ${h}`);
  svgP.innerHTML=''; svgL.innerHTML='';

  // ベース：白背景は.page自体でOK
  // 1) 白帯（ホワイトライン）+ 2本黒線（splitごと、対象パネルをクリップ）
  for(const s of st.splits){
    const panel = st.panels.find(p=>p.id===s.panelId);
    if(!panel) continue;
    // クリップ
    const clipId = 'clip_'+s.panelId+'_'+s.id;
    const clip = document.createElementNS('http://www.w3.org/2000/svg','clipPath');
    clip.setAttribute('id', clipId);
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points', panel.poly.map(p=>p.join(',')).join(' '));
    clip.appendChild(poly);
    svgL.appendChild(clip);

    // 線の端点（パネル外周まで伸ばす）
    // 十分長い直線を描いてクリップで切る
    const len = Math.hypot(w,h)*2;
    const x1 = s.x - Math.cos(s.angle)*len/2;
    const y1 = s.y - Math.sin(s.angle)*len/2;
    const x2 = s.x + Math.cos(s.angle)*len/2;
    const y2 = s.y + Math.sin(s.angle)*len/2;

    // 白帯（太い白ストローク）
    const white = document.createElementNS('http://www.w3.org/2000/svg','line');
    white.setAttribute('x1',x1); white.setAttribute('y1',y1);
    white.setAttribute('x2',x2); white.setAttribute('y2',y2);
    white.setAttribute('stroke','#ffffff');
    white.setAttribute('stroke-width', s.gw);
    white.setAttribute('clip-path', `url(#${clipId})`);
    white.setAttribute('stroke-linecap','butt');
    svgL.appendChild(white);

    // 二本の黒線：白帯の法線方向に±(gw/2)だけ並行移動させる
    const nx = -Math.sin(s.angle), ny =  Math.cos(s.angle);
    const off = s.gw/2;
    const lines = [-off, +off].map(d=>{
      const l = document.createElementNS('http://www.w3.org/2000/svg','line');
      l.setAttribute('x1', x1 + nx*d); l.setAttribute('y1', y1 + ny*d);
      l.setAttribute('x2', x2 + nx*d); l.setAttribute('y2', y2 + ny*d);
      l.setAttribute('stroke','#000'); l.setAttribute('stroke-width', getStrokeB());
      l.setAttribute('clip-path', `url(#${clipId})`);
      l.setAttribute('stroke-linecap','butt');
      return l;
    });
    lines.forEach(l=>svgL.appendChild(l));
  }

  // 2) パネル枠（外周を黒でなぞる）—ページの見栄えを安定させる
  for(const p of st.panels){
    const path = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    path.setAttribute('points', p.poly.map(pt=>pt.join(',')).join(' '));
    path.setAttribute('fill','none');
    path.setAttribute('stroke','#000');
    path.setAttribute('stroke-width', getStrokeB());
    svgP.appendChild(path);
  }
}

function getStrokeB(){ return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stroke-b'))||2; }
function getGutterH(){ return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gutter-h'))||12; }
function getGutterV(){ return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gutter-v'))||6; }

/* ========= 角度スナップ＆白溝幅補間 ========= */
function snapAngle(rad){
  let deg = (rad*180/Math.PI)%180; if(deg<0) deg+=180;
  let snapped=false;
  if(deg<=15 || deg>=165){ deg=0; snapped=true; }
  else if(deg>=85 && deg<=105){ deg=90; snapped=true; }
  return {deg, snapped};
}
function gutterWidthFromAngle(rad){
  let deg = (rad*180/Math.PI)%180; if(deg<0) deg+=180;
  // 最近の軸：0 or 90
  const d0 = Math.min(Math.abs(deg-0), Math.abs(deg-180));
  const d90= Math.abs(deg-90);
  const toward0 = d0<=d90;
  const a = (toward0? d0 : d90); // 0..90
  const aClamped = Math.min(a,45); // 0..45 へ圧縮
  const t = aClamped/45;
  const Gh = getGutterH(), Gv=getGutterV();
  const Gedge = toward0? Gh : Gv;
  const Gdiag = Math.sqrt(Gh*Gv); // 幾何平均
  const g = (1-t)*Gedge + t*Gdiag;
  return g;
}

/* ========= パネル分割インタラクション ========= */
function setupPanelSplitInteraction(page){
  const previewSVG = page.querySelector('.panel-preview svg');
  let dragging=false, startX=0, startY=0, angle=0;

  page.addEventListener('pointerdown', (e)=>{
    if(mode!=='panel' || e.target!==page) return;
    setCurrentPage(page);
    const r = page.getBoundingClientRect();
    startX = e.clientX - r.left; startY = e.clientY - r.top;
    dragging=true;
    previewSVG.innerHTML='';
    const ln = document.createElementNS('http://www.w3.org/2000/svg','line');
    ln.setAttribute('x1',startX); ln.setAttribute('y1',startY);
    ln.setAttribute('x2',startX+1); ln.setAttribute('y2',startY);
    previewSVG.appendChild(ln);
    page.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  page.addEventListener('pointermove', (e)=>{
    if(!dragging) return;
    const r = page.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    angle = Math.atan2(y-startY, x-startX);
    const s = snapAngle(angle);
    const useDeg = s.snapped ? s.deg : ((angle*180/Math.PI)%180+180)%180;
    const len = Math.hypot(page.clientWidth,page.clientHeight);
    const rad = (useDeg*Math.PI/180);
    const x1 = startX - Math.cos(rad)*len/2;
    const y1 = startY - Math.sin(rad)*len/2;
    const x2 = startX + Math.cos(rad)*len/2;
    const y2 = startY + Math.sin(rad)*len/2;
    const ln = previewSVG.querySelector('line');
    ln.setAttribute('x1',x1); ln.setAttribute('y1',y1);
    ln.setAttribute('x2',x2); ln.setAttribute('y2',y2);
  });
  page.addEventListener('pointerup', (e)=>{
    if(!dragging) return;
    dragging=false; previewSVG.innerHTML='';
    // 確定：この位置が含まれる「分割対象パネル」を見つける
    const st = page._state;
    const p = pickPanelAt(st, startX, startY);
    if(!p) return;
    const s = snapAngle(angle);
    const rad = (s.snapped ? s.deg : ((angle*180/Math.PI)%180)) * Math.PI/180;
    const split = splitPolygonByLine(p.poly, startX, startY, rad);
    if(!split) return;

    // パネル置換
    const idx = st.panels.findIndex(pp=>pp.id===p.id);
    const leftId=genId(), rightId=genId();
    st.panels.splice(idx,1,
      {id:leftId,  poly:split.left},
      {id:rightId, poly:split.right}
    );

    // 分割線登録（描画は対象パネルでクリップ）
    const gw = gutterWidthFromAngle(rad);
    st.splits.push({ id: genId(), panelId:p.id, x:startX, y:startY, angle:rad, gw, snapped:s.snapped });

    renderPanels(page);
    scheduleSave();
  });

  // 分割線の削除：再タップでポップ（簡易：近傍クリック）
  page.addEventListener('pointerup', (e)=>{
    if(mode!=='panel') return;
    const st = page._state;
    const r = page.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // 近い分割線を当たり判定
    const hit = hitSplitAt(st, x,y, 8);
    if(hit){
      if(confirm('この分割線を削除しますか？')){
        // 線が割っていた元パネルID = hit.panelId
        // ここでは簡易に：線を削除し、全パネルを初期から再構築
        // （正確にはBSP再構成。簡易版でも視覚は同等）
        st.splits = st.splits.filter(s=>s.id!==hit.id);
        // 初期に戻して、残りのsplitsを順に適用
        const wpx = page.clientWidth, hpx=page.clientHeight;
        st.panels = [{ id: genId(), poly:[[0,0],[wpx,0],[wpx,hpx],[0,hpx]] }];
        const old = [...st.splits];
        st.splits = [];
        for(const s of old){
          const p = pickPanelAtRaw(st, s.x, s.y); if(!p) continue;
          const sp = splitPolygonByLine(p.poly, s.x,s.y, s.angle); if(!sp) continue;
          const idx = st.panels.findIndex(pp=>pp.id===p.id);
          st.panels.splice(idx,1,
            {id:genId(), poly:sp.left},
            {id:genId(), poly:sp.right}
          );
          st.splits.push(s);
        }
        renderPanels(page);
        scheduleSave();
      }
    }
  });
}

function pickPanelAt(state, x,y){
  // ポリゴン内判定（射線法）
  for(const p of state.panels){
    if(pointInPoly(p.poly, x,y)) return p;
  }
  return null;
}
function pickPanelAtRaw(state,x,y){ return pickPanelAt(state,x,y); }
function pointInPoly(poly, x,y){
  let c=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i], b=poly[j];
    if( ((a[1]>y)!==(b[1]>y)) && (x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1]) + a[0]) ) c=!c;
  }
  return c;
}
function hitSplitAt(state, x,y, tol){
  // 直線距離が tol 以内のsplitを返す（パネル内クリップは無視）
  let best=null, bestD=1e9;
  for(const s of state.splits){
    // 線分は画面対角長で十分
    const len=Math.hypot(currentPage.clientWidth,currentPage.clientHeight)*2;
    const x1=s.x-Math.cos(s.angle)*len/2, y1=s.y-Math.sin(s.angle)*len/2;
    const x2=s.x+Math.cos(s.angle)*len/2, y2=s.y+Math.sin(s.angle)*len/2;
    const d = pointLineDistance(x,y,x1,y1,x2,y2);
    if(d<bestD && d<=tol){ bestD=d; best=s; }
  }
  return best;
}
function pointLineDistance(px,py,x1,y1,x2,y2){
  const A=px-x1, B=py-y1, C=x2-x1, D=y2-y1;
  const dot=A*C+B*D, len_sq=C*C+D*D; let t=dot/len_sq; t=Math.max(0,Math.min(1,t));
  const xx=x1+t*C, yy=y1+t*D; return Math.hypot(px-xx,py-yy);
}

/* ========= テキストボックス（吹き出し） ========= */
function addTextbox(page, data={}){
  const st = page._state;
  const tb = document.createElement('div'); tb.className='textbox vh';
  tb.style.left = (data.x ?? 40) + 'px';
  tb.style.top  = (data.y ?? 40) + 'px';
  const w0 = data.w ?? 160, h0 = data.h ?? 200;
  tb.style.width = w0+'px'; tb.style.height = h0+'px';
  tb.style.setProperty('--fs', (data.fs??defaultFontSize)+'px');

  // balloon bg
  const balloon = document.createElement('div'); balloon.className='balloon';
  tb.appendChild(balloon);

  // text content
  const content = document.createElement('div'); content.className='content';
  content.contentEditable = 'true';
  content.style.fontSize = (data.fs??defaultFontSize)+'px';
  content.innerText = (data.text ?? '');
  tb.appendChild(content);

  tb.dataset.mode = data.mode || 'vh';
  tb.dataset.bubble = data.bubble || 'round';
  tb.dataset.tail = String(data.tail ?? false); // デフォルトOFF

  page.appendChild(tb);
  st.tboxes.push(tb);

  // 反応：タップで即編集
  tb.addEventListener('pointerup',(e)=>{ selectTextbox(tb); focusTextbox(tb); e.preventDefault(); },{passive:false});

  // ドラッグ移動（枠で掴む）
  let dragging=false, sx=0,sy=0, ox=0,oy=0;
  tb.addEventListener('pointerdown',(e)=>{
    if(e.target===content) return; // content編集を優先
    dragging=true; const r=tb.getBoundingClientRect(), pr=page.getBoundingClientRect();
    sx=e.clientX; sy=e.clientY; ox=r.left-pr.left; oy=r.top-pr.top;
    tb.setPointerCapture(e.pointerId);
    selectTextbox(tb);
    e.preventDefault();
  });
  tb.addEventListener('pointermove',(e)=>{
    if(!dragging) return;
    const pr=page.getBoundingClientRect();
    const nx = Math.max(0, Math.min(pr.width - tb.offsetWidth, ox + (e.clientX-sx)));
    const ny = Math.max(0, Math.min(pr.height- tb.offsetHeight, oy + (e.clientY-sy)));
    tb.style.left = nx+'px'; tb.style.top = ny+'px';
    drawBalloon(tb);
  });
  tb.addEventListener('pointerup',()=>{ dragging=false; scheduleSave(); });

  // 入力監視：空+確定で削除
  content.addEventListener('keydown',(e)=>{
    if(e.key==='Enter'){
      if(content.innerText.trim()===''){ tb.remove(); scheduleSave(); }
      else { e.preventDefault(); } // 改行は Shift+Enter で代替してもOKだが今回はそのまま保存
    }
  });
  content.addEventListener('blur',()=>{
    if(content.innerText.trim()===''){ tb.remove(); scheduleSave(); }
  });
  content.addEventListener('input',()=>{ autoResize(tb); drawBalloon(tb); scheduleSave(); });

  autoResize(tb); drawBalloon(tb);
  return tb;
}

function focusTextbox(tb){
  const c = tb.querySelector('.content'); c.focus();
  // キャレット末尾
  const range=document.createRange(); range.selectNodeContents(c); range.collapse(false);
  const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
}
function selectTextbox(tb){
  document.querySelectorAll('.textbox').forEach(x=>x.classList.remove('selected'));
  currentTextbox = tb;
  bubbleGroup.classList.toggle('hidden', !tb);
  if(tb){
    tb.classList.add('selected');
    // バブルUIのハイライト
    bubbleBtns.forEach(b=> b.classList.toggle('mode-on', b.dataset.bubble===tb.dataset.bubble));
    // スライダー表示は現在fsに合わせる（最も近い段）
    const fs = parseInt(tb.querySelector('.content').style.fontSize)||defaultFontSize;
    let best=0,bd=1e9; SIZE_PRESETS.forEach((s,i)=>{ const d=Math.abs(s-fs); if(d<bd){bd=d;best=i;}});
    fontSnap.value = String(best);
  }
}

/* 自動リサイズ：テキストのscrollに合わせて盒を広げる（最小値あり） */
function autoResize(tb){
  const c = tb.querySelector('.content');
  c.style.width = 'auto'; c.style.height='auto';
  const pad = 2; // 余白
  const w = Math.max(100, c.scrollWidth + pad);
  const h = Math.max(80,  c.scrollHeight + pad);
  tb.style.width = w+'px'; tb.style.height=h+'px';
}

/* 吹き出し描画（楕円/四角/ギザギザ、しっぽはデフォOFF） */
bubbleBtns.forEach(btn=>{
  btn.onclick = ()=>{
    if(!currentTextbox) return;
    currentTextbox.dataset.bubble = btn.dataset.bubble;
    bubbleBtns.forEach(b=> b.classList.toggle('mode-on', b===btn));
    drawBalloon(currentTextbox); scheduleSave();
  };
});

function drawBalloon(tb){
  const b = tb.querySelector('.balloon');
  const w = tb.clientWidth, h=tb.clientHeight;
  const style = tb.dataset.bubble || 'round';
  const tail = tb.dataset.tail === 'true'; // 既定false
  const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${balloonPath(style,w,h)}
    ${tail ? tailPath(style,w,h, tb) : ''}
  </svg>`;
  b.innerHTML = svg;
}
function balloonPath(style,w,h){
  if(style==='rect'){ return `<rect x="3" y="3" width="${w-6}" height="${h-6}" fill="white" stroke="black" stroke-width="2" rx="8" ry="8"/>`; }
  if(style==='jagged'){
    const step=14, top=6,left=6,right=w-6,bottom=h-6; let pts=[];
    for(let x=left; x<=right; x+=step){ pts.push([x, top + ((Math.floor((x-left)/step)%2)?8:0)]); }
    for(let y=top; y<=bottom; y+=step){ pts.push([right - ((Math.floor((y-top)/step)%2)?8:0), y]); }
    for(let x=right; x>=left; x-=step){ pts.push([x, bottom - ((Math.floor((right-x)/step)%2)?8:0)]); }
    for(let y=bottom; y>=top; y-=step){ pts.push([left + ((Math.floor((bottom-y)/step)%2)?8:0), y]); }
    const d = pts.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join(' ') + ' Z';
    return `<path d="${d}" fill="white" stroke="black" stroke-width="2"/>`;
  }
  // round
  return `<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2-6}" ry="${h/2-6}" fill="white" stroke="black" stroke-width="2"/>`;
}
// しっぽ：ページの属するコマの重心に向ける自動（簡易）。デフォOFFのため描画されない。
function tailPath(style,w,h,tb){
  const page = tb.closest('.page'); const st = page._state;
  const bx = tb.offsetLeft + w/2, by = tb.offsetTop + h/2;
  const p = pickPanelAt(st, bx,by) || st.panels[0];
  const [cx,cy] = centroid(p.poly);
  // 根本はバルーン外周上の、中心→重心方向の交点に近い下辺寄り
  const ang = Math.atan2(cy - (tb.offsetTop+h/2), cx - (tb.offsetLeft+w/2));
  const px = w/2 + Math.cos(ang)*(w/2-8);
  const py = h/2 + Math.sin(ang)*(h/2-8);
  const tipx = px + Math.cos(ang)*24, tipy = py + Math.sin(ang)*24;
  return `<path d="M ${px} ${py} L ${px+14} ${py+2} L ${tipx} ${tipy} Z" fill="white" stroke="black" stroke-width="2" />`;
}

/* ========= テキスト コピー / ペースト ========= */

// 読み順：ページ上→下、コマは行(上→下)・行内(右→左)、コマ内のセリフは(上→下,右→左=右上が早い)
function sortPanelsForReading(state){
  const arr = state.panels.map(p=>({p, c:centroid(p.poly)}));
  // 段分け簡易：y昇順で並べ、xは右→左
  arr.sort((A,B)=> A.c[1]===B.c[1] ? B.c[0]-A.c[0] : A.c[1]-B.c[1]);
  return arr.map(x=>x.p);
}
function sortTextsInPanel(tbxs, panel){
  const inside = tbxs.filter(tb=>{
    const cx = tb.offsetLeft + tb.clientWidth/2;
    const cy = tb.offsetTop  + tb.clientHeight/2;
    return pointInPoly(panel.poly, cx,cy);
  });
  inside.sort((a,b)=>{
    const acy = a.offsetTop + a.clientHeight/2;
    const bcy = b.offsetTop + b.clientHeight/2;
    if(acy!==bcy) return acy-bcy; // 上→下
    const acx = a.offsetLeft + a.clientWidth/2;
    const bcx = b.offsetLeft + b.clientWidth/2;
    return bcx-acx; // 右→左
  });
  return inside;
}

// エクスポート（テキストコピー）
btnExportText.onclick = async ()=>{
  const texts = [];
  const pages = [...document.querySelectorAll('.page')];
  pages.forEach((page,pi)=>{
    const st = page._state;
    const panels = sortPanelsForReading(st);
    const tbs = st.tboxes;
    const pageLines = [];
    panels.forEach(p=>{
      const ts = sortTextsInPanel(tbs,p);
      ts.forEach(tb=>{
        const body = tb.querySelector('.content').innerText;
        if(body.trim().length) pageLines.push(body);
      });
    });
    texts.push(pageLines.join('\n\n'));
  });
  const out = texts.join('\n\n\n\n'); // ページ間は空行2つ以上
  try{
    await navigator.clipboard.writeText(out);
    alert('テキストをコピーしました。');
  }catch{
    // 失敗時はtxtダウンロード
    const blob = new Blob([out],{type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download='nameboard.txt'; a.click();
    URL.revokeObjectURL(a.href);
  }
};

// インポート（テキストペースト）
btnImportText.onclick = async ()=>{
  let text='';
  try{ text = await navigator.clipboard.readText(); }
  catch{ text = prompt('貼り付けテキストを入力：','')||''; }
  if(!text) return;
  importFromPlain(text);
};

function importFromPlain(raw){
  // 正規化（CRLF→LF）
  let s = raw.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  // 先頭/末尾の空行カット
  s = s.replace(/^\s*\n+/,'').replace(/\n+\s*$/,'');
  const pagesBlocks = s.split(/\n\s*\n\s*\n+/); // 空行2つ以上でページ区切り
  let pageIdx = [...document.querySelectorAll('.page')].findIndex(p=>p===currentPage);
  if(pageIdx<0) pageIdx=0;

  for(let bi=0; bi<pagesBlocks.length; bi++){
    const pageText = pagesBlocks[bi];
    const balloons = pageText.split(/\n\s*\n/).map(t=>t.trim()).filter(t=>t.length);
    // ページ確保
    while(pagesRoot.children.length <= pageIdx){
      const p = newPage();
      // 末尾に追加済み
    }
    const page = pagesRoot.children[pageIdx].firstElementChild;
    setCurrentPage(page);

    // 自動配置：右上→左へ
    const st = page._state;
    const pad=20;
    const startX = page.clientWidth - 140 - pad;
    let x = startX, y = pad, col = 0;
    for(const body of balloons){
      const tb = addTextbox(page, { x, y, fs: defaultFontSize, text: body });
      // 次位置
      x -= (tb.clientWidth + 24);
      col++;
      if(x<pad){ // 折返し
        x = startX; y += (tb.clientHeight + 24); col=0;
      }
    }
    pageIdx++;
  }
  scheduleSave();
}

/* ========= PNG書き出し（簡易） ========= */
btnExportPNG.onclick = ()=>{
  // 簡易：各.page を <canvas> に foreignObject で描画（Safariの制約あり）
  // 互換性のため、print を使うのが確実だが、ここは画像ダウンロードを試みる
  const pages = [...document.querySelectorAll('.page')];
  pages.forEach(async (page,i)=>{
    try{
      const data = await renderNodeToImage(page, 1); // scale 1（低画質OK）
      const a = document.createElement('a'); a.href=data; a.download=`page-${i+1}.png`; a.click();
    }catch(e){
      alert('PNG書き出しに失敗しました。Safariではプリント→PDFをご利用ください。');
    }
  });
};

// foreignObjectを使った簡易描画（環境依存）
async function renderNodeToImage(node, scale){
  const w=node.clientWidth, h=node.clientHeight;
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${w*scale}" height="${h*scale}">
    <foreignObject x="0" y="0" width="${w*scale}" height="${h*scale}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="transform:scale(${scale}); transform-origin:0 0;">
        ${new XMLSerializer().serializeToString(node)}
      </div>
    </foreignObject>
  </svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  // 画像として読み込み→canvas
  const img = new Image(); img.crossOrigin='anonymous';
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas'); canvas.width=w*scale; canvas.height=h*scale;
  const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
  return canvas.toDataURL('image/png');
}

/* ========= シリアライズ ========= */
function serialize(){
  const pages = [...document.querySelectorAll('.page')].map(p=>{
    const st=p._state;
    const texts = st.tboxes.filter(tb=>document.body.contains(tb)).map(tb=>({
      x: parseInt(tb.style.left)||0,
      y: parseInt(tb.style.top)||0,
      w: tb.clientWidth, h: tb.clientHeight,
      fs: parseInt(tb.querySelector('.content').style.fontSize)||defaultFontSize,
      text: tb.querySelector('.content').innerText,
      bubble: tb.dataset.bubble,
      tail: tb.dataset.tail==='true',
      mode: tb.dataset.mode
    }));
    return {
      panels: st.panels,
      splits: st.splits,
      texts
    };
  });
  return { version:3, savedAt:Date.now(), pages };
}

/* ========= 復元 ========= */
(async function init(){
  const data = await getData();
  if(data && data.pages?.length){
    for(const pg of data.pages){
      const p = newPage(pg);
      // newPageが内部でtextsも復元する
    }
  }else{
    newPage();
  }
  setMode('pointer');
})();

