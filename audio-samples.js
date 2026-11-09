// Same-origin recorded foley and human effort/pain. See assets/audio/CREDITS.md.
// Requests/decode are bounded, optional and never delay game input or autoplay.
export const SAMPLE_GROUPS = Object.freeze({
  flesh: ['flesh-1', 'flesh-2', 'flesh-3'],
  metal: ['metal-1', 'metal-2', 'metal-3'],
  masonry: ['masonry-1', 'masonry-2', 'masonry-3'],
  wood: ['wood-1', 'wood-2', 'wood-3'],
  rage: ['rage-1'],
  exert: ['exert-1', 'exert-2', 'exert-3'],
  pain: ['pain-1', 'pain-2', 'pain-3', 'pain-4'],
});
export const SAMPLE_NAMES = Object.freeze(Object.values(SAMPLE_GROUPS).flat());
export class RecordedSounds {
  constructor({ fetcher = globalThis.fetch?.bind(globalThis), base = new URL('./assets/audio/', import.meta.url), timeout = 12000 } = {}) {
    this.fetcher = fetcher; this.base = base; this.timeout = timeout;
    this.encoded = new Map(); this.buffers = new Map(); this.last = new Map();
    this.controllers = new Set(); this.loading = null; this.decoding = null;
    this.disposed = false; this.failed = 0; this.lastAttempt = -Infinity;
  }
  async preload({ retry = false } = {}) {
    if (this.disposed || !this.fetcher) return 0;
    if (this.loading) return this.loading;
    if (this.lastAttempt > -Infinity && (!retry || Date.now() - this.lastAttempt < 15000)) return this.encoded.size;
    this.lastAttempt = Date.now(); this.failed = 0;
    const queue = SAMPLE_NAMES.filter(name => !this.encoded.has(name));
    const worker = async () => {
      while (queue.length && !this.disposed) {
        const name = queue.shift(), controller = new AbortController();
        this.controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
          const response = await this.fetcher(new URL(name + '.mp3', this.base), { signal: controller.signal });
          if (!response.ok) throw new Error('Audio HTTP ' + response.status);
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength < 128 || bytes.byteLength > 512000) throw new Error('Invalid audio size');
          if (!this.disposed) this.encoded.set(name, bytes);
        } catch (_) { if (!this.disposed) this.failed++; }
        finally { clearTimeout(timer); this.controllers.delete(controller); }
      }
    };
    this.loading = Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker)).then(() => this.encoded.size);
    try { return await this.loading; } finally { this.loading = null; }
  }
  async decode(ctx) {
    if (this.disposed || !ctx?.decodeAudioData) return this.buffers.size;
    if (this.decoding) return this.decoding;
    this.decoding = (async () => {
      await this.preload();
      for (const [name, bytes] of this.encoded) {
        if (this.disposed || ctx.state === 'closed') break;
        if (this.buffers.has(name)) continue;
        try {
          // slice prevents Web Audio from detaching our cached compressed data.
          const buffer = await ctx.decodeAudioData(bytes.slice(0));
          if (!this.disposed && buffer.duration > 0 && buffer.duration < 5) this.buffers.set(name, buffer);
        } catch (_) { /* Procedural fallback remains available for this sample. */ }
      }
      return this.buffers.size;
    })();
    try { return await this.decoding; } finally { this.decoding = null; }
  }
  choose(group, random = Math.random) {
    const names = (SAMPLE_GROUPS[group] || []).filter(name => this.buffers.has(name));
    if (!names.length || this.disposed) return null;
    const candidates = names.length > 1 ? names.filter(name => name !== this.last.get(group)) : names;
    const name = candidates[Math.min(candidates.length - 1, Math.floor(Math.max(0, random()) * candidates.length))];
    this.last.set(group, name);
    return this.buffers.get(name);
  }
  dispose() {
    this.disposed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear(); this.buffers.clear(); this.encoded.clear(); this.last.clear();
  }
}
