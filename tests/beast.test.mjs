import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeBeastMech} from '../beast-mech.js';
import {BeastCombat,BEAST_ATTACKS,distanceToBeam} from '../beast-combat.js';
import {createGeometryCollision} from '../geometry-collision.js';
import {beastObstacleContacts} from '../beast-obstacles.js';
import {BEAST_HEIGHT,beastHealth,beastDamageScale,beastBehind,chooseBeastAttack,beastPortalLocation} from '../beast-rules.js';
import {BeastPortal} from '../beast-portal.js';

test('resized quadruped has the approved 19m scale, four rigid articulated legs and separate weapon mounts',()=>{
 const mesh=makeBeastMech(),u=mesh.userData;
 const height=new THREE.Box3().setFromObject(mesh,true).getSize(new THREE.Vector3()).y;
 assert.ok(Math.abs(height-BEAST_HEIGHT)<1e-5);assert.equal(u.legs.length,4);
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
 u.pose({roar:1});assert.ok(u.jaw.rotation.x>0,'Forward jaw opens downwards');assert.ok(u.head.rotation.x<0,'The muzzle rises during the roar');
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

test('all attacks have a warning, finite recovery and cleanup; ordnance never follows a late dodge',()=>{
 const scene=new THREE.Scene(),mesh=makeBeastMech();scene.add(mesh);const b={mesh,x:0,z:0},camera=new THREE.PerspectiveCamera();
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
  else{assert.equal(blasts.length,{missiles:6,rockets:3,stomp:2,rearStomp:2,bodySlam:1}[kind]);assert.ok(blasts.every(hit=>hit.p.x<30),'Locked attack cannot teleport to the dodging player');}
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


test('rear pressure selects a warned hind-leg attack, with cooldown and no chest shot through its own body',()=>{
 const mesh=makeBeastMech(),b={mesh,x:0,z:0,d:25,attack:0,rearCooldown:0},p={x:0,z:-12};
 assert.ok(beastBehind(b,p));assert.equal(chooseBeastAttack(b,p),'rearStomp');assert.ok(b.rearCooldown>0);
 for(let i=0;i<8;i++)assert.equal(chooseBeastAttack(b,p),'missiles');
 const scene=new THREE.Scene(),blasts=[],combat=new BeastCombat(scene,{blast:(point,r)=>blasts.push({point:point.clone(),r})});
 const a=combat.start('rearStomp',b,{...p,y:0});assert.equal(a.feet.length,2);assert.ok(a.feet.every(f=>f.z<0));
 combat.update(1,b,p);assert.equal(blasts.length,0);assert.equal(combat.markerCount,2);
 combat.update(.36,b,p);assert.equal(blasts.length,2);assert.ok(blasts.every(f=>f.point.z<0));
 combat.dispose();mesh.userData.dispose();
});
test('boss durability follows fixed level and sector, with honest entry protection and recovery openings',()=>{
 assert.ok(beastHealth(5)>9000);assert.ok(beastHealth(30)>beastHealth(5)*2);
 assert.ok(beastHealth(5,2)>beastHealth(5,1));assert.ok(Number.isFinite(beastHealth(NaN,Infinity,NaN)));
 assert.equal(beastDamageScale('enter'),0);assert.ok(beastDamageScale('laser')<1);assert.ok(beastDamageScale('recover')>1);
});
test('portal locations use road intersections and leave a bounded grounded exit away from the player',()=>{
 for(const p of [{x:0,z:33},{x:115,z:115},{x:-115,z:0},{x:0,z:-115}]){
  const v=beastPortalLocation(p,25);assert.ok(Math.abs(v.x/22-Math.round(v.x/22))<1e-8);assert.ok(Math.abs(v.z/22-Math.round(v.z/22))<1e-8);
  assert.ok(Math.hypot(v.end.x-p.x,v.end.z-p.z)>=16);assert.ok(Math.max(Math.abs(v.end.x),Math.abs(v.end.z))<101);
 }
});
test('portal has bounded reusable geometry, resets after reuse and disposes its scene ownership',()=>{
 const scene=new THREE.Scene(),portal=new BeastPortal(scene),positions=portal.arcs.geometry.attributes.position.array;
 for(let j=0;j<5;j++){portal.open({x:0,z:22,yaw:0},23,22);for(let i=0;i<100;i++){const amount=(i+1)/100;portal.update(.05,amount);assert.ok(Math.abs(portal.root.position.y-22*.33*amount-.06)<1e-8,'The arch stays anchored across the road');}assert.strictEqual(portal.arcs.geometry.attributes.position.array,positions);portal.reset();assert.equal(portal.root.visible,false);assert.equal(portal.ground.visible,false);}
 portal.dispose();assert.equal(scene.children.length,0);
});

test('missile volley covers the locked player position instead of leaving an accidental safe centre',()=>{
 const scene=new THREE.Scene(),mesh=makeBeastMech(),blasts=[],player={x:0,y:0,z:-14};
 const combat=new BeastCombat(scene,{blast:(p,r)=>blasts.push({p:p.clone(),r})});combat.start('missiles',{mesh},player);
 for(let i=0;i<500;i++)combat.update(.01,{mesh},player);
 assert.equal(blasts.length,6);assert.ok(blasts.some(b=>Math.hypot(b.p.x-player.x,b.p.z-player.z)<b.r));
 combat.dispose();mesh.userData.dispose();
});

test('the full boss envelope fits the visible road arch and the portal continuously faces the player',()=>{
 const scene=new THREE.Scene(),mesh=makeBeastMech(),size=new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()),portal=new BeastPortal(scene);
 portal.open({x:0,z:22,yaw:0},size.x*1.5,size.y*1.5);portal.update(1,1);
 for(const x of [-size.x/2,size.x/2])for(const y of [0,size.y])assert.ok((x/(portal.width*.5))**2+((y-portal.root.position.y)/(portal.height*.5))**2<1,'Both feet and both upper corners fit inside the actual oval');
 for(const a of [0,.4,1.7,3,-2]){const p={x:Math.sin(a)*40,z:22+Math.cos(a)*40};portal.facePlayer(p);assert.ok(Math.abs(Math.sin(portal.root.rotation.y-a))<1e-8);}
 portal.dispose();mesh.userData.dispose();
});

test('hovering behind the mech selects airburst missiles locked to the actual airborne height',()=>{
 const mesh=makeBeastMech(),b={mesh,x:0,z:0,d:25,attack:0,rearCooldown:0},p={x:0,y:12,z:-15};assert.equal(chooseBeastAttack(b,p),'missiles');
 const scene=new THREE.Scene(),combat=new BeastCombat(scene);combat.start('missiles',b,p);combat.update(1.3,b,p);assert.equal(combat.projectiles.length,6);assert.ok(combat.projectiles.every(p=>Math.abs(p.to.y-12.9)<1e-8));
 p.y=25;combat.update(.1,b,p);assert.ok(combat.projectiles.every(p=>Math.abs(p.to.y-12.9)<1e-8),'A late altitude dodge must remain valid');combat.dispose();mesh.userData.dispose();
});
