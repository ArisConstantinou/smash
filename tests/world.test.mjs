import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createWorld } from '../world.js';
import { createCityLayout, CITY_BUILDING_COUNT, CITY_BOUNDS, CITY_ROADS } from '../city-layout.js';
import { createCityNavigation } from '../city-navigation.js';
import { segmentBoxHit } from '../combat.js';
import { moveCircle } from '../core.js';

const scene=new THREE.Scene();
const world=createWorld(scene,{seed:41,round:1});
const distanceToBox=(x,z,o)=>Math.hypot(Math.max(0,Math.abs(x-o.x)-o.w/2),Math.max(0,Math.abs(z-o.z)-o.d/2));
const kinds=['townhouse','apartment','shop','office','townhall','police','hospital','skyscraper','construction','warehouse'];
test.after(()=>world.dispose());

test('city contains 100 substantial, damageable buildings with civic and skyline variety',()=>{
  assert.equal(CITY_BUILDING_COUNT,100);
  assert.equal(world.buildingCount,100);
  assert.equal(world.objects.filter(o=>o.isBuilding).length,100);
  assert.deepEqual([...new Set(world.buildingObjects.map(o=>o.buildingKind))].sort(),[...kinds].sort());
  assert.equal(world.buildingObjects.filter(o=>o.type==='townhall').length,2);
  assert.equal(world.buildingObjects.filter(o=>o.type==='police').length,4);
  assert.equal(world.buildingObjects.filter(o=>o.type==='hospital').length,4);
  assert.equal(world.buildingObjects.filter(o=>o.type==='construction').length,10);
  assert.equal(world.buildingObjects.filter(o=>o.type==='skyscraper').length,12);
  const footprints=new Set();
  for(const o of world.buildingObjects){
    assert.ok(o.w>=5&&o.d>=5&&o.h>=3,`${o.type} must be a substantial building`);
    assert.ok(o.w<=14.2&&o.d<=14.2,`${o.type} must fit its lot`);
    assert.ok(o.hp>=450&&o.hp<=1600&&o.hp===o.maxHp&&o.weight>=4);
    assert.ok(o.mesh.userData.worldObjectIndex>=0);
    let vertices=0;
    o.mesh.traverse(n=>{if(n.isMesh)vertices+=n.geometry.attributes.position.count;});
    assert.ok(vertices>300,`${o.type} must include modelled facade and silhouette detail`);
    footprints.add(`${o.w},${o.d},${o.h}`);
  }
  assert.ok(footprints.size>=12,'Building dimensions and skyline heights must vary');
  assert.ok(world.buildingObjects.some(o=>o.h>=20),'The skyline includes true skyscrapers');
});

test('district layout is deterministic and landmarks keep their destructible object references',()=>{
  assert.deepEqual(createCityLayout(41),createCityLayout(41));
  assert.notDeepEqual(createCityLayout(41).plots.map(p=>p.variant),createCityLayout(42).plots.map(p=>p.variant));
  assert.equal(world.regionAt(-77,-77).weather,'snow');
  assert.equal(world.regionAt(77,-77).weather,'ash');
  assert.equal(world.regionAt(0,0).weather,'rain');
  assert.equal(new Set(world.districts.map(d=>d.id)).size,7);
  assert.ok(world.landmarks.every(l=>l.object?.isBuilding&&l.object.x===l.x&&l.object.z===l.z));
  assert.equal(world.objects.filter(o=>o.type==='policecar').length,8);
  assert.equal(world.objects.filter(o=>o.type==='ambulance').length,8);
  for(const type of ['policecar','ambulance'])for(const o of world.objects.filter(o=>o.type===type)){
    const civic=world.buildingObjects.filter(b=>b.type===(type==='policecar'?'police':'hospital'));
    assert.ok(civic.some(b=>Math.hypot(o.x-b.x,o.z-b.z)<13));
  }
});

