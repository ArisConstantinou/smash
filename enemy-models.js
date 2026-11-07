import * as THREE from './vendor/three.module.js';

// Additional horde silhouettes. Every articulated part is a small number of
// baked colour batches; spawning reuses immutable prototypes and owns geometry.
export const CITY_ENEMY_TYPES=Object.freeze(['crawler','mutant','mech','titan','siegeMech']);
const BOX=new THREE.BoxGeometry(1,1,1), ICO=new THREE.IcosahedronGeometry(1,0);
const GEO=new Map(),MAT=new Map(),COLORS=new Map(),PROTOTYPES=new Map();
const matte=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true});
const up=new THREE.Vector3(0,1,0);
const P={dark:0x172a32,steel:0x7f999b,pale:0xc1cbbb,orange:0xd9934d,rust:0x9c6548,
  cyan:0x71d5dc,hot:0xffa553,bone:0xd7cba5,skin:0x779778,moss:0x435d53,cloth:0x764c52};
function geometry(sides=8,top=1){const key=sides+':'+top;if(!GEO.has(key))GEO.set(key,new THREE.CylinderGeometry(top,1,1,sides));return GEO.get(key);}
function tint(hex){if(!COLORS.has(hex))COLORS.set(hex,new THREE.Color(hex));return COLORS.get(hex);}
function material(hex,glow=0){if(!glow)return matte;const key=hex+':'+glow;if(!MAT.has(key))MAT.set(key,new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,flatShading:true,emissive:hex,emissiveIntensity:glow}));return MAT.get(key);}

class Part {
  constructor(name){this.root=new THREE.Group();this.root.name=name;this.batches=new Map();this.matrix=new THREE.Matrix4();this.normal=new THREE.Matrix3();this.p=new THREE.Vector3();this.n=new THREE.Vector3();}
  raw(source,hex,position,scale,q,glow=0){
    const key=glow?hex+':'+glow:'matte';let batch=this.batches.get(key);
    if(!batch){batch={p:[],n:[],c:[],material:material(hex,glow)};this.batches.set(key,batch);}
    this.matrix.compose(new THREE.Vector3(...position),q,new THREE.Vector3(...scale));this.normal.getNormalMatrix(this.matrix);
    const p=source.attributes.position,n=source.attributes.normal,index=source.index?.array,count=index?.length||p.count,c=tint(hex);
    for(let i=0;i<count;i++){const j=index?index[i]:i;this.p.fromBufferAttribute(p,j).applyMatrix4(this.matrix);this.n.fromBufferAttribute(n,j).applyMatrix3(this.normal).normalize();batch.p.push(this.p.x,this.p.y,this.p.z);batch.n.push(this.n.x,this.n.y,this.n.z);batch.c.push(c.r,c.g,c.b);}
    return this;
  }
  put(source,hex,x,y,z,w=1,h=1,d=1,rx=0,ry=0,rz=0,glow=0){return this.raw(source,hex,[x,y,z],[w,h,d],new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),glow);}
  box(hex,x,y,z,w,h,d,rx=0,ry=0,rz=0,glow=0){return this.put(BOX,hex,x,y,z,w,h,d,rx,ry,rz,glow);}
  ico(hex,x,y,z,w,h,d,ry=0,glow=0){return this.put(ICO,hex,x,y,z,w,h,d,0,ry,0,glow);}
  cyl(hex,x,y,z,r,h,sides=8,rx=0,ry=0,rz=0,top=1,glow=0){return this.put(geometry(sides,top),hex,x,y,z,r,h,r,rx,ry,rz,glow);}
  segment(hex,a,b,r=.1,end=1,sides=7){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va),middle=va.add(vb).multiplyScalar(.5);return this.raw(geometry(sides,end),hex,middle.toArray(),[r,delta.length(),r],new THREE.Quaternion().setFromUnitVectors(up,delta.normalize()));}
  finish(parent,x=0,y=0,z=0){
    for(const b of this.batches.values()){
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));geo.computeBoundingBox();geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,b.material);mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
    }
    this.root.position.set(x,y,z);if(parent)parent.add(this.root);return this.root;
  }
}
function node(parent,name,x=0,y=0,z=0){const n=new THREE.Group();n.name=name;n.position.set(x,y,z);parent.add(n);return n;}
function eyes(b,x,y,z,separation=.12,size=.07,hex=P.hot){for(const side of [-1,1]){b.box(P.dark,x+side*separation,y,z,size*2,size*1.45,.045);b.box(hex,x+side*separation,y,z+.03,size,size*.63,.028,0,0,0,.65);}}
function claw(b,x,y,z,size=.3,side=1){b.segment(P.bone,[x,y,z],[x+side*.025,y-.12*size,z+.6*size],.09*size,.7);b.segment(P.bone,[x+side*.025,y-.12*size,z+.6*size],[x+side*.035,y-.35*size,z+.9*size],.065*size,.04);}

