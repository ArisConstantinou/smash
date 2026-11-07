import test from 'node:test';
import assert from 'node:assert/strict';
import {createLevelPicker} from '../level-picker.js';
function fixture(width=1100,height=800){
 class Element{
  constructor(){this.children=[];this.dataset={};this.attrs={};this.events=new Map();this.hidden=false;this.value='';this.disabled=false;}
  appendChild(n){this.children.push(n);return n;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  addEventListener(k,v){if(!this.events.has(k))this.events.set(k,[]);this.events.get(k).push(v);}
  removeEventListener(k,v){this.events.set(k,(this.events.get(k)||[]).filter(f=>f!==v));}
  focus(){doc.activeElement=this;}remove(){this.removed=true;}
  emit(type,props={}){for(const fn of this.events.get(type)||[])fn({preventDefault(){},stopPropagation(){},...props});}
 }
 const ids=['cityGrid','startingLevel','cityPreviewImage','cityPreviewName','cityPreviewDescription','cityPreviewLevel','cityPreviewWeather','citySelectionStatus','cityStartLabel','cityPageLabel','cityPrevious','cityNext','cityPageDots'];
 const els=Object.fromEntries(ids.map(id=>[id,new Element()]));els.startingLevel.value='1';
 const doc={activeElement:null,getElementById:id=>els[id],createElement:()=>new Element()};
 const win=new Element();win.innerWidth=width;win.innerHeight=height;const selected=[];
 const picker=createLevelPicker({document:doc,window:win,onSelect:city=>selected.push(city.level)});
 return {els,doc,win,picker,selected,cards:els.cityGrid.children};
}
test('card selection updates the image and level without launching or writing storage',()=>{
 const f=fixture();assert.equal(f.cards.length,15);f.picker.open();assert.equal(f.doc.activeElement,f.cards[0]);
 f.cards[4].emit('click');assert.equal(f.els.startingLevel.value,'5');
 assert.ok(f.els.cityPreviewImage.src.includes('05-frosthaven'));assert.equal(f.els.cityPreviewWeather.textContent,'ΧΙΟΝΙ');
 assert.equal(f.cards.filter(c=>c.getAttribute('aria-pressed')==='true').length,1);
 assert.deepEqual(f.selected,[1,5]);
});
test('all levels remain reachable with four cards in portrait and six in landscape',()=>{
 const f=fixture(390,844);assert.equal(f.cards.filter(c=>!c.hidden).length,4);
 for(let i=0;i<3;i++)f.els.cityNext.emit('click');assert.ok(!f.cards[14].hidden);assert.equal(f.els.cityNext.disabled,true);
 f.cards[14].emit('click');f.win.innerWidth=844;f.win.innerHeight=390;f.win.emit('resize');
 assert.equal(f.els.startingLevel.value,'15');assert.equal(f.els.cityGrid.dataset.columns,'3');assert.ok(!f.cards[14].hidden);
 f.picker.open();assert.equal(f.doc.activeElement,f.cards[14]);
});
test('keyboard movement changes pages and supports first/last level and cleanup',()=>{
 const f=fixture();f.cards[0].emit('keydown',{key:'End'});assert.equal(f.doc.activeElement,f.cards[14]);
 assert.equal(f.els.startingLevel.value,'15');f.cards[14].emit('keydown',{key:'Home'});assert.equal(f.els.startingLevel.value,'1');
 f.cards[0].emit('keydown',{key:'ArrowDown'});assert.equal(f.els.startingLevel.value,'4');
 f.picker.dispose();const n=f.selected.length;f.cards[4].emit('click');assert.equal(f.selected.length,n);
 assert.ok(f.cards.every(c=>c.removed));
});
