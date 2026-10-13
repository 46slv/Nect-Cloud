const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../model.js');
test('Japanese document roundtrip preserves mm coordinates, styles, guides and order',()=>{
  const d=M.createDocument(),b=d.artboards[0];const o=M.createObject('text',b);o.text='日本語\n二行目';o.x=12.34;b.objects.push(o,M.createObject('rect',b));b.guides.push({id:'custom-guide',axis:'x',position:84});
  assert.deepEqual(M.validateDocument(JSON.parse(JSON.stringify(d))),d);
});
test('invalid imports reject without mutating source document',()=>{
  for(const mutate of [d=>d.schemaVersion=2,d=>d.artboards[0].width=0,d=>d.artboards[0].width=Infinity,d=>d.artboards[0].margins.left=210,d=>d.artboards[0].columns=1.5,d=>d.artboards[0].gutter=300,d=>d.artboards[0].objects.push({type:'script'}),d=>d.artboards.push(d.artboards[0])]){const good=M.createDocument(),bad=structuredClone(good);mutate(bad);assert.throws(()=>M.validateDocument(bad));assert.deepEqual(good.artboards[0].width,210);}
});
test('guides include margins and column boundaries; snapping includes object edges',()=>{
  const b=M.createDocument().artboards[0],p=M.guidePositions(b);assert.deepEqual(p.x,[18,192,72,78,132,138]);assert.deepEqual(p.y,[18,279]);assert.equal(M.snap(17,50,p.x,2),18);assert.equal(M.snap(21,50,p.x,2),22);
});
