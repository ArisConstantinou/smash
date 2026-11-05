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
import * as progression from '../progression.js';
import * as waves from '../waves.js';
import * as enemyModels from '../enemy-models.js';

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
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: this.id === 'gameCanvas' ? 1440 : 140, height: this.id === 'gameCanvas' ? 900 : 140 }; }
  setPointerCapture() {}
  focus() { document.activeElement = this; }
  click() { if (!this.disabled) this.onclick?.({ target: this, preventDefault() {} }); }
}
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
for (const [, tag, id] of html.matchAll(/<([a-z0-9-]+)\b[^>]*\bid="([^"]+)"/gi)) elements.set(id, new Element(tag, id));
const dataKeys = new Map();
for (const [, tag, attrs] of html.matchAll(/<([a-z0-9-]+)\b([^>]*)>/gi)) {
  const key = attrs.match(/\bdata-key="([^"]+)"/)?.[1];
  if (!key) continue;
  const id = attrs.match(/\bid="([^"]+)"/)?.[1];
  const el = (id && elements.get(id)) || new Element(tag);
  el.dataset.key = key; dataKeys.set(key, el);
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
  ['./progression.js', synthetic(progression, 'real-progression')],
  ['./waves.js', synthetic(waves, 'real-waves')],
  ['./enemy-models.js', synthetic(enemyModels, 'real-city-enemies')],
  ['./audio.js', synthetic({ GameAudio: StubAudio }, 'audio-test-surface')],
]);
const original = await readFile(new URL('../game.js', import.meta.url), 'utf8');
const testingExports = `
export const __integration = {
  get phase(){return phase;}, get player(){return player;}, get world(){return world;},
  get enemies(){return enemies;}, get drops(){return drops;}, get boss(){return boss;},
  get stats(){return stats;}, get levels(){return levels;}, get hero(){return hero;},
  get charge(){return charge;}, get swing(){return swing;}, get spin(){return spin;}, get facing(){return facing;},
  get elapsed(){return elapsed;}, get round(){return round;}, get relics(){return relics;},
  get kills(){return kills;}, get bolts(){return bolts;}, get score(){return score;},
  get scene(){return scene;}, get keys(){return keys;}, get pointer(){return pointer;},
  get wave(){return wave;}, get sector(){return sector;},
  get upgradeQueue(){return upgradeQueue;}, get upgradePanelOpen(){return upgradePanelOpen;},
  get nearbyTargets(){return nearbyTargets;}, get focusedTarget(){return focusedTarget;},
  get stance(){return stance;}, get stanceTarget(){return stanceTarget;},
  get guarding(){return guarding;}, get aim(){return aim;}, get aimPreview(){return aimPreview;},
  get leap(){return leap;}, get throwWindup(){return throwWindup;}, get throwFlight(){return throwFlight;},
  get hpEchoes(){return hpEchoes;}, get numbers(){return numbers;},
  startGame, resetWorld, frame, pauseGame, setPhase, updatePlayer, updateEnemies,
  updateBoss, updateDrops, updateHUD, poseHero, spawnEnemy, spawnDrop, hitEnemy,
  hurtObject, hurtPlayer, impact, beginSwing, defeatBoss, applyStats, openUpgrade,
  clearInput, hitBoss, checkGoal, updateAim, updateThrownHammer, shoot, drawFX,
  drawHP, screenPoint, updateEffects, beginWave, updateWaves, toggleUpgradePanel,
  setFacing(x,z){facing=normalize(x,z);pointer.active=false;},
  primeSwing(q){chargeHeld=false;chargeStarted=true;charge=q;attackCooldown=0;swing=null;},
  failFirstSpawnDuring(callback){const original=spawnEnemy;let attempts=0;spawnEnemy=(...args)=>++attempts===1?null:original(...args);try{callback();return attempts;}finally{spawnEnemy=original;}},
};`;
const game = new vm.SourceTextModule(original + testingExports, { context: sandbox, identifier: 'game.js with test-only exports' });
await game.link(specifier => {
  // Production uses versioned local module URLs to invalidate browser caches.
  const localModule = specifier.split('?')[0];
  assert.ok(imports.has(localModule), `Unstubbed external dependency ${specifier}`);
  return imports.get(localModule);
});
await game.evaluate();
await Promise.resolve();
const api = game.namespace.__integration;
function emit(name, props = {}) {
  const event = { repeat: false, preventDefault() {}, ...props };
  for (const fn of listeners.get(name) || []) fn(event);
}
const key = (code, down) => emit(down ? 'keydown' : 'keyup', { code });
function pointerEvent(id, type, props = {}) {
  const element = elements.get(id);
  assert.ok(element, `The actual HTML contains ${id}`);
  let stopped = false;
  const event = { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 70,
    target: element, currentTarget: element, preventDefault() {},
    stopPropagation() { stopped = true; }, ...props };
  for (const handler of element.events.get(type) || []) handler(event);
  if (!stopped) {
    for (const handler of listeners.get('document:' + type) || []) handler(event);
    for (const handler of listeners.get(type) || []) handler(event);
  }
  return event;
}
let heldMousePoint = null;
function mouseAttack(down, props = {}) {
  // Exercise the real canvas handler. A projected point on the player's aim
  // plane preserves the intended world-facing direction of combat fixtures.
  if (down || !heldMousePoint) heldMousePoint = api.screenPoint(
    api.player.x + api.facing.x * 12, api.player.y + 1.2, api.player.z + api.facing.z * 12);
  pointerEvent('gameCanvas', down ? 'pointerdown' : 'pointerup', {
    pointerId: 10, pointerType: 'mouse', button: 0, buttons: down ? 1 : 0,
    clientX: heldMousePoint.x, clientY: heldMousePoint.y, ...props,
  });
  if (!down) heldMousePoint = null;
}
function advance(seconds, step = 1 / 60) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= step) {
    time += Math.min(step, remaining) * 1000;
    api.frame(time);
  }
}
function reset() {
  heldMousePoint = null;
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
  api.world.rebuildSpatialIndex();
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
  api.world.rebuildSpatialIndex();
  return object;
}
const angleStep = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
function headAzimuth() {
  const head = worldPosition(api.hero.userData.hammerHead);
  return Math.atan2(head.x - api.player.x, head.z - api.player.z);
}

