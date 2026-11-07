import * as THREE from './vendor/three.module.js';

// City architecture is modelled in metres, with the front on +Z. Static detail
// is baked into a vertex-coloured mesh; windows and emergency lights retain a
// handful of emissive batches. A hundred buildings do not mean a hundred sets
// of individual window/brick draw calls.
export const CITY_BUILDING_KINDS = Object.freeze([
  'townhouse', 'apartment', 'shop', 'office', 'townhall',
  'police', 'hospital', 'skyscraper', 'construction', 'warehouse',
]);

const BOX = new THREE.BoxGeometry(1, 1, 1);
// Tapered cabin keeps sloping windscreens on the shell instead of intersecting
// a rectangular block; this is visible even at the game's small vehicle scale.
const CABIN = BOX.clone();
for(let i=0;i<CABIN.attributes.position.count;i++) {
  const p=CABIN.attributes.position;
  if(p.getY(i)>.0){p.setX(i,p.getX(i)*.92);p.setZ(i,p.getZ(i)>0?.37:-.42);}
}
CABIN.computeVertexNormals();
const PLANE = new THREE.PlaneGeometry(1, 1);
const ICOSAHEDRON = new THREE.IcosahedronGeometry(1, 0);
const TRIANGLE = new THREE.BufferGeometry();
TRIANGLE.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, 0, 1, 0], 3));
TRIANGLE.computeVertexNormals();
const sources = new Map(), colors = new Map(), materials = new Map();
const prototypes = new Map();
const matte = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
const P = {
  dark: 0x20343d, ink: 0x16272e, steel: 0x627e86, pale: 0xc5d0c2,
  stone: 0x929d92, cream: 0xd4c7a2, white: 0xe3e4d3, blue: 0x317899,
  navy: 0x244c67, glass: 0x3c6c7c, glassLight: 0x9bc5c5, warm: 0xffd68d,
  copper: 0xb47b55, orange: 0xefaa51, red: 0xc9554c, green: 0x729c7b,
  blueLight: 0x4b9fff, redLight: 0xff5b59,
};

function color(value) {
  if (!colors.has(value)) colors.set(value, new THREE.Color(value));
  return colors.get(value);
}
function material(value, glow = 0) {
  if (!glow) return matte;
  const key = value + ':' + glow;
  if (!materials.has(key)) materials.set(key, new THREE.MeshLambertMaterial({
    color: 0xffffff, vertexColors: true, flatShading: true,
    emissive: value, emissiveIntensity: glow,
  }));
  return materials.get(key);
}
function cylinder(sides = 10, ratio = 1) {
  const key = 'c:' + sides + ':' + ratio;
  if (!sources.has(key)) sources.set(key, new THREE.CylinderGeometry(ratio, 1, 1, sides, 1));
  return sources.get(key);
}
function ring(inner = .8, outer = 1, segments = 32) {
  const key = 'r:' + inner + ':' + outer + ':' + segments;
  if (!sources.has(key)) sources.set(key, new THREE.RingGeometry(inner, outer, segments));
  return sources.get(key);
}

class Builder {
  constructor(name) {
    this.root = new THREE.Group(); this.root.name = name; this.buckets = new Map();
    this.matrix = new THREE.Matrix4(); this.normal = new THREE.Matrix3();
    this.position = new THREE.Vector3(); this.scale = new THREE.Vector3();
    this.rotation = new THREE.Quaternion(); this.euler = new THREE.Euler();
    this.point = new THREE.Vector3(); this.direction = new THREE.Vector3();
  }
  raw(geometry, tint, x, y, z, sx, sy, sz, quaternion, glow = 0) {
    const key = glow ? tint + ':' + glow : 'matte';
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { positions: [], normals: [], colors: [], parts: [], material: material(tint, glow), tint, glow };
      this.buckets.set(key, bucket);
    }
    this.matrix.compose(this.position.set(x, y, z), quaternion, this.scale.set(sx, sy, sz));
    this.normal.getNormalMatrix(this.matrix);
    const start = bucket.positions.length / 3;
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
    const indices = geometry.index?.array, count = indices ? indices.length : p.count, c = color(tint);
    for (let i = 0; i < count; i++) {
      const j = indices ? indices[i] : i;
      this.point.fromBufferAttribute(p, j).applyMatrix4(this.matrix);
      this.direction.fromBufferAttribute(n, j).applyMatrix3(this.normal).normalize();
      bucket.positions.push(this.point.x, this.point.y, this.point.z);
      bucket.normals.push(this.direction.x, this.direction.y, this.direction.z);
      bucket.colors.push(c.r, c.g, c.b);
    }
    bucket.parts.push({start,count,box:geometry===BOX,matrix:this.matrix.toArray(),tint,glow});
    return this;
  }
  put(geometry, tint, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, glow = 0) {
    this.rotation.setFromEuler(this.euler.set(rx, ry, rz));
    return this.raw(geometry, tint, x, y, z, sx, sy, sz, this.rotation, glow);
  }
  box(tint, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0, glow = 0) {
    return this.put(BOX, tint, x, y, z, w, h, d, rx, ry, rz, glow);
  }
  plane(tint, x, y, z, w, h, rx = 0, ry = 0, rz = 0, glow = 0) {
    return this.put(PLANE, tint, x, y, z, w, h, 1, rx, ry, rz, glow);
  }
  cyl(tint, x, y, z, radius, height, sides = 10, rx = 0, ry = 0, rz = 0, ratio = 1, glow = 0) {
    return this.put(cylinder(sides, ratio), tint, x, y, z, radius, height, radius, rx, ry, rz, glow);
  }
  beam(tint, a, b, width = .12, depth = width) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const vector = end.clone().sub(start), midpoint = start.add(end).multiplyScalar(.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.clone().normalize());
    return this.raw(BOX, tint, midpoint.x, midpoint.y, midpoint.z, width, vector.length(), depth, q);
  }
  finish() {
    for (const bucket of this.buckets.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors, 3));
      geometry.userData.fractureParts = bucket.parts;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, bucket.material);
      mesh.name = bucket.glow ? 'Emissive facade ' + bucket.tint.toString(16) : 'Baked architectural detail';
      mesh.castShadow = !bucket.glow; mesh.receiveShadow = true;
      if (bucket.glow && (bucket.tint === P.blueLight || bucket.tint === P.redLight)) mesh.userData.emergencyLight = true;
      this.root.add(mesh);
    }
    return this.root;
  }
}

