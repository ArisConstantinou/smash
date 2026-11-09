import * as THREE from './vendor/three.module.js';
// r170 native local clipping produced unchanged pixels in the actual WebGPU
// probe. Use its supported node alpha-test path for this actor only. The same
// Lambert lighting, vertex colours and emissive armour remain in place.
export function installBeastReveal(mesh,webgpu){
 const plane=new THREE.Plane(new THREE.Vector3(0,0,1),1e6),normal=THREE.uniform(plane.normal),constant=THREE.uniform(plane.constant),materials=new Map(),nodes=[];
 mesh.traverse(n=>{if(!n.isMesh)return;const original=n.material;if(!materials.has(original)){
  if(webgpu){const m=new THREE.MeshLambertNodeMaterial();for(const key of ['color','emissive'])m[key].copy(original[key]);for(const key of ['vertexColors','flatShading','emissiveIntensity','side','depthTest','depthWrite'])m[key]=original[key];m.userData=original.userData;
   m.opacityNode=THREE.positionWorld.dot(normal).add(constant).greaterThanEqual(0).select(1,0);m.alphaTest=.5;materials.set(original,m);
  }else{original.clippingPlanes=[plane];original.clipShadows=true;materials.set(original,original);}
 }n.material=materials.get(original);nodes.push({node:n,shadow:n.castShadow});});
 if(webgpu)for(const old of materials.keys())old.dispose();
 return {plane,materials:[...materials.values()],sync(){constant.value=plane.constant;for(const {node,shadow}of nodes)node.castShadow=shadow&&plane.constant===1e6;}};
}
