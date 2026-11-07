// FPS comes from UNCLAMPED presented-frame timestamps, not simulation dt.
// GPU command submission time is labelled render CPU, never "GPU milliseconds".
export class FrameTelemetry{
  constructor(){this.previous=null;this.windowStart=null;this.intervals=0;this.samples=[];this.history=[];this.droppedMs=0;this.last=null;}
  reset(){this.previous=null;this.windowStart=null;this.intervals=0;this.samples.length=0;}
  sample(now,metrics={}){
    if(!Number.isFinite(now))return null;
    if(this.previous===null){this.previous=now;this.windowStart=now;return null;}
    const ms=now-this.previous;this.previous=now;
    if(ms<=0)return null;
    this.intervals++;this.samples.push(ms);
    if(now-this.windowStart<500)return null;
    const sorted=this.samples.slice().sort((a,b)=>a-b);
    this.last={...metrics,fps:this.intervals*1000/(now-this.windowStart),frameMs:ms,
      p95:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)],droppedMs:this.droppedMs};
    this.history.push({at:now,...this.last});if(this.history.length>120)this.history.shift();
    this.windowStart=now;this.intervals=0;this.samples.length=0;return this.last;
  }
}
export const MAX_FRAME_SIMULATION=.1,MAX_SIMULATION_CPU_MS=10;
