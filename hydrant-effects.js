// Fixed dynamic buffers: two draws for the nearest eight broken hydrants.
// Three pressure streams, ballistic droplets and ground splashes; no lights,
// physics bodies, per-frame geometries, downloaded textures or renderer fallback.
import * as THREE from './vendor/three.module.js';
export const HYDRANT_LIMIT=8,HYDRANT_SEGMENTS=18,HYDRANT_SIDES=6;
const QUAD=[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]],SPRITE=[[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]];
export function waterPath(jet,t,time=0,collapsed=false,out={}){
 const pulse=1+.07*Math.sin(time*9+t*5),side=jet===1?-1:1;
 if(jet===0){out.x=Math.sin(t*9+time*7)*.07*t;out.y=(collapsed?0:.89)+(3.9*(2*t-t*t))*pulse;out.z=Math.sin(t*7-time*6)*.09*t;}
 else{out.x=side*(.39+5.5*t);out.y=Math.max(.015,.6+2*t-2.585*t*t);out.z=Math.sin(t*18-time*12)*.045*t;}return out;
}
function batch(scene,name,vertices,opacity){
 const geometry=new THREE.BufferGeometry();
 for(const attr of ['position','color'])geometry.setAttribute(attr,new THREE.BufferAttribute(new Float32Array(vertices*3),3).setUsage(THREE.DynamicDrawUsage));
 geometry.setDrawRange(0,0);
 const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 if(name==='hydrant-droplets-and-splashes'){
  const pixels=new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){const r=((x-15.5)/15)**2+((y-15.5)/15)**2,index=(y*32+x)*4;pixels[index]=pixels[index+1]=pixels[index+2]=255;pixels[index+3]=r<1?Math.round(255*(1-r)**.6):0;}
  const texture=new THREE.DataTexture(pixels,32,32);texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;material.map=texture;material.alphaTest=.02;
  const uv=new Float32Array(vertices*2);for(let i=0;i<vertices;i++){uv[i*2]=SPRITE[i%6][0]>0?1:0;uv[i*2+1]=SPRITE[i%6][1]>0?1:0;}geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
 }
 const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.frustumCulled=false;mesh.visible=false;mesh.userData.noCollision=true;scene.add(mesh);return mesh;
}
export class HydrantEffects{
 constructor(scene){
  this.sources=new Map();this.time=0;this.disposed=false;
  this.water=batch(scene,'hydrant-pressure-streams',HYDRANT_LIMIT*3*HYDRANT_SEGMENTS*HYDRANT_SIDES*6,.8);
  this.spray=batch(scene,'hydrant-droplets-and-splashes',HYDRANT_LIMIT*3*52*6,.9);
  this.point=new THREE.Vector3();this.right=new THREE.Vector3();this.up=new THREE.Vector3();this.rotation=new THREE.Quaternion();
  this.sample={x:0,y:0,z:0};
  for(const mesh of [this.water,this.spray]){const c=mesh.geometry.attributes.color;for(let i=0;i<c.count;i++){const light=mesh===this.water&&Math.floor(i/6)%6<2?.14:0;c.setXYZ(i,mesh===this.water?.2+light:.85,mesh===this.water?.59+light:.97,mesh===this.water?.78+light:.98);}}
 }
 activate(o){if(this.disposed||this.sources.has(o))return false;this.sources.set(o,{age:0});return true;}
 update(dt,player,camera){
  if(this.disposed||dt<=0)return;this.time+=dt;
  const active=[];
  for(const [o,s]of this.sources){s.age+=dt;const d2=(o.x-player.x)**2+(o.z-player.z)**2;if(d2<55**2)active.push({o,s,d2});
   const caps=o.mesh.userData.caps||[],t=Math.min(1,s.age/.35),lift=Math.sin(t*Math.PI)*.25;
   if(caps[0]){caps[0].position.set(.28*t,.89+.18*t+lift,0);caps[0].rotation.z=-1.1*t;}
   for(let i=1;i<caps.length;i++){const side=i===1?-1:1;caps[i].position.set(side*(.4+.07*t),.6-.24*t+lift*.3,0);caps[i].rotation.z=side*.6*t;}
  }
  active.sort((a,b)=>a.d2-b.d2);active.length=Math.min(active.length,HYDRANT_LIMIT);
  camera.getWorldQuaternion(this.rotation);this.right.set(1,0,0).applyQuaternion(this.rotation);this.up.set(0,1,0).applyQuaternion(this.rotation);
  let wc=0,sc=0;
  const vertex=(mesh,index,x,y,z,m)=>mesh.geometry.attributes.position.setXYZ(index,m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]);
  for(const {o,s}of active){
   o.mesh.updateWorldMatrix(true,true);
   const matrix=o.mesh.matrixWorld.elements;
   for(let jet=0;jet<(o.dead?1:3);jet++){
    for(let i=0;i<HYDRANT_SEGMENTS;i++)for(let k=0;k<HYDRANT_SIDES;k++)for(const [step,side]of QUAD){
     const t=(i+step)/HYDRANT_SEGMENTS,p=waterPath(jet,t,this.time,o.dead,this.sample),a=(side+k)/HYDRANT_SIDES*Math.PI*2;
     const radius=(.13+t*.07)*(1+.12*Math.sin(t*35-this.time*21)),r=Math.cos(a)*radius;
     const x=p.x+(jet===0?r:0),y=p.y+(jet===0?0:r),z=p.z+Math.sin(a)*radius;
     vertex(this.water,wc++,x,y,z,matrix);
    }
    for(let j=0;j<52;j++){
     const t=((this.time*(jet===0?.7:1.1)+j/40)%1),a=j*2.4;
     const p=waterPath(jet,t,this.time,o.dead,this.sample);
     if(j>=40){const end=waterPath(jet,1,this.time,o.dead,this.sample);const ex=jet===0?0:end.x,ez=jet===0?0:end.z;p.x=ex+Math.cos(a)*t*.6;p.y=.02+Math.sin(t*Math.PI)*.25;p.z=ez+Math.sin(a)*t*.6;}
     else if(jet===0&&j%2===0){const fall=(t+.2)%1;p.x=Math.cos(a)*fall*1.25;p.y=Math.max(.015,4.8*(1-fall*fall));p.z=Math.sin(a)*fall*1.25;}
     else{p.x+=Math.sin(a)*t*.32;p.y=Math.max(.025,p.y+Math.sin(a*1.3)*t*.23);p.z+=Math.cos(a)*t*.36;}
     const size=.025+t*.04;
     const x=matrix[0]*p.x+matrix[4]*p.y+matrix[8]*p.z+matrix[12],y=matrix[1]*p.x+matrix[5]*p.y+matrix[9]*p.z+matrix[13],z=matrix[2]*p.x+matrix[6]*p.y+matrix[10]*p.z+matrix[14];
     for(const [u,v]of SPRITE){
      const pos=this.spray.geometry.attributes.position,col=this.spray.geometry.attributes.color;
      pos.setXYZ(sc++,x+(this.right.x*u+this.up.x*v)*size,y+(this.right.y*u+this.up.y*v)*size,z+(this.right.z*u+this.up.z*v)*size);
     }
    }
   }
  }
  for(const [mesh,count]of [[this.water,wc],[this.spray,sc]]){mesh.geometry.setDrawRange(0,count);mesh.visible=count>0;if(count)mesh.geometry.attributes.position.needsUpdate=true;}
 }
 warm(){for(const mesh of [this.water,this.spray]){mesh.visible=true;mesh.geometry.setDrawRange(0,6);}}
 hide(){for(const mesh of [this.water,this.spray]){mesh.visible=false;mesh.geometry.setDrawRange(0,0);}}
 dispose(){if(this.disposed)return;this.disposed=true;this.sources.clear();for(const mesh of [this.water,this.spray]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.map?.dispose();mesh.material.dispose();}}
}
