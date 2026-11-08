import * as THREE from './vendor/three.module.js';
import {configurationSignature} from './mount-rules.js?v=20261108-mount1';
const records=new WeakMap();
/** Upgrade plates stay on the existing articulated armour; base meshes, hand
 * anchors and weapon rig are not replaced or scaled to hide fit problems. */
export function applyPlayerCustomization(hero,garage){
 const u=hero.userData,key=u.equipmentTier+configurationSignature(garage,'player'),old=records.get(hero);
 if(old?.key===key)return;
 if(old){for(const mesh of old.meshes){mesh.removeFromParent();mesh.geometry.dispose();}for(const m of old.materials)m.dispose();}
 const meshes=[],materials=[],record={key,meshes,materials};records.set(hero,record);
 const plate=(parent,id,position,size,powered,rank)=>{
  const shape=new THREE.Shape(),w=size[0]/2,h=size[1]/2,b=Math.min(.04,w*.3,h*.3);
  for(const [i,[x,y]]of [[-w+b,-h],[w-b,-h],[w,-h+b],[w,h-b],[w-b,h],[-w+b,h],[-w,h-b],[-w,-h+b]].entries())i?shape.lineTo(x,y):shape.moveTo(x,y);
  shape.closePath();const geometry=new THREE.ExtrudeGeometry(shape,{depth:size[2]+rank*.004,bevelEnabled:false});
  const material=new THREE.MeshLambertMaterial({color:powered?0x73bac7:0xb7b7a0,emissive:powered?0x123039:0,flatShading:true});materials.push(material);
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Upgrade '+id;mesh.userData.slot=id;mesh.position.set(...position);mesh.castShadow=true;parent.add(mesh);meshes.push(mesh);
 };
 for(const [id,v]of Object.entries(garage.player)){
  const rank=v.owned[v.selected]||1;if(v.selected==='standard'&&rank===1)continue;
  const powered=v.selected==='powered';
  if(id==='head')plate(u.body,id,[0,1.68,.241],[.37,.10,.028],powered,rank);
  if(id==='chest')plate(u.body,id,[0,1.06,.283],[.43,.25,.025],powered,rank);
  if(id==='arms')for(const arm of [u.leftArm,u.rightArm])plate(arm.userData.fore,id,[0,0,.17],[.15,.26,.022],powered,rank);
  if(id==='legs')for(const leg of [u.leftLeg,u.rightLeg])plate(leg.userData.thigh,id,[0,-.15,.15],[.17,.20,.022],powered,rank);
  if(id==='boots')for(const leg of [u.leftLeg,u.rightLeg])plate(leg.userData.shin,id,[0,-.17,.31],[.19,.10,.020],powered,rank);
  if(id==='shield')plate(u.shield,id,[0,.05,.12],[.34,.38,.025],powered,rank);
  if(id==='hammer')plate(u.hammerHead,id,[0,0,.38],[.22,.30,.025],powered,rank);
 }
}
