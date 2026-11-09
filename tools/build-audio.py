#!/usr/bin/env python3
"""Rebuild the bundled recorded SFX (Python 3 + ffmpeg; no paid API).
Use --source-dir for offline rebuilding. Source SHA-256 checks fail closed.
Runtime playback never contacts these third-party download services.
"""
import argparse, array, hashlib, io, json, math, pathlib, subprocess, tempfile, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
RAGE='rage-source.mp3'
SOURCES={
 RAGE:('https://cdn.freesound.org/previews/621/621342_13749321-hq.mp3','3f66e0cdd20593dc12fb71a6942d1a52794809afa5ddff847241c9eebb86f7a8'),
 'impact.zip':('https://kenney.nl/assets/impact-sounds','029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8'),
 'hero.wav':('https://opengameart.org/sites/default/files/Valiant%20Genericus%20%28Effort%20Noises%29.wav','d4d2ccd76df9697a9dd1c0709e00443894cf2cba8811f94ebc9c55d975593bcf'),
 'hurt_01.mp3':('https://opengameart.org/sites/default/files/hurt_01.mp3','45f19e4f637ff0e8936186977aa7cb131f67a95ca68660686476a47da224322e'),
 'hurt_02.mp3':('https://opengameart.org/sites/default/files/hurt_02.mp3','7c4cd404830bf3cd5f10ff3340266f573922399d06bfb4573daf9093c5b69833'),
 'hurt_03.mp3':('https://opengameart.org/sites/default/files/hurt_03.mp3','9950c1dbbf3f2c75952510f1f2a2ab6f36586ba7e62f4f1e74ad64e82db2aa52'),
 'hurt_04.mp3':('https://opengameart.org/sites/default/files/hurt_04.mp3','a6249c89f037553c71529ece4eb443bd3cc06ab33b833c5b3d47121da284d7d8'),
}
def download(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':'https://kenney.nl/assets/impact-sounds'})
 with urllib.request.urlopen(req,timeout=45) as r:
  data=r.read(20000000)
  if len(data)>=20000000: raise ValueError('Asset exceeds size limit')
  return data

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source-dir',type=pathlib.Path);parser.add_argument('--rage-only',action='store_true');args=parser.parse_args()
 output=ROOT/'assets/audio';output.mkdir(parents=True,exist_ok=True)
 data={}
 for name,(url,expected) in SOURCES.items():
  if args.rage_only and name!=RAGE: continue
  if args.source_dir: raw=(args.source_dir/name).read_bytes()
  else:
   if name=='impact.zip': url=json.loads(download('https://kenney.nl/download-link/6173736574732f696d706163742d736f756e6473'))['url']
   raw=download(url)
  if hashlib.sha256(raw).hexdigest()!=expected: raise ValueError('Source hash mismatch: '+name)
  data[name]=raw
 rate=44100;manifest={}
 def decode(raw,start=None,end=None):
  pcm=subprocess.run(['ffmpeg','-v','error','-i','pipe:0','-f','f32le','-ac','1','-ar',str(rate),'pipe:1'],input=raw,stdout=subprocess.PIPE,check=True).stdout
  values=array.array('f');values.frombytes(pcm)
  if start is not None: values=values[int(start*rate):int(end*rate)]
  return values
 def save(name,values,source):
  peak=max(map(abs,values),default=0)
  if peak<.0001: raise ValueError('Silent clip: '+name)
  threshold=max(.00015,peak*.007)
  indices=[i for i,v in enumerate(values) if abs(v)>threshold]
  a=max(0,indices[0]-int(.005*rate));b=min(len(values),indices[-1]+int(.025*rate))
  values=values[a:b];gain=.87/max(map(abs,values))
  n=len(values)
  for i,v in enumerate(values): values[i]=v*gain*min(1,i/(rate*.002),(n-1-i)/(rate*.012))
  target=output/(name+'.mp3')
  subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ac','1','-ar',str(rate),'-i','pipe:0','-c:a','libmp3lame','-b:a','96k','-map_metadata','-1','-id3v2_version','3',str(target)],input=values.tobytes(),check=True)
  manifest[name]={'file':target.name,'source':source,'seconds':round(n/rate,4),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
 a,b=1.33,4.99
 raw=decode(data[RAGE],a,b)
 shaped=subprocess.run(['ffmpeg','-v','error','-f','f32le','-ac','1','-ar',str(rate),'-i','pipe:0',
  '-af','highpass=f=68,atempo=1.95,afade=t=out:st=1.70:d=0.16','-f','f32le','pipe:1'],
  input=raw.tobytes(),stdout=subprocess.PIPE,check=True).stdout
 save('rage-1',array.array('f',shaped),{'author':'WelvynZPorterSamples','file':RAGE,'excerpt':[a,b],'license':'CC0-1.0'})
 if args.rage_only:
  path=output/'manifest.json'; existing=json.loads(path.read_text())
  existing['clips'].update(manifest)
  url,sha=SOURCES[RAGE];existing['sources'][RAGE]={'url':url,'sha256':sha}
  path.write_text(json.dumps(existing,indent=2)+'\n')
  return
 archive=zipfile.ZipFile(io.BytesIO(data['impact.zip']))
 (output/'KENNEY-LICENSE.txt').write_bytes(archive.read('License.txt'))
 for group,stem in [('flesh','impactPunch_heavy'),('metal','impactMetal_heavy'),('masonry','impactMining'),('wood','impactWood_heavy')]:
  for n in range(3):
   source=f'Audio/{stem}_{n:03}.ogg';save(f'{group}-{n+1}',decode(archive.read(source)),{'pack':'Kenney Impact Sounds','file':source,'license':'CC0-1.0'})
 for n,(a,b) in enumerate([(.235,.48),(.75,1.10),(1.50,1.98)],1):
  save(f'exert-{n}',decode(data['hero.wav'],a,b),{'author':'tinsin','file':'Valiant Genericus (Effort Noises).wav','excerpt':[a,b],'license':'CC-BY-3.0'})
 for n in range(1,5):
  source=f'hurt_{n:02}.mp3';save(f'pain-{n}',decode(data[source]),{'author':'EZduzziteh','file':source,'license':'CC0-1.0'})
 (output/'manifest.json').write_text(json.dumps({'sampleRate':rate,'clips':manifest,'sources':{name:{'url':url,'sha256':sha} for name,(url,sha) in SOURCES.items()}},indent=2)+'\n')
 print(f'Built {len(manifest)} recorded clips, {sum(x["bytes"] for x in manifest.values())} bytes')
if __name__=='__main__':main()
