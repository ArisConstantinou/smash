import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { makeWarrior } from '../models.js';
import { sampleHammerSwing } from '../hammer-motion.js';

const epsilon = 1e-7;
function close(a, b, message = 'Values should match') {
  assert.ok(Math.abs(a - b) < epsilon, `${message}: ${a} != ${b}`);
}
const worldPosition = node => node.getWorldPosition(new THREE.Vector3());
function contact(a, b) { close(worldPosition(a).distanceTo(worldPosition(b)), 0, 'Hand lost its grip'); }
function armsConnected(hero) {
  hero.updateMatrixWorld(true);
  const u = hero.userData;
  for (const [arm, hand] of [[u.leftArm, u.leftGrip], [u.rightArm, u.rightGrip]]) {
    const upperStart = arm.userData.upper.localToWorld(new THREE.Vector3(0, -.5, 0));
    const upperEnd = arm.userData.upper.localToWorld(new THREE.Vector3(0, .5, 0));
    const foreStart = arm.userData.fore.localToWorld(new THREE.Vector3(0, -.5, 0));
    const foreEnd = arm.userData.fore.localToWorld(new THREE.Vector3(0, .5, 0));
    close(upperStart.distanceTo(worldPosition(arm)), 0, 'Upper arm detached from shoulder');
    close(upperEnd.distanceTo(foreStart), 0, 'Elbow detached');
    close(foreEnd.distanceTo(worldPosition(hand)), 0, 'Wrist detached from hand');
  }
}
function restingPose(hero, stance) {
  const u = hero.userData;
  u.setStance(stance);
  u.weaponRig.position.copy(u.weaponRestPosition);
  u.weaponRig.rotation.set(u.weaponRest.x, u.weaponRest.y, u.weaponRest.z);
  u.updateGrip();
}

test('default warrior carries its hammer in the right hand and one solid shield in the left', () => {
  const hero = makeWarrior(), u = hero.userData;
  assert.equal(u.stance, 0); assert.equal(u.weaponHeld, true); assert.equal(u.shieldStored, false);
  assert.equal(u.leftGrip.parent, hero); assert.equal(u.rightGrip.parent, hero);
  assert.equal(u.shieldRig.userData.attachment, 'left-hand');
  contact(u.rightGrip, u.rightGripAnchor); contact(u.leftGrip, u.shieldGripAnchor);
  assert.ok(worldPosition(u.leftGrip).distanceTo(worldPosition(u.leftGripAnchor)) > .5);
  assert.ok(u.shieldRig.position.x < -.5 && u.shieldRig.position.z > .3);
  const size = new THREE.Box3().setFromObject(u.shield).getSize(new THREE.Vector3());
  assert.ok(size.x > .7 && size.y > 1 && size.z > .15, 'Shield must be a substantial solid model');
  assert.equal(hero.getObjectsByProperty('name', 'steelAndGoldShield').length, 1);
  armsConnected(hero);
});

test('Z transition carries the same shield around the shoulder before releasing its handle', () => {
  const hero = makeWarrior(), u = hero.userData, shieldId = u.shield.uuid;
  let maxHeight = 0, lastHand = worldPosition(u.leftGrip), largestStep = 0;
  for (let step = 0; step <= 65; step++) {
    restingPose(hero, step / 100);
    assert.equal(u.shield.uuid, shieldId);
    assert.equal(hero.getObjectsByProperty('name', 'steelAndGoldShield').length, 1);
    contact(u.leftGrip, u.shieldGripAnchor); contact(u.rightGrip, u.rightGripAnchor);
    const hand = worldPosition(u.leftGrip);
    largestStep = Math.max(largestStep, hand.distanceTo(lastHand)); lastHand = hand;
    maxHeight = Math.max(maxHeight, u.shieldRig.position.y);
    armsConnected(hero);
  }
  assert.ok(maxHeight > 1.55, 'Shield should visibly rise around the shoulder');
  assert.ok(largestStep < .11, 'The shield and hand must move continuously');
  assert.ok(u.shieldRig.position.z < -.45);
  assert.equal(u.shieldStored, true); assert.equal(u.shieldRig.userData.attachment, 'back');
});