function crawler(){
  const root=new THREE.Group();root.name='Skitter — six-legged chitin crawler';
  const body=new Part('body');
  body.ico(0x456c62,0,.54,-.27,.45,.32,.67,.1);
  body.ico(0x628d72,0,.61,-.4,.44,.28,.43,.35);
  for(let i=0;i<4;i++){const z=-.77+i*.27;body.box(0x89a68a,0,.74,z,.47-.045*i,.13,.17,-.12);body.segment(P.bone,[0,.78,z],[0,.98,z-.13],.08,.03);}
  body.ico(P.moss,0,.49,.34,.34,.27,.4);
  body.ico(0x91aa81,0,.62,.54,.36,.25,.29,.25);
  eyes(body,0,.65,.785,.135,.095,P.hot);eyes(body,0,.78,.71,.11,.055,P.hot);
  body.box(P.dark,0,.44,.79,.34,.10,.06);
  for(const x of [-.1,0,.1])claw(body,x,.46,.82,.22,x<0?-1:1);
  body.finish(root);
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const leg=new Part((side<0?'left':'right')+'Scuttle'+i),s=side;
    const back=(i-1)*.15;
    leg.segment(P.moss,[0,0,0],[s*.48,.18,back],.10,.72);
    leg.ico(0x91aa81,s*.48,.18,back,.12,.12,.12);
    leg.segment(0x5e806c,[s*.48,.18,back],[s*.65,-.44,back+.10],.077,.42);
    leg.segment(P.bone,[s*.65,-.44,back+.10],[s*.77,-.46,back+.25],.04,.03);
    leg.finish(root,s*.26,.49,-.45+i*.43);
  }
  for(const side of [-1,1]){
    const arm=new Part(side<0?'leftArm':'rightArm');
    arm.segment(0x90a77a,[0,0,0],[side*.16,-.02,.29],.105,.8);
    arm.segment(P.bone,[side*.16,-.02,.29],[side*.05,-.08,.49],.08,.025);
    arm.finish(root,side*.26,.43,.59);
  }
  root.userData={color:0x628d72,fragments:[0x628d72,P.moss,P.bone,0x91aa81],palette:'organic',heightTarget:1.15};return root;
}

