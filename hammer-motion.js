// The shaft points along local +Y. Turn it toward the returned unit
// directionX/Y/Z, then apply shaftTwist around its local +Y axis. The twist
// keeps the hammer's striking faces in the actual plane of the stroke.
// All positions are hero-local; normalized timing is independent of reach.
export const SWING_CONTACT_START = .16;
export const SWING_CONTACT_END = .68;
export const HAMMER_COMBOS = Object.freeze({
  oneHanded: Object.freeze(['one-forehand', 'one-backhand', 'one-diagonal']),
  twoHanded: Object.freeze(['two-broadside', 'two-cross', 'two-overhead']),
});

// Three readable silhouettes per stance: a level cut, a reverse cut and a
// descending finisher. A shield keeps the first chain compact; two hands add
// a waist-height sweep, a high cross-cut, and a true overhead downstroke.
// pitch is an angle, not a slope: the overhead load can pass behind the crown.
// Triples describe load, front contact and follow-through. The hands stay in
// reach of the articulated arms, including when the torso turns underneath.
const SWING_PROFILES = Object.freeze({
  'one-forehand': {
    duration: .38,
    yaw: [1.75, -.08, -1.35], pitch: [.08, .03, .02], yawVelocity: -12, pitchVelocity: -.10,
    gripX: [.50, .30, .25], gripY: [1.08, 1.10, 1.09], gripZ: [.10, .36, .26],
    bodyYaw: [.26, -.72], bodyPitch: [-.04, .14], bodyRoll: [-.06, .15],
    bodyDrop: [-.025, -.025], legScale: .80,
  },
  'one-backhand': {
    duration: .42,
    yaw: [-1.45, .08, 1.45], pitch: [-.32, .05, .72], yawVelocity: 11, pitchVelocity: 3.1,
    gripX: [.24, .30, .48], gripY: [1.06, 1.08, 1.26], gripZ: [.12, .24, .14],
    bodyYaw: [-.22, .55], bodyPitch: [.10, -.18], bodyRoll: [.07, -.14],
    bodyDrop: [-.07, .055], legScale: .80,
  },
  'one-diagonal': {
    duration: .48, followEnd: .54,
    yaw: [.68, 0, -.58], pitch: [1.05, .08, -.28], yawVelocity: -4.8, pitchVelocity: -6,
    gripX: [.42, .25, .18], gripY: [1.32, 1.12, 1.00], gripZ: [.10, .36, .35],
    bodyYaw: [.12, -.40], bodyPitch: [-.12, .31], bodyRoll: [-.10, .22],
    bodyDrop: [.01, -.10], legScale: .95,
  },
  'two-broadside': {
    duration: .48, twoHanded: true,
    yaw: [2.25, -.08, -2.15], pitch: [-.14, -.08, -.02], yawVelocity: -16, pitchVelocity: .30,
    gripX: [.12, .02, .05], gripY: [.98, .93, .96], gripZ: [.22, .46, .30],
    bodyYaw: [.58, -1.22], bodyPitch: [.06, .10], bodyRoll: [-.10, .21],
    bodyDrop: [-.075, -.035], legScale: 1.45,
  },
  'two-cross': {
    duration: .58, twoHanded: true,
    yaw: [-1.68, .08, 1.55], pitch: [1.15, .02, -.36], yawVelocity: 11, pitchVelocity: -3.0,
    gripX: [.12, .14, .20], gripY: [1.43, 1.10, 1.00], gripZ: [.06, .31, .28],
    bodyYaw: [-.48, 1.05], bodyPitch: [-.12, .32], bodyRoll: [.12, -.24],
    bodyDrop: [.025, -.13], legScale: 1.40,
  },
  'two-overhead': {
    duration: .68, followEnd: .50, twoHanded: true, overhead: true,
    yaw: [0, 0, 0], pitch: [2.05, .06, -.38], yawVelocity: 0, pitchVelocity: -12,
    gripX: [.02, .02, .02], gripY: [1.50, 1.10, 1.00], gripZ: [.05, .48, .48],
    bodyYaw: [0, 0], bodyPitch: [-.19, .52], bodyRoll: [0, 0],
    bodyDrop: [.04, -.18], legScale: 1.50,
  },
});

