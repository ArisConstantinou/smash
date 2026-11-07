import {firstHammerHit} from './combat.js?v=20261107-forge9';

// A resting log uses its measured, already rotated model bounds. A candidate
// is accepted only if that full footprint has nearby support and its full
// volume clears surviving geometry; an object's tallest point is never a floor.
const DEFAULT_CLEARANCE=.09,DEFAULT_FLATNESS=.16,BOUNDARY_MARGIN=.08;
const finite=Number.isFinite;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function dimensions(footprint,verticalBounds) {
  if(!footprint)return null;
  const {minX,maxX,minZ,maxZ}=footprint;
  const minY=verticalBounds?.minY??verticalBounds?.min?.y,maxY=verticalBounds?.maxY??verticalBounds?.max?.y;
  if(![minX,maxX,minZ,maxZ,minY,maxY].every(finite)||minX>maxX||minZ>maxZ||minY>maxY)return null;
  return {footprint:{minX,maxX,minZ,maxZ},verticalBounds:{minY,maxY},
    centerX:(minX+maxX)/2,centerZ:(minZ+maxZ)/2,
    radius:Math.hypot(maxX-minX,maxZ-minZ)/2+.025,height:Math.max(.01,maxY-minY)};
}

function offsets(footprint) {
  const {minX,maxX,minZ,maxZ}=footprint,w=maxX-minX,d=maxZ-minZ;
  const nx=clamp(Math.ceil(w/.6),1,6),nz=clamp(Math.ceil(d/.6),1,6),result=[];
  result.push({x:(minX+maxX)/2,z:(minZ+maxZ)/2});
  for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++)result.push({x:minX+w*ix/nx,z:minZ+d*iz/nz});
  return result;
}

function insideBounds(p,footprint,bounds) {
  return p.x+footprint.minX>=-bounds+BOUNDARY_MARGIN&&p.x+footprint.maxX<=bounds-BOUNDARY_MARGIN&&
    p.z+footprint.minZ>=-bounds+BOUNDARY_MARGIN&&p.z+footprint.maxZ<=bounds-BOUNDARY_MARGIN;
}
function surfaceHeight(world,x,z,ceiling) {
  const surface=world.supportSurface?.(x,z,.025,ceiling);
  const height=surface?.height??world.supportHeight?.(x,z,.025,ceiling);
  return finite(height)&&height>=0&&height<=ceiling+1e-5?height:null;
}
function clearVolume(world,p,dim,floor,clearance) {
  // A circumscribed cylinder contains every corner of the measured box. The
  // extra vertical margin also covers the subtle +/- .025 pickup idle bob.
  return world.clearBody(p.x+dim.centerX,p.z+dim.centerZ,floor+clearance-.026,dim.radius,dim.height+.052);
}
function sampleSupport(world,p,samples,ceiling,tolerance) {
  let low=Infinity,high=-Infinity;
  for(const s of samples) {
    const height=surfaceHeight(world,p.x+s.x,p.z+s.z,ceiling);
    if(height===null)return null;
    low=Math.min(low,height);high=Math.max(high,height);
    if(high-low>tolerance+1e-5)return null;
  }
  return high;
}
function nearby(world,x,z,radius) {
  return world.nearObjects?.(x,z,radius)||world.objects?.filter(o=>!o.dead)||[];
}
function segmentClear(world,a,b,radius=.055) {
  const distance=Math.hypot(b.x-a.x,b.z-a.z),objects=nearby(world,(a.x+b.x)/2,(a.z+b.z)/2,distance/2+radius+2);
  return !firstHammerHit(a,b,objects,radius);
}

/**
 * Find a reachable physical resting pose for one measured weapon orientation.
 * verticalBounds accepts {minY,maxY} or a Three Box3. The caller tries another
 * orientation when this returns null; no invalid pose is forced into scenery.
 */
