import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeCityBuilding,makeCityVehicle,CITY_BUILDING_KINDS} from '../city-models.js';
import {makeProp} from '../models.js';
import {damageStage,damageSeed,fractureObject,DestructionSystem} from '../destruction.js';
function object(type='townhouse',seed=31,x=0,z=0) {
  const isBuilding=CITY_BUILDING_KINDS.includes(type);
  const mesh=isBuilding?makeCityBuilding(type,0):type==='car'?makeProp('car',2):makeCityVehicle(type);
  // Match production material ownership; mutation must never affect prototypes.
  const mats=new Map();mesh.traverse(n=>{if(n.material){if(!mats.has(n.material))mats.set(n.material,n.material.clone());n.material=mats.get(n.material);}});
  mesh.position.set(x,.065,z);mesh.updateMatrixWorld(true);
  const d=mesh.userData;
  return{type,seed,x,z,mesh,isBuilding,w:d.width,d:d.depth,h:d.height,hp:100,maxHp:100,dead:false};
}
function indices(o){let total=0;o.mesh.traverse(n=>{if(n.isMesh)total+=Math.min(n.geometry.drawRange.count,(n.geometry.index?.count??n.geometry.attributes.position.count)-n.geometry.drawRange.start);});return total;}
function free(o){o.mesh.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});}
function strike(o,hp,p={x:o.x+o.w/2,y:1.3,z:o.z}){o.hp=hp;return fractureObject(o,p);}

test('health thresholds are inclusive, proportional, and have an explicit destroyed state',()=>{
  for(const [hp,expected] of [[100,1],[81,1],[80,2],[51,2],[50,3],[25,4],[10,5],[0,6],[-12,6]]){
    assert.equal(damageStage(hp,100),expected);assert.equal(damageStage(hp*5,500),expected);
  }
  assert.equal(damageStage(1,0),1);assert.equal(damageStage(NaN,100),1);
});

test('all architectural styles progressively lose real geometry without duplicate fracture events',()=>{
  for(const kind of CITY_BUILDING_KINDS){
    const o=object(kind);
    assert.equal(strike(o,90),null);assert.equal(o.destruction,undefined);
    let previous=Infinity,removed=0;
    for(const [hp,stage] of [[80,2],[50,3],[25,4],[10,5],[0,6]]){
      const event=strike(o,hp);assert.equal(event.stage,stage,kind);
      assert.ok(event.removed.length>0,kind+' removes pieces at '+stage);
      assert.ok(indices(o)<previous,kind+' never regrows geometry');previous=indices(o);
      assert.ok(o.destruction.removedIds.length>removed);removed=o.destruction.removedIds.length;
      assert.equal(new Set(o.destruction.removedIds).size,removed);
      assert.equal(strike(o,hp),null,'same stage cannot detach the same piece twice');
      for(const b of o.destruction.batches)for(const a of Object.values(b.mesh.geometry.attributes))
        assert.ok(a.array.every(Number.isFinite),kind+' finite geometry');
    }
    const stage=o.destruction.stage;strike(o,70);assert.equal(o.destruction.stage,stage,'healing cannot reattach rubble');free(o);
  }
});

test('fracturing an instance cannot alter another identical building or the cached prototype',()=>{
  const a=object('office'),b=object('office');const before=indices(b);
  const original=[];b.mesh.traverse(n=>{if(n.isMesh)original.push([...n.geometry.attributes.position.array]);});
  strike(a,10);assert.equal(indices(b),before);let i=0;
  b.mesh.traverse(n=>{if(n.isMesh)assert.deepEqual([...n.geometry.attributes.position.array],original[i++]);});
  const c=object('office');assert.equal(indices(c),before);[a,b,c].forEach(free);
});

test('object-specific patterns are repeatable but not identical across the same model',()=>{
  const results=new Set();
  for(let i=0;i<8;i++){
    const a=object('apartment',i),b=object('apartment',i);
    strike(a,50);strike(b,50);assert.deepEqual(a.destruction.removedIds,b.destruction.removedIds);
    results.add(a.destruction.removedIds.join(','));free(a);free(b);
  }
  assert.equal(results.size,8);
  assert.notEqual(damageSeed(object('car',1,0,0)),damageSeed(object('car',1,10,0)));
});

test('the struck facade influences where the first structural chunk comes away',()=>{
  const a=object('warehouse'),b=object('warehouse');
  const left=strike(a,80,{x:-7,y:2,z:0}),right=strike(b,80,{x:7,y:2,z:0});
  const avg=e=>e.removed.reduce((sum,p)=>sum+p.center.x*p.weight,0)/e.removed.reduce((sum,p)=>sum+p.weight,0);
  assert.ok(avg(left)<avg(right)-2);free(a);free(b);
});

test('civilian, police and ambulance vehicles shed panels while keeping their own patterns',()=>{
  for(const kind of ['car','policecar','ambulance']){
    const o=object(kind);const first=strike(o,80);assert.equal(first.vehicle,true);assert.ok(first.removed.length>0);
    const count=indices(o);strike(o,50);assert.ok(indices(o)<count);strike(o,0);assert.equal(indices(o),0);free(o);
  }
});

test('intact objects keep the original baked draw-call budget; damage remains batched',()=>{
  const o=object('skyscraper');let before=0;o.mesh.traverse(n=>{if(n.isMesh)before++;});
  strike(o,25);let after=0;o.mesh.traverse(n=>{if(n.isMesh)after++;});
  assert.equal(after,before);assert.ok(o.destruction.parts.length<2500);free(o);
});

test('large hits crossing multiple stages detach cumulative damage in one event',()=>{
  const o=object('townhall');const event=strike(o,9);
  assert.equal(event.stage,5);assert.equal(o.destruction.revision,1);
  assert.ok(event.removed.length>40);free(o);
});