test('game initializes using its actual HTML ids, world and warrior, and renders a frame', () => {
  assert.deepEqual(browserErrors, []);
  assert.equal(api.phase, 'menu');
  assert.equal(elements.get('startButton').disabled, false);
  assert.equal(elements.get('fatalError').hidden, true);
  assert.ok(api.world.buildingCount >= 100, 'The playable district contains at least 100 buildings');
  assert.ok(api.world.hazards.length > 0);
  assert.ok(api.hero.userData.leftGrip && api.hero.userData.rightGrip);
  advance(.05);
  assert.ok(renderedFrames > 0 && scheduledFrames > 0);
});

test('the visible control deck maps Space to jump and exposes the illustrated nonmodal armory', () => {
  assert.equal(dataKeys.get('Space')?.id, 'leapButton');
  assert.equal(dataKeys.has('KeyE'), false);
  assert.notEqual(dataKeys.get('Space'), elements.get('attackButton'));
  assert.ok(elements.has('a-mouse-left'));
  for (const id of ['power', 'size', 'range', 'speed', 'vitality', 'quake']) assert.ok(elements.has('upgrade-' + id));
  for (const id of ['upgradesToggle', 'upgradePanel', 'upgradeChoices', 'pendingUpgradeCount', 'upgradeQueueText', 'waveEnemiesValue', 'waveStatus']) assert.ok(elements.has(id));
  assert.equal(elements.has('upgradeMenu'), false, 'The former blocking upgrade overlay is removed');
  assert.match(html, /id="upgradePanel" class="upgrade-drawer"/);
});

test('right mouse clicks and the former E key do not attack, spin or jump', () => {
  arena();
  pointerEvent('gameCanvas', 'pointerdown', { pointerId: 11, pointerType: 'mouse', button: 2, buttons: 2 });
  playerSteps(.3);
  pointerEvent('gameCanvas', 'pointerup', { pointerId: 11, pointerType: 'mouse', button: 2, buttons: 0 });
  key('KeyE', true); playerSteps(.1); key('KeyE', false);
  assert.equal(api.swing, null); assert.equal(api.spin, null); assert.equal(api.leap, null);
  key('Space', true); key('Space', false);
  assert.ok(api.leap); assert.equal(api.leap.slam, false, 'Space alone starts a normal leap without arming the mouse attack');
});

test('wave one gives breathing room, starts with two weak zombies, and a normal hit defeats one', () => {
  reset(); advance(5.5);
  assert.equal(api.enemies.length, 0, 'The opening must allow time to learn the controls before the first spawn');
  advance(1);
  assert.equal(api.enemies.length, 2, 'The first wave arrives in its first scheduled batch of two');
  assert.equal(api.wave.number, 1); assert.equal(api.wave.total, 10); assert.equal(api.wave.spawned, 2);
  const enemy = api.enemies[0];
  assert.equal(enemy.type, 'zombie'); assert.ok(enemy.hp <= api.stats.power);
  assert.ok(enemy.damage <= 6, 'A starter zombie should not retain the previous 11-damage attack');
  assert.ok(enemy.speed < api.stats.speed / 3);
  api.world.objects.forEach((o, i) => { o.x = 500 + i * 10; o.z = 500; o.mesh.position.set(o.x,o.baseY,o.z); });
  api.world.rebuildSpatialIndex();
  enemy.x = api.player.x; enemy.z = api.player.z + 2.3; enemy.speed = 0; enemy.state = 'idle';
  api.setFacing(0, 1); api.poseHero(1);
  mouseAttack(true); mouseAttack(false); playerSteps(.35);
  assert.equal(enemy.dead, true, 'One ordinary starter hammer hit must defeat the first zombie');
  assert.equal(api.kills, 1);
});

test('keyboard movement preserves mouse facing and a released left-click hits a surviving brute', () => {
  arena();
  aimAt(0, 12); playerSteps(.1);
  key('KeyD', true); advance(.12); key('KeyD', false);
  const before = { x: api.player.x, z: api.player.z }, facing = { ...api.facing };
  assert.ok(before.x > 0 && before.z < 0);
  assert.ok(facing.z > .9, 'Walking diagonally right must not overwrite the independent mouse direction');
  close(facing.x * api.aim.z - facing.z * api.aim.x, 0, .002);
  const enemy = stationaryEnemy('brute', before.x + facing.x * 2.3, before.z + facing.z * 2.3), hp = enemy.hp;
  mouseAttack(true); advance(.04);
  assert.equal(api.spin, null, 'A short press must stay a normal swing');
  mouseAttack(false);
  const strike = api.swing;
  assert.ok(strike); assert.equal(strike.charged, false);
  advance(.025);
  assert.equal(enemy.hp, hp, 'Windup must not apply the complete arc as an instantaneous hit');
  let contactTime = .025;
  for (; enemy.hp === hp && contactTime < .18; contactTime += 1 / 120) advance(1 / 120);
  assert.ok(contactTime <= .17, `Forward contact took ${contactTime.toFixed(3)} seconds after release`);
  assert.equal(enemy.dead, false); assert.equal(enemy.hp, hp - strike.damage);
  assert.ok(enemy.flash > 0 && enemy.stagger > 0);
  assert.ok(Math.hypot(enemy.vx, enemy.vz) > 1);
  assert.ok(enemy.vy > 0 || enemy.y > 0);
  assert.ok(audioEvents.some(e => e.name === 'hit' || e.name === 'break'));
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
  mouseAttack(true); mouseAttack(false);
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
  mouseAttack(true); mouseAttack(false);
  const strike = api.swing;
  assert.ok(strike);
  let changes = 0, previousHp = hp, previousHead = worldPosition(api.hero.userData.hammerHead);
  let maximumStep = 0;
  const poses = new Set();
  for (let frame = 0; api.swing && frame < 240; frame++) {
    api.updatePlayer(1 / 480);
    const head = worldPosition(api.hero.userData.hammerHead);
    maximumStep = Math.max(maximumStep, head.distanceTo(previousHead)); previousHead = head;
    poses.add(head.toArray().map(n => n.toFixed(3)).join(','));
    if (enemy.hp !== previousHp) { changes++; previousHp = enemy.hp; }
    if (strike.time / strike.duration < .08) assert.equal(enemy.hp, hp);
  }
  assert.equal(api.swing, null); assert.equal(changes, 1);
  assert.equal(enemy.hp, hp - strike.damage); assert.ok(strike.hits.has(enemy));
  assert.ok(poses.size > 45, `Expected many evolving hammer poses, got ${poses.size}`);
  assert.ok(maximumStep < .5, `Hammer teleported ${maximumStep} metres in one 480 Hz sample`);
});

