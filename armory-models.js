import * as THREE from './vendor/three.module.js';
import {armoryBuilder,armoryPalette,sculptedWoodGeometry,cartridge} from './armory-geometry.js';
import {createArmory,blueprint} from './armory-rules.js';
import {createArmoryMaterials,disposeArmoryMaterials} from './armory-materials.js';
const circle=(r,n=24,cx=0,cy=0)=>Array.from({length:n},(_,i)=>[cx+Math.cos(i/n*Math.PI*2)*r,cy+Math.sin(i/n*Math.PI*2)*r]);
function partConfig(a,id){return a.items[id].parts;}
function rank(parts,id){const e=parts[id];return e.owned[e.selected]||1;}
function endFace(b,P,x,r,segments=12){b.cylinder(P.steel,x,0,0,r,.065,'x',segments);b.ring(P.gold,x+Math.sign(x)*.036,0,0,r*.86,.012,'x',segments);for(let i=0;i<6;i++){const angle=i*Math.PI/3;b.bolt(P.gold,x+Math.sign(x)*.05,Math.cos(angle)*r*.68,Math.sin(angle)*r*.68,.018,'x');}}
function radialStud(b,P,angle,y,r,length=.032){const normal=[Math.sin(angle),0,Math.cos(angle)];b.rod(P.steel,[normal[0]*r,y,normal[2]*r],[normal[0]*(r+length),y,normal[2]*(r+length)],.025);}
/** Four organic/metal clubs and eight individually constructed hammer heads.
 * Local Y is the shaft; hammer faces run along X, preserving existing grips. */
