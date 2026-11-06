import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeEnemy} from '../models.js';
import {makeCityEnemy,installEnemyHead} from '../enemy-models.js';
import {initEnemyReaction,startEnemyFear,updateEnemyThreat,interruptEnemyAttack,poseEnemyReaction,applyEnemyFlash} from '../enemy-reactions.js';

function actor(type='zombie',seed=1){
  const mesh=['zombie','robot','brute'].includes(type)?makeEnemy(type):makeCityEnemy(type);
  installEnemyHead(mesh,type);
  const e={mesh,type,x:0,z:0,y:0,height:mesh.userData.height,facingYaw:0,state:'walk',timer:0,vx:0,vz:0,vy:0,stagger:0,dead:false};
  if(type==='titan'||type==='siegeMech')e.miniBoss=true;
  return initEnemyReaction(e,seed);
}

test('a nearby visible airborne threat produces a finite reaction and a real upward gaze',()=>{
  const enemy=actor(),player={x:0,z:2,y:3,supportY:0};
  assert.equal(updateEnemyThreat(enemy,player,.02,{airborne:true,smashing:true,canSee:true}),true);
  for(let i=0;i<12;i++)updateEnemyThreat(enemy,player,.02,{airborne:true,smashing:true,canSee:true});
  assert.ok(enemy.fear>.4);assert.ok(enemy.lookPitch<-.5);
  poseEnemyReaction(enemy,.25);
  assert.ok(enemy.mesh.userData.head.rotation.x<-.5);
  assert.ok(enemy.mesh.userData.leftArm.rotation.x<-.8,'The hands should visibly rise to protect the head');
});

test('walls and distance prevent fear of an unseen jump',()=>{
  const hidden=actor(),far=actor();
  assert.equal(updateEnemyThreat(hidden,{x:0,z:2,y:4},.02,{airborne:true,smashing:true,canSee:false}),false);
  assert.equal(hidden.fearTime,0);assert.equal(hidden.lookPitch,0);
  assert.equal(updateEnemyThreat(far,{x:0,z:25,y:4},.02,{airborne:true,smashing:true,canSee:true}),false);
  assert.equal(far.fearTime,0);
});

test('holding an airborne pose cannot permanently paralyse the same enemies',()=>{
  const enemy=actor(),player={x:0,z:2,y:4};
  let activeSteps=0;
  for(let i=0;i<300;i++)if(updateEnemyThreat(enemy,player,.02,{airborne:true,smashing:true,canSee:true}))activeSteps++;
  assert.ok(activeSteps>10&&activeSteps<60);
  assert.equal(enemy.fearTime,0);assert.ok(enemy.fear<.001);
  updateEnemyThreat(enemy,{x:0,z:2,y:0},.02,{airborne:false,canSee:true});
  assert.equal(updateEnemyThreat(enemy,player,.02,{airborne:true,smashing:true,canSee:true}),true,'A new jump after recovery may threaten them again');
});

test('heavy enemies brace for less time than light enemies',()=>{
  const light=actor('zombie',4),heavy=actor('siegeMech',4);
  assert.equal(startEnemyFear(light,0,2,1),true);assert.equal(startEnemyFear(heavy,0,2,1),true);
  assert.ok(light.fearStrength>heavy.fearStrength*2);
  assert.ok(light.fearDuration>heavy.fearDuration);
  assert.equal(heavy.fearMode,'brace');
});

test('different individuals cower, brace or retreat away from the threat',()=>{
  const modes=new Set();
  for(let i=0;i<12;i++){
    const enemy=actor('zombie',i);startEnemyFear(enemy,0,2,1);
    updateEnemyThreat(enemy,{x:0,z:2,y:0},.02,{airborne:false});modes.add(enemy.fearMode);
    if(enemy.fearMode==='retreat'){
      assert.ok(enemy.fearMoveZ<-.9);
      assert.ok(Math.abs(Math.hypot(enemy.fearMoveX,enemy.fearMoveZ)-1)<1e-10);
    }else assert.equal(Math.hypot(enemy.fearMoveX,enemy.fearMoveZ),0);
  }
  assert.deepEqual(modes,new Set(['brace','cower','retreat']));
});

