import * as THREE from './vendor/three.module.js';

// Hand-built, low-poly models. Geometry and materials are deliberately shared;
// callers that tint a particular object should clone its materials first.
const GEO = new Map();
const MAT = new Map();
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const ico = new THREE.IcosahedronGeometry(1, 0);
const vertexMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
vertexMaterial.userData.baseEmissive = 0;
vertexMaterial.userData.baseEmissiveIntensity = 1;
const PALETTE = {
  ink: 0x17252f, shadow: 0x263642, steel: 0x6d8994, pale: 0xc4d2ca,
  blue: 0x296f91, blueLight: 0x4ea1b3, blueDark: 0x21485f,
  gold: 0xffb94f, hot: 0xff683f, cream: 0xffe4a0,
  timber: 0x7a5842, timberDark: 0x493d36, green: 0x83a467,
};

function material(color, glow = 0) {
  const key = `${color}:${glow}`;
  if (!MAT.has(key)) {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (glow) { m.emissive.setHex(color); m.emissiveIntensity = glow; }
    m.userData.baseEmissive = m.emissive.getHex();
    m.userData.baseEmissiveIntensity = m.emissiveIntensity;
    MAT.set(key, m);
  }
  return MAT.get(key);
}

function part(parent, geometry, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, glow = 0) {
  const mesh = new THREE.Mesh(geometry, material(color, glow));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(g, c, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0, glow = 0) {
  return part(g, UNIT_BOX, c, x, y, z, w, h, d, rx, ry, rz, glow);
}

function cylinder(g, c, x, y, z, rt, rb, h, sides = 8, rx = 0, ry = 0, rz = 0, glow = 0) {
  const key = `c:${rt}:${rb}:${h}:${sides}`;
  if (!GEO.has(key)) GEO.set(key, new THREE.CylinderGeometry(rt, rb, h, sides, 1));
  return part(g, GEO.get(key), c, x, y, z, 1, 1, 1, rx, ry, rz, glow);
}

function crystal(g, c, x, y, z, w, h, d, ry = 0, glow = 0) {
  return part(g, ico, c, x, y, z, w, h, d, 0, ry, 0, glow);
}

function group(parent, name, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// Static matte detail becomes a single vertex-colored mesh. Emissive windows
// and eyes retain their own materials. Fine silhouette detail is cheap to draw.
function compact(root, destructible = false) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const transform = new THREE.Matrix4();
  const buckets = new Map();
  const remove = [];
  root.traverse(node => {
    if (!node.isMesh) return;
    const original = node.material;
    const glowing = original.emissive && original.emissive.getHex() !== 0;
    const key = glowing ? original.uuid : 'matte';
    const mat = glowing ? original : vertexMaterial;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { mat, positions: [], normals: [], colors: [], parts: [] }; buckets.set(key, bucket); }
    const geo = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    transform.multiplyMatrices(inverse, node.matrixWorld);
    bucket.parts.push({start:bucket.positions.length/3,count:geo.attributes.position.count,box:node.geometry===UNIT_BOX,matrix:transform.toArray(),tint:original.color.getHex(),glow:glowing?original.emissiveIntensity:0});
    geo.applyMatrix4(transform);
    const p = geo.getAttribute('position');
    let n = geo.getAttribute('normal');
    if (!n) { geo.computeVertexNormals(); n = geo.getAttribute('normal'); }
    for (let i = 0; i < p.array.length; i++) bucket.positions.push(p.array[i]);
    for (let i = 0; i < n.array.length; i++) bucket.normals.push(n.array[i]);
    if (!glowing || destructible) {
      const oldColor = geo.getAttribute('color');
      for (let i = 0; i < p.count; i++) {
        bucket.colors.push(original.color.r * (oldColor ? oldColor.getX(i) : 1));
        bucket.colors.push(original.color.g * (oldColor ? oldColor.getY(i) : 1));
        bucket.colors.push(original.color.b * (oldColor ? oldColor.getZ(i) : 1));
      }
    }
    geo.dispose();
    remove.push(node);
  });
  for (const mesh of remove) mesh.removeFromParent();
  for (const bucket of buckets.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
    if (bucket.colors.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3));
    geometry.userData.collisionParts = bucket.parts;
    if(destructible)geometry.userData.fractureParts = bucket.parts;
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, bucket.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return root;
}

function limb(root, name, x, y, z, upper, lower, boot, scale = 1) {
  const g = group(root, name, x, y, z);
  box(g, upper, 0, -.16 * scale, 0, .25 * scale, .36 * scale, .28 * scale);
  box(g, lower, 0, -.39 * scale, .035 * scale, .29 * scale, .24 * scale, .31 * scale);
  box(g, boot, 0, -.51 * scale, .075 * scale, .32 * scale, .17 * scale, .45 * scale);
  return compact(g);
}

// Animation is additive to these joint rests. Keeping the hips apart and the
// elbows slightly away from the ribs preserves a readable body silhouette
// while the existing knee and weapon-contact chains continue to articulate.
function restLimb(joint, side, roll = 0, yaw = 0) {
  joint.userData.restPosition = { x: joint.position.x, y: joint.position.y, z: joint.position.z };
  joint.userData.restRoll = side * roll;
  joint.userData.restYaw = side * yaw;
  joint.rotation.set(0, joint.userData.restYaw, joint.userData.restRoll);
  return joint;
}

// Beveled edges keep small equipment silhouettes readable in the overhead
// camera. These are real facets, so highlights still move with the weapon.
function beveledBox(g, color, x, y, z, width, height, depth, bevel = .035) {
  const key = `bevel:${width}:${height}:${depth}:${bevel}`;
  if (!GEO.has(key)) {
    const w = width / 2 - bevel, h = height / 2 - bevel;
    const shape = new THREE.Shape();
    shape.moveTo(-w, -h); shape.lineTo(w, -h); shape.lineTo(w, h);
    shape.lineTo(-w, h); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(.01, depth - bevel * 2), bevelEnabled: true,
      bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, steps: 1,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -Math.max(.01, depth - bevel * 2) / 2);
    GEO.set(key, geometry);
  }
  return part(g, GEO.get(key), color, x, y, z);
}

function growthRing(g, color, radius, y, x = 0, z = 0, thickness = .009) {
  const key = `wood-ring:${radius}:${thickness}`;
  if (!GEO.has(key)) GEO.set(key, new THREE.TorusGeometry(radius, thickness, 3, 11));
  return part(g, GEO.get(key), color, x, y, z, 1, 1, 1, Math.PI / 2);
}

// An asymmetric, tapered piece of tree trunk. Its length and broad cut end
// stay visible from the game camera; the thick lower neck joins the shaft
// continuously instead of reading as a small mallet head on a thin stick.
function logHead(g, banded = false) {
  const sides = 10, positions = [], colors = [];
  const color = new THREE.Color();
  const levels = [
    { y: -.56, r: .20, x: -.015, z: 0 },
    { y: -.34, r: .30, x: -.025, z: .015 },
    { y: .20, r: .35, x: .015, z: -.005 },
    { y: .56, r: .325, x: .035, z: .015 },
  ];
  const bark = [0x654732, 0x80573a, 0x946443, 0x704b34, 0xa07149];
  const ringPoint = (level, i) => {
    const angle = (i % sides) * Math.PI * 2 / sides;
    const radius = level.r * (1 + Math.sin(i * 2.37) * .075);
    return [level.x + Math.sin(angle) * radius, level.y, level.z + Math.cos(angle) * radius];
  };
  const triangle = (a, b, c, tint) => {
    positions.push(...a, ...b, ...c); color.setHex(tint);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  for (let row = 0; row < levels.length - 1; row++) {
    for (let side = 0; side < sides; side++) {
      const a = ringPoint(levels[row], side), b = ringPoint(levels[row], side + 1);
      const c = ringPoint(levels[row + 1], side), d = ringPoint(levels[row + 1], side + 1);
      triangle(a, b, c, bark[side % bark.length]);
      triangle(b, d, c, bark[(side + row) % bark.length]);
    }
  }
  for (let i = 0; i < sides; i++) {
    triangle([-.015, -.56, 0], ringPoint(levels[0], i + 1), ringPoint(levels[0], i), 0x875b3b);
    triangle([.035, .56, .015], ringPoint(levels[3], i), ringPoint(levels[3], i + 1), 0xd5ad76);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const barkMesh = new THREE.Mesh(geometry, vertexMaterial);
  barkMesh.name = 'sculptedBark'; g.add(barkMesh);
  // The authored source is compacted immediately below; avoid retaining its
  // temporary geometry after the merged equipment mesh has been created.
  g.userData.sourceGeometry = geometry;
  for (const radius of [.095, .18, .265]) growthRing(g, 0x8b613d, radius, .564, .035, .015, .011);
  for (const [angle, length] of [[.3, .12], [2.4, .10], [4.1, .15]]) {
    box(g, 0x80583b, .035 + Math.sin(angle) * .26, .567, .015 + Math.cos(angle) * .26,
      .012, .006, length, 0, angle, 0);
  }
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + .12, radius = .325;
    box(g, i % 2 ? 0x4d3528 : 0xaf7e51, Math.sin(angle) * radius, -.02,
      Math.cos(angle) * radius, .035, .74 + (i % 3) * .04, .022, 0, angle, -.045);
  }
  const knot = group(g, 'brokenBranch', .31, .025, .075);
  knot.rotation.z = -1.06;
  cylinder(knot, 0x66452f, 0, .07, 0, .078, .12, .23, 7);
  cylinder(knot, 0xc69a64, 0, .19, 0, .072, .074, .016, 7);
  growthRing(knot, 0x805638, .038, .2, 0, 0, .008);
  if (banded) {
    for (const [y, radius] of [[-.30, .312], [.30, .352]]) {
      cylinder(g, 0x58666a, 0, y, .008, radius, radius, .09, 10);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        crystal(g, 0xbbbfaf, Math.sin(angle) * (radius + .012), y,
          .008 + Math.cos(angle) * (radius + .012), .025, .026, .025);
      }
    }
  }
}