test('left hand joins the hammer only after the shield is docked on the back', () => {
  const hero = makeWarrior(), u = hero.userData;
  restingPose(hero, .65);
  const backPosition = u.shieldRig.position.clone(), backQuaternion = u.shieldRig.quaternion.clone();
  for (let step = 66; step <= 100; step++) {
    restingPose(hero, step / 100);
    close(u.shieldRig.position.distanceTo(backPosition), 0);
    close(Math.abs(u.shieldRig.quaternion.dot(backQuaternion)), 1);
    contact(u.rightGrip, u.rightGripAnchor);
    armsConnected(hero);
  }
  contact(u.leftGrip, u.leftGripAnchor); contact(u.rightGrip, u.rightGripAnchor);
  assert.ok(worldPosition(u.leftGrip).distanceTo(worldPosition(u.rightGrip)) > .25);
  for (let step = 99; step >= 0; step--) restingPose(hero, step / 100);
  contact(u.leftGrip, u.shieldGripAnchor);
  assert.equal(u.shieldStored, false); assert.ok(u.shieldRig.position.z > .3);
});

test('stance updates never overwrite the weapon animation controlled by the game', () => {
  const hero = makeWarrior(), u = hero.userData;
  const position = new THREE.Vector3(.31, 1.27, .95);
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .15, -1.9));
  u.weaponRig.position.copy(position); u.weaponRig.quaternion.copy(quaternion);
  for (const stance of [0, .3, .65, .81, 1, .2]) {
    u.setStance(stance);
    close(u.weaponRig.position.distanceTo(position), 0);
    close(Math.abs(u.weaponRig.quaternion.dot(quaternion)), 1);
    armsConnected(hero);
  }
});

test('shield hand stays independent during one-handed swings and both grips follow two-handed swings', () => {
  const hero = makeWarrior(), u = hero.userData;
  hero.position.set(4, .3, -9); hero.rotation.y = 1.17;
  for (const stance of [0, 1]) {
    restingPose(hero, stance);
    const originalShieldHand = worldPosition(u.leftGrip);
    for (const rotation of [[0, 0, 0], [0, 0, Math.PI / 2], [0, 0, Math.PI], [-1.2, .6, -.8], [1.3, -.9, .5]]) {
      u.weaponRig.rotation.set(...rotation); u.updateGrip();
      contact(u.rightGrip, u.rightGripAnchor);
      if (!stance) {
        contact(u.leftGrip, u.shieldGripAnchor);
        close(worldPosition(u.leftGrip).distanceTo(originalShieldHand), 0);
      } else contact(u.leftGrip, u.leftGripAnchor);
      armsConnected(hero);
    }
  }
});

test('reach extends the shaft and head path while preserving head shape and both grip points', () => {
  const hero = makeWarrior(), u = hero.userData;
  restingPose(hero, 1);
  u.hammerHead.scale.setScalar(1.72);
  const left = u.leftGripAnchor.position.clone(), right = u.rightGripAnchor.position.clone();
  for (const reach of [.7, 1, 1.8, 3.6]) {
    u.setReach(reach); u.updateGrip();
    close(u.hammerHead.scale.x, 1.72); close(u.hammerHead.scale.y, 1.72); close(u.hammerHead.scale.z, 1.72);
    close(u.leftGripAnchor.position.distanceTo(left), 0); close(u.rightGripAnchor.position.distanceTo(right), 0);
    close(worldPosition(u.hammerHead).distanceTo(worldPosition(u.rightGripAnchor)), reach);
    contact(u.leftGrip, u.leftGripAnchor); contact(u.rightGrip, u.rightGripAnchor);
    armsConnected(hero);
  }
});

test('a flying hammer leaves both actual hands on the hero and never steals the shield', () => {
  const hero = makeWarrior(), u = hero.userData;
  for (const stance of [0, 1]) {
    restingPose(hero, stance);
    u.setWeaponVisible(false);
    assert.equal(u.hammerPivot.visible, false);
    assert.equal(u.leftGrip.visible, true); assert.equal(u.rightGrip.visible, true);
    assert.equal(u.leftGrip.parent, hero); assert.equal(u.rightGrip.parent, hero);
    const hand = worldPosition(u.rightGrip);
    for (const spin of [0, 1.1, 2.4, 4.8]) {
      u.weaponRig.rotation.z = spin; u.updateGrip();
      close(worldPosition(u.rightGrip).distanceTo(hand), 0, 'Throw hand must not spin with hidden weapon');
      if (!stance) contact(u.leftGrip, u.shieldGripAnchor);
      armsConnected(hero);
    }
    u.setWeaponVisible(true);
    contact(u.rightGrip, u.rightGripAnchor);
    if (stance) contact(u.leftGrip, u.leftGripAnchor);
    assert.equal(u.shieldRig.userData.attachment, stance ? 'back' : 'left-hand');
  }
});

