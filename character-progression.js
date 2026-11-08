// Character growth is independent of the horde's wave/sector number. All state
// changes here are deterministic and have no rendering or storage side effects.
// awardCharacterXp, collectCharacterMaterial and forgeNextWeapon mutate the
// supplied state; read helpers and serialization never do.
export const MAX_CHARACTER_LEVEL = 30;
export const MATERIAL_TYPES = Object.freeze(['wood', 'scrap', 'crystal']);
const SAVE_VERSION = 1;
const MATERIAL_LIMIT = 999999;
const XP_TARGETS = Object.freeze([0, 8, 12, 18, 24, 30, 38, 46, 54, 62, 72, 82, 92, 102, 112, 122, 134, 146, 158, 170, 184, 198, 212, 226, 240, 256, 272, 288, 304, 320, 0]);
const emptyMaterials = () => ({wood: 0, scrap: 0, crystal: 0});
const integer = value => Number.isSafeInteger(value) && value >= 0;
const selectedLevel = value => Number.isFinite(value) ? Math.max(1, Math.min(MAX_CHARACTER_LEVEL, Math.floor(value))) : 1;

function weapon(id, name, minLevel, cost, stats) {
  return Object.freeze({id, name, minLevel, cost: Object.freeze({...emptyMaterials(), ...cost}), stats: Object.freeze(stats)});
}

export const CHARACTER_WEAPONS = Object.freeze([
  weapon('log', 'ΚΟΥΤΣΟΥΡΟ', 1, {}, {
    power: 22, size: .98, range: 2.75, jumpVelocity: 10.5, jumpCooldown: 1.35,
    canAirSmash: false, canReturn: false, canRicochet: false, canLightning: false,
    maxChainHits: 1, hasShield: false, armorTier: 0, throwRange: 10, throwDamageMultiplier: 1.5,
  }),
  weapon('club', 'ΕΝΙΣΧΥΜΕΝΟ ΡΟΠΑΛΟ', 3, {wood: 8}, {
    power: 30, size: 1, range: 2.95, jumpVelocity: 12.5, jumpCooldown: 1.5,
    canAirSmash: false, canReturn: false, canRicochet: false, canLightning: false,
    maxChainHits: 1, hasShield: false, armorTier: 0, throwRange: 12, throwDamageMultiplier: 1.65,
  }),
  weapon('iron', 'ΣΙΔΕΡΕΝΙΟ ΣΦΥΡΙ', 6, {wood: 10, scrap: 8}, {
    power: 38, size: 1.03, range: 3.15, jumpVelocity: 16, jumpCooldown: 1.8,
    canAirSmash: true, canReturn: false, canRicochet: false, canLightning: false,
    maxChainHits: 1, hasShield: true, armorTier: 1, throwRange: 14, throwDamageMultiplier: 1.85,
  }),
  weapon('war', 'ΠΟΛΕΜΙΚΟ ΣΦΥΡΙ', 10, {wood: 16, scrap: 18, crystal: 2}, {
    power: 46, size: 1.10, range: 3.40, jumpVelocity: 19.5, jumpCooldown: 2,
    canAirSmash: true, canReturn: true, canRicochet: false, canLightning: false,
    maxChainHits: 1, hasShield: true, armorTier: 2, throwRange: 17, throwDamageMultiplier: 2,
  }),
  weapon('storm', 'ΣΦΥΡΙ ΤΗΣ ΚΑΤΑΙΓΙΔΑΣ', 15, {wood: 20, scrap: 30, crystal: 6}, {
    power: 54, size: 1.18, range: 3.65, jumpVelocity: 22.5, jumpCooldown: 2.2,
    canAirSmash: true, canReturn: true, canRicochet: true, canLightning: true,
    maxChainHits: 5, hasShield: true, armorTier: 3, throwRange: 20, throwDamageMultiplier: 2.2,
  }),
]);

export function xpForNextLevel(level) {
  return XP_TARGETS[selectedLevel(level)];
}

// Level 1 is the ordinary new game. Higher starting levels deliberately build
// complete test presets, including equipped gear and a small material stock.
// Never use this to restore an earned save: a level does not automatically forge
// its equipment. restoreCharacterProgression preserves the actual forged tier.
export function createCharacterProgression(startLevel = 1) {
  const level = selectedLevel(startLevel);
  const equipped = CHARACTER_WEAPONS.filter(item => item.minLevel <= level).at(-1);
  const materials = level === 1 ? emptyMaterials() : {
    wood: Math.min(30, level * 2),
    scrap: Math.max(0, (level - 2) * 2),
    crystal: Math.max(0, Math.floor((level - 6) / 3)),
  };
  return {version: SAVE_VERSION, level, xp: 0, weaponId: equipped.id, materials};
}

export function awardCharacterXp(state, amount) {
  const fromLevel = state.level;
  if (!Number.isFinite(amount) || amount <= 0 || state.level >= MAX_CHARACTER_LEVEL) {
    return {fromLevel, level: state.level, levelsGained: 0};
  }
  // The maximum useful award is the entire progression. This keeps arbitrary
  // finite inputs from overflowing while allowing multiple levels in one kill.
  const award = Math.min(10000, Math.floor(amount));
  state.xp += award;
  while (state.level < MAX_CHARACTER_LEVEL && state.xp >= xpForNextLevel(state.level)) {
    state.xp -= xpForNextLevel(state.level);
    state.level++;
  }
  if (state.level === MAX_CHARACTER_LEVEL) state.xp = 0;
  return {fromLevel, level: state.level, levelsGained: state.level - fromLevel};
}

