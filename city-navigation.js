import { segmentBoxHit } from './combat.js?v=20261107-forge9';

// One flow field per enemy-size class is shared by the entire horde. Changing
// the target cell rebuilds only a small integer grid; destruction invalidates
// occupancy. Visibility never enters the calculation.
export function createCityNavigation({ objects, nearObjects, bounds = 118, cellSize = 2 }) {
  const size = Math.floor(bounds * 2 / cellSize) + 1, count = size * size;
  const profiles = new Map();
  const steps = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  const clamp = n => Math.max(0, Math.min(size - 1, n));
  const cellX = x => clamp(Math.round((x + bounds) / cellSize));
  const coordinate = i => i * cellSize - bounds;
  const index = (x,z) => z * size + x;
  let version = 0;

  function segmentClear(ax, az, bx, bz, radius) {
    const length = Math.hypot(bx-ax,bz-az);
    for (const o of nearObjects((ax+bx)/2, (az+bz)/2, length/2 + radius)) {
      if (o.dead) continue;
      const hit = segmentBoxHit(ax, az, bx, bz, o, radius);
      if (hit !== null) return false;
    }
    return true;
  }

  function profileFor(radius) {
    const padding = Math.max(.5, Math.ceil(Math.max(0, radius) * 4) / 4) + .12;
    if (profiles.has(padding)) return profiles.get(padding);
    const blocked = new Uint8Array(count), edges = new Uint8Array(count), distance = new Int32Array(count), queue = new Int32Array(count);
    for (let z=0;z<size;z++) for (let x=0;x<size;x++) {
      if (Math.abs(coordinate(x)) > bounds-1-padding || Math.abs(coordinate(z)) > bounds-1-padding) blocked[index(x,z)] = 1;
    }
    for (const o of objects) {
      if (o.dead) continue;
      const x0 = clamp(Math.floor((o.x-o.w/2-padding+bounds)/cellSize));
      const x1 = clamp(Math.ceil((o.x+o.w/2+padding+bounds)/cellSize));
      const z0 = clamp(Math.floor((o.z-o.d/2-padding+bounds)/cellSize));
      const z1 = clamp(Math.ceil((o.z+o.d/2+padding+bounds)/cellSize));
      for (let z=z0;z<=z1;z++) for (let x=x0;x<=x1;x++) {
        const dx=Math.max(Math.abs(coordinate(x)-o.x)-o.w/2,0);
        const dz=Math.max(Math.abs(coordinate(z)-o.z)-o.d/2,0);
        if (dx*dx+dz*dz <= padding*padding) blocked[index(x,z)] = 1;
      }
    }
    // A narrow pole can fit between two free grid nodes. Mark blocked links as
    // well as occupied nodes so a flow cannot send the entire horde into it.
    // Check only half the directions and mirror each link to its neighbour.
    const reverse=[1,0,3,2,7,6,5,4],forward=[1,3,6,7];
    for(const o of objects){
      if(o.dead)continue;
      // A wide rectangle cannot fit between adjacent grid nodes; occupancy
      // plus the no-corner-cut rule already covers it. Only narrow furniture,
      // cars and walls need exact edge sweeps when a profile is built.
      if(o.w>=cellSize*2&&o.d>=cellSize*2)continue;
      const reach=padding+cellSize;
      const x0=clamp(Math.floor((o.x-o.w/2-reach+bounds)/cellSize)),x1=clamp(Math.ceil((o.x+o.w/2+reach+bounds)/cellSize));
      const z0=clamp(Math.floor((o.z-o.d/2-reach+bounds)/cellSize)),z1=clamp(Math.ceil((o.z+o.d/2+reach+bounds)/cellSize));
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
        const n=index(x,z);if(blocked[n])continue;
        for(const k of forward){
          if(edges[n]&(1<<k))continue;
          const [dx,dz]=steps[k],nx=x+dx,nz=z+dz;
          if(nx<0||nx>=size||nz<0||nz>=size)continue;
          const next=index(nx,nz);if(blocked[next])continue;
          if(dx&&dz&&(blocked[index(x+dx,z)]||blocked[index(x,z+dz)]))continue;
          if(segmentBoxHit(coordinate(x),coordinate(z),coordinate(nx),coordinate(nz),o,padding)===null)continue;
          edges[n]|=1<<k;edges[next]|=1<<reverse[k];
        }
      }
    }
    const p = { padding, blocked, edges, distance, queue, target:-1, targetX:0, targetZ:0 };
    profiles.set(padding,p);
    return p;
  }

  function nearestFree(p,x,z,reachable=false,origin=null) {
    const cx=cellX(x),cz=cellX(z);
    let best=-1,bestScore=Infinity;
    for (let ring=0;ring<=8;ring++) {
      for (let dz=-ring;dz<=ring;dz++) for (let dx=-ring;dx<=ring;dx++) {
        if (ring && Math.abs(dx)!==ring && Math.abs(dz)!==ring) continue;
        const ix=cx+dx,iz=cz+dz;
        if(ix<0||ix>=size||iz<0||iz>=size) continue;
        const n=index(ix,iz);
        if(p.blocked[n] || (reachable && p.distance[n]<0)) continue;
        const nx=coordinate(ix),nz=coordinate(iz);
        const score=(nx-x)**2+(nz-z)**2;
        if(score>=bestScore || (origin && !segmentClear(origin.x,origin.z,nx,nz,origin.radius))) continue;
        best=n; bestScore=score;
      }
      if(best>=0 && ring>=1) break;
    }
    return best;
  }

  function buildFlow(p,tx,tz) {
    const target=nearestFree(p,tx,tz);
    if(p.target===target) return;
    p.target=target;p.targetX=tx;p.targetZ=tz;
    p.distance.fill(-1);
    if(target<0)return;
    p.distance[target]=0;
    let head=0,tail=1;p.queue[0]=target;
    while(head<tail) {
      const n=p.queue[head++],x=n%size,z=Math.floor(n/size),nextDistance=p.distance[n]+1;
      for(let k=0;k<steps.length;k++) {
        if(p.edges[n]&(1<<k))continue;
        const [dx,dz]=steps[k];
        const nx=x+dx,nz=z+dz;
        if(nx<0||nx>=size||nz<0||nz>=size)continue;
        const next=index(nx,nz);
        if(p.blocked[next] || p.distance[next]>=0)continue;
        if(dx&&dz&&(p.blocked[index(x+dx,z)]||p.blocked[index(x,z+dz)]))continue;
        p.distance[next]=nextDistance;p.queue[tail++]=next;
      }
    }
  }

  function nextCell(p,n,tx,tz) {
    const x=n%size,z=Math.floor(n/size);
    let best=n,score=Infinity;
    for(let k=0;k<steps.length;k++) {
      if(p.edges[n]&(1<<k))continue;
      const [dx,dz]=steps[k];
      const nx=x+dx,nz=z+dz;
      if(nx<0||nx>=size||nz<0||nz>=size)continue;
      const v=index(nx,nz);
      if(p.blocked[v]||p.distance[v]<0||p.distance[v]>=p.distance[n])continue;
      if(dx&&dz&&(p.blocked[index(x+dx,z)]||p.blocked[index(x,z+dz)]))continue;
      const s=p.distance[v]*cellSize+Math.hypot(coordinate(nx)-tx,coordinate(nz)-tz)*.025;
      if(s<score){score=s;best=v;}
    }
    return best;
  }

  function getChaseDirection(x,z,tx,tz,radius=.5) {
    const dx=tx-x,dz=tz-z,length=Math.hypot(dx,dz);
    if(length<.025)return{x:0,z:0};
    if(segmentClear(x,z,tx,tz,radius+.04))return{x:dx/length,z:dz/length};
    const p=profileFor(radius);buildFlow(p,tx,tz);
    let n=nearestFree(p,x,z,true,{x,z,radius:Math.max(.05,radius-.03)});
    if(n<0)return{x:0,z:0,blocked:true};
    let waypoint=n;
    for(let i=0;i<7;i++) {
      const next=nextCell(p,n,tx,tz);
      if(next===n)break;
      const nx=coordinate(next%size),nz=coordinate(Math.floor(next/size));
      if(!segmentClear(x,z,nx,nz,radius+.04))break;
      waypoint=next;n=next;
    }
    const wx=coordinate(waypoint%size),wz=coordinate(Math.floor(waypoint/size));
    const wxd=wx-x,wzd=wz-z,len=Math.hypot(wxd,wzd);
    if(len<.025)return{x:0,z:0,blocked:true};
    return {x:wxd/len,z:wzd/len,waypoint:{x:wx,z:wz}};
  }

  return {
    getChaseDirection,
    hasLineOfSight: segmentClear,
    invalidateNavigation(){profiles.clear();version++;},
    get version(){return version;},
    get cachedProfiles(){return profiles.size;},
    cellSize,
  };
}
