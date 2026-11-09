// Native rendering + real interactions at matched viewports. Safe-area values
// are simulated CSS inputs, not certification of a physical iPhone.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve(process.env.CODEX_TEST_OUTPUT,'hud-layout');await mkdir(out,{recursive:true});
process.env.TEMP=process.env.TMP=resolve(process.env.CODEX_WORK_OUTPUT,'temp');
const skill=resolve(process.env.USERPROFILE,'.codex/skills/develop-web-game');
const {chromium}=await import(pathToFileURL(resolve(skill,'node_modules/playwright/index.mjs')));
const {launchManagedBrowser}=await import(pathToFileURL(resolve(skill,'scripts/browser_lifecycle.mjs')));
const label=process.env.SMASH_HUD_LABEL||'before',origin=process.env.SMASH_HUD_ORIGIN||'http://127.0.0.1:8000/';
const game=await(await fetch(new URL('game.js',origin))).text();
const hook=`
const hudQAFrame=frame;let hudQAFrozen=false;
frame=function(t){if(hudQAFrozen){renderer.render(scene,camera);requestAnimationFrame(frame);}else hudQAFrame(t);};
window.__hudQA={get ready(){return gameReady},
 seedResume(){saveStore.write('ironfall.character',{character:createCharacterProgression(15)});updateSavedCharacter();},
 input(){return {phase,guardHeld,width:screenW,height:screenH,zoom:camera.zoom};},
 prepare(){startGame(15,{test:true});hudQAFrozen=true;const total=world.objects.reduce((n,o)=>n+o.weight,0);let done=0;
  for(const o of world.objects){if(Math.hypot(o.x,o.z)<25)continue;if(done/total*100>=35)break;hurtObject(o,o.hp+1);done+=o.weight;}
  for(let i=0;i<7;i++){spawnEnemy('zombie',{x:45+i,z:45});const e=enemies.at(-1);hitEnemy(e,e.hp+1,{x:0,z:1},0,0);}
  player.x=0;player.z=0;hero.position.set(0,0,0);poseHero(0);updateEffects(4.5);updateHUD(true);resize();cameraTarget.set(0,.6,0);camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);renderer.render(scene,camera);
  return {destruction:destructionPercent(world.objects),kills:battleKills,goal:document.querySelector('#goalValue').textContent};
 },grantUpgrade(){openUpgrade();}};`;
