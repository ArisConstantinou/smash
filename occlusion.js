import {firstHammerHit} from './combat.js?v=20261107-forge9';
import {Raycaster,Vector3} from './vendor/three.module.js';

// Broad collision bounds include empty courtyards, pavements and roof aprons.
// They are a candidate test, never proof that opaque rendered geometry hides a
// body. One reusable raycaster keeps this narrow phase allocation-light.
const sightRay=new Raycaster(),sightOrigin=new Vector3(),sightDirection=new Vector3();
function visibleSurface(hit,root){
  for(let node=hit.object;node;node=node.parent){if(!node.visible)return false;if(node===root)break;}
  const source=hit.object.material;
  const material=Array.isArray(source)?source[hit.face?.materialIndex??0]:source;
  if(!material||material.visible===false)return false;
  const authored=material.userData?.occlusionBaseline;
  return (authored?.opacity??material.opacity??1)>.15;
}

// Orthographic rays are parallel. A perspective ray from camera.position to
// each actor would miss tall facades towards the sides of a portrait viewport.
export function occludesBattlePoint(object, point, towardsCamera, distance=140) {
  if (!object || object.dead || object.h<=1.7 || !point) return false;
  const base=object.baseY??object.y??0;
  if (Math.abs(point.x-object.x)<=object.w/2+.025 && Math.abs(point.z-object.z)<=object.d/2+.025 && point.y>=base-.025 && point.y<=base+object.h+.025) return false;
  const length=Math.hypot(towardsCamera.x,towardsCamera.y,towardsCamera.z);
  if (!Number.isFinite(length)||length<1e-6) return false;
  const origin={x:point.x+towardsCamera.x/length*distance,y:point.y+towardsCamera.y/length*distance,z:point.z+towardsCamera.z/length*distance};
  const hit=firstHammerHit(origin,point,[object],.025);
  if(!hit||hit.t>=.9995)return false;
  if(!object.mesh)return true; // Geometry-free callers use the conservative box.
  if(!object.mesh.visible)return false;
  object.mesh.updateWorldMatrix(true,true);
  sightOrigin.set(origin.x,origin.y,origin.z);
  sightDirection.set(point.x-origin.x,point.y-origin.y,point.z-origin.z).normalize();
  sightRay.set(sightOrigin,sightDirection);sightRay.near=0;sightRay.far=distance-.035;
  return sightRay.intersectObject(object.mesh,true).some(surface=>visibleSurface(surface,object.mesh));
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
  object.occlusionFade=previous+(target-previous)*(1-Math.exp(-Math.max(0,dt)*(obstructed?26:28)));
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
