import * as THREE from './vendor/three.module.js';
import {DebrisRenderer} from './debris-renderer.js?v=20261108-startup1';

// Damage is monotonic and based on remaining health, not on damage per hit.
// Randomness is stable per instance: identical buildings never share holes.
export const DAMAGE_THRESHOLDS = Object.freeze([.8, .5, .25, .1, 0]);
export function damageStage(hp, maxHp) {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 1;
  const ratio = Math.max(0, hp / maxHp);
  return 1 + DAMAGE_THRESHOLDS.filter(threshold => ratio <= threshold + 1e-9).length;
}
export function damageSeed(object) {
  const text = `${object.type}:${object.plotId ?? ''}:${object.seed ?? 0}:${object.x}:${object.z}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function noise(seed, n) {
  let v = (seed ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0;
  v ^= v >>> 16; v = Math.imul(v, 0x7feb352d); v ^= v >>> 15;
  v = Math.imul(v, 0x846ca68b); v ^= v >>> 16;
  return (v >>> 0) / 4294967296;
}
const vehicle = o => o.type==='car'||o.type==='policecar'||o.type==='ambulance';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const CUBE = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const FRACTION = [0, 0, .10, .27, .46, .66, 1];
const v3 = new THREE.Vector3(), normal = new THREE.Vector3();

function insideExpandedBounds(bounds, point, margin) {
  return point.x>=bounds.min.x-margin&&point.x<=bounds.max.x+margin&&
    point.y>=bounds.min.y-margin&&point.y<=bounds.max.y+margin&&
    point.z>=bounds.min.z-margin&&point.z<=bounds.max.z+margin;
}

// Fracture only a struck object, and only on its first stage transition.
// Preserve baked batches/draw calls. Each removable piece has closed faces;
// removing a wall section exposes a darker interior rather than a paper hole.
function fractureBatch(mesh, root, cellSize, seed) {
  const original = mesh.geometry, specs = original.userData.fractureParts;
  if (!specs?.length) return null;
  const positions = [], normals = [], colors = [], parts = [];
  const p = original.attributes.position, n = original.attributes.normal, c = original.attributes.color;
  const relative = new THREE.Matrix4().multiplyMatrices(root.matrixWorld.clone().invert(), mesh.matrixWorld);
  const add = (sourceP, sourceN, sourceC, start, count, transform, tint, inside = null) => {
    const offset = positions.length / 3, localBounds = new THREE.Box3();
    const nm = transform ? new THREE.Matrix3().getNormalMatrix(transform) : null;
    const color = new THREE.Color(tint);
    for (let j = start; j < start + count; j++) {
      v3.fromBufferAttribute(sourceP, j);
      if (transform) v3.applyMatrix4(transform);
      positions.push(v3.x, v3.y, v3.z); localBounds.expandByPoint(v3);
      normal.fromBufferAttribute(sourceN, j);
      // Internal faces are shaded darker, external paint keeps its real color.
      let shade = 1;
      if (inside) {
        const a = Math.abs(normal.x) > .5 ? 0 : Math.abs(normal.y) > .5 ? 1 : 2;
        const sign = normal.getComponent(a) > 0 ? 1 : -1;
        if ((sign < 0 && inside.cell[a] > 0) || (sign > 0 && inside.cell[a] < inside.grid[a] - 1)) shade = .53;
      }
      if (nm) normal.applyMatrix3(nm).normalize();
      normals.push(normal.x, normal.y, normal.z);
      colors.push((sourceC ? sourceC.getX(j) : color.r) * shade,
        (sourceC ? sourceC.getY(j) : color.g) * shade, (sourceC ? sourceC.getZ(j) : color.b) * shade);
    }
    const bounds = localBounds.clone().applyMatrix4(relative), size = bounds.getSize(new THREE.Vector3());
    parts.push({ mesh, start:offset, count, bounds, center:bounds.getCenter(new THREE.Vector3()),
      weight:Math.max(.012, size.x * size.y * size.z),
      structural:[size.x,size.y,size.z].filter(s => s > cellSize * .38).length >= 2,
      foundation:root.userData.isBuilding && bounds.max.y < .51,
      removed:false, tint });
  };
  let specId=0;
  for (const spec of specs) {
    specId++;
    const matrix = new THREE.Matrix4().fromArray(spec.matrix);
    const scale = new THREE.Vector3().setFromMatrixScale(matrix);
    let cell = cellSize;
    let grid = [scale.x, scale.y, scale.z].map(x => Math.max(1, Math.ceil(x / cell)));
    while (grid[0]*grid[1]*grid[2] > 160) {
      cell *= 1.15; grid = [scale.x,scale.y,scale.z].map(x => Math.max(1,Math.ceil(x/cell)));
    }
    if(spec.box && !root.userData.isBuilding && scale.x>1.2 && scale.z>1.2 && scale.y>.30) {
      // Vehicles have hollow bodywork, not a solid voxel cabin. Real outer
      // panels peel away to expose the floor/frame; keep the intact silhouette.
      const thick=.075, dims=scale.toArray();
      for(let axis=0;axis<3;axis++)for(const sign of [-1,1]) {
        const panel=[1,1,1];panel[axis]=Math.min(.30,thick/dims[axis]);
        const count=axis===0?2:1; // Two side panels/doors, whole bonnet/roof.
        for(let k=0;k<count;k++) {
          const location=[0,0,0];location[axis]=sign*(.5-panel[axis]/2);
          const slab=[...panel];if(count>1){slab[2]/=count;location[2]=(k+.5)/count-.5;}
          const local=new THREE.Matrix4().makeTranslation(...location);local.scale(new THREE.Vector3(...slab));
          add(CUBE.attributes.position,CUBE.attributes.normal,null,0,CUBE.attributes.position.count,
            matrix.clone().multiply(local),spec.tint);
        }
      }
    } else if (spec.box && grid.some(x => x > 1)) {
      for(let x=0;x<grid[0];x++) for(let y=0;y<grid[1];y++) for(let z=0;z<grid[2];z++) {
        const cells=[x,y,z],lo=[],hi=[];
        for(let a=0;a<3;a++){
          const edge=k=>k===0?-.5:k===grid[a]?.5:k/grid[a]-.5+(noise(seed,specId*171+a*31+k)-.5)*.28/grid[a];
          lo[a]=edge(cells[a]);hi[a]=edge(cells[a]+1);
        }
        const local = new THREE.Matrix4().makeTranslation(...lo.map((v,a)=>(v+hi[a])/2));
        local.scale(new THREE.Vector3(...lo.map((v,a)=>hi[a]-v)));
        add(CUBE.attributes.position,CUBE.attributes.normal,null,0,CUBE.attributes.position.count,
          matrix.clone().multiply(local),spec.tint,{cell:[x,y,z],grid});
      }
    } else add(p,n,c,spec.start,spec.count,null,spec.tint);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  // Collision follows these newly subdivided solids and the same live render
  // index rewritten below. It must not keep the intact building envelope.
  geometry.userData.collisionParts=parts.map(part=>({start:part.start,count:part.count}));
  // Allocate one fixed index buffer per fractured batch. Stage changes rewrite
  // a prefix plus drawRange; replacing BufferAttributes leaks orphan GPU buffers
  // on renderers which only dispose the current index on geometry disposal.
  const vertexCount=geometry.attributes.position.count;
  const indices=new (vertexCount>65535?Uint32Array:Uint16Array)(vertexCount);
  for(let i=0;i<vertexCount;i++)indices[i]=i;
  geometry.setIndex(new THREE.BufferAttribute(indices,1).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0,vertexCount);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  mesh.geometry = geometry; original.dispose();
  return {mesh,parts,baseColors:new Float32Array(geometry.attributes.color.array)};
}
function prepare(object) {
  const root=object.mesh; root.updateWorldMatrix(true,true);
  const batches=[],seed=damageSeed(object),isVehicle=vehicle(object);
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const batch=fractureBatch(mesh,root,isVehicle?.95:2.45,seed);
    if(batch)batches.push(batch);
  });
  const parts=batches.flatMap(b=>b.parts);
  parts.forEach((part,id)=>{part.id=id;part.rankVariation=.75+noise(seed,id)*.55;part.damageRank=0;});
  if(isVehicle)for(const p of parts){
    const size=p.bounds.getSize(new THREE.Vector3()),dims=[size.x,size.y,size.z].sort((a,b)=>b-a);
    p.weight=Math.max(.06,Math.sqrt(dims[0]*dims[1]));
  }
  const bulk=parts.filter(p=>p.structural&&Math.min(...p.bounds.getSize(new THREE.Vector3()).toArray())>.32);
  if(object.isBuilding)for(const p of parts){
    if(bulk.includes(p)||p.foundation)continue;
    let nearest=.65;
    for(const support of bulk){const distance=support.bounds.distanceToPoint(p.center);if(distance<nearest){nearest=distance;p.support=support;}}
  }
  const structural=parts.filter(p=>p.structural&&!p.foundation);
  const eligible=structural.length?structural:parts.filter(p=>!p.foundation);
  return object.destruction={stage:1,seed,batches,parts,eligible,
    totalWeight:eligible.reduce((sum,p)=>sum+p.weight,0),removedIds:[],revision:0};
}
function rewriteBatches(state) {
  for(const batch of state.batches) {
    const geometry=batch.mesh.geometry,index=geometry.index;let used=0;
    const colors=geometry.attributes.color;
    for(const p of batch.parts) {
      if(p.removed)continue;
      for(let i=p.start;i<p.start+p.count;i++)index.array[used++]=i;
      const shade=1-(state.stage-1)*(.025+noise(state.seed,p.id)*.035);
      for(let i=p.start*3;i<(p.start+p.count)*3;i++)colors.array[i]=batch.baseColors[i]*shade;
    }
    geometry.setDrawRange(0,used);index.needsUpdate=true;colors.needsUpdate=true;
    // Empty meshes stay empty (also to the occlusion raycaster).
  }
  state.revision++;
}
export function fractureObject(object, point) {
  if(!object?.mesh || (!object.isBuilding&&!vehicle(object)))return null;
  const targetStage=damageStage(object.hp,object.maxHp);
  if(targetStage<2 || targetStage <= (object.destruction?.stage||1))return null;
  const state=object.destruction||prepare(object), root=object.mesh;
  root.updateWorldMatrix(true,true);
  const contact=root.worldToLocal(new THREE.Vector3(point.x,point.y??1,point.z));
  const removed=[],isVehicle=vehicle(object),attachmentMargin=isVehicle?.12:.28;
  for(let stage=state.stage+1;stage<=targetStage;stage++) {
    const variation=.90+noise(state.seed,stage+170)*.20;
    const target=state.totalWeight*Math.min(1,FRACTION[stage]*variation);
    let gone=state.eligible.filter(p=>p.removed).reduce((sum,p)=>sum+p.weight,0);
    // Most damage begins around impact, but each object/stage branches into its
    // own crack path. Do not choose a fresh random facade every render frame.
    const anchor=contact.clone();
    anchor.y=clamp(contact.y+(stage-2)*object.h*(.12+noise(state.seed,stage)*.10),.7,object.h*.85);
    anchor.x+=(noise(state.seed,stage+50)-.5)*object.w*.50;
    anchor.z+=(noise(state.seed,stage+90)-.5)*object.d*.50;
    const ranked=state.eligible.filter(p=>!p.removed);
    // Evaluate each crack-path score once, not again on every sort comparison.
    for(const part of ranked)part.damageRank=part.center.distanceToSquared(anchor)*part.rankVariation+
      (isVehicle&&stage<4&&part.center.y<.45?20:0);
    ranked.sort((a,b)=>a.damageRank-b.damageRank);
    const fresh=[];
    for(const part of ranked) {
      if(gone>=target&&stage<6)break;
      part.removed=true; fresh.push(part); removed.push(part); gone+=part.weight;
    }
    // Frames, glass, shutters and lettering attached to a removed wall leave
    // with it. This avoids floating window grids over a missing facade.
    for(const part of state.parts) {
      if(part.removed||part.foundation)continue;
      // Test the same expanded bounds directly: cloning a Box3 for every
      // decoration/hole pair generated tens of thousands of objects per hit.
      if(stage===6 || part.support?.removed || fresh.some(hole=>insideExpandedBounds(hole.bounds,part.center,attachmentMargin))) {
        part.removed=true;removed.push(part);
      }
    }
    state.stage=stage;
  }
  state.removedIds.push(...removed.map(p=>p.id));
  rewriteBatches(state);
  return {state,removed,stage:state.stage,vehicle:vehicle(object)};
}

// Actual detached model pieces, bounded independently of tiny dust particles.
// Rubble is cosmetic and does not create new invisible player/pickup obstacles.
export class DestructionSystem {
  constructor(scene,{audio=null,nearObjects=()=>[],quality='high',onDust=()=>{}}={}) {
    this.scene=scene;this.audio=audio;this.nearObjects=nearObjects;this.onDust=onDust;
    this.limit=quality==='low'?44:quality==='medium'?72:108;
    this.group=new THREE.Group();this.group.name='Detached architectural and vehicle parts';scene.add(this.group);
    this.material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true});
    this.renderer=new DebrisRenderer(this.group,this.material,this.limit);
    this.debris=[];this.alarms=new Map();this.time=0;this.disposed=false;
  }
  warm(){this.renderer.geometry.setDrawRange(0,3);}
  reset(){
    for(const object of [...this.alarms.keys()])this.stopAlarm(object);
    while(this.debris.length)this.removeDebris(0);
    this.renderer.sync([]);this.renderer.geometry.setDrawRange(0,0);this.time=0;
    this.audio?.stopEnvironment?.();
  }
  hit(object,point,listener) {
    if(this.disposed)return null;
    if(vehicle(object)&&object.hp>0)this.alarm(object);
    if(object.hp<=0)this.stopAlarm(object);
    const event=fractureObject(object,point);
    if(!event)return null;
    const distance=Math.hypot(object.x-(listener?.x??object.x),object.z-(listener?.z??object.z));
    const gain=1/(1+(distance/22)**2);
    const name=event.stage===6?(event.vehicle?'carWreck':'buildingCollapse'):(event.vehicle?'carTear':'buildingFracture');
    this.audio?.play(name,gain,{stage:event.stage,variant:event.state.seed%3});
    this.release(object,event.removed,point,event.stage);
    this.onDust(point,event.stage===6?2.6:event.vehicle?.65:1.3);
    return event;
  }
  alarm(object) {
    let entry=this.alarms.get(object);
    if(!entry) {
      if(this.alarms.size>=16)this.stopAlarm(this.alarms.keys().next().value);
      const seed=damageSeed(object);
      const lights=[];
      object.mesh.traverse(mesh=>{
        if(!mesh.isMesh)return;
        for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
          if((material.userData.originalEmissive??material.emissive)?.getHex()&&material.emissiveIntensity>0&&!lights.some(l=>l.material===material))
            lights.push({material,base:material.userData.baseEmissiveIntensity??material.emissiveIntensity});
        }
      });
      entry={until:0,next:this.time,variant:seed%3,seed,lights};this.alarms.set(object,entry);
    }
    // Renew this emitter rather than layering another infinite siren per hit.
    entry.until=this.time+6.5+noise(entry.seed,15)*2;
  }
  stopAlarm(object) {
    const entry=this.alarms.get(object);if(!entry)return;
    for(const light of entry.lights)light.material.emissiveIntensity=light.base;
    this.audio?.stopEnvironment?.(entry.seed);
    this.alarms.delete(object);
  }
  release(object,parts,point,stage) {
    const groups=new Map(),transforms=new Map(),isVehicle=vehicle(object),cell=isVehicle?1.2:2.8;
    object.mesh.updateWorldMatrix(true,true);
    for(const part of parts) {
      const k=[part.center.x,part.center.y,part.center.z].map(x=>Math.floor(x/cell)).join(',');
      let group=groups.get(k);
      if(!group){group={parts:[],weight:0,count:0};groups.set(k,group);}
      group.parts.push(part);group.weight+=part.weight;group.count+=part.count;
    }
    // Evict old rubble first. A huge collapse has a deterministic piece cap.
    const groupsToShow=[...groups.values()].sort((a,b)=>b.weight-a.weight).slice(0,stage===6?32:14);
    for(const group of groupsToShow) {
      // The vertex count is already known. Write the final float buffers once
      // instead of growing/copying three temporary JavaScript number arrays.
      const positions=new Float32Array(group.count*3),normals=new Float32Array(group.count*3),colors=new Float32Array(group.count*3);
      let offset=0;
      for(const part of group.parts) {
        const g=part.mesh.geometry,p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color;
        let transform=transforms.get(part.mesh);
        if(!transform){const matrix=part.mesh.matrixWorld;transform={matrix,nm:new THREE.Matrix3().getNormalMatrix(matrix)};transforms.set(part.mesh,transform);}
        const {matrix,nm}=transform;
        for(let i=part.start;i<part.start+part.count;i++) {
          v3.fromBufferAttribute(p,i).applyMatrix4(matrix);positions[offset]=v3.x;positions[offset+1]=v3.y;positions[offset+2]=v3.z;
          normal.fromBufferAttribute(n,i).applyMatrix3(nm).normalize();normals[offset]=normal.x;normals[offset+1]=normal.y;normals[offset+2]=normal.z;
          colors[offset]=c.getX(i);colors[offset+1]=c.getY(i);colors[offset+2]=c.getZ(i);offset+=3;
        }
      }
      if(!positions.length)continue;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
      geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
      geometry.computeBoundingBox();const center=geometry.boundingBox.getCenter(new THREE.Vector3());
      const size=geometry.boundingBox.getSize(new THREE.Vector3());geometry.translate(-center.x,-center.y,-center.z);geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,this.material);mesh.position.copy(center);mesh.castShadow=true;mesh.receiveShadow=true;
      // This mesh remains the exact physical pose/geometry record. Its vertices
      // render through one rigidly skinned batch instead of 108 separate draws.
      const id=group.parts[0].id,seed=object.destruction.seed;
      const direction=new THREE.Vector3(center.x-object.x,0,center.z-object.z);
      if(direction.lengthSq()<.01)direction.set(point.x-object.x,0,point.z-object.z);
      if(direction.lengthSq()<.01)direction.set(1,0,0);direction.normalize();
      const speed=(isVehicle?2.1:1.4)+noise(seed,id+260)*3.0;
      this.debris.push({mesh,source:object,vx:direction.x*speed,vz:direction.z*speed,vy:1+noise(seed,id+310)*3,
        spin:(noise(seed,id+380)-.5)*3.4,radius:clamp(Math.min(size.x,size.z)*.35,.09,.95),
        halfY:Math.max(.06,size.y*.40),life:12+noise(seed,id+460)*7,settled:false,sounded:false,metal:isVehicle});
      while(this.debris.length>this.limit)this.removeDebris(0);
    }
  }
  removeDebris(index) {
    const [part]=this.debris.splice(index,1);if(!part)return;
    part.mesh.removeFromParent();part.mesh.geometry.dispose();
  }
  update(dt,listener={x:0,z:0},{active=true}={}) {
    if(this.disposed)return;
    if(!active||dt<=0){this.renderer.sync(this.debris);return;}
    dt=Math.min(.1,dt);this.time+=dt;
    const audible=[];
    for(const [object,alarm] of this.alarms) {
      if(object.dead||object.hp<=0||alarm.until<=this.time){this.stopAlarm(object);continue;}
      const blink=Math.sin(this.time*14+alarm.variant)>0;
      for(const light of alarm.lights)light.material.emissiveIntensity=blink?Math.max(1.7,light.base*2.8):.04;
      const distance=Math.hypot(object.x-listener.x,object.z-listener.z);
      if(distance<34)audible.push({object,alarm,distance});
    }
    audible.sort((a,b)=>a.distance-b.distance);
    for(const {object,alarm,distance} of audible.slice(0,3)) {
      if(alarm.next>this.time)continue;
      alarm.next=this.time+[.36,.48,.60][alarm.variant];
      this.audio?.play('carAlarm',.52/(1+(distance/12)**2),{variant:alarm.variant,id:alarm.seed});
    }
    for(let i=this.debris.length-1;i>=0;i--) {
      const part=this.debris[i],p=part.mesh.position;part.life-=dt;
      if(part.life<=0){this.removeDebris(i);continue;}
      part.mesh.scale.setScalar(Math.min(1,part.life/1.5));
      if(part.settled&&part.support){
        if(part.support.dead){part.settled=false;part.support=null;}
        else {p.x+=part.support.x-part.supportX;p.z+=part.support.z-part.supportZ;part.supportX=part.support.x;part.supportZ=part.support.z;}
      }
      if(part.settled)continue;
      for(let remaining=dt;remaining>1e-8;) {
        const step=Math.min(1/60,remaining);remaining-=step;
        const oldY=p.y-part.halfY;part.vy-=12*step;
        p.x+=part.vx*step;p.z+=part.vz*step;p.y+=part.vy*step;
        let floor=.075,support=null;
        for(const obstacle of this.nearObjects(p.x,p.z,part.radius+1)) {
          if(obstacle===part.source||obstacle.dead)continue;
          const dx=p.x-obstacle.x,dz=p.z-obstacle.z;
          const inX=Math.abs(dx)<obstacle.w/2+part.radius,inZ=Math.abs(dz)<obstacle.d/2+part.radius;
          const top=(obstacle.baseY??.065)+obstacle.h;
          if(!inX||!inZ)continue;
          if(oldY>=top-.08&&p.y-part.halfY<top){if(top>floor){floor=top;support=obstacle;}}
          else if(p.y-part.halfY<top&&p.y+part.halfY>.075) {
            const ox=obstacle.w/2+part.radius-Math.abs(dx),oz=obstacle.d/2+part.radius-Math.abs(dz);
            if(ox<oz){p.x+=Math.sign(dx||1)*ox;part.vx*=-.25;}else{p.z+=Math.sign(dz||1)*oz;part.vz*=-.25;}
          }
        }
        if(p.y-part.halfY<=floor) {
          p.y=floor+part.halfY;
          if(!part.sounded&&Math.abs(part.vy)>1.5) {
            part.sounded=true;const distance=Math.hypot(p.x-listener.x,p.z-listener.z);
            if(distance<32)this.audio?.play('debrisLand',.55/(1+(distance/15)**2),{material:part.metal?'metal':'masonry'});
          }
          part.vy=Math.abs(part.vy)*.18;part.vx*=.6;part.vz*=.6;part.spin*=.6;
          if(part.vy<.5){part.settled=true;part.support=support;part.supportX=support?.x;part.supportZ=support?.z;}
        }
        part.mesh.rotation.x+=part.spin*step;part.mesh.rotation.z+=part.spin*.6*step;
      }
    }
    this.renderer.sync(this.debris);
  }
  dispose() {
    if(this.disposed)return;this.disposed=true;
    this.reset();
    this.renderer.dispose();this.group.removeFromParent();this.material.dispose();
  }
}
