// Every attack target locks before firing: moving out
// of the marked space remains a valid dodge even in the enraged phase.
import * as THREE from './vendor/three.module.js';
import {VehicleExplosionBatch} from './vehicle-explosion.js?v=20261108-colossus1';
export const BEAST_ATTACKS=Object.freeze(['missiles','rockets','laser','stomp','rearStomp','bodySlam']);
const up=new THREE.Vector3(0,1,0);
export function missileOffset(index){const angle=(index-1)*Math.PI*2/5;return index===0?{x:0,z:0}:{x:Math.sin(angle)*4,z:Math.cos(angle)*4};}
// r170's small InstancedMesh uniform path kept the prewarmed identity matrices
// on this WebGPU device. These bounded world-space batches use ordinary dynamic
// attributes, as the verified explosion batch does; no per-frame mesh creation.
class DynamicPool{
 constructor(source,material,limit,name){
  const flat=source.index?source.toNonIndexed():source;
  this.vertices=flat.attributes.position.count;this.positions=new Float32Array(flat.attributes.position.array);this.normals=new Float32Array(flat.attributes.normal.array);this.limit=limit;
  this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.positions.length*limit),3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(this.normals.length*limit),3).setUsage(THREE.DynamicDrawUsage));this.geometry.setDrawRange(0,0);
  this.mesh=new THREE.Mesh(this.geometry,material);this.mesh.name=name;this.mesh.frustumCulled=false;this.mesh.userData.noCollision=true;
  this.point=new THREE.Vector3();this.normal=new THREE.Vector3();this.normalMatrix=new THREE.Matrix3();
  if(flat!==source)flat.dispose();source.dispose();
 }
 set(index,matrix){
  const p=this.geometry.attributes.position,n=this.geometry.attributes.normal,offset=index*this.vertices;this.normalMatrix.getNormalMatrix(matrix);
  for(let i=0;i<this.vertices;i++){
   this.point.fromArray(this.positions,i*3).applyMatrix4(matrix);this.normal.fromArray(this.normals,i*3).applyMatrix3(this.normalMatrix).normalize();
   p.setXYZ(offset+i,this.point.x,this.point.y,this.point.z);n.setXYZ(offset+i,this.normal.x,this.normal.y,this.normal.z);
  }
 }
 finish(count){this.geometry.setDrawRange(0,count*this.vertices);if(count){this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.normal.needsUpdate=true;}}
}
export function distanceToBeam(point,a,b){
 const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=dx*dx+dy*dy+dz*dz;
 const t=d?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy+(point.z-a.z)*dz)/d)):0;
 return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t,point.z-a.z-dz*t);
}
export class BeastCombat{
 constructor(scene,{blast=()=>{},beamHit=()=>{},cast=()=>null,surface=()=>0,cue=()=>{}}={}){
  this.scene=scene;this.blast=blast;this.beamHit=beamHit;this.cast=cast;this.surface=surface;this.surfaceCache=new Map();this.clock=0;this.cue=cue;this.projectiles=[];this.bursts=[];this.attack=null;
  this.shellPool=new DynamicPool(new THREE.CylinderGeometry(.18,.36,1.7,8),new THREE.MeshLambertMaterial({color:0xb6c4bd,emissive:0xa6370f,emissiveIntensity:.65}),16,'colossus-flying-ordnance');this.shells=this.shellPool.mesh;
  this.markerPool=new DynamicPool(new THREE.RingGeometry(.88,1,48),new THREE.MeshBasicMaterial({color:0xff6538,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,fog:false}),24,'colossus-danger-zones');this.markers=this.markerPool.mesh;this.markerCount=0;
  this.beam=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,12),new THREE.MeshBasicMaterial({color:0xff5625,transparent:true,opacity:.85,depthWrite:false}));this.beam.visible=false;this.beam.frustumCulled=false;
  this.explosions=new VehicleExplosionBatch(scene,16);scene.add(this.shells,this.markers,this.beam);this.dummy=new THREE.Object3D();
 }
 reset(){this.projectiles.length=0;this.bursts.length=0;this.attack=null;this.surfaceCache.clear();this.shellPool.finish(0);this.markerPool.finish(0);this.markerCount=0;this.beam.visible=this.explosions.mesh.visible=false;this.explosions.geometry.setDrawRange(0,0);}
 warm(){for(const pool of [this.shellPool,this.markerPool])pool.geometry.setDrawRange(0,pool.vertices*pool.limit);this.beam.visible=true;}
 start(kind,b,player){
  if(!BEAST_ATTACKS.includes(kind))throw new Error('Unknown beast attack '+kind);
  const target=new THREE.Vector3(player.x,Math.max(0,player.y)+.9,player.z),u=b.mesh.userData;
  const origin=u.worldPoint(new THREE.Vector3(0,5.2,4));
  const stomp=kind==='stomp'||kind==='rearStomp';
  const bodySlam=kind==='bodySlam',center=bodySlam?new THREE.Vector3(b.x,this.surface(b.x,b.z),b.z):null;
  this.attack={kind,time:0,windup:kind==='laser'||bodySlam?1.65:stomp?1.35:1.25,
   duration:kind==='laser'?2.4:bodySlam?.86:stomp?.6:.58,settle:kind==='laser'?.38:0,
   target,origin,launched:false,angle:Math.atan2(target.x-origin.x,target.z-origin.z),distance:Math.max(12,Math.hypot(target.x-origin.x,target.z-origin.z)),hits:new Set(),feet:stomp?u.feet().slice(kind==='rearStomp'?2:0,kind==='rearStomp'?4:2):[],center,radius:bodySlam?7.8:5.8,damageScale:b.damageScale||1};
  this.cue(kind);return this.attack;
 }
 launch(b){
  const a=this.attack,u=b.mesh.userData;
  if(a.kind==='missiles'||a.kind==='rockets'){
   const missile=a.kind==='missiles',count=missile?6:3;
   for(let i=0;i<count&&this.projectiles.length<16;i++){
    const mount=(missile?u.missileMounts:u.rocketMounts)[(i*(missile?4:3))%(missile?u.missileMounts.length:u.rocketMounts.length)];
    const from=u.worldPoint(mount),to=a.target.clone();
    if(missile){const offset=missileOffset(i);to.x+=offset.x;to.z+=offset.z;to.y=a.target.y>3?a.target.y:.25;}
    else {const offset=(i-1)*2.6;to.x+=Math.cos(a.angle)*offset;to.z-=Math.sin(a.angle)*offset;}
    this.projectiles.push({kind:a.kind,from,to,previous:from.clone(),position:from.clone(),time:0,duration:missile?1.65+i*.13:Math.max(.9,from.distanceTo(to)/23),radius:missile?3.1:2.5,damage:(missile?32:38)*a.damageScale});
   }
  }else if(a.center||a.feet.length){
   for(const point of a.center?[a.center]:a.feet){
    this.blast(point,a.radius,(a.center?58:38)*a.damageScale,{groundOnly:true});
    this.bursts.push({s:{destroyed:true,deadTime:0,burstOrigin:point.clone(),visualScale:a.center?1.1:.7}});
   }
  }
  a.launched=true;
 }
 update(dt,b,player,camera){
  if(!Number.isFinite(dt)||dt<0)return;
  this.clock+=dt;
  const a=this.attack;
  if(a){a.time+=dt;if(!a.launched&&a.time>=a.windup)this.launch(b);
   if(a.kind==='laser'){
    const fire=a.time-a.windup;
    if(fire>=a.duration)this.beam.visible=false;
    else{
     const active=fire>=0,angle=a.angle-.38+Math.max(0,fire/a.duration)*.76;
     const origin=b.mesh.userData.worldPoint(new THREE.Vector3(0,5.2,4));
     const end=new THREE.Vector3(a.origin.x+Math.sin(angle)*a.distance,a.target.y,a.origin.z+Math.cos(angle)*a.distance);
     const clipped=active?this.beamHit(origin,end,dt,a.hits):null;
     this.setBeam(origin,clipped||end,active?.32:.055);this.beam.material.opacity=active?.9:.35+Math.sin(a.time*18)*.15;
    }
   }
   if(a.time>=a.windup+a.duration+a.settle){this.attack=null;this.beam.visible=false;}
  }
  for(let i=this.projectiles.length-1;i>=0;i--){
   const p=this.projectiles[i];p.previous.copy(p.position);p.time+=dt;const t=Math.min(1,p.time/p.duration);
   p.position.lerpVectors(p.from,p.to,t);if(p.kind==='missiles')p.position.y+=Math.sin(Math.PI*t)*11;
   const contact=this.cast(p.previous,p.position,.26);
   if(t===1||contact){const point=contact?new THREE.Vector3(contact.x,contact.y,contact.z):p.to;this.blast(point,p.radius,p.damage,{});this.bursts.push({s:{destroyed:true,deadTime:0,burstOrigin:point.clone()}});this.projectiles.splice(i,1);}
  }
  for(const burst of this.bursts)burst.s.deadTime+=dt;this.bursts=this.bursts.filter(v=>v.s.deadTime<1.25).slice(-16);
  this.draw(camera);
 }
 setBeam(from,to,width){const d=this.dummy;d.position.copy(from).add(to).multiplyScalar(.5);d.quaternion.setFromUnitVectors(up,new THREE.Vector3().subVectors(to,from).normalize());d.scale.set(width,from.distanceTo(to),width);this.beam.position.copy(d.position);this.beam.quaternion.copy(d.quaternion);this.beam.scale.copy(d.scale);this.beam.visible=true;}
 draw(camera){
  const d=this.dummy;let n=0;
  const marker=(point,radius)=>{if(n>=24)return;
   const key=point.x.toFixed(2)+':'+point.z.toFixed(2);let floor=this.surfaceCache.get(key);
   if(!floor||this.clock-floor.at>.2){if(this.surfaceCache.size>64)this.surfaceCache.clear();floor={y:this.surface(point.x,point.z),at:this.clock};this.surfaceCache.set(key,floor);}
   d.position.set(point.x,point.y>3?point.y:floor.y+.12,point.z);d.rotation.set(-Math.PI/2,0,0);d.scale.set(radius,radius,1);d.updateMatrix();this.markerPool.set(n++,d.matrix);};
  const a=this.attack;
  if(a&&!a.launched){
   if(a.center)marker(a.center,a.radius);
   else if(a.feet.length)for(const p of a.feet)marker(p,a.radius);
   else if(a.kind==='missiles')for(let i=0;i<6;i++){const offset=missileOffset(i);marker({x:a.target.x+offset.x,y:a.target.y,z:a.target.z+offset.z},3.1);}
   else if(a.kind==='rockets')for(let i=-1;i<=1;i++)marker({x:a.target.x+Math.cos(a.angle)*i*2.6,y:a.target.y,z:a.target.z-Math.sin(a.angle)*i*2.6},2.5);
  }
  this.projectiles.forEach((p,i)=>{
   marker(p.to,p.radius);d.position.copy(p.position);const dir=new THREE.Vector3().subVectors(p.position,p.previous);if(dir.lengthSq()<1e-8)dir.subVectors(p.to,p.from);d.quaternion.setFromUnitVectors(up,dir.normalize());d.scale.set(1,1,1);d.updateMatrix();this.shellPool.set(i,d.matrix);
  });
  this.shellPool.finish(this.projectiles.length);this.markerPool.finish(n);this.markerCount=n;
  if(camera)this.explosions.update(this.bursts,camera.quaternion);
 }
 dispose(){this.reset();for(const mesh of [this.shells,this.markers,this.beam]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}this.explosions.dispose();}
}
