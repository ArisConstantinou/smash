import test from 'node:test';
import assert from 'node:assert/strict';
import {hordeAt, chooseEnemyType, enemyStats} from '../progression.js';
import {attackStats, calculateStats} from '../core.js';

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('opening zombies fall to one unupgraded tap or spin contact throughout the first minute', () => {
  const hero = calculateStats({});
  const tapDamage = attackStats(hero).damage;
  const spinDamage = Math.round(hero.power * .9);
  for (let time = 0; time <= 60; time++) {
    const zombie = enemyStats('zombie', time);
    assert.ok(zombie.hp <= tapDamage, `A starter tap must defeat the zombie at ${time}s`);
    assert.ok(zombie.hp <= spinDamage, `A starter spin contact must defeat the zombie at ${time}s`);
    assert.ok(zombie.damage <= 6, `The opening cannot exceed 5% of the initial health per hit`);
    assert.ok(zombie.speed < hero.speed / 3);
    assert.ok(zombie.windup >= .85, 'The player has time to see and avoid the first lunge');
    assert.ok(zombie.attackRecovery >= 2.6, 'A missed opening lunge leaves an opportunity to respond');
  }
  assert.equal(enemyStats('zombie', 0).hp, 30);
  assert.equal(enemyStats('zombie', 0).damage, 5);
});

test('the opening has breathing room and introduces one enemy at a time', () => {
  const opening = hordeAt(0);
  assert.equal(opening.firstSpawnDelay, 6);
  assert.equal(opening.count, 1);
  assert.equal(opening.cap, 8);
  assert.equal(opening.interval, 3.6);

  const arrivals = [];
  let next = opening.firstSpawnDelay;
  while (next < 300) {
    arrivals.push(next);
    const wave = hordeAt(next);
    assert.equal(wave.count, 1);
    next += wave.interval;
  }
  const firstMinute = arrivals.filter(time => time < 60);
  assert.ok(firstMinute.length >= 12 && firstMinute.length <= 18,
    `Expected a gentle opening, found ${firstMinute.length} arrivals`);
  assert.ok(firstMinute.every((time, index) => index === 0 || time - firstMinute[index - 1] > 3.2));
  const matureMinute = arrivals.filter(time => time >= 240 && time < 300);
  assert.ok(matureMinute.length > firstMinute.length * 3, 'The endless horde must still intensify');
  assert.ok(matureMinute.length <= 64, 'Late pressure stays bounded at roughly one arrival per second');
});

test('ranged robots and heavy brutes cannot spawn during their introductory grace periods', () => {
  for (let time = 0; time <= 45; time += .5) {
    for (const roll of [0, .0001, .1, .32, .43, .99999, 1]) {
      assert.equal(chooseEnemyType(roll, time), 'zombie', `Unexpected opening type at ${time}s`);
    }
  }
  for (let time = 45; time <= 100; time += .5) {
    for (const roll of [0, .0001, .1, .32, .43, .99999, 1]) {
      assert.notEqual(chooseEnemyType(roll, time), 'brute', `Premature heavy enemy at ${time}s`);
    }
  }
  assert.equal(chooseEnemyType(0, 46), 'robot');
  assert.equal(chooseEnemyType(0, 101), 'brute');
});

test('the first eligible robots take two normal starter hits and telegraph slower shots', () => {
  const hero = calculateStats({});
  const tap = attackStats(hero).damage;
  for (let time = 45; time <= 100; time++) {
    const robot = enemyStats('robot', time);
    assert.equal(Math.ceil(robot.hp / tap), 2);
    assert.ok(robot.windup >= 1, 'Early ranged attacks need a visible warning');
    assert.ok(robot.attackRecovery >= 3.3, 'Early robots must not saturate the player with bolts');
    assert.ok(robot.boltSpeed < 9.2);
    assert.ok(robot.damage <= 9);
  }
});