const FONT = {
  A:['01110','10001','10001','11111','10001','10001','10001'],
  B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],
  F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],
  H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],
  J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'],
  L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],
  P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'],
  R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],
  V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','11011','10001'],
  X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
  Z:['11111','00001','00010','00100','01000','10000','11111'],
  0:['01110','10011','10101','10101','11001','10001','01110'],
  1:['00100','01100','00100','00100','00100','00100','01110'],
  2:['01110','10001','00001','00010','00100','01000','11111'],
  3:['11110','00001','00001','01110','00001','00001','11110'],
  4:['00010','00110','01010','10010','11111','00010','00010'],
  5:['11111','10000','10000','11110','00001','00001','11110'],
  6:['01110','10000','10000','11110','10001','10001','01110'],
  7:['11111','00001','00010','00100','01000','01000','01000'],
  8:['01110','10001','10001','01110','10001','10001','01110'],
  9:['01110','10001','10001','01111','00001','00001','01110'],
};

function lettering(b, text, x, y, z, height, tint = P.cream, angle = 0, glow = 0) {
  const pixel = height / 7, width = (text.length * 6 - 1) * pixel;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  [...text].forEach((char, index) => {
    const glyph = FONT[char]; if (!glyph) return;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5;) {
        if (glyph[row][col] !== '1') { col++; continue; }
        const start = col; while (col < 5 && glyph[row][col] === '1') col++;
        const length = col - start, offset = (index * 6 + start + length / 2) * pixel - width / 2;
        b.box(tint, x + offset * cos, y + (3 - row) * pixel, z - offset * sin,
          length * pixel * .94, pixel * .90, .025, 0, angle, 0, glow);
      }
    }
  });
}
function sign(b, text, x, y, z, w, h, board = P.navy, ink = P.cream, angle = 0) {
  b.box(P.steel, x, y, z, w + .16, h + .15, .17, 0, angle);
  b.box(board, x + Math.sin(angle) * .08, y, z + Math.cos(angle) * .08, w, h, .07, 0, angle);
  const letterHeight = Math.min(h * .65, w / (text.length * 6 - 1) * 7 * .85);
  lettering(b, text, x + Math.sin(angle) * .13, y, z + Math.cos(angle) * .13, letterHeight, ink, angle);
}
function window(b, x, y, z, w, h, angle = 0, frame = P.pale, glass = P.glass, lit = false) {
  const sx = Math.sin(angle), sz = Math.cos(angle);
  b.box(frame, x, y, z, w + .18, h + .18, .17, 0, angle);
  b.plane(lit ? P.warm : glass, x + sx * .09, y, z + sz * .09, w, h, 0, angle, 0, lit ? .16 : 0);
  if (w > 1.3) b.box(frame, x + sx * .12, y, z + sz * .12, .065, h, .055, 0, angle);
  b.box(frame, x + sx * .13, y - h / 2 - .10, z + sz * .13, w + .28, .11, .28, 0, angle);
}
function windowGrid(b, w, d, heights, columns, sideColumns, variant, frame = P.pale, glass = P.glass, zOffset = 0) {
  for (let floor = 0; floor < heights.length; floor++) {
    for (let col = 0; col < columns; col++) {
      const x = (col - (columns - 1) / 2) * (w - 1.4) / columns;
      const lit = (floor * 3 + col + variant) % 5 === 0;
      window(b, x, heights[floor], zOffset + d / 2 + .025, (w - 1.4) / columns * .62, 1.12, 0, frame, glass, lit);
      window(b, -x, heights[floor], zOffset - d / 2 - .025, (w - 1.4) / columns * .62, 1.12, Math.PI, frame, glass, (floor + col + variant) % 7 === 1);
    }
    for (let col = 0; col < sideColumns; col++) {
      const z = zOffset + (col - (sideColumns - 1) / 2) * (d - 1.2) / sideColumns;
      for (const side of [-1, 1]) window(b, side * (w / 2 + .025), heights[floor], z,
        (d - 1.2) / sideColumns * .62, 1.12, side * Math.PI / 2, frame, glass, (col + floor + variant) % 6 === 2);
    }
  }
}
function door(b, x, y, z, w = 1.45, h = 2.1, frame = P.pale, double = false) {
  b.box(P.ink, x, y + h / 2, z, w + .24, h + .12, .16);
  b.box(frame, x - w / 2 - .09, y + h / 2, z + .12, .18, h + .28, .28);
  b.box(frame, x + w / 2 + .09, y + h / 2, z + .12, .18, h + .28, .28);
  b.box(frame, x, y + h + .08, z + .12, w + .36, .2, .28);
  b.plane(P.glassLight, x, y + h * .58, z + .095, w * .8, h * .64);
  if (double) b.box(frame, x, y + h / 2, z + .17, .10, h, .10);
  b.box(P.orange, x + (double ? -.16 : w * .32), y + h * .43, z + .20, .055, .34, .08);
  if (double) b.box(P.orange, x + .16, y + h * .43, z + .20, .055, .34, .08);
}
function stairs(b, x, z, w, steps = 3, stone = P.stone) {
  for (let i = 0; i < steps; i++) b.box(stone, x, .09 + i * .105, z - i * .28, w, .18 + i * .21, .37);
}
function parapet(b, w, d, y, tint = P.pale, x = 0, z = 0) {
  for (const side of [-1, 1]) {
    b.box(tint, x, y, z + side * d / 2, w + .22, .38, .22);
    b.box(tint, x + side * w / 2, y, z, .22, .38, d + .22);
  }
}
function roof(b, x, z, w, d, y, rise, wall, tint, trim = P.pale) {
  const pitch = Math.atan2(rise, w / 2), slope = Math.hypot(w / 2, rise);
  b.put(TRIANGLE, wall, x, y, z + d / 2, w, rise, 1);
  b.put(TRIANGLE, wall, x, y, z - d / 2, w, rise, 1, 0, Math.PI);
  for (const side of [-1, 1]) {
    b.box(tint, x + side * w / 4, y + rise / 2, z, slope + .38, .17, d + .46, 0, 0, -side * pitch);
    for (let row = 0; row < 5; row++) b.box(trim, x + side * w / 4, y + rise / 2 + .09, z + (row - 2) * d / 5,
      slope + .29, .035, .045, 0, 0, -side * pitch);
    b.box(trim, x + side * (w / 2 + .12), y - .04, z, .14, .17, d + .5);
  }
  b.box(trim, x, y + rise + .08, z, .18, .16, d + .6);
}
function rooftopPlant(b, x, y, z, variant = 0) {
  b.box(P.dark, x, y + .22, z, 1.35, .44, .95);
  b.box(P.steel, x, y + .5, z, 1.15, .14, .8);
  b.cyl(P.ink, x, y + .59, z, .3, .06, 12);
  for (const side of [-1, 1]) b.box(P.pale, x + side * .24, y + .63, z, .05, .03, .47, 0, side * .45);
  b.box(P.steel, x + .83, y + .2, z, .5, .22, .24);
  if (variant % 2) b.cyl(P.steel, x + .95, y + .58, z, .12, .85, 8);
}
function planter(b, x, z, w = 1.3) {
  b.box(P.stone, x, .3, z, w, .6, .7);
  b.box(P.dark, x, .61, z, w - .12, .055, .55);
  for (const offset of [-.28, .28]) b.put(ICOSAHEDRON, P.green, x + offset * w, .83, z, .32 * w, .33, .34);
}
function cross(b, x, y, z, size, tint = P.red, angle = 0, glow = 0) {
  b.box(tint, x, y, z, size * .31, size, .13, 0, angle, 0, glow);
  b.box(tint, x, y, z, size, size * .31, .15, 0, angle, 0, glow);
}
function terraceRail(b, x, y, z, width, tint = P.dark) {
  b.box(tint, x, y + .65, z, width, .08, .08);
  for (let i = 0; i < 6; i++) b.box(tint, x + (i / 5 - .5) * (width - .1), y + .35, z, .055, .64, .055);
}

