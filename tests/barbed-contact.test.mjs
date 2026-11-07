import test from 'node:test';
import assert from 'node:assert/strict';
import {sweptBarbedContact,barbedPullDirection,barbedPullLimit} from '../barbed-contact.js';

test('wire sweep catches a target crossed between frames without turning the whole reach disk into damage',()=>{
  const previous={start:{x:.8,y:1,z:-.8},end:{x:7,y:1,z:-4}};
  const current={start:{x:.8,y:1,z:.8},end:{x:7,y:1,z:4}};
  const target={x:4,y:0,z:0,radius:.12,height:1.7};
  const hit=sweptBarbedContact(previous,current,target,.13);
  assert.ok(hit&&hit.sweepTime>0&&hit.sweepTime<1,'A narrow target is hit during the intervening swing');
  assert.ok(hit.motion.z>0,'The reaction receives the direction of the actual crossing');
  assert.equal(sweptBarbedContact(previous,current,{...target,z:6},.13),null,'Off-path enemies remain safe');
});

test('the unwrapped grip and elevated enemies stay outside the wire collider',()=>{
  const segment={start:{x:0,y:1,z:1.05},end:{x:0,y:1,z:8}};
  const target={x:0,y:0,z:.3,radius:.16,height:1.8};
  assert.equal(sweptBarbedContact(null,segment,target,.16),null);
  assert.ok(sweptBarbedContact(null,segment,{...target,z:3},.16));
  assert.equal(sweptBarbedContact(null,segment,{...target,z:3,y:4},.16),null);
  assert.equal(sweptBarbedContact(null,segment,{...target,z:3,dead:true},.16),null);
});

test('every slash direction pulls inward while retaining the sweep side',()=>{
  const player={x:0,z:0},enemy={x:0,z:3};
  for(const motion of [{x:5,z:0},{x:-5,z:0},{x:0,z:10},{x:0,z:-10},{x:0,z:0}]){
    const dir=barbedPullDirection(player,enemy,motion);
    assert.ok(dir.z<-.8,'Even an outward sweep cannot turn the pull into knockback');
    assert.ok(Math.abs(Math.hypot(dir.x,dir.z)-1)<1e-12);
    if(motion.x)assert.equal(Math.sign(dir.x),Math.sign(motion.x));
  }
});

test('the finite pull stops short of the player and stays finite at coincidence',()=>{
  const player={x:0,z:0,radius:.44},enemy={x:0,z:1,radius:.4};
  const direction=barbedPullDirection(player,enemy,{x:2,z:0});
  const limit=barbedPullLimit(player,enemy,direction);
  assert.ok(limit>0&&limit<1,'Close contact gets only a short impulse');
  assert.ok(limit/8*(-direction.z)<=.08000001);
  assert.equal(barbedPullLimit(player,{...enemy,z:0},direction),0);
  const coincident=barbedPullDirection(player,{...enemy,z:0});
  assert.ok(Number.isFinite(coincident.x)&&Number.isFinite(coincident.z));
});

test('invalid or absent barbed geometry cannot create a hit',()=>{
  const segment={start:{x:0,y:1,z:1},end:{x:0,y:1,z:4}},enemy={x:0,y:0,z:2,radius:.3,height:2};
  assert.equal(sweptBarbedContact(null,null,enemy,.1),null);
  assert.equal(sweptBarbedContact(null,segment,enemy,0),null);
  assert.equal(sweptBarbedContact(null,{...segment,start:{x:NaN,y:1,z:1}},enemy,.1),null);
});
