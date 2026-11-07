// Geometry and animation helpers shared by melee, directional defence and throws.
// No rendering dependency. Ground-plane coordinates are X/Z and segment times
// are fractions in [0, 1], so a fast hammer cannot tunnel between rendered frames.

const TIME_EPSILON = 1e-10;
const finite = Number.isFinite;
const clamp01 = value => Math.max(0, Math.min(1, value));

function validSegment(ax, az, bx, bz) {
  return [ax, az, bx, bz].every(finite);
}

function clipInterval(enter, exit) {
  if (exit < -TIME_EPSILON || enter > 1 + TIME_EPSILON || enter > exit + TIME_EPSILON) return null;
  return [clamp01(enter), clamp01(exit)];
}

function circleInterval(ax, az, bx, bz, cx, cz, radius) {
  if (!validSegment(ax, az, bx, bz) || ![cx, cz, radius].every(finite) || radius < 0) return null;
  const dx = bx - ax, dz = bz - az, ox = ax - cx, oz = az - cz;
  const a = dx * dx + dz * dz;
  const b = ox * dx + oz * dz;
  const c = ox * ox + oz * oz - radius * radius;
  if (a === 0) return c <= 0 ? [0, 1] : null;

  let discriminant = b * b - a * c;
  // Permit only floating-point roundoff at a tangent, not an enlarged collider.
  const roundoff = Number.EPSILON * 8 * Math.max(1, Math.abs(b * b), Math.abs(a * c));
  if (discriminant < -roundoff) return null;
  discriminant = Math.max(0, discriminant);
  const root = Math.sqrt(discriminant);

  // Stable quadratic roots avoid cancellation close to the leading surface.
  const q = -(b + (b >= 0 ? root : -root));
  if (q === 0) return clipInterval(0, 0);
  const first = q / a, second = c / q;
  return clipInterval(Math.min(first, second), Math.max(first, second));
}

/** First segment/circle contact, including tangency and starting inside. */
export function segmentCircleHit(ax, az, bx, bz, cx, cz, radius) {
  const interval = circleInterval(ax, az, bx, bz, cx, cz, radius);
  return interval ? interval[0] : null;
}

function axisInterval(start, end, minimum, maximum) {
  const delta = end - start;
  if (delta === 0) return start >= minimum && start <= maximum ? [0, 1] : null;
  const first = (minimum - start) / delta, second = (maximum - start) / delta;
  return clipInterval(Math.min(first, second), Math.max(first, second));
}

function aabbInterval(ax, az, bx, bz, minX, maxX, minZ, maxZ) {
  const ix = axisInterval(ax, bx, minX, maxX), iz = axisInterval(az, bz, minZ, maxZ);
  if (!ix || !iz) return null;
  return clipInterval(Math.max(ix[0], iz[0]), Math.min(ix[1], iz[1]));
}

function boxInterval(ax, az, bx, bz, box, padding = 0) {
  if (!box || !validSegment(ax, az, bx, bz) || ![box.x, box.z, box.w, box.d, padding].every(finite)) return null;
  if (box.w < 0 || box.d < 0 || padding < 0) return null;
  const minX = box.x - box.w / 2, maxX = box.x + box.w / 2;
  const minZ = box.z - box.d / 2, maxZ = box.z + box.d / 2;
  if (padding === 0) return aabbInterval(ax, az, bx, bz, minX, maxX, minZ, maxZ);

  // A swept disk against a rectangle equals a segment against its Minkowski
  // sum: two edge strips plus four circular corners. Simply expanding the AABB
  // would falsely hit the empty square areas outside the rounded corners.
  const candidates = [
    aabbInterval(ax, az, bx, bz, minX - padding, maxX + padding, minZ, maxZ),
    aabbInterval(ax, az, bx, bz, minX, maxX, minZ - padding, maxZ + padding),
    circleInterval(ax, az, bx, bz, minX, minZ, padding),
    circleInterval(ax, az, bx, bz, minX, maxZ, padding),
    circleInterval(ax, az, bx, bz, maxX, minZ, padding),
    circleInterval(ax, az, bx, bz, maxX, maxZ, padding),
  ];
  let enter = Infinity, exit = -Infinity;
  for (const interval of candidates) {
    if (!interval) continue;
    enter = Math.min(enter, interval[0]);
    exit = Math.max(exit, interval[1]);
  }
  // The rounded rectangle is convex: intersection with a straight segment is
  // one interval, even where several component strips/circles overlap.
  return enter === Infinity ? null : [enter, exit];
}

/**
 * First contact with an axis-aligned rectangle {x,z,w,d}.
 * padding is the moving hammer's horizontal collision radius. Rounded corners
 * are exact in X/Z; w/d are full dimensions, not half-extents.
 */
export function segmentBoxHit(ax, az, bx, bz, box, padding = 0) {
  const interval = boxInterval(ax, az, bx, bz, box, padding);
  return interval ? interval[0] : null;
}

