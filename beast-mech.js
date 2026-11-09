// Editable metre-based hard-surface source for the approved quadruped concept.
// +Z is the muzzle direction. Rigid sections bake detail into two material
// batches each; all four legs retain independent joints, feet and pistons.
import * as THREE from './vendor/three.module.js';
import {BEAST_HEIGHT} from './beast-rules.js?v=20261109-body-slam1';
const P={armor:0x4f696b,edge:0x8d9997,dark:0x263437,joint:0x1b2427,steel:0xa0aaa5,orange:0xff7e22,yellow:0xe4ac48};
const up=new THREE.Vector3(0,1,0);
function beveledPlate(){
 const outline=[[-.38,-.5],[.38,-.5],[.5,-.38],[.5,.38],[.38,.5],[-.38,.5],[-.5,.38],[-.5,-.38]];
 const rings=[[-.5,.84],[-.42,1],[.42,1],[.5,.84]],v=[],p=[];
 for(const [y,k]of rings)for(const [x,z]of outline)v.push([x*k,y,z*k]);
 const tri=(a,b,c)=>p.push(...v[a],...v[c],...v[b]);
 for(let j=0;j<3;j++)for(let i=0;i<8;i++){const n=(i+1)%8,a=j*8+i,b=j*8+n;tri(a,b,b+8);tri(a,b+8,a+8);}
 for(let i=1;i<7;i++){tri(0,i+1,i);tri(24,24+i,25+i);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}
const PLATE=beveledPlate(),CYL=new THREE.CylinderGeometry(1,1,1,12),CONE=new THREE.CylinderGeometry(.35,1,1,8);
// Convex profiled shells give the neck, muzzle and haunches their silhouette;
// armour plates are surface detail rather than the entire body shape.
function shell(profile){
 const v=[],p=[],center=new THREE.Vector3();
 for(const side of [-1,1])for(const [z,y,width]of profile){const q=new THREE.Vector3(side*width,y,z);v.push(q);center.add(q);}center.multiplyScalar(1/v.length);
 const triangle=(a,b,c)=>{const normal=new THREE.Vector3().subVectors(v[b],v[a]).cross(new THREE.Vector3().subVectors(v[c],v[a]));const outward=v[a].clone().add(v[b]).add(v[c]).multiplyScalar(1/3).sub(center);if(normal.dot(outward)<0)[b,c]=[c,b];for(const i of [a,b,c])p.push(...v[i]);};
 const n=profile.length;for(let i=1;i<n-1;i++){triangle(0,i,i+1);triangle(n,n+i,n+i+1);}for(let i=0;i<n;i++){const j=(i+1)%n;triangle(i,j,n+j);triangle(i,n+j,n+i);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}
const matte=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
const glow=new THREE.MeshLambertMaterial({vertexColors:true,emissive:0xff6716,emissiveIntensity:.8,flatShading:true});
class Section{
 constructor(name){this.root=new THREE.Group();this.root.name=name;this.buckets=[[],[]];this.parts=[[],[]];}
 raw(geometry,color,pos,size,rotation=[0,0,0],emissive=false){
  const m=new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...size));
  const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(m);
  const c=new THREE.Color(color),p=g.attributes.position,n=g.attributes.normal,b=this.buckets[+emissive];
  this.parts[+emissive].push({start:b.length/9,count:p.count});
  for(let i=0;i<p.count;i++)b.push(p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),c.r,c.g,c.b);g.dispose();return this;
 }
 plate(color,pos,size,rotation,emissive){return this.raw(PLATE,color,pos,size,rotation,emissive);}
 cylinder(color,pos,size,rotation,emissive){return this.raw(CYL,color,pos,size,rotation,emissive);}
 finish(){
  this.buckets.forEach((b,i)=>{if(!b.length)return;const p=[],n=[],c=[];
   for(let j=0;j<b.length;j+=9){p.push(...b.slice(j,j+3));n.push(...b.slice(j+3,j+6));c.push(...b.slice(j+6,j+9));}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.computeBoundingSphere();
   g.userData.collisionParts=this.parts[i];
   const mesh=new THREE.Mesh(g,i?glow:matte);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=this.root.name+(i?'-furnace':'-armor');this.root.add(mesh);
  });return this.root;
 }
}
function at(root,child,x,y,z){child.position.set(x,y,z);root.add(child);return child;}
function segment(root,a,b){root.position.copy(a).add(b).multiplyScalar(.5);root.quaternion.setFromUnitVectors(up,new THREE.Vector3().subVectors(a,b).normalize());}
function limb(name,length,width,shin=false){
 const s=new Section(name);s.plate(P.dark,[0,0,0],[width*.75,length,width*.8]);
 s.plate(P.armor,[0,.08*length,.12*width],[width,length*.68,width]);
 s.plate(P.edge,[0,-length*.27,.2*width],[width*.86,length*.16,width*.95]);
 s.plate(P.orange,[0,-length*.15,width*.51],[width*.38,length*.08,.08],undefined,true);
 for(const x of [-1,1])s.cylinder(P.steel,[x*width*.34,0,-width*.48],[width*.085,length*.75,width*.085]);
 s.cylinder(P.dark,[0,length*.43,0],[width*.67,width*1.14,width*.67],[0,0,Math.PI/2]);
 s.cylinder(P.edge,[width*.59,length*.43,0],[width*.45,.09,width*.45],[0,0,Math.PI/2]);
 s.cylinder(P.orange,[width*.65,length*.43,0],[width*.20,.07,width*.20],[0,0,Math.PI/2],true);
 for(const side of [-1,1])s.plate(P.edge,[side*width*.43,-length*.04,width*.3],[width*.18,length*.5,width*.42],[0,0,side*.12]);
 const result=s.finish();
 if(shin)result.traverse(n=>{if(n.isMesh){const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++){
   const y=Math.max(p.getY(i),-length*.4),t=Math.max(.15,Math.min(1,(y+length*.4)/(length*.25)));
   p.setXYZ(i,p.getX(i)*t,y,p.getZ(i)*t);
  }p.needsUpdate=true;n.geometry.computeVertexNormals();n.geometry.computeBoundingSphere();}});
 return result;
}
export function makeBeastMech(){
 const root=new THREE.Group();root.name='quadruped-colossus';const body=new THREE.Group();body.name='armored-chassis';root.add(body);
 const torso=new Section('ribbed-reactor-hull');
 torso.plate(P.dark,[0,6.1,-.7],[4.4,2.6,7.5]);
 const hull=shell([[-4.5,5.4,1.2],[-3.7,7.1,1.9],[-1,8.0,2.1],[1.6,7.5,2.0],[3.3,6.4,1.5],[2.5,4.9,1.4],[-2.8,4.7,1.3]]);
 torso.raw(hull,P.armor,[0,0,0],[1,1,1]);hull.dispose();
 for(let i=0;i<6;i++)for(const side of [-1,1]){
  const z=-3.8+i*1.15;
  torso.plate(P.orange,[side*1.92,6.6,z],[.18,.8,.75],[0,0,side*.25],true);
  torso.plate(i%2?P.armor:P.edge,[side*1.7,7,z],[1.3,1.4,1.4],[0,0,-side*.40]);
  const arch=Math.sin((i+.5)/6*Math.PI)*.55;
  torso.plate(P.orange,[0,7.65+arch,z],[1.25,.25,.85],undefined,true);
  torso.plate(P.dark,[0,7.95+arch,z],[1.8,.65,1.05],[.18,0,0]);
  torso.plate(P.edge,[0,8.23+arch,z],[1.45,.24,.85],[.18,0,0]);
 }
 for(const side of [-1,1]){
  torso.plate(P.armor,[side*2.1,5.7,1.5],[1.3,1.5,2],[0,0,side*.25]);
  for(let row=0;row<3;row++)torso.plate(row%2?P.armor:P.dark,[side*2.16,5.7+row*.52,-.8],[.7,.72,4.8],[0,0,-side*.2]);
  torso.plate(P.armor,[side*2.5,5.65,-3.1],[1.6,2.2,2.8],[.18,side*.1,-side*.35]);
  torso.plate(P.edge,[side*2.8,5.9,1.85],[1.8,1.35,2.5],[.22,0,-side*.38]);
  for(let stripe=0;stripe<3;stripe++)torso.plate(P.yellow,[side*(2.4+stripe*.28),5.55,3.03],[.17,.55,.08],[0,0,-side*.38]);
  for(let i=0;i<3;i++)torso.plate(P.orange,[side*1.5,5.65+i*.25,3.01],[.65,.10,.08],undefined,true);
 }
 body.add(torso.finish());
 const neck=new Section('armored-neck');neck.plate(P.dark,[0,6.4,3.5],[2.2,1.8,2.4],[.18,0,0]);body.add(neck.finish());
 const head=new Section('predatory-head');
 const skull=shell([[-.7,.1,.85],[0,.95,1.05],[1.2,.6,1.1],[3.2,-.05,.58],[3.35,-.55,.55],[1.5,-.72,.84],[-.5,-.5,.8]]);
 head.raw(skull,P.armor,[0,0,0],[1,1,1]);skull.dispose();
 for(const side of [-1,1]){
  head.plate(P.armor,[side*.85,.25,1.1],[.72,1.15,2.9],[0,side*-.14,side*.12]);
  head.plate(P.orange,[side*.99,.05,2.1],[.12,.24,1.15],[0,side*.08,0],true);
  head.plate(P.edge,[side*.88,.44,2.05],[.65,.42,1.5],[.05,side*-.15,side*.1]);
  for(let j=0;j<3;j++)head.raw(CONE,P.steel,[side*.7,-.72,1.0+j*.72],[.18,j===2?.85:.5,.2],[0,0,Math.PI]);
  head.plate(P.dark,[side*.9,-.25,.05],[.4,1.2,1.25],[.12,0,side*.18]);
 }
 for(let i=0;i<3;i++)head.plate(P.edge,[0,.72-i*.16,.05+i*.85],[1.45-i*.16,.32,1.0],[.20,0,0]);
 head.plate(P.armor,[0,-.14,2.95],[1.25,.48,.85],[.15,0,0]);
 const headRoot=at(body,head.finish(),0,6.1,3.3);
 headRoot.rotation.order='YXZ'; // Yaw remains correct while the head pitches up/down.
 const jaw=new Section('hinged-jaw');jaw.plate(P.dark,[0,-.85,1.35],[1.65,.38,2.6],[.05,0,0]);
 for(const side of [-1,1]){jaw.plate(P.edge,[side*.7,-.72,1.45],[.24,.4,2.6]);for(let j=0;j<3;j++)jaw.raw(CONE,P.steel,[side*.66,-.45,.9+j*.7],[.16,.42,.18]);}
 const jawRoot=jaw.finish();headRoot.add(jawRoot);
 const laser=new Section('chest-laser');laser.plate(P.dark,[0,0,-.1],[2.5,2.1,.8]);
 for(const [radius,depth,z,c]of [[1.02,.5,.25,P.edge],[.82,.55,.4,P.dark],[.61,.2,.72,P.orange],[.34,.22,.85,0xffd37b]])laser.cylinder(c,[0,0,z],[radius,depth,radius],[Math.PI/2,0,0],c===P.orange||c===0xffd37b);
 const laserRoot=at(body,laser.finish(),0,5.2,3.15);
 const missileMounts=[],rocketMounts=[];
 for(const side of [-1,1]){
  const tower=new Section('missile-bank-'+side);tower.plate(P.dark,[0,0,0],[1.65,4.2,1.8]);tower.plate(P.edge,[0,.1,.05],[1.8,3.7,1.9]);tower.plate(P.joint,[0,.1,1.02],[1.44,3.32,.15]);
  for(let row=0;row<4;row++)for(let col=0;col<3;col++){
   const x=(col-1)*.43,y=-1.1+row*.77;tower.cylinder(P.orange,[x,y,1.1],[.17,.35,.17],[Math.PI/2,0,0],true);
   missileMounts.push(new THREE.Vector3(side*2.6+x,8.45+y, .6));
  }
  for(let j=0;j<4;j++)tower.plate(P.yellow,[side*.91,-.9+j*.5,0],[.06,.23,1.3],[side*.4,0,0]);
  at(body,tower.finish(),side*2.6,8.45,-.5);
  const pod=new Section('rocket-pod-'+side);pod.plate(P.dark,[0,0,0],[2.1,1.45,2.3]);pod.plate(P.edge,[0,0,1],[2.15,1.5,.35]);pod.plate(P.joint,[0,0,1.2],[1.8,1.13,.10]);
  for(let row=0;row<2;row++)for(let col=0;col<3;col++){
   const x=(col-1)*.56,y=(row-.5)*.53;pod.cylinder(P.orange,[x,y,1.27],[.235,.12,.235],[Math.PI/2,0,0],true);pod.cylinder(P.joint,[x,y,1.34],[.175,.14,.175],[Math.PI/2,0,0]);rocketMounts.push(new THREE.Vector3(side*3+x,6.85+y,3.27));
  }
  at(body,pod.finish(),side*3,6.85,2);
 }
 const legs=[];
 for(let i=0;i<4;i++){
  const side=i%2?-1:1,front=i<2,hip=new THREE.Vector3(side*(front?2.45:2.2),front?5.45:5.2,front?2:-3.0);
  const rest=new THREE.Vector3(side*(front?3.6:3.2),.6,front?4.5:-3.8),pole=new THREE.Vector3(side*.6,0,front?.9:-1.5);
  const upperLength=front?3.35:3.15,lowerLength=front?3.25:3.0,width=front?1.9:1.6;
  const upper=limb('leg-'+i+'-upper',upperLength,width),lower=limb('leg-'+i+'-shin',lowerLength,width*.87,true);root.add(upper,lower);
  const feet=new Section('leg-'+i+'-clawed-foot');feet.plate(P.dark,[0,.18,0],[2.45,.65,2.6]);
  for(let toe=0;toe<3;toe++){feet.plate(P.armor,[(toe-1)*.82,.18,1.0],[.75,1.08,2.2],[-.22,0,0]);feet.plate(P.edge,[(toe-1)*.82,-.20,1.75],[.68,.3,.75]);feet.plate(P.dark,[(toe-1)*.82,.70,.65],[.59,.18,.65]);}
  const foot=feet.finish();root.add(foot);legs.push({hip,rest,pole,upperLength,lowerLength,upper,lower,foot,knee:new THREE.Vector3(),target:rest.clone()});
 }
 const delta=new THREE.Vector3(),axis=new THREE.Vector3(),bend=new THREE.Vector3(),hip=new THREE.Vector3();
 function pose({time=0,moving=0,strafe=0,stomp=0,rearStomp=0,roar=0,bodyDrop=0,pitch=0,roll=0,bodyShift=0,jaw=0}={}){
  root.userData.poseState={time,moving,strafe,stomp,rearStomp,roar,bodyDrop,pitch,roll,bodyShift,jaw};
  body.position.set(0,-bodyDrop,bodyShift);body.rotation.set(pitch,0,roll);body.updateMatrix();
  headRoot.rotation.x=Math.sin(time*1.3)*.025-roar*.16;
  jawRoot.rotation.x=-.06+Math.max(0,stomp)*.12+roar*.45+jaw;
  for(let i=0;i<4;i++){
   const l=legs[i],cycle=time*1.65+(i===0||i===3?0:Math.PI),lift=Math.max(0,Math.sin(cycle))*moving;
   const step=Math.cos(cycle)*moving*.7;
   l.target.copy(l.rest);l.target.x+=step*strafe;l.target.z+=step*(1-Math.abs(strafe));
   l.target.y+=lift*.75+(i<2?stomp*1.8:rearStomp*1.8);
   hip.copy(l.hip).applyMatrix4(body.matrix);
   delta.subVectors(l.target,hip);const distance=Math.min(delta.length(),l.upperLength+l.lowerLength-.01);axis.copy(delta).normalize();
   const along=(l.upperLength**2-l.lowerLength**2+distance**2)/(2*distance),height=Math.sqrt(Math.max(0,l.upperLength**2-along**2));
   bend.copy(l.pole).addScaledVector(axis,-l.pole.dot(axis)).normalize();l.knee.copy(hip).addScaledVector(axis,along).addScaledVector(bend,height);
   segment(l.upper,hip,l.knee);segment(l.lower,l.knee,l.target);l.foot.position.copy(l.target);l.foot.rotation.x=-lift*.1;
  }
  root.updateMatrixWorld(true);
 }
 pose();const box=new THREE.Box3().setFromObject(root,true),height=box.max.y-box.min.y,scale=BEAST_HEIGHT/height;
 root.scale.setScalar(scale);root.position.y=-box.min.y*scale;
 root.userData={body,head:headRoot,jaw:jawRoot,laser:laserRoot,legs,missileMounts,rocketMounts,pose,poseState:{time:0,moving:0,stomp:0},designScale:scale,groundOffset:root.position.y,
  worldPoint(point,out=new THREE.Vector3()){return body.localToWorld(out.copy(point));},
  feet(){root.updateMatrixWorld(true);return legs.map(l=>l.foot.getWorldPosition(new THREE.Vector3()));},
  dispose(){root.traverse(n=>{if(n.isMesh)n.geometry.dispose();});root.removeFromParent();}};
 root.updateMatrixWorld(true);return root;
}
