import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../audio.js';

// These tests exercise input/lifecycle and bounded scheduling, not device
// loudness. A real OfflineAudioContext render separately verifies nonzero PCM.
class Events {
  constructor() { this.events = new Map(); this.hidden = false; }
  addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
  removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
  emit(name) { for (const fn of this.events.get(name) || []) fn({ type: name }); }
  count() { return [...this.events.values()].reduce((n, callbacks) => n + callbacks.size, 0); }
}
class Param {
  constructor() { this.value = 0; this.calls = []; }
  record(kind, value, time) {
    assert.ok(Number.isFinite(value) && Number.isFinite(time) && time >= 0, 'Invalid audio automation');
    if (kind === 'exponential') assert.ok(value > 0, 'An exponential envelope cannot cross zero');
    this.calls.push({ kind, value, time }); this.value = value;
  }
  setValueAtTime(value, time) { this.record('set', value, time); }
  exponentialRampToValueAtTime(value, time) { this.record('exponential', value, time); }
  setTargetAtTime(value, time) { this.record('target', value, time); }
}
class Node {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind; this.connections = new Set(); this.disconnected = false;
    for (const p of ['gain', 'frequency', 'Q', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[p] = new Param();
    ctx.nodes.push(this);
  }
  connect(other) { this.connections.add(other); return other; }
  disconnect() { this.connections.clear(); this.disconnected = true; }
  start(time = 0) { assert.ok(Number.isFinite(time) && time >= 0); this.started = time; }
  stop(time = 0) { assert.ok(Number.isFinite(time) && time >= 0); this.stopped = time; }
  finish() { this.onended?.(); }
}
class Context {
  static made = [];
  constructor() {
    Context.made.push(this); this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.nodes = [];
    this.resumeCalls = 0; this.suspendCalls = 0; this.closeCalls = 0; this.destination = {};
  }
  change(state) { this.state = state; this.onstatechange?.(); }
  async resume() { this.resumeCalls++; if (this.failResume) throw new Error('Audio interrupted'); this.change('running'); }
  async suspend() { this.suspendCalls++; this.change('suspended'); }
  async close() { this.closeCalls++; this.change('closed'); }
  createGain() { return new Node(this, 'gain'); }
  createDynamicsCompressor() { return new Node(this, 'compressor'); }
  createBufferSource() { return new Node(this, 'buffer'); }
  createBiquadFilter() { return new Node(this, 'filter'); }
  createOscillator() { return new Node(this, 'oscillator'); }
  createBuffer(channels, frames) { const data = new Float32Array(frames); return { getChannelData: () => data }; }
}
function environment(t, { supported = true, session = true } = {}) {
  const descriptors = new Map(['window', 'document', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const document = new Events(), window = new Events(), audioSession = { type: 'auto' };
  if (supported) window.AudioContext = Context;
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: session ? { audioSession } : {}, configurable: true });
  Context.made = [];
  const audio = new GameAudio();
  t.after(() => {
    audio.dispose();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  return { audio, window, document, audioSession };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('menu music waits for a gesture, follows mute and backgrounding, and exits without stopping the game cue', async t => {
  const { audio, document } = environment(t);
  audio.bindUnlock(document);audio.setMenuActive(true);audio.update(.1);
  assert.equal(audio.ctx,null,'Entering the menu must not autoplay or create an audio context');
  document.emit('pointerdown');await flush();
  const ctx=audio.ctx;
  const advance=()=>{for(let i=0;i<6;i++){ctx.currentTime+=.1;audio.update(.1);}};
  advance();
  assert.ok(audio._menuSources.size>0,'An unlocked active menu schedules its own score');
  const firstScore=[...audio._menuSources];
  audio.toggle();advance();
  assert.equal(audio._menuSources.size,0);
  assert.ok(firstScore.every(node=>node.disconnected),'Mute frees the score nodes');
  const mutedNodes=ctx.nodes.length;advance();
  assert.equal(ctx.nodes.length,mutedNodes,'Muted updates cannot keep allocating music');
  audio.toggle();await flush();advance();
  assert.ok(audio._menuSources.size>0,'Unmuting resumes the menu score');
  document.hidden=true;document.emit('visibilitychange');await flush();
  assert.equal(audio._menuSources.size,0);assert.equal(ctx.state,'suspended');
  const backgroundNodes=ctx.nodes.length;advance();assert.equal(ctx.nodes.length,backgroundNodes);
  document.hidden=false;document.emit('visibilitychange');await flush();advance();
  const score=[...audio._menuSources];assert.ok(score.length>0);
  const beforeStart=new Set(audio._sources);audio.play('start');
  const gameCue=[...audio._sources].filter(node=>!beforeStart.has(node));assert.ok(gameCue.length>0);
  audio.setMenuActive(false);
  assert.equal(audio._menuSources.size,0);assert.ok(score.every(node=>node.disconnected));
  assert.ok(gameCue.every(node=>!node.disconnected&&audio._sources.has(node)),'Leaving the menu preserves the already scheduled game-start sound');
  const gameplayNodes=ctx.nodes.length;advance();assert.equal(ctx.nodes.length,gameplayNodes,'Gameplay does not schedule menu music');
});

test('menu wood, steel and mechanism feedback have distinct voices and respect mute and rate limits',async t=>{
  const {audio}=environment(t);await audio.unlock();const ctx=audio.ctx,signatures=[];
  for(const name of ['menuWood','menuMetal','menuFocus','menuOpen','menuClose','menuPress','targetLock']){
    const start=ctx.nodes.length;ctx.currentTime+=1;
    assert.equal(audio.play(name,.5),true);
    assert.equal(audio.play(name,.5),false,'Rapid repeated interactions are bounded');
    signatures.push(ctx.nodes.slice(start).filter(n=>n.kind==='oscillator').map(n=>n.frequency.calls[0]?.value).join(','));
  }
  assert.equal(new Set(signatures).size,signatures.length,'Different physical interactions must not all use the same beep');
  audio.toggle();const nodes=ctx.nodes.length;
  for(const name of ['menuWood','menuMetal','menuPress','targetLock'])assert.equal(audio.play(name,.5),false);
  assert.equal(ctx.nodes.length,nodes,'Menu interactions cannot override mute');
});

test('audio waits for a gesture and recovers the same context from interrupted state', async t => {
  const { audio, document, audioSession } = environment(t);
  audio.bindUnlock(document); audio.bindUnlock(document);
  assert.equal(Context.made.length, 0, 'Binding must not autoplay or request audio focus');
  assert.equal(document.count(), 6, 'A second bind must not double listeners');
  document.emit('pointerdown'); await flush();
  const ctx = audio.ctx;
  assert.equal(ctx.resumeCalls, 1); assert.equal(audio.ready, true); assert.equal(audioSession.type, 'playback');
  ctx.change('interrupted'); assert.equal(audio.ready, false);
  document.emit('touchend'); await flush();
  assert.equal(audio.ctx, ctx); assert.equal(ctx.resumeCalls, 2); assert.equal(audio.ready, true);
  assert.equal(Context.made.length, 1);
});

test('failed resume is nonfatal, releases focus, and retries only after another interaction', async t => {
  const { audio, document, audioSession } = environment(t);
  await audio.unlock(); const ctx = audio.ctx; ctx.change('interrupted'); ctx.failResume = true;
  assert.equal(await audio.unlock(), false); assert.equal(audio.ready, false); assert.equal(audioSession.type, 'auto');
  const calls = ctx.resumeCalls;
  audio.update(.1); audio.play('hit', .5); await flush();
  assert.equal(ctx.resumeCalls, calls, 'Rendering must not poll a blocked audio device');
  ctx.failResume = false; audio.bindUnlock(document); document.emit('keydown'); await flush();
  assert.equal(audio.ready, true); assert.equal(ctx.resumeCalls, calls + 1);
});

test('a stalled interrupted resume cannot block the next gesture or accumulate unbounded primers', async t => {
  const { audio } = environment(t); await audio.unlock(); const ctx = audio.ctx;
  ctx.change('interrupted');
  ctx.resume = () => { ctx.resumeCalls++; return new Promise(() => {}); };
  for (let n = 0; n < 100; n++) void audio.unlock();
  assert.ok(audio._sources.size <= 64, 'Silent unlock buffers still count toward the budget');
  ctx.resume = Context.prototype.resume;
  assert.equal(await audio.unlock(), true, 'A fresh gesture must call resume again instead of awaiting the old promise');
  assert.equal(audio.ctx, ctx); assert.equal(audio.ready, true);
});

test('backgrounding stops transient sounds, yields focus, and resumes once when visible', async t => {
  const { audio, document, audioSession } = environment(t);
  audio.bindUnlock(document); await audio.unlock();
  audio.play('swing', .7, { variant: 'two-overhead', weapon: 'wood', exert: true, duration: .7 });
  audio.play('enemyHurt', .5, { type: 'zombie' });
  assert.ok(audio._sources.size > 0);
  const ctx = audio.ctx, transient = [...audio._sources];
  document.hidden = true; document.emit('visibilitychange'); await flush();
  assert.equal(audio.ready, false); assert.equal(ctx.state, 'suspended'); assert.equal(audioSession.type, 'auto');
  assert.equal(audio._sources.size, 0); assert.equal(audio._voices.size, 0);
  assert.ok(transient.every(node => node.disconnected));
  assert.equal(audio.play('hit', .5), false);
  const resumes = ctx.resumeCalls;
  document.hidden = false; document.emit('visibilitychange'); await flush();
  assert.equal(ctx.resumeCalls, resumes + 1); assert.equal(audio.ctx, ctx); assert.equal(audio.ready, true);
});

test('mute and zero volume suppress effects and never seize the audio session', async t => {
  const { audio, document, audioSession } = environment(t);
  audio.bindUnlock(document); audio.setVolume(0); document.emit('pointerdown'); await flush();
  assert.equal(audio.ctx, null); assert.equal(audioSession.type, 'auto'); assert.equal(audio.play('hit'), false);
  audio.setVolume(.6); await audio.unlock();
  audio.toggle(); const before = audio._sources.size;
  assert.equal(audio.play('hit'), false); assert.equal(audio._sources.size, before); assert.equal(audioSession.type, 'auto');
  document.hidden = true; document.emit('visibilitychange');
  document.hidden = false; document.emit('visibilitychange'); await flush();
  assert.equal(audio.muted, true); assert.equal(audio.ctx.state, 'suspended', 'Returning to the page must not override mute');
  audio.toggle(); await flush(); assert.equal(audio.muted, false); assert.equal(audio.ctx.state, 'running');
});

test('unsupported AudioContext and absent AudioSession fail gracefully', async t => {
  const { audio, window } = environment(t, { supported: false, session: false });
  assert.equal(await audio.unlock(), false); assert.equal(audio.play('hit'), false);
  window.webkitAudioContext = Context;
  assert.equal(await audio.unlock(), true); assert.equal(audio.play('hit', .2, { material: 'wood' }), true);
});

test('simultaneous contacts are surface-aware and repeated events are rate limited', async t => {
  const { audio } = environment(t); await audio.unlock();
  assert.equal(audio.play('hit', .4, { material: 'flesh', weapon: 'wood' }), true);
  assert.equal(audio.play('hit', .4, { material: 'flesh', weapon: 'wood' }), false);
  assert.equal(audio.play('hit', .4, { material: 'metal', weapon: 'wood' }), true,
    'A car hit in the same swing must not be swallowed by the enemy impact');
  audio.ctx.currentTime += .1;
  assert.equal(audio.play('hit', .4, { material: 'flesh', weapon: 'wood' }), true);
  assert.equal(audio.play('combo', .5, { tier: 2 }), true);
  audio.ctx.currentTime += .1; assert.equal(audio.play('combo', .5, { tier: 2 }), false);
});

test('intense mixed combat stays within the source and vocal budgets, and frees every node', async t => {
  const { audio, document, window, audioSession } = environment(t);
  audio.bindUnlock(document); await audio.unlock();
  const ctx = audio.ctx;
  for (let n = 0; n < 150; n++) {
    ctx.currentTime += .27;
    audio.play('hit', 1, { material: ['flesh', 'metal', 'masonry', 'wood'][n % 4], weapon: n%3===0?'barbed':'wood' });
    audio.play('swing', 1, { exert: true, duration: .7, variant: 'two-overhead' });
    audio.play('enemyHurt', 1, { type: 'zombie', fatal: true });
    assert.ok(audio._sources.size <= 64); assert.ok(audio._voices.size <= 2);
  }
  assert.ok(audio._sources.size > 0);
  audio.dispose(); audio.dispose();
  assert.equal(ctx.closeCalls, 1); assert.equal(audio._sources.size, 0); assert.equal(audio._cleanups.size, 0);
  assert.equal(audio._voices.size, 0); assert.ok(ctx.nodes.every(node => node.disconnected), 'All filters and gains need disposal too');
  assert.equal(document.count(), 0); assert.equal(window.count(), 0); assert.equal(audioSession.type, 'auto');
  assert.equal(await audio.unlock(), false); assert.equal(audio.play('hit'), false);
});

test('finished voices free their filters, and a closed context can be rebuilt without stale nodes', async t => {
  const { audio } = environment(t); await audio.unlock(); const old = audio.ctx;
  audio.play('exert', .4); assert.equal(audio._voices.size, 1);
  const voice = [...audio._voices][0]; voice.finish(); assert.equal(audio._voices.size, 0); assert.ok(voice.disconnected);
  await old.close(); assert.equal(audio.ready, false);
  assert.equal(await audio.unlock(), true); assert.notEqual(audio.ctx, old); assert.equal(Context.made.length, 2);
  assert.ok(old.nodes.every(node => node.disconnected));
  assert.equal(audio.play('hit', .7, { material: 'masonry' }), true);
});

test('recorded material impacts and human reactions use decoded buffers and free their nodes', async t => {
  const { audio } = environment(t); await audio.unlock();
  const flesh={duration:.18}, pain={duration:.32}, exert={duration:.21};
  audio.samples.buffers.set('flesh-1',flesh);audio.samples.buffers.set('pain-1',pain);audio.samples.buffers.set('exert-1',exert);
  audio.play('hit',.6,{material:'flesh',weapon:'wood'});
  assert.ok([...audio._sources].some(source=>source.buffer===flesh));
  audio.play('enemyHurt',.6,{type:'zombie'});
  const voice=[...audio._voices][0];assert.equal(voice.buffer,pain);assert.ok(voice.playbackRate.value<1);
  voice.finish();assert.equal(audio._voices.size,0);assert.ok(voice.disconnected);
  audio.play('exert',.5);assert.ok([...audio._voices].some(source=>source.buffer===exert));
  for(const source of [...audio._sources])source.finish();
  assert.equal(audio._sources.size,0);assert.equal(audio._cleanups.size,0);
});

test('dedicated audio controls own their click without capture-phase premature unlocking', async t=>{
  const {audio,document}=environment(t);audio.bindUnlock(document);
  for(const fn of document.events.get('pointerdown'))fn({target:{closest:()=>({})}});
  for(const fn of document.events.get('click'))fn({target:{closest:()=>({})}});
  assert.equal(Context.made.length,0);
  assert.equal(await audio.unlock(),true);assert.equal(audio.muted,false);
});

test('preview is audible scheduling, repeatable, and cancelled immediately by mute or disposal',async t=>{
  const {audio}=environment(t);assert.equal(await audio.preview(),true);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(audio._previewTimers.size,3);assert.ok(audio._sources.size>0);
  audio.toggle();assert.equal(audio._previewTimers.size,0);assert.equal(audio._sources.size,0);
  assert.equal(await audio.preview(),false,'Testing must not override explicit mute in the engine');
  audio.toggle();assert.equal(await audio.preview(),true);assert.equal(audio._previewTimers.size,4);
  audio.dispose();assert.equal(audio._previewTimers.size,0);assert.equal(audio._sources.size,0);
});

test('status changes distinguish blocked, playing, muted and background audio',async t=>{
  const {audio,document}=environment(t);const states=[];audio.onStatusChange=()=>states.push(audio.state);
  assert.equal(audio.state,'blocked');audio.bindUnlock(document);await audio.unlock();
  assert.equal(audio.state,'ready');audio.setVolume(0);assert.equal(audio.state,'muted');
  audio.setVolume(.7);document.hidden=true;document.emit('visibilitychange');await flush();
  assert.equal(audio.state,'background');assert.ok(states.includes('ready'));assert.ok(states.includes('muted'));assert.ok(states.includes('background'));
});

test('damage stages layer recorded foley and distinct bounded destruction sounds',async t=>{
 const {audio}=environment(t);await audio.unlock();
 for(const source of [...audio._sources])source.finish();
 const stone={duration:.35},metal={duration:.28};audio.samples.buffers.set('masonry-1',stone);audio.samples.buffers.set('metal-1',metal);
 for(const name of ['buildingFracture','buildingCollapse','carTear','carWreck','debrisLand']){
  audio.ctx.currentTime+=1;assert.equal(audio.play(name,.7,{stage:3,material:'metal'}),true);
  assert.ok([...audio._sources].some(s=>s.buffer===stone||s.buffer===metal));assert.ok(audio._sources.size<=64);
  audio.stopEnvironment();assert.equal(audio._sources.size,0);assert.equal(audio._environmentSources.size,0);
 }
});

test('alarm pulses differ by car and can stop individually without cancelling combat',async t=>{
 const {audio}=environment(t);await audio.unlock();
 audio.play('hit',.5,{material:'flesh'});const combat=new Set(audio._sources);
 for(let variant=0;variant<3;variant++)assert.equal(audio.play('carAlarm',.4,{variant,id:variant+1}),true);
 assert.equal(audio.play('carAlarm',.4,{variant:0,id:1}),false);
 const before=audio._environmentSources.size;audio.stopEnvironment(2);
 assert.ok(audio._environmentSources.size<before);assert.ok([...combat].every(s=>audio._sources.has(s)));
 audio.stopEnvironment();assert.equal(audio._environmentSources.size,0);assert.ok([...combat].every(s=>audio._sources.has(s)));
 audio.play('carAlarm',.4,{id:99});audio.toggle();assert.equal(audio._environmentSources.size,0);assert.equal(audio._sources.size,0);
});
