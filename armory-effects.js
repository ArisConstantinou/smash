// Bounded gameplay effects. Rendering/target geometry stay in the owning game.
export class ArmoryEffects{
 constructor({targets,blocked,damage,visual,scenery=()=>[],heal=()=>false}){Object.assign(this,{targets,blocked,damage,visual,scenery,heal});this.burning=new Map();this.branded=new Map();this.siegeCooldown=0;this.healCooldown=0;}
 clear(){this.burning.clear();this.branded.clear();this.siegeCooldown=this.healCooldown=0;}
 restoreLife(target){
  if(this.healCooldown>0||!this.heal())return;
  this.healCooldown=2.8;const p={x:target.x,y:(target.y||0)+.8,z:target.z};this.visual('marshalHeal',p,p);
 }
 defeat(target){if(this.branded.delete(target))this.restoreLife(target);}
 signature(target,profile,amount,origin){
  if(profile.signature==='siegeWave'&&this.siegeCooldown<=0){
   this.siegeCooldown=2.6;this.visual('siegeWave',origin,origin);
   const radius=3.6,candidates=[];
   for(const t of [...this.targets(),...this.scenery(origin,radius)]){
    if(t===target||t.dead||t.exploding)continue;
    const x=t.w===undefined?t.x:Math.max(t.x-t.w*.5,Math.min(t.x+t.w*.5,origin.x));
    const z=t.d===undefined?t.z:Math.max(t.z-t.d*.5,Math.min(t.z+t.d*.5,origin.z));
    const y=t.w===undefined?(t.y||0)+.75:Math.max(t.baseY??0,Math.min((t.baseY??0)+t.h,origin.y));
    const p={x,y,z},distance=Math.hypot(x-origin.x,y-origin.y,z-origin.z);
    if(distance<radius)candidates.push({t,p,distance});
   }
   candidates.sort((a,b)=>a.distance-b.distance);
   let hits=0;for(const {t,p,distance} of candidates){
    if(t.dead||this.blocked(origin,p,t))continue;
    this.damage(t,Math.max(1,Math.round(amount*(.58-.32*distance/radius))),p,'siegeWave',origin);
    if(++hits>=5)break;
   }
  }else if(profile.signature==='marshalBrand'&&target.w===undefined&&!target.beast){
   if(target.dead){this.restoreLife(target);return;}
   if(!this.branded.has(target)&&this.branded.size>=24)this.branded.delete(this.branded.keys().next().value);
   this.branded.set(target,4);this.visual('marshalBrand',origin,origin);
  }
 }
 hit(target,profile,amount,point){
  if(!profile)return;
  const rank=profile.coreRank||1,efficiency=profile.coreEfficiency||profile.corePower||1;
  const origin={x:point?.x??target.x,y:point?.y??(target.y||0)+.8,z:point?.z??target.z};
  this.signature(target,profile,amount,origin);
  if(profile.core==='none')return;
  if(profile.core==='fire'&&!target.dead&&!target.exploding){
   if(!this.burning.has(target)&&this.burning.size>=64)this.burning.delete(this.burning.keys().next().value);
   const previous=this.burning.get(target);this.burning.set(target,{ticks:6,clock:previous?.clock??.4,damage:Math.max(previous?.damage||0,Math.max(1,amount*(.025+rank*.008)*efficiency))});
  }else if(profile.core==='frost'&&!target.dead){
   const previous=target.slowTime>0?(target.slowFactor||1):1;target.slowTime=Math.max(target.slowTime||0,1.1+rank*.3);target.slowFactor=Math.min(previous,Math.max(.35,.76-rank*.06));
  }else if(profile.core==='impact'&&!target.dead){target.stagger=Math.max(target.stagger||0,.15+rank*.055);}
  else if(profile.core==='arc'){
   const visited=new Set([target]);let source=origin;
   for(let i=0;i<1+Math.floor(rank/3)+(profile.arcBonusTargets||0);i++){
    const next=this.targets().filter(e=>!e.dead&&!e.exploding&&!visited.has(e)).map(e=>({e,p:{x:e.x,y:(e.y||0)+Math.min(1,e.height||e.h||1),z:e.z}})).filter(({e,p})=>Math.hypot(p.x-source.x,p.y-source.y,p.z-source.z)<4.2+rank*.25&&!this.blocked(source,p,e)).sort((a,b)=>Math.hypot(a.p.x-source.x,a.p.z-source.z)-Math.hypot(b.p.x-source.x,b.p.z-source.z))[0];
    if(!next)break;visited.add(next.e);this.visual('arc',source,next.p);this.damage(next.e,Math.max(1,amount*(.17+rank*.035)*efficiency*.75**i),next.p,'arc');source=next.p;
   }
  }
  this.visual(profile.core,origin,origin);
 }
 update(dt){
  if(dt<=0)return;
  this.siegeCooldown=Math.max(0,this.siegeCooldown-dt);this.healCooldown=Math.max(0,this.healCooldown-dt);
  for(const [target,time]of this.branded){if(target.dead||time<=dt)this.branded.delete(target);else this.branded.set(target,time-dt);}
  for(const [target,b]of this.burning){if(target.dead||target.exploding){this.burning.delete(target);continue;}b.clock-=dt;if(b.clock<=0){b.clock+=.4;b.ticks--;const p={x:target.x,y:(target.y||0)+.6,z:target.z};this.damage(target,b.damage,p,'fire');this.visual('fire',p,p);if(b.ticks<=0||target.dead)this.burning.delete(target);}}
 }
}
