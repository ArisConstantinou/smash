# Road rift and resized Colossus — v2026.11.09.1

The previous boss was 32.13m high and roughly twice the height of the reference
office. It dropped from Y=35, turned at 0.22rad/s and stomped only with its front
feet. Its missile hexagon also left its exact locked centre outside every blast.

## Resulting encounter

- The existing editable quadruped is uniformly resized to 19m. Against the
  actual 16.9m office, the measured ratio is 1.1243. Geometry, independent rigid
  legs, materials, mounts and actual surviving-building contacts are retained.
- A standing space rift opens at a road intersection. Its lower edge stays on
  the road during opening and closing. The boss walks horizontally through it,
  breaking actual obstructions before advancing, then raises its head, opens
  its jaw and roars. Opening/walking/roar nominal times are 0.9/4.4/1.1 seconds;
  real obstructions extend walking rather than permit clipping through buildings.
- Only the emerged material is rendered or collidable. Entry is explicitly
  protected in the HUD; it ends before combat. Retry/reset removes the rift.
- Rear pressure can select a hind-leg stomp with a 1.35s warning and an 8s
  reaction cooldown. Rear targets receive upward missiles rather than chest
  shots passing through the mech. Turns are bounded at 0.75rad/s between attacks;
  windup targets remain locked and movement/jumping can still evade the impact.
- Missiles use one centre impact plus five outer impacts, with matching markers.
- HP is fixed when summoned: `7600 × (1 + .065 × (level−1)) ×
  (1 + .4 × (sector−1)) + 250 × (round−1)`. LV5/sector1 is 9576HP versus 3000
  previously. Equipped weapons never silently raise the boss's health.
- Damage received is 80% while walking, 65% during attacks and 125% in recovery.
  The HUD identifies protection, armour, recovery openings and overload.

## Renderer and resources

Pinned Three.js remains r170; no dependency, asset download or paid service was
added. The native WebGPU local-clipping probe produced identical pixels with
positive/negative planes, while global clipping worked. Rather than change the
renderer or clip the whole city, only this actor uses the supported Lambert
node alpha-test path. Original vertex colours/emission remain. The official
[r170 node-material examples](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/webgpu_materials.html)
demonstrate `opacityNode` and alpha testing. WebGL remains explicit diagnosis.

The rift reuses six draws, one deterministic 512px texture and a fixed arc
buffer. No extra light, shadow map, postprocessing pass or per-frame mesh is
created. Ordinary boss shadows resume after its whole body crosses the rift.

## Verification route

- `tests/beast.test.mjs`: dimensions, rigid joints, rear feet/markers, locked
  ordnance, centre coverage, rules and bounded portal reset/disposal.
- `tests/game.integration.mjs`: actual entry/protection/ground contact,
  invisible-material collision exclusion, rear damage and dodge, armour/opening,
  stronger durability, destruction/turning contacts and victory continuation.
- The new entry/rear/durability regressions fail with the previous game module
  at `a0144aa` and pass after the changes. The continuation fixture's lethal
  1HP hit is now 2 damage to account for its explicitly armoured walk state.
- `tests/browser-beast-portal.mjs` runs native Chrome WebGPU. It captures actual
  entrance frames, isolated reveal pixels, rear warning/damage/dodge, a roar
  reached through the real state machine, and fixed-camera scale comparison.
  `SMASH_BEAST_REF=a0144aa` reads historical source through browser interception;
  source and protected main are never overwritten for comparisons.
- `SMASH_BEAST_PHONE=1` uses 430×932, then 932×430, and CPU×4. This is engineering
  evidence, not physical-phone FPS certification. Eight-second combat samples
  are short and destruction differs between the two encounter designs.
- Existing installed develop-web-game client and four-layout browser smoke
  continue checking ordinary play, aiming, jump, saves, armory, HUD and roofs.

Stable evidence: `E:/CodexGenerated/smash/staging/tests/beast-portal/`, existing
`tests/smoke/`, and `logs/unit.log`. Final run receipts are retained in
`work/beast-portal-state.json`. Sustained mobile FPS, old cold/retry spikes and
long-session memory acceptance remain separate open work.

## Local acceptance

591/591 tests passed after the final code changes. The installed game client
passed ordinary movement/attack/jump; all four smoke layouts passed. Native
WebGPU verified all/none/partial reveal pixels, actual rear HP loss versus an
unchanged HP dodge, and a roar reached through the entry state machine. Final
portrait/landscape captures pass horizontal containment and >=12px boss HP.
Windows hardware inventory: Core Ultra9 285K, RTX5080 plus Intel Graphics.
Native desktop short combat-window p95 values were about18–19ms; CPU×4 portrait
windows remained roughly53–107ms (previous encounter roughly53–125ms). These
are short engineering samples with different encounter destruction, not a
controlled sustained-mobile speedup or a physical-device acceptance result.
