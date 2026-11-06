import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { makeWarrior } from '../models.js';
import { sampleHammerSwing, SWING_CONTACT_START, SWING_CONTACT_END } from '../hammer-motion.js';

const delta = 1e-4;
const angularSpeed = p => Math.abs(sampleHammerSwing(p + delta).yaw - sampleHammerSwing(p - delta).yaw) / (2 * delta);

test('a quick tap loads the shoulder, accelerates through the front and slows into its follow-through', () => {
  const windup = sampleHammerSwing(SWING_CONTACT_START), impact = sampleHammerSwing(.40), follow = sampleHammerSwing(SWING_CONTACT_END);
  assert.ok(windup.yaw > Math.PI / 2 && windup.elevation > .6, 'The heavy head must first rise behind the right shoulder');
  assert.ok(windup.bodyYaw > 0 && follow.bodyYaw < 0, 'The torso must unwind through the stroke');
  assert.ok(impact.elevation < windup.elevation && follow.elevation < impact.elevation, 'The strike must descend instead of tracing a flat disk');
  assert.ok(angularSpeed(.36) > angularSpeed(.20) * 2.5, 'The head must gain speed before contact');
  assert.ok(angularSpeed(.61) < angularSpeed(.41) * .35, 'Momentum must decelerate through the follow-through');
  const front = Array.from({ length: 1001 }, (_, i) => i / 1000).find(p => sampleHammerSwing(p).yaw <= 0);
  assert.ok(front > SWING_CONTACT_START && front < SWING_CONTACT_END);
  assert.ok(front * .32 <= .14, 'The visible front contact must stay responsive');
  assert.ok(windup.rightLegPitch > 0 && follow.rightLegPitch < 0, 'Weight must transfer between the legs');
  assert.ok(windup.trail < 1e-6 && impact.trail > .9 && follow.trail < 1e-6, 'A fast head needs a trail while a held pose does not');
});

test('phase boundaries preserve shaft velocity and every sampled pose stays finite', () => {
  for (const options of [{}, { twoHanded: true }, { twoHanded: true, charge: 1 }]) {
    for (let step = 0; step <= 1000; step++) {
      const pose = sampleHammerSwing(step / 1000, options);
      for (const [field, value] of Object.entries(pose)) assert.ok(Number.isFinite(value), `${field} became invalid at ${step}`);
      for (const field of ['windup', 'recovery', 'trail']) assert.ok(pose[field] >= 0 && pose[field] <= 1);
    }
    for (const boundary of [SWING_CONTACT_START, .40, SWING_CONTACT_END]) {
      const before = sampleHammerSwing(boundary - delta, options), at = sampleHammerSwing(boundary, options), after = sampleHammerSwing(boundary + delta, options);
      for (const field of ['yaw', 'elevation', 'gripX', 'gripY', 'gripZ']) {
        const leftVelocity = (at[field] - before[field]) / delta, rightVelocity = (after[field] - at[field]) / delta;
        assert.ok(Math.abs(leftVelocity - rightVelocity) < .05, `${field} snaps at phase ${boundary}`);
      }
    }
  }
});

test('the real warrior rig follows a continuous full arc with connected hands in both stances', () => {
  for (const stance of [0, 1]) {
    const hero = makeWarrior(), u = hero.userData;
    u.setStance(stance); u.setReach(1.35);
    const restPosition = u.weaponRestPosition.clone();
    const restRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(u.weaponRest.x, u.weaponRest.y, u.weaponRest.z));
    const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3(), targetRotation = new THREE.Quaternion(), targetPosition = new THREE.Vector3();
    let lastHead = null, maxHeadStep = 0, peakHeadY = 0, lowestHeadY = Infinity, minHeadX = Infinity, maxHeadX = -Infinity, maxArmReach = 0;
    for (let step = 0; step <= 160; step++) {
      const pose = sampleHammerSwing(step / 160, { twoHanded: !!stance });
      u.body.rotation.set(pose.bodyPitch, pose.bodyYaw, pose.bodyRoll); u.body.position.y = pose.bodyDrop;
      direction.set(Math.sin(pose.yaw), pose.elevation, Math.cos(pose.yaw)).normalize();
      targetRotation.setFromUnitVectors(up, direction);
      targetPosition.set(pose.gripX, pose.gripY, pose.gripZ);
      u.weaponRig.quaternion.copy(restRotation).slerp(targetRotation, pose.windup).slerp(restRotation, pose.recovery);
      u.weaponRig.position.copy(restPosition).lerp(targetPosition, pose.windup).lerp(restPosition, pose.recovery);
      u.updateGrip(); hero.updateMatrixWorld(true);
      const head = u.hammerHead.getWorldPosition(new THREE.Vector3());
      if (lastHead) maxHeadStep = Math.max(maxHeadStep, lastHead.distanceTo(head));
      lastHead = head; peakHeadY = Math.max(peakHeadY, head.y); lowestHeadY = Math.min(lowestHeadY, head.y);
      minHeadX = Math.min(minHeadX, head.x); maxHeadX = Math.max(maxHeadX, head.x);
      for (const [hand, anchor, arm] of [[u.rightGrip, u.rightGripAnchor, u.rightArm], [u.leftGrip, stance ? u.leftGripAnchor : u.shieldGripAnchor, u.leftArm]]) {
        const handPosition = hand.getWorldPosition(new THREE.Vector3());
        const separation = handPosition.distanceTo(anchor.getWorldPosition(new THREE.Vector3()));
        maxArmReach = Math.max(maxArmReach, handPosition.distanceTo(arm.getWorldPosition(new THREE.Vector3())));
        assert.ok(separation < 1e-7, 'A gauntlet must stay attached throughout the weighted motion');
      }
    }
    assert.ok(maxHeadStep < .5, `The hammer teleported ${maxHeadStep.toFixed(3)}m between animation samples`);
    assert.ok(peakHeadY - lowestHeadY > 1, 'The head must visibly rise and fall through a diagonal arc');
    assert.ok(maxHeadX > 1.2 && minHeadX < -1.2, 'The stroke must continue across the whole body');
    assert.ok(maxArmReach < .90, 'The swing must fit the articulated arms without stretching them');
    assert.ok(u.weaponRig.position.distanceTo(restPosition) < 1e-7, 'Recovery must settle into the selected stance');
    assert.ok(u.weaponRig.quaternion.angleTo(restRotation) < 1e-7);
  }
});

test('recovery ends at neutral body pose and progress is safely clamped', () => {
  assert.deepEqual(sampleHammerSwing(-1), sampleHammerSwing(0));
  assert.deepEqual(sampleHammerSwing(2), sampleHammerSwing(1));
  assert.deepEqual(sampleHammerSwing(NaN), sampleHammerSwing(0));
  for (const options of [{}, { twoHanded: true, charge: 1 }]) {
    const start = sampleHammerSwing(0, options), end = sampleHammerSwing(1, options);
    assert.equal(start.windup, 0); assert.equal(start.recovery, 0);
    assert.equal(end.windup, 1); assert.equal(end.recovery, 1); assert.equal(end.trail, 0);
    for (const field of ['bodyYaw', 'bodyPitch', 'bodyRoll', 'bodyDrop', 'leftLegPitch', 'rightLegPitch', 'leftLegRoll', 'rightLegRoll']) {
      assert.ok(Math.abs(start[field]) < 1e-10); assert.ok(Math.abs(end[field]) < 1e-10, `${field} did not settle`);
    }
  }
});