function mutant(){
  const root=new THREE.Group();root.name='Thornback — horned mutant with heavy claw arm';
  const body=new Part('body'),skin=0x839b72,shadow=0x536d55;
  body.ico(shadow,0,1.24,-.08,.56,.62,.40);
  body.ico(skin,.03,1.44,.04,.61,.64,.40,.12);
  body.ico(0x9dae87,0,1.67,.29,.48,.25,.16);
  for(const side of [-1,1])for(let i=0;i<3;i++)body.box(shadow,side*.27,1.45-i*.16,.38,.23,.07,.08,0,0,side*.15);
  body.box(P.cloth,0,.82,.02,.78,.31,.55);
  for(const side of [-1,1])body.box(0x9e6661,side*.25,.62,.18,.3,.4,.11,0,0,side*.10);
  body.box(0x3c3937,0,.91,.31,.8,.1,.10);body.box(P.bone,.03,.91,.38,.2,.16,.06);
  body.ico(shadow,0,1.97,.16,.36,.42,.34);
  body.box(skin,0,2.06,.3,.55,.42,.4,-.11);
  body.ico(0xa7b48b,0,1.88,.49,.29,.17,.19);
  eyes(body,0,2.11,.525,.145,.085);
  body.box(shadow,0,1.91,.62,.35,.08,.035);
  for(const side of [-1,1]){
    body.segment(P.bone,[side*.25,2.19,.16],[side*.46,2.49,.05],.14,.6);
    body.segment(P.bone,[side*.46,2.49,.05],[side*.50,2.69,.19],.08,.025);
    body.segment(P.bone,[side*.33,1.86,-.29],[side*.55,2.14,-.5],.14,.03);
  }
  for(let i=0;i<3;i++)body.ico(shadow,0,1.17+i*.27,-.39,.18,.18,.16);
  body.finish(root);
  for(const side of [-1,1]){
    const leg=new Part(side<0?'leftLeg':'rightLeg');
    leg.ico(shadow,0,-.19,0,.21,.34,.24);leg.ico(skin,0,-.4,.07,.24,.25,.23);
    leg.ico(shadow,0,-.58,.19,.24,.13,.35);
    for(const x of [-.13,0,.13])claw(leg,x,-.55,.36,.3,side);
    leg.finish(root,side*.34,.70,-.02);
    const arm=new Part(side<0?'leftArm':'rightArm'),big=side<0?1.23:1;
    arm.ico(shadow,side*.02,-.02,0,.37*big,.35*big,.36*big);
    arm.ico(skin,side*.06,-.33,.03,.27*big,.46,.27*big);
    arm.ico(skin,side*.08,-.68,.13,.31*big,.27,.34*big);
    arm.ico(0x486058,side*.09,-.86,.22,.33*big,.20,.28*big);
    for(const x of [-.19,0,.19])claw(arm,x,-.92,.30,.7,side);
    for(const z of [-.17,.13])arm.segment(P.bone,[side*.22,.13,z],[side*.47,.43,z-.12],.13,.025);
    arm.finish(root,side*.68,1.74,0);
  }
  root.userData={color:skin,fragments:[skin,shadow,P.bone,P.cloth],palette:'organic',heightTarget:2.6};return root;
}