function headGeometry(id,parts,mat,kit={selected:'standard',owned:{standard:1}}){
 const b=armoryBuilder(),P=armoryPalette(parts.finish.selected),number=blueprint(id).number;
 if(id==='w01'){
  b.add(sculptedWoodGeometry('knotted'),P.wood,0,0,0,[0,0,0],[1,1,1],true);
  for(const [x,y,r]of [[-.08,.41,.08],[.12,.21,.055]]){b.ring(0x60371f,x,y,.25,r,.012);b.ring(P.woodLight,x,y,.257,r*.50,.008);}
  b.cylinder(P.woodLight,0,.688,0,.12,.012,'y',14);
 }else if(id==='w02'){
  b.add(sculptedWoodGeometry('banded'),P.wood,0,0,0,[0,0,0],[1,1,1],true);
  for(const y of [-.19,.06,.31,.54]){const r=.115+.16*Math.sin((y+.29)/.98*Math.PI*.66)+.009;b.cylinder(P.dark,0,y,0,r,.09,'y',14);b.ring(P.steel,0,y-.043,0,r,.009,'y',24);b.ring(P.steel,0,y+.043,0,r,.009,'y',24);for(let i=0;i<8;i++)radialStud(b,P,i*Math.PI/4,y,r);}
  b.cylinder(P.steel,0,.69,0,.26,.055,'y',14);
 }else if(id==='w03'){
  b.cylinder(P.dark,0,.17,0,.19,.91,'y',12);for(let i=0;i<6;i++){const angle=i*Math.PI/3,m=b.bevel(P.steel,Math.sin(angle)*.215,.17,Math.cos(angle)*.215,.095,.79,.09,.015);m.rotation.y=angle;}
  for(const y of [-.28,.62]){b.cylinder(P.steel,0,y,0,.26,.065,'y',12);b.ring(P.gold,0,y,0,.24,.014,'y',12);}
 }else if(id==='w04'){
  b.cylinder(P.wood,0,.17,0,.32,.91,'y',8,.12);for(let i=0;i<8;i++){const angle=i*Math.PI/4,points=[[-.035,-.455],[.035,-.455],[.088,.455],[-.088,.455]],m=b.poly(i%2?P.paint:P.steel,points,.025,0,[],.005);m.position.set(Math.sin(angle)*.215,.17,Math.cos(angle)*.215);m.rotation.set(.20,angle,0,'YXZ');for(const y of [-.16,.18,.51])radialStud(b,P,angle,y,.14+(y+.29)/.98*.18,.028);}
  for(const [y,r]of [[-.28,.13],[.65,.32]]){b.cylinder(P.gold,0,y,0,r,.07,'y',8);b.cylinder(P.steel,0,y+.015,0,r*.85,.085,'y',8);}
 }else if(id==='w05'||id==='w09'){
  const large=id==='w09',w=large?1.28:.94,h=large?.63:.45,d=large?.58:.43;b.bevel(P.dark,0,0,0,w,h,d,.04);b.bevel(P.paint,0,.005,0,w*.72,h*1.03,d*1.05,.035);
  for(const side of [-1,1]){b.bevel(P.steel,side*w*.43,0,0,.16,h*1.09,d*1.09,.028);b.bevel(P.gold,side*w*.20,0,d*.55,.065,h*.90,.035,.008);for(const y of [-h*.30,h*.30])b.bolt(P.gold,side*w*.30,y,d*.55,.026);b.bevel(P.light,side*w*.51,0,0,.045,h*.76,d*.80,.009);}
 }else if(id==='w06'||id==='w10'){
  const large=id==='w10',r=large?.37:.235,length=large?1.06:.83,segments=large?6:16;b.cylinder(P.paint,0,0,0,r,length,'x',segments);for(const x of [-length*.25,length*.25]){b.cylinder(P.gold,x,0,0,r*1.035,.065,'x',segments);b.ring(P.dark,x+.035,0,0,r*.99,.012,'x',segments);}for(const side of [-1,1])endFace(b,P,side*length*.53,r*1.08,segments);
 }else if(id==='w07'){
  b.bevel(P.paint,-.17,0,0,.55,.43,.40,.033);b.bevel(P.steel,-.48,0,0,.18,.49,.46,.025);b.bevel(P.light,-.58,0,0,.035,.40,.37,.01);b.poly(P.steel,[[.07,-.21],[.62,-.055],[.62,.045],[.07,.21]],.32,0,[],.014);b.bevel(P.gold,.05,0,.23,.09,.40,.055,.012);for(const y of [-.12,.12])b.bolt(P.gold,-.26,y,.23,.025);
 }else if(id==='w08'){
  for(const side of [-1,1]){const x=side*.30;for(const y of [-.23,.27])b.cylinder(P.dark,x,y,0,.165,.18,'y',14);b.cylinder(P.steel,x,.03,0,.12,.69,'y',14);for(const y of [-.33,.38]){b.cylinder(P.gold,x,y,0,.188,.065,'y',14);b.cylinder(P.steel,x,y+Math.sign(y)*.045,0,.18,.06,'y',14);}for(const y of [-.08,.03,.14])b.ring(P.gold,x,y,0,.132,.008,'y',16);}
  b.bevel(P.paint,0,.20,-.02,.74,.15,.26,.025);b.bevel(P.steel,0,-.20,0,.67,.12,.27,.025);b.cylinder(P.gold,0,-.29,0,.115,.18,'y',12);
 }else if(id==='w11'){
  b.bevel(P.dark,0,0,0,1.10,.65,.59,.035);b.bevel(P.paint,.10,0,0,.80,.66,.60,.04);b.bevel(P.steel,-.51,0,0,.18,.71,.66,.035);b.bevel(P.steel,.55,0,0,.15,.69,.63,.03);b.bevel(P.light,.635,0,0,.035,.53,.48,.009);for(const y of [-.22,0,.22])for(const z of [-.22,0,.22])b.cone(P.steel,-.67,y,z,.066,.17,[-1,0,0]);for(const side of [-1,1])for(const y of [-.22,.22])b.bolt(P.gold,side*.30,y,.326,.027);b.bevel(P.gold,.13,0,.33,.08,.59,.035,.012);
 }else if(id==='w12'){
  b.poly(P.dark,circle(.49,24,0,.25),.32,0,[circle(.305,24,0,.25)],.025);b.poly(P.steel,circle(.50,8,0,.25),.065,.18,[circle(.34,16,0,.25)],.015);
  for(let i=0;i<8;i++){const angle=i*Math.PI/4,x=Math.cos(angle)*.43,y=.25+Math.sin(angle)*.43,m=b.bevel(i%2?P.paint:P.gold,x,y,.215,.19,.12,.075,.014);m.rotation.z=angle;b.bolt(P.steel,x,y,.264,.026);}
  b.poly(P.steel,circle(.50,8,0,.25),.045,-.18,[circle(.34,16,0,.25)],.01);for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.cos(a)*.43,y=.25+Math.sin(a)*.43,m=b.bevel(i%2?P.paint:P.gold,x,y,-.215,.16,.105,.05,.012);m.rotation.z=a;b.bolt(P.steel,x,y,-.25,.022);}if(parts.core.selected!=='none'){const glow=parts.core.selected==='fire'?0xff8c32:parts.core.selected==='frost'?0xb2e9ee:P.cyan;for(const z of [-.177,.177])b.ring(glow,0,.25,z,.331,.008,'z',32);}
  b.bevel(P.paint,0,-.28,0,.24,.24,.26,.025);for(const side of [-1,1])b.bevel(P.gold,side*.12,-.31,.04,.07,.14,.26,.012);
 }
 // Reinforcement belongs to this shape's actual faces, not a generic box
 // obscuring the ring hole or changing every blueprint into the same hammer.
 const strike=parts.strike.selected,extra=(kit.owned?.[kit.selected]||1)-1;
 if(strike!=='plain'||extra>0||kit.selected!=='standard'){
  if(number<5){for(let i=0;i<8;i++){const angle=i*Math.PI/4,r=.26,y=.27;if(strike==='spiked')b.cone(P.steel,Math.sin(angle)*.31,y,Math.cos(angle)*.31,.045,.12,[Math.sin(angle),0,Math.cos(angle)]);else radialStud(b,P,angle,y,r,.045);}if(strike==='flanged')for(let i=0;i<4;i++){const angle=i*Math.PI/2,m=b.bevel(P.gold,Math.sin(angle)*.26,.22,Math.cos(angle)*.26,.065,.53,.06,.012);m.rotation.y=angle;}}
  else if(id==='w12'){for(const side of [-1,1])b.bevel(P.gold,side*.48,.25,.25,.08,.35,.06,.012);}
  else{const x=id==='w07'?-.56:id==='w08'?.30:id==='w11'?-.66:(id==='w09'?.64:id==='w10'?.59:.49);for(const y of [-.13,.13])for(const z of [-.13,.13]){if(strike==='spiked')b.cone(P.steel,x+Math.sign(x)*.07,y,z,.044,.12,[Math.sign(x),0,0]);else b.bolt(P.gold,x+Math.sign(x)*.025,y,z,.035,'x');}if(strike==='flanged')for(const y of [-.16,.16])b.bevel(P.gold,0,y,.34,.75,.06,.06,.012);}
 }
 const coreY=id==='w12'?-.27:number<5?-.19:0,coreZ=id==='w12'?.23:number<5?.20:id==='w09'||id==='w10'||id==='w11'?.36:.28;
 if(parts.core.selected!=='none')cartridge(b,P,parts.core.selected,0,coreY,coreZ,rank(parts,'core'));
 const mesh=b.finish(mat);mesh.name='Armory head '+id;mesh.userData.part='head';mesh.userData.corePosition={x:0,y:coreY,z:coreZ};mesh.userData.compoundRing=id==='w12'?{x:0,y:.25,z:0,inner:.30,outer:.53,depth:.38}:null;return mesh;
}
export function createWeaponModel(id='w01',armory=createArmory(),{material:sharedMaterial,kit}={}){
 const parts=partConfig(armory,id),P=armoryPalette(parts.finish.selected),mat=sharedMaterial||createArmoryMaterials(parts.core.selected),root=new THREE.Group();root.name='Armory '+id;
 const head=headGeometry(id,parts,mat,kit),shaftBuilder=armoryBuilder(),handleBuilder=armoryBuilder(),collarBuilder=armoryBuilder(),guardBuilder=armoryBuilder();
 const shaftChoice=parts.haft.selected,metal=shaftChoice==='steel'||shaftChoice==='spring';shaftBuilder.cylinder(metal?P.steel:P.wood,0,0,0,.064,1,'y',12,.072);
 if(metal){for(const y of [-.41,.35])shaftBuilder.cylinder(P.gold,0,y,0,.077,.07,'y',12);shaftBuilder.bevel(P.paint,0,.04,.066,.055,.64,.022,.006);}else{const m=shaftBuilder.bevel(P.woodLight,0,0,.066,.028,.94,.012,.003);m.userData.grain=true;}
 if(shaftChoice==='spring'){for(let i=0;i<9;i++)shaftBuilder.ring(P.dark,0,-.23+i*.055,0,.083,.012,'y',16);shaftBuilder.cylinder(P.gold,0,-.25,0,.089,.06,'y',12);shaftBuilder.cylinder(P.gold,0,.26,0,.089,.06,'y',12);}
 handleBuilder.cylinder(P.leather,0,.20,0,.078,.68,'y',12,.085);for(let i=0;i<8;i++)handleBuilder.ring(i%2?P.leather:0x76513b,0,-.07+i*.075,0,.081,.012,'y',16);handleBuilder.cylinder(P.gold,0,-.145,0,.10,.08,'y',10);
 const grip=parts.grip.selected;if(grip==='guarded'||id==='w04'){for(const z of [-.04,.04]){handleBuilder.rod(P.gold,[.065,-.08,z],[.24,-.025,z],.022);handleBuilder.rod(P.gold,[.24,-.025,z],[.27,.49,z],.022);handleBuilder.rod(P.gold,[.27,.49,z],[.065,.57,z],.022);}}
 if(grip==='counterweight'){handleBuilder.cylinder(P.steel,0,-.18,0,.125,.15,'y',10);handleBuilder.ring(P.gold,0,-.24,0,.117,.014,'y',12);}if(grip==='coil')for(let i=0;i<5;i++)handleBuilder.ring(P.cyan,0,.03+i*.09,0,.089,.012,'y',16);
 collarBuilder.cylinder(P.steel,0,0,0,.112,.14,'y',10);collarBuilder.ring(P.gold,0,.063,0,.11,.014,'y',12);
 guardBuilder.cylinder(P.gold,0,0,0,.115,.05,'y',10);guardBuilder.bevel(P.steel,0,0,0,.30,.045,.19,.012);
 const handle=handleBuilder.finish(mat),shaft=shaftBuilder.finish(mat),collar=collarBuilder.finish(mat),guard=guardBuilder.finish(mat);handle.name='Armory grip';shaft.name='Armory shaft';collar.name='Armory collar';guard.name='Armory hand guard';for(const [m,part]of [[head,'head'],[handle,'grip'],[shaft,'haft'],[collar,'collar'],[guard,'guard']]){m.userData.part=part;root.add(m);}const headY=blueprint(id).family==='hammer'?1.05:blueprint(id).family==='heavy'?1.70:1.43,length=Math.max(.1,headY-.21-.5);head.position.y=headY;shaft.position.y=.5+length/2;shaft.scale.y=length;collar.position.y=headY-.31;guard.position.y=.64;
 root.userData={id,parts:{head,handle,shaft,collar,guard},material:mat,dispose(){for(const m of [head,handle,shaft,collar,guard]){m.geometry.dispose();m.removeFromParent();}if(!sharedMaterial)disposeArmoryMaterials(mat);root.removeFromParent();root.clear();}};return root;
}
const shieldOutline=id=>id==='s13'?circle(.48,32):id==='s14'?[[-.47,.48],[0,.66],[.47,.48],[.36,-.30],[0,-.71],[-.36,-.30]]:id==='s15'?[[-.49,.70],[.49,.70],[.52,.56],[.52,-.65],[.40,-.76],[-.40,-.76],[-.52,-.65],[-.52,.56]]:id==='s16'?circle(.58,6,0,0):id==='s18'?[[0,.75],[.22,.68],[.40,.51],[.50,.27],[.49,.02],[.40,-.28],[.23,-.56],[0,-.79],[-.23,-.56],[-.40,-.28],[-.49,.02],[-.50,.27],[-.40,.51],[-.22,.68]]:[[-.64,.56],[.64,.56],[.64,-.58],[-.64,-.58]];
function shieldFace(b,P,id,parts,points,kit){
 const rim=parts.rim.selected,inner=points.map(([x,y])=>[x*.86,y*.86]),viewport=id==='s15'?[[[-.20,.38],[.20,.38],[.20,.51],[-.20,.51]]]:[];
 b.poly(P.dark,points,.12,-.015,viewport,.016);b.poly(id==='s13'?P.wood:P.paint,points.map(([x,y])=>[x*.96,y*.96]),.065,.065,viewport,.012);b.poly(P.steel,points,.065,.09,[inner],.01);
 if(id==='s13'){for(const x of [-.24,0,.24]){const extent=Math.sqrt(.41*.41-x*x);b.bevel(P.woodLight,x,0,.106,.013,extent*2,.015,.003);}for(const y of [-.19,.19])b.bevel(P.dark,0,y,.12,.70,.055,.025,.006);}
 if(id==='s14'||id==='s18'){b.poly(P.gold,[[-.035,.59],[.035,.59],[.035,-.54],[0,-.64],[-.035,-.54]],.025,.14,[],.006);for(const side of [-1,1]){const m=b.bevel(P.light,side*.19,.10,.122,.05,.50,.02,.006);m.rotation.z=side*-.18;}}
 if(id==='s15')for(const y of [.13,-.20,-.53])b.bevel(P.paint,0,y,.115,.79,.29,.035,.012);
 if(id==='s15'){const outer=[[-.26,.33],[.26,.33],[.26,.56],[-.26,.56]];b.poly(P.gold,outer,.055,.14,viewport,.006);for(const side of [-1,1])for(const y of [-.62,.61]){const m=b.bevel(P.gold,side*.38,y,.14,.20,.13,.055,.012);m.rotation.z=side*Math.sign(y)*.15;}}
 if(id==='s16'){b.poly(P.gold,circle(.19,6),.065,.16,[],.008);for(let i=0;i<6;i++){const a=i*Math.PI/3;b.bolt(P.gold,Math.cos(a)*.49,Math.sin(a)*.49,.15,.032);}}
 if(id==='s18')for(const side of [-1,1]){for(const [a,c]of [[ [0,.65,.15],[side*.12,.40,.16] ],[ [side*.12,.40,.16],[side*.25,.15,.15] ],[ [side*.25,.15,.15],[side*.16,-.28,.15] ],[ [side*.16,-.28,.15],[0,-.64,.15] ]])b.rod(P.gold,a,c,.025);const p=[[side*.02,.67],[side*.31,.52],[side*.43,.25],[side*.31,.31],[side*.16,.48],[side*.045,.51]];b.poly(P.gold,p,.06,.14,[],.01);}
 for(let i=0;i<points.length;i++){if(points.length>12&&i%3)continue;const [x,y]=points[i];b.bolt(P.gold,x*.93,y*.93,.14,.025);}
 if(rim==='armored'||kit?.selected==='reinforced'||kit?.selected==='assault'){b.poly(P.gold,points.map(([x,y])=>[x*1.025,y*1.025]),.06,.13,[points.map(([x,y])=>[x*.94,y*.94])],.008);}
 if(rim==='serrated')for(let i=0;i<points.length;i++){if(points.length>12&&i%3)continue;const [x,y]=points[i],length=Math.hypot(x,y)||1;b.cone(P.steel,x*1.06,y*1.06,.095,.036,.11,[x/length,y/length,0]);}
 if(rim==='absorber')for(const [x,y]of [[-.35,.30],[.35,.30],[-.28,-.35],[.28,-.35]]){b.cylinder(P.steel,x,y,.15,.047,.055,'z',10);b.ring(P.dark,x,y,.185,.032,.009);}
}
export function createShieldModel(id='s14',armory=createArmory(),{material:sharedMaterial,kit}={}){
 const parts=partConfig(armory,id),mat=sharedMaterial||createArmoryMaterials(parts.core.selected),P=armoryPalette(parts.finish.selected),root=new THREE.Group(),panels=[];root.name='Armory '+id;const b=armoryBuilder();
 if(id==='s17'){
  for(const side of [-1,0,1]){const pb=armoryBuilder(),points=[[-.205,.55],[.205,.55],[.205,-.56],[-.205,-.56]];shieldFace(pb,P,id,parts,points,kit);for(const x of [-.16,.16])for(const y of [-.44,0,.44])pb.bolt(P.gold,x,y,.14,.021);const m=pb.finish(mat),pivot=new THREE.Group();pivot.position.x=side*.40;pivot.rotation.y=side*-.17;pivot.add(m);root.add(pivot);panels.push({pivot,side});}
  for(const side of [-1,1])for(const y of [-.38,0,.38]){b.cylinder(P.gold,side*.20,y,.14,.035,.18,'y',10);b.ring(P.dark,side*.20,y,.14,.038,.007,'y',10);}
 }else shieldFace(b,P,id,parts,shieldOutline(id),kit);
 const boss=parts.boss.selected;if(boss==='spiked'){b.cylinder(P.gold,0,.025,.17,.16,.07,'z',12);b.cone(P.steel,0,.025,.32,.13,.27,[0,0,1]);}else if(boss==='reflector'){b.poly(P.steel,circle(.19,8,0,.025),.075,.19,[],.018);b.ring(P.gold,0,.025,.24,.145,.015);for(const x of [-.08,.08])b.bevel(P.light,x,.025,.245,.025,.18,.015,.004);}else if(boss==='reactor'||id==='s16'){b.poly(P.gold,circle(.20,6,0,.025),.07,.17,[],.009);b.bevel(P.dark,0,.025,.23,.26,.25,.075,.022);for(const side of [-1,1])b.bevel(P.steel,side*.115,.025,.255,.045,.25,.045,.009);}else if(id==='s13'){b.cylinder(P.gold,0,.025,.17,.19,.055,'z',14);b.cylinder(P.steel,0,.025,.215,.13,.09,'z',12);}
 if(parts.core.selected!=='none')cartridge(b,P,parts.core.selected,0,.025,boss==='reactor'||id==='s16'?.30:.28,rank(parts,'core'));
 // Back straps and the exact original shield-grip contact at (0,.065,-.197).
 for(const side of [-1,1])b.bevel(P.leather,side*.22,.03,-.106,.10,.61,.07,.012);for(const y of [-.10,.23])b.bevel(P.steel,0,y,-.135,.31,.06,.10,.009);b.cylinder(P.leather,0,.065,-.197,.056,.32,'y',12);
 const body=b.finish(mat);root.add(body);root.userData={id,material:mat,panels,corePosition:{x:0,y:.025,z:.30},setGuard(t){for(const {pivot,side}of panels)pivot.rotation.y=side*-.17*(1-Math.max(0,Math.min(1,t))*.75);},dispose(){root.traverse(n=>{if(n.isMesh)n.geometry.dispose();});if(!sharedMaterial)disposeArmoryMaterials(mat);root.removeFromParent();root.clear();}};return root;
}
