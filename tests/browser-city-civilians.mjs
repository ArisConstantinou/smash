import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const stage=process.env.CODEX_GENERATED_OUTPUT||'E:/CodexGenerated/smash/staging';
const out=resolve(stage,'tests/city-civilians');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(stage,'work/temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const source=(await readFile('game.js','utf8')).replace('updateBattleCamera(realDt,desired);','updateBattleCamera(realDt,window.__civCamera?.()||desired);');
const hook=`
window.__civiliansQA={
  get backend(){return renderer.userData.backend},
  actor(id=0){return world.civilians.actors.find(a=>a.id===id);},
  state(id=0){
    const a=this.actor(id),feet=a.rig.feet.map(f=>f.getWorldPosition(new THREE.Vector3()).toArray());
    return {mode:a.mode,x:a.x,z:a.z,y:a.y,feet,clear:world.clearBody(a.x,a.z,a.y,a.radius,a.height)};
  },
  quiet(){wave.timer=100;player.invincible=100;$('announcement').hidden=true;},
  round(civilians){window.__civCamera=null;cameraOffset.set(13,23,18);resize();startGame(1,{camps:false,civilians});this.quiet();},
  follow(zoom=1.8){
    const a=this.actor();cameraOffset.set(1.3,23,25);window.__civCamera=()=>new THREE.Vector3(a.x,.74,a.z-.67);
    cameraTarget.copy(window.__civCamera());resize();camera.left/=zoom;camera.right/=zoom;camera.top/=zoom;camera.bottom/=zoom;camera.updateProjectionMatrix();
  },
  obstacle(){
    const a=this.actor();Object.assign(a,{x:0,z:6.8,y:0,target:null,decision:0,facing:0});
    const car=world.objects.find(o=>o.type==='car');world.relocateObject(car,1.5,12);world.rebuildSpatialIndex();
    return {x:car.x,z:car.z,w:car.w,d:car.d};
  },
  threat(){const a=this.actor(),e=spawnEnemy('zombie',{x:a.x,z:a.z-3.1});e.speed=0;e.timer=100;return {x:e.x,z:e.z};},
  removeThreat(){for(const e of enemies)disposeInstance(e);enemies=[];},
  playerThreat(){
    const a=this.actor();Object.assign(player,{x:a.x,z:a.z-2.5,y:0,vx:0,vz:0,vy:0});
    return world.hasLineOfSight(a.x,a.z,player.x,player.z,.07);
  },
  playerSwing(){return !!(swing||spin);},
  aim(){const a=this.actor(),p=screenPoint(a.x,a.y+.8,a.z);return {x:p.x,y:p.y};},
  collapse(){const a=this.actor();const distance=o=>Math.hypot(o.x-a.x,o.z-a.z);const o=world.objects.filter(o=>o.isBuilding).sort((p,q)=>distance(p)-distance(q))[0];hurtObject(o,o.hp+50,1);return {dead:o.dead,x:o.x,z:o.z};},
};`;

function sample(page){
  return page.evaluate(()=>new Promise(resolve=>{
    const intervals=[];let first,last;
    const tick=now=>{
      first??=now;
      if(last!==undefined)intervals.push(now-last);
      last=now;
      if(now-first<2100){requestAnimationFrame(tick);return;}
      intervals.sort((a,b)=>a-b);
      resolve({frames:intervals.length,p95:intervals[Math.ceil(intervals.length*.95)-1],max:intervals.at(-1)});
    };
    requestAnimationFrame(tick);
  }));
}
const browser=await launchManagedBrowser(chromium,{channel:'chrome',headless:true,screenshotDir:out});
let context;
const errors=[];
try{
  context=await browser.browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/candidate/game.js*',route=>route.fulfill({contentType:'text/javascript',body:source+hook}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8000/candidate/');
  await page.locator('#startButton').click();
  await page.waitForFunction(()=>__civiliansQA.backend==='WebGPU'&&JSON.parse(render_game_to_text()).civilians?.length>=4);
  const residents=await page.evaluate(()=>JSON.parse(render_game_to_text()).civilians);
  assert.equal(new Set(residents.map(a=>a.kind)).size,3);
  await page.evaluate(()=>__civiliansQA.round(false));await page.waitForTimeout(850);
  const before=await sample(page);await page.screenshot({path:resolve(out,'street-before.png')});
  await page.evaluate(()=>__civiliansQA.round(true));await page.waitForTimeout(850);
  const after=await sample(page);await page.screenshot({path:resolve(out,'street-after.png')});

  await page.evaluate(()=>{__civiliansQA.round(true);__civiliansQA.obstacle();__civiliansQA.follow();});
  await page.waitForTimeout(900);
  await page.screenshot({path:resolve(out,'civilian-walk.png')});
  await page.evaluate(()=>{
    const stream=document.querySelector('#gameCanvas').captureStream(30);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:4_000_000});
    const parts=[];recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
    window.__civRecorder={stream,recorder,parts};recorder.start(300);
  });
  const threat=await page.evaluate(()=>__civiliansQA.threat());
  await page.waitForFunction(()=>__civiliansQA.state().mode==='alert',null,{timeout:3000});
  await page.screenshot({path:resolve(out,'civilian-alert.png')});
  await page.waitForFunction(()=>__civiliansQA.state().mode==='run',null,{timeout:3000});
  const initial=await page.evaluate(()=>__civiliansQA.state());
  await page.evaluate(()=>{window.__civFrames=new Promise(resolve=>{
    const frames=[];let first;
    function frame(now){
      first??=now;frames.push(__civiliansQA.state());
      if(now-first<3000)requestAnimationFrame(frame);else resolve(frames);
    }
    requestAnimationFrame(frame);
  });});
  await page.waitForTimeout(670);await page.screenshot({path:resolve(out,'civilian-run.png')});
  const recording=await page.evaluate(()=>window.__civFrames);
  const end=recording.at(-1);
  assert.ok(end.z>14.2&&end.z-initial.z>9&&Math.hypot(end.x-threat.x,end.z-threat.z)>10,JSON.stringify(end));
  assert.ok(recording.every(frame=>frame.clear),'Civilian capsule intersected the vehicle or city geometry');
  const side=Math.max(...recording.filter(a=>a.z<14).map(a=>Math.abs(a.x)));
  assert.ok(side>1.3,'Civilian did not detour around the parked car');
  const footLift=Math.max(...recording.flatMap(frame=>frame.feet.map(foot=>foot[1]-frame.y)));
  assert.ok(footLift>.16,'The sprint did not visibly lift the feet');
  await page.evaluate(()=>__civiliansQA.removeThreat());
  await page.waitForFunction(()=>__civiliansQA.state().mode==='safe',null,{timeout:4500});
  await page.screenshot({path:resolve(out,'civilian-safe.png')});
  const video=await page.evaluate(async()=>{
    const {stream,recorder,parts}=window.__civRecorder;
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(track=>track.stop());
    return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(parts,{type:'video/webm'}));});
  });
  await writeFile(resolve(out,'evacuation.webm'),Buffer.from(video.split(',')[1],'base64'));

  assert.equal(await page.evaluate(()=>{__civiliansQA.round(true);return __civiliansQA.playerThreat();}),true);
  await page.waitForTimeout(650);
  const aim=await page.evaluate(()=>__civiliansQA.aim());
  assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id,aim),'gameCanvas');
  await page.mouse.move(aim.x,aim.y);await page.mouse.down();
  try{
    await page.waitForFunction(()=>__civiliansQA.playerSwing(),null,{timeout:3000});
    await page.waitForFunction(()=>['alert','run'].includes(__civiliansQA.state().mode),null,{timeout:3000});
  }finally{await page.mouse.up();}
  await page.setViewportSize({width:430,height:932});
  const alarm=await page.evaluate(()=>{__civiliansQA.round(true);return __civiliansQA.collapse();});assert.equal(alarm.dead,true);
  await page.waitForFunction(()=>__civiliansQA.state().mode==='run',null,{timeout:3000});
  await page.screenshot({path:resolve(out,'civilian-phone.png')});
  assert.deepEqual(errors,[]);
  const result={residents:residents.length,before,after,route:{initial,end,side,footLift},alarm,playerSwing:true,errors};
  await writeFile(resolve(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await context?.close();await browser.cleanup();}
