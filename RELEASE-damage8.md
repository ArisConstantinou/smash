# IRONFALL damage8 — progressive destruction and vehicle alarms

## Gameplay

Buildings and cars change appearance at **80%, 50%, 25%, 10%, and 0% remaining HP**.
Above 80% they retain their intact model. Thresholds scale with maximum health;
a big hit can cross multiple stages. Damage only advances, and a previously
removed part is never emitted twice.

Actual sections of the existing model are detached. Buildings expose darker
closed fracture faces; glazing, frames and attached decorations leave with the
supporting section. Cars use hollow body panels rather than a solid sliced
cabin. The object's seed, location and impact side select a stable unique crack
pattern and slightly varied chunk sizes, including between identical models.

Detached geometry falls, bounces and settles, with a bounded visual-debris pool.
It lands on neighboring solid roofs and follows a moving support; a destroyed
support releases it again. This rubble is decorative: it does not introduce
new invisible player or weapon-pickup obstacles. Damaged-but-standing buildings
retain their structural collision footprint until complete destruction; this
is staged destruction, not a full structural-collapse physics simulation.

## Audio

Every surviving car activates an alarm when hit, even before its first panel
breaks. Repeated hits renew that car's emitter rather than layering loops. Its
working lamps flash. Up to three nearby cars sound at once, attenuated by
distance, with three different patterns and a bounded alarm duration. Wrecks,
world reset, pause, mute and background transitions stop relevant audio.

Distinct sounds accompany breaking panels/glass, separating building sections,
full building collapse, and rubble landing. They combine the existing licensed
recorded material foley with original synthesized layers. All samples remain
same-origin. Source counts are bounded and decoded recordings are optional;
procedural sounds remain available while loading.

## Validation

The release includes regressions for every architectural type, civilian/police/
ambulance vehicles, stage boundaries, random-pattern reproducibility, struck-side
locality, prototype isolation, cumulative hits, geometry/debris budgets, moving
supports, alarms, audio lifecycle, and real game-source integration.

Native Chromium OfflineAudioContext rendering verifies audible, finite,
non-clipping PCM for the two building events, two vehicle events and all three
alarm patterns. The available local browser does not provide WebGL2; offline
geometry renders and the integration suite are not a substitute for a physical
phone/GPU gameplay and listening test.
