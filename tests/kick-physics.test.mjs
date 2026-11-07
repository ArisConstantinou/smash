import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyMass,enemyLevel,enemyHealthColor,kickStats,kickVelocity,transferMomentum,wallSlamResponse,firstVehicleContact,sampleKickMotion} from '../kick-physics.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('enemy levels are stable by wave and type, with a distinct readable HP tier palette',()=>{
 assert.equal(enemyLevel('zombie',1),1);assert.equal(enemyLevel('brute',1),3);assert.equal(enemyLevel('titan',6),10);
 assert.ok(bodyMass({type:'titan',level:8})>bodyMass({type:'zombie',level:8})*7);
 assert.equal(new Set([1,4,7,11,15].map(enemyHealthColor)).size,5);
 for(const lv of [1,2,3])assert.equal(enemyHealthColor(lv),enemyHealthColor(1));
});
test('every kick moves cars and stronger upgrades increase vehicle impulse',()=>{
 const base=kickStats(1,0),mid=kickStats(15,1),up=kickStats(1,2);
 assert.ok(base.damage>0&&base.impulse>0);assert.equal(base.rank,1);
 for(const type of ['car','policecar','ambulance']){assert.ok(kickVelocity({type},base)>4);assert.ok(kickVelocity({type},mid)>kickVelocity({type},base));assert.ok(kickVelocity({type},up)>kickVelocity({type},mid));}
 assert.equal(up.rank,3);assert.equal(kickVelocity({isBuilding:true},up),0);
 assert.ok(kickVelocity({type:'zombie'},base)>kickVelocity({type:'brute'},base));
});
test('normal collision transfers momentum according to both masses without creating energy',()=>{
 for(const ma of [.75,1,3.5,14])for(const mb of [1,5,22])for(const bounce of [0,.12,1]){
  const a={mass:ma,vx:6,vz:3},b={mass:mb,vx:-.5,vz:1},beforeX=ma*a.vx+mb*b.vx,beforeZ=ma*a.vz+mb*b.vz;
  const energy=.5*(ma*(a.vx*a.vx+a.vz*a.vz)+mb*(b.vx*b.vx+b.vz*b.vz));
  const hit=transferMomentum(a,b,{x:1,z:0},bounce);assert.ok(hit.impulse>0);
  close(ma*a.vx+mb*b.vx,beforeX);close(ma*a.vz+mb*b.vz,beforeZ);
  assert.ok(.5*(ma*(a.vx*a.vx+a.vz*a.vz)+mb*(b.vx*b.vx+b.vz*b.vz))<=energy+1e-9);
  close(a.vz,3);close(b.vz,1);
 }
});
test('a light enemy cannot impart its launch speed to a heavy enemy',()=>{
 const light={type:'zombie',vx:0,vz:8},heavy={type:'titan',vx:0,vz:0};
 transferMomentum(light,heavy,{x:0,z:1},.08);
 assert.ok(heavy.vz<1);assert.ok(light.vz<heavy.vz);assert.ok(Math.abs(light.vz)<1);
});
test('separating and tangential contacts do not create a second collision impulse',()=>{
 for(const vel of [{vx:0,vz:4},{vx:3,vz:-1}]){const a={mass:1,...vel},b={mass:2,vx:0,vz:6};const old={...a};assert.equal(transferMomentum(a,b,{x:0,z:1}).impulse,0);assert.deepEqual(a,old);}
});
test('a static wall absorbs momentum and never acquires a velocity',()=>{
 const a={type:'car',vx:3,vz:2},wall={isBuilding:true,vx:0,vz:0};const hit=transferMomentum(a,wall,{x:1,z:0},0);
 assert.ok(hit.energy>0);close(a.vx,0);close(a.vz,2);close(wall.vx,0);close(wall.vz,0);
});
test('wall injury and stun depend on impact speed, enemy level and body mass',()=>{
 const weak=wallSlamResponse({type:'zombie',level:1},6,8),strong=wallSlamResponse({type:'titan',level:12},6,8),slow=wallSlamResponse({type:'zombie',level:1},.5,8);
 assert.ok(weak.damage>strong.damage);assert.ok(weak.stun>strong.stun*2);assert.equal(slow.stun,0);assert.ok(slow.damage<weak.damage);
});
test('a moving car sweeps its entire box and cannot tunnel through a thin wall',()=>{
 const car={type:'car',x:0,z:0,w:2,d:4,h:1.4},wall={x:0,z:5,w:6,d:.04,h:3};
 const hit=firstVehicleContact(car,0,20,[wall]);assert.equal(hit.target,wall);close(hit.t,(5-.02-2)/20);close(hit.normal.z,1);
});
test('vehicle corner collision distinguishes an enemy circle from its bounding square',()=>{
 const car={x:0,z:0,w:2,d:4,h:1.4},enemy={x:1.4,z:2.4,y:0,height:1.8,radius:.5};
 assert.equal(firstVehicleContact(car,0,.01,[enemy]),null);
 assert.ok(firstVehicleContact(car,0,.2,[enemy]));
});
test('car chooses the first contact and ignores dead or vertically clear targets',()=>{
 const car={x:0,z:0,w:2,d:4,h:1.4},wall={x:0,z:6,w:4,d:.1,h:3},enemy={x:0,z:3,y:0,radius:.4};
 assert.equal(firstVehicleContact(car,0,10,[wall,enemy]).target,enemy);
 enemy.dead=true;assert.equal(firstVehicleContact(car,0,10,[wall,enemy]).target,wall);
 enemy.dead=false;enemy.y=4;assert.equal(firstVehicleContact(car,0,10,[wall,enemy]).target,wall);
});
test('kick has a real loading knee, extension window, recovery and finite clamped poses',()=>{
 assert.ok(sampleKickMotion(.22).knee>.8);assert.ok(sampleKickMotion(.46).hip< -1.4);
 assert.ok(sampleKickMotion(.46).active);assert.equal(sampleKickMotion(0).active,false);assert.equal(sampleKickMotion(1).active,false);
 close(sampleKickMotion(1).hip,0);close(sampleKickMotion(1).knee,0);
 for(const p of [-1,0,.1,.5,1,2,NaN,Infinity])for(const [k,v]of Object.entries(sampleKickMotion(p)))if(k!=='active')assert.ok(Number.isFinite(v));
});
