const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..');
const core=require('../assets/js/vehicle-search-core-v1.9.0.js');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/unified_catalog.json'),'utf8'));
const originals=catalog.entries.filter(entry=>entry.public!==false);
const index=core.buildIndex(catalog.entries);
const publicIds=originals.map(e=>e.id).sort();
assert.deepEqual(index.groups.flatMap(g=>g.entries.map(e=>e.id)).sort(),publicIds,'Grouping must not discard or duplicate source identities.');
for(const [query,brand,label,year] of [
  ['corolla','TOYOTA','COROLLA',''],
  ['Corola','TOYOTA','COROLLA',''],
  ['toyota corolla 2020','TOYOTA','COROLLA','2020'],
  ['VW Gol Trend 2018','VOLKSWAGEN','GOL TREND','2018'],
  ['hilux 2019','TOYOTA','HILUX','2019'],
  ['Peugeot 2008','PEUGEOT','2008',''],
  ['2008','PEUGEOT','2008',''],
  ['Peugeot 2008 2018','PEUGEOT','2008','2018'],
  ['208 2020','PEUGEOT','208','2020'],
  ['CITROËN C3','CITROEN','C3',''],
  ['Mb Sprinter 0 km','MERCEDES BENZ','SPRINTER','0km'],
]){
  const result=core.search(index,query);
  assert.equal(result.year,year,query);
  assert.ok(result.items.some(g=>g.brand===brand&&core.normalize(g.label)===core.normalize(label)),query);
  console.log('OK search:',query,'->',result.items[0]?.title,result.year);
}
assert.equal(core.search(index,'vehiculo inexistente zxq').total,0);
assert.equal(core.search(index,'Corolla 2099').total,0);
assert.equal(core.search(index,'').total,0);
const gol=index.groups.find(g=>g.brand==='VOLKSWAGEN'&&g.label==='GOL TREND');
const filtered=core.versions(gol,'2018');
assert.ok(filtered.length<gol.entries.length);
assert.ok(filtered.every(e=>e.years.includes('2018')));
assert.ok(core.versions(gol,'2018','trendline').every(e=>/TRENDLINE/.test(e.variant)));
assert.equal(core.versions(gol,'1900').length,0);
const gearboxSample={entries:[
  {id:'manual',brand:'TEST',model:'TEST',variant:'HATCH PLATINUM 1.6 MT',years:['2020']},
  {id:'auto',brand:'TEST',model:'TEST',variant:'1.6 AT',years:['2020']}
]};
assert.deepEqual(core.versions(gearboxSample,'2020','AT').map(e=>e.id),['auto'],'AT must not match HATCH or PLATINUM.');
assert.deepEqual(core.versions(gearboxSample,'2020','automatico').map(e=>e.id),['auto']);
const corolla=index.groups.find(g=>g.brand==='TOYOTA'&&g.label==='COROLLA');
assert.ok(!corolla.entries.some(e=>e.model==='COROLLA CROSS'),'Distinct models must stay distinct.');
const s10=index.groups.find(g=>g.brand==='CHEVROLET'&&g.models.includes('S-10 PICK - UP'));
assert.ok(s10.models.includes('S10'),'Only typographic/body-descriptor aliases should share a family.');
const started=performance.now();
for(let i=0;i<100;i++)core.search(index,['corolla 2020','VW gol','hilux','Corola','208 2020'][i%5]);
console.log(JSON.stringify({publicReferences:publicIds.length,modelFamilies:index.groups.length,golVersionsBefore:gol.entries.length,golVersions2018:filtered.length,averageSearchMs:Number(((performance.now()-started)/100).toFixed(2))},null,2));
