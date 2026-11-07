// Rigid skinning batches heterogeneous rubble without replacing its geometry.
// One bone per physical piece; every vertex has exactly one weight of one.
import * as THREE from './vendor/three.module.js';

export class DebrisRenderer{
 constructor(group,material,limit){
  this.capacity=0;this.parts=[];this.bones=Array.from({length:limit},()=>new THREE.Bone());
  this.geometry=new THREE.BufferGeometry();this.mesh=new THREE.SkinnedMesh(this.geometry,material);
  this.mesh.name='Exact architectural debris batch';this.mesh.castShadow=this.mesh.receiveShadow=true;
  this.mesh.frustumCulled=false;this.mesh.add(...this.bones);group.add(this.mesh);
  this.mesh.bind(new THREE.Skeleton(this.bones));this.resize(256);this.geometry.setDrawRange(0,0);
 }
 resize(required){
  if(required<=this.capacity)return;
  let capacity=Math.max(256,this.capacity);while(capacity<required)capacity*=2;
  const geometry=new THREE.BufferGeometry();
  for(const name of ['position','normal','color'])geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('skinIndex',new THREE.BufferAttribute(new Uint16Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('skinWeight',new THREE.BufferAttribute(new Float32Array(capacity*4),4).setUsage(THREE.DynamicDrawUsage));
  this.mesh.geometry=geometry;this.geometry.dispose();this.geometry=geometry;this.capacity=capacity;
 }
 sync(parts){
  const changed=parts.length!==this.parts.length||parts.some((p,i)=>p!==this.parts[i]);
  if(changed){
   const vertices=parts.reduce((n,p)=>n+p.mesh.geometry.attributes.position.count,0);this.resize(vertices);
   const a=this.geometry.attributes;let offset=0;
   for(let slot=0;slot<parts.length;slot++){
    const source=parts[slot].mesh.geometry.attributes,count=source.position.count;
    for(const name of ['position','normal','color'])a[name].array.set(source[name].array,offset*3);
    for(let i=offset;i<offset+count;i++){a.skinIndex.array[i*4]=slot;a.skinWeight.array[i*4]=1;}
    offset+=count;
   }
   this.geometry.setDrawRange(0,vertices);
   for(const attribute of Object.values(a))attribute.needsUpdate=true;
   this.parts=parts.slice();
  }
  for(let i=0;i<parts.length;i++){
   const source=parts[i].mesh,bone=this.bones[i];
   bone.position.copy(source.position);bone.quaternion.copy(source.quaternion);bone.scale.copy(source.scale);
  }
 }
 dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.mesh.skeleton.dispose();this.parts.length=0;}
}
