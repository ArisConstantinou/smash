// Gameplay-scaled masses (an ordinary enemy is one unit), not kilograms.
// Momentum transfer is resolved along the contact normal; restitution never
// creates energy. Buildings stay static. Every kick can move a car; upgrades
// increase the impulse rather than unlock a barely visible displacement.
import {segmentBoxHit} from './combat.js?v=20261107-forge9';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const safe=(v,f=0)=>Number.isFinite(v)?v:f;
const MASSES=Object.freeze({zombie:1,crawler:.75,robot:1.65,brute:3.5,mutant:2.7,mech:5,titan:9,siegeMech:12,boss:24,car:14,policecar:16,ambulance:22});
const LEVEL_OFFSETS=Object.freeze({zombie:0,crawler:0,robot:1,brute:2,mutant:2,mech:3,titan:4,siegeMech:5,boss:7});
export const isVehicle = o => !!o && ['car','policecar','ambulance'].includes(o.type);
export function enemyLevel(type,wave=1){return Math.max(1,Math.floor(safe(wave,1)))+(LEVEL_OFFSETS[type]||0);}
export function bodyMass(body){
  if(body?.isBuilding || body?.type==='wall' || body?.mass===Infinity)return Infinity;
  if(Number.isFinite(body?.mass)&&body.mass>0)return body.mass;
  const base=MASSES[body?.type]||1;
  return base*(isVehicle(body)?1:1+.025*Math.max(0,safe(body?.level,1)-1));
}
export function enemyHealthColor(level=1){
  return level>=15?'#d7a0ff':level>=11?'#ff7779':level>=7?'#ffa75b':level>=4?'#f3d36b':'#8de2ad';
}
export function kickStats(characterLevel=1,upgrades=0){
  const rank=clamp(Math.floor(safe(upgrades)),0,30),growth=1+.025*(Math.max(1,safe(characterLevel,1))-1);
  return {rank:rank+1,damage:Math.round((14+rank*7)*growth),impulse:Math.min(24,8+rank*2.4),
    range:1.30,radius:.23,duration:.38,cooldown:Math.max(.44,.65-rank*.025),
    canMoveCars:true,carSpeed:Math.min(18,7.5+rank*1.25)};
}
export function kickVelocity(target,stats){
  const mass=bodyMass(target);
  if(!Number.isFinite(mass))return 0;
  if(isVehicle(target))return stats.canMoveCars?stats.carSpeed*14/mass:0;
  return Math.min(11,stats.impulse/mass);
}
/** Mutates velocity, not position. n points from A towards B. */
export function transferMomentum(a,b,normal,restitution=.12){
  const len=Math.hypot(normal?.x||0,normal?.z||0);
  if(!len)return {impulse:0,closing:0,energy:0};
  const nx=normal.x/len,nz=normal.z/len,ma=bodyMass(a),mb=bodyMass(b);
  const ia=Number.isFinite(ma)?1/ma:0,ib=Number.isFinite(mb)?1/mb:0;
  const closing=(safe(a.vx)-safe(b.vx))*nx+(safe(a.vz)-safe(b.vz))*nz;
  if(closing<=0||ia+ib===0)return {impulse:0,closing:Math.max(0,closing),energy:0};
  const bounce=clamp(safe(restitution),0,1),impulse=(1+bounce)*closing/(ia+ib);
  if(ia){a.vx=safe(a.vx)-impulse*ia*nx;a.vz=safe(a.vz)-impulse*ia*nz;}
  if(ib){b.vx=safe(b.vx)+impulse*ib*nx;b.vz=safe(b.vz)+impulse*ib*nz;}
  return {impulse,closing,energy:.5/(ia+ib)*closing*closing*(1-bounce*bounce)};
}
export function wallSlamResponse(enemy,speed,attackerLevel=1){
  const resistance=Math.sqrt(bodyMass(enemy))*(1+.08*Math.max(0,safe(enemy.level,1)-attackerLevel));
  const weak=clamp(1+.08*(attackerLevel-safe(enemy.level,1)),.30,1.6),v=clamp(safe(speed),0,16);
  return {damage:Math.round(v*v*.65*weak),stun:v<1?0:clamp(v*.14/resistance,.10,1.25)};
}
/** Swept, axis-aligned car collider. Enemy circles are swept backwards into
 * the car's rectangle; scenery is expanded by the moving car's half-extents.
 * This tests the entire travel interval, not just the final position.
 */
export function firstVehicleContact(car,dx,dz,targets){
  let best=null;
  for(const t of targets){
    if(t===car||t.dead||safe(t.y)>car.h+.1)continue;
    let at;
    if(Number.isFinite(t.w)&&Number.isFinite(t.d))at=segmentBoxHit(car.x,car.z,car.x+dx,car.z+dz,{x:t.x,z:t.z,w:car.w+t.w,d:car.d+t.d});
    else if(Number.isFinite(t.radius))at=segmentBoxHit(t.x,t.z,t.x-dx,t.z-dz,car,t.radius);
    else continue;
    if(at===null||best&&at>=best.t)continue;
    const cx=car.x+dx*at,cz=car.z+dz*at;
    let nx,nz;
    if(Number.isFinite(t.radius)){
      nx=t.x-clamp(t.x,cx-car.w/2,cx+car.w/2);nz=t.z-clamp(t.z,cz-car.d/2,cz+car.d/2);
    }else{
      const gx=Math.abs(t.x-cx)-(t.w+car.w)/2,gz=Math.abs(t.z-cz)-(t.d+car.d)/2;
      if(gx>gz){nx=Math.sign(t.x-cx);nz=0;}else{nx=0;nz=Math.sign(t.z-cz);}
    }
    let length=Math.hypot(nx,nz);
    if(length<1e-7){nx=dx;nz=dz;length=Math.hypot(nx,nz)||1;}
    nx/=length;nz/=length;
    // Ignore separating/tangential touches, including an already touching
    // enemy knocked away faster than the car. No repeated zero-time impacts.
    if(dx*nx+dz*nz<=1e-9)continue;
    if(at<1e-6&&Number.isFinite(t.radius)&&Number.isFinite(car.vx)&&
       (car.vx-safe(t.vx))*nx+(car.vz-safe(t.vz))*nz<=1e-7)continue;
    best={target:t,t:at,x:cx,z:cz,normal:{x:nx,z:nz}};
  }
  return best;
}
export function sampleKickMotion(progress){
  const p=clamp(safe(progress),0,1),smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  const load=smooth(p/.28),extend=smooth((p-.22)/.22),recover=smooth((p-.52)/.48);
  return {hip:(-.78*load-.69*extend)*(1-recover),knee:1.20*load*(1-extend)*(1-recover),
    bodyPitch:-.18*load*(1-recover),bodyYaw:-.12*extend*(1-recover),
    weight:.045*load*(1-recover),extension:extend*(1-recover),active:p>=.28&&p<=.52};
}