// A short cut stays quick; the heavier silhouettes need enough visible load
// and recovery to read as a different move. Contact remains at 40% of each:
// the two-hand chain reaches the front at 192 / 232 / 272 milliseconds.
export function getHammerSwingDuration(variant) {
  return Object.prototype.hasOwnProperty.call(SWING_PROFILES, variant) ? SWING_PROFILES[variant].duration : .32;
}

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function shaftDirection(yaw, pitch, alignHead = false) {
  const sy = Math.sin(yaw), cy = Math.cos(yaw), cp = Math.cos(pitch);
  const directionX = sy * cp, directionY = Math.sin(pitch), directionZ = cy * cp;
  let shaftTwist = 0;
  if (alignHead) {
    // x0 is local +X after the caller's shortest-arc +Y -> direction rotation.
    // Twist it toward the stroke's tangent (cos(yaw), 0, -sin(yaw)). This
    // avoids rolling the striking face onto its edge during a horizontal cut.
    const denominator = Math.max(1e-6, 1 + directionY);
    const x0 = 1 - directionX * directionX / denominator;
    const y0 = -directionX, z0 = -directionX * directionZ / denominator;
    const dot = x0 * cy - z0 * sy;
    const crossX = -y0 * sy, crossY = z0 * cy + x0 * sy, crossZ = -y0 * cy;
    shaftTwist = Math.atan2(directionX * crossX + directionY * crossY + directionZ * crossZ, dot);
  }
  return { directionX, directionY, directionZ, shaftTwist };
}

// Cubic Hermite segments preserve angular velocity through the contact pose.
// Tangents are derivatives with respect to normalized swing time, not t.
function curve(p, start, end, a, b, va = 0, vb = 0) {
  const span = end - start, t = clamp01((p - start) / span), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * va * span
    + (-2 * t3 + 3 * t2) * b + (t3 - t2) * vb * span;
}

function curveVelocity(p, start, end, a, b, va = 0, vb = 0) {
  const span = end - start, t = clamp01((p - start) / span), t2 = t * t;
  return ((6 * t2 - 6 * t) * a + (3 * t2 - 4 * t + 1) * va * span
    + (-6 * t2 + 6 * t) * b + (3 * t2 - 2 * t) * vb * span) / span;
}

/**
 * A diagonal, shoulder-led blow with a short load, accelerating impact and
 * decelerating follow-through. A .32-second tap reaches straight ahead at
 * about .125 seconds; anticipation does not add a separate input delay.
 *
 * Blend the incoming rig transform toward grip/yaw/elevation by `windup`,
 * then toward its actual stance-specific rest transform by `recovery`.
 * Body/leg fields already contain their anticipation and recovery envelopes;
 * `bodyDrop` is a signed Y offset (negative means a weight-bearing crouch).
 * `trail` is speed-based visual intensity, never a collision/damage switch.
 */
function sampleLegacySwing(progress, options = {}) {
  const p = clamp01(progress), twoHanded = !!options?.twoHanded, charge = clamp01(options?.charge);
  const windup = smooth(p / SWING_CONTACT_START);
  const recovery = smooth((p - SWING_CONTACT_END) / (1 - SWING_CONTACT_END));
  const contact = .40, drawnYaw = 1.82, contactYaw = -.10, followYaw = -1.55, contactVelocity = -13;
  const raised = .82 + (twoHanded ? .08 : 0) + charge * .10;
  let yaw = drawnYaw, elevation = raised, speed = 0;

  if (p >= SWING_CONTACT_START && p <= contact) {
    yaw = curve(p, SWING_CONTACT_START, contact, drawnYaw, contactYaw, 0, contactVelocity);
    elevation = curve(p, SWING_CONTACT_START, contact, raised, .025, 0, -1.9);
    speed = -curveVelocity(p, SWING_CONTACT_START, contact, drawnYaw, contactYaw, 0, contactVelocity);
  } else if (p > contact) {
    yaw = curve(p, contact, SWING_CONTACT_END, contactYaw, followYaw, contactVelocity, 0);
    elevation = curve(p, contact, SWING_CONTACT_END, .025, -.16, -1.9, 0);
    if (p < SWING_CONTACT_END) speed = -curveVelocity(p, contact, SWING_CONTACT_END, contactYaw, followYaw, contactVelocity, 0);
  }

  const strike = smooth((p - SWING_CONTACT_START) / (contact - SWING_CONTACT_START));
  const follow = smooth((p - contact) / (SWING_CONTACT_END - contact));
  // Hands stay near the chest and lead the head; the reach comes from the
  // shaft, not from stretching the arms out to the edge of the damage arc.
  const gripX = mix(mix(twoHanded ? .10 : .36, twoHanded ? .08 : .22, strike), twoHanded ? .16 : .23, follow);
  const gripY = mix(mix(twoHanded ? 1.13 : 1.16, 1.11, strike), 1.07, follow);
  const gripZ = mix(mix(twoHanded ? .28 : .24, .44, strike), .40, follow);

  // The torso starts unwinding ahead of the hammer. Opposing leg poses load
  // the rear leg, transfer weight forward and then settle without a reset.
  const drive = smooth((p - .10) / .44), settle = 1 - recovery;
  const weight = 1 + (twoHanded ? .10 : 0) + charge * .08;
  return {
    yaw, elevation, ...shaftDirection(yaw, Math.atan(elevation)), gripX, gripY, gripZ,
    bodyYaw: (.34 * windup - .78 * drive) * settle * weight,
    bodyPitch: (-.055 * windup + .18 * drive) * settle,
    bodyRoll: (-.075 * windup + .12 * drive) * settle,
    bodyDrop: (-.025 * windup - .025 * drive) * settle,
    leftLegPitch: (-.11 * windup + .23 * drive) * settle,
    rightLegPitch: (.16 * windup - .29 * drive) * settle,
    leftLegRoll: -.11 * windup * settle,
    rightLegRoll: .12 * windup * settle,
    recovery, windup,
    trail: clamp01(speed / -contactVelocity) * settle,
  };
}

