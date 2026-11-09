// Controlled real renderer evidence. QA access is appended only in this browser.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),stage='E:/CodexGenerated/smash/staging',out=resolve(stage,'tests/beast-portal');
await mkdir(out,{recursive:true});process.env.TEMP=process.env.TMP=resolve(stage,'work/temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const label=process.env.SMASH_CAPTURE_LABEL||'before',phone=process.env.SMASH_BEAST_PHONE==='1',tag=label+(phone?'-phone':''),errors=[];
const ref=process.env.SMASH_BEAST_REF;
const source=async file=>ref?execFileSync('git',['show',ref+':'+file],{cwd:root,encoding:'utf8'}):await readFile(resolve(root,file),'utf8');
const game=await source('game.js');
const hook=`
let qaFrozen=true;const qaOriginalFrame=frame;
frame=function(t){if(qaFrozen){renderer.render(scene,camera);requestAnimationFrame(frame);}else qaOriginalFrame(t);};
window.__beastQA={get ready(){return gameReady},
 setup(){startGame(5,{test:true});player.x=0;player.z=33;player.invincible=1e6;spawnBoss();
  for(const e of enemies)disposeInstance(e);enemies=[];
  const office=world.objects.find(o=>o.type==='office'&&o.h>16);this.reference=office?{type:office.type,height:office.h}:null;
  cameraTarget.set(boss.x*.5,10,(boss.z+player.z)*.5);camera.position.copy(cameraTarget).addScaledVector(cameraOffset,CAMERA_DISTANCE_SCALE);camera.lookAt(cameraTarget);camera.zoom=.55;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  if(innerWidth<600){updateBattleCamera(1,new THREE.Vector3(player.x,.6,player.z));camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);}
  return this.sample();},
 clippingProbe(){
  const states=scene.children.map(n=>[n,n.visible]),bg=scene.background,near=scene.fog.near,far=scene.fog.far;
  for(const [n]of states)if(!n.isLight&&n!==boss.mesh)n.visible=false;scene.background=new THREE.Color(0);scene.fog.near=900;scene.fog.far=1000;
  const plane=boss.entryPlane,constant=plane.constant,result={local:renderer.localClippingEnabled,materials:[]};boss.mesh.traverse(n=>{if(n.isMesh)result.materials.push({clip:n.material.clippingPlanes?.map(p=>({constant:p.constant,normal:p.normal.toArray(),same:p===plane})),type:n.material.type});});
  const pixels=()=>{boss.mesh.userData.reveal.sync();renderer.render(scene,camera);const c=document.createElement('canvas');c.width=renderer.domElement.width;c.height=renderer.domElement.height;const x=c.getContext('2d');x.drawImage(renderer.domElement,0,0);const data=x.getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>60)count++;return count;};
  plane.constant=1e6;result.all=pixels();plane.constant=-1e6;result.none=pixels();plane.constant=constant;result.partial=pixels();
  plane.constant=constant;boss.mesh.userData.reveal.sync();
  for(const [n,v]of states)n.visible=v;scene.background=bg;scene.fog.near=near;scene.fog.far=far;
  return result;
 },
 roarFrame(){this.setup();for(let i=0;i<1200&&boss.entry.stage!=='roar';i++){updateBoss(1/60);updateObjects(1/60);updateEffects(1/60);destruction.update(1/60,player);}if(boss.entry.stage!=='roar')throw Error('Entrance failed to reach its roar');return this.step(.5);},
 rear(){
  beastCombat.reset();beastPortal.reset();const b=boss;Object.assign(b,{x:0,z:0,y:0,state:'walk',timer:0,rearCooldown:0});b.entryPlane.constant=1e6;b.mesh.userData.reveal.sync();b.mesh.rotation.y=0;b.mesh.position.set(0,b.mesh.userData.groundOffset,0);b.mesh.userData.pose();
  for(const o of world.objects)if(Math.hypot(o.x,o.z)<b.radius+15){o.x+=500;o.mesh.position.x=o.x;}world.rebuildSpatialIndex();
  const foot=b.mesh.userData.feet()[2];player.x=foot.x;player.z=foot.z-1;player.y=0;player.hp=player.maxHp;player.invincible=0;
  updateBoss(.01);updateBattleCamera(1,new THREE.Vector3(player.x,.6,player.z));camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);return this.sample();
 },
 dodgeRear(){beastCombat.reset();boss.state='walk';boss.timer=0;boss.rearCooldown=0;player.invincible=0;updateBoss(.01);player.x=60;player.z=60;return this.step(1.6);},
 air(){this.rear();beastCombat.reset();boss.state='walk';boss.timer=0;boss.rearCooldown=0;boss.attack=0;player.x=0;player.z=-25;player.y=12;player.invincible=0;updateBoss(.01);return this.layout();},
 markerHeight(){const p=beastCombat.markerPool.geometry.attributes.position;let min=Infinity,max=-Infinity;for(let i=0;i<beastCombat.markerPool.geometry.drawRange.count;i++){min=Math.min(min,p.getY(i));max=Math.max(max,p.getY(i));}return {min,max};},
 layout(){resize();updateBattleCamera(1,new THREE.Vector3(player.x,.6,player.z));camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);return this.sample();},
 async compare(){
  const {makeCityBuilding}=await import('./city-models.js');const reference=makeCityBuilding('office',1);scene.add(reference);reference.position.set(23,0,0);
  world.group.visible=false;for(const n of scene.children)if(n!==boss.mesh&&n!==reference&&!n.isLight)n.visible=false;reference.visible=boss.mesh.visible=true;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshLambertMaterial({color:0x344b4d}));ground.rotation.x=-Math.PI/2;ground.position.y=-.03;scene.add(ground);
  if(boss.entryPlane){boss.entryPlane.constant=1e6;boss.mesh.userData.reveal.sync();}
  boss.mesh.position.set(0,boss.mesh.userData.groundOffset,0);boss.mesh.rotation.y=.25;boss.mesh.userData.pose();
  scene.fog.near=900;scene.fog.far=1000;scene.background.setHex(0x344b4d);camera.left=-44;camera.right=44;camera.top=30.55;camera.bottom=-30.55;camera.zoom=1;camera.position.set(55,45,65);camera.lookAt(10,8,0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);renderer.render(scene,camera);
  const height=new THREE.Box3().setFromObject(reference).getSize(new THREE.Vector3()).y;return {bossHeight:boss.h,referenceHeight:height,ratio:boss.h/height,png:renderer.domElement.toDataURL('image/png')};
 },
 sample(){hero.position.set(player.x,player.y,player.z);updateHUD(true);world.updateVisibility(player,camera);renderer.render(scene,camera);
  return {boss:{x:boss.x,y:boss.y,z:boss.z,h:boss.h,hp:boss.hp,maxHp:boss.maxHp,state:boss.state},reference:this.reference,backend:renderer.userData.backend,geometry:renderer.info.memory.geometries,text:JSON.parse(render_game_to_text()),png:renderer.domElement.toDataURL('image/png')};},
 step(seconds){let peak=0;for(let t=0;t<seconds-1e-7;t+=1/60){const before=performance.now();updateBoss(1/60);updateObjects(1/60);updateEffects(1/60);destruction.update(1/60,player);peak=Math.max(peak,performance.now()-before);}return {...this.sample(),peak};},
 live(){qaFrozen=false;lastFrame=performance.now();performanceMonitor.reset();performanceMonitor.history.length=0;},
 stop(){qaFrozen=true;return {windows:performanceMonitor.history,geometry:renderer.info.memory.geometries,text:JSON.parse(render_game_to_text())};}
};`;
const managed=await launchManagedBrowser(chromium,{channel:'chrome',headless:true,screenshotDir:out});let context;
try{
 context=await managed.browser.newContext({viewport:phone?{width:430,height:932}:{width:1440,height:1000}});const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 if(phone){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
 await context.route('**/game.js*',r=>r.fulfill({contentType:'text/javascript',body:game+hook}));
 if(ref)for(const file of ['beast-mech.js','beast-combat.js','beast-obstacles.js'])await context.route('**/'+file+'*',async r=>r.fulfill({contentType:'text/javascript',body:await source(file)}));
 await page.goto('http://127.0.0.1:8000/candidate/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>globalThis.__beastQA?.ready,null,{timeout:120000});
 const samples=[];
 for(const [name,seconds]of [['start',0],['opening',1.4],['emerging',2],['complete',6]]){
  const sample=await page.evaluate(({name,seconds})=>name==='start'?__beastQA.setup():__beastQA.step(seconds),{name,seconds});
  if((name==='start'||name==='emerging')&&label==='after'){const probe=await page.evaluate(()=>__beastQA.clippingProbe());assert.ok(probe.all>1000);assert.equal(probe.none,0,'Hidden side of portal must produce zero boss pixels');if(name==='start')assert.equal(probe.partial,0);else assert.ok(probe.partial>0&&probe.partial<probe.all,'Only the emerged portion is visible');sample.clipping={all:probe.all,none:probe.none,partial:probe.partial};}
  await writeFile(resolve(out,tag+'-'+name+'.png'),Buffer.from(sample.png.split(',')[1],'base64'));delete sample.png;samples.push({name,...sample});
 }
 await page.evaluate(()=>__beastQA.live());await page.waitForTimeout(8000);const performance=await page.evaluate(()=>__beastQA.stop());
 const rear=[];
 if(label==='after'){
  const start=await page.evaluate(()=>__beastQA.rear());delete start.png;assert.equal(start.text.boss.warning.kind,'rearStomp');rear.push(start);
  for(const [name,seconds]of [['rear-warning',.65],['rear-impact',.8]]){const sample=await page.evaluate(t=>__beastQA.step(t),seconds);await writeFile(resolve(out,tag+'-'+name+'.png'),Buffer.from(sample.png.split(',')[1],'base64'));delete sample.png;rear.push(sample);}
  assert.equal(rear[1].text.player.hp,rear[0].text.player.hp);assert.ok(rear[2].text.player.hp<rear[0].text.player.hp);
  const dodged=await page.evaluate(()=>__beastQA.dodgeRear());delete dodged.png;assert.equal(dodged.text.player.hp,rear[2].text.player.hp);rear.push(dodged);
  if(phone){for(const [name,viewport]of [['portrait',{width:430,height:932}],['landscape',{width:932,height:430}]]){await page.setViewportSize(viewport);await page.evaluate(()=>__beastQA.rear());await page.evaluate(()=>__beastQA.layout());await page.screenshot({path:resolve(out,tag+'-'+name+'-hud.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.boss-heading strong')).fontSize)>=12));}}
 }
 let air;
 if(label==='after'){
  air=await page.evaluate(()=>__beastQA.air());delete air.png;assert.equal(air.text.boss.warning.kind,'missiles');const warning=await page.evaluate(()=>__beastQA.step(.65));await writeFile(resolve(out,tag+'-air-warning.png'),Buffer.from(warning.png.split(',')[1],'base64'));const height=await page.evaluate(()=>__beastQA.markerHeight());assert.ok(height.min>12&&height.max<14);const impact=await page.evaluate(()=>__beastQA.step(3.1));delete impact.png;assert.ok(impact.text.player.hp<air.text.player.hp);air={height,hpBefore:air.text.player.hp,hpAfter:impact.text.player.hp};
  const roar=await page.evaluate(()=>__beastQA.roarFrame());assert.equal(roar.text.boss.entrance,'roar');await writeFile(resolve(out,tag+'-roar.png'),Buffer.from(roar.png.split(',')[1],'base64'));
 }
 const comparison=await page.evaluate(()=>__beastQA.compare());await writeFile(resolve(out,tag+'-comparison.png'),Buffer.from(comparison.png.split(',')[1],'base64'));delete comparison.png;
 await writeFile(resolve(out,tag+'-results.json'),JSON.stringify({label,phone,cpuRate:phone?4:1,samples,performance,comparison,rear,air,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(samples[0].backend,'WebGPU');
 console.log(JSON.stringify({label,samples:samples.map(s=>({name:s.name,boss:s.boss,reference:s.reference,peak:s.peak})),performance,errors}));
}finally{await context?.close();await managed.cleanup();await new Promise(r=>setTimeout(r,1000));}
