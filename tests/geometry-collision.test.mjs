import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGeometryCollision,BODY_HEIGHT} from '../geometry-collision.js';
import {makeCityBuilding,makeCityVehicle} from '../city-models.js';
import {makeProp} from '../models.js';
import {fractureObject} from '../destruction.js';

const close=(a,b,epsilon=1e-4)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} should equal ${b}`);
function box(root,x,y,z,w,h,d,rotation=0) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());
  mesh.position.set(x,y,z);mesh.rotation.z=rotation;root.add(mesh);return mesh;
}
function fixture(build) {
  const mesh=new THREE.Group();build?.(mesh);mesh.updateMatrixWorld(true);
  const object={mesh,x:0,z:0,w:30,d:30,h:30,hp:100,maxHp:100,type:'fixture',dead:false};
  const objects=[object], collision=createGeometryCollision({nearObjects:()=>objects});
  return {object,objects,collision,mesh};
}
function realObject(kind='shop',rotation=0) {
  const mesh=kind==='car'?makeProp('car',1):kind==='policecar'?makeCityVehicle('police',1):makeCityBuilding(kind,0);
  mesh.position.set(0,.065,0);mesh.rotation.y=rotation;mesh.updateMatrixWorld(true);
  const object={mesh,x:0,z:0,w:mesh.userData.width,d:mesh.userData.depth,h:mesh.userData.height,
    hp:100,maxHp:100,isBuilding:!['car','policecar'].includes(kind),type:kind,seed:31,dead:false};
  const collision=createGeometryCollision({nearObjects:()=>[object]});
  return {object,collision,mesh};
}

test('support follows the roof, sign and roof equipment instead of the enclosing box height',()=>{
  const {collision}=fixture(root=>{
    box(root,0,1.5,0,8,3,6);
    box(root,2,3.6,0,1.4,1.2,1.4);
    box(root,5,2.5,0,2,.2,1.2);
  });
  close(collision.supportHeight(0,0,.2,20),3);
  close(collision.supportHeight(2,0,.2,20),4.2);
  close(collision.supportHeight(5,0,.2,20),2.6);
  close(collision.supportHeight(5,2,.2,20),0);
  close(collision.supportHeight(2,0,.2,3.5),3);
  const player={x:5,z:-4,y:0,radius:.44};
  collision.moveBody(player,0,8,{dy:-.01});
  close(player.x,5);close(player.z,4);close(player.y,0);
});

test('a rotated footprint leaves the visibly empty corners traversable',()=>{
  const {mesh,collision}=fixture(root=>box(root,0,1,0,6,2,2));
  mesh.rotation.y=Math.PI/4;
  close(collision.supportHeight(2,2,.15,5),0);
  close(collision.supportHeight(1.5,-1.5,.15,5),2);
  const player={x:2,z:3,y:0,radius:.3};
  collision.moveBody(player,0,-1,{dy:-.02});
  close(player.x,2);close(player.z,2);
});

test('sloping roof height is sampled from its triangles and can be followed uphill and downhill',()=>{
  const angle=Math.PI/6,{collision}=fixture(root=>box(root,0,3,0,6,.14,5,angle));
  const low=collision.supportHeight(-1,0,0,10),high=collision.supportHeight(1,0,0,10);
  close(high-low,2*Math.tan(angle));
  const player={x:-1,z:0,y:collision.supportHeight(-1,0,.35,10),radius:.35};
  const initial=player.y;
  for(let i=0;i<20;i++) {
    const result=collision.moveBody(player,.05,0,{dy:-.002});
    assert.equal(result.grounded,true);
  }
  close(player.x,0);assert.ok(player.y>initial+.5);
  for(let i=0;i<20;i++)collision.moveBody(player,-.05,0,{dy:-.002});
  close(player.x,-1);close(player.y,initial);
});

test('stepping and jumping onto separate tiers obey real available headroom',()=>{
  const {collision}=fixture(root=>{
    box(root,-1.5,.075,0,1,.15,2);
    box(root,-.5,.15,0,1,.3,2);
    box(root,.5,.225,0,1,.45,2);
    box(root,2,2,0,1,4,2);
  });
  const player={x:-2.6,z:0,y:0,radius:.3};
  for(let i=0;i<60;i++)collision.moveBody(player,.04,0,{dy:-.005});
  assert.ok(player.x>-.4);close(player.y,.45);
  collision.moveBody(player,3,0,{dy:-.005});
  assert.ok(player.x<1.21,'A tall wall cannot be walked up as if it were stairs');
  close(player.y,.45);
});

test('jumping under an awning stops the head on its underside rather than snapping onto its roof',()=>{
  const {collision}=fixture(root=>box(root,0,2.5,0,5,.2,5));
  const player={x:0,z:0,y:0,radius:.44,vy:14};
  const result=collision.moveBody(player,0,0,{dy:3,grounded:false});
  assert.equal(result.ceilingHit,true);assert.equal(result.landed,false);
  close(player.y,2.4-BODY_HEIGHT);close(player.vy,0);
});

test('high-speed travel cannot tunnel through a thin actual facade',()=>{
  const {collision}=fixture(root=>box(root,0,2,0,.06,4,8));
  const player={x:-3,z:0,y:0,radius:.44};
  collision.moveBody(player,8,0,{dy:-.03});
  assert.ok(player.x<=-.47+1e-5);assert.ok(player.x>-.471);close(player.z,0);
});

test('the whole foot circle supports a roof edge and leaving it falls locally',()=>{
  const {collision}=fixture(root=>box(root,0,2,0,12,4,12));
  const player={x:6.35,z:0,y:4,radius:.44};
  for(let i=0;i<120;i++)collision.moveBody(player,0,0,{dy:-.002});
  close(player.x,6.35);close(player.z,0);close(player.y,4);
  for(let i=0;i<50;i++) {
    const before={...player};collision.moveBody(player,.015,0,{dy:-.02});
    assert.ok(Math.abs(player.x-before.x)<.016,'Falling must never eject through a distant building face');
    assert.ok(player.y<=before.y+1e-6);
  }
  assert.ok(player.x>6.8);assert.ok(player.y<3.5);
});

test('reversing toward a roof after falling below it hits the nearby wall without upward snapping',()=>{
  const {collision}=fixture(root=>box(root,0,2,0,12,4,12));
  const player={x:6.5,z:0,y:3.96,radius:.44};
  for(let i=0;i<20;i++) {
    const y=player.y;collision.moveBody(player,-.08,0,{dy:-.02,grounded:false});
    assert.ok(player.x>=6.44-1e-5);assert.ok(player.y<y);
  }
});

test('a descending jump lands on the actual roof once and preserves its local trajectory',()=>{
  const {collision}=fixture(root=>box(root,0,2,0,12,4,12));
  const player={x:6.8,z:0,y:4.2,radius:.44};
  const result=collision.moveBody(player,-.6,0,{dy:-.4,grounded:false});
  assert.equal(result.landed,true);close(player.x,6.2);close(player.y,4);
  for(let i=0;i<20;i++)collision.moveBody(player,0,0,{dy:-.002});
  close(player.x,6.2);close(player.y,4);
});

test('removing indexed roof geometry immediately removes support and leaves remaining lower tiers',()=>{
  let upper;
  const {collision}=fixture(root=>{
    box(root,0,.5,0,5,1,5);upper=box(root,0,2.5,0,5,.2,5);
  });
  close(collision.supportHeight(0,0,.44,9),2.6);
  const builds=collision.diagnostics.cacheBuilds;
  upper.geometry.setIndex([]);
  close(collision.supportHeight(0,0,.44,9),1);
  assert.ok(collision.diagnostics.cacheBuilds>builds);
  const player={x:0,z:0,y:2.6,radius:.44};
  const result=collision.moveBody(player,0,0,{dy:-.15});
  assert.equal(result.grounded,false);close(player.y,2.45);close(player.x,0);
});

test('real construction floors can be occupied underneath higher storeys',()=>{
  const {collision,object}=realObject('construction');
  // Clear bay between the modelled columns. Its second storey is not the top
  // of the 17m crane bounding box, and its ceiling is the next concrete slab.
  const x=-2,z=1.5,first=collision.supportHeight(x,z,.25,1),second=collision.supportHeight(x,z,.25,4);
  assert.ok(first>.7&&first<.9);assert.ok(second>3.3&&second<3.6);
  assert.ok(object.h>15);
  assert.ok(collision.ceilingHeight(x,z,.25,first+BODY_HEIGHT,5)>3.1);
  const player={x,z,y:first,radius:.25};
  collision.moveBody(player,.8,0,{dy:-.01});
  close(player.x,x+.8);close(player.y,first);
});

test('real cars have distinct bonnet and cabin support, also when moved and rotated',()=>{
  const {collision,object,mesh}=realObject('car',Math.PI/2);
  const bonnet=collision.supportHeight(1.4,0,.12,5),cabin=collision.supportHeight(0,0,.12,5);
  assert.ok(cabin>bonnet+.25);assert.ok(bonnet>.9&&bonnet<1.2);
  const builds=collision.diagnostics.cacheBuilds;
  object.x=6;object.z=-4;mesh.position.x=6;mesh.position.z=-4;
  close(collision.supportHeight(0,0,.12,5),0);
  close(collision.supportHeight(6,-4,.12,5),cabin);
  assert.equal(collision.diagnostics.cacheBuilds,builds,'Moving a model reuses its local geometry cache');
});

test('actual progressive fracture shares its remaining piece index with movement and support',()=>{
  const {collision,object}=realObject('shop');
  const samples=[];
  for(let x=-4;x<=4;x+=.8)for(let z=-3;z<=3;z+=.8)samples.push({x,z,height:collision.supportHeight(x,z,.1,20)});
  object.hp=10;fractureObject(object,{x:0,y:5.9,z:3});
  assert.ok(object.destruction.batches.every(batch=>batch.mesh.geometry.userData.collisionParts?.length));
  let lowered=0;
  for(const p of samples) {
    const height=collision.supportHeight(p.x,p.z,.1,20);
    assert.ok(height<=p.height+1e-4,'Fracture must not create a new invisible upper floor');
    if(height<p.height-.3)lowered++;
  }
  assert.ok(lowered>=5,'Missing chunks must remove their own support area');
  object.dead=true;
  close(collision.supportHeight(0,0,.44,20),0);
});

test('render culling and visual hit shake do not change stable architectural support',()=>{
  const {collision,object,mesh}=realObject('shop');
  object.collisionAnchor={y:mesh.position.y,quaternion:mesh.quaternion.clone()};
  const initial=collision.supportHeight(0,0,.44,20),builds=collision.diagnostics.cacheBuilds;
  mesh.visible=false;mesh.position.x+=.12;mesh.rotation.z=.03;
  close(collision.supportHeight(0,0,.44,20),initial);
  assert.equal(collision.diagnostics.cacheBuilds,builds);
});

test('swept weapons pass over a low real roof even when a distant chimney makes the envelope much taller',()=>{
  const {collision,object}=fixture(root=>{
    box(root,0,1.5,0,8,3,6);box(root,3,5,0,.8,4,.8);
  });
  assert.equal(collision.geometryHit(object,{x:-3,y:4,z:0},{x:1,y:4,z:0},.3),null);
  const chimney=collision.geometryHit(object,{x:1,y:4,z:0},{x:5,y:4,z:0},.3);
  assert.ok(chimney);close(chimney.x,2.3);
  const roof=collision.geometryHit(object,{x:0,y:6,z:0},{x:0,y:0,z:0},.3);
  assert.ok(roof);close(roof.y,3.3);
});

test('continuous sphere casting has truly rounded 3D corners and edge contacts',()=>{
  const {collision,object}=fixture(root=>box(root,0,1,0,2,2,2));
  const clear={x:1.4,y:1,z:1.4};
  assert.equal(collision.geometryHit(object,clear,clear,.5),null,'Expanded square AABB corner must remain empty');
  const touch={x:1.3,y:1,z:1.3};
  assert.equal(collision.geometryHit(object,touch,touch,.5)?.t,0);
  const edge=collision.geometryHit(object,{x:-3,y:2.3,z:1.3},{x:3,y:2.3,z:1.3},.5);
  assert.ok(edge);close(edge.x,-1-Math.sqrt(.25-.3*.3*2));
  assert.equal(collision.geometryHit(object,{x:-3,y:2.4,z:1.4},{x:3,y:2.4,z:1.4},.5),null);
});

test('geometry ray visibility follows active render indices and recognizes a true inside start',()=>{
  let mesh;
  const {collision,object}=fixture(root=>{mesh=box(root,0,1,0,2,2,2);});
  const from={x:-4,y:1,z:0},to={x:4,y:1,z:0};
  close(collision.geometryHit(object,from,to,0).x,-1);
  assert.equal(collision.geometryHit(object,{x:0,y:1,z:0},to,0).t,0);
  mesh.geometry.setIndex([]);
  assert.equal(collision.geometryHit(object,from,to,.4),null);
});

test('long fast casts do not tunnel through small rotated signs',()=>{
  const {collision,object,mesh}=fixture(root=>box(root,0,1.8,0,2,.2,.035));
  mesh.rotation.y=.42;
  const hit=collision.geometryHit(object,{x:0,y:1.8,z:-100},{x:0,y:1.8,z:100},.1);
  assert.ok(hit&&hit.t>.49&&hit.t<.5);
  assert.equal(collision.geometryHit(object,{x:4,y:1.8,z:-100},{x:4,y:1.8,z:100},.1),null);
});
