import {sweepPartWasm} from './collision-wasm.js?v=20261107-perf14';
import * as THREE from './vendor/three.module.js';

// Physics uses the same solid pieces as the rendered architecture. The broad
// city rectangles still serve navigation/placement, but never become roofs.
// A cache is built only for a nearby mesh. Its small X/Z grid and Y bounds
// select individual parts before any triangle or contact work is performed.
const CELL = 1.6, EPS = 1e-6, SKIN = 2e-5, WALKABLE_Y = .48;
export const BODY_HEIGHT = 1.88;
export const STEP_HEIGHT = .42;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const point = (x, y, z) => ({x, y, z});
const cross2 = (a, b, c) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const cellKey = (x, z) => `${x},${z}`;

function makePart(position, indices) {
  const vertices=[], triangles=[], lookup=new Map(), edges=[], edgeKeys=new Map();
  const bounds=new THREE.Box3();
  for(let i=0;i+2<indices.length;i+=3) {
    const ids=[];
    for(let k=0;k<3;k++) {
      const n=indices[i+k], x=position.getX(n), y=position.getY(n), z=position.getZ(n);
      if(!Number.isFinite(x+y+z))return null;
      const key=`${x},${y},${z}`;
      let id=lookup.get(key);
      if(id===undefined){id=vertices.length;lookup.set(key,id);const v=new THREE.Vector3(x,y,z);vertices.push(v);bounds.expandByPoint(v);}
      ids.push(id);
    }
    if(new Set(ids).size<3)continue;
    triangles.push(ids);
    for(let k=0;k<3;k++) {
      const a=ids[k], b=ids[(k+1)%3], key=a<b?`${a},${b}`:`${b},${a}`;
      if(!edgeKeys.has(key)){edgeKeys.set(key,1);edges.push([a,b]);}
      else edgeKeys.set(key,edgeKeys.get(key)+1);
    }
  }
  if(!triangles.length)return null;
  const closed=vertices.length>=4&&[...edgeKeys.values()].every(uses=>uses===2);
  return {vertices,triangles,edges,bounds,closed,worldRevision:-1};
}

function buildGeometry(geometry, diagnostics, previous) {
  const position=geometry.attributes.position, index=geometry.index;
  if(!position)return {parts:[],cells:new Map(),bounds:new THREE.Box3()};
  const specs=geometry.userData.collisionParts||geometry.userData.fractureParts;
  const first=Math.max(0,geometry.drawRange.start||0),end=Math.min(index?.count??position.count,first+geometry.drawRange.count);
  const visibleIndices=index?index.array.subarray(first,end):null;
  const active=visibleIndices?new Set(visibleIndices):null, parts=[];
  // A hit rewrites only the live-piece index. Reuse the immutable local solid
  // of each surviving whole piece; rebuilding its vertices/edges every hit
  // stalls dense destruction. Edited vertices or partial pieces still rebuild.
  const reusable=previous?.geometry===geometry&&previous.position===position&&previous.positionVersion===position.version&&previous.specs===specs;
  const localParts=reusable?previous.localParts:new Map();
  const add=indices=>{diagnostics.partBuilds++;const part=makePart(position,indices);if(part)parts.push(part);return part;};
  if(specs?.length) {
    for(const spec of specs) {
      // A fracture removes whole pieces by rewriting the render index. The
      // collision cache reads that exact index, including an empty last batch.
      if(active&&!active.has(spec.start))continue;
      const ids=[];
      for(let i=spec.start;i+2<spec.start+spec.count;i+=3) {
        if(active&&(!active.has(i)||!active.has(i+1)||!active.has(i+2)))continue;
        ids.push(i,i+1,i+2);
      }
      const whole=ids.length===spec.count;
      const cached=whole&&localParts.get(spec);
      if(cached)parts.push({...cached,worldRevision:-1});
      else{const part=add(ids);if(whole&&part)localParts.set(spec,part);}
    }
  } else {
    const ids=index?Array.from(visibleIndices):Array.from({length:Math.max(0,end-first)},(_,i)=>i+first);
    // Ordinary Three primitives are convex. An unknown merged mesh falls back
    // to its individual triangle faces, never a hull over disconnected parts.
    if(/^(Box|Cylinder|Cone|Sphere|Icosahedron|Octahedron|Tetrahedron|Plane)Geometry$/.test(geometry.type))add(ids);
    else for(let i=0;i+2<ids.length;i+=3)add(ids.slice(i,i+3));
  }
  const cells=new Map(), bounds=new THREE.Box3();
  for(const [id,p] of parts.entries()) {
    bounds.union(p.bounds);
    for(let z=Math.floor(p.bounds.min.z/CELL);z<=Math.floor(p.bounds.max.z/CELL);z++)
      for(let x=Math.floor(p.bounds.min.x/CELL);x<=Math.floor(p.bounds.max.x/CELL);x++) {
        const key=cellKey(x,z);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);
      }
  }
  diagnostics.cacheBuilds++;
  return {geometry,position,positionVersion:position.version,specs,localParts,index,indexVersion:index?.version,drawStart:geometry.drawRange.start,drawCount:geometry.drawRange.count,parts,cells,bounds,
    matrix:new THREE.Matrix4().makeScale(0,0,0),inverse:new THREE.Matrix4(),worldBounds:new THREE.Box3(),revision:0};
}

