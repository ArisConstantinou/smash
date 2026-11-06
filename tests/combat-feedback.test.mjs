import test from 'node:test';
import assert from 'node:assert/strict';
import {createHitCombo,registerComboHit,tickHitCombo,resetHitCombo,comboMultiplier,scaleComboReward,impactMaterial} from '../combat-feedback.js';

test('contacts cross each reward tier once and time or taking damage breaks a chain',()=>{
  const c=createHitCombo(),milestones=[];
  for(let i=1;i<=40;i++){const hit=registerComboHit(c);if(hit.milestone)milestones.push(i);tickHitCombo(c,.15);}
  assert.deepEqual(milestones,[5,10,20,35]);assert.equal(comboMultiplier(c),2.5);
  tickHitCombo(c,3.8);assert.equal(c.hits,0);assert.equal(comboMultiplier(c),1);
  assert.equal(registerComboHit(c).milestone,false);assert.equal(c.hits,1);
  resetHitCombo(c);assert.deepEqual(c,createHitCombo());
});
test('small XP awards retain the real fractional bonus across kills',()=>{
  let total=0,carry=0;
  for(let n=0;n<4;n++){const r=scaleComboReward(1,1.25,carry);total+=r.amount;carry=r.carry;}
  assert.equal(total,5);assert.equal(carry,0);
  const half=scaleComboReward(1,1.5),later=scaleComboReward(1,1.5,half.carry);
  assert.equal(half.amount+later.amount,3);
});
test('impacts use the struck surface rather than one generic sound',()=>{
  assert.equal(impactMaterial({isBuilding:true,type:'office'}),'masonry');
  assert.equal(impactMaterial({type:'policecar'}),'metal');
  assert.equal(impactMaterial({type:'crate'}),'wood');
  assert.equal(impactMaterial({type:'zombie',palette:'organic'}),'flesh');
});