test('a quick left-click connects promptly and completes its whole swing in under 300 ms', () => {
  arena(); api.poseHero(1);
  const enemy = stationaryEnemy('brute', 0, 2.3), hp = enemy.hp;
  mouseAttack(true); mouseAttack(false);
  let contactTime = null, duration = 0;
  while (api.swing && duration < .5) {
    api.updatePlayer(1 / 240); duration += 1 / 240;
    if (contactTime === null && enemy.hp < hp) contactTime = duration;
  }
  assert.notEqual(contactTime, null, 'A tap must connect with the forward target');
  assert.ok(contactTime <= .12, `Tap contact took ${contactTime.toFixed(3)} seconds`);
  assert.ok(duration <= .3, `The full tap animation took ${duration.toFixed(3)} seconds`);
  assert.equal(api.swing, null);
});

test('normal swings with either stock or upgraded hammer size reach nearby targets without striking behind', () => {
  for (const sizeLevel of [0, 2]) for (const distance of [.9, 1.1, 2.3]) {
    arena(); api.levels.size = sizeLevel; api.applyStats(); api.poseHero(1);
    const front = stationaryEnemy('brute', 0, distance), rear = stationaryEnemy('brute', 0, -1.1);
    const hp = front.hp;
    api.primeSwing(0); api.beginSwing();
    const strike = api.swing;
    playerSteps(.55, 1 / 240);
    assert.equal(front.hp, hp - strike.damage, `Hammer size level ${sizeLevel} missed a target ${distance} metres in front`);
    assert.equal(rear.hp, rear.maxHp, 'A normal forward swing must not become a circular attack');
  }
});

test('the wider near-body sweep still stops at a surviving wall before the enemy behind it', () => {
  arena(); api.poseHero(1);
  const wall = placeObject('wall', 0, 1.7, { w: 5, d: .08, h: 3, hp: 1000, maxHp: 1000 });
  const enemy = stationaryEnemy('brute', 0, 2.9);
  mouseAttack(true); mouseAttack(false);
  const strike = api.swing;
  playerSteps(.55, 1 / 240);
  assert.equal(wall.hp, 1000 - strike.damage);
  assert.equal(enemy.hp, enemy.maxHp, 'Improved close-range detection must not damage through a solid wall');
  assert.equal(strike.blocked, true);
});

test('a second short left-click during recovery executes once after the current swing', () => {
  arena();
  const before = audioEvents.filter(e => e.name === 'swing').length;
  mouseAttack(true); mouseAttack(false); playerSteps(.2);
  assert.ok(api.swing, 'The second tap is made while the first animation is still recovering');
  mouseAttack(true); mouseAttack(false);
  playerSteps(.8);
  assert.equal(audioEvents.filter(e => e.name === 'swing').length - before, 2,
    'Both taps must produce exactly one swing, including the tap made during recovery');
  assert.equal(api.swing, null);
  playerSteps(.5);
  assert.equal(audioEvents.filter(e => e.name === 'swing').length - before, 2, 'The buffer must not repeat itself');
});

test('holding the left mouse button during recovery transitions into a continuous spin and stops on release', () => {
  arena();
  mouseAttack(true); mouseAttack(false); playerSteps(.2);
  assert.ok(api.swing);
  mouseAttack(true); playerSteps(.15);
  assert.equal(api.spin, null, 'The hold threshold must distinguish a quick tap');
  playerSteps(.06);
  assert.ok(api.spin); assert.equal(api.swing, null);
  const heldSpin = api.spin;
  playerSteps(1.5);
  assert.equal(api.spin, heldSpin, 'Holding must continue the same rotation beyond one full turn');
  mouseAttack(false);
  assert.equal(api.spin, null); assert.equal(api.swing, null);
  playerSteps(.7);
  assert.equal(api.spin, null); assert.equal(api.swing, null, 'Release must not trigger the former charged attack');
});

test('an early second tap survives normal swing recovery without becoming a held spin', () => {
  arena();
  const before = audioEvents.filter(e => e.name === 'swing').length;
  mouseAttack(true); mouseAttack(false);
  const first = api.swing; assert.ok(first);
  playerSteps(.04); mouseAttack(true); mouseAttack(false);
  let followup = null;
  playerSteps(.9, 1 / 240, () => {
    if (api.swing && api.swing !== first) followup = api.swing;
    assert.equal(api.spin, null, 'Time waiting for recovery is not time holding the key');
  });
  assert.ok(followup, 'The short tap must survive the current animation recovery');
  assert.equal(followup.q, 0);
  assert.equal(audioEvents.filter(e => e.name === 'swing').length - before, 2);
});

test('guarding or cancelling a held button clears the pending attack', () => {
  for (const cancelWithGuard of [true, false]) {
    arena();
    const before = audioEvents.filter(e => e.name === 'swing').length;
    mouseAttack(true); mouseAttack(false); playerSteps(.2);
    if (cancelWithGuard) {
      mouseAttack(true); mouseAttack(false);
      key('KeyQ', true); playerSteps(.1); key('KeyQ', false);
    } else {
      pointerEvent('chargeButton', 'pointerdown'); playerSteps(.02);
      pointerEvent('chargeButton', 'pointercancel');
    }
    playerSteps(.8);
    assert.equal(api.charge, 0); assert.equal(api.swing, null);
    assert.equal(audioEvents.filter(e => e.name === 'swing').length - before, 1,
      'A cancelled queued press must not return after its cancellation');
  }
});

test('pausing clears a pending attack so it cannot fire on resume', () => {
  arena();
  const before = audioEvents.filter(e => e.name === 'swing').length;
  mouseAttack(true); mouseAttack(false); playerSteps(.2);
  mouseAttack(true); mouseAttack(false);
  key('Escape', true); key('Escape', false);
  assert.equal(api.phase, 'paused');
  elements.get('resumeButton').click(); advance(.8);
  assert.equal(audioEvents.filter(e => e.name === 'swing').length - before, 1);
});