function worldPart(part, cache) {
  if(part.worldRevision===cache.revision)return part;
  part.worldVertices=part.vertices.map(v=>v.clone().applyMatrix4(cache.matrix));
  part.worldBounds=new THREE.Box3().setFromPoints(part.worldVertices);
  part.worldTriangles=part.triangles.map(ids=>{
    const [a,b,c]=ids.map(i=>part.worldVertices[i]);
    const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
    return {a,b,c,normal};
  });
  part.worldRevision=cache.revision;
  return part;
}

function polygonContains(poly,x,z) {
  if(poly.length<3)return false;
  let positive=false,negative=false;
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],cross=(b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);
    positive ||= cross>EPS;negative ||= cross<-EPS;
    if(positive&&negative)return false;
  }
  return true;
}

// Highest/lowest point of the real triangle beneath a circular footprint.
// Checking vertices, edge/circle crossings and the plane's circle extremum
// avoids the ray-sampling gaps that used to lose narrow signs and roof edges.
function surfaceExtreme(triangle,x,z,radius,maximize=true) {
  const {a,b,c,normal}=triangle;
  if(Math.abs(normal.y)<EPS)return null;
  const poly=[a,b,c],r=Math.max(0,radius-SKIN),rr=r*r;
  const at=(px,pz)=>a.y-(normal.x*(px-a.x)+normal.z*(pz-a.z))/normal.y;
  let extreme=maximize?-Infinity:Infinity,found=false;
  const include=(px,pz)=>{const h=at(px,pz);extreme=maximize?Math.max(extreme,h):Math.min(extreme,h);found=true;};
  if(polygonContains(poly,x,z))include(x,z);
  if(r<=EPS)return found?extreme:null;
  for(const v of poly)if((v.x-x)**2+(v.z-z)**2<=rr+EPS)include(v.x,v.z);
  const gx=-normal.x/normal.y,gz=-normal.z/normal.y,g=Math.hypot(gx,gz),sign=maximize?1:-1;
  if(g>EPS) {
    const px=x+sign*r*gx/g,pz=z+sign*r*gz/g;
    if(polygonContains(poly,px,pz))include(px,pz);
  }
  for(let i=0;i<3;i++) {
    const p=poly[i],q=poly[(i+1)%3],dx=q.x-p.x,dz=q.z-p.z,ox=p.x-x,oz=p.z-z;
    const aa=dx*dx+dz*dz;if(aa<=EPS)continue;
    const bb=2*(dx*ox+dz*oz),cc=ox*ox+oz*oz-rr,disc=bb*bb-4*aa*cc;
    if(disc<-EPS)continue;
    const root=Math.sqrt(Math.max(0,disc));
    for(const t of [(-bb-root)/(2*aa),(-bb+root)/(2*aa)])if(t>=-EPS&&t<=1+EPS)include(p.x+clamp(t,0,1)*dx,p.z+clamp(t,0,1)*dz);
  }
  return found?extreme:null;
}

