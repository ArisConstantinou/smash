// Spawn-time difficulty. Existing enemies keep their visible HP and attack timing.
// The opening gives the player room to learn and collect the first upgrades;
// later pressure comes from a smooth spawn cadence, not sudden doubled waves.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (start, end, progress) => start + (end - start) * progress;
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

function stage(seconds, round) {
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const sector = Number.isFinite(round) ? Math.max(1, Math.floor(round)) : 1;
  // Returning to a new sector preserves upgrades, so its opening can advance.
  const age = time + Math.min(120, (sector - 1) * 25);
  return {time, sector, age};
}

export function hordeAt(seconds = 0, round = 1, bossActive = false) {
  const {sector, age} = stage(seconds, round);
  const pressure = smooth((age - 15) / 225);
  const normalCap = Math.min(52, Math.round(mix(8, 38, pressure)) + (sector - 1) * 4);
  const normalInterval = Math.max(.72, mix(3.6, .95, pressure) / (1 + (sector - 1) * .1));
  return {
    firstSpawnDelay: Math.max(3.5, 6 - (sector - 1) * .4),
    count: 1,
    interval: normalInterval * (bossActive ? 1.65 : 1),
    cap: bossActive ? Math.min(normalCap, 18 + (sector - 1) * 2) : normalCap,
    robotChance: .32 * smooth((age - 45) / 90),
    bruteChance: .12 * smooth((age - 100) / 120),
  };
}

export function chooseEnemyType(roll, seconds = 0, round = 1) {
  const {robotChance, bruteChance} = hordeAt(seconds, round);
  const value = clamp(Number.isFinite(roll) ? roll : 1, 0, 1);
  if (value < bruteChance) return 'brute';
  if (value < bruteChance + robotChance) return 'robot';
  return 'zombie';
}

const ARCHETYPES = {
  zombie: {
    hp: [30, 57], damage: [5, 11], speed: [1.35, 2],
    radius: .45, height: 1.75,
    windup: [.9, .62], attackRecovery: [2.75, 2], lungeSpeed: [8.2, 10.5],
  },
  robot: {
    hp: [56, 92], damage: [6, 12], speed: [1.65, 2.25],
    radius: .47, height: 1.8,
    windup: [1.15, .85], attackRecovery: [3.8, 2.8], boltSpeed: [8, 10.5],
  },
  brute: {
    hp: [126, 185], damage: [13, 22], speed: [1.15, 1.55],
    radius: .71, height: 2.55,
    windup: [1.25, .9], attackRecovery: [3.2, 2.2],
  },
};

export function enemyStats(type, seconds = 0, round = 1) {
  const {sector, age} = stage(seconds, round);
  const progress = smooth((age - 30) / 150);
  const source = ARCHETYPES[type] || ARCHETYPES.zombie;
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = Array.isArray(value) ? mix(value[0], value[1], progress) : value;
  }
  result.hp = Math.round(result.hp * (1 + (sector - 1) * .2));
  result.damage = Math.round(result.damage * (1 + (sector - 1) * .1));
  result.speed *= 1 + Math.min(.2, (sector - 1) * .035);
  return result;
}
