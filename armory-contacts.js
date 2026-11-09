import * as THREE from './vendor/three.module.js';
const v=new THREE.Vector3(),origin=new THREE.Vector3(),scale=new THREE.Vector3(),start=new THREE.Vector3(),end=new THREE.Vector3(),motion=new THREE.Vector3(),inverse=new THREE.Matrix4();
const sphere=(x,y,z,r,key='head',damage=1,force=1)=>({x,y,z,r,key,damage,force});
/** Compound material volumes. In particular the ring never has a solid centre,
 * and the two piston bodies have separate contact identities. */
export function armoryHeadVolumes(id,{strike='plain',core='none'}={}){
 let list;if(id==='w01')list=[sphere(0,-.09,0,.16),sphere(0,.20,0,.29),sphere(-.045,.48,0,.23)];
 else if(id==='w02')list=[sphere(0,-.12,0,.17),sphere(0,.18,0,.25),sphere(0,.46,0,.27)];
 else if(id==='w03')list=[sphere(0,-.13,0,.255),sphere(0,.18,0,.255),sphere(0,.47,0,.255)];
 else if(id==='w04')list=[sphere(0,-.14,0,.16),sphere(0,.17,0,.245),sphere(0,.43,0,.30)];
 else if(id==='w08')list=[...[-.30,.30].flatMap((x,i)=>[-.30,.025,.30].map(y=>sphere(x,y,0,y===.025?.145:.19,'piston-'+i,.60,1))),sphere(0,.20,0,.14,'bridge',.35,.7)];
 else if(id==='w11')list=[sphere(-.55,0,0,.34,'spikes',1.18,.82),sphere(0,0,0,.31,'body',.78,.9),sphere(.40,0,0,.34,'flat',.90,1.24)];
 else if(id==='w12'){list=[];for(let i=0;i<12;i++){const a=i*Math.PI/6;for(const z of [-.08,.08])list.push(sphere(Math.cos(a)*.425,.25+Math.sin(a)*.425,z,.132,'rim'));}list.push(sphere(0,-.28,0,.15,'rim'));}
 else if(id==='w07')list=[sphere(-.35,0,0,.26),sphere(.04,0,0,.21),sphere(.35,0,0,.14),sphere(.55,0,0,.085)];
 else if(id==='w19')list=[sphere(-.48,0,0,.31),sphere(-.12,0,0,.28),sphere(.24,0,0,.225),sphere(.55,0,0,.25)];
 else if(id==='w20')list=[sphere(0,-.24,0,.17),sphere(0,.02,0,.19),sphere(0,.26,0,.19),sphere(0,.50,0,.19)];
 else{const r=id==='w09'?.33:id==='w10'?.38:id==='w06'?.26:.25,x=id==='w09'?.45:id==='w10'?.39:.32;list=[sphere(-x,0,0,r),sphere(0,0,0,r),sphere(x,0,0,r)];}
 if(strike!=='plain'&&id!=='w12')for(const s of list)s.r+=strike==='spiked'?.055:.025;
 if(core!=='none')list.push(sphere(0,id==='w12'||id==='w20'?-.27:Number(id.slice(1))<5?-.19:0,id==='w12'?.23:id==='w20'?.18:Number(id.slice(1))<5?.20:Number(id.slice(1))>=9?.36:.28,.10,id==='w08'?'bridge':'head',id==='w08'?.35:.75,id==='w08'?.7:.8));return list;
}
/** Cast through the existing real target geometry/WASM path. Shared temporary
 * vectors are consumed synchronously; only returned contacts own their data. */
export function sweepArmoryHead(volumes,matrix,from,to,objects,cast,{maxContacts=1,blueprintId=''}={}){
 origin.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);const largest=Math.max(scale.x,scale.y,scale.z),contacts=[];
 inverse.copy(matrix).invert();motion.set(to.x-from.x,to.y-from.y,to.z-from.z).transformDirection(inverse);const sideStrike=blueprintId==='w11'&&Math.abs(motion.x)<.55;
 for(const s of volumes){v.set(s.x,s.y,s.z).applyMatrix4(matrix).sub(origin);start.set(from.x,from.y,from.z).add(v);end.set(to.x,to.y,to.z).add(v);const hit=cast(start,end,objects,s.r*largest);if(hit)contacts.push({...hit,armoryPart:sideStrike?'body':s.key,damageScale:sideStrike?.78:s.damage,forceScale:sideStrike?.9:s.force});}
 contacts.sort((a,b)=>a.t-b.t);const unique=[];for(const c of contacts){if(maxContacts>1&&c.armoryPart==='bridge'&&contacts.some(x=>x.target===c.target&&x.armoryPart.startsWith('piston-')))continue;if(unique.some(x=>x.target===c.target&&x.armoryPart===c.armoryPart))continue;if(maxContacts===1){if(!unique.some(x=>x.target===c.target))unique.push(c);}else if(!unique.some(x=>x.target===c.target&&(x.armoryPart==='bridge'||c.armoryPart==='bridge'))&&unique.filter(x=>x.target===c.target).length<maxContacts)unique.push(c);}return unique;
}
