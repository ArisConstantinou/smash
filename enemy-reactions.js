// Short, local reactions: the struck enemy loses its current attack, and nearby
// witnesses can flinch or retreat. Fear never grants the player invulnerability.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const EMPTY=Object.freeze({});
const SENSITIVITY=Object.freeze({zombie:1,crawler:1.12,robot:.72,brute:.62,mutant:.86,mech:.53,titan:.36,siegeMech:.3,boss:.22});
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));

export function initEnemyReaction(enemy,seed=enemy.mesh?.id??0){
  if(enemy.reactionSeed!==undefined)return enemy;
  // A stable per-spawn seed gives the horde different poses without random
  // decisions on every frame or changing the enemy's combat replay state.
  enemy.reactionSeed=(Math.imul((finite(seed)|0)+1,16807)>>>0)%997;
  enemy.fear=0;enemy.fearTime=0;enemy.fearDuration=0;enemy.fearStrength=0;enemy.fearCooldown=0;
  enemy.fearMode='brace';enemy.fearMoveX=0;enemy.fearMoveZ=0;
  enemy.fearTargetX=finite(enemy.x);enemy.fearTargetZ=finite(enemy.z);
  enemy.lookPitch=0;enemy.lookYaw=0;enemy.airThreatSeen=false;enemy.smashThreatSeen=false;
  return enemy;
}

/** Return the old telegraph for the caller to remove from its effect pool. */
export function interruptEnemyAttack(enemy,recovery=.6){
  if(enemy.dead)return null;
  const telegraph=enemy.telegraph||null;
  enemy.telegraph=null;enemy.state='walk';enemy.timer=Math.max(finite(enemy.timer),finite(recovery,.6),0);
  enemy.navTimer=0;
  // Keep vx/vz/vy: they now describe the impact's physical knockback.
  return telegraph;
}

/** Call only for witnesses with a clear line of sight to the threatening hit. */
export function startEnemyFear(enemy,threatX,threatZ,strength=1){
  initEnemyReaction(enemy);
  if(enemy.dead||enemy.fearCooldown>0||!Number.isFinite(threatX)||!Number.isFinite(threatZ)||!(strength>0))return false;
  const sensitivity=SENSITIVITY[enemy.type]??(enemy.miniBoss?.35:.85);
  const intensity=clamp(finite(strength,1)*sensitivity,.12,1);
  const variant=enemy.reactionSeed%3,heavy=enemy.miniBoss||sensitivity<.6;
  enemy.fearMode=heavy?'brace':variant===0?'retreat':variant===1?'cower':'brace';
  enemy.fearStrength=intensity;
  enemy.fearDuration=(heavy?.24:.34)+intensity*(heavy?.24:.43)+(enemy.reactionSeed%7)*.018;
  enemy.fearTime=enemy.fearDuration;
  enemy.fearCooldown=enemy.fearDuration+1.15+(1-sensitivity)*.75;
  enemy.fearTargetX=threatX;enemy.fearTargetZ=threatZ;
  return true;
}

/**
 * Run once per simulation step before the enemy's normal AI. options:
 * airborne, smashing, canSee (cached LOS), threatPower (roughly .6..1.5).
 * Returns true during a short fear reaction; the caller interrupts its attack
 * and moves fearMoveX/Z with its normal collision solver instead of chasing.
 * No scene queries or allocations occur here after initEnemyReaction.
 */
