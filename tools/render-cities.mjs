// Bake real gameplay geometry into small WebP postcards once, not on the phone.
// Uses only bundled assets. No remote image service or runtime WebGL preview.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {LEVEL_CITIES} from '../city-levels.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const html=`<!doctype html><meta charset="utf-8"><style>*{margin:0}canvas{display:block}</style><script type="module">
import * as THREE from '/vendor/three.module.js';
import {createWorld} from '/world.js';
import {LEVEL_CITIES} from '/city-levels.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(640,400);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1.6,.1,330);
const fill=new THREE.HemisphereLight(0xb9dcd9,0x536650,1.45);scene.add(fill);
const sun=new THREE.DirectionalLight(0xffdfb1,2.25);sun.position.set(-25,65,20);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-70,right:70,top:70,bottom:-70,far:180});sun.shadow.normalBias=.06;scene.add(sun);
const rim=new THREE.DirectionalLight(0x80c7dd,1.15);rim.position.set(8,14,-18);scene.add(rim);
let world;
window.renderCity=async index=>{
 const city=LEVEL_CITIES[index];world?.dispose();world=createWorld(scene,{seed:city.seed,round:1,city});
 scene.background=new THREE.Color(city.sky);scene.fog=new THREE.Fog(city.sky,90,210);
 camera.position.set(61,49,74);camera.lookAt(-6,3,-7);
 world.updateVisibility({x:0,z:0});world.update(0,1.6,{x:0,z:0},city.weather);
 await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
 return renderer.domElement.toDataURL('image/webp',.88).split(',')[1];
};
window.ready=true;
</script>`;
const server=createServer(async(req,res)=>{try{
 res.setHeader('Access-Control-Allow-Origin','*');
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname==='/__city-render'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 const file=resolve(root,'.'+pathname);if(!file.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:640,height:400}});page.on('pageerror',error=>console.error(error));
 await page.setContent(`<base href="http://127.0.0.1:${server.address().port}/">`+html);await page.waitForFunction(()=>window.ready);
 await mkdir(resolve(root,'assets/cities'),{recursive:true});
 for(let i=0;i<LEVEL_CITIES.length;i++){
  const data=Buffer.from(await page.evaluate(i=>window.renderCity(i),i),'base64');
  await writeFile(resolve(root,LEVEL_CITIES[i].image),data);console.log(LEVEL_CITIES[i].image,data.length);
 }
}finally{await browser?.close();await new Promise(r=>server.close(r));}