test('witness fear has a cooldown and never modifies the player or gives it immunity',()=>{
  const enemy=actor(),player=Object.freeze({x:0,z:1,y:0,hp:75,invincible:0});
  startEnemyFear(enemy,0,1,1);
  const duration=enemy.fearTime;
  assert.equal(startEnemyFear(enemy,0,1,2),false);assert.equal(enemy.fearTime,duration);
  updateEnemyThreat(enemy,player,.02,{airborne:false});
  assert.equal(player.invincible,0);assert.equal(player.hp,75);
  enemy.dead=true;
  assert.equal(startEnemyFear(enemy,0,1,1),false);
  assert.equal(updateEnemyThreat(enemy,player,.02,{airborne:true,smashing:true}),false);
});

test('a hit cancels windup, lunge and shooting while preserving physical knockback',()=>{
  for(const state of ['windup','lunge','shoot','slamWindup','chargeWindup']){
    const telegraph={},enemy={state,timer:.02,telegraph,vx:2,vz:-3,vy:2.7,navTimer:.2};
    assert.equal(interruptEnemyAttack(enemy,.65),telegraph);
    assert.equal(enemy.state,'walk');assert.equal(enemy.telegraph,null);assert.ok(enemy.timer>=.65);
    assert.deepEqual([enemy.vx,enemy.vz,enemy.vy],[2,-3,2.7]);
    assert.equal(interruptEnemyAttack(enemy,.4),null);assert.ok(enemy.timer>=.65);
  }
});

test('head tracking changes horizontal and vertical gaze without moving the torso or limbs',()=>{
  const enemy=actor('mutant'),u=enemy.mesh.userData,player={x:3,z:3,y:4};
  for(let i=0;i<15;i++)updateEnemyThreat(enemy,player,.02,{airborne:false,canSee:true});
  const bodyPosition=u.body.position.clone(),leftPosition=u.leftArm.position.clone();
  poseEnemyReaction(enemy,.3);
  assert.ok(u.head.rotation.x<-.4&&u.head.rotation.y>.4);
  assert.equal(u.body.position.distanceTo(bodyPosition),0);assert.equal(u.leftArm.position.distanceTo(leftPosition),0);
  for(let i=0;i<80;i++)updateEnemyThreat(enemy,player,.02,{airborne:false,canSee:false});
  poseEnemyReaction(enemy,2);
  assert.ok(Math.abs(u.head.rotation.x)+Math.abs(u.head.rotation.y)<1e-5);
});

test('white impact flashes replace dark vertex colours and restore the exact material afterwards',()=>{
  const dark=new THREE.MeshLambertMaterial({color:0x34556a,vertexColors:true,emissive:0x112234,emissiveIntensity:.4});
  const glowing=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,emissive:0xff6324,emissiveIntensity:1.2});
  const basic=new THREE.MeshBasicMaterial({color:0x123456});
  const originals=[dark,glowing,basic].map(m=>({color:m.color.clone(),emissive:m.emissive?.clone(),intensity:m.emissiveIntensity}));
  applyEnemyFlash([dark,glowing,basic],1);
  for(const m of [dark,glowing]){assert.equal(m.emissive.getHex(),0xffffff);assert.equal(m.color.getHex(),0);assert.ok(m.emissiveIntensity>1);}
  assert.equal(basic.color.getHex(),0xffffff);
  for(const amount of [.8,.6,.2,0,1,.4,0])applyEnemyFlash([dark,glowing,basic],amount);
  [dark,glowing,basic].forEach((m,i)=>{
    assert.deepEqual(m.color,originals[i].color);
    if(m.emissive){assert.deepEqual(m.emissive,originals[i].emissive);assert.equal(m.emissiveIntensity,originals[i].intensity);}
  });
});

test('flashing one instance never changes a shared source material or another enemy',()=>{
  const source=new THREE.MeshLambertMaterial({color:0x668855,vertexColors:true}),a=source.clone(),b=source.clone();
  applyEnemyFlash([a],1);
  assert.equal(source.color.getHex(),0x668855);assert.equal(b.color.getHex(),0x668855);
  assert.equal(source.emissive.getHex(),0);assert.equal(b.emissive.getHex(),0);
  const cachedColor=a.userData.originalColor;
  for(let i=0;i<20;i++)applyEnemyFlash([a],i%2);
  assert.equal(a.userData.originalColor,cachedColor,'Frame updates should reuse their original colour cache');
});