test('throwable is the actual upgraded hammer, centered and independently disposable, with no hand geometry', () => {
  const hero = makeWarrior(), u = hero.userData;
  u.hammerHead.scale.setScalar(1.6); u.setReach(1.9); u.setWeaponVisible(false);
  const sourceGeometry = new Set(), sourceMaterials = new Set();
  u.hammerPivot.traverse(n => { if (n.isMesh) { sourceGeometry.add(n.geometry); for (const m of [].concat(n.material)) sourceMaterials.add(m); } });
  const thrown = u.createThrownHammer();
  assert.equal(thrown.userData.kind, 'hammer-projectile'); assert.equal(thrown.userData.spinAxis, 'z');
  assert.equal(thrown.getObjectByName('projectileHammer').visible, true);
  assert.equal(thrown.getObjectByName('leftGrip'), undefined); assert.equal(thrown.getObjectByName('rightGrip'), undefined);
  assert.equal(thrown.getObjectByName('leftGripAnchor'), undefined); assert.equal(thrown.getObjectByName('steelAndGoldShield'), undefined);
  close(thrown.getObjectByName('hammerHead').scale.x, 1.6);
  const center = new THREE.Box3().setFromObject(thrown).getCenter(new THREE.Vector3());
  close(center.length(), 0, 'Thrown hammer should rotate around its center');
  let sourceDisposals = 0;
  for (const g of sourceGeometry) g.addEventListener('dispose', () => sourceDisposals++);
  thrown.updateMatrixWorld(true);
  thrown.traverse(n => {
    if (!n.isMesh) return;
    assert.equal(sourceGeometry.has(n.geometry), false);
    for (const m of [].concat(n.material)) assert.equal(sourceMaterials.has(m), false);
    const vertices = n.geometry.getAttribute('position'), vertex = new THREE.Vector3();
    for (let i = 0; i < vertices.count; i++) {
      vertex.fromBufferAttribute(vertices, i).applyMatrix4(n.matrixWorld);
      assert.ok(vertex.length() <= thrown.userData.radius + epsilon, 'Reported collider must contain all rotating hammer vertices');
    }
    n.geometry.dispose(); for (const m of [].concat(n.material)) m.dispose();
  });
  assert.equal(sourceDisposals, 0);
  u.setWeaponVisible(true); u.updateGrip(); contact(u.rightGrip, u.rightGripAnchor);
});

test('shoulders follow torso rotation and retain complete arm chains during a body follow-through', () => {
  const hero = makeWarrior(), u = hero.userData;
  hero.position.set(-5, 0, 2); hero.rotation.y = .72;
  for (const yaw of [-.5, 0, .5]) {
    u.body.rotation.set(.12, yaw, -.03); u.body.position.y = .02;
    u.setStance(yaw > 0 ? 1 : 0); u.updateGrip(); hero.updateMatrixWorld(true);
    for (const [side, arm] of [[-1, u.leftArm], [1, u.rightArm]]) {
      const expected = new THREE.Vector3(side * .49, 1.28, .015).applyMatrix4(u.body.matrix).applyMatrix4(hero.matrixWorld);
      close(worldPosition(arm).distanceTo(expected), 0);
    }
    armsConnected(hero);
  }
});

test('weighted swings bend both elbows without stretching either arm or losing either grip', () => {
  const up = new THREE.Vector3(0, 1, 0);
  for (const stance of [0, 1]) {
    const hero = makeWarrior(), u = hero.userData;
    restingPose(hero, stance);
    const restPosition = u.weaponRestPosition.clone(), restRotation = u.weaponRig.quaternion.clone();
    const initialLengths = [u.leftArm, u.rightArm].map(arm => [arm.userData.upper.scale.y, arm.userData.fore.scale.y]);
    const lastElbows = [null, null];
    let greatestStep = 0;
    for (let step = 0; step <= 240; step++) {
      const pose = sampleHammerSwing(step / 240, { twoHanded: !!stance });
      u.body.rotation.set(pose.bodyPitch, pose.bodyYaw, pose.bodyRoll); u.body.position.y = pose.bodyDrop;
      const direction = new THREE.Vector3(Math.sin(pose.yaw), pose.elevation, Math.cos(pose.yaw)).normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(up, direction);
      u.weaponRig.quaternion.copy(restRotation).slerp(rotation, pose.windup).slerp(restRotation, pose.recovery);
      u.weaponRig.position.copy(restPosition).lerp(new THREE.Vector3(pose.gripX, pose.gripY, pose.gripZ), pose.windup).lerp(restPosition, pose.recovery);
      u.updateGrip(); hero.updateMatrixWorld(true);
      for (const [index, arm] of [u.leftArm, u.rightArm].entries()) {
        close(arm.userData.upper.scale.y, initialLengths[index][0], 'The upper arm must not grow during a reachable swing');
        close(arm.userData.fore.scale.y, initialLengths[index][1], 'The forearm must not grow during a reachable swing');
        const elbowPoint = arm.userData.upper.localToWorld(new THREE.Vector3(0, .5, 0));
        if (lastElbows[index]) greatestStep = Math.max(greatestStep, elbowPoint.distanceTo(lastElbows[index]));
        lastElbows[index] = elbowPoint;
      }
      contact(u.rightGrip, u.rightGripAnchor); contact(u.leftGrip, stance ? u.leftGripAnchor : u.shieldGripAnchor);
      armsConnected(hero);
    }
    assert.ok(greatestStep < .06, 'An elbow must follow the swing continuously instead of snapping between bend planes');
  }
});

