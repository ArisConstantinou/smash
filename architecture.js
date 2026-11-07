import * as THREE from './vendor/three.module.js';

// The lot rectangle is only a broad phase. Movement, landings and weapon casts
// use the authored pieces below: roofs, awnings, slabs, pillars and ledges.
// Collision is cached in the stable building frame, independent of hit shake,
// camera fading and render culling. Only a damage revision rebuilds its pieces.
export const SURFACE_EPSILON = 1e-6;
const WALKABLE_Y = .72;
const tiny = 1e-8;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pointKey = p => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
const cross2 = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

export function convexHull(points) {
  const sorted = [...new Map(points.map(p => [`${Math.round(p.x * 1e6)},${Math.round(p.z * 1e6)}`, {x:p.x,z:p.z}])).values()]
    .sort((a,b) => a.x - b.x || a.z - b.z);
  if (sorted.length < 3) return sorted;
  const lower = [], upper = [];
  for (const p of sorted) {
    while (lower.length > 1 && cross2(lower.at(-2), lower.at(-1), p) <= tiny) lower.pop();
    lower.push(p);
  }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length > 1 && cross2(upper.at(-2), upper.at(-1), p) <= tiny) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop(); return lower.concat(upper);
}

/** Nearest boundary point and outward normal of a counter-clockwise polygon. */
export function polygonContact(x, z, polygon) {
  let inside = polygon.length >= 3, best = Infinity, point = null, nx = 0, nz = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    if (length2 < tiny) continue;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / length2, 0, 1);
    const px = a.x + dx * t, pz = a.z + dz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (cross2(a, b, {x,z}) < -SURFACE_EPSILON) inside = false;
    if (d2 < best) {best = d2; point = {x:px,z:pz}; const length = Math.sqrt(length2); nx = dz / length; nz = -dx / length;}
  }
  const distance = Math.sqrt(best);
  if (!inside && distance > tiny) {nx = (x - point.x) / distance; nz = (z - point.z) / distance;}
  return {inside,distance,point,nx,nz};
}

/** Exact horizontal swept circle against a convex primitive's cross-section. */
export function sweepCirclePolygon(ax, az, bx, bz, polygon, radius) {
  const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
  if (length2 < tiny) return null;
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x, ez = b.z - a.z, length = Math.hypot(ex, ez);
    if (length < tiny) continue;
    const nx = ez / length, nz = -ex / length;
    const initial = (ax - a.x) * nx + (az - a.z) * nz, velocity = dx * nx + dz * nz;
    if (velocity < -tiny && initial >= radius - SURFACE_EPSILON) {
      const t = (radius - initial) / velocity;
      const along = ((ax + dx * t - a.x) * ex + (az + dz * t - a.z) * ez) / (length * length);
      if (t >= -SURFACE_EPSILON && t <= 1 && along >= 0 && along <= 1) nearest = Math.min(nearest, Math.max(0,t));
    }
    const ox = ax - a.x, oz = az - a.z, approach = ox * dx + oz * dz;
    if (approach >= 0) continue;
    const discriminant = approach * approach - length2 * (ox * ox + oz * oz - radius * radius);
    if (discriminant < 0) continue;
    const t = (-approach - Math.sqrt(discriminant)) / length2;
    if (t >= -SURFACE_EPSILON && t <= 1) nearest = Math.min(nearest, Math.max(0,t));
  }
  return nearest === Infinity ? null : nearest;
}

function boundsFor(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
  return {x:(minX+maxX)/2,z:(minZ+maxZ)/2,w:maxX-minX,d:maxZ-minZ,minY,maxY,h:maxY,minX,maxX,minZ,maxZ};
}

