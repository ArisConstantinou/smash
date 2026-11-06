import * as THREE from './vendor/three.module.js';
import {firstHammerHit,segmentBoxHit} from './combat.js';
import {combatMass,isKickVehicle,kickStats,sampleKick,transferImpact,wallImpact} from './kick-physics.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const normal=(x,z)=>{const d=Math.hypot(x,z)||1;return {x:x/d,z:z/d};};

/** Game-owned adapter. Damage, rewards, sounds and material effects use the
 * existing contact pipeline; only locomotion impulses live in this module. */
export function createKickSystem(ctx){
  let active=null,cooldown=0;
  const foot=new THREE.Vector3(),previousFoot=new THREE.Vector3();
  const tune=()=>kickStats(ctx.rank,ctx.power);
  const actors=()=>[...ctx.enemies,...(ctx.boss&&!ctx.boss.dead?[ctx.boss]:[])];
  const nearby=(x,z,r)=>ctx.world.nearObjects?.(x,z,r)||ctx.world.objects.filter(o=>!o.dead);
  function hit(e,damage,dir,point=null,{lightReaction=false}={}){
    const before={vx:e.vx||0,vz:e.vz||0,stagger:e.stagger||0};
    if(e===ctx.boss)ctx.hitBoss(damage,dir,0);else ctx.hitEnemy(e,damage,dir,0,0,point);
    if(lightReaction){e.vx=before.vx;e.vz=before.vz;e.stagger=before.stagger;e.slowTime=Math.max(e.slowTime||0,.75);}
  }
  function launch(e,vx,vz,chain,damage){
    e.vx=vx;e.vz=vz;e.vy=Math.max(e.vy||0,.8/Math.sqrt(combatMass(e)/70));
    e.kickFlight={ttl:1.35,chain:chain||new Set([e]),damage};
    e.stagger=Math.max(e.stagger||0,.32);e.stun=Math.max(e.stun||0,.12);
  }
  function start(){
    if(ctx.phase!=='playing'||cooldown>0||active||ctx.blocked())return false;
    const dir=ctx.prepare();const spec=tune();
    active={time:0,dir:{...dir},spec,hit:false};cooldown=spec.cooldown;
    ctx.hero.updateMatrixWorld(true);ctx.hero.userData.rightLeg.userData.foot.getWorldPosition(previousFoot);
    ctx.sound('swing',.2,{variant:'kick',weapon:'wood',exert:true});return true;
  }
  function tick(dt){cooldown=Math.max(0,cooldown-dt);if(active){active.time+=dt;if(active.time>=active.spec.duration)active=null;}}
  function pose(){
    const u=ctx.hero.userData;
    for(const leg of [u.leftLeg,u.rightLeg]){leg.userData.knee.rotation.x=0;leg.position.z=0;}
    if(!active)return;
    const p=sampleKick(active.time/active.spec.duration);
    ctx.hero.rotation.y=Math.atan2(active.dir.x,active.dir.z);
    u.rightLeg.rotation.set(p.hip,0,.04);u.rightLeg.userData.knee.rotation.x=p.knee;
    u.rightLeg.position.z=p.step;
    u.leftLeg.rotation.set(.05,0,-.06);
    u.body.rotation.set(p.lean,p.bodyYaw,0);u.body.position.y=0;
    // Keep the held club away from the extending leg, both wrists still IK-bound.
    u.weaponRig.position.x-=.12;u.weaponRig.position.y+=.07;
  }
  function contact(){
    if(!active)return;
    const a=active,p=a.time/a.spec.duration;
    ctx.hero.updateMatrixWorld(true);ctx.hero.userData.rightLeg.userData.foot.getWorldPosition(foot);
    if(!a.hit&&p>=a.spec.contactStart&&p<=a.spec.contactEnd){
      const targets=[...nearby(ctx.player.x,ctx.player.z,2.4).filter(o=>o.h>ctx.player.y+.15),...actors()];
      const c=firstHammerHit(previousFoot,foot,targets,.24);
      if(c){
        a.hit=true;const target=c.target;
        // Test the body-to-sole line too: the foot cannot hit through a facade.
        const origin={x:ctx.player.x,y:foot.y,z:ctx.player.z};
        const wall=firstHammerHit(origin,c,targets.filter(o=>Number.isFinite(o.w)),.10);
        if(wall&&wall.target!==target&&wall.t<.99){kickObject(wall.target,a.spec,a.dir,wall);return;}
        if(Number.isFinite(target.w))kickObject(target,a.spec,a.dir,c);
        else{
          hit(target,a.spec.damage,a.dir,c);
          const speed=Math.min(12,a.spec.impulse/combatMass(target));
          if(target===ctx.boss){target.vx=a.dir.x*speed;target.vz=a.dir.z*speed;target.slowTime=.35;}
          else launch(target,a.dir.x*speed,a.dir.z*speed,null,a.spec.damage);
        }
        ctx.onContact?.(c);
      }
    }
    previousFoot.copy(foot);
  }
  function kickObject(o,spec,dir,point){
    ctx.hurtObject(o,spec.damage,.12,point);
    if(!o.dead&&isKickVehicle(o)&&spec.carImpulse>0){
      const speed=Math.min(10,spec.carImpulse/combatMass(o));
      o.kickMotion={vx:dir.x*speed,vz:dir.z*speed,chain:new Set([o]),damage:spec.damage,ttl:3};
    }
  }
  function wallContact(e,wall,speed,dir){
    if(!e.kickFlight||e.dead||speed<1.2)return;
    const result=wallImpact(combatMass(e),speed,e.level||1,ctx.level,e.maxHp);
    e.kickFlight=null;hit(e,result.damage,dir,{x:e.x,y:e.y+Math.min(1.1,e.height*.6),z:e.z});
    e.vx=e.vz=0;e.vy=0;e.stun=Math.max(e.stun||0,result.stun);e.stagger=Math.max(e.stagger||0,result.stun);
    ctx.text?.(e.x,e.y+e.height+.65,e.z,'ΖΑΛΗ','#ffe39b',13);
  }
  function tickActor(e,dt){
    e.slowTime=Math.max(0,(e.slowTime||0)-dt);e.stun=Math.max(0,(e.stun||0)-dt);
    if(e.kickFlight){e.kickFlight.ttl-=dt;if(e.kickFlight.ttl<=0||Math.hypot(e.vx,e.vz)<.4)e.kickFlight=null;}
  }
  function collideActors(){
    for(const a of [...ctx.enemies]){
      const flight=a.kickFlight;if(!flight||a.dead)continue;
      for(const b of actors()){
        if(b===a||b.dead||flight.chain.has(b)||Math.abs((a.y||0)-(b.y||0))>Math.min(a.height,b.height)*.75)continue;
        const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
        if(d>a.radius+b.radius+.04)continue;
        const n=d>.001?{x:dx/d,z:dz/d}:normal(a.vx,a.vz);
        const v1=a.vx*n.x+a.vz*n.z,v2=(b.vx||0)*n.x+(b.vz||0)*n.z;
        const out=transferImpact(combatMass(a),combatMass(b),v1,v2);
        if(out.energy<=2)continue;
        flight.chain.add(b);
        const damage=Math.max(1,Math.round(Math.min(flight.damage*.7,out.energy/65)));
        hit(b,damage,n,null,{lightReaction:out.heavy});
        a.vx+=n.x*(out.v1-v1);a.vz+=n.z*(out.v1-v1);
        if(!out.heavy){
          const vx=(b.vx||0)+n.x*out.v2,vz=(b.vz||0)+n.z*out.v2;
          if(b===ctx.boss){b.vx=vx;b.vz=vz;}else launch(b,vx,vz,flight.chain,damage);
        }else{b.slowTime=Math.max(b.slowTime||0,.85);a.kickFlight=null;}
        // Clear overlap symmetrically, never teleport through a wall.
        const overlap=Math.max(0,a.radius+b.radius-d);
        if(overlap>0){const candidate={x:a.x-n.x*overlap,z:a.z-n.z*overlap};
          if(!nearby(candidate.x,candidate.z,a.radius).some(o=>!o.dead&&Math.abs(candidate.x-o.x)<o.w/2+a.radius&&Math.abs(candidate.z-o.z)<o.d/2+a.radius)){a.x=candidate.x;a.z=candidate.z;}}
        if(!a.kickFlight)break;
      }
    }
  }
  function moveObject(o,x,z){
    if(ctx.world.moveObject)ctx.world.moveObject(o,x,z);
    else{o.x=x;o.z=z;o.mesh?.position.set(x,o.baseY||.065,z);ctx.world.rebuildSpatialIndex?.();}
  }
  function updateProps(dt){
    for(const car of ctx.world.objects){
      const m=car.kickMotion;if(!m||car.dead)continue;
      m.ttl-=dt;const speed=Math.hypot(m.vx,m.vz);
      if(m.ttl<=0||speed<.15){car.kickMotion=null;continue;}
      const from={x:car.x,z:car.z},to={x:car.x+m.vx*dt,z:car.z+m.vz*dt};
      let contact=null;
      for(const o of nearby(car.x,car.z,Math.hypot(car.w,car.d)+speed*dt+2)){
        if(o===car||o.dead)continue;
        const t=segmentBoxHit(from.x,from.z,to.x,to.z,{x:o.x,z:o.z,w:o.w+car.w,d:o.d+car.d});
        // Exactly touching but moving apart is not a new impact.
        if(t===0&&(to.x-o.x)**2+(to.z-o.z)**2>(from.x-o.x)**2+(from.z-o.z)**2)continue;
        if(t!==null&&(!contact||t<contact.t))contact={target:o,t};
      }
      const limit=contact?.t??1,dir=normal(m.vx,m.vz);
      for(const e of actors()){
        if(e.dead||m.chain.has(e)||(e.y||0)>car.h)continue;
        const t=segmentBoxHit(from.x,from.z,to.x,to.z,{x:e.x,z:e.z,w:car.w+e.radius*2,d:car.d+e.radius*2});
        if(t===null||t>limit)continue;
        m.chain.add(e);const energy=.5*combatMass(car)*speed*speed;
        const damage=Math.max(4,Math.round(Math.min(e.maxHp*.85,energy/95)));
        hit(e,damage,dir,{x:e.x,y:e.y+.6,z:e.z});
        const out=transferImpact(combatMass(car),combatMass(e),speed,0);
        if(out.heavy){e.slowTime=.9;e.vx=e.vz=0;}
        else if(e===ctx.boss){e.vx=dir.x*out.v2;e.vz=dir.z*out.v2;}
        else launch(e,dir.x*Math.min(13,out.v2),dir.z*Math.min(13,out.v2),m.chain,damage*.5);
        const retain=clamp(Math.max(0,out.v1)/speed,.2,1);m.vx*=retain;m.vz*=retain;
      }
      const t=Math.max(0,limit-(contact?.001:0));
      moveObject(car,from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t);
      if(contact){
        const o=contact.target,point={x:(car.x+o.x)/2,y:.65,z:(car.z+o.z)/2};
        if(!m.chain.has(o)){
          m.chain.add(o);const damage=Math.max(3,Math.round(Math.min(200,.5*combatMass(car)*speed*speed/90)));
          ctx.hurtObject(o,damage,.55,point);ctx.hurtObject(car,Math.max(2,Math.round(damage*.28)),.2,point);
          if(isKickVehicle(o)&&!o.dead){const out=transferImpact(combatMass(car),combatMass(o),speed,0,{heavyThreshold:Infinity});
            o.kickMotion={vx:dir.x*out.v2,vz:dir.z*out.v2,ttl:2.5,chain:m.chain,damage:m.damage};}
        }
        car.kickMotion=null;
      }else{const damp=Math.exp(-1.45*dt);m.vx*=damp;m.vz*=damp;}
    }
  }
  return {start,tick,pose,contact,wallContact,tickActor,collideActors,updateProps,launch,kickObject,
    cancel(){active=null;},reset(){active=null;cooldown=0;},get active(){return active;},get cooldown(){return cooldown;},get stats(){return tune();}};
}
