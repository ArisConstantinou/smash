// Appended by the browser test server only; none of these hooks ship in game.js.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export const barbedCombatQA=`
let barbedBrowserProbe=null;
const barbedBrowserUpdateGame=updateGame,barbedBrowserUpdateEffects=updateEffects;
// Keep the first real contact on screen for evidence. Input, animation and
// collision run normally until hitEnemy reports an actual health reduction.
updateGame=function(dt){if(!barbedBrowserProbe?.frozen)barbedBrowserUpdateGame(dt);};
updateEffects=function(dt){if(!barbedBrowserProbe?.frozen)barbedBrowserUpdateEffects(dt);};
const barbedBrowserHitEnemy=hitEnemy;
hitEnemy=function(enemy,...args){
  barbedBrowserHitEnemy(enemy,...args);
  const probe=barbedBrowserProbe;
  if(!probe||probe.enemy!==enemy||probe.hit||enemy.hp>=probe.startHP)return;
  probe.hit={damage:probe.startHP-enemy.hp,strikeDamage:swing?.damage,
    variant:swing?.variant,reaction:enemy.impact?.reaction,vy:enemy.vy,
    flash:enemy.flash,stagger:enemy.stagger,
    impactAngle:probe.startRotation.angleTo(enemy.mesh.quaternion),
    inward:(player.x-enemy.x)*enemy.vx+(player.z-enemy.z)*enemy.vz,
    speed:Math.hypot(enemy.vx,enemy.vz),
    distance:Math.hypot(enemy.x-player.x,enemy.z-player.z)};
  probe.frozen=true;
};
Object.assign(window.__ironfallQA,{
  prepareBarbedScenario(kind){
    barbedBrowserProbe=null;startGame(6,{test:true});
    window.__ironfallQA.prepareManualArena();
    levels.range=5;applyStats();resetAttackChain();
    const direction=screenMovement(0,-1);
    facing={...direction};aim.x=direction.x;aim.z=direction.z;pointer.active=false;
    hero.rotation.y=Math.atan2(direction.x,direction.z);poseHero(1);
    cameraTarget.set(player.x+direction.x*.8,.6,player.z+direction.z*.8);
    camera.position.copy(cameraTarget).add(cameraOffset);camera.lookAt(cameraTarget);camera.updateMatrixWorld(true);
    const distance=kind==='head'?stats.range+.2:1.7;
    const enemy=spawnEnemy('brute',{x:player.x+direction.x*distance,z:player.z+direction.z*distance});
    Object.assign(enemy,{hp:10000,maxHp:10000,speed:0,timer:100000,state:'idle',vx:0,vy:0,vz:0});
    enemy.mesh.position.set(enemy.x,enemy.y,enemy.z);enemy.mesh.updateMatrixWorld(true);
    barbedBrowserProbe={kind,enemy,startHP:enemy.hp,startRotation:enemy.mesh.quaternion.clone(),hit:null,frozen:false};
    announcementTimer=0;$('announcement').hidden=true;updateAimPreview(false);updateHUD(true);
    return window.__ironfallQA.barbedBrowserState();
  },
  barbedAimScreenPoint(){return screenPoint(player.x+facing.x*3,player.y+1.2,player.z+facing.z*3);},
  barbedBrowserState(){
    const probe=barbedBrowserProbe,u=hero.userData,start=new THREE.Vector3(),end=new THREE.Vector3();
    const active=!!u.getBarbedContactSegment?.(start,end);
    let instances=0;u.barbedWrap?.traverse(node=>{if(node.isInstancedMesh)instances+=node.count;});
    return {hit:probe?.hit||null,active,instances,guardVisible:!!u.handGuard?.visible,
      wireLength:active?start.distanceTo(end):0,range:stats.range,
      hp:probe?.enemy.hp,speed:probe?Math.hypot(probe.enemy.vx,probe.enemy.vz):0,
      distance:probe?Math.hypot(probe.enemy.x-player.x,probe.enemy.z-player.z):0,
      y:probe?.enemy.y,vy:probe?.enemy.vy};
  },
  stepBarbedToContact(){
    for(let i=0;i<144&&!barbedBrowserProbe?.hit;i++)updatePlayer(1/240);
    updateAimPreview(false);updateHUD();return window.__ironfallQA.barbedBrowserState();
  },
  decayBarbedImpact(){
    // Exercise the real enemy body integrator after the strike, with no
    // additional player attack or artificial position/velocity assignment.
    for(let i=0;i<66;i++)updateEnemies(1/120);
    return window.__ironfallQA.barbedBrowserState();
  },
  finishBarbedScenario(){barbedBrowserProbe=null;clearInput();},
});
`;

export async function verifyBarbedCombat(page,config,output){
  async function attack(){
    if(config.mobile)await page.locator('#attackButton').tap();
    else{
      const point=await page.evaluate(()=>window.__ironfallQA.barbedAimScreenPoint());
      await page.mouse.click(point.x,point.y);
    }
    return page.evaluate(()=>window.__ironfallQA.stepBarbedToContact());
  }
  try{
    const geometry=await page.evaluate(()=>window.__ironfallQA.prepareBarbedScenario('wire'));
    assert.equal(geometry.active,true,'The equipped iron hammer exposes its real wire segment');
    assert.ok(geometry.instances>1&&geometry.wireLength>3,'An upgraded shaft has repeated physical wire geometry');
    assert.equal(geometry.guardVisible,true,'The hands retain a visible guard before the wire');
    await page.screenshot({path:resolve(output,config.name+'-long-barbed-weapon.png'),timeout:60000});

    const close=await attack();
    assert.ok(close.hit,'A real mouse/touch attack must physically connect with the close enemy');
    assert.equal(close.hit.variant,'one-forehand');
    assert.equal(close.hit.damage,Math.round(close.hit.strikeDamage*.55));
    assert.equal(close.hit.reaction,'slash');
    assert.ok(close.hit.flash>0&&close.hit.stagger>0&&close.hit.impactAngle>.05,'The damage frame contains a visible flinch and flash');
    assert.ok(close.hit.inward>0&&close.hit.speed>0&&close.hit.speed<4,'Wire contact briefly pulls toward the player');
    assert.equal(close.hit.vy,0,'Wire contact does not launch the enemy');
    await page.screenshot({path:resolve(output,config.name+'-wire-impact.png'),timeout:60000});
    const released=await page.evaluate(()=>window.__ironfallQA.decayBarbedImpact());
    assert.equal(released.hp,close.hp,'The same slash cannot keep dealing damage');
    assert.ok(released.speed<close.hit.speed*.08,'The impulse expires instead of tethering the enemy');
    assert.ok(close.hit.distance-released.distance<.7,'The pull only displaces the enemy a short distance');

    await page.evaluate(()=>window.__ironfallQA.prepareBarbedScenario('head'));
    const far=await attack();
    assert.ok(far.hit,'The far enemy must be reached by the actual head sweep');
    assert.equal(far.hit.damage,far.hit.strikeDamage);
    assert.equal(far.hit.reaction,'blunt');
    assert.ok(far.hit.inward<0&&far.hit.vy>0,'The hammer head retains outward knockback and lift');
    await page.screenshot({path:resolve(output,config.name+'-head-impact.png'),timeout:60000});
    return {upgradedWireGeometry:true,realAttackInput:true,closeSlash:true,inwardImpact:true,
      noWireLaunch:true,finitePull:true,farHeadKnockback:true};
  }finally{await page.evaluate(()=>window.__ironfallQA.finishBarbedScenario());}
}
