import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {makeWarrior} from '../models.js';
import {createCharacterProgression,xpForNextLevel,getCharacterStats,MAX_CHARACTER_LEVEL} from '../character-progression.js';
import {menuProgressSnapshot,createForgeMenu} from '../menu.js';

const progressOptions={xpForNextLevel,getCharacterStats,maxLevel:MAX_CHARACTER_LEVEL};

test('menu track measures XP inside the current level, not lifetime progress',()=>{
  const character=createCharacterProgression(4);character.xp=12;
  const before=structuredClone(character),p=menuProgressSnapshot(character,progressOptions);
  assert.equal(p.level,4);assert.equal(p.target,24);assert.equal(p.percent,50);assert.equal(p.ratio,.5);
  assert.deepEqual(character,before,'Reading the menu does not change saved XP or materials');
});
test('a new player starts at the left; max level has a meaningful full track',()=>{
  const start=menuProgressSnapshot(null,progressOptions),end=menuProgressSnapshot(createCharacterProgression(15),progressOptions);
  assert.equal(start.hasSave,false);assert.equal(start.level,1);assert.equal(start.ratio,0);assert.equal(start.target,8);
  assert.equal(end.isMax,true);assert.equal(end.ratio,1);assert.equal(end.percent,100);assert.equal(end.target,0);
});
test('menu keeps earned equipment when a higher-level saved character still carries wood',()=>{
  const character=createCharacterProgression(10);character.weaponId='log';character.xp=36;
  const p=menuProgressSnapshot(character,progressOptions);
  assert.equal(p.weaponTier,0);assert.equal(p.weaponName,'ΚΟΥΤΣΟΥΡΟ');assert.equal(p.percent,50);
});

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const menuHtml=html.slice(html.indexOf('<section id="menu"'),html.indexOf('<section id="hud"'));
class Classes {
  values=new Set();add(...v){v.forEach(x=>this.values.add(x));}remove(...v){v.forEach(x=>this.values.delete(x));}
  toggle(v,force){const on=force??!this.values.has(v);on?this.values.add(v):this.values.delete(v);return on;}
  contains(v){return this.values.has(v);}
}
function fixture({gpu=true,reduced=false}={}){
  let now=0,renderCount=0,modelCount=0,renderDisposed=0;const events=[],elements=new Map();
  class Element {
    constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;this.hidden=false;this.disabled=false;this.inert=false;this.dataset={};this.classList=new Classes();this.children=[];this.attrs={};this.listeners=new Map();this.textContent='';this.style={setProperty(k,v){this[k]=v;}};}
    setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
    addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,[]);this.listeners.get(k).push(fn);}
    removeEventListener(k,fn){this.listeners.set(k,(this.listeners.get(k)||[]).filter(x=>x!==fn));}
    appendChild(child){this.children.push(child);return child;}remove(){this.removed=true;}
    getBoundingClientRect(){return {left:0,top:0,width:440,height:460};}focus(){doc.activeElement=this;}
    emit(type,data={}){const e={target:this,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...data};for(const fn of this.listeners.get(type)||[])fn(e);return e;}
    click(){if(!this.disabled)this.emit('click');}
  }
  for(const match of menuHtml.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)){
    const e=new Element(match[1],match[3]);e.hidden=/\bhidden\b/.test(match[2]);e.disabled=/\bdisabled\b/.test(match[2]);elements.set(e.id,e);
  }
  const header=new Element(),footer=new Element(),consolePanel=new Element(),energy=Array.from({length:5},()=>new Element('i'));
  elements.get('menu').querySelector=s=>({'.forge-header':header,'.forge-footer':footer,'.forge-console':consolePanel})[s]||null;
  elements.get('menu').querySelectorAll=s=>s==='.forge-energy>i'?energy:s==='button'?[...elements.values()].filter(e=>e.tagName==='BUTTON'):[];
  elements.get('roundPicker').querySelectorAll=()=>['closeRoundPickerButton','startingLevel','testStartButton'].map(x=>elements.get(x)).filter(e=>!e.disabled);
  const doc={hidden:false,activeElement:null,getElementById:id=>elements.get(id),createElement:tag=>new Element(tag)};
  const media={matches:reduced,addEventListener(){},removeEventListener(){}};
  const win={devicePixelRatio:1,performance:{now:()=>now},matchMedia:()=>media};
  class Renderer {constructor(){if(!gpu)throw new Error('No WebGL');}setPixelRatio(){}setSize(){}setClearColor(){}render(){renderCount++;}dispose(){renderDisposed++;}forceContextLoss(){}}
  const controller=createForgeMenu({THREE:{...THREE,WebGLRenderer:Renderer},makeWarrior:()=>{modelCount++;return makeWarrior();},...progressOptions,
    document:doc,window:win,onSound:(name,details)=>events.push({name,details}),onSettings:()=>events.push({name:'settings'})});
  return {controller,e:id=>elements.get(id),doc,events,advance(dt){now+=dt*1000;controller.update(dt);},counts:()=>({renderCount,modelCount,renderDisposed})};
}

