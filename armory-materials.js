import * as THREE from './vendor/three.module.js';
let textures;
function surfaceTextures(){
 if(textures)return textures;if(typeof document==='undefined')return {};
 const make=(wood)=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),data=ctx.createImageData(256,256);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const warp=x+Math.sin(y*.026)*5+Math.sin(y*.071)*1.7,phase=warp*.29+Math.sin(y*.012+warp*.035)*2,noise=Math.sin(x*127.1+y*311.7)*43758.5453,fraction=noise-Math.floor(noise),grain=Math.abs(Math.sin(phase));const value=wood?Math.min(255,175+grain*58+fraction*20-(grain<.12?42:0)):215+fraction*22+Math.sin(y*.7)*5,index=(y*256+x)*4;data.data[index]=data.data[index+1]=data.data[index+2]=value;data.data[index+3]=255;}ctx.putImageData(data,0,0);const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=wood?THREE.SRGBColorSpace:THREE.NoColorSpace;return texture;};
 const faces=Array.from({length:6},(_,side)=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,128);g.addColorStop(0,side===2?'#e7e8d4':'#8eafb7');g.addColorStop(.55,side===3?'#263635':'#42616b');g.addColorStop(1,'#152b31');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);if(side!==3){ctx.fillStyle=side%2?'#b6cbd0':'#f1e8cb';ctx.fillRect(14,12,side===2?94:19,side===2?70:89);}return c;});const environment=new THREE.CubeTexture(faces);environment.colorSpace=THREE.SRGBColorSpace;environment.needsUpdate=true;
 textures={wood:make(true),metal:make(false),environment};return textures;
}
// Four shared surface classes per equipped asset. Geometry is grouped once per
// class, rather than creating a draw call for every rivet or wrap segment.
export function createArmoryMaterials(core='none'){
 const maps=surfaceTextures(),shared={vertexColors:true,flatShading:true,envMap:maps.environment||null,envMapIntensity:.85},glow={arc:0x62ddeb,fire:0xff7d27,frost:0xa4e8f5,impact:0xe3a251}[core]||0x000000;
 return [new THREE.MeshStandardMaterial({...shared,roughness:.84,metalness:0,map:maps.wood||null,bumpMap:maps.wood||null,bumpScale:.008}),new THREE.MeshStandardMaterial({...shared,roughness:.79,metalness:0}),new THREE.MeshStandardMaterial({...shared,roughness:.48,metalness:.58,roughnessMap:maps.metal||null}),new THREE.MeshStandardMaterial({...shared,roughness:.35,metalness:.25,emissive:glow,emissiveIntensity:core==='none'?0:.60})];
}
export function disposeArmoryMaterials(materials){for(const m of Array.isArray(materials)?materials:[materials])m.dispose();}
