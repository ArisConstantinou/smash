// The shaft points along local +Y. Turn it toward the returned unit
// directionX/Y/Z, then apply shaftTwist around its local +Y axis. The twist
// keeps the hammer's striking faces in the actual plane of the stroke.
// All positions are hero-local; normalized timing is independent of reach.
export const SWING_CONTACT_START = .16;
export const SWING_CONTACT_END = .68;
export const HAMMER_COMBOS = Object.freeze({
  oneHanded: Object.freeze(['one-forehand', 'one-backhand', 'one-diagonal', 'one-overhead', 'one-rising', 'one-cross']),
  twoHanded: Object.freeze(['two-broadside', 'two-cross', 'two-overhead', 'two-return', 'two-rising', 'two-cleave']),
});

// Six distinct strokes per stance. The selector below visits them without a
// fixed repeating chain, favouring the side where the previous stroke ended.
// Every stroke still uses the same physical contact window and input timing.
// pitch is an angle, not a slope: the overhead load can pass behind the crown.
// Triples describe load, front contact and follow-through. The hands stay in
// reach of the articulated arms, including when the torso turns underneath.
const SWING_PROFILES = Object.freeze({
  'one-forehand': {
    duration: .24,
    yaw: [1.75, -.08, -1.35], pitch: [.08, .03, .02], yawVelocity: -12, pitchVelocity: -.10,
    gripX: [.50, .30, .25], gripY: [1.08, 1.10, 1.09], gripZ: [.10, .36, .26],
    bodyYaw: [.26, -.72], bodyPitch: [-.04, .14], bodyRoll: [-.06, .15],
    bodyDrop: [-.025, -.025], legScale: .80,
  },
  'one-backhand': {
    duration: .27,
    yaw: [-1.45, .08, 1.45], pitch: [-.32, .05, .72], yawVelocity: 11, pitchVelocity: 3.1,
    gripX: [.24, .30, .48], gripY: [1.06, 1.08, 1.26], gripZ: [.12, .24, .14],
    bodyYaw: [-.22, .55], bodyPitch: [.10, -.18], bodyRoll: [.07, -.14],
    bodyDrop: [-.07, .055], legScale: .80,
  },
  'one-diagonal': {
    duration: .32, followEnd: .54,
    yaw: [.68, 0, -.58], pitch: [1.05, .08, -.28], yawVelocity: -4.8, pitchVelocity: -6,
    gripX: [.42, .25, .18], gripY: [1.32, 1.12, 1.00], gripZ: [.10, .36, .35],
    bodyYaw: [.12, -.40], bodyPitch: [-.12, .31], bodyRoll: [-.10, .22],
    bodyDrop: [.01, -.10], legScale: .95,
  },
  'two-broadside': {
    duration: .30, twoHanded: true,
    yaw: [2.25, -.08, -2.15], pitch: [-.14, -.08, -.02], yawVelocity: -16, pitchVelocity: .30,
    gripX: [.12, .02, .05], gripY: [.98, .93, .96], gripZ: [.22, .46, .30],
    bodyYaw: [.58, -1.22], bodyPitch: [.06, .10], bodyRoll: [-.10, .21],
    bodyDrop: [-.075, -.035], legScale: 1.45,
  },
  'two-cross': {
    duration: .34, twoHanded: true,
    yaw: [-1.68, .08, 1.55], pitch: [1.15, .02, -.36], yawVelocity: 11, pitchVelocity: -3.0,
    gripX: [.12, .14, .20], gripY: [1.43, 1.10, 1.00], gripZ: [.06, .31, .28],
    bodyYaw: [-.48, 1.05], bodyPitch: [-.12, .32], bodyRoll: [.12, -.24],
    bodyDrop: [.025, -.13], legScale: 1.40,
  },
  'one-overhead': {
    duration: .30, followEnd: .50, overhead: true,
    yaw: [.9, -.02, -.55], pitch: [2.5, .05, -.34], yawVelocity: -4.35, pitchVelocity: -11,
    gripX: [.32, .28, .26], gripY: [1.43, 1.10, 1.02], gripZ: [.02, .35, .35],
    bodyYaw: [.05, -.12], bodyPitch: [-.16, .35], bodyRoll: [-.03, .04],
    bodyDrop: [.025, -.12], legScale: 1.1,
  },
  'one-rising': {
    duration: .29, followEnd: .57,
    yaw: [0, 0, 0], pitch: [-.40, .02, 1.30], yawVelocity: 0, pitchVelocity: 5.5,
    gripX: [.20, .26, .38], gripY: [.96, 1.06, 1.28], gripZ: [.22, .32, .12],
    bodyYaw: [-.20, .48], bodyPitch: [.18, -.12], bodyRoll: [.08, -.12],
    bodyDrop: [-.12, .035], legScale: 1.05,
  },
  'one-cross': {
    duration: .31, followEnd: .55,
    yaw: [-.85, .03, .60], pitch: [1.05, .02, -.24], yawVelocity: 5.5, pitchVelocity: -5.5,
    gripX: [.19, .28, .39], gripY: [1.32, 1.11, .99], gripZ: [.10, .31, .22],
    bodyYaw: [-.20, .48], bodyPitch: [-.12, .28], bodyRoll: [.10, -.17],
    bodyDrop: [.015, -.11], legScale: 1.15,
  },
  'two-return': {
    duration: .29, twoHanded: true,
    yaw: [-1.92, .05, 1.88], pitch: [-.23, -.14, -.08], yawVelocity: 14, pitchVelocity: .30,
    gripX: [.10, .09, .13], gripY: [.96, .97, 1.00], gripZ: [.20, .35, .22],
    bodyYaw: [-.42, .82], bodyPitch: [.10, .15], bodyRoll: [.08, -.16],
    bodyDrop: [-.085, -.055], legScale: 1.35,
  },
  'two-rising': {
    duration: .33, followEnd: .56, twoHanded: true,
    yaw: [.05, .05, .05], pitch: [-.30, -.03, 1.42], yawVelocity: 0, pitchVelocity: 6,
    gripX: [.08, .08, .14], gripY: [.93, 1.03, 1.35], gripZ: [.22, .36, .10],
    bodyYaw: [-.32, .62], bodyPitch: [.20, -.14], bodyRoll: [.09, -.13],
    bodyDrop: [-.14, .04], legScale: 1.4,
  },
  'two-cleave': {
    duration: .35, followEnd: .53, twoHanded: true,
    yaw: [.92, -.03, -.72], pitch: [1.32, .03, -.34], yawVelocity: -6, pitchVelocity: -7,
    gripX: [.10, .04, .04], gripY: [1.42, 1.08, .98], gripZ: [.05, .38, .31],
    bodyYaw: [.32, -.69], bodyPitch: [-.17, .36], bodyRoll: [-.10, .18],
    bodyDrop: [.025, -.14], legScale: 1.4,
  },
  'two-overhead': {
    duration: .40, followEnd: .50, twoHanded: true, overhead: true,
    yaw: [0, 0, 0], pitch: [2.05, .06, -.38], yawVelocity: 0, pitchVelocity: -12,
    gripX: [.02, .02, .02], gripY: [1.50, 1.10, 1.00], gripZ: [.05, .48, .48],
    bodyYaw: [0, 0], bodyPitch: [-.19, .52], bodyRoll: [0, 0],
    bodyDrop: [.04, -.18], legScale: 1.50,
  },
});

