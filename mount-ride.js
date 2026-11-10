import * as THREE from './vendor/three.module.js';
import {createMountModel} from './mount-models.js?v=20261108-workshop1';
import {poseMountedRider,resetMountedRider} from './mount-rider.js?v=20261110-tall-rider';
import {mountStats,resolveMount,configurationSignature} from './mount-rules.js?v=20261108-workshop1';
import {firstHammerHit} from './combat.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
/** One live vehicle. The same capsule is used for travel, vertical flight,
 * mounting clearance and landing; an upgrade never bypasses city geometry. */
export class MountRide{
 constructor(scene,{notice=()=>{},onBreak=()=>{}}={}){
  this.scene=scene;this.notice=notice;this.onBreak=onBreak;this.active=false;
  this.condition={};this.body={x:0,y:0,z:0,radius:1.05};this.speed=0;this.yaw=0;
  this.contactTimes=new WeakMap();this.clock=0;this.landing=false;this.vertical=0;this.airborne=false;this.jumpCooldown=0;
 }
 sync(garage,level){
  const kind=resolveMount(garage,level),signature=kind+configurationSignature(garage,kind);
  if(this.signature===signature)return false;
  const previous=this.stats;this.storeCondition();this.model?.userData.dispose();
  this.kind=kind;this.signature=signature;this.stats=mountStats(garage,kind);
  this.model=createMountModel(kind,garage);this.model.visible=this.active;this.scene.add(this.model);
  const bounds=new THREE.Box3().setFromObject(this.model),radius=Math.max(.47,bounds.max.x,-bounds.min.x);
  this.collision={radius,height:Math.max(2.65,bounds.max.y),offsets:[0,Math.max(0,bounds.max.z-radius),-Math.max(0,-bounds.min.z-radius)]};
  if(this.active){this.model.position.set(this.body.x,this.body.y,this.body.z);this.model.rotation.y=this.yaw;}
  const stored=this.condition[kind];
  this.hp=stored?clamp(stored.hp+Math.max(0,this.stats.hp-stored.maxHp),0,this.stats.hp):this.stats.hp;
  this.energy=stored?Math.min(stored.energy,this.stats.energy):this.stats.energy;
  if(previous&&!this.stats.hover)this.vertical=0;
  return true;
 }
 storeCondition(){if(this.stats)this.condition[this.kind]={hp:this.hp,maxHp:this.stats.hp,energy:this.energy};}
 reset(hero){if(this.active)resetMountedRider(hero);this.active=false;this.model?.userData.dispose();this.model=null;this.signature='';this.stats=null;this.kind=null;this.hp=0;this.energy=0;this.condition={};Object.assign(this.body,{x:0,y:0,z:0});this.speed=0;this.vertical=0;this.landing=false;this.airborne=false;this.jumpCooldown=0;this.contactTimes=new WeakMap();}
 toggle(player,hero,world){
  if(this.active){
   if(this.body.y>.15||this.airborne){this.landing=true;this.notice('ΠΡΟΣΓΕΙΩΣΗ','Κράτα χώρο κάτω από το όχημα για αποβίβαση.');return false;}
   this.dismount(player,hero);return true;
  }
  if(!this.model||this.hp<=0){this.notice('ΧΡΕΙΑΖΕΤΑΙ ΕΠΙΣΚΕΥΗ','Άνοιξε το εργαστήριο οχήματος.');return false;}
  if(player.y>.15||!this.clear(world,player.x,player.z,player.y,hero.rotation.y)){
   this.notice('ΔΕΝ ΥΠΑΡΧΕΙ ΧΩΡΟΣ','Μετακινήσου σε ανοικτό έδαφος.');return false;
  }
  Object.assign(this.body,{x:player.x,y:player.y,z:player.z});this.yaw=hero.rotation.y;this.active=true;this.model.visible=true;this.speed=0;this.vertical=0;this.landing=false;
  this.place(player);return true;
 }
 dismount(player,hero){
  this.active=false;this.landing=false;this.speed=0;this.vertical=0;this.model.visible=false;
  player.y=this.body.y;player.vy=0;resetMountedRider(hero);this.storeCondition();
 }
 jump(world){
  if(!this.active||this.kind!=='bicycle'||this.landing||this.airborne||this.jumpCooldown>0)return false;
  const ground=world.supportHeight(this.body.x,this.body.z,this.collision.radius,this.body.y+.12);
  if(Math.abs(this.body.y-ground)>.12)return false;
  this.vertical=8;this.airborne=true;this.jumpCooldown=1;return true;
 }
 repair(materials,{test=false}={}){
  const missing=this.stats.hp-this.hp;if(missing<.01)return {ok:false,reason:'Το όχημα είναι πλήρως επισκευασμένο.'};
  const scrap=this.repairCost;if(!test&&(materials.scrap||0)<scrap)return {ok:false,reason:`Χρειάζονται ${scrap} μέταλλα.`};
  if(!test)materials.scrap-=scrap;this.hp=this.stats.hp;this.storeCondition();return {ok:true,scrap};
 }
 absorb(damage,player,hero){
  if(!this.active)return damage;
  const guarded=damage*(1-this.stats.defence),vehicleDamage=guarded*this.stats.riderProtection;
  this.hp=Math.max(0,this.hp-vehicleDamage);this.storeCondition();
  if(this.hp===0){this.dismount(player,hero);this.onBreak();}
  return Math.max(0,guarded-vehicleDamage);
 }
 place(player){
  this.model.position.set(this.body.x,this.body.y,this.body.z);this.model.rotation.y=this.yaw;
  player.x=this.body.x;player.z=this.body.z;player.y=this.body.y+this.model.userData.riderOffset;
 }
 clear(world,x,z,y,yaw){return this.collision.offsets.every(offset=>world.clearBody(x+Math.sin(yaw)*offset,z+Math.cos(yaw)*offset,y,this.collision.radius,this.collision.height));}
 move(world,dx,dz,dy){
  const start={x:this.body.x,y:this.body.y,z:this.body.z},next={x:start.x+dx,y:start.y+dy,z:start.z+dz},s=Math.sin(this.yaw),c=Math.cos(this.yaw),shape=this.collision;
  let grounded=false,ceilingHit=false;
  for(const offset of shape.offsets){
   const probe={x:start.x+s*offset,y:start.y,z:start.z+c*offset,radius:shape.radius};
   const result=world.moveBody(probe,dx,dz,{dy,radius:shape.radius,height:shape.height,grounded:!this.stats.hover||start.y<.003,stepHeight:.12});
   const x=probe.x-s*offset,z=probe.z-c*offset;
   next.x=dx>0?Math.min(next.x,x):dx<0?Math.max(next.x,x):Math.abs(x-start.x)>Math.abs(next.x-start.x)?x:next.x;
   next.z=dz>0?Math.min(next.z,z):dz<0?Math.max(next.z,z):Math.abs(z-start.z)>Math.abs(next.z-start.z)?z:next.z;
   next.y=dy>0?Math.min(next.y,probe.y):Math.max(next.y,probe.y);
   grounded||=result.grounded;ceilingHit||=result.ceilingHit;
  }
  if(!this.clear(world,next.x,next.z,next.y,this.yaw)&&this.clear(world,start.x,start.z,start.y,this.yaw)){next.x=start.x;next.z=start.z;next.y=start.y;}
  Object.assign(this.body,next);return {grounded,ceilingHit};
 }
 update(dt,{player,hero,world,move,strength,up=false,down=false,boost=false}){
  if(!this.active)return;
  this.jumpCooldown=Math.max(0,this.jumpCooldown-dt);
  this.clock+=dt;const s=this.stats;
  this.energy=Math.min(s.energy,this.energy+s.regen*dt);
  const boosting=boost&&this.energy>18*dt&&strength>.01;
  if(boosting)this.energy=Math.max(0,this.energy-18*dt);
  let retreat=false;
  if(strength>.001){const target=Math.atan2(move.x,move.z),yaw=this.yaw+angleDelta(this.yaw,target)*(1-Math.exp(-s.handling*s.grip*dt));if(this.clear(world,this.body.x,this.body.z,this.body.y,yaw))this.yaw=yaw;
   else retreat=move.x*Math.sin(this.yaw)+move.z*Math.cos(this.yaw)<-.15;
  }
  // A long chassis cannot turn around in a narrow street. Back along its
  // current footprint until there is room, rather than driving into the wall.
  const desired=(retreat?-Math.min(3,s.speed):s.speed*(boosting?1.35:1))*strength*(this.landing?.45:1);
  this.speed+=(desired-this.speed)*(1-Math.exp(-s.acceleration*s.grip*dt));
  let dy;
  if(s.hover){
   const target=this.landing?-5:up?5.5:down?-5.5:0;
   this.vertical+=(target-this.vertical)*(1-Math.exp(-8*dt));
   dy=this.vertical*dt;
   if(this.body.y+dy>42){dy=42-this.body.y;this.vertical=0;}
  }else{this.vertical-=20*dt;dy=this.vertical*dt;}
  const x=this.body.x,z=this.body.z;
  const actual=this.move(world,Math.sin(this.yaw)*this.speed*dt+(player.vx||0)*dt/s.mass,Math.cos(this.yaw)*this.speed*dt+(player.vz||0)*dt/s.mass,dy);
  player.vx=(player.vx||0)*Math.exp(-9*dt);player.vz=(player.vz||0)*Math.exp(-9*dt);
  if(actual.ceilingHit||actual.grounded)this.vertical=0;
  if(!s.hover)this.airborne=!actual.grounded;
  const distance=Math.hypot(this.body.x-x,this.body.z-z);
  if(Math.abs(this.speed)>1&&distance<dt*.1)this.speed*=Math.exp(-8*dt);
  const steering=strength>.001?clamp(angleDelta(this.yaw,Math.atan2(move.x,move.z)),-.38,.38):0;
  this.model.userData.animate(distance*Math.sign(this.speed||1),steering);this.place(player);player.walk+=distance*6;
  if(this.landing&&actual.grounded&&Math.abs(world.supportHeight(this.body.x,this.body.z,.44,this.body.y+.1)-this.body.y)<.15)this.dismount(player,hero);
 }
 pose(hero,{kick=false}={}){if(this.active)poseMountedRider(hero,this.model,{kick});}
 contacts(targets,hit,world){
  if(!this.active||Math.abs(this.speed)<2.4)return;
  const s=this.stats,m=this.model.userData,damage=s.frontContact+s.contact;
  if(!damage)return;
  const forward={x:Math.sin(this.yaw),z:Math.cos(this.yaw)};
  for(const target of targets){
   if(target.dead||(this.contactTimes.get(target)||0)>this.clock)continue;
   const dx=target.x-this.body.x,dz=target.z-this.body.z,along=dx*forward.x+dz*forward.z,across=dx*forward.z-dz*forward.x;
   const radius=target.radius??Math.min(target.w||.6,target.d||.6)*.5;
   if(Math.abs(across)>.43+radius||Math.abs(along)>m.axle+m.radius+radius)continue;
   const top=(target.y||0)+(target.height||target.h||1.6);
   // Wheels must physically reach the body. Hover has no damaging tyres.
   const wheelHit=!s.hover&&s.contact>0&&this.body.y<=top&&this.body.y+m.radius*2>=(target.y||0);
   const ramHit=this.speed>0&&s.frontContact>0&&along>0&&Math.abs((target.y||0)+.6-(this.body.y+1))<1.2;
   if(!wheelHit&&!ramHit)continue;
   const from={x:this.body.x,y:this.body.y+.6,z:this.body.z},to={x:target.x,y:(target.y||0)+.6,z:target.z};
   if(world&&firstHammerHit(from,to,world.nearObjects(this.body.x,this.body.z,3),.04))continue;
   this.contactTimes.set(target,this.clock+.65);
   const travel={x:forward.x*Math.sign(this.speed),z:forward.z*Math.sign(this.speed)};
   hit(target,Math.round((wheelHit?s.contact:0)+(ramHit?s.frontContact:0))*Math.min(1.8,Math.abs(this.speed)/5),travel,Math.abs(this.speed)*.5);
  }
 }
 get repairCost(){return this.stats&&this.stats.hp-this.hp>=.01?Math.max(1,Math.ceil((this.stats.hp-this.hp)/28)):0;}
 snapshot(){return this.stats?{active:this.active,kind:this.kind,hover:this.stats.hover,hp:Math.ceil(this.hp),maxHp:this.stats.hp,repairCost:this.repairCost,energy:Math.round(this.energy),maxEnergy:this.stats.energy,speed:+this.speed.toFixed(2),altitude:+this.body.y.toFixed(2),landing:this.landing,airborne:this.airborne,jumpCooldown:this.jumpCooldown}:null;}
}
