# Mount candidate v2026.11.08.2

The source includes bicycle (LV1–10), motorcycle (LV11–20), sci-fi wheels/hover (LV21–30), functional part upgrades and the shared Player / Mount / Together workshop. Earlier unlocked chassis keep their purchased parts. The sci-fi starts with a rear automatic turret; all chassis can equip weapons.

## Controls and saves

- C or the mount button: mount/dismount. Airborne dismount first lands the vehicle.
- WASD / analog joystick: movement and steering; LMB / attack: repeated one-handed hammer strokes, with the left hand attached to the steering grip.
- Shift / boost: consumes energy. Hover Space / jump ascends; X or Ctrl / descent button descends, up to42m with ceiling and facade collisions.
- Workshop: pauses the round, rotates the actual selected model, highlights parts, compares effects and shows material costs before purchase. Every nonempty option has ranks1–5. Repair uses scrap.
- Garage purchases share the existing character checkpoint. Test levels never spend or persist earned materials. Existing LV15 saves remain valid; XP thresholds1–14 are unchanged.

## Reported defects

The cube below the bicycle came from singleton city ground instancing on the pinned WebGPU renderer; the zero-count fragment batch also needed explicit hiding. Singleton surfaces now use their exact baked transform and remain compatible with physical ground fracture/reset. All mounts are22% larger, with adjusted saddle, crank, sole and steering anchors. The original hero is not shrunk.

The close-flank E fixture now damages the enemy177→144HP with a collision-checked0.55m step. Kick reach is1.85m and radius0.36m. Material attraction increases3.8→6m and collection0.8→1.3m; the two-drop native fixture collects both without duplicating rewards.

Editable procedural geometry and rider logic live in `mount-models.js` and `mount-rider.js`. These are Three.js sources, not Blender exports. Approved concept PNGs are retained in this directory.

## Native engineering evidence

Chrome with the local RTX5080, headless hardware rendering, strict WebGPU; preview port8000. Real keyboard and Chrome touch events exercise riding atLV1/11/21, diagonal movement, repeated single-hand strikes, independently controlled hover altitude and landing. A two-finger phone viewport test covers joystick plus attack. Desktop viewport1280×900; touch390×844. These measurements do not certify physical-phone/Safari performance.

A short comparison uses the same LV21 hero, authored24-enemy fixture and normal city/waves. Armed mounts have rank3 gun, rockets and heavy turret. Actual projectile contacts and the existing CC0 explosion texture are checked.

| Mode | Frame p95 | Maximum frame | CPU p95 |
|---|---:|---:|---:|
| Walking |8.4ms|12.6ms|6.9ms|
| Armed bicycle |12.5ms|20.8ms|9.9ms|
| Armed motorcycle |8.5ms|16.5ms|8.5ms|
| Armed sci-fi hover |8.5ms|20.9ms|8.3ms|

Each measurement window is1.6s after warmup, so it is a bounded regression sample rather than sustained performance acceptance. Earlier cold-round stalls remain open. Fixed-capacity effects are prewarmed and the car smoke/fire pool is reused between rounds; no vendor upgrade or quality reduction is included.

Twenty-four equipment replacements retain429 geometries and9 textures, and all24 retired mount roots are collected after explicit hierarchy cleanup. Chrome's total JavaScript-memory estimate still grows across the short test; this is not presented as proof of zero long-session memory growth.

Latest bounded screenshots, JSON, logs and the original matched before/after images use the registered project's stable test directories. No second build or source payload is generated. Browser QA must be run sequentially on the one registered port, with owned process cleanup.

## Reproduction

Run `npm test` for logic/geometry/integration. Run `tests/browser-mount-workshop.mjs` for rotation, upgrades, locks, pause and save isolation; its optional `SMASH_WORKSHOP_SERVER=1` starts the fixed8000 server. `tests/browser-mount-runtime.mjs` uses the existing native preview and installed managed-browser helper for hardware input/combat checks. CI additionally runs the existing desktop/mobile smoke and strict WebGPU/WASM workflows. Publication requires separate approval.
