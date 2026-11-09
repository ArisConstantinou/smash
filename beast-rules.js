// Fixed encounter rules: difficulty follows the level/sector at summon time,
// never the player's currently selected weapon or frame rate.
export const BEAST_HEIGHT=19;
export const BEAST_BODY_SLAM_DROP=3.85;
export const BEAST_ENTRY=Object.freeze({opening:.9,walking:4.4,roar:1.1,closing:.6});
export function beastHealth(level=1,sector=1,round=1){
 const safe=(n,f)=>Number.isFinite(n)?Math.max(1,n):f;
 return Math.round(7600*(1+.065*(safe(level,1)-1))*(1+.4*(safe(sector,1)-1))+(safe(round,1)-1)*250);
}
export function beastDamageScale(state){return state==='enter'?0:state==='recover'?1.25:state==='walk'?.8:.65;}
export function beastBehind(b,player){
 const dx=player.x-b.x,dz=player.z-b.z,dist=Math.hypot(dx,dz);
 return dist>.01&&(dx*Math.sin(b.mesh.rotation.y)+dz*Math.cos(b.mesh.rotation.y))/dist<-.3;
}
export function beastUnderbody(b,player){
 const dx=player.x-b.x,dz=player.z-b.z,yaw=b.mesh.rotation.y;
 const x=dx*Math.cos(yaw)-dz*Math.sin(yaw),z=dx*Math.sin(yaw)+dz*Math.cos(yaw);
 return (player.y||0)<1.1&&Math.hypot(x/(b.w*.29),z/(b.d*.24))<1;
}
export function chooseBeastAttack(b,player){
 if(beastUnderbody(b,player))return 'bodySlam';
 const rear=beastBehind(b,player),close=Math.hypot(player.x-b.x,player.z-b.z)<b.d*.5+6;
 if(rear&&close&&(player.y||0)<1.1&&(b.rearCooldown||0)<=0){b.rearCooldown=8;return 'rearStomp';}
 const kinds=['missiles','rockets','laser','stomp'],kind=kinds[b.attack++%kinds.length];
 // The upward-launching missiles can reach behind; a chest laser cannot
 // legitimately pass through the boss's own body to hit a rear target.
 return rear&&(kind==='laser'||kind==='rockets'||kind==='stomp')?'missiles':kind;
}
export function beastPortalLocation(player,depth,bounds=117){
 let best=null,score=Infinity;
 for(let x=-88;x<=88;x+=22)for(let z=-88;z<=88;z+=22){
  const dx=player.x-x,dz=player.z-z,distance=Math.hypot(dx,dz);if(distance<32||distance>64)continue;
  const yaw=Math.atan2(dx,dz);
  const nx=Math.sin(yaw),nz=Math.cos(yaw),end={x:x+nx*(depth*.5+1.5),z:z+nz*(depth*.5+1.5)};
  if(Math.max(Math.abs(end.x),Math.abs(end.z))>bounds-depth*.65||Math.hypot(end.x-player.x,end.z-player.z)<16)continue;
  const rank=Math.abs(distance-43)+Math.abs(dx*nx+dz*nz-distance)*.2;
  if(rank<score){score=rank;best={x,z,yaw,nx,nz,end};}
 }
 return best||{x:0,z:0,yaw:0,nx:0,nz:1,end:{x:0,z:depth*.5+1.5}};
}