// One small, continuous coil is instanced along the exposed shaft. Reach
// upgrades add coils instead of stretching spikes into long needles; even a
// very long weapon needs only one draw call for its entire wire wrapping.
const BARBED_PITCH = .24, BARBED_START = .77, BARBED_CAPACITY = 256;
let barbedCoilRadius = 0;
function makeBarbedCoils() {
  const key = 'hammer-barbed-coil';
  if (!GEO.has(key)) {
    const detail = new THREE.Group();
    const temporary = [];
    for (const [phase, tint] of [[0, 0xc1c8c4], [.26, 0x687b81]]) {
      const curve = new THREE.Curve();
      curve.getPoint = (t, out = new THREE.Vector3()) => {
        const angle = t * Math.PI * 2 + phase;
        return out.set(Math.cos(angle) * .101, (t - .5) * BARBED_PITCH, Math.sin(angle) * .101);
      };
      const wire = new THREE.TubeGeometry(curve, 16, .018, 4, false);
      temporary.push(wire); part(detail, wire, tint, 0, 0, 0);
    }
    const up = new THREE.Vector3(0, 1, 0);
    for (let side = 0; side < 4; side++) {
      const angle = side * Math.PI / 2, slope = side % 2 ? -1 : 1;
      const from = new THREE.Vector3(Math.cos(angle) * .09, slope * .018, Math.sin(angle) * .09);
      const to = new THREE.Vector3(Math.cos(angle) * .213, slope * .074, Math.sin(angle) * .213);
      const delta = to.clone().sub(from), length = delta.length();
      const barb = cylinder(detail, side % 2 ? 0xa5b6b7 : 0xe1e0cd, 0, 0, 0, 0, .032, length, 4);
      barb.position.copy(from).add(to).multiplyScalar(.5);
      barb.quaternion.setFromUnitVectors(up, delta.divideScalar(length));
    }
    compact(detail);
    for (const geometry of temporary) geometry.dispose();
    const geometry = detail.children.find(node => node.isMesh).geometry;
    geometry.computeBoundingBox();
    const points = geometry.getAttribute('position');
    // A capsule through the coil centers must also contain the bent tips at
    // their small axial offsets, including the first and last complete coil.
    for (let i = 0; i < points.count; i++) barbedCoilRadius = Math.max(barbedCoilRadius,
      Math.hypot(points.getX(i), points.getY(i), points.getZ(i)));
    GEO.set(key, geometry);
  }
  const mesh = new THREE.InstancedMesh(GEO.get(key), vertexMaterial, BARBED_CAPACITY);
  mesh.name = 'twistedWireAndBarbs';
  mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

function drawHandGuard(parent, iron = 0x7e9299) {
  cylinder(parent, iron, 0, 0, 0, .185, .16, .075, 8);
  cylinder(parent, 0xc5c9b9, 0, .043, 0, .17, .18, .018, 8);
}

export function makeWarrior() {
  const root = new THREE.Group();
  root.name = 'Warrior — Stormforged';
  const P = PALETTE;
  const body = group(root, 'body');
  // Layered cuirass, leather undercoat, raised gorget, and golden clasp.
  box(body, P.ink, 0, .93, 0, .66, .65, .4);
  box(body, P.blue, 0, 1.1, .025, .73, .5, .48);
  box(body, P.blueLight, 0, 1.24, .277, .46, .2, .07);
  box(body, P.steel, 0, .89, .29, .66, .13, .09);
  box(body, P.timberDark, 0, .74, .01, .72, .13, .47);
  box(body, P.gold, 0, .75, .28, .15, .15, .06);
  box(body, P.steel, 0, 1.38, 0, .47, .13, .38);
  // Helmet and visible face looking along +Z.
  box(body, 0xc7936e, 0, 1.5, .055, .39, .34, .36);
  box(body, P.steel, 0, 1.64, -.01, .55, .31, .48);
  box(body, P.pale, 0, 1.79, -.025, .39, .08, .39);
  box(body, P.ink, 0, 1.55, .237, .43, .09, .035);
  box(body, P.gold, -.115, 1.555, .261, .075, .036, .025, 0, 0, 0, .7);
  box(body, P.gold, .115, 1.555, .261, .075, .036, .025, 0, 0, 0, .7);
  box(body, P.pale, 0, 1.54, .275, .075, .25, .05);
  box(body, P.blueDark, -.263, 1.53, 0, .095, .29, .38);
  box(body, P.blueDark, .263, 1.53, 0, .095, .29, .38);
  // Copper helmet crest, not a flat silhouette.
  box(body, P.hot, 0, 1.91, -.045, .11, .21, .43);
  box(body, P.gold, 0, 1.96, -.025, .06, .12, .29);
  compact(body);

  const legRest = Object.freeze({ spread: .25, height: .62, splay: .055, turnOut: .055 });
  const leftLeg = restLimb(limb(root, 'leftLeg', -legRest.spread, legRest.height, 0, P.blueDark, P.steel, P.ink), -1, legRest.splay, legRest.turnOut);
  const rightLeg = restLimb(limb(root, 'rightLeg', legRest.spread, legRest.height, 0, P.blueDark, P.steel, P.ink), 1, legRest.splay, legRest.turnOut);
  // Preserve the leg roots used by walking, but give kicks an actual knee.
  for(const leg of [leftLeg,rightLeg]){
    // Existing storm-tier geometry remains the reference for normal walking;
    // replacement equipment is authored into these two independent pieces.
    const thigh=group(leg,'thigh'),shin=group(leg,'shin',0,-.30,0);
    leg.userData.thigh=thigh;leg.userData.shin=shin;
    leg.userData.foot=group(shin,'footContact',0,-.22,.27);
  }
  // Articulated arms connect fixed shoulders to hero-owned gauntlets. A hand
  // can follow a shield handle, a hammer grip or a throwing follow-through.
  function grippingArm(side) {
    const arm = group(root, side < 0 ? 'leftArm' : 'rightArm', side * .51, 1.28, .015);
    const pauldron = group(arm, 'pauldron');
    box(pauldron, P.steel, side * .025, -.015, 0, .36, .23, .44, 0, 0, side * .13);
    box(pauldron, P.pale, side * .03, .095, .025, .29, .065, .35, 0, 0, side * .13);
    box(pauldron, P.gold, side * .03, -.03, .23, .2, .055, .04);
    compact(pauldron);
    const upper = group(arm, 'upperArm');
    box(upper, P.blueDark, 0, 0, 0, .235, 1, .265);
    box(upper, P.blue, 0, -.1, .13, .16, .68, .05);
    compact(upper);
    const fore = group(arm, 'forearm');
    box(fore, P.timberDark, 0, 0, 0, .205, 1, .225);
    box(fore, P.steel, 0, .22, .015, .26, .49, .27);
    compact(fore);
    const elbowPole = new THREE.Vector3(side * 1.1, -.9, .20).normalize();
    arm.userData = { upper, fore, side, elbowPole, elbowBend: elbowPole.clone(),
      restPosition: { x: arm.position.x, y: arm.position.y, z: arm.position.z } };
    return arm;
  }
  const leftArm = grippingArm(-1);
  const rightArm = grippingArm(1);
  const shoulderRests = [
    { arm: leftArm, position: leftArm.position.clone() },
    { arm: rightArm, position: rightArm.position.clone() },
  ];

  const cape = group(root, 'cape', 0, 1.32, -.27);
  box(cape, 0xc86035, 0, -.25, -.06, .6, .59, .07, -.17);
  box(cape, P.hot, -.13, -.62, -.14, .38, .27, .08, -.25, 0, -.06);
  box(cape, 0x923b30, .22, -.58, -.13, .18, .24, .08, -.25, 0, .08);
  compact(cape);

  const weaponRest = { x: .22, y: 0, z: -.24 };
  const weaponRestPosition = new THREE.Vector3(.53, .98, .23);
  const weaponRig = group(root, 'weaponRig');
  weaponRig.position.copy(weaponRestPosition);
  weaponRig.rotation.set(weaponRest.x, weaponRest.y, weaponRest.z);
  const hammerPivot = group(weaponRig, 'hammerPivot');
  const handle = group(hammerPivot, 'hammerHandle');
  cylinder(handle, P.timberDark, 0, .2, 0, .07, .085, .68, 8);
  for (let i = 0; i < 6; i++) box(handle, P.timber, 0, -.035 + i * .1, 0, .15, .035, .15);
  box(handle, P.gold, 0, -.13, 0, .18, .16, .18);
  compact(handle);
  // A separate unit shaft allows reach upgrades without squashing the head
  // or moving either hand's grip point along the wrapped part of the handle.
  const shaft = group(hammerPivot, 'hammerShaft');
  cylinder(shaft, P.timberDark, 0, 0, 0, .062, .07, 1, 8);
  box(shaft, P.timber, 0, 0, .067, .045, .92, .017);
  compact(shaft);
  const collar = group(hammerPivot, 'hammerCollar');
  box(collar, P.steel, 0, 0, 0, .2, .13, .2);
  compact(collar);
  // Both hands remain on plain wrapped wood. The metal flange is beyond the
  // forward hand; the first sharp wire sits farther toward the head again.
  const handGuard = group(hammerPivot, 'hammerHandGuard', 0, .64, 0);
  drawHandGuard(handGuard); compact(handGuard);
  const barbedWrap = group(hammerPivot, 'hammerBarbedWrap');
  barbedWrap.add(makeBarbedCoils());
  barbedWrap.visible = false;
  const hammerHead = group(hammerPivot, 'hammerHead', 0, 1.43, 0);
  box(hammerHead, P.ink, 0, 0, 0, 1.27, .58, .63);
  box(hammerHead, P.blue, 0, .015, 0, 1.02, .65, .69);
  box(hammerHead, P.steel, -.59, 0, 0, .18, .67, .73);
  box(hammerHead, P.steel, .59, 0, 0, .18, .67, .73);
  box(hammerHead, P.pale, -.69, 0, 0, .07, .51, .61);
  box(hammerHead, P.pale, .69, 0, 0, .07, .51, .61);
  box(hammerHead, P.gold, 0, 0, .357, .31, .35, .035, 0, 0, Math.PI / 4, .45);
  box(hammerHead, P.cream, 0, 0, .381, .075, .31, .025, 0, 0, 0, .5);
  box(hammerHead, P.gold, 0, 0, -.357, .24, .32, .035, 0, 0, Math.PI / 4, .45);
  box(hammerHead, P.gold, 0, .34, 0, .18, .05, .53);
  compact(hammerHead);
  const leftGripAnchor = group(hammerPivot, 'leftGripAnchor', 0, .08, 0);
  const rightGripAnchor = group(hammerPivot, 'rightGripAnchor', 0, .43, 0);

  // This single shield is carried all the way around the shoulder and onto
  // the back. It is a solid beveled steel plate with a gold rim, boss, rivets,
  // back straps and an actual handle for the left gauntlet.
  const shieldRig = group(root, 'shieldRig');
  const shield = group(shieldRig, 'steelAndGoldShield');
  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(-.48, .54); shieldShape.lineTo(.48, .54);
  shieldShape.lineTo(.46, -.04); shieldShape.lineTo(.32, -.4);
  shieldShape.lineTo(0, -.66); shieldShape.lineTo(-.32, -.4);
  shieldShape.lineTo(-.46, -.04); shieldShape.closePath();
  const shieldPlate = new THREE.ExtrudeGeometry(shieldShape, {
    depth: .1, steps: 1, bevelEnabled: true, bevelThickness: .025,
    bevelSize: .025, bevelSegments: 1, curveSegments: 1,
  });
  part(shield, shieldPlate, 0xd7ad61, 0, 0, -.05);
  part(shield, shieldPlate, 0x93a7ad, 0, .015, .025, .87, .87, .45);
  part(shield, shieldPlate, 0x3d6579, 0, .025, .067, .72, .73, .26);
  box(shield, 0xd7ad61, 0, -.015, .118, .07, .86, .04);
  box(shield, 0xd7ad61, 0, .26, .118, .67, .07, .04);
  cylinder(shield, 0xd7ad61, 0, .025, .145, .19, .19, .055, 10, Math.PI / 2);
  cylinder(shield, P.pale, 0, .025, .19, .12, .16, .1, 8, Math.PI / 2);
  for (const [x, y] of [[-.405, .45], [.405, .45], [-.393, .05], [.393, .05], [-.26, -.35], [.26, -.35], [0, -.56]]) {
    cylinder(shield, P.cream, x, y, .075, .025, .025, .055, 6, Math.PI / 2);
  }
  // The metal rear has leather forearm straps and a center hand grip.
  box(shield, P.timberDark, -.22, .03, -.106, .11, .62, .075);
  box(shield, P.timberDark, .22, .03, -.106, .11, .62, .075);
  for (const y of [-.1, .23]) box(shield, P.steel, 0, y, -.135, .31, .065, .1);
  cylinder(shield, P.timberDark, 0, .065, -.197, .056, .056, .32, 8);
  compact(shield);
  shieldPlate.dispose();
  const shieldGripAnchor = group(shieldRig, 'shieldGripAnchor', 0, .065, -.197);

  // Hands belong to the warrior, never to the flying hammer. Markers on the
  // weapons describe contact points but contain no visible hand geometry.
  const leftGrip = group(root, 'leftGrip');
  const rightGrip = group(root, 'rightGrip');
  for (const [side, grip] of [[-1,leftGrip], [1,rightGrip]]) {
    box(grip, P.timberDark, 0, 0, 0, .25, .2, .26);
    box(grip, P.steel, 0, .01, -.035, .28, .15, .2);
    box(grip, P.gold, 0, -.079, 0, .27, .045, .28);
    box(grip, P.pale, side * .12, 0, .075, .065, .14, .15);
    compact(grip);
  }
  let stance = 0, weaponHeld = true, reachScale = 1, equipmentTier = 4;
  let unarmedPose = null, ridingAnchor = null;
  function setUnarmedPose(pose) { unarmedPose = pose; }
  function setRidingAnchor(anchor) { ridingAnchor=anchor; }
  let shieldEquipped = true;
  const shieldFront = new THREE.Vector3(-.72, 1.025, .5);
  const shieldBack = new THREE.Vector3(0, 1.11, -.55);
  const shieldPath = new THREE.CubicBezierCurve3(shieldFront,
    new THREE.Vector3(-1.04, 1.84, .42), new THREE.Vector3(-.91, 1.88, -.74), shieldBack);
  const shieldFrontQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(.06, -.25, -.13));
  const shieldBackQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(.07, Math.PI, .04));
  const leftJoinControl = new THREE.Vector3(-.75, 1.43, .16);
  const emptyRight = new THREE.Vector3(.61, 1.22, .66);
  const emptyLeft = new THREE.Vector3(-.48, 1.06, .43);
  const emptyRightQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(.8, -.1, -.3));
  const emptyLeftQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(.3, 0, .2));
  const shieldContact = new THREE.Vector3(), hammerContact = new THREE.Vector3();
  const shieldContactQuaternion = new THREE.Quaternion(), hammerContactQuaternion = new THREE.Quaternion();
  const rootInverseQuaternion = new THREE.Quaternion();
  const smooth = v => { const n = Math.max(0, Math.min(1, v)); return n * n * (3 - 2 * n); };

  function poseShield() {
    const progress = ridingAnchor ? 1 : weaponHeld ? smooth(stance / .65) : 1;
    shieldPath.getPoint(progress, shieldRig.position);
    shieldRig.quaternion.slerpQuaternions(shieldFrontQuaternion, shieldBackQuaternion, progress);
    shieldRig.rotateX(-.35 * Math.sin(Math.PI * progress));
    shieldRig.position.applyMatrix4(body.matrix);
    shieldRig.quaternion.premultiply(body.quaternion);
    shieldRig.userData.attachment = shieldEquipped ? (weaponHeld && stance < .65 && !ridingAnchor ? 'left-hand' : 'back') : 'none';
  }

  function anchorInHero(anchor, position, quaternion) {
    anchor.getWorldPosition(position);
    root.worldToLocal(position);
    anchor.getWorldQuaternion(quaternion);
    quaternion.premultiply(rootInverseQuaternion);
  }

  const gripTarget = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const axisY = new THREE.Vector3(0, 1, 0);
  const zero = new THREE.Vector3();
  const segmentDelta = new THREE.Vector3();
  const reachDirection = new THREE.Vector3();
  const bendDirection = new THREE.Vector3();
  const upperArmLength = .44, forearmLength = .46;
  const handX = new THREE.Vector3(), handY = new THREE.Vector3(), handZ = new THREE.Vector3();
  const elbowInHero = new THREE.Vector3(), forearmDirection = new THREE.Vector3(), handBasis = new THREE.Matrix4();
  function orientHand(arm, grip, anchor) {
    // -Y is the cuff toward the elbow. Let the handle sit obliquely in the
    // palm when necessary: forcing the thumb exactly along the shaft can
    // fold a wrist almost sideways during a long-weapon swing.
    elbowInHero.copy(elbow); arm.localToWorld(elbowInHero); root.worldToLocal(elbowInHero);
    handY.subVectors(grip.position, elbowInHero).normalize();
    forearmDirection.copy(handY);
    if(anchor){
      anchor.getWorldQuaternion(grip.quaternion).premultiply(rootInverseQuaternion);
      handX.set(0,arm.userData.side,0).applyQuaternion(grip.quaternion).normalize();
      handY.addScaledVector(handX,-handY.dot(handX));
      if(handY.lengthSq()<1e-7)handY.set(arm.userData.side,0,0).addScaledVector(handX,-arm.userData.side*handX.x);
      if(handY.lengthSq()<1e-7)handY.set(0,0,1).addScaledVector(handX,-handX.z);
      handY.normalize();
      const bend = Math.acos(Math.max(-1,Math.min(1,handY.dot(forearmDirection))));
      const maxBend = Math.PI / 4;
      if(bend>maxBend){
        const sine = Math.sin(bend);
        handY.multiplyScalar(Math.sin(maxBend)/sine)
          .addScaledVector(forearmDirection,Math.sin(bend-maxBend)/sine).normalize();
      }
      handX.addScaledVector(handY,-handX.dot(handY)).normalize();
      handZ.crossVectors(handX,handY).normalize();
    }else{
      handZ.set(0,0,1).applyQuaternion(body.quaternion);
      handX.crossVectors(handY,handZ).normalize(); handZ.crossVectors(handX,handY).normalize();
    }
    handBasis.makeBasis(handX,handY,handZ);grip.quaternion.setFromRotationMatrix(handBasis);
  }
  function poseSegment(segment, start, end) {
    segment.position.copy(start).add(end).multiplyScalar(.5);
    segmentDelta.subVectors(end, start);
    const length = Math.max(.05, segmentDelta.length());
    segment.quaternion.setFromUnitVectors(axisY, segmentDelta.divideScalar(length));
    segment.scale.set(1, length, 1);
  }
  function updateGrip() {
    body.updateMatrix();
    for (const { arm, position } of shoulderRests) {
      arm.position.copy(position).applyMatrix4(body.matrix);
      arm.quaternion.copy(body.quaternion);
      arm.scale.copy(body.scale);
    }
    poseShield();
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(rootInverseQuaternion).invert();
    if (weaponHeld) {
      anchorInHero(rightGripAnchor, rightGrip.position, rightGrip.quaternion);
    } else {
      rightGrip.position.copy(unarmedPose?.right || emptyRight).applyMatrix4(body.matrix);
      rightGrip.quaternion.copy(emptyRightQuaternion);
    }
    if (shieldEquipped) anchorInHero(shieldGripAnchor, shieldContact, shieldContactQuaternion);
    else {
      shieldContact.copy(emptyLeft).applyMatrix4(body.matrix);
      shieldContactQuaternion.copy(body.quaternion).multiply(emptyLeftQuaternion);
    }
    if (weaponHeld) anchorInHero(leftGripAnchor, hammerContact, hammerContactQuaternion);
    else { hammerContact.copy(emptyLeft); hammerContactQuaternion.copy(emptyLeftQuaternion); }
    const join = smooth(shieldEquipped ? (stance - .65) / .35 : stance);
    if (join <= 0) {
      leftGrip.position.copy(shieldContact);
      leftGrip.quaternion.copy(shieldContactQuaternion);
    } else {
      // Reach around the left side of the torso, not straight through it.
      leftGrip.position.copy(shieldContact).multiplyScalar((1 - join) ** 2)
        .addScaledVector(leftJoinControl, 2 * (1 - join) * join)
        .addScaledVector(hammerContact, join ** 2);
      leftGrip.quaternion.slerpQuaternions(shieldContactQuaternion, hammerContactQuaternion, join);
    }
    if (!weaponHeld && unarmedPose) {
      leftGrip.position.copy(unarmedPose.left).applyMatrix4(body.matrix);
      // A stowed shield must not claim the free hand during a punch.
      shieldRig.visible = shieldEquipped;
    } else shieldRig.visible = shieldEquipped;
    if(ridingAnchor)anchorInHero(ridingAnchor,leftGrip.position,leftGrip.quaternion);
    leftGrip.visible = true; rightGrip.visible = true;
    root.updateMatrixWorld(true);
    for (const [arm, grip] of [[leftArm, leftGrip], [rightArm, rightGrip]]) {
      grip.getWorldPosition(gripTarget);
      arm.worldToLocal(gripTarget);
      const distance = gripTarget.length();
      reachDirection.copy(gripTarget).divideScalar(Math.max(distance, 1e-8));
      if (distance < 1e-8) reachDirection.set(0, 0, 1);
      // A real two-bone chain bends at the elbow instead of growing and
      // shrinking with each swing. Extreme guard/stance poses may put a grip
      // outside the arm span; extend both bones proportionally to retain contact.
      const extension = Math.max(1, distance / (upperArmLength + forearmLength));
      const upperLength = upperArmLength * extension, foreLength = forearmLength * extension;
      const along = Math.max(-upperLength, Math.min(upperLength,
        (upperLength * upperLength - foreLength * foreLength + distance * distance) / (2 * Math.max(distance, 1e-8))));
      const bend = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
      bendDirection.copy(arm.userData.elbowPole).addScaledVector(reachDirection, -arm.userData.elbowPole.dot(reachDirection));
      if (bendDirection.lengthSq() < 1e-5) {
        // Keep the previous bend plane if the hand crosses the pole axis.
        bendDirection.copy(arm.userData.elbowBend).addScaledVector(reachDirection, -arm.userData.elbowBend.dot(reachDirection));
        if (bendDirection.lengthSq() < 1e-5) {
          bendDirection.set(0, 0, 1).addScaledVector(reachDirection, -reachDirection.z);
          if (bendDirection.lengthSq() < 1e-5) bendDirection.set(arm.userData.side, 0, 0);
        }
      }
      bendDirection.normalize();
      // Choose the anatomical outward/downward half-plane every solve.
      // Flipping to match yesterday's bend transported the elbow to the back
      // of the arm after a full spin and kept it there even at rest.
      arm.userData.elbowBend.copy(bendDirection);
      elbow.copy(reachDirection).multiplyScalar(along).addScaledVector(bendDirection, bend);
      poseSegment(arm.userData.upper, zero, elbow);
      poseSegment(arm.userData.fore, elbow, gripTarget);
      orientHand(arm,grip,grip===rightGrip?(weaponHeld?rightGripAnchor:null):
        (ridingAnchor|| (weaponHeld&&join>.99?leftGripAnchor:shieldEquipped&&join<.01&&!(unarmedPose&&!weaponHeld)?shieldGripAnchor:null)));
    }
  }

  function setStance(progress) {
    stance = Math.max(0, Math.min(1, Number(progress) || 0));
    // Metadata only: the game owns weaponRig position/quaternion animations.
    weaponRest.x = .22 + (.55 - .22) * stance;
    weaponRest.y = 0;
    weaponRest.z = -.24 + (-.72 + .24) * stance;
    weaponRestPosition.set(.53 * (1 - stance), .98 + .06 * stance, .23 + .15 * stance);
    if (equipmentTier < 2) {
      // Carry the heavy wood forward with bent elbows, rather than balancing
      // it upright on one wrist. Both anchor points stay on the real handle.
      weaponRest.x = .30 + .56 * stance;
      weaponRest.z = -.23 - .05 * stance;
      weaponRestPosition.set(.48 - .60 * stance, .93 - .03 * stance, .25 + .05 * stance);
    }
    root.userData.stance = stance;
    root.userData.shieldStored = shieldEquipped && (!weaponHeld || stance >= .65);
    updateGrip();
    return stance;
  }

  function setReach(scale) {
    const n = Number(scale);
    reachScale = Number.isFinite(n) ? Math.max(.35, n) : 1;
    hammerHead.position.y = .43 + reachScale;
    const length = Math.max(.1, hammerHead.position.y - .21 - .5);
    shaft.position.y = .5 + length / 2;
    shaft.scale.set(1, length, 1);
    collar.position.y = hammerHead.position.y - .31;
    root.userData.reachScale = reachScale;
    updateBarbedWrap();
    return hammerHead.position.y;
  }

  function setWeaponVisible(visible) {
    weaponHeld = !!visible;
    hammerPivot.visible = weaponHeld;
    root.userData.weaponHeld = weaponHeld;
    updateGrip();
    return weaponHeld;
  }

  // Gameplay asks the equipped geometry for its contact volume. The measured
  // data excludes hands, hidden helpers and old equipment. Geometry is read
  // only when changing tier; growth upgrades just rescale these cached points.
  const contactCache = {
    tier: -1, head: new THREE.Box3(), headPoints: [], shaftPoints: [],
    sizeKey: '', radius: 0, forward: 0, shaftRadius: 0, halfExtents: {x: 0, y: 0, z: 0},
  };
  const contactVertex = new THREE.Vector3();
  function measureContactGeometry() {
    if (contactCache.tier === equipmentTier) return;
    contactCache.tier = equipmentTier;
    contactCache.sizeKey = '';
    contactCache.head.makeEmpty();
    contactCache.headPoints.length = 0; contactCache.shaftPoints.length = 0;
    const collect = (node, parentMatrix, points, bounds) => {
      if (!node.visible) return;
      node.updateMatrix();
      const transform = new THREE.Matrix4().multiplyMatrices(parentMatrix, node.matrix);
      if (node.isMesh) {
        const positions = node.geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index++) {
          contactVertex.fromBufferAttribute(positions, index).applyMatrix4(transform);
          points.push(contactVertex.x, contactVertex.y, contactVertex.z);
          bounds?.expandByPoint(contactVertex);
        }
      }
      for (const child of node.children) collect(child, transform, points, bounds);
    };
    const identity = new THREE.Matrix4();
    for (const child of hammerHead.children) collect(child, identity, contactCache.headPoints, contactCache.head);
    for (const child of shaft.children) collect(child, identity, contactCache.shaftPoints);
  }
  function headContactDimensions() {
    measureContactGeometry();
    const sx = hammerHead.scale.x * hammerPivot.scale.x;
    const sy = hammerHead.scale.y * hammerPivot.scale.y;
    const sz = hammerHead.scale.z * hammerPivot.scale.z;
    const shaftX = shaft.scale.x * hammerPivot.scale.x, shaftZ = shaft.scale.z * hammerPivot.scale.z;
    const key = [sx, sy, sz, shaftX, shaftZ].join(':');
    if (contactCache.sizeKey === key) return contactCache;
    let radiusSquared = 0, forward = 0, shaftSquared = 0;
    const extents = contactCache.halfExtents;
    extents.x = extents.y = extents.z = 0;
    const points = contactCache.headPoints;
    for (let index = 0; index < points.length; index += 3) {
      const x = points[index] * sx, y = points[index + 1] * sy, z = points[index + 2] * sz;
      radiusSquared = Math.max(radiusSquared, x * x + y * y + z * z);
      forward = Math.max(forward, y);
      extents.x = Math.max(extents.x, Math.abs(x));
      extents.y = Math.max(extents.y, Math.abs(y));
      extents.z = Math.max(extents.z, Math.abs(z));
    }
    const neck = contactCache.shaftPoints;
    for (let index = 0; index < neck.length; index += 3) {
      const x = neck[index] * shaftX, z = neck[index + 2] * shaftZ;
      shaftSquared = Math.max(shaftSquared, x * x + z * z);
    }
    contactCache.sizeKey = key;
    contactCache.radius = Math.sqrt(radiusSquared);
    contactCache.forward = forward;
    contactCache.shaftRadius = Math.sqrt(shaftSquared);
    return contactCache;
  }
  const getHeadContactRadius = () => headContactDimensions().radius;
  const getHeadForwardExtent = () => headContactDimensions().forward;
  const getShaftContactRadius = () => headContactDimensions().shaftRadius;
  // Read-only shared value, expressed about the actual head origin. Used to
  // fit an entire log or hammer through guard/orbit poses without assumptions
  // about which equipment axis is longest.
  const getHeadHalfExtents = () => headContactDimensions().halfExtents;
  const barbedInstance = new THREE.Matrix4();
  function barbedCoilCount(reach = reachScale) {
    const hasWire = root.userData.armoryWeaponId ? root.userData.armoryBarbed : equipmentTier >= 2;
    if (!hasWire) return 0;
    measureContactGeometry();
    const headY = .43 + reach;
    // Stop before the actual head underside and the retaining collar. Large
    // head upgrades and compact guard/orbit poses must not bury active wire.
    const end = Math.min(headY - .385, headY + contactCache.head.min.y * hammerHead.scale.y - .04);
    return Math.max(0, Math.min(BARBED_CAPACITY, Math.floor((end - BARBED_START + 1e-8) / BARBED_PITCH)));
  }
  function updateBarbedWrap() {
    const mesh = barbedWrap.children[0], count = barbedCoilCount();
    handGuard.visible = equipmentTier >= 2;
    barbedWrap.visible = count > 0;
    barbedWrap.userData.sectionStart = BARBED_START;
    barbedWrap.userData.sectionEnd = BARBED_START + count * BARBED_PITCH;
    barbedWrap.userData.contactRadius = barbedCoilRadius;
    if (!mesh || mesh.userData.fittedCount === count) return;
    for (let index = 0; index < count; index++) {
      barbedInstance.makeTranslation(0, BARBED_START + (index + .5) * BARBED_PITCH, 0);
      mesh.setMatrixAt(index, barbedInstance);
    }
    mesh.count = count; mesh.userData.fittedCount = count;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  }
  // Callers reuse their own vectors. These endpoints describe the actual
  // sharp section, never the grip or a made-up extension of the thin wood.
  // A single short coil intentionally returns coincident capsule endpoints.
  function getBarbedContactSegment(start, end) {
    updateBarbedWrap();
    if (!weaponHeld || !hammerPivot.visible || !barbedWrap.visible) return false;
    barbedWrap.updateWorldMatrix(true, false);
    start.set(0, BARBED_START + BARBED_PITCH / 2, 0).applyMatrix4(barbedWrap.matrixWorld);
    end.set(0, barbedWrap.userData.sectionEnd - BARBED_PITCH / 2, 0).applyMatrix4(barbedWrap.matrixWorld);
    return true;
  }
  function getBarbedContactRadius() {
    updateBarbedWrap();
    if (!weaponHeld || !hammerPivot.visible || !barbedWrap.visible) return 0;
    barbedWrap.updateWorldMatrix(true, false);
    return barbedCoilRadius * barbedWrap.matrixWorld.getMaxScaleOnAxis();
  }
  const headFloorMatrix = new THREE.Matrix4(), headFloorBounds = new THREE.Box3();
  function getHeadFloorY() {
    // Hero-local ground height, independent of the hero's world location or
    // heading. A descending strike can raise its hands by max(0, .04 - y)
    // before solving the arm chains, preserving the complete physical weapon.
    measureContactGeometry();
    weaponRig.updateMatrix(); hammerPivot.updateMatrix(); hammerHead.updateMatrix();
    headFloorMatrix.multiplyMatrices(weaponRig.matrix, hammerPivot.matrix).multiply(hammerHead.matrix);
    return headFloorBounds.copy(contactCache.head).applyMatrix4(headFloorMatrix).min.y;
  }

  const localBoundsCache = {
    key: '', bounds: new THREE.Box3(), center: new THREE.Vector3(),
    radius: 0, spinRadius: 0,
  };
  const localMatrices = new Map();
  const localRootScale = new THREE.Matrix4();
  const localMeshBox = new THREE.Box3();
  const localSphere = new THREE.Sphere();
  const wireBoundsMatrix = new THREE.Matrix4(), wireInstanceMatrix = new THREE.Matrix4();
  const boundsPoseMatrix = new THREE.Matrix4(), boundsPosePosition = new THREE.Vector3(), boundsPoseScale = new THREE.Vector3();
  function localHammerBounds(requestedReach = reachScale) {
    updateBarbedWrap();
    const reach = Number.isFinite(requestedReach) ? Math.max(.35, requestedReach) : reachScale;
    const key = [equipmentTier, reach, hammerHead.scale.x, hammerHead.scale.y, hammerHead.scale.z,
      hammerPivot.scale.x, hammerPivot.scale.y, hammerPivot.scale.z].join(':');
    if (key === localBoundsCache.key) return localBoundsCache;
    const bounds = localBoundsCache.bounds;
    bounds.makeEmpty();
    localRootScale.makeScale(hammerPivot.scale.x, hammerPivot.scale.y, hammerPivot.scale.z);
    function visit(node, parentMatrix) {
      if (node === barbedWrap) {
        // Measure a predicted release reach using virtual instances. This
        // does not change the held weapon, instance buffer or visibility.
        const count = barbedCoilCount(reach), mesh = barbedWrap.children[0];
        if (!count || !mesh) return;
        node.updateMatrix(); mesh.updateMatrix();
        wireBoundsMatrix.multiplyMatrices(parentMatrix, node.matrix).multiply(mesh.matrix);
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        for (let index = 0; index < count; index++) {
          wireInstanceMatrix.makeTranslation(0, BARBED_START + (index + .5) * BARBED_PITCH, 0).premultiply(wireBoundsMatrix);
          localMeshBox.copy(mesh.geometry.boundingBox).applyMatrix4(wireInstanceMatrix);
          bounds.union(localMeshBox);
        }
        return;
      }
      if (!node.visible) return;
      node.updateMatrix();
      let poseMatrix = node.matrix;
      if (reach !== reachScale && (node === hammerHead || node === shaft || node === collar)) {
        // Aim prediction needs the release length while the real weapon may
        // still be in its compact guard/orbit. Measure that pose in a matrix;
        // never resize the live weapon or create/dispose a projectile clone.
        boundsPosePosition.copy(node.position); boundsPoseScale.copy(node.scale);
        const headY = .43 + reach, shaftLength = Math.max(.1, headY - .21 - .5);
        if (node === hammerHead) boundsPosePosition.y = headY;
        else if (node === shaft) { boundsPosePosition.y = .5 + shaftLength / 2; boundsPoseScale.y = shaftLength; }
        else boundsPosePosition.y = headY - .31;
        poseMatrix = boundsPoseMatrix.compose(boundsPosePosition, node.quaternion, boundsPoseScale);
      }
      let matrix = localMatrices.get(node);
      if (!matrix) { matrix = new THREE.Matrix4(); localMatrices.set(node, matrix); }
      matrix.multiplyMatrices(parentMatrix, poseMatrix);
      if (node.isMesh) {
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        localMeshBox.copy(node.geometry.boundingBox).applyMatrix4(matrix);
        bounds.union(localMeshBox);
      }
      for (const child of node.children) visit(child, matrix);
    }
    for (const child of hammerPivot.children) visit(child, localRootScale);
    bounds.getCenter(localBoundsCache.center);
    bounds.getBoundingSphere(localSphere);
    localBoundsCache.radius = localSphere.radius;
    localBoundsCache.spinRadius = Math.hypot(
      Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
      Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)));
    localBoundsCache.key = key;
    return localBoundsCache;
  }
  const getThrowRadius = () => localHammerBounds().radius;
  const getSpinRadius = () => localHammerBounds().spinRadius;
  function getThrowMetrics(reach = reachScale) {
    const bounds = localHammerBounds(reach);
    // Center is in the unrotated weapon frame with the current physical
    // scaling already included, just like createThrownHammer's balanceY.
    return {x: bounds.center.x, y: bounds.center.y, z: bounds.center.z, radius: bounds.radius};
  }
  function getThrowCenterWorld(target = new THREE.Vector3()) {
    target.copy(localHammerBounds().center);
    // Cached bounds already include pivot scale; localToWorld applies it once.
    target.x /= hammerPivot.scale.x || 1;
    target.y /= hammerPivot.scale.y || 1;
    target.z /= hammerPivot.scale.z || 1;
    return hammerPivot.localToWorld(target);
  }

  function createThrownHammer() {
    // Clone only the actual hammer, with independent resources so disposing
    // the projectile never invalidates the weapon still owned by the hero.
    updateBarbedWrap();
    const projectile = new THREE.Group();
    projectile.name = `Thrown ${equipmentNames[equipmentTier]}`;
    const weapon = hammerPivot.clone(true);
    weapon.name = 'projectileHammer'; weapon.visible = true;
    weapon.position.set(0, 0, 0); weapon.rotation.set(0, 0, 0);
    weapon.getObjectByName('leftGripAnchor')?.removeFromParent();
    weapon.getObjectByName('rightGripAnchor')?.removeFromParent();
    // Effect helpers can be hidden on the held weapon. A projectile must not
    // carry their invisible geometry into its centered model or bounds.
    const invisible = [];
    weapon.traverse(node => { if (node !== weapon && !node.visible) invisible.push(node); });
    for (const node of invisible) node.removeFromParent();
    const geometries = new Map(), materials = new Map();
    weapon.traverse(node => {
      if (!node.isMesh) return;
      if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
      node.geometry = geometries.get(node.geometry);
      const clone = m => {
        if (!materials.has(m)) materials.set(m, m.clone());
        return materials.get(m);
      };
      node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
    });
    projectile.add(weapon);
    const bounds = localHammerBounds();
    weapon.position.sub(bounds.center);
    projectile.userData = {
      kind: 'hammer-projectile', spinAxis: 'z', balanceY: bounds.center.y,
      balance: {
        x: bounds.center.x / (hammerPivot.scale.x || 1),
        y: bounds.center.y / (hammerPivot.scale.y || 1),
        z: bounds.center.z / (hammerPivot.scale.z || 1),
      },
      radius: bounds.radius, reachScale, headSize: hammerHead.scale.x,
      equipmentTier, weaponKind: weaponKinds[equipmentTier],
    };
    return projectile;
  }

  const weaponKinds = ['log', 'banded-club', 'iron-hammer', 'war-hammer', 'storm-hammer'];
  const equipmentNames = ['Κούτσουρο', 'Δεμένο ρόπαλο', 'Σιδερένιο σφυρί', 'Πολεμικό σφυρί', 'Σφυρί της καταιγίδας'];
  const weaponSlots = new Set([handle, shaft, collar, handGuard, barbedWrap, hammerHead]);
  for(const leg of [leftLeg,rightLeg]){
    for(const child of leg.children.slice())if(child.isMesh){child.removeFromParent();child.geometry?.dispose();}
    const {thigh,shin}=leg.userData;
    box(thigh,P.blueDark,0,-.13,0,.25,.34,.28);compact(thigh);
    box(shin,P.steel,0,-.12,.035,.29,.24,.31);
    box(shin,P.ink,0,-.21,.075,.32,.17,.45);compact(shin);
    // compact consumes meshes only; retain the zero-geometry contact marker.
  }
  const appearanceSlots = [body, leftLeg.userData.thigh, leftLeg.userData.shin, rightLeg.userData.thigh, rightLeg.userData.shin,
    leftArm.getObjectByName('pauldron'), leftArm.userData.upper, leftArm.userData.fore,
    rightArm.getObjectByName('pauldron'), rightArm.userData.upper, rightArm.userData.fore,
    cape, shield, leftGrip, rightGrip, handle, shaft, collar, handGuard, barbedWrap, hammerHead];
  const equipmentCache = new Map();

  function finishEquipment(parts, tier) {
    // Body and weapon never share a material instance: weapon lightning may
    // brighten the hammer without turning the survivor's skin electric blue.
    const bodyClones = new Map(), weaponClones = new Map(), all = [], weaponMats = [];
    for (const [slot, children] of parts) for (const child of children) {
      child.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.userData.equipmentTier = tier;
        mesh.userData.equipmentSlot = slot.name;
        const isWeapon = weaponSlots.has(slot), clones = isWeapon ? weaponClones : bodyClones;
        const own = source => {
          if (!clones.has(source)) {
            const m = source.clone();
            m.userData.originalEmissive = m.emissive?.clone();
            m.userData.originalColor = m.color?.clone();
            m.userData.originalEmissiveIntensity = m.emissiveIntensity;
            clones.set(source, m); all.push(m);
            if (isWeapon) weaponMats.push(m);
          }
          return clones.get(source);
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      });
    }
    return { parts, materials: all, weaponMaterials: weaponMats };
  }

  function buildEquipment(tier) {
    const parts = new Map();
    const skin = 0xc58c68, skinShadow = 0xa66f51, hair = 0x433026;
    const cloth = tier === 0 ? 0x40565a : tier === 1 ? 0x46534c : P.blueDark;
    const iron = tier === 2 ? 0x929e9d : 0x677d89;
    const draw = (slot, paint, merge = true) => {
      const detail = new THREE.Group();
      paint(detail);
      const sourceGeometry = detail.userData.sourceGeometry;
      if (merge && detail.children.length) compact(detail);
      sourceGeometry?.dispose();
      for (const mesh of detail.children) mesh.name = `${weaponKinds[tier]}-${slot.name}`;
      parts.set(slot, detail.children.slice());
    };
    draw(body, g => {
      // Bare skin and a visible face are present from the first stage.
      const torso = cylinder(g, skin, 0, 1.06, 0, .34, .27, .57, 8);
      torso.scale.z = .65;
      beveledBox(g, skin, -.155, 1.17, .195, .29, .19, .085, .022);
      beveledBox(g, skin, .155, 1.17, .195, .29, .19, .085, .022);
      box(g, skinShadow, 0, .94, .19, .03, .19, .018);
      cylinder(g, skin, 0, 1.37, .025, .12, .145, .19, 7);
      box(g, cloth, 0, .72, .005, .60, .18, .42);
      box(g, tier ? P.timberDark : 0x8c7659, 0, .79, .008, .61, .055, .44);
      box(g, tier ? 0xa9956c : 0xbda078, 0, .785, .238, .10, .07, .025);
      if (tier >= 1) {
        beveledBox(g, tier === 1 ? 0x715342 : cloth, 0, 1.075, .015, .66, .51, .44, .04);
        for (const side of [-1, 1]) {
          box(g, tier === 1 ? 0x9c7851 : iron, side * .22, 1.15, .255, .095, .42, .04, 0, 0, side * .12);
          for (let i = 0; i < 3; i++) box(g, 0xc7ae83, side * .26, .95 + i * .13, .279, .03, .018, .012);
        }
        if (tier >= 2) {
          beveledBox(g, iron, 0, 1.12, .225, .47, .38, .10, .025);
          box(g, 0xb1bbb6, 0, 1.30, .265, .40, .045, .045);
          box(g, 0x46565c, 0, 1.04, .295, .035, .25, .018);
          for (const x of [-.18, .18]) crystal(g, 0xd1c7af, x, 1.23, .30, .025, .025, .018);
        }
        if (tier === 3) {
          box(g, P.steel, 0, 1.38, 0, .46, .12, .36);
          box(g, 0xb18d52, 0, 1.12, .31, .12, .16, .035, 0, 0, Math.PI / 4);
          box(g, 0x465a65, 0, .89, .265, .58, .12, .065);
        }
      }
      beveledBox(g, skin, 0, 1.57, .045, .39, .38, .36, .035);
      beveledBox(g, skinShadow, 0, 1.415, .11, .27, .09, .21, .02);
      for (const side of [-1, 1]) {
        box(g, skinShadow, side * .218, 1.55, .04, .06, .12, .10);
        box(g, 0xece1c4, side * .092, 1.60, .23, .086, .044, .018);
        box(g, 0x253138, side * .092, 1.60, .244, .034, .037, .012);
        box(g, hair, side * .097, 1.652, .235, .11, .026, .022, 0, 0, -side * .07);
      }
      box(g, skin, 0, 1.545, .258, .07, .11, .085);
      box(g, hair, 0, 1.453, .236, .16, .025, .018);
      box(g, 0x77513c, 0, 1.427, .219, .21, .04, .03);
      beveledBox(g, hair, 0, 1.775, .005, .43, .15, .39, .035);
      box(g, 0x624431, -.10, 1.835, .015, .19, .07, .28, 0, 0, -.17);
      box(g, hair, .14, 1.73, -.04, .08, .16, .29, 0, 0, -.07);
      if (tier === 1) box(g, 0x9f754d, 0, 1.696, .236, .405, .055, .025);
      if (tier >= 2) {
        beveledBox(g, iron, 0, 1.78, -.025, .49, .20, .42, .035);
        box(g, 0xc4cbc0, 0, 1.70, .21, .47, .05, .06);
        for (const side of [-1, 1]) box(g, tier === 2 ? 0x687a7f : P.blueDark,
          side * .235, 1.61, -.02, .07, .25, .32);
        if (tier === 3) box(g, 0xa86b44, 0, 1.92, -.065, .09, .17, .30);
      }
    });
    for (const [side, leg] of [[-1, leftLeg], [1, rightLeg]]) {
      draw(leg.userData.thigh,g=>{
        beveledBox(g,cloth,0,-.13,0,.25,.34,.28,.02);
        box(g,0x7c8678,side*.127,-.15,.035,.018,.24,.035);
      });
      draw(leg.userData.shin,g=>{
        beveledBox(g,cloth,0,-.09,.035,.27,.24,.30,.02);
        box(g,tier?0x443b30:skin,0,-.215,.075,.30,.15,.42);
        box(g,tier?0x272e2d:skinShadow,0,-.29,.075,.31,.035,.43);
        if(!tier)for(let toe=0;toe<3;toe++)box(g,skinShadow,-.08+toe*.08,-.20,.28,.016,.05,.02);
        if(tier===1)box(g,0x99754f,0,-.11,.205,.24,.055,.03);
        if(tier>=2){beveledBox(g,iron,0,-.04,.18,.27,.22,.09,.025);box(g,0xc2c6b8,0,.06,.222,.12,.035,.025);}
      });
    }
    for (const arm of [leftArm, rightArm]) {
      const side = arm.userData.side;
      draw(arm.getObjectByName('pauldron'), g => {
        crystal(g, skin, -side * .015, -.025, 0, .20, .15, .18);
        if (tier) {
          beveledBox(g, tier === 1 ? 0x795a3d : iron, side * .025, 0, 0,
            tier === 3 ? .35 : .29, tier === 3 ? .23 : .17, tier === 3 ? .40 : .33, .03);
          if (tier >= 2) box(g, 0xc2c7bc, side * .025, .09, .01, .23, .04, .27);
        }
      });
      draw(arm.userData.upper, g => {
        cylinder(g, skin, 0, 0, 0, .11, .125, 1, 7);
        if (tier) {
          box(g, tier === 1 ? 0x786045 : cloth, 0, -.18, -.025, .225, .65, .235);
          box(g, skinShadow, 0, .29, -.085, .14, .18, .05);
        }
      });
      draw(arm.userData.fore, g => {
        cylinder(g, skin, 0, 0, 0, .105, .12, 1, 7);
        if (tier) {
          beveledBox(g, tier === 1 ? 0x745236 : iron, 0, -.04, -.015, .22, .60, .24, .018);
          for (const y of [-.25, .20]) box(g, tier === 1 ? 0xb3925b : 0xc1c4b4, 0, y, .115, .23, .055, .035);
        }
      });
    }
    for (const [side, grip] of [[-1, leftGrip], [1, rightGrip]]) draw(grip, g => {
      beveledBox(g, tier >= 2 ? 0x7c8e94 : skin, 0, 0, 0, .23, .18, .23, .023);
      for (let finger = 0; finger < 4; finger++) box(g, tier >= 2 ? 0xb8c1b9 : skinShadow,
        -.08 + finger * .053, .04, .124, .041, .07, .035);
      box(g, tier >= 2 ? iron : skin, side * .125, -.03, .04, .07, .13, .11, 0, 0, -side * .20);
      if (tier) box(g, tier >= 2 ? 0xa39068 : 0x775039, 0, -.083, -.01, .245, .045, .25);
    });
    draw(cape, g => {
      if (tier < 3) return;
      box(g, 0x733e35, 0, -.25, -.06, .56, .55, .07, -.17);
      box(g, 0x92503b, -.13, -.59, -.14, .34, .22, .08, -.25, 0, -.06);
      box(g, 0x502e2e, .21, -.55, -.13, .17, .20, .08, -.25, 0, .08);
    });
    draw(shield, g => {
      if (tier < 2) return;
      const radius = tier === 2 ? .43 : .50;
      cylinder(g, 0x697b7f, 0, -.035, 0, radius, radius, .12, 10, Math.PI / 2);
      cylinder(g, tier === 2 ? 0x6c5944 : 0x3b5966, 0, -.035, .075, radius - .07, radius - .07, .055, 10, Math.PI / 2);
      for (const x of [-.16, .16]) box(g, iron, x, -.035, .115, .05, radius * 1.45, .035);
      for (let rivet = 0; rivet < 8; rivet++) {
        const angle = rivet * Math.PI / 4;
        cylinder(g, 0xc3c3b1, Math.sin(angle) * (radius - .03), -.035 + Math.cos(angle) * (radius - .03),
          .077, .022, .022, .028, 6, Math.PI / 2);
      }
      cylinder(g, iron, 0, -.035, .16, .13, .17, .11, 8, Math.PI / 2);
      box(g, P.timberDark, -.19, .03, -.12, .09, .52, .075);
      box(g, P.timberDark, .19, .03, -.12, .09, .52, .075);
      for (const y of [-.1, .23]) box(g, iron, 0, y, -.135, .31, .065, .1);
      cylinder(g, P.timberDark, 0, .065, -.197, .056, .056, .32, 8);
    });
    draw(handle, g => {
      cylinder(g, tier ? 0x62452f : 0x735037, 0, .2, 0, tier < 2 ? .115 : .078, .10, .68, 8);
      if (tier) for (let i = 0; i < 6; i++) box(g, i % 2 ? 0x98754b : 0x4e382b, 0, -.035 + i * .1,
        0, .17, .037, .17, 0, i * .3);
      else for (const side of [-1, 1]) box(g, 0xb18b59, side * .068, .18, .025, .027, .55, .09);
      if (tier >= 2) cylinder(g, iron, 0, -.13, 0, .11, .12, .12, 8);
    });
    draw(shaft, g => {
      cylinder(g, tier ? 0x59422e : 0x795638, 0, 0, 0, tier < 2 ? .205 : .064,
        tier < 2 ? .11 : .075, 1, 8);
      if (tier < 2) {
        // Raised bark follows the taper: an unbroken branch below the trunk.
        for (const side of [-1, 1]) box(g, side < 0 ? 0x523c2c : 0xa87d4e,
          side * .145, .02, .04, .026, .90, .045, 0, 0, -side * .09);
      } else box(g, 0x9e8055, 0, 0, .07, .034, .93, .018);
    });
    draw(collar, g => {
      if (tier < 2) return;
      cylinder(g, iron, 0, 0, 0, .15, .14, .13, 8);
      box(g, 0xbbc3b9, 0, 0, .15, .065, .065, .03);
    });
    draw(handGuard, g => { if (tier >= 2) drawHandGuard(g, iron); });
    draw(barbedWrap, g => { if (tier >= 2) g.add(makeBarbedCoils()); }, false);
    draw(hammerHead, g => {
      if (tier < 2) { logHead(g, tier === 1); return; }
      const width = tier === 2 ? 1.03 : 1.25, height = tier === 2 ? .47 : .58, depth = tier === 2 ? .49 : .62;
      beveledBox(g, tier === 2 ? 0x6a7779 : 0x3f5664, 0, 0, 0, width, height, depth, .055);
      for (const side of [-1, 1]) {
        beveledBox(g, iron, side * (width / 2 - .035), 0, 0, .16, height + .06, depth + .035, .03);
        beveledBox(g, 0xc1c6bc, side * (width / 2 + .04), 0, 0, .045, height - .10, depth - .07, .012);
        for (const y of [-height * .28, height * .28]) cylinder(g, 0xaeb6aa,
          side * width * .29, y, depth / 2 + .016, .027, .027, .03, 6, Math.PI / 2);
      }
      box(g, tier === 2 ? 0x49585c : 0xa18c62, 0, 0, depth / 2 + .026, .14, height + .015, .035);
      if (tier === 3) {
        box(g, 0xb8c4bc, 0, 0, depth / 2 + .048, .055, .25, .025);
        box(g, iron, 0, height / 2 + .035, 0, .22, .065, depth * .72);
      }
    });
    return finishEquipment(parts, tier);
  }

  // Cache each tier only when first used. Swapping removes the previous
  // meshes entirely from the graph, retaining animation transforms and grip
  // anchors. Hidden future weapons therefore never inflate hit/throw bounds.
  equipmentCache.set(4, finishEquipment(new Map(appearanceSlots.map(slot => [slot, slot.children.filter(child=>child!==leftLeg.userData.foot&&child!==rightLeg.userData.foot)])), 4));
  let appliedEquipment = -1;
  function setEquipment(tier = 4) {
    const value = Number(tier), next = Number.isFinite(value) ? Math.max(0, Math.min(4, Math.floor(value))) : 4;
    if (appliedEquipment === next) return next;
    if (!equipmentCache.has(next)) equipmentCache.set(next, buildEquipment(next));
    const equipment = equipmentCache.get(next);
    for (const slot of appearanceSlots) {
      for (const child of slot.children.slice()) if(child!==leftLeg.userData.foot&&child!==rightLeg.userData.foot)child.removeFromParent();
      for (const child of equipment.parts.get(slot)) slot.add(child);
    }
    equipmentTier = appliedEquipment = next;
    shieldEquipped = next >= 2; shieldRig.visible = shieldEquipped; cape.visible = next >= 3;
    for (const m of equipment.materials) {
      if (m.userData.originalColor) m.color.copy(m.userData.originalColor);
      if (m.userData.originalEmissive) m.emissive.copy(m.userData.originalEmissive);
      if (m.userData.originalEmissiveIntensity !== undefined) m.emissiveIntensity = m.userData.originalEmissiveIntensity;
    }
    root.name = `Warrior — ${equipmentNames[next]}`;
    Object.assign(root.userData, { equipmentTier: next, weaponKind: weaponKinds[next], equipmentName: equipmentNames[next],
      shieldEquipped, shieldStored: shieldEquipped && stance >= .65, color: next < 2 ? 0xc58c68 : P.blue,
      fragments: next < 2 ? [0x795638, 0xb18b59, 0xc58c68, 0x40565a] : [P.blue, P.steel, P.gold, P.hot] });
    localBoundsCache.key = ''; localMatrices.clear(); contactCache.tier = -1;
    updateBarbedWrap();
    updateGrip();
    return next;
  }
  const getEquipmentMaterials = () => equipmentCache.get(equipmentTier).materials;
  const getWeaponMaterials = () => equipmentCache.get(equipmentTier).weaponMaterials;
  const armorySlots={head:hammerHead,handle,shaft,collar,guard:handGuard,shield};
  function resetArmoryParts(names){for(const name of names){const slot=armorySlots[name];if(!slot)continue;for(const child of slot.children.slice())if(child.userData.armoryVisual)child.removeFromParent();for(const child of equipmentCache.get(equipmentTier).parts.get(slot)||[])slot.add(child);}contactCache.tier=-1;localBoundsCache.key='';localMatrices.clear();}
  function installArmoryPart(name,object){const slot=armorySlots[name];if(!slot)return;for(const child of equipmentCache.get(equipmentTier).parts.get(slot)||[])child.removeFromParent();for(const child of slot.children.slice())if(child.userData.armoryVisual)child.removeFromParent();object.position.set(0,0,0);object.rotation.set(0,0,0);object.scale.set(1,1,1);object.userData.armoryVisual=true;slot.add(object);contactCache.tier=-1;localBoundsCache.key='';localMatrices.clear();}

  root.userData = {
    body, leftLeg, rightLeg, legRest, leftArm, rightArm, weaponRig, hammerPivot, hammerHead, handGuard, barbedWrap, cape,
    leftGrip, rightGrip, leftGripAnchor, rightGripAnchor,
    shield, shieldRig, shieldGripAnchor, updateGrip, setStance, setReach, setUnarmedPose, setRidingAnchor,
    setWeaponVisible, createThrownHammer, getThrowRadius, getThrowCenterWorld, getThrowMetrics,
    getSpinRadius, getHeadContactRadius, getHeadForwardExtent, getShaftContactRadius, getHeadHalfExtents, getHeadFloorY,
    getBarbedContactSegment, getBarbedContactRadius,
    weaponRest, weaponRestPosition, setEquipment, getEquipmentMaterials, getWeaponMaterials,installArmoryPart,resetArmoryParts,
    invalidateEquipmentBounds(){contactCache.tier=-1;localBoundsCache.key='';localMatrices.clear();},
    stance: 0, shieldStored: false, weaponHeld: true, reachScale: 1,
    hammerRest: { x: 0, y: 0, z: 0 },
    width: 1.1, depth: .7, height: 1.99, color: P.blue,
    fragments: [P.blue, P.steel, P.gold, P.hot],
  };
  setReach(1);
  setStance(0);
  setEquipment(4);
  return root;
}

