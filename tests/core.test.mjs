import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {
  GOAL, BOUNDS, normalize, screenMovement, circleOverlaps, moveCircle,
  inArc, hitObject, attackStats, destructionPercent, calculateStats,
} from '../core.js';
import { makeWarrior, makeTreasure } from '../models.js';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `Expected ${actual} to be within ${tolerance} of ${expected}`);
const facingNorth = { x: 0, z: 0, fx: 0, fz: 1 };
function seeded(seed) {
  return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
}

test('WASD moves along the actual camera screen axes, including all four diagonals', () => {
  const groundCamera = Math.hypot(13, 18);
  const east = screenMovement(1, 0), north = screenMovement(0, -1);
  close(east.x, 18 / groundCamera);
  close(east.z, -13 / groundCamera);
  close(north.x, -13 / groundCamera);
  close(north.z, -18 / groundCamera);
  for (let h = -1; h <= 1; h++) for (let v = -1; v <= 1; v++) {
    const movement = screenMovement(h, v);
    close(Math.hypot(movement.x, movement.z), h || v ? 1 : 0);
  }
  const reverse = screenMovement(-1, 1), forward = screenMovement(1, -1);
  close(reverse.x, -forward.x); close(reverse.z, -forward.z);
  assert.deepEqual(normalize(0, 0), { x: 0, z: 0 });
});

test('free movement is continuous, and diagonals do not grant extra walking speed', () => {
  const distance = 5.9 * .137;
  const straight = screenMovement(0, -1), diagonal = screenMovement(1, -1);
  const a = { x: .123, z: -.246 }, b = { ...a };
  const da = moveCircle(a, straight.x * distance, straight.z * distance, []);
  const db = moveCircle(b, diagonal.x * distance, diagonal.z * distance, []);
  close(Math.hypot(da.x, da.z), distance);
  close(Math.hypot(db.x, db.z), distance);
  assert.notEqual(a.x, Math.round(a.x), 'Movement must not snap to tiles');
});

test('dash and knockback cannot tunnel through a thin wall from either direction', () => {
  const wall = { x: 0, z: 0, w: .04, d: 12 };
  for (const side of [-1, 1]) {
    const e = { x: side * 10, z: 1.2, radius: .5 };
    const moved = moveCircle(e, -side * 28, 0, [wall]);
    close(e.x, side * .52);
    close(e.z, 1.2);
    close(moved.x, e.x - side * 10);
    assert.equal(circleOverlaps(e.x, e.z, .499999, wall), false);
  }
});

test('walls permit sliding and destroyed objects no longer block movement', () => {
  const wall = { x: 0, z: 0, w: .2, d: 12 };
  const e = { x: -4, z: -2, radius: .5 };
  moveCircle(e, 9, 4, [wall]);
  close(e.x, -.6); close(e.z, 2);
  wall.dead = true;
  moveCircle(e, 3.13, 0, [wall]);
  close(e.x, 2.53);
});

test('shallow building contact resolves on the nearby face without teleporting across the building', () => {
  const building = { x: 18, z: -12, w: 12, d: 12, h: 4 };
  for (const normal of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
    for (const [name, outward, tangent] of [
      ['outward', .02, 0], ['inward', -.02, 0], ['along the wall', 0, .02], ['stationary guard', 0, 0],
    ]) {
      const start = { x: building.x + normal.x * 6.35, z: building.z + normal.z * 6.35 };
      const actor = { ...start, radius: .44 };
      const dx = normal.x * outward - normal.z * tangent;
      const dz = normal.z * outward + normal.x * tangent;
      const moved = moveCircle(actor, dx, dz, [building]);
      const label = `${name}, face ${normal.x},${normal.z}`;
      assert.ok(Math.hypot(moved.x, moved.z) < .13,
        `${label}: a 9 cm overlap moved the actor ${Math.hypot(moved.x, moved.z)} m`);
      assert.ok((actor.x - building.x) * normal.x + (actor.z - building.z) * normal.z >= 6.439999,
        `${label}: resolution must keep the actor at the contacted face`);
      assert.equal(circleOverlaps(actor.x, actor.z, actor.radius - 1e-6, building), false, label);
      close(moved.x, actor.x - start.x); close(moved.z, actor.z - start.z);
    }
  }
});

test('overlap at a building corner is corrected locally for movement and stationary defense', () => {
  const building = { x: 18, z: -12, w: 12, d: 12, h: 4 };
  for (const xSide of [-1, 1]) for (const zSide of [-1, 1]) {
    for (const [dx, dz] of [[0, 0], [.02 * xSide, 0], [0, .02 * zSide], [-.02 * xSide, -.02 * zSide]]) {
      const actor = { x: building.x + xSide * 6.25, z: building.z + zSide * 6.25, radius: .44 };
      const moved = moveCircle(actor, dx, dz, [building]);
      assert.ok(Math.hypot(moved.x, moved.z) < .15,
        `Corner contact moved the actor ${Math.hypot(moved.x, moved.z)} m`);
      assert.ok((actor.x - building.x) * xSide >= 6 && (actor.z - building.z) * zSide >= 6,
        'The actor must remain outside the same corner, even when moving into it');
      assert.equal(circleOverlaps(actor.x, actor.z, actor.radius - 1e-6, building), false);
    }
  }
});

