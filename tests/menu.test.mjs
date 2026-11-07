import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyInfo} from '../menu.js';
import {createCharacterProgression,xpForNextLevel} from '../character-progression.js';
import {makeWarrior} from '../models.js';
test('menu progress uses current character XP, not round or total career XP',()=>{
 const character=createCharacterProgression(4);character.xp=12;const info=journeyInfo({character,run:{round:12}});
 assert.equal(info.fraction,12/xpForNextLevel(4));assert.equal(info.level,4);assert.equal(info.round,12);assert.equal(info.hasSave,true);
});
test('no save starts at the left edge and cannot offer Continue',()=>{const info=journeyInfo(null);assert.equal(info.level,1);assert.equal(info.fraction,0);assert.equal(info.hasSave,false);});
test('maximum level progress reaches the end without dividing by zero',()=>{const info=journeyInfo({character:createCharacterProgression(15)});assert.equal(info.fraction,1);assert.equal(info.maxed,true);});
test('old saves without run state migrate to round one and retain earned equipment',()=>{const character=createCharacterProgression(1);character.level=7;const info=journeyInfo({character});assert.equal(info.round,1);assert.equal(info.stats.weaponTier,0);assert.equal(info.level,7);});
test('invalid saves do not manufacture a high level or an infinite progress marker',()=>{const info=journeyInfo({character:{level:Infinity,xp:NaN},run:{round:-2}});assert.equal(info.hasSave,false);assert.equal(info.fraction,0);assert.equal(info.round,1);});
test('the hero has separated feet and flared elbow poles with correctly sided shoulder sockets',()=>{
 const u=makeWarrior().userData;assert.ok(u.rightLeg.position.x-u.leftLeg.position.x>=.53);assert.ok(u.rightArm.position.x> .5);assert.ok(u.leftArm.position.x<-.5);
 assert.ok(u.leftArm.userData.elbowPole.x<-.7);assert.ok(u.rightArm.userData.elbowPole.x>.7);
});
