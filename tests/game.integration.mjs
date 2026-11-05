// Run with: node --experimental-vm-modules --test tests/game.integration.mjs
// This exercises the real game module, geometry, models, terrain, combat and UI
// handlers. Only browser surfaces and WebGL drawing are replaced; it does not
// claim to verify pixels, GPU shaders, audio hardware or browser performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import * as models from '../models.js';
import * as world from '../world.js';
import * as core from '../core.js';
import * as combat from '../combat.js';

assert.equal(typeof vm.SourceTextModule, 'function', 'Use --experimental-vm-modules');
const browserErrors = [], audioEvents = [], listeners = new Map(), elements = new Map();
const timerCallbacks = new Map();
let scheduledFrames = 0, renderedFrames = 0, time = 0, seed = 28461;
const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);

class Classes {
  values = new Set();
  add(...names) { names.forEach(x => this.values.add(x)); }
  remove(...names) { names.forEach(x => this.values.delete(x)); }
  contains(name) { return this.values.has(name); }
  toggle(name, on) {
    const result = on === undefined ? !this.values.has(name) : !!on;
    if (result) this.add(name); else this.remove(name);
    return result;
  }
}
function context2D() {
  return new Proxy({ textCalls: [] }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return text => ({ width: String(text).length * 8 });
      if (key === 'fillText') return (text, x, y) => target.textCalls.push({ text: String(text), x, y });
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}
class Element {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase(); this.id = id;
    this.children = []; this.parentNode = null; this.classList = new Classes();
    this.style = { setProperty(key, value) { this[key] = value; } };
    this.dataset = {}; this.hidden = true; this.disabled = false; this.checked = false;
    this.textContent = ''; this.innerHTML = ''; this.value = '';
    this.events = new Map(); this.width = 140; this.height = 140;
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; children.forEach(c => this.appendChild(c)); }
  get firstChild() { return this.children[0] || null; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(callback); }
  getContext(type) { assert.equal(type, '2d'); return this.context ||= context2D(); }
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 140, height: 140 }; }
  setPointerCapture() {}
  focus() { document.activeElement = this; }
  click() { if (!this.disabled) this.onclick?.({ target: this, preventDefault() {} }); }
}
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
for (const [, tag, id] of html.matchAll(/<([a-z0-9-]+)\b[^>]*\bid="([^"]+)"/gi)) elements.set(id, new Element(tag, id));
const dataKeys = new Map();
for (const [, key] of html.matchAll(/data-key="([^"]+)"/g)) {
  const el = new Element('kbd'); el.dataset.key = key; dataKeys.set(key, el);
}
const document = {
  body: new Element('body'), activeElement: null, hidden: false,
  getElementById: id => elements.get(id) || null,
  createElement: tag => new Element(tag),
  querySelector: selector => { const m = selector.match(/^\[data-key="([^"]+)"\]$/); return m ? dataKeys.get(m[1]) || null : null; },
  querySelectorAll: selector => selector === '[data-key]' ? [...dataKeys.values()] : [],
  addEventListener(name, callback) { if (!listeners.has('document:' + name)) listeners.set('document:' + name, []); listeners.get('document:' + name).push(callback); },
};
document.activeElement = document.body;
const window = {
  addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
};
const storage = new Map();
class FakeRenderer {
  shadowMap = {};
  constructor({ canvas }) { this.domElement = canvas; }
  setPixelRatio(value) { this.pixelRatio = value; }
  setSize(w, h) { this.width = w; this.height = h; }
  async compileAsync() {}
  render(scene, camera) { scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); renderedFrames++; }
}
class StubAudio {
  muted = false;
  async unlock() {}
  play(name, power = 0) { audioEvents.push({ name, power }); }
  setVolume(value) { this.volume = value; }
  toggle() { return this.muted = !this.muted; }
  update() {}
}
const sandbox = vm.createContext({
  console: { log: console.log, warn: console.warn, error: (...args) => browserErrors.push(args) },
  document, window, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  performance: { now: () => time },
  Math: Object.assign(Object.create(Math), { random }),
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  requestAnimationFrame: () => ++scheduledFrames,
  setTimeout: callback => { const id = timerCallbacks.size + 1; timerCallbacks.set(id, callback); return id; },
  clearTimeout: id => timerCallbacks.delete(id),
});
function synthetic(exports, identifier) {
  const names = Object.keys(exports);
  return new vm.SyntheticModule(names, function () { for (const name of names) this.setExport(name, exports[name]); }, { context: sandbox, identifier });
}
const imports = new Map([
  ['./vendor/three.module.js', synthetic({ ...THREE, WebGLRenderer: FakeRenderer }, 'three-test-surface')],
  ['./models.js', synthetic(models, 'real-models')],
  ['./world.js', synthetic(world, 'real-world')],
  ['./core.js', synthetic(core, 'real-core')],
  ['./combat.js', synthetic(combat, 'real-combat')],
  ['./audio.js', synthetic({ GameAudio: StubAudio }, 'audio-test-surface')],
]);
const original = await readFile(new URL('../game.js', import.meta.url), 'utf8');
const testingExports = `
export const __integration = {
  get phase(){return phase;}, get player(){return player;}, get world(){return world;},
  get enemies(){return enemies;}, get drops(){return drops;}, get boss(){return boss;},
  get stats(){return stats;}, get levels(){return levels;}, get hero(){return hero;},
  get charge(){return charge;}, get swing(){return swing;}, get facing(){return facing;},
  get elapsed(){return elapsed;}, get round(){return round;}, get relics(){return relics;},
  get kills(){return kills;}, get bolts(){return bolts;}, get score(){return score;},
  get scene(){return scene;}, get keys(){return keys;},
  get stance(){return stance;}, get stanceTarget(){return stanceTarget;},
  get guarding(){return guarding;}, get aim(){return aim;}, get aimPreview(){return aimPreview;},
  get leap(){return leap;}, get throwWindup(){return throwWindup;}, get throwFlight(){return throwFlight;},
  get hpEchoes(){return hpEchoes;}, get numbers(){return numbers;},
  startGame, resetWorld, frame, pauseGame, setPhase, updatePlayer, updateEnemies,
  updateBoss, updateDrops, updateHUD, poseHero, spawnEnemy, spawnDrop, hitEnemy,
  hurtObject, hurtPlayer, impact, beginSwing, defeatBoss, applyStats, openUpgrade,
  clearInput, hitBoss, checkGoal, updateAim, updateThrownHammer, shoot, drawFX,
  drawHP, screenPoint, updateEffects,
  setFacing(x,z){facing=normalize(x,z);},
  primeSwing(q){chargeHeld=false;chargeStarted=true;charge=q;attackCooldown=0;swing=null;},
};`;
const game = new vm.SourceTextModule(original + testingExports, { context: sandbox, identifier: 'game.js with test-only exports' });
await game.link(specifier => {
  assert.ok(imports.has(specifier), `Unstubbed external dependency ${specifier}`);
  return imports.get(specifier);
});
await game.evaluate();
await Promise.resolve();
const api = game.namespace.__integration;
function emit(name, props = {}) {
  const event = { repeat: false, preventDefault() {}, ...props };
  for (const fn of listeners.get(name) || []) fn(event);
}
const key = (code, down) => emit(down ? 'keydown' : 'keyup', { code });
function advance(seconds, step = 1 / 60) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= step) {
    time += Math.min(step, remaining) * 1000;
    api.frame(time);
  }
}
function reset() {
  api.clearInput(); api.startGame(); advance(.1);
  elements.get('fxCanvas').context.textCalls.length = 0;
}
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `Expected ${actual} to be within ${tolerance} of ${expected}`);
const worldPosition = object => object.getWorldPosition(new THREE.Vector3());
function playerSteps(seconds, step = 1 / 120, afterStep = () => {}) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= step) {
    const dt = Math.min(step, remaining); api.updatePlayer(dt); afterStep(dt);
  }
}
function arena() {
  reset();
  // Keep real models, health, materials and disposal ownership, while moving
  // unrelated district geometry outside this isolated action's play area.
  api.world.objects.forEach((o, i) => { o.x = 500 + i * 10; o.z = 500; o.mesh.position.set(o.x, o.baseY, o.z); });
  for (const h of api.world.hazards) { h.x = 500; h.z = 500; }
  api.setFacing(0, 1); api.poseHero(.05); api.player.invincible = 0;
}
function aimAt(x, z) {
  const p = api.screenPoint(x, api.player.y + 1.2, z);
  emit('pointermove', { clientX: p.x, clientY: p.y, pointerType: 'mouse' });
  api.updateAim();
}
function stationaryEnemy(type, x, z) {
  api.spawnEnemy(type, { x, z });
  const enemy = api.enemies.at(-1);
  enemy.speed = 0; enemy.state = 'idle'; enemy.timer = 100;
  return enemy;
}
function placeObject(type, x, z, options = {}) {
  const object = api.world.objects.find(o => o.type === type);
  assert.ok(object, `Real world fixture has a ${type}`);
  Object.assign(object, { x, z }, options);
  object.mesh.position.set(x, object.baseY, z);
  return object;
}

