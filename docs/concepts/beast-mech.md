# Approved quadruped Colossus

2026-11-09 revision: the user approved resizing the existing rig to **19m**,
roughly 12% above the 16.9m reference office, and entry through a standing space
rift anchored to the road. The 32.13m dimensions below document the original
approved version. Current behaviour and verification: [road-rift encounter](../beast-portal-verification.md).

User-approved concept: [beast-mech-concept.png](beast-mech-concept.png).
Approval: call_fe01828a7fcb4990b4726ae88016798f, 2026-11-08.

Editable model and rigid rig: `beast-mech.js`. Metres, Y up, +Z forward.
The final rest-pose bounding height is 32.13m, matching the authored tallest
skyscraper (32.130001m). Four independently articulated legs, fixed segment
lengths, jaw/head pivots, 24 shoulder missile mounts, 12 forward rocket mounts,
and a chest laser. Mechanical parts are rigid, with vertex-coloured beveled
armour and profiled shells. No external 3D asset or engine dependency.

The concept is original AI-generated reference artwork, not a screenshot or
proof of the implemented asset. The original generated PNG is preserved in
the Codex generated_images directory. The selected reference is stored here.

Concept direction: predatory quadruped, gunmetal/teal plated torso and spine,
visible hydraulic legs with broad three-toed feet, orange furnace accents,
two vertical missile banks, separate forward rocket pods, circular chest
laser. Large three-quarter reference with consistent front/side views, neutral
lighting, 32m tower and 2m person scale references. No copied franchise design,
extra limbs, floating weapons, smoke or attacks concealing the model.

Runtime validation must check silhouette, all four load-bearing limbs, actual
ground clearance, attack telegraphs, reachable feet, camera framing, damage
and resource cleanup separately. Browser engineering evidence does not
certify physical-phone performance.