function townhouse(variant) {
  const b = new Builder('Terraced house — bay windows, porch and slate roof');
  const wall = [0xc9b78f, 0x9ba89b, 0xb48e7e, 0x9babb5][variant];
  const slate = [0x36545d, 0x564d58, 0x3e5e61, 0x7d979f][variant];
  b.box(P.stone, 0, .18, 0, 7.7, .36, 8.4);
  b.box(wall, -.3, 2.75, -.3, 6.4, 5.12, 5.8);
  b.box(P.cream, -.3, .7, -.3, 6.55, .6, 5.95);
  roof(b, -.3, -.3, 6.55, 6.05, 5.36, 1.35, wall, slate);
  for (const x of [-2.2, 1.55]) {
    window(b, x, 4.25, 2.64, 1.18, 1.35, 0, P.pale, P.glass, x < 0);
    window(b, x, 1.95, 2.64, 1.18, 1.35, 0, P.pale, P.glass, x > 0);
    for (const side of [-1, 1]) b.box(0x53776b, x + side * .82, 4.25, 2.72, .27, 1.5, .12);
  }
  for (const side of [-1, 1]) for (const y of [2, 4.25]) window(b, side * 3.225 - .3, y, -.4, 1.2, 1.25, side * Math.PI / 2);
  window(b, -.3, 4.2, -3.24, 1.5, 1.25, Math.PI);
  door(b, -.35, .36, 2.64, 1.2, 2.1);
  b.box(slate, -.35, 3.03, 3.1, 2.4, .19, 1.5, -.1);
  for (const x of [-1.4, .7]) b.box(P.pale, x, 1.64, 3.65, .15, 2.6, .15);
  stairs(b, -.35, 3.97, 2.2);
  b.box(P.copper, -1.65, 6.7, -1.5, .7, 1.55, .72);
  b.box(P.pale, -1.65, 7.5, -1.5, .9, .18, .92);
  b.box(P.dark, -1.65, 7.6, -1.5, .55, .05, .55);
  b.box(P.steel, 3.35, 2.7, -2.5, .12, 5.2, .12);
  planter(b, 2.65, 3.5, 1.15); planter(b, -2.9, 3.5, 1.1);
  const g = b.finish(); g.userData = { color: wall, fragments: [wall, slate, P.stone, P.pale], chimney: {x:-1.65,y:7.65,z:-1.5} }; return g;
}

function shop(variant) {
  const b = new Builder('High-street shop — glazed storefront and striped awning');
  const wall = [0xc6ad85,0x91a69e,0xac9582,0xa2aeb0][variant];
  const accent = [0xd4974e,0x426f7f,0xa66350,0x6d805a][variant];
  b.box(P.stone, 0, .16, 0, 10.2, .32, 9.8);
  b.box(wall, 0, 3.05, -.45, 8.8, 5.8, 6.8);
  b.box(P.pale, 0, .45, -.45, 9.0, .28, 7.0);
  b.box(P.pale, 0, 3.2, -.45, 9.1, .20, 7.1);
  for (const x of [-2.75, 2.75]) window(b, x, 1.7, 2.99, 2.35, 2.15, 0, P.dark, P.glassLight);
  door(b, 0, .32, 2.99, 1.45, 2.25, P.pale, true);
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * .96;
    b.box(i % 2 ? P.cream : accent, x, 2.99, 3.75, .96, .12, 1.65, -.15);
    b.box(i % 2 ? P.cream : accent, x, 2.68, 4.54, .96, .34, .10);
  }
  const name = ['MARKET','BAKERY','BOOKS','CAFE'][variant];
  sign(b, name, 0, 3.82, 3.04, 6.7, .68, accent);
  for (const x of [-2.8,0,2.8]) window(b, x, 4.94, 3.0, 1.4, 1.1, 0, P.pale, P.glass, x === 0);
  for (const side of [-1,1]) for (const z of [-2, .5]) window(b, side * 4.43, 4.7, z, 1.4, 1.3, side * Math.PI / 2);
  b.box(P.dark, 0, 5.98, -.45, 9, .16, 7); parapet(b, 8.9, 7, 6.17, P.pale, 0, -.45);
  rooftopPlant(b, -2.3, 6.15, -1.6, variant);
  b.box(accent, 2.1, .76, 3.8, 1.3, .85, .8); b.box(P.cream, 2.1, 1.22, 3.8, 1.4, .1, .88);
  for (let i = 0; i < 4; i++) b.put(ICOSAHEDRON, i % 2 ? P.orange : P.green, 1.66 + i * .29, 1.37, 3.8, .16, .16, .17);
  stairs(b, 0, 4.35, 1.8, 2); const g = b.finish(); g.userData = {color:wall,fragments:[wall,accent,P.pale,P.dark]}; return g;
}

