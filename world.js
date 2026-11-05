import * as THREE from './vendor/three.module.js';
import { makeProp } from './models.js';

// A continuous, traversable town.  Only the ground, markings and weather are
// scenery: every solid prop in the town is registered as a destructible object.
export function createWorld(scene, { seed = 1, round = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'Ironfall district';
  scene.add(group);
  const objects = [], hazards = [], owned = new Set(), flags = [], trees = [];
  const zones = {
    rain: {id:'old-quarter', name:'ΠΑΛΙΑ ΣΥΝΟΙΚΙΑ', weather:'rain'},
    snow: {id:'frost-quarter', name:'ΠΑΓΩΜΕΝΗ ΣΥΝΟΙΚΙΑ', weather:'snow'},
    ash: {id:'foundry', name:'ΤΟ ΧΥΤΗΡΙΟ', weather:'ash'},
  };
  const regionAt = (x,z) => x < -7 && z < -7 ? zones.snow : x > 8 && z < -9 ? zones.ash : zones.rain;
  let currentZone = zones.rain;
  let state = (seed * 98771 + round * 11213) >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const range = (a, b) => a + (b - a) * random();
  const modulo = (a, b) => ((a % b) + b) % b;
  const own = v => { owned.add(v); return v; };
  const material = (color, options = {}) => own(new THREE.MeshLambertMaterial({ color, ...options }));
  const basic = (color, options = {}) => own(new THREE.MeshBasicMaterial({ color, ...options }));
  const matrix = new THREE.Matrix4(), transform = new THREE.Object3D();
  const cube = own(new THREE.BoxGeometry(1, 1, 1));
  const batches = new Map();
  const palette = {
    grass: 0x344f4b, asphalt: 0x263c43, sidewalk: 0x607275,
    curb: 0x82928d, lane: 0xc8bd83, seam: 0x3b5559,
    soil: 0x34443d, snow: 0xaec2c3, frost: 0x688c9b,
    ash: 0x484a47, metal: 0x405c62, brick: 0x746f62,
  };
  const floorMats = Object.fromEntries(Object.entries(palette).map(([k, c]) => [k, material(c)]));

  function box(mat, x, y, z, w, h, d, rotation = 0) {
    if (typeof mat === 'string') mat = floorMats[mat];
    if (!batches.has(mat)) batches.set(mat, []);
    transform.position.set(x, y, z);
    transform.rotation.set(0, rotation, 0);
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    batches.get(mat).push(transform.matrix.clone());
  }
  function flushBatches() {
    for (const [mat, matrices] of batches) {
      const mesh = new THREE.InstancedMesh(cube, mat, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    batches.clear();
  }
  function patch(x, z, rx, rz, mat, height = .018, sides = 9, roughness = .2) {
    const shape = new THREE.Shape();
    for (let i = 0; i < sides; i++) {
      const a = i / sides * Math.PI * 2;
      const r = 1 - random() * roughness;
      const px = Math.cos(a) * rx * r, pz = Math.sin(a) * rz * r;
      if (!i) shape.moveTo(px, pz); else shape.lineTo(px, pz);
    }
    shape.closePath();
    const geo = own(new THREE.ShapeGeometry(shape));
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, height, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Crossroads and four blocks, with a second circuit around the neighbourhood.
  // Broad curbs and paving sit almost flush so there are no invisible barriers.
  box('grass', 0, -.3, 0, 106, .55, 106);
  box('asphalt', 0, -.002, 0, 7.8, .045, 92);
  box('asphalt', 0, -.001, 0, 92, .045, 7.8);
  for (const side of [-1, 1]) {
    box('asphalt', side * 27.5, -.008, 0, 4.6, .04, 59.6);
    box('asphalt', 0, -.008, side * 27.5, 59.6, .04, 4.6);
    box('sidewalk', side * 5.2, .015, 0, 2.55, .06, 50.1);
    box('sidewalk', 0, .014, side * 5.2, 50.1, .06, 2.55);
    for (let z = -24; z <= 24; z += 1.18) {
      if (Math.abs(z) < 4) continue;
      box('curb', side * 3.99, .07, z, .19, .12, 1.08);
      box('curb', z, .07, side * 3.99, 1.08, .12, .19);
      box('seam', side * 5.2, .053, z + .56, 2.35, .008, .025);
      box('seam', z + .56, .053, side * 5.2, .025, .008, 2.35);
    }
    // Drains set into the gutters, not raised collisions.
    for (const p of [-21, -10, 11, 22]) {
      box('metal', side * 3.66, .03, p, .36, .025, .8);
      for (let i = 0; i < 4; i++) box('asphalt', side * 3.66, .046, p - .27 + i * .18, .33, .01, .055);
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(sx < 0 && sz < 0 ? 'frost' : sx > 0 && sz < 0 ? 'ash' : 'soil', sx * 15.6, -.005, sz * 15.6, 18.3, .04, 18.3);
    // Stepping paths through the building courtyards.
    for (let p = 7.4; p < 25; p += 1.55) {
      box('sidewalk', sx * 15.4, .026, sz * p, 1.27, .055, 1.26);
      box('sidewalk', sx * p, .026, sz * 15.4, 1.26, .055, 1.27);
    }
  }
  for (let p = -43; p <= 43; p += 5) {
    if (Math.abs(p) < 6) continue;
    box('lane', -.11, .035, p, .09, .012, 2.25);
    box('lane', .11, .035, p, .09, .012, 2.25);
    box('lane', p, .035, -.11, 2.25, .012, .09);
    box('lane', p, .035, .11, 2.25, .012, .09);
  }
  // Chipped crosswalk stripes around the central intersection.
  for (const side of [-1, 1]) for (let i = -2; i <= 2; i++) {
    box('curb', i * 1.13, .038, side * 6.5, .67, .012, 1.6);
    box('curb', side * 6.5, .038, i * 1.13, 1.6, .012, .67);
  }
  const manholeGeo = own(new THREE.CylinderGeometry(.58, .58, .045, 12));
  for (const p of [[-2,-7],[2,11],[-12,1.6],[22,-1.4],[0,31]]) {
    const m = new THREE.Mesh(manholeGeo, floorMats.metal);
    m.position.set(p[0], .035, p[1]); m.receiveShadow = true; group.add(m);
    for (let i = -2; i <= 2; i++) box('asphalt', p[0], .06, p[1]+i*.17, .7, .01, .052);
  }
  // Road repairs, little cracks, broken cobbles, and soil patches.
  const roadPatch = material(0x304950);
  const crackMat = basic(0x182f34);
  for (let i = 0; i < 32; i++) {
    let x, z;
    if (i % 2) { x = range(-2.9,2.9); z = range(-43,43); }
    else { x = range(-43,43); z = range(-2.9,2.9); }
    patch(x,z,range(.35,1.25),range(.3,.75),roadPatch,.029,6,.28);
    let cx=x-.4, cz=z;
    for(let j=0;j<3;j++) {
      const nx=cx+range(.35,.65), nz=cz+range(-.23,.23);
      box(crackMat,(cx+nx)/2,.049,(cz+nz)/2,Math.hypot(nx-cx,nz-cz),.008,.025,-Math.atan2(nz-cz,nx-cx));
      cx=nx; cz=nz;
    }
  }
  for (let i = 0; i < 150; i++) {
    const x=range(-41,41),z=range(-41,41);
    if (Math.abs(x)<6.4 || Math.abs(z)<6.4 || (Math.abs(x)>25&&Math.abs(x)<30) || (Math.abs(z)>25&&Math.abs(z)<30)) continue;
    box(i % 3 ? 'seam':'brick',x,.04,z,range(.1,.35),range(.04,.13),range(.13,.4),random()*Math.PI);
  }

  // Frozen north-west block: snow banks, powder and iced puddles.
  const snowMat=material(0xb8cccc),snowShadow=material(0x8aabb6),iceMat=material(0x658f9d,{transparent:true,opacity:.82});
  patch(-18.8,-18.4,15.8,15,snowShadow,.012,14,.17);
  patch(-19.2,-19.2,13.9,13.6,snowMat,.019,15,.22);
  for(let i=0;i<18;i++) {
    const x=range(-38,-7),z=range(-38,-7);
    if ((Math.abs(x+27.5)<2.6)||(Math.abs(z+27.5)<2.6)) continue;
    patch(x,z,range(.6,2.4),range(.5,1.8),i%4?snowMat:iceMat,.036,7,.25);
  }
  patch(-29.7,-33.4,4.9,2.3,iceMat,.045,10,.2);
  // Thin ice cracks make the frozen quarter distinct even between snowfalls.
  for(let i=0;i<7;i++) box('frost',-32+i*.75,.058,-33.1+Math.sin(i)*.5,.83,.012,.035,Math.sin(i)*.5);

  // Rain-slick puddles catch the lamps without expensive reflections.
  const puddleMat=own(new THREE.MeshPhongMaterial({color:0x4e8590,emissive:0x0c1d25,shininess:95,transparent:true,opacity:.64,depthWrite:false}));
  const puddleGlint=basic(0x83c1bb,{transparent:true,opacity:.27,depthWrite:false});
  const puddles=[];
  for(let i=0;i<21;i++) {
    let x,z;
    if(i%2){x=range(-2.8,2.8);z=range(-35,35);}
    else{x=range(-35,35);z=range(-2.8,2.8);}
    if(Math.abs(x)<3&&Math.abs(z)<3) continue;
    const rx=range(.45,1.25),rz=range(.2,.6);
    puddles.push(patch(x,z,rx,rz,puddleMat,.06,8,.25));
    patch(x-.08,z-.05,rx*.63,rz*.11,puddleGlint,.064,5,.1);
  }

  const stats = {
    house:[220,4],shop:[230,4],garage:[190,3],car:[115,2],
    wall:[85,1],crate:[38,1],barrel:[45,1],tree:[78,1],lamp:[54,1],bench:[48,1],
  };
  const fallbackDimensions={house:[4.6,4.1,4.8],shop:[5,4.4,3.7],garage:[4.8,4.3,3.3],car:[1.8,3.6,1.45],wall:[3.4,.5,1.3],crate:[1,1,1],barrel:[.85,.85,1.1],tree:[1,1,4],lamp:[.35,.35,3.8],bench:[1.8,.65,.9]};
  function addProp(type,x,z,variant=0,rotate=false) {
    const mesh=makeProp(type,variant);
    mesh.position.set(x,.065,z);
    mesh.rotation.y=rotate?Math.PI/2:0;
    const dim=fallbackDimensions[type],u=mesh.userData;
    const w=u.width||dim[0],d=u.depth||dim[1],h=u.height||dim[2];
    const hp=stats[type][0]*(1+(round-1)*.10);
    const object={mesh,type,x,z,w:rotate?d:w,d:rotate?w:d,h,hp,maxHp:hp,weight:stats[type][1],color:u.color||0x6b9b9a,dead:false,seed:random()*999};
    mesh.userData.worldObjectIndex=objects.length;
    objects.push(object); group.add(mesh);
    if(type==='tree') trees.push(object);
    return object;
  }

  // Sixteen substantial buildings leave clear lanes between their gardens.
  let buildingIndex=0;
  for(const sx of [-1,1]) for(const sz of [-1,1]) {
    for(const [ix,iz] of [[10.6,10.7],[20.1,10.7],[10.6,20],[20.1,20]]) {
      const variant=sx<0&&sz<0?3:sx>0&&sz<0?2:(buildingIndex%3);
      const type=(buildingIndex%7===1)?'shop':(buildingIndex%7===4)?'garage':'house';
      const o=addProp(type,sx*ix,sz*iz,variant,buildingIndex%4===2);
      if(sz<0&&sx<0) {
        // Snow against foundation edges.  It cannot block passage.
        patch(o.x-o.w*.38,o.z+o.d*.53,.9,.35,snowMat,.075,6,.2);
        patch(o.x+o.w*.3,o.z-o.d*.54,1.1,.34,snowMat,.075,6,.2);
      }
      buildingIndex++;
    }
  }
  for(const [i,p] of [[2.35,-19,0],[-2.35,18,0],[18,2.35,1],[-18,-2.35,1],[27.2,12,0],[-27.2,-11,0],[11,-27.3,1],[-13,27.3,1]].entries()) addProp('car',p[0],p[1],i,!!p[2]);
  for(const sx of [-1,1]) for(const sz of [-1,1]) {
    addProp('wall',sx*9.2,sz*6.5,(sx+sz+2)%3);
    addProp('wall',sx*20.4,sz*6.5,1);
    addProp('wall',sx*6.6,sz*12.2,2,true);
    addProp('wall',sx*6.6,sz*22.1,0,true);
  }
  const smallProps=[
    ['crate',5.5,-2.6],['crate',-5.5,-3.1],['barrel',5.3,3],['barrel',-5.4,2.4],
    ['crate',8.6,-15.1],['crate',9.8,-15],['barrel',22.7,-15.5],['barrel',23.8,-16],
    ['crate',-16.7,-8.2],['barrel',-17.7,-8],['crate',-22.6,-23.8],['crate',-23.7,-23.6],
    ['crate',9.8,23.5],['barrel',11,23.7],['crate',22.5,15.4],['barrel',23.5,16.2],
    ['crate',-14.7,9],['crate',-15.6,9.4],['barrel',-23.6,18],['barrel',-24,19.2],
    ['crate',32,8],['barrel',33,8.7],['crate',-33,3],['barrel',-34.1,3.5],
  ];
  smallProps.forEach((p,i)=>addProp(p[0],p[1],p[2],i%4));
  for(const [i,p] of [[-5.2,-8],[5.2,-14],[-5.2,14],[5.2,23],[-14,5.2],[14,-5.2],[-23,-5.2],[22,5.2]].entries()) addProp('lamp',p[0],p[1],i);
  for(const [i,p] of [[-5.2,21,1],[5.2,10,1],[-11,-5.2,0],[11,5.2,0]].entries()) addProp('bench',p[0],p[1],i,!!p[2]);
  for(const [i,p] of [[-8.2,17.4],[-21.9,23.4],[18.3,23.6],[23.8,9.1],[-8,-23.5],[-24.1,-17.1],[-33,-17],[-34,22],[34,19],[20,35],[-15,35],[34,-9]].entries()) addProp('tree',p[0],p[1],i%4);
  // A few ruined outer-wall segments make the edge feel like a place, not a box.
  [[-34,32],[-30,32],[31,33],[35,33],[-35,-35],[-31,-35]].forEach((p,i)=>addProp('wall',p[0],p[1],i));

  // Flags are children of destructible lamps, so destroying a pole removes its
  // cloth as well.  A real rippling mesh, not a static sign.
  const clothColors=[0xe5ad59,0x699c9f,0xb76f50];
  for(const [i,o] of objects.filter(v=>v.type==='lamp').entries()) {
    if(i%2) continue;
    const geo=own(new THREE.PlaneGeometry(1.35,.58,7,3));
    geo.translate(.7,0,0);
    const m=material(clothColors[i%3],{side:THREE.DoubleSide});
    const cloth=new THREE.Mesh(geo,m); cloth.position.set(.1,2.75,0);
    o.mesh.add(cloth);
    flags.push({object:o,mesh:cloth,base:geo.attributes.position.array.slice(),phase:random()*6});
  }

  // Foundry: exposed lava is a visible hazard.  Each bright pool has a matching
  // collision circle, while tiny orange seams between them are decorative.
  const lavaMat=basic(0xff642f),lavaHot=basic(0xffcb68),lavaCrust=material(0x283536),lavaShore=material(0x59463a);
  const lavaMeshes=[];
  const lavaPools=[[33.8,-19,2.25],[34.2,-24,2.7],[30.7,-33.5,2.9],[36.5,-30.5,2.2],[18,-34.6,1.8]];
  for(const [x,z,r] of lavaPools) {
    patch(x,z,r*1.35,r*1.25,lavaShore,.025,10,.18);
    patch(x,z,r*1.13,r*1.09,lavaCrust,.035,11,.16);
    const mesh=patch(x,z,r,r*.93,lavaMat,.048,12,.13); lavaMeshes.push(mesh);
    patch(x+.2,z-.2,r*.57,r*.54,lavaHot,.052,8,.25);
    hazards.push({x,z,r:r*.9,type:'lava',damage:19});
    for(let i=0;i<6;i++) {
      const a=random()*Math.PI*2,rr=range(.25,r*.85);
      patch(x+Math.cos(a)*rr,z+Math.sin(a)*rr,range(.12,.3),range(.12,.22),lavaCrust,.063,5,.15);
    }
  }
  for(let i=0;i<5;i++) {
    const x=33.7+Math.sin(i*2)*.5,z=-19-i*1.2;
    box(lavaMat,x,.04,z,.25,.02,1.5,Math.sin(i)*.28);
  }
  // Hazard paint telegraphs the foundry approach.
  const warning=material(0xdbac4e);
  for(let i=0;i<7;i++) box(warning,30.5+i*.6,.047,-13.4,.29,.02,1.2,-.4);

  // Small fires and ember columns have an outer orange flame, hot core, smoke,
  // and airborne sparks.  Animated instancing keeps even a busy scene cheap.
  const fires=[{x:22.8,z:-23.6,r:.9},{x:31,z:-15,r:.9},{x:-32,z:13,r:.8},{x:17.6,z:32.5,r:.95}];
  for(const f of fires) {
    patch(f.x,f.z,f.r*1.45,f.r*1.22,lavaCrust,.037,8,.15);
    hazards.push({x:f.x,z:f.z,r:f.r*.68,type:'fire',damage:11});
  }
  const flameGeo=own(new THREE.OctahedronGeometry(1,0));
  const flameOuter=basic(0xf77c34,{transparent:true,opacity:.8,depthWrite:false});
  const flameInner=basic(0xffd27b,{transparent:true,opacity:.95,depthWrite:false});
  const flameCount=fires.length*8;
  const fireMesh=new THREE.InstancedMesh(flameGeo,flameOuter,flameCount),coreMesh=new THREE.InstancedMesh(flameGeo,flameInner,fires.length*3);
  fireMesh.frustumCulled=coreMesh.frustumCulled=false;
  group.add(fireMesh,coreMesh);
  const smokeGeo=own(new THREE.IcosahedronGeometry(1,0));
  const smokeMat=basic(0x555f5b,{transparent:true,opacity:.18,depthWrite:false});
  const smokeMesh=new THREE.InstancedMesh(smokeGeo,smokeMat,fires.length*6); smokeMesh.frustumCulled=false;group.add(smokeMesh);
  const emberPositions=new Float32Array(100*3),emberBase=Array.from({length:100},()=>[random(),random(),random()]);
  const emberGeo=own(new THREE.BufferGeometry());emberGeo.setAttribute('position',new THREE.BufferAttribute(emberPositions,3));
  const emberMat=own(new THREE.PointsMaterial({color:0xffba68,size:.105,transparent:true,opacity:.86,depthWrite:false,sizeAttenuation:true}));
  const embers=new THREE.Points(emberGeo,emberMat);embers.frustumCulled=false;group.add(embers);

  // Grass blades are instanced and lean in a shared breeze.  Three blades per
  // clump keep the landscape legible at the game's classic camera distance.
  const grassGeo=own(new THREE.ConeGeometry(.11,.55,3));
  const grassMat=material(0x63806c);
  const grassLocations=[];
  for(let i=0;i<210;i++) {
    const x=range(-41,41),z=range(-41,41);
    if(Math.abs(x)<6.7||Math.abs(z)<6.7||(Math.abs(x)>25&&Math.abs(x)<30)||(Math.abs(z)>25&&Math.abs(z)<30)||(x>6&&z< -7)||(x< -6&&z< -6)) continue;
    if(objects.some(o=>Math.abs(o.x-x)<o.w*.6&&Math.abs(o.z-z)<o.d*.6))continue;
    grassLocations.push([x,z,random()*6,range(.6,1.3)]);
  }
  const grassMesh=new THREE.InstancedMesh(grassGeo,grassMat,grassLocations.length*3);grassMesh.frustumCulled=false;group.add(grassMesh);
  let grassTick=-1;

  // The weather follows the camera/player. Rain uses segments; snow and ash
  // have separate motion and colour, not the same effect with a new label.
  const weatherBase=Array.from({length:680},()=>[range(-26,26),range(0,20),range(-24,24),random()*6]);
  const rainArray=new Float32Array(680*6);
  const rainGeo=own(new THREE.BufferGeometry());rainGeo.setAttribute('position',new THREE.BufferAttribute(rainArray,3));
  const rainMat=own(new THREE.LineBasicMaterial({color:0xa5c5cc,transparent:true,opacity:.27,depthWrite:false}));
  const rainMesh=new THREE.LineSegments(rainGeo,rainMat);rainMesh.frustumCulled=false;group.add(rainMesh);
  const snowArray=new Float32Array(380*3),ashArray=new Float32Array(170*3);
  const snowGeo=own(new THREE.BufferGeometry());snowGeo.setAttribute('position',new THREE.BufferAttribute(snowArray,3));
  const ashGeo=own(new THREE.BufferGeometry());ashGeo.setAttribute('position',new THREE.BufferAttribute(ashArray,3));
  const snowParticleMat=own(new THREE.PointsMaterial({color:0xe6f3f0,size:.145,transparent:true,opacity:.83,depthWrite:false,sizeAttenuation:true}));
  const ashParticleMat=own(new THREE.PointsMaterial({color:0xf6ac6d,size:.095,transparent:true,opacity:.65,depthWrite:false,sizeAttenuation:true}));
  const snowMesh=new THREE.Points(snowGeo,snowParticleMat),ashMesh=new THREE.Points(ashGeo,ashParticleMat);
  snowMesh.frustumCulled=ashMesh.frustumCulled=false;group.add(snowMesh,ashMesh);
  snowMesh.visible=ashMesh.visible=false;

  // Painted boundary stones show the limits without creating artificial walls.
  for(let p=-40;p<=40;p+=4) for(const side of [-1,1]) {
    box('seam',side*42.2,.045,p,.2,.06,.8);
    box('seam',p,.045,side*42.2,.8,.06,.2);
  }
  flushBatches();

  function update(dt,time,player,weather) {
    const px=player?.x??player?.position?.x??0,pz=player?.z??player?.position?.z??0;
    currentZone=regionAt(px,pz);
    const mode=weather||currentZone.weather;
    const wind=Math.sin(time*.47)*.6+Math.sin(time*.13)*.4;
    rainMesh.visible=mode==='rain';snowMesh.visible=mode==='snow';ashMesh.visible=mode==='ash';
    if(rainMesh.visible) {
      for(let i=0;i<weatherBase.length;i++) {
        const a=weatherBase[i],o=i*6;
        const x=px+modulo(a[0]+time*2.9,52)-26;
        const y=modulo(a[1]-time*18,20)+.4,z=pz+a[2];
        rainArray[o]=x;rainArray[o+1]=y;rainArray[o+2]=z;
        rainArray[o+3]=x+.35+wind*.12;rainArray[o+4]=y-1.1;rainArray[o+5]=z+.12;
      }
      rainGeo.attributes.position.needsUpdate=true;
    }
    if(snowMesh.visible) {
      for(let i=0;i<380;i++) {
        const a=weatherBase[i],o=i*3;
        snowArray[o]=px+modulo(a[0]+time*.52+Math.sin(time*.8+a[3]),48)-24;
        snowArray[o+1]=modulo(a[1]-time*1.15,18)+.3;
        snowArray[o+2]=pz+a[2]+Math.sin(time*.6+a[3])*.6;
      }
      snowGeo.attributes.position.needsUpdate=true;
    }
    if(ashMesh.visible) {
      for(let i=0;i<170;i++) {
        const a=weatherBase[i],o=i*3;
        ashArray[o]=px+modulo(a[0]+time*1.4,45)-22.5;
        ashArray[o+1]=modulo(a[1]+time*.65,13)+.4;
        ashArray[o+2]=pz+a[2]*.8+Math.sin(time*.8+a[3]);
      }
      ashGeo.attributes.position.needsUpdate=true;
    }
    puddleMat.opacity=.6+Math.sin(time*1.2)*.045;
    puddleGlint.opacity=(mode==='rain'?.24:.15)+Math.sin(time*.7)*.04;
    lavaMat.color.setRGB(1,.28+Math.sin(time*2.8)*.065,.065);
    lavaHot.color.setRGB(1,.69+Math.sin(time*2.1+1)*.085,.24);
    for(const flag of flags) {
      if(flag.object.dead)continue;
      const a=flag.mesh.geometry.attributes.position,b=flag.base;
      for(let i=0;i<a.count;i++) {
        const x=b[i*3],y=b[i*3+1];
        a.array[i*3+2]=Math.sin(time*4.2-x*4.6+flag.phase+y*2)*.13*x+wind*.12*x;
      }
      a.needsUpdate=true;
    }
    for(const o of trees)if(!o.dead) {
      o.mesh.rotation.z=Math.sin(time*1.3+o.seed)*.016+wind*.012;
      o.mesh.rotation.x=Math.cos(time*.8+o.seed)*.009;
    }
    if(time-grassTick>.065) {
      grassTick=time;
      grassLocations.forEach(([x,z,phase,size],i)=>{
        for(let b=0;b<3;b++){
          transform.position.set(x+(b-1)*.13,.2*size,z+Math.sin(b*2)*.12);
          transform.rotation.set(.1*Math.sin(time*2+phase),b*2,.18*Math.sin(time*2.6+phase)+wind*.15);
          transform.scale.set(size,.9*size,size);
          transform.updateMatrix();grassMesh.setMatrixAt(i*3+b,transform.matrix);
        }
      });
      grassMesh.instanceMatrix.needsUpdate=true;
    }
    fires.forEach((f,fi)=>{
      for(let j=0;j<8;j++){
        const phase=modulo(time*.95+j*.127+fi*.1,1),a=j*2.4+fi;
        const radius=(1-phase)*f.r*.64;
        transform.position.set(f.x+Math.sin(a)*radius+wind*phase*.6,.18+phase*2.25,f.z+Math.cos(a)*radius);
        transform.rotation.set(0,time*.4+j,Math.sin(time*3+j)*.15);
        const size=(1-phase)*.46+.07;
        transform.scale.set(size,size*(1.8+Math.sin(time*8+j)*.3),size);
        transform.updateMatrix();fireMesh.setMatrixAt(fi*8+j,transform.matrix);
      }
      for(let j=0;j<3;j++){
        transform.position.set(f.x+Math.sin(time*4+j)*.12,.35+j*.23,f.z+Math.cos(j)*.15);
        transform.rotation.set(0,time,0);const s=.36-j*.07;
        transform.scale.set(s,s*(1.8+Math.sin(time*9+j)*.4),s);transform.updateMatrix();coreMesh.setMatrixAt(fi*3+j,transform.matrix);
      }
      for(let j=0;j<6;j++){
        const phase=modulo(time*.18+j/6+fi*.13,1),size=.25+phase*.8;
        transform.position.set(f.x+wind*phase*2.5+Math.sin(j+time*.4)*phase,1.2+phase*4.7,f.z+phase*.8);
        transform.rotation.set(phase*3,time*.1+j,phase);transform.scale.set(size,size*.8,size);transform.updateMatrix();smokeMesh.setMatrixAt(fi*6+j,transform.matrix);
      }
    });
    fireMesh.instanceMatrix.needsUpdate=true;coreMesh.instanceMatrix.needsUpdate=true;smokeMesh.instanceMatrix.needsUpdate=true;
    for(let i=0;i<100;i++) {
      const a=emberBase[i],f=i<60?fires[i%fires.length]:lavaPools[i%lavaPools.length];
      const fx=f.x??f[0],fz=f.z??f[1],h=modulo(a[1]+time*(.18+a[2]*.2),1);
      emberPositions[i*3]=fx+(a[0]-.5)*2+wind*h*2;
      emberPositions[i*3+1]=.2+h*(i<60?4:1.8);
      emberPositions[i*3+2]=fz+(a[2]-.5)*1.5+Math.sin(time+a[0]*5)*h*.3;
    }
    emberGeo.attributes.position.needsUpdate=true;
  }
  update(0,0,{x:0,z:0},'rain');
  return {
    group,objects,hazards,update,bounds:42,regionAt,
    get district(){return currentZone.name;},
    dispose(){scene.remove(group);for(const resource of owned)resource.dispose?.();group.clear();},
  };
}