function robot() {
  const root = new THREE.Group();
  root.name = 'Scrap Sentinel';
  const body = group(root, 'body');
  const P = PALETTE;
  box(body, P.ink, 0, .99, 0, .65, .57, .43);
  box(body, 0x3c657d, 0, 1.04, .025, .72, .51, .49);
  box(body, P.steel, 0, 1.33, -.015, .47, .12, .38);
  box(body, P.ink, 0, 1.05, .288, .41, .24, .035);
  for (let i = 0; i < 3; i++) box(body, P.hot, -.13 + i * .13, 1.05, .313, .055, .14, .025, 0, 0, 0, .8);
  box(body, P.steel, 0, 1.54, 0, .54, .36, .43);
  box(body, P.blueDark, 0, 1.73, -.03, .63, .1, .51);
  box(body, P.ink, 0, 1.57, .232, .46, .12, .03);
  box(body, 0xff564c, 0, 1.57, .255, .33, .052, .025, 0, 0, 0, 1.2);
  box(body, P.shadow, 0, 1.4, .238, .2, .095, .045);
  cylinder(body, P.steel, .22, 1.89, -.06, .025, .025, .27, 5, 0, 0, -.16);
  crystal(body, P.hot, .242, 2.04, -.06, .055, .055, .055, 0, .7);
  box(body, P.shadow, 0, 1.01, -.3, .42, .4, .2);
  compact(body);
  const leftLeg = restLimb(limb(root, 'leftLeg', -.27, .64, 0, P.shadow, P.steel, P.ink), -1, .05, .045);
  const rightLeg = restLimb(limb(root, 'rightLeg', .27, .64, 0, P.shadow, P.steel, P.ink), 1, .05, .045);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = group(root, side < 0 ? 'leftArm' : 'rightArm', side * .55, 1.27, 0);
    cylinder(arm, P.steel, -side * .045, -.03, 0, .17, .17, .34, 6, 0, 0, Math.PI / 2);
    box(arm, P.blueDark, 0, -.25, 0, .23, .4, .25);
    box(arm, P.steel, 0, -.47, .025, .3, .23, .3);
    box(arm, P.hot, 0, -.46, .19, .17, .06, .035, 0, 0, 0, .7);
    for (const finger of [-1, 1]) box(arm, P.ink, finger * .1, -.62, .08, .07, .16, .16);
    compact(arm); restLimb(arm, side, .13); arms.push(arm);
  }
  root.userData = { body, leftLeg, rightLeg, leftArm: arms[0], rightArm: arms[1], width: 1.05, depth: .7, height: 2.08, color: P.steel, fragments: [P.steel, P.blueDark, P.hot] };
  return root;
}

