// Native WebGPU evidence; QA hooks exist only in the intercepted browser module.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve(process.env.CODEX_TEST_OUTPUT,'colossus');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(process.env.CODEX_WORK_OUTPUT,'temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const label=process.env.SMASH_CAPTURE_LABEL||'before';
const game=await readFile('E:/Smash/game.js','utf8');
const hook=`
const originalQAFrame=frame;let frozenQA=false,frameQA=[],measuringQA=false,previousQA=null;
frame=function(t){if(measuringQA){if(previousQA!==null)frameQA.push(t-previousQA);previousQA=t;}if(!frozenQA)originalQAFrame(t);else{renderer.render(scene,camera);requestAnimationFrame(frame);}};
window.__colossusQA={get ready(){return gameReady},
 guard(){startGame(15,{test:true});levels.range=14;levels.size=12;applyStats();
 player.x=0;player.z=0;player.invincible=1e9;facing={x:0,z:1};guardHeld=true;frozenQA=true;
 for(let i=0;i<60;i++)updatePlayer(1/120);poseHero(0);hero.position.set(0,0,0);
 cameraTarget.set(0,2.5,0);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);camera.zoom=1.3;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);updateHUD(true);renderer.render(scene,camera);
 return {range:stats.range,reach:hero.userData.reachScale,guard:guardDimensions(),png:renderer.domElement.toDataURL('image/png')};},
 viewport(){resize();updateHUD(true);updateBattleCamera(1,new THREE.Vector3(player.x,.6,player.z));camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);renderer.render(scene,camera);},
 markerPixels(){
  const copy=()=>{const c=document.createElement('canvas');c.width=renderer.domElement.width;c.height=renderer.domElement.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(renderer.domElement,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
  beastCombat.markers.visible=true;renderer.render(scene,camera);const on=copy();beastCombat.markers.visible=false;renderer.render(scene,camera);const off=copy();beastCombat.markers.visible=true;renderer.render(scene,camera);let changed=0;for(let i=0;i<on.length;i+=4)if(on[i]>off[i]+20&&on[i]>on[i+1]*1.5)changed++;const states=scene.children.map(n=>[n,n.visible]);for(const[n]of states)n.visible=false;beastCombat.markers.visible=true;const oldBackground=scene.background;scene.background=new THREE.Color(0);renderer.render(scene,camera);const isolated=copy();let colored=0;for(let i=0;i<isolated.length;i+=4)if(isolated[i]>80&&isolated[i]>isolated[i+1]*1.5)colored++;const png=renderer.domElement.toDataURL('image/png');scene.background=oldBackground;for(const[n,visible]of states)n.visible=visible;renderer.render(scene,camera);return {changed,colored,png};
 },
 get boss(){return boss},
 live(){frameQA=[];previousQA=null;lastFrame=performance.now();performanceMonitor.reset();performanceMonitor.history.length=0;measuringQA=true;frozenQA=false;boss.hp=boss.maxHp=100000;boss.state='walk';boss.timer=0;},
 measured(){measuringQA=false;frozenQA=true;const s=frameQA.slice().sort((a,b)=>a-b);return {frames:s.length,p95:s[Math.ceil(s.length*.95)-1],p99:s[Math.ceil(s.length*.99)-1],max:s.at(-1),over100:s.filter(v=>v>100).length,windows:performanceMonitor.history,backend:renderer.userData.backend};},
 arrival(){
  startGame(15,{test:true});frozenQA=true;spawnBoss();boss.x=0;boss.z=0;boss.mesh.rotation.y=0;boss.mesh.position.set(0,boss.y+boss.mesh.userData.groundOffset,0);boss.mesh.userData.pose();player.x=14;player.z=26;player.invincible=1e9;
  this.placed=false;this.beforeDead=world.objects.filter(o=>o.dead).length;return this.step(0);
 },
 step(seconds){
  let peak=0;for(let left=seconds;left>1e-8;left-=1/60){const t=performance.now();updateBoss(Math.min(left,1/60));updateObjects(1/60);destruction.update(1/60,player);updateEffects(1/60);peak=Math.max(peak,performance.now()-t);}
  hero.position.set(player.x,player.y,player.z);updateHUD(true);updateBattleCamera(1,new THREE.Vector3(player.x,.6,player.z));camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);world.updateVisibility(player,camera);updateBattleVisibility(1);renderer.render(scene,camera);
  return {attack:beastCombat.attack?.kind,markers:beastCombat.markerCount,projectiles:beastCombat.projectiles.length,bursts:beastCombat.bursts.length,player:{x:player.x,y:player.y,z:player.z},state:boss.state,y:boss.y,dead:world.objects.filter(o=>o.dead).length-this.beforeDead,peak,contacts:beastObstacleContacts(boss.mesh,world.nearObjects(boss.x,boss.z,33)).length,png:renderer.domElement.toDataURL('image/png')};
 },
 attack(kind){if(!this.placed){const foot=boss.mesh.userData.feet()[0];let found=false;
  for(const radius of [7,8,9,10,12]){for(let i=0;i<24;i++){const angle=i/24*Math.PI*2,x=foot.x+Math.sin(angle)*radius,z=foot.z+Math.cos(angle)*radius;
   if(world.clearBody(x,z,0,player.radius,1.88)&&beastCollision.clearBody(x,z,0,player.radius,1.88)){player.x=x;player.z=z;player.y=0;found=true;break;}}
   if(found)break;}if(!found)throw new Error('No safe combat position');this.placed=true;}
 beastCombat.reset();boss.state=kind;boss.timer=100;beastCombat.start(kind,boss,player);return this.step(0);},

 bossScene(view='game'){
  startGame(15,{test:true});frozenQA=true;spawnBoss();boss.state='walk';boss.timer=100;boss.x=0;boss.z=0;boss.mesh.rotation.y=0;boss.y=0;boss.mesh.position.set(0,boss.mesh.userData.groundOffset,0);boss.mesh.userData.pose();
  player.x=14;player.z=19;hero.position.set(player.x,0,player.z);updateHUD(true);
  if(view!=='game'){world.group.visible=false;scene.fog.near=900;scene.fog.far=1000;scene.background.setHex(0x657278);cameraTarget.set(0,15,2);camera.position.set(view==='front'?0:view==='side'?65:48,view==='front'?17:view==='side'?17:40,view==='side'?0:65);camera.lookAt(cameraTarget);camera.zoom=.52;}
  else{cameraTarget.set(0,12,4);camera.position.copy(cameraTarget).add(cameraOffset.clone().multiplyScalar(3));camera.lookAt(cameraTarget);camera.zoom=.36;}
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);renderer.render(scene,camera);
  let draws=0,triangles=0;boss.mesh.traverse(n=>{if(n.isMesh){draws++;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;}});
  return {height:new THREE.Box3().setFromObject(boss.mesh,true).getSize(new THREE.Vector3()).y,draws,triangles,png:renderer.domElement.toDataURL('image/png')};
 }
};`;
const session=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});
let context;const errors=[];
try{
 context=await session.browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/game.js*',r=>r.fulfill({status:200,contentType:'text/javascript',body:game+hook}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!/404|Failed to load resource/.test(m.text()))errors.push(m.text());});
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>__colossusQA.ready,null,{timeout:120000});
 await page.locator('#startButton').click();await page.waitForTimeout(500);
 const result=await page.evaluate(()=>__colossusQA.guard());await page.waitForTimeout(100);
 await writeFile(resolve(out,label+'-guard.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
 await page.screenshot({path:resolve(out,label+'-hud.png')});
 if(label==='after')for(const view of ['three-quarter','front','side','game']){const model=await page.evaluate(v=>__colossusQA.bossScene(v),view);await page.waitForTimeout(100);await writeFile(resolve(out,'boss-'+view+'.png'),Buffer.from(model.png.split(',')[1],'base64'));delete model.png;console.log(JSON.stringify({view,...model}));}
 if(label==='after'){
  const arrival=[];await page.evaluate(()=>__colossusQA.arrival());
  for(const [name,seconds]of [['touching',1.4],['crushing',2],['cleared',5]]){const s=await page.evaluate(t=>__colossusQA.step(t),seconds);await writeFile(resolve(out,'arrival-'+name+'.png'),Buffer.from(s.png.split(',')[1],'base64'));delete s.png;arrival.push({name,...s});}
  assert.ok(arrival.at(-1).dead>0,'The arriving boss must actually demolish obstructions');
  assert.equal(arrival.at(-1).y,0,'The boss must finish its landing');assert.equal(arrival.at(-1).contacts,0,'No surviving architecture may overlap the boss');
  for(const kind of ['missiles','rockets','laser','stomp']){await page.evaluate(k=>__colossusQA.attack(k),kind);for(const [name,t]of [['warning',.6],['active',1.3]]){const s=await page.evaluate(t=>__colossusQA.step(t),t);await writeFile(resolve(out,kind+'-'+name+'.png'),Buffer.from(s.png.split(',')[1],'base64'));delete s.png;if(name==='warning'&&kind!=='laser'){const pixels=await page.evaluate(()=>__colossusQA.markerPixels());await writeFile(resolve(out,'warning-isolated.png'),Buffer.from(pixels.png.split(',')[1],'base64'));delete pixels.png;console.log(JSON.stringify({kind,pixels}));s.visibleWarningPixels=pixels.changed;assert.ok(s.visibleWarningPixels>20,kind+' must display a visible red warning');}console.log(JSON.stringify({kind,name,...s}));}}
  result.arrival=arrival;
  await page.evaluate(()=>__colossusQA.live());await page.mouse.move(700,550);await page.mouse.down();
  await page.waitForTimeout(12000);await page.mouse.up();result.performance=await page.evaluate(()=>__colossusQA.measured());
  assert.ok(result.performance.frames>100);assert.equal(result.performance.backend,'WebGPU');
  await page.screenshot({path:resolve(out,'boss-live.png')});
  await writeFile(resolve(out,label+'-results.json'),JSON.stringify({result,errors},null,2));
  for(const [name,size]of [['phone',{width:390,height:844}],['landscape',{width:844,height:390}]]){
   await page.setViewportSize(size);await page.evaluate(()=>__colossusQA.viewport());await page.waitForTimeout(150);await page.screenshot({path:resolve(out,'boss-'+name+'.png')});
   const layout=await page.evaluate(()=>{const goal=document.querySelector('.goal-panel').getBoundingClientRect(),breakdown=document.querySelector('.goal-breakdown').getBoundingClientRect();return {scroll:document.documentElement.scrollWidth,width:innerWidth,goal:{left:goal.left,right:goal.right},breakdown:{left:breakdown.left,right:breakdown.right}};});
   assert.ok(layout.scroll<=layout.width);assert.ok(layout.breakdown.left>=layout.goal.left&&layout.breakdown.right<=layout.goal.right);result[name]=layout;
  }

 }
 await writeFile(resolve(out,label+'-results.json'),JSON.stringify({result,errors},null,2));
 console.log(JSON.stringify({result,errors}));assert.deepEqual(errors,[]);
}catch(error){console.error(JSON.stringify({errors}));throw error;}finally{await context?.close();await session.cleanup();await new Promise(r=>setTimeout(r,1000));}
