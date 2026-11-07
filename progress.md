Original prompt: Extract and use IRONFALL-Performance14-Full-Project.zip in E:\Smash; find failed ChatGPT/GitHub WebGPU/WASM work and fix hammer/whirlwind destruction FPS collapse plus the recorded pending updates. Keep this source folder and project structure for future work.

## Confirmed baseline
- Source: E:\Smash, branch fix/performance14-local, based on ab720e1abdb3fa4ec560720f9a67c759a2df3e1b (origin/feature/performance14-webgpu). All 154 original files match the ZIP manifest; two supplied handoff documents are untracked initially.
- Published main is separate: 848cf22d7cf6672e0bb3da9c9297bbf53640fb85. Do not publish unverified changes.
- ChatGPT chat Hammer Combat Updates confirms 1 FPS after whirlwind destruction, reported 38% point, oversized hammer hands, cars moving metres, impacts and smoke/fire, top-right FPS, strict WebGPU and WASM investigation.
- GitHub run 42398539308 falsely passed: browser-performance14 actually fails boot with null.dispose, hidden by tee without pipefail. Earlier r187 experiment failed copying an absent three.core.min.js.
- Local hardware reports RTX 5080 + Intel Graphics. Desktop evidence cannot certify physical-phone FPS.
- Stable preview/test port: 8000. Generated test/log/cache roots use the single registered E:\CodexGenerated\smash\staging layout; no second build payload.

## Acceptance / next work
- Reproduce WebGPU rendering and destruction performance before changing gameplay; compare JS/WASM and WebGL/WebGPU at 0%, around 38%, and 45% destruction.
- Inspect actual scene pixels, GPU validation errors/device loss, frame distributions, simulation cost and retained geometry/effect counts.
- Verify oversized hammer arms throughout motion and real kicked-car travel, collision response and damage effects.
- Fix CI exit propagation and relevant regression tests. Run full unit/integration and desktop/mobile browser checks before delivery.
- Subscription usage/credits measurement unavailable. No paid service, dependency upgrade or agents authorized/used.

## Verified locally
- 480 original Node tests passed. Added regression reproduces the masked WebGPU adapter error before the fix and passes after it.
- Native Chrome / NVIDIA Blackwell renders actual city pixels; WASM is active with tens of thousands of calls and no fallback or validation errors.
- Whirlwind actually damages buildings at 0%, approximately 39%, and 45% destruction, with JS and WASM. No sustained 1 FPS reproduced on an unthrottled RTX 5080. Isolated 108–187 ms stalls remain visible in the baseline and are not claimed solved.
- Published main served directly from Git objects, without another source/build copy, reproduces oversized forearm stretch. Performance14 keeps upper/forearm lengths .44/.46 and reachable palms through rest, strike and spin.
- Full existing browser regression passed desktop, phone portrait, landscape and small phone; includes manual combat, throw arrow, Q upgrades and wire/head contact behavior.
- User clarified FPS collapse happens on all devices. Physical phone FPS still unverified.
- User approved exactly +64 MiB shared generated cap for Smash browser evidence; receipt E:\CodexStorageGuard\logs\smash-browser-cap-approval.json. Observed first instrumented browser job peak additional 12,201,116 bytes; following browser budgets reuse fixed roots.
- Browser lifecycle is now verified through the installed skill helper; an earlier direct Chrome close left descendants and StorageGuard stopped only its owned process tree. No unknown/user processes were terminated.
- Added immutable-local-transform reuse after the profile identified matrix recomposition. Its new regression fails before and passes after; car translations and crane hook/wire/pivot motion stay valid. All 482 Node tests now pass.
- Alternating transform benchmark: 1,678 nodes, 1,277 reusable local matrices; median 24.228 ->18.368 ms per 200 updates, identical world matrices. Collision benchmark: JS62.424 ms vs WASM12.340 ms per1,200 rays, equivalent contacts.
- CPU-throttled stress is diagnostic only: main median333 ms/frame at CPU x6; the initial Performance14 candidate median112 ms/frame with isolated up-to967 ms stalls. Do not claim these weak-CPU stalls solved; final optimized measurements still pending.
- Added DebrisRenderer: one rigidly skinned draw for all exact heterogeneous rubble, original per-piece physics records retained. All 483 Node tests pass. Vertex/color/normal and transformed-position equivalence covers rotations, scaling/fading, eviction and disposal.
- Native same-fixture foreground stress: 108 pieces /27,858 vertices, observed draw count468 ->244. CPUx6 p50 108.3 ->100.1 ms; cold maxima908 ->917 ms. This is a real submission-cost reduction, not closure of weak-device/cold-frame acceptance.
- Native full stress, both JS/WASM at0/39/45%, passes real spin/contact/error assertions; p958.4 ms, individual maxima104–138 ms. Native oversized-hand samples pass. The authored car moves6.704 m on a base kick (260->241 HP); actual staged cars show16 smoke and6 fire instances. Initial native-kick fixture used a fixed centre distance inconsistent with the authored sideways car depth; corrected to the same .85m bumper distance as the integration fixture, retaining the >5m travel requirement.
- User additionally approved +16MiB only for final browser validation, receipt E:\CodexStorageGuard\logs\smash-final-browser-cap-approval.json. No deletion or extra build.
- First pushed commit eeb0830 passes both corrected Verify performance14 (42401636945) and Verify Ironfall (42401656458). Draft PR https://github.com/ArisConstantinou/smash/pull/1. New exact-rubble rendering still needs its pushed CI run and final skill-client cleanup check.
- Exact-rubble commit8cd7264: normal Verify Ironfall42403169670 passed; strict WebGPU/WASM step in42403165438 passed. The duplicated smoke step failed a desktop timing oracle comparing committed stroke to later live aim. No GPU/WASM error or production aiming change. Fixed by capturing direction/aim/pointer/movement at actual beginSwing, retaining .999 tolerance, forcing .15s movement, and checking the active stroke stays locked. All four native viewports pass with the corrected test. Final skill client passes with clean owned-browser teardown.
- A separate actual wave15 fixture starts48 authored enemies (8 each zombie/crawler/robot/brute/mutant/mech) around39% destruction, ends41 after12s of real whirlwind play; warm windows59–87 FPS, console errors[]. Initial fixture-load stalls retained honestly. Evidence E:\CodexGenerated\smash\staging\tests\late-wave; replay spec E:\CodexStorageGuard\jobs\smash-late-wave.json.
- Both workflows pass95a1a96 (42404381583 normal,42404377291 strict GPU+compatibility). Independent real-input replay confirms the old aim comparison falsely fails at dot .997162; event-time dot1.0 and active-direction dot .999628 pass unchanged .999 tolerance. Evidence tests/manual-aim; replay jobs/smash-manual-aim.json.
- Deployment cache review found public main's WebGL-only vendor/three.module.js could remain cached at the same URL used by the new GPU loader. Reproduced the actual constructor failure with stale GL content before an import map, then verified ready=true, backendWebGPU=true and373 scene colours after a single release-versioned Three mapping. Updated entry/throw-indicator URLs too; strict GPU test now injects stale GL at the old URL. Evidence tests/cache-upgrade; replay jobs/smash-cache-upgrade.json. This prevents an upgrade failure, not evidence that this was the original FPS cause.
