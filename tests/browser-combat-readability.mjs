import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const stage=process.env.CODEX_GENERATED_OUTPUT||'E:/CodexGenerated/smash/staging';
const out=resolve(stage,'tests/combat-readability');
const before=process.argv.includes('--before');
const prefix=before?'before':'after';
await mkdir(out,{recursive:true});process.env.TEMP=process.env.TMP=resolve(stage,'work/temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const hook=`
window.__combatReadability={
 ready:()=>gameReady,
 rubble(){
   startGame(16,{test:true});window.__readabilityFreeze=true;
   $('announcement').hidden=true;
   const building=world.buildingObjects.find(o=>o.type==='office');
   const x=building.x,z=building.z;
   Object.assign(player,{x,z,y:0});
   const enemy=spawnEnemy('zombie',{x:x+building.w/2+2,z});
   Object.assign(enemy,{x:x+1.15,z,y:0});enemy.mesh.position.set(enemy.x,0,z);
   hurtObject(building,building.hp+1,1,{x,y:1,z});
   const piece=destruction.debris.reduce((a,b)=>a.mesh.geometry.boundingBox.getSize(new THREE.Vector3()).lengthSq()>b.mesh.geometry.boundingBox.getSize(new THREE.Vector3()).lengthSq()?a:b);
   const ray=cameraOffset.clone().normalize();
   // Position a genuine facade fragment at a repeatable foreground crossing.
   piece.mesh.position.set(x+.6,1,z).addScaledVector(ray,2.4);
   piece.mesh.scale.setScalar(1.75);piece.mesh.rotation.set(.15,.2,.13);
   for(const fragment of destruction.debris){fragment.settled=true;fragment.support=null;fragment.life=10;}
   destruction.update(.001,player);
   piece.mesh.scale.setScalar(1.75);
   destruction.renderer.sync(destruction.debris);
   poseHero(0);updateBattleCamera(2,new THREE.Vector3(x,.6,z));camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);
   world.updateVisibility(player,camera);updateBattleVisibility(.1);
   updateHUD(true);renderer.render(scene,camera);drawFX();
   return {hp:player.hp,enemyAlive:!enemy.dead,fragments:destruction.debris.length,heroSilhouette:heroSilhouette.visible,enemyCue:typeof rubbleHiddenEnemies!=='undefined'&&rubbleHiddenEnemies.has(enemy)};
 },
 render(){renderer.render(scene,camera);drawFX();},
 approach(){
   startGame(1,{test:true});window.__readabilityFreeze=true;
   const offices=world.buildingObjects.filter(o=>o.type==='office'&&Math.hypot(o.x,o.z)>45).slice(0,6);
   const rows=[];
   for(const o of offices){
     const x=o.x-o.w/2-7,z=o.z;
     let maxPreparationSlice=0;
     for(let i=0;i<132;i++){
       const start=performance.now();
       world.prepareNearbyCollision?.(x-13*(1-i/131),z);
       maxPreparationSlice=Math.max(maxPreparationSlice,performance.now()-start);
     }
     const a=world.collisionDiagnostics.cacheBuilds;
     const t=performance.now();
     const hit=o.geometryHit({x,y:1.4,z},{x:o.x,y:1.4,z},.14);
     const first=performance.now()-t,builds=world.collisionDiagnostics.cacheBuilds-a;
     const secondStart=performance.now();
     o.geometryHit({x,y:1.4,z},{x:o.x,y:1.4,z},.14);
     rows.push({hit:!!hit,builds,first,repeat:performance.now()-secondStart,maxPreparationSlice});
   }
   return rows;
 }
};`;
const gameSource=before?execFileSync('git',['-C','E:/Smash','show','29c2ccd:game.js'],{encoding:'utf8'}):await readFile('game.js','utf8');
const source=gameSource.replace('function frame(now){','function frame(now){if(globalThis.__readabilityFreeze){requestAnimationFrame(frame);return;}');
const managed=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});
let context;
try{
 context=await managed.browser.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true});
 await context.route('**/game.js*',r=>r.fulfill({contentType:'text/javascript',body:source+hook}));
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const url=before?'http://127.0.0.1:8000/':'http://127.0.0.1:8000/candidate/';
 await page.goto(url,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__combatReadability?.ready(),null,{timeout:120000});
 const rubble=await page.evaluate(()=>__combatReadability.rubble());
 await page.evaluate(async()=>{for(let i=0;i<4;i++){await new Promise(requestAnimationFrame);__combatReadability.render();}});
 await page.screenshot({path:resolve(out,prefix+'-rubble.png')});
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const approach=await page.evaluate(()=>__combatReadability.approach());
 assert.ok(rubble.enemyAlive&&rubble.hp>0&&rubble.fragments>0);
 assert.ok(approach.length>=4&&approach.every(row=>row.hit));
 if(before){assert.equal(rubble.heroSilhouette,false);assert.ok(approach.some(row=>row.builds>0));}
 else{assert.ok(rubble.heroSilhouette&&rubble.enemyCue);assert.ok(approach.every(row=>row.builds===0));}
 assert.deepEqual(errors,[]);
 const result={rubble,approach,errors};
 await writeFile(resolve(out,prefix+'.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await context?.close();await managed.cleanup();}