function sampleComboSwing(progress, profile, charge) {
  const p = clamp01(progress), contact = .40, followEnd = profile.followEnd ?? SWING_CONTACT_END;
  const windup = smooth(p / SWING_CONTACT_START);
  const recovery = smooth((p - SWING_CONTACT_END) / (1 - SWING_CONTACT_END));
  const raised = profile.pitch[0] + charge * .06;
  let yaw = profile.yaw[0], pitch = raised, yawRate = 0, pitchRate = 0;
  if (p >= SWING_CONTACT_START && p <= contact) {
    yaw = curve(p, SWING_CONTACT_START, contact, profile.yaw[0], profile.yaw[1], 0, profile.yawVelocity);
    pitch = curve(p, SWING_CONTACT_START, contact, raised, profile.pitch[1], 0, profile.pitchVelocity);
    yawRate = curveVelocity(p, SWING_CONTACT_START, contact, profile.yaw[0], profile.yaw[1], 0, profile.yawVelocity);
    pitchRate = curveVelocity(p, SWING_CONTACT_START, contact, raised, profile.pitch[1], 0, profile.pitchVelocity);
  } else if (p > contact) {
    yaw = curve(p, contact, followEnd, profile.yaw[1], profile.yaw[2], profile.yawVelocity, 0);
    pitch = curve(p, contact, followEnd, profile.pitch[1], profile.pitch[2], profile.pitchVelocity, 0);
    if (p < followEnd) {
      yawRate = curveVelocity(p, contact, followEnd, profile.yaw[1], profile.yaw[2], profile.yawVelocity, 0);
      pitchRate = curveVelocity(p, contact, followEnd, profile.pitch[1], profile.pitch[2], profile.pitchVelocity, 0);
    }
  }

  const strike = smooth((p - SWING_CONTACT_START) / (contact - SWING_CONTACT_START));
  // Descending finishers arrest the head early and let the torso settle over
  // the planted strike. Level cuts carry momentum farther across the body.
  const follow = smooth((p - contact) / (followEnd - contact));
  const grip = path => mix(mix(path[0], path[1], strike), path[2], follow);
  const drive = smooth((p - .10) / .44), settle = 1 - recovery;
  const envelope = values => (values[0] * windup + values[1] * drive) * settle;
  const weight = 1 + (profile.twoHanded ? .10 : 0) + charge * .08;
  const direction = profile.yaw[0] < 0 ? -1 : 1, legs = profile.legScale * settle;
  const angularSpeed = Math.hypot(yawRate * Math.cos(pitch), pitchRate);
  const contactSpeed = Math.hypot(profile.yawVelocity * Math.cos(profile.pitch[1]), profile.pitchVelocity);
  // Keep a finite slope for legacy diagnostic consumers. It cannot express
  // the rear half of an overhead arc; rendered poses must use directionX/Y/Z.
  const elevation = Math.sin(pitch) / Math.max(.08, Math.abs(Math.cos(pitch)));
  return {
    yaw, elevation, pitch, ...shaftDirection(yaw, pitch, true),
    gripX: grip(profile.gripX), gripY: grip(profile.gripY), gripZ: grip(profile.gripZ),
    bodyYaw: envelope(profile.bodyYaw) * weight,
    bodyPitch: envelope(profile.bodyPitch),
    bodyRoll: envelope(profile.bodyRoll),
    bodyDrop: envelope(profile.bodyDrop),
    leftLegPitch: profile.overhead ? (-.20 * windup + .38 * drive) * settle : (-.11 * windup + .23 * drive) * legs * direction,
    rightLegPitch: profile.overhead ? (.22 * windup - .50 * drive) * settle : (.16 * windup - .29 * drive) * legs * direction,
    leftLegRoll: -.11 * windup * legs,
    rightLegRoll: .12 * windup * legs,
    recovery, windup,
    trail: clamp01(angularSpeed / contactSpeed) * settle,
  };
}

// Missing/unknown variants keep the original public motion curve. The game
// freezes a named combo variant when an attack actually starts, then reuses
// it for the visible pose, swept contact, trails, and blocked recoil.
export function sampleHammerSwing(progress, options = {}) {
  const variant = options?.variant;
  if (!Object.prototype.hasOwnProperty.call(SWING_PROFILES, variant)) return sampleLegacySwing(progress, options);
  return sampleComboSwing(progress, SWING_PROFILES[variant], clamp01(options?.charge));
}
