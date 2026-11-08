# Mount progression and functional customization

Implemented candidate v2026.11.08.2. Public baseline remains PR8 / bd610915 until separate promotion approval. Editable Three.js source is organized into mount-rules, mount-models, mount-rider, mount-ride, mount-weapons and mount-workshop modules. Preview uses the fixed project port8000.

Implementation of the complete system in phases was approved in call_641411b3105d4742a9b2ccdd31fe7b98. The user explicitly chose freely controlled flight altitude for hover. Ground-only hover is superseded: flight needs actual vertical input, ceiling/facade collisions, landing/dismount safety and predictable altitude limits. No new implementation approval is needed within these bounds; publication still needs separate approval.

## Decisions and visual references

- Bicycle1–10, motorcycle11–20, sci-fi21–30. Reaching a band unlocks its chassis; retain earlier owned chassis and their upgrades rather than erasing investments. Automatic selection advances at levels11 and21; an explicit earlier chassis remains selected.
- Every chassis accepts weapon modules. Weapons are not exclusive to sci-fi. Compatibility is based on actual sockets, clearance, mass and available power, with visible effects on handling and fire rate.
- Sci-fi supports interchangeable wheels and hover. This supersedes the first wheels-only sci-fi drawing. Hover supports continuous altitude control up to42m, compound ceiling/facade collision and landing before dismount.
- Existing hero and one-handed hammer attacks are retained. Left hand steers, right hand swings; shield goes on the back. No new character redesign.
- Workshop appearance received positive feedback: user said "looks nice" with the workshop image. This records visual direction, not a claim of implementation or publication approval.

References: [bicycle](bicycle-concept.png), [motorcycle](mount-motorcycle-concept.png), [sci-fi wheels/hover](mount-scifi-mobility-concept.png), [workshop](mount-workshop-concept.png).

## Vehicle parts and effects

| Editable part | Example choices | Required gameplay effect |
|---|---|---|
| Frame | light / reinforced / heavy | Mount HP, load capacity, mass and acceleration |
| Front wheel | standard / spikes / armored / saw rim | Steering/grip, wheel durability and real contact damage |
| Rear wheel | standard / spikes / armored / saw rim | Traction, acceleration, durability and real contact damage |
| Drive / power | gears/dynamo, engine/alternator, reactor | Speed, acceleration and equipment power/recharge |
| Front socket | ram, crossbow, gun, energy emitter | Real collision or projectile damage, range and cooldown |
| Side socket | pods, defensive module, extra battery | Actual projectile/defence/capacity behavior, not a skin |
| Rear socket | automatic turret, support module | Independent aiming, line of sight, real shots and power use |
| Armor | light / plated / reinforced | Mount damage reduction, HP and weight tradeoff |
| Seat / controls | stable / agile / protected | Steering response, impact stability and rider protection |
| Sci-fi mobility kit | wheels / hover | Ground contact versus real lift and obstacle clearance |

Each choice also has upgrade ranks. A rank changes a computed stat and, where appropriate, visible hardware. Each accepted purchase spends actual wood/scrap/crystal once and survives reload. Retain existing character saves. No new paid currency, dependency, asset purchase or download is included.

Wheel damage requires genuine contact and relative movement, with bounded repeat-hit cooldowns. It must not damage distant enemies or through buildings. Turrets need actual target acquisition, clear shot paths, independent yaw/pitch and damage on contact; obstruction consumes/blocks the shot. Weapons and projectiles remain bounded/reused for performance. HP/defence must affect real damage and mount failure/repair, not only displayed numbers.

## Player / mount / together

Player slots: head, torso, arms, legs, boots, shield and hammer. Vehicle slots are listed above. Maintain separate selection and saved loadouts, and show the combined actual rider/mount pose in Together. Existing character crafting/progression remains available.

Main menu opens the workshop. An expandable in-game mount panel reuses the same component selection and rotating preview. Selecting a part highlights the actual mesh, shows current versus proposed effects and real material costs, and supports Equip/Upgrade. Mouse/touch rotation is confined to the preview; it cannot steer or attack in the live world. Opening the workshop pauses gameplay; closing it restores the previous phase. UI text must remain readable on phones; the concept is a desktop arrangement, not proof of mobile fit.

## Implementation phases and acceptance

1. Complete E/contact and material radius repairs. Native before image already reproduces a missed close enemy. Retain first-obstruction/one-hit checks and preserve material counts.
2. Small final-quality bicycle sample: C/touch mount toggle, real wheel/crank/leg/hand contacts, one-handed hammer strikes, safe dismount and full collision. Add a functioning rotating workshop preview and one real spiked-wheel purchase with contact damage. This proves the difficult integration and performance before expansion.
3. Extend the validated system to motorcycle, sci-fi and wheels/hover, then complete vehicle/player part catalog, upgrade ranks, saves and level1–30 progression. Use the same assets/interfaces, not separate ad-hoc implementations.
4. Test representative levels1/10/11/20/21/30, unlocks and old saves, all mount modes and parts, melee/projectiles/HP/repair, restart/pause/resume, desktop/touch. Capture matched visuals and frame/CPU/resource measurements. Installed game client, unit/integration, browser suites and CI are required. Physical-phone performance remains a separate unverified limitation until measured.
5. Commit/push only verified changes; publication remains a separate approval under the user's section12.

## Image provenance and limits

Images were generated with the built-in imagegen tool, not downloaded or made via a paid asset/model service. Image usage/credits are unavailable here. Selected approved reference files are retained alongside this document.

Prompts specified the existing blue-steel/gold low-poly style, coherent mechanically connected vehicle parts, editable rotating wheels/forks/cranks, left-hand steering/right-hand hammer, readable neutral studio views, shared functional equipment on all chassis and the corrected sci-fi wheels/hover choice. The workshop prompt specified Player/Mount/Together tabs, actual-model turntable, per-part selection, Standard/Spiked/Armored/Saw wheel options, effects comparison without invented numerical balance data, material icons and Equip/Upgrade. The standalone armament sheet was rejected by the image tool's output safety filter; the successful static workshop concept supplies the shared equipment presentation. These pictures are references, not working UI, final model topology or measured gameplay proof.
