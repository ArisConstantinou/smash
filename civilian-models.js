import * as THREE from './vendor/three.module.js';

const wardrobes=[
  {name:'courier',coat:0xb28a49,trim:0x765333,shirt:0xdeb17a,pants:0x435865,skin:0xc89572,hair:0x4b3730,satchel:true},
  {name:'resident',coat:0x44787b,trim:0x305256,shirt:0xc3a66c,pants:0x3b4b54,skin:0xb58261,hair:0x332824,longCoat:true},
  {name:'mechanic',coat:0x946152,trim:0x643e3b,shirt:0xc99475,pants:0x49514d,skin:0x9b6c50,hair:0x302721,cap:true},
];

export function createCivilianModels(){
  const resources=new Set();
  const keep=value=>{resources.add(value);return value;};
  const cube=keep(new THREE.BoxGeometry(1,1,1));
  const bevel=keep(new THREE.CylinderGeometry(1,1,1,8));
  const material=keep(new THREE.MeshLambertMaterial({flatShading:true,vertexColors:true}));
  const point=new THREE.Vector3(),transform=new THREE.Object3D(),color=new THREE.Color();
  const box=(tint,x,y,z,w,h,d,rx=0,ry=0,rz=0)=>({tint,x,y,z,w,h,d,rx,ry,rz});
  const rounded=(...args)=>({...box(...args),rounded:true});
  const pivot=(parent,x=0,y=0,z=0)=>{const p=new THREE.Group();p.position.set(x,y,z);parent.add(p);return p;};
  function batch(parts){
    const positions=[],colors=[];
    for(const {tint,x,y,z,w,h,d,rx,ry,rz,rounded} of parts){
      const geometry=rounded?bevel:cube,src=geometry.attributes.position,index=geometry.index;
      transform.position.set(x,y,z);transform.rotation.set(rx,ry,rz);
      transform.scale.set(rounded?w*.5:w,h,rounded?d*.5:d);transform.updateMatrix();
      color.setHex(tint);
      for(let i=0;i<index.count;i++){
        point.fromBufferAttribute(src,index.getX(i)).applyMatrix4(transform.matrix);
        positions.push(point.x,point.y,point.z);colors.push(color.r,color.g,color.b);
      }
    }
    const g=keep(new THREE.BufferGeometry());
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    g.computeVertexNormals();return g;
  }
  const templates=wardrobes.map(w=>{
    const hem=w.longCoat?-.27:-.155;
    const torso=[rounded(w.coat,0,.14,0,.55,.48,.34),rounded(w.trim,0,hem,.005,.52,.18,.35),
      box(w.shirt,0,.258,.151,.088,.22,.033),box(w.trim,0,.077,.178,.037,.36,.02),
      box(w.trim,-.162,.025,.159,.12,.063,.027,0,0,-.16),box(w.trim,.162,.025,.159,.12,.063,.027,0,0,.16),
      rounded(w.skin,0,.403,.026,.166,.143,.15)];
    if(w.satchel)torso.push(box(0x6d513c,0,.123,.183,.048,.49,.019,0,0,-.52),box(0x79573a,.205,-.113,-.127,.2,.25,.18,0,.12,.06),box(0xa57b51,.205,-.041,-.22,.184,.103,.027));
    if(w.longCoat)torso.push(rounded(w.trim,0,.324,-.123,.26,.175,.19),box(w.shirt,0,.356,.083,.298,.064,.217));
    const head=[rounded(w.skin,0,.128,.025,.306,.287,.302),rounded(w.hair,0,.261,.003,.319,.101,.315),
      box(w.hair,0,.154,-.107,.253,.154,.085),box(w.skin,0,.127,.169,.059,.071,.065),
      box(0x312624,-.068,.153,.172,.032,.023,.013),box(0x312624,.068,.153,.172,.032,.023,.013),
      box(0x755041,0,.077,.164,.07,.016,.02),box(w.skin,-.151,.137,.025,.044,.065,.075),box(w.skin,.151,.137,.025,.044,.065,.075)];
    if(w.cap)head.push(rounded(0x59574b,0,.271,.005,.338,.101,.337),box(0x4c4b41,0,.233,.157,.28,.029,.17));
    if(w.longCoat)head.push(rounded(w.hair,0,.087,-.123,.184,.159,.122));
    return {name:w.name,body:batch(torso),head:batch(head),
      thigh:batch([rounded(w.pants,0,-.17,0,.186,.382,.196),box(w.pants,0,-.342,.025,.147,.109,.15)]),
      shin:batch([rounded(w.pants,0,-.144,0,.148,.336,.151),rounded(w.trim,0,-.293,0,.155,.081,.162)]),
      shoe:batch([rounded(0x35302b,0,-.032,.047,.164,.088,.264),box(0x594a3c,0,-.068,.048,.147,.029,.23)]),
      upper:batch([rounded(w.coat,0,-.121,0,.151,.268,.156),rounded(w.trim,0,-.239,0,.137,.08,.14)]),
      fore:batch([rounded(w.coat,0,-.102,0,.128,.213,.137),rounded(w.trim,0,-.203,0,.133,.048,.136),rounded(w.skin,0,-.258,.008,.113,.11,.105)]),
    };
  });
  function attach(parent,geometry){
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  return {
    create(index){
      const t=templates[index%templates.length],root=new THREE.Group();root.name='Civilian '+t.name;
      const pelvis=pivot(root,0,.71,0);attach(pelvis,t.body);
      const head=pivot(pelvis,0,.458,.023);attach(head,t.head);
      const legs=[-1,1].map(s=>{
        const hip=pivot(root,s*.132,.71,0),knee=pivot(hip,0,-.385,0),foot=pivot(knee,0,-.375,0);
        attach(hip,t.thigh);attach(knee,t.shin);attach(foot,t.shoe);return {hip,knee,foot};
      });
      const arms=[-1,1].map(s=>{
        const shoulder=pivot(pelvis,s*.273,.319,.003),elbow=pivot(shoulder,0,-.265,0);
        attach(shoulder,t.upper);attach(elbow,t.fore);return {shoulder,elbow};
      });
      function pose(phase,gait,alert,look){
        const running=THREE.MathUtils.smoothstep(gait,.48,1);
        const stride=1.24+running*.87,duty=.59-running*.24;
        const moving=THREE.MathUtils.smoothstep(gait,0,.27);
        const hipY=.715+moving*(.018*Math.cos(phase*Math.PI*4)-.008*running)-.032*alert;
        pelvis.position.y=hipY;pelvis.rotation.x=.075*moving+.24*running+.10*alert;
        pelvis.rotation.y=Math.sin(phase*Math.PI*2)*.085*moving;
        head.rotation.y=look;head.rotation.x=-pelvis.rotation.x*.75;
        for(let i=0;i<legs.length;i++){
          const {hip,knee,foot}=legs[i],cycle=(phase+i*.5)%1;
          const swing=Math.max(0,(cycle-duty)/(1-duty));
          const contact=cycle<=duty;
          const half=stride*duty*.5;
          const forward=(contact?half-cycle*stride:-half+2*half*(swing*swing*(3-2*swing)))*moving;
          const lift=contact?0:Math.sin(swing*Math.PI)*(.11+.14*running)*moving;
          const down=hipY-.083-lift;
          const first=.385,second=.375,length=Math.min(first+second-.0005,Math.hypot(down,forward));
          const angle=Math.acos(Math.min(1,(first*first+length*length-second*second)/(2*first*length)));
          hip.position.y=hipY;hip.rotation.x=-Math.atan2(forward,down)-angle;
          knee.rotation.x=Math.PI-Math.acos(Math.max(-1,Math.min(1,(first*first+second*second-length*length)/(2*first*second))));
          foot.rotation.x=-hip.rotation.x-knee.rotation.x+Math.sin(swing*Math.PI)*.19*moving;
          const {shoulder,elbow}=arms[i],s=i===0?-1:1;
          shoulder.rotation.x=forward*(1.48+running*.85)-alert*.28;
          shoulder.rotation.z=s*(.09+.075*running+.09*alert);
          elbow.rotation.x=-.22-running*.81-alert*.51;
        }
        return stride;
      }
      pose(0,0,0,0);
      return {root,pose,name:t.name,feet:legs.map(leg=>leg.foot)};
    },
    dispose(){for(const resource of resources)resource.dispose();},
  };
}
