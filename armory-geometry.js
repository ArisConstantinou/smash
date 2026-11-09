import * as THREE from './vendor/three.module.js';
const Y=new THREE.Vector3(0,1,0),raw=new THREE.MeshBasicMaterial(),unitBox=new THREE.BoxGeometry(1,1,1);
export const ARMORY_PALETTE={paint:0x315d70,light:0x6c919d,steel:0xaab8b8,dark:0x19272e,gold:0xcba35c,wood:0x8e542c,woodLight:0xc2894c,leather:0x4c3024,cyan:0x67dbea};
export function armoryPalette(finish='navy',customColor){
 if(customColor){
  const paint=Number.parseInt(customColor.slice(1),16);
  const light=new THREE.Color(paint).lerp(new THREE.Color(0xffffff),.30).getHex();
  return {...ARMORY_PALETTE,paint,light};
 }
 return {...ARMORY_PALETTE,...({oxide:{paint:0x874539,light:0xbb7561},ivory:{paint:0xbfc5ad,light:0xe3e5cb},bronze:{paint:0x8a623c,light:0xc09557}}[finish]||{})};
}
export function armoryBuilder(){
 const root=new THREE.Group();
 function add(geometry,color,x=0,y=0,z=0,rotation=[0,0,0],scale=[1,1,1],grain=false,shared=false){const mesh=new THREE.Mesh(geometry,raw);mesh.position.set(x,y,z);mesh.rotation.set(...rotation);mesh.scale.set(...scale);mesh.userData={color,grain,shared};root.add(mesh);return mesh;}
 function poly(color,points,depth=.08,z=0,holes=[],bevel=.012){const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();for(const points of holes){const path=new THREE.Path();points.slice().reverse().forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();shape.holes.push(path);}const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel*.7,bevelSegments:1,steps:1,curveSegments:20});g.translate(0,0,-depth/2);return add(g,color,0,0,z);}
 function bevel(color,x,y,z,w,h,d,b=.025){b=Math.min(b,w*.16,h*.16,d*.25);const points=[[-w/2+b,-h/2],[w/2-b,-h/2],[w/2,-h/2+b],[w/2,h/2-b],[w/2-b,h/2],[-w/2+b,h/2],[-w/2,h/2-b],[-w/2,-h/2+b]];const m=poly(color,points,d,0,[],b*.75);m.position.set(x,y,z);return m;}
 function cylinder(color,x,y,z,r,h,axis='y',segments=12,r2=r){return add(new THREE.CylinderGeometry(r,r2,h,segments),color,x,y,z,axis==='x'?[0,0,Math.PI/2]:axis==='z'?[Math.PI/2,0,0]:[0,0,0]);}
 function ring(color,x,y,z,r,t=.015,axis='z',segments=24){return add(new THREE.TorusGeometry(r,t,5,segments),color,x,y,z,axis==='x'?[0,Math.PI/2,0]:axis==='y'?[Math.PI/2,0,0]:[0,0,0]);}
 function rod(color,a,b,r=.025){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av),m=cylinder(color,...av.add(bv).multiplyScalar(.5).toArray(),r,delta.length());m.quaternion.setFromUnitVectors(Y,delta.normalize());return m;}
 function bolt(color,x,y,z,r=.023,axis='z'){return cylinder(color,x,y,z,r,.025,axis,6);}
 function cone(color,x,y,z,r,h,direction=[0,0,1]){const m=add(new THREE.ConeGeometry(r,h,8),color,x,y,z);m.quaternion.setFromUnitVectors(Y,new THREE.Vector3(...direction).normalize());return m;}
 function finish(material){root.updateMatrixWorld(true);const buckets=Array.from({length:4},()=>({position:[],normal:[],color:[],uv:[]})),point=new THREE.Vector3();root.traverse(m=>{if(!m.isMesh)return;const geo=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();geo.applyMatrix4(m.matrixWorld);const hex=m.userData.color,wood=m.userData.grain||[0x8e542c,0xc2894c,0x60371f].includes(hex),leather=[0x4c3024,0x76513b].includes(hex),glow=[0x67dbea,0xff8c32,0xb2e9ee].includes(hex),surface=Array.isArray(material)?wood?0:leather?1:glow?3:2:0,bucket=buckets[surface];bucket.position.push(...geo.attributes.position.array);bucket.normal.push(...geo.attributes.normal.array);const color=new THREE.Color(glow?hex:m.userData.paint??hex),p=geo.attributes.position,uv=geo.attributes.uv;for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i);const grain=m.userData.grain ? .90+.07*Math.sin(Math.atan2(point.z,point.x)*11+point.y*3):1;bucket.color.push(color.r*grain,color.g*grain,color.b*grain);bucket.uv.push(uv?uv.getX(i):point.x*2,uv?uv.getY(i):point.y*2);}geo.dispose();if(!m.userData.shared)m.geometry.dispose();});const g=new THREE.BufferGeometry(),position=[],normal=[],color=[],uv=[];let offset=0;for(let i=0;i<buckets.length;i++){const b=buckets[i],count=b.position.length/3;if(!count)continue;g.addGroup(offset,count,i);offset+=count;position.push(...b.position);normal.push(...b.normal);color.push(...b.color);uv.push(...b.uv);}g.setAttribute('position',new THREE.Float32BufferAttribute(position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.castShadow=mesh.receiveShadow=true;root.clear();return mesh;}
 return {mark:()=>root.children.length,tint(color,from=0){if(color)for(let i=from;i<root.children.length;i++)root.children[i].userData.paint=color;},add,poly,bevel,cylinder,ring,rod,bolt,cone,box:(c,x,y,z,w,h,d)=>add(unitBox,c,x,y,z,[0,0,0],[w,h,d],false,true),finish};
}
export function sculptedWoodGeometry(kind='knotted'){
 const segments=32,rings=24,positions=[],indices=[],uv=[];for(let j=0;j<=rings;j++){const t=j/rings,y=-.29+t*.98;let radius=kind==='knotted'?.09+.22*Math.sin(t*Math.PI*.88)**.8:.115+.16*Math.sin(t*Math.PI*.66);for(let i=0;i<=segments;i++){const angle=i/segments*Math.PI*2,lobe=kind==='knotted'?1+.13*Math.sin(angle*3+t*14)+.06*Math.sin(angle*7-t*8):1+.025*Math.sin(angle*8),cx=kind==='knotted'?.06*Math.sin(t*5):0;positions.push(cx+Math.cos(angle)*radius*lobe,y,Math.sin(angle)*radius*lobe);uv.push(i/segments,t*1.7);}}
 for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);}for(const row of [0,rings]){const center=positions.length/3;positions.push(0,-.29+row/rings*.98,0);uv.push(.5,.5);for(let i=0;i<segments;i++){const a=row*(segments+1)+i;row?indices.push(center,a,a+1):indices.push(center,a+1,a);}}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function cartridge(builder,P,kind,x,y,z,rank=1){
 const b=builder,size=.9+Math.min(4,rank-1)*.025,r=.062*size;for(const side of [-1,1]){b.cylinder(P.steel,x+side*.14,y,z,r+.015,.045,'x',10);b.ring(P.gold,x+side*.12,y,z,r+.012,.009,'x',16);}b.rod(P.dark,[x-.14,y,z],[x+.14,y,z],r*.83);
 if(kind==='arc'){for(let i=-2;i<=2;i++)b.ring(P.cyan,x+i*.042,y,z,r*.87,.011,'x',16);}
 else if(kind==='fire'){b.cylinder(0xff8c32,x,y,z,r*.70,.21,'x',10);for(const side of [-1,1])for(const offset of [-.045,.045])b.rod(P.dark,[x+side*.105,y+offset,z+r*.82],[x-side*.105,y+offset,z+r*.82],.009);}
 else if(kind==='frost'){for(const side of [-1,0,1]){const g=new THREE.IcosahedronGeometry(.061,0);b.add(g,0xb2e9ee,x+side*.067,y,z,[side*.2,.1,side*.3],[1,.8,.8]);}}
 else{b.rod(P.gold,[x-.11,y,z],[x+.11,y,z],.025);for(const offset of [-.065,0,.065])b.ring(P.gold,x+offset,y,z,r*.73,.008,'x',16);}
 for(const side of [-1,1])b.rod(P.steel,[x+side*.14,y-.04,z-.03],[x+side*.14,y-.10,z-.03],.015);
}