function compilePart(positions, start, count, matrix, owner, id) {
  const triangles = [], vertices = [], vertexIds = new Map(), edgeMap = new Map();
  const addVertex = p => {const key = pointKey(p); if (!vertexIds.has(key)) {vertexIds.set(key, vertices.length); vertices.push({x:p.x,y:p.y,z:p.z});} return vertexIds.get(key);};
  const v = new THREE.Vector3();
  for (let i = start; i + 2 < start + count; i += 3) {
    const ids = [];
    for (let j = 0; j < 3; j++) {v.fromBufferAttribute(positions,i+j).applyMatrix4(matrix); ids.push(addVertex(v));}
    if (new Set(ids).size === 3) triangles.push(ids);
  }
  if (!vertices.length) return null;
  let bounds = boundsFor(vertices);
  // Ignore lettering pixels and paint, while retaining narrow posts, rails,
  // window sills and sign boards that the player can actually contact.
  if (bounds.w*bounds.d < .018 && !(bounds.maxY-bounds.minY > .6 && Math.max(bounds.w,bounds.d) > .12 && Math.min(bounds.w,bounds.d) > .05)) return null;
  if (Math.min(bounds.w,bounds.d,bounds.maxY-bounds.minY) < 1e-5) return null;
  const planes = [], planeMap = new Map(), surfaces = [], undersides = [];
  for (const ids of triangles) {
    const [a,b,c] = ids.map(i=>vertices[i]);
    const ab = new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z), ac = new THREE.Vector3(c.x-a.x,c.y-a.y,c.z-a.z);
    const normal = ab.cross(ac); if (normal.lengthSq() < tiny) continue; normal.normalize();
    const constant = normal.x*a.x+normal.y*a.y+normal.z*a.z;
    const key = `${Math.round(normal.x*1e5)},${Math.round(normal.y*1e5)},${Math.round(normal.z*1e5)},${Math.round(constant*1e4)}`;
    if (!planeMap.has(key)) {const plane={x:normal.x,y:normal.y,z:normal.z,constant,points:[]};planeMap.set(key,plane);planes.push(plane);}
    planeMap.get(key).points.push(a,b,c);
    for(let j=0;j<3;j++){const aId=ids[j],bId=ids[(j+1)%3],edgeKey=aId<bId?`${aId}:${bId}`:`${bId}:${aId}`;if(!edgeMap.has(edgeKey))edgeMap.set(edgeKey,[aId,bId]);}
  }
  for (const plane of planes) {
    if (Math.abs(plane.y) >= WALKABLE_Y) {
      const polygon = convexHull(plane.points);
      if (polygon.length >= 3) {
        const surface = {polygon,x:plane.x,y:plane.y,z:plane.z,constant:plane.constant,slope:Math.hypot(plane.x,plane.z)/Math.abs(plane.y)};
        if (plane.y > 0) surfaces.push(surface); else undersides.push(surface);
      }
    }
    delete plane.points;
  }
  if (planes.length < 4) return null;
  return {...bounds,id,owner,vertices,edges:[...edgeMap.values()],planes,surfaces,undersides,footprint:convexHull(vertices)};
}

function localMatrix(root, node) {
  const chain=[];for(let current=node;current&&current!==root;current=current.parent)chain.push(current);
  const matrix=new THREE.Matrix4();
  for(let i=chain.length-1;i>=0;i--){chain[i].updateMatrix();matrix.multiply(chain[i].matrix);}
  return matrix;
}
function dynamicCrane(root, node) {for(let p=node;p&&p!==root;p=p.parent)if(p.name==='Tower crane slew')return true;return false;}

export function installArchitecture(object) {
  if (!object.isBuilding || !object.mesh) return;
  object.architectureFrame={yaw:object.mesh.rotation.y,y:object.mesh.position.y,w:object.w,d:object.d,h:object.h};
  object.getCollisionParts=()=>getArchitectureParts(object);
}