function convexHull(points) {
  const sorted=points.sort((a,b)=>a.x-b.x||a.z-b.z),unique=[];
  for(const p of sorted)if(!unique.length||Math.abs(p.x-unique.at(-1).x)>EPS||Math.abs(p.z-unique.at(-1).z)>EPS)unique.push(p);
  if(unique.length<3)return unique;
  const lower=[],upper=[];
  for(const p of unique){while(lower.length>1&&cross2(lower.at(-2),lower.at(-1),p)<=EPS)lower.pop();lower.push(p);}
  for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>1&&cross2(upper.at(-2),upper.at(-1),p)<=EPS)upper.pop();upper.push(p);}
  lower.pop();upper.pop();return lower.concat(upper);
}

// Intersect one convex rendered piece with the actor's vertical span. Its
// projected polygon is the precise horizontal obstruction at that height;
// balconies do not block the street below, and gables do not fill their AABB.
function slicePart(part,low,high) {
  const points=[],v=part.worldVertices;
  for(const p of v)if(p.y>=low-EPS&&p.y<=high+EPS)points.push(point(p.x,p.y,p.z));
  for(const [a,b] of part.edges) {
    const p=v[a],q=v[b],dy=q.y-p.y;if(Math.abs(dy)<EPS)continue;
    for(const y of [low,high]) {
      const t=(y-p.y)/dy;
      if(t>EPS&&t<1-EPS)points.push(point(p.x+(q.x-p.x)*t,y,p.z+(q.z-p.z)*t));
    }
  }
  return convexHull(points);
}

function circleCorrection(poly,x,z,radius) {
  if(!poly.length)return null;
  let nearest=Infinity,bestX=0,bestZ=0,outX=1,outZ=0;
  const inside=polygonContains(poly,x,z);
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
    const t=len2>EPS?clamp(((x-a.x)*dx+(z-a.z)*dz)/len2,0,1):0;
    const px=a.x+dx*t,pz=a.z+dz*t,distance=Math.hypot(x-px,z-pz);
    if(distance<nearest){nearest=distance;bestX=px;bestZ=pz;const len=Math.sqrt(len2);if(len>EPS){outX=dz/len;outZ=-dx/len;}}
  }
  if(inside)return {x:outX*(radius+nearest+SKIN),z:outZ*(radius+nearest+SKIN)};
  if(nearest>=radius-SKIN)return null;
  if(nearest>EPS)return {x:(x-bestX)*(radius+SKIN-nearest)/nearest,z:(z-bestZ)*(radius+SKIN-nearest)/nearest};
  return {x:outX*(radius+SKIN),z:outZ*(radius+SKIN)};
}

function dot(a,b){return a.x*b.x+a.y*b.y+a.z*b.z;}
function delta(a,b){return point(a.x-b.x,a.y-b.y,a.z-b.z);}
function along(a,v,t){return point(a.x+v.x*t,a.y+v.y*t,a.z+v.z*t);}
function triangleContains3D(tri,p) {
  const {a,b,c}=tri,v0=delta(b,a),v1=delta(c,a),v2=delta(p,a);
  const aa=dot(v0,v0),ab=dot(v0,v1),bb=dot(v1,v1),pa=dot(v2,v0),pb=dot(v2,v1),det=aa*bb-ab*ab;
  if(Math.abs(det)<1e-14)return false;
  const u=(bb*pa-ab*pb)/det,v=(aa*pb-ab*pa)/det;
  return u>=-EPS&&v>=-EPS&&u+v<=1+EPS;
}
function quadraticFirst(a,b,c,maximum) {
  if(c<=1e-12)return 0;
  if(a<1e-16)return null;
  const discriminant=b*b-4*a*c;
  const roundoff=Number.EPSILON*16*Math.max(1,b*b,Math.abs(4*a*c));
  if(discriminant<-roundoff)return null;
  const root=Math.sqrt(Math.max(0,discriminant)),q=-.5*(b+(b>=0?root:-root));
  const t=q===0?-b/(2*a):Math.min(q/a,c/q);
  return t>=-1e-10&&t<=maximum+1e-10?Math.max(0,t):null;
}

