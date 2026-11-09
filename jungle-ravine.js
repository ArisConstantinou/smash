import * as THREE from './vendor/three.module.js';
import {createGeometryCollision} from './geometry-collision.js?v=ravine1';
import {createCityNavigation} from './city-navigation.js?v=20261107-forge9';
import {createJungleWildlife,macawPerches} from './jungle-wildlife.js?v=fauna1';

export const RAVINE_ID='jungle-ravine';
const bounds=72, west=0, east=10, waterY=-.65, riverbed=-1.25;
const bridgeZ=0, bridgeWidth=3.2, logZ=-6.3, logWidth=2.1, stonesZ=7;
const inRiver=x=>x>west&&x<east;
const zone={id:RAVINE_ID,name:'ΦΑΡΑΓΓΙ ΤΗΣ ΖΟΥΓΚΛΑΣ',weather:'clear'};
const arrival={id:'jungle-entry',name:'ΜΟΝΟΠΑΤΙ ΤΗΣ ΖΟΥΓΚΛΑΣ',weather:'clear',x:-38,z:35};
const falls={id:'jungle-falls',name:'ΟΙ ΚΑΤΑΡΡΑΚΤΕΣ',weather:'clear',x:-7,z:-43};
const grove={id:'jungle-grove',name:'ΞΕΦΩΤΟ ΤΗΣ ΑΓΡΙΑΣ ΖΩΗΣ',weather:'clear',x:33,z:26};
const gate={id:'jungle-gate',name:'Η ΠΕΤΡΙΝΗ ΠΥΛΗ',weather:'clear',x:53,z:51};
const trails=[
  [[-38,35],[-29,32],[-22,22],[-15,15],[-7,10],[-5,2],[-5,-8],[-10,-18],[-13,-29],[-7,-43],[-11,-55]],
  [[-5,-6.3],[0,-6.3]], [[-5,0],[0,0]], [[-7,7],[0,7]],
  [[10,-6.3],[16,-6],[25,-13],[25,-24],[17,-37],[11,-43]],
  [[10,0],[17,0],[23,7],[28,17],[33,26],[39,33],[43,43],[53,51],[59,57]],
  [[10,7],[18,8],[23,7]], [[28,17],[38,11],[48,17],[47,27],[39,33]],
];
const segments=trails.flatMap(path=>path.slice(1).map(([bx,bz],i)=>{
  const [ax,az]=path[i],dx=bx-ax,dz=bz-az;return {ax,az,dx,dz,length:dx*dx+dz*dz};
}));
function trailDistance(x,z){
  let nearest=Infinity;
  for(const {ax,az,dx,dz,length} of segments){
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/length));
    nearest=Math.min(nearest,(x-ax-dx*t)**2+(z-az-dz*t)**2);
  }
  return Math.sqrt(nearest);
}
function regionAt(x,z){
  if(x>44&&z>38)return gate;
  if(x>18&&z>14)return grove;
  if(z< -23)return falls;
  if(x< -15&&z>13)return arrival;
  return zone;
}