test('menu readiness preserves rich buttons and leaves Continue visible but disabled without a save',()=>{
  const f=fixture();
  assert.equal(f.e('resumeCharacterButton').hidden,false);assert.equal(f.e('resumeCharacterButton').disabled,true);
  f.controller.setReady(true);assert.equal(f.e('startButton').disabled,false);assert.equal(f.e('resumeCharacterButton').disabled,true);
  const saved=createCharacterProgression(4);saved.xp=12;f.controller.updateProgress(saved);
  assert.equal(f.e('resumeCharacterButton').hidden,false);assert.equal(f.e('resumeCharacterButton').disabled,false);
  assert.equal(f.e('menuResumeDetail').textContent,'LEVEL 04 · 50%');
  assert.equal(f.e('menuProgressTrack').getAttribute('aria-valuenow'),'50');
  f.controller.dispose();
});
test('the real avatar walks to saved XP, idles there, and never renders while the menu is hidden',()=>{
  const f=fixture();const saved=createCharacterProgression(4);saved.xp=12;
  f.controller.updateProgress(saved);f.controller.setReady(true);
  assert.equal(f.controller.progress.visualRatio,0);
  for(let n=0;n<80;n++)f.advance(.05);
  assert.equal(f.controller.progress.visualRatio,.5);assert.equal(f.e('menuProgressHero').style.left,'50.0000%');
  const before=f.counts();assert.ok(before.renderCount>0);assert.equal(before.modelCount,1);
  for(let n=0;n<4;n++)f.controller.updateProgress(structuredClone(saved));
  assert.equal(f.controller.progress.visualRatio,.5,'Checkpoints do not restart the walk');
  assert.equal(f.counts().modelCount,1,'No model rebuild on repeated saves');
  f.controller.setVisible(false);for(let n=0;n<20;n++)f.advance(.05);
  assert.equal(f.counts().renderCount,before.renderCount);
  f.controller.setVisible(true);assert.equal(f.controller.progress.visualRatio,0);
  f.controller.dispose();assert.equal(f.counts().renderDisposed,1);
});
test('round selection stays a separate dialog and returns focus without touching saved progression',()=>{
  const f=fixture();f.controller.setReady(true);const saved=createCharacterProgression(6);saved.xp=19;f.controller.updateProgress(saved);
  f.e('chooseRoundButton').click();assert.equal(f.controller.panelOpen,true);assert.equal(f.e('forgeLayout').inert,true);assert.equal(f.doc.activeElement,f.e('startingLevel'));
  assert.equal(f.e('chooseRoundButton').getAttribute('aria-expanded'),'true');
  assert.equal(f.controller.closePanels(),true);assert.equal(f.controller.closePanels(),false);
  assert.equal(f.e('forgeLayout').inert,false);assert.equal(f.doc.activeElement,f.e('chooseRoundButton'));
  assert.equal(f.controller.progress.level,6);assert.equal(f.controller.progress.xp,19);
  f.controller.dispose();
});
test('no-WebGL menu still positions saved progress and supports repeated independent material sounds',()=>{
  const f=fixture({gpu:false});const saved=createCharacterProgression(4);saved.xp=18;f.controller.updateProgress(saved);
  assert.equal(f.e('menuHeroCanvas').hidden,true);assert.equal(f.e('menuHeroFallback').hidden,false);
  assert.equal(f.e('menuProgressHero').style.left,'75.0000%');assert.equal(f.e('startButton').disabled,true);
  f.e('menuMetalProp').click();f.advance(.25);f.e('menuWoodProp').click();
  assert.deepEqual(f.events.filter(e=>['menuMetal','menuWood'].includes(e.name)).map(e=>e.name),['menuMetal','menuWood']);
  assert.equal(f.controller.progress.xp,18,'Workshop play grants no fake progression');
  f.e('menuSettingsButton').click();assert.ok(f.events.some(e=>e.name==='settings'));
  f.controller.dispose();
});
test('reduced motion retains exact progress without a travel animation',()=>{
  const f=fixture({reduced:true});const saved=createCharacterProgression(4);saved.xp=6;f.controller.updateProgress(saved);f.controller.setReady(true);
  assert.equal(f.controller.progress.visualRatio,.25);assert.equal(f.e('menuProgressHero').style.left,'25.0000%');
  f.controller.dispose();
});
