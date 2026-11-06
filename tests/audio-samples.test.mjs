import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RecordedSounds,SAMPLE_NAMES,SAMPLE_GROUPS} from '../audio-samples.js';
const bytes=()=>new ArrayBuffer(256);
test('recorded loading is limited to four requests and decoding is cached',async()=>{
 let active=0,peak=0,calls=0,decodes=0;
 const bank=new RecordedSounds({fetcher:async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return{ok:true,arrayBuffer:async()=>bytes()};}});
 const ctx={state:'running',decodeAudioData:async()=>{decodes++;return{duration:.2};}};
 await Promise.all([bank.preload(),bank.preload()]);await Promise.all([bank.decode(ctx),bank.decode(ctx)]);
 assert.equal(calls,SAMPLE_NAMES.length);assert.ok(peak<=4);assert.equal(decodes,SAMPLE_NAMES.length);
 await bank.decode(ctx);assert.equal(decodes,SAMPLE_NAMES.length);bank.dispose();
});
test('recorded variations do not repeat consecutively and fallback is explicit',()=>{
 const bank=new RecordedSounds();assert.equal(bank.choose('wood'),null);
 for(const name of SAMPLE_GROUPS.wood)bank.buffers.set(name,{name});
 let previous;for(let n=0;n<20;n++){const current=bank.choose('wood',()=>0).name;assert.notEqual(current,previous);previous=current;}
 bank.dispose();assert.equal(bank.choose('wood'),null);
});
test('network failure leaves the procedural path available instead of rejecting',async()=>{
 const bank=new RecordedSounds({fetcher:async()=>{throw new Error('offline');}});
 assert.equal(await bank.preload(),0);assert.equal(bank.failed,SAMPLE_NAMES.length);assert.equal(bank.choose('flesh'),null);bank.dispose();
});
test('disposing during a load cancels requests and cannot repopulate caches',async()=>{
 const bank=new RecordedSounds({fetcher:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
 const loading=bank.preload();bank.dispose();await loading;assert.equal(bank.encoded.size,0);assert.equal(bank.controllers.size,0);
});
test('the complete small MP3 bank, source provenance and attributions are bundled',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../assets/audio/manifest.json',import.meta.url)));
 assert.equal(Object.keys(manifest.clips).length,SAMPLE_NAMES.length);let total=0;
 for(const name of SAMPLE_NAMES){const clip=manifest.clips[name];const data=fs.readFileSync(new URL('../assets/audio/'+clip.file,import.meta.url));assert.equal(data.length,clip.bytes);assert.ok(clip.seconds>.05&&clip.seconds<2);total+=data.length;}
 assert.ok(total<200000);assert.match(fs.readFileSync(new URL('../assets/audio/CREDITS.md',import.meta.url),'utf8'),/tinsin/);
});
