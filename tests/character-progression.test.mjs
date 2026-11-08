import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHARACTER_LEVEL, MATERIAL_TYPES, CHARACTER_WEAPONS,
  createCharacterProgression, xpForNextLevel, awardCharacterXp,
  collectCharacterMaterial, getCharacterStats, getForgeStatus, forgeNextWeapon,
  serializeCharacterProgression, restoreCharacterProgression,
} from '../character-progression.js';

const copy = value => JSON.parse(JSON.stringify(value));
function awardUntilLevel(state, level) {
  while (state.level < level) awardCharacterXp(state, xpForNextLevel(state.level));
}
function collectRecipe(state, recipe) {
  for (const type of MATERIAL_TYPES) collectCharacterMaterial(state, type, recipe[type]);
}

test('an ordinary new game starts with a short-jumping log user and no magical abilities', () => {
  const state = createCharacterProgression(), starter = getCharacterStats(state);
  assert.equal(state.level, 1);
  assert.equal(state.xp, 0);
  assert.equal(state.weaponId, 'log');
  assert.deepEqual(state.materials, {wood: 0, scrap: 0, crystal: 0});
  assert.equal(starter.hasShield, false);
  assert.equal(starter.armorTier, 0);
  assert.equal(starter.canAirSmash, false);
  assert.equal(starter.canReturn, false, 'Throwing a log must not activate a boomerang');
  assert.equal(starter.canRicochet, false);
  assert.equal(starter.canLightning, false);
  assert.ok(starter.jumpVelocity > 0, 'Jumping remains available from the beginning');
  const advanced = getCharacterStats(createCharacterProgression(MAX_CHARACTER_LEVEL));
  assert.ok(starter.jumpVelocity ** 2 / advanced.jumpVelocity ** 2 < .25,
    'At the same gravity the starting jump is less than one quarter of the storm jump height');
  assert.ok(starter.power < advanced.power / 2);
  assert.equal(starter.speed,5.9);assert.ok(advanced.speed>starter.speed,'Earned levels now improve base locomotion');
});

test('experience can cross several levels in one award but cannot forge equipment', () => {
  const state = createCharacterProgression();
  const award = awardCharacterXp(state, 23);
  assert.deepEqual(award, {fromLevel: 1, level: 3, levelsGained: 2});
  assert.equal(state.xp, 3);
  assert.equal(state.weaponId, 'log');
  assert.equal(getCharacterStats(state).canReturn, false);
  assert.equal(getForgeStatus(state).next.id, 'club');
  assert.equal(getForgeStatus(state).reason, 'materials');
  assert.deepEqual(state.materials, {wood: 0, scrap: 0, crystal: 0},
    'XP and physical loot are separate rewards');
});

test('recipe collection alone cannot bypass the character-level requirement', () => {
  const state = createCharacterProgression();
  collectRecipe(state, getForgeStatus(state).next.cost);
  const before = copy(state), status = getForgeStatus(state);
  assert.equal(status.materialsReady, true);
  assert.equal(status.levelReady, false);
  assert.equal(status.reason, 'level');
  assert.equal(forgeNextWeapon(state).ok, false);
  assert.deepEqual(state, before, 'A locked forge must not debit any material');
  awardUntilLevel(state, 3);
  assert.equal(forgeNextWeapon(state).ok, true);
  assert.equal(state.weaponId, 'club');
  assert.deepEqual(state.materials, {wood: 0, scrap: 0, crystal: 0});
});

test('an incomplete multi-material recipe is atomic and reports the missing resource', () => {
  const state = createCharacterProgression(6);
  // Earned characters may reach a level before they forge its weapon.
  state.weaponId = 'club';
  state.materials = {wood: 10, scrap: 7, crystal: 9};
  const before = copy(state), status = getForgeStatus(state);
  assert.deepEqual(status.missing, {wood: 0, scrap: 1, crystal: 0});
  assert.equal(status.reason, 'materials');
  assert.equal(forgeNextWeapon(state).ok, false);
  assert.deepEqual(state, before);
  collectCharacterMaterial(state, 'scrap');
  const result = forgeNextWeapon(state);
  assert.equal(result.ok, true);
  assert.equal(result.weapon.id, 'iron');
  assert.equal(state.weaponId, 'iron');
  assert.deepEqual(state.materials, {wood: 0, scrap: 0, crystal: 9});
  assert.equal(getCharacterStats(state).canAirSmash, true);
  assert.equal(getCharacterStats(state).canReturn, false);
  const forged = copy(state);
  assert.equal(forgeNextWeapon(state).ok, false, 'A second press cannot skip the next tier gate');
  assert.deepEqual(state, forged);
});

