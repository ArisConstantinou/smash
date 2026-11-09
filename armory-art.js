import {armoryParts} from './armory-rules.js?v=20261109-trophies1';
// Source-rendered interchangeable parts; no concept stand-ins in the controls.
export function armoryArt(doc,id,slot='shape',choice){
 const frame=doc.createElement('span');frame.className='part-art';frame.setAttribute('aria-hidden','true');let index=slot==='shape'?63:0;
 if(slot!=='shape')for(const p of armoryParts(id)){if(p.id===slot){index+=Math.max(0,p.options.findIndex(o=>o.id===choice));break;}index+=p.options.length;}
 if(id==='w19'||id==='w20'){
  if(['shape','strike','finish'].includes(slot)){const img=doc.createElement('img');img.src=new URL('./assets/armory/'+id+'.svg',import.meta.url).href;img.alt='';img.draggable=false;img.style.cssText='width:100%;height:100%;left:0;top:0';frame.append(img);return frame;}
  id=id==='w19'?'w09':'w05'; // Identical shared shaft, grip and core components.
 }
 const img=doc.createElement('img');img.src=new URL('./assets/armory/'+id+'.png',import.meta.url).href;img.alt='';img.draggable=false;img.style.left=-(index%8)*100+'%';img.style.top=-Math.floor(index/8)*100+'%';frame.append(img);return frame;
}