test('game initializes using its actual HTML ids, world and warrior, and renders a frame', () => {
  assert.deepEqual(browserErrors, []);
  assert.equal(api.phase, 'menu');
  assert.equal(elements.get('startButton').disabled, false);
  assert.equal(elements.get('fatalError').hidden, true);
  assert.ok(api.world.objects.length > 50);
  assert.ok(api.world.hazards.length > 0);
  assert.ok(api.hero.userData.leftGrip && api.hero.userData.rightGrip);
  advance(.05);
  assert.ok(renderedFrames > 0 && scheduledFrames > 0);
});

test('actual keyboard movement selects facing and released charged Space hits a surviving brute', () => {
  arena();
  key('KeyD', true); advance(.12); key('KeyD', false);
  const before = { x: api.player.x, z: api.player.z }, facing = { ...api.facing };
  assert.ok(before.x > 0 && before.z < 0);
  key('Space', true); advance(1.31);
  assert.equal(api.charge, 1); assert.equal(api.swing, null, 'Holding must charge without auto-swinging');
  const enemy = stationaryEnemy('brute', before.x + facing.x * 3.5, before.z + facing.z * 3.5);
  key('Space', false);
  assert.ok(api.swing?.charged);
  advance(.19);
  assert.equal(enemy.hp, enemy.maxHp, 'Windup must not apply the complete arc as an instantaneous hit');
  for (let frame = 0; enemy.hp === enemy.maxHp && frame < 60; frame++) advance(1 / 60);
  assert.equal(enemy.dead, false);
  assert.equal(enemy.hp, 25);
  assert.ok(enemy.flash > 0 && enemy.stagger > 0);
  assert.ok(Math.hypot(enemy.vx, enemy.vz) > 1);
  assert.ok(enemy.vy > 0 || enemy.y > 0);
  assert.ok(audioEvents.some(e => (e.name === 'hit' || e.name === 'break') && e.power === 1));
});