export function getArchitectureParts(object) {
  if (!object || object.dead) return [];
  const frame=object.architectureFrame;
  if (!frame || object.geometryCollision===false) return null;
  // Explicit box fixtures/editor overrides retain their requested dimensions.
  if (Math.abs(object.w-frame.w)+Math.abs(object.d-frame.d)+Math.abs(object.h-frame.h)>.001) return null;
  const revision=object.destruction?.revision||0;
  const signature=`${revision}:${object.x}:${object.z}:${frame.yaw}:${frame.y}`;
  if (object.architectureCache?.signature===signature) return object.architectureCache.parts;
  const world=new THREE.Matrix4().makeRotationY(frame.yaw);world.setPosition(object.x,frame.y,object.z);
  const parts=[],root=object.mesh;
  const compile=(mesh,start,count,id)=>{
    if(dynamicCrane(root,mesh))return;
    const matrix=world.clone().multiply(localMatrix(root,mesh));
    const part=compilePart(mesh.geometry.attributes.position,start,count,matrix,object,id);if(part)parts.push(part);
  };
  if (object.destruction) {
    for (const part of object.destruction.parts) if (!part.removed) compile(part.mesh,part.start,part.count,part.id);
  } else root.traverse(mesh=>{
    if(!mesh.isMesh||dynamicCrane(root,mesh))return;
    for(const [index,spec] of (mesh.geometry.userData.fractureParts||[]).entries())compile(mesh,spec.start,spec.count,`${mesh.uuid}:${index}`);
  });
  object.architectureCache={signature,parts};return parts;
}

export function plainBoxPart(object) {
  const minY=Number.isFinite(object.minY)?object.minY:object.y||0;
  const maxY=Number.isFinite(object.maxY)?object.maxY:minY+(object.h||0);
  const minX=object.x-object.w/2,maxX=object.x+object.w/2,minZ=object.z-object.d/2,maxZ=object.z+object.d/2;
  const polygon=[{x:minX,z:minZ},{x:maxX,z:minZ},{x:maxX,z:maxZ},{x:minX,z:maxZ}];
  return {x:object.x,z:object.z,w:object.w,d:object.d,h:maxY,minY,maxY,minX,maxX,minZ,maxZ,owner:object,box:true,footprint:polygon,
    surfaces:[{polygon,x:0,y:1,z:0,constant:maxY,slope:0}],undersides:[{polygon,x:0,y:-1,z:0,constant:-minY,slope:0}],
    planes:[{x:1,y:0,z:0,constant:maxX},{x:-1,y:0,z:0,constant:-minX},{x:0,y:1,z:0,constant:maxY},{x:0,y:-1,z:0,constant:-minY},{x:0,y:0,z:1,constant:maxZ},{x:0,y:0,z:-1,constant:-minZ}]};
}
export function objectCollisionParts(object) {return object.getCollisionParts?.()??[plainBoxPart(object)];}

/** A true horizontal section through a roof slope, not its bounding cuboid. */
export function slicePart(part, minY, maxY) {
  if (part.maxY<=minY+SURFACE_EPSILON || part.minY>=maxY-SURFACE_EPSILON) return null;
  if(part.box)return {...part,part};
  const points=[];
  for(const p of part.vertices)if(p.y>=minY&&p.y<=maxY)points.push(p);
  for(const [aId,bId] of part.edges){
    const a=part.vertices[aId],b=part.vertices[bId];if(Math.abs(b.y-a.y)<tiny)continue;
    for(const y of [minY,maxY])if(y>=Math.min(a.y,b.y)&&y<=Math.max(a.y,b.y)){
      const t=(y-a.y)/(b.y-a.y);points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
    }
  }
  const polygon=convexHull(points);if(polygon.length<3)return null;
  const xs=polygon.map(p=>p.x),zs=polygon.map(p=>p.z);
  const left=Math.min(...xs),right=Math.max(...xs),back=Math.min(...zs),front=Math.max(...zs);
  return {x:(left+right)/2,z:(back+front)/2,w:right-left,d:front-back,h:part.maxY,minY:part.minY,maxY:part.maxY,polygon,part,owner:part.owner};
}

