/* ===== 設定 ===== */
const DEFAULT_FONT_PX = 22;    // ★ デフォルト少し大きめ
const EDGE_THICK = 2.5;        // 分割両側の黒線太さ
const GUTTER_W_HORZ = 16;      // 横線の白帯幅（広め）
const GUTTER_W_VERT = 8;       // 縦線の白帯幅（狭め）
const STORAGE_KEY = 'manganame_v1';

const root = document.getElementById('root');
const addTextBtn = document.getElementById('addTextBtn');
const splitBtn = document.getElementById('splitBtn');
const fontRange = document.getElementById('fontSize');
const sizeLabel = document.getElementById('sizeLabel');
const addPrev = document.getElementById('addPrev');
const addNext = document.getElementById('addNext');
const delPage = document.getElementById('delPage');
const shapeBar = document.getElementById('shapeBar');

fontRange.value = DEFAULT_FONT_PX;
sizeLabel.textContent = DEFAULT_FONT_PX + 'px';

let state = load() ?? createInitialState();
let currentPageIndex = Math.min(state.pages.length-1, state.currentPage ?? 0);
let mode = null; // 'text' or 'split' or null
let selectedBalloon = null;
let splitDrag = null; // {panelId, start:{x,y}}

renderAll();

/* ====== イベント ====== */
addTextBtn.addEventListener('click', () => {
  mode = (mode === 'text') ? null : 'text';
  addTextBtn.classList.toggle('active', mode==='text');
  splitBtn.classList.remove('active');
});
splitBtn.addEventListener('click', () => {
  mode = (mode === 'split') ? null : 'split';
  splitBtn.classList.toggle('active', mode==='split');
  addTextBtn.classList.remove('active');
});

fontRange.addEventListener('input', ()=>{
  sizeLabel.textContent = fontRange.value + 'px';
  if (selectedBalloon){
    selectedBalloon.style.fontSize = fontRange.value + 'px';
    autosizeBalloon(selectedBalloon);
    save();
  }
});

addPrev.addEventListener('click', ()=>{
  insertPage(currentPageIndex);
});
addNext.addEventListener('click', ()=>{
  insertPage(currentPageIndex+1);
});
delPage.addEventListener('click', ()=>{
  if (state.pages.length<=1) return;
  state.pages.splice(currentPageIndex,1);
  currentPageIndex = Math.max(0, currentPageIndex-1);
  save(); renderAll();
});

/* shape 切替 */
shapeBar.addEventListener('click', (e)=>{
  const b = e.target.closest('button[data-shape]');
  if (!b || !selectedBalloon) return;
  const s = b.dataset.shape;
  selectedBalloon.classList.remove('ellipse','rect','jaggy');
  selectedBalloon.classList.add(s);
  autosizeBalloon(selectedBalloon);
  save();
});

/* ====== レンダリング ====== */
function renderAll(){
  root.innerHTML = '';
  state.pages.forEach((page,pi)=>{
    const pageEl = document.createElement('div');
    pageEl.className = 'page' + (pi===currentPageIndex?' active':'');
    page.dom = pageEl;

    // 1ページ＝複数パネル（初期は1つで全域）
    page.panels.forEach(p=>{
      const panelEl = document.createElement('div');
      panelEl.className = 'panel';
      panelEl.style.left = p.x+'px';
      panelEl.style.top  = p.y+'px';
      panelEl.style.width  = p.w+'px';
      panelEl.style.height = p.h+'px';
      p.dom = panelEl;

      // 分割（白帯+両側線）
      drawSplits(p);

      // セリフ
      p.balloons?.forEach(b=>{
        const el = createBalloonDom(b.x,b.y,b.shape,b.text,b.fontSize);
        panelEl.appendChild(el);
        b.dom = el;
      });

      // クリック挙動
      panelEl.addEventListener('pointerdown', (ev)=>{
        const rect = panelEl.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;

        if (mode==='text'){
          const b = createBalloonDom(x,y,'ellipse','',(fontRange.value|0));
          (p.balloons ||= []).push({x,y,shape:'ellipse',text:'',fontSize:(fontRange.value|0)});
          p.dom.appendChild(b);
          autosizeBalloon(b);
          select(b);
          save();
        }else if (mode==='split'){
          splitDrag = { panelId: p.id, start:{x,y} };
          window.addEventListener('pointermove', onSplitMove);
          window.addEventListener('pointerup', onSplitUp, {once:true});
        }else{
          select(null);
        }
      });

      pageEl.appendChild(panelEl);
    });

    root.appendChild(pageEl);

    // ページをクリックでアクティブ化
    pageEl.addEventListener('click', ()=> {
      currentPageIndex = pi; save(); renderAll();
    });
  });
}