export function createJungleRavine(scene){
  const group=new THREE.Group();group.name=zone.name;scene.add(group);
  const objects=[], terrain=[], resources=new Set();
  const own=value=>{resources.add(value);return value;};
  const material=color=>own(new THREE.MeshLambertMaterial({color,flatShading:true}));
  const cube=own(new THREE.BoxGeometry(1,1,1));
  const rock=own(new THREE.DodecahedronGeometry(1));
  const leaves=own(new THREE.IcosahedronGeometry(1,1));
  const timber=own(new THREE.CylinderGeometry(.75,1,1,8));
  const bark=material(0x694733), grain=material(0x81583c), basalt=material(0x516369);
  const foliageMaterial=own(new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true}));
  const fallingTrees=[];
  const fallAxis=new THREE.Vector3();
  const boards=[0x9a6940,0xb17e4d,0x94603a,0xa87444].map(material);
  const iron=material(0x46514d);
  let randomState=49731;
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  const chunks=new Map(),matrix=new THREE.Object3D(),point=new THREE.Vector3();
  function chunk(x,z){
    const key=`${Math.floor(x/18)},${Math.floor(z/18)}`;
    if(!chunks.has(key))chunks.set(key,{positions:[],colors:[]});
    return chunks.get(key);
  }
  function paint(geometry,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0,buffer=null){
    const {positions,colors}=buffer??chunk(x,z);
    matrix.position.set(x,y,z);matrix.rotation.set(rx,ry,rz);matrix.scale.set(sx,sy,sz);matrix.updateMatrix();
    const p=geometry.attributes.position,index=geometry.index,count=index?.count??p.count;
    const tint=new THREE.Color(color);
    for(let i=0;i<count;i+=3){
      const shade=range(.88,1.08);
      for(let j=i;j<i+3;j++){
        point.fromBufferAttribute(p,index?index.getX(j):j).applyMatrix4(matrix.matrix);
        positions.push(point.x,point.y,point.z);colors.push(tint.r*shade,tint.g*shade,tint.b*shade);
      }
    }
  }
  function patchColor(x,z){
    const lanes=x<0?[[-5,0,3.9,11],[-2,-6.3,3.9,1.8],[-2,0,4.3,1.9],[-2,7,3.8,1.9]]:
      [[15,0,3.9,11],[13,-6.3,4.4,1.8],[13,0,4.4,1.9],[13,7,4.4,1.9],[18,-2,6.5,5.8]];
    let distance=2;
    for(const [px,pz,w,d] of lanes)distance=Math.min(distance,Math.hypot((x-px)/w,(z-pz)/d));
    const detail=Math.sin(x*3.9+z*1.7)*Math.cos(z*3.1-x*1.4), patches=Math.sin(x*.81+z*.21)*Math.cos(z*.72-x*.17);
    const alongTrail=(2.15-trailDistance(x,z))*.45;
    const clearing=.82-Math.hypot((x+34)/8.6,(z-32)/6.7);
    const dirt=THREE.MathUtils.smoothstep(Math.max(1-distance,alongTrail,clearing)+.19*patches,-.19,.32);
    const grass=new THREE.Color(0x435638).lerp(new THREE.Color(0x627347),.47+.28*patches+.19*detail);
    const clay=new THREE.Color(0x9b7044).lerp(new THREE.Color(0xc39759),.58+.23*patches+.16*detail);
    return grass.lerp(clay,dirt);
  }
  function bank(from,to){
    for(let x=from;x<to;x+=2)for(let z=-86;z<86;z+=2){
      const {positions,colors}=chunk(x,z),x1=Math.min(to,x+2),z1=z+2;
      for(const [px,pz] of [[x,z],[x,z1],[x1,z1],[x,z],[x1,z1],[x1,z]]){
        const c=patchColor(px,pz);positions.push(px,0,pz);colors.push(c.r,c.g,c.b);
      }
    }
  }
  function box(parent,mat,x,y,z,w,h,d){
    const mesh=new THREE.Mesh(cube,mat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function solid(root,type,x,z,w,d,h,hp=null){
    root.position.set(x,0,z);group.add(root);
    const o={mesh:root,type,x,z,w,d,h,hp,maxHp:hp,dead:false,weight:1,color:0xa87444,seed:random()*1000,baseY:0};
    o.collisionAnchor={y:0,quaternion:root.quaternion.clone()};
    o.geometryHit=(from,to,radius)=>collision.geometryHit(o,from,to,radius);
    (hp===null?terrain:objects).push(o);return o;
  }

  // Both dry banks share the city floor datum. The shallow river has a lower floor.
  const ground=own(new THREE.PlaneGeometry(1,1));
  bank(-86,west);bank(east,86);
  const pathGeometry=own(new THREE.CircleGeometry(1,14));
  for(let z=-81;z<=81;z+=18){
    paint(ground,0x274e4b,5,riverbed,z,10,18,1,-Math.PI/2);
    for(const x of [west,east])paint(cube,0x344b4d,x+(x===west?-.1:.1),-.61,z,.2,1.22,18);
  }
  for(const x of [west,east])for(let z=-82;z<=82;z+=1.08){
    if([bridgeZ,logZ,stonesZ].some(lane=>Math.abs(lane-z)<2.1))continue;
    paint(rock,0x435a5d,x+(x===west?-.22:.22),-.44,z,range(.45,.85),range(.45,.76),range(.63,.94),0,range(0,6));
  }
  const water=box(group,material(0x18726e),5,waterY-.025,0,10,.05,172);water.castShadow=false;
  for(let i=0;i<640;i++){
    const x=range(.12,9.88),z=range(-84,84);
    const shallow=x<1.3||x>8.7;
    const tint=shallow?(i%3===0?0x74b3a0:0x468d80):(i%9===0?0x549f93:i%3===0?0x2c8d84:0x226f6d);
    paint(pathGeometry,tint,x,waterY+.006,z,range(.027,shallow?.16:.43),range(.12,1.08),1,-Math.PI/2,0,range(-.15,.15));
  }
  // Angular rocks and a spillway give the channel an upstream landmark.
  for(let i=0;i<12;i++){
    const x=.5+i*.82;
    paint(rock,i%3===0?0x536662:0x3f5555,x,-.1,-16.4,range(.72,1.2),range(.5,1.05),range(.67,1.2),.03,range(0,6));
    const crest=x>2&&x<8;
    if(crest)paint(cube,i%2?0x61b3ab:0x9bd0bf,x,.02,-15.74,range(.31,.68),range(.9,1.17),.072,.11,0,.035);
    paint(pathGeometry,0x7ab5a6,x,waterY+.017,-15.1,range(.24,.52),range(.26,.73),1,-Math.PI/2);
  }
  for(const [z,crest] of [[-46,3.2],[-42,1.8],[-38,.8]]){
    for(let i=0;i<13;i++){
      const x=i*.84;
      paint(rock,[0x3d5152,0x485b5c,0x546964][i%3],x,crest*.32-.5,z,1.1,crest*.56+1.1,1.35,.07,i*.63);
      if(i>1&&i<11){
        const color=[0x79bfb4,0xa4d7c5,0x4b938b][i%3];
        paint(cube,color,x,crest*.43-.31,z+1.1,.73+range(0,.27),crest*.86+.66,.12,-.2,0,.035);
        paint(pathGeometry,0x7bb9ac,x,waterY+.022,z+1.8,.68,range(.55,1.3),1,-Math.PI/2);
      }
    }
  }
  // Hardwood deck, stringers and fasteners share the damage and contact object.
  const deck=new THREE.Group();deck.userData.fragments=[0xb98a52,0x7d5332,0xd2a571];
  for(let i=0;i<25;i++){
    const x=(i-12)*.413;
    box(deck,boards[i%boards.length],x,.025,0,.407,.17,bridgeWidth);
    for(const z of [-1.37,1.37])box(deck,iron,x,.11,z,.065,.021,.07).userData.noCollision=true;
  }
  for(const z of [-1.08,1.08])box(deck,bark,0,-.09,z,10.4,.16,.24);
  const bridge=solid(deck,'bridge',5,bridgeZ,10.35,bridgeWidth,.13,155);
  // The low stone abutments and wood piles stay after the deck has collapsed.
  for(const x of [.3,3.45,6.55,9.7])for(const z of [-1.34,1.34]){
    paint(rock,0x4b5c56,x,-.86,z,.53,.42,.48,0,range(0,6));
    paint(cube,0x694a33,x,-.46,z,.23,.92,.24);
  }
  for(const x of [-.35,10.35])for(const z of [-1.71,1.71]){
    paint(cube,0x8a6745,x,.42,z,.31,.84,.34);
    paint(cube,0xb39365,x,.85,z,.34,.065,.38);
  }

  const log=new THREE.Group();
  const crossSection=new THREE.Shape();
  for(const [i,[z,y]] of [[-1.05,-.22],[-.82,.16],[-.49,.23],[.59,.23],[.89,.14],[1.05,-.19],[.62,-.54],[-.64,-.56]].entries()){
    if(i===0)crossSection.moveTo(-z,y);else crossSection.lineTo(-z,y);
  }
  crossSection.closePath();
  const logGeometry=own(new THREE.ExtrudeGeometry(crossSection,{depth:10.7,bevelEnabled:false}));
  logGeometry.rotateY(Math.PI/2);logGeometry.translate(-5.35,0,0);
  const wood=new THREE.Mesh(logGeometry,bark);wood.castShadow=true;wood.receiveShadow=true;log.add(wood);
  solid(log,'fallen-log',5,logZ,10.7,logWidth,.23);
  for(let i=0;i<46;i++){
    const x=range(-.28,10.27),z=logZ+range(-.42,.48);
    paint(pathGeometry,[0x657a37,0x526735,0x765536,0x557a38][i%4],x,.234+i*.00009,z,range(.12,.7),range(.07,.19),1,-Math.PI/2,0,range(-.12,.12));
    if(i%3===0)paint(cube,0x9c7144,x,.241,z,range(.14,1.18),.006,range(.013,.032));
  }
  for(const [x,z,angle] of [[-.62,-6.9,.58],[-.65,-5.84,-.64],[-.92,-6.48,.21],[10.51,-6.84,-.46],[10.68,-5.94,.39]])
    paint(rock,0x65452e,x,.1,z,.84,.35,.25,0,angle,-.12);
  for(const x of [.65,3.5,6.5,9.35]){
    const stone=new THREE.Group();
    const geo=own(new THREE.CylinderGeometry(.63,.79,.93,7));
    const mesh=new THREE.Mesh(geo,basalt);mesh.position.y=-.34;mesh.castShadow=true;mesh.receiveShadow=true;stone.add(mesh);
    solid(stone,'river-stone',x,stonesZ,1.58,1.58,.13);
    paint(pathGeometry,0x65753e,x,.129,stonesZ,.49,.46,1,-Math.PI/2);
  }

  function tree(x,z,height,reach,detail=false){
    const girth=reach*.19;
    const buffer={positions:[],colors:[]};
    const tx=0,tz=0;
    paint(timber,0x624635,tx,height*.47,tz,girth,height*.96,girth,0,0,.045,buffer);
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5+.15;
      const dx=Math.cos(a),dz=Math.sin(a);
      paint(rock,0x604637,tx+dx*.65,.38,tz+dz*.65,1.58,.83,.32,0,-a,-.22,buffer);
      paint(timber,0x624635,tx+dx*.74,height*.77,tz+dz*.74,.24,height*.42,.25,-dz*.48,0,dx*.48,buffer);
      for(let j=0;j<3;j++){
        const offset=j*.24+.32;
        paint(detail||Math.hypot(x,z)<35?leaves:roughLeaves,[0x315637,0x3c6438,0x54793b,0x6f8f47][(i+j)%4],tx+dx*reach*offset,height+range(-.74,.55),tz+dz*reach*offset,reach*range(.39,.66),range(.47,.83),reach*range(.35,.57),.08,a,range(-.16,.16),buffer);
      }
    }
    const collisionTree=new THREE.Group();
    const trunk=new THREE.Mesh(timber,bark);trunk.position.y=height*.47;trunk.scale.set(girth,height*.96,girth);trunk.rotation.z=.045;
    trunk.visible=false;collisionTree.add(trunk);
    const trunkObject=solid(collisionTree,'jungle-trunk',x,z,girth*2+.4,girth*2,height,85);
    trunkObject.trunkRadius=girth;
    const geometry=own(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(buffer.positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(buffer.colors,3));geometry.computeVertexNormals();
    const crown=new THREE.Mesh(geometry,foliageMaterial);crown.userData.noCollision=true;crown.castShadow=detail;collisionTree.add(crown);
  }
  const roughLeaves=own(new THREE.IcosahedronGeometry(1,0));
  for(const [x,z,h,w] of [[-10,-9,7.9,3.5],[-5,-12,6.9,3.4],[-13,1,7.6,3.5],[-17,-6,8,3.8],[13,-12,8.6,3.5],[20,-10,8.8,3.7],[24,4,7.5,3.4],[21,13,8.1,3.7],[14,14,6.8,3.4],[-7,15,7,3.4],[-19,13,8.1,3.8],[17,-20,8.3,4],[-4,22,7.3,3.8],[-22,-17,7,3.7],[24,21,8.1,4]])tree(x,z,h,w);
  for(let gx=-78;gx<=78;gx+=8.5)for(let gz=-78;gz<=78;gz+=9.5){
    const x=gx+range(-2.3,2.3),z=gz+range(-2.3,2.3);
    if(x>-25&&x<28&&z>-23&&z<23||x>-2&&x<12||trailDistance(x,z)<5||Math.hypot(x+34,z-31)<11||Math.hypot(x-grove.x,z-grove.z)<7||Math.hypot(x-gate.x,z-gate.z)<7)continue;
    if(random()<.45&&Math.max(Math.abs(x),Math.abs(z))<66)continue;
    const height=range(5,10.6),reach=range(2.5,4.15);
    if(Math.max(Math.abs(x),Math.abs(z))<bounds-.7)tree(x,z,height,reach);
  }
  for(const [x,z,h,w] of [[-41,32,6.8,2.7],[-39,26,8.2,3.3],[-27,43,7.7,3.0],[-28,25,7.1,3],[-24,36,8,3.3],[-23,26,6.5,2.8],[-12,12,7.4,3.2],[-5,15,6.9,3.0],[23,2,8,3.4],[29,19,7.5,3.1],[42,39,8.4,3.4]])tree(x,z,h,w,true);
  const fern=new THREE.BufferGeometry();
  const frond=[];
  for(let n=0;n<7;n++){
    const a=n*Math.PI*2/7;
    const f=(r,y,s)=>[Math.cos(a)*r-Math.sin(a)*s,y,Math.sin(a)*r+Math.cos(a)*s];
    for(let i=0;i<4;i++){
      const r=i/4,t=(i+1)/4,side=.19*(1-r*.84);
      const base=f(r,Math.sin(r*2.55)*.43,0),tip=f(t,Math.sin(t*2.55)*.43,0);
      frond.push(...base,...f(t-.04,Math.sin(t*2.55)*.33,-side),...tip,...base,...tip,...f(t-.04,Math.sin(t*2.55)*.33,side));
    }
  }
  fern.setAttribute('position',new THREE.Float32BufferAttribute(frond,3));own(fern);
  for(const [x,z,h] of [[-2,-10,2.9],[11.7,10.2,2.4],[-4,10.5,2.8],[22,-5,3.9],[13.9,-9.6,3.1],[-9,5,2.8],[-1.6,4.9,1.35],[11.7,4.3,1.45]]){
    paint(timber,0x686047,x,h*.49,z,.19,h,.18,0,0,.09);
    paint(fern,0x4c7132,x,h,z,2.0,1.5,2.0,0,range(0,6));
    paint(fern,0x8ba64e,x,h+.09,z,1.65,1.2,1.65,.1,range(0,6));
  }
  for(const {x,z,y} of macawPerches){
    tree(x-2.2,z-1.65,y+2.4,1.88);
    paint(timber,0x705038,x-.91,y-.05,z-.7,.087,2.95,.102,0,-.64,Math.PI/2);
    paint(fern,0x5e863f,x-1.45,y+.14,z-.75,.65,.52,.72,.24,.55);
  }
  for(let i=0;i<1280;i++){
    const x=range(-78,78),z=range(-78,78);
    const path=trailDistance(x,z)<2.8||x>10&&x<22&&Math.abs(z)<8;
    if(inRiver(x)||path&&random()<.9)continue;
    const size=range(.45,1.52);
    if(i%5===0)paint(rock,0x475b52,x,.1,z,size*.7,size*.58,size*.6,0,range(0,6));
    else paint(fern,[0x507932,0x638936,0x769741,0x375e30][i%4],x,.035,z,size,size,size,0,range(0,6));
  }
  for(const [x,z] of [[-3,-8.8],[-3,9.5],[12.2,-8.6],[13,9.5],[19,7.7],[-7,-6.7]]){
    paint(rock,0x53615a,x,.4,z,1.1,.75,.82,0,range(0,6));
    paint(fern,0x7c9d3f,x+.6,.02,z+1,1.3,1.3,1.3);
  }
  for(let i=0;i<315;i++){
    const x=range(-17,25),z=range(-14,14);
    if(inRiver(x))continue;
    const color=[0x918262,0x706f4d,0x8c6843,0x63774a,0x4e6641][i%5];
    paint(pathGeometry,color,x,.004+i*.000006,z,range(.044,.19),range(.06,.24),1,-Math.PI/2,0,range(0,6));
    if(i%29===0)for(let j=0;j<4;j++)paint(rock,j%2?0xaf6531:0x8e4030,x+.12*j,.14+.065*j,z,.12,.18,.084,0,j);
  }

  // Camp canvas, simple braced frame and physical supply crates.
  const tent=new THREE.Group();
  for(const x of [-1.6,1.6])for(const z of [-1.05,1.05])box(tent,grain,x,.92,z,.10,1.84,.10);
  const canvas=material(0x9a5132);
  for(const side of [-1,1]){
    const roof=box(tent,canvas,0,1.93,side*.57,3.6,.09,1.26);
    roof.rotation.x=side*.19;
  }
  solid(tent,'camp-shelter',19,-6,3.7,2.55,2.16,105);
  for(const [x,z] of [[17,-8.5],[21,-4.5],[-8.3,-3.7]]){
    const crate=new THREE.Group();
    box(crate,bark,0,.43,0,.87,.86,.84);
    for(const y of [.12,.7])box(crate,grain,0,y,0,.96,.13,.94);
    for(const a of [-.32,.32])box(crate,boards[1],a,.43,0,.11,.88,.92);
    solid(crate,'crate',x,z,1,1,.87,42);
  }
  for(let i=0;i<9;i++){
    const a=i*Math.PI*2/9;
    paint(rock,0x66645a,17+Math.cos(a)*.55,.10,-4.7+Math.sin(a)*.55,.25,.22,.21,0,a);
  }
  for(const r of [-.38,.44])paint(cube,0x533b31,17,.09,-4.7,.79,.14,.16,0,r);

  const monument=new THREE.Group();
  const stoneBlocks=[0x637166,0x4d5d57,0x75816b].map(material);
  const mossStone=material(0x667b43);
  for(const [x,z,yaw,rows] of [[-36,29,.32,3],[-31,35,.1,4],[-33,27,-.5,2],[-28,31,.75,3],[-26,28,-.4,2],[-15,18,.5,3],[19,4,.3,3],[24,9,-.2,2],[48,44,.3,3]]){
    const ruin=new THREE.Group(),stones=new THREE.Group();ruin.add(stones);stones.rotation.y=yaw;
    for(let row=0;row<rows;row++)for(let col=0;col<2;col++){
      if(row===rows-1&&col===0)continue;
      const slab=box(stones,stoneBlocks[(row+col)%3],(col-.5)*.89+(row%2?.15:0),.29+row*.56,0,.86,.55,.8-row*.035);
      slab.rotation.y=(row+col)%2?.07:-.09;
    }
    box(stones,mossStone,.55,rows*.56+.015,-.06,.64,.055,.54).userData.noCollision=true;
    ruin.userData.fragments=[0x637166,0x75816b,0x4d5d57];
    solid(ruin,'jungle-ruin',x,z,2.65,2.65,rows*.56,70+rows*12);
  }
  for(const side of [-1,1]){
    for(let row=0;row<6;row++){
      const x=side*(1.72+(row<2?.15:0));
      const slab=box(monument,stoneBlocks[row%3],x,.37+row*.73,0,row===0?1.57:1.18,.71,1.54-row*.05);
      slab.rotation.y=side*(row%2?.042:-.035);
    }
    for(let i=0;i<14;i++){
      const x=gate.x+side*(1.5+range(0,.6)),y=range(.7,4.8),z=gate.z+.72+range(-.15,.15);
      paint(fern,i%3?0x5d7e39:0x798b40,x,y,z,.58,.94,.52,1.05,side*.7);
    }
  }
  box(monument,stoneBlocks[2],0,4.41,0,5.15,.82,1.38);
  box(monument,stoneBlocks[0],0,4.92,0,5.51,.23,1.67);
  solid(monument,'stone-gate',gate.x,gate.z,5.65,1.72,5.04);
  for(let i=0;i<14;i++){
    const x=gate.x+range(-5.9,5.8),z=gate.z+range(-3.6,2.5);
    if(Math.abs(x-gate.x)<1.45)continue;
    paint(rock,0x52605a,x,.14,z,range(.43,1.1),range(.22,.62),range(.35,.93),0,range(0,6));
  }
  for(const [x,z] of [[-22,-36],[-16,-46],[-15,-49],[17,-44],[23,-38],[39,17],[46,18],[49,24],[43,24],[31,33],[-24,21]]){
    for(let i=0;i<4;i++)paint(rock,i%2?0x465959:0x637269,x+i*.6,range(.45,1.2),z+range(-1.5,1.5),range(.65,1.45),range(.74,1.7),range(.7,1.32),.08,range(0,6));
  }
  const landscapes=[];
  const landscapeMaterial=own(new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true,side:THREE.DoubleSide}));
  for(const {positions,colors} of chunks.values()){
    const surface=own(new THREE.BufferGeometry());
    surface.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    surface.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));surface.computeVertexNormals();surface.computeBoundingSphere();
    const mesh=new THREE.Mesh(surface,landscapeMaterial);
    mesh.receiveShadow=true;group.add(mesh);landscapes.push(mesh);
  }
  chunks.clear();

  function query(list,x,z,r,includeDead=false){
    return list.filter(o=>{
      if(o.dead&&!includeDead)return false;
      const dx=Math.max(0,Math.abs(x-o.x)-o.w/2),dz=Math.max(0,Math.abs(z-o.z)-o.d/2);
      return dx*dx+dz*dz<=r*r;
    });
  }
  const nearObjects=(x,z,r,{includeDead=false}={})=>query(objects,x,z,r,includeDead);
  const contact=terrain.concat(objects);
  const collision=createGeometryCollision({nearObjects:(x,z,r)=>query(contact,x,z,r),bounds,lowestGround:riverbed,groundHeight:x=>inRiver(x)?riverbed:0});
  function barrier(a,b){return {x:5,z:(a+b)/2,w:10,d:b-a,dead:false};}
  const channelBlocks=[barrier(-bounds,logZ-logWidth/2),barrier(logZ+logWidth/2,-bridgeWidth/2),barrier(bridgeWidth/2,bounds)];
  const fallenBridge=barrier(-bridgeWidth/2,bridgeWidth/2);fallenBridge.dead=true;
  const navigationObjects=[...objects.filter(o=>o!==bridge),...channelBlocks,fallenBridge];
  const navigation=createCityNavigation({objects:navigationObjects,nearObjects:(x,z,r)=>query(navigationObjects,x,z,r),bounds,cellSize:2});
  const sightObjects=navigationObjects.filter(o=>!channelBlocks.includes(o)&&o!==fallenBridge);
  const sight=createCityNavigation({objects:sightObjects,nearObjects:(x,z,r)=>query(sightObjects,x,z,r),bounds});
  collision.warm(contact);group.updateMatrixWorld(true);
  const world={
    id:RAVINE_ID,group,objects,hazards:[],bounds,city:null,spawn:{x:arrival.x,z:arrival.z},sky:0x47756b,waterY,
    camp:{x:16,z:-2,dx:0,dz:2.5},openingCamp:{x:-33,z:32,spawns:[[-34,33,'zombie'],[-31,30,'crawler'],[-29,33,'robot']]},bridge,logZ,stonesZ,bridgeZ,
    river:{west,east},inRiver,regionAt,trails,layout:{roads:[],plots:[]},landmarks:[falls,grove,gate],districts:[zone,arrival,falls,grove,gate],buildingObjects:[],
    nearObjects,moveBody:collision.moveBody,clearBody:collision.clearBody,supportHeight:collision.supportHeight,
    supportSurface:collision.support,ceilingHeight:collision.ceilingHeight,collisionDiagnostics:collision.diagnostics,
    getChaseDirection:navigation.getChaseDirection,hasLineOfSight:sight.hasLineOfSight,
    invalidateNavigation(){fallenBridge.dead=!bridge.dead;navigation.invalidateNavigation();},
    updateVisibility(player){
      for(const mesh of landscapes){const {center,radius}=mesh.geometry.boundingSphere;mesh.visible=Math.hypot(player.x-center.x,player.z-center.z)<radius+44;}
    },
    fellTree(object,dx,dz){
      const length=Math.hypot(dx,dz);
      if(length>1e-5){dx/=length;dz/=length;}else{dx=1;dz=0;}
      fallingTrees.push({object,dx,dz,time:0});
      object.mesh.visible=true;
    },
    update(dt){
      for(let index=fallingTrees.length-1;index>=0;index--){
        const fall=fallingTrees[index],{object,dx,dz}=fall;
        fall.time+=dt;
        const progress=Math.min(1,fall.time/.85);
        const tilt=1.53*progress**2;
        fallAxis.set(dz,0,-dx);
        object.mesh.quaternion.setFromAxisAngle(fallAxis,tilt);
        object.mesh.position.y=object.trunkRadius*.8*progress**4;
        if(progress<1)continue;
        // Reuse the standing tree's trunk mesh for physical support at rest.
        // The canopy remains visual, and the fallen trunk cannot be felled twice.
        const length=object.h*Math.sin(tilt);
        contact.push({mesh:object.mesh,type:'fallen-jungle-trunk',
          x:object.x+dx*length*.5,z:object.z+dz*length*.5,
          w:Math.abs(dx)*length+object.trunkRadius*2,d:Math.abs(dz)*length+object.trunkRadius*2});
        fallingTrees.splice(index,1);
      }
    },
    dispose(){
      world.wildlife.dispose();
      scene.remove(group);
      group.traverse(node=>{if(node.material)for(const mat of Array.isArray(node.material)?node.material:[node.material])resources.add(mat);});
      for(const resource of resources)resource.dispose();group.clear();collision.clear();
    },
  };
  world.wildlife=createJungleWildlife(world);
  return world;
}
