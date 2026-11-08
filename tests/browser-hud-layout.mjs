// Native rendering + real interactions at matched viewports. Safe-area values
// are simulated CSS inputs, not certification of a physical iPhone.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve(process.env.CODEX_TEST_OUTPUT,'hud-layout');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(process.env.CODEX_WORK_OUTPUT,'temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const label=process.env.SMASH_HUD_LABEL||'before',origin=process.env.SMASH_HUD_ORIGIN||'http://127.0.0.1:8000/';
const game=origin.startsWith('http://127.')?await readFile('E:/Smash/game.js','utf8'):await(await fetch(new URL('game.js?v=20261108-colossus1',origin))).text();
const hook=`
const hudQAFrame=frame;let hudQAFrozen=false;
frame=function(t){if(hudQAFrozen){renderer.render(scene,camera);requestAnimationFrame(frame);}else hudQAFrame(t);};
window.__hudQA={get ready(){return gameReady},
 prepare(){startGame(15,{test:true});hudQAFrozen=true;const total=world.objects.reduce((n,o)=>n+o.weight,0);let done=0;
  for(const o of world.objects){if(Math.hypot(o.x,o.z)<25)continue;if(done/total*100>=35)break;hurtObject(o,o.hp+1);done+=o.weight;}
  for(let i=0;i<7;i++){spawnEnemy('zombie',{x:45+i,z:45});const e=enemies.at(-1);hitEnemy(e,e.hp+1,{x:0,z:1},0,0);}
  player.x=0;player.z=0;hero.position.set(0,0,0);poseHero(0);updateEffects(4.5);updateHUD(true);resize();cameraTarget.set(0,.6,0);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);renderer.render(scene,camera);
  return {destruction:destructionPercent(world.objects),kills:battleKills,goal:document.querySelector('#goalValue').textContent};
 },grantUpgrade(){openUpgrade();}};`;
