import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {geometrySupport,geometryCeiling,moveOnGeometry,invalidateGeometry} from '../geometry-collision.js';
import {makeCityBuilding} from '../city-models.js';
const close=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function structure(parts){const mesh=new T.Group();for(const [x,y,z,w,h,d]of parts){const part=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshBasicMaterial());part.position.set(x,y,z);mesh.add(part);}return {x:0,z:0,w:20,d:20,h:12,mesh,baseY:0,baseRotation:new T.Euler(),solid:true,dead:false};}
test('one building exposes distinct roof, awning and upper-tier heights instead of one bounding-box top',()=>{
 const o=structure([[0,3,0,4,6,4],[0,2,3,4,.2,2],[0,4.5,-3,3,.2,2]]);
 close(geometrySupport([o],0,3,10),2.1);close(geometrySupport([o],0,-3,10),4.6);close(geometrySupport([o],0,0,10),6);
 close(geometrySupport([o],7,7,20),0);close(geometrySupport([o],0,3,1.8),0);
});
test('a genuine gap in an L-shaped building is traversable despite being inside its overall box',()=>{
 const o=structure([[0,2,0,1,4,8],[3.5,2,-3.5,6,4,1]]),p={x:2,y:0,z:2};
 moveOnGeometry(p,3,0,[o]);close(p.x,5);close(p.y,0);close(p.z,2);
 moveOnGeometry(p,-8,0,[o]);assert.ok(p.x>=.94-1e-4,'The real perpendicular wall still blocks travel');
});
test('high-speed dash cannot tunnel through a thin authored wall',()=>{
 const o=structure([[0,2,0,.08,4,6]]),p={x:-3,y:0,z:0};moveOnGeometry(p,6,0,[o]);assert.ok(p.x<-.47);close(p.z,0);
});
test('an overhang allows walking below it and stops an upward head crossing at its underside',()=>{
 const o=structure([[0,3,0,5,.3,5]]),p={x:-4,y:0,z:0};moveOnGeometry(p,8,0,[o]);close(p.x,4);
 close(geometryCeiling([o],0,0,2.7,3.1),2.85);assert.equal(geometryCeiling([o],7,0,2.7,4),Infinity);
 close(geometrySupport([o],0,0,4),3.15);
});
test('sloped surfaces return actual interpolated height',()=>{
 const o=structure([]),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([-2,0,-2,-2,0,2,2,2,2,-2,0,-2,2,2,2,2,2,-2],3));o.mesh.add(new T.Mesh(g,new T.MeshBasicMaterial()));
 close(geometrySupport([o],0,0,5,0),1);close(geometrySupport([o],1,0,5,0),1.5);
});
test('removing rendered fracture indices removes both support and invisible walls',()=>{
 const o=structure([[0,1,0,4,2,4]]);close(geometrySupport([o],0,0,10),2);
 o.mesh.children[0].geometry.setIndex([]);o.destruction={revision:1};close(geometrySupport([o],0,0,10),0);
 const p={x:-4,y:0,z:0};moveOnGeometry(p,8,0,[o]);close(p.x,4);
});
test('moved vehicles invalidate stable triangle locations without preserving ghost obstacles',()=>{
 const o=structure([[0,.6,0,2,1.2,4]]);close(geometrySupport([o],0,0,3),1.2);
 o.x=8;o.mesh.position.x=8;close(geometrySupport([o],0,0,3),0);close(geometrySupport([o],8,0,3),1.2);
});
test('cosmetic object shudder cannot move the physical support and render culling does not remove it',()=>{
 const o=structure([[0,2,0,3,4,3]]);o.mesh.visible=false;o.mesh.position.y=.25;o.mesh.rotation.z=.03;
 close(geometrySupport([o],0,0,10),4);o.mesh.children[0].visible=false;invalidateGeometry(o);close(geometrySupport([o],0,0,10),0);
});
test('support uses the full foot disk, then falls only after it clears the visible edge',()=>{
 const o=structure([[0,2,0,4,4,4]]);close(geometrySupport([o],2.35,0,4,.44),4);close(geometrySupport([o],2.45,0,4,.44),0);
 const p={x:2.35,y:4,z:0};moveOnGeometry(p,0,0,[o]);close(p.x,2.35);close(p.y,4);
});
test('a falling character cannot mantle or snap up through a roof from below',()=>{
 const o=structure([[0,2,0,4,4,4]]),p={x:2.5,y:3.96,z:0};moveOnGeometry(p,-2,0,[o],.44,1.78,{stepHeight:0});close(p.y,3.96);assert.ok(p.x>2.43);
});
test('the authored shop has multiple reachable surface heights rather than a single collider height',()=>{
 const mesh=makeCityBuilding('shop',0),box=new T.Box3().setFromObject(mesh),size=box.getSize(new T.Vector3());
 const o={x:0,z:0,h:size.y,w:size.x,d:size.z,mesh,baseY:0,baseRotation:new T.Euler()};
 const heights=new Set();for(let x=box.min.x;x<=box.max.x;x+=.35)for(let z=box.min.z;z<=box.max.z;z+=.35){const y=geometrySupport([o],x,z,30,.1);if(y>.1)heights.add(Math.round(y*5)/5);}
 assert.ok(heights.size>=4,`Expected several tiers in real authored shop; got ${[...heights]}`);
});