test('render cadences down to 10 Hz preserve real movement speed and simulation time', () => {
  for (const fps of [60, 30, 20, 15, 10]) {
    arena();
    const start = { x: api.player.x, z: api.player.z, elapsed: api.elapsed };
    key('KeyD', true); advance(1, 1 / fps); key('KeyD', false);
    close(api.elapsed - start.elapsed, 1, .009);
    close(Math.hypot(api.player.x - start.x, api.player.z - start.z), api.stats.speed, .055);
  }
});

test('a fast swing still hits exactly once between sparse rendered frames', () => {
  for (const fps of [15, 10]) {
    arena(); api.poseHero(1);
    const enemy = stationaryEnemy('brute', 0, 2.3), hp = enemy.hp;
    mouseAttack(true); mouseAttack(false);
    const damage = api.swing.damage;
    advance(.4, 1 / fps);
    assert.equal(enemy.hp, hp - damage, `The ${fps} Hz animation must not skip through the target`);
  }
});

test('all four illustrated WASD buttons move continuously and release on pointer cancellation', () => {
  for (const [id, code, horizontal, vertical] of [
    ['moveUpButton', 'KeyW', 0, -1], ['moveLeftButton', 'KeyA', -1, 0],
    ['moveDownButton', 'KeyS', 0, 1], ['moveRightButton', 'KeyD', 1, 0],
  ]) {
    arena();
    const direction = core.screenMovement(horizontal, vertical), start = { x: api.player.x, z: api.player.z };
    pointerEvent(id, 'pointerdown'); playerSteps(.1);
    const dx = api.player.x - start.x, dz = api.player.z - start.z;
    assert.ok(dx * direction.x + dz * direction.z > .5, `${code} must move in its pictured screen direction`);
    close(dx * direction.z - dz * direction.x, 0);
    pointerEvent(id, 'pointercancel');
    const stopped = { x: api.player.x, z: api.player.z }; playerSteps(.1);
    close(api.player.x, stopped.x); close(api.player.z, stopped.z);
    assert.equal(api.keys.has(code), false);
  }
});

test('the illustrated attack, held spin and combined smash buttons execute their pictured actions', () => {
  arena();
  pointerEvent('attackButton', 'pointerdown'); pointerEvent('attackButton', 'pointerup');
  assert.ok(api.swing); assert.equal(api.swing.charged, false); assert.equal(api.spin, null);
  arena();
  pointerEvent('chargeButton', 'pointerdown');
  assert.ok(api.spin, 'The pictured spin button starts its action immediately');
  playerSteps(1.4);
  assert.ok(api.spin); assert.equal(api.swing, null);
  pointerEvent('chargeButton', 'pointerup');
  assert.equal(api.spin, null); assert.equal(api.swing, null);
  playerSteps(.4); assert.equal(api.swing, null, 'Releasing the spin button must not charge or swing');
  arena();
  pointerEvent('slamButton', 'pointerdown'); pointerEvent('slamButton', 'pointerup');
  assert.ok(api.leap); assert.equal(api.leap.slam, true);
});

test('holding the left mouse button continuously rotates the whole warrior and extended hammer through more than two full turns', () => {
  arena(); api.poseHero(1);
  mouseAttack(true); playerSteps(.24);
  assert.ok(api.spin); assert.equal(api.swing, null);
  let bodyAngle = api.hero.rotation.y, headAngle = headAzimuth();
  let bodyTravel = 0, headTravel = 0, largestStep = 0, minimumRadius = Infinity;
  const poses = new Set();
  playerSteps(2.1, 1 / 120, () => {
    const nextBody = api.hero.rotation.y, nextHead = headAzimuth();
    const bodyStep = angleStep(bodyAngle, nextBody);
    bodyTravel += bodyStep; headTravel += angleStep(headAngle, nextHead);
    largestStep = Math.max(largestStep, Math.abs(bodyStep)); bodyAngle = nextBody; headAngle = nextHead;
    const head = worldPosition(api.hero.userData.hammerHead);
    minimumRadius = Math.min(minimumRadius, Math.hypot(head.x - api.player.x, head.z - api.player.z));
    poses.add([nextBody, head.x, head.y, head.z].map(n => n.toFixed(3)).join(','));
    close(worldPosition(api.hero.userData.rightGrip).distanceTo(worldPosition(api.hero.userData.rightGripAnchor)), 0);
  });
  assert.ok(bodyTravel > Math.PI * 4, `The body rotated only ${(bodyTravel / Math.PI / 2).toFixed(2)} turns`);
  close(bodyTravel, 2.1 / .62 * Math.PI * 2, .025);
  close(headTravel, bodyTravel, .15);
  assert.ok(minimumRadius > 1.8, 'The hammer must extend visibly out from the spinning warrior');
  assert.ok(poses.size > 180 && largestStep < .15, 'Body and hammer need continuous poses, not a frame swap');
  assert.ok(api.spin, 'The spin must not stop automatically after a fixed number of turns');
  mouseAttack(false);
});

test('WASD remains directional and continuous while the warrior spins independently', () => {
  arena(); api.poseHero(1);
  pointerEvent('chargeButton', 'pointerdown'); playerSteps(.15);
  const start = { x: api.player.x, z: api.player.z }, direction = core.screenMovement(1, 0);
  key('KeyD', true); playerSteps(1); key('KeyD', false);
  const dx = api.player.x - start.x, dz = api.player.z - start.z;
  close(dx * direction.z - dz * direction.x, 0, .001);
  close(Math.hypot(dx, dz), api.stats.speed * .84, .01);
  assert.ok(api.spin, 'Changing walking direction must not cancel the held spin');
  pointerEvent('chargeButton', 'pointerup');
});

