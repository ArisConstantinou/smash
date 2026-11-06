// Real renderer smoke-test and pose review. This script is NOT imported by the game.
// Run with Playwright + Chromium installed: node tools/verify-kick6.mjs
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const out='browser-evidence';await mkdir(out,{recursive:true});
const root=process.cwd(),report={errors:[],layouts:[],poses:[]};
const injection=`
window.__kickQA={
 state:()=>({phase,kick:!!kicking.active,leap:!!leap,small:!!leap?.strike,dash:dashTime,spin:!!spin}),
 stop:()=>{window.requestAnimationFrame=()=>0;},
 pose:(kind,view)=>{
  clearInput();kicking.reset();attackCooldown=0;spin=null;swing=null;spinRecovery=null;leap=null;dashTime=0;landingRecovery=0;throwFlight=null;throwWindup=null;
  stance=stanceTarget=1;hero.userData.setEquipment(0);hero.userData.setStance(1);player.x=player.y=player.z=0;facing={x:0,z:1};hero.rotation.set(0,0,0);phase='playing';
  poseHero(0);
  if(kind==='spin'){startSpin();spin.time=.4;spin.rotation=1.2;poseHero(0);hero.rotation.y=0;}
  if(kind==='kick'){kicking.start();kicking.active.time=.34*.41;poseHero(0);hero.rotation.y=0;}
  if(kind==='swing'){startSwing(0);swing.time=swing.duration*.5;poseHero(0);hero.rotation.y=0;}
  for(const n of scene.children)n.visible=n===hero||!!n.isLight;
  scene.fog=null;scene.background=new THREE.Color(0x263b42);phase='paused';
  const views={front:[0,2.1,6],side:[6,2.6,3],back:[-4,3,-6]};camera.position.set(...views[view]);
  camera.left=-2.35;camera.right=2.35;camera.top=1.65;camera.bottom=-1.65;
  camera.lookAt(0,1.0,.30);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);hero.updateMatrixWorld(true);
  sun.position.set(-4,6,5);sun.target.position.set(0,1,0);sun.target.updateMatrixWorld(true);sun.intensity=2.4;fillLight.intensity=1.6;
  renderer.render(scene,camera);return {kind,view,grip:hero.userData.rightGrip.position.toArray()};
 }
};`;
// startSwing is named swingHammer in some builds: bind the shipped action, not a QA pose.
const game=await readFile('game.js','utf8');
const actualInjection=injection.replace('startSwing(0);','startSwingForQA();');
const swingAlias=game.includes('function startSwing(')?'const startSwingForQA=()=>startSwing(0);':game.includes('function swingHammer(')?'const startSwingForQA=()=>swingHammer(0);':'const startSwingForQA=()=>{pressAttack();};';
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+'/'))throw Error('path');
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.ogg':'audio/ogg','.wav':'audio/wav','.mp3':'audio/mpeg','.png':'image/png','.json':'application/json'}[extname(file)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(file===resolve(root,'game.js')?game+'\n'+swingAlias+actualInjection:await readFile(file));
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(8765,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
 for(const [name,width,height,touch] of [['desktop',1440,900,false],['phone',390,844,true],['tablet',820,1180,true]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:touch,hasTouch:touch});
  page.on('pageerror',e=>report.errors.push(name+': '+e));
  await page.addInitScript(()=>localStorage.setItem('ironfall.settings',JSON.stringify({quality:'low',shake:false,muted:true,volume:0})));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#startButton')?.disabled===false,null,{timeout:90000});
  await page.locator('#startButton').click();await page.waitForTimeout(700);
  const layout=await page.evaluate(()=>{const ids=['attackButton','kickButton','guardButton','leapButton','throwButton','dashButton'];return {touch:document.body.dataset.touchControls,actions:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,x:r.x,y:r.y,w:r.width,h:r.height,visible:getComputedStyle(e).display!=='none',image:getComputedStyle(e.querySelector('.action-picture')).display,icon:getComputedStyle(e.querySelector('.action-icon')).display};})};});
  report.layouts.push({name,...layout});
  for(const e of layout.actions){assert.ok(e.visible&&e.w>35&&e.h>35,name+' missing action '+e.id);assert.ok(e.x>=0&&e.y>=0&&e.x+e.w<=width+1&&e.y+e.h<=height+1,name+' action clipped '+e.id);assert.equal(e.image==='none',touch);assert.equal(e.icon==='none',!touch);}
  await page.screenshot({path:out+'/'+name+'-game.png'});
  if(!touch){
    await page.keyboard.press('e');await page.keyboard.press('Space');await page.keyboard.press('Shift');
    await page.waitForTimeout(500);
    await page.evaluate(()=>window.__kickQA.stop());await page.waitForTimeout(200);
    await page.addStyleTag({content:'body>*:not(#gameCanvas){visibility:hidden!important} #gameCanvas{visibility:visible!important;position:fixed!important;inset:0!important}'});
    for(const kind of ['rest','spin','kick','swing'])for(const view of ['front','side']){
      report.poses.push(await page.evaluate(([k,v])=>window.__kickQA.pose(k,v),[kind,view]));
      await page.locator('#gameCanvas').screenshot({path:out+'/club-'+kind+'-'+view+'.png'});
    }
  }
  await page.close();
 }
 assert.deepEqual(report.errors,[]);report.success=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{if(browser)await browser.close();server.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