function apartment(variant) {
  const b = new Builder('Apartment block — balconies, recessed windows and rooftop tank');
  const wall = [0xaba894,0x929f99,0xb29c8c,0x91a4ad][variant], h = 10.8 + (variant % 2) * 2.4;
  const floors = Math.round((h - 1.2) / 2.4);
  b.box(P.stone, 0, .2, 0, 11.7, .4, 11.9);
  b.box(wall, 0, h / 2 + .3, -.45, 9.6, h, 8.7);
  b.box(P.dark, 0, .62, -.45, 9.8, .55, 8.9);
  const rows = Array.from({length:floors},(_,i)=>1.9+i*2.4);
  windowGrid(b, 9.6, 8.7, rows, 4, 3, variant, P.pale, P.glass, -.45);
  for (let floor = 0; floor < floors; floor++) {
    const y = .85 + floor * 2.4;
    b.box(P.pale, 0, y + 1.84, -.45, 9.84, .14, 8.94);
    for (const x of [-2.75,2.75]) {
      b.box(P.pale, x, y, 4.57, 3.05, .18, 1.46);
      terraceRail(b, x, y + .08, 5.23, 2.97);
      for(const side of [-1,1]) b.box(P.dark, x + side * 1.48, y + .44, 4.62, .06, .68, 1.18);
    }
  }
  door(b, 0, .4, 3.96, 1.65, 2.25, P.pale, true);
  b.box(P.steel, 0, 2.95, 4.62, 2.2, .18, 1.46);
  stairs(b, 0, 5.61, 2.2, 3);
  b.box(P.dark, 0, h + .38, -.45, 9.9, .2, 9); parapet(b, 9.8, 9, h + .65, P.pale, 0, -.45);
  b.box(P.stone, 2.5, h + 1.2, -2.4, 2.2, 1.6, 2.1);
  b.box(P.pale, 2.5, h + 2.03, -2.4, 2.35, .12, 2.25);
  b.cyl(P.steel, -2.3, h + 1.3, -2.3, .86, 1.6, 12);
  b.cyl(P.pale, -2.3, h + 2.12, -2.3, .9, .15, 12);
  for (const x of [-2.1,0]) b.box(P.navy, x, h + .92, 1.65, 1.8, .12, 1.3, .30);
  rooftopPlant(b, .2, h + .5, -1.8, variant);
  const g = b.finish(); g.userData = {color:wall,fragments:[wall,P.pale,P.steel,P.glass]}; return g;
}

function office(variant) {
  const b = new Builder('Office building — glass ribbons and limestone frame');
  const glass = [0x4c7f89,0x557a8a,0x487d76,0x536b7d][variant];
  const w = 10.5, d = 8.8, floors = 5 + (variant % 2), h = 2.3 * floors + 1;
  b.box(P.stone, 0, .2, 0, 12.4, .4, 11.8);
  b.box(glass, 0, h / 2 + .35, -.45, w, h, d);
  for (let floor = 0; floor <= floors; floor++) {
    const y = .65 + floor * 2.3;
    b.box(P.pale, 0, y, -.45, w + .32, .20, d + .32);
    if(floor < floors) for (const side of [-1,1]) {
      b.box(P.dark, 0, y + .5, -.45 + side * (d / 2 + .02), w - .3, .19, .07);
      b.box(P.dark, side * (w / 2 + .02), y + .5, -.45, .07, .19, d - .3);
    }
  }
  for (const x of [-4.9,-2.45,0,2.45,4.9]) {
    for (const side of [-1,1]) b.box(P.steel, x, h / 2 + .35, -.45 + side * (d / 2 + .055), .14, h, .16);
  }
  for (const z of [-3.9,-1.65,.6,2.85]) for(const side of [-1,1]) b.box(P.steel, side * 5.31, h/2+.35, z, .16, h, .14);
  for(let i=0;i<5;i++) window(b,(i-2)*1.85,6.2,4.0,1.6,1.25,0,P.steel,glass,i===variant);
  b.box(P.cream, 0, 1.6, 4.06, 4.1, 2.7, .35); door(b, 0, .4, 4.28, 2.7, 2.35, P.pale, true);
  b.box(P.steel, 0, 3.08, 4.82, 4.8, .24, 1.65); stairs(b,0,5.62,3.5,3);
  sign(b,['METRO','ATLAS','IRON','NORTH'][variant],0,4.1,4.08,4.8,.7,P.navy);
  b.box(P.dark,0,h+.45,-.45,w+.15,.16,d+.15);parapet(b,w+.25,d+.25,h+.69,P.pale,0,-.45);
  rooftopPlant(b,-2.7,h+.54,-2.3,variant);rooftopPlant(b,1.9,h+.54,-2.3,variant+1);
  b.box(P.stone,2.9,h+1.3,1.6,2.1,1.6,1.9);
  planter(b,-4.9,4.95,1.6);planter(b,4.9,4.95,1.6);
  const g=b.finish();g.userData={color:P.steel,fragments:[P.steel,P.pale,glass,P.stone]};return g;
}

