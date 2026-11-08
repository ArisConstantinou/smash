import {partDefinitions} from './mount-rules.js?v=20261108-workshop1';
// Offline renders of the actual interchangeable geometry, not concept stand-ins.
export function partArt(doc,kind,slot,option,tier=0){
 const frame=doc.createElement('span');frame.className='part-art';frame.setAttribute('aria-hidden','true');
 const defs=partDefinitions(kind);let index=slot==='chassis'?63:0;
 if(slot!=='chassis'){for(const p of defs){if(p.id===slot){index+=Math.max(0,p.options.findIndex(o=>o.id===option));break;}index+=p.options.length;}}
 const img=doc.createElement('img');img.alt='';img.src=new URL(`./assets/workshop/${kind==='player'?'player-'+Math.max(0,Math.min(4,tier)):kind}.png`,import.meta.url).href;img.draggable=false;img.style.left=-(index%8)*100+'%';img.style.top=-Math.floor(index/8)*100+'%';frame.append(img);return frame;
}
export function toolArt(doc,id){const span=doc.createElement('span');span.className='tool-art';span.setAttribute('aria-hidden','true');span.innerHTML=`<svg viewBox="0 0 64 64"><use href="${new URL('./assets/workshop/tools.svg',import.meta.url).href}#${id}"/></svg>`;return span;}
