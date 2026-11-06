import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeWarrior} from '../models.js';
import {HAMMER_MOVES,createSwingSequence,chooseHammerSwing,sampleHammerSwing,sampleHammerSpin,getHammerSwingDuration} from '../hammer-motion.js';

const up=new THREE.Vector3(0,1,0);
function rotation(pose){return new THREE.Quaternion().setFromUnitVectors(up,new THREE.Vector3(pose.directionX,pose.directionY,pose.directionZ)).multiply(new THREE.Quaternion().setFromAxisAngle(up,pose.shaftTwist||0));}

test('six moves per stance are drawn without repeats and do not loop every three attacks',()=>{
  for(const two of [false,true]){
    const state=createSwingSequence(),key=two?'twoHanded':'oneHanded';let seed=19;
    const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const moves=Array.from({length:60},()=>chooseHammerSwing(state,two,rng));
    for(let i=0;i<moves.length;i+=6)assert.equal(new Set(moves.slice(i,i+6)).size,6);
    for(let i=1;i<moves.length;i++)assert.notEqual(moves[i],moves[i-1]);
    assert.ok(new Set(moves.map((_,i)=>moves.slice(i,i+3).join('/'))).size>20);
    assert.deepEqual(new Set(moves),new Set(HAMMER_MOVES[key]));
    assert.ok(state.history.length<=3&&state.bag.length<=6);
  }
});

test('all twelve strike paths have finite body poses and keep both articulated arms in reach',()=>{
  for(const [mode,moves] of Object.entries(HAMMER_MOVES))for(const variant of moves){
    const two=mode==='twoHanded',hero=makeWarrior(),u=hero.userData;
    u.setEquipment(two?0:2);u.setStance(Number(two));u.setReach(1.35);
    const rest=u.weaponRestPosition.clone(),restQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(u.weaponRest.x,u.weaponRest.y,u.weaponRest.z));
    let maxReach=0;
    for(let n=0;n<=120;n++){
      const p=sampleHammerSwing(n/120,{variant,twoHanded:two});
      assert.ok(Object.values(p).every(Number.isFinite),variant);
      u.body.rotation.set(p.bodyPitch,p.bodyYaw,p.bodyRoll);u.body.position.y=p.bodyDrop;
      u.weaponRig.position.copy(rest).lerp(new THREE.Vector3(p.gripX,p.gripY,p.gripZ),p.windup).lerp(rest,p.recovery);
      u.weaponRig.quaternion.copy(restQ).slerp(rotation(p),p.windup).slerp(restQ,p.recovery);
      u.updateGrip();hero.updateMatrixWorld(true);
      for(const side of ['right','left']){
        const grip=u[side+'Grip'].getWorldPosition(new THREE.Vector3());
        const anchor=(side==='left'&&!two?u.shieldGripAnchor:u[side+'GripAnchor']).getWorldPosition(new THREE.Vector3());
        assert.ok(grip.distanceTo(anchor)<1e-7,variant+' detached hand');
        maxReach=Math.max(maxReach,grip.distanceTo(u[side+'Arm'].getWorldPosition(new THREE.Vector3())));
      }
    }
    assert.ok(maxReach<.92,variant+' arm reaches '+maxReach);
    assert.ok(getHammerSwingDuration(variant)*.4<=.161,variant+' contact too late');
  }
});

test('the braced spin grip remains in front of the torso and within anatomical reach at every equipment tier',()=>{
  for(const tier of [0,1,2,3,4])for(const two of [false,true]){
    const hero=makeWarrior(),u=hero.userData;u.setEquipment(tier);u.setStance(Number(two));
    for(let i=0;i<=120;i++){
      const p=sampleHammerSpin(i/120*Math.PI*4,two);
      u.body.rotation.set(p.bodyPitch,p.bodyYaw,p.bodyRoll);u.body.position.y=p.bodyDrop;
      u.weaponRig.position.set(p.gripX,p.gripY,p.gripZ);u.weaponRig.quaternion.copy(rotation(p));u.updateGrip();hero.updateMatrixWorld(true);
      for(const side of two?['right','left']:['right']){
        const hand=u[side+'Grip'].getWorldPosition(new THREE.Vector3()),shoulder=u[side+'Arm'].getWorldPosition(new THREE.Vector3());
        assert.ok(hand.z>.25,'The grip must be in front, not through the chest');
        assert.ok(hand.distanceTo(shoulder)<.90,`${tier}/${two}/${side}: ${hand.distanceTo(shoulder)}`);
      }
      assert.ok(p.bodyYaw<0,'Shoulders lead the negative turn');
    }
  }
});
