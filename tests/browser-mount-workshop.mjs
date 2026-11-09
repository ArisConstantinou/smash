import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,extname,sep} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {createServer} from 'node:http';
const skill=resolve(process.env.USERPROFILE||process.env.HOME,'.codex/skills/develop-web-game');
const {chromium}=await import(process.env.SMASH_PLAYWRIGHT||(process.platform==='win32'?pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')).href:'playwright'));
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(process.env.CODEX_TEST_OUTPUT||resolve(root,'browser-evidence'),'mount-workshop');await mkdir(out,{recursive:true});
await writeFile(resolve(out,'results.json'),JSON.stringify({status:'running',started:new Date().toISOString()}));
let server;if(process.env.SMASH_WORKSHOP_SERVER==='1'){
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp3':'audio/mpeg','.json':'application/json'};
 server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root.endsWith(sep)?root:root+sep))throw Error('path');res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(await readFile(file));}catch{res.writeHead(404).end();}});await new Promise((done,fail)=>{server.once('error',fail);server.listen(8000,'127.0.0.1',done);});
}
const source=await readFile(new URL('../game.js',import.meta.url),'utf8'),hook=`
window.__garageQA={get ready(){return gameReady},get workshop(){return mountWorkshop},get storage(){return saveStore},get garage(){return garage},get character(){return character},get mount(){return mountRide},get phase(){return phase},get stats(){return stats},get hero(){return hero},get weapons(){return mountWeapons},startGame,setPhase,createCharacterProgression,persistCharacter};`;
const base=process.env.SMASH_WORKSHOP_URL||'http://127.0.0.1:8000/';
let managed;if(process.env.SMASH_BROWSER_LIFECYCLE||process.platform==='win32'){const {launchManagedBrowser}=await import(process.env.SMASH_BROWSER_LIFECYCLE||pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')).href);managed=await launchManagedBrowser(chromium,{channel:'chrome',headless:true,screenshotDir:out,args:process.env.SMASH_WORKSHOP_SOFTWARE==='1'?['--enable-unsafe-swiftshader','--use-angle=swiftshader']:[]});}else{const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});managed={browser,cleanup:()=>browser.close()};}let context;const results=[],errors=[];
try{
 context=await managed.browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/game.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:source+hook}));const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 // Some headless SwiftShader compositors require a fresh presented frame for
 // CDP capture. Enable identical-frame presentation only during screenshots;
 // natural on-demand readiness and rotation are asserted before this helper.
 const shot=async options=>{const active=await page.evaluate(()=>!!window.__garageQA?.workshop.isOpen);if(!active)return page.screenshot(options);await page.waitForFunction(()=>__garageQA.workshop.inspect().ready);await page.bringToFront();console.log('Capturing workshop '+options.path);await page.evaluate(()=>window.__workshopCapture=true);try{return await page.screenshot(options);}finally{await page.evaluate(()=>window.__workshopCapture=false).catch(()=>{});}};
 await context.route('**/mount-workshop.js*',async route=>route.fulfill({status:200,contentType:'text/javascript',body:(await readFile(new URL('../mount-workshop.js',import.meta.url),'utf8')).replace('update(){if(!open||!renderer)return;',"update(){if(globalThis.__workshopCapture)drawKey='';if(!open||!renderer)return;").replace('  get isOpen(){return open;}',`  snapshot(){renderer.render(scene,camera);if(renderer.getContext().isContextLost())throw Error('Workshop WebGL context lost');return renderer.domElement.toDataURL('image/png');},\n  inspect(){hero.updateWorldMatrix(true,true);const feet=new THREE.Box3().setFromObject(hero.userData.leftLeg);feet.union(new THREE.Box3().setFromObject(hero.userData.rightLeg));return {view,rotation,ready:!!drawKey,feetY:feet.min.y,attachments:hero.userData.customizationMeshes.map(m=>({slot:m.userData.slot,vertices:m.geometry.attributes.position.count})),render:renderer.info.render,memory:renderer.info.memory};},\n  get isOpen(){return open;}`)}));
 await page.goto(base+'?renderer='+(process.env.SMASH_WORKSHOP_RENDERER||'webgpu'),{waitUntil:'networkidle'});await page.waitForFunction(()=>__garageQA.ready,null,{timeout:90000});await page.keyboard.press('i');assert.ok(await page.locator('#mountWorkshop').isVisible());await page.keyboard.press('i');assert.ok(await page.locator('#mountWorkshop').isHidden());await page.locator('#menuMountWorkshopButton').click();await page.waitForTimeout(300);
 assert.ok(await page.locator('#mountWorkshop').isVisible());await shot({path:resolve(out,'desktop-together.png')});
 // CI's static WebGL compositor readback stalls on a second CDP screenshot.
 // Capture the actual drawing buffer in the same task as render, retaining
 // real input/yaw, a natural render after drag, fixed bounds and pixel proof.
 const canvas=page.locator('#mountPreview'),box=await canvas.boundingBox();assert.ok(box&&box.width>100&&box.height>100);
 const capture=async name=>{const data=await page.evaluate(()=>__garageQA.workshop.snapshot()),bytes=Buffer.from(data.split(',')[1],'base64');assert.ok(bytes.length>1000);await writeFile(resolve(out,name),bytes);return createHash('sha256').update(bytes).digest('hex');};
 const before=await capture('turntable-before.png'),initialPreview=await page.evaluate(()=>__garageQA.workshop.inspect());
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.5,{steps:15});await page.mouse.up();
 await page.waitForFunction(before=>{const now=__garageQA.workshop.inspect();return Math.abs(now.rotation-before.rotation)>.1&&now.render.frame>before.render.frame;},initialPreview);
 const rotatedBox=await canvas.boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(rotatedBox[key]-box[key])<1,'Canvas bounds stay fixed while rotating');
 const after=await capture('turntable-after.png');assert.notEqual(before,after,'Dragging must rotate actual rendered geometry');
 await page.locator('#workshopTabs button').filter({hasText:'ΠΑΙΚΤΗΣ'}).click();await shot({path:resolve(out,'desktop-player.png')});
 assert.ok(Math.abs(await page.evaluate(()=>__garageQA.ready&&document.querySelectorAll('#workshopOptions img').length)-4)<.1); // Four physical kit variants.
 await page.locator('#workshopTabs button').filter({hasText:'ΟΧΗΜΑ'}).click();await shot({path:resolve(out,'desktop-mount.png')});
 await page.locator('#workshopTestLevel').selectOption('1');await page.locator('#workshopTestStart').click();await page.waitForFunction(()=>__garageQA.phase==='playing');await page.waitForTimeout(700);await page.locator('#mountWorkshopButton').click();assert.equal(await page.evaluate(()=>__garageQA.phase),'paused');
 await page.locator('#workshopOptions button').filter({hasText:'ΑΚΙΔΕΣ'}).click();
 const upgradePreview=page.locator('#workshopUpgradePreview'),upgrade=page.locator('#workshopUpgrade');
 assert.match(await upgradePreview.innerText(),/Κατασκευή · βαθμίδα 1.*ΖΗΜΙΑ ΤΡΟΧΩΝ 0 → /s);
 assert.match(await page.locator('#workshopCost').innerText(),/δεν ξοδεύεις υλικά/);
 await upgrade.click();
 assert.match(await upgradePreview.innerText(),/Βαθμίδα 1 → 2.*ΖΗΜΙΑ ΤΡΟΧΩΝ/s);
 for(let n=1;n<5;n++)await upgrade.click();
 assert.ok(await upgrade.isDisabled());assert.ok(await upgradePreview.isHidden());
 assert.equal(await page.evaluate(()=>__garageQA.garage.mounts.bicycle.frontWheel.owned.spiked),5);assert.ok(await page.evaluate(()=>__garageQA.mount.stats.contact>40));
 await page.locator('#workshopParts button').filter({hasText:'ΕΜΠΡΟΣ MODULE'}).click();await page.locator('#workshopOptions button').filter({hasText:'ΠΟΛΥΒΟΛΟ'}).click();await page.locator('#workshopUpgrade').click();assert.equal(await page.evaluate(()=>__garageQA.mount.stats.weapons[0].id),'gun');
 await page.locator('#workshopTabs button').filter({hasText:'ΠΑΙΚΤΗΣ'}).click();await page.locator('#workshopOptions button').filter({hasText:'ΕΝΙΣΧΥΜΕΝΟ'}).click();const hp=await page.evaluate(()=>__garageQA.stats.maxHp);await page.locator('#workshopUpgrade').click();assert.ok(await page.evaluate(()=>__garageQA.stats.maxHp)>hp);
 assert.equal(await page.evaluate(()=>localStorage.getItem(__garageQA.storage.key('ironfall.character'))),null,'Test purchases must not overwrite the earned save');
 assert.ok(await page.locator('#workshopSave').isDisabled());
 await page.locator('#workshopTabs button').filter({hasText:'ΜΑΖΙ'}).click();await page.locator('#workshopFamilies button').filter({hasText:'ΜΟΤΟΣΙΚΛΕΤΑ'}).click();assert.ok(await page.locator('#workshopUpgrade').isDisabled());
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);await shot({path:resolve(out,'phone-top.png')});
 assert.ok(await page.locator('.workshop-shell').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
 await page.locator('#workshopUpgrade').scrollIntoViewIfNeeded();await shot({path:resolve(out,'phone-details.png')});
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>__garageQA.phase),'playing');
 // An isolated browser context seeds a representative earned checkpoint. It
 // never touches the user's browser profile, and checks one atomic save payload.
 await page.evaluate(()=>{const character=__garageQA.createCharacterProgression(21);character.materials={wood:500,scrap:500,crystal:500};window.__protectedCheckpoint=JSON.stringify({character,levels:{power:2}});localStorage.setItem('ironfall.character',window.__protectedCheckpoint);__garageQA.setPhase('menu');});
 await page.setViewportSize({width:1440,height:1000});await page.locator('#menuMountWorkshopButton').click();await page.locator('#workshopOptions button').filter({hasText:'ΑΚΙΔΕΣ'}).click();
 assert.match(await page.locator('#workshopCost').innerText(),/Μέταλλο 10 · έχεις 500/);
 await upgrade.click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem(__garageQA.storage.key('ironfall.character'))));assert.equal(saved.garage.mounts.scifi.frontWheel.selected,'spiked');assert.equal(saved.character.materials.scrap,490);assert.equal(saved.levels.power,2);assert.ok(await page.evaluate(()=>!__garageQA.storage.isPreview||localStorage.getItem('ironfall.character')===window.__protectedCheckpoint));
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>__garageQA.ready,null,{timeout:90000});await page.locator('#menuMountWorkshopButton').click();assert.equal(await page.locator('#workshopOptions button').filter({hasText:'ΑΚΙΔΕΣ'}).getAttribute('aria-pressed'),'true');
 await page.locator('#workshopSave').click();assert.match(await page.locator('#workshopSaveState').innerText(),/ΑΠΟΘΗΚΕΥΤΗΚΕ/);
 await page.evaluate(()=>{window.__originalStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('test quota','QuotaExceededError');};});await page.locator('#workshopSave').click();assert.match(await page.locator('#workshopSaveState').innerText(),/ΑΠΟΤΥΧΙΑ/);await page.evaluate(()=>Storage.prototype.setItem=window.__originalStorageWrite);await page.locator('#workshopSave').click();
 await page.locator('#workshopTabs button').filter({hasText:'ΠΑΙΚΤΗΣ'}).click();
 for(const part of ['ΚΕΦΑΛΙ','ΚΟΡΜΟΣ','ΧΕΡΙΑ','ΠΟΔΙΑ','ΜΠΟΤΕΣ']){await page.locator('#workshopParts button').filter({hasText:part}).click();await page.locator('#workshopOptions button').filter({hasText:'ΕΦΟΔΟΥ'}).click();await page.locator('#workshopUpgrade').click();}
 for(const tab of ['ΟΠΛΑ','ΑΣΠΙΔΕΣ']){await page.locator('#workshopTabs button').filter({hasText:tab}).click();await page.locator('#workshopParts button').filter({hasText:'ΚΟΙΝΟ ΣΕΤ'}).click();await page.locator('#workshopOptions button').filter({hasText:'ΕΦΟΔΟΥ'}).click();await page.locator('#workshopUpgrade').click();}
 await page.locator('#workshopTabs button').filter({hasText:'ΠΑΙΚΤΗΣ'}).click();
 await page.locator('#workshopSave').click();const preview=await page.evaluate(()=>__garageQA.workshop.inspect());assert.ok(Math.abs(preview.feetY+.045)<.001);assert.ok(preview.attachments.length>=12);await shot({path:resolve(out,'desktop-armored-player.png')});
 for(const [name,width,height]of [['desktop',1440,1000],['phone',430,932],['landscape',932,430]]){await page.setViewportSize({width,height});const h=await page.locator('.workshop-shell').evaluate(n=>n.getBoundingClientRect().height);for(const label of ['ΜΑΖΙ','ΠΑΙΚΤΗΣ','ΟΧΗΜΑ']){await page.locator('#workshopTabs button').filter({hasText:label}).click();assert.equal(await page.locator('.workshop-shell').evaluate(n=>n.getBoundingClientRect().height),h);assert.ok(await page.locator('.workshop-shell').evaluate(n=>n.scrollWidth<=n.clientWidth+1));await shot({path:resolve(out,name+'-visual-'+label+'.png')});}await page.locator('#workshopTabs button').filter({hasText:'ΠΑΙΚΤΗΣ'}).click();await page.waitForFunction(()=>{const images=[...document.querySelectorAll('#workshopOptions img')];return images.length===4&&images.every(i=>i.complete&&i.naturalWidth===1280);},null,{timeout:15000});results.push({name,width,height,constantHeight:h});}
 await shot({path:resolve(out,'persisted-scifi.png')});
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>__garageQA.ready,null,{timeout:90000});assert.ok(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem(__garageQA.storage.key('ironfall.character'))).garage.player).every(p=>p.selected==='assault'&&p.owned.assault===1)));
 await page.setViewportSize({width:430,height:932});await page.locator('#resumeCharacterButton').click();await page.waitForFunction(()=>__garageQA.phase==='playing');await page.locator('#mountToggle').click();assert.ok(await page.evaluate(()=>__garageQA.mount.active));
 await page.waitForFunction(()=>{const i=document.getElementById('mountHudImage');return i.complete&&i.naturalWidth===160;});
 assert.equal(await page.locator('#combatDock #mountControls #upgradesToggle').count(),1,'The existing mount, workshop and upgrades controls share the touch dock');
 const mountHud=await page.locator('#mountControls').boundingBox(),joystick=await page.locator('#joystick').boundingBox();
 assert.ok(mountHud.x>=joystick.x+joystick.width+6,'Utility actions clear the joystick');
 await shot({path:resolve(out,'phone-game-controls.png')});
 await page.locator('#mountWorkshopButton').click();assert.equal(await page.evaluate(()=>__garageQA.phase),'paused');
 const playingHeight=await page.locator('.workshop-shell').evaluate(n=>n.getBoundingClientRect().height);
 await page.locator('#workshopTabs button').filter({hasText:'ΠΑΙΚΤΗΣ'}).click();
 assert.equal(await page.locator('.workshop-shell').evaluate(n=>n.getBoundingClientRect().height),playingHeight);
 await page.keyboard.press('i');assert.equal(await page.evaluate(()=>__garageQA.phase),'playing');assert.deepEqual(errors,[]);
 // Catalog choices must change actual live equipment, including in CI's software diagnostic renderer.
 await page.keyboard.press('i');await page.locator('#workshopTabs button').filter({hasText:'ΟΠΛΑ'}).click();for(const id of Array.from({length:12},(_,i)=>'w'+String(i+1).padStart(2,'0'))){await page.locator('[data-blueprint="'+id+'"]').click();assert.equal(await page.evaluate(()=>__garageQA.hero.userData.armoryWeaponId),id);}
 const armoryPane=name=>page.locator('#workshopSections [data-armory-pane="'+name+'"]').click();
 await armoryPane('parts');
 await page.locator('#workshopParts button').filter({hasText:'ΠΥΡΗΝΑΣ'}).click();
 await page.locator('[data-choice="fire"]').click();assert.match(await upgradePreview.innerText(),/Στο χτύπημα.*εγκαύματος/);
 await upgrade.click();assert.match(await upgradePreview.innerText(),/Βαθμίδα 1 → 2.*Κάθε παλμός/s);
 await upgradePreview.scrollIntoViewIfNeeded();await shot({path:resolve(out,'phone-upgrade-preview.png')});
 for(const [width,height] of [[430,932],[320,568],[932,430],[667,313]]){
  await page.setViewportSize({width,height});
  await armoryPane('visual');
  const layout=await page.evaluate(()=>{
   const box=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
   const shell=document.querySelector('.workshop-shell');
   const content=document.querySelector('.workshop-content');
   return {overflow:shell.scrollWidth>shell.clientWidth+1||content.scrollHeight>content.clientHeight+1,save:box('#workshopSave'),close:box('#workshopClose'),
    visuals:box('#workshopVisuals'),parts:box('#workshopParts'),preview:box('.workshop-turntable'),tools:box('.workshop-preview-tools'),
    preset:box('#workshopFamilies'),bars:[...shell.querySelectorAll('*')].some(n=>getComputedStyle(n).scrollbarWidth!=='none')};
  });
  assert.ok(!layout.overflow&&layout.save.right<=layout.close.x,`Workshop fits ${width}×${height}`);
  assert.ok(!layout.bars,'Workshop scrollbars are hidden');
  assert.equal(layout.tools.width,0,'Touch layout hides rotate and zoom buttons');
  assert.equal(layout.preset.width,0,'Stock equipment lives in the catalogue');
  if(width<height)assert.ok(layout.visuals.bottom<=layout.preview.top&&layout.preview.width>=width-34);
  else assert.ok(layout.visuals.right<=layout.preview.left);
  await armoryPane('stats');assert.ok(await page.locator('#workshopStats').isVisible());
  await armoryPane('parts');assert.equal(await page.locator('[data-choice="fire"]').getAttribute('data-equipped'),'true');
  await upgrade.scrollIntoViewIfNeeded();
  assert.ok(await upgrade.isEnabled(),'Next-rank purchase stays available after rotation');
 }
 await page.setViewportSize({width:430,height:932});
 await page.locator('#workshopTabs button').filter({hasText:'ΑΣΠΙΔΕΣ'}).click();for(const id of Array.from({length:6},(_,i)=>'s'+(i+13))){await page.locator('[data-blueprint="'+id+'"]').click();assert.equal(await page.evaluate(()=>__garageQA.hero.userData.armoryShieldId),id);}await page.locator('#workshopSave').click();assert.match(await page.locator('#workshopSaveState').innerText(),/ΑΠΟΘΗΚΕΥΤΗΚΕ/);await page.keyboard.press('i');assert.deepEqual(errors,[]);
 results.push({rotationChanged:before!==after,maxWheelRank:5,testPurchasesIsolated:true,savedMaterials:saved.character.materials,desktop:'1440x1000',phone:'390x844'});await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}catch(error){console.error(error.stack);await writeFile(resolve(out,'results.json'),JSON.stringify({status:'failed',error:error.stack,results,errors},null,2));await context?.pages()[0]?.screenshot({path:resolve(out,'failure.png'),timeout:5000}).catch(()=>{});throw error;}finally{await context?.close();await managed.cleanup();if(server)await new Promise(done=>server.close(done));await new Promise(r=>setTimeout(r,1000));}
