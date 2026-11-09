import {createCivilianModels} from './civilian-models.js?v=civilians1';
import {normalize,clamp} from './core.js?v=20261109-gauntlet1';

const locations=[[0,6.8],[7.5,0],[0,-8],[-8,0],[22,10],[-22,-13],[44,22],[-44,11],
  [66,-44],[-66,-44],[66,44],[-66,44],[0,75],[22,-75]];
const radius=.31,height=1.56,viewDistance=35;
const angles=[0,.29,-.29,.56,-.56,.93,-.93,1.28,-1.28,1.71,-1.71,2.28,-2.28,Math.PI];

export function createCityCivilians(world){
  const models=createCivilianModels(),actors=[],alarms=[];
  let time=0;
  const clear=(x,z)=>world.clearBody(x,z,0,radius,height);
  for(const [i,[x,z]] of locations.entries()){
    const side=i%2?1:-1;
    const offsets=[[0,0],[side*1.15,0],[0,side*1.15],[-side*1.35,0],[0,-side*1.35],[side*1.8,side*.85]];
    const offset=offsets.find(([dx,dz])=>clear(x+dx,z+dz));
    if(!offset)continue;
    const home={x:x+offset[0],z:z+offset[1]};
    const rig=models.create(i),size=[1,.95,1.045][i%3];
    rig.root.scale.setScalar(size);rig.root.position.set(home.x,0,home.z);rig.root.visible=false;world.group.add(rig.root);
    actors.push({id:i,...home,home,rig,size,y:0,radius,height,mode:'walk',facing:(i%4)*Math.PI/2,phase:i*.21,
      speed:0,gait:0,stride:1.24,decision:i*.023,alertTime:0,panicUntil:0,waitUntil:0,target:null,threat:null,look:0,active:false});
  }
  function sense(a,player,enemies,boss,playerDanger){
    let threat=null,best=Infinity;
    function tryThreat(target,range,occluded=true){
      if(target.dead||Math.abs(target.y||0)>3.4)return;
      const d=Math.hypot(a.x-target.x,a.z-target.z);
      if(d>=range||d>=best||occluded&&!world.hasLineOfSight(a.x,a.z,target.x,target.z,.07))return;
      threat=target;best=d;
    }
    if(playerDanger)tryThreat(player,7.4);
    for(const e of enemies)tryThreat(e,9.8);
    if(boss)tryThreat(boss,17);
    for(const alarm of alarms)tryThreat(alarm,alarm.radius,false);
    return threat?{x:threat.x,z:threat.z}:null;
  }
  function findRoute(a,threat,player){
    let heading=threat?Math.atan2(a.x-threat.x,a.z-threat.z):a.facing;
    if(threat&&Math.hypot(a.x-threat.x,a.z-threat.z)<.15)heading=a.facing+Math.PI*.8;
    const candidates=[];
    const distances=threat?[12,7,3.1]:[6.5,3.1];
    const roads=world.layout.roads;
    for(const distance of distances)for(const offset of angles){
      const angle=heading+offset,x=a.x+Math.sin(angle)*distance,z=a.z+Math.cos(angle)*distance;
      if(Math.abs(x)>world.bounds-1||Math.abs(z)>world.bounds-1)continue;
      let streetDistance=Infinity;
      for(const r of roads)streetDistance=Math.min(streetDistance,Math.abs(x-r),Math.abs(z-r));
      if(streetDistance>4.15)continue;
      const escape=threat?Math.hypot(x-threat.x,z-threat.z)-Math.hypot(a.x-threat.x,a.z-threat.z):0;
      const awayFromPlayer=Math.min(5,Math.hypot(x-player.x,z-player.z));
      const score=escape*(threat?1.7:0)+distance*.49+Math.cos(offset)*2.8
        +Math.cos(angle-a.facing)*.75-Math.abs(streetDistance-2.15)*.49+awayFromPlayer*.28;
      candidates.push({x,z,score});
    }
    candidates.sort((a,b)=>b.score-a.score);
    return candidates.find(p=>world.hasLineOfSight(a.x,a.z,p.x,p.z,radius+.025)&&clear(p.x,p.z))??null;
  }
  function rethink(a,player,enemies,boss,playerDanger){
    const danger=sense(a,player,enemies,boss,playerDanger);
    if(danger){
      a.threat=danger;a.panicUntil=time+2.5;
      if(a.mode==='walk'||a.mode==='safe'){
        a.mode='alert';a.alertTime=.25;a.target=null;
      }
    }
    if(a.mode==='run'&&time>=a.panicUntil){
      a.mode='safe';a.waitUntil=time+1.5+a.id*.027;a.target=null;a.threat=null;
    }
    if(a.mode==='safe'&&time>=a.waitUntil)a.mode='walk';
    if(a.mode==='run'||a.mode==='walk'){
      const t=a.target;
      const reached=!t||Math.hypot(t.x-a.x,t.z-a.z)<.67;
      const unsafe=t&&danger&&Math.hypot(t.x-danger.x,t.z-danger.z)<Math.hypot(a.x-danger.x,a.z-danger.z)+.5;
      if(reached||unsafe||!world.hasLineOfSight(a.x,a.z,t.x,t.z,radius+.025)){
        a.target=findRoute(a,a.mode==='run'?a.threat:null,player);
      }
    }
  }
  function move(a,dt,player){
    const target=a.target;
    let advance=0;
    if(target&&(a.mode==='walk'||a.mode==='run')){
      let {x,z}=normalize(target.x-a.x,target.z-a.z);
      const separate=other=>{
        const dx=a.x-other.x,dz=a.z-other.z,d=Math.hypot(dx,dz);
        if(d>.01&&d<.95){x+=dx/d*(.95-d);z+=dz/d*(.95-d);}
      };
      separate(player);
      for(const other of actors)if(other!==a&&other.active)separate(other);
      const dir=normalize(x,z),heading=Math.atan2(dir.x,dir.z);
      const delta=Math.atan2(Math.sin(heading-a.facing),Math.cos(heading-a.facing));
      a.facing+=clamp(delta,-dt*12,dt*12);
      const max=(a.mode==='run'?4.45+(a.id%3)*.19:1.25+(a.id%3)*.09)*(.38+.62*Math.max(0,Math.cos(delta)));
      a.speed+=(max-a.speed)*(1-Math.exp(-dt*9));
      const amount=Math.min(Math.hypot(target.x-a.x,target.z-a.z),a.speed*dt);
      const motion=world.moveBody(a,dir.x*amount,dir.z*amount,{dy:-3*dt,radius,height});
      advance=Math.hypot(motion.x,motion.z);
      if(advance<amount*.14&&amount>.009){a.target=null;a.decision=0;}
    }else{
      a.speed*=Math.exp(-dt*9);
      if(a.mode==='alert'&&a.threat){
        const heading=Math.atan2(a.x-a.threat.x,a.z-a.threat.z),delta=heading-a.facing;
        a.facing+=clamp(Math.atan2(Math.sin(delta),Math.cos(delta)),-dt*13,dt*13);
      }
    }
    return advance;
  }
  return {
    actors,
    alarm(x,z,radius){
      alarms.push({x,z,radius,until:time+1.7});if(alarms.length>8)alarms.shift();
    },
    update(dt,player,enemies,boss,playerDanger){
      time+=dt;
      while(alarms.length&&alarms[0].until<=time)alarms.shift();
      for(const a of actors){
        const distance=Math.hypot(a.x-player.x,a.z-player.z);
        a.active=distance<viewDistance+5;a.rig.root.visible=distance<viewDistance;
        if(!a.active){a.speed=0;a.gait=0;continue;}
        a.decision-=dt;
        if(a.decision<=0){a.decision=.19+(a.id%4)*.022;rethink(a,player,enemies,boss,playerDanger);}
        if(a.mode==='alert'&&(a.alertTime-=dt)<=0){
          a.mode='run';a.target=findRoute(a,a.threat,player);
        }
        const advance=move(a,dt,player),speed=advance/dt;
        const gait=a.mode==='run'?clamp(speed/4.55,0,1):clamp(speed/1.45,0,1)*.44;
        a.gait+=(gait-a.gait)*(1-Math.exp(-dt*11));
        a.phase=(a.phase+advance/(a.stride*a.size))%1;
        const alert=a.mode==='alert'?Math.sin(Math.PI*(1-a.alertTime/.25))*.95:0;
        let look=0;
        if(a.threat&&(a.mode==='alert'||a.mode==='run'&&time>a.panicUntil-1.35)){
          const delta=Math.atan2(a.threat.x-a.x,a.threat.z-a.z)-a.facing;
          look=clamp(Math.atan2(Math.sin(delta),Math.cos(delta)),-.68,.68);
        }
        a.look+=(look-a.look)*(1-Math.exp(-dt*8));
        a.stride=a.rig.pose(a.phase,a.gait,alert,a.look);
        a.rig.root.position.set(a.x,a.y,a.z);a.rig.root.rotation.y=a.facing;
      }
    },
    dispose(){for(const a of actors)a.rig.root.removeFromParent();models.dispose();},
  };
}