test('the initial stance holds the hammer in one hand and the real shield in the other', () => {
  arena();
  const u = api.hero.userData;
  assert.equal(api.stance, 0); assert.equal(api.stanceTarget, 0);
  assert.equal(u.shieldStored, false); assert.equal(u.shieldRig.userData.attachment, 'left-hand');
  assert.equal(u.shield.visible, true); assert.equal(u.hammerPivot.visible, true);
  assert.equal(u.leftGrip.parent, api.hero); assert.equal(u.rightGrip.parent, api.hero);
  close(worldPosition(u.leftGrip).distanceTo(worldPosition(u.shieldGripAnchor)), 0);
  close(worldPosition(u.rightGrip).distanceTo(worldPosition(u.rightGripAnchor)), 0);
  assert.ok(worldPosition(u.leftGrip).distanceTo(worldPosition(u.leftGripAnchor)) > .5);
});

test('Z carries the same shield onto the back, joins both hammer grips, and toggles back', () => {
  arena();
  const u = api.hero.userData, shield = u.shield, start = u.shieldRig.position.clone();
  key('KeyZ', true); key('KeyZ', false);
  assert.equal(api.stanceTarget, 1); assert.equal(api.stance, 0);
  playerSteps(.32);
  assert.ok(api.stance > .2 && api.stance < .5, 'The switch must animate through intermediate poses');
  assert.ok(u.shieldRig.position.distanceTo(start) > .4);
  assert.ok(u.shieldRig.position.y > start.y + .35, 'The shield travels over the shoulder');
  assert.equal(u.shield, shield); assert.equal(u.shield.visible, true);
  key('Space', true); key('Space', false);
  assert.equal(api.swing, null, 'A weapon action cannot interrupt a partial grip transition');
  playerSteps(.76);
  assert.equal(api.stance, 1); assert.equal(u.shieldStored, true);
  assert.equal(u.shieldRig.userData.attachment, 'back'); assert.ok(u.shieldRig.position.z < -.45);
  close(worldPosition(u.leftGrip).distanceTo(worldPosition(u.leftGripAnchor)), 0);
  close(worldPosition(u.rightGrip).distanceTo(worldPosition(u.rightGripAnchor)), 0);
  key('KeyZ', true); key('KeyZ', false); playerSteps(1.08);
  assert.equal(api.stance, 0); assert.equal(u.shieldStored, false); assert.equal(u.shield, shield);
  close(worldPosition(u.leftGrip).distanceTo(worldPosition(u.shieldGripAnchor)), 0);
});

