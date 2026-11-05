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
  return new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return text => ({ width: String(text).length * 8 });
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
  startGame, resetWorld, frame, pauseGame, setPhase, updatePlayer, updateEnemies,
  updateBoss, updateDrops, updateHUD, poseHero, spawnEnemy, spawnDrop, hitEnemy,
  hurtObject, hurtPlayer, impact, beginSwing, defeatBoss, applyStats, openUpgrade,
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
function reset() { api.startGame(); advance(.02); }

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
  reset();
  key('KeyD', true); advance(.12); key('KeyD', false);
  const before = { x: api.player.x, z: api.player.z }, facing = { ...api.facing };
  assert.ok(before.x > 0 && before.z < 0);
  api.spawnEnemy('brute', { x: before.x + facing.x * 2.4, z: before.z + facing.z * 2.4 });
  const enemy = api.enemies.at(-1);
  key('Space', true); advance(1.31);
  assert.equal(api.charge, 1); assert.equal(api.swing, null, 'Holding must charge without auto-swinging');
  key('Space', false);
  assert.ok(api.swing?.charged);
  advance(.2);
  assert.equal(enemy.dead, false);
  assert.equal(enemy.hp, 25);
  assert.ok(enemy.flash > 0 && enemy.stagger > 0);
  assert.ok(Math.hypot(enemy.vx, enemy.vz) > 1);
  assert.ok(enemy.vy > 0 || enemy.y > 0);
  assert.ok(audioEvents.some(e => (e.name === 'hit' || e.name === 'break') && e.power === 1));
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
  api.primeSwing(1); api.beginSwing(); api.impact();
  // That swing may finish an incidental near prop; advance setup only if needed.
  if (!api.boss) {
    for (const o of api.world.objects) {
      if (o.dead) continue;
      api.hurtObject(o, 99999, 1);
      if (core.destructionPercent(api.world.objects) >= core.GOAL) break;
    }
    api.primeSwing(1); api.beginSwing(); api.impact();
  }
  assert.ok(api.boss); assert.equal(elements.get('bossHud').hidden, false);
  const boss = api.boss;
  api.primeSwing(1); api.beginSwing(); api.impact(); assert.equal(api.boss, boss);
  boss.state = 'walk'; boss.y = 0; boss.hp = 1;
  api.player.x = boss.x; api.player.z = boss.z - 3.3; api.setFacing(0, 1);
  api.primeSwing(1); api.beginSwing(); api.impact();
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