function zombie(brute = false) {
  const root = new THREE.Group();
  root.name = brute ? 'Grave Brute' : 'Hollow';
  const skin = brute ? 0x9b8560 : 0x86a876;
  const darkSkin = brute ? 0x6f6651 : 0x586e56;
  const shirt = brute ? 0x8c483c : 0x5b5a78;
  const pants = brute ? 0x51483c : 0x334e58;
  const body = group(root, 'body');
  box(body, shirt, 0, 1.02, 0, .64, .59, .39, 0, 0, -.035);
  box(body, darkSkin, .15, .91, .22, .22, .32, .045, 0, 0, -.2);
  box(body, skin, -.18, 1.15, .223, .17, .23, .05);
  box(body, pants, 0, .69, 0, .62, .18, .42);
  box(body, 0x382f30, 0, .76, .235, .63, .065, .045);
  box(body, skin, 0, 1.52, .09, .48, .49, .43, -.09, 0, -.11);
  box(body, darkSkin, -.04, 1.76, .01, .48, .13, .42, 0, 0, -.07);
  box(body, darkSkin, -.25, 1.51, -.03, .09, .28, .3);
  box(body, 0x263f37, -.12, 1.57, .316, .15, .1, .025);
  box(body, 0x263f37, .115, 1.56, .322, .15, .1, .025);
  box(body, 0xffc56a, -.115, 1.57, .334, .065, .05, .02, 0, 0, 0, .8);
  box(body, 0xffc56a, .119, 1.56, .34, .065, .05, .02, 0, 0, 0, .8);
  box(body, 0x3e3930, 0, 1.38, .328, .25, .1, .03, 0, 0, -.07);
  box(body, 0xd1c7a4, -.07, 1.405, .349, .045, .055, .02);
  box(body, 0xd1c7a4, .06, 1.397, .349, .05, .055, .02);
  if (brute) {
    box(body, 0x4f554d, .02, 1.23, -.245, .73, .46, .15, .1);
    for (const x of [-.2, .2]) box(body, 0x9ba394, x, 1.19, -.34, .1, .54, .08);
    box(body, 0xbbb79a, -.29, 1.68, -.02, .13, .16, .39, 0, 0, -.22);
  }
  compact(body);
  const leftLeg = restLimb(limb(root, 'leftLeg', -.245, .61, 0, pants, darkSkin, 0x302f30), -1, .055, .06);
  const rightLeg = restLimb(limb(root, 'rightLeg', .245, .61, 0, pants, pants, 0x302f30), 1, .055, .06);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = group(root, side < 0 ? 'leftArm' : 'rightArm', side * .49, 1.22, .015);
    crystal(arm, shirt, -side * .05, -.015, 0, .17, .13, .15);
    box(arm, shirt, 0, -.115, 0, .28, .27, .31);
    box(arm, skin, 0, -.34, .035, .21, .34, .23, -.17);
    box(arm, darkSkin, 0, -.51, .11, .25, .17, .28);
    box(arm, skin, 0, -.58, .22, .22, .11, .16);
    if (brute) box(arm, 0x686751, side * .025, -.43, .04, .32, .2, .32);
    compact(arm); restLimb(arm, side, brute ? .14 : .16);
    arms.push(arm);
  }
  if (brute) root.scale.set(1.45, 1.32, 1.35);
  root.userData = { body, leftLeg, rightLeg, leftArm: arms[0], rightArm: arms[1], width: brute ? 1.5 : .95, depth: .7, height: brute ? 2.5 : 1.84, color: skin, fragments: [skin, pants, shirt, darkSkin] };
  return root;
}

