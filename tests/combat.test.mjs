import test from 'node:test';
import assert from 'node:assert/strict';
import {
  segmentCircleHit, segmentBoxHit, firstHammerHit,
  facingCoverage, jumpY, swingCurve,
} from '../combat.js';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(
  actual !== null && Math.abs(actual - expected) <= tolerance,
  `Expected ${actual} to be within ${tolerance} of ${expected}`,
);

test('a fast throw hits a thin wall even when neither frame endpoint overlaps it', () => {
  const wall = { x: 0, z: 0, w: .1, d: 4 };
  close(segmentBoxHit(-12, 0, 12, 0, wall, .45), 11.5 / 24);
  close(segmentBoxHit(12, 0, -12, 0, wall, .45), 11.5 / 24);
  assert.equal(segmentBoxHit(-12, 3, 12, 3, wall, .45), null);
});

test('circle collision returns entry time, tangency, and endpoint contact', () => {
  close(segmentCircleHit(-5, 0, 5, 0, 0, 0, 1), .4);
  close(segmentCircleHit(-5, 1, 5, 1, 0, 0, 1), .5);
  close(segmentCircleHit(-5, 0, -1, 0, 0, 0, 1), 1);
  assert.equal(segmentCircleHit(-5, 1.001, 5, 1.001, 0, 0, 1), null);
  assert.equal(segmentCircleHit(-5, 0, -2, 0, 0, 0, 1), null);
});

test('starting inside a collider hits at zero, including a stationary segment', () => {
  const wall = { x: 0, z: 0, w: 2, d: 2 };
  assert.equal(segmentCircleHit(0, 0, 5, 0, 0, 0, 1), 0);
  assert.equal(segmentCircleHit(0, 0, 0, 0, 0, 0, 1), 0);
  assert.equal(segmentCircleHit(2, 0, 2, 0, 0, 0, 1), null);
  assert.equal(segmentBoxHit(0, 0, 5, 0, wall), 0);
  assert.equal(segmentBoxHit(1.2, 1.2, 1.2, 1.2, wall, .5), 0);
  assert.equal(segmentBoxHit(4, 4, 4, 4, wall, .5), null);
});

test('box faces, parallel paths and zero-width walls are handled consistently', () => {
  const wall = { x: 0, z: 0, w: 2, d: 4 };
  close(segmentBoxHit(-4, 2, 4, 2, wall), 3 / 8);
  close(segmentBoxHit(0, -4, 0, 4, wall), .25);
  assert.equal(segmentBoxHit(-4, 2.01, 4, 2.01, wall), null);
  close(segmentBoxHit(-2, 0, 2, 0, { x: 0, z: 0, w: 0, d: 4 }), .5);
});

test('rounded box corners do not falsely collide inside expanded AABB squares', () => {
  const box = { x: 0, z: 0, w: 2, d: 2 };
  // (.9,.9) from the nearest corner lies outside a unit-radius hammer.
  assert.equal(segmentBoxHit(1.9, 1.9, 2.5, 1.9, box, 1), null);
  // Exact contact with the top-right rounded corner during a horizontal pass.
  const contactX = 1 + Math.sqrt(1 - .8 ** 2);
  close(segmentBoxHit(3, 1.8, 1.5, 1.8, box, 1), (3 - contactX) / 1.5);
});

test('swept hammer radius counts near-edge contact beyond the centerline', () => {
  const wall = { x: 0, z: 0, w: .2, d: 2 };
  assert.equal(segmentBoxHit(-4, 1.3, 4, 1.3, wall), null);
  const t = segmentBoxHit(-4, 1.3, 4, 1.3, wall, .4);
  close(t, (4 - .1 - Math.sqrt(.4 ** 2 - .3 ** 2)) / 8);
});

test('nearest wall wins over a farther enemy regardless of target iteration order', () => {
  const enemy = { id: 'enemy', x: 5, z: 0, radius: .6 };
  const wall = { id: 'wall', x: 0, z: 0, w: .2, d: 3 };
  const start = { x: -8, z: 0 }, end = { x: 8, z: 0 };
  for (const targets of [[enemy, wall], [wall, enemy]]) {
    const hit = firstHammerHit(start, end, targets, .4);
    assert.equal(hit.target, wall);
    close(hit.t, 7.5 / 16); close(hit.x, -.5); close(hit.z, 0);
  }
});

