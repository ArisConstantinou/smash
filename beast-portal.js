import * as THREE from './vendor/three.module.js';
// One reusable, precompiled rift. All imagery is authored locally; no remote
// image, postprocessing pass, light/shadow map or per-frame geometry creation.
function riftTexture(){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 const c=canvas.getContext('2d');if(!c?.createRadialGradient)return null;
 c.fillStyle='#020411';c.fillRect(0,0,512,512);
 const glow=c.createRadialGradient(256,256,12,256,256,256);glow.addColorStop(0,'#030817');glow.addColorStop(.65,'#152755');glow.addColorStop(.9,'#664bd0');glow.addColorStop(1,'#71f6ff');c.fillStyle=glow;c.fillRect(0,0,512,512);
 for(let j=0;j<12;j++){c.beginPath();for(let i=0;i<100;i++){const t=i/99,a=t*4.2+j*Math.PI/6,r=28+t*222,x=256+Math.cos(a)*r,y=256+Math.sin(a)*r;i?c.lineTo(x,y):c.moveTo(x,y);}c.strokeStyle=j%2?'#49aacc66':'#b97bfa66';c.lineWidth=2+j%4;c.stroke();}
 for(let i=0;i<140;i++){const a=i*2.39996,r=Math.sqrt((i+.5)/140)*239,x=256+Math.cos(a)*r,y=256+Math.sin(a)*r;c.fillStyle=i%3?'#bdeaff':'#cda6ff';c.fillRect(x,y,i%13===0?2:1,i%13===0?2:1);}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export class BeastPortal{
 constructor(scene){
  this.root=new THREE.Group();this.root.name='road-space-rift';this.root.visible=false;scene.add(this.root);this.width=1;this.height=1;this.time=0;
  const mat=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity===1,fog:false});
  this.texture=riftTexture();this.disc=new THREE.Mesh(new THREE.CircleGeometry(.98,64),mat(0xffffff));if(this.texture)this.disc.material.map=this.texture;else this.disc.material.color.setHex(0x3c286a);this.root.add(this.disc);
  this.rings=[];for(const [radius,tube,color,alpha]of [[1,.026,0x94faff,1],[1.055,.012,0x8262ed,.8],[1.09,.009,0xb3e6ff,.6]]){const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,6,64),mat(color,alpha));this.root.add(ring);this.rings.push(ring);}
  this.arcs=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xb4e9ff,transparent:true,opacity:.8,fog:false}));this.arcPositions=new Float32Array(12*8*6);this.arcs.geometry.setAttribute('position',new THREE.BufferAttribute(this.arcPositions,3).setUsage(THREE.DynamicDrawUsage));this.root.add(this.arcs);
  this.ground=new THREE.Mesh(new THREE.RingGeometry(.78,1,64),mat(0x9171ff,.36));this.ground.rotation.x=-Math.PI/2;this.ground.position.y=.07;scene.add(this.ground);this.ground.visible=false;this.lastArc=-1;
 }
 open(location,width,height){this.location=location;this.width=width;this.height=height;this.time=0;this.root.position.set(location.x,height*.5+.06,location.z);this.root.rotation.y=location.yaw;this.ground.position.set(location.x,.07,location.z);this.root.visible=this.ground.visible=true;this.update(0,0);}
 update(dt,amount=1){
  this.time+=dt;const a=Math.max(.001,Math.min(1,amount));this.root.scale.set(this.width*.5*a,this.height*.5*a,1);this.root.position.y=this.height*.5*a+.06;this.ground.scale.set(this.width*.58*a,this.width*.58*a,1);this.disc.rotation.z=this.time*.08;
  this.rings.forEach((r,i)=>{r.rotation.z=(i%2?-1:1)*this.time*(.18+i*.09);r.material.opacity=(i? .7:1)*(.9+Math.sin(this.time*10+i)*.1);});
  const tick=Math.floor(this.time*10);if(tick!==this.lastArc){this.lastArc=tick;let k=0;for(let j=0;j<12;j++)for(let i=0;i<8;i++){const angle=j*Math.PI/6+tick*.09,t=i/8,r=1.025+Math.sin(i*2.7+j+tick)*.03,s=1.025+Math.sin((i+1)*2.7+j+tick)*.03;this.arcPositions[k++]=Math.cos(angle+t*.35)*r;this.arcPositions[k++]=Math.sin(angle+t*.35)*r;this.arcPositions[k++]=.05;this.arcPositions[k++]=Math.cos(angle+(t+.125)*.35)*s;this.arcPositions[k++]=Math.sin(angle+(t+.125)*.35)*s;this.arcPositions[k++]=.05;}this.arcs.geometry.attributes.position.needsUpdate=true;}
 }
 warm(){this.root.visible=this.ground.visible=true;}
 reset(){this.root.visible=this.ground.visible=false;this.location=null;}
 dispose(){this.root.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});this.ground.geometry.dispose();this.ground.material.dispose();this.texture?.dispose();this.root.removeFromParent();this.ground.removeFromParent();}
}
