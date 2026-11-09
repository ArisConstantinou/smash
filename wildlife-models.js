import * as THREE from './vendor/three.module.js';

const TAU=Math.PI*2;

export function createWildlifeModel(kind){
  const root=new THREE.Group();root.name=kind;
  const resources=new Set();
  const own=value=>{resources.add(value);return value;};
  const skin=own(new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true}));
  const pivot=(parent,x=0,y=0,z=0)=>{const p=new THREE.Group();p.position.set(x,y,z);parent.add(p);return p;};
  const points=[],tint=new THREE.Color();
  function loft(parent,rings,palette,sides=8){
    const positions=[],colors=[];
    points.length=0;
    for(const [z,y,width,height] of rings)for(let i=0;i<sides;i++){
      const a=(i+.5)*TAU/sides;points.push([Math.cos(a)*width,y+Math.sin(a)*height,z]);
    }
    function triangle(a,b,c,color,shade){
      tint.setHex(color).multiplyScalar(shade);
      for(const p of [a,b,c]){positions.push(...p);colors.push(tint.r,tint.g,tint.b);}
    }
    for(let n=0;n<rings.length-1;n++)for(let i=0;i<sides;i++){
      const a=n*sides+i,b=n*sides+(i+1)%sides,c=b+sides,d=a+sides;
      const color=palette[(n*3+i)%palette.length],shade=.93+.09*Math.sin(n*2.6+i*2.3);
      triangle(points[a],points[b],points[c],color,shade);triangle(points[a],points[c],points[d],color,shade*.98);
    }
    for(let i=0;i<sides;i++){
      const [za,ya]=rings[0],[zb,yb]=rings.at(-1),last=(rings.length-1)*sides,j=(i+1)%sides;
      triangle([0,ya,za],points[j],points[i],palette[0],.93);
      triangle([0,yb,zb],points[last+i],points[last+j],palette.at(-1),.97);
    }
    const geometry=own(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,skin);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  const lump=(parent,x,y,z,w,h,d,palette,sides=7)=>{
    const mesh=loft(parent,[[-d,0,w*.42,h*.48],[-d*.44,0,w,h],[d*.48,0,w*.9,h*.92],[d,0,w*.46,h*.53]],palette,sides);
    mesh.position.set(x,y,z);return mesh;
  };
  const ink=[0x251c17,0x332820];
  let pose;
  if(kind==='macaw'){
    const red=[0xb83a28,0xd1482b,0xe55b38,0xa9352a],blue=[0x2763a1,0x3979bd,0x225087],yellow=[0xe8a73f,0xe7ba56];
    const body=pivot(root,0,.22,0);
    loft(body,[[-.36,-.08,.055,.09],[-.18,.0,.155,.205],[.07,.04,.167,.218],[.21,.115,.104,.133]],red);
    const head=pivot(body,0,.24,.14);
    lump(head,0,.025,.03,.133,.136,.137,red);
    for(const s of [-1,1]){
      lump(head,s*.095,.033,.116,.043,.078,.058,[0xe9d6bd,0xf3e7cd]);
      lump(head,s*.129,.058,.126,.017,.022,.021,ink);
    }
    loft(head,[[.11,.015,.085,.077],[.197,.015,.071,.076],[.24,-.04,.047,.06],[.217,-.083,.022,.027]],[0xd4ae7d,0xefdab2,0x292623]);
    const tail=pivot(body,0,-.08,-.23);
    for(const i of [-2,-1,0,1,2]){
      const feather=loft(tail,[[-.43+Math.abs(i)*.038,-.15,.012,.009],[-.25,-.10,.036,.02],[.025,0,.038,.019]],i%2?red:blue,5);
      feather.position.x=i*.045;feather.rotation.y=i*.084;
    }
    const wings=[-1,1].map(s=>{
      const wing=pivot(body,s*.122,.11,.025);
      for(let i=0;i<7;i++){
        const feather=loft(wing,[[-.48+i*.027,0,.016,.011],[-.29,0,.046,.021],[.095-i*.006,0,.038,.023]],i<4?blue:yellow,5);
        feather.position.set(s*(.15+i*.066),-.004*i,-i*.027);feather.rotation.y=s*(-.35+i*.078);
      }
      lump(wing,s*.14,.025,-.055,.23,.053,.232,red);
      lump(wing,s*.25,.024,-.12,.19,.042,.165,yellow);
      return wing;
    });
    const feet=[-1,1].map(s=>{
      const foot=pivot(root,s*.077,.072,-.015);
      for(let i=-1;i<=1;i++)lump(foot,i*.026,-.034,.055,.012,.017,.066,[0x82736a,0x5e5b53],5);
      return foot;
    });
    pose=(phase,mode,lean)=>{
      const air=mode==='flight';
      body.rotation.x=air?-.35+lean*.22:.19;
      head.rotation.y=air?0:.16*Math.sin(phase*.5);
      tail.rotation.x=air?-.16+.12*Math.sin(phase):.36;
      wings.forEach((w,i)=>{
        const sign=i===0?-1:1;
        w.rotation.z=sign*(air?.74*Math.sin(phase):1.08);
        w.rotation.y=sign*(air?.05:1.06);
        w.scale.x=air?1:.58;
      });
      feet.forEach(f=>{f.rotation.x=air?-.88:0;f.position.y=air?.125:.072;f.position.z=air?-.14:-.015;});
    };
  }else{
    const boar=kind==='boar';
    const fur=boar?[0x75412d,0x965331,0xa76842,0x593628]:[0x66574c,0x807164,0x958474,0x574a42];
    const dark=boar?[0x57362d,0x714333,0x482c24]:[0x493d38,0x65564b,0x55473e];
    const light=boar?[0xbc8059,0xcf966b,0x9c654d]:[0x9c8977,0xae9b88,0x766153];
    const body=pivot(root);
    loft(body,[[-.77,.76,.21,.235],[-.55,.81,.37,.364],[-.11,.84,.415,.391],[.33,.89,.365,boar?.43:.34],[.55,.84,.25,.255]],fur,10);
    const head=pivot(body,0,.87,.42);
    loft(head,[[-.05,.026,.263,.245],[.19,0,.273,.229],[.38,-.088,.195,.17],[.56,-.165,.132,.102],[.65,boar?-.18:-.277,.117,.075]],light,9);
    lump(head,0,boar?-.17:-.27,.645,.125,.075,.053,dark);
    for(const s of [-1,1]){
      const ear=lump(head,s*.198,.227,.09,.084,boar?.136:.112,.05,fur);
      ear.rotation.z=-s*.35;ear.rotation.x=.17;
      lump(head,s*.22,.027,.274,.043,.045,.055,dark);
      lump(head,s*.251,.033,.293,.017,.019,.022,ink);
      if(boar){
        const tusk=loft(head,[[.36,-.182,.058,.049],[.49,-.179,.043,.039],[.57,-.12,.029,.025],[.59,-.051,.007,.008]],[0xdac29a,0xe6d6b6,0xffeac9],7);
        tusk.position.x=s*.152;tusk.rotation.y=s*.17;
      }
    }
    if(boar)for(let i=0;i<9;i++){
      const crest=loft(body,[[-.22,0,.067,.014],[-.08,.16,.023,.04],[.13,0,.075,.03]],[0x573425,0x7e4a31,0x9b623c],5);
      crest.position.set((i%2-.5)*.09,1.19+Math.sin(i*.31)*.105,.36-i*.11);
    }
    const tail=lump(body,0,.78,-.83,.047,.047,.17,dark);tail.rotation.x=.26;
    const legs=[];
    for(const z of [-.47,.35])for(const s of [-1,1]){
      const x=s*(z<0?.263:.254),height=z<0?.69:.75;
      const hip=pivot(root,x,height,z),shin=pivot(hip,0,-.35,0);
      lump(hip,0,-.142,0,boar?.118:.135,.223,.16,fur);
      lump(shin,0,-.133,0,.084,.152,.078,dark);
      for(const side of [-1,1])lump(shin,side*.039,-.30,.034,.039,.061,.096,boar?ink:[0x867b6c,0xa19482],5);
      legs.push({hip,shin,x,z,height,phase:(z<0)===(s<0)?0:Math.PI});
    }
    pose=(phase,mode,lean)=>{
      const moving=mode==='run'||mode==='charge'||mode==='walk';
      const pace=mode==='walk'?.44:1;
      const bob=moving?.036*Math.sin(phase*2):.009*Math.sin(phase);
      body.position.y=bob;body.rotation.x=lean*.105;body.rotation.z=moving?Math.sin(phase)*.027:0;
      head.rotation.x=mode==='warn'?.28:mode==='charge'?.18:Math.sin(phase*.61)*.054;
      tail.rotation.y=Math.sin(phase*.75)*.26;
      for(const l of legs){
        const cycle=phase+l.phase,forward=moving?Math.cos(cycle)*.31*pace:0;
        const lift=moving?Math.max(0,Math.sin(cycle))*.20*pace:0;
        const hipY=l.height+bob;
        const down=Math.min(.687,hipY-.034-lift),reach=Math.min(.696,Math.hypot(down,forward));
        const fold=2*Math.acos(Math.min(1,reach/.70));
        const bend=l.z<0?-1:1;
        l.hip.position.set(l.x,hipY,l.z);
        l.hip.rotation.x=-Math.atan2(forward,down)-bend*fold*.5;
        l.shin.rotation.x=bend*fold;
      }
    };
  }
  pose(0,'idle',0);
  return {root,pose,dispose(){root.removeFromParent();for(const resource of resources)resource.dispose();}};
}