test('nearer enemies block the throw and dead scenery does not', () => {
  const near = { x: 0, z: 0, radius: .5 };
  const far = { x: 4, z: 0, radius: .5 };
  const deadWall = { x: -3, z: 0, w: .1, d: 8, dead: true };
  const hit = firstHammerHit({ x: -8, z: 0 }, { x: 8, z: 0 }, [far, deadWall, near], .4);
  assert.equal(hit.target, near); close(hit.x, -.9);
  assert.equal(firstHammerHit({ x: -8, z: 5 }, { x: 8, z: 5 }, [far, deadWall, near], .4), null);
});

test('an exact-distance tie is deterministic and preserves scene-first ordering', () => {
  const wall = { x: 0, z: 0, w: 1, d: 3 };
  const enemy = { x: 0, z: 0, radius: .5 };
  assert.equal(firstHammerHit({ x: -4, z: 0 }, { x: 4, z: 0 }, [wall, enemy], .4).target, wall);
});

test('height-aware throws clear low scenery and hit a taller target behind it', () => {
  const lowWall = { x: 0, z: 0, w: .2, d: 3, h: 1 };
  const tallEnemy = { x: 3, z: 0, radius: .5, height: 3 };
  const hit = firstHammerHit({ x: -5, y: 2, z: 0 }, { x: 5, y: 2, z: 0 }, [lowWall, tallEnemy], .2);
  assert.equal(hit.target, tallEnemy); close(hit.y, 2);
  // Omitting Y deliberately requests the ordinary 2D cast.
  assert.equal(firstHammerHit({ x: -5, z: 0 }, { x: 5, z: 0 }, [lowWall, tallEnemy], .2).target, lowWall);
});

test('descending hammer hits a roof after its earlier horizontal entry was too high', () => {
  const house = { x: 0, z: 0, w: 10, d: 4, h: 3 };
  const hit = firstHammerHit({ x: -4, y: 6, z: 0 }, { x: 4, y: 0, z: 0 }, [house], .4);
  assert.equal(hit.target, house);
  close(hit.t, (6 - 3.4) / 6); close(hit.y, 3.4);
});

test('height bands respect a raised target base and explicit minY/maxY', () => {
  const raised = { x: 0, z: 0, radius: .5, y: 4, height: 2 };
  assert.equal(firstHammerHit({ x: -3, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }, [raised], .3), null);
  const band = { x: 0, z: 0, w: 2, d: 2, minY: 3, maxY: 4 };
  assert.equal(firstHammerHit({ x: -3, y: 3.5, z: 0 }, { x: 3, y: 3.5, z: 0 }, [band], .3).target, band);
});

test('guard follows mouse-facing direction and never protects the rear', () => {
  const origin = { x: 5, z: -2 }, forward = { x: 0, z: 1 };
  assert.equal(facingCoverage(forward, { x: 5, z: 3 }, origin, Math.PI / 3), true);
  assert.equal(facingCoverage(forward, { x: 5, z: -7 }, origin, Math.PI / 3), false);
  assert.equal(facingCoverage(forward, { x: 10, z: -2 }, origin, Math.PI / 3), false);
  assert.equal(facingCoverage({ x: 10, z: 0 }, { x: 10, z: -2 }, origin, Math.PI / 3), true);
  assert.equal(facingCoverage({ x: 0, z: 0 }, { x: 5, z: 3 }, origin), false);
  assert.equal(facingCoverage(forward, origin, origin), false);
});

test('guard boundary is inclusive and accepts unnormalized facing vectors', () => {
  const angle = Math.PI / 3;
  const edge = { x: Math.sin(angle) * 4, z: Math.cos(angle) * 4 };
  assert.equal(facingCoverage({ x: 0, z: 9 }, edge, { x: 0, z: 0 }, angle), true);
  const outside = { x: Math.sin(angle + .01) * 4, z: Math.cos(angle + .01) * 4 };
  assert.equal(facingCoverage({ x: 0, z: 9 }, outside, { x: 0, z: 0 }, angle), false);
});