export function collectCharacterMaterial(state, type, amount = 1) {
  if (!MATERIAL_TYPES.includes(type) || !Number.isFinite(amount) || amount <= 0) return 0;
  const before = state.materials[type];
  state.materials[type] = Math.min(MATERIAL_LIMIT, before + Math.floor(amount));
  return state.materials[type] - before;
}

export function getCharacterStats(state) {
  const valid = restoreCharacterProgression(state) || createCharacterProgression();
  const weaponTier = CHARACTER_WEAPONS.findIndex(item => item.id === valid.weaponId);
  const equipped = CHARACTER_WEAPONS[weaponTier];
  const growth=actionGrowth(valid.level),power=(equipped.stats.power+(valid.level-1)*2)*growth.damageScale;
  return {
    ...equipped.stats,
    ...growth,
    power,
    levelDamageBonus: Math.round(power-equipped.stats.power),
    levelHealthBonus: (valid.level - 1) * 8,
    speed: 5.9*growth.mobilityScale,
    jumpVelocity:equipped.stats.jumpVelocity*growth.mobilityScale,
    jumpCooldown:equipped.stats.jumpCooldown*growth.cooldownScale,
    throwRange:equipped.stats.throwRange*growth.mobilityScale,
    maxHp: 120 + (valid.level - 1) * 8 + equipped.stats.armorTier * 6,
    quake: Math.max(0, weaponTier - 2),
    weaponId: equipped.id,
    weaponName: equipped.name,
    weaponTier,
  };
}

// Derived from the existing earned level, never stored as mutable save stats.
// Damage/force improve contact actions; mobility/recovery improve jump/dodge.
export function actionGrowth(level=1){
  const n=selectedLevel(level)-1;
  return {damageScale:1+n*.02,forceScale:1+n*.035,mobilityScale:1+n*.01,cooldownScale:1/(1+n*.02)};
}

export function getForgeStatus(state) {
  const valid = restoreCharacterProgression(state) || createCharacterProgression();
  const index = CHARACTER_WEAPONS.findIndex(item => item.id === valid.weaponId);
  const current = CHARACTER_WEAPONS[index], next = CHARACTER_WEAPONS[index + 1] || null;
  const missing = emptyMaterials();
  if (!next) return {current, next, canForge: false, levelReady: true, materialsReady: true, missing, reason: 'max'};
  for (const type of MATERIAL_TYPES) missing[type] = Math.max(0, next.cost[type] - valid.materials[type]);
  const levelReady = valid.level >= next.minLevel;
  const materialsReady = MATERIAL_TYPES.every(type => missing[type] === 0);
  return {current, next, canForge: levelReady && materialsReady, levelReady, materialsReady, missing,
    reason: !levelReady ? 'level' : !materialsReady ? 'materials' : null};
}

export function forgeNextWeapon(state) {
  if (!restoreCharacterProgression(state)) return {ok: false, weapon: null, reason: 'invalid'};
  const status = getForgeStatus(state);
  if (!status.canForge) return {ok: false, weapon: status.current, reason: status.reason};
  // Validate both gates before any debit. A failed or repeated press cannot
  // spend part of a recipe or skip a tier.
  for (const type of MATERIAL_TYPES) state.materials[type] -= status.next.cost[type];
  state.weaponId = status.next.id;
  return {ok: true, weapon: status.next, reason: null};
}

export function serializeCharacterProgression(state) {
  const valid = restoreCharacterProgression(state);
  if (!valid) throw new TypeError('Invalid character progression state');
  return JSON.stringify(valid);
}

// Reject malformed, incompatible, or contradictory saves. Return a fresh copy
// of only known data; do not trust saved stats, ability flags or UI properties.
export function restoreCharacterProgression(raw) {
  let saved = raw;
  if (typeof raw === 'string') {
    try { saved = JSON.parse(raw); } catch { return null; }
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved) || saved.version !== SAVE_VERSION) return null;
  if (!integer(saved.level) || saved.level < 1 || saved.level > MAX_CHARACTER_LEVEL || !integer(saved.xp)) return null;
  const target = xpForNextLevel(saved.level);
  if (saved.level === MAX_CHARACTER_LEVEL ? saved.xp !== 0 : saved.xp >= target) return null;
  const equipped = CHARACTER_WEAPONS.find(item => item.id === saved.weaponId);
  if (!equipped || equipped.minLevel > saved.level) return null;
  if (!saved.materials || typeof saved.materials !== 'object' || Array.isArray(saved.materials)) return null;
  const materials = emptyMaterials();
  for (const type of MATERIAL_TYPES) {
    const quantity = saved.materials[type];
    if (!integer(quantity) || quantity > MATERIAL_LIMIT) return null;
    materials[type] = quantity;
  }
  return {version: SAVE_VERSION, level: saved.level, xp: saved.xp, weaponId: equipped.id, materials};
}
