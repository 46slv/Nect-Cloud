// Run with an installed Playwright package. CI uses real Chromium on a GitHub runner.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function main(){
  const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.join(root,pathname==='/'?'index.html':pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});const url=process.env.NECT_URL||`http://127.0.0.1:${server.address().port}`;
  try{
    for(const mobile of [false,true]){
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
      await page.goto(url);await page.locator('#add-text').click();if(mobile)await page.locator('#panel-toggle').click();
      await page.locator('#object-text').fill('日本語のレイアウト\n二行目');await page.locator('#object-x').fill('24');await page.locator('#object-x').press('Tab');
      assert.equal(await page.locator('#object-x').inputValue(),'24');
      await page.locator('#board-width').fill('220');await page.locator('#board-width').press('Tab');
      await page.locator('#add-guide-x').click();const guide=page.locator('.guide-row input');await guide.fill('90');await guide.press('Tab');
      // Invalid input must preserve the existing document rather than silently discard it.
      await page.locator('#board-width').fill('0');await page.locator('#board-width').press('Tab');
      let saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('nect-cloud-document-v1')));assert.equal(saved.artboards[0].width,220);
      await page.locator('#add-rect').click();await page.locator('#object-color').evaluate(el=>{el.value='#cc5533';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.locator('#snap').uncheck();if(mobile)await page.locator('#panel-toggle').click();
      async function moveObject(id,dx,dy){
        const rect=await page.locator(`[data-id="${id}"]`).boundingBox();const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
        if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
        else {await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
      }
      saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('nect-cloud-document-v1')));const rectangle=saved.artboards[0].objects[1];await moveObject(rectangle.id,35,28);
      saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('nect-cloud-document-v1')));assert.ok(saved.artboards[0].objects[1].x>rectangle.x);assert.ok(saved.artboards[0].objects[1].y>rectangle.y);
      // Move the rectangle away so the text can be picked through its selection frame.
      if(mobile)await page.locator('#panel-toggle').click();await page.locator('#object-y').fill('150');await page.locator('#object-y').press('Tab');if(mobile)await page.locator('#panel-toggle').click();
      const text=saved.artboards[0].objects[0];await moveObject(text.id,22,18);
      saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('nect-cloud-document-v1')));assert.ok(saved.artboards[0].objects[0].x>24);
      // Explicit edit mode exposes only custom guides to pointer interaction.
      if(mobile)await page.locator('#panel-toggle').click();await page.locator('#edit-guides').check();if(mobile)await page.locator('#panel-toggle').click();
      const line=await page.locator('.guide-hit').boundingBox();await page.mouse.move(line.x+line.width/2,line.y+line.height*.7);await page.mouse.down();await page.mouse.move(line.x+line.width/2+20,line.y+line.height*.7);await page.mouse.up();
      saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('nect-cloud-document-v1')));assert.ok(saved.artboards[0].guides[0].position>90);
      await page.reload();assert.equal((await page.locator('[data-id]').count()),2);
      const savedAfterReload=JSON.parse(await page.evaluate(()=>localStorage.getItem('nect-cloud-document-v1')));assert.deepEqual(savedAfterReload,saved);
      const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;const exported=fs.readFileSync(await download.path(),'utf8');assert.deepEqual(JSON.parse(exported),saved);
      await page.locator('#import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='true');assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('nect-cloud-document-v1'))),saved);
      await page.locator('#import-file').setInputFiles({name:'layout.json',mimeType:'application/json',buffer:Buffer.from(exported)});await page.waitForFunction(()=>document.querySelector('#status').dataset.error==='false');
      assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('nect-cloud-document-v1'))),saved);assert.deepEqual(errors,[]);
      if(mobile)await page.locator('#panel-toggle').click();await page.locator('#add-text').click();await page.locator('#object-text').fill('<script>alert(1)</script>');assert.equal(await page.locator('#canvas script').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await page.screenshot({path:`/tmp/nect-${mobile?'mobile':'desktop'}.png`});await context.close();console.log(`PASS: ${mobile?'390px touch':'desktop mouse'} edit, drag both objects, guide edit, reload, JSON roundtrip, invalid import, Japanese, no JS errors`);
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
