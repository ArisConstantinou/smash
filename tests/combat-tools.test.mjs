import test from 'node:test';
import assert from 'node:assert/strict';
import {selectThrowLock,punchStats,samplePunchMotion,restSpotClear,findWeaponRest,nearestPickupPoint} from '../combat-tools.js';
import {createCharacterProgression,getCharacterStats,awardCharacterXp,xpForNextLevel,serializeCharacterProgression,restoreCharacterProgression} from '../character-progression.js';
const origin={x:0,y:1.2,z:0},dir={x:0,z:1},foot={minX:-.4,maxX:.4,minZ:-1.1,maxZ:1.1};
const foe=(x,z)=>({x,z,y:0,height:1.8,radius:.4});
const box=(x,z,w=3,d=2,h=2)=>({x,z,w,d,h});

test('throw assist selects a visible enemy in the intended sector, not behind the player',()=>{
 const near=foe(2,5),back=foe(0,-1),far=foe(0,40);
 assert.equal(selectThrowLock(origin,dir,[back,far,near],[]),near);
 assert.equal(selectThrowLock(origin,dir,[back,far],[]),null);
 near.dead=true;assert.equal(selectThrowLock(origin,dir,[near],[]),null);
});
test('throw assist excludes walls, parked cars and targets already hit',()=>{
 const a=foe(0,8),b=foe(4,5),wall=box(0,4,3,1,5);
 assert.equal(selectThrowLock(origin,dir,[a,b],[wall]),b);
 assert.equal(selectThrowLock(origin,dir,[a],[box(0,4,3,2,1.8)]),null);
 assert.equal(selectThrowLock(origin,dir,[b],[],{exclude:new Set([b])}),null);
});
test('assist prefers aim alignment over a nearer off-axis opponent',()=>{
 const aligned=foe(0,7),side=foe(4,3);
 assert.equal(selectThrowLock(origin,dir,[side,aligned],[]),aligned);
});
test('resting clearance uses the complete long wood footprint, not its centre',()=>{
 const car=box(0,3,2,2);assert.equal(restSpotClear({x:0,z:1.8},foot,[car]),false);
 const p=findWeaponRest({x:0,z:1.8},foot,[car],{bounds:20,breadcrumbs:[{x:0,z:0}]});
 assert.ok(p);assert.ok(restSpotClear(p,foot,[car],20));assert.ok(p.z<2);
});
test('corner contacts and size upgrades cannot park a shaft through a second obstacle',()=>{
 const objects=[box(0,3,2,2),box(2,1,1,5)];
 for(const scale of [1,1.5,2.5]){
  const shape=Object.fromEntries(Object.entries(foot).map(([k,v])=>[k,v*scale]));
  const p=findWeaponRest({x:.9,z:1.9},shape,objects,{bounds:20,breadcrumbs:[{x:0,z:-3}]});
  assert.ok(p);assert.ok(restSpotClear(p,shape,objects,20));
 }
});
test('wall collision keeps pickup on approach side and inside the complete world boundary',()=>{
 const wall=box(0,3,20,.3,6),p=findWeaponRest({x:0,z:2.7},foot,[wall],{bounds:10,breadcrumbs:[{x:0,z:0}]});
 assert.ok(p);assert.ok(p.z+foot.maxZ<2.85);
 const edge=findWeaponRest({x:9.9,z:0},foot,[],{bounds:10,breadcrumbs:[{x:8,z:0}]});
 assert.ok(edge);assert.ok(restSpotClear(edge,foot,[],10));
});
test('a supporting roof must contain the full pickup footprint',()=>{
 const support=box(0,0,5,5,4);
 const p=findWeaponRest({x:2.4,z:1},foot,[],{bounds:20,support,breadcrumbs:[{x:0,z:0}]});
 assert.ok(p);assert.ok(p.x+foot.maxX<=2.42);assert.ok(p.z+foot.maxZ<=2.42);
 assert.equal(restSpotClear({...p,groundY:4},foot,[support]),true);
});
test('pickup interaction uses the nearest exposed edge of the actual geometry',()=>{
 const edge=nearestPickupPoint({x:0,z:1.8},{x:0,z:3},foot);
 assert.equal(edge.z,1.9);assert.ok(Math.hypot(edge.x,edge.z-1.8)<.2);
});
test('punches alternate real fists, recover to guard and scale without weapon damage',()=>{
 assert.equal(punchStats(1,0,0).hand,'left');assert.equal(punchStats(1,0,1).hand,'right');
 assert.ok(punchStats(10).damage>punchStats(1).damage);
 for(let v=0;v<4;v++){
  const before=samplePunchMotion(0,v),hit=samplePunchMotion(.43,v),end=samplePunchMotion(1,v);
  assert.deepEqual(before,end);assert.equal(hit.active,true);
  assert.ok(hit[punchStats(1,0,v).hand].z>.85);
  assert.equal(before.active,false);assert.equal(end.active,false);
 }
});
test('each earned level grants exactly +2 base damage and +8 maximum health permanently',()=>{
 const state=createCharacterProgression();let last=getCharacterStats(state);
 for(let lv=2;lv<=15;lv++){
  awardCharacterXp(state,xpForNextLevel(state.level));const next=getCharacterStats(state);
  assert.equal(next.power-last.power,2);assert.equal(next.maxHp-last.maxHp,8);
  const restored=getCharacterStats(restoreCharacterProgression(serializeCharacterProgression(state)));
  assert.deepEqual(restored,next);last=next;
 }
 assert.equal(state.weaponId,'log');
});