/* ====== スプリット描画 ====== */
function drawSplits(panel){
  // 既存のgutter を消す
  panel.dom.querySelectorAll('.gutter').forEach(e=>e.remove());
  (panel.splits||[]).forEach(s=>{
    const g = document.createElement('div'); g.className='gutter';

    // スナップ済みの角度
    const rad = s.rad;
    const len = Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y);
    const gw = s.gw;

    g.style.left = Math.min(s.p1.x, s.p2.x) + 'px';
    g.style.top  = Math.min(s.p1.y, s.p2.y) + 'px';
    g.style.width  = len + 'px';
    g.style.height = gw + EDGE_THICK*2 + 'px';
    g.style.transformOrigin = '0 50%';
    g.style.transform = `translate(${s.p1.x}px,${s.p1.y}px) rotate(${rad}rad)`;

    // 白帯
    const gap = document.createElement('div');
    gap.className='gap';
    gap.style.left='0'; gap.style.top=EDGE_THICK+'px';
    gap.style.width=len+'px'; gap.style.height=gw+'px';

    // 両側の黒線
    const e1 = document.createElement('div');
    e1.className='edge';
    e1.style.left='0'; e1.style.top='0';
    e1.style.width=len+'px'; e1.style.height=EDGE_THICK+'px';

    const e2 = document.createElement('div');
    e2.className='edge';
    e2.style.left='0'; e2.style.bottom='0';
    e2.style.width=len+'px'; e2.style.height=EDGE_THICK+'px';

    g.appendChild(gap); g.appendChild(e1); g.appendChild(e2);
    panel.dom.appendChild(g);
  });
}

/* ====== 分割ドラッグ ====== */
function onSplitMove(ev){
  if (!splitDrag) return;
  const panel = findPanel(splitDrag.panelId);
  const rect = panel.dom.getBoundingClientRect();
  const p2 = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };

  // 角度＆スナップ
  let rad = Math.atan2(p2.y - splitDrag.start.y, p2.x - splitDrag.start.x);
  const deg = Math.abs(rad*180/Math.PI);
  if (deg < 15 || deg > 165) rad = 0;
  else if (Math.abs(deg-90) < 15) rad = Math.PI/2;

  splitDrag.preview = {p2,rad};
  // 簡易プレビューは省略（確定時に描画）
}

function onSplitUp(ev){
  const drag = splitDrag; splitDrag = null;
  window.removeEventListener('pointermove', onSplitMove);

  if (!drag?.preview) return;
  const panel = findPanel(drag.panelId);
  const p1 = drag.start, p2 = drag.preview.p2;
  const rad = drag.preview.rad;

  const gw = angleToGutterWidth(rad);
  (panel.splits ||= []).push({p1,p2,rad,gw});
  drawSplits(panel);
  save();
}

/* 横広く / 縦狭く の幅を線形補間 */
function angleToGutterWidth(rad){
  const a = Math.abs((rad % Math.PI + Math.PI) % Math.PI);     // [0,π)
  const n = a > Math.PI/2 ? Math.PI - a : a;                    // 0~π/2
  const t = n / (Math.PI/2);                                    // 0=横,1=縦
  return GUTTER_W_HORZ*(1-t) + GUTTER_W_VERT*t;
}

/* ====== セリフ生成 ====== */
function createBalloonDom(x,y,shape='ellipse',text='',fontSize=DEFAULT_FONT_PX){
  const b = document.createElement('div');
  b.className = `balloon ${shape}`;
  b.style.left = x+'px';
  b.style.top  = y+'px';
  b.style.fontSize = fontSize+'px';

  const t = document.createElement('div');
  t.className = 'text';
  t.contentEditable = 'true';
  t.textContent = text;
  b.appendChild(t);

  t.addEventListener('input', ()=>{
    autosizeBalloon(b);
    save();
  });
  t.addEventListener('blur', ()=>{
    if (t.textContent===''){ b.remove(); save(); }
  });

  b.addEventListener('pointerdown', (e)=>{
    e.stopPropagation();
    select(b);
  });

  autosizeBalloon(b);
  return b;
}

