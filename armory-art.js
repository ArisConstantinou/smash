import {armoryParts} from './armory-rules.js';
// Source-rendered interchangeable parts; no concept stand-ins in the controls.
export function armoryArt(doc,id,slot='shape',choice){
 const frame=doc.createElement('span');frame.className='part-art';frame.setAttribute('aria-hidden','true');let index=slot==='shape'?63:0;
 if(slot!=='shape')for(const p of armoryParts(id)){if(p.id===slot){index+=Math.max(0,p.options.findIndex(o=>o.id===choice));break;}index+=p.options.length;}
 const img=doc.createElement('img');img.src=new URL('./assets/armory/'+id+'.png',import.meta.url).href;img.alt='';img.draggable=false;img.style.left=-(index%8)*100+'%';img.style.top=-Math.floor(index/8)*100+'%';frame.append(img);return frame;
}
