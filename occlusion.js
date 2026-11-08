import {firstHammerHit} from './combat.js?v=20261107-forge9';
import {Raycaster,Vector3,Mesh,InstancedMesh,MeshBasicMaterial} from './vendor/three.module.js';

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
  // This is only a broad-phase envelope. Calling object.geometryHit here
  // repeats an expensive swept-sphere/triangle query before the exact rendered
  // surface raycast below, for every body sample and every nearby building.
  const envelope={x:object.x,z:object.z,w:object.w,d:object.d,y:base,h:object.h};
  const hit=firstHammerHit(origin,point,[envelope],.025);
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

// Prime depth after ordinary transparent actors/effects have drawn, then blend
// only the nearest building shell. Without this pass every hidden floor slab
// accumulates through the transparent facade like another floating roof.
// Geometry, fracture indices, textures and collision stay owned by the source.
export class OcclusionDepth {
  constructor(scene){
    this.scene=scene;this.records=new Map();this.frame=0;this.activeCount=0;
    this.material=new MeshBasicMaterial({transparent:true,opacity:1,colorWrite:false,depthWrite:true,depthTest:true});
  }
  ensure(source){
    let record=this.records.get(source);if(record)return record;
    const proxy=source.isInstancedMesh?new InstancedMesh(source.geometry,this.material,source.count):new Mesh(source.geometry,this.material);
    proxy.name='Occluder nearest-surface depth';proxy.matrixAutoUpdate=false;proxy.renderOrder=100;proxy.visible=false;proxy.castShadow=false;proxy.receiveShadow=false;proxy.raycast=()=>{};
    this.scene.add(proxy);record={source,proxy,order:source.renderOrder,seen:0};this.records.set(source,record);return record;
  }
  sync(objects){
    const stamp=++this.frame;this.activeCount=0;
    for(const object of objects){
      if(object.dead||!(object.occlusionFade>.001)||!object.mesh?.visible)continue;
      object.mesh.traverse(source=>{
        if(!source.isMesh)return;
        let visible=true;for(let node=source;node;node=node.parent){if(!node.visible){visible=false;break;}}
        if(!visible)return;
        const record=this.ensure(source),proxy=record.proxy;record.seen=stamp;
        source.updateWorldMatrix(true,false);proxy.geometry=source.geometry;proxy.matrix.copy(source.matrixWorld);proxy.frustumCulled=source.frustumCulled;proxy.visible=true;
        if(source.isInstancedMesh){proxy.count=source.count;proxy.instanceMatrix=source.instanceMatrix;proxy.boundingSphere=source.boundingSphere;}
        source.renderOrder=101;this.activeCount++;
      });
    }
    for(const record of this.records.values())if(record.seen!==stamp){record.proxy.visible=false;record.source.renderOrder=record.order;}
  }
  warm(objects){
    const object=objects.find(o=>o.isBuilding&&o.mesh?.visible);let warmed=false;
    object?.mesh.traverse(source=>{if(!warmed&&source.isMesh){source.updateWorldMatrix(true,false);const {proxy}=this.ensure(source);proxy.matrix.copy(source.matrixWorld);proxy.visible=true;warmed=true;}});
  }
  reset(){for(const {source,proxy,order}of this.records.values()){source.renderOrder=order;proxy.removeFromParent();}this.records.clear();this.activeCount=0;}
  dispose(){this.reset();this.material.dispose();}
}