/* ★ テキスト矩形に合わせてフキダシを完全フィット */
function autosizeBalloon(b){
  const txt = b.querySelector('.text');
  // 改行のみを扱う
  txt.style.whiteSpace = 'pre';
  txt.style.display = 'inline-block';

  const r = txt.getBoundingClientRect();
  // padding は CSS から取得（px→数値）
  const padX = parseFloat(getComputedStyle(b).paddingLeft);
  const padY = parseFloat(getComputedStyle(b).paddingTop);

  const w = Math.ceil(r.width)  + padX + padX + 1; // 最終行はみ出し対策で+1
  const h = Math.ceil(r.height) + padY + padY + 1;

  b.style.width  = w + 'px';
  b.style.height = h + 'px';
}

/* 選択管理 */
function select(el){
  selectedBalloon?.classList.remove('selected');
  selectedBalloon = el || null;
  if (selectedBalloon){
    selectedBalloon.classList.add('selected');
    fontRange.value = parseInt(selectedBalloon.style.fontSize)||DEFAULT_FONT_PX;
    sizeLabel.textContent = fontRange.value + 'px';
    shapeBar.classList.add('show');
  }else{
    shapeBar.classList.remove('show');
  }
}

/* ====== 状態管理 ====== */
function createInitialState(){
  // ページサイズは .page の実寸を使って後で合わせる。ここでは%ベースにしておき、
  // 初回レンダ時に実DOMの幅高さからpxに直す。
  const tmp = document.createElement('div');
  tmp.className='page'; tmp.style.visibility='hidden'; document.body.appendChild(tmp);
  const w = tmp.getBoundingClientRect().width, h = tmp.getBoundingClientRect().height;
  tmp.remove();

  return {
    currentPage: 0,
    pages: [{
      panels: [{
        id: 'p0',
        x: 8, y: 8, w: w-16, h: h-16,
        splits: [],
        balloons: []
      }]
    }]
  };
}

function insertPage(index){
  // 既存ページのサイズ参照
  const ref = document.querySelector('.page') || document.createElement('div');
  ref.className='page';
  ref.style.visibility='hidden'; document.body.appendChild(ref);
  const w = ref.getBoundingClientRect().width, h = ref.getBoundingClientRect().height;
  ref.remove();

  const id = 'p' + Math.random().toString(36).slice(2,8);
  const page = { panels:[{ id, x:8, y:8, w:w-16, h:h-16, splits:[], balloons:[] }] };
  state.pages.splice(index,0,page);
  currentPageIndex = index;
  save(); renderAll();
}

function findPanel(id){
  const page = state.pages[currentPageIndex];
  return page.panels.find(p=>p.id===id);
}

function toSerializable(){
  // DOM情報を除いて保存
  return {
    currentPage: currentPageIndex,
    pages: state.pages.map(pg=>({
      panels: pg.panels.map(p=>({
        id:p.id,x:p.x,y:p.y,w:p.w,h:p.h,
        splits:(p.splits||[]).map(s=>({p1:s.p1,p2:s.p2,rad:s.rad,gw:s.gw})),
        balloons:(p.balloons||[]).map(b=>{
          // DOMからテキスト・位置・shape・fontSize を復元
          const dom = b.dom;
          let x=b.x, y=b.y, text=b.text, shape=b.shape, fontSize=b.fontSize;
          if (dom){
            const t = dom.querySelector('.text');
            text = t.textContent;
            shape = dom.classList.contains('rect') ? 'rect'
                   : dom.classList.contains('jaggy') ? 'jaggy' : 'ellipse';
            fontSize = parseInt(dom.style.fontSize)||DEFAULT_FONT_PX;
            x = parseFloat(dom.style.left); y = parseFloat(dom.style.top);
          }
          return {x,y,text,shape,fontSize};
        })
      }))
    }))
  };
}
function save(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSerializable()));
  }catch(e){ console.warn(e); }
}
function load(){
  try{
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  }catch(e){ return null; }
}