test('a sustained spin hits real targets on every side no more than once per revolution', () => {
  arena(); api.poseHero(1);
  mouseAttack(true); playerSteps(.24);
  const targets = [[0, 2.1], [2.1, 0], [0, -2.1], [-2.1, 0]].map(([x, z]) => {
    const enemy = stationaryEnemy('brute', x, z); enemy.hp = enemy.maxHp = 1000; return enemy;
  });
  const events = targets.map(() => []), previousHP = targets.map(e => e.hp);
  const damage = Math.round(api.stats.power * .9);
  let t = 0;
  playerSteps(2.3, 1 / 240, dt => {
    t += dt;
    targets.forEach((enemy, index) => {
      if (enemy.hp !== previousHP[index]) {
        assert.equal(previousHP[index] - enemy.hp, damage);
        events[index].push(t); previousHP[index] = enemy.hp;
      }
    });
    if (t < .04) assert.ok(events.some(hits => hits.length === 0), 'The entire circle must not be damaged instantly');
  });
  events.forEach((hits, index) => {
    assert.ok(hits.length >= 3 && hits.length <= 4, `Side ${index} received ${hits.length} hits over 2.3 seconds`);
    for (let i = 1; i < hits.length; i++) {
      assert.ok(hits[i] - hits[i - 1] >= .62 - 1 / 240 - 1e-7, 'A target must not be hit twice at the turn boundary');
      assert.ok(hits[i] - hits[i - 1] <= .66, 'Each subsequent physical revolution should reconnect');
    }
    assert.ok(targets[index].stagger > 0 && Math.hypot(targets[index].vx, targets[index].vz) > 1);
  });
  mouseAttack(false);
});

test('spinning strikes scenery but cannot hit through a surviving wall, outside reach, or above the hammer', () => {
  arena(); api.poseHero(1);
  const wall = placeObject('wall', 0, 1.7, { w: 5, d: .08, h: 3, hp: 1000, maxHp: 1000 });
  const behindWall = stationaryEnemy('brute', 0, 2.9), rear = stationaryEnemy('brute', 0, -2.1);
  const distant = stationaryEnemy('brute', 9, 0), elevated = stationaryEnemy('brute', -2.1, 0);
  for (const enemy of [behindWall, rear, distant, elevated]) enemy.hp = enemy.maxHp = 1000;
  elevated.y = 12; elevated.mesh.position.y = 12;
  mouseAttack(true); playerSteps(2.2);
  assert.ok(api.spin, 'Wall contact must not silently stop a held spin');
  assert.ok(wall.hp < wall.maxHp && rear.hp < rear.maxHp, 'The rotating weapon must damage both scenery and an exposed rear target');
  assert.equal(behindWall.hp, behindWall.maxHp);
  assert.equal(distant.hp, distant.maxHp); assert.equal(elevated.hp, elevated.maxHp);
  mouseAttack(false);
});

test('releasing the left mouse button stops damage immediately without a charged follow-up', () => {
  arena(); api.poseHero(1);
  mouseAttack(true); playerSteps(.9);
  assert.ok(api.spin);
  const head = worldPosition(api.hero.userData.hammerHead);
  const enemy = stationaryEnemy('brute', head.x, head.z); enemy.hp = enemy.maxHp = 1000;
  const events = audioEvents.filter(e => e.name === 'swing').length;
  mouseAttack(false);
  assert.equal(api.spin, null); assert.equal(api.swing, null);
  playerSteps(.8);
  // Spin recovery returns to the independent mouse-facing direction.
  close(angleStep(Math.atan2(api.aim.x, api.aim.z), api.hero.rotation.y), 0, .01);
  assert.equal(enemy.hp, enemy.maxHp, 'The recovery pose must have no residual damage');
  assert.equal(audioEvents.filter(e => e.name === 'swing').length, events);
  mouseAttack(true); mouseAttack(false);
  assert.ok(api.swing, 'A fresh tap after release must still work');
});

test('a second spin input preserves the active turn and its per-target contact cooldown', () => {
  arena(); mouseAttack(true); playerSteps(.3);
  const activeSpin = api.spin; assert.ok(activeSpin);
  const head = worldPosition(api.hero.userData.hammerHead);
  const enemy = stationaryEnemy('brute', head.x, head.z); enemy.hp = enemy.maxHp = 1000;
  playerSteps(.01);
  assert.equal(enemy.hp, 1000 - Math.round(api.stats.power * .9));
  const afterContact = enemy.hp, startedAt = activeSpin.time;
  for (let request = 0; request < 3; request++) {
    pointerEvent('chargeButton', 'pointerdown'); playerSteps(.05);
    assert.equal(api.spin, activeSpin, 'A second input source must not reset the existing spin');
    assert.equal(enemy.hp, afterContact, 'Repeated start requests must not bypass the revolution cooldown');
  }
  assert.ok(activeSpin.time >= startedAt + .15 - 1e-7);
  pointerEvent('chargeButton', 'pointerup'); mouseAttack(false);
  assert.equal(api.spin, null); assert.equal(api.swing, null);
});

test('Q, Space, R and Z cancel a held spin and carry out their own actions without restarting it', () => {
  for (const action of ['KeyQ', 'Space', 'KeyR', 'KeyZ']) {
    arena(); mouseAttack(true); playerSteps(.3); assert.ok(api.spin);
    key(action, true); api.updatePlayer(.01);
    assert.equal(api.spin, null, `${action} must cancel the old spin`);
    if (action === 'KeyQ') assert.equal(api.guarding, true);
    if (action === 'Space') { assert.ok(api.leap); assert.equal(api.leap.slam, true, 'Space inherits the held mouse attack as an armed smash'); }
    if (action === 'KeyR') assert.ok(api.throwWindup || api.throwFlight);
    if (action === 'KeyZ') assert.equal(api.stanceTarget, 1);
    key(action, false); playerSteps(.3);
    assert.equal(api.spin, null, 'A cancelled held key must not restart after the overriding action');
    mouseAttack(false); playerSteps(.5);
    assert.equal(api.spin, null); assert.equal(api.swing, null, 'Release after cancellation must not add a ground swing');
  }
});

test('pause, blur and pointer cancellation stop a spin and clear held input on resume', () => {
  for (const action of ['pause', 'blur', 'pointercancel']) {
    arena(); pointerEvent('chargeButton', 'pointerdown'); playerSteps(.4); assert.ok(api.spin);
    if (action === 'pointercancel') pointerEvent('chargeButton', 'pointercancel');
    else if (action === 'pause') { key('Escape', true); key('Escape', false); }
    else emit('blur');
    assert.equal(api.spin, null);
    if (action !== 'pointercancel') { assert.equal(api.phase, 'paused'); elements.get('resumeButton').click(); }
    playerSteps(.8);
    assert.equal(api.spin, null); assert.equal(api.swing, null);
    assert.equal(elements.get('chargeButton').classList.contains('active'), false);
  }
});