function nearPart(part,x,z,radius) {return Math.max(0,Math.abs(x-part.x)-part.w/2)**2+Math.max(0,Math.abs(z-part.z)-part.d/2)**2<=radius*radius+tiny;}
function planeHeight(surface,x,z) {return (surface.constant-surface.x*x-surface.z*z)/surface.y;}
function surfaceContact(surface,x,z,radius,part=null) {
  let contact=polygonContact(x,z,surface.polygon);
  if(!contact.inside&&contact.distance>radius+SURFACE_EPSILON){
    // A tilted slab's thin fascia projects slightly beyond its top face. Let
    // the foot cross that bevel as a small step instead of catching on an
    // invisible 5 cm strip at a ridge where two pitched roof halves meet.
    if(!part||surface.slope<.01||radius<.05||contact.distance>radius+.12)return null;
    const edge=polygonContact(x,z,part.footprint);
    if(!edge.inside&&edge.distance>radius+SURFACE_EPSILON)return null;
  }
  const p=contact.inside?{x,z}:contact.point;
  return {x:p.x,z:p.z,height:planeHeight(surface,p.x,p.z)};
}

export function findSupport(objects,x,z,radius,ceiling=Infinity) {
  let best={height:0,part:null,surface:null,object:null};
  for(const object of objects){
    if(object.dead)continue;
    for(const part of objectCollisionParts(object)){
      if(part.minY>ceiling+SURFACE_EPSILON||!nearPart(part,x,z,radius))continue;
      for(const surface of part.surfaces){
        const contact=surfaceContact(surface,x,z,radius,part);
        if(contact&&contact.height>best.height-SURFACE_EPSILON&&contact.height<=ceiling+SURFACE_EPSILON){
          if(contact.height<best.height)continue;
          best={height:Math.max(0,contact.height),part,surface,object};
        }
      }
    }
  }
  return best;
}

export function findCeiling(objects,x,z,radius,headY,ceiling=Infinity) {
  let result=ceiling;
  for(const object of objects){
    if(object.dead)continue;
    for(const part of objectCollisionParts(object)){
      if(part.maxY<headY-SURFACE_EPSILON||part.minY>result||!nearPart(part,x,z,radius))continue;
      for(const surface of part.undersides){
        const contact=surfaceContact(surface,x,z,radius,part);
        if(contact&&contact.height>=headY-SURFACE_EPSILON)result=Math.min(result,contact.height);
      }
    }
  }
  return result;
}

export function supportingSlopes(objects,x,z,radius,feetY) {
  const ignored=new Set();
  for(const object of objects){if(object.dead)continue;for(const part of objectCollisionParts(object)){
    if(!nearPart(part,x,z,radius))continue;
    for(const surface of part.surfaces){
      if(surface.slope<.01)continue;
      const contact=surfaceContact(surface,x,z,radius,part);
      if(contact&&contact.height<=feetY+SURFACE_EPSILON&&contact.height>=feetY-.28){ignored.add(part);break;}
    }
  }}
  return ignored;
}

export function actorSections(objects,x,z,radius,feetY,bodyHeight=2.05,{ignore=new Set()}={}) {
  const result=[];
  for(const object of objects){
    if(object.dead)continue;
    for(const part of objectCollisionParts(object)){
      if(ignore.has(part)||!nearPart(part,x,z,radius))continue;
      const collider=slicePart(part,feetY,feetY+bodyHeight);
      if(collider&&nearPart(collider,x,z,radius))result.push(collider);
    }
  }
  return result;
}

