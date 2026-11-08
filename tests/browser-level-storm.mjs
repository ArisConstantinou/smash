// Native hardware before/after. Fixed contact fixtures; actual models and inputs.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const out=resolve(process.env.CODEX_TEST_OUTPUT,'level-storm');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(process.env.CODEX_WORK_OUTPUT,'temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const label=process.env.SMASH_STORM_LABEL||'before';
const ref=process.env.SMASH_STORM_REF||'';assert.ok(!ref||ref==='4d91b55cfad4ae4ab935cca4b53175fbe1ccb67e');
const source=async file=>ref?execFileSync('git',['show',ref+':'+file],{cwd:'E:/Smash',encoding:'utf8',windowsHide:true}):readFile('E:/Smash/'+file,'utf8');
const hook=`
let stormFrozen=false,stormProbe=false,stormPrevious=null,stormFrames=[],stormCpu=[];const stormFrame=frame;frame=function(t){if(stormFrozen){if(stormProbe&&stormPrevious!==null){const start=performance.now();__stormQA.live(Math.min(.05,(t-stormPrevious)/1000));stormCpu.push(performance.now()-start);stormFrames.push(t-stormPrevious);}stormPrevious=t;renderer.render(scene,camera);requestAnimationFrame(frame);}else stormFrame(t);};
window.__stormQA={get ready(){return gameReady},
 clear(lv=1){startGame(1,{test:true});stormFrozen=true;character.level=lv;character.xp=0;applyStats();for(const o of world.objects)if(Math.hypot(o.x,o.z)<22)world.relocateObject(o,500+o.mesh.userData.worldObjectIndex*10,500);for(const e of enemies){e.dead=true;e.mesh.visible=false;}player.x=player.y=player.z=player.vx=player.vy=player.vz=0;facing={x:0,z:1};poseHero(0);updateEffects(4.5);announcementTimer=0;$('announcement').hidden=true;camera.zoom=1.1;camera.updateProjectionMatrix();cameraTarget.set(0,1.4,0);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);world.updateVisibility(player);},
 step(seconds){for(let t=0;t<seconds-1e-8;t+=1/120){const dt=Math.min(1/120,seconds-t);updatePlayer(dt);updateMovingVehicles(dt);updateEnemies(dt);updateObjects(dt);vehicleEffects.update(dt,player,camera);hydrantEffects.update(dt,player,camera);if(typeof levelStorm!=='undefined')levelStorm.update(dt,player,camera);destruction.update(dt,player);updateEffects(dt);visualTime+=dt;}updateHUD(true);if(typeof levelStorm!=='undefined'){sun.intensity=2.25+levelStorm.flash;fillLight.intensity=1.45+levelStorm.flash*.45;}renderer.render(scene,camera);},
 kickCase(type,lv,rank){this.clear(lv);levels.kick=rank;applyStats();let target;
 if(type==='car'){target=world.objects.find(o=>o.type==='car');world.relocateObject(target,0,target.d/2+.85);target.mesh.visible=true;target.hp=target.maxHp=10000;}
 else{spawnEnemy('zombie',{x:.18,z:1});target=enemies.at(-1);target.hp=target.maxHp=10000;target.speed=0;target.timer=999;}
 this.target=target;const start={x:target.x,z:target.z};startKick();this.step(.25);const damage=10000-target.hp;this.step(2.75);return {type,lv,rank,damage,travel:Math.hypot(target.x-start.x,target.z-start.z)};},
 stats(lv){this.clear(lv);return {level:lv,weapon:character.weaponId,stats:{...characterStats},kick:kickStats(lv,0),punch:punchStats(lv,0)};},
 fixture(){this.clear();this.targets=[];for(const [x,z]of [[0,-3],[3,0],[10,0]]){spawnEnemy('zombie',{x,z});const e=enemies.at(-1);e.hp=e.maxHp=10000;e.speed=0;e.timer=999;this.targets.push(e);}
 const building=world.objects.find(o=>o.isBuilding);world.relocateObject(building,-building.w/2-2.3,0);building.mesh.visible=true;
 const barrel=world.objects.find(o=>o.type==='barrel');world.relocateObject(barrel,2,2);barrel.hp=20;barrel.mesh.visible=true;
 const hydrant=world.objects.find(o=>o.type==='hydrant');world.relocateObject(hydrant,0,3.5);hydrant.mesh.visible=true;
 const car=world.objects.find(o=>o.type==='car');world.relocateObject(car,3,-3);car.hp=30;car.mesh.visible=true;
 this.props={building,barrel,hydrant,car};this.step(.01);return this.state;},
 award(value=8){gainXP(value);return this.state;},
 scarImage(visible){if(typeof groundScars==='undefined')return '';groundScars.setDamagedVisible(visible);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');},
 moveAway(){player.x=9;player.z=-1;poseHero(0);renderer.render(scene,camera);},
 live(dt){updatePlayer(dt);updateMovingVehicles(dt);updateEnemies(dt);updateObjects(dt);world.update(dt,visualTime,player,'rain');vehicleEffects.update(dt,player,camera);hydrantEffects.update(dt,player,camera);if(typeof levelStorm!=='undefined'){levelStorm.update(dt,player,camera);sun.intensity=2.25+levelStorm.flash;fillLight.intensity=1.45+levelStorm.flash*.45;}destruction.update(dt,player);updateEffects(dt);visualTime+=dt;},
 probe(on){stormProbe=on;stormFrames=[];stormCpu=[];},get performance(){return {frames:stormFrames,cpu:stormCpu};},
 get state(){return {level,weapon:character.weaponId,hp:player.hp,maxHp:player.maxHp,scars:typeof groundScars==='undefined'?null:groundScars.count,enemies:(this.targets||[]).map(e=>({hp:e.hp,x:e.x,z:e.z,dead:e.dead})),props:this.props&&Object.fromEntries(Object.entries(this.props).map(([k,o])=>[k,{hp:o.hp,maxHp:o.maxHp,dead:o.dead,ruptured:!!o.ruptured,exploding:!!o.exploding}])),storm:typeof levelStorm==='undefined'?null:{pending:levelStorm.pending.length,strikes:levelStorm.strikes,active:!!levelStorm.active},backend:renderer.userData.backend,wasm:collisionWasmStatus()};}
};`;
const game=await source('game.js');
const session=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});let context;
const results={label,kicks:[],stats:[],errors:[]};
try{
 context=await session.browser.newContext({viewport:{width:1280,height:900}});
 await context.addInitScript(()=>{window.__stormGpuErrors=[];const original=GPUAdapter.prototype.requestDevice;GPUAdapter.prototype.requestDevice=async function(...a){const d=await original.apply(this,a);d.addEventListener('uncapturederror',e=>__stormGpuErrors.push(e.error.message));return d;};});
 if(ref)for(const file of ['character-progression.js','kick-physics.js','combat-tools.js','audio.js'])await context.route('**/'+file+'*',async r=>r.fulfill({status:200,contentType:'text/javascript',body:await source(file)}));
 await context.route('**/game.js*',r=>r.fulfill({status:200,contentType:'text/javascript',body:game+hook}));
 const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});await page.waitForFunction(()=>__stormQA.ready,null,{timeout:120000});await page.locator('#startButton').click();await page.waitForTimeout(2500);
 for(const type of ['zombie','car'])for(const [lv,rank]of [[1,0],[1,3],[15,0],[15,3]])results.kicks.push(await page.evaluate(({type,lv,rank})=>__stormQA.kickCase(type,lv,rank),{type,lv,rank}));
 for(const lv of [1,5,15])results.stats.push(await page.evaluate(lv=>__stormQA.stats(lv),lv));
 results.intact=await page.evaluate(()=>__stormQA.fixture());await page.screenshot({path:resolve(out,label+'-intact.png')});
 await page.evaluate(()=>__stormQA.award());await page.evaluate(()=>__stormQA.step(.06));results.strike=await page.evaluate(()=>__stormQA.state);await page.screenshot({path:resolve(out,label+'-strike.png')});
 await page.evaluate(()=>__stormQA.step(.35));await page.screenshot({path:resolve(out,label+'-shock.png')});
 await page.evaluate(()=>__stormQA.step(3));results.settled=await page.evaluate(()=>__stormQA.state);await page.screenshot({path:resolve(out,label+'-settled.png')});
 if(label==='after'){
  assert.equal(results.settled.scars,1);assert.equal(results.settled.storm.active,false);
  const without=await page.evaluate(()=>__stormQA.scarImage(false)),withScar=await page.evaluate(()=>__stormQA.scarImage(true));assert.notEqual(withScar,without,'Permanent terrain damage must change actual GPU pixels');
  results.scarPixels=true;await page.evaluate(()=>__stormQA.moveAway());await page.screenshot({path:resolve(out,'after-real-ground.png')});
 }
 await page.evaluate(()=>__stormQA.fixture());await page.waitForTimeout(1200);await page.evaluate(()=>{__stormQA.award(10000);__stormQA.probe(true);});await page.waitForTimeout(8000);
 const perf=await page.evaluate(()=>__stormQA.performance);await page.evaluate(()=>__stormQA.probe(false));
 const stats=values=>{const a=values.sort((a,b)=>a-b);return {count:a.length,p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over100:a.filter(n=>n>100).length};};
 results.performance={frames:stats(perf.frames),cpu:stats(perf.cpu)};results.multi=await page.evaluate(()=>__stormQA.state);results.gpuErrors=await page.evaluate(()=>__stormGpuErrors);
 if(label==='after'){assert.ok(results.multi.storm.strikes>=8);assert.ok(results.performance.frames.p95<16.7,'Warmed strike sequence must keep its desktop 60FPS frame budget');}
 assert.deepEqual(results.gpuErrors,[]);
 if(label==='after'){
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{__stormQA.fixture();__stormQA.award();__stormQA.step(.06);});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(out,'after-phone-strike.png')});
 }
 if(label==='after'){
  for(const type of ['zombie','car']){const list=results.kicks.filter(x=>x.type===type);assert.ok(list[0].travel>(type==='car'?8:5));assert.ok(list[1].travel>list[0].travel*1.3);assert.ok(list[2].travel>list[0].travel*1.1);}
  assert.equal(results.strike.level,2);assert.equal(results.strike.storm.strikes,1);assert.ok(results.strike.enemies[0].hp<10000);assert.equal(results.strike.enemies[2].hp,10000);
  assert.ok(results.strike.props.building.hp<results.intact.props.building.hp);assert.equal(results.strike.props.hydrant.ruptured,true);assert.equal(results.strike.props.barrel.exploding,true);
 }
 assert.match(results.strike.backend,/WebGPU/);assert.equal(results.strike.wasm.active,true);assert.deepEqual(results.errors,[]);
}finally{await writeFile(resolve(out,label+'-results.json'),JSON.stringify(results,null,2));await context?.close();await session.cleanup();await new Promise(r=>setTimeout(r,1000));}
console.log(JSON.stringify(results));
