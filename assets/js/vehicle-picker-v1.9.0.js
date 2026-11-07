/* Accessible model -> year -> version selection, using the shared catalog. */
(() => {
  'use strict';
  const core=window.FACIL_AUTO_SEARCH;
  const el=id=>document.getElementById(id);
  const form=el('vehicle-form');
  if(!form||!core)return;
  const brand=el('brand'),model=el('model'),year=el('year'),variant=el('variant');
  const query=el('vehicle-query'),versionQuery=el('vehicle-version-query');
  let index=null,typingModel=false,typingVersion=false,showAllVersions=false;
  const change=node=>node.dispatchEvent(new Event('change',{bubbles:true}));
  const group=()=>index?.byId.get(core.familyKey(brand.value,model.value));

  function combobox(prefix,input,listId,read,choose){
    const container=el(`${prefix}-combobox`),panel=el(`${prefix}-search-panel`),list=el(listId),status=el(`${prefix}-search-status`);
    let items=[],active=-1,opened=false;
    function close(){
      opened=false;panel.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
    }
    function activate(at){
      active=at;
      [...list.children].forEach((node,i)=>node.setAttribute('aria-selected',String(i===active)));
      const option=list.children[active];
      if(option){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}
    }
    function open(){
      if(input.disabled)return;
      const result=read();items=result.items;active=-1;list.replaceChildren();
      for(const [i,item] of items.entries()){
        const option=document.createElement('div');
        option.className='vehicle-option';option.id=`${listId}-${i}`;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
        const title=document.createElement('strong');title.textContent=item.title;
        const detail=document.createElement('small');detail.textContent=item.detail;
        option.append(title,detail);list.appendChild(option);
        option.addEventListener('pointerdown',event=>event.preventDefault());
        option.addEventListener('click',()=>{close();choose(item.value);});
      }
      status.textContent=result.message;panel.hidden=false;opened=true;
      const rect=input.getBoundingClientRect();
      const below=(window.visualViewport?.height||window.innerHeight)-rect.bottom-16,above=rect.top-16;
      const upwards=below<180&&above>below;
      panel.dataset.placement=upwards?'above':'below';
      const footer=panel.getBoundingClientRect().height-list.getBoundingClientRect().height+8;
      list.style.maxHeight=`${Math.max(80,Math.min(310,(upwards?above:below)-footer))}px`;
      input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
    }
    input.addEventListener('focus',()=>{input.select();open();});
    input.addEventListener('input',open);
    input.addEventListener('keydown',event=>{
      if(event.key==='Escape'){close();event.preventDefault();return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();if(!opened)open();if(!items.length)return;
        activate(event.key==='ArrowDown'?(active+1)%items.length:(active<=0?items.length-1:active-1));
      }else if(event.key==='Enter'&&opened){
        event.preventDefault();if(items.length){const item=items[active<0?0:active];close();choose(item.value);}
      }
    });
    container.addEventListener('focusout',event=>{if(!container.contains(event.relatedTarget))close();});
    document.addEventListener('pointerdown',event=>{if(!container.contains(event.target))close();});
    return {open,close};
  }

  // Clear dependent selections as soon as the user edits a committed model.
  query.addEventListener('input',()=>{
    typingModel=true;
    if(brand.value||model.value){brand.value='';change(brand);}
    query.setCustomValidity('Elegí tu modelo entre las sugerencias.');
    query.removeAttribute('aria-invalid');el('vehicle-search-clear').hidden=!query.value;
    typingModel=false;
  });
  versionQuery.addEventListener('input',()=>{
    typingVersion=true;variant.value='';change(variant);
    versionQuery.setCustomValidity('Elegí una versión de la lista.');versionQuery.removeAttribute('aria-invalid');typingVersion=false;
  });

  const modelBox=combobox('model',query,'vehicle-model-list',()=>{
    if(!index)return {items:[],message:'Cargando modelos…'};
    const result=core.search(index,query.value);
    return {
      items:result.items.map(g=>{
        const used=g.years.filter(y=>y!=='0km');
        const period=result.year?`${result.year==='0km'?'0 km':result.year} · ${core.versions(g,result.year).length} versiones`:[used.length?`${used.at(-1)}–${used[0]}`:'',g.years.includes('0km')?'0 km':''].filter(Boolean).join(' · ');
        return {title:g.title,detail:period,value:{group:g,year:result.year}};
      }),
      message:!query.value.trim()?'Escribí el modelo, con o sin la marca.':!result.total?'No encontramos ese modelo y año. Probá con menos palabras o elegí por marca.':result.total>result.items.length?`Mostrando ${result.items.length} de ${result.total} modelos. Agregá la marca o el año.`:`${result.total} modelo${result.total===1?'':'s'} encontrado${result.total===1?'':'s'}.`
    };
  },selection=>{
    brand.value=selection.group.brand;change(brand);
    model.value=selection.group.model;change(model);
    if(selection.year){year.value=selection.year;change(year);}
    query.value=selection.group.title;query.setCustomValidity('');
    if(selection.year&&!versionQuery.disabled)versionQuery.focus();else year.focus();
  });

  function versionChoices(){
    const entries=core.versions(group(),year.value,variant.value?'':versionQuery.value);
    const primary=entries.filter(entry=>entry.market_ids?.length);
    const canExpand=primary.length>0&&primary.length<entries.length;
    el('version-more').hidden=!canExpand;
    el('version-more').textContent=showAllVersions?'Volver a la lista corta':`Ver todas las versiones (${entries.length})`;
    return {entries:canExpand&&!showAllVersions?primary:entries,total:entries.length,short:canExpand&&!showAllVersions};
  }
  const versionBox=combobox('version',versionQuery,'vehicle-version-list',()=>{
    const choice=versionChoices(),entries=choice.entries;
    return {items:entries.map(entry=>({title:core.versionLabel(entry),detail:entry.market_ids?.length?'Referencia de mercado':'Estimación con referencia oficial',value:entry})),message:entries.length?`${entries.length} ${choice.short?'opciones principales':entries.length===1?'versión':'versiones'} para ${year.value==='0km'?'0 km':year.value}.${choice.short?` También podés abrir las ${choice.total} versiones.`:entries.length>12?' Escribí motor, equipamiento o caja para filtrar.':''}`:'No hay coincidencias. Probá con «1.6», «manual» o el nombre de la versión.'};
  },entry=>{variant.value=entry.id;change(variant);versionQuery.value=core.versionLabel(entry);versionQuery.setCustomValidity('');versionQuery.focus();versionBox.close();});

  function sync(){
    const selected=group();
    if(!typingModel)query.value=selected?.title||'';
    query.disabled=!index;query.setCustomValidity(selected?'':'Elegí tu modelo entre las sugerencias.');
    el('vehicle-search-clear').hidden=!query.value;
    versionQuery.disabled=variant.disabled;
    versionQuery.placeholder=year.value?'Escribí o elegí la versión':'Primero elegí el año';
    const entry=selected?.entries.find(e=>e.id===variant.value);
    if(entry&&!entry.market_ids?.length)showAllVersions=true;
    if(!typingVersion)versionQuery.value=entry?core.versionLabel(entry):'';
    versionQuery.setCustomValidity(entry?'':'Elegí una versión de la lista.');
    const count=selected?core.versions(selected,year.value).length:0;
    el('version-search-help').textContent=count===1&&entry?'Única versión disponible para ese año.':count?`${count} versiones para ese año. Podés filtrar por motor, caja o equipamiento.`:'El año acorta la lista de versiones.';
    if(selected)query.removeAttribute('aria-invalid');
    if(entry)versionQuery.removeAttribute('aria-invalid');
    versionChoices();
  }
  for(const node of [brand,model,year,variant])node.addEventListener('change',()=>{
    el('resultados').hidden=true;
    if(node!==variant){showAllVersions=false;versionBox.close();}
    sync();
  });
  for(const input of [query,versionQuery])input.addEventListener('invalid',()=>input.setAttribute('aria-invalid','true'));
  el('vehicle-search-clear').addEventListener('click',()=>{
    query.value='';brand.value='';change(brand);modelBox.close();query.focus();
  });
  el('vehicle-manual-toggle').addEventListener('click',()=>{
    const manual=el('vehicle-manual');manual.hidden=!manual.hidden;
    el('vehicle-manual-toggle').setAttribute('aria-expanded',String(!manual.hidden));
    if(!manual.hidden)brand.focus();
  });
  el('version-more').addEventListener('click',()=>{showAllVersions=!showAllVersions;versionQuery.focus();versionBox.open();});

  function ready(){
    index=window.FACIL_AUTO_PICKER_DATA;if(!index)return;
    el('vehicle-quick').hidden=false;el('vehicle-manual').hidden=true;
    for(const node of [brand,model,variant])node.required=false;
    variant.hidden=true;variant.tabIndex=-1;
    variant.closest('label').htmlFor=versionQuery.id;
    el('version-combobox').hidden=false;
    form.classList.add('vehicle-picker-ready');sync();
  }
  window.addEventListener('facilauto:catalog-ready',ready);
  if(window.FACIL_AUTO_PICKER_DATA)ready();
})();
