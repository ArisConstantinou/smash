// Controlled native-renderer capture. The QA hook is injected into this page only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const stage='E:/CodexGenerated/smash/staging',out=resolve(stage,'tests/battle-camera');
const label=process.env.SMASH_CAPTURE_LABEL||'after';
await mkdir(out,{recursive:true});process.env.TEMP=process.env.TMP=resolve(stage,'work/temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const source=label==='before'?execFileSync('git',['show','5ea1f69:game.js'],{encoding:'utf8'}):await readFile('game.js','utf8');
const hook=`
frame=function(){requestAnimationFrame(frame);};
window.__cameraQA={
 get ready(){return gameReady;},
 reset(){startGame(5,{test:true});for(const e of enemies)disposeInstance(e);enemies=[];$('toasts').replaceChildren();},
 setup(withBoss){if(withBoss){if(typeof bossGate!=='undefined')bossGate=2;spawnBoss();}},
 retreatInput(){
   const before={x:player.x,z:player.z};
   for(let i=0;i<70;i++){updatePlayer(1/60);updateBattleCamera(1/60,new THREE.Vector3(player.x,.6+player.y,player.z));}
   camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);
   const p=screenPoint(player.x,player.y+1,player.z);
   return {meters:Math.hypot(player.x-before.x,player.z-before.z),zoom:camera.zoom,screen:[p.x/screenW,p.y/screenH]};
 },
 sample(x,z){
   Object.assign(player,{x,y:0,z});poseHero(0);
   for(let i=0;i<100;i++)updateBattleCamera(1/60,new THREE.Vector3(x,.6,z));
   camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);world.updateVisibility(player,camera);updateBattleVisibility(.3);
   updateHUD(true);renderer.render(scene,camera);drawFX();
   const p=screenPoint(x,1,z),controls=document.querySelector('#combatDock').getBoundingClientRect();
   return {zoom:camera.zoom,screen:[p.x/screenW,p.y/screenH],controlsTop:controls.top/screenH,backend:renderer.userData.backend,drawCalls:renderer.info.render.drawCalls??renderer.info.render.calls};
 },
 encounterStart(){this.reset();battleKills=45;checkGoal();return encounter.leader.type;},
 entrance(dt){
   const before=encounter.entry?.location;updateEncounter(dt);const e=encounter.leader,stage=encounter.entry?.stage||'complete';
   if(before)this.sample(before.x+before.nx*7,before.z+before.nz*7);
   return {stage,portal:beastPortal.root.visible,visible:e.mesh.visible,combat:enemies.includes(e),escorts:encounter.escorts.size,clip:encounter.entry?.reveal.plane.constant??null};
 },
 revealPixels(){
   const e=encounter.leader,r=encounter.entry.reveal,constant=r.plane.constant;
   const states=scene.children.map(node=>[node,node.visible]),background=scene.background,fog=scene.fog;
   for(const [node] of states)if(!node.isLight&&node!==e.mesh)node.visible=false;
   scene.background=new THREE.Color(0);scene.fog=null;
   const canvas=document.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   const count=value=>{
     r.plane.constant=value;r.sync();renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0);
     const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
     let pixels=0;for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>55)pixels++;
     return pixels;
   };
   let result;
   try{result={all:count(1e6),none:count(-1e6),partial:count(constant)};}
   finally{r.plane.constant=constant;r.sync();scene.background=background;scene.fog=fog;for(const [node,visible]of states)node.visible=visible;renderer.render(scene,camera);}
   return result;
 },
 setWalker(){const e=encounter.leader;Object.assign(e,{x:0,z:-8,walk:0,timer:5,tankDelay:0,facingYaw:0});$('announcement').hidden=true;this.sample(0,0);},
 encounterStep(distance,frames){
   const e=encounter.leader;player.x=0;player.z=e.z+distance;player.invincible=100;
   for(let i=0;i<frames;i++){updateEnemies(1/60);updateEncounter(1/60);}
   this.sample(player.x,player.z);return {fold:e.fold,state:e.state,escorts:encounter.escorts.size};
 },
 startMarshal(){
   const first=encounter;killEnemy(first.leader);for(let i=0;i<20&&encounter;i++){updateEncounter(6);for(const e of [...first.escorts])killEnemy(e);}
   updateEncounter(3.1);battleKills=70;checkGoal();return encounter.leader.type;
 },
 marshal(){
   const e=encounter.leader;Object.assign(e,{x:0,z:-8,timer:10,facingYaw:0});
   $('announcement').hidden=true;
   for(let i=0;i<7;i++)updateEncounter(6);
   updateEnemies(1/60);this.sample(0,0);
   return {type:e.type,escorts:encounter.escorts.size};
 },
 mapMarkers(){
   drawMinimap();const pixels=mapContext.getImageData(0,0,map.width,map.height).data,counts=[0,0,0,0],xSums=[0,0,0,0];
   const colors=[0x83f4e7,0xff8d83,0xf4abff,0xffc568];
   for(let i=0;i<pixels.length;i+=4){const color=(pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2],n=colors.indexOf(color);if(n>=0){counts[n]++;xSums[n]+=(i/4)%map.width;}}
   return {counts,x:counts.map((n,i)=>n?xSums[i]/n:null),label:map.getAttribute('aria-label')};
 },
 liveMap(){
   this.reset();
   const enemy=spawnEnemy('zombie',{x:-11,z:0});
   const first=this.mapMarkers();
   enemy.x=19;enemy.z=-8;const moved=this.mapMarkers();
   killEnemy(enemy);const dead=this.mapMarkers();
   return {first,moved,dead};
 }
};`;
const managed=await launchManagedBrowser(chromium,{channel:'chrome',headless:true,screenshotDir:out});
let context;
try{
 context=await managed.browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/game.js*',r=>r.fulfill({contentType:'text/javascript',body:source+hook}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const results=[];
 for(const [name,width,height,touch] of [['desktop',1440,900,false],['portrait',430,932,true],['landscape',932,430,true]]){
   await page.setViewportSize({width,height});
   await page.goto('http://127.0.0.1:8000/'+(label==='before'?'':'candidate/')+(touch?'?touch=1':''),{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.__cameraQA?.ready,null,{timeout:120000});
   const control=await page.evaluate(()=>{__cameraQA.reset();return __cameraQA.sample(35,45);});
   const entrance=await page.evaluate(()=>{__cameraQA.sample(0,0);__cameraQA.setup(true);return __cameraQA.sample(0,0);});
   const retreat=await page.evaluate(()=>__cameraQA.sample(35,45));
   await page.screenshot({path:resolve(out,label+'-'+name+'.png')});
   results.push({name,control,entrance,retreat});
   assert.equal(retreat.backend,'WebGPU');
   if(label==='after'){
     assert.equal(entrance.zoom,1);assert.equal(retreat.zoom,1);
     assert.ok(Math.hypot(retreat.screen[0]-.5,retreat.screen[1]-.5)<.08);
     assert.ok(retreat.screen[1]<retreat.controlsTop);
     assert.ok((await page.evaluate(()=>__cameraQA.mapMarkers())).counts[3]>0,'Final boss marker is drawn at the portal');
     const legend=await page.locator('.map-legend').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,font:parseFloat(getComputedStyle(el).fontSize),visible:!!el.getClientRects().length}));
     assert.ok(legend.visible&&legend.width>=legend.scrollWidth&&legend.font>=12,JSON.stringify({name,legend}));
     if(name==='desktop'){
       await page.evaluate(()=>__cameraQA.sample(0,0));await page.keyboard.down('KeyW');
       try{const motion=await page.evaluate(()=>__cameraQA.retreatInput());assert.ok(motion.meters>2);assert.equal(motion.zoom,1);assert.ok(Math.hypot(motion.screen[0]-.5,motion.screen[1]-.5)<.15);results.at(-1).motion=motion;}
       finally{await page.keyboard.up('KeyW');}
     }
     const live=await page.evaluate(()=>__cameraQA.liveMap());assert.ok(live.first.counts[1]>0&&live.moved.counts[1]>0);assert.ok(live.moved.x[1]>live.first.x[1]+3);assert.equal(live.dead.counts[1],0);
     assert.equal(await page.evaluate(()=>__cameraQA.encounterStart()),'siegeTransformer');
     assert.ok((await page.evaluate(()=>__cameraQA.mapMarkers())).counts[2]>0);
     const checkEntrance=async type=>{
       const opening=await page.evaluate(()=>__cameraQA.entrance(.5));assert.deepEqual([opening.stage,opening.portal,opening.visible,opening.combat,opening.escorts],['opening',true,false,false,0]);
       const crossing=await page.evaluate(()=>__cameraQA.entrance(1.35));assert.deepEqual([crossing.stage,crossing.portal,crossing.visible,crossing.combat,crossing.escorts],['walking',true,true,false,0]);assert.ok(Math.abs(crossing.clip)<1e5);
       if(name==='desktop'){
         await page.screenshot({path:resolve(out,type+'-portal.png')});
         const pixels=await page.evaluate(()=>__cameraQA.revealPixels());
         assert.ok(pixels.none===0&&pixels.partial>0&&pixels.partial<pixels.all,JSON.stringify({type,pixels}));
         (results.at(-1).portals??={})[type]=pixels;
       }
       const complete=await page.evaluate(()=>__cameraQA.entrance(3));assert.deepEqual([complete.stage,complete.portal,complete.visible,complete.combat],['complete',false,true,true]);
     };
     await checkEntrance('transformer');
     await page.evaluate(()=>__cameraQA.setWalker());
     if(name==='desktop'){
       for(const [stage,distance,frames]of [['walker',8,1],['folding',16,28],['tank',16,40]]){
         const state=await page.evaluate(([d,f])=>__cameraQA.encounterStep(d,f),[distance,frames]);assert.ok(stage==='walker'?state.fold===0:stage==='tank'?state.fold===1:state.fold>0&&state.fold<1);
         await page.screenshot({path:resolve(out,stage+'.png')});
       }
       assert.equal(await page.evaluate(()=>__cameraQA.startMarshal()),'hollowMarshal');await checkEntrance('marshal');
       const marshal=await page.evaluate(()=>__cameraQA.marshal());assert.equal(marshal.type,'hollowMarshal');assert.equal(marshal.escorts,7);
       const markers=await page.evaluate(()=>__cameraQA.mapMarkers());assert.ok(markers.counts.slice(0,3).every(n=>n>0),JSON.stringify({name,markers}));assert.equal(markers.counts[3],0);
       await page.screenshot({path:resolve(out,'marshal.png')});
       results.at(-1).marshal=marshal;results.at(-1).markers=markers;
     }else{
       assert.equal(await page.evaluate(()=>__cameraQA.startMarshal()),'hollowMarshal');await checkEntrance('marshal');
       const marshal=await page.evaluate(()=>__cameraQA.marshal());assert.equal(marshal.escorts,7);
       const markers=await page.evaluate(()=>__cameraQA.mapMarkers());assert.ok(markers.counts.slice(0,3).every(n=>n>0),JSON.stringify({name,markers}));assert.equal(markers.counts[3],0);
       await page.screenshot({path:resolve(out,'marshal-'+name+'.png')});
     }
   }
 }
 await writeFile(resolve(out,label+'.json'),JSON.stringify({results,errors},null,2));
 assert.deepEqual(errors,[]);
 if(label==='before')assert.ok(results.every(r=>r.retreat.zoom<.8),'Original camera zooms out when the player retreats');
 console.log(JSON.stringify(results));
}finally{await context?.close();await managed.cleanup();}
