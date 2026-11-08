import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {makeProp} from '../models.js';
import {HydrantEffects,HYDRANT_LIMIT,waterPath} from '../hydrant-effects.js';
test('hydrant source has metre scale, three cap pivots and modelled open outlets',()=>{
 const mesh=makeProp('hydrant');mesh.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(mesh),size=b.getSize(new THREE.Vector3());
 assert.ok(size.y>.95&&size.y<1.05);assert.ok(size.x>.6&&size.x<.7);assert.equal(mesh.userData.caps.length,3);
 let meshes=0,triangles=0;mesh.traverse(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});
 assert.equal(meshes,4);assert.ok(triangles>500&&triangles<3000);
});
test('pressure paths start at all three openings, rise strongly and return lateral jets to the ground',()=>{
 assert.equal(waterPath(0,0).y,.89);assert.ok(waterPath(0,1).y>4.4);
 assert.equal(waterPath(1,0).x,-.39);assert.equal(waterPath(2,0).x,.39);
 for(const jet of [1,2]){assert.ok(Math.abs(waterPath(jet,1).x)>5.5);assert.ok(waterPath(jet,1).y<.03);}
 assert.equal(waterPath(0,0,0,true).y,0);
});
test('many active hydrants use fixed buffers and two draws, stop updating while paused and dispose completely',()=>{
 const scene=new THREE.Scene(),fx=new HydrantEffects(scene),camera=new THREE.PerspectiveCamera(),objects=[];
 for(let i=0;i<12;i++){const mesh=makeProp('hydrant');mesh.position.x=i*2;scene.add(mesh);const o={mesh,x:i*2,z:0,dead:false};objects.push(o);assert.equal(fx.activate(o),true);assert.equal(fx.activate(o),false);}
 const position=fx.water.geometry.attributes.position;fx.update(.5,{x:0,z:0},camera);
 assert.equal(fx.water.geometry.drawRange.count,HYDRANT_LIMIT*3*18*6*6);assert.equal(scene.children.filter(o=>o.userData.noCollision).length,2);
 assert.ok([...position.array].every(Number.isFinite));const t=fx.time;fx.update(0,{x:0,z:0},camera);assert.equal(fx.time,t);assert.equal(fx.water.geometry.attributes.position,position);
 fx.update(.1,{x:1000,z:1000},camera);assert.equal(fx.water.visible,false);assert.equal(fx.spray.visible,false);
 fx.dispose();assert.equal(fx.sources.size,0);assert.equal(fx.water.parent,null);assert.equal(fx.spray.parent,null);
});
