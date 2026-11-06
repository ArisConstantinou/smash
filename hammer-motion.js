// The shaft points along local +Y; the caller turns it toward
// normalize(sin(yaw), elevation, cos(yaw)). All positions are hero-local.
// Timing is normalized so reach/strength upgrades cannot slow the animation.
export const SWING_CONTACT_START = .16;
export const SWING_CONTACT_END = .68;
export const HAMMER_COMBOS = Object.freeze({
  oneHanded: Object.freeze(['one-forehand', 'one-backhand', 'one-diagonal']),
  twoHanded: Object.freeze(['two-broadside', 'two-cross', 'two-overhead']),
});

// Each stance has its own choreography. Grip paths stay within the real arm
// lengths; reversing a stroke never swaps the right hand to the left shoulder.
// The three entries are the loaded pose, front contact, and follow-through.
const SWING_PROFILES = Object.freeze({
  'one-forehand': {
    yaw: [1.45, -.06, -1.05], elevation: [.30, .025, -.06], yawVelocity: -10, elevationVelocity: -.5,
    gripX: [.40, .30, .34], gripY: [1.12, 1.10, 1.08], gripZ: [.18, .36, .30],
    bodyYaw: [.20, -.42], bodyPitch: [-.035, .13], bodyRoll: [-.04, .07], legScale: .65,
  },
  'one-backhand': {
    yaw: [-1.25, .06, 1.10], elevation: [.24, .025, .08], yawVelocity: 9.8, elevationVelocity: -.5,
    gripX: [.34, .32, .36], gripY: [1.16, 1.10, 1.10], gripZ: [.16, .30, .28],
    bodyYaw: [-.18, .40], bodyPitch: [-.025, .10], bodyRoll: [.04, -.07], legScale: .65,
  },
  'one-diagonal': {
    yaw: [1.20, -.04, -.85], elevation: [1.05, .025, -.16], yawVelocity: -9, elevationVelocity: -1.9,
    gripX: [.38, .25, .30], gripY: [1.23, 1.10, 1.05], gripZ: [.18, .36, .32],
    bodyYaw: [.16, -.35], bodyPitch: [-.055, .17], bodyRoll: [-.05, .09], legScale: .70,
  },
  'two-broadside': {
    twoHanded: true,
    yaw: [1.92, -.10, -1.65], elevation: [.28, .025, -.07], yawVelocity: -13.5, elevationVelocity: -.5,
    gripX: [.10, .08, .16], gripY: [1.13, 1.11, 1.07], gripZ: [.28, .44, .40],
    bodyYaw: [.34, -.78], bodyPitch: [-.055, .18], bodyRoll: [-.075, .12], legScale: 1,
  },
  'two-cross': {
    twoHanded: true,
    yaw: [-1.82, .10, 1.55], elevation: [1.08, .025, -.16], yawVelocity: 13, elevationVelocity: -1.9,
    gripX: [.18, .16, .24], gripY: [1.17, 1.11, 1.07], gripZ: [.18, .34, .30],
    bodyYaw: [-.34, .78], bodyPitch: [-.055, .18], bodyRoll: [.075, -.12], legScale: 1,
  },
  'two-overhead': {
    twoHanded: true, overhead: true,
    yaw: [0, 0, 0], elevation: [3.6, .025, -.18], yawVelocity: 0, elevationVelocity: -4,
    gripX: [.02, .02, .02], gripY: [1.30, 1.10, 1.02], gripZ: [.25, .45, .44],
    bodyYaw: [0, 0], bodyPitch: [-.10, .26], bodyRoll: [0, 0], legScale: 1,
  },
});

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

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
    yaw, elevation, gripX, gripY, gripZ,
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
  const p = clamp01(progress), contact = .40;
  const windup = smooth(p / SWING_CONTACT_START);
  const recovery = smooth((p - SWING_CONTACT_END) / (1 - SWING_CONTACT_END));
  const raised = profile.elevation[0] + charge * .10;
  let yaw = profile.yaw[0], elevation = raised, yawRate = 0, elevationRate = 0;
  if (p >= SWING_CONTACT_START && p <= contact) {
    yaw = curve(p, SWING_CONTACT_START, contact, profile.yaw[0], profile.yaw[1], 0, profile.yawVelocity);
    elevation = curve(p, SWING_CONTACT_START, contact, raised, profile.elevation[1], 0, profile.elevationVelocity);
    yawRate = curveVelocity(p, SWING_CONTACT_START, contact, profile.yaw[0], profile.yaw[1], 0, profile.yawVelocity);
    elevationRate = curveVelocity(p, SWING_CONTACT_START, contact, raised, profile.elevation[1], 0, profile.elevationVelocity);
  } else if (p > contact) {
    yaw = curve(p, contact, SWING_CONTACT_END, profile.yaw[1], profile.yaw[2], profile.yawVelocity, 0);
    elevation = curve(p, contact, SWING_CONTACT_END, profile.elevation[1], profile.elevation[2], profile.elevationVelocity, 0);
    if (p < SWING_CONTACT_END) {
      yawRate = curveVelocity(p, contact, SWING_CONTACT_END, profile.yaw[1], profile.yaw[2], profile.yawVelocity, 0);
      elevationRate = curveVelocity(p, contact, SWING_CONTACT_END, profile.elevation[1], profile.elevation[2], profile.elevationVelocity, 0);
    }
  }

  const strike = smooth((p - SWING_CONTACT_START) / (contact - SWING_CONTACT_START));
  const follow = smooth((p - contact) / (SWING_CONTACT_END - contact));
  const grip = path => mix(mix(path[0], path[1], strike), path[2], follow);
  const drive = smooth((p - .10) / .44), settle = 1 - recovery;
  const envelope = values => (values[0] * windup + values[1] * drive) * settle;
  const weight = 1 + (profile.twoHanded ? .10 : 0) + charge * .08;
  const direction = profile.yaw[0] < 0 ? -1 : 1, legs = profile.legScale * settle;
  // Elevation is a slope, not an angle. Account for both tangent directions
  // on the normalized shaft so a vertical overhead blow also leaves a trail.
  const slopeSquared = 1 + elevation * elevation;
  const angularSpeed = Math.sqrt(yawRate * yawRate / slopeSquared
    + elevationRate * elevationRate / (slopeSquared * slopeSquared));
  const contactSpeed = Math.hypot(profile.yawVelocity, profile.elevationVelocity);
  return {
    yaw, elevation, gripX: grip(profile.gripX), gripY: grip(profile.gripY), gripZ: grip(profile.gripZ),
    bodyYaw: envelope(profile.bodyYaw) * weight,
    bodyPitch: envelope(profile.bodyPitch),
    bodyRoll: envelope(profile.bodyRoll),
    bodyDrop: profile.overhead ? (-.02 * windup - .05 * drive) * settle : (-.025 * windup - .025 * drive) * settle,
    leftLegPitch: profile.overhead ? (-.14 * windup + .18 * drive) * settle : (-.11 * windup + .23 * drive) * legs * direction,
    rightLegPitch: profile.overhead ? (.16 * windup - .20 * drive) * settle : (.16 * windup - .29 * drive) * legs * direction,
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
