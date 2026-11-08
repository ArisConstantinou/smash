// Native WebGPU evidence for actual city props and real multi-touch movement.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const out=resolve(process.env.CODEX_TEST_OUTPUT,'city-props');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(process.env.CODEX_WORK_OUTPUT,'temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const label=process.env.SMASH_PROPS_LABEL||'before';
const reference=process.env.SMASH_PROPS_REF||'';
assert.ok(!reference||reference==='0ae206b6da323a990e12c536057d3c24b40fe7c0');
const source=async name=>reference?execFileSync('git',['show',reference+':'+name],{cwd:'E:/Smash',encoding:'utf8',windowsHide:true}):readFile('E:/Smash/'+name,'utf8');
const hook=`
let propFrozen=false,propProbe=false,propLast=null,propIntervals=[],propCpu=[];const propFrame=frame;frame=function(t){if(propFrozen){const last=propLast;propLast=t;if(propProbe&&last!==null){const start=performance.now();if(typeof hydrantEffects!=='undefined')hydrantEffects.update(Math.min(.05,(t-last)/1000),player,camera);propCpu.push(performance.now()-start);propIntervals.push(t-last);}renderer.info.reset();renderer.render(scene,camera);requestAnimationFrame(frame);}else propFrame(t);};
window.__cityQA={get ready(){return gameReady},get state(){return {player:{x:player.x,y:player.y,z:player.z},direction:movementDirection(),touch:{...touch},leap:leap&&{dir:{...leap.dir},time:leap.time}}},
 clear(){startGame(15,{test:true});propFrozen=true;for(const o of world.objects)if(Math.hypot(o.x,o.z)<20)world.relocateObject(o,500+o.mesh.userData.worldObjectIndex*10,500);for(const e of enemies)e.dead=true;player.x=player.z=player.y=0;player.vx=player.vz=player.vy=0;poseHero(0);updateEffects(4.5);announcementTimer=0;$('announcement').hidden=true;camera.zoom=1.6;camera.updateProjectionMatrix();cameraTarget.set(0,.6,0);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);renderer.render(scene,camera);},
 centre(){clearInput();leap=null;leapCooldown=0;dashTime=0;landingRecovery=0;Object.assign(player,{x:0,y:0,z:0,vx:0,vy:0,vz:0});poseHero(0);},
 step(seconds){for(let t=0;t<seconds-1e-8;t+=1/120)updatePlayer(Math.min(1/120,seconds-t));renderer.render(scene,camera);return this.state;},
 props(){this.clear();this.barrel=world.objects.find(o=>o.type==='barrel');world.relocateObject(this.barrel,0,0);this.car=world.objects.find(o=>o.type==='car');world.relocateObject(this.car,3.2,0);this.car.hp=60;player.x=-2.8;player.z=1;poseHero(0);world.updateVisibility(player);renderer.render(scene,camera);return {barrel:this.barrel.type,car:this.car.type};},
 hit(){hurtObject(this.barrel,this.barrel.hp+1);},
 effects(seconds){for(let t=0;t<seconds-1e-8;t+=1/120){const dt=Math.min(1/120,seconds-t);updateObjects(dt);vehicleEffects.update(dt,player,camera);if(typeof hydrantEffects!=='undefined')hydrantEffects.update(dt,player,camera);updateEffects(dt);}renderer.render(scene,camera);return this.propState;},
 hydrants(count=1,hit=true){this.clear();const objects=world.objects.filter(o=>o.type==='hydrant').slice(0,count);objects.forEach((o,i)=>{world.relocateObject(o,count===1?0:(i%4)*2.3-3.4,Math.floor(i/4)*4);if(hit)hurtObject(o,1);});player.x=-3;player.z=2;poseHero(0);camera.zoom=count===1?1.8:1.15;camera.updateProjectionMatrix();cameraTarget.set(0,1.4,0);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);world.updateVisibility(player);this.effects(.4);return {visible:objects.map(o=>o.mesh.visible),count:objects.length,triangles:objects.reduce((n,o)=>{o.mesh.traverse(m=>{if(m.isMesh)n+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3});return n;},0)};},
 hitHydrant(){const o=world.objects.find(o=>o.type==='hydrant');hurtObject(o,1);this.effects(.4);},
 naturalHydrant(hit=false){
  startGame(15,{test:true});propFrozen=true;const o=world.objects.filter(o=>o.type==='hydrant').sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
  for(let i=0;i<16;i++){const a=i*Math.PI/8,x=o.x+Math.cos(a)*2.5,z=o.z+Math.sin(a)*2.5;if(world.clearBody(x,z,0,player.radius,1.9)&&world.supportHeight(x,z,player.radius,.2)<.2){player.x=x;player.z=z;break;}}
  player.y=0;poseHero(0);updateEffects(4.5);announcementTimer=0;$('announcement').hidden=true;camera.zoom=1.6;camera.updateProjectionMatrix();cameraTarget.set(o.x,1.4,o.z);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);world.updateVisibility(player);updateBattleVisibility();this.natural=o;
  if(hit)hurtObject(o,1);this.effects(.4);return {x:o.x,z:o.z,caps:o.mesh.userData.caps.length,visible:o.mesh.visible,ruptured:!!o.ruptured};
 },
 hitNatural(){hurtObject(this.natural,1);this.effects(.4);return {ruptured:this.natural.ruptured,visible:this.natural.mesh.visible};},
 probe(on){propProbe=on;propIntervals=[];propCpu=[];},get performance(){return {intervals:propIntervals,cpu:propCpu,calls:renderer.info.render.calls,geometries:renderer.info.memory.geometries};},
 get propState(){const b=this.barrel;return {barrel:{dead:b.dead,exploding:!!b.exploding,complete:!!b.explosionComplete},car:{dead:this.car.dead,exploding:!!this.car.exploding},fire:vehicleEffects.fire.count,blast:vehicleEffects.explosion.geometry.drawRange.count,backend:renderer.userData.backend,wasm:collisionWasmStatus()};}
};`;
const game=await source('game.js');
const session=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});
let context;const results={label,errors:[],movement:[]};
try{
 context=await session.browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 await context.addInitScript(()=>{
  window.__propGpuErrors=[];window.__propGpuAlloc={buffers:0,pipelines:0};if(!globalThis.GPUAdapter)return;
  const request=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(...args){const device=await request.apply(this,args);device.addEventListener('uncapturederror',e=>__propGpuErrors.push(e.error.message));
   for(const [method,key]of [['createBuffer','buffers'],['createRenderPipeline','pipelines'],['createRenderPipelineAsync','pipelines']]){const original=device[method].bind(device);device[method]=(...a)=>{__propGpuAlloc[key]++;return original(...a);};}return device;};
 });
 if(reference)for(const name of ['core.js','models.js','world.js','vehicle-effects.js'])await context.route('**/'+name+'*',async r=>r.fulfill({status:200,contentType:'text/javascript',body:await source(name)}));
 await context.route('**/game.js*',r=>r.fulfill({status:200,contentType:'text/javascript',body:game+hook}));
 const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});await page.waitForFunction(()=>__cityQA.ready,null,{timeout:120000});await page.locator('#startButton').click();await page.waitForTimeout(3000);
 await page.evaluate(()=>__cityQA.clear());
 const cdp=await context.newCDPSession(page),r=await page.locator('#joystick').boundingBox(),cx=r.x+r.width/2,cy=r.y+r.height/2,rad=r.width*.34;
 const touch=async(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=1])=>({x,y,id,radiusX:2,radiusY:2,force:1}))});
 for(let i=0;i<16;i++){
  await page.evaluate(()=>__cityQA.centre());const angle=i*Math.PI/8;
  await touch('touchStart',[[cx,cy]]);await touch('touchMove',[[cx+Math.cos(angle)*rad,cy+Math.sin(angle)*rad]]);
  const start=await page.evaluate(()=>__cityQA.state),end=await page.evaluate(()=>__cityQA.step(.12));
  const dx=end.player.x,dz=end.player.z,travel=Math.hypot(dx,dz),alignment=(dx*start.direction.x+dz*start.direction.z)/travel;
  assert.ok(travel>.1&&alignment>.999,'Actual joystick must retain arbitrary angles');results.movement.push({angle,travel,alignment,touch:start.touch});await touch('touchEnd',[]);
 }
 await page.evaluate(()=>__cityQA.centre());await page.keyboard.down('w');await page.keyboard.down('d');results.keyboard=await page.evaluate(()=>__cityQA.step(.12));await page.keyboard.up('w');await page.keyboard.up('d');
 assert.ok(Math.abs(results.keyboard.player.x)>.1&&Math.abs(results.keyboard.player.z)>.01,'Two real keys must preserve diagonal movement');
 await page.evaluate(()=>__cityQA.centre());await touch('touchStart',[[cx,cy]]);await touch('touchMove',[[cx+rad,cy]]);
 const jump=await page.locator('#leapButton').boundingBox();await touch('touchStart',[[cx+rad,cy],[jump.x+jump.width/2,jump.y+jump.height/2,2]]);
 await touch('touchEnd',[[cx+rad,cy]]);const takeoff=await page.evaluate(()=>__cityQA.step(.1));
 await touch('touchMove',[[cx+rad*.31,cy-rad*.95]]);const input=await page.evaluate(()=>__cityQA.state);const air=await page.evaluate(()=>__cityQA.step(.12));await touch('touchEnd',[]);
 results.air={takeoff,input,air};assert.ok(takeoff.leap&&air.player.y>0);
 if(label==='after'&&process.env.SMASH_AIR_STEERING==='1'){const dir=air.leap.dir,desired=input.direction;assert.ok(dir.x*desired.x+dir.z*desired.z>.8,'Jump must respond to a changed joystick direction');}
 await page.screenshot({path:resolve(out,label+'-movement.png')});
 await page.evaluate(()=>__cityQA.props());await page.screenshot({path:resolve(out,label+'-intact.png')});
 await page.evaluate(()=>__cityQA.hit());results.warning=await page.evaluate(()=>__cityQA.effects(.3));await page.screenshot({path:resolve(out,label+'-warning.png')});
 results.burst=await page.evaluate(()=>__cityQA.effects(.95));await page.screenshot({path:resolve(out,label+'-burst.png')});
 results.settled=await page.evaluate(()=>__cityQA.effects(4));
 if(label==='after'){assert.equal(results.warning.barrel.dead,false);assert.equal(results.warning.barrel.exploding,true);assert.equal(results.burst.barrel.complete,true);assert.ok(results.burst.blast>0);assert.equal(results.burst.car.exploding,true);assert.equal(results.settled.fire,0);}
 results.hydrant=await page.evaluate(()=>__cityQA.hydrants(1,false));await page.screenshot({path:resolve(out,label+'-hydrant-intact.png')});
 if(results.hydrant.count){await page.evaluate(()=>__cityQA.hitHydrant());await page.screenshot({path:resolve(out,label+'-hydrant-water.png')});await page.evaluate(()=>__cityQA.effects(.3));await page.screenshot({path:resolve(out,label+'-hydrant-water-later.png')});await page.setViewportSize({width:1280,height:900});await page.screenshot({path:resolve(out,label+'-hydrant-wide.png')});await page.setViewportSize({width:390,height:844});}
 if(label==='after')assert.ok(results.hydrant.visible.every(Boolean));
 results.stress=await page.evaluate(()=>__cityQA.hydrants(8));
 await page.evaluate(()=>__cityQA.probe(true));await page.waitForTimeout(800);const gpuBefore=await page.evaluate(()=>({...__propGpuAlloc}));await page.evaluate(()=>__cityQA.probe(true));await page.waitForTimeout(3000);
 const measured=await page.evaluate(()=>__cityQA.performance);await page.evaluate(()=>__cityQA.probe(false));
 const stats=values=>{const a=values.sort((a,b)=>a-b);return {frames:a.length,p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1),over100:a.filter(n=>n>100).length};};
 results.performance={frames:stats(measured.intervals),waterCpu:stats(measured.cpu),calls:measured.calls,geometries:measured.geometries};
 results.gpu=await page.evaluate(()=>({alloc:{...__propGpuAlloc},errors:__propGpuErrors}));assert.deepEqual(results.gpu.errors,[]);assert.deepEqual(results.gpu.alloc,gpuBefore,'Continuous water must not create GPU buffers or pipelines');
 await page.screenshot({path:resolve(out,label+'-hydrant-stress.png')});
 if(label==='after'){
  await page.setViewportSize({width:1280,height:900});results.natural=await page.evaluate(()=>__cityQA.naturalHydrant());await page.screenshot({path:resolve(out,'after-curb-intact.png')});
  results.naturalHit=await page.evaluate(()=>__cityQA.hitNatural());assert.equal(results.natural.caps,3);assert.equal(results.natural.visible,true);assert.equal(results.naturalHit.ruptured,true);assert.equal(results.naturalHit.visible,true);
  await page.screenshot({path:resolve(out,'after-curb-water.png')});
 }
 assert.match(results.burst.backend,/WebGPU/);assert.equal(results.burst.wasm.active,true);assert.deepEqual(results.errors,[]);
}finally{await writeFile(resolve(out,label+'-results.json'),JSON.stringify(results,null,2));await context?.close();await session.cleanup();await new Promise(r=>setTimeout(r,1000));}
console.log(JSON.stringify(results));
