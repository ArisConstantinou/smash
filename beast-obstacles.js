// Contact against individual surviving authored pieces, never a city-sized
// circular collider. SAT keeps turning legs and sloping body armour out of
// buildings; removed fracture pieces immediately stop blocking the mech.
import * as THREE from './vendor/three.module.js';
const cache=new WeakMap(),v=new THREE.Vector3();
function parts(geometry){
 const index=geometry.index,position=geometry.attributes.position,draw=geometry.drawRange;
 const revision=[index?.version,position.version,draw.start,draw.count].join(':');
 let entry=cache.get(geometry);if(entry?.revision===revision&&entry.index===index&&entry.position===position)return entry.parts;
 const end=Math.min(index?.count??position.count,(draw.start||0)+draw.count),active=index?new Set(index.array.subarray(draw.start||0,end)):null;
 const specs=geometry.userData.collisionParts||geometry.userData.fractureParts;
 const result=[];
 const make=ids=>{const box=new THREE.Box3();for(const i of ids)box.expandByPoint(v.fromBufferAttribute(position,i));if(!box.isEmpty())result.push(box);};
 if(specs?.length)for(const s of specs){if(active&&!active.has(s.start))continue;make(Array.from({length:s.count},(_,i)=>s.start+i).filter(i=>!active||active.has(i)));}
 else make(index?Array.from(index.array.subarray(draw.start||0,end)):Array.from({length:end-(draw.start||0)},(_,i)=>i+(draw.start||0)));
 cache.set(geometry,{revision,index,position,parts:result});return result;
}
function obb(box,matrix){
 const e=matrix.elements,axes=[new THREE.Vector3(e[0],e[1],e[2]),new THREE.Vector3(e[4],e[5],e[6]),new THREE.Vector3(e[8],e[9],e[10])];
 const half=box.getSize(new THREE.Vector3()).multiplyScalar(.5),sizes=[half.x,half.y,half.z];
 axes.forEach((axis,i)=>{sizes[i]*=axis.length();axis.normalize();});
 return {center:box.getCenter(new THREE.Vector3()).applyMatrix4(matrix),axes,sizes,bounds:box.clone().applyMatrix4(matrix)};
}
export function boxesOverlap(a,b){
 if(!a.bounds.intersectsBox(b.bounds))return false;
 const delta=new THREE.Vector3().subVectors(b.center,a.center),axes=[...a.axes,...b.axes];
 for(const x of a.axes)for(const y of b.axes){const cross=new THREE.Vector3().crossVectors(x,y);if(cross.lengthSq()>1e-12)axes.push(cross.normalize());}
 for(const axis of axes){let extent=0;for(let i=0;i<3;i++)extent+=Math.abs(axis.dot(a.axes[i]))*a.sizes[i]+Math.abs(axis.dot(b.axes[i]))*b.sizes[i];if(Math.abs(delta.dot(axis))>extent-1e-5)return false;}
 return true;
}
export function beastObstacleContacts(mesh,objects,{plane=null}={}){
 mesh.updateMatrixWorld(true);const body=[];
 mesh.traverse(n=>{if(n.isMesh&&!n.userData.noCollision){if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();body.push({...obb(n.geometry.boundingBox,n.matrixWorld),node:n,solids:null});}});
 const overall=new THREE.Box3();for(const p of body)overall.union(p.bounds);
 const contacts=[];
 for(const object of objects){
  if(object.dead||!object.mesh)continue;
  object.mesh.updateWorldMatrix(true,true);let contact=null;
  object.mesh.traverse(n=>{
   if(contact||!n.isMesh||n.userData.noCollision)return;
   for(const part of parts(n.geometry)){
    const other=obb(part,n.matrixWorld);if(!overall.intersectsBox(other.bounds))continue;
    for(const section of body){
     if(!section.bounds.intersectsBox(other.bounds))continue;
     section.solids??=parts(section.node.geometry).map(p=>obb(p,section.node.matrixWorld));
     for(const solid of section.solids){
      // Only the material that has crossed the rift exists in this city.
      if(plane&&plane.distanceToPoint(solid.center)+solid.bounds.getSize(v).length()*.5<0)continue;
      if(boxesOverlap(solid,other)){const overlap=solid.bounds.clone().intersect(other.bounds),point=overlap.getCenter(new THREE.Vector3());if(plane&&plane.distanceToPoint(point)<0)continue;contact=point;break;}
     }
     if(contact)break;
    }
    if(contact)break;
   }
  });
  if(contact)contacts.push({object,point:contact});
 }
 return contacts;
}
