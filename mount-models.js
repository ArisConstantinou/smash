import * as THREE from './vendor/three.module.js';
import {createGarage} from './mount-rules.js?v=20261108-workshop1';

const BOX=new THREE.BoxGeometry(1,1,1),CYLINDER=new THREE.CylinderGeometry(1,1,1,10),CONE=new THREE.ConeGeometry(1,1,4);
const RAW=new THREE.MeshBasicMaterial();
const P={blue:0x315f70,light:0x65949d,steel:0x9aada9,dark:0x172a31,rubber:0x152025,gold:0xd5ad62,leather:0x493d32,cyan:0x79dfeb};
const Y=new THREE.Vector3(0,1,0),temp=new THREE.Vector3();
function group(parent,name,slot,x=0,y=0,z=0){const g=new THREE.Group();g.name=name;g.position.set(x,y,z);if(slot)g.userData.slot=slot;parent.add(g);return g;}
function piece(parent,geometry,color,position,scale=[1,1,1],rotation=[0,0,0],owned=false){const m=new THREE.Mesh(geometry,RAW);m.position.set(...position);m.scale.set(...scale);m.rotation.set(...rotation);m.userData.tint=color;m.userData.temporaryGeometry=owned;parent.add(m);return m;}
const box=(g,c,x,y,z,w,h,d,rx=0,ry=0,rz=0)=>piece(g,BOX,c,[x,y,z],[w,h,d],[rx,ry,rz]);
function rod(g,c,a,b,r=.035){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),m=piece(g,CYLINDER,c,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[r,v.length(),r]);m.quaternion.setFromUnitVectors(Y,v.normalize());return m;}
function torus(g,c,r,t,x=0,y=0,z=0,segments=24){return piece(g,new THREE.TorusGeometry(r,t,6,segments),c,[x,y,z],[1,1,1],[0,Math.PI/2,0],true);}
function shell(g,c,points,width){const s=new THREE.Shape();points.forEach(([z,y],i)=>i?s.lineTo(-z,y):s.moveTo(-z,y));s.closePath();const geo=new THREE.ExtrudeGeometry(s,{depth:width,bevelEnabled:true,bevelSize:.018,bevelThickness:.018,bevelSegments:1,steps:1,curveSegments:1});geo.rotateY(Math.PI/2);geo.translate(-width/2,0,0);return piece(g,geo,c,[0,0,0],[1,1,1],[0,0,0],true);}
function bake(g,material){
 g.updateMatrixWorld(true);const inverse=g.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),positions=[],normals=[],colors=[],old=[];
 g.traverse(n=>{if(!n.isMesh)return;const geo=n.geometry.index?n.geometry.toNonIndexed():n.geometry.clone();matrix.multiplyMatrices(inverse,n.matrixWorld);geo.applyMatrix4(matrix);const p=geo.attributes.position,no=geo.attributes.normal,c=new THREE.Color(n.userData.tint??P.steel);positions.push(...p.array);normals.push(...no.array);for(let i=0;i<p.count;i++)colors.push(c.r,c.g,c.b);geo.dispose();if(n.userData.temporaryGeometry)n.geometry.dispose();old.push(n);});
 for(const n of old)n.removeFromParent();if(!positions.length)return;
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeBoundingBox();geo.computeBoundingSphere();const m=new THREE.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
}
function wheel(parent,name,slot,radius,width,choice,rank,material){
 const g=group(parent,name,slot);torus(g,P.rubber,radius-width*.45,width*.45);torus(g,P.steel,radius-width*.96,.019);
 torus(g,P.gold,radius-width*1.12,.009);rod(g,P.gold,[-width*.65,0,0],[width*.65,0,0],.055);
 const spokes=16;for(let i=0;i<spokes;i++){const a=i/spokes*Math.PI*2;rod(g,i%4?P.steel:P.gold,[i%2?-.025:.025,0,0],[0,Math.cos(a)*(radius-width),Math.sin(a)*(radius-width)],.007);}
 if(width>.12)for(let i=0;i<24;i++){const a=i/24*Math.PI*2;box(g,i%2?0x26343a:0x1e2b30,0,Math.cos(a)*(radius-.011),Math.sin(a)*(radius-.011),width*.84,.038,.066,a);}
 if(choice==='armored'){for(const side of [-1,1]){torus(g,P.blue,radius*.67,.037,side*width*.44);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,P.steel,side*width*.45,Math.cos(a)*radius*.72,Math.sin(a)*radius*.72,.035,.09,.12,a);}}}
 if(choice==='spiked'||choice==='saw')for(let i=0;i<(choice==='saw'?24:16);i++){const a=i/(choice==='saw'?24:16)*Math.PI*2,n=new THREE.Vector3(0,Math.cos(a),Math.sin(a));const tooth=piece(g,CONE,choice==='saw'?P.steel:P.gold,[0,n.y*(radius+.025),n.z*(radius+.025)],[choice==='saw'?.045:.035,.075+rank*.007,.04]);tooth.quaternion.setFromUnitVectors(Y,n);}
 bake(g,material);return g;
}
function gunModule(parent,slot,id,rank,material){
 const g=group(parent,slot,slot);if(id==='none'||!id)return {root:g,muzzle:null};
 if(id==='ram'){for(const x of [-.18,.18])rod(g,P.steel,[x,-.04,-.1],[x,-.04,.2],.035);shell(g,P.steel,[[0,-.09],[.30,-.02],[.30,.04],[.02,.14]],.49);bake(g,material);return {root:g,muzzle:null};}
 if(id==='shield'){for(const side of [-1,1])box(g,P.blue,side*.38,0,0,.10,.42,.55,0,0,-side*.1);bake(g,material);return {root:g,muzzle:null};}
 if(id==='battery'){box(g,P.dark,0,0,0,.29,.35,.27);for(let i=0;i<3;i++)box(g,P.cyan,0,-.09+i*.09,.145,.17,.04,.02);box(g,P.gold,0,.19,0,.17,.04,.22);bake(g,material);return {root:g,muzzle:null};}
 const swivel=group(g,'yaw'),bearing=group(swivel,'bearing'),elevation=group(swivel,'elevation');
 rod(bearing,P.gold,[0,-.10,0],[0,-.04,0],.12);box(elevation,P.blue,0,.035,0,.22,.16,.35);box(elevation,P.gold,0,.10,-.025,.15,.035,.23);
 if(id==='crossbow'){rod(elevation,P.steel,[-.27,.02,.12],[.27,.02,.12],.024);rod(elevation,P.leather,[-.27,.02,.12],[0,.02,-.12],.006);rod(elevation,P.leather,[.27,.02,.12],[0,.02,-.12],.006);box(elevation,P.leather,0,.02,0,.07,.08,.49);}
 else if(id==='rockets')for(const x of [-.09,.09])for(const y of [-.04,.07]){rod(elevation,P.dark,[x,y,0],[x,y,.26],.055);rod(elevation,P.gold,[x,y,.20],[x,y,.28],.035);}
 else{const count=id==='heavyTurret'?2:1;for(let i=0;i<count;i++){const x=(i-(count-1)/2)*.13;rod(elevation,P.steel,[x,.025,.12],[x,.025,.43+rank*.01],id==='cannon'?.056:.03);rod(elevation,P.dark,[x,.025,.41+rank*.01],[x,.025,.445+rank*.01],id==='cannon'?.044:.025);}box(elevation,P.cyan,.13,.08,-.03,.025,.065,.08);}
 const muzzle=group(elevation,'muzzle',null,0,.025,.46+rank*.01);bake(elevation,material);bake(bearing,material);return {root:g,swivel,elevation,muzzle};
}