function mech(){
  const root=new THREE.Group();root.name='Breach mech — reinforced plating and rotary cannon';
  const body=new Part('body'),armor=0xc58b4f,edge=0xa9bbaf;
  body.box(P.dark,0,1.47,0,.86,.83,.60);
  body.box(armor,0,1.58,.05,1.06,.75,.75);
  body.box(edge,0,1.95,.02,1.14,.14,.80);
  for(const side of [-1,1])body.box(P.rust,side*.40,1.57,.45,.18,.60,.12,0,0,side*.10);
  body.cyl(P.dark,0,1.63,.465,.29,.12,8,Math.PI/2);
  body.cyl(P.cyan,0,1.63,.54,.18,.03,8,Math.PI/2,0,0,1,.65);
  for(const x of [-.11,.11])body.box(edge,x,1.63,.575,.045,.33,.045);
  body.box(P.dark,0,1.12,.01,.80,.26,.61);body.box(edge,0,1.13,.37,.66,.12,.11);
  body.box(edge,0,2.21,.05,.66,.44,.56);body.box(armor,0,2.44,.0,.81,.15,.67);
  body.box(P.dark,0,2.23,.35,.56,.17,.08);body.box(P.cyan,0,2.24,.40,.42,.065,.04,0,0,0,.65);
  body.box(P.steel,0,2.07,.37,.37,.12,.12);
  for(const x of [-.10,0,.10])body.box(P.dark,x,2.07,.445,.045,.1,.035);
  for(const side of [-1,1]){
    body.box(P.dark,side*.32,1.56,-.48,.29,.67,.32);
    body.cyl(edge,side*.32,2.02,-.51,.115,.43,8);body.cyl(P.dark,side*.32,2.24,-.51,.09,.025,8);
    for(let i=0;i<3;i++)body.box(P.steel,side*.32,1.39+i*.14,-.66,.24,.055,.045);
  }
  body.cyl(P.steel,-.28,2.67,-.15,.025,.43,6);body.box(P.cyan,-.28,2.89,-.15,.07,.09,.07,0,0,0,.65);
  body.finish(root);
  for(const side of [-1,1]){
    const leg=new Part(side<0?'leftLeg':'rightLeg');
    leg.box(P.dark,0,-.26,0,.36,.55,.42);leg.box(armor,0,-.26,.25,.41,.43,.13);
    leg.cyl(P.steel,0,-.53,.05,.16,.46,8,0,0,Math.PI/2);
    leg.box(P.steel,0,-.73,.02,.40,.40,.48);leg.box(P.dark,0,-.97,.15,.49,.22,.78);
    leg.box(armor,0,-.77,.30,.30,.30,.10);
    leg.box(edge,0,-.94,.55,.47,.12,.11);
    leg.finish(root,side*.40,1.09,0);
    const arm=new Part(side<0?'leftArm':'rightArm');
    arm.cyl(P.steel,0,0,0,.23,.43,8,0,0,Math.PI/2);
    arm.box(armor,side*.03,.08,.01,.64,.36,.77,0,0,side*.06);
    arm.box(edge,side*.03,.29,.01,.60,.09,.72);
    for(const z of [-.20,.20])arm.cyl(P.dark,side*.36,.08,z,.06,.04,6,0,0,Math.PI/2);
    arm.box(P.dark,0,-.36,0,.27,.60,.31);arm.cyl(edge,side*.16,-.37,.07,.05,.51,6);
    arm.box(armor,0,-.63,.11,.47,.38,.46);
    if(side<0){for(const x of [-.15,.15]){arm.box(edge,x,-.88,.19,.11,.29,.23);arm.box(P.dark,x,-1.02,.29,.12,.10,.21);}}
    const g=arm.finish(root,side*.77,1.88,0);
    if(side>0){
      const barrel=new Part('rotaryBarrel');
      barrel.cyl(P.dark,0,0,0,.26,.72,10,Math.PI/2);
      barrel.cyl(P.steel,0,0,.33,.29,.14,10,Math.PI/2);
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3,x=Math.sin(a)*.14,y=Math.cos(a)*.14;barrel.cyl(P.steel,x,y,.48,.075,.45,7,Math.PI/2);barrel.cyl(P.dark,x,y,.71,.052,.025,7,Math.PI/2);}
      const gun=barrel.finish(g,0,-.62,.43);node(gun,'muzzle',0,0,.75);
    }
  }
  root.userData={color:armor,fragments:[armor,P.steel,P.dark,edge],palette:'metal',heightTarget:2.95};return root;
}

