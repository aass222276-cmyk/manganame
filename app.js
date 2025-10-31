/* =======================================================
   manga name board v3  (rebuild on v1 concept)
   - セリフ：トグル、Enter改行のみ、内容に合わせて自動フィット
   - コマ枠分割：角度を決めて指を離したら、対象コマ内で端まで自動延長（0°/90°にスナップ）
   - p↑ / p↓ / p× ：ページ操作
   - テキストコピー / テキストペースト（空行1=フキダシ, 空行2+=ページ）
   - PNG書き出し（Canvas）、全ページZIP（jszip）
   - データは localStorage に保存
   ======================================================= */

(() => {
  const LSKEY = "manganame_v3";
  const el = s => document.querySelector(s);
  const els = s => document.querySelectorAll(s);

  // ---- State ------------------------------------------------
  const state = {
    pages: [],       // [{bubbles:[], gutters:[], frame:{x,y,w,h}}]
    pageIndex: 0,
    mode: null,      // 'text' | 'split' | null
    fontSize: 22,
  };

  // ---- Init -------------------------------------------------
  const pageEl = el('#page');
  const gutterContainer = el('#gContainer');

  const btnText  = el('#btnText');
  const btnSplit = el('#btnSplit');
  const fontRange = el('#fontRange');
  const pxview = el('#pxview');

  const btnAddPrev = el('#btnAddPrev');
  const btnAddNext = el('#btnAddNext');
  const btnDelPage = el('#btnDelPage');

  const btnCopy = el('#btnCopy');
  const btnPaste = el('#btnPaste');
  const btnPng = el('#btnPng');
  const btnZip = el('#btnZip');

  // helpers
  function load(){
    try{
      const raw = localStorage.getItem(LSKEY);
      if(raw){
        Object.assign(state, JSON.parse(raw));
      }
    }catch(e){}
    if(!state.pages || !state.pages.length){
      state.pages = [newPage()];
    }
    state.pageIndex = Math.min(state.pageIndex||0, state.pages.length-1);
    state.mode = null;
    state.fontSize = state.fontSize || 22;
  }
  function save(){
    localStorage.setItem(LSKEY, JSON.stringify({
      pages: state.pages, pageIndex: state.pageIndex, fontSize: state.fontSize
    }));
  }
  function newPage(){
    const frame = innerFrameRect();
    return { bubbles: [], gutters: [], frame, id: nid() };
  }
  function nid(){ return Math.random().toString(36).slice(2,10); }
  function innerFrameRect(){
    const r = pageEl.getBoundingClientRect();
    // editor frame inset = 16px border + 3px frame
    const pad = 16 + 3;
    return { x: pad, y: pad, w: r.width - pad*2, h: r.height - pad*2 };
  }

  // ---- Rendering -------------------------------------------
  function render(){
    // page active border
    pageEl.classList.add('active');
    gutterContainer.innerHTML = '';
    // bubbles
    pageEl.querySelectorAll('.bubble').forEach(n=>n.remove());
    const page = state.pages[state.pageIndex];

    // gutters (editor helper line)
    page.gutters.forEach(g=>{
      const div = document.createElement('div');
      if(g.dir === 'h'){
        div.className = 'gline';
        div.style.top = `${g.pos}px`;
      }else{
        div.className = 'gline v';
        div.style.left = `${g.pos}px`;
      }
      gutterContainer.appendChild(div);
    });

    // bubbles
    page.bubbles.forEach(b=>{
      const node = createBubbleNode(b);
      pageEl.appendChild(node);
    });

    // page strip
    renderPageStrip();

    pxview.textContent = `${state.fontSize}px`;
    fontRange.value = state.fontSize;
    save();
  }

  function renderPageStrip(){
    const strip = el('#pagestrip');
    strip.innerHTML = '';
    state.pages.forEach((p,i)=>{
      const t = document.createElement('div');
      t.className = 'thumb' + (i===state.pageIndex?' active':'');
      t.title = `p${i+1}`;
      t.onclick = ()=>{state.pageIndex=i; render();}
      strip.appendChild(t);
    });
  }

  // ---- Bubble ----------------------------------------------
  function createBubble(data, x, y){
    const page = state.pages[state.pageIndex];
    const b = {
      id: nid(), x, y, w: 10, h: 10,
      text: '', shape: 'ellipse', font: state.fontSize
    };
    page.bubbles.push(b);
    return b;
  }

  function createBubbleNode(b){
    const div = document.createElement('div');
    div.className = 'bubble';
    div.style.left = `${b.x}px`;
    div.style.top  = `${b.y}px`;

    const shape = document.createElement('div');
    shape.className = `shape ${b.shape}`;
    div.appendChild(shape);

    const text = document.createElement('div');
    text.className = 'text';
    text.style.fontSize = `${b.font}px`;
    text.contentEditable = true;
    text.spellcheck = false;
    text.innerText = b.text;
    div.appendChild(text);

    // selection panel
    const panel = document.createElement('div');
    panel.className = 'selpanel hidden';
    panel.innerHTML = `
      <button data-s="ellipse">楕円</button>
      <button data-s="rect">四角</button>
      <button data-s="saw">ギザ</button>
      <button data-del="1" class="ghost">削除</button>
    `;
    div.appendChild(panel);

    // event
    div.addEventListener('pointerdown',(e)=>{
      selectBubble(div, b, true);
      e.stopPropagation();
    });
    text.addEventListener('input',()=>{
      b.text = text.innerText;
      b.font = state.fontSize;
      fitBubble(div, b); save();
    });
    text.addEventListener('keydown',(e)=>{
      // Esc で選択解除
      if(e.key==='Escape'){ deselect(); }
    });

    // fit once
    fitBubble(div, b);

    // panel buttons
    panel.querySelectorAll('button[data-s]').forEach(btn=>{
      btn.onclick = (ev)=>{
        b.shape = btn.dataset.s;
        shape.className = `shape ${b.shape}`;
        fitBubble(div, b); save(); ev.stopPropagation();
      }
    });
    panel.querySelector('button[data-del]').onclick = (ev)=>{
      const page = state.pages[state.pageIndex];
      page.bubbles = page.bubbles.filter(x=>x.id!==b.id);
      render(); ev.stopPropagation();
    };

    return div;
  }

  function selectBubble(node, b, withPanel=false){
    deselect();
    node.classList.add('selected');
    if(withPanel){
      const panel = node.querySelector('.selpanel');
      panel.classList.remove('hidden');
      positionPanel(node, panel);
    }
    currentSelection = { node, data:b };
  }
  function positionPanel(node, panel){
    const rect = node.getBoundingClientRect();
    const pr = pageEl.getBoundingClientRect();
    panel.style.left = `${rect.left - pr.left + rect.width/2}px`;
    panel.style.top  = `${rect.top - pr.top - 8}px`;
  }
  function deselect(){
    pageEl.querySelectorAll('.bubble.selected').forEach(n=>{
      n.classList.remove('selected');
      const p = n.querySelector('.selpanel');
      p && p.classList.add('hidden');
    });
    currentSelection = null;
  }
  let currentSelection = null;

  // text size fit :  折返し無し → 各行の幅を測って bubble サイズを決定
  function fitBubble(node, b){
    const textEl = node.querySelector('.text');
    const padX = 18, padY = 14;

    const lines = (b.text||'').split('\n');
    const cvs = fitBubble._cvs || (fitBubble._cvs = document.createElement('canvas'));
    const ctx = cvs.getContext('2d');
    ctx.font = `${b.font}px ${getComputedStyle(textEl).fontFamily}`;

    let w = 0;
    lines.forEach(line => w = Math.max(w, ctx.measureText(line||' ').width));
    const h = Math.max(1, lines.length) * (b.font*1.4);

    b.w = Math.ceil(w) + padX*2;
    b.h = Math.ceil(h) + padY*2;

    // apply to node
    node.style.width  = `${b.w}px`;
    node.style.height = `${b.h}px`;
    textEl.style.fontSize = `${b.font}px`;
  }

  // ---- Split (gutters) -------------------------------------
  // クリックした位置の「現在のコマ」を取得
  function hitPanel(x, y){
    const page = state.pages[state.pageIndex];
    const F = page.frame;
    // initial one frame split by gutters (horizontal & vertical)
    // we'll just allow H/V gutters → rectangles grid
    // Determine panel by scanning sorted lines.
    const ys = [F.y, ...page.gutters.filter(g=>g.dir==='h').map(g=>g.pos), F.y+F.h].sort((a,b)=>a-b);
    const xs = [F.x, ...page.gutters.filter(g=>g.dir==='v').map(g=>g.pos), F.x+F.w].sort((a,b)=>a-b);
    let ix=-1, iy=-1;
    for(let i=0;i<xs.length-1;i++){ if(x>=xs[i] && x<xs[i+1]){ ix=i; break; } }
    for(let i=0;i<ys.length-1;i++){ if(y>=ys[i] && y<ys[i+1]){ iy=i; break; } }
    if(ix<0||iy<0) return null;
    return {x0: xs[ix], x1: xs[ix+1], y0: ys[iy], y1: ys[iy+1]};
  }

  function addGutter(x,y, angleRad){
    const page = state.pages[state.pageIndex];
    const pan = hitPanel(x,y);
    if(!pan) return;

    // snap
    const deg = angleRad * 180/Math.PI;
    const norm = ((deg%180)+180)%180; // 0..180
    let dir = null;
    if(norm <=15 || norm >=165){ dir='h'; }          // ~0°
    else if(norm >=75 && norm <=105){ dir='v'; }     // ~90°
    else{
      // free: pick nearest axis
      dir = (Math.abs(norm-90) < Math.abs(norm-0)) ? 'v' : 'h';
    }

    // place within this panel (extend to its borders)
    if(dir==='h'){
      const pos = clamp(y, pan.y0+20, pan.y1-20);
      page.gutters.push({dir, pos: Math.round(pos)});
    }else{
      const pos = clamp(x, pan.x0+20, pan.x1-20);
      page.gutters.push({dir, pos: Math.round(pos)});
    }
    render();
  }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // ---- Text copy/paste -------------------------------------
  function exportText(){
    const lines = [];
    state.pages.forEach((p,pi)=>{
      // page separator (except first)
      if(pi>0) lines.push('');
      // order: 右→左, 上→下
      const arr = p.bubbles.slice().sort((a,b)=>{
        if(Math.abs(a.y-b.y) < 30) return b.x - a.x;
        return a.y - b.y;
      });
      arr.forEach((b, i)=>{
        if(i>0) lines.push('');
        lines.push(b.text||'');
      })
    });
    return lines.join('\n');
  }
  function importText(text){
    const pages = text.replace(/\r/g,'').split(/\n{2,}/); // 2つ以上の空行でページ区切り
    const start = state.pageIndex;

    for(let i=0;i<pages.length;i++){
      const pg = pages[i];
      if(i>0 && start+i >= state.pages.length) state.pages.push(newPage());
      const target = state.pages[start+i];
      // 1つの空行でバルーン区切り
      const bubbles = pg.split(/\n{1}(?!\n)/);

      // 自動配置（右上から左へ）
      const F = target.frame;
      const COL = 3, GAPX=100, GAPY=90;
      let col = COL-1, row=0;
      bubbles.forEach(str=>{
        const x = F.x + F.w - 120 - col*GAPX;
        const y = F.y + 100 + row*GAPY;
        const b = {id:nid(), x, y, w:10, h:10, text:str||'', shape:'ellipse', font:state.fontSize};
        target.bubbles.push(b);
        col--; if(col<0){ col=COL-1; row++; }
      });
    }
    render();
  }

  // ---- PNG Export ------------------------------------------
  function drawPageToCanvas(page){
    const r = pageEl.getBoundingClientRect();
    const W = Math.round( r.width  * window.devicePixelRatio );
    const H = Math.round( r.height * window.devicePixelRatio );

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // helpers
    function scx(x){ return Math.round(x * window.devicePixelRatio); }
    function scy(y){ return Math.round(y * window.devicePixelRatio); }

    // background paper
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,W,H);

    const F = page.frame;
    // frame border
    ctx.lineWidth = 3*window.devicePixelRatio;
    ctx.strokeStyle = '#111';
    ctx.strokeRect(scx(F.x), scy(F.y), scx(F.w), scy(F.h));

    // gutters (白帯 + 両側線)
    page.gutters.forEach(g=>{
      // gap width: 横>縦 （横=18、縦=9 くらい）
      const base = 18, narrow = 9;
      const w = (g.dir==='h') ? base : narrow;

      if(g.dir==='h'){
        const y = g.pos;
        // white gap
        ctx.fillStyle = '#fff';
        ctx.fillRect(scx(F.x), scy(y - w/2), scx(F.w), scy(w));
        // lines
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2*window.devicePixelRatio;
        ctx.beginPath();
        ctx.moveTo(scx(F.x), scy(y - w/2));
        ctx.lineTo(scx(F.x+F.w), scy(y - w/2));
        ctx.moveTo(scx(F.x), scy(y + w/2));
        ctx.lineTo(scx(F.x+F.w), scy(y + w/2));
        ctx.stroke();
      }else{
        const x = g.pos;
        ctx.fillStyle = '#fff';
        ctx.fillRect(scx(x - w/2), scy(F.y), scx(w), scy(F.h));
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2*window.devicePixelRatio;
        ctx.beginPath();
        ctx.moveTo(scx(x - w/2), scy(F.y));
        ctx.lineTo(scx(x - w/2), scy(F.y+F.h));
        ctx.moveTo(scx(x + w/2), scy(F.y));
        ctx.lineTo(scx(x + w/2), scy(F.y+F.h));
        ctx.stroke();
      }
    });

    // bubbles
    page.bubbles.forEach(b=>{
      const x = b.x, y=b.y, w=b.w, h=b.h;
      const rx = x - w/2, ry = y - h/2;

      // shape
      ctx.lineWidth = 3*window.devicePixelRatio;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = 'transparent';

      if(b.shape==='ellipse'){
        ctx.beginPath();
        ctx.ellipse(scx(x), scy(y), scx(w/2), scy(h/2), 0, 0, Math.PI*2);
        ctx.stroke();
      }else if(b.shape==='rect'){
        ctx.strokeRect(scx(rx), scy(ry), scx(w), scy(h));
      }else{ // saw (擬似：角丸)
        const r = 16;
        roundedRect(ctx, scx(rx), scy(ry), scx(w), scy(h), scx(r));
        ctx.stroke();
      }

      // text (改行そのまま)
      ctx.fillStyle = '#111';
      ctx.font = `${b.font*window.devicePixelRatio}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textBaseline = 'top';
      const lines = (b.text||'').split('\n');
      const lh = b.font*1.4;

      const padX = 18, padY = 14;
      let ty = ry + padY;
      lines.forEach(line=>{
        ctx.fillText(line, scx(rx + padX), scy(ty));
        ty += lh;
      });
    });

    return canvas;
  }

  function roundedRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }

  async function exportPNGCurrent(){
    const page = state.pages[state.pageIndex];
    const canvas = drawPageToCanvas(page);

    const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.92));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `page_${state.pageIndex+1}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportZIPAll(){
    if(!window.JSZip){ alert('ZIPライブラリの読み込みに失敗しました。ネットワークをご確認ください。'); return; }
    const zip = new JSZip();
    for(let i=0;i<state.pages.length;i++){
      const canvas = drawPageToCanvas(state.pages[i]);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png', 0.92));
      zip.file(`page_${String(i+1).padStart(2,'0')}.png`, blob);
    }
    const blob = await zip.generateAsync({type:'blob'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pages_${new Date().toISOString().slice(0,10)}.zip`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ---- UI events -------------------------------------------
  btnText.onclick = ()=>{
    toggleMode('text', btnText);
  };
  btnSplit.onclick = ()=>{
    toggleMode('split', btnSplit);
  };
  function toggleMode(name, btn){
    if(state.mode===name){
      state.mode=null; btn.classList.remove('toggled');
    }else{
      state.mode=name;
      els('.bar button').forEach(b=>b.classList.remove('toggled'));
      btn.classList.add('toggled');
    }
  }
  // page pointer to add things
  let dragInfo = null;
  pageEl.addEventListener('pointerdown', (e)=>{
    const rect = pageEl.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    if(state.mode==='text'){
      // within frame?
      const F = state.pages[state.pageIndex].frame;
      if(x<F.x || x>F.x+F.w || y<F.y || y>F.y+F.h) return;
      const b = createBubble(x,y);
      const node = createBubbleNode(b);
      pageEl.appendChild(node);
      selectBubble(node, b, true);
      // focus text
      setTimeout(()=> node.querySelector('.text').focus(), 0);
      save();
      return;
    }
    if(state.mode==='split'){
      dragInfo = {x0:x, y0:y};
    }else{
      deselect();
    }
  });
  pageEl.addEventListener('pointermove', (e)=>{
    // show ghost? keep simple
  });
  pageEl.addEventListener('pointerup', (e)=>{
    if(state.mode==='split' && dragInfo){
      const rect = pageEl.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const dx = x - dragInfo.x0, dy = y - dragInfo.y0;
      const angle = Math.atan2(dy, dx);
      addGutter(dragInfo.x0, dragInfo.y0, angle);
      dragInfo = null;
      // keep split mode toggled on
    }
  });

  // font slider
  fontRange.addEventListener('input', ()=>{
    state.fontSize = Number(fontRange.value);
    pxview.textContent = `${state.fontSize}px`;
    // selected bubbleの即時反映
    if(currentSelection){
      currentSelection.data.font = state.fontSize;
      fitBubble(currentSelection.node, currentSelection.data);
    }
    save();
  });

  // page ops
  btnAddPrev.onclick = ()=>{
    state.pages.splice(state.pageIndex, 0, newPage());
    render();
  };
  btnAddNext.onclick = ()=>{
    state.pages.splice(state.pageIndex+1, 0, newPage());
    state.pageIndex++;
    render();
  };
  btnDelPage.onclick = ()=>{
    if(!confirm('このページを削除しますか？')) return;
    if(state.pages.length===1){ state.pages[0]=newPage(); }
    else{
      state.pages.splice(state.pageIndex,1);
      state.pageIndex = Math.max(0, state.pageIndex-1);
    }
    render();
  };

  // text copy/paste
  btnCopy.onclick = ()=>{
    const t = exportText();
    navigator.clipboard.writeText(t).then(()=>{
      btnCopy.classList.add('toggled'); setTimeout(()=>btnCopy.classList.remove('toggled'),600);
    });
  };
  btnPaste.onclick = async ()=>{
    try{
      const t = await navigator.clipboard.readText();
      if(!t){ alert('クリップボードが空です'); return; }
      importText(t); save();
    }catch(e){
      const t = prompt('貼り付けるテキストを入力（空行1=フキダシ、空行2+=ページ）');
      if(t){ importText(t); save(); }
    }
  };

  // png / zip
  btnPng.onclick = exportPNGCurrent;
  btnZip.onclick = exportZIPAll;

  // deselect when clicking outside
  document.addEventListener('pointerdown',(e)=>{
    if(!pageEl.contains(e.target)) deselect();
  });

  // ---- Boot -------------------------------------------------
  load();
  // adjust frame rect (size depends on css layout)
  state.pages.forEach(p=> p.frame = innerFrameRect());
  render();

  // ---- SW register -----------------------------------------
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js');
  }
})();