test('a continuous swing crosses many poses and damages a target only once', () => {
  arena();
  const enemy = stationaryEnemy('brute', 0, 2.3), hp = enemy.hp;
  key('Space', true); key('Space', false);
  const strike = api.swing;
  assert.ok(strike);
  let changes = 0, previousHp = hp, previousHead = worldPosition(api.hero.userData.hammerHead);
  let maximumStep = 0;
  const poses = new Set();
  for (let frame = 0; api.swing && frame < 150; frame++) {
    api.updatePlayer(1 / 120);
    const head = worldPosition(api.hero.userData.hammerHead);
    maximumStep = Math.max(maximumStep, head.distanceTo(previousHead)); previousHead = head;
    poses.add(head.toArray().map(n => n.toFixed(3)).join(','));
    if (enemy.hp !== previousHp) { changes++; previousHp = enemy.hp; }
    if (strike.time / strike.duration < .22) assert.equal(enemy.hp, hp);
  }
  assert.equal(api.swing, null); assert.equal(changes, 1);
  assert.equal(enemy.hp, hp - strike.damage); assert.ok(strike.hits.has(enemy));
  assert.ok(poses.size > 45, `Expected many evolving hammer poses, got ${poses.size}`);
  assert.ok(maximumStep < .5, `Hammer teleported ${maximumStep} metres in one 120 Hz step`);
});

test('Q aims a vertical frontal propeller with the mouse, blocks the front and leaves the rear exposed', () => {
  arena(); aimAt(9, 0);
  key('KeyQ', true); api.updatePlayer(.05);
  assert.equal(api.guarding, true); close(api.aim.x, 1); close(api.aim.z, 0);
  const hp = api.player.hp;
  api.hurtPlayer(24, -api.aim.x, -api.aim.z);
  assert.equal(api.player.hp, hp, 'Front-facing Q must block an incoming strike');
  api.hurtPlayer(24, api.aim.x, api.aim.z);
  assert.equal(api.player.hp, hp - 24, 'Q must not provide a circular or rear shield');
  const points = [];
  playerSteps(.38, 1 / 120, () => points.push(worldPosition(api.hero.userData.hammerHead).sub(api.hero.position)));
  const heights = points.map(p => p.y), depths = points.map(p => p.x * api.aim.x + p.z * api.aim.z);
  const lateral = points.map(p => p.x * api.aim.z - p.z * api.aim.x);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 2);
  assert.ok(Math.max(...lateral) - Math.min(...lateral) > 2);
  assert.ok(Math.max(...depths) - Math.min(...depths) < .02, 'The spin stays in one vertical plane in front');
  assert.ok(Math.min(...depths) > .8, 'The propeller does not orbit around the warrior');
  key('KeyQ', false); assert.equal(api.guarding, false);
});

test('Q reflects a frontal robot bolt back into an enemy without hurting the warrior', () => {
  arena(); aimAt(0, 10);
  key('KeyQ', true); api.updatePlayer(.05);
  const robot = stationaryEnemy('robot', 0, 5), hp = api.player.hp, robotHP = robot.hp;
  api.shoot(robot);
  for (let i = 0; i < 60 && !api.bolts[0]?.reflected; i++) api.updateEnemies(1 / 120);
  assert.equal(api.bolts.length, 1); assert.equal(api.bolts[0].reflected, true);
  assert.ok(api.bolts[0].vz > 0); assert.equal(api.player.hp, hp);
  for (let i = 0; i < 60 && api.bolts.length; i++) api.updateEnemies(1 / 120);
  assert.equal(api.bolts.length, 0); assert.ok(robot.hp < robotHP); assert.equal(api.player.hp, hp);
  key('KeyQ', false);
});

