import * as THREE from './vendor/three.module.js';

export const SCREAM_DURATION = 10;
export const SCREAM_COOLDOWN = 30;
export const SCREAM_INTERVAL = .64;
const HALF_ANGLE = .52;
export const SCREAM_ARC_DOT = Math.cos(HALF_ANGLE);

export function screamStats(level, rank) {
  const power = Math.min(1, (level - 1) * .021 + rank * .074);
  return {
    power,
    range: 4 + 20 * power,
    damage: 3 + 32 * power,
    structureDamage: 1 + 84 * power ** 1.4,
    impulse: .9 + 21 * power ** 1.25,
  };
}

// Four reused crests make a widening pressure front. The geometry sits in
// the XY plane of the mouth, with the horizontal fan curving forward along Z.
export class ScreamWave {
  constructor(scene) {
    const positions = [], colors = [], indices = [];
    for (let i = 0; i <= 40; i++) {
      const angle = i / 40 * Math.PI * 2, x = Math.cos(angle), y = Math.sin(angle);
      const bend = Math.sqrt(1 - (x * Math.sin(HALF_ANGLE)) ** 2) - 1;
      const ripples = Math.sin(angle * 9) * .003 + Math.sin(angle * 15) * .001;
      for (const [scale, shade] of [[.83, .12], [.96, .85], [1, .31]]) {
        positions.push(x * scale, y * scale, bend + ripples + (1 - scale) * -.14);
        colors.push(shade * .60, shade * .96, shade);
      }
      if (i) for (let j = 0; j < 2; j++) {
        const k = (i - 1) * 3 + j;
        indices.push(k, k + 1, k + 3, k + 1, k + 4, k + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    this.crests = Array.from({length: 4}, () => {
      const crest = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
        forceSinglePass: true,
      }));
      crest.visible = false;
      scene.add(crest);
      return crest;
    });
  }

  update(origin, direction, age, {range, power}) {
    const cycle = age % SCREAM_INTERVAL;
    const yaw = Math.atan2(direction.x, direction.z);
    this.crests.forEach((crest, index) => {
      const progress = (cycle - index * .072) / .42;
      crest.visible = progress >= 0 && progress < 1 && (index < 2 || power > .3);
      if (!crest.visible) return;
      const distance = .18 + (range - .18) * progress;
      crest.position.set(origin.x + direction.x * distance, origin.y, origin.z + direction.z * distance);
      crest.rotation.y = yaw;
      crest.scale.set(.13 + distance * Math.sin(HALF_ANGLE), .10 + distance * (.12 + power * .08), distance);
      crest.material.opacity = (1 - progress ** 3) * (.29 + power * .60) * (1 - index * .13);
    });
  }

  hide() {
    for (const crest of this.crests) crest.visible = false;
  }
}