export function makeEnemy(type = 'zombie') {
  return type === 'robot' ? robot() : zombie(type === 'brute');
}

export function makeBoss() {
  const root = new THREE.Group();
  root.name = 'The Iron Colossus';
  const iron = 0x374754, edge = 0x70868d, dark = 0x1c2b35, orange = 0xf17f3a, glow = 0xffa144;
  const body = group(root, 'body');
  box(body, dark, 0, 3.11, 0, 2.12, 1.98, 1.2);
  box(body, iron, 0, 3.39, .06, 2.39, 1.59, 1.46);
  box(body, edge, 0, 4.14, -.02, 2.46, .22, 1.48);
  box(body, orange, -.98, 3.36, .83, .25, 1.32, .16, 0, 0, -.1);
  box(body, orange, .98, 3.36, .83, .25, 1.32, .16, 0, 0, .1);
  // Foundry heart: octagonal outer housing, deep furnace, glowing grate bars.
  cylinder(body, edge, 0, 3.4, .82, .73, .73, .22, 8, Math.PI / 2);
  cylinder(body, dark, 0, 3.4, .96, .59, .59, .13, 8, Math.PI / 2);
  cylinder(body, glow, 0, 3.4, 1.04, .46, .46, .06, 8, Math.PI / 2, 0, 0, .85);
  for (let i = -1; i <= 1; i++) box(body, dark, i * .24, 3.4, 1.091, .095, .84, .04);
  for (const x of [-.85, .85]) for (const y of [2.88, 3.95]) cylinder(body, edge, x, y, .87, .08, .08, .07, 6, Math.PI / 2);
  box(body, dark, 0, 2.35, .015, 1.79, .48, 1.17);
  box(body, edge, 0, 2.44, .68, 1.87, .22, .14);
  box(body, orange, 0, 2.4, .79, .5, .34, .1);
  // Low armored head, glowing visor, cog-like crown.
  box(body, dark, 0, 4.41, .02, .68, .31, .71);
  box(body, edge, 0, 4.85, .1, 1.18, .7, .99);
  box(body, iron, 0, 5.21, .025, 1.39, .18, 1.11);
  box(body, dark, 0, 4.91, .625, 1.02, .22, .09);
  box(body, 0xff5f3c, 0, 4.92, .68, .83, .085, .055, 0, 0, 0, 1.5);
  box(body, iron, 0, 4.61, .61, .75, .22, .15);
  for (let i = -1; i <= 1; i++) box(body, dark, i * .21, 4.6, .705, .075, .16, .035);
  for (const x of [-.4, 0, .4]) box(body, orange, x, 5.37, .02, .16, .2, .47);
  // Twin exhaust stacks and visible hydraulic plumbing.
  for (const side of [-1, 1]) {
    cylinder(body, dark, side * .88, 4.24, -.8, .22, .27, 1.92, 8);
    cylinder(body, edge, side * .88, 5.16, -.8, .29, .29, .18, 8);
    cylinder(body, 0x111c25, side * .88, 5.26, -.8, .18, .18, .025, 8);
    box(body, orange, side * .88, 4.53, -.8, .49, .16, .49);
    cylinder(body, edge, side * .72, 3.3, -.84, .09, .09, 1.35, 6, 0, 0, side * .12);
  }
  compact(body);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = group(root, side < 0 ? 'leftLeg' : 'rightLeg', side * .78, 2.21, 0);
    box(leg, dark, 0, -.49, 0, .72, .98, .79);
    box(leg, iron, 0, -.59, .32, .85, .9, .25);
    cylinder(leg, edge, 0, -1.02, .1, .31, .31, .9, 8, 0, 0, Math.PI / 2);
    box(leg, iron, 0, -1.43, .035, .9, .75, .97);
    box(leg, orange, 0, -1.43, .56, .56, .5, .11);
    box(leg, dark, 0, -1.96, .26, 1.01, .43, 1.49);
    box(leg, edge, 0, -1.87, .9, .99, .17, .22);
    for (const dx of [-.25, 0, .25]) box(leg, iron, dx, -1.98, 1.015, .16, .28, .1);
    compact(leg); restLimb(leg, side, .035, .035); legs.push(leg);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = group(root, side < 0 ? 'leftArm' : 'rightArm', side * 1.73, 3.94, 0);
    cylinder(arm, dark, -side * .07, -.16, 0, .43, .43, 1.01, 8, 0, 0, Math.PI / 2);
    box(arm, iron, side * .1, .05, .03, 1.21, .62, 1.41, 0, 0, side * .1);
    box(arm, orange, side * .1, .4, .08, 1.01, .17, 1.21, 0, 0, side * .1);
    for (const z of [-.36, .31]) cylinder(arm, edge, side * .46, .03, z, .09, .09, .09, 6, 0, 0, Math.PI / 2);
    box(arm, dark, 0, -.65, .02, .61, 1.12, .67);
    cylinder(arm, edge, side * .25, -.69, .14, .09, .09, 1.05, 6);
    box(arm, iron, 0, -1.35, .11, .98, .76, 1.07);
    box(arm, orange, 0, -1.24, .69, .71, .32, .1);
    for (const dx of [-.31, 0, .31]) {
      box(arm, edge, dx, -1.9, .34, .22, .5, .37);
      box(arm, dark, dx, -2.1, .52, .23, .17, .32);
    }
    box(arm, edge, -side * .59, -1.66, .23, .27, .5, .3, 0, 0, -side * .37);
    compact(arm); restLimb(arm, side, .10); arms.push(arm);
  }
  root.userData = {
    body, leftLeg: legs[0], rightLeg: legs[1], leftArm: arms[0], rightArm: arms[1],
    width: 4.3, depth: 2.2, height: 5.5, color: iron,
    fragments: [iron, edge, dark, orange], exhaust: [new THREE.Vector3(-.88, 5.25, -.8), new THREE.Vector3(.88, 5.25, -.8)],
  };
  return root;
}