test('E makes a high forward leap and ordinary landing does not trigger area damage', () => {
  arena();
  const direction = core.screenMovement(1, 0);
  const enemy = stationaryEnemy('brute', direction.x * 13 - direction.z * 2.3, direction.z * 13 + direction.x * 2.3);
  const hp = enemy.hp;
  key('KeyD', true); key('KeyE', true); key('KeyE', false); key('KeyD', false);
  assert.ok(api.leap); assert.equal(api.leap.slam, false);
  let apex = 0;
  for (let i = 0; api.leap && i < 300; i++) { api.updatePlayer(1 / 120); apex = Math.max(apex, api.player.y); }
  assert.equal(api.leap, null); assert.ok(apex > 6, `Expected a clearly visible jump; apex was ${apex}`);
  assert.ok(api.player.x * direction.x + api.player.z * direction.z > 10);
  close(api.player.x * direction.z - api.player.z * direction.x, 0);
  close(api.player.y, 0); assert.equal(enemy.hp, hp);
});

test('airborne Space arms a large smash whose damage happens only on landing', () => {
  arena();
  const nearLeft = stationaryEnemy('brute', -2, 5.6), nearRight = stationaryEnemy('brute', 2, 5.6);
  const distant = stationaryEnemy('brute', 10, 5.6);
  const wall = placeObject('wall', 3.5, 5.6, { w: 1, d: 1, h: 1, hp: 1000, maxHp: 1000 });
  const targets = [nearLeft, nearRight, wall], before = targets.map(t => t.hp);
  key('KeyE', true); key('KeyE', false); playerSteps(.5);
  assert.ok(api.player.y > 6); assert.ok(api.leap); assert.equal(api.leap.slam, false);
  key('Space', true); key('Space', false);
  assert.equal(api.leap.slam, true); assert.equal(api.swing, null);
  assert.deepEqual(targets.map(t => t.hp), before, 'Arming the slam is not an impact');
  for (let i = 0; api.leap && i < 120; i++) {
    api.updatePlayer(1 / 120);
    if (api.leap) assert.deepEqual(targets.map(t => t.hp), before, 'Airborne frames must not damage ground targets');
  }
  assert.equal(api.leap, null); close(api.player.y, 0);
  assert.ok(targets.every((target, i) => target.hp < before[i]));
  assert.equal(distant.hp, distant.maxHp);
  const after = targets.map(t => t.hp); playerSteps(.45);
  assert.deepEqual(targets.map(t => t.hp), after, 'The one landing must not repeatedly apply its area damage');
});

test('R uses mouse aim, sweeps into the first thin wall, and returns the only visible hammer', () => {
  arena();
  const wall = placeObject('wall', 0, 5.5, { w: 4, d: .04, h: 3, hp: 1000, maxHp: 1000 });
  const robot = stationaryEnemy('robot', 0, 9), initialRobotHP = robot.hp;
  aimAt(0, 12);
  assert.equal(api.aimPreview.contact?.target, wall, 'The guidance must stop at the first obstacle');
  key('KeyR', true); key('KeyR', false);
  assert.ok(api.throwWindup); assert.equal(api.throwFlight, null);
  playerSteps(.29);
  const thrown = api.throwFlight, u = api.hero.userData;
  assert.ok(thrown); assert.equal(thrown.returning, false); close(thrown.dir.x, 0); close(thrown.dir.z, 1);
  assert.equal(u.weaponHeld, false); assert.equal(u.hammerPivot.visible, false);
  assert.equal(u.leftGrip.visible, true); assert.equal(u.rightGrip.visible, true);
  assert.equal(api.scene.children.filter(child => child.userData.kind === 'hammer-projectile').length, 1);
  key('Space', true); key('Space', false); key('KeyQ', true); api.updatePlayer(.01); key('KeyQ', false);
  assert.equal(api.swing, null); assert.equal(api.guarding, false, 'The absent hammer cannot swing or guard');
  // One large segment traverses both fixtures: endpoint-only collision would
  // miss the thin wall and either hit the farther robot or tunnel through both.
  api.updateThrownHammer(.5);
  assert.equal(thrown.returning, true);
  assert.equal(wall.hp, 1000 - Math.round(api.stats.power * 2.2));
  assert.equal(robot.hp, initialRobotHP); assert.ok(thrown.z < wall.z);
  for (let i = 0; api.throwFlight && i < 120; i++) api.updatePlayer(1 / 120);
  assert.equal(api.throwFlight, null); assert.equal(u.weaponHeld, true); assert.equal(u.hammerPivot.visible, true);
  assert.equal(thrown.mesh.parent, null);
  assert.equal(api.scene.children.filter(child => child.userData.kind === 'hammer-projectile').length, 0);
});