function townhall(variant) {
  const b=new Builder('Town hall — colonnade, pediment and four-faced clock tower');
  const wall=variant%2?0xc9c5ac:0xcdb990,roofTint=variant%2?0x496b6a:0x4b626b;
  b.box(P.stone,0,.22,0,13.8,.44,13.4);
  b.box(wall,0,3.25,-1.0,11.9,6.1,8.5);
  b.box(P.pale,0,.8,-1,12.1,.6,8.7);
  for(const x of [-4.55,-2.2,2.2,4.55]) {
    window(b,x,2.25,3.3,1.4,1.7,0,P.pale,P.glass,true);
    window(b,x,4.6,3.3,1.4,1.5,0,P.pale);
  }
  for(const side of [-1,1]) for(const z of [-3.6,-1,1.6]) window(b,side*6.0,3.5,z,1.55,2.4,side*Math.PI/2,P.pale);
  door(b,0,.44,3.32,2.2,2.9,P.pale,true);
  for(const x of [-3.45,-1.7,1.7,3.45]) {
    b.box(P.pale,x,.65,5.12,.67,.4,.67);
    b.cyl(P.cream,x,2.75,5.12,.24,4.0,10);
    b.box(P.pale,x,4.8,5.12,.75,.28,.75);
  }
  b.box(P.pale,0,5.1,4.7,8.1,.34,2.2);
  roof(b,0,4.65,8.0,2.5,5.28,1.4,wall,roofTint,P.pale);
  sign(b,'CITY HALL',0,4.3,3.41,4.8,.66,roofTint);
  stairs(b,0,6.38,8.3,4); roof(b,0,-1,12.1,8.8,6.43,1.25,wall,roofTint);
  b.box(wall,0,8.5,-1.2,3.3,5.7,3.3);
  for(const y of [6.35,8.5,10.65]) b.box(P.pale,0,y,-1.2,3.65,.22,3.65);
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
    const x=Math.sin(angle)*1.7,z=-1.2+Math.cos(angle)*1.7;
    b.cyl(P.dark,x,9.5,z,.96,.12,20,Math.PI/2,0,angle);
    // Clock face planes and slender raised hands stay readable from the pitch.
    b.plane(P.cream,x+Math.sin(angle)*.08,9.5,z+Math.cos(angle)*.08,1.5,1.5,0,angle);
    const dx=Math.sin(angle)*.11,dz=Math.cos(angle)*.11;
    b.box(P.ink,x+dx,9.72,z+dz,.09,.6,.04,0,angle);
    const offset=.2;
    b.box(P.ink,x+dx+offset*Math.cos(angle),9.5,z+dz-offset*Math.sin(angle),.47,.09,.04,0,angle);
  }
  roof(b,0,-1.2,3.75,3.75,10.89,1.48,wall,roofTint,P.pale);
  b.cyl(P.orange,0,12.6,-1.2,.14,.72,8,0,0,0,.3);
  for(const x of [-5.25,5.25]) planter(b,x,5.45,1.8);
  const g=b.finish();g.userData={color:wall,fragments:[wall,roofTint,P.cream,P.stone]};return g;
}

function police(variant) {
  const b=new Builder('Police station — blue fascia, public entrance and vehicle garage');
  const wall=variant%2?0xbbc6c4:0xd0d0b9;
  b.box(P.stone,0,.2,0,13.5,.4,12.2);
  b.box(wall,0,3.67,-.6,11.6,6.95,9.1);
  for(const y of [1.15,4.25,6.65]) b.box(P.navy,0,y,-.6,11.8,y===4.25?.5:.25,9.3);
  b.box(P.dark,-2.9,1.9,4.02,4.5,3.2,.18);
  b.box(P.steel,-2.9,1.9,4.14,4.2,2.85,.08);
  for(let i=0;i<9;i++) b.box(P.dark,-2.9,.65+i*.31,4.2,4.2,.045,.035);
  b.box(P.orange,-2.9,.45,4.22,4.7,.16,.12);
  door(b,2.4,.4,4.08,2.25,2.7,P.pale,true);
  b.box(P.navy,2.4,3.28,4.55,3.25,.2,1.3);
  stairs(b,2.4,5.54,2.9,3);
  sign(b,'POLICE',0,5.15,4.04,6.0,.95,P.navy,P.white);
  for(const x of [-4.3,-2.15,0,2.15,4.3]) window(b,x,6.12,4.0,1.4,.65,0,P.pale,P.glassLight);
  for(const side of [-1,1]) for(const z of [-3.5,-.7,2]) window(b,side*5.84,3.1,z,1.6,1.7,side*Math.PI/2,P.navy,P.glassLight);
  b.cyl(P.orange,5.12,5.2,4.12,.47,.09,6,Math.PI/2);
  b.box(P.navy,5.12,5.2,4.21,.15,.59,.04);b.box(P.navy,5.12,5.2,4.21,.59,.15,.04);
  b.box(P.dark,0,7.22,-.6,11.8,.2,9.3);parapet(b,11.8,9.3,7.46,P.pale,0,-.6);
  rooftopPlant(b,-3.4,7.35,-2.3,variant);
  b.box(P.stone,2.8,8.02,-2.5,2.8,1.4,2.2);
  b.cyl(P.steel,2.8,9.47,-2.5,.075,2.7,8);
  for(const y of [8.65,9.45,10.2]) b.box(P.steel,2.8,y,-2.5,1.15,.065,.065);
  for(const x of [-5.5,5.5]) b.box(P.blueLight,x,4.03,4.25,.20,.22,.18,0,0,0,.65);
  planter(b,-5.6,5.3,1.0);
  const g=b.finish();g.userData={color:wall,fragments:[wall,P.navy,P.steel,P.pale]};return g;
}

function hospital(variant) {
  const b=new Builder('Hospital — emergency canopy, red crosses and roof helipad');
  const wall=variant%2?0xd1d8cc:0xd7d4bd;
  b.box(P.stone,0,.22,0,13.8,.44,12.8);
  b.box(wall,0,4.25,-.75,10.7,8.1,8.6);
  b.box(P.pale,-5.75,2.45,-.5,2,4.5,8.9);b.box(P.pale,5.75,2.45,-.5,2,4.5,8.9);
  for(const y of [1.05,4.8,7.8]) b.box(P.blue,0,y,-.75,10.9,.24,8.8);
  windowGrid(b,10.7,8.6,[3.65,6.2],5,4,variant,P.pale,P.glassLight,-.75);
  b.box(P.pale,0,1.6,3.63,4.5,2.7,.3);door(b,0,.44,3.86,3,2.45,P.pale,true);
  b.box(P.red,0,3.23,4.77,6.9,.25,2.25);
  for(const x of [-3.25,3.25]) b.box(P.pale,x,1.78,5.7,.14,2.9,.14);
  sign(b,'EMERGENCY',0,2.91,5.9,6.75,.48,P.red,P.white);
  stairs(b,0,6.13,4.4,3);
  sign(b,'HOSPITAL',0,7.25,3.68,5.6,.78,P.blue,P.white);
  for(const side of [-1,1]) {
    cross(b,side*4.35,7.2,3.7,1.1,P.red);
    cross(b,side*6.77,3.15,-.3,1.6,P.red,side*Math.PI/2);
  }
  b.box(P.dark,0,8.38,-.75,10.9,.17,8.8);parapet(b,10.9,8.8,8.58,P.pale,0,-.75);
  b.cyl(P.steel,-1.35,8.55,-.25,2.45,.18,32);
  b.put(ring(.9,1,40),P.cream,-1.35,8.66,-.25,2.16,2.16,1,-Math.PI/2);
  for(const x of [-2.05,-.65]) b.box(P.cream,x,8.68,-.25,.26,.035,1.7);
  b.box(P.cream,-1.35,8.68,-.25,1.4,.035,.26);
  b.box(P.pale,3.3,9.12,-2.7,2.6,1.6,2.4);parapet(b,2.6,2.4,10.04,P.pale,3.3,-2.7);
  rooftopPlant(b,3.35,10.03,-2.7,variant);
  for(const x of [-4.3,0,4.3]) b.box(P.orange,x,8.67,3.52,.16,.12,.16,0,0,0,.22);
  const g=b.finish();g.userData={color:wall,fragments:[wall,P.blue,P.red,P.stone]};return g;
}

