const $=s=>document.querySelector(s);
const nowYear=new Date().getFullYear();
let marketData,dnrpaData,ratesData,config,catalogData,catalogRules,marketHistoryData;
let catalogByBrand=new Map(),catalogById=new Map(),marketById=new Map(),dnrpaById=new Map(),marketByBrandModel=new Map(),marketByBrand=new Map(),dnrpaByBrand=new Map(),dnrpaByBrandYear=new Map();
let historyByPeriodBrandModel=new Map();
let ratioByBrandYear=new Map(),ratioByYear=new Map(),allRatios=[];
const fmtARS=n=>Number.isFinite(n)?new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n):'—';
const fmtUSD=n=>Number.isFinite(n)?new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD',currencyDisplay:'narrowSymbol',maximumFractionDigits:0}).format(n).replace('$','US$ '):'—';
const fmtPct=n=>Number.isFinite(n)?`${n.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`:'—';
function norm(s=''){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();}
function tokens(s=''){return norm(s).split(/\s+/).filter(x=>x.length>1&&!['DE','DEL','LA','EL','CON','CV','AT','MT','SEDAN','RURAL','PICK','UP','TODO','TERRENO'].includes(x));}
function uniqueSorted(a){
  return [...new Set(a)].sort((x,y)=>{
    const xn=Number(x),yn=Number(y);
    if(Number.isFinite(xn)&&Number.isFinite(yn))return xn-yn;
    return String(x).localeCompare(String(y),'es',{numeric:true});
  });
}
function escapeHtml(s=''){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function setOptions(el,items,placeholder){el.innerHTML=`<option value="">${placeholder}</option>`+items.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');el.disabled=!items.length;}
function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return NaN;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
function weightedAverage(items){let n=0,d=0;for(const i of items){if(Number.isFinite(i.value)&&Number.isFinite(i.weight)&&i.weight>0){n+=i.value*i.weight;d+=i.weight;}}return d?n/d:NaN;}
function similarity(a,b){const A=new Set(tokens(a)),B=new Set(tokens(b));if(!A.size||!B.size)return 0;const inter=[...A].filter(x=>B.has(x)).length;return inter/Math.sqrt(A.size*B.size);}
function marketKey(brand,model){return `${brand}|${model}`;}
function canonicalBrand(value,dataset=''){
  const raw=String(value||'').trim();
  return String(catalogRules?.brand_overrides?.[dataset]?.[raw]||raw).trim();
}
function canonicalModel(brand,value){
  const raw=String(value||'').trim();
  const aliases=catalogRules?.model_aliases?.[String(brand||'').toUpperCase()]||{};
  const target=norm(raw);
  for(const [alias,canonical] of Object.entries(aliases)){
    if(norm(alias)===target)return String(canonical).trim();
  }
  return raw;
}

const DATA_SOURCES=[
  ['data/vehicle_market.json','valores de mercado'],
  ['data/dnrpa.json','valuaciones DNRPA'],
  ['data/rates.json','tasas bancarias'],
  ['data/config.json','configuración'],
  ['data/unified_catalog.json','catálogo unificado'],
  ['data/catalog_aliases.json','aliases de catálogo'],
  ['data/vehicle_history.json','historial mensual']
];

async function fetchJson(path,label){
  let response;
  try{
    response=await fetch(new URL(path,document.baseURI),{cache:'no-store',headers:{'Accept':'application/json'}});
  }catch(err){
    throw new Error(`No se pudo conectar con ${label} (${path}). ${err.message||''}`.trim());
  }
  if(!response.ok)throw new Error(`${label}: ${path} respondió HTTP ${response.status}.`);
  const type=response.headers.get('content-type')||'';
  try{
    const text=await response.text();
    if(!text.trim())throw new Error('archivo vacío');
    return JSON.parse(text);
  }catch(err){
    throw new Error(`${label}: ${path} no contiene JSON válido. ${err.message||''}`.trim());
  }
}

function showLoadError(err){
  console.error(err);
  const brand=$('#brand');
  if(brand){brand.innerHTML='<option value="">Error al cargar marcas</option>';brand.disabled=true;}
  ['#model','#variant','#year'].forEach(id=>{const el=$(id);if(el)el.disabled=true;});
  const status=$('#data-status');
  if(!status)return;
  const local=location.protocol==='file:';
  status.dataset.state='error';
  status.textContent=local
    ? 'FACIL AUTO necesita ejecutarse desde HTTP/HTTPS. Abrí la carpeta con un servidor local o desde tu hosting.'
    : `Error de datos: ${err.message||'no se pudieron cargar las fuentes.'}`;
}

async function loadData(){
  if(location.protocol==='file:')throw new Error('La página fue abierta con file:// y el navegador bloquea los archivos JSON.');
  const [m,d,r,c,u,a,h]=await Promise.all(DATA_SOURCES.map(([path,label])=>fetchJson(path,label)));
  marketData=m;dnrpaData=d;ratesData=r;config=c;catalogData=u;catalogRules=a||{};marketHistoryData=h;
  if(!Array.isArray(marketData.rows))throw new Error('data/vehicle_market.json no contiene rows[].');
  if(!Array.isArray(dnrpaData.rows))throw new Error('data/dnrpa.json no contiene rows[].');
  if(!Array.isArray(ratesData.products))throw new Error('data/rates.json no contiene products[].');
  if(!Array.isArray(catalogData.entries))throw new Error('data/unified_catalog.json no contiene entries[].');
  if(!Array.isArray(marketHistoryData.periods))throw new Error('data/vehicle_history.json no contiene periods[].');

  for(const row of marketData.rows){
    marketById.set(row.id,row);
    const brand=canonicalBrand(row.brand,'market');
    const model=canonicalModel(brand,row.model);
    const key=marketKey(brand,model);
    if(!marketByBrandModel.has(key))marketByBrandModel.set(key,[]);
    marketByBrandModel.get(key).push(row);
    if(!marketByBrand.has(brand))marketByBrand.set(brand,[]);
    marketByBrand.get(brand).push(row);
  }
  for(const row of dnrpaData.rows){
    dnrpaById.set(row.id,row);
    const brand=canonicalBrand(row.brand,'dnrpa');
    if(!dnrpaByBrand.has(brand))dnrpaByBrand.set(brand,[]);
    dnrpaByBrand.get(brand).push(row);
    for(const year of Object.keys(row.values_ars||{})){
      const key=`${brand}|${year}`;
      if(!dnrpaByBrandYear.has(key))dnrpaByBrandYear.set(key,[]);
      dnrpaByBrandYear.get(key).push(row);
    }
  }
  for(const period of marketHistoryData.periods){
    for(const compactRow of period.rows||[]){
      if(!Array.isArray(compactRow)||compactRow.length<4)continue;
      const brand=canonicalBrand(compactRow[0],'market');
      const model=canonicalModel(brand,compactRow[1]);
      const key=`${period.key}|${brand}|${model}`;
      if(!historyByPeriodBrandModel.has(key))historyByPeriodBrandModel.set(key,[]);
      historyByPeriodBrandModel.get(key).push({
        brand,model,variant:String(compactRow[2]||''),prices:compactRow[3]||{}
      });
    }
  }
  const publicCatalogEntries=catalogData.entries.filter(entry=>entry.public!==false);
  for(const entry of publicCatalogEntries){
    catalogById.set(entry.id,entry);
    if(!catalogByBrand.has(entry.brand))catalogByBrand.set(entry.brand,[]);
    catalogByBrand.get(entry.brand).push(entry);
  }
  buildMarketDnrpaRatios();

  setOptions($('#brand'),uniqueSorted([...catalogByBrand.keys()]),'Elegí una marca');
  $('#fx-rate').value=config.exchange_rate_ars_per_usd||'';
  const publicCount=Number(catalogData.stats.public_entries)||publicCatalogEntries.length;
  $('#data-status').textContent=`${publicCount.toLocaleString('es-AR')} versiones de autos y utilitarios listas para cotizar`;
  const marketDate=[marketData.report_month,marketData.report_year].filter(Boolean).join(' ')||'PDF mensual';
  $('#source-market-date').textContent=marketDate;$('#hero-market-date').textContent=marketDate;
  $('#source-dnrpa-date').textContent=dnrpaData.valid_from||'Tabla vigente';$('#hero-dnrpa-date').textContent=dnrpaData.valid_from||'DNRPA';
  $('#source-rates-date').textContent=ratesData.updated_at?new Date(ratesData.updated_at+'T12:00:00').toLocaleDateString('es-AR'):'Actualizable';
  $('#hero-rates-count').textContent=`${ratesData.products.length} alternativas`;
}

function buildMarketDnrpaRatios(){
  ratioByBrandYear=new Map();ratioByYear=new Map();allRatios=[];
  for(const entry of catalogData.entries){
    if(!(entry.market_ids||[]).length||!(entry.dnrpa_ids||[]).length)continue;
    for(const mid of entry.market_ids){
      const mr=marketById.get(mid);if(!mr)continue;
      for(const did of entry.dnrpa_ids){
        const dr=dnrpaById.get(did);if(!dr)continue;
        for(const [year,p] of Object.entries(mr.prices||{})){
          if(year==='0km'||p.currency!=='ARS')continue;
          const dv=Number(dr.values_ars?.[year]);
          if(!Number.isFinite(dv)||dv<=0)continue;
          const ratio=Number(p.amount)/dv;
          if(!Number.isFinite(ratio)||ratio<.45||ratio>2.8)continue;
          const bk=`${entry.brand}|${year}`;
          if(!ratioByBrandYear.has(bk))ratioByBrandYear.set(bk,[]);
          ratioByBrandYear.get(bk).push(ratio);
          if(!ratioByYear.has(year))ratioByYear.set(year,[]);
          ratioByYear.get(year).push(ratio);allRatios.push(ratio);
        }
      }
    }
  }
}

$('#brand').addEventListener('change',()=>{
  const rows=catalogByBrand.get($('#brand').value)||[];
  setOptions($('#model'),uniqueSorted(rows.map(r=>r.model).filter(Boolean)),'Elegí un modelo');
  setOptions($('#variant'),[],'Primero elegí modelo');setOptions($('#year'),[],'Elegí versión');updateCoverageNote();
});
$('#model').addEventListener('change',()=>{
  const entries=(catalogByBrand.get($('#brand').value)||[]).filter(r=>r.model===$('#model').value);
  setVariantOptions(entries);setOptions($('#year'),[],'Elegí versión');updateCoverageNote();
});
$('#variant').addEventListener('change',()=>{
  const entry=currentEntry();if(!entry){setOptions($('#year'),[],'Elegí versión');updateCoverageNote();return;}
  const el=$('#year');el.innerHTML='<option value="">Elegí año</option>'+entry.years.map(y=>`<option value="${y}">${y==='0km'?'0 km / actual':y}</option>`).join('');el.disabled=false;updateCoverageNote();
});
$('#year').addEventListener('change',updateCoverageNote);

function setVariantOptions(entries){
  const el=$('#variant');
  if(!entries.length){setOptions(el,[],'Sin versiones');return;}
  const sorted=[...entries].sort((a,b)=>a.variant.localeCompare(b.variant,'es',{numeric:true}));
  let html='<option value="">Elegí una versión</option>';
  html+=`<optgroup label="Versiones disponibles">${sorted.map(e=>`<option value="${e.id}">${escapeHtml(e.variant)}</option>`).join('')}</optgroup>`;
  el.innerHTML=html;el.disabled=false;
}
function currentEntry(){
  const entry=catalogById.get($('#variant').value)||null;
  if(!entry)return null;
  if(entry.brand!==$('#brand').value)return null;
  if(entry.model!==$('#model').value)return null;
  return entry;
}
function setCalculationStatus(message,state='error'){
  const status=$('#data-status');
  if(!status)return;
  status.dataset.state=state;
  status.textContent=message;
}
function resetInvalidVehicleSelection(){
  const brand=$('#brand').value;
  const model=$('#model').value;
  const rows=(catalogByBrand.get(brand)||[]).filter(r=>r.model===model);
  setVariantOptions(rows);
  setOptions($('#year'),[],'Elegí versión');
}
function validatedSelection(){
  const brand=$('#brand').value;
  const model=$('#model').value;
  const variantId=$('#variant').value;
  const year=$('#year').value;

  if(!brand)return {ok:false,message:'Elegí una marca para continuar.'};
  if(!model)return {ok:false,message:'Elegí un modelo para continuar.'};

  const entry=catalogById.get(variantId)||null;

  if(!entry||entry.brand!==brand||entry.model!==model){
    return {
      ok:false,
      repair:true,
      message:'La versión seleccionada no corresponde al modelo actual. Volvé a elegir la versión.'
    };
  }

  if(!year||!(entry.years||[]).includes(year)){
    return {
      ok:false,
      message:'Elegí un año disponible para esta versión.'
    };
  }

  return {ok:true,entry,year};
}
function updateCoverageNote(){
  const el=$('#catalog-coverage');if(!el)return;const e=currentEntry();
  if(!e){el.textContent='El catálogo combina la guía mensual con DNRPA para ampliar marcas, modelos y versiones.';el.dataset.tone='neutral';return;}
  const hasM=(e.market_ids||[]).length>0,hasD=(e.dnrpa_ids||[]).length>0;
  if(hasM&&hasD){el.textContent='Cobertura combinada: referencia de mercado + coincidencia DNRPA.';el.dataset.tone='good';}
  else if(hasM){el.textContent='Disponible en la guía de mercado. DNRPA se buscará automáticamente al calcular.';el.dataset.tone='neutral';}
  else{el.textContent='Versión incorporada desde DNRPA. Si falta precio de mercado exacto, se estimará con referencias cercanas.';el.dataset.tone='estimate';}
}

function mileageFactor(year,km){
  if(!km||year==='0km')return 1;
  const mileage=Math.max(0,Number(km)||0);
  const normal=Math.max(1,Number(config.market.km_curve_normal_km)||100000);
  const maxKm=Math.max(normal+1,Number(config.market.km_curve_max_km)||400000);
  const lowBonus=Math.max(0,Number(config.market.km_curve_low_km_bonus)??0.04);
  const maxPenalty=Math.max(0,Math.min(.6,Number(config.market.km_curve_max_penalty)??0.30));
  const curve=Math.max(.1,Number(config.market.km_curve_exponent)||1.4);

  // 0–100.000 km: conserva el valor normal de usado. Solo reconoce, de forma suave,
  // unidades excepcionalmente poco caminadas (máximo +4% a kilometraje cero).
  if(mileage<=normal){
    const t=1-(mileage/normal);
    return 1+(lowBonus*t*t);
  }

  // 100.000–400.000 km: depreciación progresiva/exponencial hasta un máximo del 30%.
  const t=Math.min(1,(mileage-normal)/(maxKm-normal));
  const expNorm=(Math.exp(curve*t)-1)/(Math.exp(curve)-1);
  return 1-(maxPenalty*expNorm);
}
function marketPriceToARS(price,fx){return price.currency==='USD'?price.amount*fx:price.amount;}
function marketPriceToUSD(price,fx){return price.currency==='USD'?price.amount:price.amount/fx;}
function literalMarketValue(price){return price.currency==='USD'?fmtUSD(price.amount):fmtARS(price.amount);}
function sourceUnitText(price){if(price.currency==='USD'&&price.unit==='thousands')return `Fuente en miles de US$ · ${price.raw.toLocaleString('es-AR')} × 1.000`;if(price.currency==='USD')return 'La guía identifica este valor en US$';return `Fuente en miles de pesos · ${price.raw.toLocaleString('es-AR')} × 1.000`;}

const MONTH_NUMBER={ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,JULIO:7,AGOSTO:8,SEPTIEMBRE:9,SETIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12};
function currentMarketPeriodKey(){
  const month=MONTH_NUMBER[norm(marketData?.report_month)];
  const year=Number(marketData?.report_year);
  return month&&year?`${year}-${String(month).padStart(2,'0')}`:'';
}
function historyPriceToARS(price,fx){
  if(!Array.isArray(price)||price.length<2)return NaN;
  const amount=Number(price[0]);
  if(!Number.isFinite(amount)||amount<=0)return NaN;
  return String(price[1]).toUpperCase()==='USD'?amount*fx:amount;
}
function historicalValueForPeriod(entry,year,fx,period){
  const rows=(historyByPeriodBrandModel.get(`${period.key}|${entry.brand}|${entry.model}`)||[])
    .map(row=>({row,value:historyPriceToARS(row.prices?.[year],fx)}))
    .filter(item=>Number.isFinite(item.value));
  if(!rows.length)return null;

  const targetVariants=new Set([
    entry.variant,
    ...(entry.market_ids||[]).map(id=>marketById.get(id)?.variant).filter(Boolean)
  ].map(norm));
  const exact=rows.filter(item=>targetVariants.has(norm(item.row.variant)));
  if(exact.length){
    return {value:median(exact.map(item=>item.value)),kind:'direct',basisCount:exact.length};
  }

  const target=`${entry.model} ${entry.variant}`;
  const comparable=rows
    .map(item=>({...item,score:similarity(target,`${item.row.model} ${item.row.variant}`)}))
    .filter(item=>item.score>=.15)
    .sort((a,b)=>b.score-a.score)
    .slice(0,5);
  if(!comparable.length)return null;
  const value=weightedAverage(comparable.map(item=>({value:item.value,weight:.2+item.score*2})));
  return Number.isFinite(value)?{value,kind:'comparable',basisCount:comparable.length}:null;
}
function compactARS(value){
  if(!Number.isFinite(value))return 'Sin dato';
  if(Math.abs(value)>=1000000)return `$${(value/1000000).toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})} M`;
  return fmtARS(value);
}
function shortHistoryLabel(period){
  const [year,month]=String(period.key).split('-').map(Number);
  if(!year||!month)return period.label||period.key;
  // El día 15 evita que UTC se convierta en el mes anterior en zonas horarias negativas.
  const label=new Intl.DateTimeFormat('es-AR',{month:'short'}).format(new Date(Date.UTC(year,month-1,15)));
  return `${label.replace('.','')} ${String(year).slice(-2)}`;
}
function renderVehicleHistory(entry,year,km,fx,currentValue,currentEstimate){
  const panel=$('#vehicle-history-panel'),svg=$('#vehicle-history-chart'),periodsEl=$('#vehicle-history-periods');
  if(!panel||!svg||!periodsEl)return;
  const periods=[...(marketHistoryData?.periods||[])].sort((a,b)=>String(a.key).localeCompare(String(b.key))).slice(-3);
  const currentKey=currentMarketPeriodKey();
  const factor=mileageFactor(year,km);
  const points=periods.map((period,index)=>{
    if(period.key===currentKey){
      return {period,index,value:currentValue,kind:currentEstimate?.exactPrice?'direct':'current-estimate',basisCount:currentEstimate?.basisCount||1};
    }
    const historical=historicalValueForPeriod(entry,year,fx,period);
    return historical?{period,index,value:historical.value*factor,kind:historical.kind,basisCount:historical.basisCount}:{period,index,value:NaN,kind:'missing',basisCount:0};
  });
  const available=points.filter(point=>Number.isFinite(point.value));
  panel.hidden=false;

  const width=680,height=116,padX=28,padY=14;
  const values=available.map(point=>point.value);
  let min=Math.min(...values),max=Math.max(...values);
  if(!Number.isFinite(min)||!Number.isFinite(max)){min=0;max=1;}
  if(min===max){const spread=Math.max(1,min*.03);min-=spread;max+=spread;}
  else{const spread=(max-min)*.18;min-=spread;max+=spread;}
  const x=index=>periods.length<=1?width/2:padX+index*((width-padX*2)/(periods.length-1));
  const y=value=>padY+(max-value)*(height-padY*2)/(max-min);
  const path=available.map((point,index)=>`${index?'L':'M'} ${x(point.index).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
  const grid=[.2,.5,.8].map(position=>`<line class="history-grid" x1="${padX}" y1="${(padY+(height-padY*2)*position).toFixed(1)}" x2="${width-padX}" y2="${(padY+(height-padY*2)*position).toFixed(1)}"></line>`).join('');
  const marks=available.map(point=>`<circle class="history-point${point.period.key===currentKey?' is-current':''}" cx="${x(point.index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="6"></circle>`).join('');
  svg.innerHTML=`${grid}${available.length>1?`<path class="history-line" d="${path}"></path>`:''}${marks}`;
  svg.setAttribute('aria-label',available.length>1
    ? `Evolución de ${available.map(point=>`${point.period.label}: ${fmtARS(point.value)}`).join(', ')}`
    : 'Todavía no hay suficientes meses comparables para dibujar una evolución.');

  const kindLabel=point=>point.kind==='direct'?'Misma versión':point.kind==='comparable'?`${point.basisCount} comparables`:point.kind==='current-estimate'?'Estimación actual':'Sin referencia comparable';
  periodsEl.innerHTML=points.map(point=>`<div class="vehicle-history-period${point.period.key===currentKey?' is-current':''}"><span>${escapeHtml(shortHistoryLabel(point.period))}${point.period.key===currentKey?' · actual':''}</span><strong>${escapeHtml(compactARS(point.value))}</strong><small>${escapeHtml(kindLabel(point))}</small></div>`).join('');

  const first=available[0],last=available[available.length-1],change=$('#vehicle-history-change');
  change.classList.remove('is-up','is-down');
  if(available.length>1&&first.value>0){
    const pct=(last.value-first.value)/first.value*100;
    change.textContent=`${pct>=0?'+':''}${pct.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})}% desde ${shortHistoryLabel(first.period)}`;
    change.classList.add(pct>=0?'is-up':'is-down');
  }else change.textContent='Historial en formación';

  const directCount=points.filter(point=>point.kind==='direct').length;
  $('#vehicle-history-note').textContent=available.length>1
    ? `Valores mensuales comparables ajustados al kilometraje ingresado. ${directCount} período${directCount===1?'':'s'} con coincidencia de la misma versión; la cotización principal siempre usa el último mes disponible.`
    : 'La serie comenzó a guardarse en agosto de 2026. Este vehículo todavía no tiene dos meses comparables; la cotización actual no se completa con datos inventados.';
}

function annualGrowthFromSeries(points){
  const sorted=[...points].sort((a,b)=>a.year-b.year),logs=[];
  for(let i=1;i<sorted.length;i++){
    const a=sorted[i-1],b=sorted[i],dy=b.year-a.year;
    if(dy>0&&a.value>0&&b.value>0)logs.push(Math.log(b.value/a.value)/dy);
  }
  const g=median(logs);return Number.isFinite(g)?Math.max(-.08,Math.min(.32,g)):NaN;
}
function estimateNumericSeries(values,targetYear){
  const target=Number(targetYear);if(!Number.isFinite(target))return null;
  const points=Object.entries(values||{}).filter(([y,v])=>/^\d{4}$/.test(y)&&Number.isFinite(Number(v))&&Number(v)>0).map(([y,v])=>({year:Number(y),value:Number(v)})).sort((a,b)=>a.year-b.year);
  if(!points.length)return null;
  const exact=points.find(p=>p.year===target);if(exact)return {value:exact.value,kind:'exact',years:[target]};
  const below=[...points].reverse().find(p=>p.year<target),above=points.find(p=>p.year>target);
  if(below&&above){
    const t=(target-below.year)/(above.year-below.year),value=Math.exp(Math.log(below.value)+(Math.log(above.value)-Math.log(below.value))*t);
    return {value,kind:'interpolated',years:[below.year,above.year]};
  }
  if(points.length>=2){
    const nearest=points.reduce((best,p)=>Math.abs(p.year-target)<Math.abs(best.year-target)?p:best,points[0]);
    const growth=annualGrowthFromSeries(points);
    if(Number.isFinite(growth))return {value:nearest.value*Math.exp(growth*(target-nearest.year)),kind:'extrapolated',years:[nearest.year],distance:Math.abs(target-nearest.year)};
  }
  return {value:points[0].value,kind:'single-point',years:[points[0].year],distance:Math.abs(target-points[0].year)};
}
function estimateMarketRow(row,year,fx){
  const prices=row.prices||{};
  if(prices[year])return {value:marketPriceToARS(prices[year],fx),kind:'exact',row,price:prices[year],years:[year]};
  if(year==='0km')return null;
  const values={};for(const [y,p] of Object.entries(prices)){if(/^\d{4}$/.test(y))values[y]=marketPriceToARS(p,fx);}
  const est=estimateNumericSeries(values,year);if(!est)return null;
  return {...est,row,price:null};
}
function bestDirectMarketEstimate(entry,year,fx){
  const results=(entry.market_ids||[]).map(id=>marketById.get(id)).filter(Boolean).map(r=>estimateMarketRow(r,year,fx)).filter(Boolean);
  if(!results.length)return null;
  const exact=results.filter(r=>r.kind==='exact');
  if(exact.length){const r=exact[0];return {amountARS:r.value,confidence:'Alta',confidenceClass:'high',method:'Valor exacto de la guía mensual',exactPrice:r.price,sourceRows:[r.row],basisCount:1};}
  const interpolated=results.filter(r=>r.kind==='interpolated');
  if(interpolated.length){const r=interpolated[0];return {amountARS:r.value,confidence:'Media-alta',confidenceClass:'medium-high',method:`Interpolación de la misma versión entre ${r.years.join(' y ')}`,exactPrice:null,sourceRows:[r.row],basisCount:2};}
  const extrapolated=results.filter(r=>r.kind==='extrapolated'&&r.distance<=5);
  if(extrapolated.length){const r=extrapolated.sort((a,b)=>a.distance-b.distance)[0];return {amountARS:r.value,confidence:r.distance<=2?'Media':'Media-baja',confidenceClass:r.distance<=2?'medium':'medium-low',method:`Proyección de la misma versión desde ${r.years[0]}`,exactPrice:null,sourceRows:[r.row],basisCount:Math.max(2,Object.keys(r.row.prices||{}).length)};}
  return null;
}
function sameModelMarketEstimate(entry,year,fx){
  const rows=marketByBrandModel.get(marketKey(entry.brand,entry.model))||[];if(!rows.length)return null;
  const scored=[];
  for(const row of rows){
    const est=estimateMarketRow(row,year,fx);if(!est)continue;
    const sim=similarity(`${entry.model} ${entry.variant}`,`${row.model} ${row.variant}`);
    const kindWeight=est.kind==='exact'?1.25:est.kind==='interpolated'?1.05:.82;
    scored.push({...est,sim,weight:(.3+sim*2.2)*kindWeight});
  }
  if(!scored.length)return null;
  scored.sort((a,b)=>(b.sim-a.sim)||(b.weight-a.weight));
  const selected=scored.slice(0,Math.min(7,scored.length));
  const value=weightedAverage(selected.map(x=>({value:x.value,weight:x.weight})));
  if(!Number.isFinite(value))return null;
  const exactCount=selected.filter(x=>x.kind==='exact').length;
  return {amountARS:value,confidence:exactCount>=3?'Media':'Media-baja',confidenceClass:exactCount>=3?'medium':'medium-low',method:exactCount?`Promedio ponderado de ${selected.length} versiones similares del mismo modelo (${exactCount} con año exacto)`:`Promedio ponderado de ${selected.length} versiones similares y años cercanos`,exactPrice:null,sourceRows:selected.map(x=>x.row),basisCount:selected.length};
}
function ratioFor(brand,year){
  let values=ratioByBrandYear.get(`${brand}|${year}`)||[];
  if(values.length>=3)return {ratio:median(values),count:values.length,scope:`${brand} ${year}`};
  if(/^\d{4}$/.test(year)){
    const y=Number(year),near=[];
    for(let d=1;d<=2;d++)for(const yy of [y-d,y+d])near.push(...(ratioByBrandYear.get(`${brand}|${yy}`)||[]));
    values=[...values,...near];if(values.length>=3)return {ratio:median(values),count:values.length,scope:`${brand}, años cercanos`};
  }
  values=ratioByYear.get(year)||[];if(values.length>=6)return {ratio:median(values),count:values.length,scope:`mercado general ${year}`};
  return {ratio:median(allRatios),count:allRatios.length,scope:'mercado general'};
}
function estimateDnrpaRow(row,year){
  if(year==='0km')return null;
  const exact=Number(row.values_ars?.[year]);if(Number.isFinite(exact))return {value:exact,kind:'exact',years:[year]};
  return estimateNumericSeries(row.values_ars||{},year);
}
function textScoreEntryDnrpa(entry,row){
  const et=tokens(`${entry.model} ${entry.variant}`),rt=new Set(tokens(`${row.model} ${row.body_type}`));if(!et.length)return 0;
  let weighted=0,total=0;for(const t of et){const w=norm(entry.model).includes(t)?2.5:1;total+=w;if(rt.has(t))weighted+=w;}
  return total?weighted/total:0;
}
function findDnrpaForEntry(entry,year){
  if(year==='0km')return null;
  const attachedRows=(entry.dnrpa_ids||[]).map(id=>dnrpaById.get(id)).filter(Boolean);
  let best=null;

  for(const row of attachedRows){
    const val=estimateDnrpaRow(row,year);if(!val)continue;
    const score=textScoreEntryDnrpa(entry,row)+(val.kind==='exact'?.18:0)+.08;
    if(!best||score>best.score)best={row,score,...val,attached:true};
  }

  // Algunas variantes DNRPA están seleccionables pero su fila asociada no tiene
  // una valuación utilizable para el año elegido. En ese caso buscamos la
  // referencia más cercana de la misma marca en lugar de devolver null.
  if(!best){
    const fallbackRows=dnrpaByBrandYear.get(`${entry.brand}|${year}`)||dnrpaByBrand.get(entry.brand)||[];
    for(const row of fallbackRows){
      const val=estimateDnrpaRow(row,year);if(!val)continue;
      const score=textScoreEntryDnrpa(entry,row)+(val.kind==='exact'?.18:0);
      if(!best||score>best.score)best={row,score,...val,attached:false};
    }
  }

  return best;
}
function dnrpaBasedMarketEstimate(entry,year,dmatch){
  if(!dmatch||!Number.isFinite(dmatch.value))return null;
  const ratio=ratioFor(entry.brand,year);if(!Number.isFinite(ratio.ratio))return null;
  return {amountARS:dmatch.value*ratio.ratio,confidence:'Baja',confidenceClass:'low',method:`Estimación desde valuación DNRPA × relación mercado/registro (${ratio.scope}, ${ratio.count} referencias)`,exactPrice:null,sourceRows:[],basisCount:ratio.count};
}
function sameBrandMarketEstimate(entry,year,fx){
  const rows=marketByBrand.get(entry.brand)||[];
  if(!rows.length)return null;

  const target=`${entry.model} ${entry.variant}`;
  const scored=[];

  for(const row of rows){
    const est=estimateMarketRow(row,year,fx);if(!est)continue;
    const sim=similarity(target,`${row.model} ${row.variant}`);
    const kindWeight=est.kind==='exact'?1.20:est.kind==='interpolated'?1.00:.74;
    scored.push({...est,sim,weight:(.08+sim*2.4)*kindWeight});
  }

  if(!scored.length)return null;

  scored.sort((a,b)=>(b.sim-a.sim)||(b.weight-a.weight));
  const similar=scored.filter(x=>x.sim>=.15);
  const selected=(similar.length?similar:scored).slice(0,similar.length?7:5);
  const value=weightedAverage(selected.map(x=>({value:x.value,weight:x.weight})));

  if(!Number.isFinite(value))return null;

  const exactCount=selected.filter(x=>x.kind==='exact').length;
  return {
    amountARS:value,
    confidence:'Baja',
    confidenceClass:'low',
    method:exactCount
      ? `Estimación ponderada con ${selected.length} modelos comparables de ${entry.brand} (${exactCount} con año exacto)`
      : `Estimación ponderada con modelos y años comparables de ${entry.brand}`,
    exactPrice:null,
    sourceRows:selected.map(x=>x.row),
    basisCount:selected.length
  };
}
function marketEstimate(entry,year,fx,dmatch){
  return bestDirectMarketEstimate(entry,year,fx)
    ||sameModelMarketEstimate(entry,year,fx)
    ||dnrpaBasedMarketEstimate(entry,year,dmatch)
    ||sameBrandMarketEstimate(entry,year,fx);
}

function monthlyPayment(principal,months,rate){if(principal<=0)return 0;if(rate<=0)return principal/months;const p=Math.pow(1+rate,months);return principal*rate*p/(p-1);}
function financeOffers(principal,months){return ratesData.products.filter(p=>months>=p.min_months&&months<=p.max_months).map(p=>{const cftMonthly=Math.pow(1+p.cft_tea/100,1/12)-1,tnaMonthly=p.tna/100/12,payment=monthlyPayment(principal,months,tnaMonthly),cftReferencePayment=monthlyPayment(principal,months,cftMonthly);return {...p,payment,cftReferencePayment,total:payment*months,cftReferenceTotal:cftReferencePayment*months};}).sort((a,b)=>a.cft_tea-b.cft_tea||a.payment-b.payment);}
function renderBanks(offers,months){const list=$('#bank-list');if(!offers.length){list.innerHTML='<div class="bank-row"><div class="bank-name"><b>Sin alternativas para este plazo</b><span>Actualizá la base de tasas o elegí otro plazo.</span></div></div>';return;}list.innerHTML=offers.slice(0,6).map((o,i)=>`<div class="bank-row"><div class="bank-name"><b>${escapeHtml(o.bank)}${i===0?'<span class="best-tag">MENOR CFT</span>':''}</b><span>${escapeHtml(o.product)}${o.requires_client?' · requiere cliente':''}</span></div><div class="bank-cell"><b>${fmtPct(o.tna)}</b></div><div class="bank-cell"><b>${fmtPct(o.cft_tea)}</b></div><div class="bank-cell bank-total"><b>${fmtARS(o.total)}</b></div><div class="bank-cell bank-payment"><b>${fmtARS(o.payment)}</b></div></div>`).join('');}

function opportunityState(price,guide){
  if(!price||!guide)return null;
  const offset=Number(config.opportunity?.market_offset_percent??15);
  const rawPct=(price-guide)/guide*100;
  // La lectura de oportunidad usa un corrimiento comercial sobre la guía, sin modificar la valuación mostrada.
  // Con offset=15, un precio idéntico al valor guía se presenta como -15% en la lectura.
  const pct=rawPct-offset,abs=Math.abs(pct),commercialReference=guide*(1+offset/100),difference=price-commercialReference;
  const strong=Number(config.opportunity?.strong_below_percent??-15),good=Number(config.opportunity?.good_below_percent??-7),band=Number(config.opportunity?.market_band_percent??7),high=Number(config.opportunity?.high_above_percent??15);
  let rating,klass;
  if(pct<=strong){rating='Oportunidad fuerte';klass='is-good';}
  else if(pct<=good){rating='Buena oportunidad';klass='is-good';}
  else if(pct<band){rating='En precio de mercado';klass='is-neutral';}
  else if(pct<high){rating='Precio exigente';klass='is-bad';}
  else{rating='Muy por encima del mercado';klass='is-bad';}
  return {pct,abs,rawPct,offset,commercialReference,difference,rating,klass};
}
function renderOpportunity(op,hasEnteredPrice){
  const panel=$('#opportunity-panel');panel.classList.remove('is-good','is-bad','is-neutral');
  if(!hasEnteredPrice||!op){
    const offset=Number(config.opportunity?.market_offset_percent??15);
    $('#opportunity-rating').textContent='Ingresá un precio para comparar';$('#opportunity-pct').textContent='—';$('#opportunity-direction').textContent='vs. mercado ajustado';
    $('#opportunity-text').textContent=`La lectura aplica un margen comercial de ${offset.toLocaleString('es-AR')}% sobre la guía sin modificar el valor de valuación.`;
    $('#opportunity-marker').style.left='50%';return;
  }
  panel.classList.add(op.klass);$('#opportunity-rating').textContent=op.rating;$('#opportunity-pct').textContent=`${op.abs.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`;
  $('#opportunity-direction').textContent=op.pct<0?'debajo del mercado ajustado':op.pct>0?'arriba del mercado ajustado':'en mercado ajustado';
  $('#opportunity-text').textContent=`Lectura ajustada ${op.offset.toLocaleString('es-AR')} p.p. sobre la guía. La referencia comercial equivale a ${fmtARS(op.commercialReference)} y la diferencia monetaria es ${fmtARS(Math.abs(op.difference))} ${op.difference<=0?'a favor del comprador':'por encima de esa referencia'}.`;
  const clamped=Math.max(-20,Math.min(20,op.pct));$('#opportunity-marker').style.left=`${((clamped+20)/40)*100}%`;
}

$('#vehicle-form').addEventListener('invalid',e=>{
  const field=e.target;
  const label=field?.closest('label')?.querySelector('span')?.textContent?.trim()||'los datos obligatorios';
  setCalculationStatus(`Revisá ${label.toLowerCase()} antes de calcular.`);
},true);

$('#vehicle-form').addEventListener('submit',async e=>{
  e.preventDefault();

  try{
    const resultSection=$('#resultados');
    if(resultSection)resultSection.hidden=true;

    const selection=validatedSelection();

    if(!selection.ok){
      if(selection.repair)resetInvalidVehicleSelection();
      setCalculationStatus(selection.message);
      return;
    }

    const {entry,year}=selection;
    const km=Number($('#km').value)||0,fx=Number($('#fx-rate').value)||config.exchange_rate_ars_per_usd||1;
  const dmatch=findDnrpaForEntry(entry,year),mestimate=marketEstimate(entry,year,fx,dmatch);
  if(!mestimate||!Number.isFinite(mestimate.amountARS)){
    setCalculationStatus('No hay datos suficientes para calcular esta combinación. No se consumió ninguna consulta.');
    return;
  }
  const factor=mileageFactor(year,km),guideARS=mestimate.amountARS,adjustedARS=guideARS*factor,adjustedUSD=adjustedARS/fx;
  const buyARS=adjustedARS*config.market.purchase_factor,saleARS=adjustedARS*config.market.sale_factor;
  const typedPrice=Number($('#operation-price').value)||0,hasEnteredPrice=typedPrice>0,operationPrice=hasEnteredPrice?typedPrice:adjustedARS;
  const defaultDown=operationPrice*config.financing.default_down_payment_percent,down=Math.min(operationPrice,Number($('#down-payment').value)||defaultDown),months=Number($('#term').value),principal=Math.max(0,operationPrice-down),offers=financeOffers(principal,months),bestOffer=offers[0]||null;
  const opp=opportunityState(hasEnteredPrice?typedPrice:null,adjustedARS);renderOpportunity(opp,hasEnteredPrice);

  const drow=dmatch?.row,dval=dmatch?.value,registryFee=Number.isFinite(dval)?dval*config.transfer.registry_percent:0,juris=$('#jurisdiction').value,buyer=$('#buyer-type').value,stampRate=juris==='pba'?(buyer==='habitualist'?config.transfer.pba_stamp_habitualist_percent:config.transfer.pba_stamp_particular_percent):0,stampBase=Number.isFinite(dval)?Math.max(dval,operationPrice):operationPrice,stampFee=stampBase*stampRate,fixed=Number(config.transfer.fixed_fees_ars)||0,transferTotal=registryFee+stampFee+fixed,cashClose=operationPrice+transferTotal,financeClose=down+(bestOffer?bestOffer.total:principal)+transferTotal;

  $('#result-unit').textContent=`${entry.brand} ${entry.model} · ${entry.variant} · ${year==='0km'?'0 km':year}${km?` · ${km.toLocaleString('es-AR')} km`:''}`;
  $('#market-value').textContent=fmtARS(adjustedARS);const factorPct=(factor-1)*100;$('#market-adjustment').textContent=factor===1?`Equivale a ${fmtUSD(adjustedUSD)} al dólar configurado`:`${factorPct>0?'+':''}${factorPct.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})}% por kilometraje · ${fmtUSD(adjustedUSD)}`;
  if(mestimate.exactPrice){$('#market-pdf-value').textContent=literalMarketValue(mestimate.exactPrice);$('#market-pdf-unit').textContent=sourceUnitText(mestimate.exactPrice);}else{$('#market-pdf-value').textContent='Sin valor exacto';$('#market-pdf-unit').textContent='Se usa una estimación, no una cifra literal del PDF';}
  $('#market-confidence').textContent=mestimate.confidence;$('#market-method').textContent=mestimate.method;$('#buy-value').textContent=fmtARS(buyARS);$('#sale-value').textContent=fmtARS(saleARS);
  const pages=uniqueSorted((mestimate.sourceRows||[]).map(r=>r.page).filter(Boolean));$('#market-source').textContent=`${marketData.source} · ${marketData.report_month||''} ${marketData.report_year||''}${pages.length?` · pág. ${pages.slice(0,4).join(', ')}${pages.length>4?'…':''}`:''} · Confianza ${mestimate.confidence.toLowerCase()}`;

  renderVehicleHistory(entry,year,km,fx,adjustedARS,mestimate);

  $('#dnrpa-value').textContent=Number.isFinite(dval)?fmtARS(dval):year==='0km'?'No aplica a 0 km':'Sin referencia';
  const dstate=dmatch?(dmatch.kind==='exact'?'Exacta':dmatch.kind==='interpolated'?'Estimada entre años':dmatch.kind==='extrapolated'?'Proyectada desde año cercano':'Aproximada'):'Sin coincidencia';
  $('#dnrpa-status').textContent=dstate;
  $('#dnrpa-match').textContent=drow?`${drow.model} · coincidencia ${Math.max(0,Math.min(99,Math.round(dmatch.score*100)))}%${dmatch.kind!=='exact'?' · valor estimado':''}`:year==='0km'?'Consultar alta / patentamiento':'No se encontró versión oficial equivalente';
  $('#registry-fee').textContent=Number.isFinite(dval)?fmtARS(registryFee):'—';$('#stamp-fee').textContent=stampRate?fmtARS(stampFee):'No modelado';$('#fixed-fees').textContent=fmtARS(fixed);$('#transfer-total').textContent=fmtARS(transferTotal);$('#dnrpa-source').textContent=`DNRPA · vigencia ${dnrpaData.valid_from||'sin fecha'}${drow?` · pág. ${drow.page}`:''}${dmatch&&dmatch.kind!=='exact'?` · ${dstate.toLowerCase()}`:''}`;

  $('#loan-amount').textContent=fmtARS(principal);renderBanks(offers,months);$('#finance-source').textContent=`${ratesData.source} · actualización ${ratesData.updated_at}. ${ratesData.calculation_note}`;$('#cash-close').textContent=fmtARS(cashClose);$('#finance-close').textContent=fmtARS(financeClose);$('#finance-close-bank').textContent=bestOffer?`${bestOffer.bank} · ${months} cuotas de ${fmtARS(bestOffer.payment)}`:'Sin financiación seleccionable';$('#operation-used').textContent=hasEnteredPrice?fmtARS(operationPrice):`${fmtARS(operationPrice)} · referencia estimada`;

  const consultationManager=window.FACIL_AUTO_GATE;
  if(!consultationManager||typeof consultationManager.consume!=='function'){
    setCalculationStatus('No se pudo validar la consulta. Recargá la página e intentá nuevamente.');
    return;
  }

  setCalculationStatus('Validando la consulta…','loading');
  const consultationAllowed=await consultationManager.consume();
  if(!consultationAllowed){
    setCalculationStatus('La consulta no pudo autorizarse. Revisá tu sesión o tus consultas disponibles.');
    return;
  }

  if(resultSection)resultSection.hidden=false;
  setCalculationStatus('Consulta calculada con los datos más recientes.','ready');
  $('#resultados').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){
    console.error('FACIL AUTO calculation error:',err);
    setCalculationStatus('Ocurrió un error al calcular esta combinación. No se consumió ninguna consulta.');
  }
});

loadData().catch(showLoadError);
