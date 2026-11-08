import * as THREE from './vendor/three.module.js';
import { makeProp } from './models.js?v=20261108-grip1';
import { makeCityBuilding, makeCityVehicle } from './city-models.js?v=20261107-damage8';
import { createCityLayout, cityRegionAt, CITY_BOUNDS, CITY_SPACING, CITY_ROAD_WIDTH } from './city-layout.js?v=20261107-cities10';
import { createCityNavigation } from './city-navigation.js?v=20261107-forge9';
import { createGeometryCollision } from './geometry-collision.js?v=20261107-perf14';

// All solid buildings, vehicles and street furniture share the same damage and
// collision registry. Only ground markings, weather and cloth are scenery.
export function createWorld(scene, { seed = 1, round = 1, city = null } = {}) {
  const group = new THREE.Group(); group.name = 'Ironfall city'; scene.add(group);
  const objects=[], hazards=[], owned=new Set(), sharedModelMaterials=new Set(), flags=[], trees=[], cranes=[], emergencyVehicles=[];
  const layout=createCityLayout(seed,city), regionAt=city?((x,z)=>({...cityRegionAt(x,z),weather:city.weather})):cityRegionAt;
  let currentZone=regionAt(0,0), disposed=false;
  let state=(seed*98771+round*11213)>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const range=(a,b)=>a+(b-a)*random(), modulo=(a,b)=>((a%b)+b)%b;
  const own=v=>{owned.add(v);return v;};
  const material=(color,options={})=>own(new THREE.MeshLambertMaterial({color,...options}));
  const basic=(color,options={})=>own(new THREE.MeshBasicMaterial({color,...options}));
  const transform=new THREE.Object3D(), cube=own(new THREE.BoxGeometry(1,1,1));
  const chunks=new Map(), batches=new Map(), chunkSize=44;
  const palette={grass:0x344f4b,asphalt:0x263c43,sidewalk:0x647679,curb:0x8a9992,lane:0xc8bd83,seam:0x405b5f,soil:0x35473f,snow:0xb9cdce,frost:0x7094a2,ash:0x484c49,metal:0x405c62,brick:0x746f62};
  if(city)Object.assign(palette,{grass:city.ground,soil:city.ground,ash:city.ground,sidewalk:city.stone,curb:city.stone});
  const floorMats=Object.fromEntries(Object.entries(palette).map(([k,c])=>[k,material(c)]));
  function chunkFor(x,z){
    const cx=Math.floor(x/chunkSize),cz=Math.floor(z/chunkSize),key=`${cx},${cz}`;
    if(!chunks.has(key)){
      const mesh=new THREE.Group();mesh.name=`City ground ${key}`;group.add(mesh);
      chunks.set(key,{mesh,x:(cx+.5)*chunkSize,z:(cz+.5)*chunkSize});
    }
    return chunks.get(key);
  }
  function box(mat,x,y,z,w,h,d,rotation=0){
    const kind=typeof mat==='string'?mat:'wear';
    if(typeof mat==='string')mat=floorMats[mat];
    const chunk=chunkFor(x,z),key=`${chunk.mesh.uuid}:${mat.uuid}`;
    if(!batches.has(key))batches.set(key,{mat,chunk,matrices:[],surfaces:[]});
    transform.position.set(x,y,z);transform.rotation.set(0,rotation,0);transform.scale.set(w,h,d);transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
    batches.get(key).surfaces.push({kind,top:y+h/2,bottom:y-h/2,paint:kind==='lane'||kind==='seam'||kind==='wear'||(kind==='curb'&&h<.02)});
  }
  function flushBatches(){
    for(const {mat,chunk,matrices,surfaces} of batches.values()){
      const mesh=new THREE.InstancedMesh(cube,mat,matrices.length);
      mesh.userData.groundSurfaces=surfaces;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.receiveShadow=true;mesh.computeBoundingSphere();chunk.mesh.add(mesh);
    }
    batches.clear();
  }
  function patch(x,z,rx,rz,mat,height=.018,sides=9,roughness=.2){
    const shape=new THREE.Shape();
    for(let i=0;i<sides;i++){
      const a=i/sides*Math.PI*2,r=1-random()*roughness,px=Math.cos(a)*rx*r,pz=Math.sin(a)*rz*r;
      if(!i)shape.moveTo(px,pz);else shape.lineTo(px,pz);
    }
    shape.closePath();const geo=own(new THREE.ShapeGeometry(shape));geo.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,height,z);mesh.receiveShadow=true;
    if(!mat.transparent)mesh.userData.groundSurface={kind:'patch',bottom:height-.04};
    chunkFor(x,z).mesh.add(mesh);return mesh;
  }

  // A continuous street grid connects every block and the outer ring road.
  const ground=new THREE.Mesh(own(new THREE.PlaneGeometry(260,260)),floorMats.grass);
  ground.rotation.x=-Math.PI/2;ground.position.y=-.04;ground.receiveShadow=true;group.add(ground);
  ground.userData.groundSurface={kind:'grass',bottom:-.14};
  for(const road of layout.roads) for(let i=0;i<10;i++){
    const center=(i-4.5)*CITY_SPACING;
    box('asphalt',road,-.005,center,CITY_ROAD_WIDTH,.045,CITY_SPACING);
    box('asphalt',center,-.004,road,CITY_SPACING,.045,CITY_ROAD_WIDTH);
    for(const dash of [-6,-2,2,6]){
      box('lane',road,.032,center+dash,.105,.01,1.75);
      box('lane',center+dash,.032,road,1.75,.01,.105);
    }
  }
  for(const p of layout.plots){
    const climate=regionAt(p.x,p.z).weather;
    const terrain=climate==='snow'?'frost':climate==='ash'?'ash':'soil';
    box('sidewalk',p.x,.008,p.z,15.2,.055,15.2);
    box(terrain,p.x,.04,p.z,13.4,.018,13.4);
    for(const side of [-1,1]){
      box('curb',p.x+side*7.56,.063,p.z,.14,.09,15.15);
      box('curb',p.x,.063,p.z+side*7.56,15.15,.09,.14);
      for(const seam of [-5,0,5]){
        box('seam',p.x+side*7.07,.041,p.z+seam,.8,.008,.035);
        box('seam',p.x+seam,.041,p.z+side*7.07,.035,.008,.8);
      }
    }
    // Civic forecourts and construction warning stripes belong to their lot.
    if(p.kind==='townhall'||p.kind==='police'||p.kind==='hospital'){
      box(p.kind==='townhall'?'brick':'sidewalk',p.x,.052,p.z,14.9,.02,14.9);
      for(const offset of [-6.8,6.8])box('lane',p.x+offset,.069,p.z,.09,.012,12.6);
    }
    if(p.kind==='construction')for(let i=0;i<9;i++)box('lane',p.x-5.8+i*1.4,.07,p.z+7.1,.65,.015,.5,-.5);
  }
  // Walkways on the outside of the ring road leave the whole city reachable.
  for(const side of [-1,1]){
    box('sidewalk',side*115.2,.016,0,3.1,.05,230.5);
    box('sidewalk',0,.016,side*115.2,230.5,.05,3.1);
  }
  for(const rx of layout.roads)for(const rz of layout.roads){
    if(Math.abs(rx)>88||Math.abs(rz)>88||(Math.abs(rx)+Math.abs(rz)>1&&((rx/22+rz/22)%2)))continue;
    for(const side of [-1,1])for(let i=-2;i<=2;i++){
      box('curb',rx+i*1.1,.037,rz+side*4.8,.64,.01,1.1);
      box('curb',rx+side*4.8,.037,rz+i*1.1,1.1,.01,.64);
    }
  }
  const roadPatch=material(0x304950),crackMat=basic(0x182f34);
  for(let i=0;i<65;i++){
    const road=layout.roads[Math.floor(random()*layout.roads.length)],along=range(-106,106);
    const x=i%2?road+range(-2.6,2.6):along,z=i%2?along:road+range(-2.6,2.6);
    patch(x,z,range(.35,1.2),range(.3,.7),roadPatch,.029,6,.25);
    box(crackMat,x,.048,z,1.1,.008,.025,random()*Math.PI);
  }
  const manholeGeo=own(new THREE.CylinderGeometry(.5,.5,.035,12));
  for(let i=0;i<22;i++){
    const x=layout.roads[i%11]+1.5,z=(Math.floor(i/11)*2-1)*((i%5)*22+10);
    const mesh=new THREE.Mesh(manholeGeo,floorMats.metal);mesh.position.set(x,.039,z);chunkFor(x,z).mesh.add(mesh);
    for(let j=-2;j<=2;j++)box('asphalt',x,.06,z+j*.15,.62,.008,.035);
  }
  const snowMat=material(0xb8cccc),snowShadow=material(0x8aabb6),iceMat=material(0x658f9d,{transparent:true,opacity:.82});
  for(const p of layout.plots.filter(p=>regionAt(p.x,p.z).weather==='snow')){
    patch(p.x,p.z,7.2,7.2,snowShadow,.05,12,.08);
    patch(p.x,p.z,6.9,6.9,snowMat,.057,12,.13);
    patch(p.x+6.1,p.z-5.2,.9,1.6,iceMat,.067,8,.2);
  }
  const puddleMat=own(new THREE.MeshPhongMaterial({color:0x4e8590,emissive:0x0c1d25,shininess:95,transparent:true,opacity:.64,depthWrite:false}));
  const puddleGlint=basic(0x83c1bb,{transparent:true,opacity:.27,depthWrite:false});
  for(let i=0;i<60;i++){
    const road=layout.roads[Math.floor(random()*layout.roads.length)],along=range(-105,105);
    const x=i%2?road+range(-2.7,2.7):along,z=i%2?along:road+range(-2.7,2.7);
    if(regionAt(x,z).weather!=='rain')continue;
    const rx=range(.45,1.25),rz=range(.2,.6);patch(x,z,rx,rz,puddleMat,.06,8,.25);patch(x-.08,z-.05,rx*.63,rz*.11,puddleGlint,.064,5,.1);
  }

  const stats={townhouse:[480,4],apartment:[680,5],shop:[520,4],office:[760,5],townhall:[1100,7],police:[900,6],hospital:[1000,6],skyscraper:[1400,9],construction:[700,5],warehouse:[620,5],car:[260,2],policecar:[300,2],ambulance:[320,2],wall:[160,1],crate:[44,1],barrel:[60,1],hydrant:[100,1],tree:[90,1],lamp:[70,1],bench:[65,1]};
  const fallbackDimensions={car:[1.8,3.6,1.45],wall:[3.4,.6,1.3],crate:[1,1,1],barrel:[.85,.85,1.1],tree:[.68,.68,4.45],lamp:[.45,.45,3.8],bench:[1.8,.7,1]};
  const spatial=new Map(),spatialCell=22;
  const bucketKey=(x,z)=>`${x},${z}`;
  function indexObject(o){
    o.spatialKeys=[];
    const x0=Math.floor((o.x-o.w/2)/spatialCell),x1=Math.floor((o.x+o.w/2)/spatialCell),z0=Math.floor((o.z-o.d/2)/spatialCell),z1=Math.floor((o.z+o.d/2)/spatialCell);
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
      const key=bucketKey(x,z);if(!spatial.has(key))spatial.set(key,[]);spatial.get(key).push(o);o.spatialKeys.push(key);
    }
  }
  function nearObjects(x,z,r,{includeDead=false}={}){
    const found=[],seen=new Set(),radius=Math.max(0,r);
    for(let bz=Math.floor((z-radius)/spatialCell);bz<=Math.floor((z+radius)/spatialCell);bz++)for(let bx=Math.floor((x-radius)/spatialCell);bx<=Math.floor((x+radius)/spatialCell);bx++){
      for(const o of spatial.get(bucketKey(bx,bz))||[]){
        if(seen.has(o)||(!includeDead&&o.dead))continue;seen.add(o);
        const dx=Math.max(0,Math.abs(x-o.x)-o.w/2),dz=Math.max(0,Math.abs(z-o.z)-o.d/2);
        if(dx*dx+dz*dz<=radius*radius)found.push(o);
      }
    }
    return found;
  }
  function canPlace(x,z,w,d,margin=.24){
    if(Math.abs(x)+w/2>CITY_BOUNDS-1||Math.abs(z)+d/2>CITY_BOUNDS-1)return false;
    return !nearObjects(x,z,Math.hypot(w,d)/2+margin).some(o=>Math.abs(o.x-x)<(o.w+w)/2+margin&&Math.abs(o.z-z)<(o.d+d)/2+margin);
  }
  function register(mesh,type,x,z,rotation=0,plot=null){
    mesh.position.set(x,.065,z);mesh.rotation.y=rotation;
    mesh.traverse(node=>{if(node.material)for(const mat of Array.isArray(node.material)?node.material:[node.material])sharedModelMaterials.add(mat);});
    const u=mesh.userData,dim=fallbackDimensions[type]||[12,12,8],swap=Math.abs(Math.sin(rotation))>.5;
    const width=u.width||dim[0],depth=u.depth||dim[1],h=u.height||dim[2],hp=stats[type][0]*(1+(round-1)*.08);
    const o={mesh,type,x,z,w:swap?depth:width,d:swap?width:depth,h,hp,maxHp:hp,weight:stats[type][1],color:u.color||0x6b9b9a,dead:false,seed:random()*999,isBuilding:!!plot,buildingKind:plot?.kind,districtId:plot?.districtId||regionAt(x,z).id,plotId:plot?.id,label:plot?.label};
    o.collisionAnchor={y:mesh.position.y,quaternion:mesh.quaternion.clone()};
    o.geometryHit=(start,end,radius=0)=>collision.geometryHit(o,start,end,radius);
    mesh.userData.worldObjectIndex=objects.length;objects.push(o);group.add(mesh);indexObject(o);
    if(type==='tree')trees.push(o);
    if(u.crane)cranes.push(o);
    if(u.lightMeshes?.length)emergencyVehicles.push(o);
    return o;
  }
  function addProp(type,x,z,variant=0,rotation=0){return register(makeProp(type,variant),type,x,z,rotation);}
  const buildingObjects=[];
  for(const plot of layout.plots){
    const o=register(makeCityBuilding(plot.kind,plot.variant),plot.kind,plot.x,plot.z,plot.rotation,plot);buildingObjects.push(o);
    const landmark=layout.landmarks.find(v=>v.id===plot.id);if(landmark){landmark.object=o;landmark.w=o.w;landmark.d=o.d;}
  }
  // Cars occupy a single kerb lane. Alternate frontages prevent opposing rows
  // from narrowing a road, and the centre of every junction remains clear.
  let carIndex=0;
  const parkedSegments=new Set();
  const parkingPlots=[...layout.plots].sort((a,b)=>Number(['police','hospital'].includes(b.kind))-Number(['police','hospital'].includes(a.kind)));
  for(const p of parkingPlots){
    if(p.row%2===1&&p.col%2===1&&!['police','hospital'].includes(p.kind))continue;
    const sx=Math.sin(p.rotation),sz=Math.cos(p.rotation),streetX=p.x+sx*11,streetZ=p.z+sz*11;
    const segment=Math.abs(sx)>.5?`v:${Math.round(streetX)}:${p.z}`:`h:${p.x}:${Math.round(streetZ)}`;
    if(parkedSegments.has(segment))continue;
    parkedSegments.add(segment);
    const vehicleKind=p.kind==='police'?'policecar':p.kind==='hospital'?'ambulance':'car';
    const rotation=p.rotation+Math.PI/2,carX=streetX-sx*2.35,carZ=streetZ-sz*2.35;
    const positions=vehicleKind==='car'?[0]:[-3.3,3.3];
    for(const shift of positions){
      const x=carX+sz*shift,z=carZ-sx*shift;
      const w=Math.abs(Math.sin(rotation))>.5?4.5:2.2,d=Math.abs(Math.sin(rotation))>.5?2.2:4.5;
      if(!canPlace(x,z,w,d,.35))continue;
      const mesh=vehicleKind==='car'?makeProp('car',carIndex++):makeCityVehicle(vehicleKind,carIndex++);
      register(mesh,vehicleKind,x,z,rotation);
      // Painted bays show why vehicles occupy this side of the street.
      for(const side of [-1,1])box('curb',x+sz*side*2.5,.044,z-sx*side*2.5,Math.abs(sz)>.5?.055:2.3,.008,Math.abs(sz)>.5?2.3:.055);
    }
  }
  // Furniture and garden details use free corners, not the walking corridor.
  for(const [i,p] of layout.plots.entries()){
    const corners=[[-6.65,-6.65],[6.65,-6.65],[-6.65,6.65],[6.65,6.65]];
    const available=corners.filter(([dx,dz])=>canPlace(p.x+dx,p.z+dz,.7,.7,.22));
    if(available.length){
      const [dx,dz]=available[i%available.length];addProp(i%3===0?'lamp':'tree',p.x+dx,p.z+dz,p.variant);
    }
    if(['construction','warehouse'].includes(p.kind)){
      for(const [j,[dx,dz]]of corners.entries())if(canPlace(p.x+dx,p.z+dz,1.1,1.1,.28))addProp(j%2?'barrel':'crate',p.x+dx,p.z+dz,j);
    }else if(i%2===0){
      const x=p.x,z=p.z+6.8;
      if(canPlace(x,z,1.84,.7,.2))addProp('bench',x,z,p.variant);
    }
    // Short garden walls leave wide openings on all four street frontages.
    if(p.kind==='townhouse'){
      const x=p.x-6.8,z=p.z+2.9;
      if(canPlace(x,z,.6,3.4,.25))addProp('wall',x,z,p.variant,Math.PI/2);
    }
  }
  // Local smashable supplies make the opening streets rewarding before the
  // player has upgraded enough to level the civic buildings.
  for(const [i,[x,z]]of [[-2.7,-6],[2.7,6],[-6,2.7],[6,-2.7],[-2.7,9],[2.7,-9],[-9,-2.7],[9,2.7]].entries()){
    if(canPlace(x,z,1.05,1.05,.2))addProp(i%2?'barrel':'crate',x,z,i);
  }
  // Curb corners, outside crosswalks and walking corridors. Side outlets run
  // along the frontage instead of pointing through the adjacent building.
  for(const [i,p]of layout.plots.entries())if(i%3===0){
    const x=p.x+5.8,z=p.z+7.25;
    if(canPlace(x,z,1,.65,.22))addProp('hydrant',x,z,p.variant);
  }
  if(canPlace(-5.7,-8.1,1,.65,.22))addProp('hydrant',-5.7,-8.1);
  for(const rx of layout.roads)for(const rz of layout.roads){
    if(Math.abs(rx)>88||Math.abs(rz)>88||(Math.abs(rx)+Math.abs(rz)<20)||((rx+rz)/22)%2)continue;
    const x=rx+2.65,z=rz+5.2;
    if(canPlace(x,z,1.05,1.05,.2))addProp((Math.round(rx/22)%3)?'crate':'barrel',x,z,Math.abs(Math.round(rz/22))%4);
  }
  // Outer parks have trees and low ruined walls without closing the ring road.
  for(let p=-99;p<=99;p+=22)for(const side of [-1,1]){
    if(regionAt(side*115,p).weather!=='ash'&&canPlace(side*115,p,.7,.7,.4))addProp('tree',side*115,p,(p+99)/22%4);
    if(p%3&&canPlace(p,115,3.4,.6,.4))addProp('wall',p,115,2);
  }

  // Flags are children of destructible lamps, so destroying a pole removes its
  // cloth as well.  A real rippling mesh, not a static sign.
  const clothColors=[0xe5ad59,0x699c9f,0xb76f50];
  for(const [i,o] of objects.filter(v=>v.type==='lamp').entries()) {
    if(i%2) continue;
    const geo=own(new THREE.PlaneGeometry(1.35,.58,7,3));
    geo.translate(.7,0,0);
    const m=material(clothColors[i%3],{side:THREE.DoubleSide});
    const cloth=new THREE.Mesh(geo,m); cloth.position.set(.1,2.75,0);
    cloth.userData.noCollision=true;
    o.mesh.add(cloth);
    flags.push({object:o,mesh:cloth,base:geo.attributes.position.array.slice(),phase:random()*6});
  }

  // Foundry: exposed lava is a visible hazard.  Each bright pool has a matching
  // collision circle, while tiny orange seams between them are decorative.
  const lavaMat=basic(0xff642f),lavaHot=basic(0xffcb68),lavaCrust=material(0x283536),lavaShore=material(0x59463a);
  const lavaMeshes=[];
  const lavaPools=city&&city.weather!=='ash'?[]:[[115,-77,1.55],[115,-99,1.6],[77,-115,1.6],[99,-115,1.7],[55,-115,1.45]];
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
  for(let i=0;i<(lavaPools.length?5:0);i++) {
    const x=114.7+Math.sin(i*2)*.2,z=-78-i*1.2;
    box(lavaMat,x,.04,z,.25,.02,1.5,Math.sin(i)*.28);
  }
  // Hazard paint telegraphs the foundry approach.
  const warning=material(0xdbac4e);
  for(let i=0;i<7;i++) box(warning,112.8+i*.5,.047,-71.4,.29,.02,1.2,-.4);

  // Small fires and ember columns have an outer orange flame, hot core, smoke,
  // and airborne sparks.  Animated instancing keeps even a busy scene cheap.
  const fires=[{x:2.7,z:-13,r:.55},{x:115,z:-55,r:.8},{x:66,z:-115,r:.85},{x:-115,z:44,r:.7},{x:77,z:115,r:.85},{x:110.2,z:-44,r:.65}];
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
  for(const p of layout.plots) {
    if(regionAt(p.x,p.z).weather!=='rain')continue;
    for(let i=0;i<8;i++) {
      const x=p.x+range(-7.1,7.1),z=p.z+range(-7.1,7.1);
      if(nearObjects(x,z,.4).length)continue;
      grassLocations.push([x,z,random()*6,range(.6,1.3)]);
    }
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

  // Boundary paint leaves an open outside pavement instead of solid walls.
  for(let p=-114;p<=114;p+=6)for(const side of [-1,1]) {
    box('seam',side*117.6,.045,p,.2,.06,.8);
    box('seam',p,.045,side*117.6,.8,.06,.2);
  }
  flushBatches();
  const navigation=createCityNavigation({objects,nearObjects,bounds:CITY_BOUNDS});
  const collision=createGeometryCollision({nearObjects,bounds:CITY_BOUNDS});
  function updateVisibility(player,camera) {
    const px=player?.x??player?.position?.x??0,pz=player?.z??player?.position?.z??0;
    // The camera looks over the player: keep enough skyline beyond the view.
    const viewRadius=76;
    for(const o of objects) {
      const visible=!o.dead&&Math.hypot(o.x-px,o.z-pz)<viewRadius+Math.min(20,o.h*.6);
      o.mesh.visible=visible;o.renderActive=visible;
    }
    for(const chunk of chunks.values())chunk.mesh.visible=Math.hypot(chunk.x-px,chunk.z-pz)<viewRadius+chunkSize*.72;
  }
  function rebuildSpatialIndex(){spatial.clear();objects.forEach(indexObject);navigation.invalidateNavigation();}
  function relocateObject(o,x,z,invalidate=true){
    if(!o||o.dead||![x,z].every(Number.isFinite))return false;
    for(const key of o.spatialKeys||[]){
      const bucket=spatial.get(key);if(!bucket)continue;
      const i=bucket.indexOf(o);if(i>=0)bucket.splice(i,1);
      if(!bucket.length)spatial.delete(key);
    }
    o.x=x;o.z=z;o.mesh.position.x=x;o.mesh.position.z=z;indexObject(o);
    if(invalidate)navigation.invalidateNavigation();return true;
  }


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
      if(flag.object.dead||!flag.object.mesh.visible)continue;
      const a=flag.mesh.geometry.attributes.position,b=flag.base;
      for(let i=0;i<a.count;i++) {
        const x=b[i*3],y=b[i*3+1];
        a.array[i*3+2]=Math.sin(time*4.2-x*4.6+flag.phase+y*2)*.13*x+wind*.12*x;
      }
      a.needsUpdate=true;
    }
    for(const o of trees)if(!o.dead&&o.mesh.visible) {
      o.mesh.rotation.z=Math.sin(time*1.3+o.seed)*.016+wind*.012;
      o.mesh.rotation.x=Math.cos(time*.8+o.seed)*.009;
    }
    for(const o of cranes)if(!o.dead&&o.mesh.visible) {
      const crane=o.mesh.userData.crane;crane.pivot.rotation.y+=dt*.10;
      const drop=crane.baseDrop+Math.sin(time*.7+o.seed)*.5;
      crane.hook.position.y=-drop;crane.wire.scale.y=drop;crane.wire.position.y=-drop/2;
    }
    for(const o of emergencyVehicles)if(!o.dead&&o.mesh.visible) {
      o.mesh.userData.lightMeshes.forEach((light,i)=>{
        for(const mat of Array.isArray(light.material)?light.material:[light.material])mat.emissiveIntensity=Math.sin(time*8+i*Math.PI)>.1?1.25:.2;
      });
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
      const a=emberBase[i],f=i<60||!lavaPools.length?fires[i%fires.length]:lavaPools[i%lavaPools.length];
      const fx=f.x??f[0],fz=f.z??f[1],h=modulo(a[1]+time*(.18+a[2]*.2),1);
      emberPositions[i*3]=fx+(a[0]-.5)*2+wind*h*2;
      emberPositions[i*3+1]=.2+h*(i<60?4:1.8);
      emberPositions[i*3+2]=fz+(a[2]-.5)*1.5+Math.sin(time+a[0]*5)*h*.3;
    }
    emberGeo.attributes.position.needsUpdate=true;
  }
  // Ground markings, facade pieces, parked-car panels and effect containers
  // keep their authored local transforms. Rebuilding these matrices on every
  // render AND swept-collision query wastes CPU during dense destruction.
  // World matrices still follow parents normally. Keep every gameplay root
  // and every animated crane joint live; geometry/instance-buffer animation
  // (flags, rain, grass, flames) does not depend on local matrix recomposition.
  const movingTransforms=new Set(objects.map(o=>o.mesh));
  for(const o of objects)for(const cap of o.mesh.userData.caps||[])movingTransforms.add(cap);
  for(const o of cranes){const c=o.mesh.userData.crane;movingTransforms.add(c.pivot);movingTransforms.add(c.hook);movingTransforms.add(c.wire);}
  group.traverse(node=>{if(!movingTransforms.has(node)){node.updateMatrix();node.matrixAutoUpdate=false;}});
  updateVisibility({x:0,z:0});
  update(0,0,{x:0,z:0},'rain');
  return {
    city,group,objects,hazards,update,updateVisibility,nearObjects,rebuildSpatialIndex,relocateObject,
    supportHeight:collision.supportHeight,supportSurface:collision.support,ceilingHeight:collision.ceilingHeight,
    moveBody:collision.moveBody,clearBody:collision.clearBody,collisionDiagnostics:collision.diagnostics,
    bounds:CITY_BOUNDS,regionAt,layout,districts:layout.districts,landmarks:layout.landmarks,
    buildingCount:buildingObjects.length,buildingObjects,
    getChaseDirection:navigation.getChaseDirection,
    hasLineOfSight:navigation.hasLineOfSight,
    invalidateNavigation:navigation.invalidateNavigation,
    get district(){return currentZone.name;},
    dispose(){
      if(disposed)return;disposed=true;scene.remove(group);
      // Models share immutable prototype materials. Gameplay replaces them with
      // per-instance hit-flash materials; dispose those current render resources.
      const resources=new Set(owned);
      group.traverse(node=>{
        if(node.geometry)resources.add(node.geometry);
        if(node.material)for(const mat of Array.isArray(node.material)?node.material:[node.material])if(!sharedModelMaterials.has(mat))resources.add(mat);
      });
      for(const resource of resources)resource.dispose?.();
      group.clear();spatial.clear();sharedModelMaterials.clear();navigation.invalidateNavigation();collision.clear();
    },
  };
}
