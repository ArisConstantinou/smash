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
import * as hammerMotion from '../hammer-motion.js';
import * as characterProgression from '../character-progression.js';
import * as enemyReactions from '../enemy-reactions.js';
import * as combatFeedback from '../combat-feedback.js';
import * as occlusion from '../occlusion.js';
import * as kickPhysics from '../kick-physics.js';
import * as combatTools from '../combat-tools.js';
import * as geometryCollision from '../geometry-collision.js';
import * as menuModule from '../menu.js';
import * as destructionModule from '../destruction.js';

assert.equal(typeof vm.SourceTextModule, 'function', 'Use --experimental-vm-modules');
const browserErrors = [], audioEvents = [], listeners = new Map(), elements = new Map();
const timerCallbacks = new Map();
const viewport = { width: 1440, height: 900 };
const inputMedia = { coarse: false, anyCoarse: false };
const mediaListeners = new Map(), viewportListeners = new Map();
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
      if (key === 'fillText') return (text, x, y) => target.textCalls.push({ text: String(text), x, y, color:target.fillStyle });
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
    this.events = new Map(); this.width = 140; this.height = 140; this.capturedPointers = new Set();
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) { this.children.forEach(c => { c.parentNode = null; }); this.children = []; children.forEach(c => this.appendChild(c)); }
  get firstChild() { return this.children[0] || null; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
  setAttribute(name, value) {
    if (name === 'style') {
      this.style.cssText = String(value);
      for (const declaration of String(value).split(';')) {
        const colon = declaration.indexOf(':');
        if (colon > 0) this.style[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
      }
      return;
    }
    this[name] = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (name === 'class') { this.classList.values.clear(); this.classList.add(...String(value).split(/\s+/).filter(Boolean)); }
  }
  getAttribute(name) { return name === 'style' ? this.style.cssText ?? null : this[name] ?? null; }
  addEventListener(name, callback) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(callback); }
  getContext(type) { assert.equal(type, '2d'); return this.context ||= context2D(); }
  getBoundingClientRect() {
    const rect = { left: 0, top: 0, width: this.id === 'gameCanvas' ? viewport.width : 140, height: this.id === 'gameCanvas' ? viewport.height : 140, ...this.rect };
    return { x: rect.left, y: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height, ...rect };
  }
  setPointerCapture(id) { this.capturedPointers.add(id); }
  releasePointerCapture(id) { this.capturedPointers.delete(id); }
  hasPointerCapture(id) { return this.capturedPointers.has(id); }
  focus() { document.activeElement = this; }
  click() { if (!this.disabled) this.onclick?.({ target: this, preventDefault() {} }); }
}
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
for (const [, tag, id] of html.matchAll(/<([a-z0-9-]+)\b[^>]*\bid="([^"]+)"/gi)) elements.set(id, new Element(tag, id));
const dataKeys = new Map();
for (const [, tag, attrs] of html.matchAll(/<([a-z0-9-]+)\b([^>]*)>/gi)) {
  const key = attrs.match(/\bdata-key="([^"]+)"/)?.[1];
  const id = attrs.match(/\bid="([^"]+)"/)?.[1];
  if (!id && !key) continue;
  const el = (id && elements.get(id)) || new Element(tag);
  for (const [, name, value] of attrs.matchAll(/([a-z0-9:-]+)="([^"]*)"/gi)) el.setAttribute(name, value);
  if (key) { el.dataset.key = key; dataKeys.set(key, el); }
}
const document = {
  body: new Element('body'), activeElement: null, hidden: false,
  getElementById: id => elements.get(id) || null,
  createElement: tag => new Element(tag),
  querySelector: selector => { const m = selector.match(/^\[data-key="([^"]+)"\]$/); return m ? dataKeys.get(m[1]) || null : null; },
  querySelectorAll: selector => {
    if (selector === '[data-key]') return [...dataKeys.values()];
    const attribute = selector.match(/^\[([a-z0-9:-]+)\]$/i)?.[1];
    return attribute ? [...elements.values()].filter(el => el.getAttribute(attribute) !== null) : [];
  },
  addEventListener(name, callback) { if (!listeners.has('document:' + name)) listeners.set('document:' + name, []); listeners.get('document:' + name).push(callback); },
};
document.activeElement = document.body;
const window = {
  addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
};
const visualViewport = {
  width: viewport.width, height: viewport.height, offsetLeft: 0, offsetTop: 0, scale: 1,
  addEventListener(name, callback) { if (!viewportListeners.has(name)) viewportListeners.set(name, []); viewportListeners.get(name).push(callback); },
};
window.visualViewport = visualViewport;
function mediaMatches(query) {
  if (/any-pointer\s*:\s*coarse/.test(query)) return inputMedia.anyCoarse || inputMedia.coarse;
  if (/pointer\s*:\s*coarse/.test(query)) return inputMedia.coarse;
  return false;
}
function matchMedia(query) {
  return {
    media: query, get matches() { return mediaMatches(query); },
    addEventListener(name, callback) { if (name === 'change') { if (!mediaListeners.has(query)) mediaListeners.set(query, []); mediaListeners.get(query).push(callback); } },
    addListener(callback) { this.addEventListener('change', callback); },
  };
}
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
  play(name, power = 0, details = {}) { audioEvents.push({ name, power, details }); }
  setVolume(value) { this.volume = value; }
  toggle() { return this.muted = !this.muted; }
  update() {}
}
const sandbox = vm.createContext({
  console: { log: console.log, warn: console.warn, error: (...args) => browserErrors.push(args) },
  document, window, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
  matchMedia,
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
  ['./hammer-motion.js', synthetic(hammerMotion, 'real-hammer-motion')],
  ['./character-progression.js', synthetic(characterProgression, 'real-character-progression')],
  ['./enemy-reactions.js', synthetic(enemyReactions, 'real-enemy-reactions')],
  ['./combat-feedback.js', synthetic(combatFeedback, 'real-combat-feedback')],
  ['./occlusion.js', synthetic(occlusion, 'real-occlusion')],
  ['./kick-physics.js', synthetic(kickPhysics, 'real-kick-physics')],
  ['./combat-tools.js', synthetic(combatTools, 'real-combat-tools')],
  ['./destruction.js', synthetic(destructionModule, 'real-destruction')],
  ['./geometry-collision.js', synthetic(geometryCollision, 'real-geometry-collision')],
  ['./menu.js', synthetic(menuModule, 'real-menu')],
  ['./audio.js', synthetic({ GameAudio: StubAudio }, 'audio-test-surface')],
]);
const original = await readFile(new URL('../game.js', import.meta.url), 'utf8');
const testingExports = `
export const __integration = {
  get highestRound(){return highestRound;},get menuPresentation(){return menuPresentation;},openRounds,renderRoundPage,updateSavedCharacter,drawAim,
  get destruction(){return destruction;},
  get punch(){return punch;},get settings(){return settings;},get throwLock(){return throwLock;},get dashFollowup(){return dashFollowup;},
  beginPunch,punchImpact,startThrow,releaseHammer,settleThrownWeapon,catchHammer,chooseThrowLock,nextThrowTarget,pressAttack,releaseAttack,cancelAttack,
  get kick(){return kick;},get kickCooldown(){return kickCooldown;},get movingVehicles(){return movingVehicles;},startKick,kickImpact,updateMovingVehicles,advanceKickedEnemy,
  get phase(){return phase;}, get combatCombo(){return combatCombo;}, get comboXpCarry(){return comboXpCarry;}, get battleOccluders(){return battleOccluders;}, get heroSilhouette(){return heroSilhouette;}, get upgradeTab(){return upgradeTab;}, get comicState(){return comicState;}, get player(){return player;}, get world(){return world;},
  get enemies(){return enemies;}, get enemyFalls(){return enemyFalls;}, get drops(){return drops;}, get boss(){return boss;},
  get stats(){return stats;}, get levels(){return levels;}, get hero(){return hero;},
  get character(){return character;}, get characterStats(){return characterStats;}, get testRun(){return testRun;},
  get level(){return level;}, get xp(){return xp;}, get xpTarget(){return xpTarget;},
  get charge(){return charge;}, get swing(){return swing;}, get spin(){return spin;}, get facing(){return facing;},
  get elapsed(){return elapsed;}, get round(){return round;}, get relics(){return relics;},
  get kills(){return kills;}, get bolts(){return bolts;}, get score(){return score;},
  get scene(){return scene;}, get keys(){return keys;}, get pointer(){return pointer;},
  get touch(){return touch;}, get touchThrowAim(){return touchThrowAim;}, get touchThrowQueued(){return touchThrowQueued;},
  get camera(){return camera;}, get renderer(){return renderer;},
  get wave(){return wave;}, get sector(){return sector;},
  get upgradeQueue(){return upgradeQueue;}, get upgradePanelOpen(){return upgradePanelOpen;},
  get nearbyTargets(){return nearbyTargets;}, get focusedTarget(){return focusedTarget;},
  get stance(){return stance;}, get stanceTarget(){return stanceTarget;},
  get guarding(){return guarding;}, get guardRing(){return guardRing;}, get aim(){return aim;}, get aimPreview(){return aimPreview;},
  get leap(){return leap;}, get throwWindup(){return throwWindup;}, get throwFlight(){return throwFlight;},
  get throwCooldown(){return throwCooldown;}, get dashTime(){return dashTime;}, get dashCooldown(){return dashCooldown;}, dodge,
  get hammerLightning(){return hammerLightning;}, get hammerAura(){return hammerAura;},
  get hpEchoes(){return hpEchoes;}, get numbers(){return numbers;},
  buildingHudAnchor, recordCombatContact, updateComboDisplay, updateBattleVisibility, startGame, resetWorld, frame, pauseGame, setPhase, updatePlayer, updateEnemies,
  updateBoss, updateDrops, updateHUD, poseHero, spawnEnemy, spawnBoss, spawnDrop, hitEnemy,
  hurtObject, hurtPlayer, impact, beginSwing, defeatBoss, applyStats, openUpgrade,
  clearInput, hitBoss, checkGoal, updateAim, updateThrownHammer, shoot, drawFX,
  drawHP, screenPoint, updateEffects, beginWave, updateWaves, toggleUpgradePanel, resize,
  gainXP, forgeWeapon, renderCharacterProgress, persistCharacter, startLeap, armAirSmash, guardDimensions, guardContact,
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
function setViewport(width = 1440, height = 900, { coarse = false, anyCoarse = coarse, visualWidth = width, visualHeight = height } = {}) {
  const previousMatches = new Map([...mediaListeners.keys()].map(query => [query, mediaMatches(query)]));
  viewport.width = width; viewport.height = height;
  sandbox.innerWidth = width; sandbox.innerHeight = height;
  visualViewport.width = visualWidth; visualViewport.height = visualHeight;
  inputMedia.coarse = coarse; inputMedia.anyCoarse = anyCoarse;
  for (const [query, callbacks] of mediaListeners) if (previousMatches.get(query) !== mediaMatches(query)) {
    callbacks.forEach(callback => callback({ media: query, matches: mediaMatches(query) }));
  }
  emit('resize');
  for (const callback of viewportListeners.get('resize') || []) callback({ target: visualViewport });
}
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
function mouseGuard(down, props = {}) {
  const point = api.screenPoint(api.player.x + api.aim.x * 12, api.player.y + 1.2, api.player.z + api.aim.z * 12);
  return pointerEvent('gameCanvas', down ? 'pointerdown' : 'pointerup', {
    pointerId: 10, pointerType: 'mouse', button: 2, buttons: down ? 2 : 0,
    clientX: point.x, clientY: point.y, ...props,
  });
}
function chordButtons(buttons, props = {}) {
  // A mouse uses one pointer id. Additional pressed/released buttons are
  // reported as pointermove transitions rather than extra pointerdown/up.
  const point = heldMousePoint || api.screenPoint(api.player.x + api.aim.x * 12,
    api.player.y + 1.2, api.player.z + api.aim.z * 12);
  return pointerEvent('gameCanvas', 'pointermove', {
    pointerId: 10, pointerType: 'mouse', button: -1, buttons,
    clientX: point.x, clientY: point.y, ...props,
  });
}
function advance(seconds, step = 1 / 60) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= step) {
    time += Math.min(step, remaining) * 1000;
    api.frame(time);
  }
}
function reset(startLevel = 15, options = {test: true}) {
  heldMousePoint = null;api.settings.throwAutoLock=true;api.settings.throwMode='hold'; // Legacy release-to-throw regressions explicitly select the retained hold mode.
  // Existing combat regressions exercise the complete hammer kit. Ordinary
  // character progression is covered explicitly with reset(1, {test:false}).
  api.clearInput(); api.startGame(startLevel, options); advance(.1);
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
function arena(startLevel = 15, options = {test: true}) {
  reset(startLevel, options);
  // Keep real models, health, materials and disposal ownership, while moving
  // unrelated district geometry outside this isolated action's play area.
  api.world.objects.forEach((o, i) => { o.x = 500 + i * 10; o.z = 500; o.mesh.position.set(o.x, o.baseY, o.z); });
  api.world.rebuildSpatialIndex();
  for (const h of api.world.hazards) { h.x = 500; h.z = 500; }
  api.setFacing(0, 1); api.poseHero(.05); api.player.invincible = 0;
}
function touchArena(callback) {
  try {
    setViewport(390, 844, { coarse: true }); arena();
    // Representative phone controls: movement at the lower left and the
    // action finger at the lower right. Layout pixels are checked in-browser.
    elements.get('joystick').rect = { left: 18, top: 714, width: 112, height: 112 };
    callback();
  } finally {
    api.clearInput(); elements.get('joystick').rect = undefined;
    setViewport();
  }
}
function moveStick(type, horizontal = 0, vertical = 0, pointerId = 101) {
  const rect = elements.get('joystick').getBoundingClientRect(), radius = rect.width * .34;
  return pointerEvent('joystick', type, {
    pointerId, pointerType: 'touch', buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    clientX: rect.left + rect.width / 2 + horizontal * radius,
    clientY: rect.top + rect.height / 2 + vertical * radius,
  });
}
function throwTouch(type, dx = 0, dy = 0, pointerId = 202) {
  return pointerEvent('throwButton', type, {
    pointerId, pointerType: 'touch', clientX: 326 + dx, clientY: 746 + dy,
  });
}
function catchShortTouchThrow() {
  api.setFacing(0, 1); api.poseHero(1);
  const wall = placeObject('wall', 0, 3.4, { w: 5, d: .04, h: 3, hp: 1000, maxHp: 1000 });
  throwTouch('pointerdown'); throwTouch('pointerup');
  let projectile = null, returning = false;
  for (let i = 0; (api.throwWindup || api.throwFlight) && i < 240; i++) {
    api.updatePlayer(1 / 120);
    if (api.throwFlight) { projectile = api.throwFlight; returning ||= projectile.returning; }
  }
  assert.ok(projectile && returning, 'The setup must complete a real outward flight and collision return');
  assert.equal(api.throwFlight, null); assert.equal(api.throwWindup, null);
  assert.equal(api.hero.userData.weaponHeld, true);
  assert.ok(api.throwCooldown > .5, 'A near-wall catch leaves time to test the next gesture during recovery');
  return { wall, projectile };
}
function finishThrow(afterStep = () => {}, step = 1 / 120) {
  let projectile = api.throwFlight, returning = false;
  for (let time = 0; (api.throwWindup || api.throwFlight) && time < 5; time += step) {
    api.updatePlayer(step);
    if (api.throwFlight) {
      projectile ||= api.throwFlight;
      assert.equal(api.throwFlight, projectile, 'Bounces must steer one physical projectile');
      returning ||= projectile.returning;
      assert.ok([projectile.x, projectile.y, projectile.z].every(Number.isFinite));
      assert.equal(api.hero.userData.weaponHeld, false);
    }
    afterStep(projectile, step);
  }
  assert.ok(projectile && returning, 'The throw must enter a real return flight');
  assert.equal(api.throwWindup, null); assert.equal(api.throwFlight, null);
  assert.equal(api.hero.userData.weaponHeld, true);
  assert.equal(projectile.mesh.parent, null);
  assert.equal(api.scene.children.filter(child => child.userData.kind === 'hammer-projectile').length, 0);
  return projectile;
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
  if(['w','d','h'].some(key=>Object.hasOwn(options,key))){
    // These collision fixtures intentionally specify a box roof/wall. Author
    // the same visible box instead of lying about an unchanged townhouse mesh.
    api.scene.remove(object.mesh);
    const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(object.w,object.h,object.d),new THREE.MeshLambertMaterial({color:0x889999}));
    mesh.position.y=object.h/2;root.add(mesh);api.scene.add(root);object.mesh=root;object.baseY=0;object.baseRotation=new THREE.Euler();object.materials=[mesh.material];
  }
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
  assert.equal(api.settings.throwMode,'tap','New saves default to tap-aim / tap-confirm');
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
  assert.equal(dataKeys.get('KeyE')?.id, 'kickButton');
  assert.notEqual(dataKeys.get('Space'), elements.get('attackButton'));
  assert.ok(elements.has('a-mouse-left'));
  assert.ok(elements.has('a-mouse-right'));
  assert.equal(dataKeys.has('KeyQ'), false, 'The defense is pictured on the right mouse button');
  for (const id of ['power', 'size', 'range', 'speed', 'vitality', 'quake', 'kick']) assert.ok(elements.has('upgrade-' + id));
  for (const id of ['upgradesToggle', 'upgradePanel', 'upgradeChoices', 'pendingUpgradeCount', 'upgradeQueueText', 'waveEnemiesValue', 'waveStatus']) assert.ok(elements.has(id));
  assert.equal(elements.has('upgradeMenu'), false, 'The former blocking upgrade overlay is removed');
  assert.equal(elements.has('slamButton'), false, 'Air smash is a jump followed by attack, without a separate action button');
  assert.ok(elements.has('mobileStanceButton'), 'The touch armory retains access to the alternate hammer grip');
  assert.match(html, /id="upgradePanel" class="upgrade-drawer"/);
});

test('right mouse holds defense; Q stays unbound and E kicks without triggering defense', () => {
  arena();
  mouseGuard(true);
  playerSteps(.3);
  assert.equal(api.guarding, true);
  assert.equal(api.swing, null); assert.equal(api.spin, null); assert.equal(api.leap, null);
  mouseGuard(false); playerSteps(.03);
  assert.equal(api.guarding, false);
  key('KeyQ', true); playerSteps(.1); key('KeyQ', false);
  assert.equal(api.kick, null); assert.equal(api.guarding, false);
  key('KeyE', true); playerSteps(.1); key('KeyE', false);
  assert.ok(api.kick); assert.equal(api.guarding, false);
  assert.equal(api.swing, null); assert.equal(api.spin, null); assert.equal(api.leap, null);
  key('Space', true); key('Space', false);
  assert.ok(api.leap); assert.equal(api.leap.slam, false, 'Space alone starts a normal leap without arming the mouse attack');
});

test('wave one gives breathing room and enemies survive a single hit even from the test hammer', () => {
  reset(); advance(5.5);
  assert.equal(api.enemies.length, 0, 'The opening must allow time to learn the controls before the first spawn');
  advance(1);
  assert.equal(api.enemies.length, 2, 'The first wave arrives in its first scheduled batch of two');
  assert.equal(api.wave.number, 1); assert.equal(api.wave.total, 10); assert.equal(api.wave.spawned, 2);
  const enemy = api.enemies[0];
  assert.equal(enemy.type, 'zombie'); assert.ok(enemy.hp > api.stats.power);
  assert.ok(enemy.damage <= 6, 'A starter zombie should not retain the previous 11-damage attack');
  assert.ok(enemy.speed < api.stats.speed / 3);
  api.world.objects.forEach((o, i) => { o.x = 500 + i * 10; o.z = 500; o.mesh.position.set(o.x,o.baseY,o.z); });
  api.world.rebuildSpatialIndex();
  enemy.x = api.player.x; enemy.z = api.player.z + 2.3; enemy.speed = 0; enemy.state = 'idle';
  api.setFacing(0, 1); api.poseHero(1);
  mouseAttack(true); mouseAttack(false); playerSteps(.35);
  assert.equal(enemy.dead, false, 'Even the test hammer should register contact before the enemy falls');
  playerSteps(.12);mouseAttack(true);mouseAttack(false);playerSteps(.5);
  assert.equal(enemy.dead, true, 'The stronger test hammer defeats an opening zombie in two contacts');
  assert.equal(api.kills, 1);
});

test('stationary mouse aim directs a released left-click into a surviving brute', () => {
  arena();
  aimAt(0, 12); playerSteps(.1);
  const before = { x: api.player.x, z: api.player.z }, facing = { ...api.facing };
  close(before.x, 0); close(before.z, 0);
  assert.ok(facing.z > .9, 'A stationary warrior can still turn toward the mouse');
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

test('all eight WASD headings turn the warrior toward travel even with the mouse behind him', () => {
  arena();
  for (const [horizontal, vertical, codes] of [
    [1, 0, ['KeyD']], [-1, 0, ['KeyA']], [0, -1, ['KeyW']], [0, 1, ['KeyS']],
    [1, -1, ['KeyD', 'KeyW']], [-1, -1, ['KeyA', 'KeyW']],
    [1, 1, ['KeyD', 'KeyS']], [-1, 1, ['KeyA', 'KeyS']],
  ]) {
    const direction = core.screenMovement(horizontal, vertical);
    aimAt(api.player.x - direction.x * 12, api.player.z - direction.z * 12);
    playerSteps(.08);
    assert.ok(api.aim.x * direction.x + api.aim.z * direction.z < -.99);
    const start = { x: api.player.x, z: api.player.z };
    codes.forEach(code => key(code, true));
    playerSteps(.12, 1 / 120, () => {
      close(api.facing.x, direction.x); close(api.facing.z, direction.z);
      close(angleStep(Math.atan2(direction.x, direction.z), api.hero.rotation.y), 0, .001);
    });
    codes.forEach(code => key(code, false));
    const dx = api.player.x - start.x, dz = api.player.z - start.z;
    assert.ok(dx * direction.x + dz * direction.z > .6);
    close(dx * direction.z - dz * direction.x, 0, .001);
  }
});

test('a moving normal swing strikes along travel instead of turning sideways toward the mouse', () => {
  arena();
  const direction = core.screenMovement(1, 0);
  const point = api.screenPoint(-direction.x * 12, 1.2, -direction.z * 12);
  aimAt(-direction.x * 12, -direction.z * 12);
  key('KeyD', true); playerSteps(.04);
  const front = stationaryEnemy('brute', api.player.x + direction.x * 2.3, api.player.z + direction.z * 2.3);
  const behind = stationaryEnemy('brute', api.player.x - direction.x * 2.3, api.player.z - direction.z * 2.3);
  mouseAttack(true, { clientX: point.x, clientY: point.y });
  mouseAttack(false, { clientX: point.x, clientY: point.y });
  const strike = api.swing; assert.ok(strike);
  playerSteps(.4, 1 / 240, () => {
    close(api.facing.x, direction.x); close(api.facing.z, direction.z);
    close(angleStep(Math.atan2(direction.x, direction.z), api.hero.rotation.y), 0, .001);
  });
  key('KeyD', false);
  assert.equal(front.hp, front.maxHp - strike.damage);
  assert.equal(behind.hp, behind.maxHp, 'A normal strike must not aim backward at the cursor while walking forward');
});

test('changing movement direction during a swing immediately turns the body with the feet', () => {
  arena();
  key('KeyD', true); playerSteps(.03);
  mouseAttack(true); mouseAttack(false); playerSteps(.08);
  assert.ok(api.swing);
  key('KeyD', false); key('KeyW', true);
  const direction = core.screenMovement(0, -1);
  playerSteps(.1, 1 / 240, () => {
    close(api.facing.x, direction.x); close(api.facing.z, direction.z);
    close(angleStep(Math.atan2(direction.x, direction.z), api.hero.rotation.y), 0, .001);
  });
  key('KeyW', false);
});

test('a jump and a dodge face their travel direction despite an opposite mouse aim', () => {
  for (const code of ['Space', 'ShiftLeft']) {
    arena();
    const direction = core.screenMovement(1, 0);
    aimAt(-direction.x * 12, -direction.z * 12);
    key('KeyD', true); key(code, true); key(code, false); key('KeyD', false);
    playerSteps(.14, 1 / 120, () => {
      close(api.facing.x, direction.x); close(api.facing.z, direction.z);
      close(angleStep(Math.atan2(direction.x, direction.z), api.hero.rotation.y), 0, .001);
    });
    assert.ok(api.player.x * direction.x + api.player.z * direction.z > 1);
    close(api.player.x * direction.z - api.player.z * direction.x, 0, .001);
  }
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

test('a quick left-click connects during acceleration and completes its responsive 240 ms forehand', () => {
  arena(); api.poseHero(1);
  const enemy = stationaryEnemy('brute', 0, 2.3), hp = enemy.hp;
  mouseAttack(true); mouseAttack(false);
  const plannedDuration = api.swing.duration;
  close(plannedDuration, .24);
  let contactTime = null, duration = 0;
  while (api.swing && duration < .5) {
    api.updatePlayer(1 / 240); duration += 1 / 240;
    if (contactTime === null && enemy.hp < hp) contactTime = duration;
  }
  assert.notEqual(contactTime, null, 'A tap must connect with the forward target');
  assert.ok(contactTime <= plannedDuration * .4 + 1 / 240, `Tap contact took ${contactTime.toFixed(3)} seconds`);
  close(duration, plannedDuration, 1 / 240 + 1e-6);
  assert.equal(api.swing, null);
});

test('weighted swings move the torso and hammer vertically while every held grip stays attached', () => {
  for (const twoHanded of [false, true]) {
    arena();
    if (twoHanded) { key('KeyZ', true); key('KeyZ', false); playerSteps(1.08); }
    mouseAttack(true); mouseAttack(false);
    const u = api.hero.userData, headHeights = [], torsoTurns = [], torsoLeans = [];
    for (let frame = 0; api.swing && frame < 240; frame++) {
      api.updatePlayer(1 / 240);
      headHeights.push(worldPosition(u.hammerHead).y - api.player.y);
      torsoTurns.push(u.body.rotation.y); torsoLeans.push(u.body.rotation.x);
      close(worldPosition(u.rightGrip).distanceTo(worldPosition(u.rightGripAnchor)), 0);
      close(worldPosition(u.leftGrip).distanceTo(worldPosition(twoHanded ? u.leftGripAnchor : u.shieldGripAnchor)), 0);
    }
    assert.equal(api.swing, null, 'The weighted swing must settle and finish');
    assert.ok(Math.max(...headHeights) - Math.min(...headHeights) > .7,
      'The head must follow a raised-to-lowered arc instead of a flat horizontal sweep');
    assert.ok(Math.max(...torsoTurns) > .05 && Math.min(...torsoTurns) < -.05,
      'Wind-up and follow-through must visibly carry the torso across the strike');
    assert.ok(Math.max(...torsoLeans) - Math.min(...torsoLeans) > .1,
      'The body must transfer its weight with the strike');
  }
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

test('each hand mode keeps an independent six-move bag and a new run resets the opener', () => {
  arena();const names=[[],[]];
  for(let i=0;i<6;i++)for(const mode of [0,1]){
    if(api.stance!==mode){key('KeyZ',true);key('KeyZ',false);playerSteps(1.1);}
    mouseAttack(true);mouseAttack(false);assert.ok(api.swing);names[mode].push(api.swing.variant);
    assert.equal(api.swing.twoHanded,!!mode);playerSteps(api.swing.duration+.04);assert.equal(api.swing,null);
  }
  assert.deepEqual(new Set(names[0]),new Set(hammerMotion.HAMMER_COMBOS.oneHanded));
  assert.deepEqual(new Set(names[1]),new Set(hammerMotion.HAMMER_COMBOS.twoHanded));
  arena();mouseAttack(true);mouseAttack(false);assert.equal(api.swing.variant,'one-forehand');
});

test('an active combo stroke stays fixed and rejected recovery inputs do not skip the next stroke', () => {
  arena();
  const chain = hammerMotion.HAMMER_COMBOS.oneHanded;
  mouseAttack(true); mouseAttack(false);
  const first = api.swing; assert.equal(first.variant, chain[0]);
  playerSteps(.06);
  for (let i = 0; i < 3; i++) {
    mouseAttack(true); mouseAttack(false); api.beginSwing();
    key('KeyZ', true); key('KeyZ', false);
    playerSteps(.025);
    assert.equal(api.swing, first); assert.equal(first.variant, chain[0]);
    assert.equal(first.twoHanded, false); assert.equal(api.stanceTarget, 0);
  }
  const observed = new Set([first]);
  playerSteps(.8, 1 / 240, () => { if (api.swing) observed.add(api.swing); });
  assert.equal(observed.size,2,'Repeated inputs must queue only one actual stroke');
  assert.equal(new Set([...observed].map(s=>s.variant)).size,2);
  mouseAttack(true); mouseAttack(false);
  assert.ok(chain.includes(api.swing.variant));
  assert.ok(![...observed].some(s=>s.variant===api.swing.variant),'An unplayed stroke remains in the bag');
  playerSteps(.4);
});

test('every combo stroke hits close and forward enemies promptly once without damaging enemies behind', () => {
  const durations = {
    'one-forehand': .24, 'one-backhand': .27, 'one-diagonal': .32,
    'two-broadside': .30, 'two-cross': .34, 'two-overhead': .40,
    'one-overhead': .30, 'one-rising': .29, 'one-cross': .31, 'two-return': .29, 'two-rising': .33, 'two-cleave': .35,
  };
  for (const twoHanded of [false, true]) for (const sizeLevel of [0, 2]) for (const distance of [.9, 2.3]) {
    arena();
    if (twoHanded) { key('KeyZ', true); key('KeyZ', false); playerSteps(1.1); }
    api.levels.size = sizeLevel; api.applyStats(); api.poseHero(1);
    const front = stationaryEnemy('brute', 0, distance), rear = stationaryEnemy('brute', 0, -1.1);
    front.hp = front.maxHp = rear.hp = rear.maxHp = 10000;
    const chain = twoHanded ? hammerMotion.HAMMER_COMBOS.twoHanded : hammerMotion.HAMMER_COMBOS.oneHanded;
    const visited=new Set();
    for (let n=0;n<chain.length;n++) {
      const before = front.hp; let previousHp = before, changes = 0, contactTime = null, duration = 0;
      mouseAttack(true); mouseAttack(false);
      const strike = api.swing, variant=strike?.variant;assert.ok(chain.includes(variant));assert.ok(!visited.has(variant));visited.add(variant);
      close(strike.duration, durations[variant]);
      while (api.swing && duration < .85) {
        api.updatePlayer(1 / 240); duration += 1 / 240;
        assert.equal(strike.variant, variant);
        assert.equal(rear.hp, rear.maxHp,
          `${variant}, size ${sizeLevel}: rear contact at normalized time ${(strike.time / strike.duration).toFixed(3)}`);
        if (front.hp !== previousHp) { previousHp = front.hp; changes++; contactTime ??= duration; }
      }
      const label = `${variant}, size ${sizeLevel}, range ${distance}`;
      assert.equal(api.swing, null, label); assert.equal(changes, 1, `${label}: the stroke must connect exactly once`);
      assert.equal(front.hp, before - strike.damage, label);
      assert.equal(rear.hp, rear.maxHp, `${label}: a normal stroke must not become a full-circle attack`);
      assert.ok(contactTime <= durations[variant] * .4 + 1 / 120, `${label}: contact took ${contactTime} seconds`);
      close(duration, durations[variant], 1 / 240 + 1e-6);
      playerSteps(.04);
    }
  }
});

test('all combo angles including the overhead smash stop at a surviving wall before targets behind it', () => {
  for (const twoHanded of [false, true]) {
    arena();
    if (twoHanded) { key('KeyZ', true); key('KeyZ', false); playerSteps(1.1); }
    api.poseHero(1);
    const wall = placeObject('wall', 0, 1.7, { w: 5, d: .08, h: 3, hp: 10000, maxHp: 10000 });
    const enemy = stationaryEnemy('brute', 0, 2.9);
    const chain = twoHanded ? hammerMotion.HAMMER_COMBOS.twoHanded : hammerMotion.HAMMER_COMBOS.oneHanded;
    const visited=new Set();
    for (let n=0;n<chain.length;n++) {
      const before = wall.hp;
      mouseAttack(true); mouseAttack(false);
      const strike = api.swing, variant=strike?.variant;assert.ok(chain.includes(variant));assert.ok(!visited.has(variant));visited.add(variant);
      playerSteps(.45, 1 / 240);
      assert.equal(wall.hp, before - strike.damage, `${variant}: the blocking wall receives one physical hit`);
      assert.equal(enemy.hp, enemy.maxHp, `${variant}: the new angle must not damage through a solid wall`);
      assert.equal(strike.blocked, true, `${variant}: the visible swing must recoil at the surviving obstacle`);
    }
  }
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
  playerSteps(.10);
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
      mouseGuard(true); playerSteps(.1); mouseGuard(false);
    } else {
      pointerEvent('attackButton', 'pointerdown'); playerSteps(.02);
      pointerEvent('attackButton', 'pointercancel');
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
    close(api.facing.x, direction.x); close(api.facing.z, direction.z);
    close(angleStep(Math.atan2(direction.x, direction.z), api.hero.rotation.y), 0, .001);
    pointerEvent(id, 'pointercancel');
    const stopped = { x: api.player.x, z: api.player.z }; playerSteps(.1);
    close(api.player.x, stopped.x); close(api.player.z, stopped.z);
    assert.equal(api.keys.has(code), false);
  }
});

test('one attack control starts on press and holding flows into the pictured continuous spin', () => {
  arena();
  pointerEvent('attackButton', 'pointerdown'); pointerEvent('attackButton', 'pointerup');
  assert.ok(api.swing); assert.equal(api.swing.charged, false); assert.equal(api.spin, null);
  arena();
  pointerEvent('attackButton', 'pointerdown');
  assert.ok(api.swing, 'Pointer down commits a visible strike before release');
  playerSteps(.4);
  assert.ok(api.spin, 'Holding the same illustrated attack button continues into a spin');
  playerSteps(1.4);
  assert.ok(api.spin); assert.equal(api.swing, null);
  pointerEvent('attackButton', 'pointerup');
  assert.equal(api.spin, null); assert.equal(api.swing, null);
  playerSteps(.4); assert.equal(api.swing, null, 'Releasing the spin button must not charge or swing');
});

test('touch controls and accessible labels follow phone, landscape, tablet and desktop input modes', () => {
  try {
    arena();
    for (const [width, height, coarse, anyCoarse, expected] of [
      [390, 844, false, false, true], [844, 390, true, true, true],
      [1024, 768, false, true, true], [1440, 900, false, false, false],
    ]) {
      setViewport(width, height, { coarse, anyCoarse }); api.updateHUD(true);
      assert.equal(document.body.dataset.touchControls, String(expected));
      assert.equal(elements.get('touchControls').hidden, !expected);
      for (const id of ['attackButton', 'guardButton', 'leapButton', 'throwButton', 'stanceButton', 'dashButton']) {
        const button = elements.get(id), label = expected ? button.dataset.touchLabel : button.dataset.desktopLabel;
        assert.ok(label, `${id} needs an accessible description for the current control surface`);
        if (id === 'attackButton') {
          const dynamicLabel = button.getAttribute('aria-label');
          assert.ok(dynamicLabel.includes(api.characterStats.weaponName.toLowerCase()),
            'The action description must identify the actually equipped weapon');
          assert.match(dynamicLabel, /Χτύπημα.*Κράτα.*περιστροφή/);
          assert.equal(button.getAttribute('title'), dynamicLabel);
        } else {
          assert.equal(button.getAttribute('aria-label'), label);
          assert.equal(button.getAttribute('title'), label);
        }
      }
    }
    api.setPhase('paused'); assert.equal(elements.get('touchControls').hidden, true);
  } finally { api.clearInput(); setViewport(); }
});

test('the movement stick has a real deadzone, proportional walking speed and a capped full-speed edge', () => {
  touchArena(() => {
    const direction = core.screenMovement(1, 0), origin = { x: api.player.x, z: api.player.z };
    moveStick('pointerdown', .08, 0); playerSteps(.25);
    close(api.player.x, origin.x); close(api.player.z, origin.z);
    close(api.touch.x, 0); close(api.touch.y, 0);
    moveStick('pointermove', .56, 0); playerSteps(.25);
    const slow = Math.hypot(api.player.x - origin.x, api.player.z - origin.z);
    close(slow, api.stats.speed * .5 * .25, .002);
    close(api.facing.x, direction.x); close(api.facing.z, direction.z);
    const start = { x: api.player.x, z: api.player.z };
    moveStick('pointermove', 2, 0); playerSteps(.25);
    const fast = Math.hypot(api.player.x - start.x, api.player.z - start.z);
    close(fast, api.stats.speed * .25, .002); close(fast / slow, 2, .002);
    assert.ok(Math.hypot(api.touch.x, api.touch.y) <= 1);
    moveStick('pointermove', .05, -.05);
    const stopped = { x: api.player.x, z: api.player.z }; playerSteps(.2);
    close(api.player.x, stopped.x); close(api.player.z, stopped.z);
    moveStick('pointerup');
  });
});

test('a second finger cannot steal, steer or release an occupied movement stick', () => {
  touchArena(() => {
    moveStick('pointerdown', 1, 0, 101);
    assert.equal(elements.get('joystick').hasPointerCapture(101), true);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
      moveStick(type, -1, 0, 202); playerSteps(.02);
      assert.ok(api.touch.x > .99, `${type} from another finger must leave the first thumb in control`);
    }
    moveStick('pointermove', 0, -1, 101); playerSteps(.05);
    close(api.touch.x, 0); assert.ok(api.touch.y < -.99);
    moveStick('pointerup', 0, -1, 101);
    close(api.touch.x, 0); close(api.touch.y, 0);
    moveStick('pointermove', 1, 0, 101); playerSteps(.03);
    close(api.touch.x, 0); close(api.touch.y, 0);
    moveStick('pointerdown', -1, 0, 202); playerSteps(.05);
    assert.ok(api.touch.x < -.99, 'A fresh finger can take control after the old gesture ends');
  });
});

test('a moving thumb can tap a real hammer hit or trigger an aimed leap with another finger', () => {
  touchArena(() => {
    const direction = core.screenMovement(1, 0);
    moveStick('pointerdown', 1, 0); playerSteps(.04);
    const enemy = stationaryEnemy('brute', api.player.x + direction.x * 2.3, api.player.z + direction.z * 2.3), hp = enemy.hp;
    pointerEvent('attackButton', 'pointerdown', { pointerId: 202 });
    pointerEvent('attackButton', 'pointerup', { pointerId: 202 });
    const strike = api.swing; assert.ok(strike);
    playerSteps(.36);
    assert.equal(enemy.hp, hp - strike.damage, 'The touch action must deal the same swept-contact damage as a mouse swing');
    assert.ok(api.touch.x > .99, 'Releasing attack must leave the movement thumb active');
    close(api.facing.x, direction.x); close(api.facing.z, direction.z);
    pointerEvent('leapButton', 'pointerdown', { pointerId: 203 });
    pointerEvent('leapButton', 'pointerup', { pointerId: 203 });
    assert.ok(api.leap); close(api.leap.dir.x, direction.x); close(api.leap.dir.z, direction.z);
    playerSteps(.2); assert.ok(api.player.y > 3);
    assert.ok(api.touch.x > .99);
  });
});

test('mobile air smash requires a fresh attack during the jump and its one button follows the landing state', () => {
  touchArena(() => {
    api.updateHUD();
    assert.equal(elements.get('attackIcon').getAttribute('href'), '#a-swing');
    pointerEvent('attackButton', 'pointerdown', { pointerId: 202 }); playerSteps(.4);
    assert.ok(api.spin);
    pointerEvent('leapButton', 'pointerdown', { pointerId: 203 });
    pointerEvent('leapButton', 'pointerup', { pointerId: 203 }); playerSteps(.15);
    assert.ok(api.leap && api.player.y > 2); assert.equal(api.leap.slam, false);
    assert.equal(api.spin, null);
    // The preceding spin changes heading: place ground targets around this
    // actual forward jump, not along an assumed fixed world axis.
    const direction = api.leap.dir;
    const left = stationaryEnemy('brute', direction.x * 5.6 - direction.z * 2, direction.z * 5.6 + direction.x * 2);
    const right = stationaryEnemy('brute', direction.x * 5.6 + direction.z * 2, direction.z * 5.6 - direction.x * 2);
    const outside = stationaryEnemy('brute', direction.x * 5.6 + direction.z * 10, direction.z * 5.6 - direction.x * 10);
    const targets = [left, right], hp = targets.map(enemy => enemy.hp);
    pointerEvent('attackButton', 'pointerup', { pointerId: 202 });
    playerSteps(.12);
    assert.equal(api.leap.slam, false, 'A held input inherited from before takeoff must not arm the jump');
    api.updateHUD();
    assert.equal(elements.get('attackIcon').getAttribute('href'), '#a-slam');
    assert.equal(elements.get('attackButton').classList.contains('air-smash-ready'), true);
    assert.equal(elements.get('leapButton').classList.contains('airborne'), true);
    assert.match(elements.get('attackButton').getAttribute('aria-label'), /στον αέρα/);
    playerSteps(.2);
    pointerEvent('attackButton', 'pointerdown', { pointerId: 205 });
    playerSteps(.23);
    pointerEvent('attackButton', 'pointerup', { pointerId: 205 });
    assert.equal(api.leap.slam, true); assert.equal(api.swing, null);
    api.updateHUD();
    assert.equal(elements.get('attackButton').classList.contains('air-smash-armed'), true);
    assert.equal(elements.get('attackButton').classList.contains('air-smash-ready'), false);
    assert.deepEqual(targets.map(enemy => enemy.hp), hp, 'Arming the jump is not a ground hit');
    for (let i = 0; api.leap && i < 240; i++) {
      api.updatePlayer(1 / 120);
      if (api.leap) assert.deepEqual(targets.map(enemy => enemy.hp), hp);
    }
    assert.equal(api.leap, null);
    assert.ok(targets.every((enemy, i) => hp[i] - enemy.hp > api.stats.power * 2));
    assert.equal(outside.hp, outside.maxHp);
    const after = targets.map(enemy => enemy.hp); playerSteps(.4); api.updateHUD();
    assert.deepEqual(targets.map(enemy => enemy.hp), after, 'The landing applies its area damage once');
    assert.equal(elements.get('attackIcon').getAttribute('href'), '#a-swing');
    assert.equal(elements.get('attackName').textContent, 'ΣΦΥΡΙΑ');
    assert.equal(elements.get('attackButton').classList.contains('air-smash-armed'), false);
    assert.equal(elements.get('leapButton').classList.contains('airborne'), false);
    pointerEvent('attackButton', 'pointerdown', { pointerId: 206 });
    pointerEvent('attackButton', 'pointerup', { pointerId: 206 });
    assert.ok(api.swing); assert.equal(api.leap, null, 'An attack after landing is an ordinary swing');
  });
});

test('the mobile armory changes grip without pausing and the toolbar sound picture follows mute', () => {
  touchArena(() => {
    elements.get('upgradesToggle').click();
    assert.equal(api.upgradePanelOpen, true); assert.equal(api.phase, 'playing');
    for (const target of [1, 0]) {
      const before = api.stanceTarget;
      pointerEvent('mobileStanceButton', 'pointerdown', { pointerId: 202 });
      assert.equal(api.stanceTarget, before, 'Touching the scrollable drawer must not immediately change grip');
      pointerEvent('mobileStanceButton', 'pointermove', { pointerId: 202, clientY: 120 });
      pointerEvent('mobileStanceButton', 'pointercancel', { pointerId: 202 });
      assert.equal(api.stanceTarget, before, 'A scroll gesture must leave the current grip unchanged');
      elements.get('mobileStanceButton').click();
      assert.equal(api.stanceTarget, target); playerSteps(1.1); api.updateHUD();
      close(api.stance, target);
      assert.equal(elements.get('mobileStanceButton').getAttribute('aria-pressed'), String(target === 1));
      assert.equal(elements.get('mobileStanceValue').textContent, elements.get('stanceValue').textContent);
      assert.equal(api.phase, 'playing');
    }
    elements.get('upgradeCloseButton').click(); assert.equal(api.upgradePanelOpen, false);
    const mutedInitially = elements.get('soundButton').getAttribute('aria-pressed') === 'true';
    for (const muted of [!mutedInitially, mutedInitially]) {
      elements.get('soundButton').click();
      for (const id of ['soundButton', 'muteButton']) assert.equal(elements.get(id).getAttribute('aria-pressed'), String(muted));
      for (const id of ['soundIcon', 'muteIcon']) assert.equal(elements.get(id).getAttribute('href'), muted ? '#a-sound-off' : '#a-sound-on');
    }
  });
});

test('joystick movement and held spin or guard have independent owning fingers', () => {
  for (const [id, state, speed] of [['attackButton', 'spin', .84], ['guardButton', 'guarding', .55]]) {
    touchArena(() => {
      moveStick('pointerdown', 1, 0, 101);
      pointerEvent(id, 'pointerdown', { pointerId: 202 }); playerSteps(.4);
      assert.ok(api[state]);
      const origin={x:api.player.x,z:api.player.z};playerSteps(.3);
      close(Math.hypot(api.player.x-origin.x, api.player.z-origin.z), api.stats.speed * speed * .3, .003);
      pointerEvent(id, 'pointerdown', { pointerId: 303 });
      pointerEvent(id, 'pointerup', { pointerId: 303 }); playerSteps(.03);
      assert.ok(api[state], 'A different finger cannot release the held action');
      moveStick('pointerup', 1, 0, 101);
      const stopped = { x: api.player.x, z: api.player.z }; playerSteps(.1);
      close(api.player.x, stopped.x); close(api.player.z, stopped.z);
      assert.ok(api[state], 'Letting go of movement must not release the other thumb');
      pointerEvent(id, 'pointerup', { pointerId: 202 }); playerSteps(.04);
      assert.ok(!api[state]); assert.equal(api.swing, null);
    });
  }
});

test('touch cancellation, lost capture and releases outside the controls stop only their owned input', () => {
  for (const reason of ['pointercancel', 'lostpointercapture', 'outside']) {
    touchArena(() => {
      moveStick('pointerdown', 1, 0, 101);
      pointerEvent('attackButton', 'pointerdown', { pointerId: 202 }); playerSteps(.4);
      if (reason === 'outside') emit('pointerup', { pointerId: 101, pointerType: 'touch', target: document.body });
      else moveStick(reason, 1, 0, 101);
      close(api.touch.x, 0); close(api.touch.y, 0); assert.ok(api.spin);
      if (reason === 'outside') emit('pointerup', { pointerId: 202, pointerType: 'touch', target: document.body });
      else pointerEvent('attackButton', reason, { pointerId: 202 });
      assert.equal(api.spin, null); playerSteps(.4); assert.equal(api.swing, null);
      assert.equal(elements.get('attackButton').classList.contains('active'), false);
      moveStick('pointerdown', -1, 0, 303); assert.ok(api.touch.x < -.99);
    });
  }
});

test('pause, blur and a changed mobile viewport clear gesture ownership without replay on resume', () => {
  for (const reason of ['pause', 'blur', 'resize']) {
    touchArena(() => {
      moveStick('pointerdown', 1, 0, 101);
      pointerEvent('attackButton', 'pointerdown', { pointerId: 202 }); playerSteps(.4);
      if (reason === 'pause') api.pauseGame();
      else if (reason === 'blur') emit('blur');
      else setViewport(390, 780, { coarse: true });
      close(api.touch.x, 0); close(api.touch.y, 0); assert.equal(api.spin, null);
      assert.equal(elements.get('joystick').classList.contains('active'), false);
      assert.equal(elements.get('attackButton').classList.contains('active'), false);
      if (api.phase === 'paused') elements.get('resumeButton').click();
      const stopped = { x: api.player.x, z: api.player.z };
      moveStick('pointermove', 1, 0, 101);
      pointerEvent('attackButton', 'pointerup', { pointerId: 202 }); playerSteps(.35);
      close(api.player.x, stopped.x); close(api.player.z, stopped.z);
      assert.equal(api.spin, null); assert.equal(api.swing, null);
      moveStick('pointerdown', -1, 0, 303); playerSteps(.05);
      assert.ok(api.touch.x < -.99, 'A new touch must work immediately after cleanup');
    });
  }
});

test('an unchanged resize keeps a gesture active while Safari viewport changes resize the real renderer and camera', () => {
  touchArena(() => {
    moveStick('pointerdown', 1, 0, 101);
    pointerEvent('guardButton', 'pointerdown', { pointerId: 202 }); playerSteps(.05);
    emit('resize'); playerSteps(.03);
    assert.ok(api.touch.x > .99 && api.guarding, 'An unchanged size event must not drop both thumbs');
    visualViewport.height = 700;
    for (const callback of viewportListeners.get('resize') || []) callback({ target: visualViewport });
    assert.equal(api.renderer.width, 390); assert.equal(api.renderer.height, 700);
    close((api.camera.right - api.camera.left) / (api.camera.top - api.camera.bottom), 390 / 700);
    assert.equal(elements.get('fxCanvas').height, 700);
    assert.equal(document.body.style['--app-height'], '700px');
    close(api.touch.x, 0); close(api.touch.y, 0); assert.equal(api.guarding, false);
    setViewport(844, 390, { coarse: true });
    assert.equal(api.renderer.width, 844); assert.equal(api.renderer.height, 390);
    close((api.camera.right - api.camera.left) / (api.camera.top - api.camera.bottom), 844 / 390);
    assert.equal(document.body.dataset.touchControls, 'true');
  });
});

test('touch and pen gestures on the world aim without starting an accidental attack or spin', () => {
  for (const pointerType of ['touch', 'pen']) {
    touchArena(() => {
      const front = api.screenPoint(0, 1.2, 12), left = api.screenPoint(-12, 1.2, 0);
      pointerEvent('gameCanvas', 'pointerdown', { pointerId: 202, pointerType, button: 0, buttons: 1, clientX: front.x, clientY: front.y });
      playerSteps(.4); assert.ok(api.aim.z > .99);
      assert.equal(api.spin, null); assert.equal(api.swing, null);
      pointerEvent('gameCanvas', 'pointermove', { pointerId: 202, pointerType, buttons: 1, clientX: left.x, clientY: left.y });
      playerSteps(.1); assert.ok(api.aim.x < -.99);
      pointerEvent('gameCanvas', 'pointerup', { pointerId: 202, pointerType, buttons: 0, clientX: left.x, clientY: left.y });
      playerSteps(.3); assert.equal(api.spin, null); assert.equal(api.swing, null);
      const enemy = stationaryEnemy('brute', -2.3, 0), hp = enemy.hp;
      pointerEvent('attackButton', 'pointerdown', { pointerId: 303, pointerType });
      pointerEvent('attackButton', 'pointerup', { pointerId: 303, pointerType });
      const damage = api.swing.damage; playerSteps(.36);
      assert.equal(enemy.hp, hp - damage, 'A subsequent deliberate action must hit the manually aimed direction');
    });
  }
});

test('touch aiming converts client coordinates through a shifted or scaled canvas without losing the movement thumb', () => {
  touchArena(() => {
    try {
      elements.get('gameCanvas').rect = { left: 17, top: 53, width: 312, height: 675.2 };
      const projected = api.screenPoint(0, 1.2, 12), rect = elements.get('gameCanvas').getBoundingClientRect();
      moveStick('pointerdown', 1, 0, 101); playerSteps(.04);
      const current = api.screenPoint(api.player.x, api.player.y + 1.2, api.player.z + 12);
      pointerEvent('gameCanvas', 'pointerdown', { pointerId: 202, pointerType: 'touch', buttons: 1,
        clientX: rect.left + current.x * rect.width / 390, clientY: rect.top + current.y * rect.height / 844 });
      assert.ok(projected.inside); close(api.aim.x, 0, .002); assert.ok(api.aim.z > .99);
      playerSteps(.05); assert.ok(api.touch.x > .99);
      const walking = core.screenMovement(1, 0); close(api.facing.x, walking.x); close(api.facing.z, walking.z);
      pointerEvent('gameCanvas', 'pointerup', { pointerId: 202, pointerType: 'touch', buttons: 0 });
      assert.ok(api.touch.x > .99, 'Releasing an aim finger must not release the stick');
      assert.equal(api.swing, null); assert.equal(api.spin, null);
    } finally { elements.get('gameCanvas').rect = undefined; }
  });
});

test('a tap or tiny thumb wobble on the throw tile waits for release and throws along the current facing', () => {
  for (const wobble of [0, 6]) {
    touchArena(() => {
      api.setFacing(1, 0); api.poseHero(1);
      pointerEvent('throwButton', 'pointerdown', { pointerId: 202, clientX: 320, clientY: 740 });
      assert.ok(api.touchThrowAim); assert.equal(api.throwWindup, null); assert.equal(api.throwFlight, null);
      pointerEvent('throwButton', 'pointermove', { pointerId: 202, clientX: 320 - wobble, clientY: 740 });
      playerSteps(.2); assert.equal(api.throwWindup, null, 'Holding the tile alone must not prematurely throw');
      pointerEvent('throwButton', 'pointerup', { pointerId: 202, clientX: 320 - wobble, clientY: 740 });
      assert.equal(api.touchThrowAim, null); assert.ok(api.throwWindup);
      close(api.throwWindup.dir.x, 1); close(api.throwWindup.dir.z, 0);
      playerSteps(.29); assert.ok(api.throwFlight); assert.equal(api.hero.userData.weaponHeld, false);
    });
  }
});

test('a tap throw reads the movement thumb immediately without waiting for a rendered frame', () => {
  touchArena(() => {
    const direction = core.screenMovement(1, 0);
    api.setFacing(-direction.x, -direction.z); api.poseHero(1);
    moveStick('pointerdown', 1, 0, 101);
    pointerEvent('throwButton', 'pointerdown', { pointerId: 202, clientX: 320, clientY: 740 });
    pointerEvent('throwButton', 'pointerup', { pointerId: 202, clientX: 320, clientY: 740 });
    assert.ok(api.throwWindup);
    close(api.throwWindup.dir.x, direction.x); close(api.throwWindup.dir.z, direction.z);
  });
});

test('dragging the throw tile aims independently while walking and releases into a real enemy hit', () => {
  touchArena(() => {
    const walking = core.screenMovement(1, 0), throwing = core.screenMovement(-1, 0);
    const enemy = stationaryEnemy('brute', throwing.x * 5, throwing.z * 5), hp = enemy.hp;
    moveStick('pointerdown', 1, 0, 101); playerSteps(.05);
    pointerEvent('throwButton', 'pointerdown', { pointerId: 202, clientX: 320, clientY: 740 });
    pointerEvent('throwButton', 'pointermove', { pointerId: 202, clientX: 260, clientY: 740 });
    playerSteps(.2);
    assert.ok(api.touchThrowAim); assert.equal(api.throwWindup, null);
    assert.ok(api.aim.x * throwing.x + api.aim.z * throwing.z > .99);
    close(api.facing.x, walking.x); close(api.facing.z, walking.z);
    const beforeReturn = { ...api.aim };
    pointerEvent('throwButton', 'pointermove', { pointerId: 202, clientX: 320, clientY: 740 });
    playerSteps(.03);
    assert.ok(Number.isFinite(api.aim.x) && Number.isFinite(api.aim.z));
    assert.ok(api.aim.x * beforeReturn.x + api.aim.z * beforeReturn.z > .99, 'Returning to the drag origin must retain the last useful aim');
    emit('pointerup', { pointerId: 202, pointerType: 'touch', clientX: 320, clientY: 740, target: document.body });
    assert.ok(api.throwWindup); assert.equal(api.touchThrowAim, null);
    assert.ok(api.throwWindup.dir.x * throwing.x + api.throwWindup.dir.z * throwing.z > .99);
    playerSteps(.75);
    assert.equal(enemy.hp, hp - Math.round(api.stats.power * 2.2), 'The actual swept flying hammer must hit exactly once');
    assert.ok(api.touch.x > .99); close(api.facing.x, walking.x); close(api.facing.z, walking.z);
  });
});

test('a cancelled or interrupted touch throw cannot fire when its stale finger is released', () => {
  for (const reason of ['pointercancel', 'lostpointercapture', 'pause', 'blur', 'resize']) {
    touchArena(() => {
      pointerEvent('throwButton', 'pointerdown', { pointerId: 202, clientX: 320, clientY: 740 });
      pointerEvent('throwButton', 'pointermove', { pointerId: 202, clientX: 270, clientY: 700 });
      assert.ok(api.touchThrowAim);
      pointerEvent('throwButton', 'pointerup', { pointerId: 303, clientX: 270, clientY: 700 });
      assert.ok(api.touchThrowAim, 'Another finger cannot release an aimed throw');
      if (reason === 'pause') api.pauseGame();
      else if (reason === 'blur') emit('blur');
      else if (reason === 'resize') setViewport(390, 780, { coarse: true });
      else pointerEvent('throwButton', reason, { pointerId: 202 });
      assert.equal(api.touchThrowAim, null);
      if (api.phase === 'paused') elements.get('resumeButton').click();
      pointerEvent('throwButton', 'pointerup', { pointerId: 202, clientX: 270, clientY: 700 });
      playerSteps(.5);
      assert.equal(api.throwWindup, null); assert.equal(api.throwFlight, null);
      assert.equal(api.hero.userData.weaponHeld, true);
    });
  }
});

test('mobile throws in vertical and diagonal screen directions hit once, return, and restore a reusable hammer', () => {
  for (const [dx, dy, mode] of [
    [0, -60, 'still'], [0, 60, 'guard'], [-60, 0, 'moving'],
    [60, 0, 'spin'], [-50, -50, 'moving'], [50, 50, 'still'],
  ]) touchArena(() => {
    if (mode === 'moving') { moveStick('pointerdown', 1, 0); playerSteps(.05); }
    const priorAction = mode === 'guard' ? 'guardButton' : mode === 'spin' ? 'attackButton' : null;
    if (priorAction) { pointerEvent(priorAction, 'pointerdown', { pointerId: 303 }); playerSteps(.4); }
    throwTouch('pointerdown'); throwTouch('pointermove', dx, dy);
    assert.ok(api.touchThrowAim);
    assert.equal(api.spin, null); assert.equal(api.guarding, false);
    if (priorAction) pointerEvent(priorAction, 'pointerup', { pointerId: 303 });
    playerSteps(.08);
    const direction = { ...api.aim };
    const projectedOrigin = api.screenPoint(api.player.x, api.player.y + 1.2, api.player.z);
    const projectedTarget = api.screenPoint(api.player.x + direction.x * 6, api.player.y + 1.2, api.player.z + direction.z * 6);
    const screenDX = projectedTarget.x - projectedOrigin.x, screenDY = projectedTarget.y - projectedOrigin.y;
    assert.ok((screenDX * dx + screenDY * dy) / (Math.hypot(screenDX, screenDY) * Math.hypot(dx, dy)) > .999,
      'An off-center action thumb must aim along its drag, including vertical screen travel');
    const enemy = stationaryEnemy('brute', api.player.x + direction.x * 6.5, api.player.z + direction.z * 6.5), hp = enemy.hp;
    throwTouch('pointerup', dx, dy);
    throwTouch('lostpointercapture', dx, dy); // Native release also relinquishes pointer capture.
    assert.ok(api.throwWindup); assert.equal(api.touchThrowAim, null);
    close(api.throwWindup.dir.x, direction.x); close(api.throwWindup.dir.z, direction.z);
    let projectile = null, returning = false;
    playerSteps(2.4, 1 / 120, () => {
      const flyingMeshes = api.scene.children.filter(child => child.userData.kind === 'hammer-projectile');
      if (api.throwFlight) {
        projectile ||= api.throwFlight; assert.equal(api.throwFlight, projectile);
        returning ||= projectile.returning;
        assert.ok([projectile.x, projectile.y, projectile.z].every(Number.isFinite));
        assert.equal(flyingMeshes.length, 1); assert.equal(api.hero.userData.weaponHeld, false);
      } else assert.equal(flyingMeshes.length, 0);
    });
    assert.ok(projectile && returning); assert.equal(api.throwFlight, null);
    assert.equal(enemy.hp, hp - Math.round(api.stats.power * 2.2), 'Outbound collision and return together must damage the target once');
    assert.equal(projectile.mesh.parent, null);
    assert.equal(api.hero.userData.weaponHeld, true); assert.equal(api.hero.userData.hammerPivot.visible, true);
    assert.equal(api.hero.userData.leftGrip.visible, true); assert.equal(api.hero.userData.rightGrip.visible, true);
    if (mode === 'moving') assert.ok(api.touch.x > .99, 'Catching the hammer must not release the movement thumb');
    throwTouch('pointerdown'); throwTouch('pointerup');
    assert.ok(api.throwWindup, 'The caught hammer must be available for another deliberate throw');
  });
});

test('a mobile throw blocked beside the warrior damages the close wall once and returns without hitting through it', () => {
  touchArena(() => {
    api.setFacing(0, 1); api.poseHero(1);
    const wall = placeObject('wall', 0, .8, { w: 5, d: .04, h: 3, hp: 1000, maxHp: 1000 });
    const enemy = stationaryEnemy('robot', 0, 7), hp = enemy.hp;
    api.updateAim(); assert.equal(api.aimPreview.contact?.target, wall);
    throwTouch('pointerdown'); throwTouch('pointerup');
    let returned = false;
    playerSteps(1.8, 1 / 120, () => { returned ||= !!api.throwFlight?.returning; });
    assert.equal(returned, true); assert.equal(api.throwFlight, null);
    assert.equal(wall.hp, 1000 - Math.round(api.stats.power * 2.2));
    assert.equal(enemy.hp, hp, 'A projectile already touching a wall must not escape to the enemy beyond it');
    assert.equal(api.hero.userData.weaponHeld, true);
  });
});

test('a mobile throw passes below elevated enemies before a physical ground hit can begin an upward bounce', () => {
  touchArena(() => {
    api.setFacing(0, 1); api.poseHero(1);
    const high = stationaryEnemy('brute', 0, 5), ground = stationaryEnemy('brute', 0, 9);
    high.y = 8; high.mesh.position.y = 8;
    const unreachable = stationaryEnemy('brute', -4, 6);
    unreachable.y = 24; unreachable.mesh.position.y = 24;
    const hp = ground.hp;
    api.updateAim(); assert.equal(api.aimPreview.contact?.target, ground);
    throwTouch('pointerdown'); throwTouch('pointerup');
    const hits = [], priorHP = new Map([[ground, ground.hp], [high, high.hp]]);
    finishThrow(() => {
      for (const enemy of [ground, high]) if (enemy.hp !== priorHP.get(enemy)) {
        hits.push(enemy); priorHP.set(enemy, enemy.hp);
      }
      if (ground.hp === hp) assert.equal(high.hp, high.maxHp, 'The first straight leg must pass below the elevated collider');
    });
    assert.deepEqual(hits, [ground, high], 'Only a completed ground hit may redirect the weapon upward');
    assert.equal(ground.hp, hp - Math.round(api.stats.power * 2.2));
    assert.equal(high.hp, high.maxHp - Math.round(api.stats.power * 2.2));
    assert.equal(unreachable.hp, unreachable.maxHp, 'An enemy outside the 3D chain reach must not receive an automatic hit');
    assert.equal(api.throwFlight, null); assert.equal(api.hero.userData.weaponHeld, true);
  });
});

test('a mobile throw bends through three distinct enemies once and returns the same hammer', () => {
  touchArena(() => {
    api.setFacing(0, 1); api.poseHero(1);
    const targets = [[0, 6], [4, 8], [-2, 11]].map(([x, z]) => stationaryEnemy('brute', x, z));
    const hp = targets.map(enemy => enemy.hp), changes = targets.map(() => 0), priorHP = [...hp];
    const contactOrder = [], headings = [];
    throwTouch('pointerdown'); throwTouch('pointerup');
    const projectile = finishThrow(h => {
      for (const [i, enemy] of targets.entries()) if (enemy.hp !== priorHP[i]) {
        changes[i]++; priorHP[i] = enemy.hp; contactOrder.push(enemy);
      }
      if (api.throwFlight && !h.returning) headings.push(Math.atan2(h.dir.x, h.dir.z));
    });
    assert.deepEqual(changes, [1, 1, 1]);
    assert.equal(new Set(contactOrder).size, 3); assert.equal(contactOrder[0], targets[0]);
    const damage = Math.round(api.stats.power * 2.2);
    assert.deepEqual(targets.map(enemy => enemy.hp), hp.map(value => value - damage));
    assert.ok(Math.max(...headings) - Math.min(...headings) > 1,
      'Enemies off the original ray must be reached by visibly different flight headings');
    assert.equal(projectile.hitCount, 3); assert.equal(projectile.bounces, 2);
    const caughtHP = targets.map(enemy => enemy.hp); playerSteps(.5);
    assert.deepEqual(targets.map(enemy => enemy.hp), caughtHP, 'Returning and catching cannot repeat outbound damage');
  });
});

test('a ricochet stops after five distinct hits even when more living enemies are within reach', () => {
  arena(); api.poseHero(1);
  const targets = [[0, 6], [4, 7], [7, 10], [4, 13], [0, 13], [-4, 10], [-4, 6]]
    .map(([x, z]) => stationaryEnemy('brute', x, z));
  targets.forEach(enemy => { enemy.hp = enemy.maxHp = 1000; });
  const priorHP = targets.map(enemy => enemy.hp), changes = targets.map(() => 0);
  aimAt(0, 12); key('KeyR', true); key('KeyR', false);
  const projectile = finishThrow(() => {
    targets.forEach((enemy, i) => {
      if (enemy.hp !== priorHP[i]) { changes[i]++; priorHP[i] = enemy.hp; }
    });
  });
  assert.equal(targets.filter(enemy => enemy.hp < enemy.maxHp).length, 5);
  assert.equal(targets.filter(enemy => enemy.hp === enemy.maxHp).length, 2);
  assert.ok(changes.every(count => count === 0 || count === 1), 'No visited enemy may consume a second chain hit');
  for (const enemy of targets.filter(enemy => enemy.hp < enemy.maxHp)) {
    assert.equal(enemy.maxHp - enemy.hp, Math.round(api.stats.power * 2.2));
  }
  assert.equal(projectile.hitCount, 5); assert.equal(projectile.bounces, 4);
});

test('a surviving wall prevents a chain from acquiring the enemy on its far side', () => {
  arena(); api.poseHero(1);
  const first = stationaryEnemy('brute', 0, 6), screened = stationaryEnemy('brute', 5, 6);
  const wall = placeObject('wall', 2.8, 6, { w: .08, d: 7, h: 4, hp: 1000, maxHp: 1000 });
  aimAt(0, 12); assert.equal(api.aimPreview.contact?.target, first);
  key('KeyR', true); key('KeyR', false);
  const projectile = finishThrow();
  assert.equal(first.hp, first.maxHp - Math.round(api.stats.power * 2.2));
  assert.equal(screened.hp, screened.maxHp, 'The bounce must not damage through a blocking wall');
  assert.equal(wall.hp, wall.maxHp, 'Rejecting a blocked bounce must not create a distant wall impact');
  assert.equal(projectile.hitCount, 1); assert.equal(projectile.bounces, 0);
});

test('a dead ricochet target is replaced when possible and otherwise causes a clean return', () => {
  for (const hasReplacement of [true, false]) {
    arena(); api.poseHero(1);
    const first = stationaryEnemy('brute', 0, 6), doomed = stationaryEnemy('brute', 3, 8);
    const replacement = hasReplacement ? stationaryEnemy('brute', -3, 10) : null;
    aimAt(0, 12); key('KeyR', true); key('KeyR', false);
    for (let i = 0; (!api.throwFlight || api.throwFlight.hitCount === 0) && i < 240; i++) api.updatePlayer(1 / 120);
    const projectile = api.throwFlight;
    assert.ok(projectile); assert.equal(projectile.chainTarget, doomed);
    api.hitEnemy(doomed, 99999, { x: 0, z: 1 }, 0, 0);
    assert.equal(doomed.dead, true);
    const completed = finishThrow(); assert.equal(completed, projectile);
    assert.equal(first.hp, first.maxHp - Math.round(api.stats.power * 2.2));
    assert.equal(projectile.hits.has(doomed), false, 'Removing a target must not count as a projectile hit');
    assert.equal(projectile.hitCount, hasReplacement ? 2 : 1);
    if (replacement) assert.equal(replacement.hp, replacement.maxHp - Math.round(api.stats.power * 2.2));
  }
});

test('a returning hammer catches the moving hand without changing the player position or duplicating the weapon', () => {
  arena(); api.poseHero(1); aimAt(0, 16);
  key('KeyR', true); key('KeyR', false);
  for (let i = 0; !api.throwFlight?.returning && i < 240; i++) api.updatePlayer(1 / 120);
  const projectile = api.throwFlight; assert.ok(projectile?.returning);
  const start = { x: api.player.x, z: api.player.z }, direction = core.screenMovement(1, 0);
  key('KeyD', true);
  let priorPlayer = { ...start }, moved = 0, catchDistance = null;
  const completed = finishThrow((h, dt) => {
    const step = Math.hypot(api.player.x - priorPlayer.x, api.player.z - priorPlayer.z);
    close(step, api.stats.speed * dt, .0001);
    assert.ok((api.player.x - priorPlayer.x) * direction.x + (api.player.z - priorPlayer.z) * direction.z > 0);
    moved += step; priorPlayer = { x: api.player.x, z: api.player.z };
    if (!api.throwFlight) catchDistance = h.mesh.position.distanceTo(api.hero.userData.getThrowCenterWorld(new THREE.Vector3()));
  });
  key('KeyD', false);
  assert.equal(completed, projectile); assert.ok(moved > 1);
  close(catchDistance, 0, 1e-6);
  assert.equal(api.hero.userData.hammerPivot.visible, true);
  close(worldPosition(api.hero.userData.rightGrip).distanceTo(worldPosition(api.hero.userData.rightGripAnchor)), 0);
});

test('a successful catch lights only the hammer, expires cleanly, and never expands weapon collision bounds', () => {
  arena(); api.poseHero(1);
  const u = api.hero.userData;
  const materials = root => {
    const found = new Set();
    root.traverse(node => {
      if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) found.add(material);
    });
    return [...found];
  };
  const weapon = materials(u.hammerPivot), body = materials(u.body), baseline = new Map();
  for (const material of [...weapon, ...body]) if (material.emissive) baseline.set(material, material.emissive.clone());
  assert.ok(weapon.every(material => !body.includes(material)), 'Weapon emission needs materials independent of the armor');
  const radius = u.getThrowRadius(), aura = api.hammerAura, geometry = aura.bolts.geometry;
  assert.equal(aura.root.parent, api.scene); assert.equal(aura.root.visible, false);
  aimAt(0, 16); key('KeyR', true); key('KeyR', false);
  let projectileVisuals = null;
  const projectile = finishThrow(h => {
    if (h && !projectileVisuals) {
      projectileVisuals = []; h.mesh.traverse(node => projectileVisuals.push(node));
    }
  });
  assert.ok(projectileVisuals.every(node => !node.isSprite && !node.isLine), 'The thrown weapon must not clone its aura');
  close(projectile.radius, radius); close(u.getThrowRadius(), radius);
  assert.ok(api.hammerLightning > 2); assert.equal(aura.root.visible, true);
  assert.ok(aura.glow.material.opacity > 0 && aura.bolts.material.opacity > 0);
  assert.ok(weapon.some(material => material.emissive && !material.emissive.equals(baseline.get(material))));
  for (const material of body) if (material.emissive) assert.ok(material.emissive.equals(baseline.get(material)));
  const firstPattern = Array.from(aura.bolts.geometry.attributes.position.array);
  advance(.15);
  assert.notDeepEqual(Array.from(aura.bolts.geometry.attributes.position.array), firstPattern,
    'Lightning must animate through the actual frame loop');
  assert.equal(aura.bolts.geometry, geometry, 'Catch effects must reuse the fixed geometry pool');
  close(u.getThrowRadius(), radius);
  advance(3);
  assert.equal(api.hammerLightning, 0); assert.equal(aura.root.visible, false);
  for (const material of weapon) if (material.emissive) assert.ok(material.emissive.equals(baseline.get(material)), 'The glow must restore its material baseline');
  aimAt(0, 16); key('KeyR', true); key('KeyR', false); playerSteps(.3);
  assert.ok(api.throwFlight);
  const interrupted = api.throwFlight; api.startGame(15, {test: true}); api.updateHUD();
  assert.equal(interrupted.mesh.parent, null); assert.equal(api.hammerLightning, 0);
  assert.equal(aura.root.visible, false); assert.equal(elements.get('throwButton').classList.contains('lightning-ready'), false);
});

test('holding a mobile throw keeps a steady ready stance while walking and cancels without a stale release', () => {
  touchArena(() => {
    moveStick('pointerdown', 1, 0, 101);
    throwTouch('pointerdown'); throwTouch('pointermove', -60, 0);
    const direction = { ...api.aim }, u = api.hero.userData, samples = [];
    const firstPosition = new THREE.Vector3(api.player.x, api.player.y, api.player.z);
    playerSteps(.85, 1 / 120, () => {
      assert.equal(api.throwWindup, null); assert.equal(api.throwFlight, null);
      if (api.touchThrowAim.channelTime > .15) {
        const vector = worldPosition(u.hammerHead).sub(worldPosition(u.hammerPivot));
        samples.push({ y: vector.y, along: vector.x * direction.x + vector.z * direction.z });
        assert.ok(vector.length()>1,'The complete weapon remains attached while aiming');
      }
      close(worldPosition(u.rightGrip).distanceTo(worldPosition(u.rightGripAnchor)), 0);
    });
    assert.ok(api.touchThrowAim?.channeling);
    assert.ok(new THREE.Vector3(api.player.x, api.player.y, api.player.z).distanceTo(firstPosition) > 3);
    assert.ok(Math.min(...samples.map(p => p.y)) > 0,'Ready stance does not spin through the legs');
    assert.ok(Math.max(...samples.map(p => p.y))-Math.min(...samples.map(p => p.y)) < .15,'Aiming settles into a readable pose rather than an endless orbit');
    assert.equal(api.hammerAura.root.visible, true); assert.equal(api.hammerLightning, 0);
    throwTouch('pointercancel', -60, 0); playerSteps(.15);
    assert.equal(api.touchThrowAim, null); assert.equal(api.hammerAura.root.visible, false);
    assert.ok(api.touch.x > .99, 'Cancelling the throw must preserve the movement thumb');
    throwTouch('pointerup', -60, 0); playerSteps(.5);
    assert.equal(api.throwWindup, null); assert.equal(api.throwFlight, null); assert.equal(api.hammerLightning, 0);
    close(u.weaponRig.quaternion.angleTo(new THREE.Quaternion().setFromEuler(
      new THREE.Euler(u.weaponRest.x, u.weaponRest.y, u.weaponRest.z))), 0, 1e-6);
    moveStick('pointerup', 0, 0, 101);
  });
});

test('holding the next mobile aim through cooldown or a returning hammer does not discard the eventual release', () => {
  for (const recovery of ['cooldown', 'return']) touchArena(() => {
    if (recovery === 'cooldown') catchShortTouchThrow();
    else {
      throwTouch('pointerdown'); throwTouch('pointerup');
      for (let i = 0; !api.throwFlight?.returning && i < 240; i++) api.updatePlayer(1 / 120);
      assert.ok(api.throwFlight?.returning);
    }
    assert.ok(api.throwCooldown > 0 || api.throwFlight);
    throwTouch('pointerdown'); throwTouch('pointermove', 0, -65);
    assert.ok(api.touchThrowAim, 'A throw finger begun during recovery must retain gesture ownership');
    const direction = { ...api.aim };
    playerSteps(1.5);
    assert.equal(api.throwFlight, null); assert.equal(api.throwWindup, null);
    close(api.throwCooldown, 0); assert.ok(api.touchThrowAim);
    assert.equal(api.hero.userData.weaponHeld, true, 'Holding the next aim must not auto-launch at readiness');
    throwTouch('pointerup', 0, -65); throwTouch('lostpointercapture', 0, -65);
    assert.ok(api.throwWindup);
    close(api.throwWindup.dir.x, direction.x, .001); close(api.throwWindup.dir.z, direction.z, .001);
    playerSteps(.29); assert.ok(api.throwFlight);
    playerSteps(2); assert.equal(api.throwFlight, null); assert.equal(api.hero.userData.weaponHeld, true);
  });
});

test('a mobile release just before readiness launches once with its saved direction after native capture loss', () => {
  touchArena(() => {
    catchShortTouchThrow(); playerSteps(api.throwCooldown - .1);
    throwTouch('pointerdown'); throwTouch('pointermove', -55, -35);
    const direction = { ...api.aim }, swingsBefore = audioEvents.filter(event => event.name === 'swing').length;
    // Safari can dispatch release outside the button, followed by capture loss.
    emit('pointerup', { pointerId: 202, pointerType: 'touch', clientX: 271, clientY: 711, target: document.body });
    throwTouch('lostpointercapture', -55, -35);
    assert.ok(api.touchThrowQueued); assert.equal(api.throwWindup, null);
    moveStick('pointerdown', 1, 0); playerSteps(.13);
    assert.equal(api.touchThrowQueued, null); assert.ok(api.throwWindup);
    close(api.throwWindup.dir.x, direction.x); close(api.throwWindup.dir.z, direction.z);
    playerSteps(2.4);
    assert.equal(audioEvents.filter(event => event.name === 'swing').length - swingsBefore, 1);
    assert.equal(api.throwFlight, null); assert.equal(api.hero.userData.weaponHeld, true);
    assert.ok(api.touch.x > .99);
  });
});

test('an early mobile throw release expires instead of firing unexpectedly after a long cooldown', () => {
  touchArena(() => {
    catchShortTouchThrow();
    const swingsBefore = audioEvents.filter(event => event.name === 'swing').length;
    throwTouch('pointerdown'); throwTouch('pointermove', 0, -60); throwTouch('pointerup', 0, -60);
    assert.ok(api.touchThrowQueued);
    playerSteps(.35);
    assert.equal(api.touchThrowQueued, null); assert.ok(api.throwCooldown > 0);
    playerSteps(1.5);
    assert.equal(api.throwWindup, null); assert.equal(api.throwFlight, null);
    assert.equal(audioEvents.filter(event => event.name === 'swing').length, swingsBefore);
    assert.equal(api.hero.userData.weaponHeld, true);
  });
});

test('interruption or a new combat choice cancels a pending mobile throw before it can replay', () => {
  for (const reason of ['pause', 'blur', 'resize', 'attackButton', 'guardButton', 'leapButton', 'mobileStanceButton']) touchArena(() => {
    catchShortTouchThrow(); playerSteps(api.throwCooldown - .12);
    throwTouch('pointerdown'); throwTouch('pointermove', 60, 0); throwTouch('pointerup', 60, 0);
    assert.ok(api.touchThrowQueued);
    if (reason === 'pause') api.pauseGame();
    else if (reason === 'blur') emit('blur');
    else if (reason === 'resize') setViewport(390, 780, { coarse: true });
    else if (reason === 'mobileStanceButton') elements.get(reason).click();
    else { pointerEvent(reason, 'pointerdown', { pointerId: 303 }); pointerEvent(reason, 'pointerup', { pointerId: 303 }); }
    assert.equal(api.touchThrowQueued, null, `${reason} must abandon the previous released throw`);
    if (api.phase === 'paused') elements.get('resumeButton').click();
    throwTouch('pointerup', 60, 0); playerSteps(.5);
    assert.equal(api.throwWindup, null); assert.equal(api.throwFlight, null);
    assert.equal(api.hero.userData.weaponHeld, true);
  });
});

test('a boosted mobile run keeps manual throw guidance aligned with the captured launch direction during windup', () => {
  touchArena(() => {
    api.settings.throwAutoLock=false; // Explicit manual aiming mode added in combat7.
    api.levels.speed = 3; api.applyStats();
    const screenRight = core.screenMovement(1, 0);
    stationaryEnemy('zombie', screenRight.x * 7, screenRight.z * 7);
    moveStick('pointerdown', 0, 1);
    throwTouch('pointerdown'); throwTouch('pointermove', 65, 0); throwTouch('pointerup', 65, 0);
    const direction = { ...api.throwWindup.dir };
    assert.equal(api.pointer.active, false, 'The released virtual pointer must not continue steering from a stale screen coordinate');
    for (let i = 0; i < 15; i++) {
      advance(1 / 60); assert.ok(api.throwWindup);
      close(api.aim.x, direction.x); close(api.aim.z, direction.z);
      const preview = api.aimPreview;
      const dx = preview.end.x - preview.start.x, dz = preview.end.z - preview.start.z;
      if (Math.hypot(dx, dz) > .001) {
        close(dx / Math.hypot(dx, dz), direction.x, .001);
        close(dz / Math.hypot(dx, dz), direction.z, .001);
      }
    }
    playerSteps(.05); assert.ok(api.throwFlight);
    close(api.throwFlight.dir.x, direction.x); close(api.throwFlight.dir.z, direction.z);
    playerSteps(2); assert.equal(api.throwFlight, null); assert.equal(api.hero.userData.weaponHeld, true);
  });
});

test('holding the left mouse button continuously rotates the whole warrior and extended hammer through more than two full turns', () => {
  arena(); api.poseHero(1);
  mouseAttack(true); playerSteps(.4);
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
  assert.ok(bodyTravel < -Math.PI * 4, `The body rotated only ${(bodyTravel / Math.PI / 2).toFixed(2)} turns`);
  close(bodyTravel, -2.1 / .52 * Math.PI * 2, .025);
  close(headTravel, bodyTravel, .15);
  assert.ok(minimumRadius > 1.8, 'The hammer must extend visibly out from the spinning warrior');
  assert.ok(poses.size > 180 && largestStep < .15, 'Body and hammer need continuous poses, not a frame swap');
  assert.ok(api.spin, 'The spin must not stop automatically after a fixed number of turns');
  mouseAttack(false);
});

test('WASD remains directional and continuous while the warrior spins independently', () => {
  arena(); api.poseHero(1);
  pointerEvent('attackButton', 'pointerdown'); playerSteps(.4);
  const start = { x: api.player.x, z: api.player.z }, direction = core.screenMovement(1, 0);
  key('KeyD', true); playerSteps(1); key('KeyD', false);
  const dx = api.player.x - start.x, dz = api.player.z - start.z;
  close(dx * direction.z - dz * direction.x, 0, .001);
  close(Math.hypot(dx, dz), api.stats.speed * .84, .01);
  assert.ok(api.spin, 'Changing walking direction must not cancel the held spin');
  pointerEvent('attackButton', 'pointerup');
});

test('a sustained spin hits real targets on every side no more than once per revolution', () => {
  arena(); api.poseHero(1);
  mouseAttack(true); playerSteps(.4);
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
    assert.ok(hits.length >= 4 && hits.length <= 5, `Side ${index} received ${hits.length} hits over 2.3 seconds`);
    for (let i = 1; i < hits.length; i++) {
      assert.ok(hits[i] - hits[i - 1] >= .52 - 1 / 240 - 1e-7, 'A target must not be hit twice at the turn boundary');
      assert.ok(hits[i] - hits[i - 1] <= .56, 'Each subsequent physical revolution should reconnect');
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
  // Once stationary, spin recovery returns to the mouse-facing direction.
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
    pointerEvent('attackButton', 'pointerdown'); playerSteps(.05);
    assert.equal(api.spin, activeSpin, 'A second input source must not reset the existing spin');
    assert.equal(enemy.hp, afterContact, 'Repeated start requests must not bypass the revolution cooldown');
  }
  assert.ok(activeSpin.time >= startedAt + .15 - 1e-7);
  pointerEvent('attackButton', 'pointerup'); mouseAttack(false);
  assert.equal(api.spin, null); assert.equal(api.swing, null);
});

test('RMB, Space, R and Z cancel a held spin and carry out their own actions without restarting it', () => {
  for (const action of ['RMB', 'Space', 'KeyR', 'KeyZ']) {
    arena(); mouseAttack(true); playerSteps(.3); assert.ok(api.spin);
    if (action === 'RMB') chordButtons(3, { button: 2 });
    else {key(action, true);if(action==='KeyR')key(action,false);}
    api.updatePlayer(.01);
    assert.equal(api.spin, null, `${action} must cancel the old spin`);
    if (action === 'RMB') assert.equal(api.guarding, true);
    if (action === 'Space') { assert.ok(api.leap); assert.equal(api.leap.slam, false, 'A spin held before take-off must not arm the jump impact'); }
    if (action === 'KeyR') assert.ok(api.throwWindup || api.throwFlight);
    if (action === 'KeyZ') assert.equal(api.stanceTarget, 1);
    if (action === 'RMB') chordButtons(1, { button: 2 });
    else key(action, false);
    playerSteps(.3);
    assert.equal(api.spin, null, 'A cancelled held key must not restart after the overriding action');
    mouseAttack(false); playerSteps(.5);
    assert.equal(api.spin, null); assert.equal(api.swing, null, 'Release after cancellation must not add a ground swing');
  }
});

test('pause, blur and pointer cancellation stop a spin and clear held input on resume', () => {
  for (const action of ['pause', 'blur', 'pointercancel']) {
    arena(); pointerEvent('attackButton', 'pointerdown'); playerSteps(.4); assert.ok(api.spin);
    if (action === 'pointercancel') pointerEvent('attackButton', 'pointercancel');
    else if (action === 'pause') { key('Escape', true); key('Escape', false); }
    else emit('blur');
    assert.equal(api.spin, null);
    if (action !== 'pointercancel') { assert.equal(api.phase, 'paused'); elements.get('resumeButton').click(); }
    playerSteps(.8);
    assert.equal(api.spin, null); assert.equal(api.swing, null);
    assert.equal(elements.get('attackButton').classList.contains('active'), false);
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

test('RMB interrupts a held LMB spin and its release never reactivates the still-held left button', () => {
  arena(); mouseAttack(true); playerSteps(.35);
  assert.ok(api.spin);
  chordButtons(3, { button: 2 }); playerSteps(.03);
  assert.equal(api.spin, null); assert.equal(api.guarding, true);
  const swings = audioEvents.filter(event => event.name === 'swing').length;
  chordButtons(1, { button: 2 }); playerSteps(.5);
  assert.equal(api.guarding, false); assert.equal(api.spin, null); assert.equal(api.swing, null);
  mouseAttack(false); playerSteps(.2);
  assert.equal(audioEvents.filter(event => event.name === 'swing').length, swings,
    'A cancelled left press must not become a delayed tap when the last mouse button is released');
  mouseAttack(true); mouseAttack(false);
  assert.ok(api.swing, 'A fresh left-click must still work after the chord has ended');
});

test('adding and releasing LMB during an RMB guard keeps the defense held without a queued attack', () => {
  arena(); mouseGuard(true); playerSteps(.05);
  assert.equal(api.guarding, true);
  const swings = audioEvents.filter(event => event.name === 'swing').length;
  chordButtons(3, { button: 0 }); playerSteps(.25);
  assert.equal(api.guarding, true); assert.equal(api.spin, null); assert.equal(api.swing, null);
  chordButtons(2, { button: 0 }); playerSteps(.1);
  assert.equal(api.guarding, true, 'Releasing LMB must not also release the still-held RMB');
  mouseGuard(false); playerSteps(.5);
  assert.equal(api.guarding, false); assert.equal(api.spin, null); assert.equal(api.swing, null);
  assert.equal(audioEvents.filter(event => event.name === 'swing').length, swings);
});

test('RMB releases outside the canvas and clears on cancellation, lost capture, blur and pause', () => {
  for (const action of ['outside', 'pointercancel', 'lostpointercapture', 'blur', 'pause']) {
    arena(); mouseGuard(true); playerSteps(.05); assert.equal(api.guarding, true);
    if (action === 'outside') emit('pointerup', {
      pointerId: 10, pointerType: 'mouse', button: 2, buttons: 0,
      clientX: 1500, clientY: 950, target: document.body,
    });
    else if (action === 'blur') emit('blur');
    else if (action === 'pause') { key('Escape', true); key('Escape', false); }
    else pointerEvent('gameCanvas', action, { pointerId: 10, pointerType: 'mouse', button: 2, buttons: 0 });
    assert.equal(api.guarding, false, `${action} must release the defense`);
    if (api.phase === 'paused') elements.get('resumeButton').click();
    mouseGuard(false); playerSteps(.3);
    assert.equal(api.guarding, false); assert.equal(api.spin, null); assert.equal(api.swing, null);
  }
});

test('an unrelated pointer cannot release a held mouse guard and unowned mouse moves cannot begin it', () => {
  arena();
  chordButtons(2); playerSteps(.03);
  assert.equal(api.guarding, false, 'A held button that began outside the canvas must not start an action');
  mouseGuard(true); playerSteps(.03); assert.equal(api.guarding, true);
  pointerEvent('gameCanvas', 'pointerup', { pointerId: 22, pointerType: 'touch', buttons: 0 });
  playerSteps(.03); assert.equal(api.guarding, true, 'A different touch pointer cannot release the mouse guard');
  emit('pointermove', { pointerType: 'mouse', clientX: 600, clientY: 450 });
  playerSteps(.03); assert.equal(api.guarding, true, 'A missing buttons field is not a mouse-button release');
  mouseGuard(false); assert.equal(api.guarding, false);
});

test('two-handed spin keeps both hands attached and carries the stance damage bonus', () => {
  arena(); key('KeyZ', true); key('KeyZ', false); playerSteps(1.08);
  assert.equal(api.stance, 1);
  pointerEvent('attackButton', 'pointerdown');playerSteps(.45);assert.ok(api.spin);
  const enemy = stationaryEnemy('brute', 0, 2.1); enemy.hp = enemy.maxHp = 1000;
  playerSteps(.7, 1 / 120, () => {
    for (const side of ['left', 'right']) {
      close(worldPosition(api.hero.userData[side + 'Grip']).distanceTo(worldPosition(api.hero.userData[side + 'GripAnchor'])), 0);
    }
    assert.equal(api.hero.userData.shieldStored, true);
  });
  const damage = enemy.maxHp - enemy.hp, expected = Math.round(api.stats.power * .9 * 1.25);
  assert.ok(damage >= expected && damage <= expected * 2); assert.equal(damage % expected, 0);
  pointerEvent('attackButton', 'pointerup');
});

test('RMB aims a vertical frontal propeller while stationary, blocks the front and leaves the rear exposed', () => {
  arena(); aimAt(9, 0);
  mouseGuard(true); api.updatePlayer(.05);
  assert.equal(api.guarding, true); close(api.aim.x, 1); close(api.aim.z, 0);
  const hp = api.player.hp;
  api.hurtPlayer(24, -api.aim.x, -api.aim.z);
  assert.equal(api.player.hp, hp, 'Front-facing RMB defense must block an incoming strike');
  api.hurtPlayer(24, api.aim.x, api.aim.z);
  assert.equal(api.player.hp, hp - 24, 'RMB must not provide a circular or rear shield');
  const points = [];
  playerSteps(.38, 1 / 120, () => points.push(worldPosition(api.hero.userData.hammerHead).sub(api.hero.position)));
  const heights = points.map(p => p.y), depths = points.map(p => p.x * api.aim.x + p.z * api.aim.z);
  const lateral = points.map(p => p.x * api.aim.z - p.z * api.aim.x);
  const guard = api.guardDimensions(), orbit = api.hero.userData.hammerHead.position.y - guard.gripCenter;
  assert.ok(Math.max(...heights) - Math.min(...heights) > orbit * 1.8);
  assert.ok(Math.max(...lateral) - Math.min(...lateral) > orbit * 1.8);
  assert.ok(Math.max(...depths) - Math.min(...depths) < .02, 'The spin stays in one vertical plane in front');
  for (const depth of depths) close(depth, guard.forward, .001);
  assert.ok(guard.forward > api.player.radius, 'The propeller stays in front of the warrior');
  mouseGuard(false); assert.equal(api.guarding, false);
});

test('stock guards rotate about the hands with connected unstretched arms and an aligned defense plane', () => {
  for (const level of [1, 3, 6, 10, 15]) for (const twoHanded of [false, true]) {
    arena(level, {test: true});
    if ((api.stance > .9) !== twoHanded) { key('KeyZ', true); key('KeyZ', false); playerSteps(1.1); }
    mouseGuard(true);
    playerSteps(.5, 1 / 120, () => {
      const u = api.hero.userData, g = api.guardDimensions();
      assert.equal(api.guarding, true);
      close(worldPosition(u.rightGrip).distanceTo(worldPosition(u.rightGripAnchor)), 0);
      if (twoHanded) close(worldPosition(u.leftGrip).distanceTo(worldPosition(u.leftGripAnchor)), 0);
      else if (u.shieldEquipped) close(worldPosition(u.leftGrip).distanceTo(worldPosition(u.shieldGripAnchor)), 0);
      for (const [arm, hand] of [[u.leftArm, u.leftGrip], [u.rightArm, u.rightGrip]]) {
        assert.ok(worldPosition(arm).distanceTo(worldPosition(hand)) <= .9 + 1e-6,
          `Level ${level}, ${twoHanded ? 'two' : 'one'} hands: guard stretched an arm`);
        close(arm.userData.upper.scale.y, .44); close(arm.userData.fore.scale.y, .46);
        const elbow = arm.userData.upper.localToWorld(new THREE.Vector3(0, .5, 0));
        close(elbow.distanceTo(arm.userData.fore.localToWorld(new THREE.Vector3(0, -.5, 0))), 0);
      }
      assert.ok(u.getHeadFloorY() >= .0799, 'The entire equipped head must clear the ground throughout the propeller');
      const center = worldPosition(api.guardRing);
      close(center.x, api.player.x + api.facing.x * g.forward);
      close(center.z, api.player.z + api.facing.z * g.forward);
      close(center.y, api.player.y + g.height);
      const from = {x: center.x + api.facing.x * 2, y: center.y, z: center.z + api.facing.z * 2};
      const to = {x: center.x - api.facing.x * 2, y: center.y, z: center.z - api.facing.z * 2};
      close(api.guardContact(from, to), .5, 1e-6);
    });
    mouseGuard(false);
  }
});

test('RMB reflects a frontal robot bolt back into an enemy without hurting the warrior', () => {
  arena(); aimAt(0, 10);
  mouseGuard(true); api.updatePlayer(.05);
  const robot = stationaryEnemy('robot', 0, 5), hp = api.player.hp, robotHP = robot.hp;
  api.shoot(robot);
  for (let i = 0; i < 120 && !api.bolts[0]?.reflected; i++) api.updateEnemies(1 / 120);
  assert.equal(api.bolts.length, 1); assert.equal(api.bolts[0].reflected, true);
  assert.ok(api.bolts[0].vz > 0); assert.equal(api.player.hp, hp);
  for (let i = 0; i < 120 && api.bolts.length; i++) api.updateEnemies(1 / 120);
  assert.equal(api.bolts.length, 0); assert.ok(robot.hp < robotHP); assert.equal(api.player.hp, hp);
  mouseGuard(false);
});

test('walking RMB defense and its physical vertical plane follow travel instead of the opposite cursor', () => {
  arena();
  const direction = core.screenMovement(1, 0);
  aimAt(-direction.x * 12, -direction.z * 12);
  key('KeyD', true); playerSteps(.05); mouseGuard(true); playerSteps(.04);
  assert.equal(api.guarding, true);
  assert.ok(api.aim.x * direction.x + api.aim.z * direction.z < -.99);
  const points = [];
  playerSteps(.25, 1 / 120, () => {
    close(api.facing.x, direction.x); close(api.facing.z, direction.z);
    close(angleStep(Math.atan2(direction.x, direction.z), api.hero.rotation.y), 0, .001);
    points.push(worldPosition(api.hero.userData.hammerHead).sub(api.hero.position));
  });
  const depth = points.map(point => point.x * direction.x + point.z * direction.z);
  for (const value of depth) close(value, api.guardDimensions().forward, .001);
  assert.ok(Math.max(...depth) - Math.min(...depth) < .02,
    'The physical propeller plane must agree with the visible walking direction');
  const hp = api.player.hp;
  api.hurtPlayer(24, -direction.x, -direction.z);
  assert.equal(api.player.hp, hp, 'The direction faced while walking is the protected front');
  api.hurtPlayer(24, direction.x, direction.z);
  assert.equal(api.player.hp, hp - 24, 'The cursor behind the warrior must not turn the defense backward');
  key('KeyD', false); mouseGuard(false);
});

test('moving defense reflects projectiles along the faced direction even with the cursor behind', () => {
  arena();
  const direction = core.screenMovement(1, 0);
  aimAt(-direction.x * 12, -direction.z * 12);
  key('KeyD', true); playerSteps(.05); mouseGuard(true); playerSteps(.03);
  const robot = stationaryEnemy('robot', api.player.x + direction.x * 5, api.player.z + direction.z * 5);
  const hp = api.player.hp;
  api.shoot(robot);
  for (let i = 0; i < 120 && !api.bolts[0]?.reflected; i++) api.updateEnemies(1 / 120);
  assert.equal(api.bolts.length, 1); assert.equal(api.bolts[0].reflected, true);
  assert.ok(api.bolts[0].vx * direction.x + api.bolts[0].vz * direction.z > 0);
  assert.equal(api.player.hp, hp);
  key('KeyD', false); mouseGuard(false);
});

test('stationary defense on a roof edge keeps support until the full player circle clears the building', () => {
  for (const twoHanded of [false, true]) {
    arena();
    if (twoHanded) { key('KeyZ', true); key('KeyZ', false); playerSteps(1.1); }
    const roof = placeObject('townhouse', 18, -12, { w: 12, d: 12, h: 4, hp: 10000, maxHp: 10000 });
    // Only 9 cm of the foot circle still overlaps the roof. A narrower support
    // circle would drop the actor into the building's larger side collider.
    const start = { x: roof.x + roof.w / 2 + .35, z: roof.z };
    Object.assign(api.player, { ...start, y: roof.h, vy: 0, vx: 0, vz: 0 });
    api.setFacing(1, 0); api.poseHero(1); mouseGuard(true);
    playerSteps(.45, 1 / 120, () => {
      close(api.player.x, start.x); close(api.player.z, start.z); close(api.player.y, roof.h);
      assert.equal(api.guarding, true, 'The check must exercise the live defensive pose');
    });
    mouseGuard(false);
    assert.equal(roof.dead, false);
  }
});

test('guarded walking off a roof edge falls locally without crossing the building or resetting position', () => {
  arena();
  const roof = placeObject('townhouse', 18, -12, { w: 12, d: 12, h: 4, hp: 10000, maxHp: 10000 });
  Object.assign(api.player, { x: roof.x + roof.w / 2 + .2, y: roof.h, z: roof.z, vy: 0, vx: 0, vz: 0 });
  api.setFacing(0, -1); api.poseHero(1); mouseGuard(true);
  key('KeyW', true); key('KeyD', true);
  const direction = core.screenMovement(1, -1), start = { x: api.player.x, z: api.player.z };
  let previous = { x: api.player.x, y: api.player.y, z: api.player.z }, leftRoof = false;
  playerSteps(1.7, 1 / 120, dt => {
    const distance = Math.hypot(api.player.x - previous.x, api.player.z - previous.z);
    assert.ok(distance <= api.stats.speed * dt + 1e-6,
      `Walking beside the roof produced an uncommanded ${distance.toFixed(3)} m displacement`);
    if (core.circleOverlaps(api.player.x, api.player.z, api.player.radius, roof)) {
      assert.equal(leftRoof, false, 'An outward walk must not be relocated back onto another part of the roof');
      close(api.player.y, roof.h);
    } else {
      leftRoof = true;
      assert.ok(api.player.y <= previous.y + 1e-6, 'Falling off the roof must not snap upward');
    }
    previous = { x: api.player.x, y: api.player.y, z: api.player.z };
  });
  key('KeyW', false); key('KeyD', false); mouseGuard(false);
  assert.equal(leftRoof, true); close(api.player.y, 0);
  assert.ok(api.player.x > roof.x + roof.w / 2 + api.player.radius);
  close((api.player.x - start.x) * direction.z - (api.player.z - start.z) * direction.x, 0, 1e-5);
});

test('dashing alongside a roof edge never ejects the player through a remote building face', () => {
  arena();
  const roof = placeObject('townhouse', 18, -12, { w: 12, d: 12, h: 4, hp: 10000, maxHp: 10000 });
  const start = { x: roof.x + roof.w / 2 + .35, z: roof.z };
  Object.assign(api.player, { ...start, y: roof.h, vy: 0, vx: 0, vz: 0 });
  api.setFacing(0, 1); api.poseHero(1);
  key('ShiftLeft', true); key('ShiftLeft', false);
  let previousZ = start.z;
  playerSteps(.4, 1 / 120, dt => {
    close(api.player.x, start.x); close(api.player.y, roof.h);
    assert.ok(api.player.z >= previousZ - 1e-6, 'A forward dash must never snap to the opposite building face');
    assert.ok(api.player.z - previousZ <= 19 * dt + 1e-6);
    previousZ = api.player.z;
  });
  assert.ok(api.player.z - start.z > 4, 'The real dash must cover its forward distance on the roof');
});

test('a dash back toward a roof after falling below it hits the nearby facade without snapping upward', () => {
  arena();
  const roof = placeObject('townhouse', 18, -12, { w: 12, d: 12, h: 4, hp: 10000, maxHp: 10000 });
  // The player has just fallen 4 cm below the roof and reverses direction.
  // A permissive height threshold used to ignore the wall, then lift the
  // player back onto a roof that had never been crossed from above.
  Object.assign(api.player, { x: roof.x + roof.w / 2 + .5, y: roof.h - .04, z: roof.z, vy: -1, vx: 0, vz: 0 });
  api.setFacing(-1, 0); api.poseHero(1);
  key('ShiftLeft', true); key('ShiftLeft', false);
  let previous = { x: api.player.x, y: api.player.y, z: api.player.z };
  playerSteps(.35, 1 / 60, dt => {
    assert.ok(api.player.y <= previous.y, 'A dash under the roof plane must continue falling instead of snapping onto it');
    assert.ok(Math.hypot(api.player.x - previous.x, api.player.z - previous.z) <= 19 * dt + 1e-6);
    assert.equal(core.circleOverlaps(api.player.x, api.player.z, api.player.radius - 1e-6, roof), false);
    assert.ok(api.player.x >= roof.x + roof.w / 2 + api.player.radius - 1e-6,
      'The blocked dash must remain at the near facade');
    previous = { x: api.player.x, y: api.player.y, z: api.player.z };
  });
  assert.ok(api.player.y < roof.h - .5);
});

test('a high forward jump catches a descending roof crossing once and stays at its local landing point', () => {
  arena();
  const roof = placeObject('townhouse', 0, 10, { w: 12, d: 10, h: 4, hp: 10000, maxHp: 10000 });
  key('Space', true); key('Space', false);
  let previous = { x: api.player.x, y: api.player.y, z: api.player.z }, apex = 0;
  for (let i = 0; api.leap && i < 240; i++) {
    api.updatePlayer(1 / 120); apex = Math.max(apex, api.player.y);
    assert.ok(Math.hypot(api.player.x - previous.x, api.player.z - previous.z) <= 8.2 / 120 + 1e-6,
      'A roof landing must preserve the jump trajectory without a horizontal correction across the building');
    if (api.leap) assert.equal(roof.hp, 10000, 'The roof receives its landing impact only at contact');
    else assert.ok(previous.y >= roof.h, 'Landing catches a descending crossing, not an upward roof snap');
    previous = { x: api.player.x, y: api.player.y, z: api.player.z };
  }
  assert.equal(api.leap, null); assert.ok(apex > 7.5); close(api.player.y, roof.h);
  assert.ok(api.player.z > 9 && api.player.z < 12);
  assert.ok(roof.hp < 10000 && !roof.dead);
  const landing = { x: api.player.x, z: api.player.z, hp: roof.hp };
  mouseGuard(true); playerSteps(.45); mouseGuard(false);
  close(api.player.x, landing.x); close(api.player.z, landing.z); close(api.player.y, roof.h);
  assert.equal(roof.hp, landing.hp, 'The completed landing must not reapply its impact while guarding');
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

test('holding an airborne left-click arms a large smash whose damage happens only on landing', () => {
  arena();
  const nearLeft = stationaryEnemy('brute', -2, 5.6), nearRight = stationaryEnemy('brute', 2, 5.6);
  const distant = stationaryEnemy('brute', 10, 5.6);
  const wall = placeObject('wall', 3.5, 5.6, { w: 1, d: 1, h: 1, hp: 1000, maxHp: 1000 });
  const targets = [nearLeft, nearRight, wall], before = targets.map(t => t.hp);
  key('Space', true); key('Space', false); playerSteps(.5);
  assert.ok(api.player.y > 6); assert.ok(api.leap); assert.equal(api.leap.slam, false);
  mouseAttack(true);playerSteps(.23);mouseAttack(false);
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

test('a mouse attack held before Space needs a fresh airborne press to arm the impact', () => {
  arena();
  mouseAttack(true); playerSteps(.12);
  assert.equal(api.spin, null, 'The mouse button is held but still below the spin threshold');
  key('Space', true); key('Space', false);
  assert.ok(api.leap); assert.equal(api.leap.slam, false, 'An attack begun on the ground is not a fresh airborne smash command');
  assert.equal(api.swing, null);
  for (let i = 0; api.leap && (api.leap.vy >= 0 || api.player.y > .55) && i < 480; i++) api.updatePlayer(1 / 240);
  assert.ok(api.leap, 'The fixture is introduced before the descending warrior touches the ground');
  assert.equal(api.leap.slam, false, 'Continuing to hold the old mouse press must not arm the jump later');
  mouseAttack(false);
  assert.equal(api.leap.slam, false); assert.equal(api.swing, null);
  const enemy = stationaryEnemy('brute', api.player.x + 1.5, api.player.z), hp = enemy.hp;
  mouseAttack(true); mouseAttack(false);
  assert.equal(api.leap.strike,true);assert.equal(api.leap.slam,false,'A fresh tap arms a small strike, not the held heavy one');
  for (let i = 0; api.leap && i < 120; i++) {
    api.updatePlayer(1 / 240);
    if (api.leap) assert.equal(enemy.hp, hp);
  }
  assert.equal(api.leap, null);
  assert.ok(hp-enemy.hp>0&&hp-enemy.hp<api.stats.power,'The fresh tap produces modest damage');
  const after = enemy.hp, swingEvents = audioEvents.filter(e => e.name === 'swing').length;
  mouseAttack(false); playerSteps(.5);
  assert.equal(enemy.hp, after);
  assert.equal(audioEvents.filter(e => e.name === 'swing').length, swingEvents);
});

test('a left-click just before touchdown gives one small smash without an unearned large blast', () => {
  arena(); key('Space', true); key('Space', false);
  for (let i = 0; api.leap && (api.leap.vy >= 0 || api.player.y > .45) && i < 480; i++) api.updatePlayer(1 / 240);
  assert.ok(api.leap); assert.equal(api.leap.slam, false);
  const near = stationaryEnemy('brute', api.player.x + 1.6, api.player.z);
  const outer = stationaryEnemy('brute', api.player.x + 4.1, api.player.z);
  const before = [near.hp, outer.hp];
  mouseAttack(true); mouseAttack(false);
  assert.equal(api.leap.strike,true);assert.equal(api.leap.slam,false);
  assert.deepEqual([near.hp, outer.hp], before);
  for (let i = 0; api.leap && i < 120; i++) {
    api.updatePlayer(1 / 240);
    if (api.leap) assert.deepEqual([near.hp, outer.hp], before);
  }
  assert.equal(api.leap, null);
  assert.ok(before[0]-near.hp>0&&before[0]-near.hp<api.stats.power);
  assert.equal(outer.hp,before[1],'A tap must not acquire the heavy smash radius');
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
  mouseAttack(true); mouseAttack(false); mouseGuard(true); api.updatePlayer(.01); mouseGuard(false);
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

test('R retains mouse-directed throwing while the walking body stays aligned with travel', () => {
  arena();
  const direction = core.screenMovement(1, 0);
  aimAt(-direction.x * 12, -direction.z * 12);
  key('KeyD', true); playerSteps(.05);
  const throwDirection = { ...api.aim };
  assert.ok(throwDirection.x * direction.x + throwDirection.z * direction.z < -.99);
  key('KeyR', true); key('KeyR', false);
  assert.ok(api.throwWindup);
  playerSteps(.31, 1 / 120, () => {
    close(api.facing.x, direction.x); close(api.facing.z, direction.z);
    close(angleStep(Math.atan2(direction.x, direction.z), api.hero.rotation.y), 0, .001);
  });
  assert.ok(api.throwFlight);
  close(api.throwFlight.dir.x, throwDirection.x, .001);
  close(api.throwFlight.dir.z, throwDirection.z, .001);
  key('KeyD', false);
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
  assert.ok(choices.every(button => /href="#upgrade-(power|size|range|speed|vitality|quake|kick)"/.test(button.innerHTML)));
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
  const selectedId = api.upgradeQueue[0][0].id;
  const oldKick = kickPhysics.kickStats(api.level, api.levels.kick);
  key('Digit1', true); key('Digit1', false);
  assert.equal(api.phase, 'playing'); assert.equal(api.relics, 1);
  assert.equal(api.upgradeQueue.length, 0);
  assert.equal(Object.values(api.levels).reduce((a, b) => a + b, 0), 1);
  assert.equal(api.levels[selectedId], 1, 'The selected, visible upgrade is the one consumed');
  if (selectedId === 'kick') {
    const upgradedKick = kickPhysics.kickStats(api.level, api.levels.kick);
    assert.ok(upgradedKick.damage > oldKick.damage && upgradedKick.impulse > oldKick.impulse);
    assert.deepEqual({ ...api.stats }, oldStats, 'A kick upgrade does not silently change weapon stats');
  } else {
    assert.ok(Object.keys(oldStats).some(k => oldStats[k] !== api.stats[k]));
  }
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

test('60% destruction summons one boss and continuation retains upgrades and the same damaged district', () => {
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
  const score = api.score, district = api.world, sector = api.sector;
  const destruction = core.destructionPercent(api.world.objects);
  elements.get('continueButton').click();
  assert.equal(api.phase, 'playing'); assert.equal(api.round, 2);
  assert.equal(api.levels.power, 2); assert.equal(api.player.hp, api.player.maxHp);
  assert.equal(api.boss, null); assert.equal(api.enemies.length, 0);
  assert.equal(api.score, score);
  assert.equal(api.world, district); assert.equal(api.sector, sector);
  assert.equal(core.destructionPercent(api.world.objects), destruction,
    'Advancing the next horde must preserve the city the player already damaged');
  api.checkGoal(); assert.equal(api.boss, null, 'The same destruction threshold must not respawn the defeated boss');
  api.updateWaves(waves.wavePlan(2).firstDelay + .01);
  assert.equal(api.wave.spawned, waves.wavePlan(2).batches[0]);
  assert.equal(api.enemies.length, waves.wavePlan(2).batches[0],
    'The next horde must actually spawn after Continue despite the consumed boss milestone');
  assert.ok(api.enemies.every(enemy => enemy.waveNumber === 2));
  api.updateHUD();
  assert.doesNotMatch(elements.get('waveStatus').textContent, /ΤΕΛΙΚΟΣ BOSS/);
});

test('boss fear and hit recoil stay bounded over many pose steps and its arm roll settles back to zero', () => {
  arena();
  api.spawnBoss();
  const boss = api.boss;
  boss.x = 0; boss.z = 3; boss.y = 0; boss.state = 'recover'; boss.timer = 100;
  api.startLeap(); api.player.y = 8; api.armAirSmash();
  assert.equal(api.leap.strike, true);
  api.hitBoss(1, {x: 1, z: 0}, 0);
  assert.ok(boss.impact, 'The fixture must combine a real hammer recoil with the airborne threat');
  const {leftArm, rightArm, head} = boss.mesh.userData;
  assert.ok(leftArm && rightArm && head);
  let peakFear = 0, peakArmRoll = 0, peakLookUp = 0;
  for (let i = 0; i < 480; i++) {
    api.updateBoss(1 / 120);
    peakFear = Math.max(peakFear, boss.fear);
    peakLookUp = Math.max(peakLookUp, -head.rotation.x);
    peakArmRoll = Math.max(peakArmRoll, Math.abs(leftArm.rotation.z), Math.abs(rightArm.rotation.z));
    assert.ok(Math.abs(leftArm.rotation.z) < .5 && Math.abs(rightArm.rotation.z) < .5,
      `Protective arm roll must not accumulate across frames; left=${leftArm.rotation.z}, right=${rightArm.rotation.z}`);
  }
  assert.ok(peakFear > .05, 'The boss must actually display its weaker fear reaction');
  assert.ok(peakLookUp > .2, 'The articulated boss head must track the elevated player');
  assert.ok(peakArmRoll > .01, 'The arms must visibly react before settling');
  assert.equal(boss.fearTime, 0); assert.equal(boss.fear, 0);
  close(leftArm.rotation.z, 0, 1e-8); close(rightArm.rotation.z, 0, 1e-8);
  assert.equal(boss.impact, null, 'The physical hit recoil must also complete');
});

test('lethal damage opens defeat and a test retry resets combat while restoring the selected complete preset', () => {
  reset();
  elements.get('startingLevel').value = '15';
  api.player.hp = 1; api.player.invincible = 0;
  api.hurtPlayer(40, 1, 0);
  assert.equal(api.phase, 'dead'); assert.equal(api.player.hp, 0);
  assert.equal(elements.get('continueButton').hidden, true);
  elements.get('retryButton').click();
  assert.equal(api.phase, 'playing'); assert.equal(api.round, 1);
  assert.equal(api.character.level, 15); assert.equal(api.character.weaponId, 'storm'); assert.equal(api.testRun, true);
  assert.equal(api.player.hp, characterProgression.getCharacterStats(characterProgression.createCharacterProgression(15)).maxHp);
  assert.equal(api.score, 0); assert.equal(api.sector, 1);
  assert.equal(Object.values(api.levels).reduce((a, b) => a + b, 0), 0);
  advance(.1); assert.deepEqual(browserErrors, []);
});

test('real enemy rigs visibly flinch and hop a short distance away from a hammer hit, with heavier enemies moving less', () => {
  const travel = new Map();
  for (const type of ['zombie', 'crawler', 'brute', 'mech']) {
    arena();
    const enemy = stationaryEnemy(type, 0, 6);
    enemy.hp = enemy.maxHp = 1000;
    api.updateEnemies(.01);
    const startX = enemy.x, startZ = enemy.z;
    api.hitEnemy(enemy, 10, { x: 1, z: 0 }, 5.4, 2.3);
    let maxHeight = 0, maxTilt = 0;
    for (let i = 0; i < 120; i++) {
      api.updateEnemies(1 / 120);
      maxHeight = Math.max(maxHeight, enemy.y);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(enemy.mesh.quaternion);
      maxTilt = Math.max(maxTilt, Math.acos(Math.max(-1, Math.min(1, up.y))));
      assert.ok(enemy.x >= startX - 1e-6, `${type}: the impact must push away from its source`);
      close(enemy.z, startZ, 1e-6);
    }
    const distance = enemy.x - startX; travel.set(type, distance);
    assert.ok(distance > .1 && distance < 1.1, `${type}: expected a short bounce back, moved ${distance} metres`);
    assert.ok(maxHeight > .015 && maxHeight < .4, `${type}: expected a small impact hop, reached ${maxHeight}`);
    assert.ok(maxTilt > .06, `${type}: the actual rig must recoil visibly after its species animation runs`);
    close(enemy.mesh.rotation.x, 0, .001); close(enemy.mesh.rotation.z, 0, .001);
    close(enemy.y, 0, .001); assert.equal(enemy.dead, false); assert.equal(enemy.hp, 990);
  }
  assert.ok(travel.get('brute') < travel.get('zombie') * .8, 'Heavy bodies must absorb more of the same hit');
  assert.ok(travel.get('mech') < travel.get('crawler') * .8, 'The species animation must preserve metal enemy mass');
});

test('hammer knockback stops at the near face of solid scenery without teleporting an enemy through it', () => {
  arena();
  const enemy = stationaryEnemy('zombie', 0, 6);
  enemy.hp = enemy.maxHp = 1000;
  const wall = placeObject('wall', .9, 6, { w: .1, d: 3, h: 3, hp: 1000, maxHp: 1000 });
  api.hitEnemy(enemy, 10, { x: 1, z: 0 }, 12, 3);
  let maximumX = enemy.x;
  for (let i = 0; i < 120; i++) {
    api.updateEnemies(1 / 120); maximumX = Math.max(maximumX, enemy.x);
    assert.ok(enemy.x <= wall.x - wall.w / 2 - enemy.radius + .001,
      'Every impact step must stay on the original side of the wall');
    close(enemy.z, 6, 1e-6);
  }
  assert.ok(maximumX > .15, 'The fixture must exercise actual recoil movement before the wall stops it');
});

test('a lethal hit removes enemy gameplay immediately, shows a falling body, then releases its geometry exactly once', () => {
  arena();
  const enemy = stationaryEnemy('robot', 0, 5), geometries = new Set();
  enemy.mesh.traverse(o => { if (o.isMesh) geometries.add(o.geometry); });
  let disposals = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => disposals++);
  const beforeKills = api.kills, beforeHP = api.player.hp;
  api.hitEnemy(enemy, 9999, { x: 1, z: 0 }, 5, 2);
  assert.equal(enemy.dead, true); assert.equal(api.enemies.includes(enemy), false);
  assert.equal(api.kills, beforeKills + 1); assert.equal(api.enemyFalls.includes(enemy), true);
  assert.equal(enemy.mesh.parent, api.scene, 'The fatal reaction must be visible before cleanup');
  assert.equal(disposals, 0, 'A visible falling body must retain its instance geometry');
  const deadHP = enemy.hp; api.hitEnemy(enemy, 9999, { x: 1, z: 0 }, 5, 2);
  assert.equal(enemy.hp, deadHP); assert.equal(api.kills, beforeKills + 1, 'A falling body cannot score a second kill');
  api.updateEnemies(.08);
  assert.ok(Math.abs(enemy.mesh.rotation.x) + Math.abs(enemy.mesh.rotation.z) > .04,
    'The body must visibly tip in the direction of its fatal hit');
  for (let i = 0; i < 120; i++) api.updateEnemies(1 / 120);
  assert.equal(enemy.mesh.parent, null); assert.equal(api.enemyFalls.includes(enemy), false);
  assert.equal(disposals, geometries.size, 'Every completed death must release its instance-owned geometry');
  assert.equal(api.player.hp, beforeHP, 'Falling enemies must not retain attack behavior');
  api.updateEnemies(.3); assert.equal(disposals, geometries.size, 'Finished corpses must not be disposed repeatedly');
});

test('a new run cleans an unfinished enemy fall and cannot revive its old combat state', () => {
  arena();
  const enemy = stationaryEnemy('crawler', 0, 5), geometries = new Set();
  enemy.mesh.traverse(o => { if (o.isMesh) geometries.add(o.geometry); });
  let disposals = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => disposals++);
  api.hitEnemy(enemy, 9999, { x: 1, z: 0 }, 5, 2);
  api.updateEnemies(.05); assert.equal(enemy.mesh.parent, api.scene);
  api.startGame(15, {test: true});
  assert.equal(enemy.mesh.parent, null); assert.equal(api.enemyFalls.length, 0); assert.equal(api.enemies.length, 0);
  assert.equal(disposals, geometries.size); assert.equal(api.kills, 0);
  advance(.5); assert.equal(disposals, geometries.size); assert.equal(api.enemies.includes(enemy), false);
});

test('a normal new character wears starter gear, keeps movement, and makes only a small unarmed jump', () => {
  arena(1, {test: false});
  assert.equal(api.testRun, false);
  assert.equal(api.character.level, 1);
  assert.equal(api.character.weaponId, 'log');
  assert.equal(api.characterStats.hasShield, false);
  assert.equal(api.characterStats.armorTier, 0);
  assert.equal(api.characterStats.canReturn, false);
  assert.equal(api.characterStats.canAirSmash, false);
  assert.equal(api.hero.userData.equipmentTier, 0, 'The equipped model must follow the actual starter tier');
  assert.equal(api.hero.userData.weaponHeld, true);
  assert.ok(api.startLeap(), 'The starter must retain a working jump control');
  close(api.leap.vy, api.characterStats.jumpVelocity);
  api.armAirSmash();
  assert.equal(api.leap.slam, false, 'The advanced smash cannot be armed by calling its action early');
  let apex = 0;
  for (let i = 0; api.leap && i < 360; i++) {
    api.updatePlayer(1 / 120); apex = Math.max(apex, api.player.y);
    assert.equal(api.leap?.slam ?? false, false);
  }
  assert.equal(api.leap, null);
  assert.ok(apex > .8 && apex < 2.5, `The starter should visibly hop, not leap over rooftops; apex=${apex}`);
  close(api.player.y, 0);
  api.renderCharacterProgress();
  assert.equal(elements.get('characterHudWeapon').textContent, api.characterStats.weaponName);
  assert.match(elements.get('characterXpText').textContent, /0\s*\/\s*8\s*XP/);
});

test('the level selector creates full war and storm presets in the same district without fake level labels', () => {
  const descriptions = [];
  for (const [level, weaponId, returns, chains] of [[1, 'log', false, false], [10, 'war', true, false], [15, 'storm', true, true]]) {
    api.clearInput(); heldMousePoint = null;
    elements.get('startingLevel').value = String(level);
    elements.get('startingLevel').onchange();
    elements.get('testStartButton').click(); advance(.1);
    descriptions.push(api.world.objects.map(o => [o.type, o.x, o.z, o.w, o.d, o.h]));
    assert.equal(api.character.level, level);
    assert.equal(api.character.weaponId, weaponId);
    assert.ok(elements.get('startingLoadout').textContent.includes(api.characterStats.weaponName));
    assert.equal(api.characterStats.canReturn, returns);
    assert.equal(api.characterStats.canRicochet, chains);
    assert.equal(api.characterStats.canLightning, chains);
    assert.equal(api.hero.userData.equipmentTier, api.characterStats.weaponTier);
    close(api.stats.power, api.characterStats.power);
    assert.equal(api.player.hp, api.characterStats.maxHp);
    assert.equal(api.round, 1, 'Character level must not masquerade as a different wave');
    assert.equal(api.sector, 1, 'Character presets must not switch maps');
    assert.equal(api.testRun, true);
    if (level > 1) assert.ok(api.character.materials.wood > 0);
    api.renderCharacterProgress();
    assert.match(elements.get('characterHudLevel').textContent, /ΔΟΚΙΜΗ/);
  }
  assert.deepEqual(descriptions[0], descriptions[1]);
  assert.deepEqual(descriptions[1], descriptions[2]);
  assert.equal(elements.get('characterXpFill').style.width, '100%');
  assert.match(elements.get('characterXpText').textContent, /ΜΕΓΙΣΤΟ/);
});

test('actual kills award experience and physical materials which must be collected before a recipe can be forged', () => {
  arena(1, {test: false});
  const originalWorld = api.world;
  for (let i = 0; i < 20; i++) {
    const enemy = stationaryEnemy('zombie', 8, 0);
    api.hitEnemy(enemy, enemy.hp, {x: 1, z: 0}, 5.4, 2.3);
    assert.equal(enemy.dead, true);
  }
  assert.equal(api.kills, 20);
  assert.equal(api.character.level, 3);
  assert.equal(api.character.weaponId, 'log', 'Killing and leveling alone must not forge the next weapon');
  assert.equal(api.character.materials.wood, 0, 'Loot remains in the world until the player collects it');
  const materialDrops = api.drops.filter(drop => characterProgression.MATERIAL_TYPES.includes(drop.kind));
  assert.ok(materialDrops.filter(drop => drop.kind === 'wood').length >= 8,
    'The opening enemies must supply enough visible wood to make the first recipe attainable');
  assert.ok(materialDrops.every(drop => drop.mesh.parent === api.scene));
  assert.equal(characterProgression.getForgeStatus(api.character).reason, 'materials');
  api.forgeWeapon(); assert.equal(api.character.weaponId, 'log');
  // Fresh drops have a short spawn animation before their pickup activates.
  api.updateDrops(.5);
  for (const drop of materialDrops) {
    if (!api.drops.includes(drop)) continue;
    api.player.x = drop.x; api.player.z = drop.z;
    api.updateDrops(1 / 60);
  }
  assert.equal(api.drops.filter(drop => characterProgression.MATERIAL_TYPES.includes(drop.kind)).length, 0);
  const materialsBefore = {...api.character.materials};
  const recipe = characterProgression.getForgeStatus(api.character).next;
  assert.equal(characterProgression.getForgeStatus(api.character).canForge, true);
  api.toggleUpgradePanel(true);
  assert.equal(elements.get('forgeButton').disabled, false);
  elements.get('forgeButton').click();
  assert.equal(api.character.weaponId, 'club');
  assert.equal(api.hero.userData.equipmentTier, 1);
  for (const type of characterProgression.MATERIAL_TYPES) {
    assert.equal(api.character.materials[type], materialsBefore[type] - recipe.cost[type]);
  }
  assert.equal(api.world, originalWorld, 'Forging must not regenerate the district');
  assert.equal(api.round, 1);
  const forged = JSON.stringify(api.character);
  elements.get('forgeButton').click();
  assert.equal(JSON.stringify(api.character), forged, 'A repeated press must respect the next recipe gates');
});

test('advanced testing cannot overwrite the normal character checkpoint and resuming restores earned gear and bonuses', () => {
  arena(1, {test: false});
  api.gainXP(20);
  for (let i = 0; i < 8; i++) api.spawnDrop(api.player.x, api.player.z, 'wood');
  api.updateDrops(.5); api.forgeWeapon();
  assert.equal(api.character.weaponId, 'club');
  api.levels.power = 2; api.levels.vitality = 1; api.applyStats(); api.persistCharacter();
  const normalSave = storage.get('ironfall.character'), normal = JSON.parse(normalSave);
  assert.equal(normal.character.level, 3); assert.equal(normal.character.weaponId, 'club');
  for (const level of [10, 15]) {
    api.startGame(level, {test: true});
    api.gainXP(100); api.spawnDrop(api.player.x, api.player.z, 'crystal'); api.updateDrops(.5);
    api.levels.speed = 4; api.applyStats(); api.persistCharacter();
    assert.equal(storage.get('ironfall.character'), normalSave,
      `Level ${level} testing must not change the ordinary progress save`);
  }
  api.startGame(1, {resume: true});
  assert.equal(api.testRun, false);
  assert.deepEqual(JSON.parse(JSON.stringify(api.character)), normal.character);
  assert.deepEqual(JSON.parse(JSON.stringify(api.levels)), normal.levels);
  assert.equal(api.hero.userData.equipmentTier, 1);
  assert.equal(api.characterStats.canReturn, false);
  assert.equal(api.player.hp, api.player.maxHp);
});

test('resuming a high-level character never substitutes the testing preset for equipment not yet forged', () => {
  arena(1, {test: false});
  api.gainXP(292); api.persistCharacter();
  assert.equal(api.character.level, 10); assert.equal(api.character.weaponId, 'log');
  api.startGame(15, {test: true}); assert.equal(api.character.weaponId, 'storm');
  api.startGame(1, {resume: true});
  assert.equal(api.character.level, 10); assert.equal(api.character.weaponId, 'log');
  assert.equal(api.hero.userData.equipmentTier, 0);
  assert.equal(api.characterStats.canReturn, false); assert.equal(api.characterStats.canAirSmash, false);
});

test('a thrown starter log stays where it lands until the player approaches to retrieve the physical weapon', () => {
  arena(1, {test: false});
  aimAt(0, 12); api.poseHero(1);
  const startX = api.player.x, startZ = api.player.z;
  key('KeyR', true); key('KeyR', false);
  assert.ok(api.throwWindup);
  let projectile = null;
  for (let i = 0; i < 480; i++) {
    api.updatePlayer(1 / 120);
    if (api.throwFlight) {
      projectile ||= api.throwFlight;
      assert.equal(api.throwFlight, projectile, 'The log remains one projectile from release through retrieval');
      assert.equal(!!projectile.returning, false, 'A wooden log must never enter automatic return flight');
    }
  }
  assert.ok(projectile && api.throwFlight === projectile, 'A missed throw must leave a recoverable weapon in the world');
  assert.equal(api.hero.userData.weaponHeld, false);
  assert.equal(projectile.mesh.parent, api.scene);
  assert.ok(Math.hypot(projectile.x - startX, projectile.z - startZ) > 3);
  assert.ok(projectile.y < .8, 'The recoverable weapon must settle visibly near the ground');
  assert.ok(new THREE.Box3().setFromObject(projectile.mesh).min.y >= .014,
    'The thicker physical log must lie above the street, not sink below its visible surface');
  close(api.player.x, startX); close(api.player.z, startZ);
  const resting = {x: projectile.x, z: projectile.z};
  playerSteps(2);
  assert.equal(api.throwFlight, projectile); assert.equal(api.hero.userData.weaponHeld, false);
  close(projectile.x, resting.x); close(projectile.z, resting.z);
  assert.ok(new THREE.Box3().setFromObject(projectile.mesh).min.y >= .014);
  api.player.x = projectile.x; api.player.z = projectile.z;
  api.updatePlayer(1 / 120);
  assert.equal(api.throwFlight, null); assert.equal(api.hero.userData.weaponHeld, true);
  assert.equal(projectile.mesh.parent, null);
  assert.equal(api.hammerLightning, 0, 'Picking up wood must not trigger magical catch lightning');
  assert.equal(api.scene.children.filter(child => child.userData.kind === 'hammer-projectile').length, 0);
});

test('a nonreturning weapon landing on a roof can be retrieved from that same supported roof', () => {
  arena(1, {test: false});
  const roof = placeObject('townhouse', 0, 6, {w: 20, d: 30, h: 4, hp: 10000, maxHp: 10000});
  api.player.x = 0; api.player.z = 0; api.player.y = roof.h;
  api.setFacing(0, 1); api.poseHero(1); aimAt(0, 12);
  key('KeyR', true); key('KeyR', false);
  for (let i = 0; !api.throwFlight?.grounded && i < 480; i++) api.updatePlayer(1 / 120);
  const projectile = api.throwFlight;
  assert.ok(projectile?.grounded, 'The real ballistic throw must settle on the fixture roof');
  close(projectile.groundY, roof.h);
  assert.ok(new THREE.Box3().setFromObject(projectile.mesh).min.y >= roof.h + .014,
    'The resting mesh must use the roof support height and its real thickness');
  assert.equal(api.hero.userData.weaponHeld, false);
  api.player.x = projectile.x; api.player.z = projectile.z; api.player.y = roof.h;
  api.updatePlayer(1 / 120);
  assert.ok(api.throwFlight === null, 'The supporting building must not block retrieval on its own roof');
  assert.equal(api.hero.userData.weaponHeld, true);
  close(api.player.y, roof.h);
});

test('forging cannot replace a weapon during its throw or while it waits for physical retrieval', () => {
  arena(1, {test: false});
  api.gainXP(20);
  for (let i = 0; i < 8; i++) api.spawnDrop(api.player.x, api.player.z, 'wood');
  api.updateDrops(.5);
  assert.equal(characterProgression.getForgeStatus(api.character).canForge, true);
  aimAt(0, 12); key('KeyR', true); key('KeyR', false);
  assert.ok(api.throwWindup);
  const before = JSON.stringify(api.character);
  api.renderCharacterProgress(); assert.equal(elements.get('forgeButton').disabled, true);
  api.forgeWeapon(); assert.equal(JSON.stringify(api.character), before);
  for (let i = 0; !api.throwFlight?.grounded && i < 480; i++) api.updatePlayer(1 / 120);
  const projectile = api.throwFlight;
  assert.ok(projectile?.grounded);
  api.renderCharacterProgress(); assert.equal(elements.get('forgeButton').disabled, true);
  api.forgeWeapon(); assert.equal(JSON.stringify(api.character), before);
  assert.equal(api.hero.userData.equipmentTier, 0);
  api.player.x = projectile.x; api.player.z = projectile.z;
  api.updatePlayer(1 / 120);
  assert.equal(api.throwFlight, null);
  api.renderCharacterProgress(); assert.equal(elements.get('forgeButton').disabled, false);
  elements.get('forgeButton').click();
  assert.equal(api.character.weaponId, 'club'); assert.equal(api.hero.userData.equipmentTier, 1);
  assert.equal(projectile.mesh.parent, null, 'The replaced thrown geometry must already be released');
  assert.equal(api.hero.userData.weaponHeld, true);
});

test('a hit cancels every ordinary attack windup and leaves the struck enemy unable to retaliate during stagger', () => {
  for (const type of ['zombie', 'robot', 'brute', 'mech']) {
    arena();
    const enemy = api.spawnEnemy(type, {x: 0, z: 1.8});
    enemy.hp = enemy.maxHp = 1000; enemy.speed = 0; enemy.timer = -1;
    api.updateEnemies(.01);
    assert.equal(enemy.state, 'windup', `${type}: the fixture must start a real attack`);
    assert.ok(enemy.telegraph);
    const telegraph = enemy.telegraph, hp = api.player.hp;
    api.hitEnemy(enemy, 1, {x: 0, z: 1}, 0, 0);
    assert.equal(enemy.telegraph, null); assert.equal(telegraph.parent, null);
    assert.equal(enemy.state, 'walk'); assert.ok(enemy.stagger >= .35);
    const staggerDuration = enemy.stagger;
    for (let elapsed = 0; elapsed < staggerDuration - .02; elapsed += 1 / 120) {
      api.updateEnemies(1 / 120);
      assert.equal(api.player.hp, hp, `${type}: the interrupted attack must not retaliate during its hit reaction`);
      assert.equal(api.bolts.length, 0, `${type}: a canceled shot must not emit a projectile`);
      assert.notEqual(enemy.state, 'windup'); assert.notEqual(enemy.state, 'lunge');
    }
    // This local interruption is not global player invulnerability.
    api.hurtPlayer(5, 0, 0, false);
    assert.equal(api.player.hp, hp - 5, 'An unrelated incoming attack still damages the player');
  }
});

test('nearby enemies look upward and brace for a visible jump while walls and distance bound the fear reaction', () => {
  arena();
  const near = stationaryEnemy('zombie', 0, 3);
  const screened = stationaryEnemy('robot', 4, 0);
  const distant = stationaryEnemy('zombie', 0, 20);
  placeObject('wall', 2, 0, {w: .1, d: 5, h: 12, hp: 1000, maxHp: 1000});
  api.startLeap();
  api.player.y = 3;
  api.armAirSmash();
  for (let i = 0; i < 12; i++) api.updateEnemies(1 / 120);
  assert.ok(near.lookPitch < -.2, 'A visible airborne player must turn the enemy gaze upward');
  assert.ok(near.mesh.userData.head, 'The real model needs an articulated head, not only an AI value');
  assert.ok(near.mesh.userData.head.rotation.x < -.15);
  assert.ok(near.fear > .1 && near.fearTime > 0, 'The nearby enemy must visibly react before impact');
  assert.ok(near.mesh.userData.leftArm.rotation.x < -.3 || near.mesh.userData.rightArm.rotation.x < -.3,
    'The actual arms must rise toward a protective pose');
  assert.equal(screened.fearTime, 0, 'A wall must block threat perception');
  assert.equal(distant.fearTime, 0, 'A jump must not freeze the distant horde');
  const initialCooldown = near.fearCooldown;
  for (let i = 0; i < 300; i++) api.updateEnemies(1 / 120);
  assert.equal(near.fearTime, 0, 'One sustained airborne threat must not repeatedly stun the same witness');
  assert.ok(near.fearCooldown < initialCooldown);
  assert.ok(near.fear < .02, 'The visible fear pose must settle after its short reaction');
});

test('level-one log starts in both hands and four real contacts defeat a starter enemy', () => {
  arena(1, {test: true});
  assert.equal(api.stance, 1);assert.equal(api.stanceTarget, 1);
  assert.equal(api.characterStats.hasShield, false);
  const enemy=stationaryEnemy('zombie',0,2.1);
  enemy.hp=enemy.maxHp=100;
  const names=[];
  for(let strike=0;strike<4;strike++){
    mouseAttack(true);mouseAttack(false);names.push(api.swing?.variant);
    playerSteps(.8);
    assert.equal(api.combatCombo.hits,strike+1,'Each real contact counts once; killing adds no second count');
    if(strike<3)assert.equal(enemy.dead,false);
  }
  assert.equal(names[0],'two-broadside');assert.equal(new Set(names).size,4,'The starter must not repeat a scripted 3-hit cycle');
  assert.equal(enemy.dead,true);assert.equal(api.kills,1);
  assert.equal(api.characterStats.canLightning,false);
});

test('hit combo rewards successful contact, carries XP fractions and ends when the player is hurt', () => {
  arena(1, {test: true});
  const enemy=stationaryEnemy('brute',0,2);enemy.hp=enemy.maxHp=10000;
  const before=audioEvents.length;
  for(let n=0;n<10;n++)api.hitEnemy(enemy,1,{x:0,z:1},0,0);
  assert.equal(api.combatCombo.hits,10);assert.equal(api.kills,0);
  assert.equal(combatFeedback.comboMultiplier(api.combatCombo),1.5);
  assert.equal(api.drops.filter(d=>d.kind==='wood').reduce((n,d)=>n+(d.amount||1),0),3);
  assert.equal(audioEvents.slice(before).filter(e=>e.name==='combo').length,2);
  api.drawFX();assert.equal(elements.get('comboHud').hidden,false);
  assert.equal(elements.get('comboCount').textContent,'10 HIT');
  assert.match(elements.get('comboReward').textContent,/1.5/);
  api.hitEnemy(enemy,0,{x:0,z:1},0,0);assert.equal(api.combatCombo.hits,10);
  const xpBefore=api.xp,scoreBefore=api.score;
  for(let n=0;n<2;n++){
    const target=stationaryEnemy('zombie',3+n,0);target.hp=1;api.hitEnemy(target,1,{x:1,z:0},0,0);
  }
  assert.equal(api.xp-xpBefore,3,'Two 1-XP defeats at x1.5 must award 3 XP');
  assert.ok(api.score-scoreBefore>=75);
  api.hurtPlayer(1,0,0,false);assert.equal(api.combatCombo.hits,0);
  api.drawFX();assert.equal(elements.get('comboHud').hidden,true);
});

test('scenery takes repeated physical log hits, uses surface audio and never builds an enemy combo', () => {
  arena(1, {test: true});
  const car=api.world.objects.find(o=>o.type==='car'),building=api.world.buildingObjects[0];
  const damage=Math.round(api.stats.power*1.25),carHp=car.hp,buildingHp=building.hp;
  const before=audioEvents.length;
  for(let n=0;n<3;n++){api.hurtObject(car,damage);api.hurtObject(building,damage);}
  assert.equal(car.dead,false);assert.equal(building.dead,false);
  assert.equal(car.hp,carHp-damage*3);assert.equal(building.hp,buildingHp-damage*3);
  assert.ok(Math.ceil(carHp/damage)>=9);assert.ok(Math.ceil(buildingHp/damage)>=15);
  assert.equal(api.combatCombo.hits,0);
  const impacts=audioEvents.slice(before).filter(e=>e.name==='hit');
  assert.ok(impacts.some(e=>e.details.material==='metal'&&e.details.weapon==='wood'));
  assert.ok(impacts.some(e=>e.details.material==='masonry'&&e.details.weapon==='wood'));
});

test('actual camera visibility fades an obstructing tower and restores its material and collision state', () => {
  arena(1, {test: true});
  const tower=api.world.buildingObjects.find(o=>o.h>20);
  Object.assign(tower,{x:5,z:7,w:6,d:6,h:24,renderActive:true});tower.mesh.position.set(5,tower.baseY,7);
  api.world.rebuildSpatialIndex();api.camera.position.set(13,23,18);
  for(let n=0;n<12;n++)api.updateBattleVisibility(.06);
  assert.ok(api.battleOccluders.has(tower));assert.equal(tower.dead,false);
  assert.ok(tower.materials.every(m=>m.opacity<.08));
  assert.equal(api.heroSilhouette.visible,true);
  assert.ok(api.world.nearObjects(5,7,0).includes(tower),'Fading must not erase physical obstacles');
  tower.x=-15;tower.z=-15;tower.mesh.position.set(tower.x,tower.baseY,tower.z);
  for(let n=0;n<30;n++)api.updateBattleVisibility(.06);
  assert.equal(api.battleOccluders.has(tower),false);assert.equal(tower.occlusionFade,0);
  for(const m of tower.materials){const b=m.userData.occlusionBaseline;assert.equal(m.opacity,b.opacity);assert.equal(m.depthWrite,b.depthWrite);}
  assert.equal(api.heroSilhouette.visible,false);
});

test('compact upgrade tabs preserve pending choices and close after the last selection', () => {
  arena();api.openUpgrade();api.toggleUpgradePanel(true);
  assert.equal(api.upgradeTab,'powers');assert.equal(elements.get('upgradeChoices').children.length,3);
  elements.get('upgradeGearTab').click();assert.equal(api.upgradeTab,'gear');
  assert.equal(elements.get('upgradePowerView').hidden,true);
  key('Digit1',true);key('Digit1',false);assert.equal(api.upgradeQueue.length,1);
  elements.get('upgradePowerTab').click();key('Digit1',true);key('Digit1',false);
  assert.equal(api.upgradeQueue.length,0);assert.equal(api.upgradePanelOpen,false);assert.equal(api.phase,'playing');
});

test('sound icon reports zero volume and a tap restores an audible saved setting', () => {
  arena();elements.get('volumeRange').oninput({target:{value:'0'}});
  assert.equal(elements.get('soundIcon').getAttribute('href'),'#a-sound-off');
  elements.get('soundButton').click();
  assert.equal(elements.get('soundIcon').getAttribute('href'),'#a-sound-on');
  const saved=JSON.parse(storage.get('ironfall.settings'));
  assert.equal(saved.muted,false);assert.ok(saved.volume>0);
});


test('LMB starts its stroke and swing audio on DOWN; release never duplicates the strike',()=>{
  arena(1,{test:false});api.poseHero(1);
  const enemy=stationaryEnemy('brute',0,2.2),hp=enemy.hp;
  const before=audioEvents.filter(e=>e.name==='swing').length;
  mouseAttack(true);
  const strike=api.swing;assert.ok(strike);assert.equal(strike.time,0);
  assert.equal(audioEvents.filter(e=>e.name==='swing').length,before+1);
  assert.equal(enemy.hp,hp,'Damage still waits for real physical contact');
  assert.equal(elements.get('attackIcon').getAttribute('href'),'#a-spin');
  assert.equal(elements.get('attackTouchIcon').getAttribute('href'),'#t-spin');
  playerSteps(.05);mouseAttack(false);
  assert.equal(api.swing,strike);assert.equal(elements.get('attackIcon').getAttribute('href'),'#a-swing');
  playerSteps(.6);assert.equal(enemy.hp,hp-strike.damage);
  assert.equal(audioEvents.filter(e=>e.name==='swing').length,before+1);
});

test('one held LMB keeps attacking without repeated clicks, and release stops the sustained damage',()=>{
  arena(1,{test:false});mouseAttack(true);playerSteps(.5);assert.ok(api.spin);
  const enemy=stationaryEnemy('brute',0,2.1);enemy.hp=enemy.maxHp=1000;
  playerSteps(2.7);assert.ok(enemy.hp<=1000-api.spin.damage*3);
  mouseAttack(false);const hp=enemy.hp;playerSteps(.8);assert.equal(enemy.hp,hp);assert.equal(api.swing,null);
});

test('click spam stores only one follow-up and never creates a delayed attack backlog',()=>{
  arena();const before=audioEvents.filter(e=>e.name==='swing').length;
  mouseAttack(true);mouseAttack(false);playerSteps(.06);
  for(let n=0;n<40;n++){mouseAttack(true);mouseAttack(false);}
  playerSteps(1.2);assert.equal(audioEvents.filter(e=>e.name==='swing').length-before,2);
  playerSteps(2);assert.equal(api.swing,null);assert.equal(api.spin,null);
});

test('the separate spin button is removed and desktop images have dedicated touch-icon alternatives',()=>{
  assert.equal(elements.has('chargeButton'),false);
  assert.equal((html.match(/class="action-icon"/g)||[]).length,7);
  assert.match(html,/id="attackTouchIcon" href="#t-attack"/);
  assert.match(html,/id="attackIcon" href="#a-swing"/);
});

test('wooden jump strikes cause modest damage only after a fresh airborne input',()=>{
  for(const armed of [false,true]){
    arena(1,{test:false});api.startLeap();playerSteps(.12);
    if(armed){mouseAttack(true);mouseAttack(false);assert.equal(api.leap.strike,true);}
    assert.equal(api.leap.slam,false);
    const enemy=stationaryEnemy('brute',api.player.x+api.leap.dir.x*2.6,api.player.z+api.leap.dir.z*2.6),hp=enemy.hp;
    playerSteps(.8);assert.equal(api.leap,null);
    if(armed){assert.ok(enemy.hp<hp);assert.ok(hp-enemy.hp<api.stats.power);}
    else assert.equal(enemy.hp,hp);
  }
});

test('building HP anchors remain on their facade instead of following the player around the building',()=>{
  arena();const building=placeObject('warehouse',0,8,{w:8,d:6,h:9,isBuilding:true});
  const first=api.buildingHudAnchor(building);
  api.player.x=-12;api.player.z=20;const moved=api.buildingHudAnchor(building);
  assert.deepEqual(first,moved);close(first.z,11.04,.001);close(first.x,0);
  assert.ok(first.y>1&&first.y<building.h);
  building.hurtTimer=2;building.hp=500;building.maxHp=700;api.drawFX();
  assert.ok(elements.get('fxCanvas').context.textCalls.some(call=>call.text==='500 / 700 HP'));
});


test('a hit applies HP, visible recoil, flash and impact sound in the same contact step',()=>{
  arena(1,{test:false});const enemy=stationaryEnemy('brute',0,2.0);
  const rotation=enemy.mesh.quaternion.clone(),hp=enemy.hp;
  mouseAttack(true);mouseAttack(false);const before=audioEvents.length;
  let contactTime=0;
  for(;enemy.hp===hp&&contactTime<.25;contactTime+=1/240)api.updatePlayer(1/240);
  assert.ok(enemy.hp<hp);assert.ok(contactTime<=.16,`Opening log contact took ${contactTime}`);
  assert.ok(enemy.mesh.quaternion.angleTo(rotation)>.08,'The contact frame must already contain a visible flinch');
  assert.ok(enemy.flash>.15);assert.ok(enemy.stagger>0);
  assert.equal(audioEvents.slice(before).filter(e=>e.name==='hit').length,1);
  assert.equal(api.combatCombo.hits,1);
});

test('holding from the opening wood strike reconnects on the next visible pass without a lost revolution',()=>{
  arena(1,{test:false});const enemy=stationaryEnemy('brute',0,2.1);enemy.hp=enemy.maxHp=10000;
  const hitTimes=[];let lastHp=enemy.hp,t=0;
  mouseAttack(true);
  playerSteps(1.5,1/240,dt=>{t+=dt;if(enemy.hp!==lastHp){hitTimes.push(t);lastHp=enemy.hp;}});
  mouseAttack(false);
  assert.ok(hitTimes.length>=3,`Only ${hitTimes.length} real contacts`);
  assert.ok(hitTimes[0]<.16);
  assert.ok(hitTimes[1]-hitTimes[0]<.7,`First repeat was delayed ${hitTimes[1]-hitTimes[0]}s`);
  for(let i=2;i<hitTimes.length;i++)assert.ok(hitTimes[i]-hitTimes[i-1]>=.52-1/120);
});

test('the held spin continues the opening leftward cut instead of reversing the body and weapon',()=>{
  arena(1,{test:false});api.poseHero(1);mouseAttack(true);playerSteps(.17);
  let previousHead=headAzimuth(),previousBody=api.hero.rotation.y;
  let spinHeadTravel=0,spinBodyTravel=0,maxReverse=0;
  playerSteps(.75,1/240,()=>{
    const head=headAzimuth(),body=api.hero.rotation.y;
    if(api.spin){const delta=angleStep(previousHead,head);maxReverse=Math.max(maxReverse,delta);spinHeadTravel+=delta;spinBodyTravel+=angleStep(previousBody,body);}
    previousHead=head;previousBody=body;
  });
  mouseAttack(false);
  assert.ok(spinBodyTravel<-Math.PI*2);assert.ok(spinHeadTravel<-Math.PI*2);
  assert.ok(maxReverse<.025,`Weapon snapped backwards by ${maxReverse} radians at the spin join`);
});

test('a building cannot fade only to reveal a nearby enemy or the idle weapon',()=>{
  arena(1,{test:false});api.camera.position.set(13,23,18);
  const building=api.world.buildingObjects.find(o=>o.h>20);
  Object.assign(building,{x:5,z:0,w:2,d:2,h:24,renderActive:true});
  // Put an enemy behind this wall while all body sight rays miss it.
  building.mesh.position.set(5,building.baseY,0);
  stationaryEnemy('brute',4,-2.0);
  for(let i=0;i<8;i++)api.updateBattleVisibility(.06);
  assert.equal(api.battleOccluders.has(building),false);
  assert.ok(!building.occlusionFade);
});

// Kicks use real poses, event handlers, world colliders and enemy/vehicle state.
function kickSimulation(seconds){for(let t=0;t<seconds;t+=1/240){api.updatePlayer(1/240);api.updateMovingVehicles(1/240);api.updateEnemies(1/240);}}
function resilientEnemy(type,x,z){const e=stationaryEnemy(type,x,z);e.hp=e.maxHp=1000;return e;}

test('E starts a visible kick and the extended foot applies exactly one synchronized hit',()=>{
 arena(1,{test:false});const e=resilientEnemy('zombie',.18,1.0),hp=e.hp;const before=audioEvents.length;
 key('KeyE',true);assert.ok(api.kick);assert.equal(e.hp,hp);assert.ok(audioEvents.slice(before).some(e=>e.name==='kick'));
 playerSteps(.08);assert.equal(e.hp,hp);assert.ok(api.hero.userData.rightLeg.userData.shin.rotation.x>.5);
 playerSteps(.15);assert.equal(e.hp,hp-kickPhysics.kickStats(1,0).damage);assert.ok(e.flash>.15&&e.vz>6);assert.ok(e.impact&&e.stagger>0);
 const after=e.hp;playerSteps(.25);assert.equal(e.hp,after);assert.equal(api.kick,null);key('KeyE',false);
 assert.equal(audioEvents.slice(before).filter(e=>e.name==='hit').length,1);
});
test('holding E cannot spam damage and the dedicated touch icon triggers the same action',()=>{
 arena(1,{test:false});key('KeyE',true);const first=api.kick;
 emit('keydown',{code:'KeyE',repeat:true});assert.equal(api.kick,first);key('KeyE',false);playerSteps(.45);
 assert.equal(api.startKick(),false);playerSteps(.30);
 pointerEvent('kickButton','pointerdown');assert.ok(api.kick);pointerEvent('kickButton','pointerup');playerSteps(.4);assert.equal(api.kick,null);
});
test('a kick cannot damage a distant or rear enemy or strike through the first wall',()=>{
 for(const fixture of ['far','rear','wall']){
  arena(1,{test:false});const e=resilientEnemy('zombie',.15,fixture==='far'?2.8:fixture==='rear'?-1:1.2);
  const wall=fixture==='wall'?placeObject('wall',0,.67,{w:3,d:.04,h:3,hp:1000,maxHp:1000}):null;
  api.startKick();playerSteps(.45);assert.equal(e.hp,1000,fixture);if(wall)assert.ok(wall.hp<1000);
 }
});
test('direct kicks give heavier enemies less displacement than light enemies',()=>{
 const speeds=[];for(const type of ['zombie','brute','titan']){
  arena(1,{test:false});const e=resilientEnemy(type,.15,1.0);api.startKick();playerSteps(.23);assert.ok(e.hp<1000);speeds.push(Math.hypot(e.vx,e.vz));
 }
 assert.ok(speeds[0]>speeds[1]*2&&speeds[1]>speeds[2]*2);
});
test('a launched light enemy pushes another light enemy but only slows a much heavier enemy',()=>{
 for(const type of ['zombie','titan']){
  arena(1,{test:false});const front=resilientEnemy('zombie',.15,1.0),back=resilientEnemy(type,.15,1.0+frontRadius(type));
  api.startKick();let sawCollision=false;
  for(let t=0;t<.5;t+=1/240){api.updatePlayer(1/240);api.updateEnemies(1/240);if(back.hp<1000){sawCollision=true;break;}}
  assert.ok(sawCollision,`Kick never reached the ${type} behind`);
  if(type==='titan'){assert.ok(back.slowTime>0);assert.equal(back.stagger,0);assert.ok(Math.hypot(back.vx,back.vz)<1);assert.equal(back.kickFlight,null);}
  else{assert.ok(back.kickFlight);assert.ok(back.vz>1&&back.stagger>0);}
 }
 function frontRadius(type){return type==='titan'?1.65:1.1;}
});
test('wall impacts injure and stun launched enemies without repeated wall damage',()=>{
 arena(1,{test:false});const e=resilientEnemy('zombie',.15,1.0),wall=placeObject('wall',0,2.35,{w:4,d:.08,h:3,hp:1000,maxHp:1000});
 api.startKick();kickSimulation(.42);
 assert.ok(e.hp<1000-kickPhysics.kickStats(1,0).damage);assert.ok(e.stunTime>0);assert.ok(wall.hp<1000);assert.ok(e.z<wall.z-wall.d/2);
 const hp=wall.hp;api.updateEnemies(.15);assert.equal(wall.hp,hp);
});
test('base kick damages cars but only an upgraded kick translates their real collider and model',()=>{
 for(const upgraded of [false,true]){
  arena(1,{test:false});if(upgraded)api.levels.kick=2;
  const car=placeObject('car',0,2.25,{w:1.8,d:2.8,h:1.4,hp:1000,maxHp:1000});const oldZ=car.z;
  api.startKick();playerSteps(.25);assert.ok(car.hp<1000);
  for(let t=0;t<.6;t+=1/120)api.updateMovingVehicles(1/120);
  if(upgraded){assert.ok(car.z>oldZ+.4);close(car.mesh.position.z,car.z);assert.ok(api.world.nearObjects(car.x,car.z,0).includes(car));}
  else{close(car.z,oldZ);assert.equal(api.movingVehicles.has(car),false);}
 }
});
test('kicked cars hurt and shove enemies at the car body, not at the player',()=>{
 arena(1,{test:false});api.levels.kick=4;
 const car=placeObject('car',0,2.25,{w:1.8,d:2.8,h:1.4,hp:1000,maxHp:1000});const e=resilientEnemy('zombie',.1,4.38);
 api.startKick();let collision=false;
 for(let t=0;t<1;t+=1/240){api.updatePlayer(1/240);api.updateMovingVehicles(1/240);api.updateEnemies(1/240);if(e.hp<1000){collision=true;break;}}
 assert.ok(collision);assert.ok(e.kickFlight);assert.ok(e.vz>1);assert.ok(car.z>2.3);assert.ok(car.hp<1000);
});
test('a kicked car hits a thin building wall once and never moves the building or tunnels through it',()=>{
 arena(1,{test:false});api.levels.kick=5;
 const car=placeObject('car',0,2.25,{w:1.8,d:2.8,h:1.4,hp:1000,maxHp:1000});const wall=placeObject('wall',0,4.25,{w:6,d:.04,h:3,hp:1000,maxHp:1000});
 api.startKick();playerSteps(.25);for(let i=0;i<80;i++)api.updateMovingVehicles(1/60);
 assert.ok(wall.hp<1000);close(wall.z,4.25);assert.ok(car.z+car.d/2<=wall.z-wall.d/2+.001);assert.ok(car.hp<1000-kickPhysics.kickStats(1,5).damage);
 const hp=wall.hp;for(let i=0;i<80;i++)api.updateMovingVehicles(1/60);assert.equal(wall.hp,hp);
});
test('pause cancels a kick, jump can interrupt it, and knees return to the walking rig',()=>{
 arena(1,{test:false});api.startKick();playerSteps(.10);api.pauseGame();assert.equal(api.kick,null);
 api.setPhase('playing');playerSteps(.75);api.startKick();assert.ok(api.kick);api.startLeap();assert.equal(api.kick,null);assert.ok(api.leap);playerSteps(1);api.poseHero(.1);
 close(api.hero.userData.leftLeg.userData.shin.rotation.x,0);close(api.hero.userData.rightLeg.userData.shin.rotation.x,0);
});
test('enemies display their level at full health using the level tier colour',()=>{
 arena(1,{test:false});const a=stationaryEnemy('zombie',0,3),b=stationaryEnemy('titan',3,3);b.level=15;
 api.drawFX();const calls=elements.get('fxCanvas').context.textCalls;
 assert.ok(calls.some(c=>c.text==='LV '+a.level));assert.ok(calls.some(c=>c.text.startsWith('LV 15')));
 assert.notEqual(kickPhysics.enemyHealthColor(a.level),kickPhysics.enemyHealthColor(b.level));
 assert.ok(calls.some(c=>c.text.startsWith('LV 15')&&c.color===kickPhysics.enemyHealthColor(15)));
});

test('a light body collision slows the boss without cancelling its attack or launching it',()=>{
 arena(1,{test:false});api.spawnBoss();const b=api.boss;Object.assign(b,{x:.15,z:3.6,y:0,state:'windup',timer:2,hp:10000,maxHp:10000});b.mesh.position.set(b.x,0,b.z);
 const e=resilientEnemy('zombie',.15,1.0);api.startKick();let hit=false;
 for(let t=0;t<.8;t+=1/240){api.updatePlayer(1/240);api.updateEnemies(1/240);if(b.hp<10000){hit=true;break;}}
 assert.ok(hit);assert.ok(b.slowTime>0);assert.equal(b.state,'windup');assert.ok(Math.hypot(b.vx,b.vz)<1);assert.equal(b.stagger,0);
 api.drawFX();assert.ok(elements.get('fxCanvas').context.textCalls.some(c=>c.text.startsWith('LV '+b.level+' · ΚΟΛΟΣΣΟΣ')));
});
test('kick rank persists with the normal character checkpoint',()=>{
 arena(1,{test:false});api.levels.kick=3;api.persistCharacter();const saved=JSON.parse(storage.get('ironfall.character'));
 assert.equal(saved.levels.kick,3);
});

// combat7 regressions: actual input, articulated fists, thrown geometry,
// persisted stats and toggleable assistance, rather than mocked game actions.
function unarmedArena(){
 arena(1,{test:false});api.settings.throwAutoLock=false;
 aimAt(0,14);api.startThrow();playerSteps(.32);
 assert.ok(api.throwFlight);assert.equal(api.hero.userData.weaponHeld,false);
 playerSteps(2);assert.ok(api.throwFlight?.grounded);
 api.setFacing(0,1);api.pointer.active=false;api.poseHero(.1);
}
test('unarmed LMB punches on contact with a real hand, not a hidden hammer',()=>{
 unarmedArena();const e=resilientEnemy('zombie',-.08,1.05),before=audioEvents.length;
 mouseAttack(true);assert.ok(api.punch);assert.equal(api.swing,null);assert.equal(api.spin,null);assert.equal(e.hp,1000);
 playerSteps(.035);assert.equal(e.hp,1000);const hand=api.punch.hand;
 playerSteps(.14);assert.ok(e.hp<1000);assert.ok(e.flash>0&&e.impact);assert.equal(api.hero.userData.hammerPivot.visible,false);
 assert.ok(worldPosition(api.hero.userData[hand+'Grip']).z>.65);
 mouseAttack(false);playerSteps(.3);const hp=e.hp;playerSteps(.4);assert.equal(e.hp,hp);
 assert.equal(audioEvents.slice(before).filter(e=>e.name==='hit').length,1);
 assert.ok(audioEvents.slice(before).some(e=>e.name==='punch'));
 assert.equal(elements.get('attackIcon').getAttribute('href'),'#a-punch');
 assert.equal(elements.get('attackTouchIcon').getAttribute('href'),'#t-punch');
 api.updateHUD();assert.match(elements.get('chargeText').textContent,/ΓΡΟΘΙΕΣ/);
 assert.match(elements.get('stanceValue').textContent,/ΑΟΠΛΟΣ/);
 assert.equal(elements.get('chargeFill').style.width,'0%');
});
test('holding unarmed attack alternates fists and releasing stops without an extra strike',()=>{
 unarmedArena();const e=resilientEnemy('zombie',0,1),hands=new Set(),start=audioEvents.length;
 mouseAttack(true);playerSteps(1.2,1/120,()=>{if(api.punch)hands.add(api.punch.hand);});
 assert.deepEqual([...hands].sort(),['left','right']);assert.equal(api.spin,null);
 assert.ok(audioEvents.slice(start).filter(e=>e.name==='hit').length>=3);
 mouseAttack(false);playerSteps(.4);const hp=e.hp;playerSteps(.7);assert.equal(e.hp,hp);assert.equal(api.punch,null);
});
test('unarmed kick interrupts punching and still applies mass-aware knockback',()=>{
 unarmedArena();const e=resilientEnemy('zombie',.15,1.0);
 mouseAttack(true);playerSteps(.02);key('KeyE',true);key('KeyE',false);
 assert.equal(api.punch,null);assert.ok(api.kick);playerSteps(.25);
 assert.ok(e.hp<1000&&e.vz>5);assert.equal(api.hero.userData.weaponHeld,false);mouseAttack(false);
});
test('unarmed fists do not reach rear/far targets or punch through a blocking wall',()=>{
 for(const fixture of ['far','rear','wall']){
  unarmedArena();const e=resilientEnemy('zombie',0,fixture==='far'?3:fixture==='rear'?-1:1.2);
  const wall=fixture==='wall'?placeObject('wall',0,.6,{w:3,d:.1,h:3,hp:1000,maxHp:1000}):null;
  mouseAttack(true);mouseAttack(false);playerSteps(.35);assert.equal(e.hp,1000,fixture);if(wall)assert.ok(wall.hp<1000);
 }
});
test('unarmed dodge/jump remain usable and a returning pickup cancels any fist pose',()=>{
 unarmedArena();mouseAttack(true);playerSteps(.03);assert.ok(api.dodge());assert.equal(api.punch,null);mouseAttack(false);
 playerSteps(.3);assert.ok(api.startLeap());playerSteps(1.2);
 const h=api.throwFlight;assert.ok(h?.grounded);api.player.x=h.x;api.player.z=h.z;
 api.updatePlayer(1/120);assert.equal(api.throwFlight,null);assert.equal(api.punch,null);assert.equal(api.hero.userData.weaponHeld,true);
 api.poseHero(.1);api.hero.updateMatrixWorld(true);
 assert.ok(worldPosition(api.hero.userData.rightGrip).distanceTo(worldPosition(api.hero.userData.rightGripAnchor))<1e-5);
});
test('pausing an unarmed attack clears the hold and prevents phantom damage on resume',()=>{
 unarmedArena();const e=resilientEnemy('zombie',0,1);mouseAttack(true);playerSteps(.025);
 api.pauseGame();assert.equal(api.punch,null);api.setPhase('playing');playerSteps(.5);assert.equal(e.hp,1000);
});
test('a log beside a parked car rests entirely outside the collider and is reachable at its edge',()=>{
 arena(1,{test:false});api.settings.throwAutoLock=false;
 const car=placeObject('car',0,8,{w:2,d:3,h:1.55,hp:3000,maxHp:3000});
 aimAt(0,12);api.startThrow();playerSteps(2);
 const h=api.throwFlight;assert.ok(h?.grounded);const bbox=new THREE.Box3().setFromObject(h.mesh);
 assert.ok(bbox.max.x<car.x-car.w/2||bbox.min.x>car.x+car.w/2||bbox.max.z<car.z-car.d/2||bbox.min.z>car.z+car.d/2);
 assert.ok(combatTools.restSpotClear(h,h.restFootprint,[car],core.BOUNDS));
 const edge=combatTools.nearestPickupPoint({x:h.x,z:h.z-5},h,h.restFootprint);
 api.player.x=edge.x;api.player.z=edge.z-.6;api.updatePlayer(1/120);
 assert.equal(api.throwFlight,null);assert.equal(api.hero.userData.weaponHeld,true);
});
test('a car moved onto a grounded log triggers safe repositioning, not merged geometry',()=>{
 unarmedArena();const h=api.throwFlight,car=placeObject('car',h.x,h.z,{w:2,d:3,h:1.5,hp:3000,maxHp:3000});
 api.updateThrownHammer(.12);assert.ok(h.grounded);assert.ok(combatTools.restSpotClear(h,h.restFootprint,[car],core.BOUNDS));
 const box=new THREE.Box3().setFromObject(h.mesh);assert.ok(box.max.x<car.x-car.w/2||box.min.x>car.x+car.w/2||box.max.z<car.z-car.d/2||box.min.z>car.z+car.d/2);
});
test('auto targeting is enabled initially, toggles persist and manual throws keep their chosen direction',()=>{
 arena(1,{test:false});assert.equal(api.settings.throwAutoLock,true);
 const enemy=resilientEnemy('zombie',2,7);aimAt(0,12);assert.equal(api.chooseThrowLock(api.aim),enemy);
 elements.get('throwAutoLockToggle').onchange({target:{checked:false}});
 assert.equal(JSON.parse(storage.get('ironfall.settings')).throwAutoLock,false);
 api.startThrow();assert.equal(api.throwWindup.target,null);close(api.throwWindup.dir.x,0,.01);
 playerSteps(1);assert.equal(enemy.hp,1000);
 elements.get('throwAutoLockToggle').onchange({target:{checked:true}});assert.equal(JSON.parse(storage.get('ironfall.settings')).throwAutoLock,true);
});
test('assisted wooden throw physically hits its selected off-axis enemy without homing back',()=>{
 arena(1,{test:false});const enemy=resilientEnemy('zombie',2,7);aimAt(0,12);
 api.startThrow();assert.equal(api.throwWindup.target,enemy);
 playerSteps(1.5);assert.ok(enemy.hp<1000);assert.ok(api.throwFlight?.grounded);assert.equal(api.throwFlight.returning,false);
});
test('auto throw cannot select an enemy behind a parked car or a wall',()=>{
 for(const type of ['car','wall']){
  arena(1,{test:false});const enemy=resilientEnemy('zombie',0,7);
  placeObject(type,0,3,{w:5,d:1,h:3,hp:3000,maxHp:3000});aimAt(0,12);
  assert.equal(api.chooseThrowLock(api.aim),null);api.startThrow();assert.equal(api.throwWindup.target,null);
  playerSteps(1.5);assert.equal(enemy.hp,1000);
 }
});
test('turning off auto assist suppresses automatic target changes on ricochet',()=>{
 arena();const a=resilientEnemy('zombie',0,5),b=resilientEnemy('zombie',4,5);
 api.settings.throwAutoLock=false;aimAt(0,12);api.startThrow();playerSteps(2);
 assert.ok(a.hp<1000);assert.equal(b.hp,1000);assert.equal(api.throwFlight,null);
});
test('permanent level bonuses update max HP, heal only the added capacity, and survive resume',()=>{
 arena(1,{test:false});api.player.hp=70;const before=api.stats.power;
 api.gainXP(characterProgression.xpForNextLevel(1));assert.equal(api.level,2);
 assert.equal(api.stats.power,before+2);assert.equal(api.player.maxHp,128);assert.equal(api.player.hp,78);
 const saved=JSON.parse(storage.get('ironfall.character'));assert.equal(saved.character.level,2);
 api.startGame(1,{resume:true});assert.equal(api.player.maxHp,128);assert.equal(api.stats.power,before+2);
 for(let i=0;i<4;i++)api.applyStats();assert.equal(api.player.maxHp,128);assert.equal(api.stats.power,before+2);
 api.renderCharacterProgress();assert.match(elements.get('permanentStats').textContent,/\+2/);assert.match(elements.get('permanentStats').textContent,/\+8/);
});
test('kick opening rewards the next different attack only once, without boosting repeated kicks',()=>{
 arena(1,{test:false});const enemy=resilientEnemy('zombie',.15,1);api.startKick();playerSteps(.22);
 assert.ok(enemy.openUntil>api.elapsed);const before=enemy.hp;
 api.hitEnemy(enemy,20,{x:0,z:1},1,0,null,{weapon:'wood'});assert.equal(enemy.hp,before-25);
 api.hitEnemy(enemy,20,{x:0,z:1},1,0,null,{weapon:'wood'});assert.equal(enemy.hp,before-45);
 enemy.openUntil=api.elapsed+1;api.hitEnemy(enemy,20,{x:0,z:1},1,0,null,{weapon:'foot'});assert.equal(enemy.hp,before-65);
});
test('dash primes one normal blow rather than buffing every spin revolution',()=>{
 arena(1,{test:false});assert.ok(api.dodge());playerSteps(.25);api.primeSwing(0);api.beginSwing();
 assert.ok(api.swing?.dashBoost);assert.equal(api.dashFollowup,0);
 assert.equal(api.swing.damage,Math.round(Math.round(api.stats.power*1.25)*1.25));
});

test('actual weapon damage transitions building stages once, and collapse releases rendered chunks',()=>{
 reset(1,{test:false});const o=api.world.objects.find(o=>o.isBuilding);const point={x:o.x+o.w/2,y:1.4,z:o.z};
 api.hurtObject(o,o.maxHp*.21,0,point,'wood');assert.equal(o.destruction.stage,2);
 assert.ok(api.destruction.debris.length>0);const removed=o.destruction.removedIds.length;
 api.hurtObject(o,1,0,point,'wood');assert.equal(o.destruction.removedIds.length,removed);
 api.hurtObject(o,o.maxHp*.31,0,point,'wood');assert.equal(o.destruction.stage,3);
 assert.ok(audioEvents.some(e=>e.name==='buildingFracture'));
 api.hurtObject(o,o.maxHp,0,point,'wood');assert.equal(o.dead,true);assert.equal(o.mesh.visible,false);
 assert.equal(o.destruction.stage,6);assert.ok(audioEvents.some(e=>e.name==='buildingCollapse'));
 assert.ok(!api.world.nearObjects(o.x,o.z,.1).includes(o));
});

test('actual low-damage car hits activate one alarm before any panel comes off; reset clears it',()=>{
 reset(1,{test:false});const car=api.world.objects.find(o=>o.type==='car');
 api.hurtObject(car,1,0,null,'fist');api.hurtObject(car,1,0,null,'foot');
 assert.equal(car.destruction,undefined);assert.equal(api.destruction.alarms.size,1);
 api.destruction.update(.1,{x:car.x,z:car.z});assert.ok(audioEvents.some(e=>e.name==='carAlarm'));
 const old=api.destruction;reset(1,{test:false});assert.equal(old.disposed,true);assert.equal(old.alarms.size,0);assert.equal(old.debris.length,0);
});


// menu9: the default is a deliberately latched aim, not a double-click timer.
test('tap mode R enters aim on first press and launches only on a second fresh press',()=>{
 arena(1);api.settings.throwMode='tap';
 key('KeyR',true);assert.ok(api.touchThrowAim);assert.equal(api.throwWindup,null);
 key('KeyR',false);playerSteps(.8);assert.ok(api.touchThrowAim);assert.equal(api.throwFlight,null);
 emit('keydown',{code:'KeyR',repeat:true});assert.equal(api.throwWindup,null);
 key('KeyR',true);assert.equal(api.touchThrowAim,null);assert.ok(api.throwWindup);key('KeyR',false);
 playerSteps(.5);assert.ok(api.throwFlight);assert.equal(api.hero.userData.weaponHeld,false);
});
test('tap mode works on the actual touch tile and capture release cannot cancel the latched target',()=>{
 touchArena(()=>{
  api.settings.throwMode='tap';throwTouch('pointerdown');throwTouch('pointerup');
  throwTouch('lostpointercapture');assert.ok(api.touchThrowAim);assert.equal(api.throwWindup,null);
  playerSteps(.4);throwTouch('pointerdown',0,0,303);assert.ok(api.throwWindup);throwTouch('pointerup',0,0,303);
  assert.equal(api.touchThrowAim,null);playerSteps(.35);assert.ok(api.throwFlight);
 });
});
test('the mouse control tile follows tap-confirm without duplicating the release',()=>{
 arena();api.settings.throwMode='tap';
 const p={pointerType:'mouse',pointerId:97,button:0,buttons:1};
 pointerEvent('throwButton','pointerdown',p);pointerEvent('throwButton','pointerup',{...p,buttons:0});
 assert.ok(api.touchThrowAim);assert.equal(api.throwWindup,null);
 pointerEvent('throwButton','pointerdown',p);const windup=api.throwWindup;assert.ok(windup);
 pointerEvent('throwButton','pointerup',{...p,buttons:0});assert.equal(api.throwWindup,windup);
});
test('Escape cancels tap targeting before pausing and never releases a phantom weapon',()=>{
 arena();api.settings.throwMode='tap';key('KeyR',true);key('KeyR',false);
 key('Escape',true);key('Escape',false);assert.equal(api.phase,'playing');assert.equal(api.touchThrowAim,null);
 playerSteps(.6);assert.equal(api.throwWindup,null);assert.equal(api.throwFlight,null);
 key('Escape',true);key('Escape',false);assert.equal(api.phase,'paused');
});
test('switching throw mode persists and cancels an existing latched gesture',()=>{
 arena();api.settings.throwMode='tap';key('KeyR',true);key('KeyR',false);
 elements.get('throwModeSelect').onchange({target:{value:'hold'}});
 assert.equal(api.settings.throwMode,'hold');assert.equal(api.touchThrowAim,null);
 assert.equal(JSON.parse(storage.get('ironfall.settings')).throwMode,'hold');
 key('KeyR',true);playerSteps(.2);assert.ok(api.touchThrowAim);assert.equal(api.throwWindup,null);
 key('KeyR',false);assert.ok(api.throwWindup);
});
test('an attack or loss of focus cancels latched aim without delayed throw',()=>{
 arena();api.settings.throwMode='tap';key('KeyR',true);key('KeyR',false);api.startKick();
 assert.equal(api.touchThrowAim,null);assert.ok(api.kick);playerSteps(.65);assert.equal(api.throwFlight,null);
 key('KeyR',true);key('KeyR',false);emit('blur');assert.equal(api.phase,'paused');assert.equal(api.touchThrowAim,null);
 api.setPhase('playing');playerSteps(.5);assert.equal(api.throwFlight,null);
});
test('a targeted enemy is marked only during aiming; switching auto-lock off leaves manual aiming',()=>{
 arena();api.settings.throwMode='tap';const enemy=stationaryEnemy('raider',.7,5);
 api.updateAim();assert.equal(api.throwLock,null);
 key('KeyR',true);key('KeyR',false);api.updateAim();assert.equal(api.throwLock,enemy);
 const ctx=elements.get('fxCanvas').context;ctx.textCalls.length=0;api.drawAim();
 assert.ok(ctx.textCalls.some(call=>call.text==='ΣΤΟΧΟΣ ΡΙΨΗΣ'));
 elements.get('throwAutoLockToggle').onchange({target:{checked:false}});api.updateAim();assert.equal(api.throwLock,null);
 ctx.textCalls.length=0;api.drawAim();assert.ok(!ctx.textCalls.some(call=>call.text==='ΣΤΟΧΟΣ ΡΙΨΗΣ'));
 assert.ok(api.touchThrowAim);key('Escape',true);key('Escape',false);
 ctx.textCalls.length=0;api.drawAim();assert.equal(ctx.textCalls.length,0);
});
test('tap targeting refreshes a dead lock before confirmation',()=>{
 arena();api.settings.throwMode='tap';const first=stationaryEnemy('raider',0,5),second=stationaryEnemy('raider',1.4,6);
 key('KeyR',true);key('KeyR',false);assert.equal(api.throwLock,first);first.dead=true;first.hp=0;
 api.updateAim();assert.equal(api.throwLock,second);key('KeyR',true);key('KeyR',false);assert.ok(api.throwWindup);
 assert.ok(api.throwWindup.dir.x>0,'The committed direction follows the surviving visible target');
});
test('menu shows four real destinations and settings return without starting a run',()=>{
 api.clearInput();api.setPhase('menu');api.updateSavedCharacter();
 for(const id of ['startButton','resumeCharacterButton','roundSelectButton','menuSettingsButton'])assert.ok(elements.has(id));
 assert.equal(elements.get('hud').hidden,true);elements.get('menuSettingsButton').click();
 assert.equal(api.phase,'settings');assert.equal(elements.get('menu').hidden,false);assert.equal(elements.get('hud').hidden,true);
 elements.get('closeSettingsButton').click();assert.equal(api.phase,'menu');
 elements.get('roundSelectButton').click();assert.equal(api.phase,'rounds');assert.equal(elements.get('roundSelectMenu').hidden,false);
 key('Escape',true);key('Escape',false);assert.equal(api.phase,'menu');
});
test('New Round and Continue retain earned stats but choose first and saved round respectively',()=>{
 arena(1,{test:false});api.character.xp=3;api.beginWave(3);api.persistCharacter();
 const before=JSON.parse(storage.get('ironfall.character'));assert.equal(before.run.round,3);
 api.setPhase('menu');api.updateSavedCharacter();assert.equal(elements.get('resumeCharacterButton').disabled,false);
 elements.get('resumeCharacterButton').click();assert.equal(api.round,3);assert.equal(api.character.xp,3);
 api.setPhase('menu');elements.get('startButton').click();assert.equal(api.round,1);assert.equal(api.character.xp,3);
 assert.equal(api.character.weaponTier,before.character.weaponTier);assert.ok(api.highestRound>=3);
});
test('round selection lists only earned rounds and survives returning from a boss victory',()=>{
 arena(1,{test:false});const next=api.highestRound+1;api.setPhase('victory');api.beginWave(next);
 assert.equal(api.highestRound,next);assert.equal(Number(JSON.parse(storage.get('ironfall.rounds'))),next);
 api.setPhase('menu');api.openRounds();const choices=elements.get('roundChoices').children.filter(b=>b.className==='round-choice');
 assert.ok(choices.length>0);for(const button of choices){const n=Number(button.children[1].textContent);assert.ok(n<=api.highestRound);}
 choices[0].click();assert.equal(api.phase,'playing');assert.equal(api.round,1);
});
test('testing a character level cannot unlock rounds or overwrite the real menu checkpoint',()=>{
 const before=storage.get('ironfall.character'),highest=api.highestRound;
 arena(10,{test:true});api.beginWave(highest+20);api.gainXP(10);api.persistCharacter();
 assert.equal(api.highestRound,highest);assert.equal(storage.get('ironfall.character'),before);
});
test('the production movement uses a real low roof and falls locally when its support is destroyed',()=>{
 arena(1);const roof=placeObject('townhouse',0,0,{w:3,d:3,h:1.2,hp:1000,maxHp:1000});
 Object.assign(api.player,{x:0,z:0,y:3,vy:-2,vx:0,vz:0});
 playerSteps(.6);close(api.player.y,1.2,.001);
 roof.dead=true;playerSteps(.6);assert.ok(api.player.y<.2);close(api.player.x,0,.001);close(api.player.z,0,.001);
});
test('a sign-like low ceiling stops a rising jump at its actual underside',()=>{
 arena(1);const ceiling=placeObject('townhouse',0,0,{w:4,d:4,h:.2,hp:1000,maxHp:1000});
 ceiling.mesh.children[0].position.y=2.4;api.startLeap();let max=0;
 playerSteps(.65,1/120,()=>{max=Math.max(max,api.player.y);});
 assert.ok(max<.7,`Head passed through the underside: feet reached ${max}`);assert.ok(api.player.y<.1);
});