export function findGeometryRest(origin,footprint,verticalBounds,world,options={}) {
  if(!world||typeof world.clearBody!=='function'||!origin||![origin.x,origin.z].every(finite))return null;
  const dim=dimensions(footprint,verticalBounds);if(!dim)return null;
  const bounds=options.bounds??world.bounds??117,ceiling=options.ceiling??Infinity;
  if(!(finite(bounds)||bounds===Infinity)||bounds<=0||!(finite(ceiling)||ceiling===Infinity)||ceiling<0)return null;
  const breadcrumbs=Array.isArray(options.breadcrumbs)?options.breadcrumbs:[];
  const clearance=clamp(options.clearance??DEFAULT_CLEARANCE,.055,.16),tolerance=clamp(options.flatnessTolerance??DEFAULT_FLATNESS,.02,.22);
  const samples=offsets(dim.footprint),candidates=[],seen=new Set();
  function add(x,z) {
    if(!finite(x)||!finite(z))return;
    const key=`${x.toFixed(3)},${z.toFixed(3)}`;if(seen.has(key))return;seen.add(key);candidates.push({x,z});
  }
  function physical(p) {
    if(!insideBounds(p,dim.footprint,bounds))return null;
    const central=surfaceHeight(world,p.x+dim.centerX,p.z+dim.centerZ,ceiling);
    if(central===null)return null;
    // Reject occupied car/wall interiors before sampling an entire long log.
    // The raised probe leaves a little tolerance for a small real roof slope.
    if(!clearVolume(world,p,dim,central+tolerance,clearance))return null;
    const floor=sampleSupport(world,p,samples,ceiling,tolerance);
    if(floor===null||!clearVolume(world,p,dim,floor,clearance))return null;
    return {x:p.x,z:p.z,floor,groundY:floor,y:floor+clearance-dim.verticalBounds.minY,
      footprint:{...dim.footprint},verticalBounds:{...dim.verticalBounds},clearance,flatnessTolerance:tolerance,bounds,
      supportSamples:samples};
  }

  // Find the last physical approach point, not a point through the struck car
  // or facade. Breadcrumbs need only X/Z; their support is resolved anew.
  let anchor=null;
  const anchorCandidates=[origin,...breadcrumbs.slice(-32).reverse()];
  if(breadcrumbs.length>32)anchorCandidates.push(breadcrumbs[0]);
  for(const p of anchorCandidates) {
    if(!p||![p.x,p.z].every(finite))continue;
    const floor=surfaceHeight(world,p.x,p.z,ceiling);
    if(floor===null||!world.clearBody(p.x,p.z,floor+.015,.29,1.25))continue;
    anchor={x:p.x,y:floor+.38,z:p.z};break;
  }
  const visible=rest=>anchor&&segmentClear(world,anchor,{x:rest.x+dim.centerX,y:rest.floor+.38,z:rest.z+dim.centerZ});

  add(origin.x,origin.z);
  add(clamp(origin.x,-bounds+BOUNDARY_MARGIN-dim.footprint.minX,bounds-BOUNDARY_MARGIN-dim.footprint.maxX),
    clamp(origin.z,-bounds+BOUNDARY_MARGIN-dim.footprint.minZ,bounds-BOUNDARY_MARGIN-dim.footprint.maxZ));
  // Object envelopes only suggest possible positions outside obstacles. Every
  // accepted result is checked against real geometry, including when a weapon
  // lies on a lower roof within that same envelope.
  const around=nearby(world,origin.x,origin.z,6+dim.radius).filter(o=>!o.dead&&[o.x,o.z,o.w,o.d].every(finite))
    .sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z)).slice(0,12);
  for(const o of around) {
    const left=o.x-o.w/2-dim.footprint.maxX-.13,right=o.x+o.w/2-dim.footprint.minX+.13;
    const back=o.z-o.d/2-dim.footprint.maxZ-.13,front=o.z+o.d/2-dim.footprint.minZ+.13;
    add(left,origin.z);add(right,origin.z);add(origin.x,back);add(origin.x,front);
    for(const x of [left,right])for(const z of [back,front])add(x,z);
  }
  for(let ring=1;ring<=10;ring++)for(let i=0;i<16;i++) {
    const angle=i*Math.PI/8,r=ring*.42;add(origin.x+Math.cos(angle)*r,origin.z+Math.sin(angle)*r);
  }
  candidates.sort((a,b)=>(a.x-origin.x)**2+(a.z-origin.z)**2-(b.x-origin.x)**2-(b.z-origin.z)**2);
  for(const p of candidates.slice(0,176)) {
    const rest=physical(p);if(rest&&visible(rest))return rest;
  }
  // A very narrow alley may require the alternate orientation or retracing the
  // already travelled path. The search remains bounded even during retries.
  const trace=breadcrumbs.slice(-48).reverse();if(breadcrumbs.length>48)trace.push(breadcrumbs[0]);
  for(const p of trace) {
    if(!p||![p.x,p.z].every(finite))continue;
    const rest=physical(p);if(rest)return rest;
  }
  return null;
}

/** Recheck an accepted pose after cars move or supporting geometry breaks. */
export function geometryRestValid(rest,world) {
  if(!rest||!world||typeof world.clearBody!=='function'||![rest.x,rest.z,rest.floor,rest.y].every(finite))return false;
  const dim=dimensions(rest.footprint,rest.verticalBounds);if(!dim)return false;
  const bounds=rest.bounds??world.bounds??117,clearance=rest.clearance??DEFAULT_CLEARANCE,tolerance=rest.flatnessTolerance??DEFAULT_FLATNESS;
  if(!insideBounds(rest,dim.footprint,bounds))return false;
  if(Math.abs(rest.y-(rest.floor+clearance-dim.verticalBounds.minY))>.035)return false;
  const floor=sampleSupport(world,rest,rest.supportSamples||offsets(dim.footprint),rest.floor+.035,tolerance);
  return floor!==null&&Math.abs(floor-rest.floor)<=.035&&clearVolume(world,rest,dim,rest.floor,clearance);
}
