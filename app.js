(() => {
  'use strict';
  const M = NectModel, $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
  const KEY = 'nect-cloud-document-v1';
  let doc = M.createDocument(), selected = null, drag = null, savingAllowed = true;
  const history = [], future = [];
  const board = () => doc.artboards[0];
  const object = () => board().objects.find(o => o.id === selected);
  const clone = value => JSON.parse(JSON.stringify(value));
  const round = n => Math.round(n * 100) / 100;
  const status = (message, error = false) => { $('status').textContent = message; $('status').dataset.error = String(error); };
  function remember() { history.push(JSON.stringify(doc)); if(history.length > 60) history.shift(); future.length = 0; }
  function save() {
    if(!savingAllowed) {status('保存済みデータを保護中。JSON保存で現在の編集を残せます。', true); return;}
    try {localStorage.setItem(KEY,JSON.stringify(doc)); status('この端末に保存済み');}
    catch {status('自動保存に失敗しました。JSON保存で編集内容を残してください。',true);}
  }
  try {const raw=localStorage.getItem(KEY); if(raw) doc=M.validateDocument(JSON.parse(raw));}
  catch {savingAllowed=false;status('保存データを読めません。上書きを停止しています。JSONを開いて復旧できます。',true);}
  function svg(tag, attrs = {}) { const node=document.createElementNS(NS,tag); for(const [k,v] of Object.entries(attrs)) node.setAttribute(k,v); return node; }
  function setValue(id, value) {if(document.activeElement !== $(id)) $(id).value=value;}
  function draw() {
    const b=board(), canvas=$('canvas'); canvas.setAttribute('viewBox',`0 0 ${b.width} ${b.height}`);canvas.replaceChildren();
    for(const o of b.objects) {
      const g=svg('g',{'data-id':o.id,class:'object'});
      if(o.type==='rect') g.append(svg('rect',{x:o.x,y:o.y,width:o.width,height:o.height,fill:o.style.fill}));
      else {
        g.append(svg('rect',{x:o.x,y:o.y,width:o.width,height:o.height,fill:'transparent'}));
        const text=svg('text',{x:o.x,y:o.y+o.style.fontSize,'font-size':o.style.fontSize,'font-family':'system-ui, sans-serif',fill:o.style.fill,'pointer-events':'none','xml:space':'preserve'});
        o.text.split('\n').forEach((line,i)=>{const t=svg('tspan',{x:o.x,dy:i?o.style.fontSize*1.3:0});t.textContent=line||' ';text.append(t);});g.append(text);
      }
      canvas.append(g);
    }
    if($('show-guides').checked) {
      const guides=svg('g',{'pointer-events':'none',fill:'none',stroke:'#7e8bd3','stroke-width':.2,'stroke-dasharray':'1.4 1.4'}),positions=M.guidePositions(b);
      for(const x of positions.x) guides.append(svg('line',{x1:x,x2:x,y1:0,y2:b.height}));
      for(const y of positions.y) guides.append(svg('line',{y1:y,y2:y,x1:0,x2:b.width}));
      canvas.append(guides);
      for(const g of b.guides) {
        const attrs=g.axis==='x'?{x1:g.position,x2:g.position,y1:0,y2:b.height}:{y1:g.position,y2:g.position,x1:0,x2:b.width};
        canvas.append(svg('line',{...attrs,stroke:'#49bac7','stroke-width':.3,'pointer-events':'none'}));
        if($('edit-guides').checked) canvas.append(svg('line',{...attrs,stroke:'transparent','stroke-width':12,'vector-effect':'non-scaling-stroke','data-guide':g.id,'data-axis':g.axis,class:'guide-hit'}));
      }
    }
    const o=object(); if(o) canvas.append(svg('rect',{x:o.x,y:o.y,width:o.width,height:o.height,fill:'none',stroke:'#4278ef','stroke-width':1.5,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
  }
  function fitCanvas() {
    const b=board(), space=$('workspace'); let scale=Number($('zoom').value);
    if($('zoom').value==='fit') scale=Math.min((space.clientWidth-48)/b.width,(space.clientHeight-64)/b.height)/3.77952756;
    scale=Math.max(.025,scale);$('canvas').style.width=`${b.width*3.77952756*scale}px`;$('canvas').style.height=`${b.height*3.77952756*scale}px`;
  }
  function syncProperties() {
    const b=board(),o=object();setValue('board-width',b.width);setValue('board-height',b.height);
    for(const s of ['top','bottom','left','right']) setValue('margin-'+s,b.margins[s]);
    setValue('columns',b.columns);setValue('gutter',b.gutter);
    $('dimensions').textContent=`${b.width} × ${b.height} mm`;
    $('object-properties').hidden=!o;$('empty-selection').hidden=!!o;$('selection-type').textContent=o?(o.type==='text'?'文字':'矩形'):'未選択';
    if(o) {for(const k of ['x','y','width','height']) setValue('object-'+k,o[k]);setValue('object-color',o.style.fill);$('text-properties').hidden=o.type!=='text';if(o.type==='text'){setValue('object-text',o.text);setValue('font-size',o.style.fontSize);}}
    $('undo').disabled=!history.length;$('redo').disabled=!future.length;
  }
  function lists() {
    const b=board();$('guide-list').replaceChildren();
    b.guides.forEach(g=>{
      const row=document.createElement('div');row.className='guide-row';const label=document.createElement('label');label.textContent=g.axis==='x'?'垂直':'水平';
      const input=document.createElement('input');input.type='number';input.step='.1';input.min='0';input.max=g.axis==='x'?b.width:b.height;input.value=g.position;input.id='guide-'+g.id;label.htmlFor=input.id;input.setAttribute('aria-label',`${label.textContent}ガイド位置 mm`);
      input.addEventListener('change',()=>{const n=Number(input.value);if(input.value===''||!Number.isFinite(n)||n<0||n>Number(input.max)){status('ガイドはアートボード内の位置を指定してください。',true);input.value=g.position;return;}remember();g.position=n;render();save();});
      const del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label',`${label.textContent}ガイド削除`);del.addEventListener('click',()=>{remember();b.guides=b.guides.filter(x=>x.id!==g.id);render();save();});row.append(label,input,del);$('guide-list').append(row);
    });
    $('layers').replaceChildren();$('object-count').textContent=b.objects.length;
    [...b.objects].reverse().forEach(o=>{const button=document.createElement('button');button.className='layer';button.setAttribute('aria-pressed',String(o.id===selected));button.textContent=o.type==='text'?`T  ${o.text.slice(0,24)}`:'□  矩形';button.addEventListener('click',()=>{selected=o.id;render();});$('layers').append(button);});
  }
  function render() {draw();syncProperties();lists();fitCanvas();}
  function validMutation(mutate) {
    const previous=clone(doc);mutate();
    try {M.validateDocument(doc);}catch(e){doc=previous;document.activeElement?.blur();render();status(e.message,true);return false;}
    history.push(JSON.stringify(previous));if(history.length>60)history.shift();future.length=0;render();save();return true;
  }
  for(const k of ['width','height']) $('board-'+k).addEventListener('change',()=>{const n=$('board-'+k).valueAsNumber;validMutation(()=>{board()[k]=n;for(const g of board().guides) if(g.axis===(k==='width'?'x':'y'))g.position=Math.min(g.position,n);});});
  for(const s of ['top','bottom','left','right']) $('margin-'+s).addEventListener('change',()=>validMutation(()=>board().margins[s]=$('margin-'+s).valueAsNumber));
  for(const k of ['columns','gutter']) $(k).addEventListener('change',()=>validMutation(()=>board()[k]=$(k).valueAsNumber));
  $('a4').addEventListener('click',()=>validMutation(()=>{board().width=210;board().height=297;for(const g of board().guides)g.position=Math.min(g.position,g.axis==='x'?210:297);}));
  $('landscape').addEventListener('click',()=>validMutation(()=>{const b=board();[b.width,b.height]=[b.height,b.width];for(const g of b.guides)g.position=Math.min(g.position,g.axis==='x'?b.width:b.height);}));
  for(const type of ['text','rect']) $('add-'+type).addEventListener('click',()=>{if(board().objects.length>=2000){status('オブジェクトの上限に達しました。',true);return;}remember();const o=M.createObject(type,board());board().objects.push(o);selected=o.id;render();save();});
  for(const axis of ['x','y']) $('add-guide-'+axis).addEventListener('click',()=>{if(board().guides.length>=200){status('ガイドの上限に達しました。',true);return;}remember();board().guides.push({id:M.id(),axis,position:(axis==='x'?board().width:board().height)/2});render();save();});
  for(const k of ['x','y','width','height']) $('object-'+k).addEventListener('change',()=>{if(object())validMutation(()=>object()[k]=$('object-'+k).valueAsNumber);});
  $('font-size').addEventListener('change',()=>{if(object()?.type==='text')validMutation(()=>object().style.fontSize=$('font-size').valueAsNumber);});
  for(const field of ['object-text','object-color']) {
    $(field).addEventListener('focus',()=>{if(object())remember();});
    $(field).addEventListener('input',()=>{const o=object();if(!o)return;if(field==='object-text')o.text=$(field).value;else o.style.fill=$(field).value;draw();syncProperties();save();});
    $(field).addEventListener('change',lists);
  }
  function remove() {if(!object())return;remember();board().objects=board().objects.filter(o=>o.id!==selected);selected=null;render();save();}
  $('delete').addEventListener('click',remove);
  $('duplicate').addEventListener('click',()=>{if(!object()||board().objects.length>=2000)return;remember();const o=clone(object());o.id=M.id();o.x=Math.min(5000,o.x+4);o.y=Math.min(5000,o.y+4);board().objects.push(o);selected=o.id;render();save();});
  for(const [name,d] of [['backward',-1],['forward',1]]) $(name).addEventListener('click',()=>{const a=board().objects,i=a.findIndex(o=>o.id===selected),j=i+d;if(i<0||j<0||j>=a.length)return;remember();[a[i],a[j]]=[a[j],a[i]];render();save();});
  function travel(from,to) {if(!from.length)return;to.push(JSON.stringify(doc));doc=JSON.parse(from.pop());if(!object())selected=null;render();save();}
  $('undo').addEventListener('click',()=>travel(history,future));$('redo').addEventListener('click',()=>travel(future,history));
  const point=e=>{const r=$('canvas').getBoundingClientRect();return {x:(e.clientX-r.left)*board().width/r.width,y:(e.clientY-r.top)*board().height/r.height};};
  $('canvas').addEventListener('pointerdown',e=>{
    if(e.button!==0||drag)return;
    const g=e.target.closest('[data-guide]'), target=e.target.closest('[data-id]');
    selected=target?.dataset.id||null;const o=object();
    if(!g&&!o){render();return;}
    remember();drag={pointer:e.pointerId,start:point(e),before:clone(doc),id:g?.dataset.guide,objectId:o?.id,x:o?.x,y:o?.y};
    // Canvas itself survives redraws, so capture stays valid on mouse and touch.
    $('canvas').setPointerCapture(e.pointerId);draw();syncProperties();e.preventDefault();
  });
  $('canvas').addEventListener('pointermove',e=>{
    if(!drag||drag.pointer!==e.pointerId)return;const p=point(e),b=board();
    if(drag.id){const g=b.guides.find(g=>g.id===drag.id);g.position=round(Math.max(0,Math.min(g.axis==='x'?b.width:b.height,p[g.axis])));}
    else {const o=b.objects.find(o=>o.id===drag.objectId);let x=drag.x+p.x-drag.start.x,y=drag.y+p.y-drag.start.y;
      if($('snap').checked&&$('show-guides').checked&&!e.altKey){const lines=M.guidePositions(b),r=$('canvas').getBoundingClientRect();x=M.snap(x,o.width,lines.x,6*b.width/r.width);y=M.snap(y,o.height,lines.y,6*b.height/r.height);}
      o.x=round(Math.max(-5000,Math.min(5000,x)));o.y=round(Math.max(-5000,Math.min(5000,y)));
    }draw();syncProperties();
  });
  function finishDrag(e,cancel=false) {if(!drag||e.pointerId!==drag.pointer)return;const pointer=drag.pointer;if(cancel){doc=drag.before;history.pop();}drag=null;if($('canvas').hasPointerCapture(pointer))$('canvas').releasePointerCapture(pointer);render();save();}
  $('canvas').addEventListener('pointerup',e=>finishDrag(e));$('canvas').addEventListener('pointercancel',e=>finishDrag(e,true));$('canvas').addEventListener('lostpointercapture',e=>finishDrag(e));
  for(const id of ['show-guides','edit-guides'])$(id).addEventListener('change',draw);
  $('zoom').addEventListener('change',fitCanvas);$('fit').addEventListener('click',()=>{$('zoom').value='fit';fitCanvas();});
  new ResizeObserver(fitCanvas).observe($('workspace'));
  $('panel-toggle').addEventListener('click',()=>{const open=$('inspector').classList.toggle('is-open');$('panel-toggle').setAttribute('aria-expanded',String(open));});
  $('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nect-layout.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('JSONを書き出しました。');});
  $('import').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async()=>{
    const file=$('import-file').files[0];$('import-file').value='';if(!file)return;
    try {
      if(file.size>5000000)throw new Error('JSONは5 MB以下にしてください。');
      const incoming=M.validateDocument(JSON.parse(await file.text()));
      if(!confirm('現在の編集を置き換えます。未保存ならキャンセルしてJSON保存してください。'))return;
      remember();doc=incoming;selected=null;savingAllowed=true;render();save();
    }catch(e){status(e instanceof SyntaxError?'JSONを読み込めません。現在の編集は保持されています。':e.message,true);}
  });
  document.addEventListener('keydown',e=>{
    if(e.target.closest('input,textarea,select,[contenteditable=true]'))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?travel(future,history):travel(history,future);}
    else if(e.key==='Delete'||e.key==='Backspace'){if(object()){e.preventDefault();remove();}}
    else if(e.key==='Escape'){if(drag){finishDrag({pointerId:drag.pointer},true);}selected=null;$('inspector').classList.remove('is-open');$('panel-toggle').setAttribute('aria-expanded','false');render();}
  });
  render();if(savingAllowed)status('文字・矩形を追加して始めましょう。');
})();
