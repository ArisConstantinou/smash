import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeCityBuilding} from '../city-models.js';
import {createWorld} from '../world.js';
import {installArchitecture,findSupport,findCeiling,actorSections,sweepArchitecture,polygonContact} from '../architecture.js';
import {moveCircle,circleOverlaps} from '../core.js';
import {firstHammerHit} from '../combat.js';
import {fractureObject} from '../destruction.js';

const close=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} differs from ${b}`);
function building(kind,rotation=0){
  const mesh=makeCityBuilding(kind);mesh.position.set(0,.065,0);mesh.rotation.y=rotation;
  const swap=Math.abs(Math.sin(rotation))>.5;
  const object={mesh,type:kind,x:0,z:0,w:swap?mesh.userData.depth:mesh.userData.width,d:swap?mesh.userData.width:mesh.userData.depth,h:mesh.userData.height,isBuilding:true,dead:false,hp:1000,maxHp:1000,seed:31,plotId:11};
  installArchitecture(object);return object;
}

test('an awning, low hospital wing and skyscraper terraces have their visible, different heights',()=>{
  const shop=building('shop'),hospital=building('hospital'),tower=building('skyscraper');
  const awning=findSupport([shop],0,4.05,.08),roof=findSupport([shop],1.5,-.45,.08);
  assert.ok(awning.height>2.9&&awning.height<3.3);
  close(roof.height,6.125);
  assert.ok(roof.height<shop.h-.3,'A roof is below its rooftop plant, not the whole model maximum');
  const wing=findSupport([hospital],-5.75,0,.08),main=findSupport([hospital],0,0,.08);
  close(wing.height,4.765);close(main.height,8.705);
  const terrace1=findSupport([tower],4.6,-.45,.04),terrace2=findSupport([tower],3.7,-.45,.04),top=findSupport([tower],0,0,.04);
  close(terrace1.height,11.665);close(terrace2.height,19.865);
  assert.ok(top.height>24&&top.height<tower.h-1);
});

test('construction floors support feet and block heads while open bays remain empty',()=>{
  const object=building('construction'),feet=findSupport([object],2,1,.44,2.5);
  close(feet.height,.785);
  close(findCeiling([object],2,1,.44,feet.height+2.05),3.195);
  const walls=actorSections([object],2,1,.44,feet.height,2.05);
  assert.equal(walls.some(part=>circleOverlaps(2,1,.43999,part)),false);
  assert.ok(object.h>15,'The broad phase still includes the decorative crane');
  assert.equal(firstHammerHit({x:3,y:16.55,z:0},{x:5,y:16.55,z:0},[object],.08),null,
    'Moving crane arms are not invisible static overhead walls');
});

test('throws cross a real open bay and stop on a real pillar, retaining object ownership',()=>{
  const object=building('construction');
  const from={x:2,y:2,z:6},to={x:2,y:2,z:1};
  assert.equal(firstHammerHit(from,to,[object],.05),null);
  const pillar=firstHammerHit({x:4.3,y:2,z:6},{x:4.3,y:2,z:1},[object],.05);
  assert.equal(pillar?.target,object);
  assert.ok(pillar.z>3.35&&pillar.z<3.5);
  const beamless=sweepArchitecture(from,to,object.getCollisionParts(),.05);
  assert.equal(beamless,null);
});

test('high-speed movement sweeps columns without treating the entire open floor as a box',()=>{
  const object=building('construction'),y=.785;
  for(const x of [2,4.3]){
    const actor={x,z:2,y,radius:.44};
    moveCircle(actor,0,-2.5,actorSections([object],x,.75,1.9,y,2.05),actor.radius);
    if(x===2)close(actor.z,-.5);else assert.ok(actor.z>-.011&&actor.z<-.009);
  }
});

test('quarter-turn building rotations preserve the same support geometry',()=>{
  const original=building('shop');
  for(const yaw of [Math.PI/2,Math.PI,Math.PI*1.5]){
    const rotated=building('shop',yaw),sin=Math.sin(yaw),cos=Math.cos(yaw);
    for(const [x,z] of [[0,4.05],[1.5,-.45],[-4.1,0],[0,4.8]]){
      const expected=findSupport([original],x,z,.06).height;
      close(findSupport([rotated],x*cos+z*sin,-x*sin+z*cos,.06).height,expected);
    }
  }
});

test('culling and impact shake do not change collision; relocation updates its cached frame',()=>{
  const object=building('shop'),first=object.getCollisionParts(),height=findSupport([object],1.5,-.45,.1).height;
  object.mesh.visible=false;object.mesh.position.x=.08;object.mesh.rotation.z=.04;
  assert.equal(object.getCollisionParts(),first);close(findSupport([object],1.5,-.45,.1).height,height);
  object.x=18;object.z=-12;
  assert.notEqual(object.getCollisionParts(),first);
  close(findSupport([object],19.5,-12.45,.1).height,height);
  close(findSupport([object],1.5,-.45,.1).height,0);
});

test('fractured roof pieces remove support and weapon collision at their actual holes',()=>{
  const object=building('construction'),first=object.getCollisionParts(),before=[];
  for(let x=-4;x<=4;x++)for(let z=-4;z<=3;z++)before.push({x,z,height:findSupport([object],x,z,.025,9).height});
  object.hp=200;
  const event=fractureObject(object,{x:2,y:8.55,z:3.75});
  assert.ok(event.removed.length>0);assert.notEqual(object.getCollisionParts(),first);
  const removed=new Set(event.removed.map(p=>p.id)),holes=[];
  for(const p of before){
    const after=findSupport([object],p.x,p.z,.025,9);
    assert.ok(!after.part||!removed.has(after.part.id));
    if(p.height>8.7&&p.height<8.8&&after.height<p.height-1)holes.push({...p,after});
  }
  assert.ok(holes.length>8,'A removed upper slab must expose lower surviving layers');
  const open=holes.find(p=>!firstHammerHit({x:p.x,y:9,z:p.z},{x:p.x,y:8.5,z:p.z},[object],.01));
  assert.ok(open,'A weapon must cross at least one of the visibly removed upper slab sections');
  assert.equal(object.getCollisionParts(),object.getCollisionParts(),'Unchanged damage revisions reuse the same cache');
  object.dead=true;
  close(findSupport([object],0,0,.44).height,0);assert.deepEqual(object.getCollisionParts(),[]);
});

test('explicit box dimensions used by fixtures retain their requested roof and thin-wall behavior',()=>{
  const object=building('townhouse');Object.assign(object,{w:12,d:12,h:4});
  assert.equal(object.getCollisionParts(),null);
  close(findSupport([object],6.35,0,.44,4).height,4);
  assert.equal(firstHammerHit({x:8,y:2,z:0},{x:0,y:2,z:0},[object],.2)?.target,object);
});

const scene=new THREE.Scene(),world=createWorld(scene,{seed:41});
test.after(()=>world.dispose());
function isolate(kind){
  world.objects.forEach((o,i)=>{o.x=500+i*20;o.z=500;o.mesh.position.set(o.x,.065,o.z);});
  const object=world.objects.find(o=>o.type===kind);
  object.x=0;object.z=0;object.mesh.position.set(0,.065,0);object.mesh.rotation.y=0;
  const frame=object.architectureFrame;frame.yaw=0;
  object.w=frame.w=object.mesh.userData.width;object.d=frame.d=object.mesh.userData.depth;
  world.rebuildSpatialIndex();return object;
}

test('walking into an open construction bay climbs visible foundation steps without teleporting',()=>{
  isolate('construction');
  const actor={x:2,z:7,y:0,vy:0,radius:.44};
  for(let step=0;step<100;step++){
    const previous={...actor};world.moveActor(actor,0,-.06,{allowStep:true});
    assert.ok(Math.hypot(actor.x-previous.x,actor.z-previous.z)<=.060001);
    assert.ok(actor.y>=previous.y-SURFACE_TOLERANCE&&actor.y-previous.y<=.48);
  }
  close(actor.z,1);close(actor.y,.785);
  close(world.ceilingHeight(actor.x,actor.z,actor.radius,actor.y+2.05),3.195);
});
const SURFACE_TOLERANCE=1e-5;

test('walking up and over both halves of a pitched roof follows the slope and crosses its ridge',()=>{
  isolate('townhouse');
  const actor={x:-3,z:-.3,y:world.supportHeight(-3,-.3,.44),vy:0,radius:.44};
  let highest=actor.y;
  for(let step=0;step<100;step++){
    const previous={...actor};world.moveActor(actor,.06,0,{allowStep:true});
    close(actor.x-previous.x,.06);close(actor.z,previous.z);
    assert.ok(Math.abs(actor.y-previous.y)<=.48);
    close(actor.y,world.supportHeight(actor.x,actor.z,.44,actor.y));
    highest=Math.max(highest,actor.y);
  }
  assert.ok(actor.x>2.9);assert.ok(highest>6.8&&actor.y<5.9);
});

test('walking off a real roof while guarding or dashing falls locally instead of crossing the building',()=>{
  isolate('shop');
  for(const stride of [.025,.15]){
    const actor={x:2.8,z:-.45,y:world.supportHeight(2.8,-.45,.44,6.2),vy:0,radius:.44};
    let leftRoof=false;
    for(let frame=0;frame<230;frame++){
      const old={...actor};world.moveActor(actor,stride,0,{allowStep:true});
      assert.ok(Math.hypot(actor.x-old.x,actor.z-old.z)<=stride+.00001);
      const floor=world.supportHeight(actor.x,actor.z,actor.radius,actor.y);
      if(actor.y>floor){actor.vy-=20/120;actor.y=Math.max(floor,actor.y+actor.vy/120);leftRoof=true;}
      else actor.vy=0;
    }
    assert.ok(leftRoof);assert.ok(actor.x>7);close(actor.y,0);
  }
});

test('grounded weapons use the actual lower roof, clear rooftop objects and remain recoverable',()=>{
  const object=isolate('shop'),footprint={minX:-.8,maxX:.8,minZ:-.28,maxZ:.28,height:.4};
  const origin={x:1,z:-.45},roof=world.supportHeight(origin.x,origin.z,.02,6.2);
  const resting=world.findWeaponRest(origin,footprint,{breadcrumbs:[{x:1,z:0}],ceiling:roof+.5});
  assert.ok(resting);close(resting.groundY,6.125);
  assert.ok(resting.groundY<object.h-.3);
  assert.equal(world.weaponRestClear(resting,footprint),true);
  const support=world.weaponSupportAt(resting.x,resting.z,footprint,resting.groundY+.02);
  close(support.height,resting.groundY);
  assert.equal(firstHammerHit({x:resting.x,y:resting.groundY+.65,z:resting.z+1.2},{x:resting.x,y:resting.groundY+.65,z:resting.z},[object],.06),null);
});

test('circle sweeps respect a rotated narrow ledge and allow tangential sliding',()=>{
  const polygon=[{x:-1,z:-1.1},{x:1.1,z:1},{x:1,z:1.1},{x:-1.1,z:-1}];
  const collider={x:0,z:0,w:2.2,d:2.2,polygon};
  const actor={x:-2,z:0,radius:.3};
  moveCircle(actor,4,0,[collider],actor.radius);
  assert.ok(actor.x<-.35);
  assert.equal(polygonContact(actor.x,actor.z,polygon).inside,false);
  assert.equal(circleOverlaps(actor.x,actor.z,actor.radius-1e-6,collider),false);
});
