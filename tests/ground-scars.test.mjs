import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {GroundScars,GROUND_SCAR_LIMIT} from '../ground-scars.js';
function fixture(){
 const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
 const floor=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshLambertMaterial({color:0x647679}),2);
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(0,0,0),new THREE.Quaternion(),new THREE.Vector3(12,.1,12));floor.setMatrixAt(0,matrix);
 const far=matrix.clone();far.elements[12]=50;floor.setMatrixAt(1,far);floor.userData.groundSurfaces=[0,1].map(()=>({kind:'sidewalk',top:.05,bottom:-.05}));group.add(floor);
 // Compare against the stored Float32 instance matrices, not double-precision
 // constructor values: unchanged .1 is represented as .10000000149011612.
 floor.getMatrixAt(0,matrix);floor.getMatrixAt(1,far);
 const scars=new GroundScars(scene);scars.bind({group});return {scars,floor,matrix,far};
}
test('lightning replaces actual floor surfaces with burnt recessed slabs and restores them at round reset',()=>{
 const {scars,floor,matrix,far}=fixture();assert.equal(scars.add({x:0,y:.8,z:0,level:2},5.36),true);
 const actual=new THREE.Matrix4();floor.getMatrixAt(0,actual);assert.equal(actual.elements[13],matrix.elements[13]-1024);
 floor.getMatrixAt(1,actual);assert.deepEqual(actual.elements,far.elements,'Unhit terrain must remain the authored original');
 assert.equal(scars.material.map,null);assert.equal(scars.material.transparent,false);assert.ok(scars.geometry.attributes.position.count>100);
 const p=scars.geometry.attributes.position,c=scars.geometry.attributes.color;
 assert.ok(Array.from({length:p.count},(_,i)=>p.getY(i)).some(y=>y<.035&&y>-.05),'The floor top must be physically recessed');
 assert.ok(Array.from({length:c.count},(_,i)=>c.getX(i)).some(v=>v<floor.material.color.r*.4),'The floor material itself must be scorched');
 const snapshot=p.array.slice();assert.deepEqual(p.array,snapshot);assert.equal(scars.count,1);
 scars.reset();floor.getMatrixAt(0,actual);assert.deepEqual(actual.elements,matrix.elements);assert.equal(scars.mesh.visible,false);assert.equal(scars.count,0);
 scars.dispose();assert.equal(scars.mesh.parent,null);
});
test('all fourteen earned strikes keep earlier damage and high airborne strikes cannot reach the floor',()=>{
 const {scars}=fixture();assert.equal(scars.add({x:0,y:20,z:0,level:2},5),false);
 for(let i=0;i<GROUND_SCAR_LIMIT;i++)assert.equal(scars.add({x:i*.1,y:.8,z:0,level:i+2},5),true);
 assert.equal(scars.count,14);assert.equal(scars.strikes[0].x,0);assert.equal(scars.damaged.size,1);
 const geometry=scars.geometry;assert.equal(scars.add({x:100,y:.8,z:0,level:15},5),false);assert.equal(scars.geometry,geometry);scars.dispose();
});
