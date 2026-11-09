import {createWildlifeModel} from './wildlife-models.js?v=fauna1';
import {normalize,clamp} from './core.js?v=20261109-gauntlet1';
import {segmentCircleHit} from './combat.js?v=20261107-forge9';

const inhabitants=[
  ['tapir',25,19,0,1.04],['tapir',33,24,0,.88],['tapir',-10,-38,0,.94],
  ['macaw',-20,23,3.8,1.03],['macaw',22,9,4.25,.91],['macaw',-10,-31,4.8,1.08],
  ['boar',31,9,0,1.07],['boar',46,24,0,1],
];
export const macawPerches=inhabitants.filter(([kind])=>kind==='macaw').map(([,x,z,y])=>({x,z,y}));

export function createJungleWildlife(world){
  const actors=inhabitants.map(([kind,x,z,y,size],i)=>{
    const model=createWildlifeModel(kind);
    model.root.position.set(x,y,z);model.root.rotation.y=i*1.29;model.root.scale.setScalar(size);world.group.add(model.root);
    return {kind,x,z,y,home:{x,z,y},size,model,mesh:model.root,facing:i*1.29,mode:'idle',timer:0,clock:0,phase:i*.9,
      radius:kind==='boar'?.57:.48,height:kind==='boar'?1.31:1.27,hp:kind==='boar'?135:1,maxHp:kind==='boar'?135:1,
      threat:null,dead:false,isWildlife:true,chargeHits:new Set()};
  });
  const boars=actors.filter(a=>a.kind==='boar');
  const close=(a,b,r)=>Math.hypot(a.x-b.x,a.z-b.z)<r;
  const canSee=(a,b)=>world.hasLineOfSight(a.x,a.z,b.x,b.z,.08);
  function nearestThreat(actor,player,enemies,radius){
    let nearest=null,limit=radius;
    for(const target of [player,...enemies]){
      if(target.dead||Math.abs((target.y||0)-actor.y)>1.5)continue;
      const d=Math.hypot(actor.x-target.x,actor.z-target.z);
      if(d>=limit||!canSee(actor,target))continue;
      limit=d;nearest=target;
    }
    return nearest;
  }
  function turn(actor,dx,dz,dt,rate=10){
    if(Math.hypot(dx,dz)<.001)return;
    const to=Math.atan2(dx,dz),delta=to-actor.facing;
    actor.facing+=clamp(Math.atan2(Math.sin(delta),Math.cos(delta)),-dt*rate,dt*rate);
  }
  function move(actor,dir,speed,dt){
    const before={x:actor.x,y:actor.y,z:actor.z};
    const motion=world.moveBody(actor,dir.x*speed*dt,dir.z*speed*dt,{dy:-.3*dt,radius:actor.radius,height:actor.height});
    if(world.inRiver(actor.x)){Object.assign(actor,before);return 0;}
    return Math.hypot(motion.x,motion.z);
  }
  function steer(actor,x,z,speed,dt){
    const dir=world.getChaseDirection(actor.x,actor.z,x,z,actor.radius);
    turn(actor,dir.x,dir.z,dt);
    return move(actor,dir,speed,dt);
  }
  function updateGround(actor,dt,player,enemies,contact){
    let travelled=0;
    if(actor.mode==='hurt'){
      if(actor.timer<=0)actor.mode='idle';
    }else if(actor.kind==='tapir'){
      const threat=actor.sensed;
      if(threat&&actor.mode!=='run'){
        const dir=normalize(actor.x-threat.x,actor.z-threat.z),bank=actor.x<0?-1:1;
        const x=clamp(actor.x+dir.x*14,bank<0?-65:12,bank<0?-2:65);
        actor.destination={x,z:clamp(actor.z+(Math.abs(dir.z)>.22?dir.z:Math.sin(actor.facing)||.8)*14,-65,65)};
        actor.mode='run';actor.timer=2.4;
      }
      if(actor.mode==='run'){
        travelled=steer(actor,actor.destination.x,actor.destination.z,5.15,dt);
        if(actor.timer<=0||close(actor,actor.destination,.85)){actor.mode='idle';actor.timer=0;}
      }else if(!close(actor,actor.home,1.3)&&!threat){
        actor.mode='walk';travelled=steer(actor,actor.home.x,actor.home.z,1.65,dt);
      }else actor.mode='idle';
    }else if(actor.mode==='warn'){
      if(actor.threat&&!actor.threat.dead)turn(actor,actor.threat.x-actor.x,actor.threat.z-actor.z,dt,7);
      if(actor.timer<=0){
        actor.mode='charge';actor.timer=.75;actor.chargeHits.clear();
        actor.direction={x:Math.sin(actor.facing),z:Math.cos(actor.facing)};
      }
    }else if(actor.mode==='charge'){
      const before={x:actor.x,z:actor.z};
      travelled=move(actor,actor.direction,8.5,dt);
      for(const target of [player,...enemies]){
        if(target.dead||actor.chargeHits.has(target)||Math.abs((target.y||0)-actor.y)>.85)continue;
        const hit=segmentCircleHit(before.x,before.z,actor.x,actor.z,target.x,target.z,actor.radius+(target.radius||.45)+.14);
        if(hit===null||!canSee(actor,target))continue;
        actor.chargeHits.add(target);contact(actor,target,actor.direction);
      }
      if(actor.timer<=0||!close(actor,actor.home,12)||travelled<dt*.25){actor.mode='recover';actor.timer=1.15;}
    }else if(actor.mode==='recover'&&actor.timer>0){
      // Give the target time to react before the boar can turn or strike again.
    }else if(actor.sensed&&close(actor,actor.home,8)){
      actor.threat=actor.sensed;
      if(close(actor,actor.threat,6.4)){actor.mode='warn';actor.timer=.62;}
      else{actor.mode='walk';travelled=steer(actor,actor.threat.x,actor.threat.z,2.15,dt);}
    }else if(!close(actor,actor.home,.8)){
      actor.mode='walk';travelled=steer(actor,actor.home.x,actor.home.z,2.15,dt);
    }else actor.mode='idle';
    actor.phase+=travelled>0?travelled*(actor.mode==='walk'?7.2:6.1):dt*2.4;
    return actor.mode==='charge'?.7:actor.mode==='run'?.36:0;
  }
  function updateMacaw(actor,dt){
    if(actor.mode!=='flight'){
      const threat=actor.sensed;
      if(!threat){actor.phase+=dt*2;return 0;}
      actor.mode='flight';actor.timer=5.1;
      const dir=normalize(actor.x-threat.x,actor.z-threat.z);
      actor.flightHeading=Math.atan2(dir.x,dir.z);actor.facing=actor.flightHeading;
    }
    const elapsed=5.1-actor.timer;
    if(actor.timer<=0){Object.assign(actor,actor.home);actor.mode='idle';return 0;}
    // One loop begins and ends at the same perch. The first tangent leads away
    // from the threat. Ease out and in so the claws can release and replant.
    const u=clamp(elapsed/5.1,0,1),a=(u*u*(3-2*u))*Math.PI*2,r=5.4;
    const dx=Math.sin(actor.flightHeading),dz=Math.cos(actor.flightHeading);
    const x=actor.home.x+r*(dx*Math.sin(a)+dz*(1-Math.cos(a)));
    const z=actor.home.z+r*(dz*Math.sin(a)-dx*(1-Math.cos(a)));
    turn(actor,x-actor.x,z-actor.z,dt,16);
    const height=Math.sin(Math.PI*u);
    actor.x=x;actor.z=z;actor.y=actor.home.y+4.8*Math.pow(height,.69)+.13*Math.sin(u*7*Math.PI)*height;
    actor.phase+=dt*(u<.24?16:13);
    return Math.sin(Math.PI*2*u);
  }
  return {
    actors,boars,
    hit(actor,damage){
      if(actor.dead||actor.kind!=='boar'||!Number.isFinite(damage)||damage<=0)return;
      actor.hp=Math.max(0,actor.hp-damage);actor.dead=actor.hp===0;
      actor.mode=actor.dead?'down':'hurt';actor.timer=actor.dead?.52:.25;
    },
    update(dt,player,enemies,contact){
      for(const actor of actors){
        if(actor.dead){
          actor.timer=Math.max(0,actor.timer-dt);actor.mesh.rotation.z=(1-actor.timer/.52)*1.37;
          if(actor.timer===0)actor.mesh.visible=false;
          continue;
        }
        if(!close(actor,player,44)){
          actor.mesh.visible=false;
          if(actor.kind==='macaw'&&actor.mode==='flight'){Object.assign(actor,actor.home);actor.mode='idle';}
          continue;
        }
        actor.mesh.visible=true;actor.timer-=dt;actor.clock-=dt;
        if(actor.clock<=0){
          actor.clock=.13;
          // The macaw notices movement underneath its perch.
          const sense=actor.kind==='macaw'?{...actor,y:0}:actor;
          actor.sensed=nearestThreat(sense,player,enemies,actor.kind==='boar'?8.4:actor.kind==='tapir'?6.7:5);
        }
        const lean=actor.kind==='macaw'?updateMacaw(actor,dt):updateGround(actor,dt,player,enemies,contact);
        actor.mesh.position.set(actor.x,actor.y,actor.z);actor.mesh.rotation.y=actor.facing;
        actor.model.pose(actor.phase,actor.mode,lean);
      }
    },
    dispose(){for(const actor of actors)actor.model.dispose();},
  };
}