// Continuous sphere contact against a convex rendered piece. Face planes,
// finite edge cylinders and vertex spheres form the real rounded Minkowski
// boundary; expanded AABBs/planes alone would invent hits at empty corners.
function sweepPart(part,start,direction,radius,maximum) {
  const accelerated=sweepPartWasm(part,start,direction,radius,maximum);
  if(accelerated!==undefined)return accelerated;
  let best=maximum,found=false;
  const accept=t=>{if(t!==null&&t<=best+1e-10){best=Math.max(0,t);found=true;}};
  if(part.closed&&part.worldTriangles.every(t=>dot(t.normal,delta(start,t.a))<=EPS))return 0;
  for(const tri of part.worldTriangles) {
    const n=tri.normal,distance=dot(n,delta(start,tri.a)),speed=dot(n,direction);
    if(Math.abs(distance)<=radius+1e-10) {
      const projected=point(start.x-n.x*distance,start.y-n.y*distance,start.z-n.z*distance);
      if(triangleContains3D(tri,projected))return 0;
    }
    if(Math.abs(speed)<1e-14)continue;
    for(const side of radius>0?[-1,1]:[0]) {
      const t=(side*radius-distance)/speed;
      if(t<-1e-10||t>best+1e-10)continue;
      const center=along(start,direction,Math.max(0,t));
      const projected=point(center.x-n.x*side*radius,center.y-n.y*side*radius,center.z-n.z*side*radius);
      if(triangleContains3D(tri,projected))accept(t);
    }
  }
  const rr=radius*radius;
  for(const [aId,bId] of part.edges) {
    const a=part.worldVertices[aId],b=part.worldVertices[bId],edge=delta(b,a),length=dot(edge,edge);
    if(length<1e-14)continue;
    const offset=delta(start,a),alongStart=dot(offset,edge)/length,alongSpeed=dot(direction,edge)/length;
    const radialStart=point(offset.x-edge.x*alongStart,offset.y-edge.y*alongStart,offset.z-edge.z*alongStart);
    const radialSpeed=point(direction.x-edge.x*alongSpeed,direction.y-edge.y*alongSpeed,direction.z-edge.z*alongSpeed);
    const aa=dot(radialSpeed,radialSpeed),bb=2*dot(radialStart,radialSpeed),cc=dot(radialStart,radialStart)-rr;
    if(cc<=1e-12&&alongStart>=-EPS&&alongStart<=1+EPS)return 0;
    const t=quadraticFirst(aa,bb,cc,best);
    if(t!==null){const u=alongStart+alongSpeed*t;if(u>=-EPS&&u<=1+EPS)accept(t);}
  }
  const speed2=dot(direction,direction);
  for(const vertex of part.worldVertices) {
    const offset=delta(start,vertex);
    accept(quadraticFirst(speed2,2*dot(direction,offset),dot(offset,offset)-rr,best));
  }
  return found?best:null;
}