function titan(){
  const root=new THREE.Group();root.name='Ruin titan — massive organic stone-backed bruiser';
  const body=new Part('body'),skin=0x7b8370,shadow=0x475c53,rock=0x9b9d88;
  body.ico(shadow,0,2.12,-.08,.99,1.17,.69,.2);
  body.ico(skin,0,2.2,.18,.96,1.04,.63);
  body.ico(0x969a7e,0,1.95,.59,.73,.72,.33);
  body.ico(rock,0,3.0,-.35,1.05,.70,.63);
  for(const side of [-1,1])for(let i=0;i<3;i++)body.ico(i%2?shadow:rock,side*(.56+i*.1),2.56+i*.24,-.48,.33,.31,.28,side*.3);
  for(const side of [-1,1]){
    body.box(shadow,side*.40,2.64,.72,.48,.14,.1,0,0,side*.18);
    body.box(P.hot,side*.44,2.50,.77,.11,.39,.055,0,0,side*.3,.32);
  }
  body.box(0x51453f,0,1.32,.12,1.42,.35,1.03);
  for(let i=0;i<5;i++)body.box(i%2?P.bone:rock,(i-2)*.28,1.08,.62,.23,.56,.12,0,0,(i-2)*.045);
  body.box(rock,0,1.39,.72,.47,.34,.14);body.box(P.dark,0,1.39,.80,.26,.15,.04);
  body.ico(shadow,0,3.32,.35,.58,.59,.48);
  body.ico(skin,0,3.53,.55,.60,.49,.43);
  body.box(rock,0,3.71,.72,.90,.19,.36,-.10);
  eyes(body,0,3.59,.93,.25,.14,P.hot);
  body.ico(shadow,0,3.20,.81,.47,.25,.28);
  body.box(P.dark,0,3.32,1.04,.63,.14,.045);
  for(const x of [-.23,-.08,.08,.23])body.box(P.bone,x,3.33,1.08,.09,.14,.06,0,0,x*.25);
  for(const side of [-1,1]){
    body.segment(P.bone,[side*.44,3.78,.36],[side*.70,4.05,.15],.19,.7);
    body.segment(P.bone,[side*.70,4.05,.15],[side*.79,4.37,.26],.12,.02);
    body.segment(P.bone,[side*.65,3.28,-.62],[side*.85,3.78,-.83],.19,.03);
  }
  for(let i=0;i<3;i++)body.segment(rock,[0,2.65+i*.25,-.76],[0,2.9+i*.25,-1.05],.20,.03);
  body.finish(root);
  for(const side of [-1,1]){
    const leg=new Part(side<0?'leftLeg':'rightLeg');
    leg.ico(shadow,0,-.26,0,.43,.61,.43);leg.ico(skin,side*.03,-.62,.08,.45,.45,.44);
    leg.ico(rock,0,-.91,.28,.48,.24,.63);
    for(const x of [-.25,0,.25])claw(leg,x,-.92,.61,.6,side);
    leg.finish(root,side*.65,1.18,0);
    const arm=new Part(side<0?'leftArm':'rightArm');
    arm.ico(rock,side*.06,0,-.03,.59,.57,.60,side*.17);
    arm.ico(skin,side*.09,-.57,.06,.45,.69,.44);
    arm.ico(shadow,side*.10,-1.12,.22,.50,.44,.49);
    arm.ico(rock,side*.10,-1.43,.35,.62,.40,.52,.15);
    for(const x of [-.3,0,.3])arm.ico(skin,x,-1.61,.62,.19,.22,.20);
    for(const z of [-.30,.10])arm.segment(P.bone,[side*.34,.20,z],[side*.67,.64,z-.09],.18,.02);
    for(const x of [-.25,.16])arm.box(P.hot,x,-1.40,.79,.07,.28,.04,0,0,x*.8,.32);
    arm.finish(root,side*1.12,2.91,-.03);
  }
  root.userData={color:skin,fragments:[skin,shadow,rock,P.bone],palette:'organic',miniBoss:true,heightTarget:4.35};return root;
}