function windowFront(g, trim, pane, x, y, z, w = .75, h = .9) {
  box(g, PALETTE.ink, x, y, z, w + .16, h + .16, .13);
  box(g, pane, x, y, z + .075, w, h, .025, 0, 0, 0, .45);
  box(g, trim, x, y, z + .095, .055, h, .035);
  box(g, trim, x, y + .04, z + .095, w, .055, .035);
  box(g, trim, x, y - h / 2 - .07, z + .09, w + .24, .09, .25);
}

function windowSide(g, trim, pane, x, y, z, w = .75, h = .9) {
  const side = Math.sign(x) || 1;
  box(g, PALETTE.ink, x, y, z, .13, h + .16, w + .16);
  box(g, pane, x + side * .075, y, z, .025, h, w, 0, 0, 0, .45);
  box(g, trim, x + side * .095, y, z, .035, h, .055);
  box(g, trim, x + side * .095, y + .04, z, .035, .055, w);
  box(g, trim, x + side * .09, y - h / 2 - .07, z, .25, .09, w + .24);
}

function gabledRoof(g, width, depth, y, rise, wall, roof, trim) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(0, rise); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  part(g, geometry, wall, 0, y, -depth / 2);
  const pitch = Math.atan2(rise, width / 2);
  const slope = Math.hypot(width / 2, rise);
  for (const side of [-1, 1]) {
    box(g, roof, side * width / 4, y + rise / 2 + .04, 0, slope + .3, .15, depth + .42, 0, 0, -side * pitch);
    // Three restrained rows of raised slate tiles, merged into the roof mesh.
    for (let row = 0; row < 3; row++) {
      const u = (row + .4) / 3;
      const xx = side * width / 2 * u;
      const yy = y + rise * (1 - u) + .14;
      for (let t = 0; t < 5; t++) {
        box(g, roof, xx, yy, -depth * .4 + t * depth * .2, slope / 3 - .05, .07, depth / 5 - .08, 0, 0, -side * pitch);
      }
    }
    box(g, trim, side * width / 4, y + rise / 2 + .015, depth / 2 + .22, slope + .35, .12, .13, 0, 0, -side * pitch);
    box(g, roof, side * (width / 2 + .08), y, 0, .14, .16, depth + .43);
  }
  box(g, trim, 0, y + rise + .12, 0, .18, .15, depth + .42);
}