test('successive structural hits keep temporary bounds allocation proportional to model size',()=>{
  const o=object('skyscraper');strike(o,80);
  const totalParts=o.destruction.parts.length,previous=indices(o);
  let clones=0;
  const originalClone=THREE.Box3.prototype.clone;
  THREE.Box3.prototype.clone=function(){clones++;return originalClone.call(this);};
  try {
    const event=strike(o,10);
    assert.equal(event.stage,5);assert.ok(event.removed.length>20);
    assert.ok(indices(o)<previous,'the allocation budget must not skip real destruction');
    assert.ok(clones<totalParts*2,`bounds work must not allocate per decoration/hole pair (${clones} clones for ${totalParts} pieces)`);
    assert.equal(strike(o,10),null,'sustained contacts within one health stage remain idempotent');
  } finally {THREE.Box3.prototype.clone=originalClone;free(o);}
});

test('car alarms renew one emitter, attenuate with distance, pause, time out and stop on wreck',()=>{
  const events=[],stops=[],scene=new THREE.Scene(),o=object('car');
  const sys=new DestructionSystem(scene,{audio:{play:(...args)=>events.push(args),stopEnvironment:id=>stops.push(id)}});
  o.hp=95;sys.hit(o,{x:0,y:1,z:1},{x:0,z:0});sys.hit(o,{x:0,y:1,z:1},{x:0,z:0});
  assert.equal(sys.alarms.size,1);sys.update(.1,{x:0,z:0});assert.equal(events.filter(e=>e[0]==='carAlarm').length,1);
  const time=sys.time;sys.update(.1,{x:0,z:0},{active:false});assert.equal(sys.time,time);
  const count=events.length;for(let i=0;i<15;i++)sys.update(.1,{x:100,z:100});assert.equal(events.length,count);
  for(let i=0;i<100;i++)sys.update(.1,{x:0,z:0});assert.equal(sys.alarms.size,0);
  sys.hit(o,{x:0,y:1,z:1},{x:0,z:0});o.hp=0;sys.hit(o,{x:0,y:1,z:1},{x:0,z:0});
  assert.equal(sys.alarms.size,0);assert.ok(stops.some(Number.isFinite));assert.ok(events.some(e=>e[0]==='carWreck'));
  sys.dispose();free(o);
});

test('detached pieces use the real model geometry and obey the debris budget and lifecycle',()=>{
  const scene=new THREE.Scene(),events=[];
  const sys=new DestructionSystem(scene,{quality:'low',audio:{play:(...x)=>events.push(x)}});
  const objects=[];
  for(let j=0;j<4;j++){
    const o=object('townhall',j,j*20,0);objects.push(o);scene.add(o.mesh);o.hp=0;
    sys.hit(o,{x:o.x+5,y:3,z:5},{x:0,z:0});
  }
  assert.ok(sys.debris.length>0&&sys.debris.length<=44);
  assert.ok(sys.debris.some(p=>p.mesh.geometry.attributes.position.count>36),'actual architectural pieces, not only generic cubes');
  for(let i=0;i<60;i++)sys.update(.1,{x:60,z:0});
  for(const p of sys.debris){assert.ok(p.mesh.position.y>=p.halfY+.07);assert.ok(p.mesh.geometry.attributes.position.array.every(Number.isFinite));}
  assert.ok(events.some(e=>e[0]==='debrisLand'));
  for(let i=0;i<200;i++)sys.update(.1,{x:0,z:0});assert.equal(sys.debris.length,0);
  sys.dispose();sys.dispose();assert.equal(scene.children.includes(sys.group),false);objects.forEach(free);
});

test('fracture transforms follow a moved and rotated vehicle, not its spawn location',()=>{
  const scene=new THREE.Scene(),o=object('car',13,20,-15);o.mesh.rotation.y=Math.PI/2;
  const sys=new DestructionSystem(scene);o.hp=50;sys.hit(o,{x:22,y:1,z:-15},{x:22,z:-15});
  assert.ok(sys.debris.length>0);for(const d of sys.debris)assert.ok(d.mesh.position.distanceTo(o.mesh.position)<5);
  sys.dispose();free(o);
});

test('rubble lands on neighboring solid roofs without falling through them',()=>{
  const scene=new THREE.Scene(),o=object('car'),roof={x:5,z:0,w:4,d:4,h:2,baseY:.065};
  const sys=new DestructionSystem(scene,{nearObjects:()=>[roof]});o.hp=0;sys.hit(o,{x:1,y:1,z:0});
  const part=sys.debris[0];part.mesh.position.set(5,5,0);part.vx=part.vz=part.vy=0;
  for(let i=0;i<15;i++)sys.update(.1);
  assert.ok(part.mesh.position.y>=roof.h+roof.baseY+part.halfY-.01);
  sys.dispose();free(o);
});


test('destruction stages reuse fixed GPU index buffers and render only live pieces',()=>{
  const o=object('office');strike(o,80);
  const buffers=o.destruction.batches.map(b=>b.mesh.geometry.index);
  for(const hp of [50,25,10,0]){
    strike(o,hp);
    o.destruction.batches.forEach((b,i)=>{
      const g=b.mesh.geometry;
      assert.equal(g.index,buffers[i]);
      assert.equal(g.drawRange.count,b.parts.filter(p=>!p.removed).reduce((n,p)=>n+p.count,0));
      const drawn=new Set(g.index.array.subarray(0,g.drawRange.count));
      for(const p of b.parts)assert.equal(drawn.has(p.start),!p.removed);
    });
  }
  free(o);
});