test('solid footprints do not overlap, stay inside the enlarged city, and leave the spawn intersection open',()=>{
  assert.equal(world.bounds,CITY_BOUNDS);
  assert.equal(world.nearObjects(0,0,3).length,0);
  for(let i=0;i<world.objects.length;i++){
    const a=world.objects[i];
    assert.ok(Math.abs(a.x)+a.w/2<=CITY_BOUNDS-1+1e-5,`${a.type} outside X boundary`);
    assert.ok(Math.abs(a.z)+a.d/2<=CITY_BOUNDS-1+1e-5,`${a.type} outside Z boundary`);
    for(let j=i+1;j<world.objects.length;j++){
      const b=world.objects[j];
      const overlapX=(a.w+b.w)/2-Math.abs(a.x-b.x),overlapZ=(a.d+b.d)/2-Math.abs(a.z-b.z);
      assert.ok(overlapX<-.001||overlapZ<-.001,`${a.type}@${a.x},${a.z} overlaps ${b.type}@${b.x},${b.z}`);
    }
  }
  for(const x of CITY_ROADS)for(const z of CITY_ROADS){
    assert.ok(world.buildingObjects.every(o=>distanceToBox(x,z,o)>4),'Road junctions connect all four directions');
  }
  assert.ok(world.hazards.some(h=>h.type==='lava')&&world.hazards.some(h=>h.type==='fire'));
  assert.ok(world.hazards.every(h=>Math.hypot(h.x,h.z)>8),'Opening intersection must not inflict unavoidable environmental damage');
});

test('spatial queries agree with full geometry scans at building edges and throughout the city',()=>{
  for(const [x,z,r]of [[0,0,3],[0,0,20],[-110,55,7],[77,-66,12],[114,-99,4],[-73.25,-82.5,6.4],[33,11,0]]){
    const expected=world.objects.filter(o=>!o.dead&&distanceToBox(x,z,o)<=r);
    assert.deepEqual(new Set(world.nearObjects(x,z,r)),new Set(expected));
  }
  const o=world.buildingObjects[0];o.dead=true;
  assert.equal(world.nearObjects(o.x,o.z,0).includes(o),false);
  assert.equal(world.nearObjects(o.x,o.z,0,{includeDead:true}).includes(o),true);
  o.dead=false;
});

test('visibility culls distant blocks without removing collision or navigation data',()=>{
  world.updateVisibility({x:0,z:0});
  const far=world.buildingObjects.find(o=>o.x<-90&&o.z<-90);
  assert.equal(far.mesh.visible,false);
  assert.equal(world.nearObjects(far.x,far.z,0).includes(far),true);
  const visibleAtCenter=world.buildingObjects.filter(o=>o.mesh.visible).length;
  assert.ok(visibleAtCenter<70&&visibleAtCenter>15);
  world.updateVisibility({x:far.x,z:far.z});
  assert.equal(far.mesh.visible,true);
  far.dead=true;world.updateVisibility({x:far.x,z:far.z});assert.equal(far.mesh.visible,false);far.dead=false;
  world.updateVisibility({x:0,z:0});
});

test('hordes route around city blocks from all sides without cutting through solids',()=>{
  const starts=[[0,32],[22,-80],[-22,80],[-100,88],[110,10],[-110,-90],[66,-110],[44,90]];
  for(const radius of [.5,.75,1.3,1.65])for(const start of starts){
    let [x,z]=start;
    // Parking can occupy a near-kerb start; use its closest clear street point.
    if(world.nearObjects(x,z,radius+.1).length){
      const alternative=[[-2,0],[2,0],[0,-2],[0,2]].find(([dx,dz])=>!world.nearObjects(x+dx,z+dz,radius+.1).length);
      assert.ok(alternative,`No valid spawn near ${start}`);x+=alternative[0];z+=alternative[1];
    }
    for(let step=0;step<1600&&Math.hypot(x,z)>.7;step++){
      const d=world.getChaseDirection(x,z,0,0,radius),nx=x+d.x*.25,nz=z+d.z*.25;
      assert.ok(Number.isFinite(d.x)&&Number.isFinite(d.z));
      for(const o of world.nearObjects((x+nx)/2,(z+nz)/2,radius+.2)){
        assert.equal(segmentBoxHit(x,z,nx,nz,o,radius),null,`Route crosses ${o.type}, radius=${radius}, start=${start}`);
      }
      x=nx;z=nz;
    }
    assert.ok(Math.hypot(x,z)<=.7,`Horde got stuck from ${start}, radius ${radius}, at ${x},${z}`);
  }
});