function house(variant) {
  const g = new THREE.Group();
  const walls = [0x78928d, 0xa18d78, 0x8394a2, 0x999178];
  const roofs = [0x345460, 0x564d57, 0x405d63, 0x91a9ab];
  const wall = walls[variant % walls.length], roof = roofs[variant % roofs.length];
  const trim = 0xbfc5b5, stone = 0x52676b, wood = 0x655344, pane = 0xffbf66;
  box(g, stone, 0, .2, 0, 4.76, .4, 4.26);
  box(g, wall, 0, 1.62, 0, 4.6, 2.7, 4.1);
  box(g, trim, 0, 2.99, 0, 4.74, .14, 4.21);
  for (const x of [-2.25, 2.25]) for (const z of [-2.03, 2.03]) {
    box(g, stone, x, 1.56, z, .17, 2.65, .17);
    for (let i = 0; i < 4; i++) box(g, trim, x, .53 + i * .62, z, .22, .12, .22);
  }
  // Foundation mortar and a few weathered facade bricks.
  for (let i = 0; i < 7; i++) box(g, trim, -2.05 + i * .68, .205, 2.139, .025, .32, .02);
  box(g, stone, 1.79, .68, 2.06, .4, .13, .04);
  box(g, stone, 1.47, .83, 2.06, .42, .11, .04);
  box(g, stone, -1.86, 2.58, 2.06, .52, .12, .04);
  windowFront(g, trim, pane, -1.35, 1.74, 2.08);
  windowFront(g, trim, pane, 1.35, 1.74, 2.08);
  for (const x of [-2.33, 2.33]) {
    windowSide(g, trim, pane, x, 1.74, -.92);
    windowSide(g, trim, pane, x, 1.74, .92);
  }
  box(g, PALETTE.ink, 0, 1.21, 2.09, 1.04, 1.93, .15);
  box(g, wood, 0, 1.2, 2.184, .85, 1.77, .06);
  box(g, trim, 0, 1.73, 2.23, .53, .47, .045);
  box(g, pane, 0, 1.73, 2.26, .43, .36, .025, 0, 0, 0, .45);
  box(g, pane, .28, 1.06, 2.235, .055, .09, .035);
  for (let i = 0; i < 2; i++) box(g, stone, 0, .12 + i * .12, 2.51 - i * .16, 1.36, .23, .82 - i * .16);
  gabledRoof(g, 4.6, 4.1, 3.05, 1.33, wall, roof, trim);
  if (variant % 4 === 3) {
    for (const side of [-1, 1]) {
      box(g, trim, side * .64, 4.08, -.37, 1.36, .1, 3.33, 0, 0, -side * .524);
      box(g, trim, side * 1.78, 3.42, .73, .81, .08, 1.12, 0, 0, -side * .524);
    }
  }
  // Attic opening in the triangular front gable.
  windowFront(g, trim, pane, 0, 3.54, 2.09, .48, .42);
  box(g, stone, -1.25, 4.03, -.85, .62, 1.38, .66);
  box(g, trim, -1.25, 4.75, -.85, .79, .18, .82);
  box(g, PALETTE.ink, -1.25, 4.85, -.85, .44, .035, .48);
  for (const yy of [3.64, 3.95, 4.26, 4.55]) box(g, wood, -1.25, yy, -.508, .63, .045, .025);
  compact(g);
  g.userData = { width: 4.6, depth: 4.1, height: 4.87, color: wall, fragments: [wall, roof, stone, wood], chimney: new THREE.Vector3(-1.25, 4.9, -.85) };
  return g;
}

function storefront(variant, garage) {
  const g = new THREE.Group();
  const wall = garage ? 0x727b77 : [0x8d8a70, 0x8b6d64, 0x667c88][variant % 3];
  const steel = 0x556b70, trim = 0xbabca5, dark = PALETTE.ink, orange = 0xc77646, pane = 0xffc477;
  const w = garage ? 4.8 : 5.0, d = garage ? 4.3 : 4.4, h = garage ? 2.8 : 3.15;
  box(g, steel, 0, .18, 0, w + .16, .36, d + .16);
  box(g, wall, 0, h / 2 + .21, 0, w, h, d);
  box(g, steel, 0, h + .26, 0, w + .28, .18, d + .25);
  box(g, dark, 0, h + .37, 0, w -.2, .08, d -.2);
  for (const x of [-w / 2, w / 2]) box(g, trim, x, h / 2 + .2, d / 2 + .04, .17, h, .17);
  for (const x of [-w / 2 + .1, w / 2 - .1]) box(g, wall, x, h + .48, 0, .22, .25, d + .15);
  box(g, wall, 0, h + .48, -d / 2 + .1, w, .25, .22);
  if (garage) {
    box(g, dark, -.44, 1.37, d / 2 + .06, 3.22, 2.3, .12);
    box(g, steel, -.44, 1.36, d / 2 + .14, 2.97, 2.12, .07);
    for (let i = 0; i < 8; i++) box(g, trim, -.44, .4 + i * .26, d / 2 + .19, 2.96, .045, .035);
    box(g, dark, 1.68, 1.27, d / 2 + .07, .74, 1.99, .12);
    box(g, orange, 1.68, 1.25, d / 2 + .15, .58, 1.81, .07);
    box(g, pane, 1.68, 1.78, d / 2 + .2, .37, .42, .03, 0, 0, 0, .45);
    box(g, trim, -.45, h -.08, d / 2 + .12, 2.3, .37, .08);
    for (let i = 0; i < 5; i++) box(g, orange, -1.3 + i * .42, h -.08, d / 2 + .17, .24, .15, .025);
  } else {
    windowFront(g, trim, pane, -1.25, 1.61, d / 2 + .07, 1.68, 1.46);
    windowFront(g, trim, pane, 1.25, 1.61, d / 2 + .07, 1.68, 1.46);
    box(g, dark, 0, 1.32, d / 2 + .08, .77, 2.1, .12);
    box(g, trim, 0, 1.34, d / 2 + .15, .63, 1.94, .05);
    box(g, pane, 0, 1.55, d / 2 + .19, .46, 1.29, .025, 0, 0, 0, .45);
    box(g, dark, .23, 1.15, d / 2 + .22, .035, .3, .035);
    // Alternating canvas stripes and a hanging metal shop sign.
    for (let i = 0; i < 10; i++) {
      box(g, i % 2 ? trim : orange, -2.25 + i * .5, 2.69, d / 2 + .37, .5, .08, .86, .18);
      box(g, i % 2 ? trim : orange, -2.25 + i * .5, 2.48, d / 2 + .79, .5, .25, .06);
    }
    box(g, dark, 0, 3.22, d / 2 + .14, 2.72, .51, .17);
    box(g, pane, 0, 3.24, d / 2 + .24, 2.42, .29, .03, 0, 0, 0, .45);
    // Small pixel glyphs suggest a surviving, broken illuminated sign.
    for (let i = 0; i < 6; i++) {
      box(g, dark, -1.02 + i * .4, 3.24, d / 2 + .265, .07, .23, .02);
      box(g, dark, -.93 + i * .4, 3.31, d / 2 + .265, .2, .045, .02);
    }
  }
  windowSide(g, trim, pane, -w / 2 -.025, 1.68, -.5, .9, .8);
  windowSide(g, trim, pane, w / 2 + .025, 1.68, -.5, .9, .8);
  // Rooftop ventilation unit, grille and box flashing.
  box(g, trim, .87, h + .65, -.64, 1.15, .54, 1.0);
  box(g, steel, .87, h + .94, -.64, 1.23, .07, 1.08);
  for (let i = 0; i < 5; i++) box(g, dark, .87, h + .47 + i * .085, -.116, .91, .035, .025);
  cylinder(g, steel, -1.1, h + .61, -.98, .15, .18, .5, 8);
  cylinder(g, trim, -1.1, h + .9, -.98, .26, .26, .12, 8);
  compact(g);
  g.userData = { width: w, depth: d, height: h + .99, color: wall, fragments: [wall, steel, trim, orange] };
  return g;
}

function car(variant) {
  const g = new THREE.Group();
  const paint = [0xb96c48, 0x557f8d, 0x94906b, 0x7e5571, 0x789576][variant % 5];
  const dark = PALETTE.ink, tire = 0x202a2d, steel = 0x89999a, glass = 0x74b3bb, pale = 0xffdc8b;
  box(g, dark, 0, .37, 0, 1.6, .35, 3.34);
  box(g, paint, 0, .67, 0, 1.8, .49, 3.56);
  box(g, paint, 0, .98, -.1, 1.57, .62, 1.98);
  box(g, paint, 0, 1.33, -.17, 1.48, .12, 1.53);
  box(g, glass, 0, 1.08, .918, 1.34, .41, .055, -.22);
  box(g, glass, 0, 1.08, -1.11, 1.34, .41, .055, .22);
  for (const side of [-1, 1]) {
    for (const z of [-.63, .28]) box(g, glass, side * .798, 1.09, z, .045, .37, .72);
    box(g, steel, side * .826, 1.05, -.16, .055, .49, .07);
    box(g, dark, side * .92, .82, -.63, .04, .055, .23);
    box(g, dark, side * .92, .82, .29, .04, .055, .23);
    box(g, paint, side * 1.005, .99, .72, .2, .16, .25);
    for (const z of [-1.1, 1.12]) {
      cylinder(g, tire, side * .87, .39, z, .38, .38, .24, 10, 0, 0, Math.PI / 2);
      cylinder(g, steel, side * 1.005, .39, z, .2, .2, .035, 8, 0, 0, Math.PI / 2);
      cylinder(g, dark, side * 1.03, .39, z, .075, .075, .04, 6, 0, 0, Math.PI / 2);
    }
    box(g, pale, side * .59, .68, 1.804, .37, .17, .035, 0, 0, 0, .45);
    box(g, 0xe6654e, side * .62, .68, -1.804, .33, .17, .035, 0, 0, 0, .3);
  }
  box(g, steel, 0, .45, 1.82, 1.77, .12, .16);
  box(g, steel, 0, .45, -1.82, 1.77, .12, .16);
  box(g, dark, 0, .66, 1.813, .59, .18, .045);
  for (const x of [-.18, 0, .18]) box(g, steel, x, .66, 1.841, .045, .14, .025);
  box(g, pale, 0, .47, -1.913, .4, .1, .025);
  box(g, paint, 0, .96, 1.39, 1.74, .08, .62, -.035);
  box(g, dark, .63, .24, -1.65, .11, .11, .47);
  compact(g, true);
  g.userData = { width: 1.85, depth: 3.64, height: 1.43, color: paint, fragments: [paint, steel, glass, dark] };
  return g;
}

function wall(variant) {
  const g = new THREE.Group();
  const stone = variant % 2 ? 0x727b79 : 0x8a8374;
  const grout = 0x4a595d, pale = 0xa7aaa0;
  box(g, grout, 0, .6, 0, 3.4, 1.2, .48);
  for (let row = 0; row < 4; row++) for (let i = 0; i < 5; i++) {
    const x = -1.35 + i * .68 + (row % 2 ? -.12 : .08);
    box(g, stone, x, .17 + row * .29, .02, .61, .245, .52);
  }
  box(g, pale, 0, 1.28, 0, 3.58, .14, .65);
  for (const x of [-1.66, 1.66]) {
    box(g, stone, x, .72, 0, .36, 1.44, .63);
    box(g, pale, x, 1.47, 0, .48, .15, .75);
  }
  compact(g);
  g.userData = { width: 3.4, depth: .6, height: 1.55, color: stone, fragments: [stone, grout, pale] };
  return g;
}

