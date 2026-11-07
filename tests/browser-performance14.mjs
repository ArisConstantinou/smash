// Actual WebGPU rendering on a CI software Vulkan adapter. NOT a hardware FPS
// benchmark. This catches WGSL/pipeline/material/buffer errors missed by Node.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'browser-evidence/perf14');await mkdir(out,{recursive:true});
const qa=`
let perf14SpinSteps=0,perf14SpinContacts=0;
const perf14OriginalUpdatePlayer=updatePlayer;
updatePlayer=function(...args){const result=perf14OriginalUpdatePlayer(...args);if(spin)perf14SpinSteps++;return result;};
const perf14OriginalHurtObject=hurtObject;
hurtObject=function(...args){const hp=args[0]?.hp;const result=perf14OriginalHurtObject(...args);if(spin&&args[0]?.hp<hp)perf14SpinContacts++;return result;};
window.__perf14={get spinEvidence(){return {steps:perf14SpinSteps,contacts:perf14SpinContacts,active:!!spin}},get ready(){return gameReady},get renderer(){return renderer},get phase(){return phase},get hero(){return hero},get player(){return player},get world(){return world},get stats(){return stats},get levels(){return levels},get effects(){return vehicleEffects},get telemetry(){return performanceMonitor},get wasm(){return collisionWasmStatus()},startGame,applyStats,poseHero,hurtObject,pressAttack,releaseAttack,startKick,startLeap,armAirSmash,updatePlayer,updateMovingVehicles,updateObjects,updateGame,
prepare(percent){startGame(15,{test:true});perf14SpinSteps=perf14SpinContacts=0;player.invincible=1e9;const total=world.objects.reduce((n,o)=>n+o.weight,0);let done=0;for(const o of world.objects){if(Math.hypot(o.x,o.z)<25)continue;if(done/total*100>=percent)break;hurtObject(o,o.hp+1);done+=o.weight;}return destructionPercent(world.objects);},
large(){levels.size=12;levels.range=14;applyStats();poseHero(0);},
faceBuilding(){const o=world.buildingObjects.find(o=>!o.dead&&Math.hypot(o.x,o.z)<25);if(!o)throw new Error('No live building fixture');Object.assign(player,{x:o.x,z:o.z-o.d/2-1.2,y:0,vx:0,vz:0,vy:0});facing={x:0,z:1};Object.assign(aim,{x:0,z:1});pointer.active=false;poseHero(0);return {type:o.type,x:o.x,z:o.z,hp:o.hp};},
vehicles(){const list=world.objects.filter(o=>['car','policecar','ambulance'].includes(o.type)&&!o.dead);return list.slice(0,5).map((o,i)=>{world.relocateObject(o,(i-2)*4,7,false);hurtObject(o,o.maxHp*(i%2?.5:.8));return {x:o.x,z:o.z,hp:o.hp,maxHp:o.maxHp};});},
armLengths(){const u=hero.userData;return [u.leftArm,u.rightArm].map(a=>[a.userData.upper.scale.y,a.userData.fore.scale.y]);}}
`;
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+(new URL(req.url,'http://localhost').pathname||'/'));const f=path===root.replace(/\/$/,'')?resolve(root,'index.html'):path;if(!f.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}let data=await readFile(f);if(f===resolve(root,'game.js'))data=Buffer.from(data.toString()+qa);res.writeHead(200,{'Content-Type':types[extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader']});
const results=[];
try{
 for(const size of [{name:'desktop',width:1440,height:900},{name:'phone',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},hasTouch:size.name==='phone',deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];let closing=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/404|Failed to load resource/.test(m.text())&&!(closing&&/Device was destroyed/.test(m.text())))errors.push(m.text());});
  try{
   await page.goto(origin+'/index.html',{waitUntil:'networkidle',timeout:180000});
   await page.waitForFunction(()=>window.__perf14?.ready||!document.querySelector('#fatalError').hidden,null,{timeout:180000});
   const boot=await page.evaluate(()=>({ready:__perf14.ready,fatal:document.querySelector('#fatalText').textContent,backend:__perf14.renderer?.backend?.isWebGPUBackend,wasm:__perf14.wasm}));
   assert.equal(boot.ready,true,JSON.stringify(boot));assert.equal(boot.backend,true);assert.equal(boot.wasm.active,true);
   await page.evaluate(()=>{const d=__perf14.renderer.backend.device;window.__gpuErrors=[];d.addEventListener('uncapturederror',e=>window.__gpuErrors.push(e.error.message));});
   await page.locator('#startButton').click();
   await page.waitForFunction(()=>document.querySelector('#performanceHud').textContent.includes('FPS · WebGPU · WASM'),null,{timeout:30000});
   const box=await page.locator('#performanceHud').boundingBox();assert.ok(box.x>size.width*.4&&box.y<35&&box.x+box.width<=size.width);
   await page.screenshot({path:resolve(out,size.name+'-fps.png')});
   const measured=[];
   for(const percent of [0,38,45]){
    const actual=await page.evaluate(p=>{const a=__perf14.prepare(p);__perf14.large();__perf14.faceBuilding();return a;},percent);
    await page.evaluate(()=>{__perf14.pressAttack();});
    await page.waitForFunction(()=>__perf14.spinEvidence.steps>=12&&__perf14.spinEvidence.contacts>=1,null,{timeout:90000});
    await page.waitForTimeout(900);
    const spinEvidence=await page.evaluate(()=>__perf14.spinEvidence);
    assert.ok(spinEvidence.steps>=12&&spinEvidence.contacts>=1,'The stress test must actually spin and damage a building');
    await page.evaluate(()=>__perf14.releaseAttack());await page.waitForTimeout(800);
    measured.push(await page.evaluate(actual=>({destruction:actual,spin:__perf14.spinEvidence,frame:__perf14.telemetry.last,wasm:__perf14.wasm,arms:__perf14.armLengths()}),actual));
    for(const [upper,fore]of measured.at(-1).arms){assert.ok(upper<=.441&&fore<=.461,'Oversized weapon must not elongate arm bones');}
    assert.equal(await page.evaluate(()=>window.__perf14.renderer.backend.isWebGPUBackend),true);
    await page.screenshot({path:resolve(out,size.name+'-destruction-'+percent+'.png')});
   }
   await page.evaluate(()=>{__perf14.prepare(0);__perf14.vehicles();});await page.waitForTimeout(1800);
   const effect=await page.evaluate(()=>({smoke:__perf14.effects.smoke.count,fire:__perf14.effects.fire.count}));assert.ok(effect.smoke>0&&effect.fire>0);
   await page.screenshot({path:resolve(out,size.name+'-vehicle-fire.png')});
   const gpuErrors=await page.evaluate(()=>window.__gpuErrors);assert.deepEqual(gpuErrors,[]);assert.deepEqual(errors,[]);
   results.push({name:size.name,passed:true,backend:'WebGPU',adapter:'CI software SwiftShader; not user hardware',measured,effect});
  }catch(error){const debug=await page.evaluate(()=>({gpuErrors:window.__gpuErrors,spin:window.__perf14?.spinEvidence,frame:window.__perf14?.telemetry?.last})).catch(()=>null);results.push({name:size.name,passed:false,error:String(error.stack),errors,debug});await page.screenshot({path:resolve(out,size.name+'-failure.png')}).catch(()=>{});throw error;}
  finally{closing=true;await context.close();await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));}
 }
 const context=await browser.newContext();await context.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined}));const page=await context.newPage();
 await page.goto(origin+'/index.html',{waitUntil:'networkidle'});await page.waitForFunction(()=>!document.querySelector('#fatalError').hidden);
 assert.match(await page.locator('#fatalText').textContent(),/WebGPU/);assert.equal(await page.evaluate(()=>!!window.__perf14.renderer),false);
 results.push({name:'missing-WebGPU',passed:true,noSilentFallback:true});await context.close();
}finally{await writeFile(resolve(out,'results.json'),JSON.stringify(results,null,2));await browser.close();server.close();}
console.log(JSON.stringify(results,null,2));