function siegeMech(){
  const root=new THREE.Group();root.name='Bastion — heavy siege mech with twin artillery cannons';
  const body=new Part('body'),armor=0x576f78,edge=0x9facaa,warning=0xd49a4d;
  body.box(P.dark,0,2.32,0,1.8,1.76,1.35);
  body.box(armor,0,2.72,.08,2.15,1.25,1.55);
  body.box(edge,0,3.37,.02,2.31,.20,1.64);
  body.box(armor,0,1.68,.08,1.78,.35,1.37);
  body.box(edge,0,1.65,.82,1.57,.14,.16);
  for(const side of [-1,1]){
    body.box(warning,side*.88,2.68,.91,.24,.95,.12,0,0,side*.07);
    for(let i=0;i<3;i++)body.box(P.dark,side*.88,2.41+i*.22,.985,.24,.08,.035,0,0,-.4);
    body.box(P.dark,side*.58,2.82,-.95,.42,1.18,.42);
    body.cyl(edge,side*.58,3.65,-.95,.20,.55,8);body.cyl(P.dark,side*.58,3.93,-.95,.15,.035,8);
    for(let i=0;i<4;i++)body.box(edge,side*.58,2.45+i*.23,-1.18,.36,.08,.06);
  }
  body.box(P.dark,0,2.85,.89,1.05,.39,.14);
  body.box(P.hot,0,2.91,.98,.80,.105,.06,0,0,0,.6);
  body.box(edge,0,3.10,.99,1.18,.10,.20);
  body.box(P.dark,0,2.23,.89,.83,.48,.12);
  for(const x of [-.25,0,.25])body.box(P.hot,x,2.23,.97,.10,.33,.06,0,0,0,.6);
  body.box(armor,0,3.66,-.28,1.00,.40,.82);body.box(edge,0,3.90,-.28,1.13,.12,.93);
  body.cyl(P.steel,.33,4.15,-.58,.04,.46,6);body.box(P.hot,.33,4.40,-.58,.11,.09,.11,0,0,0,.6);
  const torso=body.finish(root);
  for(const side of [-1,1]){
    const leg=new Part(side<0?'leftLeg':'rightLeg');
    leg.box(P.dark,0,-.35,0,.62,.75,.72);leg.box(armor,0,-.38,.42,.71,.62,.18);
    leg.cyl(edge,0,-.77,.04,.27,.82,8,0,0,Math.PI/2);
    leg.box(armor,0,-1.04,.08,.74,.57,.83);leg.box(warning,0,-1.02,.54,.48,.34,.12);
    for(const x of [-.31,.31])leg.cyl(edge,x,-1.06,.10,.075,.61,6);
    leg.box(P.dark,0,-1.45,.33,.91,.32,1.31);leg.box(edge,0,-1.35,.94,.87,.15,.18);
    for(const x of [-.26,0,.26])leg.box(armor,x,-1.49,1.04,.16,.22,.11);
    leg.finish(root,side*.80,1.62,-.03);
    const arm=new Part(side<0?'leftArm':'rightArm');
    arm.cyl(P.dark,0,-.03,0,.34,.67,8,0,0,Math.PI/2);
    arm.box(armor,side*.08,.10,.03,.93,.49,1.02);
    arm.box(edge,side*.08,.38,.03,.95,.13,1.08);
    arm.box(warning,side*.08,.48,.07,.72,.08,.86);
    arm.box(P.dark,0,-.58,.03,.42,.92,.49);
    arm.cyl(edge,side*.27,-.58,.03,.075,.82,6);
    arm.box(armor,0,-1.10,.13,.70,.53,.76);
    for(const x of [-.22,0,.22]){arm.box(edge,x,-1.48,.31,.16,.33,.26);arm.box(P.dark,x,-1.64,.42,.17,.10,.26);}
    arm.finish(root,side*1.35,2.98,-.06);
    const cannon=new Part(side<0?'leftSiegeGun':'rightSiegeGun');
    cannon.box(P.dark,0,.01,-.22,.78,.62,1.12);cannon.box(armor,0,.28,-.24,.88,.24,1.18);
    cannon.box(warning,0,.43,-.24,.65,.07,.9);
    cannon.cyl(P.steel,0,0,.51,.24,1.28,10,Math.PI/2);
    for(const z of [.22,.64,1.10])cannon.cyl(P.dark,0,0,z,.28,.13,10,Math.PI/2);
    cannon.box(armor,0,0,1.22,.59,.52,.40);
    cannon.cyl(P.dark,0,0,1.435,.19,.035,10,Math.PI/2);
    cannon.cyl(P.hot,0,0,1.456,.095,.015,8,Math.PI/2,0,0,1,.6);
    const gun=cannon.finish(torso,side*.70,3.66,.25);node(gun,side<0?'muzzle':'muzzleRight',0,0,1.49);
  }
  root.userData={color:armor,fragments:[armor,edge,warning,P.dark],palette:'metal',miniBoss:true,heightTarget:4.7};return root;
}

const makers={crawler,mutant,mech,titan,siegeMech};

function relaxedStance(root,type){
  // The six-legged crawler already has its own spread leg chain. Humanoids
  // need a gap at the knees and elbows that survives the shared walk reset.
  if(type==='crawler')return;
  const [armRoll,legRoll,toeOut]={mutant:[.17,.025,.09],mech:[.13,.025,.055],
    titan:[.16,.035,.07],siegeMech:[.13,.02,.045]}[type];
  for(const [name,side] of [['left',-1],['right',1]])for(const kind of ['Arm','Leg']){
    const limb=root.getObjectByName(name+kind),leg=kind==='Leg';
    Object.assign(limb.userData,{restX:limb.position.x,restY:limb.position.y,restZ:limb.position.z,
      restRoll:side*(leg?legRoll:armRoll),restYaw:leg?side*toeOut:0});
    limb.rotation.z=limb.userData.restRoll;limb.rotation.y=limb.userData.restYaw;
  }
}

