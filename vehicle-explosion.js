// Unity Labs Explosion00, CC0. One shared texture and one bounded draw for all
// active car explosions. Standard geometry/material works in WebGPU and WebGL.
import * as THREE from './vendor/three.module.js';
export const EXPLOSION_DURATION=1.25;
let texture,loading;
const corners=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];
export function preloadVehicleExplosion(){
 return loading??=(new THREE.TextureLoader().loadAsync(new URL('./assets/vfx/explosion00.png',import.meta.url).href).then(value=>{
  texture=value;texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;return texture;
 }));
}
export function explosionFrame(age){return Number.isFinite(age)&&age>=0&&age<EXPLOSION_DURATION?Math.min(24,Math.floor(age/EXPLOSION_DURATION*25)):null;}
export class VehicleExplosionBatch{
 constructor(scene,limit=16){
  this.limit=limit;this.geometry=new THREE.BufferGeometry();
  this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(limit*18),3).setUsage(THREE.DynamicDrawUsage));
  this.geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(limit*12),2).setUsage(THREE.DynamicDrawUsage));
  this.geometry.setDrawRange(0,0);
  this.material=new THREE.MeshBasicMaterial({map:texture||null,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:false});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name='vehicle-explosion-flipbook';
  this.mesh.visible=false;this.mesh.frustumCulled=false;this.mesh.userData.noCollision=true;scene.add(this.mesh);
  this.right=new THREE.Vector3();this.up=new THREE.Vector3();this.point=new THREE.Vector3();
 }
 update(active,rotation){
  this.right.set(1,0,0).applyQuaternion(rotation);this.up.set(0,1,0).applyQuaternion(rotation);
  const positions=this.geometry.attributes.position,uv=this.geometry.attributes.uv;let count=0;
  for(const {s}of active){
   const frame=s.destroyed?explosionFrame(s.deadTime):null;if(frame===null)continue;
   if(count>=this.limit)break;
   const col=frame%5,row=Math.floor(frame/5),inset=.5/1024;
   const u0=col/5+inset,u1=(col+1)/5-inset,v0=1-(row+1)/5+inset,v1=1-row/5-inset;
   for(let i=0;i<6;i++){
    const [x,y]=corners[i],u=x>0?u1:u0,v=y>0?v1:v0;this.point.copy(s.burstOrigin);this.point.y+=1.5;
    this.point.addScaledVector(this.right,x*3.8).addScaledVector(this.up,y*3.8);
    const vertex=count*6+i;positions.setXYZ(vertex,this.point.x,this.point.y,this.point.z);uv.setXY(vertex,u,v);
   }
   count++;
  }
  this.geometry.setDrawRange(0,count*6);this.mesh.visible=count>0;
  if(count){positions.needsUpdate=true;uv.needsUpdate=true;}
 }
 dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
