// Native Windows hardware check. No software adapter overrides or production mutation.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assertScenePixels} from './browser-scene-health.mjs';
const {chromium}=await import(process.env.SMASH_PLAYWRIGHT || 'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(process.env.CODEX_TEST_OUTPUT || resolve(root,'browser-evidence'),'local');await mkdir(out,{recursive:true});
const source=await readFile(resolve(root,'tests/browser-performance14.mjs'),'utf8');
const historicalRef=process.env.SMASH_REF||'';
assert.ok(['','origin/main','origin/feature/performance14-webgpu'].includes(historicalRef),'Use a verified source ref');
const legacy=historicalRef==='origin/main';
const legacyShim=legacy?`const performanceMonitor={reset(){},history:[],last:null};const collisionWasmStatus=()=>({active:false,ready:false,note:'Published main has no WASM kernel'});let vehicleEffects=null;`:'';
const qa=legacyShim+source.match(/const qa=`([\s\S]*?)`;/)[1]+`
window.__local={get scene(){return scene},get camera(){return camera},get destruction(){return destruction},get enemies(){return enemies},get spin(){return spin},get swing(){return swing}};
window.__frameIntervals=[];let previousProbeFrame=null;const probeFrame=t=>{if(previousProbeFrame!==null)__frameIntervals.push(t-previousProbeFrame);previousProbeFrame=t;if(__frameIntervals.length>5000)__frameIntervals.shift();requestAnimationFrame(probeFrame);};requestAnimationFrame(probeFrame);
window.__resetProbe=()=>{__frameIntervals.length=0;previousProbeFrame=null;performanceMonitor.reset();performanceMonitor.history.length=0;};
window.__setWasm=async value=>(await import('./collision-wasm.js?v=20261107-perf14')).setCollisionWasmEnabled(value);
window.__pendingQA={
 stagedCars(){startGame(15,{test:true});const list=world.objects.filter(o=>isVehicle(o)&&!o.dead).slice(0,3);list.forEach((o,i)=>{world.relocateObject(o,0,5+i*6);if(i)hurtObject(o,o.maxHp*(i===1?.5:.8));});player.x=3;player.z=11;camera.zoom=1.2;camera.updateProjectionMatrix();announcementTimer=0;$('announcement').hidden=true;return list.map(o=>({type:o.type,hp:o.hp,maxHp:o.maxHp,x:o.x,z:o.z}));},
 foregroundRubble(){const list=destruction.debris;for(let i=0;i<list.length;i++){const p=list[i];p.mesh.position.set(player.x+(i%12-5.5)*1.1,.08+p.halfY,player.z+(Math.floor(i/12)-4)*1.1);p.vx=p.vy=p.vz=0;p.settled=true;p.support=null;p.life=100;}destruction.update(.001,player);return {pieces:list.length,vertices:list.reduce((n,p)=>n+p.mesh.geometry.attributes.position.count,0)};},
 viewCars(){player.x=0;player.z=7;camera.zoom=1.4;camera.updateProjectionMatrix();announcementTimer=0;$('announcement').hidden=true;},
 pose(twoHanded,action){startGame(15,{test:true});levels.size=12;levels.range=14;applyStats();stance=stanceTarget=twoHanded?1:0;hero.userData.setStance(stance);poseHero(0);
  if(action==='strike'){pressAttack();releaseAttack();}else if(action==='spin'){pressAttack();}
  for(let i=0;i<(action==='spin'?100:action==='strike'?20:0);i++)updatePlayer(1/120);
  setPhase('paused');camera.zoom=3;camera.updateProjectionMatrix();cameraTarget.set(player.x,.6+player.y,player.z);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);renderer.render(scene,camera);
  const u=hero.userData,v=new THREE.Vector3(),w=new THREE.Vector3();return [u.leftArm,u.rightArm].map((a,i)=>({upper:a.userData.upper.scale.y,fore:a.userData.fore.scale.y,reach:a.getWorldPosition(v).distanceTo([u.leftGrip,u.rightGrip][i].getWorldPosition(w))}));
 },
 car(){startGame(15,{test:true});const car=world.objects.find(o=>o.type==='car'&&!o.dead);if(!car)throw Error('No car');this.kickedCar=car;world.relocateObject(car,0,car.d/2+.85);Object.assign(player,{x:0,y:0,z:0,vx:0,vz:0});facing={x:0,z:1};Object.assign(aim,{x:0,z:1});poseHero(0);camera.zoom=1;camera.updateProjectionMatrix();startKick();return {x:car.x,z:car.z,hp:car.hp,w:car.w,d:car.d};},
 get cars(){return world.objects.filter(o=>isVehicle(o)&&!o.dead).map(o=>({x:o.x,z:o.z,hp:o.hp,crashCount:o.crashCount||0}));}
};
window.render_game_to_text=()=>JSON.stringify({phase,player:{x:player.x,y:player.y,z:player.z},spin:!!spin,destruction:destructionPercent(world.objects),wasm:collisionWasmStatus(),frame:performanceMonitor.last});
window.advanceTime=()=>new Promise(resolve=>requestAnimationFrame(resolve));
`;
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.webp':'image/webp','.mp3':'audio/mpeg'};
const historicalFiles=new Map();
const server=createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),f=resolve(root,'.'+(path==='/'?'/index.html':path));
 if(!f.startsWith(root.endsWith(sep)?root:root+sep))throw Error('path');
 let data;
 if(historicalRef){const rel=f.slice(root.length).replaceAll('\\','/');if(!historicalFiles.has(rel))historicalFiles.set(rel,execFileSync('git',['show',historicalRef+':'+rel],{cwd:root,maxBuffer:4*1024*1024,windowsHide:true}));data=historicalFiles.get(rel);}
 else data=await readFile(f);
 if(f===resolve(root,'game.js'))data=Buffer.from(data.toString()+qa);
 res.writeHead(200,{'Content-Type':types[extname(f)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
}catch{res.writeHead(404).end();}});
await new Promise((r,j)=>{server.once('error',j);server.listen(8000,'127.0.0.1',r);});
let browser,managed;const results=[];
const label=process.argv[2]||'before';
const rendererMode=process.argv[3]||'webgpu';
const resultFile=resolve(out,label+(process.env.SMASH_VISUALS_ONLY==='1'?'-visual-results.json':'-results.json'));
if(label==='client'){
 try{
  assert.ok(process.env.SMASH_GAME_CLIENT,'SMASH_GAME_CLIENT must point to the installed develop-web-game client');
  await promisify(execFile)(process.execPath,[process.env.SMASH_GAME_CLIENT,'--url','http://127.0.0.1:8000/','--click-selector','#startButton','--actions-json',JSON.stringify({steps:[{buttons:['left_mouse_button'],frames:120,mouse_x:680,mouse_y:360},{buttons:['right'],frames:12},{buttons:['space'],frames:2},{buttons:[],frames:60}]}),'--iterations','2','--pause-ms','250','--screenshot-dir',resolve(out,'client')],{timeout:180000,windowsHide:true});
 }finally{await new Promise(r=>server.close(r));}
 process.exit(0);
}
try{
 if(process.env.SMASH_BROWSER_LIFECYCLE){
  const {launchManagedBrowser}=await import(process.env.SMASH_BROWSER_LIFECYCLE);
  managed=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});browser=managed.browser;
 }else browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.addInitScript(()=>{
  window.__gpuErrors=[];window.__gpuCounts={buffers:0,bytes:0,pipelines:0};
  if(!globalThis.GPUAdapter)return;
  const original=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(...a){const d=await original.apply(this,a);window.__adapter={vendor:this.info.vendor,device:this.info.device,description:this.info.description,architecture:this.info.architecture};
   d.addEventListener('uncapturederror',e=>window.__gpuErrors.push(e.error.message));
   d.lost.then(e=>window.__gpuErrors.push('DEVICE LOST '+e.reason+' '+e.message));
   for(const [method,key]of [['createBuffer','buffers'],['createRenderPipeline','pipelines'],['createRenderPipelineAsync','pipelines']]){const f=d[method].bind(d);d[method]=(...a)=>{window.__gpuCounts[key]++;if(key==='buffers')window.__gpuCounts.bytes+=a[0].size;return f(...a);};}return d;
  };
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:8000/?renderer='+rendererMode,{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>window.__perf14?.ready||!document.querySelector('#fatalError').hidden,null,{timeout:120000});
 const boot=await page.evaluate(()=>({ready:__perf14.ready,fatal:document.querySelector('#fatalText').textContent,adapter:window.__adapter,errors:window.__gpuErrors,counts:window.__gpuCounts,wasm:__perf14.wasm}));
 results.push({boot,errors});await page.screenshot({path:resolve(out,label+'-boot.png')});
 if(boot.ready){await page.locator('#startButton').click();await page.waitForTimeout(3000);
  results.push({sampledColors:await assertScenePixels(page)});
  if(process.env.SMASH_CPU_RATE){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.SMASH_CPU_RATE)});}
  results.push(await page.evaluate(()=>({phase:__perf14.phase,frame:__perf14.telemetry.last,errors:window.__gpuErrors,counts:window.__gpuCounts})));
  await page.screenshot({path:resolve(out,label+'-game.png')});
  for(const wasm of (process.env.SMASH_VISUALS_ONLY==='1'?[]:legacy?[false]:process.env.SMASH_CPU_RATE?[true]:[true,false]))for(const percent of (process.env.SMASH_CPU_RATE?[38]:[0,38,45])){
   const fixture=await page.evaluate(async({percent,wasm,legacy,foreground})=>{if(!legacy)await __setWasm(wasm);const actual=__perf14.prepare(percent);__perf14.large();const target=__perf14.faceBuilding();const rubble=foreground?__pendingQA.foregroundRubble():null;return {actual,target,rubble};},{percent,wasm,legacy,foreground:process.env.SMASH_FOREGROUND_RUBBLE==='1'});
   await page.waitForTimeout(600);
   await page.evaluate(()=>{__resetProbe();__perf14.pressAttack();});
   await page.waitForTimeout(5000);
   const state=await page.evaluate(()=>({spin:__perf14.spinEvidence,frame:__perf14.telemetry.last,history:__perf14.telemetry.history,intervals:__frameIntervals,collision:__perf14.world.collisionDiagnostics,gpu:__gpuCounts,errors:__gpuErrors,wasm:__perf14.wasm,arms:__perf14.armLengths()}));
   const sorted=state.intervals.sort((a,b)=>a-b);state.frames={count:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],max:sorted.at(-1),over50:sorted.filter(n=>n>50).length};delete state.intervals;
   await page.evaluate(()=>__perf14.releaseAttack());
   results.push({fixture,wasm,percent,state});
   assert.ok(state.spin.contacts>0&&state.spin.steps>12,'Stress fixture must hit buildings with whirlwind');
   assert.deepEqual(state.errors,[]);
   await page.screenshot({path:resolve(out,label+'-'+(wasm?'wasm':'js')+'-'+percent+'.png')});
   await writeFile(resultFile,JSON.stringify(results,null,2));console.log('stress',wasm,percent,JSON.stringify(state.frames),JSON.stringify(state.spin));
  }
  if(process.env.SMASH_PENDING_QA==='1'){
   for(const two of [false,true])for(const action of ['rest','strike','spin']){
    const arms=await page.evaluate(({two,action})=>__pendingQA.pose(two,action),{two,action});
    if(!legacy)for(const a of arms){assert.ok(a.upper<=.441&&a.fore<=.461&&a.reach<=.901,JSON.stringify(a));}
    const png=await page.evaluate(()=>{__perf14.renderer.render(__perf14.scene,__perf14.camera);return __perf14.renderer.domElement.toDataURL('image/png');});
    await writeFile(resolve(out,label+'-hands-'+(two?'two':'one')+'-'+action+'.png'),Buffer.from(png.split(',')[1],'base64'));results.push({two,action,arms});
   }
   if(!legacy){
   const stagedCars=await page.evaluate(()=>__pendingQA.stagedCars());await page.waitForTimeout(3500);results.push({stagedCars});
   const effects=await page.evaluate(()=>({smoke:__perf14.effects.smoke.count,fire:__perf14.effects.fire.count}));assert.ok(effects.smoke>0&&effects.fire>0);results.push({effects});
   await page.screenshot({path:resolve(out,label+'-car-fire.png')});
   const kicked=await page.evaluate(()=>__pendingQA.car());await page.waitForTimeout(5000);
   const landed=await page.evaluate(()=>({x:__pendingQA.kickedCar.x,z:__pendingQA.kickedCar.z,hp:__pendingQA.kickedCar.hp}));
   console.log('native-kick',JSON.stringify({kicked,landed}));assert.ok(Math.hypot(landed.x-kicked.x,landed.z-kicked.z)>5,'A real native-browser kick must move the actual vehicle several metres: '+JSON.stringify({kicked,landed}));results.push({kicked,landed});
   }
  }
 }
 await writeFile(resultFile,JSON.stringify(results,null,2));console.log(JSON.stringify(results.slice(0,2),null,2));
 assert.equal(boot.ready,true,boot.fatal);assert.deepEqual(errors,[]);
}finally{if(managed)await managed.cleanup();else await browser?.close();await new Promise(r=>server.close(r));}