test('thin street props between grid nodes cannot trap a horde on a false free link',()=>{
  const objects=[{x:1,z:0,w:.3,d:.3,dead:false}];
  const nav=createCityNavigation({objects,nearObjects:()=>objects,bounds:20});
  let x=-6,z=0;
  for(let step=0;step<220&&Math.hypot(6-x,z)>.3;step++){
    const d=nav.getChaseDirection(x,z,6,0,.5),nx=x+d.x*.1,nz=z+d.z*.1;
    assert.equal(segmentBoxHit(x,z,nx,nz,objects[0],.5),null);
    x=nx;z=nz;
  }
  assert.ok(Math.hypot(6-x,z)<.3,'A thin lamp must be routed around rather than treated as a clear grid edge');
});

test('cached steering takes mini-bosses through parked-car streets and resumes after a roof target',()=>{
  const radius=1.3,dt=1/60;
  for(const start of [[-44,-11],[44,11],[77,-66],[-33,66]]){
    const e={x:start[0],z:start[1],radius};let navTimer=0,dir={x:0,z:0};
    for(let frame=0;frame<4200&&Math.hypot(e.x,e.z)>.7;frame++){
      navTimer-=dt;
      if(navTimer<=0){dir=world.getChaseDirection(e.x,e.z,0,0,radius);navTimer=.18;}
      moveCircle(e,dir.x*3.6*dt,dir.z*3.6*dt,world.nearObjects(e.x,e.z,radius+.5),radius);
    }
    assert.ok(Math.hypot(e.x,e.z)<.7,`Cached mini-boss steering stalled on a busy road from ${start}`);
  }
  const objects=[{x:0,z:0,w:10,d:10,dead:false}],nav=createCityNavigation({objects,nearObjects:()=>objects,bounds:30});
  const e={x:0,z:13,radius:1.3};
  for(let i=0;i<250;i++){
    const d=nav.getChaseDirection(e.x,e.z,0,0,e.radius);
    moveCircle(e,d.x*.06,d.z*.06,objects,e.radius);
    assert.equal(segmentBoxHit(e.x,e.z,e.x,e.z,objects[0],e.radius-.01),null,'Ground enemies must not enter an occupied roof footprint');
  }
  for(let i=0;i<500&&Math.hypot(e.x-12,e.z-12)>.4;i++){
    const d=nav.getChaseDirection(e.x,e.z,12,12,e.radius);moveCircle(e,d.x*.06,d.z*.06,objects,e.radius);
  }
  assert.ok(Math.hypot(e.x-12,e.z-12)<.4,'Enemies must resume their chase when the player leaves the roof');
});

test('navigation invalidates destroyed obstacles and spatial rebuilding follows moved fixture props',()=>{
  const objects=[{x:0,z:0,w:10,d:10,dead:false}];
  const nav=createCityNavigation({objects,nearObjects:()=>objects,bounds:30});
  const blocked=nav.getChaseDirection(0,12,0,-12,.5);
  assert.ok(Math.abs(blocked.x)>.1);
  objects[0].dead=true;nav.invalidateNavigation();
  assert.deepEqual(nav.getChaseDirection(0,12,0,-12,.5),{x:0,z:-1});
  assert.equal(nav.cachedProfiles,0);
  const o=world.objects.find(o=>o.type==='crate'),old={x:o.x,z:o.z};
  o.x=200;o.z=200;world.rebuildSpatialIndex();
  assert.ok(world.nearObjects(200,200,0).includes(o));
  assert.equal(world.nearObjects(old.x,old.z,0).includes(o),false);
  Object.assign(o,old);world.rebuildSpatialIndex();
});

