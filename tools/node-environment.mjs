// Three r170's WebGPU feature probes read the worker/browser global during
// module evaluation. Unit tests do not create a GPU or mock its availability.
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
