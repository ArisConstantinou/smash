// Pure, bounded helpers shared by production combat and regression tests.
import {firstHammerHit} from './combat.js?v=20261107-forge9';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t);};

export function selectThrowLock(origin,direction,targets,objects,{range=14,radius=.2,maxHeightDelta=2.2,cone=Math.PI*70/180,exclude=new Set()}={}){
  const length=Math.hypot(direction.x,direction.z)||1,dx=direction.x/length,dz=direction.z/length;
  let best=null,score=-Infinity;
  for(const target of targets){
    if(!target||target.dead||exclude.has(target))continue;
    const x=target.x-origin.x,z=target.z-origin.z,d=Math.hypot(x,z);
    if(d<.2||d>range)continue;
    const alignment=(x*dx+z*dz)/d;
    if(alignment<Math.cos(cone))continue;
    const point={x:target.x,y:(target.y||0)+Math.min(1.35,(target.height||2)*.6),z:target.z};
    if(Math.abs(point.y-origin.y)>maxHeightDelta)continue;
    // Never guide a throw through scenery, including a car in front of a foe.
    if(firstHammerHit(origin,point,objects,radius))continue;
    const value=alignment*2.5-d/range;
    if(value>score){score=value;best=target;}
  }
  return best;
}

// Predict each swept contact before choosing the next nearest visible enemy.
// A large weapon reaches a body's outer surface well before its centre, so
// selecting the next hop from enemy centres can show a different hit order
// even when every enemy is stationary. Moving enemies can change later hops.
export function previewThrowChain(first,targets,objects,{maxHits=1,radius=.2,chainRadius=9,origin=null}={}){
  if(!first||first.dead)return [];
  const result=[],seen=new Set(),actors=targets.includes(first)?targets:[first,...targets];
  const point=t=>({x:t.x,y:(t.y||0)+Math.min(1.35,(t.height||t.h||2)*.6),z:t.z});
  let from=origin||point(first),destination=first;
  while(destination&&result.length<Math.min(5,Math.max(1,maxHits))){
    // Keep scene-first tie ordering and intervening enemies identical to the
    // projectile update. A scenery hit ends the outward flight immediately.
    const hit=firstHammerHit(from,point(destination),[...objects,...actors].filter(t=>!seen.has(t)),radius);
    if(!hit||!actors.includes(hit.target)||hit.target.w!==undefined)break;
    result.push(hit.target);seen.add(hit.target);
    if(result.length>=Math.min(5,Math.max(1,maxHits)))break;
    from={x:hit.x,y:hit.y,z:hit.z};destination=null;
    let distance=chainRadius;
    for(const target of actors){
      if(!target||target.dead||seen.has(target))continue;
      const to=point(target),d=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z);
      if(d<.001||d>distance||firstHammerHit(from,to,objects,radius))continue;
      destination=target;distance=d;
    }
  }
  return result;
}

export function punchStats(level=1,powerUpgrades=0,variant=0){
  const index=Math.abs(Math.floor(variant))%4;
  return {variant:index,hand:index%2?'right':'left',duration:index===2?.32:.28,
    damage:Math.round((10+Math.max(0,level-1))*(1+.12*Math.max(0,powerUpgrades))*(index===1?1.2:index===2?1.12:1)),
    radius:.18};
}
export function samplePunchMotion(progress,variant=0){
  const p=clamp(progress,0,1),left={x:-.36,y:1.39,z:.42},right={x:.36,y:1.36,z:.45};
  const side=variant%2?1:-1,load=smooth(p/.18),extend=smooth((p-.16)/.25),recover=smooth((p-.50)/.50);
  const amount=extend*(1-recover),hand=side>0?right:left;
  hand.z+=(-.12*load*(1-extend)+.53*extend)*(1-recover);
  hand.x+=side*(-.13*amount+(variant===2?.10*Math.sin(amount*Math.PI):0));
  hand.y+=(variant===2?.06:0)*amount;
  return {left,right,bodyYaw:-side*.20*amount,bodyPitch:.08*amount,active:p>=.20&&p<=.55};
}

// Whole resting mesh bounds, not the previous .2m point collider. Footprints
// are measured after laying the actual model down, including size upgrades.
export function restSpotClear(point,footprint,objects,bounds=Infinity){
  const minX=point.x+footprint.minX,maxX=point.x+footprint.maxX;
  const minZ=point.z+footprint.minZ,maxZ=point.z+footprint.maxZ;
  if(minX < -bounds+.08||maxX>bounds-.08||minZ < -bounds+.08||maxZ>bounds-.08)return false;
  return !objects.some(o=>!o.dead&&o.h>(point.groundY||0)+.04&&
    maxX>o.x-o.w/2-.08&&minX<o.x+o.w/2+.08&&maxZ>o.z-o.d/2-.08&&minZ<o.z+o.d/2+.08);
}
export function nearestPickupPoint(player,rest,footprint){
  return {x:clamp(player.x,rest.x+footprint.minX,rest.x+footprint.maxX),
    z:clamp(player.z,rest.z+footprint.minZ,rest.z+footprint.maxZ)};
}
export function findWeaponRest(origin,footprint,objects,{bounds=Infinity,breadcrumbs=[],support=null}={}){
  const solids=objects.filter(o=>!o.dead&&o.h>.04&&Number.isFinite(o.w)&&Number.isFinite(o.d));
  const fitsSurface=p=>!support||(p.x+footprint.minX>=support.x-support.w/2+.08&&p.x+footprint.maxX<=support.x+support.w/2-.08&&p.z+footprint.minZ>=support.z-support.d/2+.08&&p.z+footprint.maxZ<=support.z+support.d/2-.08);
  const candidates=[];
  const add=(x,z)=>candidates.push({x,z});
  add(origin.x,origin.z);
  // Exact candidate faces avoid placing the long shaft through a car/wall.
  for(const o of solids){
    if(Math.hypot(o.x-origin.x,o.z-origin.z)>(o.w+o.d)/2+6)continue;
    const a=o.x-o.w/2-footprint.maxX-.10,b=o.x+o.w/2-footprint.minX+.10;
    const c=o.z-o.d/2-footprint.maxZ-.10,d=o.z+o.d/2-footprint.minZ+.10;
    add(a,origin.z);add(b,origin.z);add(origin.x,c);add(origin.x,d);
    for(const x of [a,b])for(const z of [c,d])add(x,z);
  }
  for(let r=.45;r<=4.5;r+=.45)for(let n=0;n<24;n++)add(origin.x+Math.cos(n*Math.PI/12)*r,origin.z+Math.sin(n*Math.PI/12)*r);
  candidates.sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z));
  // Use the last approach point outside solid geometry. This stops a wall hit
  // from choosing a slightly closer spot on the unreachable far side.
  const pointClear=p=>!firstHammerHit({x:p.x,y:.2,z:p.z},{x:p.x,y:.2,z:p.z},solids,.04);
  const anchor=pointClear(origin)?origin:[...breadcrumbs].reverse().find(pointClear);
  const visible=p=>anchor&&!firstHammerHit({x:anchor.x,y:.2,z:anchor.z},{x:p.x,y:.2,z:p.z},solids,.04);
  for(const p of candidates)if(fitsSurface(p)&&restSpotClear(p,footprint,solids,bounds)&&visible(p))return p;
  // A tight alley may be narrower than the model. Backtrack its actual throw
  // path instead of parking it inside a collider or on an inaccessible roof.
  for(const p of [...breadcrumbs].reverse())if(fitsSurface(p)&&restSpotClear(p,footprint,solids,bounds))return {x:p.x,z:p.z};
  return null;
}