function heightInterval(start, end, target, radius) {
  if (!finite(start.y) || !finite(end.y)) return [0, 1];
  let minimum, maximum;
  if (finite(target.minY) && finite(target.maxY)) {
    minimum = target.minY; maximum = target.maxY;
  } else {
    const height = finite(target.h) ? target.h : target.height;
    if (!finite(height)) return [0, 1];
    if (height < 0) return null;
    minimum = finite(target.y) ? target.y : 0;
    maximum = minimum + height;
  }
  if (minimum > maximum) return null;
  return axisInterval(start.y, end.y, minimum - radius, maximum + radius);
}

/**
 * Sweep a hammer from start to end and return the first physical target.
 *
 * start/end: {x,z}, optionally y.
 * targets: iterable of {x,z,w,d} rectangles or {x,z,radius} circles; dead targets
 * are ignored. The returned target is the original object, never a copy.
 *
 * Optional height: when both endpoints have y, h/height describes the target
 * above target.y (default ground 0); explicit minY/maxY also work. This clips
 * the horizontal contact interval against a vertically padded slab. It is a
 * 2.5D extruded collider, not a claim of full 3D rounded-corner sphere casting.
 *
 * Returns {target,t,x,z}, with y when both endpoints supply it, or null.
 * Equal-distance ties preserve target order; place solid scenery first when
 * it should win an exact tie with an enemy touching the same surface.
 */
export function firstHammerHit(start, end, targets, radius = 0.45) {
  if (!start || !end || !validSegment(start.x, start.z, end.x, end.z) || !finite(radius) || radius < 0) return null;
  let nearest = null;
  for (const target of targets || []) {
    if (!target || target.dead) continue;
    // Architecture provides a cast against the very same surviving pieces
    // used by locomotion. A miss is a real opening, not an enclosing box hit.
    if(finite(start.y)&&finite(end.y)&&typeof target.geometryHit==='function'){
      const hit=target.geometryHit(start,end,radius);
      if(!hit||!finite(hit.t)||hit.t<0||hit.t>1||(nearest&&hit.t>=nearest.t-TIME_EPSILON))continue;
      nearest={target,t:hit.t,x:hit.x,y:hit.y,z:hit.z};continue;
    }
    let planar;
    if (finite(target.w) && finite(target.d)) {
      planar = boxInterval(start.x, start.z, end.x, end.z, target, radius);
    } else if (finite(target.radius) && target.radius >= 0) {
      planar = circleInterval(start.x, start.z, end.x, end.z, target.x, target.z, target.radius + radius);
    } else continue;
    if (!planar) continue;

    const vertical = heightInterval(start, end, target, radius);
    if (!vertical) continue;
    const interval = clipInterval(Math.max(planar[0], vertical[0]), Math.min(planar[1], vertical[1]));
    if (!interval) continue;
    const t = interval[0];
    if (nearest && t >= nearest.t - TIME_EPSILON) continue;
    nearest = {
      target,
      t,
      x: start.x + (end.x - start.x) * t,
      z: start.z + (end.z - start.z) * t,
    };
    if (finite(start.y) && finite(end.y)) nearest.y = start.y + (end.y - start.y) * t;
  }
  return nearest;
}

/** Whether a source point lies inside the guard cone aimed along facing. */
export function facingCoverage(facing, source, origin, halfAngle = Math.PI / 3) {
  if (!facing || !source || !origin || ![facing.x, facing.z, source.x, source.z, origin.x, origin.z, halfAngle].every(finite)) return false;
  if (halfAngle < 0) return false;
  const fx = facing.x, fz = facing.z, sx = source.x - origin.x, sz = source.z - origin.z;
  const facingLength = Math.hypot(fx, fz), sourceLength = Math.hypot(sx, sz);
  // Coincident sources have no direction; do not accidentally grant rear or
  // omnidirectional protection when an attacker has already reached the center.
  if (facingLength === 0 || sourceLength === 0) return false;
  const dot = (fx * sx + fz * sz) / (facingLength * sourceLength);
  return dot + Number.EPSILON * 8 >= Math.cos(Math.min(Math.PI, halfAngle));
}

/** Parabolic jump height at time t (seconds); height is the apex above ground. */
export function jumpY(t, duration, height) {
  if (![t, duration, height].every(finite) || duration <= 0 || height <= 0 || t <= 0 || t >= duration) return 0;
  const progress = t / duration;
  return 4 * height * progress * (1 - progress);
}

/**
 * Smooth, one-way head sweep angle in radians: -2.05 at progress 0, through
 * forward-facing 0 at .5, to +2.05 at 1. This is the active sweep; callers own
 * blending into windup and out of follow-through. Velocity and acceleration
 * are zero at either endpoint, avoiding discontinuous weapon snaps.
 */
export function swingCurve(progress) {
  const t = finite(progress) ? clamp01(progress) : 0;
  const eased = t * t * t * (t * (t * 6 - 15) + 10);
  return -2.05 + 4.1 * eased;
}
