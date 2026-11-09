// Finite waves share the same living city. A new wave begins only after every
// scheduled enemy is defeated; spawning in groups never skips the remaining budget.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const numberOf=n=>Number.isFinite(n)?Math.max(1,Math.floor(n)):1;

export function wavePlan(number=1){
  const n=numberOf(number);
  return {
    number:n,total:10+(n-1)*6,
    batches:n<=2?[2,3,5]:n<=4?[3,5,5]:[5,5,Math.min(9,5+Math.floor(n/3))],
    firstDelay:n===1?6:3,interval:Math.max(3,6-(n-1)*.28),
    aliveCap:Math.min(48,10+(n-1)*4),breakTime:5,
    miniBoss:n%3===0?(n%6===0?'siegeMech':'titan'):null,
  };
}

export function enemyTypeForWave(number=1,roll=Math.random()){
  const n=numberOf(number),r=clamp(Number.isFinite(roll)?roll:1,0,1);
  if(n===1)return 'zombie';
  if(n===2)return r<.18?'robot':r<.42?'crawler':'zombie';
  if(n===3)return r<.15?'brute':r<.4?'robot':r<.63?'crawler':'zombie';
  if(r<Math.min(.22,.08+(n-4)*.018))return 'mech';
  if(r<.29)return 'mutant';
  if(r<.42)return 'brute';
  if(r<.65)return 'robot';
  return r<.82?'crawler':'zombie';
}

export function waveBatch(number,spawned,batchIndex,slots=Infinity,random=Math.random){
  const plan=wavePlan(number),remaining=Math.max(0,plan.total-Math.max(0,spawned));
  const count=Math.min(remaining,plan.batches[Math.max(0,batchIndex)%plan.batches.length],Math.max(0,Math.floor(slots)));
  return Array.from({length:count},(_,i)=>plan.miniBoss&&spawned+i===plan.total-1?plan.miniBoss:enemyTypeForWave(plan.number,random()));
}

const TYPES={
  zombie:{name:'ΖΟΜΠΙ',hp:100,damage:5,speed:1.35,radius:.45,height:1.75,windup:.9,attackRecovery:2.75,lungeSpeed:8.2,attackKind:'lunge',xp:1,palette:'organic'},
  crawler:{name:'ΑΡΠΑΚΤΙΚΟ',hp:80,damage:5,speed:2.5,radius:.48,height:1.15,windup:.66,attackRecovery:2.5,lungeSpeed:10,attackKind:'lunge',xp:1,palette:'organic'},
  robot:{name:'ΡΟΜΠΟΤ',hp:150,damage:6,speed:1.65,radius:.47,height:1.8,windup:1.15,attackRecovery:3.8,boltSpeed:8,attackKind:'ranged',xp:2,palette:'metal'},
  brute:{name:'ΒΑΡΥΣ',hp:240,damage:13,speed:1.15,radius:.71,height:2.55,windup:1.25,attackRecovery:3.2,attackRadius:2.95,attackKind:'slam',xp:3,palette:'organic'},
  mutant:{name:'ΜΕΤΑΛΛΑΓΜΕΝΟΣ',hp:200,damage:10,speed:1.9,radius:.72,height:2.6,windup:1.05,attackRecovery:2.9,lungeSpeed:9.5,attackKind:'lunge',xp:3,palette:'organic'},
  mech:{name:'MECH',hp:360,damage:11,speed:1.4,radius:.82,height:2.95,windup:1.25,attackRecovery:3.9,boltSpeed:9,attackKind:'ranged',burst:3,xp:4,palette:'metal'},
  titan:{name:'ΤΙΤΑΝΑΣ · MINI BOSS',hp:600,damage:20,speed:1.22,radius:1.3,height:4.35,windup:1.5,attackRecovery:3.6,attackRadius:4.2,attackKind:'slam',miniBoss:true,xp:10,palette:'organic'},
  siegeMech:{name:'ΠΟΛΙΟΡΚΗΤΗΣ · MINI BOSS',hp:720,damage:15,speed:1.2,radius:1.3,height:4.7,windup:1.5,attackRecovery:4.1,boltSpeed:9.2,attackKind:'ranged',burst:3,miniBoss:true,xp:12,palette:'metal'},
  siegeTransformer:{name:'ΠΟΛΙΟΡΚΗΤΗΣ',hp:1350,damage:32,speed:1.65,radius:2.35,height:6.8,windup:1.1,attackRecovery:2.5,attackRadius:5.5,attackKind:'slam',miniBoss:true,xp:26,palette:'metal'},
  hollowMarshal:{name:'ΝΕΚΡΟΣΤΡΑΤΗΓΟΣ',hp:1920,damage:38,speed:1.95,radius:1.45,height:5.75,windup:1.05,attackRecovery:2.42,attackRadius:5.8,attackKind:'slam',miniBoss:true,xp:38,palette:'organic'},
  marshalThrall:{name:'ΝΕΚΡΟΣΤΡΑΤΙΩΤΗΣ',hp:165,damage:8,speed:2.15,radius:.49,height:1.97,windup:.76,attackRecovery:2.4,lungeSpeed:8.9,attackKind:'lunge',xp:2,palette:'organic'},
};

export const WAVE_ENEMY_TYPES=Object.keys(TYPES);
export function enemyStatsForWave(type,number=1){
  const n=numberOf(number),base=TYPES[type]||TYPES.zombie,step=n-1;
  return {...base,hp:Math.round(base.hp*(1+.18*step)),damage:Math.max(base.damage+step,Math.round(base.damage*(1+.12*step))),
    speed:base.speed*(1+Math.min(.25,.025*step)),
    windup:base.windup*(1-Math.min(.22,step*.014)),
    attackRecovery:base.attackRecovery*(1-Math.min(.2,step*.012))};
}
