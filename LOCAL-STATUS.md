# Local development and validation

The extracted project and subsequent game source live in `E:\Smash`. The original ZIP is preserved. Its 154 source files matched the supplied hashes before changes; the two supplied handoff documents are retained as provenance.

Run `npm run preview` and open <http://127.0.0.1:8000/>. Python 3 and Node are already available on the current computer. The project is static; no installation or extra build payload is needed. Port 8000 is fixed for this project.

## Changes after the supplied snapshot

- Preserve the actual WebGPU adapter/device error when Three r170 cleanup also fails during partial initialization.
- Run workflow pipelines with Bash's `pipefail`, so a failed browser test cannot pass through `tee`.
- Exercise the Linux WebGPU browser with headed Chromium inside the existing Xvfb environment and verify actual scene pixels, GPU validation errors and device health.
- Reuse 1,277 immutable local city transforms while retaining moving object roots and animated crane joints. Geometry, materials, shadows, weather and collision detail are preserved.
- Keep one preview/test port and add bounded local browser/benchmark tooling, including owned-browser cleanup and measured peak storage.

The source also includes the pending Performance14 work from branch `feature/performance14-webgpu`: WASM collision sweeps, bounded simulation catch-up, reusable destruction index buffers, reachable large-hammer hands, metre-scale kicks, vehicle impacts and staged smoke/fire, and the FPS HUD. These were absent from the published main at the initial inspection.

## Evidence and limits

- 482 Node unit/integration tests pass, including regressions that failed before the WebGPU-error and transform changes.
- The same 1,678-node city produced exactly identical world matrices in alternating CPU measurements: median 24.228 ms before and 18.368 ms after for 200 scene updates. This is a CPU microbenchmark, not a whole-game FPS claim.
- The collision microbenchmark returned equivalent results for JS and WASM: medians 62.424 ms and 12.340 ms per 1,200 rays. This does not convert the whole game into WASM.
- Native Chrome selected NVIDIA Blackwell and rendered real city pixels. Real whirlwind-building contacts were recorded at 0%, approximately 39%, and 45% destruction, with JS and WASM enabled separately.
- Desktop and three mobile viewport browser regressions passed, including manual attacks, controls, targeting, upgrades and barbed contact behavior.
- The published main stretched the large-hammer forearm. Performance14 retained original .44/.46 segment lengths through rest, strike and spin samples.
- Hardware FPS on physical phones has not been verified. Individual first-use/frame stalls remain in the measurements; a warm average does not prove their removal.

Latest bounded logs, screenshots, JSON measurements and browser lifecycle receipts are under `E:\CodexGenerated\smash\staging`. `progress.md` records any outstanding work and publication status.
