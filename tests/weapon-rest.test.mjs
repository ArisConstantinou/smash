import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGeometryCollision} from '../geometry-collision.js';
import {findGeometryRest,geometryRestValid} from '../weapon-rest.js';
import {makeCityBuilding,makeCityVehicle} from '../city-models.js';

const close=(a,b,eps=1e-4)=>assert.ok(Math.abs(a-b)<=eps,`${a} should equal ${b}`);
const foot={minX:-.32,maxX:.32,minZ:-1.1,maxZ:1.1},vertical={minY:-.22,maxY:.22};
function box(root,x,y,z,w,h,d) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());
  mesh.position.set(x,y,z);root.add(mesh);return mesh;
}
function object(build,x=0,z=0) {
  const mesh=new THREE.Group();build(mesh);mesh.position.set(x,0,z);mesh.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(mesh),size=b.getSize(new THREE.Vector3());
  return {mesh,x,z,w:size.x,d:size.z,h:b.max.y,dead:false};
}
function world(objects=[],bounds=20) {
  const nearObjects=()=>objects,collision=createGeometryCollision({nearObjects,bounds});
  for(const o of objects)o.geometryHit=(a,b,r)=>collision.geometryHit(o,a,b,r);
  return {objects,bounds,nearObjects,supportSurface:collision.support,supportHeight:collision.supportHeight,clearBody:collision.clearBody};
}

test('a long log lands clear of the entire car on its approach side',()=>{
  const car=object(root=>box(root,0,.8,0,2,1.6,2),0,3),w=world([car]);
  const rest=findGeometryRest({x:0,z:1.8},foot,vertical,w,{ceiling:.35,breadcrumbs:[{x:0,z:-3},{x:0,z:0},{x:0,z:1}]});
  assert.ok(rest);assert.equal(geometryRestValid(rest,w),true);
  close(rest.floor,0);close(rest.y+vertical.minY,.09);
  assert.ok(rest.z+foot.maxZ<2,'The full shaft stays outside the near car face');
  assert.ok(rest.z<2,'Recovery must not switch to the far side of the struck car');
});

test('a real lower roof supports the weapon below a taller rooftop unit',()=>{
  const building=object(root=>{box(root,0,2,0,10,4,10);box(root,3,6,0,1.2,4,1.2);}),w=world([building]);
  const rest=findGeometryRest({x:0,z:0},foot,vertical,w,{ceiling:4.35,breadcrumbs:[{x:0,z:-2}]});
  assert.ok(rest);close(rest.x,0);close(rest.z,0);close(rest.floor,4);
  assert.ok(building.h>7);assert.equal(geometryRestValid(rest,w),true);
  close(rest.y,4.31);
});

test('the full footprint can rest on a narrow real ledge without assuming an enclosing building roof',()=>{
  const ledge=object(root=>box(root,0,2.9,0,3,.2,1)),w=world([ledge]);
  const horizontal={minX:-1.1,maxX:1.1,minZ:-.2,maxZ:.2};
  const rest=findGeometryRest({x:0,z:0},horizontal,vertical,w,{ceiling:3.35,breadcrumbs:[{x:0,z:0}]});
  assert.ok(rest);close(rest.floor,3);assert.equal(geometryRestValid(rest,w),true);
});

test('destroyed support invalidates the saved rest pose and relocates to the actual remaining floor',()=>{
  let upper;
  const building=object(root=>{box(root,0,.5,0,8,1,8);upper=box(root,0,3.9,0,8,.2,8);}),w=world([building]);
  const rest=findGeometryRest({x:0,z:0},foot,vertical,w,{ceiling:4.35,breadcrumbs:[{x:0,z:-2}]});
  assert.ok(rest);close(rest.floor,4);assert.equal(geometryRestValid(rest,w),true);
  upper.geometry.setIndex([]);
  assert.equal(geometryRestValid(rest,w),false);
  const next=findGeometryRest(rest,foot,vertical,w,{ceiling:4.35,breadcrumbs:[{x:0,z:-2}]});
  assert.ok(next);close(next.floor,1);assert.equal(geometryRestValid(next,w),true);
});