function skyscraper(variant) {
  const b=new Builder('Downtown skyscraper — stepped glass tower, terraces and antenna');
  const glass=[0x376776,0x477478,0x365367,0x56777d][variant];
  const extra=variant*1.2;
  b.box(P.stone,0,.2,0,13.3,.4,13.1);
  b.box(P.pale,0,1.6,-.45,11.7,2.8,10.8);
  for(const x of [-4.5,4.5]) b.box(P.stone,x,1.65,5.05,.7,2.9,.65);
  for(const x of [-3.1,3.1]) window(b,x,1.6,5.01,2.25,2,0,P.dark,P.glassLight);
  door(b,0,.4,5.02,2.7,2.35,P.dark,true);b.box(P.steel,0,3.14,5.3,5.4,.2,1.6);stairs(b,0,6.03,3.8,3);
  const tiers=[{w:9.8,d:8.9,bottom:3.12,top:11.5+extra},{w:8.25,d:7.3,bottom:11.5+extra,top:19.7+extra},{w:5.9,d:5.55,bottom:19.7+extra,top:24.2+extra}];
  for(const [tier,t] of tiers.entries()) {
    const middle=(t.bottom+t.top)/2,height=t.top-t.bottom;
    b.box(glass,0,middle,-.45,t.w,height,t.d);
    for(let y=t.bottom+.16;y<t.top;y+=1.6) {
      b.box(P.steel,0,y,-.45,t.w+.15,.11,t.d+.15);
      for(const side of [-1,1]) b.box(P.glassLight,0,y+.23,-.45+side*(t.d/2+.02),t.w-.18,.055,.025);
    }
    for(const x of [-.42,0,.42]) for(const side of [-1,1]) b.box(P.pale,x*t.w,middle,-.45+side*(t.d/2+.045),.15,height,.12);
    for(const z of [-.38,0,.38]) for(const side of [-1,1]) b.box(P.steel,side*(t.w/2+.045),middle,-.45+z*t.d,.12,height,.13);
    b.box(P.pale,0,t.top,-.45,t.w+.48,.2,t.d+.48);
    for(let floor=0;floor<Math.floor(height/1.6);floor++) {
      const y=t.bottom+.95+floor*1.6;
      for(let col=0;col<4;col++) if((floor+col+variant+tier)%5===0) {
        const x=(col-1.5)*t.w*.21;
        b.plane(P.warm,x,y,-.45+t.d/2+.08,t.w*.16,.92,0,0,0,.13);
        b.plane(P.warm,-x,y,-.45-t.d/2-.08,t.w*.16,.92,0,Math.PI,0,.13);
      }
    }
  }
  const top=24.2+extra;
  b.box(P.dark,0,top+.42,-.45,4.8,.66,4.45);
  rooftopPlant(b,1.05,top+.8,.5,variant);
  b.box(P.steel,-1.2,top+1.5,-1.6,1.2,1.4,1.2);
  b.cyl(P.pale,-1.2,top+3.1,-1.6,.075,2.2,8);
  b.box(P.redLight,-1.2,top+4.25,-1.6,.12,.16,.12,0,0,0,.35);
  for(const x of [-4.9,4.9]) planter(b,x,5.72,1.5);
  const g=b.finish();g.userData={color:glass,fragments:[glass,P.pale,P.steel,P.dark]};return g;
}

function warehouse(variant) {
  const b=new Builder('Industrial warehouse — loading docks and ribbed metal roof');
  const wall=[0x8a9e98,0x9a9f95,0x9b9183,0x8a9aa4][variant],metal=[0x526b70,0x626969,0x5e6973,0x637774][variant];
  b.box(P.stone,0,.2,0,13.7,.4,12.5);
  b.box(wall,0,2.9,-.6,11.6,5.4,9.5);
  for(const x of [-5.7,-2.9,0,2.9,5.7]) for(const side of [-1,1]) b.box(P.steel,x,2.9,-.6+side*4.79,.15,5.5,.15);
  roof(b,0,-.6,11.7,9.8,5.65,1.65,wall,metal,P.steel);
  for(const x of [-3.2,2.5]) {
    b.box(P.dark,x,1.9,4.2,4.25,3.4,.18);
    b.box(P.steel,x,1.9,4.31,3.95,3.15,.08);
    for(let i=0;i<10;i++) b.box(P.dark,x,.48+i*.31,4.37,3.95,.055,.04);
    for(const side of [-1,1]) b.box(P.orange,x+side*2.13,1.27,4.5,.19,1.8,.19);
  }
  sign(b,'WORKS',0,4.87,4.22,5.7,.72,metal);
  b.box(P.dark,0,.32,5.16,12.1,.22,1.68);
  for(const side of [-1,1]) for(const z of [-3.7,-.8,2.1]) window(b,side*5.85,4.1,z,2,.9,side*Math.PI/2,P.steel,P.glassLight);
  for(const z of [-3,1.8]) {b.box(P.steel,0,7.28,z,1.6,.28,1.2);b.box(P.dark,0,7.47,z,1.2,.15,.85);}
  for(const x of [-5.5,5.5]) {b.box(P.copper,x,.78,5.2,.86,.85,.8);for(const y of [.48,1.05])b.box(P.cream,x,y,5.65,.8,.07,.06);}
  const g=b.finish();g.userData={color:wall,fragments:[wall,metal,P.orange,P.stone]};return g;
}

