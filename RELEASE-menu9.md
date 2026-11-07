# IRONFALL menu9 — The Forge / aiming / architectural traversal

Base: `e72bbd4158d19994379cb1368258b787fab1c346` (damage8).

## Main menu

Original wood, metal, stone and brass navigation, press/hover transitions, moving embers, responsive portrait and landscape layouts. New Round / Continue are the first row; Round Select / Settings are the second. Continue remains visible but unavailable without a valid save. Modal overlays make the underlying menu inert. Settings scroll within their panel on small screens, not the game page.

An isolated, lazy 30 Hz Three.js character preview reuses the actual equipped warrior and current-level XP. The hero walks from the left endpoint to the earned fraction, then idles. Reduced motion skips travel and decorative animation. The preview renderer never substitutes a testing loadout for the earned weapon.

The hammer/log interaction charges on pointer hold, strikes on release, and has a keyboard activation path. The steel face meets the log, which recoils with cracks, chips and sparks. Menu audio uses an original procedural motif and layered wood/metal effects, not an unlicensed third-party track. Sound requires a user gesture; mute, volume, backgrounding and mode changes retain the existing audio lifecycle.

New Round restarts round one but retains earned character statistics/equipment. Continue restarts the saved round with the earned character. Round Select lists only earned rounds, with pagination after 24. Testing presets are separate and cannot overwrite progress. Old saves migrate to round one. A complete combat-world snapshot is NOT saved.

## Throw aiming

Default: first press aims, second fresh press confirms, with no double-click speed requirement. Optional: hold aims, release confirms. The saved setting applies to R, desktop action tiles and native touch pointers. Touch dragging changes direction; movement remains independently usable. Auto-lock remains a separate, initially enabled setting.

Ground-projected brackets mark visible candidates only during aiming; the selected target has a gold marker and label. Dead/blocked targets are re-evaluated. Esc, another attack, pause, lost focus, cancelled touches and setting changes cancel safely. Pointer capture release after the first tap does not clear a latched target. Keyboard auto-repeat cannot confirm accidentally. Existing cooldown buffering and preparation while a returning hammer is incoming are preserved. A thrown nonreturning log does not create a false armed aim.

## Anatomy and traversal

Wider warrior foot spacing, outward elbow poles, slightly wider shoulder sockets, forward weapon rest poses and more open biped enemy limb placement. Wrist/hand orientation and both grip contacts remain constrained. Guard dimensions and projectile/body contact agree with the revised pose.

The player uses a substepped body collider against actual surviving architectural triangles, cached in an XZ grid. Supports are upward-facing roof, awning and ledge triangles; walls and downward-facing ceiling triangles stop movement. Support follows the entire foot disk at roof edges. Actual gaps remain open, and falling below an edge does not snap the player back to a distant roof. Destroyed geometry invalidates the cache; moving vehicles update transforms while impact shudder does not move physics. Shadow and landing marker sit on the supporting surface.

Reach still depends on the existing jump/gear. This is not automatic climbing onto any-height skyscrapers. Enemy navigation and some weapon/projectile queries retain their previous simplified collision model. Detached rubble remains nonblocking. No claim of a full rigid-body or destructible-interior simulator.

## Validation

Run `npm test` with Node.js 22. Tests include both throw modes, pointer ownership/cancellation, saved settings, current-level XP, menu navigation, saved rounds, earned-only round selection, anatomy/IK, actual roof/gap/slope/ceiling/edge/destruction geometry and audio source lifecycle, along with the prior combat/destruction regressions.

Actual DOM, native Chromium mouse/keyboard/touch input and saved-state checks were exercised at 1440×900, 1024×768, 820×1180, 390×844, 320×568 and 844×390. The test browser cannot create a WebGL context; a test-only renderer substitution was used for DOM/state checks and projected preview screenshots. Production contains no renderer substitution. This is not a GPU performance, real-device, Safari or listening playtest.
