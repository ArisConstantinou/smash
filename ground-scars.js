// Lightning changes the authored floor itself. Affected original instances are
// replaced by fractured, vertex-coloured slabs; no decal, texture or line mesh.
// Tiny surface relief is visual: the approved flat navigation stays unchanged.
import * as THREE from './vendor/three.module.js';
export const GROUND_SCAR_LIMIT=29;
const noise=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
// The same edge always splits at the same point, including the neighbouring
// triangle. Irregular pieces avoid a visible subdivision grid in the fracture.
const midpoint=(a,b)=>{
 const first=a[0]<b[0]||(a[0]===b[0]&&a[2]<b[2])?a:b,last=first===a?b:a;
 const t=.38+.24*noise(first[0]+last[0]*.31,first[2]+last[2]*.31);
 return first.map((v,i)=>v+(last[i]-v)*t);
};
const bounds=points=>({minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[2])),maxZ:Math.max(...points.map(p=>p[2]))});
const overlaps=(b,s)=>Math.hypot(Math.max(b.minX-s.x,0,s.x-b.maxX),Math.max(b.minZ-s.z,0,s.z-b.maxZ))<s.radius;
const structural=new Set(['asphalt','sidewalk','soil','ash','frost','brick']);
// Partition a floor polygon around a higher rectangular slab. Keeping only
// exposed tops prevents the second road strip from filling the first's cracks.
function outsideRect(polygon,rect){
 const result=[];let remaining=polygon;
 for(const [axis,edge,sign]of [[0,rect.minX,1],[0,rect.maxX,-1],[2,rect.minZ,1],[2,rect.maxZ,-1]]){
  const inside=[],outside=[];
  for(let i=0;i<remaining.length;i++){
   const a=remaining[i],b=remaining[(i+1)%remaining.length],da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;
   (da>=0?inside:outside).push(a);
   if((da>=0)!==(db>=0)){const t=da/(da-db),p=a.map((v,j)=>v+(b[j]-v)*t);inside.push(p);outside.push(p);}
  }
  if(outside.length>=3)result.push(outside);remaining=inside;if(!remaining.length)break;
 }
 return result;
}
export class GroundScars{
 constructor(scene){
  this.count=0;this.records=[];this.strikes=[];this.footprints=[];this.damaged=new Set();
  this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,-.2,0,0,-.2,1,1,-.2,0],3));this.geometry.setAttribute('color',new THREE.Float32BufferAttribute([.1,.1,.1,.1,.1,.1,.1,.1,.1],3));this.geometry.computeVertexNormals();this.geometry.setDrawRange(0,0);
  this.material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
  this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.name='lightning-fractured-city-floor';this.mesh.receiveShadow=true;this.mesh.visible=false;scene.add(this.mesh);
 }
 bind(world){
  this.reset();this.records=[];world.group.updateMatrixWorld(true);
  world.group.traverse(mesh=>{
   if(mesh.userData.groundSurfaces){
    mesh.userData.groundSurfaces.forEach((spec,index)=>{
     if(spec.top>.18||mesh.material.transparent)return;
     const matrix=new THREE.Matrix4();mesh.getMatrixAt(index,matrix);
     const corners=[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]].map(p=>new THREE.Vector3(...p).applyMatrix4(matrix).toArray());
     this.records.push({...spec,mesh,index,matrix,corners,triangles:[[corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]],bounds:bounds(corners),color:mesh.material.color.toArray()});
    });
   }else if(mesh.userData.groundSurface){
    const triangles=[],p=mesh.geometry.attributes.position,indices=mesh.geometry.index;
    for(let i=0;i<(indices?.count??p.count);i+=3)triangles.push([0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,indices?indices.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld).toArray()));
    this.records.push({...mesh.userData.groundSurface,mesh,triangles,bounds:bounds(triangles.flat()),color:mesh.material.color.toArray(),visible:mesh.visible});
   }
  });
 }
 setDamagedVisible(visible){
  for(const record of this.damaged){
   if(record.index!==undefined){const matrix=record.matrix.clone();if(visible)matrix.elements[13]-=1024;record.mesh.setMatrixAt(record.index,matrix);record.mesh.instanceMatrix.needsUpdate=true;}
   else record.mesh.visible=visible?false:record.visible;
  }
  this.mesh.visible=visible&&this.damaged.size>0;
 }
 add({x,y,z,level},radius){
  if(this.count>=GROUND_SCAR_LIMIT)return false;
  const reach=Math.sqrt(Math.max(0,radius*radius-(y-.04)**2));if(reach<.5)return false;
  this.strikes.push({x,z,radius:reach,level});this.count++;
  const strike=this.strikes.at(-1);
  // Repeated awards at the identical point have one maximum burn field. This
  // keeps every mark, while avoiding redundant trigonometry per terrain vertex.
  const same=this.footprints.find(s=>s.x===x&&s.z===z);
  if(same)same.radius=Math.max(same.radius,reach);else this.footprints.push({...strike});
  for(const record of this.records)if(overlaps(record.bounds,strike))this.damaged.add(record);
  this.rebuild();this.setDamagedVisible(true);return true;
 }
 strength(x,z){let value=0;for(const s of this.footprints){const dx=x-s.x,dz=z-s.z;if(Math.abs(dx)>s.radius||Math.abs(dz)>s.radius)continue;const a=Math.atan2(dz,dx),edge=.9+.06*Math.sin(a*5)+.04*Math.sin(a*9);value=Math.max(value,Math.max(0,1-Math.hypot(dx,dz)/(s.radius*edge)));}return value;}
 exposedTop(record){
  if(record.exposed)return record.exposed;
  let polygons=record.triangles;
  if(structural.has(record.kind))for(const upper of this.records){
   const a=record.bounds,b=upper.bounds;
   if(!structural.has(upper.kind)||upper.top<=record.top+.0001||b.minX>=a.maxX||b.maxX<=a.minX||b.minZ>=a.maxZ||b.maxZ<=a.minZ)continue;
   polygons=polygons.flatMap(poly=>outsideRect(poly,b));
  }
  return record.exposed=polygons.flatMap(poly=>poly.slice(1,-1).map((p,i)=>[poly[0],p,poly[i+2]])).filter(([a,b,c])=>Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))>1e-8);
 }
 rebuild(){
  const positions=[],colors=[],strengths=new WeakMap();
  const strengthAt=p=>{if(!strengths.has(p))strengths.set(p,this.strength(p[0],p[2]));return strengths.get(p);};
  const emit=(tri,color)=>{for(const p of tri){positions.push(...p);colors.push(...color);}};
  const visit=(tri,record,depth=0)=>{
   const b=bounds(tri),hit=this.footprints.some(s=>overlaps(b,s));
   const longest=Math.max(...[0,1,2].map(i=>Math.hypot(tri[i][0]-tri[(i+1)%3][0],tri[i][2]-tri[(i+1)%3][2])));
   if(hit&&longest>1.3&&depth<12){
    const [a,b,c]=tri,ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    for(const t of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])visit(t,record,depth+1);return;
   }
   const center=[0,1,2].map(i=>(tri[0][i]+tri[1][i]+tri[2][i])/3),power=strengthAt(center);
   if(power<.015){emit(tri,record.color);return;}
   // The actual painted instance loses chips, exposing the altered road below.
   if(record.paint&&power>.15&&(power>.5||noise(center[0],center[2])<power))return;
   const rough=noise(center[0],center[2]);
   const colorAt=p=>{const strength=strengthAt(p),shade=1-Math.min(.64,strength*1.1);return record.color.map(c=>c*shade);};
   const color=colorAt(center);
   // Open, shallow fractures inside the burnt zone. Each irregular slab has
   // visible thickness and a small independent tilt, exposing fresh aggregate.
   const crack=record.paint||record.kind==='grass'||power<.32?0:Math.min(.09,longest*.075)*power;
   const top=tri.map(p=>{
    const dx=center[0]-p[0],dz=center[2]-p[2],length=Math.hypot(dx,dz)||1;
    const local=strengthAt(p),dip=record.paint?0:record.kind==='grass'?local*.18:local*(rough>.88?-.045:.025+rough*.075);
    return [p[0]+dx/length*crack,p[1]-dip,p[2]+dz/length*crack];
   });
   for(let i=0;i<3;i++){positions.push(...top[i]);colors.push(...colorAt(tri[i]));}
   // Genuine cut edges below each separated slab, rather than drawn cracks.
   if(crack>.001){
    const dark=record.color.map((c,i)=>c*.35+[.075,.085,.075][i]*(.7+rough*.4)),bottom=Math.min(record.bottom,Math.min(...top.map(p=>p[1]))-.07);
    for(let i=0;i<3;i++){const a=top[i],b=top[(i+1)%3],c=[a[0],bottom,a[2]],d=[b[0],bottom,b[2]];emit([a,c,b],dark);emit([b,c,d],dark);}
   }
  };
  for(const record of this.damaged){
   for(const tri of this.exposedTop(record))visit(tri,record);
   if(record.corners){
    // Keep the original outer slab faces; only its top is fractured.
    for(let i=0;i<4;i++){const a=record.corners[i],b=record.corners[(i+1)%4],c=[a[0],record.bottom,a[2]],d=[b[0],record.bottom,b[2]];emit([a,c,b],record.color);emit([b,c,d],record.color);}
   }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const previous=this.geometry;this.geometry=geometry;this.mesh.geometry=geometry;previous.dispose();
 }
 warm(){this.mesh.visible=true;this.geometry.setDrawRange(0,3);}
 reset(){this.setDamagedVisible(false);this.damaged.clear();this.strikes=[];this.footprints=[];this.count=0;this.mesh.visible=false;this.geometry.setDrawRange(0,0);}
 dispose(){this.reset();this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();this.records=[];}
}
