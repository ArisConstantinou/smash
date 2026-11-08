import * as THREE from './vendor/three.module.js';
import {configurationSignature} from './mount-rules.js?v=20261108-workshop1';
import {equipmentBuilder,EQUIPMENT_PALETTE as P} from './equipment-shapes.js?v=20261108-workshop1';
const records=new WeakMap();
/** Real interchangeable geometry, batched separately at each moving joint. */
export function applyPlayerCustomization(hero,garage){
 const u=hero.userData,key=u.equipmentTier+configurationSignature(garage,'player'),old=records.get(hero);if(old?.key===key)return;
 if(old){for(const m of old.meshes){m.removeFromParent();m.geometry.dispose();}old.material.dispose();}
 const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true}),record={key,meshes:[],material};records.set(hero,record);
 function attach(parent,slot,build){const b=equipmentBuilder();build(b);const mesh=b.finish(material);mesh.name='Equipment '+slot;mesh.userData.slot=slot;mesh.userData.playerAttachment=true;mesh.castShadow=true;parent.add(mesh);record.meshes.push(mesh);}
 for(const [slot,entry]of Object.entries(garage.player)){
  const rank=entry.owned[entry.selected]||1;if(entry.selected==='standard'&&rank===1)continue;
  const powered=entry.selected==='powered',assault=entry.selected==='assault',edge=powered?P.cyan:P.gold,thick=1+(rank-1)*.035;
  if(slot==='head')attach(u.body,slot,b=>{
   b.plate(P.blue,0,1.79,-.10,.47,.33,.36);b.plate(P.steel,0,1.92,.02,.43,.10,.40,.10);for(const s of [-1,1]){b.plate(P.blue,s*.27,1.72,.02,.11,.28,.35,0,s*.17);b.cylinder(P.gold,s*.282,1.72,.01,.075,.04,0,Math.PI/2);}
   b.plate(P.dark,0,1.76,.265,.43,.12,.055);b.plate(edge,0,1.77,.298,.34,.035,.025);b.plate(P.gold,0,1.92,.055,.07,.15,.34);
   if(powered||assault){b.plate(P.steel,0,1.61,.285,.25,.15,.09);for(const x of [-.065,0,.065])b.box(P.dark,x,1.62,.338,.028,.07,.015);}
   if(assault){b.plate(P.gold,0,1.99,-.04,.22,.07,.30);b.plate(P.steel,0,1.68,-.29,.34,.23,.06);}
  });
  if(slot==='chest')attach(u.body,slot,b=>{
   b.plate(P.blue,0,1.07,.25,.51,.45,.12*thick);for(const s of [-1,1]){b.plate(P.steel,s*.20,1.12,.326,.16,.34,.06,0,s*.14,s*-.12);b.plate(edge,s*.16,1.29,.32,.20,.055,.05,0,0,s*-.18);b.plate(P.blue,s*.25,1.0,-.10,.08,.38,.40);}
   b.plate(P.gold,0,.88,.29,.42,.055,.08);b.plate(P.dark,0,1.08,.36,.18,.23,.05);
   if(powered){b.cylinder(P.gold,0,1.10,.405,.095,.045,Math.PI/2);b.cylinder(P.cyan,0,1.10,.435,.065,.025,Math.PI/2);for(const s of [-1,1])b.plate(P.blue,s*.18,1.08,-.27,.16,.32,.16);}
   if(assault){b.plate(P.steel,0,1.04,.40,.32,.28,.07);for(const x of [-.1,0,.1])b.plate(P.gold,x,1.05,.447,.027,.19,.02);}
  });
  if(slot==='arms')for(const arm of [u.leftArm,u.rightArm]){
   const side=arm.userData.side;attach(arm,slot,b=>{b.plate(P.blue,side*.035,.045,.02,.42,.29,.47,0,0,side*.12);b.plate(P.steel,side*.04,.17,.02,.34,.065,.37,0,0,side*.12);b.plate(edge,side*.045,.02,.272,.26,.06,.055);if(assault)b.plate(P.gold,side*.19,.05,.03,.08,.19,.38);});
   attach(arm.userData.fore,slot,b=>{b.plate(P.blue,0,0,.04,.30,.91,.30);b.plate(P.steel,0,-.22,.215,.23,.42,.07);for(const y of [-.36,-.12,.12])b.plate(edge,0,y,.261,.17,.055,.025);if(powered)b.cylinder(P.cyan,0,.24,.23,.065,.04,Math.PI/2);});
  }
  if(slot==='legs')for(const leg of [u.leftLeg,u.rightLeg])attach(leg.userData.thigh,slot,b=>{b.plate(P.blue,0,-.15,.12,.24,.29,.17*thick);b.plate(P.steel,0,-.12,.225,.19,.21,.045);b.plate(edge,0,-.04,.254,.14,.045,.025);if(powered||assault)for(const s of [-1,1])b.cylinder(edge,s*.13,-.15,.06,.026,.23);if(assault)b.plate(P.steel,0,-.27,.265,.29,.13,.09);});
  if(slot==='boots')for(const leg of [u.leftLeg,u.rightLeg])attach(leg.userData.shin,slot,b=>{b.plate(P.blue,0,-.14,.10,.25,.27,.27);b.plate(P.steel,0,-.23,.24,.28,.12,.42);b.plate(edge,0,-.15,.42,.23,.055,.055);for(const s of [-1,1])b.cylinder(P.gold,s*.14,-.12,.05,.065,.028,0,Math.PI/2);if(powered)b.plate(P.cyan,0,-.12,-.065,.13,.11,.035);if(assault)b.plate(P.blue,0,-.20,.43,.28,.16,.08);});
  if(slot==='shield')attach(u.shield,slot,b=>{b.plate(P.gold,0,.04,.15,.69,.81,.08);b.plate(P.blue,0,.04,.20,.58,.69,.07);b.plate(P.steel,0,.04,.25,.11,.55,.05);for(const s of [-1,1])for(const y of [-.21,.27])b.cylinder(edge,s*.21,y,.255,.035,.025,Math.PI/2);if(powered)b.cylinder(P.cyan,0,.04,.30,.10,.04,Math.PI/2);if(assault)b.plate(P.steel,0,-.30,.26,.45,.13,.07);});
  if(slot==='hammer'){
   const bounds=new THREE.Box3();u.hammerHead.updateWorldMatrix(true,true);const inverse=u.hammerHead.matrixWorld.clone().invert();u.hammerHead.traverse(m=>{if(!m.isMesh)return;m.geometry.computeBoundingBox();bounds.union(m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,m.matrixWorld)));});const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),vertical=size.y>size.x;
   attach(u.hammerHead,slot,b=>{for(const side of [-1,1]){const x=center.x+(vertical?0:side*size.x*.46),y=center.y+(vertical?side*size.y*.45:0);b.plate(P.steel,x,y,center.z,vertical?size.x*1.05:.10,vertical?.10:size.y*1.05,size.z*1.06);b.plate(edge,x,y,center.z+size.z*.54,vertical?size.x*.7:.07,vertical?.055:size.y*.72,.028);}b.plate(P.blue,center.x,center.y,center.z+size.z*.52,size.x*.36,size.y*.58,.07);b.plate(edge,center.x,center.y,center.z+size.z*.56,.07,size.y*.34,.035);if(powered){b.cylinder(P.gold,center.x,center.y,center.z+size.z*.60,.09,.06,Math.PI/2);b.cylinder(P.cyan,center.x,center.y,center.z+size.z*.65,.06,.04,Math.PI/2);for(const s of [-1,1])b.plate(P.steel,center.x+s*size.x*.22,center.y,center.z+size.z*.54,.06,size.y*.70,.06);}if(assault){b.plate(P.dark,center.x,center.y,center.z-size.z*.56,size.x*.7,size.y*.65,.12);for(const s of [-1,1])b.plate(P.gold,center.x+s*size.x*.22,center.y,center.z+size.z*.64,.10,size.y*.75,.10,0,0,s*.13);}});
  }
 }
 u.customizationMeshes=record.meshes;
 u.invalidateEquipmentBounds?.();
}
