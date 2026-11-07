# IRONFALL — aim11

## Manual combat
- Mouse input directs melee, punches and kicks independently of movement. A stroke's heading can be adjusted during anticipation, then stays fixed during its physical contact phase so a sudden mouse flick cannot create a teleporting damage sweep.
- Mobile keeps exactly one left stick: the inner 12% is neutral; 12–42% turns in place; the outer band moves proportionally. Releasing retains facing. Attack stays a normal button.
- A subtle ground arc shows the current melee reach envelope. Feet markers identify enemies inside that envelope with an unobstructed contact line; they are feedback, not guaranteed hits or steering. Actual swept geometry remains authoritative.
- Throw previews show the actual first intercept, without connecting dashed lines. Auto-lock is off initially, including a one-time migration of the old default-on release. Explicit later opt-in is retained. Confirm and hold/release throwing remain independent settings.

## Contact-earned spin
- Holding in empty space repeats regular attacks but cannot start a spin.
- A successful ordinary physical strike earns brief momentum. Keeping attack held transitions into spin during recovery.
- Real hits on enemies, vehicles, buildings and other damageable props replenish momentum. Missing for 0.86 simulation seconds from full momentum slows the rotation to a stop.
- Held input alone cannot restart an exhausted spin: another ordinary hit must earn it.
- Each target must leave the contact volume and a full angular revolution must elapse before it can award another spin hit. Continuous intersection and the opening hit cannot refill energy every frame.
- Maximum rotation speed remains bounded; spin damage is 70% of base weapon damage before stance bonuses, down from 90%.

## Work per frame
- Enemy reach/obstacle previews run at most 30 times per second (20 on low), rather than inside both 120 Hz player-physics passes.
- Long throw path/ricochet previews are skipped outside throw aiming/windup.
- Scenery hit-shake/material presentation updates once per rendered frame. Unchanged scenery emissive state is reused; the player's independently animated weapon aura is excluded from that cache.
- Weapon trails are bounded at 48 (24 on low) and still disposed on expiry. Swept collisions retain 120 Hz simulation precision.

## Verification
- `npm test`: 437 regression tests, including real mesh/model collision tests for manual direction, enemy/car/building spin entry, coast/stop, repeat-contact prevention, save preservation and effect bounds.
- `node tests/browser-smoke.mjs`: desktop, portrait phone, landscape phone and compact phone. Includes the existing menu/city/save/throw checks plus real pointer and touch events for the single-stick turn/walk zones, mouse-directed attacks and contact-earned spin.
- Browser automation runs Chromium with software WebGL. It does not establish physical iPhone/Safari compatibility or a particular frame-rate improvement on user hardware.