const session=await launchManagedBrowser(chromium,{headless:true,channel:'chrome',screenshotDir:out});
const cases=[
 {name:'iphone-browser',width:393,height:682,safe:0},
 {name:'portrait',width:390,height:844,safe:0},
 {name:'small',width:320,height:568,safe:0},
 {name:'landscape',width:844,height:390,safe:0},
 {name:'short-landscape',width:667,height:360,safe:0},
 {name:'iphone-landscape',width:932,height:313,safe:0,left:59,right:59,bottom:21},
 {name:'inset-browser',width:393,height:682,safe:44},
 {name:'standalone',width:393,height:852,safe:44,standalone:true},
 {name:'desktop',width:1440,height:900,safe:0},
].filter(c=>!process.env.SMASH_HUD_CASE||process.env.SMASH_HUD_CASE.split(',').includes(c.name));
let context;const results=[],errors=[];
async function verifyMenuZoom(page){
 const checkSurface=async selector=>{
  const target=page.locator(selector);
  await target.waitFor({state:'visible'});
  const gestures=await target.evaluate(el=>{
   const blocked=(type,count=0)=>{
    const event=type.startsWith('touch')
     ?new TouchEvent(type,{bubbles:true,cancelable:true,touches:Array.from({length:count},(_,identifier)=>new Touch({identifier,target:el}))})
     :new Event(type,{bubbles:true,cancelable:true});
    return !el.dispatchEvent(event);
   };
   return {pinchStart:blocked('gesturestart'),pinchChange:blocked('gesturechange'),
    twoFingerStart:blocked('touchstart',2),twoFingerMove:blocked('touchmove',2),
    singleTap:blocked('touchstart',1),singleScroll:blocked('touchmove',1)};
  });
  assert.deepEqual(gestures,{pinchStart:true,pinchChange:true,twoFingerStart:true,twoFingerMove:true,
   singleTap:false,singleScroll:false},selector);
 };
 await checkSurface('#menuAudioButton');
 const box=await page.locator('#menuAudioButton').boundingBox();
 const x=box.x+box.width/2,y=box.y+box.height/2;
 await page.touchscreen.tap(x,y);
 await page.touchscreen.tap(x,y);
 const session=await page.context().newCDPSession(page);
 try{
  const touch=(type,points)=>session.send('Input.dispatchTouchEvent',{
   type,touchPoints:points.map(([x,y],id)=>({x,y,id}))
  });
  const middle=page.viewportSize();
  const pinchX=middle.width/2,pinchY=middle.height/2;
  await touch('touchStart',[[pinchX-20,pinchY],[pinchX+20,pinchY]]);
  for(const distance of [28,40,55,70])await touch('touchMove',[[pinchX-distance,pinchY],[pinchX+distance,pinchY]]);
  await touch('touchEnd',[]);
  assert.equal(await page.evaluate(()=>visualViewport.scale),1);
 }finally{await session.detach();}
 await page.locator('#menuSettingsButton').tap();
 await checkSurface('#closeSettingsButton');
 await page.locator('#closeSettingsButton').tap();
 await page.locator('#menuMountWorkshopButton').tap();
 await checkSurface('#workshopClose');
 await page.locator('#workshopClose').tap();
}
async function verifyBattleGestures(page){
 const session=await page.context().newCDPSession(page);
 const {width,height}=page.viewportSize(),x=Math.round(width*.5),y=Math.round(height*.42);
 const touch=(type,positions)=>session.send('Input.dispatchTouchEvent',{
  type,touchPoints:positions.map(([x,y],id)=>({x,y,id}))
 });
 await touch('touchStart',[[x-20,y],[x+20,y]]);
 for(const d of [28,40,55,70])await touch('touchMove',[[x-d,y],[x+d,y]]);
 await touch('touchEnd',[]);
 await touch('touchStart',[[x,y]]);
 await touch('touchMove',[[x,y+40]]);
 await touch('touchMove',[[x,y+60]]);
 await touch('touchEnd',[]);
 await page.touchscreen.tap(x,y);
 await page.touchscreen.tap(x,y);
 const stick=await page.locator('#joystick').boundingBox();
 const cx=Math.round(stick.x+stick.width/2),cy=Math.round(stick.y+stick.height/2);
 await touch('touchStart',[[cx,cy]]);
 await touch('touchMove',[[cx+30,cy-30]]);
 await page.waitForFunction(()=>document.querySelector('#joystick').dataset.intent==='walk');
 await touch('touchEnd',[]);
 await page.waitForFunction(()=>document.querySelector('#joystick').dataset.intent==='idle');
 await page.waitForTimeout(200);
 const gestures=await page.evaluate(()=>{
  const canvas=document.querySelector('#gameCanvas');
  const blocked=name=>!canvas.dispatchEvent(new Event(name,{bubbles:true,cancelable:true}));
  return {scale:visualViewport.scale,x:visualViewport.offsetLeft,y:visualViewport.offsetTop,
   scrollX,scrollY,selection:getSelection().toString(),width:document.documentElement.scrollWidth,
   height:document.documentElement.scrollHeight,gesture:blocked('gesturestart')&&blocked('gesturechange'),
   selectionBlocked:blocked('selectstart'),callout:blocked('contextmenu')};
 });
 assert.deepEqual(gestures,{scale:1,x:0,y:0,scrollX:0,scrollY:0,selection:'',width,height,
  gesture:true,selectionBlocked:true,callout:true});
 await session.detach();
 return gestures;
}
async function verifyResumedControls(page){
 await page.evaluate(()=>window.__hudQA.seedResume());
 await page.locator('#resumeCharacterButton').tap();
 await page.waitForFunction(()=>window.__hudQA.input().phase==='playing');
 const initial=await page.evaluate(()=>window.__hudQA.input());
 assert.equal(initial.zoom,1);
 const scaled=await page.evaluate(()=>{
  const viewport=visualViewport,width=viewport.width,height=viewport.height;
  try{
   for(const [name,value]of Object.entries({width:width/2,height:height/2,scale:2})){
    Object.defineProperty(viewport,name,{value,configurable:true});
   }
   viewport.dispatchEvent(new Event('resize'));
   return window.__hudQA.input();
  }finally{
   for(const name of ['width','height','scale'])delete viewport[name];
   viewport.dispatchEvent(new Event('resize'));
  }
 });
 assert.deepEqual(scaled,initial,'Page scale does not resize the game camera');
 const session=await page.context().newCDPSession(page);
 const center=async id=>{
  const b=await page.locator(id).boundingBox();
  return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};
 };
 const stick={...await center('#joystick'),id:0},guard={...await center('#guardButton'),id:1};
 const touch=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
 try{
  await touch('touchStart',[stick]);
  await touch('touchMove',[{...stick,x:stick.x+30}]);
  await page.waitForFunction(()=>document.querySelector('#joystick').dataset.intent==='walk');
  const player=await page.evaluate(()=>JSON.parse(render_game_to_text()).player);
  await page.evaluate(()=>{
   const viewport=visualViewport,height=viewport.height;
   Object.defineProperty(viewport,'height',{value:height-20,configurable:true});
   try{viewport.dispatchEvent(new Event('resize'));}finally{delete viewport.height;}
  });
  await page.waitForFunction(player=>{
   const next=JSON.parse(render_game_to_text()).player;
   return Math.hypot(next.x-player.x,next.z-player.z)>.15;
  },player,{timeout:4000});
  await page.evaluate(()=>visualViewport.dispatchEvent(new Event('resize')));
  await touch('touchStart',[{...stick,x:stick.x+30},guard]);
  await page.waitForFunction(()=>window.__hudQA.input().guardHeld,{},{timeout:4000});
  await touch('touchEnd',[]);
  await page.waitForFunction(()=>!window.__hudQA.input().guardHeld);
 }finally{await session.detach();}
}
try{
 for(const c of cases){
  const mobile=c.name!=='desktop';
  context=await session.browser.newContext({viewport:{width:c.width,height:c.height},hasTouch:mobile,isMobile:mobile});
  await context.route('**/game.js*',r=>r.fulfill({status:200,contentType:'text/javascript',body:game+hook}));
  await context.route('**/*.css*',async r=>{const response=await r.fetch();let css=await response.text();
   css=css.replace(/env\(safe-area-inset-top(?:,\s*0px)?\)/g,c.safe+'px');
   for(const side of ['left','right','bottom'])if(c[side])css=css.replace(new RegExp('env\\(safe-area-inset-'+side+'(?:,\\s*0px)?\\)','g'),c[side]+'px');
   if(c.standalone)css=css.replace(/\(display-mode:standalone\)/g,'(min-width:0px)');
   await r.fulfill({response,body:css});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push({case:c.name,error:e.message}));
  await page.setViewportSize({width:c.width,height:c.height});await page.goto(origin,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__hudQA?.ready,null,{timeout:120000});
  if(label.startsWith('after')&&['iphone-browser','iphone-landscape'].includes(c.name)){
   await verifyMenuZoom(page);
   await verifyResumedControls(page);
  }else await page.locator('#startButton').click();
  await page.waitForFunction(()=>/\d+ FPS/.test(document.querySelector('#performanceHud').textContent));await page.waitForTimeout(3000);
  const state=await page.evaluate(()=>__hudQA.prepare());await page.waitForTimeout(150);
  const layout=await page.evaluate(()=>{
   const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
   const labels=[...document.querySelectorAll('.goal-heading>span,.goal-breakdown>span')].map(e=>({text:e.textContent,font:parseFloat(getComputedStyle(e).fontSize),y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom,width:e.getBoundingClientRect().width,scroll:e.scrollWidth}));
   return {touch:document.body.dataset.touchControls==='true',fps:document.querySelector('#performanceHud').textContent,title:document.querySelector('.goal-heading>span').textContent,scroll:document.documentElement.scrollWidth,width:innerWidth,top:box('.hud-top'),map:box('.minimap-panel'),fpsBox:box('#performanceHud'),toolbar:box('.hud-buttons'),utility:['#mountToggle','#mountWorkshopButton','#upgradesToggle'].map(box),mount:box('#mountControls'),joystick:box('#joystick'),actions:box('#combatDock'),combat:box('.dock-actions'),battleButtons:['#guardButton','#leapButton','#dashButton','#throwButton','#kickButton','#attackButton'].map(box),readout:getComputedStyle(document.querySelector('#mountReadout')).display,goal:box('.goal-panel'),track:box('.goal-track'),number:box('.goal-heading>div'),hero:box('.hero-status'),health:box('.health-track'),wave:box('.run-status'),labels};
  });
  await page.screenshot({path:resolve(out,label+'-'+c.name+'.png')});results.push({case:c.name,state,...layout});
  if(label.startsWith('after')){
   assert.match(layout.fps,/^\d+ FPS$/);assert.equal(layout.title,'ΣΥΝΟΛΙΚΗ ΚΑΤΑΣΤΡΟΦΗ');assert.equal(state.kills,7);assert.equal(state.goal,Math.floor(state.destruction+7)+'%');
   assert.ok(layout.scroll<=c.width);assert.ok(layout.fpsBox.x>=layout.map.x&&layout.fpsBox.right<=layout.map.right);
   if(layout.touch){
    assert.ok(c.standalone?layout.top.y>=44:layout.top.y<=8,'The browser HUD must use its top space; standalone keeps the notch inset');
    assert.ok(layout.actions.x>=layout.joystick.right+6);
    assert.ok(layout.utility.every(b=>b.x>=layout.actions.x&&b.right<=layout.actions.right&&b.width>=44&&b.height>=44));
    if(c.width>c.height){
     const rows=new Map();
     for(const b of [...layout.utility,...layout.battleButtons]){
      const key=Math.round(b.y);rows.set(key,(rows.get(key)||0)+1);
     }
     assert.deepEqual([...rows.values()].sort(),[4,5],'All nine buttons fit in exactly two rows');
     assert.ok(layout.mount.x>=layout.combat.right);
    }else{
     assert.equal(layout.readout,'none');
     assert.ok(layout.utility.every(b=>b.y===layout.utility[0].y));
     assert.ok(layout.mount.bottom<=layout.combat.y&&layout.mount.y>=layout.actions.y);
    }
    for(const name of ['toolbar','joystick','map','actions','goal','hero']){
     const b=layout[name];
     assert.ok(b.x>=(c.left||0)&&b.right<=c.width-(c.right||0)&&b.y>=0&&b.bottom<=c.height-(c.bottom||0),name+' fits the visible safe area');
    }
    assert.ok(layout.wave.x>=layout.hero.x&&layout.wave.right<=layout.hero.right+1&&layout.wave.y>=layout.health.bottom+2&&layout.wave.bottom<=layout.hero.bottom+1,'Wave count belongs inside the health card');
    assert.ok(layout.wave.height<=24&&layout.top.height<=100);
    if(c.width<360&&c.width<c.height)assert.ok(layout.track.right+3<=layout.number.x,'Small portrait progress bar must clear its number');
    if(c.width>c.height){assert.ok(Math.abs(layout.map.y-layout.top.y)<1);assert.ok(layout.goal.width<=264&&layout.goal.right+3<=layout.map.x);}
    else{assert.ok(layout.map.y>=layout.goal.bottom+3);assert.ok(layout.toolbar.right+3<layout.map.x);if(c.width>=360)assert.ok(Math.abs(layout.map.y-layout.toolbar.y)<1);}

    assert.ok(Math.abs(layout.map.right-layout.actions.right)<1);assert.ok(layout.map.bottom<=layout.actions.y-3,'Map must clear the action dock');
    assert.ok(layout.labels.every(l=>l.font>=12&&l.scroll<=l.width+1&&l.y>=layout.goal.y&&l.bottom<=layout.goal.bottom-3),'Contribution labels must stay inside the goal card');
    await page.locator('#mountToggle').tap();
    assert.equal(await page.locator('#mountToggle').getAttribute('aria-pressed'),'true');
    await page.locator('#mountToggle').tap();
    assert.equal(await page.locator('#mountToggle').getAttribute('aria-pressed'),'false');
    if(['iphone-browser','iphone-landscape'].includes(c.name))results.at(-1).gestures=await verifyBattleGestures(page);
   }
   await page.locator('#upgradesToggle').click();await assert.doesNotReject(()=>page.locator('#upgradePanel').waitFor({state:'visible'}));
   await page.locator('#upgradeGearTab').click();assert.equal(await page.locator('#upgradeGearTab').getAttribute('aria-selected'),'true');
   await page.locator('#upgradeCloseButton').click();await page.locator('#upgradePanel').waitFor({state:'hidden'});
   if(c.name==='iphone-browser'){
    await page.evaluate(()=>__hudQA.grantUpgrade());assert.equal(await page.locator('#pendingUpgradeCount').textContent(),'1');
    await page.screenshot({path:resolve(out,label+'-pending-upgrade.png')});
    await page.locator('#upgradesToggle').click();assert.equal(await page.locator('#upgradeChoices .upgrade-card').count(),3);
    await page.locator('#upgradeChoices .upgrade-card').first().click();assert.equal(await page.locator('#pendingUpgradeCount').textContent(),'0');
   }

  }
  await context.close();
 }
 assert.deepEqual(errors,[]);
}catch(error){console.error(JSON.stringify({results,errors}));throw error;}
finally{await writeFile(resolve(out,label+'-results.json'),JSON.stringify({results,errors},null,2));await context?.close();await session.cleanup();await new Promise(r=>setTimeout(r,1000));}
console.log(JSON.stringify({results,errors}));
