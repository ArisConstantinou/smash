// Native GPU reproduction. Test hooks are appended in the browser only.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const out=resolve(process.env.CODEX_TEST_OUTPUT,'contact-regression');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(process.env.CODEX_WORK_OUTPUT,'temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const baseline=process.env.SMASH_BASELINE==='1',label=baseline?'before':'after';
const source=async name=>baseline?execFileSync('git',['show','65b9dcb:'+name],{encoding:'utf8',maxBuffer:1024*1024}):readFile('E:/Smash/'+name,'utf8');
const game=await source('game.js');
const hook=`
const originalQAFrame=frame;let frozenQA=false;
frame=function(t){if(!frozenQA)originalQAFrame(t);else{renderer.render(scene,camera);requestAnimationFrame(frame);}};
let staleQA=0,spiedQA=false;
window.__contactQA={get ready(){return gameReady},get renderer(){return renderer},get destruction(){return destruction},
 prepare(){startGame(15,{test:true});const o=world.buildingObjects.find(o=>!o.dead&&Math.hypot(o.x,o.z)<20);this.subject=o;
 if(!spiedQA){const get=renderer._objects.get;renderer._objects.get=function(object,...args){const r=get.call(this,object,...args);if(r.geometry!==object.geometry)staleQA++;return r;};spiedQA=true;}
 player.x=o.x;player.z=o.z-o.d/2-3;player.invincible=1e9;frozenQA=true;
 camera.zoom=1.5;camera.updateProjectionMatrix();cameraTarget.set(o.x,o.h*.35,o.z);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);
 this.render();return {type:o.type,x:o.x,z:o.z,h:o.h,w:o.w,hp:o.hp};},
 stage(fraction){const o=this.subject;hurtObject(o,Math.max(0,o.hp-o.maxHp*fraction),0,{x:o.x,y:o.h*.3,z:o.z-o.d/2});for(let i=0;i<6;i++){updateObjects(.1);destruction.update(.1,player);}return this.render();},
 car(){startGame(1,{test:false});const car=world.objects.find(o=>o.type==='car'&&Math.hypot(o.x,o.z)<25);this.subject=car;
 player.x=car.x-2;player.z=car.z-1;player.invincible=0;
 cameraTarget.set(car.x,.5,car.z);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);camera.zoom=2;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 spawnEnemy('zombie',{x:car.x+2,z:car.z});this.enemy=enemies.at(-1);this.enemy.speed=0;
 hurtObject(car,car.hp+1);return this.render();},
 stepCar(seconds){for(let left=seconds;left>1e-8;left-=1/120){const dt=Math.min(left,1/120);updateObjects(dt);vehicleEffects.update(dt,player,camera);destruction.update(dt,player);updateEffects(dt);}return this.render();},
 render(){staleQA=0;renderer.render(scene,camera);return {hp:this.subject.hp,dead:!!this.subject.dead,armed:!!this.subject.exploding,enemyHP:this.enemy?.hp,playerHP:player.hp,fire:vehicleEffects.fire.count,blast:vehicleEffects.explosion?.geometry.drawRange.count||0,stars:impactClouds.pool.filter(p=>p.star&&p.life>0).length,smoke:vehicleEffects.smoke.count,stale:staleQA,stage:this.subject.destruction?.stage,parts:destruction.debris.length,indices:this.subject.destruction?.batches.reduce((n,b)=>n+b.mesh.geometry.drawRange.count,0),png:renderer.domElement.toDataURL('image/png')};}
};`;
const session=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});
const results=[];let errors=[],context;
try{
 context=await session.browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/game.js*',r=>r.fulfill({status:200,contentType:'text/javascript',body:game+hook}));
 if(baseline)for(const name of ['renderer-policy.js','vehicle-effects.js']){const body=await source(name);await context.route('**/'+name+'*',r=>r.fulfill({status:200,contentType:'text/javascript',body}));}
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/404|Failed to load resource/.test(m.text()))errors.push(m.text());});
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});await page.waitForFunction(()=>__contactQA.ready,null,{timeout:120000});
 await page.locator('#startButton').click();await page.waitForTimeout(500);
 results.push(await page.evaluate(()=>__contactQA.prepare()));
 for(const fraction of [1,.75,.45,.2,0]){
  await page.evaluate(f=>__contactQA.stage(f),fraction);await page.waitForTimeout(150);
  const s=await page.evaluate(()=>__contactQA.render());
  await writeFile(resolve(out,label+'-building-'+fraction+'.png'),Buffer.from(s.png.split(',')[1],'base64'));delete s.png;results.push(s);
 }
 await page.evaluate(()=>__contactQA.car());
 for(const [name,step] of [['warning',.3],['armed',.6],['burst',.4],['smoke',.65],['gone',2]]){
  await page.evaluate(s=>__contactQA.stepCar(s),step);await page.waitForTimeout(80);const s=await page.evaluate(()=>__contactQA.render());
  await writeFile(resolve(out,label+'-car-'+name+'.png'),Buffer.from(s.png.split(',')[1],'base64'));delete s.png;results.push({name,...s});
 }
 await writeFile(resolve(out,label+'-results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
 if(!baseline){
  assert.ok(results.every(s=>!s.stale),'GPU records must follow current fracture/batch geometry');
  const car=results.filter(s=>s.name);assert.equal(car[1].armed,true);assert.equal(car[1].dead,false);assert.equal(car[2].dead,true);assert.ok(car[2].blast>0);assert.equal(car[2].stars,0);
  assert.equal(car[3].fire,0);assert.equal(car[4].smoke,0);assert.ok(car[2].playerHP<car[1].playerHP);assert.ok(car[2].enemyHP<car[1].enemyHP);
 }
 assert.deepEqual(errors,[]);
}finally{await context?.close();await session.cleanup();await new Promise(r=>setTimeout(r,1000));}
