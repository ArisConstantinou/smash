import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from '../vendor/three.module.js';
import {MountRide} from '../mount-ride.js';import {MountWeapons,MOUNT_SHOT_LIMIT} from '../mount-weapons.js';import {createGarage,purchasePart} from '../mount-rules.js';
function fixture(kind='bicycle',slot='frontModule',id='gun'){
 const level=kind==='scifi'?21:kind==='motorcycle'?11:1,scene=new THREE.Scene(),g=createGarage();g.mounts.scifi.rearModule.selected='none';purchasePart(g,{},kind,slot,id,{level,test:true});
 const ride=new MountRide(scene);g.selectedMount=kind;ride.sync(g,level);ride.active=true;ride.yaw=0;ride.model.visible=true;ride.model.updateMatrixWorld(true);ride.energy=100;
 const target={x:0,y:0,z:6,height:1.6,radius:.4,hp:1000},objects=[],hits=[],blasts=[];
 const weapons=new MountWeapons(scene,{hit:(t,damage)=>{hits.push({t,damage});t.hp-=damage;},blast:(point,damage,radius,target)=>blasts.push({point,damage,radius,target})});
 const world={nearObjects:()=>objects},camera=new THREE.PerspectiveCamera();return {ride,target,objects,hits,blasts,weapons,step:(dt=1/120)=>weapons.update(dt,ride,{enemies:[target],world,camera}),dispose:()=>{weapons.dispose();ride.model.userData.dispose();}};
}
test('every chassis fires a real swept projectile and consumes its own finite energy',()=>{
 for(const kind of ['bicycle','motorcycle','scifi']){const f=fixture(kind);for(let i=0;i<100;i++)f.step();assert.ok(f.hits.length>0,kind);assert.ok(f.target.hp<1000);assert.ok(f.ride.energy<100);assert.ok(f.weapons.fired>0);f.dispose();}
});
test('crossbow, cannon, turret and rocket modules all produce actual contacts',()=>{
 for(const [slot,id]of [['frontModule','crossbow'],['frontModule','cannon'],['rearModule','turret'],['rearModule','heavyTurret'],['sideModule','rockets']]){
  const f=fixture('bicycle',slot,id);for(let i=0;i<100;i++)f.step();assert.ok(f.hits.length+f.blasts.length>0,id);
  if(id==='rockets'){assert.ok(f.blasts[0].radius>1);assert.ok(f.weapons.explosion.mesh.visible);assert.equal(f.weapons.explosion.geometry.drawRange.count,6);}
  f.dispose();
 }
});
test('a wall prevents acquisition and a new obstruction receives a shot already in flight',()=>{
 const f=fixture(),wall={x:0,y:0,z:3,w:4,d:.3,h:4,hp:500};f.objects.push(wall);for(let i=0;i<60;i++)f.step();assert.equal(f.weapons.fired,0);assert.equal(f.target.hp,1000);
 f.objects.pop();f.step(.01);assert.equal(f.weapons.fired,1);f.objects.push({...wall,z:2});for(let i=0;i<20;i++)f.step();assert.equal(f.hits[0].t,f.objects[0]);assert.equal(f.target.hp,1000);f.dispose();
});
test('modules respect their firing arc, empty batteries and bounded buffers, with no lingering effects on reset',()=>{
 const f=fixture();f.target.z=-6;for(let i=0;i<60;i++)f.step();assert.equal(f.weapons.fired,0);f.target.z=6;f.ride.energy=0;for(let i=0;i<60;i++)f.step();assert.equal(f.weapons.fired,0);
 f.ride.energy=10000;f.target.z=100;f.ride.stats.weapons[0].range=120;f.ride.stats.weapons[0].interval=.0001;for(let i=0;i<100;i++)f.step();assert.ok(f.weapons.shots.filter(s=>s.active).length<=MOUNT_SHOT_LIMIT);
 assert.ok(f.weapons.geometry.drawRange.count<=MOUNT_SHOT_LIMIT*24);f.weapons.reset();assert.equal(f.weapons.mesh.visible,false);assert.equal(f.weapons.geometry.drawRange.count,0);assert.equal(f.weapons.explosion.mesh.visible,false);f.dispose();
});