function crate(variant) {
  const g = new THREE.Group();
  const wood = variant % 2 ? 0x9b7850 : 0x806a48, edge = 0xb39b6b, dark = 0x4d4b3b;
  box(g, dark, 0, .49, 0, .98, .98, .98);
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    box(g, wood, -.35 + i * .23, .51, side * .51, .21, .94, .07);
    box(g, wood, side * .51, .51, -.35 + i * .23, .07, .94, .21);
  }
  for (const side of [-1, 1]) {
    for (const y of [.16, .85]) {
      box(g, edge, 0, y, side * .56, 1.09, .13, .07);
      box(g, edge, side * .56, y, 0, .07, .13, 1.09);
    }
    box(g, edge, 0, .51, side * .58, .11, 1.04, .06, 0, 0, -.7);
  }
  for (let i = 0; i < 4; i++) box(g, wood, -.35 + i * .23, 1.02, 0, .21, .08, 1.04);
  box(g, edge, 0, 1.08, 0, .11, .06, 1.07, 0, -.7);
  compact(g);
  g.userData = { width: 1.05, depth: 1.05, height: 1.12, color: wood, fragments: [wood, edge, dark] };
  return g;
}

function barrel(variant) {
  const g = new THREE.Group();
  const body = variant % 2 ? 0x9c643a : 0xa14d37, band = 0x394f59, pale = 0xd4b96d;
  cylinder(g, body, 0, .54, 0, .42, .42, 1.02, 12);
  for (const y of [.12, .3, .78, 1.0]) cylinder(g, band, 0, y, 0, .438, .438, .07, 12);
  cylinder(g, band, 0, 1.075, 0, .41, .41, .06, 12);
  cylinder(g, pale, .17, 1.115, .13, .075, .075, .04, 6);
  box(g, pale, 0, .54, .424, .39, .36, .028, 0, 0, Math.PI / 4);
  box(g, band, 0, .54, .445, .07, .23, .025);
  compact(g);
  g.userData = { width: .88, depth: .88, height: 1.14, color: body, fragments: [body, band, pale] };
  return g;
}

function hydrant() {
  const g=new THREE.Group(),red=0xb74837,dark=0x34494c,steel=0x9aab9e;
  cylinder(g,dark,0,.065,0,.29,.31,.13,10);
  cylinder(g,red,0,.46,0,.18,.21,.73,10);
  for(const y of [.17,.77])cylinder(g,dark,0,y,0,.235,.235,.075,10);
  for(const side of [-1,1]){
    cylinder(g,red,side*.235,.6,0,.13,.14,.24,10,0,0,Math.PI/2);
    cylinder(g,steel,side*.35,.6,0,.14,.14,.04,10,0,0,Math.PI/2);
    cylinder(g,dark,side*.374,.6,0,.105,.105,.018,10,0,0,Math.PI/2);
  }
  cylinder(g,steel,0,.835,0,.22,.22,.07,10);
  cylinder(g,dark,0,.876,0,.175,.175,.018,10);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;cylinder(g,steel,Math.cos(a)*.255,.145,Math.sin(a)*.255,.031,.031,.045,6);}
  for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,red,Math.sin(a)*.185,.43,Math.cos(a)*.185,.025,.39,.035,0,a);}
  for(const side of [-1,1])for(let i=0;i<5;i++){const a=i/4;box(g,dark,side*(.27+.1*a),.51-.18*a,Math.sin(a*Math.PI)*.035,.025,.05,.025,0,0,side*.35);}
  compact(g);
  const caps=[];
  const top=group(g,'hydrant-top-cap',0,.89,0);
  cylinder(top,red,0,.07,0,.12,.215,.14,10);cylinder(top,red,0,.155,0,.075,.12,.04,10);cylinder(top,steel,0,.2,0,.055,.055,.06,6);compact(top);caps.push(top);
  for(const side of [-1,1]){
    const cap=group(g,'hydrant-side-cap',side*.4,.6,0);
    cylinder(cap,red,0,0,0,.14,.14,.07,10,0,0,Math.PI/2);cylinder(cap,steel,side*.055,0,0,.04,.04,.05,6,0,0,Math.PI/2);compact(cap);caps.push(cap);
  }
  g.scale.set(.68,.9,.9);
  g.userData={width:.65,depth:.56,height:1.01,color:red,fragments:[red,dark,steel],caps};return g;
}

function tree(variant) {
  const g = new THREE.Group();
  const bark = 0x635b44, bright = variant % 2 ? 0x6c8067 : 0x5b806c, dark = 0x345e55, foliage = 0x427466;
  cylinder(g, bark, 0, 1.34, 0, .16, .28, 2.68, 7);
  cylinder(g, bark, -.28, 1.99, .03, .07, .13, 1.05, 6, 0, 0, .68);
  cylinder(g, bark, .3, 2.31, -.06, .07, .12, 1.1, 6, 0, 0, -.62);
  for (let i = 0; i < 4; i++) cylinder(g, bark, Math.cos(i * Math.PI / 2) * .18, .13, Math.sin(i * Math.PI / 2) * .18, .11, .15, .52, 5, .55 * Math.sin(i * Math.PI / 2), 0, -.55 * Math.cos(i * Math.PI / 2));
  crystal(g, dark, -.08, 2.55, -.02, 1.22, .96, 1.08, .35);
  crystal(g, foliage, -.57, 3.05, .11, .93, .88, .88, .14);
  crystal(g, foliage, .65, 2.98, -.13, .95, .88, .9, .5);
  crystal(g, bright, .12, 3.62, -.05, 1.04, .82, .93, -.2);
  crystal(g, bright, -.45, 3.32, .66, .64, .56, .6, .4);
  compact(g);
  g.userData = { width: .68, depth: .68, height: 4.45, color: bark, fragments: [bark, bright, dark, foliage], wind: true };
  return g;
}

function lamp() {
  const g = new THREE.Group();
  const metal = 0x344e58, pale = 0xcbd1b8, gold = 0xffc879;
  cylinder(g, metal, 0, .15, 0, .24, .3, .3, 8);
  cylinder(g, metal, 0, 1.76, 0, .065, .11, 3.32, 8);
  cylinder(g, pale, 0, .59, 0, .11, .11, .09, 8);
  box(g, metal, .37, 3.34, 0, .85, .1, .12, 0, 0, -.14);
  box(g, metal, .76, 3.31, 0, .43, .12, .36);
  box(g, pale, .76, 3.19, 0, .42, .14, .35);
  box(g, gold, .76, 3.1, 0, .33, .07, .28, 0, 0, 0, 1.1);
  cylinder(g, metal, 0, 3.5, 0, .09, .09, .22, 8);
  compact(g);
  g.userData = { width: .45, depth: .45, height: 3.65, color: metal, fragments: [metal, pale, gold], lightPosition: new THREE.Vector3(.76, 3.1, 0) };
  return g;
}

function bench() {
  const g = new THREE.Group();
  const wood = 0xa47d50, metal = 0x364d51;
  for (const x of [-.64, .64]) {
    box(g, metal, x, .28, .16, .1, .56, .1);
    box(g, metal, x, .44, -.24, .1, .87, .1, -.1);
    box(g, metal, x, .5, -.02, .11, .09, .67);
    box(g, metal, x, .73, .02, .1, .08, .63);
  }
  for (let i = 0; i < 3; i++) box(g, wood, 0, .53, -.2 + i * .19, 1.84, .075, .16);
  for (let i = 0; i < 3; i++) box(g, wood, 0, .67 + i * .14, -.28 - i * .015, 1.84, .1, .07, -.1);
  compact(g);
  g.userData = { width: 1.84, depth: .7, height: 1.0, color: wood, fragments: [wood, metal] };
  return g;
}

export function makeProp(type, variant = 0) {
  const n = Math.abs(Math.floor(Number(variant) || 0));
  let g;
  switch (type) {
    case 'house': g = house(n); break;
    case 'shop': g = storefront(n, false); break;
    case 'garage': g = storefront(n, true); break;
    case 'car': g = car(n); break;
    case 'wall': g = wall(n); break;
    case 'barrel': g = barrel(n); break;
    case 'hydrant': g = hydrant(); break;
    case 'tree': g = tree(n); break;
    case 'lamp': g = lamp(); break;
    case 'bench': g = bench(); break;
    default: g = crate(n); break;
  }
  g.name = `Destructible ${type}`;
  g.userData.type = type;
  return g;
}

export function makeTreasure(kind = 'relic') {
  const g = new THREE.Group();
  const gold = 0xffbd57, pale = 0xffe6a9, dark = 0x654b35, teal = 0x74e0cf;
  if (kind === 'health' || kind === 'heal' || kind === 'heart') {
    box(g, 0x9f5945, 0, .35, 0, .38, .53, .38);
    box(g, 0xf09976, 0, .38, 0, .4, .37, .4, 0, 0, 0, .2);
    box(g, dark, 0, .66, 0, .28, .13, .28);
    box(g, pale, 0, .38, .207, .09, .26, .026, 0, 0, 0, .2);
    box(g, pale, 0, .38, .209, .24, .09, .027, 0, 0, 0, .2);
  } else if (kind === 'coin' || kind === 'gold') {
    cylinder(g, gold, 0, .28, 0, .23, .23, .12, 8, Math.PI / 2, 0, 0, .4);
    cylinder(g, pale, 0, .28, .07, .15, .15, .035, 8, Math.PI / 2, 0, 0, .5);
  } else if (kind === 'wood') {
    for (const [x, y] of [[-.115, .18], [.115, .18], [0, .36]]) {
      const billet = group(g, 'cutTimber', x, y, 0); billet.rotation.x = Math.PI / 2;
      cylinder(billet, 0x81583c, 0, 0, 0, .115, .125, .56, 7);
      for (const end of [-1, 1]) cylinder(billet, 0xc19a63, 0, end * .285, 0, .105, .105, .017, 7);
      growthRing(billet, 0x805b39, .063, .297, 0, 0, .008);
      box(billet, 0x50392c, -.105, 0, .04, .02, .51, .025);
    }
    for (const z of [-.16, .16]) {
      box(g, 0xc2ab76, 0, .10, z, .45, .035, .055);
      box(g, 0x988260, 0, .44, z, .25, .045, .055);
      for (const x of [-.225, .225]) box(g, 0xb69a6c, x, .245, z, .035, .28, .055);
    }
  } else if (kind === 'scrap' || kind === 'iron') {
    beveledBox(g, 0x586a73, -.09, .13, .01, .40, .13, .35, .025);
    const plate = beveledBox(g, 0x93a4a5, .11, .27, -.025, .36, .12, .28, .025);
    plate.rotation.set(.12, .45, -.2);
    box(g, 0xb5c3bc, -.1, .21, .13, .34, .035, .045, 0, -.12, .16);
    cylinder(g, 0x697e86, -.16, .34, .03, .13, .13, .055, 8, Math.PI / 2, 0, -.3);
    cylinder(g, 0x253c47, -.16, .34, .064, .055, .055, .017, 6, Math.PI / 2);
    for (const x of [-.2, .12]) cylinder(g, 0xd1cabb, x, .28, .13, .025, .025, .16, 6, 0, 0, .25);
  } else if (kind === 'crystal') {
    crystal(g, 0x345a6b, 0, .11, 0, .27, .14, .24, .2);
    crystal(g, 0x68d5e8, 0, .43, 0, .17, .40, .16, .2, .36);
    crystal(g, 0xb3eeeb, -.17, .30, .065, .10, .23, .095, -.3, .30);
    crystal(g, 0x5b9fc1, .16, .27, -.04, .115, .25, .10, .5, .26);
    crystal(g, 0xe1f6db, -.035, .59, .09, .055, .13, .04, 0, .45);
  } else if (kind === 'chest') {
    box(g, dark, 0, .25, 0, .85, .5, .62);
    box(g, 0x9f7846, 0, .53, 0, .86, .21, .63);
    for (const x of [-.28, .28]) box(g, gold, x, .33, 0, .08, .67, .67, 0, 0, 0, .2);
    box(g, gold, 0, .32, .35, .2, .24, .06, 0, 0, 0, .45);
    box(g, pale, 0, .43, .39, .07, .09, .03, 0, 0, 0, .6);
  } else {
    cylinder(g, dark, 0, .12, 0, .28, .34, .19, 6);
    cylinder(g, gold, 0, .22, 0, .27, .3, .09, 6, 0, 0, 0, .25);
    crystal(g, teal, 0, .52, 0, .28, .45, .28, 0, .6);
    crystal(g, pale, 0, .63, .03, .12, .23, .13, .3, .65);
  }
  compact(g);
  g.name = `Treasure ${kind}`;
  const color = kind === 'wood' ? 0xc19a63 : kind === 'scrap' || kind === 'iron' ? 0x93a4a5 : kind === 'crystal' ? 0x68d5e8
    : ['health', 'heal', 'heart'].includes(kind) ? 0xf09976 : gold;
  g.userData = { kind, width: .65, depth: .65, height: .95, color };
  return g;
}
