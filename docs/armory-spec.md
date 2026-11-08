# Approved armory expansion

User approved one concept image and then explicitly requested that clicking every pictured item equips a real working game object. Construction of the18 referenced silhouettes and functional customization is authorized. No second concept approval is required for these items. Publication still needs separate approval. Existing workshop/UI work continues; this document does not claim implementation.

Reference: `docs/concepts/armory-18.png`, created with the built-in image_gen tool (one image). Four clubs01–04, four one-hand hammers05–08, four heavy hammers09–12, six shields13–18. The reference image is not used as a fake interactive game screen. All selection thumbnails must be real renders of the corresponding3D assets.

Weapons:01 knotted hardwood cudgel;02 banded/studded wooden club;03 six-flange steel impact club;04 tapered reinforced octagonal club with hand guard;05 compact T hammer;06 cylindrical double-face hammer;07 asymmetric cross-peen hammer;08 twin-piston hammer;09 wide rectangular sledge;10 hexagonal barrel maul;11 spiked wrecking hammer;12 open-ring storm hammer. Shields:13 round buckler;14 kite;15 rectangular tower;16 solid hexagonal reactor shield;17 hinged three-leaf riot shield;18 split-crest teardrop shield.

## Functional contract

- Every item has its own real mesh, connected handle/back grip, stable rig contacts and physical bounds. Retain the approved isometric world, mouse aiming, bicycle riding/jump and existing animation fixes. No placeholder primitives substituting for the referenced silhouettes. Editable game-native geometry is allowed when it actually reproduces form/details and has corresponding renders.
- Separate owned/equipped configurations per weapon and shield; changing items retains each item's parts, ranks, finish and core. Preserve the existing earned character/forge progression and garages through validated migration. Construction/unlock costs and locks must be explicit; testing can try the actual object without spending or saving earned materials. Clicking an available owned catalog item equips that actual item and updates gameplay, not just a preview.
- Weapon customization: shape/head, haft, grip, physical strike attachments, finish and effect core. Shield customization: shape, rim/armor, boss/attachments, finish and core. Existing paid upgrades retain their real stats. Finishes are explicitly cosmetic; functional parts change power/reach/handling, protection/coverage/HP as appropriate.
- Four functional core families: IMPACT (impulse/stagger), ARC (bounded line-of-sight chain damage), FIRE (finite real burn damage), FROST (finite actual enemy slowing). Shield cores react to genuine blocks. Effects use bounded pools/cooldowns, stop on dead/removed targets and reset with the round. No unbounded storms or geometry allocation per continuous hit. New shapes must keep real collision/throw/spin contacts, including the open ring's gap where relevant.
- Extend the illustrated workshop with actual catalog cards, individual preview and save status. Keep fixed outer height and readable responsive labels; selected items appear on the live character and in Player/Together previews. Do not let an unowned preview silently become a saved equipped item.

## Implementation sequence and acceptance

1. Protected checkpoint of the verified visual workshop. Isolate manual candidate saves. Add deterministic validated catalog/configuration rules with migration.
2. Build representative final-quality real models (organic club, round hammer, ring hammer, kite/hinged shield), prove grips, contact bounds, material detail, live equip and thumbnail fidelity; then finish all18 with the same pipeline.
3. Integrate individual parts and functional core effects with existing combat, including shield coverage/block feedback and save/reload isolation. Preserve physical hammer/whirlwind/building damage and existing balance/progression.
4. Test every catalog entry through real UI/gameplay; validate appearance close-up and in battle, distinct silhouettes, one/two-hand and mounted grips, contact/throw/guard transitions, each core's real damage/control effect, resource cleanup and bounded performance. Refresh existing game-client/native browser tests and CI. No physical-phone FPS claim from desktop/viewport results.

Scope is substantial. Exact usage/credits unavailable; no further paid image generation, downloads, asset purchases, model switching or agents are authorized. Concept fidelity has not yet been established for new3D; require real side-by-side renders rather than inventing a percentage. Source/reference originals and all saves remain protected. Use the same managed checkout, canonical staging folders and port8000.
