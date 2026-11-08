# v2026.11.08.3 — bicycle controls and first-play stalls

Base: public `main` at `143715b` / v2026.11.08.2. The isometric camera, authored models, destruction, saves, assets and renderer version are preserved. WebGPU remains mandatory by default; no renderer fallback or reduced visual preset is introduced.

## Reproduced controls

- Turn the bicycle past 90 degrees, attack, dismount and click a rear enemy. Quaternion-to-XYZ decomposition left hidden X/Z half-turns, while walking changed only Y. The original sequence dealt **0** damage and rendered forward opposite to logical aim. The repaired sequence deals **22** damage, keeps X/Z at zero, and aligns actual forward with the pointer. A general mouse-axis inversion was unnecessary: clean cardinal attacks already worked.
- In a narrow dead-end corridor, steering toward the exit cannot rotate the complete chassis. The original positive-only throttle stayed against the front wall, while the keyboard arrow jumped to the requested direction. The repair backs along the existing footprint at up to 3 m/s until turning fits. The keyboard-only arrow uses actual chassis heading; mouse-owned hammer aim stays independent.
- Space and the touch jump button launch the bicycle and rider together using the existing compound collision/gravity solver. Repeated airborne jumps are rejected. Roof collision, landing, one-handed attacks in flight, and landing before dismount are tested. Existing motorcycle and hover controls are retained.

Native evidence uses the real Chromium inputs and WebGPU. The corridor is a synthetic geometry fixture with other city collisions removed and automatic boss spawning suppressed; it is not a normal destruction-progress sample. The normal camera follows the rider, so endpoint images have different positions. Coordinate/heading traces accompany the images. Normal city screenshots separately cover mounted jumps and rear attacks. The post-turn mounted attack fixture removes an intervening barrel: an earlier miss correctly hit that barrel, and is not classified as an aim inversion. A clear-lane mounted rear click deals 22 damage.

## First-play work

The initial menu already creates and compiles an untouched arena. First Play now reuses that arena only when city and sector match. Retries and changed cities still restore a fresh intact district. Quality changes before Play still update the rubble limit. Nearby collision solids are prepared during initial loading. Whole surviving fracture cells reuse their local collision solids instead of reconstructing vertices/edges after every damage stage; position edits and partial pieces still invalidate the cache.

The bounded rubble renderer survives a same-quality round reset. Old pieces, alarms and environmental sound are cleared. Changed quality recreates it at the selected limit. Its shader is included in initialization warmup. No enlarged fixed vertex reserve is shipped.

## Measured limits

Native Chrome 157.0.8103.38 on Core Ultra 9 285K / RTX 5080; high preset. Diagnostic portrait: 430×932, DPR3, Chrome CPU×4. CPU throttling and a mobile viewport do **not** certify the user's physical iPhone 14 Pro Max. No physical phone was connected, as requested.

| First Play | Before | Candidate |
|---|---:|---:|
| Desktop world reset | 143.6 ms | 8.1 ms |
| Desktop maximum presented interval | 1279.2 ms | 112.6 ms |
| CPU×4 world reset | 815.0 ms | 67.1 ms |
| CPU×4 maximum presented interval | 3291.7 ms | 396.0 ms |
| CPU×4 frame p95 | 41.8 ms | 41.6 ms |

Ready time was 1657→1645 ms on desktop and 5778→5644 ms under CPU×4 in this sample. These are bounded local samples, not guarantees.

Sustained mobile FPS is **still open**. A fixed 120-step combat state (33 detached pieces, 0.111% scenery destruction), with CPU profiling disabled and rendering sampled for five seconds, measured desktop p95 8.4→8.4 ms and portrait CPU×4 p95 54.2→58.4 ms (750 draws / 152287 triangles in both portrait snapshots). This does not establish a sustained FPS improvement. A separate live 24-enemy/destruction stress test remains slow under CPU×4; simulation budgeting produces different progress over wall-clock windows, so those final states are not exact A/B equivalents. Initial and retry/changed-city stalls are not claimed eliminated.

Experimental per-object render bundles, sorted command caching, actor/city batching and additional static traversal caching were rejected. Their visual or performance checks did not justify shipping them. No such rendering experiment is included in this release.

## Verification and evidence

- 558 local logic/integration tests pass, including the failing-before rider and narrow-corridor regressions, preserved collision geometry, first-world identity/fresh retry, quality selection, and keyboard/touch jump handlers.
- Native rear-click reproduction, eight cardinal attack combinations (walking/mounted), actual W retreat, Space/touch takeoff and landing pass; no reported browser errors.
- Installed `develop-web-game` client passes. Latest screenshot/state inspected: WebGPU, WASM active, 558 calls / 0 fallbacks, sample p95 8.4 ms. This is a light desktop interaction sample, not mobile combat acceptance.
- Existing desktop, portrait, landscape and small-phone browser smoke checks pass.

Stable local evidence remains under the registered `E:/CodexGenerated/smash/staging/tests`: `startup-aim/` (before/after JSON, screenshots and CPU profiles), `local/client/`, and `smoke/`. Canonical logs are reused under `staging/logs/`. No generated captures, browser profiles, copied builds or private machine paths are added to Git.

Publication requires the user's promotion approval. Physical-phone combat performance, the CPU×4 stress deficit and remaining cold/retry spikes remain explicit follow-up criteria.