test('an R throw that misses also returns automatically after its outward range', () => {
  arena(); aimAt(0, 16); key('KeyR', true); key('KeyR', false); playerSteps(.29);
  let returning = false;
  for (let i = 0; api.throwFlight && i < 240; i++) {
    api.updatePlayer(1 / 120); returning ||= !!api.throwFlight?.returning;
  }
  assert.equal(returning, true); assert.equal(api.throwFlight, null); assert.equal(api.hero.userData.weaponHeld, true);
});

test('damaged objects draw numeric HP, then a short zero-HP echo survives destruction', () => {
  arena();
  const house = placeObject('house', 0, 3), maximum = house.maxHp;
  api.hurtObject(house, 17);
  assert.equal(house.hp, maximum - 17); assert.ok(house.hurtTimer > 0);
  assert.ok(api.numbers.some(n => n.text === '−17'));
  const canvas = elements.get('fxCanvas').context;
  canvas.textCalls.length = 0; api.drawFX();
  assert.ok(canvas.textCalls.some(c => c.text === `${Math.ceil(house.hp)} / ${Math.ceil(maximum)} HP`));
  assert.ok(canvas.textCalls.some(c => c.text === 'ΣΠΙΤΙ'));
  api.hurtObject(house, maximum * 2);
  assert.equal(house.dead, true); assert.equal(house.mesh.visible, false);
  assert.ok(api.hpEchoes.some(e => e.maxHp === maximum && e.x === house.x && e.z === house.z));
  canvas.textCalls.length = 0; api.drawFX();
  assert.ok(canvas.textCalls.some(c => c.text === `0 / ${Math.ceil(maximum)} HP`));
  api.updateEffects(1.2); assert.equal(api.hpEchoes.length, 0);
});

test('pause and blur clear held controls, freeze the player and allow a clean resume', () => {
  reset(); key('KeyW', true); advance(.12);
  key('Escape', true);
  assert.equal(api.phase, 'paused'); assert.equal(api.keys.size, 0);
  const snapshot = { x: api.player.x, z: api.player.z, elapsed: api.elapsed, hp: api.player.hp };
  key('KeyD', true); advance(1);
  assert.equal(api.player.x, snapshot.x); assert.equal(api.player.z, snapshot.z);
  assert.equal(api.elapsed, snapshot.elapsed); assert.equal(api.player.hp, snapshot.hp);
  elements.get('resumeButton').click();
  assert.equal(api.phase, 'playing');
  key('KeyD', true); advance(.1); assert.notEqual(api.player.x, snapshot.x);
  emit('blur'); assert.equal(api.phase, 'paused'); assert.equal(api.keys.size, 0);
});

test('a relic opens three real upgrade buttons and its choice changes actual stats', () => {
  reset();
  api.spawnDrop(api.player.x, api.player.z, 'relic');
  api.updateDrops(.5);
  assert.equal(api.phase, 'upgrade');
  const choices = elements.get('upgradeChoices').children;
  assert.equal(choices.length, 3);
  const oldStats = { ...api.stats };
  choices[0].click();
  assert.equal(api.phase, 'playing'); assert.equal(api.relics, 1);
  assert.equal(Object.values(api.levels).reduce((a, b) => a + b, 0), 1);
  assert.ok(Object.keys(oldStats).some(k => oldStats[k] !== api.stats[k]));
  assert.equal(api.hero.userData.hammerHead.scale.x, api.stats.size);
  api.player.hp = 50;
  api.spawnDrop(api.player.x, api.player.z, 'heart'); api.updateDrops(.5);
  assert.equal(api.player.hp, 78);
});

