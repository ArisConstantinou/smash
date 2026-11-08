import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterProgression,getCharacterStats,serializeCharacterProgression,restoreCharacterProgression} from '../character-progression.js';
import {kickStats,kickVelocity} from '../kick-physics.js';
test('earned levels improve mobility, jump and throw as well as damage with the same forged weapon',()=>{
 const state=createCharacterProgression(),first=getCharacterStats(state);state.level=15;const last=getCharacterStats(state);
 assert.equal(last.weaponId,first.weaponId);assert.equal(last.canReturn,false);
 for(const key of ['power','speed','jumpVelocity','throwRange'])assert.ok(last[key]>first[key],key+' must grow with earned levels');
 assert.ok(last.jumpCooldown<first.jumpCooldown);
 assert.deepEqual(restoreCharacterProgression(serializeCharacterProgression(state)),state,'Existing save format and gear survive');
});
test('kick levels and high upgrade ranks keep increasing real launch speed for both bodies and cars',()=>{
 for(const type of ['zombie','car']){
  const target={type,level:1};assert.ok(kickVelocity(target,kickStats(15,0))>kickVelocity(target,kickStats(1,0))*1.15);
  const values=Array.from({length:31},(_,rank)=>kickVelocity(target,kickStats(1,rank)));
  for(let i=1;i<values.length;i++)assert.ok(values[i]>values[i-1],'Rank '+i+' cannot disappear into an early hard cap');
 }
});