test('canvas pointer cancellation or lost capture stops a held mouse spin without a delayed swing', () => {
  for (const cancellation of ['pointercancel', 'lostpointercapture']) {
    arena(); mouseAttack(true); playerSteps(.4); assert.ok(api.spin);
    pointerEvent('gameCanvas', cancellation, { pointerId: 10, pointerType: 'mouse', button: 0, buttons: 0 });
    assert.equal(api.spin, null); assert.equal(api.swing, null);
    const swings = audioEvents.filter(event => event.name === 'swing').length;
    mouseAttack(false); playerSteps(.8);
    assert.equal(api.spin, null); assert.equal(api.swing, null);
    assert.equal(audioEvents.filter(event => event.name === 'swing').length, swings,
      'Losing mouse capture cannot leave a queued attack that fires afterward');
  }
});

test('two-handed spin keeps both hands attached and carries the stance damage bonus', () => {
  arena(); key('KeyZ', true); key('KeyZ', false); playerSteps(1.08);
  assert.equal(api.stance, 1);
  const enemy = stationaryEnemy('brute', 0, 2.1); enemy.hp = enemy.maxHp = 1000;
  pointerEvent('chargeButton', 'pointerdown');
  playerSteps(.7, 1 / 120, () => {
    for (const side of ['left', 'right']) {
      close(worldPosition(api.hero.userData[side + 'Grip']).distanceTo(worldPosition(api.hero.userData[side + 'GripAnchor'])), 0);
    }
    assert.equal(api.hero.userData.shieldStored, true);
  });
  const damage = enemy.maxHp - enemy.hp, expected = Math.round(api.stats.power * .9 * 1.25);
  assert.ok(damage >= expected && damage <= expected * 2); assert.equal(damage % expected, 0);
  pointerEvent('chargeButton', 'pointerup');
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
  for (let i = 0; i < 120 && !api.bolts[0]?.reflected; i++) api.updateEnemies(1 / 120);
  assert.equal(api.bolts.length, 1); assert.equal(api.bolts[0].reflected, true);
  assert.ok(api.bolts[0].vz > 0); assert.equal(api.player.hp, hp);
  for (let i = 0; i < 120 && api.bolts.length; i++) api.updateEnemies(1 / 120);
  assert.equal(api.bolts.length, 0); assert.ok(robot.hp < robotHP); assert.equal(api.player.hp, hp);
  key('KeyQ', false);
});

test('Space makes a high forward leap and damages nearby targets once on its ordinary landing', () => {
  arena();
  const direction = core.screenMovement(1, 0);
  aimAt(direction.x * 12, direction.z * 12); playerSteps(.05);
  const enemy = stationaryEnemy('brute', direction.x * 10.8 - direction.z * 1.7, direction.z * 10.8 + direction.x * 1.7);
  const distant = stationaryEnemy('brute', direction.x * 10.8 - direction.z * 6, direction.z * 10.8 + direction.x * 6);
  const hp = enemy.hp;
  key('KeyD', true); key('Space', true); key('Space', false); key('KeyD', false);
  assert.ok(api.leap); assert.equal(api.leap.slam, false);
  let apex = 0, flightTime = 0;
  for (; api.leap && flightTime < 2; flightTime += 1 / 120) {
    api.updatePlayer(1 / 120); apex = Math.max(apex, api.player.y);
    if (api.leap) assert.equal(enemy.hp, hp, 'The leap damages the ground on landing, not while airborne');
  }
  assert.equal(api.leap, null); assert.ok(apex > 7.5, `Expected a clearly visible high jump; apex was ${apex}`);
  assert.ok(flightTime <= 1.65, `The high jump took ${flightTime.toFixed(2)} seconds to land`);
  assert.ok(api.player.x * direction.x + api.player.z * direction.z > 9);
  close(api.player.x * direction.z - api.player.z * direction.x, 0);
  close(api.player.y, 0); assert.ok(enemy.hp < hp, 'An ordinary jump must still land with damage');
  assert.ok(hp - enemy.hp < api.stats.power * 2, 'The ordinary landing stays weaker than an armed smash');
  assert.equal(distant.hp, distant.maxHp);
  const after = enemy.hp; playerSteps(.4); assert.equal(enemy.hp, after, 'One landing applies damage once');
});

