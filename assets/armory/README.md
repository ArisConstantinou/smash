# Actual armory selection artwork

These18 PNG atlases are offline renders of the editable game-native meshes in armory-models.js / armory-geometry.js, using the same grouped PBR materials as live gameplay. Each image is1280x1280,8x8 tiles of160px. Tile63 shows the complete numbered blueprint; preceding tiles follow armoryParts(id) and its option order. They do not use painted concept stand-ins.

Regenerate with tools/render-armory-atlas.mjs through the registered Smash job on the existing port8000. It writes only the stable staging/work/armory-art folder; review and import the exact PNG/manifest files. manifest.json pins normalized source text and image hashes. Do not hand-edit the hashes to disguise stale art.

Authored geometry, grayscale wood/metal maps and small studio environment are project-local code. Shared surface textures remain bounded across equipment swaps; per-model geometry/materials are disposed. No downloaded model, font, external texture license or runtime asset service was introduced. Reference concept: docs/concepts/armory-18.png, generated once using built-in image_gen and approved by the user. The rendered game models retain its numbered silhouettes, with game-scale stylization and simpler surface detail.
