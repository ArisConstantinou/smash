// Bounded, allocation-free Wasm scratch space. Each call copies a cached convex
// piece in one typed-array operation, never calls back into JS per vertex.
let kernel=null,view=null,enabled=true,loading=null;
const status={ready:false,calls:0,fallbacks:0,error:''};
export function collisionWasmStatus(){return {...status,active:enabled&&!!kernel};}
export function setCollisionWasmEnabled(value){enabled=!!value;}
export async function enableCollisionWasm(bytes){
  const result=await WebAssembly.instantiate(bytes,{}),exports=(result.instance||result).exports;
  if(typeof exports.sweep!=='function'||typeof exports.input_ptr!=='function'||!exports.memory)throw new Error('Invalid collision kernel');
  kernel=exports;view=new Float64Array(exports.memory.buffer,exports.input_ptr(),32768);
  status.ready=true;status.error='';return true;
}
export function loadCollisionWasm(){
  if(!loading)loading=(async()=>{
    try{
      const response=await fetch(new URL('./assets/wasm/collision.wasm',import.meta.url));
      if(!response.ok)throw new Error('WASM HTTP '+response.status);
      return await enableCollisionWasm(await response.arrayBuffer());
    }catch(error){status.error=String(error.message||error);return false;}
  })();
  return loading;
}
export function sweepPartWasm(part,start,direction,radius,maximum){
  if(!enabled||!kernel)return undefined;
  if(part.wasmRevision!==part.worldRevision){
    const length=part.worldVertices.length*3+part.worldTriangles.length*12+part.edges.length*6;
    if(length>32768){status.fallbacks++;return undefined;}
    let data=part.wasmData;
    if(!data||data.length!==length)data=part.wasmData=new Float64Array(length);
    let offset=0;
    const put=p=>{data[offset++]=p.x;data[offset++]=p.y;data[offset++]=p.z;};
    for(const p of part.worldVertices)put(p);
    for(const t of part.worldTriangles){put(t.a);put(t.b);put(t.c);put(t.normal);}
    for(const [a,b] of part.edges){put(part.worldVertices[a]);put(part.worldVertices[b]);}
    part.wasmRevision=part.worldRevision;
  }
  view.set(part.wasmData);status.calls++;
  const t=kernel.sweep(part.worldVertices.length,part.worldTriangles.length,part.edges.length,part.closed?1:0,
    start.x,start.y,start.z,direction.x,direction.y,direction.z,radius,maximum);
  return t<0?null:t;
}
