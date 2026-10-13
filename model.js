(function (root) {
  'use strict';
  const MAX_SIZE = 5000, MAX_OBJECTS = 2000;
  const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function createDocument() {
    return {schemaVersion: 1, artboards: [{id: id(), width: 210, height: 297, unit: 'mm', margins: {top:18,right:18,bottom:18,left:18}, columns:3,gutter:6,guides:[],objects:[]}]};
  }
  function validateDocument(input) {
    const fail = () => {throw new Error('対応していない形式、または値の範囲が不正です。現在の編集内容は保持されています。');};
    if (!input || input.schemaVersion !== 1 || !Array.isArray(input.artboards) || input.artboards.length !== 1) fail();
    const b = input.artboards[0];
    if (!b || b.unit !== 'mm' || !number(b.width,1,MAX_SIZE) || !number(b.height,1,MAX_SIZE) || !b.margins) fail();
    for (const side of ['top','right','bottom','left']) if (!number(b.margins[side],0,MAX_SIZE)) fail();
    if (b.margins.left+b.margins.right >= b.width || b.margins.top+b.margins.bottom >= b.height) fail();
    if (!Number.isInteger(b.columns) || !number(b.columns,1,24) || !number(b.gutter,0,MAX_SIZE) || (b.columns-1)*b.gutter >= b.width-b.margins.left-b.margins.right) fail();
    if (!Array.isArray(b.guides) || b.guides.length > 200 || !Array.isArray(b.objects) || b.objects.length > MAX_OBJECTS) fail();
    const seen = new Set();
    const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !seen.has(value) && (seen.add(value), true);
    const guides = b.guides.map(g => {
      if (!g || !validId(g.id) || !['x','y'].includes(g.axis) || !number(g.position,0,g.axis==='x'?b.width:b.height)) fail();
      return {id:g.id,axis:g.axis,position:g.position};
    });
    const objects = b.objects.map(o => {
      if (!o || !validId(o.id) || !['rect','text'].includes(o.type) || !number(o.x,-MAX_SIZE,MAX_SIZE) || !number(o.y,-MAX_SIZE,MAX_SIZE) || !number(o.width,.1,MAX_SIZE) || !number(o.height,.1,MAX_SIZE) || !color(o.style?.fill)) fail();
      const result = {id:o.id,type:o.type,x:o.x,y:o.y,width:o.width,height:o.height,style:{fill:o.style.fill}};
      if (o.type==='text') {
        if (typeof o.text!=='string' || o.text.length>20000 || !number(o.style.fontSize,.5,200)) fail();
        result.text=o.text; result.style.fontSize=o.style.fontSize;
      }
      return result;
    });
    return {schemaVersion:1,artboards:[{id:typeof b.id==='string'?b.id:id(),width:b.width,height:b.height,unit:'mm',margins:{top:b.margins.top,right:b.margins.right,bottom:b.margins.bottom,left:b.margins.left},columns:b.columns,gutter:b.gutter,guides,objects}]};
  }
  function createObject(type, board) {
    const width=Math.min(type==='text'?80:50,board.width),height=Math.min(type==='text'?22:40,board.height);
    const object={id:id(),type,x:Math.min(board.margins.left,board.width-width),y:Math.min(board.margins.top+board.objects.length*4,board.height-height),width,height,style:{fill:type==='text'?'#20242b':'#6e8afa'}};
    if(type==='text') {object.text='ここに文字を入力';object.style.fontSize=7;}
    return object;
  }
  function guidePositions(b) {
    const x=[b.margins.left,b.width-b.margins.right], y=[b.margins.top,b.height-b.margins.bottom];
    const width=(b.width-b.margins.left-b.margins.right-(b.columns-1)*b.gutter)/b.columns;
    for(let i=1;i<b.columns;i++) x.push(b.margins.left+i*(width+b.gutter)-b.gutter,b.margins.left+i*(width+b.gutter));
    for(const g of b.guides) (g.axis==='x'?x:y).push(g.position);
    return {x,y};
  }
  function snap(value,size,lines,tolerance) {
    let best=value, distance=tolerance;
    for(const line of lines) for(const offset of [0,size/2,size]) {
      const d=Math.abs(value+offset-line); if(d<distance) {distance=d;best=line-offset;}
    }
    return best;
  }
  const api={createDocument,validateDocument,createObject,guidePositions,snap,id};
  if(typeof module==='object' && module.exports) module.exports=api; else root.NectModel=api;
})(globalThis);
