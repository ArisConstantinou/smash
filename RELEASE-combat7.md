# IRONFALL combat7 — recoverable weapons and unarmed combat

## Player changes

- After throwing a weapon, LMB/touch attack punches. Holding repeats alternating
  left/right punches; E/the boot still kicks. Punch damage follows the visible
  hand's active contact, is blocked by scenery, and occurs once per punch.
  Collecting the weapon cancels the punch cleanly and restores the weapon UI.
- Dropped weapons are placed using the full rendered resting mesh bounds, not a
  tiny center collider. Ground placement stays on the reachable side of walls,
  tries alternate orientations, and backtracks the actual throw path if needed.
  Pickup uses the nearest exposed edge with height and line-of-sight checks.
  Moving cars and destroyed supports revalidate the resting weapon.
- Each earned character level adds +2 base weapon damage and +8 maximum health.
  Bonuses are derived from the saved level, persist through Continue/Retry, and
  cannot double-apply on reload. A deliberately new character starts over.
  The gear panel shows accumulated bonuses and total damage/HP.
- Throw auto-lock is enabled by default, persists in Settings and can be disabled.
  It prefers visible enemies near the aiming direction. Low-tier throws remain
  physical projectiles to collect; advanced weapon tiers retain their unlocked
  assisted ricochet/return abilities. Solid scenery still blocks every throw.
- Kicking creates a 1.6-second opening: the next non-kick/non-body hit gets +25%
  damage once. Dash gives the next normal swing or punch +25% for 1.1 seconds.
  No forced ability rotation or removal of the ordinary hammer attack.
- Desktop keeps illustrated actions; touch keeps compact icons. The attack tile
  switches to a fist while unarmed. The settings panel fits short viewports.

## Validation

340 automated tests passed locally, including actual game-source integration,
model articulation, throw geometry/pickup, manual/assisted targeting, setting
persistence, saved level growth, unarmed input/contact and action transitions.
Static DOM/CSS layout checks passed at six desktop/phone/tablet viewport sizes.
The preparation workflow reruns the entire suite on the exact publication tree.

The available local browser cannot provide WebGL2. The layout checks do not test
GPU-rendered gameplay, and physical-device performance, audio and final combat
feel still need an on-device playtest.
