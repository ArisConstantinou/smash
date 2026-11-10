import * as THREE from './vendor/three.module.js';

const target=new THREE.Vector3(),hip=new THREE.Vector3(),rotatedHip=new THREE.Vector3();
const ARCH_Z=.075;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
/** Rider and mount share a parent. Keep the pelvis on the authored saddle,
 * solve real leg joints to the pedal/peg, and let the existing arm IK steer. */
export function poseMountedRider(hero,mount,{kick=false}={}){
 const u=hero.userData,m=mount.userData;
 const {height,thighLength,shinLength}=u.legRest;
 const archY=-shinLength-.08,shin=Math.hypot(archY,ARCH_Z),beta=Math.atan2(ARCH_Z,-archY);
 target.set(0,m.riderOffset,m.riderZ).applyQuaternion(mount.quaternion).add(mount.position);
 // Preserve the mount's authored yaw representation. Quaternion -> XYZ Euler
 // decomposition past90 degrees introduces X/Z half-turns; later walking code
 // updates only Y, which mirrors aiming after dismounting.
 hero.position.copy(target);hero.rotation.copy(mount.rotation);
 u.body.rotation.x=clamp(u.body.rotation.x+.12,-.16,.34);u.body.rotation.y=clamp(u.body.rotation.y,-.48,.48);u.body.rotation.z=clamp(u.body.rotation.z,-.16,.16);
 hip.set(0,height+.12,0);rotatedHip.copy(hip).applyQuaternion(u.body.quaternion);u.body.position.copy(hip).sub(rotatedHip);
 hero.updateWorldMatrix(true,false);mount.updateWorldMatrix(true,true);
 for(const [side,leg,pedal]of [[-1,u.leftLeg,m.markers.leftPedal],[1,u.rightLeg,m.markers.rightPedal]]){
  leg.position.set(side*m.pedalSpread,height,0);
  if(kick&&side===1)continue;
  leg.rotation.set(0,0,0);
  pedal.getWorldPosition(target);target.y+=.025;hero.worldToLocal(target);target.sub(leg.position);
  const dy=target.y,dz=target.z,d=clamp(Math.hypot(dy,dz),.005,thighLength+shin-.000001);
  const bend=Math.acos(clamp((d*d-thighLength*thighLength-shin*shin)/(2*thighLength*shin),-1,1));
  const shoulder=Math.atan2(shin*Math.sin(bend),thighLength+shin*Math.cos(bend));
  leg.rotation.x=-(Math.atan2(dz,-dy)+shoulder);leg.userData.shin.rotation.x=beta+bend;
  // Pedals have their own spindle. Align the platform to the boot sole;
  // rotating the crank must not turn the rider's foot upside down.
  pedal.rotation.x=leg.rotation.x+leg.userData.shin.rotation.x-(m.kind==='bicycle'?m.crank.rotation.x:0);
  if(!leg.userData.pedalContact){const marker=new THREE.Object3D();marker.name='pedalContact';marker.position.set(0,archY,ARCH_Z);leg.userData.shin.add(marker);leg.userData.pedalContact=marker;}
 }
 u.setRidingAnchor?.(m.markers.leftGrip);
}
export function resetMountedRider(hero){
 target.set(0,0,1).applyQuaternion(hero.quaternion);hero.rotation.set(0,Math.atan2(target.x,target.z),0);
 const u=hero.userData;u.setRidingAnchor?.(null);u.body.position.set(0,0,0);u.body.rotation.set(0,0,0);
 for(const [side,leg]of [[-1,u.leftLeg],[1,u.rightLeg]]){leg.position.set(side*(u.legRest?.spread??.25),u.legRest?.height??.62,0);leg.rotation.set(0,leg.userData.restYaw||0,leg.userData.restRoll||0);leg.userData.shin.rotation.x=0;}
}