export function updateEnemyThreat(enemy,player,dt,options=EMPTY){
  initEnemyReaction(enemy);
  const step=clamp(finite(dt),0,.1);
  enemy.fearCooldown=Math.max(0,enemy.fearCooldown-step);
  enemy.fearTime=Math.max(0,enemy.fearTime-step);
  const dx=finite(player.x)-finite(enemy.x),dz=finite(player.z)-finite(enemy.z),distance=Math.hypot(dx,dz);
  const elevation=finite(player.y)-finite(player.supportY);
  const airborne=options.airborne??elevation>.55,smashing=!!options.smashing;
  const visible=options.canSee!==false&&distance<15&&!enemy.dead;
  if(!airborne){enemy.airThreatSeen=false;enemy.smashThreatSeen=false;}
  const range=smashing?8:4.8;
  if(visible&&airborne&&distance<range&&elevation>.45&&(!enemy.airThreatSeen||smashing&&!enemy.smashThreatSeen)){
    const power=clamp(finite(options.threatPower,1),.25,2);
    const severity=(smashing?.95:.4+Math.min(elevation,3)*.12)*power*(1-distance/(range*1.8));
    startEnemyFear(enemy,player.x,player.z,severity);
    enemy.airThreatSeen=true;
    if(smashing)enemy.smashThreatSeen=true;
  }
  const target=enemy.fearTime>0&&!enemy.dead?enemy.fearStrength:0;
  enemy.fear+=(target-enemy.fear)*(1-Math.exp(-step*(target>enemy.fear?18:9)));
  if(enemy.fear<.001)enemy.fear=0;
  const eyeHeight=enemy.mesh?.userData?.eyeHeight??finite(enemy.height,1.8)*.83;
  const pitch=visible?-clamp(Math.atan2(finite(player.y)+1.25-finite(enemy.y)-eyeHeight,Math.max(.45,distance)),-.3,1.0):0;
  const yaw=visible?clamp(angle(Math.atan2(dx,dz)-finite(enemy.facingYaw,enemy.mesh?.rotation.y||0)),-.65,.65):0;
  const tracking=1-Math.exp(-step*11);
  enemy.lookPitch+=(pitch-enemy.lookPitch)*tracking;enemy.lookYaw+=(yaw-enemy.lookYaw)*tracking;
  enemy.fearMoveX=0;enemy.fearMoveZ=0;
  if(target>0&&enemy.fearMode==='retreat'){
    let ax=finite(enemy.x)-enemy.fearTargetX,az=finite(enemy.z)-enemy.fearTargetZ;
    let length=Math.hypot(ax,az);
    if(length<.001){ax=Math.sin(enemy.reactionSeed);az=Math.cos(enemy.reactionSeed);length=1;}
    ax/=length;az/=length;
    const side=(enemy.reactionSeed%2?1:-1)*.24;
    const norm=1/Math.sqrt(1+side*side);
    enemy.fearMoveX=(ax+az*side)*norm;enemy.fearMoveZ=(az-ax*side)*norm;
  }
  return target>0;
}

/** Apply after the regular walk/weapon pose and before the physical hit tilt. */
export function poseEnemyReaction(enemy,time=0){
  const root=enemy.mesh,u=root?.userData;
  if(!u)return;
  const fear=enemy.dead?0:clamp(finite(enemy.fear),0,1),seed=finite(enemy.reactionSeed);
  const tremble=Math.sin(finite(time)*32+seed)*fear*.035;
  if(u.head){
    const compensation=(u.body?.rotation.x||0)*.65;
    u.head.rotation.set(finite(enemy.lookPitch)-compensation,finite(enemy.lookYaw),tremble*.7);
  }
  if(fear<=0)return;
  const crawling=enemy.type==='crawler',cower=enemy.fearMode==='cower';
  const leftTarget=crawling?-.85:cower?-2.65:-2.3;
  const rightTarget=crawling?-.72:cower?-2.45:-2.12;
  if(u.leftArm){u.leftArm.rotation.x+=(leftTarget-u.leftArm.rotation.x)*fear;u.leftArm.rotation.z+=(-.3+tremble)*fear;}
  if(u.rightArm){u.rightArm.rotation.x+=(rightTarget-u.rightArm.rotation.x)*fear;u.rightArm.rotation.z+=(.38+tremble)*fear;}
  // Tilt the whole connected rig slightly; shoulders stay attached to arms.
  root.rotation.x+=fear*(cower?.13:.065);root.rotation.z+=tremble*.45;
  if(cower&&u.head)u.head.rotation.x+=fear*.12;
}

/**
 * Works on prepareMaterials' instance-owned materials. At full flash, remove
 * diffuse colour and emit pure white, so even a dark vertex-coloured mesh reads
 * as a white silhouette. No shader toggles, geometry writes or per-frame clones.
 */
export function applyEnemyFlash(materials,amount){
  const pulse=clamp(finite(amount),0,1),white=Math.min(1,pulse*1.4);
  for(const material of materials||[]){
    const data=material.userData||(material.userData={});
    if(material.color&&!data.originalColor)data.originalColor=material.color.clone();
    if(material.emissive&&!data.originalEmissive)data.originalEmissive=material.emissive.clone();
    if(data.originalEmissiveIntensity===undefined)data.originalEmissiveIntensity=finite(material.emissiveIntensity,1);
    if(material.emissive){
      material.color?.copy(data.originalColor).multiplyScalar(1-white);
      material.emissive.copy(data.originalEmissive).multiplyScalar(1-white);
      material.emissive.r+=white;material.emissive.g+=white;material.emissive.b+=white;
      material.emissiveIntensity=data.originalEmissiveIntensity*(1-white)+1.5*white;
    }else if(material.color){
      material.color.copy(data.originalColor);
      material.color.r+=(1-material.color.r)*white;material.color.g+=(1-material.color.g)*white;material.color.b+=(1-material.color.b)*white;
    }
  }
}
