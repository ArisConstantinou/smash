/* Exact sphere/convex-piece sweep used by geometry-collision.js.
 * No libc, threads, allocations, randomness, or collision approximation.
 * Input is one contiguous f64 batch: vertices, triangles (a,b,c,n), edges.
 * Build: sh tools/build-wasm.sh  (Clang with wasm32 support).
 */
typedef struct { double x,y,z; } V;
static double input[32768];
static double ab(double x){return __builtin_fabs(x);}
static double lo(double a,double b){return a<b?a:b;}
static double hi(double a,double b){return a>b?a:b;}
static V readv(int i){return (V){input[i],input[i+1],input[i+2]};}
static V sub(V a,V b){return (V){a.x-b.x,a.y-b.y,a.z-b.z};}
static V plus(V a,V b,double t){return (V){a.x+b.x*t,a.y+b.y*t,a.z+b.z*t};}
static double dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
static int contains(int off,V p){
 V a=readv(off),v0=sub(readv(off+3),a),v1=sub(readv(off+6),a),v2=sub(p,a);
 double aa=dot(v0,v0),bb=dot(v1,v1),v=dot(v0,v1),pa=dot(v2,v0),pb=dot(v2,v1),det=aa*bb-v*v;
 if(ab(det)<1e-14)return 0;
 double u=(bb*pa-v*pb)/det,w=(aa*pb-v*pa)/det;
 return u>=-1e-6 && w>=-1e-6 && u+w<=1+1e-6;
}
static double quadratic(double a,double b,double c,double maximum){
 if(c<=1e-12)return 0;if(a<1e-16)return -1;
 double d=b*b-4*a*c,roundoff=2.220446049250313e-16*16*hi(1,hi(b*b,ab(4*a*c)));
 if(d < -roundoff)return -1;
 double root=__builtin_sqrt(hi(0,d)),q=-.5*(b+(b>=0?root:-root));
 double t=q==0?-b/(2*a):lo(q/a,c/q);
 return t>=-1e-10 && t<=maximum+1e-10 ? hi(0,t):-1;
}
__attribute__((export_name("input_ptr"))) unsigned input_ptr(void){return (unsigned)input;}
__attribute__((export_name("sweep"))) double sweep(int nv,int nt,int ne,int closed,double sx,double sy,double sz,double dx,double dy,double dz,double radius,double maximum){
 if(nv<0||nt<0||ne<0||nv*3+nt*12+ne*6>32768)return -1;
 V start={sx,sy,sz},direction={dx,dy,dz};int triangles=nv*3,edges=triangles+nt*12,found=0;
 double best=maximum;
 if(closed){int inside=1;for(int i=0;i<nt;i++){int o=triangles+i*12;if(dot(readv(o+9),sub(start,readv(o)))>1e-6){inside=0;break;}}if(inside)return 0;}
 for(int i=0;i<nt;i++){
  int o=triangles+i*12;V n=readv(o+9);double distance=dot(n,sub(start,readv(o))),speed=dot(n,direction);
  if(ab(distance)<=radius+1e-10 && contains(o,plus(start,n,-distance)))return 0;
  if(ab(speed)<1e-14)continue;
  for(int j=0;j<(radius>0?2:1);j++){
   int side=radius>0?(j==0?-1:1):0;double t=(side*radius-distance)/speed;
   if(t < -1e-10 || t>best+1e-10)continue;
   if(contains(o,plus(plus(start,direction,hi(0,t)),n,-side*radius))){best=hi(0,t);found=1;}
  }
 }
 double rr=radius*radius;
 for(int i=0;i<ne;i++){
  int o=edges+i*6;V a=readv(o),edge=sub(readv(o+3),a);double length=dot(edge,edge);if(length<1e-14)continue;
  V offset=sub(start,a);double alongStart=dot(offset,edge)/length,alongSpeed=dot(direction,edge)/length;
  V radialStart=plus(offset,edge,-alongStart),radialSpeed=plus(direction,edge,-alongSpeed);
  double aa=dot(radialSpeed,radialSpeed),bb=2*dot(radialStart,radialSpeed),cc=dot(radialStart,radialStart)-rr;
  if(cc<=1e-12 && alongStart>=-1e-6 && alongStart<=1+1e-6)return 0;
  double t=quadratic(aa,bb,cc,best);
  if(t>=0){double u=alongStart+alongSpeed*t;if(u>=-1e-6 && u<=1+1e-6){best=t;found=1;}}
 }
 double speed2=dot(direction,direction);
 for(int i=0;i<nv;i++){V offset=sub(start,readv(i*3));double t=quadratic(speed2,2*dot(direction,offset),dot(offset,offset)-rr,best);if(t>=0){best=t;found=1;}}
 return found?best:-1;
}