const session=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});
const cases=[
 {name:'iphone-browser',width:393,height:682,safe:0},
 {name:'portrait',width:390,height:844,safe:0},
 {name:'small',width:320,height:568,safe:0},
 {name:'landscape',width:844,height:390,safe:0},
 {name:'short-landscape',width:667,height:360,safe:0},
 {name:'inset-browser',width:393,height:682,safe:44},
 {name:'standalone',width:393,height:852,safe:44,standalone:true},
 {name:'desktop',width:1440,height:900,safe:0},
].filter(c=>!process.env.SMASH_HUD_CASE||c.name===process.env.SMASH_HUD_CASE);
let context;const results=[],errors=[];
try{
 context=await session.browser.newContext({viewport:{width:393,height:682}});
 await context.route('**/game.js*',r=>r.fulfill({status:200,contentType:'text/javascript',body:game+hook}));
 for(const c of cases){
  await context.unroute('**/*.css*');
  await context.route('**/*.css*',async r=>{const response=await r.fetch();let css=await response.text();
   css=css.replace(/env\(safe-area-inset-top(?:,\s*0px)?\)/g,c.safe+'px');
   if(c.standalone)css=css.replace(/\(display-mode:standalone\)/g,'(min-width:0px)');
   await r.fulfill({response,body:css});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push({case:c.name,error:e.message}));
  await page.setViewportSize({width:c.width,height:c.height});await page.goto(origin,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__hudQA?.ready,null,{timeout:120000});await page.locator('#startButton').click();
  await page.waitForFunction(()=>/\d+ FPS/.test(document.querySelector('#performanceHud').textContent));await page.waitForTimeout(3000);
  const state=await page.evaluate(()=>__hudQA.prepare());await page.waitForTimeout(150);
  const layout=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
   const labels=[...document.querySelectorAll('.goal-heading>span,.goal-breakdown>span')].map(e=>({text:e.textContent,font:parseFloat(getComputedStyle(e).fontSize),y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom,width:e.getBoundingClientRect().width,scroll:e.scrollWidth}));
   return {touch:document.body.dataset.touchControls==='true',fps:document.querySelector('#performanceHud').textContent,title:document.querySelector('.goal-heading>span').textContent,scroll:document.documentElement.scrollWidth,width:innerWidth,top:box('.hud-top'),map:box('.minimap-panel'),fpsBox:box('#performanceHud'),toolbar:box('.hud-buttons'),upgrade:box('#upgradesToggle'),joystick:box('#joystick'),actions:box('#combatDock'),goal:box('.goal-panel'),track:box('.goal-track'),number:box('.goal-heading>div'),hero:box('.hero-status'),health:box('.health-track'),wave:box('.run-status'),labels};
  });
  await page.screenshot({path:resolve(out,label+'-'+c.name+'.png')});results.push({case:c.name,state,...layout});
  if(label==='after'){
   assert.match(layout.fps,/^\d+ FPS$/);assert.equal(layout.title,'ΣΥΝΟΛΙΚΗ ΚΑΤΑΣΤΡΟΦΗ');assert.equal(state.kills,7);assert.equal(state.goal,Math.floor(state.destruction+7)+'%');
   assert.ok(layout.scroll<=c.width);assert.ok(layout.fpsBox.x>=layout.map.x&&layout.fpsBox.right<=layout.map.right);
   if(layout.touch){
    assert.ok(c.standalone?layout.top.y>=44:layout.top.y<=8,'The browser HUD must use its top space; standalone keeps the notch inset');
    assert.ok(layout.upgrade.x>=layout.joystick.right+6);assert.ok(layout.upgrade.right<=layout.actions.x-6);
    assert.ok(layout.upgrade.width>=44&&layout.upgrade.height>=44);
    assert.ok(layout.wave.x>=layout.hero.x&&layout.wave.right<=layout.hero.right+1&&layout.wave.y>=layout.health.bottom+2&&layout.wave.bottom<=layout.hero.bottom+1,'Wave count belongs inside the health card');
    assert.ok(layout.wave.height<=24&&layout.top.height<=100);
    if(c.width<360&&c.width<c.height)assert.ok(layout.track.right+3<=layout.number.x,'Small portrait progress bar must clear its number');
    if(c.width>c.height){assert.ok(Math.abs(layout.map.y-layout.top.y)<1);assert.ok(layout.goal.right+3<=layout.map.x);}
    else{assert.ok(layout.map.y>=layout.goal.bottom+3);assert.ok(layout.toolbar.right+3<layout.map.x);if(c.width>=360)assert.ok(Math.abs(layout.map.y-layout.toolbar.y)<1);}

    assert.ok(Math.abs(layout.map.right-layout.actions.right)<1);assert.ok(layout.map.bottom<=layout.actions.y-3,'Map must clear the action dock');
    assert.ok(layout.labels.every(l=>l.font>=12&&l.scroll<=l.width+1&&l.y>=layout.goal.y&&l.bottom<=layout.goal.bottom-3),'Contribution labels must stay inside the goal card');
   }
   await page.locator('#upgradesToggle').click();await assert.doesNotReject(()=>page.locator('#upgradePanel').waitFor({state:'visible'}));
   await page.locator('#upgradeGearTab').click();assert.equal(await page.locator('#upgradeGearTab').getAttribute('aria-selected'),'true');
   await page.locator('#upgradeCloseButton').click();await page.locator('#upgradePanel').waitFor({state:'hidden'});
   if(c.name==='iphone-browser'){
    await page.evaluate(()=>__hudQA.grantUpgrade());assert.equal(await page.locator('#pendingUpgradeCount').textContent(),'1');
    await page.screenshot({path:resolve(out,label+'-pending-upgrade.png')});
    await page.locator('#upgradesToggle').click();assert.equal(await page.locator('#upgradeChoices .upgrade-card').count(),3);
    await page.locator('#upgradeChoices .upgrade-card').first().click();assert.equal(await page.locator('#pendingUpgradeCount').textContent(),'0');
   }

  }
  await page.close();
 }
 assert.deepEqual(errors,[]);
}catch(error){console.error(JSON.stringify({results,errors}));throw error;}
finally{await writeFile(resolve(out,label+'-results.json'),JSON.stringify({results,errors},null,2));await context?.close();await session.cleanup();await new Promise(r=>setTimeout(r,1000));}
console.log(JSON.stringify({results,errors}));