// The original low-draw-count meshes bake the face into the torso. Separate
// whole connected primitives once at construction time, keeping every triangle
// and the resting silhouette, so the head can track a player above the horde.
const HEADS={
  zombie:{pivot:[0,1.28,.07],eye:1.58,test:(x,y,z)=>y>1.29},
  brute:{pivot:[0,1.28,.07],eye:1.58,test:(x,y,z)=>y>1.29},
  robot:{pivot:[0,1.36,0],eye:1.58,test:(x,y,z)=>y>1.38},
  crawler:{pivot:[0,.47,.37],eye:.68,test:(x,y,z)=>z>.43},
  mutant:{pivot:[0,1.83,.15],eye:2.11,test:(x,y,z)=>y>1.84&&z>-.27&&Math.abs(x)<.65},
  mech:{pivot:[0,2.02,.02],eye:2.24,test:(x,y,z)=>y>2.05&&z>-.36},
  titan:{pivot:[0,3.18,.37],eye:3.59,test:(x,y,z)=>y>3.16&&z>.08},
  siegeMech:{pivot:[0,2.66,.87],eye:2.91,test:(x,y,z)=>y>2.69&&z>.78&&Math.abs(x)<.66},
  boss:{pivot:[0,4.35,.05],eye:4.92,test:(x,y,z)=>y>4.34&&z>-.45&&Math.abs(x)<.8},
};

function partitionHeadGeometry(source,test){
  const position=source.attributes.position,count=position.count/3,parents=new Int32Array(count),vertices=new Map();
  for(let i=0;i<count;i++)parents[i]=i;
  const find=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let triangle=0;triangle<count;triangle++)for(let corner=0;corner<3;corner++){
    const index=triangle*3+corner;
    const key=Math.round(position.getX(index)*1e5)+':'+Math.round(position.getY(index)*1e5)+':'+Math.round(position.getZ(index)*1e5);
    const previous=vertices.get(key);
    if(previous!==undefined)parents[find(triangle)]=find(previous);
    else vertices.set(key,triangle);
  }
  const components=new Map();
  for(let triangle=0;triangle<count;triangle++){
    const id=find(triangle);let part=components.get(id);
    if(!part){part={x:0,y:0,z:0,count:0,head:false};components.set(id,part);}
    for(let corner=0;corner<3;corner++){
      const index=triangle*3+corner;part.x+=position.getX(index);part.y+=position.getY(index);part.z+=position.getZ(index);part.count++;
    }
  }
  for(const part of components.values())part.head=test(part.x/part.count,part.y/part.count,part.z/part.count);
  const selected=[],remaining=[];
  for(let triangle=0;triangle<count;triangle++)(components.get(find(triangle)).head?selected:remaining).push(triangle);
  if(!selected.length)return null;
  function build(triangles){
    if(!triangles.length)return null;
    const geometry=new THREE.BufferGeometry();
    for(const [name,attribute] of Object.entries(source.attributes)){
      const array=new attribute.array.constructor(triangles.length*3*attribute.itemSize);
      for(let i=0;i<triangles.length;i++){
        const begin=triangles[i]*3*attribute.itemSize;
        array.set(attribute.array.subarray(begin,begin+3*attribute.itemSize),i*3*attribute.itemSize);
      }
      geometry.setAttribute(name,new THREE.BufferAttribute(array,attribute.itemSize,attribute.normalized));
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
  }
  return {head:build(selected),body:build(remaining)};
}

/** Call before prepareMaterials. bind=false is reserved for cached prototypes. */
export function installEnemyHead(root,type='zombie',bind=true){
  const body=root.userData.body||root.getObjectByName('body'),profile=HEADS[type]||HEADS.zombie;
  let head=root.getObjectByName('head');
  if(!body)return null;
  if(!head){
    head=new THREE.Group();head.name='head';head.position.set(...profile.pivot);body.add(head);
    // Direct body batches only: a siege weapon attached to the torso must stay
    // on the torso rather than being mistaken for part of the character's face.
    for(const mesh of [...body.children]){
      if(!mesh.isMesh)continue;
      mesh.updateMatrix();
      const source=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
      source.applyMatrix4(mesh.matrix);
      const partition=partitionHeadGeometry(source,profile.test);source.dispose();
      if(!partition)continue;
      const oldGeometry=mesh.geometry;
      const face=new THREE.Mesh(partition.head,mesh.material);
      face.name='headDetail';face.castShadow=mesh.castShadow;face.receiveShadow=mesh.receiveShadow;
      partition.head.translate(-profile.pivot[0],-profile.pivot[1],-profile.pivot[2]);head.add(face);
      if(partition.body){mesh.geometry=partition.body;mesh.position.set(0,0,0);mesh.quaternion.identity();mesh.scale.set(1,1,1);}
      else mesh.removeFromParent();
      oldGeometry.dispose();
    }
  }
  root.userData.eyeHeight=profile.eye*root.scale.y;
  if(bind){root.userData.head=head;root.userData.body=body;}
  return head;
}

