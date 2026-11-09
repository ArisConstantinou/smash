import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCharacterProgression} from '../character-progression.js';
import {createGarage} from '../mount-rules.js';

const stage=process.env.CODEX_GENERATED_OUTPUT||'E:/CodexGenerated/smash/staging';
const out=resolve(stage,'tests/jungle-ravine');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(stage,'work/temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const source=(await readFile('game.js','utf8')).replace('updateBattleCamera(realDt,desired);','updateBattleCamera(realDt,window.__wildCamera||desired);');
const hook=`
window.__ravineQA={
 get ready(){return gameReady},get backend(){return renderer.userData.backend},
 defeat(){spawnBoss();boss.state='walk';boss.hp=1;hitBoss(100,{x:0,z:1});},
 quiet(){wave.timer=100;$('announcement').hidden=true;player.invincible=100;},
 place(x,z){Object.assign(player,{x,y:world.supportHeight(x,z,player.radius),z,vx:0,vy:0,vz:0});safeBank={x,z};},
 travel(points){
   let distance=0;
   for(const [x,z] of points){
     const ox=player.x,oz=player.z;
     for(let i=0;i<400&&Math.hypot(player.x-x,player.z-z)>.24;i++){
       const d=normalize(x-player.x,z-player.z);
       touch.x=.810679*d.x-.585491*d.z;touch.y=.585491*d.x+.810679*d.z;updatePlayer(1/60);
     }
     touch.x=touch.y=0;
     if(Math.hypot(player.x-x,player.z-z)>.27)throw Error('Trail blocked at '+JSON.stringify({x,z,actual:[player.x,player.z]}));
     distance+=Math.hypot(player.x-ox,player.z-oz);
   }
   return {distance,x:player.x,z:player.z,region:world.regionAt(player.x,player.z).id};
 },
 specimen(kind){return world.wildlife.actors.find(a=>a.kind===kind);},
 trail(index){return world.trails[index];},
 animal(kind){const a=this.specimen(kind);return {x:a.x,y:a.y,z:a.z,mode:a.mode,hp:a.hp};},
 observe(kind,dx,dz,zoom=1.8){
   const a=this.specimen(kind);this.place(a.home.x+dx,a.home.z+dz);
   window.__wildCamera=new THREE.Vector3(a.home.x,a.home.y+.6,a.home.z);cameraTarget.copy(window.__wildCamera);
   resize();camera.left/=zoom;camera.right/=zoom;camera.top/=zoom;camera.bottom/=zoom;camera.updateProjectionMatrix();
 },
 normal(){window.__wildCamera=null;resize();},
 vulnerable(){player.invincible=0;return player.hp;},
 animalRival(){
   const a=world.wildlife.boars[1];this.place(a.x+11,a.z+3);
   window.__wildCamera=new THREE.Vector3(a.x,1,a.z);cameraTarget.copy(window.__wildCamera);
   const e=spawnEnemy('zombie',{x:a.x-2.6,z:a.z});e.speed=0;e.timer=100;
   window.__qaRival={a,e};return {hp:e.hp,boar:a.hp};
 },
 rivalry(){const {a,e}=window.__qaRival;return {hp:e.hp,boar:a.hp,retaliates:e.wildlifeRival===a};},
 retaliate(){const {a,e}=window.__qaRival;e.speed=3;e.timer=0;},
 walk(x,z,seconds){
   touch.x=.810679*x-.585491*z;touch.y=.585491*x+.810679*z;
   try{for(let i=0;i<seconds*60;i++)updatePlayer(1/60);}finally{touch.x=touch.y=0;}
   return {x:player.x,y:player.y,z:player.z};
 },
 jump(x,z){
   touch.x=.810679*x-.585491*z;touch.y=.585491*x+.810679*z;
   leapCooldown=0;startLeap();
   try{for(let i=0;i<85&&leap;i++)updatePlayer(1/60);}finally{touch.x=touch.y=0;}
   return {x:player.x,y:player.y,z:player.z,support:world.supportSurface(player.x,player.z,player.radius).object?.type};
 },
 stones(){
   const earned=character,hp=player.hp;
   try{
     character=createCharacterProgression(1);applyStats();stance=stanceTarget=1;
     this.place(-1,world.stonesZ);
     return [this.jump(1,0),this.jump(1,0),this.jump(1,0)];
   }finally{character=earned;applyStats();player.hp=hp;stance=stanceTarget=0;}
 },
 aim(x,y,z){const p=screenPoint(x,y,z);return {x:p.x,y:p.y};},
 bridge(){return {hp:world.bridge.hp,dead:world.bridge.dead,support:world.supportHeight(5,0,.44)};},
 saved(){return read('ironfall.character',null);},
 checkpoint(){persistCharacter();return this.saved();},
};`;

const frameSample=page=>page.evaluate(()=>new Promise(resolve=>{
  const intervals=[];let started,last;
  const sample=now=>{
    started??=now;
    if(last!==undefined)intervals.push(now-last);
    last=now;
    if(now-started<2400){requestAnimationFrame(sample);return;}
    intervals.sort((a,b)=>a-b);
    resolve({frames:intervals.length,p95:intervals[Math.ceil(intervals.length*.95)-1],max:intervals.at(-1)});
  };
  requestAnimationFrame(sample);
}));

const character=createCharacterProgression(15),garage=createGarage();
garage.armory.weapon='w04';garage.armory.discoveries={w04:true};
const initial={character,garage,levels:{power:6,range:2}};
const managed=await launchManagedBrowser(chromium,{channel:'chrome',headless:true,screenshotDir:out});
const errors=[];
let context;
try{
  context=await managed.browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(save=>{
    if(!localStorage.getItem('ironfall.preview.character'))localStorage.setItem('ironfall.preview.character',JSON.stringify(save));
  },initial);
  await context.route('**/candidate/game.js*',route=>route.fulfill({contentType:'text/javascript',body:source+hook}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8000/candidate/');
  await page.locator('#resumeCharacterButton').click();
  await page.waitForFunction(()=>__ravineQA.backend==='WebGPU'&&JSON.parse(render_game_to_text()).phase==='playing');
  assert.equal(await page.evaluate(()=>JSON.parse(render_game_to_text()).map),'city');
  await page.evaluate(()=>__ravineQA.quiet());await page.waitForTimeout(900);
  const cityFrames=await frameSample(page);
  await page.evaluate(()=>__ravineQA.defeat());
  await page.locator('#continueButton').waitFor();
  assert.match(await page.locator('#continueButton').textContent(),/ΖΟΥΓΚΛΑ/);
  await page.screenshot({path:resolve(out,'01-victory.png')});
  const reward=await page.evaluate(()=>__ravineQA.saved());
  assert.equal(reward.map,'jungle-ravine');assert.equal(reward.character.materials.crystal,initial.character.materials.crystal+4);
  await page.locator('#continueButton').click();
  await page.waitForFunction(()=>JSON.parse(render_game_to_text()).map==='jungle-ravine');
  const entered=await page.evaluate(()=>JSON.parse(render_game_to_text()));
  assert.equal(entered.armory.weapon,'w04');assert.equal(entered.ravine.remainingGuards,2);
  assert.equal(entered.ravine.bounds*2,144);
  assert.deepEqual(await page.evaluate(()=>__ravineQA.saved()),reward);
  await page.evaluate(()=>__ravineQA.quiet());
  await page.waitForTimeout(900);
  const ravineFrames=await frameSample(page);
  await page.screenshot({path:resolve(out,'02-entry.png')});
  const trips=await page.evaluate(()=>{
    const trail=__ravineQA.trail(0);
    const approach=__ravineQA.travel(trail.slice(1,7));
    const waterfall=__ravineQA.travel(trail.slice(7,10));
    return {approach,waterfall};
  });
  assert.ok(trips.approach.distance>45&&trips.waterfall.region==='jungle-falls',JSON.stringify(trips));
  await page.waitForTimeout(650);await page.screenshot({path:resolve(out,'05-waterfall.png')});
  const intactCross=await page.evaluate(()=>{__ravineQA.place(-2,0);return __ravineQA.walk(1,0,2);});
  assert.ok(intactCross.x>10,JSON.stringify(intactCross));

  await page.evaluate(()=>__ravineQA.place(-2,0));await page.waitForTimeout(500);
  await page.screenshot({path:resolve(out,'bridge-before.png')});
  const aim=await page.evaluate(()=>__ravineQA.aim(.8,.25,0));
  await page.mouse.move(aim.x,aim.y);
  for(let i=0;i<4&&!(await page.evaluate(()=>__ravineQA.bridge().dead));i++){
    await page.keyboard.press('Space');await page.waitForTimeout(120);
    await page.mouse.down();await page.waitForTimeout(310);await page.mouse.up();await page.waitForTimeout(620);
  }
  const bridge=await page.evaluate(()=>__ravineQA.bridge());
  assert.ok(bridge.dead&&bridge.support<-.9,JSON.stringify(bridge));
  await page.evaluate(()=>__ravineQA.place(-2,0));await page.waitForTimeout(500);
  await page.screenshot({path:resolve(out,'03-broken-bridge.png')});
  const alternatives=await page.evaluate(()=>{
    const wrongWay=__ravineQA.walk(1,0,1.1);
    __ravineQA.place(-2,-6.3);const log=__ravineQA.walk(1,0,2);
    return {wrongWay,log};
  });
  assert.ok(alternatives.wrongWay.x<3&&alternatives.log.x>10,JSON.stringify(alternatives));
  const stones=await page.evaluate(()=>__ravineQA.stones());
  assert.equal(stones[0].support,'river-stone',JSON.stringify(stones));
  assert.equal(stones[1].support,'river-stone',JSON.stringify(stones));
  assert.ok(stones.at(-1).x>10,JSON.stringify(stones));
  const exitTrail=await page.evaluate(()=>{__ravineQA.place(10.8,0);return __ravineQA.travel(__ravineQA.trail(5).slice(1,-1));});
  assert.equal(exitTrail.region,'jungle-gate');assert.ok(exitTrail.distance>55,JSON.stringify(exitTrail));
  await page.waitForTimeout(750);await page.screenshot({path:resolve(out,'06-stone-gate.png')});

  const fauna={};
  await page.evaluate(()=>__ravineQA.observe('tapir',-9,0,2.15));await page.waitForTimeout(400);
  await page.evaluate(()=>{
    const stream=document.querySelector('#gameCanvas').captureStream(30);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:4_000_000});
    const chunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    window.__wildlifeRecording={recorder,stream,chunks};recorder.start(400);
  });
  const tapir=await page.evaluate(()=>__ravineQA.animal('tapir'));
  await page.screenshot({path:resolve(out,'tapir-rest.png')});
  await page.evaluate(()=>{const a=__ravineQA.specimen('tapir');__ravineQA.place(a.x-3,a.z);});
  await page.waitForFunction(()=>__ravineQA.animal('tapir').mode==='run');await page.waitForTimeout(270);
  fauna.tapir=await page.evaluate(()=>__ravineQA.animal('tapir'));assert.ok(fauna.tapir.x>tapir.x+.6);
  await page.screenshot({path:resolve(out,'tapir-run.png')});

  await page.evaluate(()=>__ravineQA.observe('macaw',8,0,2.35));await page.waitForTimeout(400);
  const macaw=await page.evaluate(()=>__ravineQA.animal('macaw'));
  await page.screenshot({path:resolve(out,'macaw-perch.png')});
  await page.evaluate(()=>{const a=__ravineQA.specimen('macaw');__ravineQA.place(a.x+2.9,a.z);});
  await page.waitForFunction(()=>__ravineQA.animal('macaw').mode==='flight');await page.waitForTimeout(570);
  fauna.macaw=await page.evaluate(()=>__ravineQA.animal('macaw'));assert.ok(fauna.macaw.y>macaw.y+.6);
  await page.screenshot({path:resolve(out,'macaw-flight.png')});

  await page.evaluate(()=>__ravineQA.observe('boar',-9,0,2.1));await page.waitForTimeout(350);
  await page.screenshot({path:resolve(out,'boar-alert.png')});
  const initialHP=await page.evaluate(()=>{const a=__ravineQA.specimen('boar');__ravineQA.place(a.x-3.5,a.z);return __ravineQA.vulnerable();});
  await page.waitForFunction(()=>__ravineQA.animal('boar').mode==='warn');
  await page.screenshot({path:resolve(out,'boar-warning.png')});
  await page.waitForFunction(hp=>JSON.parse(render_game_to_text()).player.hp<hp,initialHP);
  fauna.boarPlayerHP=await page.evaluate(()=>JSON.parse(render_game_to_text()).player.hp);
  await page.screenshot({path:resolve(out,'boar-charge.png')});
  const beforeRival=await page.evaluate(()=>__ravineQA.animalRival());
  await page.waitForFunction(hp=>__ravineQA.rivalry().hp<hp,beforeRival.hp);
  await page.evaluate(()=>__ravineQA.retaliate());
  await page.waitForFunction(hp=>__ravineQA.rivalry().boar<hp,beforeRival.boar);
  fauna.rival=await page.evaluate(()=>__ravineQA.rivalry());assert.ok(fauna.rival.retaliates);
  const recording=await page.evaluate(async()=>{
    const {recorder,stream,chunks}=window.__wildlifeRecording;
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});
    stream.getTracks().forEach(track=>track.stop());
    return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
  });
  await writeFile(resolve(out,'wildlife-motion.webm'),Buffer.from(recording.split(',')[1],'base64'));
  await page.evaluate(()=>__ravineQA.normal());
  await page.setViewportSize({width:430,height:932});
  await page.evaluate(()=>__ravineQA.place(11.4,0));await page.waitForTimeout(550);
  await page.screenshot({path:resolve(out,'04-far-bank-phone.png')});
  const earned=await page.evaluate(()=>__ravineQA.checkpoint());
  await page.reload();await page.locator('#resumeCharacterButton').click();
  await page.waitForFunction(()=>JSON.parse(render_game_to_text()).map==='jungle-ravine');
  assert.equal(await page.evaluate(()=>JSON.parse(render_game_to_text()).armory.weapon),'w04');
  assert.deepEqual(await page.evaluate(()=>__ravineQA.saved()),earned);
  assert.deepEqual(errors,[]);
  const result={entered,bridge,alternatives,stones,trips,exitTrail,fauna,checkpoint:true,cityFrames,ravineFrames,errors};
  await writeFile(resolve(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await context?.close();await managed.cleanup();}
