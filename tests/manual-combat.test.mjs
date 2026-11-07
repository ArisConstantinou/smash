import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleMoveStick,spinSpeed,advanceSpinMomentum,eligibleSpinContact,renewSpinMomentum,meleeAimSpec,inMeleeEnvelope,SPIN_TURN_SECONDS,SPIN_COAST_SECONDS} from '../manual-combat.js';

test('single stick has neutral, stationary turn, proportional walk and capped run zones',()=>{
  for(const r of [24,48,64]){
    assert.equal(sampleMoveStick(r*.08,0,r).aimX,0);
    const turn=sampleMoveStick(0,-r*.28,r);assert.equal(turn.y,0);assert.equal(turn.aimY,-1);assert.equal(turn.turnOnly,true);
    const slow=sampleMoveStick(r*.71,0,r);assert.ok(Math.abs(slow.x-.5)<1e-10);assert.equal(slow.turnOnly,false);
    const fast=sampleMoveStick(r*3,0,r);assert.equal(fast.x,1);assert.equal(fast.aimX,1);
  }
  assert.equal(sampleMoveStick(NaN,0,50).x,0);assert.equal(sampleMoveStick(1,1,0).x,0);
});
test('spin loses speed and stops without physical contact, never exceeding its maximum',()=>{
  const s={momentum:1};let lastSpeed=Infinity,total=0;
  for(let i=0;i<130;i++){
    const rotation=advanceSpinMomentum(s,1/120);const speed=spinSpeed(s.momentum);
    assert.ok(speed<=lastSpeed&&speed<=Math.PI*2/SPIN_TURN_SECONDS);lastSpeed=speed;total+=rotation;
  }
  assert.equal(s.momentum,0);assert.equal(spinSpeed(0),0);assert.ok(total>Math.PI&&total<Math.PI*4);
});
test('contact energy caps at one and continuous overlap cannot manufacture another hit',()=>{
  const t={},s={momentum:.2,rotation:0,time:0,hitTimes:new Map(),hitAngles:new Map(),touching:new Set(),entryHits:new Set()};
  assert.equal(eligibleSpinContact(s,t),true);renewSpinMomentum(s,t);assert.equal(s.momentum,1);
  s.time=10;s.rotation=20;assert.equal(eligibleSpinContact(s,t),false,'Still touching despite elapsed time and rotation');
  s.touching.delete(t);s.rotation=3;assert.equal(eligibleSpinContact(s,t),false,'Must complete actual revolution');
  s.rotation=Math.PI*2;assert.equal(eligibleSpinContact(s,t),true);
  s.entryHits.add(t);assert.equal(eligibleSpinContact(s,t),false,'Opening strike must leave target first');
});
test('reach indicators exclude behind, distant, dead, elevated and separated-floor enemies',()=>{
  const origin={x:0,z:0,y:0},dir={x:0,z:1},spec=meleeAimSpec({range:2.3});
  const enemy={x:0,z:2.4,y:0,height:2,radius:.4};assert.equal(inMeleeEnvelope(origin,dir,enemy,spec),true);
  for(const change of [{z:-2},{z:5},{dead:true},{y:4},{y:-3}])assert.equal(inMeleeEnvelope(origin,dir,{...enemy,...change},spec),false);
  assert.ok(meleeAimSpec({variant:'one-overhead'}).halfAngle<spec.halfAngle);
  assert.ok(meleeAimSpec({unarmed:true}).range<spec.range);
});
