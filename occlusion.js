import {firstHammerHit} from './combat.js';

// Orthographic rays are parallel. A perspective ray from camera.position to
// each actor would miss tall facades towards the sides of a portrait viewport.
export function occludesBattlePoint(object, point, towardsCamera, distance=140) {
  if (!object || object.dead || object.h<=1.7 || !point) return false;
  const length=Math.hypot(towardsCamera.x,towardsCamera.y,towardsCamera.z);
  if (!Number.isFinite(length)||length<1e-6) return false;
  const origin={x:point.x+towardsCamera.x/length*distance,y:point.y+towardsCamera.y/length*distance,z:point.z+towardsCamera.z/length*distance};
  const hit=firstHammerHit(origin,point,[object],.12);
  return !!hit&&hit.t<.9995;
}

export function findBattleOccluders(objects, points, towardsCamera) {
  const blocked=new Set();
  for(const object of objects) {
    if(object.dead||object.h<=1.7||object.renderActive===false)continue;
    if(points.some(point=>occludesBattlePoint(object,point,towardsCamera)))blocked.add(object);
  }
  return blocked;
}

// Preserve authored glass opacity/depth settings and never touch shared
// prototype materials. Gameplay supplies each object's instance-owned clones.
export function applyOccluderFade(object, obstructed, dt) {
  const target=obstructed?1:0,previous=object.occlusionFade||0;
  object.occlusionFade=previous+(target-previous)*(1-Math.exp(-Math.max(0,dt)*(obstructed?22:9)));
  if(Math.abs(object.occlusionFade-target)<.001)object.occlusionFade=target;
  for(const material of object.materials||[]) {
    const baseline=material.userData.occlusionBaseline||(material.userData.occlusionBaseline={opacity:material.opacity,transparent:material.transparent,depthWrite:material.depthWrite});
    const active=object.occlusionFade>.001;
    const transparent=active||baseline.transparent;
    if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
    material.opacity=baseline.opacity*(1-object.occlusionFade*.94);
    material.depthWrite=active?false:baseline.depthWrite;
  }
}
