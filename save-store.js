// Candidate and protected root share port8000, hence the same browser origin.
// Preview may read a legacy checkpoint as a starting point, but only writes its
// own keys. Public Pages retains the existing keys and earned checkpoints.
export function createSaveStore(storage,{preview=false}={}){
 const key=name=>preview?name.replace(/^ironfall\./,'ironfall.preview.'):name;
 return {isPreview:preview,key,
  read(name,fallback){try{let raw=storage.getItem(key(name));if(raw===null&&preview)raw=storage.getItem(name);return JSON.parse(raw)??fallback;}catch{return fallback;}},
  write(name,value){try{const raw=JSON.stringify(value);storage.setItem(key(name),raw);return storage.getItem(key(name))===raw;}catch{return false;}},
 };
}
