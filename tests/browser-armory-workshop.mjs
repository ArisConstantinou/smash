import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const stage=process.env.CODEX_GENERATED_OUTPUT,out=resolve(stage,'tests/armory/workshop'),root=resolve(new URL('../',import.meta.url).pathname.replace(/^\/(.:)/,'$1')),skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');await mkdir(out,{recursive:true});process.env.TEMP=process.env.TMP=resolve(stage,'work/temp');const{chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs'))),{launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));const managed=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});let context;const results=[],errors=[];await writeFile(resolve(out,'results.json'),JSON.stringify({status:'running'}));
const hook=`window.__armoryUI={get ready(){return gameReady},get garage(){return garage},get hero(){return hero},get storage(){return saveStore},seed(){const c=createCharacterProgression(30);c.materials={wood:5000,scrap:5000,crystal:5000};window.__protectedArmorySave=JSON.stringify({character:c,levels:{power:2},garage:restoreGarage(null)});localStorage.setItem('ironfall.character',window.__protectedArmorySave);window.__armoryFreeze=false;mountWorkshop.close();setPhase('menu');},start(){startGame(30,{test:true});window.__armoryFreeze=true;announcementTimer=0;$('announcement').hidden=true;},save:()=>JSON.stringify(read('ironfall.character',null))};`;
try{
 context=await managed.browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/game.js*',async route=>{const source=(await readFile(resolve(root,'game.js'),'utf8')).replace('function frame(now){','function frame(now){if(globalThis.__armoryFreeze&&!mountWorkshop?.isOpen){requestAnimationFrame(frame);return;}');await route.fulfill({contentType:'text/javascript',body:source+hook});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8000/candidate/',{waitUntil:'networkidle'});await page.waitForFunction(()=>__armoryUI.ready,null,{timeout:120000});await page.evaluate(()=>__armoryUI.start());const earned=await page.evaluate(()=>__armoryUI.save());
 const tab=label=>page.locator('#workshopTabs button').filter({hasText:label}),part=label=>page.locator('#workshopParts button').filter({hasText:label});await page.keyboard.press('i');await tab('ΟΠΛΑ').click();
 for(const id of Array.from({length:12},(_,i)=>'w'+String(i+1).padStart(2,'0'))){await page.locator('[data-blueprint="'+id+'"]').click();assert.equal(await page.evaluate(()=>__armoryUI.hero.userData.armoryWeaponId),id);const state=await page.evaluate(()=>JSON.parse(render_game_to_text()).armory);assert.equal(state.weapon,id);results.push(state);}
 await part('ΠΥΡΗΝΑΣ').click();await page.locator('[data-choice="fire"]').click();await page.locator('#workshopUpgrade').click();assert.equal(await page.evaluate(()=>__armoryUI.garage.armory.items.w12.parts.core.selected),'fire');assert.equal(await page.evaluate(()=>JSON.parse(render_game_to_text()).armory.weaponCore),'fire');
 await page.locator('#workshopPaint').fill('#ad3260');assert.equal(await page.evaluate(()=>__armoryUI.garage.armory.items.w12.parts.finish.color),'#ad3260');
 assert.equal(await part('ΠΥΡΗΝΑΣ').getAttribute('aria-pressed'),'true','Applying a finish keeps the current attachment open');
 await page.locator('[data-blueprint="w08"]').click();await page.locator('[data-blueprint="w12"]').click();assert.equal(await page.evaluate(()=>__armoryUI.garage.armory.items.w12.parts.core.selected),'fire');
 await part('ΚΟΙΝΟ ΣΕΤ').click();await page.locator('#workshopOptions button').filter({hasText:'ΕΝΔΥΝΑΜΩΜΕΝΟ'}).click();await page.locator('#workshopUpgrade').click();
 assert.equal(await page.evaluate(()=>__armoryUI.garage.player.hammer.selected),'powered');
 await tab('ΠΑΙΚΤΗΣ').click();assert.equal(await part('ΣΦΥΡΙ').count(),0);assert.equal(await part('ΑΣΠΙΔΑ').count(),0);
 await tab('ΑΣΠΙΔΕΣ').click();for(const id of Array.from({length:6},(_,i)=>'s'+(i+13))){await page.locator('[data-blueprint="'+id+'"]').click();assert.equal(await page.evaluate(()=>__armoryUI.hero.userData.armoryShieldId),id);}
 assert.equal(await page.evaluate(()=>__armoryUI.save()),earned);assert.ok(await page.locator('#workshopSave').isDisabled());
 for(const [name,width,height]of [['desktop',1440,1000],['portrait',430,932],['small-portrait',320,568],['landscape',932,430],['short-landscape',667,313],['tablet-portrait',768,1024],['tablet-landscape',1024,768]]){await page.setViewportSize({width,height});const shell=await page.locator('.workshop-shell').evaluate(n=>n.getBoundingClientRect().height);for(const label of ['ΟΠΛΑ','ΑΣΠΙΔΕΣ','ΠΑΙΚΤΗΣ','ΜΑΖΙ']){await tab(label).click();await page.waitForTimeout(120);assert.equal(await page.locator('.workshop-shell').evaluate(n=>n.getBoundingClientRect().height),shell);assert.ok(await page.locator('.workshop-shell').evaluate(n=>n.scrollWidth<=n.clientWidth+1));if(label==='ΟΠΛΑ'){await page.waitForFunction(()=>Array.from(document.querySelectorAll('#workshopCatalog img')).every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:resolve(out,name+'-catalog.png')});
   const sections=page.locator('#workshopSections');
   if(await sections.isVisible()){
    await sections.locator('[data-armory-pane="parts"]').click();
    const layout=await page.locator('.workshop-details').evaluate(el=>{
     const panel=el.getBoundingClientRect(),buy=el.querySelector('#workshopUpgrade').getBoundingClientRect();
     return {height:el.clientHeight,content:el.scrollHeight,bars:getComputedStyle(el).scrollbarWidth,
      purchaseInView:buy.top>=panel.top&&buy.bottom<=panel.bottom+1};
    });
    assert.equal(layout.bars,'none');
    assert.ok(layout.purchaseInView,`Purchase fits ${name} without vertical scrolling`);
    results.push({name,layout});
    await page.screenshot({path:resolve(out,name+'-parts.png')});
    const info=page.locator('#workshopUpgradeInfo');
    if(await info.isVisible()){
     await info.click();assert.ok(await page.locator('#workshopUpgradePreview').isVisible());
     await info.click();assert.ok(await page.locator('#workshopUpgrade').isVisible());
    }
   }else if(name.startsWith('tablet')){
    const panel=await page.locator('.workshop-details').boundingBox(),buy=await page.locator('#workshopUpgrade').boundingBox();
    assert.ok(buy.y+buy.height<=panel.y+panel.height+1,`Purchase fits ${name} without vertical scrolling`);
   }}}}
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>__armoryUI.seed());await page.locator('#menuMountWorkshopButton').click();await tab('ΟΠΛΑ').click();await page.locator('[data-blueprint="w11"]').click();await page.locator('#workshopPaint').fill('#a8d581');await part('ΣΤΕΛΕΧΟΣ').click();await page.locator('[data-choice="spring"]').click();await page.locator('#workshopUpgrade').click();await page.locator('#workshopSave').click();assert.match(await page.locator('#workshopSaveState').innerText(),/ΑΠΟΘΗΚΕΥΤΗΚΕ/);
 const saved=await page.evaluate(()=>JSON.parse(__armoryUI.save()));assert.equal(saved.garage.armory.weapon,'w11');assert.equal(saved.garage.armory.items.w11.parts.finish.color,'#a8d581');assert.equal(saved.garage.armory.items.w11.parts.haft.selected,'spring');assert.ok(saved.character.materials.scrap<5000);assert.equal(saved.levels.power,2);assert.ok(await page.evaluate(()=>localStorage.getItem('ironfall.character')===window.__protectedArmorySave));
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>__armoryUI.ready,null,{timeout:120000});await page.locator('#menuMountWorkshopButton').click();await tab('ΟΠΛΑ').click();assert.equal(await page.locator('[data-blueprint="w11"]').getAttribute('data-equipped'),'true');assert.equal(await page.locator('#workshopPaint').inputValue(),'#a8d581');await part('ΣΤΕΛΕΧΟΣ').click();assert.equal(await page.locator('[data-choice="spring"]').getAttribute('data-equipped'),'true');
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'results.json'),JSON.stringify({status:'passed',results,errors,ui:'All18 catalog clicks; fire purchase, cosmetic equip and test-save isolation; desktop, phone and tablet layouts'},null,2));console.log('Armory UI all18 equip / components / layouts passed');
}catch(error){await writeFile(resolve(out,'results.json'),JSON.stringify({status:'failed',error:error.stack,results,errors},null,2));await context?.pages()[0]?.screenshot({path:resolve(out,'failure.png'),timeout:5000}).catch(()=>{});throw error;}finally{await context?.close();await managed.cleanup();await new Promise(r=>setTimeout(r,1000));}