export function createGeometryCollision({nearObjects,bounds=117}={}) {
  if(typeof nearObjects!=='function')throw new TypeError('Geometry collision requires a nearby-object query');
  let meshes=new WeakMap(),objectMeshes=new WeakMap(),fallbacks=new WeakMap();
  const diagnostics={cacheBuilds:0,partBuilds:0,queries:0,partsTested:0,triangleTests:0,gridCells:0};
  const queryBox=new THREE.Box3(),localBox=new THREE.Box3(),rootInverse=new THREE.Matrix4(),correction=new THREE.Matrix4(),matrix=new THREE.Matrix4();
  const anchorMatrix=new THREE.Matrix4(),anchorPosition=new THREE.Vector3();
  function cachedGeometry(node){
    const geometry=node.geometry,position=geometry?.attributes?.position;if(!position)return null;
    let cache=meshes.get(node);
    if(!cache||cache.geometry!==geometry||cache.position!==position||cache.positionVersion!==position.version||cache.index!==geometry.index||cache.indexVersion!==geometry.index?.version||cache.drawStart!==geometry.drawRange.start||cache.drawCount!==geometry.drawRange.count){cache=buildGeometry(geometry,diagnostics,cache);meshes.set(node,cache);}
    return cache;
  }
  function warm(objects){
    for(const object of objects){if(object.dead)continue;for(const node of entries(object))cachedGeometry(node);}
  }

  function entries(object) {
    if(!object.mesh) {
      // Non-rendered rules/test fixtures retain a deliberately explicit box.
      const key=[object.x,object.z,object.w,object.d,object.h].join(',');
      let fallback=fallbacks.get(object);
      if(fallback?.key!==key) {
        const geometry=new THREE.BoxGeometry(object.w||1,object.h||1,object.d||1);
        const node=new THREE.Mesh(geometry);node.position.set(object.x,(object.h||1)/2,object.z);node.updateMatrixWorld(true);
        fallback={key,nodes:[node]};fallbacks.set(object,fallback);
      }
      correction.identity();return fallback.nodes;
    }
    const root=object.mesh;
    let nodes=objectMeshes.get(object);
    if(!nodes){nodes=[];root.traverse(n=>{if(n.isMesh&&!n.userData.noCollision)nodes.push(n);});objectMeshes.set(object,nodes);}
    root.updateWorldMatrix(true,true);
    correction.identity();
    // Hit shake/lean is a visual effect, not a repeatedly moving collision
    // floor. Preserve all real child transforms, including the moving crane.
    if(object.collisionAnchor) {
      const anchor=object.collisionAnchor;
      anchorPosition.set(object.x,anchor.y,object.z);
      anchorMatrix.compose(anchorPosition,anchor.quaternion,root.scale);
      if(root.parent)anchorMatrix.premultiply(root.parent.matrixWorld);
      rootInverse.copy(root.matrixWorld).invert();correction.multiplyMatrices(anchorMatrix,rootInverse);
    }
    return nodes;
  }

  function visitParts(x,z,radius,minY,maxY,visit,onlyObject=null,footprint=null) {
    diagnostics.queries++;
    const minX=footprint?.minX??x-radius,maxX=footprint?.maxX??x+radius,minZ=footprint?.minZ??z-radius,maxZ=footprint?.maxZ??z+radius;
    // Small old street-prop bounds describe their trunks/posts. Include their
    // visible overhead lamps/canopies too, without changing horde navigation.
    for(const object of onlyObject?[onlyObject]:nearObjects(x,z,radius+2)) {
      if(object.dead)continue;
      for(const node of entries(object)) {
        const cache=cachedGeometry(node);if(!cache)continue;
        if(!cache.parts.length)continue;
        matrix.multiplyMatrices(correction,node.matrixWorld);
        if(!cache.matrix.equals(matrix)) {
          cache.matrix.copy(matrix);cache.inverse.copy(matrix).invert();cache.worldBounds.copy(cache.bounds).applyMatrix4(matrix);cache.revision++;
        }
        const b=cache.worldBounds;
        if(b.max.y<minY-EPS||b.min.y>maxY+EPS||b.max.x<minX||b.min.x>maxX||b.max.z<minZ||b.min.z>maxZ)continue;
        queryBox.min.set(minX,Math.max(minY,b.min.y)-EPS,minZ);
        queryBox.max.set(maxX,Math.min(maxY,b.max.y)+EPS,maxZ);
        localBox.copy(queryBox).applyMatrix4(cache.inverse).intersect(cache.bounds);
        // A long cast (camera ray/huge hammer) must not scan thousands of empty
        // grid cells outside this mesh. Clipping cannot remove a real part.
        if(localBox.isEmpty())continue;
        const seen=new Set();
        for(let cz=Math.floor(localBox.min.z/CELL);cz<=Math.floor(localBox.max.z/CELL);cz++)
          for(let cx=Math.floor(localBox.min.x/CELL);cx<=Math.floor(localBox.max.x/CELL);cx++) {
            diagnostics.gridCells++;
            for(const id of cache.cells.get(cellKey(cx,cz))||[]) {
              if(seen.has(id))continue;seen.add(id);
              const part=cache.parts[id];if(!part.bounds.intersectsBox(localBox))continue;
              worldPart(part,cache);const pb=part.worldBounds;
              if(pb.max.y<minY-EPS||pb.min.y>maxY+EPS||pb.max.x<minX||pb.min.x>maxX||pb.max.z<minZ||pb.min.z>maxZ)continue;
              diagnostics.partsTested++;visit(part,object);
            }
          }
      }
    }
  }

  function support(x,z,radius=.44,ceiling=Infinity) {
    let result={height:0,object:null,normal:{x:0,y:1,z:0}};
    visitParts(x,z,radius,-EPS,ceiling+EPS,(part,object)=>{
      for(const tri of part.worldTriangles) {
        if(tri.normal.y<WALKABLE_Y) {
          // The thin fascia of a pitched roof can reach the foot circle a
          // few centimetres before its top face. Its real, low bevel is a
          // step, even when steeper than a walkable roof. Without it moveBody
          // catches the ridge indefinitely. Tall slopes and vertical walls
          // retain the normal limit; neither the footprint nor mesh expands.
          const rise=Math.max(tri.a.y,tri.b.y,tri.c.y)-Math.min(tri.a.y,tri.b.y,tri.c.y);
          if(tri.normal.y<=.15||rise>STEP_HEIGHT+EPS)continue;
        }
        diagnostics.triangleTests++;
        const height=surfaceExtreme(tri,x,z,radius,true);
        if(height!==null&&height<=ceiling+EPS&&height>result.height+EPS)result={height,object,normal:tri.normal};
      }
    });
    return result;
  }
  function supportHeight(x,z,radius=.44,ceiling=Infinity){return support(x,z,radius,ceiling).height;}
  function ceilingHeight(x,z,radius=.44,floor=0,maximum=Infinity) {
    let height=Infinity;
    visitParts(x,z,radius,floor-EPS,maximum+EPS,part=>{
      for(const tri of part.worldTriangles) {
        if(tri.normal.y>-.15)continue;diagnostics.triangleTests++;
        const value=surfaceExtreme(tri,x,z,radius,false);
        if(value!==null&&value>=floor-EPS&&value<=maximum+EPS)height=Math.min(height,value);
      }
    });
    return height;
  }
  function geometryHit(object,start,end,radius=0) {
    if(!object||object.dead||![start?.x,start?.y,start?.z,end?.x,end?.y,end?.z,radius].every(Number.isFinite)||radius<0)return null;
    const direction=delta(end,start),footprint={minX:Math.min(start.x,end.x)-radius,maxX:Math.max(start.x,end.x)+radius,
      minZ:Math.min(start.z,end.z)-radius,maxZ:Math.max(start.z,end.z)+radius};
    let nearest=null;
    visitParts((start.x+end.x)/2,(start.z+end.z)/2,0,Math.min(start.y,end.y)-radius,Math.max(start.y,end.y)+radius,part=>{
      const t=sweepPart(part,start,direction,radius,nearest??1);
      if(t!==null&&(nearest===null||t<nearest))nearest=t;
    },object,footprint);
    return nearest===null?null:{t:nearest,...along(start,direction,nearest)};
  }
  function polygons(x,z,radius,y,height) {
    const result=[];
    visitParts(x,z,radius,y+SKIN,y+height-SKIN,part=>{
      const poly=slicePart(part,y+SKIN,y+height-SKIN);if(poly.length)result.push(poly);
    });
    return result;
  }
  function clearBody(x,z,y,radius,height) {
    return !polygons(x,z,radius,y,height).some(poly=>circleCorrection(poly,x,z,radius));
  }
  function separate(entity,radius,height) {
    const solids=polygons(entity.x,entity.z,radius+.05,entity.y,height);
    let touched=false;
    for(let pass=0;pass<6;pass++) {
      let changed=false;
      for(const poly of solids) {
        const shift=circleCorrection(poly,entity.x,entity.z,radius);
        if(shift){entity.x+=shift.x;entity.z+=shift.z;changed=true;touched=true;}
      }
      if(!changed)break;
    }
    entity.x=clamp(entity.x,-bounds+radius,bounds-radius);entity.z=clamp(entity.z,-bounds+radius,bounds-radius);
    return touched;
  }

  function moveBody(entity,dx,dz,{dy=0,radius=entity.radius||.44,height=BODY_HEIGHT,grounded,stepHeight=STEP_HEIGHT}={}) {
    if(![dx,dz,dy,entity.x,entity.z,entity.y??0].every(Number.isFinite))return {x:0,z:0,y:0,grounded:false,landed:false,ceilingHit:false};
    entity.y=Math.max(0,entity.y||0);
    const start={x:entity.x,z:entity.z,y:entity.y};
    const initialSupport=supportHeight(entity.x,entity.z,radius,entity.y+EPS);
    let onGround=grounded!==false&&dy<=0&&Math.abs(entity.y-initialSupport)<.003;
    let landed=false,ceilingHit=false,blocked=false;
    const stepLength=Math.min(.18,radius*.45),steps=Math.max(1,Math.ceil(Math.max(Math.hypot(dx,dz),Math.abs(dy))/stepLength));
    for(let i=0;i<steps;i++) {
      const oldY=entity.y,wasOnGround=onGround,sy=ceilingHit&&dy>0?0:dy/steps;
      entity.x+=dx/steps;entity.z+=dz/steps;
      if(onGround&&sy<=0) {
        const next=supportHeight(entity.x,entity.z,radius,oldY+stepHeight);
        // A small rise/downhill ramp can be walked. A departed roof continues
        // falling locally; only an actual jump can reach a higher tier.
        if(next>=oldY-stepHeight-EPS&&next<=oldY+stepHeight+EPS&&clearBody(entity.x,entity.z,next,radius,height))entity.y=next;
      }
      blocked=separate(entity,radius,height)||blocked;
      if(onGround&&sy<=0) {
        const actual=supportHeight(entity.x,entity.z,radius,oldY+stepHeight);
        if(Math.abs(actual-oldY)<=stepHeight+EPS&&clearBody(entity.x,entity.z,actual,radius,height))entity.y=actual;
        else {entity.y=oldY;onGround=false;}
      }
      if(sy>0) {
        const roof=ceilingHeight(entity.x,entity.z,radius,entity.y+height,entity.y+height+sy);
        if(roof<Infinity){entity.y=Math.max(entity.y,roof-height);ceilingHit=true;entity.vy=0;}
        else entity.y+=sy;
        onGround=false;
      } else {
        const floor=supportHeight(entity.x,entity.z,radius,entity.y+EPS);
        if(entity.y+sy<=floor+EPS) {
          entity.y=floor;onGround=true;entity.vy=0;
          if(!wasOnGround&&sy<0)landed=true;
        } else {entity.y+=sy;onGround=false;}
      }
      // A horizontal face may disappear during destruction; the final slice
      // prevents descending into a remaining nearby wall without relocating
      // the actor to the opposite side of the whole building.
      blocked=separate(entity,radius,height)||blocked;
    }
    return {x:entity.x-start.x,z:entity.z-start.z,y:entity.y-start.y,grounded:onGround,landed,ceilingHit,blocked};
  }
  function clear(){meshes=new WeakMap();objectMeshes=new WeakMap();fallbacks=new WeakMap();}
  return {support,supportHeight,ceilingHeight,geometryHit,moveBody,clearBody,diagnostics,clear,warm};
}
