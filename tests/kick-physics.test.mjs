import test from 'node:test';import assert from 'node:assert/strict';
import {combatMass,kickStats,transferImpact,wallImpact,enemyCombatLevel,enemyLevelColor,sampleKick} from '../kick-physics.js';
import * as THREE from '../vendor/three.module.js';import {makeWarrior} from '../models.js';
import {HAMMER_MOVES,sampleHammerSwing,sampleHammerSpin} from '../hammer-motion.js';
test('kick mass and progression resist heavy actors and gate vehicle motion, not vehicle damage',()=>{
  assert.ok(combatMass({type:'boss'})>combatMass({type:'brute'}));assert.ok(combatMass({type:'brute'})>combatMass({type:'zombie'}));
  for(const rank of [0,1]){assert.equal(kickStats(rank).carImpulse,0);assert.ok(kickStats(rank).damage>0);}
  assert.ok(kickStats(2).carImpulse/combatMass({type:'car'})>3);
  assert.ok(kickStats(3).carImpulse>kickStats(2).carImpulse);
  assert.ok(kickStats(2).carImpulse/combatMass({type:'ambulance'})<kickStats(2).carImpulse/combatMass({type:'car'}));
});
test('enemy-to-enemy transfer loses energy, transfers momentum and cannot launch a heavier target',()=>{
  for(const [m1,m2] of [[70,70],[230,70],[1250,70]]){
    const r=transferImpact(m1,m2,6,0);assert.equal(r.heavy,false);
    assert.ok(Math.abs(m1*r.v1+m2*r.v2-m1*6)<1e-7);
    assert.ok(m1*r.v1**2+m2*r.v2**2<=m1*36+1e-8);assert.ok(r.v2>0);
  }
  const r=transferImpact(70,230,8,-2);assert.equal(r.heavy,true);assert.ok(r.v2<=0&&Math.abs(r.v2)<2);
  assert.equal(transferImpact(70,70,-1,0).energy,0);
  assert.equal(transferImpact(70,71,8,0).heavy,true,'Even a slightly heavier target must resist being launched');
});
test('wall injuries and stun decrease for tougher, heavier enemies without becoming zero',()=>{
  const small=wallImpact(70,7,1,1,100),large=wallImpact(420,7,10,1,360);
  assert.ok(small.damage>0&&small.damage<=32);assert.ok(large.damage>0&&large.damage<=51);
  assert.ok(large.stun<small.stun);assert.ok(large.stun>=.12);
});
test('enemy labels reflect wave and species threat; bars distinguish level bands',()=>{
  assert.equal(enemyCombatLevel('zombie',1),1);assert.ok(enemyCombatLevel('brute',1)>1);
  assert.ok(enemyCombatLevel('zombie',5)>enemyCombatLevel('zombie',1));
  assert.equal(new Set([1,4,7,11,17].map(enemyLevelColor)).size,5);
});
test('kick chambers a bent knee then extends it at contact and returns exactly to rest',()=>{
  const chamber=sampleKick(.22),strike=sampleKick(.42),rest=sampleKick(1);
  assert.ok(chamber.knee>1.4&&strike.knee<.2);assert.ok(strike.hip< -1.4);
  for(const value of Object.values(rest))assert.ok(Math.abs(value)<1e-8);
});
test('hands are mirrored and roll toward their own forearms while wrist sockets stay outside the shaft',()=>{
  const up=new THREE.Vector3(0,1,0);
  for(const tier of [0,2,4])for(const two of [false,true]){
    const hero=makeWarrior(),u=hero.userData;u.setEquipment(tier);u.setStance(Number(two));
    const rest=u.weaponRestPosition.clone(),rq=new THREE.Quaternion().setFromEuler(new THREE.Euler(u.weaponRest.x,u.weaponRest.y,u.weaponRest.z));
    const poses=[...HAMMER_MOVES[two?'twoHanded':'oneHanded'].flatMap(variant=>Array.from({length:25},(_,i)=>sampleHammerSwing(i/24,{variant,twoHanded:two}))),...Array.from({length:40},(_,i)=>sampleHammerSpin(i*.25,two))];
    for(const p of poses){u.body.rotation.set(p.bodyPitch,p.bodyYaw,p.bodyRoll);u.body.position.y=p.bodyDrop;
      const q=new THREE.Quaternion().setFromUnitVectors(up,new THREE.Vector3(p.directionX,p.directionY,p.directionZ)).multiply(new THREE.Quaternion().setFromAxisAngle(up,p.shaftTwist||0));
      u.weaponRig.position.copy(rest).lerp(new THREE.Vector3(p.gripX,p.gripY,p.gripZ),p.windup??1).lerp(rest,p.recovery||0);
      u.weaponRig.quaternion.copy(rq).slerp(q,p.windup??1).slerp(rq,p.recovery||0);u.updateGrip();hero.updateMatrixWorld(true);
      for(const [arm,hand] of [[u.leftArm,u.leftGrip],[u.rightArm,u.rightGrip]]){
        const wrist=hand.localToWorld(hand.userData.wristOffset.clone()),end=arm.userData.fore.localToWorld(new THREE.Vector3(0,.5,0));
        assert.ok(wrist.distanceTo(end)<1e-7,'forearm ends at wrist, not at reversed palm or shaft centre');
        const centre=hand.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(wrist.distanceTo(centre)-.16)<1e-7);
        const elbow=arm.userData.upper.localToWorld(new THREE.Vector3(0,.5,0));
        assert.ok(wrist.clone().sub(centre).dot(elbow.clone().sub(centre))>=-1e-5,JSON.stringify({tier,two,side:arm.userData.side,p,dot:wrist.clone().sub(centre).dot(elbow.clone().sub(centre))}));
      }
    }
  }
});