function construction(variant) {
  const b=new Builder('Construction site — unfinished slabs, bracing and working tower crane');
  b.box(P.stone,0,.16,0,13.9,.32,13.9);
  b.box(0x786e56,0,.35,0,12.9,.10,12.9);
  const floorHeights=[.6,3.25,5.9,8.55];
  for(const [floor,y] of floorHeights.entries()) {
    b.box(0xa7a797,0,y,-.65,9.6,.24,8.8);
    for(const x of [-4.3,0,4.3]) for(const z of [-4.5,-.65,3.2]) {
      if(floor===3&&x===0&&z===-.65)continue;
      b.box(P.pale,x,y+1.25,z,.4,2.65,.4);
    }
    if(floor>0) {
      for(const x of [-4.8,4.8]) b.box(P.orange,x,y+.58,-.65,.07,1.05,8.8);
      b.box(P.orange,0,y+.58,-5.02,9.6,1.05,.07);
    }
  }
  b.box(P.stone,2.8,5.3,-2.8,2.7,9.9,3.2);
  for(const z of [-4.6,3.25]) {
    b.beam(P.steel,[-4.3,.7,z],[0,3.3,z],.11);
    b.beam(P.steel,[0,3.3,z],[4.3,5.95,z],.11);
  }
  for(let i=0;i<6;i++) b.box(P.copper,-5.5,.6+i*.12,2.1,1.0,.11,3.3);
  for(let i=0;i<3;i++) b.cyl(P.pale,5.35,.65+i*.22,-2.1,.30,2.25,10,Math.PI/2);
  // Compact tracked loader, recognisable as site machinery at street level.
  for(const side of [-1,1]) b.box(P.dark,4.85+side*.59,.67,4.75,.4,.62,2.25);
  b.box(P.orange,4.85,1.15,4.45,1.35,.62,1.8);b.box(P.dark,4.85,1.82,4.2,.9,.75,1.0);
  b.plane(P.glassLight,4.85,1.9,4.71,.72,.48);
  for(const side of [-1,1])b.beam(P.orange,[4.85+side*.5,1.25,4.8],[4.85+side*.6,.65,5.85],.15);
  b.box(P.orange,4.85,.54,6.04,1.85,.42,.7);b.box(P.dark,4.85,.79,6.1,1.6,.04,.52);
  sign(b,'SITE 0'+(variant+1),-3.9,1.2,6.45,3.4,.76,P.orange,P.ink);
  for(const x of [-6.4,0,6.4]) {b.box(P.pale,x,.65,6.6,1.1,1,.28);b.box(P.orange,x,.76,6.77,1.1,.21,.03);}
  // Tower mast is baked with the concrete structure; the jib and hook can move.
  for(const x of [-.42,.42])for(const z of [-.42,.42])b.box(P.orange,x,7.8,z,.16,15.1,.16);
  for(let y=.4;y<15;y+=1.1) {
    b.box(P.orange,0,y,0,1.0,.12,1.0);
    b.beam(P.orange,[-.42,y,.42],[.42,y+1.1,.42],.075);
    b.beam(P.orange,[.42,y,-.42],[.42,y+1.1,.42],.075);
  }
  const root=b.finish();
  const crane=new Builder('Tower crane slew');
  crane.box(P.orange,0,.2,0,1.5,.52,1.4);
  crane.box(P.dark,.7,.58,.6,1.3,1.0,.9);crane.plane(P.glassLight,.7,.65,1.06,1,.64);
  for(const z of [-.35,.35]) {
    crane.box(P.orange,.75,.6,z,11.6,.12,.12);crane.box(P.orange,.75,1.3,z,11.6,.12,.12);
    for(let x=-5.0;x<6.4;x+=.9)crane.beam(P.orange,[x,.6,z],[x+.9,1.3,z],.07);
  }
  for(let x=-5.0;x<6.5;x+=.8)crane.box(P.orange,x,1.3,0,.08,.08,.8);
  crane.box(P.stone,-4.3,.22,0,1.75,1.0,1.2);
  crane.cyl(P.steel,0,1.95,0,.07,1.2,8);
  crane.beam(P.dark,[0,2.5,0],[6.35,1.35,0],.035);
  crane.beam(P.dark,[0,2.5,0],[-4.9,1.35,0],.035);
  const pivot=crane.finish();pivot.position.y=15.25;root.add(pivot);
  const hookB=new Builder('Tower crane hook');
  hookB.box(P.orange,0,0,0,.42,.55,.30);
  hookB.cyl(P.dark,0,-.47,0,.12,.47,8);hookB.box(P.dark,.10,-.69,0,.22,.12,.12);
  const hook=hookB.finish();hook.position.set(5.5,-6.2,0);pivot.add(hook);
  const wireMaterialKey=0x2b3e45;
  if(!materials.has('wire'))materials.set('wire',new THREE.MeshLambertMaterial({color:wireMaterialKey,flatShading:true}));
  const wire=new THREE.Mesh(BOX.clone(),materials.get('wire'));wire.name='Tower crane cable';
  wire.position.set(5.5,-3.1,0);wire.scale.set(.045,6.2,.045);wire.castShadow=false;pivot.add(wire);
  root.userData={color:P.stone,fragments:[P.stone,P.pale,P.orange,P.steel],hasCrane:true};return root;
}

