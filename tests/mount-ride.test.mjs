import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {MountRide} from '../mount-ride.js';import {createGarage,purchasePart} from '../mount-rules.js';
import {makeWarrior} from '../models.js';import {createGeometryCollision} from '../geometry-collision.js';
function fixture(level=1,hover=false){
 const scene=new THREE.Scene(),hero=makeWarrior(),garage=createGarage();scene.add(hero);
 if(hover)purchasePart(garage,{},'scifi','mobility','hover',{level,test:true});
 const objects=[],world=createGeometryCollision({nearObjects:()=>objects});world.nearObjects=()=>objects;
 const ride=new MountRide(scene),player={x:0,y:0,z:0,radius:.44};ride.sync(garage,level);
 assert.ok(ride.toggle(player,hero,world));
 return {ride,player,hero,garage,world,objects,step:(dt,input={})=>ride.update(dt,{player,hero,world,move:{x:0,z:1},strength:1,...input})};
}
test('mounted travel has continuous steering and the full vehicle stops at surviving walls',()=>{
 const f=fixture();for(let i=0;i<60;i++)f.step(1/120,{move:{x:.6,z:.8}});
 assert.ok(f.player.x>1&&f.player.z>1);assert.ok(f.ride.yaw>.5&&f.ride.yaw<.7);
 const wall=new THREE.Mesh(new THREE.BoxGeometry(20,12,.5),new THREE.MeshBasicMaterial());wall.position.set(0,6,6);wall.updateMatrixWorld(true);
 f.objects.push({mesh:wall,x:0,z:6,w:20,d:.5,h:12});
 for(let i=0;i<300;i++)f.step(1/120);assert.ok(f.player.z<4.71);assert.equal(f.ride.body.y,0);
 f.ride.dismount(f.player,f.hero);assert.equal(f.player.y,0);assert.equal(f.ride.active,false);f.ride.reset(f.hero);
});
test('hover has freely controlled height, stops at ceilings and lands before dismounting',()=>{
 const f=fixture(21,true);for(let i=0;i<100;i++)f.step(1/120,{strength:0,up:true});assert.ok(f.ride.body.y>3);
 const y=f.ride.body.y;for(let i=0;i<120;i++)f.step(1/120,{strength:0});assert.ok(f.ride.body.y>y&&f.ride.body.y-y<.8);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(10,.3,10),new THREE.MeshBasicMaterial());roof.position.set(0,9,0);roof.updateMatrixWorld(true);f.objects.push({mesh:roof,x:0,z:0,w:10,d:10,h:9.15});
 for(let i=0;i<200;i++)f.step(1/120,{strength:0,up:true});assert.ok(f.ride.body.y<=6.21);
 assert.equal(f.ride.toggle(f.player,f.hero,f.world),false);assert.ok(f.ride.landing);
 for(let i=0;i<240;i++)f.step(1/120,{strength:0});assert.equal(f.ride.active,false);assert.equal(f.player.y,0);f.ride.reset(f.hero);
});
test('mount damage, repair, configuration changes and repeated mounting cannot regenerate free HP',()=>{
 const f=fixture();const max=f.ride.hp;
 const remainder=f.ride.absorb(80,f.player,f.hero);assert.ok(remainder<80&&f.ride.hp<max);
 const hp=f.ride.hp;f.ride.dismount(f.player,f.hero);f.ride.toggle(f.player,f.hero,f.world);assert.equal(f.ride.hp,hp);
 assert.equal(f.ride.repair({scrap:0}).ok,false);const bag={scrap:10};assert.ok(f.ride.repair(bag).ok);assert.ok(bag.scrap<10);assert.equal(f.ride.hp,max);
 f.ride.reset(f.hero);
});
test('spikes require moving wheel contact and cannot damage across a wall or from hover altitude',()=>{
 const f=fixture();f.ride.dismount(f.player,f.hero);purchasePart(f.garage,{},'bicycle','frontWheel','spiked',{level:1,test:true});f.ride.sync(f.garage,1);f.ride.toggle(f.player,f.hero,f.world);
 const enemy={x:0,z:1.4,y:0,height:1.6,radius:.35};let hits=0;
 f.ride.contacts([enemy],()=>hits++,f.world);assert.equal(hits,0);f.ride.speed=5;f.ride.contacts([enemy],()=>hits++,f.world);assert.equal(hits,1);
 f.ride.contacts([enemy],()=>hits++,f.world);assert.equal(hits,1);f.ride.clock+=1;f.ride.body.y=4;f.ride.contacts([enemy],()=>hits++,f.world);assert.equal(hits,1);
 f.ride.reset(f.hero);
});