test('a valid circle remains outside building corners after seeded high-speed movement', () => {
  const random = seeded(18342);
  const obstacles = [
    { x: 0, z: 0, w: 5, d: 3 },
    { x: 6, z: 1.2, w: 2, d: 5 },
    { x: -5, z: -5, w: 7, d: .1 },
    { x: -3.5, z: 5, w: .1, d: 7 },
  ];
  let checked = 0;
  for (let i = 0; i < 1200; i++) {
    const e = { x: random() * 24 - 12, z: random() * 24 - 12, radius: .5 };
    if (obstacles.some(o => circleOverlaps(e.x, e.z, .5, o))) continue;
    moveCircle(e, random() * 16 - 8, random() * 16 - 8, obstacles);
    assert.equal(obstacles.some(o => circleOverlaps(e.x, e.z, .499999, o)), false,
      `Circle penetrated a corner at ${e.x}, ${e.z}`);
    checked++;
  }
  assert.ok(checked > 1000);
});

test('large movement respects the district boundary for the entire player radius', () => {
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const e = { x: 0, z: 0, radius: .5 };
    moveCircle(e, x * BOUNDS * 3, z * BOUNDS * 3, []);
    close(e.x, x * (BOUNDS - .5)); close(e.z, z * (BOUNDS - .5));
  }
});

test('normal hammer arcs reject enemies behind and beyond reach', () => {
  assert.equal(inArc(0, 0, 0, 1, 0, 2, 2.85, 1.28), true);
  assert.equal(inArc(0, 0, 0, 1, 0, -2, 2.85, 1.28), false);
  assert.equal(inArc(0, 0, 0, 1, 0, 3.7, 2.85, 1.28, .45), false);
  assert.equal(inArc(0, 0, 0, 1, 0, 3.1, 2.85, 1.28, .45), true,
    'The near edge of a large enemy can be within reach before its center');
  assert.equal(inArc(0, 0, 0, 1, 0, -2, 4.25, 1.68, .45), false);
});

test('a sweep connects with house corners even when the closest face is outside the arc', () => {
  assert.equal(hitObject(facingNorth, { x: 3, z: 0, w: 4.6, d: 4.1 }, 2.85, 1.28), true);
});

test('a sweep intersects a long face even when its corners and center samples all miss', () => {
  const house = { x: 4.5, z: 2.5, w: 4.6, d: 4.1 };
  // The face point (2.2, 1) is in the attack, while the nearest point and
  // all four corners are out of its sector or out of range.
  assert.equal(inArc(0, 0, 0, 1, 2.2, 1, 2.85, 1.28), true);
  assert.equal(hitObject(facingNorth, house, 2.85, 1.28), true);
  assert.equal(hitObject(facingNorth, { x: 0, z: -3, w: 1, d: 1 }, 2.85, 1.28), false);
  assert.equal(hitObject(facingNorth, { x: 0, z: 5, w: 1, d: 1 }, 2.85, 1.28), false);
  assert.equal(hitObject(facingNorth, { x: 0, z: 2, w: 1, d: 1, dead: true }, 2.85, 1.28), false);
});

test('sector/rectangle intersection contains independently sampled hammer paths', () => {
  const random = seeded(73251);
  let sampledHits = 0;
  for (let i = 0; i < 500; i++) {
    const yaw = random() * Math.PI * 2;
    const p = { x: 0, z: 0, fx: Math.sin(yaw), fz: Math.cos(yaw) };
    const halfAngle = i % 2 ? 1.28 : 1.68, range = i % 2 ? 2.85 : 4.25;
    const o = { x: random() * 12 - 6, z: random() * 12 - 6, w: .2 + random() * 5, d: .2 + random() * 5 };
    let sampleInside = false;
    for (let angular = 0; angular <= 48 && !sampleInside; angular++) {
      const angle = yaw - halfAngle + angular / 48 * halfAngle * 2;
      for (let radial = 0; radial <= 18; radial++) {
        const x = Math.sin(angle) * range * radial / 18;
        const z = Math.cos(angle) * range * radial / 18;
        if (x >= o.x - o.w / 2 && x <= o.x + o.w / 2 && z >= o.z - o.d / 2 && z <= o.z + o.d / 2) {
          sampleInside = true; break;
        }
      }
    }
    if (sampleInside) {
      sampledHits++;
      assert.equal(hitObject(p, o, range, halfAngle), true, `Missed sampled sweep: ${JSON.stringify({ p, o, range, halfAngle })}`);
    }
  }
  assert.ok(sampledHits > 100);
});