test('forward leap rises to the specified apex then lands without negative height', () => {
  const duration = .9, height = 4.2, distance = 6;
  const samples = [0, .25, .5, .75, 1].map(p => ({ x: p * distance, y: jumpY(p * duration, duration, height) }));
  close(samples[0].y, 0); close(samples[2].y, height); close(samples[4].y, 0);
  close(samples[1].y, samples[3].y);
  assert.ok(samples[1].y > 0 && samples[1].y < samples[2].y);
  assert.ok(samples.every((p, i) => i === 0 || p.x > samples[i - 1].x));
  assert.equal(jumpY(-.1, duration, height), 0);
  assert.equal(jumpY(duration + .1, duration, height), 0);
});

test('swing angle progresses continuously through the front and settles at both ends', () => {
  close(swingCurve(0), -2.05); close(swingCurve(.5), 0); close(swingCurve(1), 2.05);
  let previous = swingCurve(0);
  for (let i = 1; i <= 1000; i++) {
    const next = swingCurve(i / 1000);
    assert.ok(next >= previous - 1e-12);
    assert.ok(next - previous < .008);
    previous = next;
  }
  const epsilon = 1e-4;
  assert.ok(Math.abs((swingCurve(epsilon) - swingCurve(0)) / epsilon) < 1e-4);
  assert.ok(Math.abs((swingCurve(1) - swingCurve(1 - epsilon)) / epsilon) < 1e-4);
  assert.equal(swingCurve(-1), swingCurve(0));
  assert.equal(swingCurve(2), swingCurve(1));
});

test('invalid geometry and animation inputs fail safely instead of yielding NaN hits', () => {
  assert.equal(segmentCircleHit(0, 0, 1, 1, NaN, 0, 1), null);
  assert.equal(segmentCircleHit(0, 0, 1, 1, 0, 0, -1), null);
  assert.equal(segmentBoxHit(0, 0, 1, 1, { x: 0, z: 0, w: -2, d: 2 }), null);
  assert.equal(firstHammerHit({ x: NaN, z: 0 }, { x: 1, z: 1 }, []), null);
  assert.equal(firstHammerHit({ x: 0, z: 0 }, { x: 1, z: 1 }, [{ x: 0, z: 0 }]), null);
  assert.equal(jumpY(.5, 0, 2), 0); assert.equal(jumpY(.5, 1, NaN), 0);
  assert.ok(Number.isFinite(swingCurve(NaN)));
});

test('sampled disk paths independently verify rounded-rectangle collision and earliest contact', () => {
  let seed = 19317;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const inside = (x, z, box, radius) => {
    const dx = Math.max(0, Math.abs(x - box.x) - box.w / 2);
    const dz = Math.max(0, Math.abs(z - box.z) - box.d / 2);
    return dx * dx + dz * dz <= radius * radius + 1e-10;
  };
  for (let trial = 0; trial < 400; trial++) {
    const box = { x: random() * 4 - 2, z: random() * 4 - 2, w: .05 + random() * 4, d: .05 + random() * 4 };
    const ax = random() * 14 - 7, az = random() * 14 - 7, bx = random() * 14 - 7, bz = random() * 14 - 7, radius = .05 + random();
    const hit = segmentBoxHit(ax, az, bx, bz, box, radius);
    let firstSample = null;
    for (let i = 0; i <= 300; i++) {
      const t = i / 300;
      if (inside(ax + (bx - ax) * t, az + (bz - az) * t, box, radius)) { firstSample = t; break; }
    }
    if (firstSample !== null) assert.ok(hit !== null && hit <= firstSample + 1e-8, 'A sampled overlapping disk cannot be missed');
    if (hit !== null) {
      assert.ok(inside(ax + (bx - ax) * hit, az + (bz - az) * hit, box, radius), 'Reported contact lies on the real rounded collider');
      if (hit > 1e-4) assert.equal(inside(ax + (bx - ax) * (hit - 1e-4), az + (bz - az) * (hit - 1e-4), box, radius), false, 'Contact is the first entry, not a later exit');
    }
  }
});
