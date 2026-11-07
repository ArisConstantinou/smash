// Gameplay contact for the visible, guarded wire section. This is a short
// impact impulse, never a constraint that attaches an enemy to the weapon.
import {firstHammerHit} from './combat.js?v=20261107-forge9';

export const BARBED_DAMAGE_SCALE = .55;
export const BARBED_PULL_FORCE = 3.6;
const validPoint = p => p && [p.x,p.y,p.z].every(Number.isFinite);
const mixPoint = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});

/** Sweep the actual exposed segment through one physics step. No radial AoE. */
export function sweptBarbedContact(previous, current, target, radius) {
  if (!validPoint(current?.start)||!validPoint(current?.end)||!target||target.dead||!(radius>0)) return null;
  const old = validPoint(previous?.start)&&validPoint(previous?.end)?previous:current;
  if(Number.isFinite(target.radius)){
    const padding=target.radius+radius;
    const minX=Math.min(old.start.x,old.end.x,current.start.x,current.end.x)-padding;
    const maxX=Math.max(old.start.x,old.end.x,current.start.x,current.end.x)+padding;
    const minZ=Math.min(old.start.z,old.end.z,current.start.z,current.end.z)-padding;
    const maxZ=Math.max(old.start.z,old.end.z,current.start.z,current.end.z)+padding;
    if(target.x<minX||target.x>maxX||target.z<minZ||target.z>maxZ)return null;
  }
  const travel = Math.max(Math.hypot(current.start.x-old.start.x,current.start.y-old.start.y,current.start.z-old.start.z),
    Math.hypot(current.end.x-old.end.x,current.end.y-old.end.y,current.end.z-old.end.z));
  // Physics runs at 120 Hz; adaptive intermediate poses also cover fast tips
  // on heavily upgraded shafts without broadening the physical wire collider.
  const spacing = Math.max(.035,Math.min(radius,Number.isFinite(target.radius)?target.radius:radius)*.65);
  const steps = Math.max(1,Math.min(64,Math.ceil(travel/spacing)));
  for (let n=0;n<=steps;n++) {
    const time=n/steps,start=mixPoint(old.start,current.start,time),end=mixPoint(old.end,current.end,time);
    const hit=firstHammerHit(start,end,[target],radius);
    if (!hit) continue;
    const before=mixPoint(old.start,old.end,hit.t),after=mixPoint(current.start,current.end,hit.t);
    return {...hit,sweepTime:time,segmentStart:start,segmentEnd:end,
      motion:{x:after.x-before.x,z:after.z-before.z}};
  }
  return null;
}

/** Inward tug plus the lateral direction of the contacting piece of wire. */
export function barbedPullDirection(player,target,motion={}) {
  let x=player.x-target.x,z=player.z-target.z,length=Math.hypot(x,z);
  if(length<1e-7){x=-(motion.x||0);z=-(motion.z||0);length=Math.hypot(x,z);}
  if(length<1e-7)return {x:0,z:1};
  x/=length;z/=length;
  const along=(motion.x||0)*x+(motion.z||0)*z;
  let tx=(motion.x||0)-along*x,tz=(motion.z||0)-along*z;
  const tangent=Math.hypot(tx,tz);
  if(tangent>1e-7){tx/=tangent;tz/=tangent;}else{tx=0;tz=0;}
  const dx=x+tx*.65,dz=z+tz*.65,size=Math.hypot(dx,dz);
  return {x:dx/size,z:dz/size};
}

/** Limit the damped impulse before the enemy overlaps the player's body. */
export function barbedPullLimit(player,target,direction,damping=8) {
  const dx=player.x-target.x,dz=player.z-target.z,distance=Math.hypot(dx,dz);
  const clearance=Math.max(0,distance-(player.radius||.44)-(target.radius||.4)-.08);
  const inward=distance>1e-7?(dx*direction.x+dz*direction.z)/distance:1;
  return clearance*damping/Math.max(.1,inward);
}
