// The shaft points along local +Y; the caller turns it toward
// normalize(sin(yaw), elevation, cos(yaw)). All positions are hero-local.
// Timing is normalized so reach/strength upgrades cannot slow the animation.
export const SWING_CONTACT_START = .16;
export const SWING_CONTACT_END = .68;

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
export function sampleHammerSwing(progress, options = {}) {
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
