// Pure combat / movement rules. X/Z are world coordinates; Y is height.
export const GOAL = 60;
export const BOUNDS = 117;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function normalize(x, z) {
  const d = Math.hypot(x, z);
  return d > 0.0001 ? {x: x / d, z: z / d} : {x: 0, z: 0};
}
export function screenMovement(horizontal, vertical) {
  // Matches the fixed camera at (13,23,18), including diagonal normalization.
  const v = normalize(horizontal, vertical);
  return {x: v.x * 0.810679 + v.z * 0.585491, z: -v.x * 0.585491 + v.z * 0.810679};
}
export function nearestPoint(x, z, object) {
  return {x: clamp(x, object.x - object.w / 2, object.x + object.w / 2), z: clamp(z, object.z - object.d / 2, object.z + object.d / 2)};
}
export function circleOverlaps(x, z, radius, object) {
  if (object.dead) return false;
  const p = nearestPoint(x, z, object);
  return (p.x - x) ** 2 + (p.z - z) ** 2 < radius ** 2;
}
export function moveCircle(entity, dx, dz, objects, radius = entity.radius || 0.5) {
  const beforeX = entity.x, beforeZ = entity.z;
  // Substeps avoid tunnelling during dashes, knockback and boss charges.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.24));
  for (let step = 0; step < steps; step++) {
    entity.x = clamp(entity.x + dx / steps, -BOUNDS + radius, BOUNDS - radius);
    for (const o of objects) if (circleOverlaps(entity.x, entity.z, radius, o)) {
      const p = nearestPoint(entity.x, entity.z, o);
      const gap = Math.sqrt(Math.max(0, radius ** 2 - (p.z - entity.z) ** 2));
      if (dx > 0) entity.x = o.x - o.w / 2 - gap;
      else if (dx < 0) entity.x = o.x + o.w / 2 + gap;
    }
    entity.z = clamp(entity.z + dz / steps, -BOUNDS + radius, BOUNDS - radius);
    for (const o of objects) if (circleOverlaps(entity.x, entity.z, radius, o)) {
      const p = nearestPoint(entity.x, entity.z, o);
      const gap = Math.sqrt(Math.max(0, radius ** 2 - (p.x - entity.x) ** 2));
      if (dz > 0) entity.z = o.z - o.d / 2 - gap;
      else if (dz < 0) entity.z = o.z + o.d / 2 + gap;
    }
  }
  return {x: entity.x - beforeX, z: entity.z - beforeZ};
}
export function inArc(px, pz, fx, fz, x, z, range, halfAngle = 1.35, radius = 0) {
  const dx = x - px, dz = z - pz, distance = Math.hypot(dx, dz);
  if (distance > range + radius) return false;
  if (distance < 0.15) return true;
  const angularAllowance = Math.asin(Math.min(0.9, radius / Math.max(distance, 0.1)));
  return (dx * fx + dz * fz) / distance >= Math.cos(Math.min(Math.PI, halfAngle + angularAllowance));
}
export function hitObject(player, object, range, halfAngle = 1.35) {
  if (object.dead || range <= 0) return false;
  const px = player.x, pz = player.z;
  const facing = normalize(player.fx, player.fz);
  const angle = clamp(halfAngle, 0, Math.PI), epsilon = 1e-8;
  const minX = object.x - object.w / 2, maxX = object.x + object.w / 2;
  const minZ = object.z - object.d / 2, maxZ = object.z + object.d / 2;
  const p = nearestPoint(px, pz, object);
  if ((p.x - px) ** 2 + (p.z - pz) ** 2 > (range + epsilon) ** 2) return false;
  const inSector = (x, z) => inArc(px, pz, facing.x, facing.z, x, z, range + epsilon, angle);
  if (inSector(p.x, p.z)) return true;
  for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) if (inSector(x, z)) return true;

  // The nearest point and every rectangle corner can miss while a hammer
  // sweep still crosses a long wall. Test the actual sector boundaries.
  function rayIntersectsRectangle(dx, dz) {
    let entry = 0, exit = range;
    for (const [origin, direction, low, high] of [[px, dx, minX, maxX], [pz, dz, minZ, maxZ]]) {
      if (Math.abs(direction) < epsilon) {
        if (origin < low - epsilon || origin > high + epsilon) return false;
      } else {
        const a = (low - origin) / direction, b = (high - origin) / direction;
        entry = Math.max(entry, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
        if (entry > exit + epsilon) return false;
      }
    }
    return exit >= -epsilon && entry <= range + epsilon;
  }
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  for (const side of [-1, 1]) {
    if (rayIntersectsRectangle(facing.x * cosine - side * facing.z * sine,
      side * facing.x * sine + facing.z * cosine)) return true;
  }
  // Intersections of the circular edge with each vertical/horizontal face.
  for (const x of [minX, maxX]) {
    const discriminant = range ** 2 - (x - px) ** 2;
    if (discriminant < -epsilon) continue;
    const offset = Math.sqrt(Math.max(0, discriminant));
    for (const z of [pz - offset, pz + offset]) {
      if (z >= minZ - epsilon && z <= maxZ + epsilon && inSector(x, z)) return true;
    }
  }
  for (const z of [minZ, maxZ]) {
    const discriminant = range ** 2 - (z - pz) ** 2;
    if (discriminant < -epsilon) continue;
    const offset = Math.sqrt(Math.max(0, discriminant));
    for (const x of [px - offset, px + offset]) {
      if (x >= minX - epsilon && x <= maxX + epsilon && inSector(x, z)) return true;
    }
  }
  return false;
}
export function attackStats(stats, charge = 0) {
  const q = clamp(charge, 0, 1);
  return {
    damage: Math.round(stats.power * (1 + 3.2 * q ** 1.3)),
    range: stats.range + q * 1.4,
    halfAngle: 1.28 + q * 0.4,
    knockback: 5.4 + q * 12,
    lift: 2.3 + q * 3.5,
    duration: 0.32 + q * 0.10,
    impactAt: 0.12 + q * 0.035,
    charged: q >= 0.92
  };
}
export function destructionPercent(objects) {
  let destroyed = 0, total = 0;
  for (const o of objects) { total += o.weight || 1; if (o.dead) destroyed += o.weight || 1; }
  return total > 0 ? clamp(destroyed / total * 100, 0, 100) : 0;
}
export const UPGRADE_DEFS = [
  {id:'power',icon:'✦',name:'ΟΡΓΗ ΤΟΥ ΤΙΤΑΝΑ',label:'Δύναμη χτυπήματος',text:'+25% βασική ζημιά. Κάθε χτύπημα μετράει περισσότερο.',color:'#ffb958'},
  {id:'size',icon:'⬡',name:'ΣΦΥΡΙ ΓΙΓΑΝΤΑ',label:'Μεγαλύτερο σφυρί',text:'+18% μέγεθος κεφαλής και +8% εμβέλεια.',color:'#ff925b'},
  {id:'range',icon:'◎',name:'ΜΑΚΡΙΝΟΣ ΑΝΤΙΛΑΛΟΣ',label:'Μεγαλύτερη εμβέλεια',text:'+22% βασική εμβέλεια. Χτύπα περισσότερους μαζί.',color:'#83dfdb'},
  {id:'speed',icon:'»',name:'ΒΗΜΑ ΤΗΣ ΚΑΤΑΙΓΙΔΑΣ',label:'Ταχύτητα κίνησης',text:'+12% βασική ταχύτητα. Κινήσου ανάμεσα στην ορδή.',color:'#b4d890'},
  {id:'vitality',icon:'✚',name:'ΣΙΔΕΡΕΝΙΑ ΚΑΡΔΙΑ',label:'Ζωή και αντοχή',text:'+25 μέγιστη ζωή και άμεση αναπλήρωση 40 ζωής.',color:'#f1999a'},
  {id:'quake',icon:'ϟ',name:'ΡΗΓΜΑ ΤΟΥ ΚΟΣΜΟΥ',label:'Κρουστικό κύμα',text:'Η συντριβή μετά το άλμα στέλνει κρουστικό κύμα σε μεγαλύτερη περιοχή.',color:'#c3b2ef'}
];
export function calculateStats(levels) {
  return {power: 38 * (1 + (levels.power || 0) * 0.25),size:1 + (levels.size || 0) * 0.18,
    range:2.85 * (1 + (levels.range || 0) * 0.22 + (levels.size || 0) * 0.08),
    speed:5.9 * (1 + (levels.speed || 0) * 0.12),maxHp:120 + (levels.vitality || 0) * 25,
    quake:levels.quake || 0};
}