function wheels(b, zFront, zRear, halfWidth, radius = .37) {
  for(const side of [-1,1])for(const z of [zFront,zRear]) {
    b.cyl(P.ink,side*halfWidth,.43,z,radius,.26,12,0,0,Math.PI/2);
    b.cyl(P.steel,side*(halfWidth+.145),.43,z,radius*.55,.04,10,0,0,Math.PI/2);
  }
}
function emergencyBar(b,y,z,width=1.45) {
  b.box(P.dark,0,y,z,width+.12,.12,.46);
  b.box(P.blueLight,-width*.26,y+.16,z,width*.46,.22,.38,0,0,0,.68);
  b.box(P.redLight,width*.26,y+.16,z,width*.46,.22,.38,0,0,0,.60);
  b.box(P.pale,0,y+.15,z,.07,.24,.4);
}
function policeCar(variant) {
  const b=new Builder('Police patrol sedan — two-tone doors, light bar and bull bar');
  const paint=variant%2?0x315f79:0x274e6b;
  b.box(P.dark,0,.47,0,1.94,.3,4.34);
  b.box(paint,0,.78,0,2.05,.54,4.16);
  b.box(P.white,0,1.03,1.25,2.0,.22,1.55);b.box(P.white,0,1.02,-1.52,1.98,.22,1.1);
  b.put(CABIN,paint,0,1.37,-.25,1.88,.8,2.12);
  b.box(P.white,0,1.82,-.30,1.80,.14,1.78);
  b.box(P.glassLight,0,1.46,.68,1.7,.56,.08,-.33);
  b.box(P.glass,0,1.46,-1.245,1.7,.55,.07,.21);
  for(const side of [-1,1]) {
    b.box(P.white,side*1.04,.99,-.25,.07,.52,2.0);
    b.box(P.glassLight,side*.917,1.46,.17,.035,.48,.62,0,0,side*.094);
    b.box(P.glassLight,side*.917,1.46,-.65,.035,.48,.80,0,0,side*.094);
    b.box(P.dark,side*.915,1.46,-.17,.08,.66,.12,0,0,side*.094);
    b.box(P.dark,side*1.16,1.3,.68,.25,.18,.23);
    b.box(P.pale,side*1.09,1.12,.15,.05,.06,.18);
    lettering(b,'POLICE',side*1.085,.99,-.20,.24,P.navy,side*Math.PI/2);
  }
  wheels(b,1.34,-1.35,1.02);
  for(const side of [-1,1]) {
    b.box(P.warm,side*.72,.88,2.095,.43,.22,.08,0,0,0,.22);
    b.box(P.red,side*.75,.85,-2.11,.42,.19,.08);
    b.box(P.steel,side*.72,.66,2.27,.12,.37,.12);
  }
  b.box(P.dark,0,.86,2.12,.8,.23,.08);b.box(P.steel,0,.65,2.28,1.6,.11,.12);
  b.box(P.pale,0,.75,-2.16,.53,.18,.04);lettering(b,'07',0,.75,-2.19,.12,P.navy,Math.PI);
  emergencyBar(b,1.94,-.25);
  b.cyl(P.steel,.7,2.08,-1,.025,.85,6);
  const g=b.finish();g.userData={color:paint,fragments:[paint,P.white,P.steel,P.glass],vehicleKind:'police'};return g;
}
function ambulance(variant) {
  const b=new Builder('Ambulance — high-roof medical van with emergency markings');
  const paint=variant%2?0xdadfd2:P.white;
  b.box(P.dark,0,.47,0,2.15,.35,4.65);
  b.box(paint,0,1.54,-.56,2.18,2.06,3.28);
  b.box(P.pale,0,2.61,-.56,2.25,.14,3.36);
  b.box(paint,0,.97,1.35,2.1,.70,1.42);
  b.put(CABIN,paint,0,1.74,.95,2.1,.88,1.73);
  b.box(paint,0,2.20,.95,2.03,.18,1.62);
  b.box(P.glassLight,0,1.74,1.74,1.87,.66,.08,-.25);
  b.box(P.dark,0,.8,2.1,1.4,.29,.11);
  b.box(P.steel,0,.56,2.27,2.13,.18,.17);
  for(const side of [-1,1]) {
    b.box(P.red,side*1.105,1.17,-.56,.06,.31,3.25);
    b.box(P.glass,side*1.035,1.75,1.18,.05,.61,.72,0,0,side*.095);
    b.box(P.dark,side*1.22,1.52,1.51,.26,.25,.27);
    cross(b,side*1.13,2,-.62,.84,P.red,side*Math.PI/2);
    lettering(b,'MEDIC',side*1.14,.88,-.55,.24,P.navy,side*Math.PI/2);
    b.box(P.warm,side*.79,.95,2.1,.37,.24,.09,0,0,0,.20);
    b.box(P.red,side*.92,1.0,-2.23,.2,.48,.06);
  }
  b.box(P.steel,0,1.65,-2.21,.06,1.62,.055);
  for(const x of [-.54,.54]) {
    b.box(P.glass,x,2.09,-2.225,.69,.56,.035);
    b.box(P.steel,x*.2,1.42,-2.25,.06,.27,.08);
  }
  cross(b,0,1.04,-2.25,.6,P.red,Math.PI);
  wheels(b,1.45,-1.38,1.12,.41);emergencyBar(b,2.34,1.02,1.5);
  b.box(P.steel,0,2.75,-1.05,1.1,.22,.75);
  const g=b.finish();g.userData={color:paint,fragments:[paint,P.red,P.steel,P.glass],vehicleKind:'ambulance'};return g;
}

const makers={townhouse,apartment,shop,office,townhall,police,hospital,skyscraper,construction,warehouse};
function preparePrototype(root, kind, building) {
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
  // A foundation or apron normally centres the bounds. Recentring the finished
  // group keeps its rectangle collision correct even for asymmetrical porches.
  const center=bounds.getCenter(new THREE.Vector3());
  if(Math.abs(center.x)>.001||Math.abs(center.z)>.001) {
    for(const child of root.children){child.position.x-=center.x;child.position.z-=center.z;}
    if(root.userData.chimney){root.userData.chimney.x-=center.x;root.userData.chimney.z-=center.z;}
  }
  Object.assign(root.userData,{
    width:size.x,depth:size.z,height:bounds.max.y,isBuilding:building,
    buildingKind:building?kind:undefined,type:kind,geometryOwned:true,materialOwned:false,
  });
  root.updateMatrixWorld(true);return root;
}
function instance(prototype) {
  const root=prototype.clone(true);
  root.traverse(node=>{if(node.isMesh)node.geometry=node.geometry.clone();});
  root.userData.lightMeshes=[];
  root.traverse(node=>{if(node.isMesh&&node.userData.emergencyLight)root.userData.lightMeshes.push(node);});
  if(root.userData.hasCrane)root.userData.crane={
    pivot:root.getObjectByName('Tower crane slew'),hook:root.getObjectByName('Tower crane hook'),
    wire:root.getObjectByName('Tower crane cable'),baseDrop:6.2,
  };
  return root;
}
export function makeCityBuilding(kind='townhouse',variant=0) {
  const resolved=Object.hasOwn(makers,kind)?kind:'townhouse';
  const v=Number.isFinite(variant)?Math.abs(Math.trunc(variant))%4:0,key='building:'+resolved+':'+v;
  if(!prototypes.has(key))prototypes.set(key,preparePrototype(makers[resolved](v),resolved,true));
  return instance(prototypes.get(key));
}
export function makeCityVehicle(kind='police',variant=0) {
  const resolved=kind==='ambulance'?'ambulance':'police';
  const v=Number.isFinite(variant)?Math.abs(Math.trunc(variant))%4:0,key='vehicle:'+resolved+':'+v;
  if(!prototypes.has(key))prototypes.set(key,preparePrototype(resolved==='police'?policeCar(v):ambulance(v),resolved,false));
  return instance(prototypes.get(key));
}
