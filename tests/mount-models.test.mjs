import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from '../vendor/three.module.js';
import {createGarage,purchasePart}from '../mount-rules.js';import{createMountModel}from '../mount-models.js';import{makeWarrior}from '../models.js';import{poseMountedRider,resetMountedRider}from '../mount-rider.js';
test('all mount models have bounded real geometry and distinct moving part pivots',()=>{
 const g=createGarage();for(const kind of ['bicycle','motorcycle','scifi']){
  const m=createMountModel(kind,g),u=m.userData;let triangles=0,draws=0;m.traverse(n=>{if(n.isMesh){triangles+=n.geometry.attributes.position.count/3;draws++;assert.ok(n.geometry.boundingBox);}});
  assert.ok(triangles>2000&&triangles<16000);assert.ok(draws<24);assert.notEqual(u.frontWheel,u.rearWheel);
  const size=new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());assert.ok(size.z>1.8&&size.z<3);assert.ok(size.x<1.5);
  u.animate(1,.2);assert.ok(u.frontWheel.rotation.x>1);assert.equal(u.steering.rotation.y,.2);u.dispose();assert.equal(m.parent,null);
 }
});
test('actual rider soles and steering palm stay attached through an entire pedal cycle without extending bones',()=>{
 const g=createGarage(),assembly=new THREE.Group();
 for(const kind of ['bicycle','motorcycle','scifi']){
  const bike=createMountModel(kind,g),hero=makeWarrior();assembly.add(bike,hero);bike.position.set(3,.4,-2);bike.rotation.y=.7;
  const u=hero.userData;u.setStance(0);u.weaponRig.position.copy(u.weaponRestPosition);u.weaponRig.rotation.set(u.weaponRest.x,u.weaponRest.y,u.weaponRest.z);
  for(let n=0;n<96;n++){
   bike.userData.animate(.04,Math.sin(n*.1)*.15);u.body.rotation.set(0,0,0);poseMountedRider(hero,bike);u.updateGrip();assembly.updateMatrixWorld(true);
   assert.ok(u.leftGrip.getWorldPosition(new THREE.Vector3()).distanceTo(bike.userData.markers.leftGrip.getWorldPosition(new THREE.Vector3()))<1e-6);
   for(const [leg,pedal]of [[u.leftLeg,bike.userData.markers.leftPedal],[u.rightLeg,bike.userData.markers.rightPedal]]){
    const sole=leg.userData.pedalContact.getWorldPosition(new THREE.Vector3()),peg=pedal.getWorldPosition(new THREE.Vector3());assert.ok(sole.distanceTo(peg)<.035,`${kind} foot detached ${sole.distanceTo(peg)}`);
   }
   for(const arm of [u.leftArm,u.rightArm])assert.ok(arm.userData.upper.scale.y<.441&&arm.userData.fore.scale.y<.461,'Riding cannot stretch an arm');
  }
  resetMountedRider(hero);assert.equal(u.leftLeg.userData.shin.rotation.x,0);bike.userData.dispose();hero.removeFromParent();
 }
});
test('hover swaps the wheel assemblies for physical lift pods and turret pitch moves its real barrel',()=>{
 const g=createGarage();purchasePart(g,{},'scifi','mobility','hover',{level:30,test:true});const m=createMountModel('scifi',g),u=m.userData;
 assert.equal(u.frontWheel,undefined);assert.ok(u.frontLift&&u.rearLift);assert.ok(new THREE.Box3().setFromObject(u.frontLift).getSize(new THREE.Vector3()).z<.7);
 const t=u.modules.rearModule;assert.ok(t.muzzle);const old=t.muzzle.getWorldPosition(new THREE.Vector3());t.elevation.rotation.x=.4;const now=t.muzzle.getWorldPosition(new THREE.Vector3());assert.ok(old.distanceTo(now)>.1);u.dispose();assert.equal(m.children.length,0);assert.deepEqual(m.userData,{});
});
