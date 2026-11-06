// Combat masses are kilograms; velocities are metres/second. This is a small
// authored arcade-physics model, not a general rigid-body engine.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const MASS={zombie:70,crawler:48,robot:125,mutant:180,brute:230,mech:420,titan:720,siegeMech:950,boss:2400};
export const isKickVehicle=o=>['car','policecar','ambulance'].includes(o?.type);
export function combatMass(o){
  if(Number.isFinite(o?.mass)&&o.mass>0)return o.mass;
  if(isKickVehicle(o))return o.type==='ambulance'?2500:o.type==='policecar'?1600:1250;
  return (MASS[o?.type]||70)*(1+.018*Math.max(0,(o?.level||1)-1));
}
export function enemyCombatLevel(type,wave=1){
  const offset={crawler:0,robot:1,mutant:2,brute:2,mech:4,titan:7,siegeMech:9,boss:14};
  return Math.max(1,Math.floor(Number(wave)||1))+(offset[type]||0);
}
export function enemyLevelColor(level=1){
  return level<=3?'#91e1ab':level<=6?'#f4dd77':level<=10?'#ffaf69':level<=16?'#ff777b':'#d6a0ff';
}
export function kickStats(rank=0,power=20){
  const r=Math.floor(clamp(rank,0,30));
  return {rank:r,damage:Math.max(5,Math.round(power*.62*(1+r*.22))),impulse:620+r*185,
    carImpulse:r<2?0:4200+(r-2)*1700,cooldown:Math.max(.35,.54-r*.012),duration:.34,contactStart:.22,contactEnd:.60};
}
// Resolve a 1-D collision along its normal. A light enemy cannot launch a
// heavier one: that branch spends the incoming energy as a short slowdown.
export function transferImpact(m1,m2,v1,v2=0,{heavyThreshold=1.000001,restitution=.08}={}){
  m1=Math.max(1,Number(m1)||1);m2=Math.max(1,Number(m2)||1);
  v1=Number(v1)||0;v2=Number(v2)||0;
  const closing=v1-v2;if(closing<=.15)return {v1,v2,impulse:0,heavy:false,energy:0};
  const energy=.5*(m1*m2/(m1+m2))*closing*closing;
  if(m2>m1*heavyThreshold)return {v1:Math.min(0,v2)*.12,v2:v2*.55,impulse:0,heavy:true,energy};
  const impulse=(1+clamp(restitution,0,.2))*closing/(1/m1+1/m2);
  return {v1:v1-impulse/m1,v2:v2+impulse/m2,impulse,heavy:false,energy};
}
export function wallImpact(mass,speed,enemyLevel=1,playerLevel=1,maxHp=100){
  const energy=.5*Math.max(1,mass)*Math.max(0,speed)**2,weak=enemyLevel<=playerLevel+1;
  return {damage:Math.max(1,Math.round(Math.min(maxHp*(weak?.32:.14),energy/(weak?90:180)))),
    stun:clamp((weak?.95:.50)/Math.sqrt(Math.max(1,mass/70)),.12,1.1)};
}
export function sampleKick(p){
  p=clamp(p,0,1);const s=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
  // Chamber knee, extend the sole, retract, then put the foot back down.
  const chamber=s(p/.22),extend=s((p-.22)/.19),recover=s((p-.53)/.47);
  return {hip:(-1.12*chamber-.43*extend)*(1-recover),knee:(1.6*chamber-1.48*extend)*(1-recover),
    lean:-.16*chamber*(1-recover),step:.17*extend*(1-recover),bodyYaw:-.10*chamber*(1-recover)};
}
