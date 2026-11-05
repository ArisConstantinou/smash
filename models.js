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
function compact(root) {
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
    if (!bucket) { bucket = { mat, positions: [], normals: [], colors: [] }; buckets.set(key, bucket); }
    const geo = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    transform.multiplyMatrices(inverse, node.matrixWorld);
    geo.applyMatrix4(transform);
    const p = geo.getAttribute('position');
    let n = geo.getAttribute('normal');
    if (!n) { geo.computeVertexNormals(); n = geo.getAttribute('normal'); }
    for (let i = 0; i < p.array.length; i++) bucket.positions.push(p.array[i]);
    for (let i = 0; i < n.array.length; i++) bucket.normals.push(n.array[i]);
    if (!glowing) {
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

  const leftLeg = limb(root, 'leftLeg', -.205, .62, 0, P.blueDark, P.steel, P.ink);
  const rightLeg = limb(root, 'rightLeg', .205, .62, 0, P.blueDark, P.steel, P.ink);
  // Two articulated arms connect the moving grip points to fixed shoulders.
  // The gauntlets themselves live with the weapon so contact is never faked.
  function grippingArm(side) {
    const arm = group(root, side < 0 ? 'leftArm' : 'rightArm', side * .49, 1.28, .015);
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
    arm.userData = { upper, fore, side };
    return arm;
  }
  const leftArm = grippingArm(-1);
  const rightArm = grippingArm(1);

  const cape = group(root, 'cape', 0, 1.32, -.27);
  box(cape, 0xc86035, 0, -.25, -.06, .6, .59, .07, -.17);
  box(cape, P.hot, -.13, -.62, -.14, .38, .27, .08, -.25, 0, -.06);
  box(cape, 0x923b30, .22, -.58, -.13, .18, .24, .08, -.25, 0, .08);
  compact(cape);

  const weaponRig = group(root, 'weaponRig', 0, 1.04, .38);
  weaponRig.rotation.set(.55, 0, -.72);
  const hammerPivot = group(weaponRig, 'hammerPivot');
  cylinder(hammerPivot, P.timberDark, 0, .57, 0, .065, .085, 1.37, 8);
  for (let i = 0; i < 6; i++) box(hammerPivot, P.timber, 0, -.035 + i * .1, 0, .15, .035, .15);
  box(hammerPivot, P.gold, 0, -.13, 0, .18, .16, .18);
  box(hammerPivot, P.steel, 0, 1.12, 0, .2, .13, .2);
  compact(hammerPivot);
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
  const leftGrip = group(hammerPivot, 'leftGrip', 0, .08, 0);
  const rightGrip = group(hammerPivot, 'rightGrip', 0, .43, 0);
  for (const grip of [leftGrip, rightGrip]) {
    box(grip, P.timberDark, 0, 0, 0, .25, .2, .26);
    box(grip, P.steel, 0, .01, -.035, .28, .15, .2);
    box(grip, P.gold, 0, -.079, 0, .27, .045, .28);
    box(grip, P.pale, .12, 0, .075, .065, .14, .15);
    compact(grip);
  }
  const gripTarget = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const axisY = new THREE.Vector3(0, 1, 0);
  const zero = new THREE.Vector3();
  const segmentDelta = new THREE.Vector3();
  function poseSegment(segment, start, end) {
    segment.position.copy(start).add(end).multiplyScalar(.5);
    segmentDelta.subVectors(end, start);
    const length = Math.max(.05, segmentDelta.length());
    segment.quaternion.setFromUnitVectors(axisY, segmentDelta.divideScalar(length));
    segment.scale.set(1, length, 1);
  }
  function updateGrip() {
    root.updateMatrixWorld(true);
    for (const [arm, grip] of [[leftArm, leftGrip], [rightArm, rightGrip]]) {
      grip.getWorldPosition(gripTarget);
      arm.worldToLocal(gripTarget);
      elbow.copy(gripTarget).multiplyScalar(.45);
      elbow.x += arm.userData.side * .19;
      elbow.y -= .22;
      elbow.z += .12;
      poseSegment(arm.userData.upper, zero, elbow);
      poseSegment(arm.userData.fore, elbow, gripTarget);
    }
  }
  root.userData = {
    body, leftLeg, rightLeg, leftArm, rightArm, weaponRig, hammerPivot, hammerHead, cape,
    leftGrip, rightGrip, updateGrip,
    weaponRest: { x: .55, y: 0, z: -.72 },
    hammerRest: { x: 0, y: 0, z: 0 },
    width: 1.1, depth: .7, height: 1.99, color: P.blue,
    fragments: [P.blue, P.steel, P.gold, P.hot],
  };
  updateGrip();
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
  const leftLeg = limb(root, 'leftLeg', -.22, .64, 0, P.shadow, P.steel, P.ink);
  const rightLeg = limb(root, 'rightLeg', .22, .64, 0, P.shadow, P.steel, P.ink);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = group(root, side < 0 ? 'leftArm' : 'rightArm', side * .52, 1.27, 0);
    cylinder(arm, P.steel, 0, -.03, 0, .17, .17, .22, 6, 0, 0, Math.PI / 2);
    box(arm, P.blueDark, 0, -.25, 0, .23, .4, .25);
    box(arm, P.steel, 0, -.47, .025, .3, .23, .3);
    box(arm, P.hot, 0, -.46, .19, .17, .06, .035, 0, 0, 0, .7);
    for (const finger of [-1, 1]) box(arm, P.ink, finger * .1, -.62, .08, .07, .16, .16);
    compact(arm); arms.push(arm);
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
  const leftLeg = limb(root, 'leftLeg', -.19, .6, 0, pants, darkSkin, 0x302f30);
  const rightLeg = limb(root, 'rightLeg', .19, .6, 0, pants, pants, 0x302f30);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = group(root, side < 0 ? 'leftArm' : 'rightArm', side * .45, 1.22, .015);
    box(arm, shirt, 0, -.115, 0, .28, .27, .31);
    box(arm, skin, 0, -.34, .035, .21, .34, .23, -.17);
    box(arm, darkSkin, 0, -.51, .11, .25, .17, .28);
    box(arm, skin, 0, -.58, .22, .22, .11, .16);
    if (brute) box(arm, 0x686751, side * .025, -.43, .04, .32, .2, .32);
    compact(arm);
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
    const leg = group(root, side < 0 ? 'leftLeg' : 'rightLeg', side * .68, 2.21, 0);
    box(leg, dark, 0, -.49, 0, .72, .98, .79);
    box(leg, iron, 0, -.59, .32, .85, .9, .25);
    cylinder(leg, edge, 0, -1.02, .1, .31, .31, .9, 8, 0, 0, Math.PI / 2);
    box(leg, iron, 0, -1.43, .035, .9, .75, .97);
    box(leg, orange, 0, -1.43, .56, .56, .5, .11);
    box(leg, dark, 0, -1.96, .26, 1.01, .43, 1.49);
    box(leg, edge, 0, -1.87, .9, .99, .17, .22);
    for (const dx of [-.25, 0, .25]) box(leg, iron, dx, -1.98, 1.015, .16, .28, .1);
    compact(leg); legs.push(leg);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = group(root, side < 0 ? 'leftArm' : 'rightArm', side * 1.63, 3.94, 0);
    cylinder(arm, dark, 0, -.16, 0, .43, .43, .91, 8, 0, 0, Math.PI / 2);
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
    compact(arm); arms.push(arm);
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
  compact(g);
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
  g.userData = { kind, width: .65, depth: .65, height: .95, color: ['health', 'heal', 'heart'].includes(kind) ? 0xf09976 : gold };
  return g;
}