test('snow, rain, fire, wind and construction cranes animate while resource cleanup is idempotent',()=>{
  const crane=world.objects.find(o=>o.mesh.userData.crane);
  const flag=world.objects.flatMap(o=>o.mesh.children).find(n=>n.geometry?.parameters?.widthSegments===7);
  assert.ok(crane,'Construction site should contain a real animated crane');
  world.updateVisibility({x:crane.x,z:crane.z});
  const before=crane.mesh.userData.crane.pivot.rotation.y;
  world.update(.5,3,{x:crane.x,z:crane.z},'ash');
  assert.notEqual(crane.mesh.userData.crane.pivot.rotation.y,before);
  assert.ok(flag,'City flags should keep the wind animation');
  world.update(.1,4,{x:-77,z:-77},'snow');assert.equal(world.district,'ΠΑΓΩΜΕΝΗ ΣΥΝΟΙΚΙΑ');
  world.update(.1,5,{x:0,z:0},'rain');assert.equal(world.district,'ΚΕΝΤΡΟ ΤΗΣ ΠΟΛΗΣ');

  const disposalScene=new THREE.Scene(),temporary=createWorld(disposalScene,{seed:7});
  const sourceMaterials=new Set();temporary.buildingObjects.forEach(o=>o.mesh.traverse(n=>{if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])sourceMaterials.add(m);}));
  // Match gameplay's per-instance material preparation so hit flashes on one
  // building cannot modify another or dispose immutable model prototypes.
  for(const o of temporary.objects){
    const clones=new Map();o.mesh.traverse(n=>{if(!n.material)return;
      const clone=m=>{if(!clones.has(m))clones.set(m,m.clone());return clones.get(m);};
      n.material=Array.isArray(n.material)?n.material.map(clone):clone(n.material);
    });
  }
  const resources=new Set();temporary.group.traverse(n=>{if(n.geometry)resources.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])resources.add(m);});
  const counts=new Map();for(const r of resources)r.addEventListener('dispose',()=>counts.set(r,(counts.get(r)||0)+1));
  const sourceDisposals=[];for(const m of sourceMaterials)m.addEventListener('dispose',()=>sourceDisposals.push(m));
  temporary.dispose();temporary.dispose();
  assert.equal(disposalScene.children.length,0);
  assert.equal(temporary.group.children.length,0);
  assert.ok([...resources].every(r=>counts.get(r)===1),'Every owned geometry and current material is disposed exactly once');
  assert.equal(sourceDisposals.length,0,'Shared model prototype materials remain available for future cities');
});

test('relocating a vehicle updates its model, new buckets and navigation without leaving stale old occupancy',()=>{
 const car=world.objects.find(o=>o.type==='car'),old={x:car.x,z:car.z};
 world.relocateObject(car,0,0);assert.ok(world.nearObjects(0,0,0).includes(car));assert.equal(world.nearObjects(old.x,old.z,0).includes(car),false);
 assert.equal(car.mesh.position.x,0);assert.equal(car.mesh.position.z,0);
 world.relocateObject(car,44,0);assert.ok(world.nearObjects(44,0,0).includes(car));assert.equal(world.nearObjects(0,0,0).includes(car),false);
 assert.equal(world.nearObjects(44,0,5).filter(o=>o===car).length,1);
 world.relocateObject(car,old.x,old.z);
});

test('static city details reuse local transforms while moving vehicles and crane joints still update',()=>{
 const car=world.objects.find(o=>o.type==='car'),detail=car.mesh.children.find(n=>n.isMesh);
 assert.ok(detail);world.group.updateMatrixWorld(true);
 const before=detail.getWorldPosition(new THREE.Vector3()),local=detail.matrix.clone();
 let recomposed=0;const original=detail.updateMatrix;
 detail.updateMatrix=function(){recomposed++;return original.call(this);};
 try{
  for(let i=0;i<5;i++)world.group.updateMatrixWorld(true);
  assert.equal(recomposed,0,'An unchanged body panel must not be recomposed for every render or collision query');
  const x=car.x,z=car.z;world.relocateObject(car,x+2,z+3);world.group.updateMatrixWorld(true);
  const after=detail.getWorldPosition(new THREE.Vector3());assert.ok(Math.abs(after.x-before.x-2)<1e-8&&Math.abs(after.z-before.z-3)<1e-8);
  assert.ok(detail.matrix.equals(local));world.relocateObject(car,x,z);
  const crane=world.objects.find(o=>o.mesh.userData.crane);world.updateVisibility({x:crane.x,z:crane.z});
  const joint=crane.mesh.userData.crane;world.group.updateMatrixWorld(true);const prior=joint.hook.matrix.clone();
  world.update(.1,17,{x:crane.x,z:crane.z},'rain');world.group.updateMatrixWorld(true);
  assert.equal(joint.pivot.matrixAutoUpdate,true);assert.equal(joint.wire.matrixAutoUpdate,true);assert.equal(joint.hook.matrixAutoUpdate,true);
  assert.equal(joint.hook.matrix.equals(prior),false,'The animated crane must retain its real moving hook');
 }finally{detail.updateMatrix=original;}
});
