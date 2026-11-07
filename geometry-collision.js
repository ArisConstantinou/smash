import * as T from './vendor/three.module.js';
import {BOUNDS,clamp,moveCircle,circleOverlaps} from './core.js?v=20261106-kick6';

// The architectural model, including its surviving fracture indices, is the
// collision source. A small XZ grid is built lazily for touched objects. The
// stable root transform excludes cosmetic impact shudder but follows vehicles.
const CELL=2,EPS=1e-6,cache=new WeakMap();
const up=new T.Vector3(0,1,0),point=new T.Vector3(),closest=new T.Vector3();
const a=new T.Vector3(),b=new T.Vector3(),q=new T.Vector3(),v=new T.Vector3();
function key(x,z){return Math.floor(x/CELL)+','+Math.floor(z/CELL);}
function modelTriangles(o){
  if(!o.mesh)return null;
  const signature=[o.destruction?.revision||0,o.x,o.z,o.baseY??o.mesh.position.y,o.baseRotation?.y??o.mesh.rotation.y].join(':');
  const prior=cache.get(o);if(prior?.signature===signature)return prior;
  const root=o.mesh;root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),rotation=o.baseRotation||root.rotation;
  const stable=new T.Matrix4().compose(new T.Vector3(o.x,o.baseY??root.position.y,o.z),new T.Quaternion().setFromEuler(rotation),root.scale);
  const grid=new Map();let triangleCount=0;
  root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
    // Hidden authoring helpers and removed meshes never become platforms.
    for(let node=mesh;node&&node!==root;node=node.parent)if(!node.visible)return;
    const geometry=mesh.geometry,p=geometry.attributes.position,idx=geometry.index;
    const matrix=new T.Matrix4().multiplyMatrices(stable,inverse).multiply(mesh.matrixWorld);
    const start=geometry.drawRange.start||0,end=Math.min(idx?.count??p.count,start+(geometry.drawRange.count??Infinity));
    for(let i=start;i+2<end;i+=3){
      const vertices=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+j):i+j).applyMatrix4(matrix));
      const tri=new T.Triangle(...vertices),normal=tri.getNormal(new T.Vector3());if(normal.lengthSq()<.5)continue;
      const bounds=new T.Box3().setFromPoints(vertices),item={tri,normal,bounds};triangleCount++;
      for(let x=Math.floor(bounds.min.x/CELL);x<=Math.floor(bounds.max.x/CELL);x++)for(let z=Math.floor(bounds.min.z/CELL);z<=Math.floor(bounds.max.z/CELL);z++){
        const k=x+','+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(item);
      }
    }
  });
  const result={signature,grid,triangleCount};cache.set(o,result);return result;
}
function at(o,x,z,r=0){
  const data=modelTriangles(o);if(!data)return null;
  if(!r)return data.grid.get(key(x,z))||[];
  const triangles=new Set();
  for(let i=Math.floor((x-r)/CELL);i<=Math.floor((x+r)/CELL);i++)for(let j=Math.floor((z-r)/CELL);j<=Math.floor((z+r)/CELL);j++)for(const t of data.grid.get(i+','+j)||[])triangles.add(t);
  return triangles;
}
function heightAt(tri,x,z){
  const {a,b,c}=tri,det=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(det)<1e-10)return null;
  const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/det;
  const v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/det;
  if(u< -EPS||v< -EPS||u+v>1+EPS)return null;
  return u*a.y+v*b.y+(1-u-v)*c.y;
}
function footHeight(tri,x,z,radius){
  const center=heightAt(tri,x,z);if(center!==null)return center;
  let best=radius*radius+EPS,result=null;
  for(const [a,b]of [[tri.a,tri.b],[tri.b,tri.c],[tri.c,tri.a]]){
    const dx=b.x-a.x,dz=b.z-a.z,den=dx*dx+dz*dz;
    const t=den>EPS?clamp(((x-a.x)*dx+(z-a.z)*dz)/den,0,1):0;
    const px=a.x+dx*t,pz=a.z+dz*t,d=(x-px)**2+(z-pz)**2;
    if(d<=best){best=d;result=a.y+(b.y-a.y)*t;}
  }return result;
}
export function geometrySupport(objects,x,z,ceiling=Infinity,radius=.44){
  let height=0;
  for(const o of objects){
    if(o.dead||o.solid===false)continue;
    if(!o.mesh){if(o.h<=ceiling+EPS&&circleOverlaps(x,z,radius,o))height=Math.max(height,o.h);continue;}
    for(const item of at(o,x,z,radius)){
      if(item.normal.y<.55||item.bounds.min.y>ceiling+EPS||item.bounds.max.y<height-EPS)continue;
      const y=footHeight(item.tri,x,z,radius);if(y!==null&&y<=ceiling+EPS)height=Math.max(height,y);
    }
  }
  return height;
}
export function geometryCeiling(objects,x,z,oldHead,newHead,radius=.44){
  let height=Infinity;const r=radius*.5;
  for(const o of objects){if(o.dead||!o.mesh||o.solid===false)continue;
    for(const [px,pz]of [[x,z],[x-r,z],[x+r,z],[x,z-r],[x,z+r]])for(const item of at(o,px,pz)){
      if(item.normal.y>-.4||item.bounds.max.y<oldHead-EPS||item.bounds.min.y>newHead+EPS)continue;
      const y=heightAt(item.tri,px,pz);if(y!==null&&y>=oldHead-EPS&&y<=newHead+EPS)height=Math.min(height,y);
    }
  }return height;
}
// Closest points between the upright capsule segment and a triangle edge.
function edgeDistance(p1,q1,p2,q2,out1,out2){
  const d1=q1.clone().sub(p1),d2=q2.clone().sub(p2),r=p1.clone().sub(p2);
  const aa=d1.dot(d1),ee=d2.dot(d2),ff=d2.dot(r),cc=d1.dot(r),bb=d1.dot(d2);
  let s=0,t=0;
  if(aa<=EPS){t=clamp(ff/Math.max(ee,EPS),0,1);}
  else if(ee<=EPS){s=clamp(-cc/aa,0,1);}
  else{const denom=aa*ee-bb*bb;s=denom>EPS?clamp((bb*ff-cc*ee)/denom,0,1):0;t=(bb*s+ff)/ee;
    if(t<0){t=0;s=clamp(-cc/aa,0,1);}else if(t>1){t=1;s=clamp((bb-cc)/aa,0,1);}}
  out1.copy(p1).addScaledVector(d1,s);out2.copy(p2).addScaledVector(d2,t);return out1.distanceToSquared(out2);
}
function capsuleContact(item,x,y,z,radius,height){
  const tri=item.tri;a.set(x,y+.01,z);b.set(x,y+Math.max(radius,height-radius),z);
  let distance=Infinity,delta=new T.Vector3();
  for(const endpoint of [a,b]){tri.closestPointToPoint(endpoint,closest);const d=endpoint.distanceToSquared(closest);if(d<distance){distance=d;delta.subVectors(endpoint,closest);}}
  for(const [p1,p2]of [[tri.a,tri.b],[tri.b,tri.c],[tri.c,tri.a]]){
    const d=edgeDistance(a,b,p1,p2,q,point);if(d<distance){distance=d;delta.subVectors(q,point);}}
  const planeA=v.subVectors(a,tri.a).dot(item.normal),planeB=v.subVectors(b,tri.a).dot(item.normal);
  if(planeA*planeB<=0&&Math.abs(planeA-planeB)>EPS){q.copy(a).lerp(b,planeA/(planeA-planeB));if(tri.containsPoint(q)){distance=0;delta.copy(item.normal);}}
  if(distance>=(radius-.001)**2)return null;
  const d=Math.sqrt(distance);if(d>1e-7)delta.divideScalar(d);else delta.copy(item.normal);
  const horizontal=Math.hypot(delta.x,delta.z);if(horizontal<.08)return null;
  return {x:delta.x/horizontal,z:delta.z/horizontal,depth:Math.min(.24,(radius-d+.001)/horizontal)};
}
export function moveOnGeometry(entity,dx,dz,objects,radius=.44,height=1.78,{stepHeight=.28,bounds=BOUNDS}={}){
  const fromX=entity.x,fromZ=entity.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/Math.min(.14,radius*.45)));
  const solids=objects.filter(o=>!o.dead&&o.solid!==false),fallback=solids.filter(o=>!o.mesh&&o.h>(entity.y||0)+EPS);
  for(let step=0;step<steps;step++){
    if(fallback.length)moveCircle(entity,dx/steps,dz/steps,fallback,radius);
    else {entity.x+=dx/steps;entity.z+=dz/steps;}
    const floor=geometrySupport(solids,entity.x,entity.z,(entity.y||0)+stepHeight,radius);
    if(stepHeight>0&&floor>entity.y&&floor-entity.y<=stepHeight+EPS)entity.y=floor;
    for(let pass=0;pass<3;pass++){
      let corrected=false;
      for(const o of solids){if(!o.mesh)continue;
        for(const item of at(o,entity.x,entity.z,radius)){
          if(item.bounds.max.y<=entity.y+1e-6||item.bounds.min.y>entity.y+height||
             item.bounds.max.x<entity.x-radius||item.bounds.min.x>entity.x+radius||
             item.bounds.max.z<entity.z-radius||item.bounds.min.z>entity.z+radius)continue;
          // Walkable slopes at feet are supports, not an invisible vertical wall.
          if(item.normal.y>.55){const h=heightAt(item.tri,entity.x,entity.z);if(h!==null&&h<=entity.y+.30)continue;}
          const contact=capsuleContact(item,entity.x,entity.y||0,entity.z,radius,height);
          if(contact){entity.x+=contact.x*contact.depth;entity.z+=contact.z*contact.depth;corrected=true;}
        }
      }if(!corrected)break;
    }
    entity.x=clamp(entity.x,-bounds+radius,bounds-radius);entity.z=clamp(entity.z,-bounds+radius,bounds-radius);
  }
  return{x:entity.x-fromX,z:entity.z-fromZ};
}
export function invalidateGeometry(object){cache.delete(object);}
