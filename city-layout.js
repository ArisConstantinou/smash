// The city is deliberately laid out, rather than randomly scattered: every
// block has a street frontage and all eleven avenues stay connected.
export const CITY_BOUNDS = 118;
export const CITY_SPACING = 22;
export const CITY_ROAD_WIDTH = 6.8;
export const CITY_BUILDING_COUNT = 100;
export const CITY_ROADS = Object.freeze(Array.from({ length: 11 }, (_, i) => (i - 5) * CITY_SPACING));

export const CITY_DISTRICTS = Object.freeze([
  { id: 'civic-center', name: 'ΚΕΝΤΡΟ ΤΗΣ ΠΟΛΗΣ', weather: 'rain', x: 0, z: 0, color: 0xe3b766 },
  { id: 'frost-quarter', name: 'ΠΑΓΩΜΕΝΗ ΣΥΝΟΙΚΙΑ', weather: 'snow', x: -77, z: -66, color: 0xb5d8df },
  { id: 'foundry', name: 'ΒΙΟΜΗΧΑΝΙΚΗ ΖΩΝΗ', weather: 'ash', x: 77, z: -66, color: 0xe9945a },
  { id: 'medical-quarter', name: 'ΙΑΤΡΙΚΗ ΣΥΝΟΙΚΙΑ', weather: 'rain', x: 77, z: 33, color: 0xdce8db },
  { id: 'west-precinct', name: 'ΔΥΤΙΚΗ ΣΥΝΟΙΚΙΑ', weather: 'rain', x: -77, z: 33, color: 0x76b5d8 },
  { id: 'south-gardens', name: 'ΝΟΤΙΟΙ ΚΗΠΟΙ', weather: 'rain', x: 0, z: 88, color: 0x94b488 },
  { id: 'market-quarter', name: 'ΕΜΠΟΡΙΚΗ ΣΥΝΟΙΚΙΑ', weather: 'rain', x: 0, z: -66, color: 0xc6af8a },
]);

export function cityRegionAt(x, z) {
  if (x < -44 && z < -22) return CITY_DISTRICTS[1];
  if (x > 44 && z < -22) return CITY_DISTRICTS[2];
  if (Math.abs(x) < 44 && Math.abs(z) < 44) return CITY_DISTRICTS[0];
  if (z > 55) return CITY_DISTRICTS[5];
  if (x >= 44 && z >= -22) return CITY_DISTRICTS[3];
  if (x <= -44 && z >= -22) return CITY_DISTRICTS[4];
  return CITY_DISTRICTS[6];
}

const civicLabels = {
  townhall: 'ΔΗΜΑΡΧΕΙΟ', police: 'ΑΣΤΥΝΟΜΙΑ', hospital: 'ΝΟΣΟΚΟΜΕΙΟ',
  skyscraper: 'ΟΥΡΑΝΟΞΥΣΤΗΣ', construction: 'ΕΡΓΟΤΑΞΙΟ', warehouse: 'ΑΠΟΘΗΚΗ',
  office: 'ΓΡΑΦΕΙΑ', shop: 'ΚΑΤΑΣΤΗΜΑ', apartment: 'ΠΟΛΥΚΑΤΟΙΚΙΑ', townhouse: 'ΚΑΤΟΙΚΙΑ',
};
const special = {
  townhall: [[4,4],[5,5]],
  police: [[2,4],[0,6],[8,1],[3,8]],
  hospital: [[7,5],[9,7],[1,1],[5,8]],
  construction: [[6,1],[7,1],[8,2],[9,2],[7,0],[6,2],[8,0],[9,0],[2,0],[0,3]],
  skyscraper: [[3,3],[4,3],[5,3],[6,3],[3,4],[6,4],[3,5],[4,5],[5,4],[6,5],[4,6],[5,6]],
};

function plotHash(seed, row, col) {
  let n = Math.imul((seed | 0) ^ 0x9e3779b9, 374761393) ^ Math.imul(row + 1, 668265263) ^ Math.imul(col + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

export function createCityLayout(seed = 1, city = null) {
  const plots = [];
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) {
    const x = (col - 4.5) * CITY_SPACING, z = (row - 4.5) * CITY_SPACING;
    const rotation = Math.abs(x) > Math.abs(z) ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : (z < 0 ? 0 : Math.PI);
    plots.push({ id: `block-${row}-${col}`, row, col, x, z, rotation, kind: null,
      variant: plotHash(seed, row, col) % 4, districtId: cityRegionAt(x,z).id });
  }
  for (const [kind, coordinates] of Object.entries(special)) {
    for (const [col, row] of coordinates) plots[row * 10 + col].kind = kind;
  }
  const assign = (kind, count, score) => {
    const available = plots.filter(p => !p.kind).sort((a, b) => score(a) - score(b) || a.row - b.row || a.col - b.col);
    available.slice(0, count).forEach(p => { p.kind = kind; });
  };
  assign('warehouse', 6, p => Math.hypot(p.x - 77, p.z + 66));
  assign('office', 10, p => Math.hypot(p.x, p.z));
  assign('shop', 12, p => Math.min(Math.abs(p.x), Math.abs(p.z)) + Math.hypot(p.x,p.z) * .12);
  assign('apartment', 16, p => Math.hypot(p.x + 55, p.z + 44));
  if(city?.mix?.length){
    for(const p of plots)p.kind=city.mix[plotHash(seed,p.row,p.col)%city.mix.length];
    // Keep all civic/interaction types available without a fixed skyline.
    const kinds=['townhall','police','hospital','construction','skyscraper','warehouse','office','shop','apartment','townhouse'];
    kinds.forEach((kind,i)=>{plots[((i*17+(seed%10))%100)].kind=kind;});
  }
  plots.forEach(p => { p.kind ||= 'townhouse'; p.label = civicLabels[p.kind]; p.isLandmark = ['townhall','police','hospital','construction'].includes(p.kind); });
  return {
    bounds: CITY_BOUNDS, spacing: CITY_SPACING, roadWidth: CITY_ROAD_WIDTH,
    roads: CITY_ROADS, plots, districts: CITY_DISTRICTS,
    landmarks: plots.filter(p => p.isLandmark).map(p => ({ id:p.id, type:p.kind, kind:p.kind, x:p.x, z:p.z, name:p.label, districtId:p.districtId })),
  };
}