/** Sweep against the same convex solids used for player collision. */
export function sweepArchitecture(start,end,parts,radius=0) {
  let nearest=null;
  for(const part of parts){
    if(!Number.isFinite(start.y)||!Number.isFinite(end.y)){
      const contact=polygonContact(start.x,start.z,part.footprint);
      const t=contact.inside||contact.distance<=radius?0:sweepCirclePolygon(start.x,start.z,end.x,end.z,part.footprint,radius);
      if(t!==null&&(!nearest||t<nearest.t))nearest={t,part};
      continue;
    }
    let enter=0,exit=1,valid=true;
    for(const plane of part.planes){
      const startY=Number.isFinite(start.y)?start.y:0,endY=Number.isFinite(end.y)?end.y:startY;
      if(!Number.isFinite(start.y)&&Math.abs(plane.y)>.001)continue;
      const a=plane.x*start.x+plane.y*startY+plane.z*start.z-plane.constant-radius;
      const velocity=plane.x*(end.x-start.x)+plane.y*(endY-startY)+plane.z*(end.z-start.z);
      if(Math.abs(velocity)<tiny){if(a>0){valid=false;break;}continue;}
      const t=-a/velocity;
      if(velocity<0)enter=Math.max(enter,t);else exit=Math.min(exit,t);
      if(enter>exit+tiny){valid=false;break;}
    }
    if(valid&&enter<=1&&exit>=0&&(!nearest||enter<nearest.t))nearest={t:Math.max(0,enter),part};
  }
  if(!nearest)return null;
  const {t}=nearest;return {...nearest,x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t,...(Number.isFinite(start.y)&&Number.isFinite(end.y)?{y:start.y+(end.y-start.y)*t}:{})};
}

function rectangleOverlapsPolygon(minX,maxX,minZ,maxZ,polygon) {
  const rect=[{x:minX,z:minZ},{x:maxX,z:minZ},{x:maxX,z:maxZ},{x:minX,z:maxZ}];
  for(const points of [rect,polygon])for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],nx=b.z-a.z,nz=a.x-b.x;
    let aMin=Infinity,aMax=-Infinity,bMin=Infinity,bMax=-Infinity;
    for(const p of rect){const d=p.x*nx+p.z*nz;aMin=Math.min(aMin,d);aMax=Math.max(aMax,d);}
    for(const p of polygon){const d=p.x*nx+p.z*nz;bMin=Math.min(bMin,d);bMax=Math.max(bMax,d);}
    if(aMax<=bMin+tiny||bMax<=aMin+tiny)return false;
  }
  return true;
}

export function clearRestingFootprint(objects,point,footprint,bounds=Infinity) {
  const minX=point.x+footprint.minX,maxX=point.x+footprint.maxX,minZ=point.z+footprint.minZ,maxZ=point.z+footprint.maxZ;
  if(minX< -bounds+.08||maxX>bounds-.08||minZ< -bounds+.08||maxZ>bounds-.08)return false;
  const feetY=(point.groundY||0)+.04,height=footprint.height||.5;
  for(const object of objects){if(object.dead)continue;for(const part of objectCollisionParts(object)){
    if(maxX<=part.minX||minX>=part.maxX||maxZ<=part.minZ||minZ>=part.maxZ)continue;
    const collider=slicePart(part,feetY,feetY+height);if(!collider)continue;
    const polygon=collider.polygon||[{x:part.minX,z:part.minZ},{x:part.maxX,z:part.minZ},{x:part.maxX,z:part.maxZ},{x:part.minX,z:part.maxZ}];
    if(rectangleOverlapsPolygon(minX-.05,maxX+.05,minZ-.05,maxZ+.05,polygon))return false;
  }}
  return true;
}

export function restingSupport(objects,x,z,footprint,ceiling=Infinity) {
  const midX=(footprint.minX+footprint.maxX)/2,midZ=(footprint.minZ+footprint.maxZ)/2;
  const center=findSupport(objects,x+midX,z+midZ,.015,ceiling);
  let height=center.height;
  for(const dx of [footprint.minX,midX,footprint.maxX])for(const dz of [footprint.minZ,midZ,footprint.maxZ]){
    const expected=center.surface?planeHeight(center.surface,x+dx,z+dz):0;
    const support=findSupport(objects,x+dx,z+dz,.025,expected+.13);
    if(Math.abs(support.height-expected)>.14)return null;
    height=Math.max(height,support.height);
  }
  if(height>ceiling+.14)return null;
  return {...center,height};
}