function prototype(type){
  if(PROTOTYPES.has(type))return PROTOTYPES.get(type);
  const root=makers[type]();relaxedStance(root,type);installEnemyHead(root,type,false);root.updateMatrixWorld(true);
  const initial=new THREE.Box3().setFromObject(root),target=root.userData.heightTarget;
  root.scale.setScalar(target/initial.max.y);root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
  Object.assign(root.userData,{type,width:size.x,depth:size.z,height:bounds.max.y,eyeHeight:HEADS[type].eye*root.scale.y,geometryOwned:true,materialOwned:false});
  PROTOTYPES.set(type,root);return root;
}
export function makeCityEnemy(type='mutant'){
  const resolved=Object.hasOwn(makers,type)?type:'mutant',root=prototype(resolved).clone(true),u=root.userData;
  root.traverse(n=>{if(n.isMesh)n.geometry=n.geometry.clone();});
  for(const name of ['body','head','leftLeg','rightLeg','leftArm','rightArm','muzzle'])u[name]=root.getObjectByName(name);
  if(resolved==='crawler'){
    const legs=[];for(const side of ['left','right'])for(let i=0;i<3;i++)legs.push(root.getObjectByName(side+'Scuttle'+i));
    u.leftLeg=legs[2];u.rightLeg=legs[5];u.legs=legs;
    u.animate=(enemy,dt,time=0)=>{
      const walking=!enemy.dead&&!(enemy.stagger>0)&&(enemy.state==='walk'||enemy.state==='lunge'),step=walking?enemy.walk*1.7:time*2;
      legs.forEach((leg,i)=>{const side=i<3?-1:1,phase=step+(i%3)*Math.PI*.68+(i>=3?Math.PI:0);leg.rotation.x=Math.sin(phase)*(walking?.25:.06);leg.rotation.z=side*Math.max(0,Math.cos(phase))*(walking?.17:.025);});
      u.leftArm.rotation.set(0,enemy.state==='windup'?-.38:Math.sin(time*8)*.08,0);
      u.rightArm.rotation.set(0,enemy.state==='windup'?.38:-Math.sin(time*8)*.08,0);
      u.body.position.y=walking?Math.abs(Math.sin(step))*.025:0;
    };
  }else if(resolved==='mech'){
    const barrel=root.getObjectByName('rotaryBarrel');u.barrel=barrel;
    u.animate=(enemy,dt,time=0)=>{
      const active=!enemy.dead&&!(enemy.stagger>0)&&(enemy.state==='windup'||enemy.state==='shoot');
      barrel.rotation.z+=(dt||0)*(active?18:2.2);
      u.rightArm.rotation.x=active?-.12:.08+Math.sin(enemy.walk)*.12;
      u.body.position.y=Math.abs(Math.sin(enemy.walk))*.025;
    };
  }else if(resolved==='siegeMech'){
    const guns=[root.getObjectByName('leftSiegeGun'),root.getObjectByName('rightSiegeGun')];u.guns=guns;
    u.muzzles=[u.muzzle,root.getObjectByName('muzzleRight')];
    u.animate=(enemy,dt,time=0)=>{
      const windup=!enemy.dead&&!(enemy.stagger>0)&&enemy.state==='windup';
      guns.forEach((gun,i)=>{gun.rotation.x=windup?-.09:Math.sin(time*1.5+i)*.015;gun.position.z=.25+(enemy.state==='shoot'?Math.sin(time*24+i*Math.PI)*.08:0);});
      u.leftArm.rotation.x=.10+Math.sin(enemy.walk)*.12;u.rightArm.rotation.x=.10-Math.sin(enemy.walk)*.12;
    };
  }
  return root;
}