test('an earned playthrough can forge every tier in order without changing worlds', () => {
  const state = createCharacterProgression();
  for (const expected of CHARACTER_WEAPONS.slice(1)) {
    const next = getForgeStatus(state).next;
    assert.equal(next.id, expected.id);
    awardUntilLevel(state, next.minLevel);
    collectRecipe(state, next.cost);
    const beforeLevel = state.level, beforeXp = state.xp;
    assert.equal(getForgeStatus(state).canForge, true);
    assert.equal(forgeNextWeapon(state).weapon.id, expected.id);
    assert.equal(state.level, beforeLevel, 'Forging is independent of XP and wave transitions');
    assert.equal(state.xp, beforeXp);
    assert.deepEqual(state.materials, {wood: 0, scrap: 0, crystal: 0});
  }
  assert.equal(state.weaponId, 'storm');
  const stats = getCharacterStats(state);
  assert.equal(stats.canAirSmash, true);
  assert.equal(stats.canReturn, true);
  assert.equal(stats.canRicochet, true);
  assert.equal(stats.canLightning, true);
  assert.equal(stats.maxChainHits, 5);
  assert.equal(getForgeStatus(state).reason, 'max');
  const before = copy(state);
  assert.equal(forgeNextWeapon(state).ok, false);
  assert.deepEqual(state, before);
});

test('testing presets equip the correct stage, including abilities, jump and materials', () => {
  for (const [level, weaponId] of [[1, 'log'], [2, 'log'], [3, 'club'], [5, 'club'],
    [6, 'iron'], [9, 'iron'], [10, 'war'], [14, 'war'], [15, 'storm']]) {
    const state = createCharacterProgression(level), stats = getCharacterStats(state);
    assert.equal(state.level, level);
    assert.equal(state.weaponId, weaponId, `Wrong equipped test stage for level ${level}`);
    assert.equal(stats.weaponId, weaponId);
    assert.equal(state.xp, 0);
    assert.ok(restoreCharacterProgression(state));
    if (level > 1) assert.ok(state.materials.wood > 0);
    for (const key of ['power', 'maxHp', 'speed', 'range', 'jumpVelocity']) {
      assert.ok(Number.isFinite(stats[key]) && stats[key] > 0, `${key} must be usable at level ${level}`);
    }
  }
  const war = getCharacterStats(createCharacterProgression(10));
  assert.equal(war.canReturn, true);
  assert.equal(war.canRicochet, false);
  assert.equal(war.canLightning, false);
});

test('XP thresholds advance gradually and the first forged tier is reachable after twenty basic kills', () => {
  const state = createCharacterProgression();
  for (let kill = 1; kill <= 19; kill++) {
    awardCharacterXp(state, 1);
    assert.ok(state.level < 3);
  }
  awardCharacterXp(state, 1);
  assert.equal(state.level, 3);
  assert.equal(state.xp, 0);
  let sum = 0;
  for (let level = 1; level < MAX_CHARACTER_LEVEL; level++) {
    const target = xpForNextLevel(level);
    assert.ok(Number.isSafeInteger(target) && target > 0);
    if (level > 1) assert.ok(target > xpForNextLevel(level - 1));
    sum += target;
  }
  assert.ok(Array.from({length:14},(_,i)=>xpForNextLevel(i+1)).reduce((a,b)=>a+b,0)<=1000,'The existing path to storm gear retains its original pacing');
  assert.ok(sum > 3000 && sum <= 5000, 'All thirty levels have finite, increasing thresholds');
  assert.equal(xpForNextLevel(MAX_CHARACTER_LEVEL), 0);
});

test('the level cap discards overflow without losing equipment or corrupting the XP bar', () => {
  const state = createCharacterProgression(14), materials = copy(state.materials);
  const result = awardCharacterXp(state, Number.MAX_VALUE);
  assert.equal(result.levelsGained, MAX_CHARACTER_LEVEL-14);
  assert.equal(state.level, MAX_CHARACTER_LEVEL);
  assert.equal(state.xp, 0);
  assert.equal(state.weaponId, 'war', 'Even a huge award cannot auto-forge storm gear');
  assert.deepEqual(state.materials, materials);
  const before = copy(state);
  assert.equal(awardCharacterXp(state, 99).levelsGained, 0);
  assert.deepEqual(state, before);
  assert.ok(restoreCharacterProgression(state));
});

test('invalid awards cannot subtract XP, mint unknown materials or create non-finite quantities', () => {
  const state = createCharacterProgression();
  awardCharacterXp(state, 4);
  collectCharacterMaterial(state, 'wood', 5);
  const before = copy(state);
  for (const amount of [-3, 0, NaN, Infinity, -Infinity, null, '5']) {
    assert.equal(awardCharacterXp(state, amount).levelsGained, 0);
    assert.equal(collectCharacterMaterial(state, 'wood', amount), 0);
    assert.deepEqual(state, before);
  }
  assert.equal(awardCharacterXp(state, undefined).levelsGained, 0);
  for (const type of ['gold', 'constructor', '__proto__', '', null]) {
    assert.equal(collectCharacterMaterial(state, type, 100), 0);
    assert.deepEqual(state, before);
  }
  assert.equal(collectCharacterMaterial(state, 'wood', .8), 0);
  assert.equal(collectCharacterMaterial(state, 'wood', 2.9), 2);
  collectCharacterMaterial(state, 'scrap', Number.MAX_VALUE);
  assert.ok(Number.isSafeInteger(state.materials.scrap));
  assert.ok(restoreCharacterProgression(state));
});

