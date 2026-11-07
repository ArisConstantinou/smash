// An illustrated, textured ground decal, not a cursor or a targeting control.
// +Z is forward. Geometry/UVs are reused; only the small ground grid is updated.
export function throwIndicatorLayout({origin, direction, meleeRange = 2.75, throwRange = 10}) {
  const size = Math.hypot(direction?.x || 0, direction?.z || 0);
  if (!origin || !Number.isFinite(size) || size < 1e-7) return null;
  const dx = direction.x / size, dz = direction.z / size;
  const start = Math.max(.5, meleeRange) + .32;
  const length = Math.max(1.6, Math.min(4.5, throwRange - start));
  const width = Math.max(1.25, Math.min(1.9, length * .40));
  return {x: origin.x + dx * start, z: origin.z + dz * start,
    y: origin.y || 0, dx, dz, start, length, width, yaw: Math.atan2(dx, dz)};
}

export function createThrowIndicator(THREE, image) {
  const rows = 10, positions = new Float32Array((rows + 1) * 2 * 3);
  const uv = new Float32Array((rows + 1) * 2 * 2);
  for (let row = 0; row <= rows; row++) for (let side = 0; side < 2; side++) {
    const vertex = row * 2 + side;
    uv[vertex * 2] = side; uv[vertex * 2 + 1] = row / rows;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  let disposed = false;
  const ready = () => { if (!disposed) { texture.needsUpdate = true; mesh.userData.textureReady = true; } };
  const material = new THREE.MeshBasicMaterial({map: texture, transparent: true, opacity: .94,
    side: THREE.DoubleSide, depthTest: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'throw-ground-arrow'; mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3;
  mesh.userData.noCollision = true; mesh.userData.textureReady = false;
  image?.addEventListener?.('load', ready);
  if (image?.complete && image.naturalWidth > 0) ready();
  let stamp = '', lastGroundTime = -Infinity;
  function update({active = false, origin, direction, meleeRange, throwRange, time = 0, holding = false, heightAt} = {}) {
    const layout = active ? throwIndicatorLayout({origin, direction, meleeRange, throwRange}) : null;
    mesh.visible = !!layout;
    if (!layout) { stamp = ''; return; }
    mesh.userData.layout = layout;
    mesh.position.set(layout.x, layout.y, layout.z);
    mesh.rotation.y = layout.yaw;
    mesh.scale.set(layout.width, 1, layout.length);
    // Bright in BOTH modes; holding gets a restrained pulse, not a range bonus.
    material.opacity = holding ? .94 + Math.sin(time * 5) * .055 : .94;
    const key = [layout.x,layout.z,layout.y,layout.yaw,layout.width,layout.length].map(n=>n.toFixed(4)).join(':');
    if (key === stamp && time - lastGroundTime < .05) return;
    stamp = key; lastGroundTime = time;
    for (let row = 0; row <= rows; row++) for (let side = 0; side < 2; side++) {
      const x = side - .5, z = row / rows, i = (row * 2 + side) * 3;
      const worldX = layout.x + layout.dx * z * layout.length + layout.dz * x * layout.width;
      const worldZ = layout.z + layout.dz * z * layout.length - layout.dx * x * layout.width;
      const ground = heightAt?.(worldX, worldZ);
      positions[i] = x; positions[i + 1] = (Number.isFinite(ground) ? ground : layout.y) - layout.y + .075;
      positions[i + 2] = z;
    }
    const indices = [];
    for (let row = 0; row < rows; row++) {
      const a = row * 2, b = a + 1, c = a + 2, d = a + 3;
      const heights = [a,b,c,d].map(v=>positions[v*3+1]);
      // Don't stretch the picture vertically down a roof edge or across a wall.
      if (Math.max(...heights) - Math.min(...heights) <= .65) indices.push(a,c,b,b,c,d);
    }
    geometry.setIndex(indices); geometry.attributes.position.needsUpdate = true;
  }
  function dispose() {
    disposed = true; image?.removeEventListener?.('load', ready);
    geometry.dispose(); material.dispose(); texture.dispose(); mesh.removeFromParent();
  }
  return {mesh, update, dispose};
}
