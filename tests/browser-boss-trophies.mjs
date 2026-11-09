import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const stage=process.env.CODEX_GENERATED_OUTPUT||'E:/CodexGenerated/smash/staging',out=resolve(stage,'tests/boss-trophies');
await mkdir(out,{recursive:true});process.env.TEMP=process.env.TMP=resolve(stage,'work/temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const hook=`
window.__trophyQA={
 get ready(){return gameReady},
 state(){return JSON.parse(render_game_to_text()).armory},
 start(){startGame(1);window.__trophyFreeze=true;$('announcement').hidden=true;},
 defeat(which){
   if(encounter){
     const first=encounter;
     for(let i=0;i<25&&encounter;i++){updateEncounter(6);for(const e of [...first.escorts])killEnemy(e);}
     updateEncounter(3.1);
   }
   battleKills=which===1?45:70;checkGoal();updateEncounter(5);
   const e=encounter.leader;hitEnemy(e,e.hp+10,{x:0,z:1},0,0);
   return read('ironfall.character',null).garage.armory.trophies;
 },
 use(){
   for(const ring of rings)removeEffect(ring.mesh);rings=[];numbers=[];hpEchoes=[];
   for(const fallen of enemyFalls)disposeInstance(fallen);enemyFalls=[];
   $('announcement').hidden=true;
   const a=spawnEnemy('zombie',{x:0,z:2.4}),b=spawnEnemy('robot',{x:1.9,z:2.6});
   Object.assign(a,{hp:400,maxHp:400});Object.assign(b,{hp:400,maxHp:400});
   player.hp=player.maxHp-30;const hp=player.hp;
   const head=hero.userData.hammerHead,matrix=head.matrixWorld.clone();head.matrixWorld.identity();
   try{
     armoryImpact({damage:100,knockback:3,lift:0,hits:new Set(),q:0,fx:0,fz:1,time:.1,duration:.3},{x:0,y:1,z:.7},{x:0,y:1,z:2.55},false);
   }finally{head.matrixWorld.copy(matrix);}
   const branded=armoryEffects.branded.has(a);
   if(branded)hitEnemy(a,a.hp+1,{x:0,z:1},0,0);
   const result={primary:a.hp,secondary:b.hp,branded,heal:player.hp-hp,signature:armoryWeaponStats.signature};
   for(const e of [a,b])if(!e.dead)e.mesh.position.set(e.x,0,e.z);
   poseHero(0);updateBattleCamera(1,new THREE.Vector3(player.x,.6,player.z));camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);
   world.updateVisibility(player,camera);updateEffects(.14);updateHUD(true);renderer.render(scene,camera);drawFX();
   for(const e of [a,b])if(!e.dead){disposeInstance(e);enemies=enemies.filter(n=>n!==e);}
   return result;
 }
};`;
const source=(await readFile('game.js','utf8')).replace('function frame(now){','function frame(now){if(globalThis.__trophyFreeze&&!mountWorkshop?.isOpen){requestAnimationFrame(frame);return;}');
const managed=await launchManagedBrowser(chromium,{channel:'chrome',headless:true,screenshotDir:out});
let context;
try{
 context=await managed.browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/game.js*',r=>r.fulfill({contentType:'text/javascript',body:source+hook}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/candidate/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__trophyQA?.ready,null,{timeout:120000});
 const tab=page.locator('#workshopTabs button').filter({hasText:'ΟΠΛΑ'});
 const card=id=>page.locator('[data-blueprint="'+id+'"]');
 const open=async()=>{await page.keyboard.press('KeyI');await tab.click();};
 const close=()=>page.locator('#workshopClose').click();
 await page.evaluate(()=>__trophyQA.start());await open();
 for(const id of ['w19','w20']){await card(id).click();assert.equal(await card(id).getAttribute('data-locked'),'true');assert.equal(await card(id).getAttribute('data-equipped'),'false');}
 await close();
 assert.deepEqual(await page.evaluate(()=>__trophyQA.defeat(1)),{siegeTransformer:true});
 await open();await card('w19').click();assert.equal(await card('w19').getAttribute('data-equipped'),'true');assert.equal(await card('w20').getAttribute('data-locked'),'true');
 await page.screenshot({path:resolve(out,'siege-workshop.png')});await close();
 const siege=await page.evaluate(()=>__trophyQA.use());assert.ok(siege.primary<400&&siege.secondary<400&&siege.heal===0,JSON.stringify(siege));
 await page.screenshot({path:resolve(out,'siege-impact.png')});
 assert.deepEqual(await page.evaluate(()=>__trophyQA.defeat(2)),{siegeTransformer:true,hollowMarshal:true});
 await page.setViewportSize({width:430,height:932});await open();await card('w20').click();assert.equal(await card('w20').getAttribute('data-equipped'),'true');
 await page.screenshot({path:resolve(out,'marshal-workshop-mobile.png')});await close();
 const marshal=await page.evaluate(()=>__trophyQA.use());assert.ok(marshal.branded&&marshal.heal>0&&marshal.heal<=20&&marshal.secondary===400,JSON.stringify(marshal));
 await page.screenshot({path:resolve(out,'marshal-heal.png')});
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__trophyQA?.ready,null,{timeout:120000});
 await page.locator('#menuMountWorkshopButton').click();await tab.click();
 assert.equal(await card('w19').getAttribute('data-locked'),'false');assert.equal(await card('w20').getAttribute('data-equipped'),'true');
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-blueprint^="w2"] img,[data-blueprint="w19"] img')].every(img=>img.complete&&img.naturalWidth>0));
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'results.json'),JSON.stringify({siege,marshal,reload:true,errors},null,2));
 console.log(JSON.stringify({siege,marshal,reload:true,errors}));
}finally{await context?.close();await managed.cleanup();}
