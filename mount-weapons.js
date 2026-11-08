import * as THREE from './vendor/three.module.js';
import {firstHammerHit} from './combat.js';
import {VehicleExplosionBatch,EXPLOSION_DURATION} from './vehicle-explosion.js?v=20261108-colossus1';
export const MOUNT_SHOT_LIMIT=64;
const UP=new THREE.Vector3(0,1,0);
const SHOT_VERTICES=[[0,0,1],[0,0,-.4],[1,0,0],[0,1,0],[-1,0,0],[0,-1,0]];
const SHOT_FACES=[0,2,3,1,3,2,0,3,4,1,4,3,0,4,5,1,5,4,0,5,2,1,2,5];
/** Fixed projectile buffers work in both renderers, including a single shot.
 * Targeting is automatic; damage still comes only from a swept real projectile. */
export class MountWeapons{
 constructor(scene,{hit=()=>{},blast=()=>{}}={}){
  this.hit=hit;this.blast=blast;this.shots=Array.from({length:MOUNT_SHOT_LIMIT},()=>({active:false,position:new THREE.Vector3(),previous:new THREE.Vector3(),velocity:new THREE.Vector3(),distance:0}));
  this.time=0;this.cooldowns={};this.targets={};this.acquire=0;this.fired=0;this.contacts=0;
  this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(MOUNT_SHOT_LIMIT*72),3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(MOUNT_SHOT_LIMIT*72),3).setUsage(THREE.DynamicDrawUsage));this.geometry.setDrawRange(0,0);
  this.material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false});this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name='Mount projectiles';this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.userData.noCollision=true;scene.add(this.mesh);
  this.explosion=new VehicleExplosionBatch(scene,8);this.bursts=[];this.origin=new THREE.Vector3();this.goal=new THREE.Vector3();this.forward=new THREE.Vector3();this.side=new THREE.Vector3();this.point=new THREE.Vector3();this.rotation=new THREE.Quaternion();
  this.selfRay=new THREE.Raycaster();
 }
 reset(){for(const s of this.shots)s.active=false;this.targets={};this.cooldowns={};this.bursts=[];this.mesh.visible=false;this.geometry.setDrawRange(0,0);this.explosion.mesh.visible=false;this.explosion.geometry.setDrawRange(0,0);this.acquire=0;this.fired=0;this.contacts=0;}
 warm(){this.mesh.visible=true;this.geometry.setDrawRange(0,24);this.explosion.mesh.visible=true;this.explosion.geometry.setDrawRange(0,6);}
 aim(module,mount,target){
  module.root.getWorldPosition(this.origin);this.goal.set(target.x,(target.y||0)+Math.min((target.height||target.h||1.6)*.55,16),target.z);
  const dx=this.goal.x-this.origin.x,dy=this.goal.y-this.origin.y,dz=this.goal.z-this.origin.z;
  const yaw=Math.atan2(dx,dz)-mount.yaw;
  if(module.swivel)module.swivel.rotation.y=Math.atan2(Math.sin(yaw),Math.cos(yaw));
  if(module.elevation)module.elevation.rotation.x=-Math.atan2(dy,Math.hypot(dx,dz));
  module.muzzle.getWorldPosition(this.origin);return this.origin;
 }
 update(dt,mount,{enemies,world,camera,hero}){
  if(dt<=0)return;this.time+=dt;this.acquire-=dt;
  for(const key of Object.keys(this.cooldowns))this.cooldowns[key]=Math.max(0,this.cooldowns[key]-dt);
  if(mount.active){
   mount.model.updateWorldMatrix(true,true);
   for(const weapon of mount.stats.weapons){
    const module=mount.model.userData.modules[weapon.slot];if(!module?.muzzle)continue;
    let target=this.targets[weapon.slot];
    if(target?.dead||target&&Math.hypot(target.x-mount.body.x,target.z-mount.body.z)>weapon.range)target=null;
    if(this.acquire<=0){
     target=null;let best=Infinity;module.root.getWorldPosition(this.origin);
     for(const e of enemies){
      if(e.dead)continue;const dx=e.x-this.origin.x,dz=e.z-this.origin.z,dist=Math.hypot(dx,dz);
      if(dist>weapon.range||dist>=best)continue;
      const dot=(dx*Math.sin(mount.yaw)+dz*Math.cos(mount.yaw))/(dist||1);
      if(weapon.slot==='frontModule'&&dot<.65)continue;
      this.goal.set(e.x,(e.y||0)+Math.min((e.height||e.h||1.6)*.55,16),e.z);
      if(firstHammerHit(this.origin,this.goal,world.nearObjects(this.origin.x,this.origin.z,dist+1),.04))continue;
      target=e;best=dist;
     }
     this.targets[weapon.slot]=target;
    }
    if(!target)continue;
    this.aim(module,mount,target);
    if((this.cooldowns[weapon.slot]||0)>0||mount.energy<weapon.cost)continue;
    // The over-seat turret cannot fire through the rider or a raised hammer.
    if(hero){this.forward.copy(this.goal).sub(this.origin);this.selfRay.set(this.origin,this.forward.clone().normalize());this.selfRay.near=.035;this.selfRay.far=this.forward.length();if(this.selfRay.intersectObject(hero,true).length)continue;}
    const shot=this.shots.find(s=>!s.active);if(!shot)continue;
    const speed=weapon.id==='rockets'?20:weapon.id==='crossbow'?27:42;
    Object.assign(shot,{active:true,id:weapon.id,damage:weapon.damage,range:weapon.range,distance:0});shot.position.copy(this.origin);shot.previous.copy(this.origin);shot.velocity.copy(this.goal).sub(this.origin).normalize().multiplyScalar(speed);
    mount.energy-=weapon.cost;this.cooldowns[weapon.slot]=weapon.interval;this.fired++;
   }
   if(this.acquire<=0)this.acquire=.12;
  }
  for(const shot of this.shots){
   if(!shot.active)continue;shot.previous.copy(shot.position);shot.position.addScaledVector(shot.velocity,dt);shot.distance+=shot.velocity.length()*dt;
   const candidates=[...world.nearObjects(shot.position.x,shot.position.z,2),...enemies];
   const contact=firstHammerHit(shot.previous,shot.position,candidates,shot.id==='rockets'?.13:.055);
   if(contact){
    shot.active=false;this.contacts++;const dir={x:shot.velocity.x,z:shot.velocity.z},len=Math.hypot(dir.x,dir.z)||1;dir.x/=len;dir.z/=len;
    if(shot.id==='rockets'){
     const point=new THREE.Vector3(contact.x,contact.y,contact.z);if(this.bursts.length>=8)this.bursts.shift();this.bursts.push({s:{destroyed:true,deadTime:0,burstOrigin:point,visualScale:.38}});this.blast(point,shot.damage,1.8,contact.target);
    }else this.hit(contact.target,shot.damage,dir,{x:contact.x,y:contact.y,z:contact.z},shot.id);
   }else if(shot.distance>=shot.range)shot.active=false;
  }
  for(const b of this.bursts)b.s.deadTime+=dt;this.bursts=this.bursts.filter(b=>b.s.deadTime<EXPLOSION_DURATION);
  camera.getWorldQuaternion(this.rotation);this.explosion.update(this.bursts,this.rotation);this.draw();
 }
 draw(){
  const p=this.geometry.attributes.position,c=this.geometry.attributes.color;let count=0;
  // An elongated diamond with a pointed nose; rockets have a wider body.
  for(const shot of this.shots){if(!shot.active)continue;
   this.forward.copy(shot.velocity).normalize();this.side.crossVectors(this.forward,UP).normalize();if(this.side.lengthSq()<.1)this.side.set(1,0,0);
   const width=shot.id==='rockets'?.075:.025,length=shot.id==='crossbow'?.42:.26,tint=shot.id==='cannon'?[.3,.9,1]:shot.id==='rockets'?[1,.52,.15]:[1,.88,.45];
   for(const index of SHOT_FACES){const [x,y,z]=SHOT_VERTICES[index];p.setXYZ(count,shot.position.x+this.side.x*x*width+this.forward.x*z*length,shot.position.y+y*width+this.forward.y*z*length,shot.position.z+this.side.z*x*width+this.forward.z*z*length);c.setXYZ(count,...tint);count++;}
  }
  this.geometry.setDrawRange(0,count);this.mesh.visible=count>0;if(count){p.needsUpdate=true;c.needsUpdate=true;}
 }
 dispose(){this.reset();this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();this.explosion.dispose();}
}
