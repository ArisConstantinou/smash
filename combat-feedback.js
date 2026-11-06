// Hit chains count physical contacts, never button presses or scenery damage.
export const COMBO_WINDOW = 3.8;
export const COMBO_TIERS = Object.freeze([
  {hits: 0, multiplier: 1},
  {hits: 5, multiplier: 1.25},
  {hits: 10, multiplier: 1.5},
  {hits: 20, multiplier: 2},
  {hits: 35, multiplier: 2.5},
]);

export function createHitCombo() { return {hits: 0, remaining: 0, tier: 0}; }
export function resetHitCombo(combo) { combo.hits=0; combo.remaining=0; combo.tier=0; }
export function tickHitCombo(combo, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  combo.remaining=Math.max(0,combo.remaining-dt);
  if (!combo.remaining) resetHitCombo(combo);
}
export function registerComboHit(combo) {
  if (combo.remaining <= 0) resetHitCombo(combo);
  const previous=combo.tier;
  combo.hits++;combo.remaining=COMBO_WINDOW;
  combo.tier=COMBO_TIERS.findLastIndex(t=>combo.hits>=t.hits);
  return {milestone:combo.tier>previous,tier:combo.tier,multiplier:comboMultiplier(combo)};
}
export function comboMultiplier(combo) { return COMBO_TIERS[combo.tier]?.multiplier||1; }

// Fractional XP bonuses are carried across kills, including a broken chain.
// A x1.25 bonus on four 1-XP enemies must really award 5 XP, not 4.
export function scaleComboReward(base, multiplier, carry=0) {
  if (!Number.isFinite(base) || base<=0) return {amount:0,carry};
  const total=base*Math.max(1,Number.isFinite(multiplier)?multiplier:1)+carry;
  const amount=Math.floor(total+1e-9);
  return {amount,carry:Math.max(0,total-amount)};
}

export function impactMaterial(target) {
  if (target?.isBuilding || ['wall','townhouse','apartment','shop','office','townhall','police','hospital','skyscraper','construction','warehouse'].includes(target?.type)) return 'masonry';
  if (['tree','crate','bench'].includes(target?.type)) return 'wood';
  if (target?.palette==='organic') return 'flesh';
  return 'metal';
}
