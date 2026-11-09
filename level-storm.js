// One queued strike per earned level. Fixed world-space ribbons avoid r170
// instanced-transform hazards. No new lights, physics bodies or asset downloads.
import * as THREE from './vendor/three.module.js';
import {MAX_CHARACTER_LEVEL} from './character-progression.js?v=20261108-mount1';
export const STORM_DURATION=.85;
export function stormStats(level=2,power=24){return {radius:5.2+Math.max(1,Math.min(MAX_CHARACTER_LEVEL,level))*.08,damage:Math.round(power*1.25+20)};}
function batch(scene,name,capacity){
 const geometry=new THREE.BufferGeometry();for(const a of ['position','color'])geometry.setAttribute(a,new THREE.BufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
 const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:1,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,fog:false});
 const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.frustumCulled=false;mesh.visible=false;mesh.userData.noCollision=true;scene.add(mesh);return mesh;
}
export class LevelStorm{
 constructor(scene,{onStrike=()=>{}}={}){this.onStrike=onStrike;this.pending=[];this.strikes=0;this.active=null;this.disposed=false;this.beam=batch(scene,'level-up-sky-lightning',1024);this.wave=batch(scene,'level-up-ground-discharge',2048);}
 enqueue(from,to){for(let level=Math.max(2,from+1);level<=Math.min(MAX_CHARACTER_LEVEL,to);level++)if(!this.pending.includes(level)&&this.active?.level!==level)this.pending.push(level);}
 charge({x,y,z},duration){this.active={x,y:y+1.8,z,baseY:y,skyY:y+48,age:0,level:30,duration};}
 get flash(){return this.active?.duration?(.24+.18*Math.sin(this.active.age*24)**2):this.active?Math.max(0,1-this.active.age/.19)*.9:0;}
 update(dt,player,camera){
  if(this.disposed||dt<=0)return;
  if(this.active){this.active.age+=dt;if(this.active.age>=(this.active.duration||STORM_DURATION))this.active=null;}
  if(!this.active&&this.pending.length){const level=this.pending.shift();this.active={level,age:0,x:player.x,y:player.y+.8,z:player.z,baseY:player.y,skyY:Math.max(player.y+34,(camera.userData?.effectPosition?.y??camera.position.y)+35)};this.strikes++;this.onStrike(this.active);}
  const a=this.active;if(!a){this.hide();return;}
  const vertex=(mesh,i,x,y,z,r,g,b)=>{mesh.geometry.attributes.position.setXYZ(i,x,y,z);mesh.geometry.attributes.color.setXYZ(i,r,g,b);};
  let bc=0,wc=0;
  const line=(mesh,p,q,width,color)=>{
   const dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],len=Math.hypot(dx,dz)||1;
   // Ground lines expand horizontally; near-vertical sky ribbons face the camera.
   let rx=-dz/len,ry=0,rz=dx/len;if(Math.hypot(dx,dz)<Math.abs(dy)*.5){rx=.81;rz=-.585;}
   for(const [end,side]of [[0,-1],[1,-1],[1,1],[0,-1],[1,1],[0,1]]){const t=end?q:p;const i=mesh===this.beam?bc++:wc++;vertex(mesh,i,t[0]+rx*width*side,t[1]+ry,t[2]+rz*width*side,...color);}
  };
  const pulse=a.duration||a.age<.08||a.age>.12&&a.age<.23;
  if(pulse){
   let px=a.x,py=a.skyY,pz=a.z;
   for(let i=1;i<=18;i++){const t=i/18,envelope=Math.sin(t*Math.PI),x=a.x+Math.sin(i*2.73+Math.floor(a.age*35))*envelope*.8,y=a.skyY+(a.y-a.skyY)*t,z=a.z+Math.cos(i*1.8+Math.floor(a.age*30))*envelope*.5;
    line(this.beam,[px,py,pz],[x,y,z],a.duration?.16:.08,[.9,1,1]);line(this.beam,[px,py,pz],[x,y,z],a.duration?.46:.21,[.08,.35,.5]);
    if(i%5===0)line(this.beam,[x,y,z],[x+Math.sin(i)*1.8,y-1.2,z+Math.cos(i)*1.4],.04,[.2,.7,1]);px=x;py=y;pz=z;
   }
  }
  const radius=(5.2+a.level*.08)*Math.min(1,a.age/.5),fade=Math.max(0,1-a.age/(a.duration||STORM_DURATION));
  for(let i=0;i<64;i++){const angle=i/64*Math.PI*2,next=(i+1)/64*Math.PI*2;
   line(this.wave,[a.x+Math.cos(angle)*radius,a.baseY+.07,a.z+Math.sin(angle)*radius],[a.x+Math.cos(next)*radius,a.baseY+.07,a.z+Math.sin(next)*radius],.035,[.12*fade,.55*fade,fade]);
  }
  for(let i=0;i<16;i++){const angle=i*Math.PI/8,r=radius*.8,y=a.baseY+.1+Math.sin(a.age*25+i)*.15;
   line(this.wave,[a.x+Math.cos(angle)*r,y,a.z+Math.sin(angle)*r],[a.x+Math.cos(angle+.07)*(r+.4),a.baseY+.05,a.z+Math.sin(angle+.07)*(r+.4)],.025,[.4*fade,.9*fade,fade]);
  }
  for(const [mesh,count]of [[this.beam,bc],[this.wave,wc]]){mesh.geometry.setDrawRange(0,count);mesh.visible=count>0;for(const attr of Object.values(mesh.geometry.attributes))attr.needsUpdate=true;}
 }
 warm(){for(const m of [this.beam,this.wave]){m.visible=true;m.geometry.setDrawRange(0,6);}}
 hide(){for(const m of [this.beam,this.wave]){m.visible=false;m.geometry.setDrawRange(0,0);}}
 reset(){this.pending.length=0;this.active=null;this.strikes=0;this.hide();}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;for(const m of [this.beam,this.wave]){m.removeFromParent();m.geometry.dispose();m.material.dispose();}}
}
