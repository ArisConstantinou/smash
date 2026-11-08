// Two instanced draws for damaged vehicles, plus one shared explosion draw.
// Fixed buffers, no point lights,
// no shadows, no additional physics bodies. Inactive/distant sources cost no GPU work.
import * as THREE from './vendor/three.module.js';
import {isVehicle} from './kick-physics.js?v=20261107-perf14';
import {VehicleExplosionBatch} from './vehicle-explosion.js?v=20261108-colossus1';
export {preloadVehicleExplosion} from './vehicle-explosion.js?v=20261108-colossus1';
export const VEHICLE_SMOKE_HP=.55,VEHICLE_FIRE_HP=.28,VEHICLE_EFFECT_LIMIT=16;
export const VEHICLE_FUSE_SECONDS=1.2,VEHICLE_BLAST_RADIUS=4.2;
export function vehicleDamageStage(car){
 if(!isVehicle(car)||!Number.isFinite(car.maxHp)||car.maxHp<=0)return 0;
 return car.hp/car.maxHp<=VEHICLE_FIRE_HP?2:car.hp/car.maxHp<=VEHICLE_SMOKE_HP?1:0;
}
function plumeTexture(flame,document){
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=128;
 const c=canvas.getContext('2d');const gradient=c.createRadialGradient(32,flame?87:64,2,32,flame?80:64,flame?42:34);
 if(flame){gradient.addColorStop(0,'rgba(255,255,205,1)');gradient.addColorStop(.24,'rgba(255,209,48,.95)');gradient.addColorStop(.6,'rgba(255,72,9,.62)');gradient.addColorStop(1,'rgba(180,10,0,0)');}
 else{gradient.addColorStop(0,'rgba(94,91,86,.68)');gradient.addColorStop(.6,'rgba(67,65,61,.42)');gradient.addColorStop(1,'rgba(40,38,36,0)');}
 c.fillStyle=gradient;c.save();c.translate(32,64);c.scale(flame?.58:.95,flame?1.42:1.7);c.translate(-32,-64);c.fillRect(0,0,64,128);c.restore();
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export class VehicleEffects{
 constructor(scene,document=globalThis.document,{onExplode=()=>{},onBlink=()=>{}}={}){
  this.scene=scene;this.sources=new Map();this.time=0;this.disposed=false;
  this.onExplode=onExplode;this.onBlink=onBlink;
  this.explosion=new VehicleExplosionBatch(scene,VEHICLE_EFFECT_LIMIT);
  this.geometry=new THREE.PlaneGeometry(1,1);this.smokeTexture=plumeTexture(false,document);this.fireTexture=plumeTexture(true,document);
  this.smokeMaterial=new THREE.MeshBasicMaterial({map:this.smokeTexture,transparent:true,depthWrite:false,opacity:.7,side:THREE.DoubleSide,toneMapped:false});
  this.fireMaterial=new THREE.MeshBasicMaterial({map:this.fireTexture,transparent:true,depthWrite:false,opacity:.92,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
  this.smoke=new THREE.InstancedMesh(this.geometry,this.smokeMaterial,VEHICLE_EFFECT_LIMIT*8);
  this.fire=new THREE.InstancedMesh(this.geometry,this.fireMaterial,VEHICLE_EFFECT_LIMIT*6);
  this.smoke.name='vehicle-damage-smoke';this.fire.name='vehicle-damage-fire';
  for(const mesh of [this.smoke,this.fire]){mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.userData.noCollision=true;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}
  this.position=new THREE.Vector3();this.scale=new THREE.Vector3();this.rotation=new THREE.Quaternion();this.matrix=new THREE.Matrix4();this.origin=new THREE.Vector3();
 }
 damage(car){
  if(this.disposed||car.explosionComplete)return;
  const stage=vehicleDamageStage(car);if(!stage)return;
  let source=this.sources.get(car);
  if(!source){source={car,stage,deadTime:0,seed:((car.seed||car.x*13+car.z*7)||1)*.37};this.sources.set(car,source);}
  source.stage=Math.max(source.stage,stage);
 }
 arm(car){
  this.damage(car);const s=this.sources.get(car);if(!s||s.armed||s.destroyed)return false;
  s.armed=true;s.fuse=VEHICLE_FUSE_SECONDS;return true;
 }
 burst(s){
  if(s.destroyed)return;
  s.armed=false;s.destroyed=true;s.deadTime=0;
  s.car.mesh.updateWorldMatrix(true,false);
  s.burstOrigin=s.car.mesh.getWorldPosition(new THREE.Vector3());s.burstOrigin.y+=Math.min(s.car.h*.55,1.1);
 }
 update(dt,player,camera){
  if(this.disposed||dt<=0)return;this.time+=dt;
  if(camera?.getWorldQuaternion)camera.getWorldQuaternion(this.rotation);
  let smokeCount=0,fireCount=0;
  // Nearest sources win the bounded visual budget, never the oldest offscreen car.
  const active=[],detonating=[];
  for(const [car,s]of this.sources){
   if(s.armed){
    s.fuse-=dt;this.onBlink(car,Math.sin((VEHICLE_FUSE_SECONDS-s.fuse)*Math.PI*12)>0?.95:0);
    if(s.fuse<=0){this.burst(s);detonating.push(car);}
   }else if(car.dead&&!s.destroyed)this.burst(s);
   if(s.destroyed){s.deadTime+=dt;if(s.deadTime>2.2){this.sources.delete(car);continue;}}
   const d2=(car.x-player.x)**2+(car.z-player.z)**2;
   if(d2<55**2)active.push({s,d2});
  }
  // A chain reaction starts its own fuse next tick, regardless of the size of
  // this update. Newly inserted sources must not consume the elapsed step twice.
  for(const car of detonating)this.onExplode(car);
  active.sort((a,b)=>a.d2-b.d2);
  for(let k=0;k<Math.min(active.length,VEHICLE_EFFECT_LIMIT);k++){
   const s=active[k].s,car=s.car,fade=s.destroyed?Math.max(0,1-s.deadTime/2.2):1;
   // The source follows the moved mesh, including its actual hood orientation.
   car.mesh.updateMatrixWorld(true);
   if(s.destroyed)this.origin.copy(s.burstOrigin);
   else{this.origin.set(0,Math.min(car.h*.68,1.15),-car.d*.22);car.mesh.localToWorld(this.origin);}
   for(let i=0;i<8;i++){
    const t=s.destroyed?Math.min(.99,s.deadTime/2.2+i*.035):((this.time*.28+i/8+s.seed)%1+1)%1,spread=.25+t*.85;
    this.position.set(this.origin.x+Math.sin(i*2.4+s.seed)*spread+t*.5,this.origin.y+t*3.5,this.origin.z+Math.cos(i*3.1)*spread);
    const size=(.8+t*1.7)*Math.sin(Math.PI*t)*fade;
    this.scale.set(size,size*1.3,size);this.matrix.compose(this.position,this.rotation,this.scale);this.smoke.setMatrixAt(smokeCount++,this.matrix);
   }
   if(s.stage===2&&!s.destroyed)for(let i=0;i<6;i++){
    const pulse=.72+.28*Math.sin(this.time*13+i*2.7),height=(.8+i%3*.35)*pulse*fade;
    this.position.copy(this.origin);
    this.position.x+=Math.sin(i*2.2)*.3;this.position.z+=Math.cos(i*2.2)*.3;this.position.y+=height*.35;
    this.scale.set(.45+height*.22,height*1.8,1);
    this.matrix.compose(this.position,this.rotation,this.scale);this.fire.setMatrixAt(fireCount++,this.matrix);
   }
  }
  this.smoke.count=smokeCount;this.fire.count=fireCount;
  this.explosion.update(active,this.rotation);
  this.smoke.visible=smokeCount>0;this.fire.visible=fireCount>0;
  if(smokeCount)this.smoke.instanceMatrix.needsUpdate=true;if(fireCount)this.fire.instanceMatrix.needsUpdate=true;
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;this.sources.clear();
  this.smoke.removeFromParent();this.fire.removeFromParent();this.smoke.dispose();this.fire.dispose();
  this.explosion.dispose();
  this.geometry.dispose();this.smokeMaterial.dispose();this.fireMaterial.dispose();this.smokeTexture.dispose();this.fireTexture.dispose();
 }
}
