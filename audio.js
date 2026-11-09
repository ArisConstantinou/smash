import { RecordedSounds } from './audio-samples.js?v=20261109-rage';
// Recorded foley + human vocals, with lightweight procedural air/debris layers.
// All recordings are bundled locally; attribution is in assets/audio/CREDITS.md.
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));
const MAX_SOURCES = 64;
const METAL_VOICES = new Set(['robot', 'mech', 'siegeMech', 'boss']);
const ENVIRONMENT = new Set(['levelStorm','carAlarm','carTear','carWreck','buildingFracture','buildingCollapse','debrisLand']);
const SPACING = { menuFocus:.09,menuPress:.08,menuWood:.18,menuMetal:.18,menuOpen:.12,menuClose:.12,menuReady:.5,targetLock:.20,targetCancel:.1,carAlarm:.10, carTear:.15, carWreck:.22, buildingFracture:.16, buildingCollapse:.35, debrisLand:.095, hit: .045, break: .12, pickup: .075, hurt: .25, charge: .55, swing: .085, exert: .72, enemyHurt: .25, combo: .9 };

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = .6;
    this.muted = false;
    this.ready = false;
    this._ambient = null;
    this._sources = new Set();
    this._environmentSources = new Map();
    this._cleanups = new Map();
    this._voices = new Set();
    this._recent = new Map();
    this._bindings = [];
    this._time = 0;
    this._mixTime = 0;
    this._hidden = false;
    this._activated = false;
    this._disposed = false;
    this._session = null;
    this.samples = new RecordedSounds();
    this.onStatusChange = null;
    this._preview = 0;
    this._previewTimers = new Set();
    this._menuActive = false;
    this._menuSources = new Set();
    this._menuNextBeat = 0;
    this._menuStep = 0;
  }

  preload() { return this.samples.preload(); }
  _status() { this.onStatusChange?.(); }
  get sampleCount() { return this.samples.buffers.size; }
  get state() {
    if (this.muted || this.volume <= 0) return 'muted';
    if (this._hidden) return 'background';
    return this.ready && this.ctx?.state === 'running' ? 'ready' : 'blocked';
  }

  // Capture real input without consuming it. Keep these listeners after the
  // first tap: iOS can interrupt a running context after a call or app switch.
  bindUnlock(target = globalThis.document) {
    if (this._disposed || !target?.addEventListener || this._bindings.length) return;
    const bind = (node, name, handler, options) => {
      if (!node?.addEventListener) return;
      node.addEventListener(name, handler, options);
      this._bindings.push(() => node.removeEventListener(name, handler, options));
    };
    const gesture = event => {
      // Dedicated sound buttons must not unlock on pointerdown and then mute
      // themselves on click. Their click handlers own the whole action.
      if (event.target?.closest?.('[data-audio-control]')) return;
      if (!this.muted && this.volume > 0) void this.unlock();
    };
    for (const event of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) bind(target, event, gesture, { capture: true, passive: true });
    const visibility = () => {
      this._hidden = !!target.hidden;
      if (this._hidden) this._pauseForBackground();
      else if (this._activated && !this.muted && this.volume > 0) void this.unlock();
    };
    bind(target, 'visibilitychange', visibility);
    bind(globalThis.window, 'pagehide', () => { this._hidden = true; this._pauseForBackground(); });
    bind(globalThis.window, 'pageshow', () => {
      this._hidden = !!target.hidden;
      if (!this._hidden && this._activated && !this.muted && this.volume > 0) void this.unlock();
    });
    this._hidden = !!target.hidden;
  }

  _claimSession() {
    if (this.muted || this.volume <= 0 || this._hidden) return;
    // WebKit's default Web Audio session is ambient and follows the ringer
    // switch. Request playback for the explicitly enabled game sound only.
    // Feature detection keeps browsers without AudioSession fully supported.
    try {
      const session = globalThis.navigator?.audioSession;
      if (!session || this._session) return;
      this._session = { node: session, previous: session.type };
      session.type = 'playback';
    } catch (_) { this._session = null; }
  }

  _releaseSession() {
    if (!this._session) return;
    const { node, previous } = this._session;
    try { if (node.type === 'playback') node.type = previous || 'auto'; } catch (_) {}
    this._session = null;
  }

  _createContext() {
    const AudioContext = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext || globalThis.AudioContext;
    if (!AudioContext) return false;
    const ctx = this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume * .82;
    const limiter = this._limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 5;
    limiter.attack.value = .002;
    limiter.release.value = .12;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);
    this._noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    ctx.onstatechange = () => {
      if (this.ctx !== ctx || this._disposed) return;
      this.ready = ctx.state === 'running' && !this._hidden;
      if (this.ready) this._activated = true;
      this._status();
    };
    this._makeAmbience();
    return true;
  }

  async unlock() {
    if (this._disposed || this._hidden || this.muted || this.volume <= 0) return false;
    try {
      if (this.ctx?.state === 'closed') this._dropGraph();
      // Claim playback before creating/starting the graph, not afterward.
      this._claimSession();
      if (!this.ctx && !this._createContext()) { this._releaseSession(); this._status(); return false; }
      const ctx = this.ctx;
      if (ctx.state !== 'running') {
        // Call resume synchronously inside the gesture, including WebKit's
        // 'interrupted' state. Never reuse a possibly stuck resume promise.
        const resumed = ctx.resume();
        if (this._canAllocate()) {
          const primer = ctx.createBufferSource();
          primer.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
          primer.connect(this.master);
          this._register(primer);
          primer.start();
        }
        await resumed;
      }
      if (this.ctx !== ctx || this._disposed) return false;
      this.ready = ctx.state === 'running' && !this._hidden;
      if (this.ready) this._activated = true;
      else this._releaseSession();
      if (this.ready) void this.samples.decode(ctx).then(() => { if (!this._disposed) this._status(); });
      this._status();
      return this.ready;
    } catch (_) {
      // A blocked device or interruption must not prevent playing the game.
      this.ready = false;
      this._releaseSession();
      this._status();
      return false;
    }
  }

  _pauseForBackground() {
    this._cancelPreview();
    this.ready = false;
    this._stopTransientSources();
    this._releaseSession();
    if (this.ctx && this.ctx.state !== 'closed') {
      try { this.ctx.suspend().catch(() => {}); } catch (_) {}
    }
    this._status();
  }

  setVolume(value) {
    this.volume = clamp(value);
    this._applyVolume();
    if (this.volume <= 0) { this._cancelPreview(); this._stopTransientSources(); this._releaseSession(); }
    else if (this.ready && !this.muted) this._claimSession();
    this._status();
  }

  toggle() {
    this.muted = !this.muted;
    this._applyVolume();
    if (this.muted) { this._cancelPreview(); this._stopTransientSources(); this._releaseSession(); }
    else void this.unlock();
    this._status();
    return this.muted;
  }

  _applyVolume() {
    if (!this.master || this._disposed || this.ctx?.state === 'closed') return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * .82, this.ctx.currentTime, .018);
  }

  _register(source, nodes = [], onEnded = null) {
    this._sources.add(source);
    const cleanup = () => {
      if (!this._cleanups.has(source)) return;
      this._cleanups.delete(source);
      this._sources.delete(source);
      this._environmentSources.delete(source);
      this._menuSources.delete(source);
      this._voices.delete(source);
      source.onended = null;
      for (const node of [source, ...nodes]) { try { node.disconnect(); } catch (_) {} }
      onEnded?.();
    };
    this._cleanups.set(source, cleanup);
    source.onended = cleanup;
    return source;
  }

  _canAllocate() { return !!this.ctx && !this._disposed && this._sources.size < MAX_SOURCES; }

  _tone(wave, from, to, volume, duration, delay = 0, attack = .003) {
    if (!this._canAllocate()) return;
    const t = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator(), envelope = this.ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(15, from), t);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(15, to), t + duration);
    envelope.gain.setValueAtTime(.0001, t);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + Math.min(attack, duration * .4));
    envelope.gain.exponentialRampToValueAtTime(.0001, t + duration);
    oscillator.connect(envelope); envelope.connect(this.master);
    this._register(oscillator, [envelope]);
    oscillator.start(t); oscillator.stop(t + duration + .015);
    return oscillator;
  }

  _noise(volume, duration, frequency, type = 'lowpass', delay = 0, endFrequency = frequency, attack = .003) {
    if (!this._canAllocate()) return;
    const t = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), envelope = this.ctx.createGain();
    source.buffer = this._noiseBuffer;
    filter.type = type; filter.Q.value = type === 'bandpass' ? .8 : .5;
    filter.frequency.setValueAtTime(Math.max(30, frequency), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), t + duration);
    envelope.gain.setValueAtTime(.0001, t);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + Math.min(attack, duration * .4));
    envelope.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(this.master);
    this._register(source, [filter, envelope]);
    source.start(t, Math.random() * .7, duration + .02);
  }

  _allow(name, spacing = SPACING[name] ?? .04) {
    const now = this.ctx.currentTime, last = this._recent.get(name) ?? -100;
    if (now - last < spacing) return false;
    this._recent.set(name, now);
    return true;
  }

  _sample(group, volume = .75, rate = 1, delay = 0, vocal = false) {
    if (!this._canAllocate() || (vocal && this._voices.size >= 2)) return false;
    const buffer = this.samples.choose(group);
    if (!buffer) return false;
    const t = this.ctx.currentTime + Math.max(0, delay);
    const source = this.ctx.createBufferSource(), envelope = this.ctx.createGain();
    source.buffer = buffer; source.playbackRate.value = clamp(rate, .65, 1.4);
    envelope.gain.value = clamp(volume, 0, 1.25);
    source.connect(envelope); envelope.connect(this.master);
    this._register(source, [envelope]);
    if (vocal) this._voices.add(source);
    source.start(t); source.stop(t + buffer.duration / source.playbackRate.value + .02);
    return true;
  }

  _cancelPreview() {
    this._preview++;
    for (const timer of this._previewTimers) clearTimeout(timer);
    this._previewTimers.clear();
  }

  async preview() {
    this._cancelPreview();
    const generation = this._preview;
    // resume must run synchronously in the click stack, before any fetch/await.
    const resumed = this.unlock();
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(false), 1800); });
    const ready = await Promise.race([resumed, timeout]);
    clearTimeout(timer);
    if (!ready || generation !== this._preview || this._disposed || this._hidden || this.muted || this.volume <= 0) return false;
    this._recent.clear();
    const sequence = [[0,'hit',{material:'wood',weapon:'wood'}],[360,'hit',{material:'metal'}],[760,'hit',{material:'flesh',weapon:'wood'}],[1080,'exert',{}]];
    for (const [delay, name, details] of sequence) {
      const id = setTimeout(() => {
        this._previewTimers.delete(id);
        if (generation === this._preview) this.play(name, .5, details);
      }, delay);
      this._previewTimers.add(id);
    }
    return true;
  }

  _vocal(kind, power = 0, type = 'player', fatal = false, delay = 0) {
    if (!this._canAllocate() || this._voices.size >= 2) return;
    const pitch = ({player:1,zombie:.83,crawler:1.23,brute:.73,mutant:.91,titan:.67}[type] || .86) * (.96 + Math.random() * .08);
    if (this._sample(kind === 'pain' ? 'pain' : 'exert', kind === 'pain' ? .62 : .55, pitch, delay, true)) return;
    const t = this.ctx.currentTime + delay, p = clamp(power), pain = kind === 'pain';
    const variation = .92 + Math.random() * .16;
    const base = ({ player: 128, zombie: 105, crawler: 185, brute: 83, mutant: 116, titan: 72 }[type] || 112) * variation;
    const duration = (fatal ? .28 : pain ? .17 : .12) + p * .045;
    const source = this.ctx.createOscillator(), envelope = this.ctx.createGain();
    source.type = 'sawtooth';
    source.frequency.setValueAtTime(base * (pain ? 1.25 : 1.1), t);
    source.frequency.exponentialRampToValueAtTime(base * (pain ? .78 : .9), t + duration);
    envelope.gain.setValueAtTime(.0001, t);
    const level = (pain ? .9 : .72) + p * .1;
    envelope.gain.exponentialRampToValueAtTime(level, t + .018);
    envelope.gain.setValueAtTime(level, t + .035);
    envelope.gain.exponentialRampToValueAtTime(level * .32, t + duration * .62);
    envelope.gain.exponentialRampToValueAtTime(.0001, t + duration);
    envelope.connect(this.master);
    const nodes = [envelope];
    // Three resonant bands make a brief vowel instead of a pitched beep.
    const vowels = pain ? [620, 1220, 2550] : [470, 1050, 2380];
    vowels.forEach((frequency, i) => {
      const filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
      filter.type = 'bandpass'; filter.Q.value = [4, 6, 9][i];
      filter.frequency.setValueAtTime(frequency * variation, t);
      filter.frequency.exponentialRampToValueAtTime(frequency * variation * .88, t + duration);
      gain.gain.value = [.95, .58, .2][i];
      source.connect(filter); filter.connect(gain); gain.connect(envelope); nodes.push(filter, gain);
    });
    this._register(source, nodes); this._voices.add(source);
    source.start(t); source.stop(t + duration + .02);
    this._noise(.075, Math.min(.11, duration), 1450, 'bandpass', delay, 650, .012);
  }

  startScream(power) {
    if (this._scream || this.state !== 'ready' || !this._canAllocate()) return false;
    power = clamp(power);
    const t = this.ctx.currentTime;
    // The player supplies the voice; the travelling pressure is a separate layer.
    const buffer = this.samples.choose('rage') || this.samples.choose('exert');
    let voice = null, voiceGain = null;
    if (buffer && this._sources.size < MAX_SOURCES - 1) {
      voice = this.ctx.createBufferSource(); voiceGain = this.ctx.createGain();
      voice.buffer = buffer;
      voice.playbackRate.value = 1 - .055 * power;
      voiceGain.gain.value = .98 + .12 * power;
      voice.connect(voiceGain); voiceGain.connect(this.master);
      this._register(voice, [voiceGain], () => {
        if (this._scream?.voice === voice) this._scream.voice = null;
      });
      this._voices.add(voice);
      voice.start(t);
    }
    const air = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    air.buffer = this._noiseBuffer; air.loop = true;
    filter.type = 'lowpass'; filter.Q.value = .72;
    gain.gain.value = .0001;
    air.connect(filter); filter.connect(gain); gain.connect(this.master);
    const active = {air, filter, gain, voice, voiceGain, started: t};
    this._scream = active;
    this._register(air, [filter, gain], () => { if (this._scream === active) this._scream = null; });
    air.start(t);
    this.pulseScream(power, .065);
    // Short chest hit behind the syllable, below the speaking register.
    this._tone('sine', 103 + 16 * power, 45, .15 + .21 * power, .24, .08, .021);
    return true;
  }

  pulseScream(power, delay = 0) {
    if (!this._scream || this.state !== 'ready') return;
    const {filter, gain} = this._scream, t = this.ctx.currentTime + delay, p = clamp(power);
    filter.frequency.setValueAtTime(1050 + 600 * p, t);
    filter.frequency.exponentialRampToValueAtTime(105 + 145 * p, t + .36);
    gain.gain.setValueAtTime(.015, t);
    gain.gain.exponentialRampToValueAtTime(.21 + .23 * p, t + .035);
    gain.gain.exponentialRampToValueAtTime(.016 + .026 * p, t + .38);
  }

  stopScream() {
    if (!this._scream) return;
    const {air, gain, voice, voiceGain, started} = this._scream, t = this.ctx.currentTime;
    this._scream = null;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(.0001, t, .025);
    air.stop(t + .15);
    if (voice) {
      // Even the shortest tap gets a syllable rather than a chopped breath.
      const release = Math.max(t, started + .36);
      voiceGain.gain.setTargetAtTime(.0001, release, .035);
      voice.stop(release + .17);
    }
  }

  _impact(material, power, weapon = 'metal') {
    const p = clamp(power), v = .85 + p * .35, pitch = .95 + Math.random() * .1;
    const surface = material === 'stone' || material === 'ground' ? 'masonry' : material;
    if (weapon === 'barbed') {
      // Brief catch-and-scrape over the physical hit; no looping tether sound.
      this._noise(.12 * v, .085, surface === 'metal' ? 3400 : 2400, 'bandpass', .012, 850);
      this._tone('triangle', 740 * pitch, 260, .055 * v, .095, .015);
    }
    if (this._sample(surface, .8 + p * .2, pitch)) {
      // Small physical body layer; the recorded transient remains dominant.
      this._tone('sine', 155, 65, .09 + p * .04, .12);
      if (weapon === 'wood' && surface !== 'wood') this._tone('triangle', 330, 170, .045, .06);
      return;
    }
    if (material === 'metal') {
      this._noise(.23 * v, .055, 3100, 'bandpass', 0, 1200);
      this._tone('sine', 148, 64, .26 * v, .16);
      [247, 563, 1013, 1619].forEach((hz, i) => this._tone('sine', hz * pitch, hz * pitch * .985, [.17, .12, .07, .038][i] * v, [.28, .23, .18, .12][i]));
      if (weapon === 'wood') this._tone('triangle', 430 * pitch, 230, .11, .085);
    } else if (material === 'masonry' || material === 'stone' || material === 'ground') {
      this._tone('triangle', 186 * pitch, 61, .28 * v, .2);
      this._noise(.35 * v, .14, 2300, 'lowpass', 0, 380);
      this._noise(.20 * v, .055, 3400, 'bandpass', .006, 1200);
      this._noise(.10, .09, 1700, 'bandpass', .065, 700);
      if (weapon === 'wood') this._tone('sine', 610 * pitch, 380, .10, .09);
    } else if (material === 'wood') {
      this._tone('triangle', 268 * pitch, 148, .27 * v, .14);
      this._tone('sine', 593 * pitch, 442, .16 * v, .10);
      this._tone('sine', 1077 * pitch, 830, .07, .075);
      this._noise(.23 * v, .06, 1900, 'bandpass', 0, 550);
    } else {
      // Keep the punch in the audible midrange as well as the bass so that a
      // phone speaker conveys a hit instead of losing a 30 Hz-only thump.
      this._tone('sine', 169 * pitch, 67, .32 * v, .17);
      this._tone('triangle', 366 * pitch, 135, .18 * v, .085);
      this._noise(.25 * v, .06, 1900, 'bandpass', 0, 650);
      if (weapon === 'wood') this._tone('triangle', 724 * pitch, 430, .09, .075);
      else this._tone('sine', 1160 * pitch, 900, .045, .12);
    }
  }

  // details: { material, weapon, variant, duration, exert, type, fatal, tier }.
  // Material belongs to the struck target, not to the held weapon.
  play(name, power = 0, details = {}) {
    if (this.muted || this.volume <= 0 || this._hidden || this._disposed || this.ctx?.state !== 'running') return false;
    this.ready = true;
    if (!this._canAllocate()) return false;
    const p = clamp(power), d = details && typeof details === 'object' ? details : {};
    const material = d.material || (name === 'break' ? 'masonry' : 'flesh');
    const key = name === 'carAlarm' ? name+':'+(d.id??0) : name === 'hit' || name === 'break' ? name + ':' + material : name;
    if (!this._allow(key, SPACING[name] ?? .04)) return false;
    const existing = ENVIRONMENT.has(name) ? new Set(this._sources) : null;
    switch (name) {
      case 'menuFocus': {
        // A small mechanical catch, kept quiet for keyboard navigation.
        const pitch=.94+Math.random()*.12;
        this._noise(.024,.025,2600,'bandpass');
        this._tone('triangle',620*pitch,380*pitch,.025,.045);
        break;
      }
      case 'menuPress':
        this._sample(d.material==='wood'?'wood':'metal',.24,.92+Math.random()*.12);
        this._tone('sine',168,66,.095,.13);
        this._noise(.035,.065,1700,'bandpass',.012,650);
        break;
      case 'menuWood': {
        const pitch=.87+Math.random()*.22;
        this._sample('wood',.60,pitch);
        this._tone('triangle',290*pitch,102,.15,.18);
        this._noise(.09,.08,1900,'bandpass',.012,500);
        this._noise(.035,.06,2900,'highpass',.09,1200);
        break;
      }
      case 'menuMetal': {
        const pitch=.92+Math.random()*.16;
        this._sample('metal',.55,pitch);
        this._tone('sine',152,62,.13,.24);
        [547,823,1379].forEach((note,i)=>this._tone('sine',note*pitch,note*pitch*.98,.065/(i+1),.36+i*.08,.01+i*.014));
        this._noise(.04,.10,4200,'highpass',.04,2100);
        break;
      }
      case 'menuOpen':
        this._noise(.045,.19,1150,'bandpass',0,2800);
        this._tone('triangle',180,245,.04,.18);
        this._tone('sine',440,440,.035,.12,.10);
        break;
      case 'menuClose':
        this._noise(.035,.12,2400,'bandpass',0,600);
        this._tone('triangle',245,160,.045,.12);
        break;
      case 'menuReady':
        this._sample('metal',.17,1.13);
        [220,330,440].forEach((note,i)=>this._tone('triangle',note,note,.045,.25,i*.075));
        break;
      case 'targetLock':
        this._tone('sine',740,740,.045,.065);
        this._tone('triangle',1110,1110,.03,.085,.055);
        break;
      case 'targetCancel':
        this._tone('triangle',440,220,.035,.095);
        break;
      case 'carAlarm': {
        // Three recognizable automotive alarm patterns, not a generic hit beep.
        // Finite pulses: the world owns lifetime, distance and emitter limits.
        const variant=(d.variant||0)%3,v=p*.28;
        if(variant===0){
          this._tone('square',780,780,v,.14,0,.008);
          this._tone('square',1120,1120,v*.82,.14,.17,.008);
        } else if(variant===1){
          this._tone('sawtooth',640,1500,v,.19,0,.015);
          this._tone('sawtooth',1500,640,v*.8,.19,.22,.015);
        } else {
          this._tone('square',960,980,v,.11,0,.007);
          this._tone('square',960,980,v,.11,.16,.007);
          this._tone('sine',480,470,v*.55,.33,0,.015);
        }
        break;
      }
      case 'buildingFracture': {
        const v=p*(.65+Math.min(5,d.stage||2)*.07);
        this._sample('masonry',v,.79+Math.random()*.14);
        this._sample('masonry',v*.43,.95+Math.random()*.15,.11);
        this._noise(v*.24,.36,2100,'lowpass',.025,330);
        this._tone('triangle',170,54,v*.16,.30);
        this._glass(v*.42,.055);
        break;
      }
      case 'buildingCollapse': {
        // Recorded stone impacts plus mid-band grinding and a long settling
        // tail. Include phone-audible crack/crunch, not only sub-bass rumble.
        this._sample('masonry',p,.72);
        this._sample('masonry',p*.73,.88,.20);
        this._sample('masonry',p*.49,1.12,.48);
        this._noise(p*.38,1.55,1250,'lowpass',.03,110,.08);
        this._noise(p*.23,.65,2600,'bandpass',.15,380,.025);
        this._noise(p*.14,.55,1900,'bandpass',.72,500);
        this._tone('triangle',132,37,p*.24,.9,.01,.025);
        this._glass(p*.55,.10);
        break;
      }
      case 'carTear':
      case 'carWreck': {
        const wreck=name==='carWreck',v=p;
        this._sample('metal',v,.77+Math.random()*.15);
        this._sample('metal',v*.5,1.12,wreck?.21:.09);
        this._noise(v*.25,wreck?.58:.23,2200,'bandpass',.02,420);
        this._tone('triangle',196,47,v*.18,wreck?.5:.23);
        this._glass(v*(wreck?.8:.5),.03);
        if(wreck)this._noise(v*.17,.45,1100,'lowpass',.28,170);
        break;
      }
      case 'debrisLand': {
        const metal=d.material==='metal';
        this._sample(metal?'metal':'masonry',p*.64,.88+Math.random()*.18);
        this._noise(p*.14,.16,metal?2400:1200,'bandpass',.035,450);
        break;
      }
      case 'punch': {
        this._noise(.12,.065,1000,'bandpass',.012,2100,.008);
        if(d.exert!==false&&this._allow('exert'))this._vocal('exert',.12,'player',false,0);
        break;
      }
      case 'kick': {
        this._noise(.20,.095,650,'bandpass',0,1800,.008);
        if(d.exert!==false&&this._allow('exert'))this._vocal('exert',.2,'player',false,0);
        break;
      }
      case 'swing': {
        const overhead = /overhead|slam/.test(d.variant || ''), diagonal = /diagonal|cross|chop|cleave/.test(d.variant || '');
        const reverse = /backhand/.test(d.variant || '');
        const duration = overhead ? .24 : diagonal ? .19 : .15;
        // The physical arc reaches the front at 40% of the motion. Peak air
        // movement shortly beforehand instead of during the held wind-up.
        const delay = Number.isFinite(d.duration) ? Math.max(0, d.duration * .32 - .035) : overhead ? .055 : .015;
        this._noise(.23 + p * .08, duration, overhead ? 520 : diagonal ? 770 : reverse ? 1600 : 1100, 'bandpass', delay, overhead ? 1800 : reverse ? 850 : 2450, .035);
        this._tone('triangle', d.weapon === 'wood' ? 210 : 270, 85, .08, duration, delay + .02, .018);
        if (d.exert && this._allow('exert')) this._vocal('exert', p, 'player', false, Math.min(delay, .05));
        break;
      }
      case 'hit': this._impact(material, p, d.weapon); break;
      case 'break':
        this._impact(material, p, d.weapon);
        if (material === 'metal') {
          [0, .055, .14].forEach((delay, i) => this._noise(.19 / (i + 1), .13, 3200 - i * 650, 'bandpass', .04 + delay, 1100));
          this._tone('triangle', 180, 49, .16, .38, .025);
        } else if (material === 'wood') {
          this._noise(.3, .10, 3600, 'highpass', .02, 1000);
          this._noise(.13, .21, 1300, 'bandpass', .08, 450);
        } else {
          this._noise(.31, .4, 1800, 'lowpass', .04, 180);
          [0, .07, .14].forEach((delay, i) => this._noise(.16 / (i + 1), .11, 2600 - i * 400, 'bandpass', .08 + delay, 700));
          this._tone('sine', 104, 36, .23, .35, .035);
        }
        break;
      case 'exert': this._vocal('exert', p); break;
      case 'enemyHurt':
        if (METAL_VOICES.has(d.type)) {
          this._tone('sawtooth', 340, 115, .035, d.fatal ? .22 : .11);
          this._tone('sine', 1510, 650, .07, .14, .02);
          this._noise(.08, .09, 2100, 'bandpass');
        } else this._vocal('pain', p, d.type || 'zombie', !!d.fatal, .015);
        break;
      case 'hurt':
        this._impact('flesh', .2);
        this._vocal('pain', .5, 'player', false, .01);
        break;
      case 'combo': {
        const tier = clamp(d.tier ?? p * 3, 0, 4), note = 330 * (1 + tier * .10);
        // An occasional compact comic accent; ordinary contacts stay physical.
        this._tone('triangle', note * 1.5, note, .12, .12);
        this._tone('triangle', note * 2, note * 2, .11, .21, .08);
        this._tone('sine', 180, 75, .20, .16, .02);
        this._noise(.12, .065, 1600, 'bandpass', .02, 700);
        break;
      }
      case 'slam':
        this._impact('masonry', p, d.weapon);
        this._noise(.20, .3, 950, 'lowpass', .055, 180);
        break;
      case 'pickup':
        this._tone('sine', 659, 660, .10, .17);
        this._tone('triangle', 988, 989, .045, .22, .07);
        this._tone('sine', 1318, 1319, .055, .31, .14);
        break;
      case 'dash':
        this._noise(.15, .18, 1500, 'bandpass', 0, 350);
        this._tone('sine', 135, 55, .09, .13);
        break;
      case 'charge':
        this._tone('triangle', 110, 330, .075, .48, 0, .08);
        this._tone('sine', 220, 660, .03, .5, .03, .08);
        break;
      case 'levelStorm':
        this._noise(.28,.09,3600,'highpass');
        this._tone('sine',95,33,.24,.65,0,.003);
        this._noise(.30,.9,260,'lowpass',.035);
        this._noise(.12,.45,950,'bandpass',.12,300);
        break;
      case 'boss':
        this._tone('sawtooth', 65.4, 49, .075, 1.6, 0, .13);
        this._tone('sine', 49, 32.7, .23, 1.8, 0, .11);
        this._tone('triangle', 98, 73.4, .065, 1.3, .14, .1);
        this._noise(.18, .7, 250, 'lowpass');
        this._noise(.08, .7, 1200, 'bandpass', .3, 320);
        break;
      case 'victory':
        [261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((note, i) => {
          this._tone('triangle', note, note, .075, .45, i * .11);
          this._tone('sine', note / 2, note / 2, .07, .55, i * .11);
        });
        this._tone('sine', 130.8, 130.8, .12, 1.3, .5, .04);
        break;
      case 'death':
        [164.8, 130.8, 110, 82.4].forEach((note, i) => this._tone('triangle', note, note * .92, .12, .45, i * .2));
        this._noise(.14, .6, 260, 'lowpass');
        break;
      case 'start':
        this._tone('sine', 115, 48, .19, .4);
        [220, 293.66, 440].forEach((note, i) => this._tone('triangle', note, note, .09, .26, i * .095));
        this._noise(.06, .16, 1800, 'bandpass');
        break;
      case 'ui':
      default: this._tone('sine', 440, 660, .055, .09); break;
    }
    if(existing)for(const source of this._sources)if(!existing.has(source))this._environmentSources.set(source,{name,id:d.id});
    return true;
  }

  _glass(volume,delay=0) {
    this._noise(volume*.24,.075,5100,'highpass',delay,2200);
    [1961,3137,4531].forEach((frequency,i)=>this._tone('sine',frequency,frequency*.92,volume*.075/(i+1),.10+i*.055,delay+i*.035));
  }

  stopEnvironment(id=null) {
    for(const [source,event] of [...this._environmentSources]) {
      if(id!==null && (event.name!=='carAlarm'||event.id!==id))continue;
      try { source.stop(); } catch (_) {}
      this._cleanups.get(source)?.();
    }
  }

  setMenuActive(active) {
    const next = !!active;
    if (next === this._menuActive) return;
    this._menuActive = next;
    this._menuNextBeat = 0;
    this._menuStep = 0;
    if (!next) {
      // Stop only the menu score. A game's start cue may already be playing.
      for (const source of [...this._menuSources]) {
        try { source.stop(); } catch (_) {}
        this._cleanups.get(source)?.();
      }
    }
  }

  _updateMenuMusic(now) {
    if (!this._menuActive || this.muted || this.volume <= 0) return;
    if (!this._menuNextBeat || this._menuNextBeat < now - .3) this._menuNextBeat = now + .04;
    // An original, quiet D-minor workshop motif: plucked strings, a soft
    // sustained fifth, and alternating bass. No network or autoplay needed.
    const melody = [146.83,0,220,293.66,261.63,0,220,196,146.83,0,174.61,220,196,0,164.81,146.83];
    const note = (wave, frequency, volume, length, delay, attack) => {
      const source = this._tone(wave, frequency, frequency * .999, volume, length, delay, attack);
      if (source) this._menuSources.add(source);
    };
    while (this._menuNextBeat < now + .19) {
      const step = this._menuStep++ % melody.length;
      const delay = Math.max(0, this._menuNextBeat - now);
      const pitch = melody[step];
      if (pitch) {
        note('triangle', pitch, .034, .73, delay, .006);
        note('sine', pitch * 2, .009, .45, delay + .009, .006);
      }
      if (step % 4 === 0) {
        const bass = step < 8 ? 73.415 : step < 12 ? 87.305 : 98;
        note('sine', bass, .047, 1.5, delay, .035);
        note('sine', bass * 3, .012, 1.35, delay, .09);
      }
      this._menuNextBeat += .42;
    }
  }

  _makeAmbience() {
    const ctx = this.ctx, nodes = [];
    const layer = (type, frequency, gain, rate) => {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), volume = ctx.createGain();
      source.buffer = this._noiseBuffer; source.loop = true; source.playbackRate.value = rate;
      filter.type = type; filter.frequency.value = frequency; filter.Q.value = .4;
      volume.gain.value = gain;
      source.connect(filter); filter.connect(volume); volume.connect(this.master); source.start();
      nodes.push(source, filter, volume);
      return { source, filter, volume };
    };
    this._ambient = { wind: layer('lowpass', 230, .008, 1), rain: layer('highpass', 1800, .004, .77), nodes };
  }

  update(dt, danger = 0, weather = 'rain') {
    if (!this.ready || !this._ambient || this._disposed || this._hidden || this.muted || this.volume <= 0 || this.ctx?.state !== 'running') return;
    this._time += clamp(dt, 0, .1);
    if (this._time - this._mixTime < .12) return;
    this._mixTime = this._time;
    const t = this.ctx.currentTime, d = clamp(danger);
    this._updateMenuMusic(t);
    this._ambient.wind.volume.gain.setTargetAtTime(this._menuActive ? .004 : .006 + (Math.sin(this._time * .37) + 1) * .003 + d * .003, t, .3);
    this._ambient.wind.filter.frequency.setTargetAtTime(this._menuActive ? 150 : 190 + Math.sin(this._time * .2) * 60 + d * 70, t, .3);
    this._ambient.rain.volume.gain.setTargetAtTime(this._menuActive ? .0003 : weather === 'rain' ? .006 : weather === 'snow' ? .001 : .002, t, .4);
  }

  _stopTransientSources() {
    for (const source of [...this._sources]) {
      try { source.stop(); } catch (_) {}
      this._cleanups.get(source)?.();
    }
    this._recent.clear();
    this._menuNextBeat = 0;
  }

  _dropGraph() {
    this._stopTransientSources();
    if (this._ambient) {
      for (const layer of [this._ambient.wind, this._ambient.rain]) { try { layer.source.stop(); } catch (_) {} }
      for (const node of this._ambient.nodes) { try { node.disconnect(); } catch (_) {} }
    }
    if (this.ctx) this.ctx.onstatechange = null;
    for (const node of [this.master, this._limiter]) { try { node?.disconnect(); } catch (_) {} }
    this._ambient = null; this._noiseBuffer = null; this._limiter = null; this.master = null; this.ctx = null;
    this.ready = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._cancelPreview(); this.samples.dispose(); this.onStatusChange = null;
    for (const unbind of this._bindings.splice(0)) unbind();
    this._releaseSession();
    const ctx = this.ctx;
    this._dropGraph();
    if (ctx && ctx.state !== 'closed') { try { ctx.close().catch(() => {}); } catch (_) {} }
  }
}
