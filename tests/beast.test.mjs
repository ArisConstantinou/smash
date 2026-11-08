import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeBeastMech} from '../beast-mech.js';
import {BeastCombat,BEAST_ATTACKS,distanceToBeam} from '../beast-combat.js';
import {createGeometryCollision} from '../geometry-collision.js';
import {beastObstacleContacts} from '../beast-obstacles.js';

test('approved quadruped has skyscraper scale, four rigid articulated legs and separate weapon mounts',()=>{
 const mesh=makeBeastMech(),u=mesh.userData;
 const height=new THREE.Box3().setFromObject(mesh,true).getSize(new THREE.Vector3()).y;
 assert.ok(Math.abs(height-32.13)<1e-5);assert.equal(u.legs.length,4);
 for(const l of u.legs)assert.ok(Math.abs(new THREE.Box3().setFromObject(l.foot,true).min.y)<1e-6);
 assert.equal(u.missileMounts.length,24);assert.equal(u.rocketMounts.length,12);
 let draws=0,triangles=0;mesh.traverse(n=>{if(n.isMesh){draws++;triangles+=n.geometry.attributes.position.count/3;}});
 assert.ok(draws<=40);assert.ok(triangles<25000);
 for(let i=0;i<100;i++){
  u.pose({time:i*.07,moving:1,stomp:Math.max(0,Math.sin(i*.04))});
  for(const l of u.legs){
   assert.ok(Math.abs(l.hip.distanceTo(l.knee)-l.upperLength)<1e-7);
   assert.ok(Math.abs(l.knee.distanceTo(l.target)-l.lowerLength)<1e-7);
   assert.ok(l.target.y>=l.rest.y);
  }
 }
 u.dispose();
});

test('mech collision hits an actual reachable foot and leaves the space under its belly open',()=>{
 const mesh=makeBeastMech(),actor={mesh,x:0,y:0,z:0,w:40,d:45,h:33};
 const collision=createGeometryCollision({nearObjects:()=>[actor]});
 const foot=mesh.userData.feet()[0];
 assert.ok(collision.geometryHit(actor,{x:foot.x,y:foot.y,z:foot.z+9},{x:foot.x,y:foot.y,z:foot.z},.2));
 assert.equal(collision.geometryHit(actor,{x:0,y:1,z:0},{x:0,y:1,z:1},.2),null);
 mesh.userData.dispose();
});

test('all four attacks have a warning, finite recovery and cleanup; ordnance never follows a late dodge',()=>{
 const scene=new THREE.Scene(),mesh=makeBeastMech();scene.add(mesh);const b={mesh},camera=new THREE.PerspectiveCamera();
 const player={x:0,y:0,z:38},blasts=[],beams=[],cues=[];
 const combat=new BeastCombat(scene,{blast:(p,r,d,o)=>blasts.push({p:p.clone(),r,d,o}),beamHit:(a,b)=>beams.push([a.clone(),b.clone()]),cue:k=>cues.push(k)});
 for(const kind of BEAST_ATTACKS){
  combat.reset();blasts.length=beams.length=0;player.x=0;player.z=38;
  const attack=combat.start(kind,b,player);assert.ok(attack.windup>=1.25);
  player.x=80;player.z=80;
  combat.update(attack.windup-.01,b,player,camera);assert.equal(blasts.length,0);assert.equal(beams.length,0);assert.equal(combat.projectiles.length,0);
  for(let i=0;i<750;i++)combat.update(.01,b,player,camera);
  assert.equal(combat.attack,null);assert.equal(combat.projectiles.length,0);assert.equal(combat.bursts.length,0);assert.equal(combat.beam.visible,false);assert.equal(combat.markerCount,0);
  if(kind==='laser')assert.ok(beams.length>0);
  else{assert.equal(blasts.length,kind==='missiles'?6:kind==='rockets'?3:2);assert.ok(blasts.every(hit=>hit.p.x<30),'Locked attack cannot teleport to the dodging player');}
 }
 assert.deepEqual(cues,[...BEAST_ATTACKS]);combat.reset();assert.equal(combat.explosions.mesh.visible,false);combat.dispose();mesh.userData.dispose();
});

test('flying ordnance explodes at the first real obstruction instead of tunnelling through it',()=>{
 const scene=new THREE.Scene(),mesh=makeBeastMech(),hits=[],combat=new BeastCombat(scene,{cast:(a,b)=>({x:1,y:2,z:3}),blast:p=>hits.push(p.clone())});
 const b={mesh},p={x:0,y:0,z:40};combat.start('rockets',b,p);combat.update(1.3,b,p);
 assert.equal(hits.length,3);assert.ok(hits.every(p=>p.x===1&&p.y===2&&p.z===3));assert.equal(combat.projectiles.length,0);
 combat.dispose();mesh.userData.dispose();
});

test('laser distance uses the finite 3D beam, including height and endpoints',()=>{
 const a={x:0,y:12,z:0},b={x:0,y:1,z:20};
 assert.equal(distanceToBeam({x:0,y:6.5,z:10},a,b),0);
 assert.ok(distanceToBeam({x:3,y:6.5,z:10},a,b)>2.99);
 assert.ok(distanceToBeam({x:0,y:1,z:40},a,b)>19.99);
});

test('removed fracture pieces and genuine gaps cease blocking the mech immediately',()=>{
 const source=new THREE.BoxGeometry(2,2,2).toNonIndexed(),positions=[];
 for(const x of [0,5])for(let i=0;i<source.attributes.position.count;i++)positions.push(source.attributes.position.getX(i)+x,source.attributes.position.getY(i),source.attributes.position.getZ(i));
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(Array.from({length:72},(_,i)=>i));geometry.userData.collisionParts=[{start:0,count:36},{start:36,count:36}];
 const material=new THREE.MeshBasicMaterial(),building={mesh:new THREE.Mesh(geometry,material)},mech=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),material);
 assert.equal(beastObstacleContacts(mech,[building]).length,1);
 mech.position.x=2.5;assert.equal(beastObstacleContacts(mech,[building]).length,0,'The enclosing building box must not fill a real gap');
 mech.position.x=0;geometry.setIndex(Array.from({length:36},(_,i)=>i+36));
 assert.equal(beastObstacleContacts(mech,[building]).length,0,'A replacement render index removes the old obstruction');
 mech.position.x=5;assert.equal(beastObstacleContacts(mech,[building]).length,1,'The surviving solid still blocks');
 source.dispose();geometry.dispose();mech.geometry.dispose();material.dispose();
});
