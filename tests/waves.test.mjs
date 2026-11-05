import test from 'node:test';
import assert from 'node:assert/strict';
import {wavePlan,waveBatch,enemyTypeForWave,enemyStatsForWave,WAVE_ENEMY_TYPES} from '../waves.js';
import {attackStats,calculateStats} from '../core.js';

test('opening wave spends exactly ten enemies in groups of two, three and five',()=>{
  const sizes=[];let spawned=0,index=0;
  while(spawned<wavePlan(1).total){const batch=waveBatch(1,spawned,index++,48,()=>.9);sizes.push(batch.length);spawned+=batch.length;assert.ok(batch.every(type=>type==='zombie'));}
  assert.deepEqual(sizes,[2,3,5]);assert.equal(spawned,10);
  assert.deepEqual(waveBatch(1,10,3),[]);
});

test('limited capacity cannot skip a wave member or duplicate its last mini-boss',()=>{
  for(const number of [1,2,3,6,9,15]){
    const plan=wavePlan(number),spawnedTypes=[];let index=0;
    while(spawnedTypes.length<plan.total){
      const slots=index%4===0?0:index%4===1?1:4;
      const batch=waveBatch(number,spawnedTypes.length,index,slots,()=>.5);
      assert.ok(batch.length<=slots);spawnedTypes.push(...batch);index++;
      assert.ok(index<plan.total*3,'Zero-slot retries must not lose the remaining budget');
    }
    assert.equal(spawnedTypes.length,plan.total);
    assert.equal(spawnedTypes.filter(x=>x==='titan'||x==='siegeMech').length,number%3===0?1:0);
    if(plan.miniBoss)assert.equal(spawnedTypes.at(-1),plan.miniBoss);
  }
});

test('later waves increase the budget, health and damage while retaining readable attack windows',()=>{
  for(let n=2;n<=30;n++){
    assert.ok(wavePlan(n).total>wavePlan(n-1).total);
    for(const type of WAVE_ENEMY_TYPES){
      const before=enemyStatsForWave(type,n-1),after=enemyStatsForWave(type,n);
      assert.ok(after.hp>before.hp);assert.ok(after.damage>before.damage);
      assert.ok(after.windup>=.5);assert.ok(after.attackRecovery>1.9);
    }
    assert.ok(wavePlan(n).aliveCap<=48);
  }
});

test('opening zombies fall to one starting swing or one full spin contact',()=>{
  const stats=calculateStats({}),enemy=enemyStatsForWave('zombie',1);
  assert.ok(attackStats(stats,0).damage>=enemy.hp);
  assert.ok(Math.round(stats.power*.9)>=enemy.hp);
  assert.ok(enemy.damage<=stats.maxHp/20,'Initial mistakes leave room to recover');
  assert.ok(enemy.speed<stats.speed/2,'Starting movement can escape the horde');
});

test('roster expands through waves and each new archetype has a usable attack',()=>{
  const available=n=>new Set(Array.from({length:100},(_,i)=>enemyTypeForWave(n,i/100)));
  assert.deepEqual([...available(1)],['zombie']);
  assert.ok(available(2).has('crawler'));assert.ok(available(2).has('robot'));
  assert.ok(available(3).has('brute'));assert.ok(available(4).has('mutant'));assert.ok(available(4).has('mech'));
  for(const type of WAVE_ENEMY_TYPES){const e=enemyStatsForWave(type,4);assert.ok(e.hp>0&&e.speed>0&&e.damage>0);assert.ok(['slam','lunge','ranged'].includes(e.attackKind));if(e.attackKind==='lunge')assert.ok(e.lungeSpeed>e.speed);if(e.attackKind==='slam')assert.ok(e.attackRadius>e.radius);if(e.attackKind==='ranged')assert.ok(e.boltSpeed>e.speed);}
});