test('charging meaningfully improves damage, reach, knockback and recovery commitment', () => {
  const base = calculateStats({});
  const tap = attackStats(base, 0), full = attackStats(base, 1);
  assert.equal(tap.damage, 38);
  assert.ok(full.damage >= tap.damage * 4);
  assert.ok(full.range > tap.range);
  assert.ok(full.knockback >= tap.knockback * 3);
  assert.ok(full.lift > tap.lift);
  assert.ok(full.duration > tap.duration);
  assert.ok(full.impactAt < full.duration && tap.impactAt < tap.duration);
  assert.equal(tap.charged, false); assert.equal(full.charged, true);
  assert.deepEqual(attackStats(base, -10), tap);
  assert.deepEqual(attackStats(base, 3), full);
  let previous = tap.damage;
  for (const charge of [.1, .25, .5, .75, .9, 1]) {
    const damage = attackStats(base, charge).damage;
    assert.ok(damage >= previous); previous = damage;
  }
});

test('weighted destruction triggers the boss exactly when the target is crossed', () => {
  const objects = [{ weight: 40, dead: true }, { weight: 15, dead: true }, { weight: 5, dead: false }, { weight: 40, dead: false }];
  close(destructionPercent(objects), 55);
  assert.ok(destructionPercent(objects) < GOAL);
  objects[2].dead = true;
  close(destructionPercent(objects), 60);
  assert.ok(destructionPercent(objects) >= GOAL);
  objects[3].dead = true;
  close(destructionPercent(objects), 100);
  close(destructionPercent([]), 0);
  close(destructionPercent([{ dead: true }, { dead: false }]), 50);
});

test('each upgrade changes its advertised stat and repeated upgrades remain cumulative', () => {
  const base = calculateStats({});
  const power = calculateStats({ power: 1 });
  close(power.power / base.power, 1.25); close(power.speed, base.speed);
  const size = calculateStats({ size: 1 });
  close(size.size / base.size, 1.18); close(size.range / base.range, 1.08);
  close(calculateStats({ range: 1 }).range / base.range, 1.22);
  close(calculateStats({ speed: 1 }).speed / base.speed, 1.12);
  close(calculateStats({ vitality: 1 }).maxHp - base.maxHp, 25);
  assert.equal(calculateStats({ quake: 2 }).quake, 2);
  for (const key of ['power', 'size', 'range', 'speed', 'vitality']) {
    const high = calculateStats({ [key]: 7 }), low = calculateStats({ [key]: 1 });
    const field = key === 'vitality' ? 'maxHp' : key;
    assert.ok(high[field] > low[field]);
    assert.ok(Object.values(high).every(Number.isFinite));
  }
});

test('both articulated arms stay attached to the hammer through charge and slam poses', () => {
  const warrior = makeWarrior();
  warrior.position.set(7, .3, -8);
  warrior.rotation.y = 1.7;
  const u = warrior.userData;
  u.setStance(1);
  for (const pose of [[.55, 0, -.72], [-1.6, -.8, -.2], [1.1, 1.6, .6], [-.8, -1.7, -1.1]]) {
    u.weaponRig.rotation.set(...pose);
    u.hammerHead.scale.setScalar(1.72);
    u.updateGrip();
    warrior.updateMatrixWorld(true);
    for (const [arm, hand, anchor] of [[u.leftArm, u.leftGrip, u.leftGripAnchor], [u.rightArm, u.rightGrip, u.rightGripAnchor]]) {
      const forearmTip = arm.userData.fore.localToWorld(new THREE.Vector3(0, .5, 0));
      const handCenter = hand.getWorldPosition(new THREE.Vector3());
      close(forearmTip.distanceTo(handCenter), 0, 1e-7);
      close(handCenter.distanceTo(anchor.getWorldPosition(new THREE.Vector3())), 0, 1e-7);
      const upperStart = arm.userData.upper.localToWorld(new THREE.Vector3(0, -.5, 0));
      close(upperStart.distanceTo(arm.getWorldPosition(new THREE.Vector3())), 0, 1e-7);
    }
  }
  close(u.leftGripAnchor.position.x, 0); close(u.rightGripAnchor.position.x, 0);
  close(u.leftGripAnchor.position.z, 0); close(u.rightGripAnchor.position.z, 0);
  assert.ok(u.leftGripAnchor.position.distanceTo(u.rightGripAnchor.position) > .25);
});

test('health loot uses the healing model when gameplay requests a heart', () => {
  assert.equal(makeTreasure('heart').userData.color, makeTreasure('health').userData.color);
});
