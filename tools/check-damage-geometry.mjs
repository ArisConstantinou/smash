// Offline geometry inspection; not a screenshot of GPU-rendered gameplay.
import * as T from '../vendor/three.module.js';
import {makeCityBuilding} from '../city-models.js';
import {makeProp} from '../models.js';
import {fractureObject} from '../destruction.js';
import fs from 'node:fs';
const snapshots=[];
for(const type of ['townhall','car'])for(const hp of [100,80,50,25,10]){
 const mesh=type==='car'?makeProp('car',2):makeCityBuilding(type,0),d=mesh.userData;
 const o={mesh,type,isBuilding:type!=='car',x:0,z:0,w:d.width,d:d.depth,h:d.height,seed:71,hp,maxHp:100};
 fractureObject(o,{x:4,y:1.5,z:6});mesh.updateMatrixWorld(true);
 const triangles=[];
 mesh.traverse(m=>{
  if(!m.isMesh)return;const g=m.geometry,p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color;
  const idx=g.index?.array??Array.from({length:p.count},(_,i)=>i),nm=new T.Matrix3().getNormalMatrix(m.matrixWorld);
  for(let i=0;i<idx.length;i+=3){
   const vs=[],color=new T.Color(0,0,0),normal=new T.Vector3();
   for(let j=0;j<3;j++){const k=idx[i+j];vs.push(...new T.Vector3().fromBufferAttribute(p,k).applyMatrix4(m.matrixWorld).toArray());
    color.add(c?new T.Color(c.getX(k),c.getY(k),c.getZ(k)):m.material.color);normal.add(new T.Vector3().fromBufferAttribute(n,k).applyMatrix3(nm));}
   triangles.push([...vs,...color.multiplyScalar(1/3).toArray(),...normal.normalize().toArray()]);
  }
 });snapshots.push({type,hp,triangles});
}
fs.writeFileSync(process.argv[2]||'/tmp/damage8-geometry.json',JSON.stringify(snapshots));
