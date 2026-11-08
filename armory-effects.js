// Bounded gameplay effects. Rendering/target geometry stay in the owning game.
export class ArmoryEffects{
 constructor({targets,blocked,damage,visual}){Object.assign(this,{targets,blocked,damage,visual});this.burning=new Map();}
 clear(){this.burning.clear();}
 hit(target,profile,amount,point){
  if(!profile||profile.core==='none')return;
  const rank=profile.coreRank||1,efficiency=profile.coreEfficiency||profile.corePower||1;
  const origin={x:point?.x??target.x,y:point?.y??(target.y||0)+.8,z:point?.z??target.z};
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
 update(dt){if(dt<=0)return;for(const [target,b]of this.burning){if(target.dead||target.exploding){this.burning.delete(target);continue;}b.clock-=dt;if(b.clock<=0){b.clock+=.4;b.ticks--;const p={x:target.x,y:(target.y||0)+.6,z:target.z};this.damage(target,b.damage,p,'fire');this.visual('fire',p,p);if(b.ticks<=0||target.dead)this.burning.delete(target);}}}
}
