// Oversized equipment must pivot around reachable hands, not stretch the arms
// by raising the entire rig until a distant head clears the ground.
import * as THREE from './vendor/three.module.js';
const q=new THREE.Quaternion(),upright=new THREE.Quaternion(),turn=new THREE.Quaternion();
const up=new THREE.Vector3(0,1,0),axis=new THREE.Vector3(),wrist=new THREE.Vector3(),offset=new THREE.Vector3(),center=new THREE.Vector3(),delta=new THREE.Vector3();
const a=new THREE.Vector3(),b=new THREE.Vector3(),originalPosition=new THREE.Vector3();
const MAX_REACH=.88;
export function constrainLargeWeaponPose(u,twoHanded=false){
  const rig=u.weaponRig;if(!rig||!u.weaponHeld)return false;
  u.body.updateMatrix();
  const anchors=[u.rightGripAnchor],arms=[u.rightArm];
  if(twoHanded){anchors.push(u.leftGripAnchor);arms.push(u.leftArm);}
  const centerFor=(i,out)=>out.copy(arms[i].userData.restPosition).applyMatrix4(u.body.matrix)
    .sub(offset.copy(anchors[i].position).applyQuaternion(rig.quaternion));
  let unreachable=false;
  for(let i=0;i<anchors.length;i++)if(centerFor(i,center).distanceTo(rig.position)>.90){unreachable=true;break;}
  if(!unreachable)return false;
  const project=()=>{
    // Alternating projections into the two reachable wrist balls. The spare
    // 2 cm keeps float roundoff away from the full-extension singularity.
    for(let pass=0;pass<12;pass++)for(let i=0;i<anchors.length;i++){
      centerFor(i,center);delta.subVectors(rig.position,center);const length=delta.length();
      if(length>MAX_REACH)rig.position.copy(center).addScaledVector(delta,MAX_REACH/length);
    }
  };
  project();
  if(u.getHeadFloorY()<.04){
    q.copy(rig.quaternion);originalPosition.copy(rig.position);
    const gripCenter=twoHanded?.255:.43;
    wrist.set(0,gripCenter,0).applyQuaternion(q).add(rig.position);
    axis.copy(up).applyQuaternion(q);turn.setFromUnitVectors(axis,up);upright.copy(q).premultiply(turn);
    const pose=t=>{rig.quaternion.copy(q).slerp(upright,t);rig.position.copy(wrist).sub(offset.set(0,gripCenter,0).applyQuaternion(rig.quaternion));project();};
    pose(1);
    if(u.getHeadFloorY()>=.04){
      let low=0,high=1;
      for(let n=0;n<10;n++){const mid=(low+high)/2;pose(mid);if(u.getHeadFloorY()>=.04)high=mid;else low=mid;}
      pose(high);
    }
    // In an impossible, extreme size/reach combination anatomical wrists take
    // precedence over a fake metres-long forearm. No head/shaft scale changes.
  }
  return true;
}