test('a moved vehicle invalidates the complete weapon volume even while its old support remains',()=>{
  const car=object(root=>box(root,0,.8,0,2,1.6,2),4,0),w=world([car]);
  const rest=findGeometryRest({x:0,z:0},foot,vertical,w,{ceiling:.35,breadcrumbs:[{x:-4,z:0}]});
  assert.ok(rest);assert.equal(geometryRestValid(rest,w),true);
  car.x=.8;car.mesh.position.x=.8;
  assert.equal(geometryRestValid(rest,w),false);
  const next=findGeometryRest(rest,foot,vertical,w,{ceiling:.35,breadcrumbs:[{x:-4,z:0},{x:-2,z:0}]});
  assert.ok(next);assert.equal(geometryRestValid(next,w),true);assert.ok(next.x<car.x);
});

test('ground throws never acquire an unreachable car or roof support above the supplied ceiling',()=>{
  const car=object(root=>box(root,0,.8,0,2,1.6,4)),w=world([car]);
  const rest=findGeometryRest({x:0,z:0},foot,vertical,w,{ceiling:.35,breadcrumbs:[{x:0,z:-5}]});
  assert.ok(rest);close(rest.floor,0);assert.equal(geometryRestValid(rest,w),true);
});

test('a large roof hole beneath the shaft prevents a floating rest pose',()=>{
  const platform=object(root=>{box(root,-1.1,3.9,0,1.5,.2,5);box(root,1.1,3.9,0,1.5,.2,5);}),w=world([platform]);
  const crossing={minX:-1.1,maxX:1.1,minZ:-.2,maxZ:.2};
  const fabricated={x:0,z:0,y:4.31,floor:4,footprint:crossing,verticalBounds:vertical,clearance:.09,bounds:20};
  assert.equal(geometryRestValid(fabricated,w),false);
});

test('mesh-origin offsets and the complete footprint respect the world boundary',()=>{
  const w=world([],10),offset={minX:-.1,maxX:.8,minZ:-.7,maxZ:1.6};
  const rest=findGeometryRest({x:9.8,z:9.8},offset,{minY:-.7,maxY:.2},w,{ceiling:.35,breadcrumbs:[{x:7,z:7}]});
  assert.ok(rest);assert.equal(geometryRestValid(rest,w),true);
  assert.ok(rest.x+offset.maxX<=9.92+1e-6);assert.ok(rest.z+offset.maxZ<=9.92+1e-6);
  close(rest.y,.79);
  assert.equal(findGeometryRest({x:0,z:0},{minX:-11,maxX:11,minZ:-1,maxZ:1},vertical,w,{ceiling:.35}),null);
});

test('actual shop and police-car models use their surviving surface geometry for resting clearance',()=>{
  const shop=makeCityBuilding('shop',0),police=makeCityVehicle('police',0);police.position.set(11,.065,0);shop.position.y=.065;
  const building={mesh:shop,x:0,z:0,w:shop.userData.width,d:shop.userData.depth,h:shop.userData.height,dead:false};
  const car={mesh:police,x:11,z:0,w:police.userData.width,d:police.userData.depth,h:police.userData.height,dead:false};
  const w=world([building,car]);
  const roof=w.supportHeight(1.8,-1,.1,20);
  assert.ok(roof>6&&roof<6.5);
  const rest=findGeometryRest({x:1.8,z:-1},foot,vertical,w,{ceiling:roof+.35,breadcrumbs:[{x:1.8,z:-1}]});
  assert.ok(rest);assert.ok(rest.floor<building.h-.1);assert.equal(geometryRestValid(rest,w),true);
  const street=findGeometryRest({x:11,z:2.6},foot,vertical,w,{ceiling:.35,breadcrumbs:[{x:11,z:5}]});
  assert.ok(street);close(street.floor,0);assert.equal(geometryRestValid(street,w),true);
});