/** Fully editable source: parts keep their pivots and pickable slot identities.
 * Upgrade geometry is rebuilt only when the configuration changes. */
export function createMountModel(kind='bicycle',garage=createGarage()){
 const root=new THREE.Group();root.name=`Mount — ${kind}`;const material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true});
 const parts=garage.mounts[kind]||garage.mounts.bicycle,choice=id=>parts[id].selected,rank=id=>parts[id].owned[parts[id].selected]||1;
 const bicycle=kind==='bicycle',scifi=kind==='scifi',hover=scifi&&choice('mobility')==='hover';
 const scale=1.22;root.scale.setScalar(scale);
 const axle=bicycle?.68:scifi?.78:.75,radius=bicycle?.35:scifi?.40:.38,seatY=bicycle?.97:scifi?1.04:1.02;
 const frame=group(root,'frame','frame'),rearZ=-axle,frontZ=axle;
 const crankY=bicycle?.52:.54,seatZ=-.10;
 // Two coherent triangles, a head tube, rear stays and a pivoting fork.
 rod(frame,P.blue,[0,.80,seatZ],[0,.93,.46],.042);rod(frame,P.blue,[0,.80,seatZ],[0,crankY,0],.045);rod(frame,P.blue,[0,.67,.53],[0,crankY,0],.05);
 rod(frame,P.steel,[0,.67,.53],[0,.96,.46],.055);rod(frame,P.gold,[0,.91,.47],[0,.95,.46],.062);
 for(const side of [-1,1]){rod(frame,P.blue,[side*.055,.78,seatZ],[side*.075,radius,rearZ],.025);rod(frame,P.blue,[side*.055,crankY,0],[side*.075,radius,rearZ],.025);}
 rod(frame,P.steel,[0,.76,seatZ],[0,seatY-.035,seatZ],.025);bake(frame,material);
 const controls=group(root,'controls','controls');shell(controls,P.leather,[[seatZ-.18,seatY-.035],[seatZ-.19,seatY+.012],[seatZ+.12,seatY+.03],[seatZ+.15,seatY-.025]],bicycle?.25:.36);bake(controls,material);
 const steering=group(root,'steering','controls',0,.86,.49),fork=group(steering,'fork','frontWheel');
 for(const side of [-1,1]){rod(fork,P.steel,[side*.085,.05,-.025],[side*.085,radius-.86,frontZ-.49],.023);if(!bicycle){rod(fork,P.gold,[side*.085,-.05,.01],[side*.085,-.23,.09],.040);for(let k=0;k<4;k++)torus(fork,P.dark,.037,.009,side*.085,-.06-k*.045,.02+k*.022,10);}}
 rod(fork,P.steel,[-.13,radius-.86,frontZ-.49],[.13,radius-.86,frontZ-.49],.025);bake(fork,material);
 const bars=group(steering,'handlebar','controls');rod(bars,P.steel,[0,.07,-.02],[0,.24,-.07],.023);rod(bars,P.steel,[-.32,.24,-.07],[.32,.24,-.07],.019);for(const side of [-1,1]){rod(bars,P.leather,[side*.23,.24,-.07],[side*.36,.24,-.07],.026);rod(bars,P.gold,[side*.22,.24,-.07],[side*.24,.24,-.07],.031);rod(bars,P.steel,[side*.30,.22,-.06],[side*.30,.21,.015],.009);}bake(bars,material);
 const leftGrip=group(steering,'leftSteeringGrip',null,-.29,.24,-.07);leftGrip.rotation.z=-Math.PI/2;
 const rightGrip=group(steering,'rightSteeringGrip',null,.29,.24,-.07);rightGrip.rotation.z=-Math.PI/2;
 let frontWheel,rearWheel,frontLift,rearLift;
 if(!hover){frontWheel=wheel(steering,'frontWheel','frontWheel',radius,bicycle?.08:.17,choice('frontWheel'),rank('frontWheel'),material);frontWheel.position.set(0,radius-.86,frontZ-.49);rearWheel=wheel(root,'rearWheel','rearWheel',radius,bicycle?.08:.17,choice('rearWheel'),rank('rearWheel'),material);rearWheel.position.set(0,radius,rearZ);}
 else for(const [slot,z]of [['frontWheel',frontZ],['rearWheel',rearZ]]){const lift=group(root,slot,slot,0,.31,z);box(lift,P.dark,0,0,0,.58,.14,.53);shell(lift,P.blue,[[-.30,-.07],[-.28,.12],[.25,.12],[.31,-.07]],.61);for(const side of [-1,1])box(lift,P.gold,side*.25,.08,0,.10,.05,.38);torus(lift,P.steel,.19,.025).rotation.set(Math.PI/2,0,0);box(lift,P.cyan,0,-.083,0,.38,.025,.33);bake(lift,material);if(slot==='frontWheel')frontLift=lift;else rearLift=lift;}
 const drive=group(root,'drive','drive'),crank=group(root,'crank','drive',0,crankY,0);
 const rightPedal=group(crank,'rightPedal',null,.30,0,.12),leftPedal=group(crank,'leftPedal',null,-.30,0,-.12);
 if(bicycle){
  torus(crank,P.gold,.105,.018,.12);rod(crank,P.steel,[-.30,0,0],[.30,0,0],.02);rod(crank,P.steel,[.14,0,0],[.30,0,.12],.018);rod(crank,P.steel,[-.14,0,0],[-.30,0,-.12],.018);bake(crank,material);
  for(const p of [rightPedal,leftPedal]){box(p,P.dark,0,0,0,.15,.04,.12);box(p,P.gold,0,.021,0,.12,.015,.07);bake(p,material);}
  torus(drive,P.steel,.055,.012,.13,radius,rearZ);for(const y of [-1,1])rod(drive,P.leather,[.13,crankY+y*.09,0],[.13,radius+y*.048,rearZ],.008);
  const generator=choice('drive')==='generator';if(generator){box(drive,P.dark,0,.53,.08,.15,.20,.17);box(drive,P.cyan,.081,.53,.08,.015,.13,.09);}bake(drive,material);
 }else{
  rightPedal.position.set(.30,-.02,-.03);leftPedal.position.set(-.30,-.02,-.03);for(const p of [rightPedal,leftPedal]){box(p,P.dark,0,0,0,.18,.04,.16);box(p,P.steel,0,.023,0,.16,.015,.12);bake(p,material);}
  if(!scifi){shell(drive,P.dark,[[-.28,.38],[-.29,.68],[-.12,.79],[.25,.74],[.31,.43]],.32);for(let j=0;j<5;j++)box(drive,P.steel,0,.50+j*.047,.08,.38,.018,.32);rod(drive,P.gold,[0,.41,-.20],[0,.56,-.20],.10);for(const side of [-1,1]){rod(drive,P.steel,[side*.15,.61,.27],[side*.27,.31,.13],.03);rod(drive,P.steel,[side*.27,.31,.13],[side*.27,.31,-.62],.035);rod(drive,P.dark,[side*.27,.31,-.60],[side*.27,.31,-.73],.046);}shell(drive,P.blue,[[.08,.75],[.03,.93],[.22,1.0],[.47,.92],[.43,.76]],.40);}
  else{shell(drive,P.blue,[[-.40,.46],[-.28,.86],[.21,.99],[.68,.89],[.90,.67],[.69,.55]],.52);for(const side of [-1,1]){box(drive,P.gold,side*.27,.71,.35,.035,.10,.43,.16);box(drive,P.cyan,side*.277,.58,.15,.02,.07,.28);box(drive,P.dark,side*.22,.52,-.36,.20,.24,.34);box(drive,P.cyan,side*.22,.51,-.54,.12,.13,.02);}}
  torus(drive,P.steel,.08,.016,.15,crankY,0);torus(drive,P.gold,.055,.011,.15,radius,rearZ);rod(drive,P.leather,[.15,crankY+.07,0],[.15,radius+.05,rearZ],.011);rod(drive,P.leather,[.15,crankY-.07,0],[.15,radius-.05,rearZ],.011);bake(drive,material);
 }
 const armor=group(root,'armor','armor');if(choice('armor')!=='standard'||rank('armor')>1){for(const side of [-1,1]){box(armor,P.blue,side*(bicycle?.10:.25),.63,-.10,.045,.26,.39,.10,0,side*.12);box(armor,P.steel,side*(bicycle?.13:.28),.64,-.11,.016,.14,.28);for(const z of [-.23,.02])box(armor,P.gold,side*(bicycle?.145:.295),.72,z,.02,.035,.035);}}bake(armor,material);
 const frontModule=gunModule(root,'frontModule',choice('frontModule'),rank('frontModule'),material);frontModule.root.position.set(0,bicycle?.78:.94,bicycle?.60:.83);
 const sideModule=gunModule(root,'sideModule',choice('sideModule'),rank('sideModule'),material);sideModule.root.position.set(.38,.63,-.24);
 const rearModule=gunModule(root,'rearModule',choice('rearModule'),rank('rearModule'),material);
 if(/turret/i.test(choice('rearModule'))){const support=group(root,'turretBridge','rearModule');for(const side of [-1,1]){rod(support,P.steel,[side*.15,.60,-.55],[side*.15,1.16,-1.08],.045);rod(support,P.steel,[side*.15,1.16,-1.08],[side*.15,2.62,-1.08],.046);rod(support,P.steel,[side*.15,2.62,-1.08],[side*.15,2.62,-.72],.04);box(support,P.gold,side*.15,1.16,-1.08,.12,.13,.12);}rod(support,P.steel,[-.15,2.62,-.72],[.15,2.62,-.72],.04);bake(support,material);rearModule.root.position.set(0,2.67,-.72);}else rearModule.root.position.set(0,.76,-.55);
 const light=group(root,'lamp','controls',0,.93,.57);box(light,P.dark,0,0,0,.17,.17,.13);box(light,scifi?P.cyan:P.gold,0,0,.071,.13,.12,.02);bake(light,material);
 const markers={leftGrip,rightGrip,leftPedal,rightPedal};
 const motion={wheelAngle:0,crankAngle:0};
 root.userData={kind,parts,material,frame,steering,markers,frontWheel,rearWheel,frontLift,rearLift,crank,modules:{frontModule,sideModule,rearModule},seatY:seatY*scale,seatZ:seatZ*scale,riderOffset:seatY*scale-.74,riderZ:seatZ*scale+.02,pedalSpread:.30*scale,hover,radius:radius*scale,axle:axle*scale,
  animate(distance,turn=0){motion.wheelAngle+=distance/(radius*scale);motion.crankAngle+=distance/(radius*scale)*(.055/.105);steering.rotation.y=turn;if(frontWheel)frontWheel.rotation.x=motion.wheelAngle;if(rearWheel)rearWheel.rotation.x=motion.wheelAngle;if(bicycle){crank.rotation.x=motion.crankAngle;leftPedal.rotation.x=-motion.crankAngle;rightPedal.rotation.x=-motion.crankAngle;}},
  reset(){motion.wheelAngle=motion.crankAngle=0;steering.rotation.y=0;if(frontWheel)frontWheel.rotation.x=0;if(rearWheel)rearWheel.rotation.x=0;crank.rotation.x=0;leftPedal.rotation.x=rightPedal.rotation.x=0;},
  dispose(){root.traverse(n=>{if(n.isMesh)n.geometry.dispose();});material.dispose();root.removeFromParent();root.clear();root.userData={};}
 };
 return root;
}
