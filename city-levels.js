// Each postcard and playable test city share this definition. Normal new/resume
// runs keep the original city and saves; selecting a postcard is a separate run.
const definitions = [
  ['oldhaven','ΛΙΘΟΠΟΛΗ','Παλιά στέγαστρα και στενά','rain',0x354f50,0x49664f,0x737f75,['townhouse','townhouse','shop','apartment']],
  ['tradehaven','ΕΜΠΟΡΟΥΠΟΛΗ','Η πόλη των αγορών','rain',0x315969,0x49626a,0x9b9781,['shop','shop','warehouse','apartment']],
  ['greenhaven','ΚΗΠΟΥΠΟΛΗ','Πράσινες γειτονιές','rain',0x4d6b66,0x5c7857,0x9caa8a,['townhouse','townhouse','townhall','shop']],
  ['copperhaven','ΧΑΛΚΟΥΠΟΛΗ','Χαλκός και καμινάδες','ash',0x6b4941,0x695246,0x9b8771,['warehouse','warehouse','office','construction']],
  ['frosthaven','ΠΑΓΟΠΟΛΗ','Οι δρόμοι του βορρά','snow',0x718b9a,0xa7bcc2,0xc1d0cf,['apartment','townhouse','hospital','apartment']],
  ['metrohaven','ΜΗΤΡΟΠΟΛΗ','Πύργοι πάνω από την πόλη','rain',0x3f5969,0x536873,0x93a4a6,['skyscraper','office','office','apartment']],
  ['nighthaven','ΝΥΧΤΟΥΠΟΛΗ','Φώτα μέσα στην ομίχλη','rain',0x202b44,0x384654,0x6c7c8f,['office','skyscraper','shop','apartment']],
  ['works','ΕΡΓΟΠΟΛΗ','Γερανοί και εργοτάξια','ash',0x6e5d46,0x74654b,0xab9a7a,['construction','construction','warehouse','office']],
  ['crown','ΣΤΕΜΜΑΤΟΠΟΛΗ','Η πόλη των δημαρχείων','rain',0x52615a,0x64725a,0xb3ac8d,['townhall','townhall','shop','townhouse']],
  ['ironhaven','ΣΙΔΗΡΟΥΠΟΛΗ','Ατσάλι και βιομηχανία','ash',0x4f4440,0x55514a,0x8c8274,['warehouse','office','construction','skyscraper']],
  ['whitehaven','ΛΕΥΚΟΥΠΟΛΗ','Χιόνι και λευκοί πύργοι','snow',0x8b9f9c,0xc1ccca,0xe0ded0,['hospital','hospital','office','townhouse']],
  ['amberhaven','ΚΕΧΡΙΜΠΑΡΟΥΠΟΛΗ','Ζεστά φώτα στις στέγες','rain',0x736250,0x7c7156,0xb9ab85,['townhouse','shop','apartment','townhall']],
  ['crystalhaven','ΚΡΥΣΤΑΛΛΟΥΠΟΛΗ','Η παγωμένη μητρόπολη','snow',0x536c8b,0x8babc5,0xb3cbdc,['skyscraper','skyscraper','office','hospital']],
  ['ashhaven','ΣΤΑΧΤΟΠΟΛΗ','Η πόλη της στάχτης','ash',0x643e37,0x59413a,0x8f6e59,['construction','warehouse','skyscraper','warehouse']],
  ['stormhaven','ΚΑΤΑΙΓΙΔΟΥΠΟΛΗ','Ορίζοντας μέσα στη θύελλα','rain',0x253b51,0x3c586a,0x7f9caa,['skyscraper','skyscraper','office','construction']],
];
export const LEVEL_CITIES = Object.freeze(definitions.map(([id,name,description,weather,sky,ground,stone,mix],i)=>Object.freeze({
  id,level:i+1,name,description,weather,sky,ground,stone,mix:Object.freeze(mix),
  seed:10093+(i+1)*7919,
  image:`./assets/cities/${String(i+1).padStart(2,'0')}-${id}.webp`,
  weatherLabel:weather==='snow'?'ΧΙΟΝΙ':weather==='ash'?'ΣΤΑΧΤΗ':'ΒΡΟΧΗ',
})));
export function getLevelCity(value=1) {
  const n=Number(value);
  return LEVEL_CITIES[Math.min(15,Math.max(1,Number.isFinite(n)?Math.floor(n):1))-1];
}
