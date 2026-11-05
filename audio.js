// Original procedural sound design. Nothing is fetched and audio starts on a gesture.
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.muted = false;
    this.ready = false;
    this._ambient = null;
    this._sources = new Set();
    this._recent = new Map();
    this._time = 0;
    this._mixTime = 0;
    this._disposed = false;
  }

  async unlock() {
    if (this._disposed) return;
    try {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.ctx = new AudioContext({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume * 0.72;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -13;
        limiter.knee.value = 10;
        limiter.ratio.value = 6;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.13;
        this.master.connect(limiter);
        limiter.connect(this.ctx.destination);
        this._limiter = limiter;
        const length = this.ctx.sampleRate * 2;
        this._noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const samples = this._noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
        this._makeAmbience();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.ready = this.ctx.state === 'running';
    } catch (_) {
      // Audio is optional: blocked device output must not interrupt the game.
      this.ready = false;
    }
  }

  setVolume(value) {
    this.volume = clamp(value);
    this._applyVolume();
  }

  toggle() {
    this.muted = !this.muted;
    this._applyVolume();
    if (!this.muted && this.ctx?.state === 'suspended') this.unlock();
    return this.muted;
  }

  _applyVolume() {
    if (!this.master || this._disposed) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.72, this.ctx.currentTime, 0.025);
  }

  _register(source, cleanups = []) {
    this._sources.add(source);
    source.onended = () => {
      this._sources.delete(source);
      try { source.disconnect(); } catch (_) {}
      for (const node of cleanups) {
        try { node.disconnect(); } catch (_) {}
      }
    };
    return source;
  }

  _tone(wave, from, to, volume, duration, delay = 0, attack = 0.003) {
    if (!this.ctx || this._sources.size > 70) return;
    const time = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const envelope = this.ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(10, from), time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, to), time + duration);
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    this._register(oscillator, [envelope]);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.025);
  }

  _noise(volume, duration, frequency, type = 'lowpass', delay = 0, endFrequency = frequency) {
    if (!this.ctx || this._sources.size > 70) return;
    const time = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = type === 'bandpass' ? 0.65 : 0.4;
    filter.frequency.setValueAtTime(frequency, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), time + duration);
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    this._register(source, [filter, envelope]);
    source.start(time, Math.random() * 0.8, duration + 0.025);
  }

  _makeAmbience() {
    const ctx = this.ctx;
    const windSource = ctx.createBufferSource();
    windSource.buffer = this._noiseBuffer;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 230;
    windFilter.Q.value = 0.35;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.015;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.master);
    windSource.start();

    const rainSource = ctx.createBufferSource();
    rainSource.buffer = this._noiseBuffer;
    rainSource.loop = true;
    rainSource.playbackRate.value = 0.77;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1500;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.006;
    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(this.master);
    rainSource.start(0, 0.55);
    this._ambient = { windSource, windFilter, windGain, rainSource, rainFilter, rainGain };
  }

  play(name, power = 0) {
    if (!this.ready || this.muted || this._disposed || this.ctx?.state !== 'running') return;
    const now = this.ctx.currentTime;
    const last = this._recent.get(name) ?? -100;
    const spacing = { hit: 0.034, break: 0.06, pickup: 0.065, hurt: 0.16, charge: 0.55, swing: 0.09 }[name] ?? 0.035;
    if (now - last < spacing) return;
    this._recent.set(name, now);
    const p = clamp(power);
    const v = 0.85 + p * 0.35;

    switch (name) {
      case 'swing':
        this._noise(0.12 + p * 0.08, 0.14 + p * 0.08, 700, 'bandpass', 0, 1300);
        this._tone('triangle', 132 + p * 30, 40, 0.06, 0.16);
        break;
      case 'hit':
        this._tone('sine', 116, 31, 0.35 * v, 0.2 + p * 0.08);
        this._tone('triangle', 220, 64, 0.055 * v, 0.075);
        this._noise(0.18 * v, 0.095, 1250, 'lowpass', 0, 400);
        if (p > 0.6) this._noise(0.1, 0.26, 200, 'lowpass', 0.035);
        break;
      case 'break':
        this._tone('sine', 96, 26, 0.27, 0.29);
        this._noise(0.23 * v, 0.3, 1600, 'lowpass', 0, 160);
        this._noise(0.10, 0.13, 3200, 'bandpass', 0.055, 1800);
        this._noise(0.07, 0.11, 1800, 'bandpass', 0.15, 900);
        this._tone('triangle', 335, 170, 0.018, 0.12, 0.07);
        break;
      case 'pickup':
        this._tone('sine', 659, 660, 0.10, 0.17);
        this._tone('triangle', 988, 989, 0.045, 0.22, 0.07);
        this._tone('sine', 1318, 1319, 0.055, 0.31, 0.14);
        break;
      case 'hurt':
        this._tone('triangle', 230, 84, 0.16, 0.21);
        this._tone('sine', 65, 34, 0.20, 0.18);
        this._noise(0.13, 0.11, 650, 'lowpass');
        break;
      case 'dash':
        this._noise(0.11, 0.18, 1500, 'bandpass', 0, 350);
        this._tone('sine', 95, 40, 0.07, 0.13);
        break;
      case 'charge':
        this._tone('triangle', 110, 330, 0.075, 0.48, 0, 0.08);
        this._tone('sine', 220, 660, 0.03, 0.5, 0.03, 0.08);
        break;
      case 'boss':
        this._tone('sawtooth', 65.4, 49, 0.075, 1.6, 0, 0.13);
        this._tone('sine', 49, 32.7, 0.23, 1.8, 0, 0.11);
        this._tone('triangle', 98, 73.4, 0.065, 1.3, 0.14, 0.1);
        this._noise(0.18, 0.7, 250, 'lowpass');
        this._noise(0.08, 0.7, 1200, 'bandpass', 0.3, 320);
        break;
      case 'victory':
        [261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((note, i) => {
          this._tone('triangle', note, note, 0.075, 0.45, i * 0.11);
          this._tone('sine', note / 2, note / 2, 0.07, 0.55, i * 0.11);
        });
        this._tone('sine', 130.8, 130.8, 0.12, 1.3, 0.5, 0.04);
        break;
      case 'death':
        [164.8, 130.8, 110, 82.4].forEach((note, i) => this._tone('triangle', note, note * 0.92, 0.12, 0.45, i * 0.2));
        this._noise(0.14, 0.6, 260, 'lowpass');
        break;
      case 'start':
        this._tone('sine', 65, 32, 0.19, 0.4);
        [220, 293.66, 440].forEach((note, i) => this._tone('triangle', note, note, 0.09, 0.26, i * 0.095));
        this._noise(0.06, 0.16, 1800, 'bandpass');
        break;
      case 'ui':
      default:
        this._tone('sine', 440, 660, 0.055, 0.09);
        break;
    }
  }

  update(dt, danger = 0, weather = 'rain') {
    if (!this.ready || !this._ambient || this._disposed) return;
    this._time += Math.max(0, Math.min(0.1, Number(dt) || 0));
    if (this._time - this._mixTime < 0.12) return;
    this._mixTime = this._time;
    const t = this.ctx.currentTime;
    const d = clamp(danger);
    const wind = 0.012 + (Math.sin(this._time * 0.37) + 1) * 0.006 + d * 0.004;
    const rain = weather === 'rain' ? 0.014 : weather === 'snow' ? 0.0015 : 0.003;
    this._ambient.windGain.gain.setTargetAtTime(wind, t, 0.3);
    this._ambient.windFilter.frequency.setTargetAtTime(190 + Math.sin(this._time * 0.2) * 60 + d * 70, t, 0.3);
    this._ambient.rainGain.gain.setTargetAtTime(rain, t, 0.4);
  }

  dispose() {
    this._disposed = true;
    this.ready = false;
    for (const source of this._sources) {
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    }
    this._sources.clear();
    if (this._ambient) {
      try { this._ambient.windSource.stop(); } catch (_) {}
      try { this._ambient.rainSource.stop(); } catch (_) {}
      for (const node of Object.values(this._ambient)) {
        try { node.disconnect(); } catch (_) {}
      }
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
