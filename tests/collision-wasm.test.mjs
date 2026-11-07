import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {createGeometryCollision} from '../geometry-collision.js';
import {makeCityBuilding} from '../city-models.js';
import {fractureObject} from '../destruction.js';
import {enableCollisionWasm,setCollisionWasmEnabled,collisionWasmStatus} from '../collision-wasm.js?v=20261107-perf14';
await enableCollisionWasm(await readFile(new URL('../assets/wasm/collision.wasm',import.meta.url)));
let seed=8129;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function compare(collision,object,a,b,r){
 setCollisionWasmEnabled(false);const js=collision.geometryHit(object,a,b,r);
 setCollisionWasmEnabled(true);const wasm=collision.geometryHit(object,a,b,r);
 assert.equal(wasm===null,js===null,JSON.stringify({a,b,r,js,wasm}));
 if(js){assert.ok(Math.abs(js.t-wasm.t)<1e-8,JSON.stringify({a,b,r,js,wasm}));}
}
test('WASM f64 sweep agrees with JS on 6000 convex, moving, scaled and zero-length sweeps',()=>{
 for(const geometry of [new THREE.BoxGeometry(3,4,2),new THREE.CylinderGeometry(.8,1.6,3,6),new THREE.TetrahedronGeometry(2),new THREE.PlaneGeometry(4,3)]){
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
  const object={mesh,x:0,z:0,w:6,d:6,h:6,dead:false};
  const collision=createGeometryCollision({nearObjects:()=>[object]});
  for(let i=0;i<1500;i++){
   if(i%50===0){mesh.rotation.set(rnd(),rnd()*3,rnd());mesh.scale.set(.5+rnd(),.5+rnd(),.5+rnd());mesh.position.set(rnd()*2,0,rnd()*2);}
   const a={x:rnd()*10-4,y:rnd()*10-4,z:rnd()*10-4};
   const b=i%10?{x:rnd()*10-4,y:rnd()*10-4,z:rnd()*10-4}:a;
   compare(collision,object,a,b,i%3?rnd()*1.3:0);
  }
 }
 assert.ok(collisionWasmStatus().calls>1000);
});
test('WASM and JS preserve rendered holes before and after real building fracture',()=>{
 for(const kind of ['townhouse','shop','warehouse']){
  const mesh=makeCityBuilding(kind,0);const object={mesh,x:0,z:0,w:mesh.userData.width,d:mesh.userData.depth,h:mesh.userData.height,hp:100,maxHp:100,isBuilding:true,type:kind,seed:31,dead:false};
  const collision=createGeometryCollision({nearObjects:()=>[object]});
  for(const hp of [100,79,49,19]){
   object.hp=hp;if(hp<100)fractureObject(object,{x:0,y:2,z:0});
   for(let i=0;i<180;i++)compare(collision,object,{x:-10,y:rnd()*12,z:rnd()*12-6},{x:10,y:rnd()*12,z:rnd()*12-6},i%2?.1:1.2);
  }
 }
});