test('an unreachable grip extends both bones proportionally and returns without flipping the elbow', () => {
  const hero = makeWarrior(), u = hero.userData;
  const arm = u.rightArm, armLength = .44 + .46;
  const direction = new THREE.Vector3(.13, -.12, 1).normalize(), shoulder = arm.position.clone();
  let lastElbow = null, greatestStep = 0, extendedFrames = 0;
  for (let step = 0; step <= 1200; step++) {
    const distance = .72 + .42 * Math.sin(Math.PI * step / 1200) ** 2;
    u.weaponRig.rotation.set(0, 0, 0);
    u.weaponRig.position.copy(shoulder).addScaledVector(direction, distance).sub(u.rightGripAnchor.position);
    u.updateGrip(); hero.updateMatrixWorld(true);
    const extension = Math.max(1, distance / armLength);
    close(arm.userData.upper.scale.y, .44 * extension);
    close(arm.userData.fore.scale.y, .46 * extension);
    if (extension > 1) extendedFrames++;
    const elbowPoint = arm.userData.upper.localToWorld(new THREE.Vector3(0, .5, 0));
    if (lastElbow) greatestStep = Math.max(greatestStep, elbowPoint.distanceTo(lastElbow));
    lastElbow = elbowPoint;
    const elbowLocal = arm.worldToLocal(elbowPoint.clone());
    const bend = elbowLocal.addScaledVector(direction, -elbowLocal.dot(direction));
    assert.ok(bend.dot(arm.userData.elbowPole) > -epsilon, 'The elbow must keep its outward bend when returning from full extension');
    contact(u.rightGrip, u.rightGripAnchor); armsConnected(hero);
  }
  assert.ok(extendedFrames > 300, 'The path must exercise the out-of-reach fallback used by the raised guard');
  assert.ok(greatestStep < .04, 'Crossing full extension must not pop or flip the elbow');
});

test('cached throw bounds match projectiles and ignore hero or held-weapon rotation', () => {
  const hero = makeWarrior(), u = hero.userData;
  for (const [reach, size] of [[1, 1], [1.35, 1], [1.9, 1.72], [3.3, 2.1]]) {
    u.setReach(reach); u.hammerHead.scale.setScalar(size);
    const radius = u.getThrowRadius();
    for (const angle of [0, .73, 2.9]) {
      hero.position.set(8, 3, -11); hero.rotation.y = angle;
      u.weaponRig.rotation.set(angle, -.2, .4 + angle); u.weaponRig.position.set(.7, 1.1, .8);
      close(u.getThrowRadius(), radius);
      const projectile = u.createThrownHammer();
      close(projectile.userData.radius, radius);
      close(new THREE.Box3().setFromObject(projectile).getBoundingSphere(new THREE.Sphere()).radius, radius);
      hero.updateMatrixWorld(true);
      const actualCenter = new THREE.Box3();
      // The local centered-model origin must map back to the same source
      // center, independent of how the body aims the held weapon.
      const pivotInverse = u.hammerPivot.matrixWorld.clone().invert();
      u.hammerPivot.traverse(n => {
        if (!n.isMesh) return;
        if (!n.geometry.boundingBox) n.geometry.computeBoundingBox();
        actualCenter.union(n.geometry.boundingBox.clone().applyMatrix4(pivotInverse.clone().multiply(n.matrixWorld)));
      });
      const expected = u.hammerPivot.localToWorld(actualCenter.getCenter(new THREE.Vector3()));
      close(u.getThrowCenterWorld().distanceTo(expected), 0);
    }
  }
  u.setReach(1.05); u.hammerHead.scale.setScalar(1.72);
  hero.position.set(0, 0, 0); hero.rotation.set(0, 0, 0);
  const clearance = u.getSpinRadius() + .05;
  for (let i = 0; i < 32; i++) {
    u.weaponRig.position.set(0, clearance, .95); u.weaponRig.rotation.set(0, 0, i * Math.PI / 16);
    hero.updateMatrixWorld(true);
    assert.ok(new THREE.Box3().setFromObject(u.hammerHead).min.y >= .049999,
      'Computed vertical spin radius must keep the entire head above ground');
  }
});