test('new games and presets own independent state and read helpers cannot mutate progress', () => {
  const a = createCharacterProgression(10), b = createCharacterProgression(10);
  assert.notEqual(a, b);
  assert.notEqual(a.materials, b.materials);
  const before = copy(b);
  collectCharacterMaterial(a, 'wood', 100);
  awardCharacterXp(a, 1);
  const stats = getCharacterStats(b);
  stats.power = 0;
  getForgeStatus(b).missing.wood = 999;
  serializeCharacterProgression(b);
  assert.deepEqual(b, before);
  assert.ok(getCharacterStats(b).power > 0);
  assert.ok(Object.isFrozen(CHARACTER_WEAPONS));
  assert.ok(CHARACTER_WEAPONS.every(item => Object.isFrozen(item) && Object.isFrozen(item.stats) && Object.isFrozen(item.cost)));
});

test('save round trips preserve an earned high-level character still carrying a lower-tier weapon', () => {
  const state = createCharacterProgression();
  awardUntilLevel(state, 10);
  awardCharacterXp(state, 17);
  collectCharacterMaterial(state, 'wood', 29);
  collectCharacterMaterial(state, 'scrap', 11);
  const json = serializeCharacterProgression(state), restored = restoreCharacterProgression(json);
  assert.deepEqual(restored, state);
  assert.equal(restored.weaponId, 'log', 'Restoring a save must not use the fully equipped test preset');
  assert.equal(getCharacterStats(restored).canReturn, false);
  assert.notEqual(restored, state);
  assert.notEqual(restored.materials, state.materials);
  collectCharacterMaterial(restored, 'wood', 1);
  assert.equal(state.materials.wood, 29);
});

test('save validation rejects damaged or incompatible data instead of silently granting upgrades', () => {
  const valid = createCharacterProgression();
  for (const raw of [null, undefined, false, [], '{}', '', '{broken', 'null',
    {...valid, version: 999}, {...valid, level: 0}, {...valid, level: MAX_CHARACTER_LEVEL+1}, {...valid, level: 3.5},
    {...valid, level: NaN}, {...valid, xp: -1}, {...valid, xp: 1.5}, {...valid, xp: Infinity},
    {...valid, xp: xpForNextLevel(1)}, {...valid, weaponId: 'storm'}, {...valid, weaponId: 'unknown'},
    {...valid, materials: null}, {...valid, materials: []}, {...valid, materials: {}},
    {...valid, materials: {wood: -1, scrap: 0, crystal: 0}},
    {...valid, materials: {wood: 0, scrap: Infinity, crystal: 0}},
    {...valid, materials: {wood: 0, scrap: 0, crystal: '6'}},
    {...createCharacterProgression(MAX_CHARACTER_LEVEL), xp: 1}]) {
    assert.equal(restoreCharacterProgression(raw), null, `Accepted invalid save ${JSON.stringify(raw)}`);
  }
  assert.throws(() => serializeCharacterProgression({...valid, weaponId: 'storm'}), TypeError);
  const corrupted = {...valid, weaponId: 'storm'};
  assert.deepEqual(forgeNextWeapon(corrupted), {ok: false, weapon: null, reason: 'invalid'});
  assert.equal(corrupted.weaponId, 'storm', 'Failed operations must not mutate the corrupt source');
});

test('restoring only accepts known progression data and derives stats from trusted definitions', () => {
  const state = createCharacterProgression();
  const restored = restoreCharacterProgression({...state, power: 1000000, canReturn: true,
    materials: {...state.materials, gold: 99999}, fakeEquipment: 'storm'});
  assert.deepEqual(restored, state);
  assert.equal(getCharacterStats(restored).canReturn, false);
  assert.equal(getCharacterStats(restored).power, getCharacterStats(state).power);
});

test('out-of-range starting selections remain finite legal presets', () => {
  for (const value of [-30, 0, NaN, Infinity, -Infinity, undefined, null]) {
    assert.deepEqual(createCharacterProgression(value), createCharacterProgression(1));
  }
  assert.deepEqual(createCharacterProgression(200), createCharacterProgression(MAX_CHARACTER_LEVEL));
  assert.deepEqual(createCharacterProgression(6.9), createCharacterProgression(6));
});