test('an airborne left-click arms a large smash whose damage happens only on landing', () => {
  arena();
  const nearLeft = stationaryEnemy('brute', -2, 5.6), nearRight = stationaryEnemy('brute', 2, 5.6);
  const distant = stationaryEnemy('brute', 10, 5.6);
  const wall = placeObject('wall', 3.5, 5.6, { w: 1, d: 1, h: 1, hp: 1000, maxHp: 1000 });
  const targets = [nearLeft, nearRight, wall], before = targets.map(t => t.hp);
  key('Space', true); key('Space', false); playerSteps(.5);
  assert.ok(api.player.y > 6); assert.ok(api.leap); assert.equal(api.leap.slam, false);
  mouseAttack(true); mouseAttack(false);
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

test('a left mouse button held before Space reliably arms the impact without adding a ground swing on release', () => {
  arena();
  mouseAttack(true); playerSteps(.12);
  assert.equal(api.spin, null, 'The mouse button is held but still below the spin threshold');
  key('Space', true); key('Space', false);
  assert.ok(api.leap); assert.equal(api.leap.slam, true, 'The held mouse attack must survive the jump input');
  assert.equal(api.swing, null);
  for (let i = 0; api.leap && (api.leap.vy >= 0 || api.player.y > .55) && i < 480; i++) api.updatePlayer(1 / 240);
  assert.ok(api.leap, 'The fixture is introduced before the descending warrior touches the ground');
  const enemy = stationaryEnemy('brute', api.player.x + 1.5, api.player.z), hp = enemy.hp;
  for (let i = 0; api.leap && i < 120; i++) {
    api.updatePlayer(1 / 240);
    if (api.leap) assert.equal(enemy.hp, hp);
  }
  assert.equal(api.leap, null);
  assert.ok(hp - enemy.hp > api.stats.power * 2, 'The held mouse and jump combination must cause the large smash');
  const after = enemy.hp, swingEvents = audioEvents.filter(e => e.name === 'swing').length;
  mouseAttack(false); playerSteps(.5);
  assert.equal(enemy.hp, after);
  assert.equal(audioEvents.filter(e => e.name === 'swing').length, swingEvents);
});

test('a left-click just before touchdown upgrades that landing to a huge smash exactly once', () => {
  arena(); key('Space', true); key('Space', false);
  for (let i = 0; api.leap && (api.leap.vy >= 0 || api.player.y > .45) && i < 480; i++) api.updatePlayer(1 / 240);
  assert.ok(api.leap); assert.equal(api.leap.slam, false);
  const near = stationaryEnemy('brute', api.player.x + 1.6, api.player.z);
  const outer = stationaryEnemy('brute', api.player.x + 4.1, api.player.z);
  const before = [near.hp, outer.hp];
  mouseAttack(true); mouseAttack(false);
  assert.equal(api.leap.slam, true);
  assert.deepEqual([near.hp, outer.hp], before);
  for (let i = 0; api.leap && i < 120; i++) {
    api.updatePlayer(1 / 240);
    if (api.leap) assert.deepEqual([near.hp, outer.hp], before);
  }
  assert.equal(api.leap, null);
  assert.ok(before[0] - near.hp > api.stats.power * 2);
  assert.ok(outer.hp < before[1], 'An armed landing also damages beyond the ordinary jump radius');
  const after = [near.hp, outer.hp]; playerSteps(.5);
  assert.deepEqual([near.hp, outer.hp], after);
});

test('Space immediately interrupts a recovering swing and lands with damage', () => {
  arena();
  mouseAttack(true); mouseAttack(false); playerSteps(.2);
  assert.ok(api.swing);
  key('Space', true); key('Space', false);
  assert.ok(api.leap, 'Jump must respond during swing recovery');
  assert.equal(api.swing, null);
  for (let i = 0; api.leap && (api.leap.vy >= 0 || api.player.y > .5) && i < 240; i++) api.updatePlayer(1 / 120);
  const enemy = stationaryEnemy('brute', api.player.x + 1.4, api.player.z), hp = enemy.hp;
  for (let i = 0; api.leap && i < 120; i++) api.updatePlayer(1 / 120);
  assert.equal(api.leap, null); assert.ok(enemy.hp < hp);
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
  mouseAttack(true); mouseAttack(false); key('KeyQ', true); api.updatePlayer(.01); key('KeyQ', false);
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

test('enemy target marks follow proximity and visibility and clear when the warrior moves away', () => {
  arena();
  const front = stationaryEnemy('brute', 0, 6), side = stationaryEnemy('brute', -5, 1);
  const far = stationaryEnemy('robot', 0, 20);
  aimAt(0, 12);
  assert.ok(api.nearbyTargets.includes(front)); assert.ok(api.nearbyTargets.includes(side));
  assert.equal(api.nearbyTargets.includes(far), false);
  assert.equal(api.focusedTarget, front);
  const wall = placeObject('wall', 0, 3, { w: 5, d: .1, h: 3, hp: 1000, maxHp: 1000 });
  api.updateAim();
  assert.equal(api.nearbyTargets.includes(front), false, 'A surviving building or wall prevents a visible target lock');
  assert.notEqual(api.focusedTarget, front);
  api.hurtObject(wall, 99999); api.updateAim();
  assert.ok(api.nearbyTargets.includes(front)); assert.equal(api.focusedTarget, front);
  api.hitEnemy(front, 99999, { x: 0, z: 1 }, 0, 0); api.updateAim();
  assert.equal(api.nearbyTargets.includes(front), false, 'A destroyed target loses its mark immediately');
  key('KeyD', true); playerSteps(3.8); key('KeyD', false); api.updateAim();
  assert.equal(api.nearbyTargets.length, 0);
  assert.equal(api.focusedTarget, null, 'Target locks never persist after leaving their proximity');
});

test('an R throw that misses also returns automatically after its outward range', () => {
  arena(); aimAt(0, 16); key('KeyR', true); key('KeyR', false); playerSteps(.29);
  let returning = false;
  for (let i = 0; api.throwFlight && i < 240; i++) {
    api.updatePlayer(1 / 120); returning ||= !!api.throwFlight?.returning;
  }
  assert.equal(returning, true); assert.equal(api.throwFlight, null); assert.equal(api.hero.userData.weaponHeld, true);
});

test('damaged tall buildings draw numeric HP near their facade and retain a zero-HP echo after destruction', () => {
  arena();
  const house = placeObject('townhouse', 0, 7), maximum = house.maxHp;
  api.hurtObject(house, 17);
  assert.equal(house.hp, maximum - 17); assert.ok(house.hurtTimer > 0);
  assert.ok(api.numbers.some(n => n.text === '−17'));
  const canvas = elements.get('fxCanvas').context;
  canvas.textCalls.length = 0; api.drawFX();
  assert.ok(canvas.textCalls.some(c => c.text === `${Math.ceil(house.hp)} / ${Math.ceil(maximum)} HP`));
  assert.ok(canvas.textCalls.some(c => c.text === house.label), 'The damaged building shows its actual city category');
  api.hurtObject(house, maximum * 2);
  assert.equal(house.dead, true); assert.equal(house.mesh.visible, false);
  const echo = api.hpEchoes.find(e => e.maxHp === maximum);
  assert.ok(echo, 'Destroying the building leaves a temporary numeric-HP marker');
  const facade = core.nearestPoint(api.player.x, api.player.z, house);
  close(echo.x, facade.x); close(echo.z, facade.z);
  assert.ok(echo.y <= api.player.y + 4.5, 'Tall roofs must not carry the HP marker above the visible fight');
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

test('a relic queues three illustrated choices without pausing or opening the armory automatically', () => {
  reset();
  api.spawnDrop(api.player.x, api.player.z, 'relic');
  api.updateDrops(.5);
  assert.equal(api.phase, 'playing'); assert.equal(api.upgradePanelOpen, false);
  assert.equal(elements.get('upgradePanel').hidden, true);
  assert.equal(api.upgradeQueue.length, 1);
  assert.equal(String(elements.get('pendingUpgradeCount').textContent), '1');
  const choices = elements.get('upgradeChoices').children;
  assert.equal(choices.length, 3);
  assert.ok(choices.every(button => /<svg\b[^>]*class="upgrade-icon"/.test(button.innerHTML)));
  assert.ok(choices.every(button => /href="#upgrade-(power|size|range|speed|vitality|quake)"/.test(button.innerHTML)));
  key('Digit1', true); key('Digit1', false);
  assert.equal(api.upgradeQueue.length, 1, 'Number keys must not spend a hidden upgrade');
  choices[0].click();
  assert.equal(api.relics, 0, 'A hidden or stale choice cannot be applied through its click handler');
  key('KeyU', true); key('KeyU', false);
  assert.equal(api.upgradePanelOpen, true); assert.equal(elements.get('upgradePanel').hidden, false);
  const before = { x: api.player.x, z: api.player.z, elapsed: api.elapsed };
  key('KeyD', true); advance(.2); key('KeyD', false);
  assert.ok(api.elapsed > before.elapsed + .18, 'Opening the drawer must not stop simulation time');
  assert.ok(Math.hypot(api.player.x - before.x, api.player.z - before.z) > .5, 'The warrior keeps moving while choices are visible');
  const oldStats = { ...api.stats };
  key('Digit1', true); key('Digit1', false);
  assert.equal(api.phase, 'playing'); assert.equal(api.relics, 1);
  assert.equal(api.upgradeQueue.length, 0);
  assert.equal(Object.values(api.levels).reduce((a, b) => a + b, 0), 1);
  assert.ok(Object.keys(oldStats).some(k => oldStats[k] !== api.stats[k]));
  assert.equal(api.hero.userData.hammerHead.scale.x, api.stats.size);
  api.player.hp = 50;
  api.spawnDrop(api.player.x, api.player.z, 'heart'); api.updateDrops(.5);
  assert.equal(api.player.hp, 78);
});

test('queued rewards survive drawer toggles and each selection consumes only its oldest reward', () => {
  arena(); api.openUpgrade(); api.openUpgrade();
  assert.equal(api.phase, 'playing'); assert.equal(api.upgradePanelOpen, false);
  assert.equal(api.upgradeQueue.length, 2);
  const first = api.upgradeQueue[0], second = api.upgradeQueue[1];
  elements.get('upgradesToggle').click();
  const oldButton = elements.get('upgradeChoices').children[1], chosen = first[1].id;
  key('Digit2', true); key('Digit2', false);
  assert.equal(api.levels[chosen], 1); assert.equal(api.relics, 1);
  assert.equal(api.upgradeQueue.length, 1); assert.equal(api.upgradeQueue[0], second);
  assert.equal(String(elements.get('pendingUpgradeCount').textContent), '1');
  oldButton.click();
  assert.equal(api.relics, 1, 'The consumed choice cannot be applied a second time');
  elements.get('upgradeCloseButton').click();
  assert.equal(api.upgradePanelOpen, false); assert.equal(elements.get('upgradePanel').hidden, true);
  key('Digit3', true); key('Digit3', false);
  assert.equal(api.upgradeQueue.length, 1);
  key('KeyU', true); key('KeyU', false);
  key('Digit3', true); key('Digit3', false);
  assert.equal(api.relics, 2); assert.equal(api.upgradeQueue.length, 0);
  assert.equal(Object.values(api.levels).reduce((a, b) => a + b, 0), 2);
  assert.equal(elements.get('pendingUpgradeCount').hidden, true);
  assert.equal(api.phase, 'playing');
});

test('ten enemies arrive in batches of two, three and five before a stronger second wave can begin', () => {
  arena(); api.beginWave(1);
  const plan = waves.wavePlan(1);
  let defeated = 0, starter = null;
  for (const [index, expected] of [2, 3, 5].entries()) {
    api.updateWaves((index === 0 ? plan.firstDelay : plan.interval) + .01);
    const batch = api.enemies.filter(e => !e.dead);
    assert.equal(batch.length, expected);
    assert.equal(api.wave.spawned, defeated + expected);
    assert.equal(api.wave.total, 10); assert.equal(api.wave.number, 1);
    starter ||= { hp: batch[0].maxHp, damage: batch[0].damage };
    if (index === 2) {
      api.updateWaves(100);
      assert.equal(api.wave.number, 1, 'The next wave must wait for the last living enemy');
      assert.equal(api.enemies.filter(e => !e.dead).length, 5, 'The finite budget cannot spawn extra enemies');
    }
    for (const enemy of batch) api.hitEnemy(enemy, 99999, { x: 0, z: 1 }, 0, 0);
    defeated += expected;
    api.updateWaves(.01);
    assert.equal(api.wave.defeated, defeated);
    if (defeated < 10) assert.equal(api.wave.state, 'active', 'A cleared batch does not finish an incomplete wave');
  }
  assert.equal(api.wave.state, 'break'); assert.equal(api.wave.number, 1);
  api.updateWaves(plan.breakTime - .1);
  assert.equal(api.wave.number, 1);
  api.updateWaves(.11);
  assert.equal(api.wave.number, 2); assert.equal(api.wave.total, 16);
  assert.equal(api.wave.spawned, 0); assert.equal(api.wave.defeated, 0);
  assert.equal(api.wave.state, 'active');
  api.spawnEnemy('zombie', { x: 0, z: 18 });
  const stronger = api.enemies.at(-1);
  assert.ok(stronger.maxHp > starter.hp); assert.ok(stronger.damage > starter.damage);
  assert.equal(api.phase, 'playing');
});

test('a failed wave spawn preserves its slot and cannot duplicate the final mini-boss', () => {
  arena();api.beginWave(3);api.wave.spawned=20;api.wave.defeated=20;
  const attempts=api.failFirstSpawnDuring(()=>api.updateWaves(100));
  assert.equal(attempts,1,'A failed member must stop the batch before the final mini-boss');
  assert.equal(api.wave.spawned,20);assert.equal(api.enemies.length,0);
  api.updateWaves(.61);
  assert.equal(api.wave.spawned,22);assert.equal(api.enemies.length,2);
  assert.equal(api.enemies.filter(e=>e.type==='titan').length,1);
  api.updateWaves(100);
  assert.equal(api.enemies.filter(e=>e.type==='titan').length,1);
});

test('zombies telegraph then leap, while a hammer hit interrupts their windup', () => {
  reset();
  api.spawnEnemy('zombie', { x: 0, z: 2.5 });
  const enemy = api.enemies.at(-1); enemy.timer = -1;
  api.updateEnemies(.01);
  assert.equal(enemy.state, 'windup'); assert.ok(enemy.telegraph);
  api.updateEnemies(enemy.windup * .5);
  assert.equal(enemy.state, 'windup', 'The opening attack grants a readable warning');
  api.updateEnemies(enemy.windup * .5 + .01);
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