test('spawn pressure and enemy selection grow smoothly through the old wave thresholds', () => {
  let previous = hordeAt(0);
  for (let time = 1; time <= 600; time++) {
    const current = hordeAt(time);
    assert.equal(current.count, 1);
    assert.ok(current.interval <= previous.interval + 1e-12);
    assert.ok(previous.interval - current.interval < .02, `Abrupt cadence change at ${time}s`);
    assert.ok(current.cap >= previous.cap && current.cap - previous.cap <= 1);
    assert.ok(current.robotChance >= previous.robotChance);
    assert.ok(current.bruteChance >= previous.bruteChance);
    assert.ok(current.robotChance + current.bruteChance < .5, 'Ordinary zombies remain most of the horde');
    previous = current;
  }
  for (const boundary of [15, 30, 35, 45, 90, 100, 135, 180, 220, 240]) {
    const before = hordeAt(boundary - .001), after = hordeAt(boundary + .001);
    assert.equal(before.count, after.count);
    assert.ok(Math.abs(after.interval - before.interval) < .0001);
    assert.ok(Math.abs(after.robotChance - before.robotChance) < .0001);
    assert.ok(Math.abs(after.bruteChance - before.bruteChance) < .0001);
  }
});

test('mature type proportions use the full roll interval without hidden randomness', () => {
  const counts = {zombie: 0, robot: 0, brute: 0};
  for (let index = 0; index < 10000; index++) counts[chooseEnemyType((index + .5) / 10000, 240)]++;
  assert.deepEqual(counts, {zombie: 5600, robot: 3200, brute: 1200});
  assert.equal(chooseEnemyType(1, 240), 'zombie');
});

test('enemy health and damage grow gradually and retain readable attack windows', () => {
  for (const type of ['zombie', 'robot', 'brute']) {
    let previous = enemyStats(type, 0);
    for (let time = 1; time <= 600; time++) {
      const current = enemyStats(type, time);
      assert.ok(current.hp >= previous.hp && current.hp - previous.hp <= 1, `${type} HP jumps at ${time}s`);
      assert.ok(current.damage >= previous.damage && current.damage - previous.damage <= 1);
      assert.ok(current.speed >= previous.speed);
      assert.ok(current.windup >= .62 && current.attackRecovery >= 2);
      assert.equal(current.radius, previous.radius);
      assert.equal(current.height, previous.height);
      previous = current;
    }
  }
  assert.equal(enemyStats('zombie', 180).hp, 57);
  assert.equal(enemyStats('robot', 180).hp, 92);
  assert.equal(enemyStats('brute', 180).hp, 185);
});

test('later sectors grow stronger without unlimited speed, enemy counts or spawn bursts', () => {
  for (const time of [0, 60, 180, 600]) {
    let previousWave = hordeAt(time, 1);
    let previousEnemy = enemyStats('zombie', time, 1);
    for (let round = 2; round <= 30; round++) {
      const wave = hordeAt(time, round), enemy = enemyStats('zombie', time, round);
      assert.ok(wave.interval <= previousWave.interval);
      assert.ok(wave.interval >= .72);
      assert.equal(wave.count, 1);
      assert.ok(wave.cap >= previousWave.cap && wave.cap <= 52);
      assert.ok(enemy.hp >= previousEnemy.hp && enemy.damage >= previousEnemy.damage);
      assert.ok(enemy.speed <= 2.4);
      assert.ok(wave.firstSpawnDelay >= 3.5);
      previousWave = wave; previousEnemy = enemy;
    }
  }
});

test('boss encounters reduce regular arrivals without changing the enemy stat contract', () => {
  for (const round of [1, 2, 8]) for (const time of [0, 90, 300]) {
    const ordinary = hordeAt(time, round), duringBoss = hordeAt(time, round, true);
    close(duringBoss.interval, ordinary.interval * 1.65);
    assert.ok(duringBoss.cap <= ordinary.cap);
    assert.equal(duringBoss.count, 1);
    assert.equal(duringBoss.robotChance, ordinary.robotChance);
    assert.equal(duringBoss.bruteChance, ordinary.bruteChance);
  }
});

test('invalid timer inputs fall back to finite opening rules', () => {
  for (const time of [NaN, Infinity, -Infinity, -12]) {
    assert.deepEqual(hordeAt(time, NaN), hordeAt(0, 1));
    assert.deepEqual(enemyStats('zombie', time, -4), enemyStats('zombie', 0, 1));
  }
  assert.equal(chooseEnemyType(NaN, 300), 'zombie');
});