test('zombies telegraph then leap, while a hammer hit interrupts their windup', () => {
  reset();
  api.spawnEnemy('zombie', { x: 0, z: 2.5 });
  const enemy = api.enemies.at(-1); enemy.timer = -1;
  api.updateEnemies(.01);
  assert.equal(enemy.state, 'windup'); assert.ok(enemy.telegraph);
  api.updateEnemies(.53);
  assert.equal(enemy.state, 'lunge'); assert.ok(enemy.vy > 0);
  const before = Math.hypot(enemy.x - api.player.x, enemy.z - api.player.z);
  api.updateEnemies(.06);
  const after = Math.hypot(enemy.x - api.player.x, enemy.z - api.player.z);
  assert.ok(after < before - .4); assert.ok(enemy.y > 0);
  api.spawnEnemy('zombie', { x: 2.2, z: 0 });
  const interrupted = api.enemies.at(-1); interrupted.timer = -1;
  api.updateEnemies(.01); assert.equal(interrupted.state, 'windup');
  api.hitEnemy(interrupted, 10, { x: 1, z: 0 }, 5.4, 2.3);
  assert.equal(interrupted.state, 'walk'); assert.equal(interrupted.telegraph, null);
  assert.ok(interrupted.stagger > 0);
});

test('60% destruction summons one boss, a killing hit wins, and continuation retains upgrades', () => {
  reset();
  api.levels.power = 2; api.applyStats();
  const total = api.world.objects.reduce((sum, o) => sum + o.weight, 0);
  let destroyed = 0;
  for (const o of api.world.objects) {
    if ((destroyed + o.weight) / total * 100 >= core.GOAL) break;
    api.hurtObject(o, 99999, 1); destroyed += o.weight;
  }
  assert.ok(core.destructionPercent(api.world.objects) < core.GOAL);
  api.checkGoal(); assert.equal(api.boss, null);
  for (const o of api.world.objects) {
    if (o.dead) continue;
    api.hurtObject(o, 99999, 1);
    if (core.destructionPercent(api.world.objects) >= core.GOAL) break;
  }
  api.checkGoal();
  assert.ok(api.boss); assert.equal(elements.get('bossHud').hidden, false);
  const boss = api.boss;
  api.checkGoal(); assert.equal(api.boss, boss);
  boss.state = 'walk'; boss.y = 0; boss.hp = 1;
  api.hitBoss(1, { x: 0, z: 1 }, 5);
  assert.equal(boss.dead, true); assert.equal(api.phase, 'victory');
  assert.equal(elements.get('continueButton').hidden, false);
  const score = api.score;
  elements.get('continueButton').click();
  assert.equal(api.phase, 'playing'); assert.equal(api.round, 2);
  assert.equal(api.levels.power, 2); assert.equal(api.player.hp, api.player.maxHp);
  assert.equal(api.boss, null); assert.equal(api.enemies.length, 0);
  assert.equal(api.score, score);
  assert.equal(core.destructionPercent(api.world.objects), 0);
});

test('lethal damage opens defeat and retry resets score, upgrades and sector', () => {
  reset();
  api.player.hp = 1; api.player.invincible = 0;
  api.hurtPlayer(40, 1, 0);
  assert.equal(api.phase, 'dead'); assert.equal(api.player.hp, 0);
  assert.equal(elements.get('continueButton').hidden, true);
  elements.get('retryButton').click();
  assert.equal(api.phase, 'playing'); assert.equal(api.round, 1);
  assert.equal(api.player.hp, 120); assert.equal(api.score, 0);
  assert.equal(Object.values(api.levels).reduce((a, b) => a + b, 0), 0);
  advance(.1); assert.deepEqual(browserErrors, []);
});

test('permanent enemy removal releases its instance-owned geometry', () => {
  reset(); api.spawnEnemy('robot', { x: 0, z: 5 });
  const enemy = api.enemies.at(-1), geometries = new Set();
  enemy.mesh.traverse(o => { if (o.isMesh) geometries.add(o.geometry); });
  let disposals = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => disposals++);
  api.hitEnemy(enemy, 9999, { x: 0, z: 1 }, 5, 2);
  assert.equal(disposals, geometries.size, 'Every dead enemy must release its non-shared model geometry');
});
