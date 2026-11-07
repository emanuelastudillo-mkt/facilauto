/* Model search only: source identities and valuation amounts remain unchanged. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FACIL_AUTO_SEARCH=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const modelLabel=value=>String(value||'').replace(/\bPICK\s*-?\s*UP\b/gi,'').replace(/\bRAV\s*-?\s*4\b/gi,'RAV4').replace(/\bF\s*-\s*(100|150|250|350)\b/gi,'F$1').replace(/\s+/g,' ').trim();
  const familyKey=(brand,model)=>`${normalize(brand)}|${normalize(modelLabel(model)).replace(/ /g,'')}`;
  const brandLabel=value=>['BMW','DS','GMC','JAC','JMC','KIA','MINI','RAM','BYD','DFSK','GWM','MG'].includes(value)?value:String(value).toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  const yearSort=(a,b)=>a==='0km'?-1:b==='0km'?1:Number(b)-Number(a);

  function versionLabel(entry){
    let text=String(entry.variant||'').replace(/\uFFFD/g,' ').trim();
    for(const prefix of [entry.brand,entry.model]){
      if(text.toUpperCase().startsWith(`${String(prefix).toUpperCase()} `))text=text.slice(prefix.length).trim();
    }
    return text.replace(/\b([345])P\b/g,'$1 puertas')
      .replace(/\bD\/C\b/g,'Doble cabina').replace(/\bC\/S\b/g,'Cabina simple')
      .replace(/\bAT\b/g,'automática').replace(/\bMT\b/g,'manual')
      .replace(/\s+/g,' ').trim()||entry.variant;
  }

  function buildIndex(entries){
    const families=new Map();
    for(const entry of entries){
      if(entry.public===false)continue;
      const id=familyKey(entry.brand,entry.model);
      if(!families.has(id))families.set(id,{id,brand:entry.brand,model:entry.model,label:modelLabel(entry.model),entries:[],models:new Set(),years:new Set(),hasMarket:false});
      const group=families.get(id);
      group.entries.push(entry);group.models.add(entry.model);
      for(const year of entry.years||[])group.years.add(year);
      group.hasMarket||=Boolean(entry.market_ids?.length);
    }
    const groups=[...families.values()];
    for(const group of groups){
      group.years=[...group.years].sort(yearSort);
      group.models=[...group.models];
      group.title=`${brandLabel(group.brand)} ${group.label}`;
      group.words=[...new Set(normalize(`${group.brand} ${group.label} ${group.models.join(' ')}`).split(' '))];
      group.modelWords=normalize(group.label).split(' ');
    }
    return {groups,byId:families};
  }

  function oneEdit(a,b){
    if(Math.abs(a.length-b.length)>1)return false;
    let i=0,j=0,edits=0;
    while(i<a.length&&j<b.length){
      if(a[i]===b[j]){i++;j++;continue;}
      if(++edits>1)return false;
      if(a.length>=b.length)i++;
      if(b.length>=a.length)j++;
    }
    return edits+(i<a.length||j<b.length?1:0)<=1;
  }

  function queryWords(query){
    return normalize(query).replace(/\bVW\b/g,'VOLKSWAGEN').replace(/\bMB\b/g,'MERCEDES BENZ').replace(/\b0 KM\b/g,'0KM').split(' ').filter(Boolean);
  }

  function rank(group,words){
    let score=group.hasMarket?3:0;
    for(const word of words){
      if(group.modelWords.includes(word)){score+=24;continue;}
      if(group.words.includes(word)){score+=12;continue;}
      if(group.words.some(token=>token.startsWith(word))){score+=6;continue;}
      if(word.length>=4&&!/\d/.test(word)&&group.words.some(token=>token.length>=4&&oneEdit(token,word))){score+=1;continue;}
      return -1;
    }
    if(normalize(group.label)===words.join(' '))score+=30;
    return score;
  }

  function search(index,query,limit=8){
    const words=queryWords(query);
    if(!words.length)return {items:[],total:0,year:''};
    const find=(terms,year)=>index.groups.filter(group=>!year||group.years.includes(year))
      .map(group=>({group,score:rank(group,terms)})).filter(hit=>hit.score>=0)
      .sort((a,b)=>b.score-a.score||a.group.title.localeCompare(b.group.title,'es',{numeric:true}));
    // A numeric model such as Peugeot 2008 takes precedence over interpreting
    // 2008 as a year. Only extract a year if the entire model query has no match.
    let hits=find(words,''),year='';
    if(!hits.length&&words.length>1){
      const at=words.findLastIndex(word=>/^(19\d{2}|20\d{2}|0KM)$/.test(word));
      if(at>=0){
        year=words[at]==='0KM'?'0km':words[at];
        hits=find(words.filter((_,i)=>i!==at),year);
      }
    }
    return {items:hits.slice(0,limit).map(hit=>hit.group),total:hits.length,year};
  }

  function versions(group,year,query=''){
    const words=queryWords(query).map(word=>word==='AUTOMATICO'?'AUTOMATICA':word);
    return (group?.entries||[]).filter(entry=>entry.years.includes(year))
      .filter(entry=>{
        const available=normalize(`${entry.variant} ${versionLabel(entry)}`).split(' ');
        return words.every(word=>available.some(token=>token.startsWith(word)));
      })
      .sort((a,b)=>Number(Boolean(b.market_ids?.length))-Number(Boolean(a.market_ids?.length))||versionLabel(a).localeCompare(versionLabel(b),'es',{numeric:true}));
  }
  return {normalize,modelLabel,familyKey,brandLabel,versionLabel,buildIndex,search,versions,yearSort};
});