// A short cut stays quick; the heavier silhouettes need enough visible load
// and recovery to read as a different move. Contact remains at 40% of each:
// the two-hand chain reaches the front at 120 / 136 / 160 milliseconds.
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


/** Per-stance bag: no identical adjacent strokes and no mechanical 1-2-3 loop.
 * The weighted choice prefers a load on the previous follow-through side.
 * `random` is injectable so continuity/coverage can be regression-tested.
 */
export function createSwingSequence() {
  return {remaining: [], recent: [], last: null, count: 0};
}
export function selectHammerSwing(state, {twoHanded = false, moving = false, random = Math.random} = {}) {
  const pool = twoHanded ? HAMMER_COMBOS.twoHanded : HAMMER_COMBOS.oneHanded;
  state.remaining = state.remaining.filter(name => pool.includes(name));
  if (!state.remaining.length) state.remaining = [...pool];
  let choices = state.remaining.filter(name => !state.recent.slice(-2).includes(name));
  if (!choices.length) choices = state.remaining.filter(name => name !== state.last);
  if (!choices.length) choices = [...state.remaining];
  const previous = SWING_PROFILES[state.last];
  const weights = choices.map(name => {
    const profile = SWING_PROFILES[name];
    const sameSide = previous && Math.sign(previous.yaw[2]) === Math.sign(profile.yaw[0]);
    return 1 + (sameSide ? 3 : 0) + (moving && /broadside|forehand|low|return/.test(name) ? 1.5 : 0);
  });
  const roll = Number(random());
  let cursor = (Number.isFinite(roll) ? Math.min(.99999999, Math.max(0, roll)) : .5) * weights.reduce((a,b) => a+b, 0);
  let selected = choices.at(-1);
  // A clean first opening remains learnable; subsequent bags are not reset.
  if (!state.count) selected = pool[0];
  else for (let i = 0; i < choices.length; i++) { cursor -= weights[i]; if (cursor < 0) { selected = choices[i]; break; } }
  state.remaining.splice(state.remaining.indexOf(selected), 1);
  state.last = selected; state.recent.push(selected); state.recent = state.recent.slice(-3); state.count++;
  return selected;
}

/** A supported two-hand carry during a turn, not a rigid sideways windmill.
 * The body leads a forward-facing weapon; hands stay in front of the ribs.
 * Subtle height changes and alternating pivot steps avoid a frozen T-pose.
 */
export function sampleSpinMotion(rotation, {twoHanded = true, recoil = 0} = {}) {
  const r = Number.isFinite(rotation) ? rotation : 0;
  const beat = Math.sin(r * 2), step = Math.sin(r);
  const yaw = .34 + Math.sin(r) * .04;
  const pitch = -.07 + beat * .045 + clamp01(recoil) * .10;
  const direction = shaftDirection(yaw, pitch, true);
  const center = twoHanded ? .255 : .43;
  return {...direction,
    gripX: (twoHanded ? .035 : .26) - direction.directionX * center,
    gripY: 1.15 + beat * .025 - direction.directionY * center,
    gripZ: (twoHanded ? .45 : .40) - direction.directionZ * center,
    bodyYaw: -.14 + step * .055, bodyPitch: .10 + beat * .025,
    bodyRoll: -.035 + step * .025, bodyDrop: -.045 - Math.abs(beat) * .025,
    leftStep: Math.max(0, step), rightStep: Math.max(0, -step),
    leftLegPitch: -.04 + beat * .10, rightLegPitch: -.04 - beat * .10,
  };
}
