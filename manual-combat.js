// Manual input and contact-earned momentum. No target is selected or steered
// here: indicators never alter input, weapon trajectories or hit volumes.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const STICK_DEADZONE=.12;
export const STICK_WALK_EDGE=.42;
export function sampleMoveStick(dx,dy,radius){
  if(![dx,dy,radius].every(Number.isFinite)||radius<=0)return {x:0,y:0,aimX:0,aimY:0,turnOnly:false};
  const length=Math.hypot(dx,dy),amount=clamp(length/radius,0,1);
  if(amount<=STICK_DEADZONE)return {x:0,y:0,aimX:0,aimY:0,turnOnly:false};
  const aimX=dx/length,aimY=dy/length,speed=clamp((amount-STICK_WALK_EDGE)/(1-STICK_WALK_EDGE),0,1);
  return {x:speed?aimX*speed:0,y:speed?aimY*speed:0,aimX,aimY,turnOnly:speed===0};
}
export const SPIN_TURN_SECONDS=.52;
export const SPIN_COAST_SECONDS=.86;
export const SPIN_DAMAGE_SCALE=.70;
export function spinSpeed(momentum){
  return momentum<=0?0:(.35+.65*Math.sqrt(clamp(momentum,0,1)))*Math.PI*2/SPIN_TURN_SECONDS;
}
export function advanceSpinMomentum(spin,dt){
  const before=spin.momentum;
  spin.momentum=clamp(before-Math.max(0,dt)/SPIN_COAST_SECONDS,0,1);
  // Midpoint integration gives the same rotation at different frame rates.
  return spinSpeed((before+spin.momentum)/2)*Math.max(0,dt);
}
export function eligibleSpinContact(spin,target){
  return !spin.entryHits.has(target)&&!spin.touching.has(target)&&
    spin.rotation-(spin.hitAngles.get(target)??-Infinity)>=Math.PI*2-1e-7;
}
export function renewSpinMomentum(spin,target){
  spin.touching.add(target);spin.momentum=1;spin.hitAngles.set(target,spin.rotation);spin.hitTimes.set(target,spin.time);
}
export function meleeAimSpec({range=2.3,unarmed=false,kicking=false,variant='',twoHanded=false}={}){
  // Only a visual reach envelope. Physical swept head/shaft/hand/foot contact
  // remains authoritative; a target can evade a stroke after this hint.
  const narrow=/overhead|rising|cleave|diagonal/.test(variant);
  return {range:kicking?1.7:unarmed?1.08:range,halfAngle:kicking?.34:unarmed?.28:narrow?.27:twoHanded?.95:.78};
}
export function inMeleeEnvelope(origin,direction,target,spec){
  if(!target||target.dead)return false;
  const dx=target.x-origin.x,dz=target.z-origin.z,d=Math.hypot(dx,dz),r=Math.max(0,target.radius||0);
  const bottom=target.y||0,top=bottom+(target.height||target.h||2);
  if(bottom>(origin.y||0)+1.9||top<(origin.y||0)+.25||d-r>spec.range||d<1e-7)return false;
  const angle=Math.acos(clamp((dx*direction.x+dz*direction.z)/d,-1,1));
  return angle<=spec.halfAngle+Math.asin(clamp(r/d,0,1));
}
