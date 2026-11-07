// Browser-only probes: appended to the test server response, never production.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export const manualCombatQA=`
Object.assign(window.__ironfallQA,{
  prepareManualArena(){
    clearInput();for(const e of enemies)disposeInstance(e);enemies=[];
    world.objects.forEach((o,i)=>{o.x=500+i*10;o.z=500;o.mesh.position.set(o.x,o.baseY||0,o.z);});
    world.rebuildSpatialIndex();for(const h of world.hazards){h.x=500;h.z=500;}
    if(wave)wave.timer=100000;
    Object.assign(player,{x:0,z:0,y:0,vy:0,vx:0,vz:0,invincible:10000});
    facing={x:0,z:1};aim.x=0;aim.z=1;pointer.active=false;
    swing=null;spin=null;spinCharge=null;spinRecovery=null;attackCooldown=0;throwCooldown=0;
    settings.throwAutoLock=false;settings.shake=false;poseHero(1);updateAimPreview(false);
  },
  manualState(){return {x:player.x,z:player.z,facing:{...facing},aim:{...aim},
    swing:swing?{x:swing.fx,z:swing.fz}:null,spinning:!!spin,momentum:spin?.momentum||0,
    turnOnly:touch.turnOnly,walking:movementStrength(),previews:aimDiagnostics.previews,
    throwPreviews:aimDiagnostics.throwPreviews,ribbons:arcs.length,
    throwTarget:throwWindup?.target?.type||null,hints:meleeHintTargets.length,
    enemies:enemies.map(e=>({x:e.x,z:e.z,hp:e.hp,maxHp:e.maxHp}))};},
  manualStep(seconds){let seenSpin=false,maxRibbons=0;const strokes=new Set();
    for(let left=seconds;left>1e-8;left-=1/120){updatePlayer(Math.min(left,1/120));
      seenSpin||=!!spin;if(swing)strokes.add(swing);maxRibbons=Math.max(maxRibbons,arcs.length);}
    updateAimPreview(false);updateHUD();return {seenSpin,strokes:strokes.size,maxRibbons};},
  manualTargets(){for(const [x,z] of [[0,2.1],[2.1,0],[0,-2.1],[-2.1,0]]){
    const e=spawnEnemy('brute',{x:player.x+x,z:player.z+z});
    e.hp=e.maxHp=100000;e.speed=0;e.timer=100000;e.state='idle';}
    updateAimPreview(false);},
  removeManualTargets(){for(const e of enemies){e.x+=50;e.z+=50;e.mesh.position.set(e.x,0,e.z);}},
  aimScreenPoint(){return screenPoint(player.x,player.y+1.2,player.z+6);}
});
`;

export async function verifyManualCombat(page,config,output){
  await page.evaluate(()=>window.__ironfallQA.prepareManualArena());
  const before=await page.evaluate(()=>window.__ironfallQA.manualState());
  if(config.mobile){
    const stick=await page.locator('#joystick').boundingBox();assert.ok(stick);
    assert.equal(await page.locator('.joystick').count(),1,'There must be exactly one joystick');
    const x=stick.x+stick.width/2,y=stick.y+stick.height/2,r=Math.min(stick.width,stick.height)*.34;
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-r*.28,y,id:1}]});
    await page.evaluate(()=>window.__ironfallQA.manualStep(.25));
    const turn=await page.evaluate(()=>window.__ironfallQA.manualState());
    assert.equal(turn.turnOnly,true);assert.equal(turn.walking,0);
    assert.ok(Math.hypot(turn.x-before.x,turn.z-before.z)<.001,'Small real touch input turns without walking');
    assert.ok(Math.hypot(turn.facing.x-before.facing.x,turn.facing.z-before.facing.z)>.2);
    assert.equal(await page.locator('#joystick').getAttribute('data-intent'),'turn');
    await page.screenshot({path:resolve(output,config.name+'-manual-aim.png'),timeout:60000});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-r*.95,y,id:1}]});
    await page.evaluate(()=>window.__ironfallQA.manualStep(.15));
    const walk=await page.evaluate(()=>window.__ironfallQA.manualState());
    assert.ok(walk.walking>.8);assert.ok(Math.hypot(walk.x-turn.x,walk.z-turn.z)>.1);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.evaluate(()=>window.__ironfallQA.manualStep(.1));
    const stopped=await page.evaluate(()=>window.__ironfallQA.manualState());
    assert.equal(stopped.walking,0);assert.ok(stopped.facing.x*walk.facing.x+stopped.facing.z*walk.facing.z>.999);
    await cdp.detach();
  }else{
    const point=await page.evaluate(()=>window.__ironfallQA.aimScreenPoint());
    await page.mouse.move(point.x,point.y);await page.keyboard.down('a');await page.mouse.down();
    const manual=await page.evaluate(()=>window.__ironfallQA.manualState());
    assert.ok(manual.swing,'A real mouse press starts a stroke');
    assert.ok(manual.swing.x*manual.aim.x+manual.swing.z*manual.aim.z>.999,'Mouse direction owns the stroke while a movement key is held');
    await page.mouse.up();await page.keyboard.up('a');
  }
  await page.evaluate(()=>window.__ironfallQA.prepareManualArena());
  async function press(){
    if(config.mobile){
      const b=await page.locator('#attackButton').boundingBox();
      const cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:7}]});
      return async()=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();};
    }
    const p=await page.evaluate(()=>window.__ironfallQA.aimScreenPoint());await page.mouse.move(p.x,p.y);await page.mouse.down();
    return async()=>page.mouse.up();
  }
  let release=await press();
  const empty=await page.evaluate(()=>window.__ironfallQA.manualStep(2.5));
  assert.equal(empty.seenSpin,false,'Holding in empty space never grants rotation');assert.ok(empty.strokes>=4);
  await release();
  await page.evaluate(()=>{window.__ironfallQA.prepareManualArena();window.__ironfallQA.manualTargets();});
  release=await press();
  const earned=await page.evaluate(()=>window.__ironfallQA.manualStep(.5));
  const contact=await page.evaluate(()=>window.__ironfallQA.manualState());
  assert.ok(earned.seenSpin&&contact.spinning,'Actual weapon contact earns the held spin');
  assert.ok(contact.enemies.some(e=>e.hp<e.maxHp));assert.ok(contact.momentum>0&&contact.momentum<=1);
  const sustained=await page.evaluate(()=>window.__ironfallQA.manualStep(2));
  assert.ok(sustained.maxRibbons<=48,'Effects stay bounded even between rendered frames');
  await page.evaluate(()=>window.__ironfallQA.removeManualTargets());
  await page.evaluate(()=>window.__ironfallQA.manualStep(1.05));
  assert.equal((await page.evaluate(()=>window.__ironfallQA.manualState())).spinning,false);
  const exhausted=await page.evaluate(()=>window.__ironfallQA.manualStep(1.5));
  assert.equal(exhausted.seenSpin,false,'Holding cannot restart a spin without another contact');
  await release();
  return {singleStick:config.mobile,manualInput:true,earnedSpin:true,contactDecay:true,boundedTrails:true};
}
