import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const stage=process.env.CODEX_GENERATED_OUTPUT||'E:/CodexGenerated/smash/staging';
const out=resolve(stage,'tests/rare-enemies');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(stage,'work/temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const managed=await launchManagedBrowser(chromium,{channel:'chrome',headless:true,screenshotDir:out});
const source=await readFile('game.js','utf8');
const hook=`
window.__expedition={
 get ready(){return gameReady},get backend(){return renderer.userData.backend},
 guards(){return enemies.filter(e=>e.patrol).map(e=>({x:e.x,z:e.z,rare:e.rareWeapon}));},
 arrange(){
   for(const e of enemies)disposeInstance(e);enemies=[];
   const e=spawnEnemy('zombie',{x:0,z:0},{rareWeapon:'w04'});
   e.state='idle';e.timer=100;wave.timer=100;window.__carrier=e;
   const d=screenMovement(0,-1);player.x=-d.x*3.2;player.z=-d.z*3.2;
   $('announcement').hidden=true;
 },
 defeat(){const e=window.__carrier;hitEnemy(e,e.hp+10,{x:0,z:1},0,0);},
 state(){return {found:!!garage.armory.discoveries?.w04,weapon:garage.armory.weapon,drops:drops.filter(d=>d.kind==='weapon').map(d=>d.weapon)};},
};`;
const measure=page=>page.evaluate(()=>new Promise(resolve=>{
 const samples=[];let previous,start;
 const tick=now=>{start??=now;if(previous!==undefined)samples.push(now-previous);previous=now;
  if(now-start<3200){requestAnimationFrame(tick);return;}
  samples.sort((a,b)=>a-b);resolve({frames:samples.length,p95:samples[Math.ceil(samples.length*.95)-1],max:samples.at(-1)});
 };requestAnimationFrame(tick);
}));
const origin='http://127.0.0.1:8000',errors=[];
let desktop,mobile;
try{
 desktop=await managed.browser.newContext({viewport:{width:1280,height:800}});
 const before=await desktop.newPage();before.on('pageerror',e=>errors.push(e.message));
 await before.goto(origin+'/');await before.locator('#startButton').click();
 await before.waitForFunction(()=>JSON.parse(render_game_to_text()).phase==='playing');
 await before.waitForFunction(()=>document.querySelector('#performanceHud').dataset.backend==='WebGPU');
 await before.waitForTimeout(1000);const baseline=await measure(before);await before.close();
 mobile=await managed.browser.newContext({viewport:{width:430,height:932},hasTouch:true,isMobile:true});
 await mobile.route('**/candidate/game.js*',r=>r.fulfill({contentType:'text/javascript',body:source+hook}));
 await desktop.route('**/candidate/game.js*',r=>r.fulfill({contentType:'text/javascript',body:source+hook}));
 const benchmark=await desktop.newPage();benchmark.on('pageerror',e=>errors.push(e.message));
 await benchmark.goto(origin+'/candidate/');await benchmark.locator('#startButton').click();
 await benchmark.waitForFunction(()=>__expedition.backend==='WebGPU'&&JSON.parse(render_game_to_text()).phase==='playing');
 await benchmark.waitForFunction(()=>document.querySelector('#performanceHud').dataset.backend==='WebGPU');
 const guards=await benchmark.evaluate(()=>__expedition.guards());assert.equal(guards.length,6);
 await benchmark.waitForTimeout(1000);const candidate=await measure(benchmark);await benchmark.close();
 const page=await mobile.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/candidate/');await page.locator('#startButton').tap();
 await page.waitForFunction(()=>__expedition.backend==='WebGPU'&&JSON.parse(render_game_to_text()).phase==='playing');
 await page.evaluate(()=>__expedition.arrange());await page.waitForTimeout(450);
 await page.screenshot({path:resolve(out,'rare-carrier-phone.png')});
 await page.evaluate(()=>__expedition.defeat());await page.waitForTimeout(850);
 assert.deepEqual(await page.evaluate(()=>__expedition.state()),{found:false,weapon:'auto',drops:['w04']});
 await page.screenshot({path:resolve(out,'ground-weapon-phone.png')});
 await page.keyboard.down('KeyW');
 try{await page.waitForFunction(()=>__expedition.state().found,null,{timeout:3500});}finally{await page.keyboard.up('KeyW');}
 assert.deepEqual(await page.evaluate(()=>__expedition.state()),{found:true,weapon:'auto',drops:[]});
 await page.reload();await page.waitForFunction(()=>__expedition.ready);
 await page.locator('#menuMountWorkshopButton').tap();
 await page.locator('#workshopTabs button').filter({hasText:'ΟΠΛΑ'}).tap();
 const card=page.locator('[data-blueprint="w04"]');
 assert.equal(await card.getAttribute('data-locked'),'false');await card.tap();
 assert.equal(await card.getAttribute('data-equipped'),'true');
 await page.screenshot({path:resolve(out,'workshop-found-phone.png')});
 await page.locator('#workshopClose').tap();await page.locator('#resumeCharacterButton').tap();
 await page.waitForFunction(()=>JSON.parse(render_game_to_text()).armory.weapon==='w04');
 assert.deepEqual(errors,[]);
 const result={baseline,candidate,guards,walkPickup:true,workshopReload:true,errors};
 await writeFile(resolve(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await mobile?.close();await desktop?.close();await managed.cleanup();}
