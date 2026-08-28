import {api, token} from '../../servicios-auth.js?v=1.5.36';

const $ = s => document.querySelector(s);

function deny(){ location.replace('../../index.html'); }
function esc(v=''){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function loadSummary(){
  const data = await api('/api/admin/data-quality/summary');
  $('#q-aliases').textContent = data.aliases_approved ?? 0;
  $('#q-overrides').textContent = data.overrides_approved ?? 0;
  $('#q-pending').textContent = data.review_pending ?? 0;
  $('#q-reviewed').textContent = data.review_reviewed ?? 0;
}

async function loadRules(){
  const root = $('#quality-rules');
  const data = await api('/api/admin/data-quality/rules');
  const aliases = Array.isArray(data.aliases) ? data.aliases : [];
  const overrides = Array.isArray(data.overrides) ? data.overrides : [];

  const rows = [
    ...overrides.map(x=>({
      type:'Corrección origen',
      from:x.source_value,
      to:x.canonical_value
    })),
    ...aliases.slice(0,120).map(x=>({
      type:x.brand,
      from:x.alias_model,
      to:x.canonical_model
    }))
  ];

  root.innerHTML = rows.length ? rows.map(x=>`
    <div class="quality-rule">
      <small>${esc(x.type)}</small>
      <strong>${esc(x.from)}</strong>
      <strong>→ ${esc(x.to)}</strong>
    </div>
  `).join('') : '<div class="admin-empty">No hay reglas cargadas.</div>';
}

function variantHtml(v){
  return `<div class="quality-variant"><b>${esc(v.variant||'')}</b><br><span>${esc(v.years||'')} · ${esc(v.source||'')}</span></div>`;
}

async function decide(id, action){
  await api('/api/admin/data-quality/review/decision',{
    method:'POST',
    body:JSON.stringify({id, decision:action})
  });
  await Promise.all([loadSummary(), loadReview()]);
}

async function loadReview(){
  const root = $('#quality-review-list');
  const status = $('#quality-status').value;
  const data = await api(`/api/admin/data-quality/review?status=${encodeURIComponent(status)}&limit=100`);
  const rows = Array.isArray(data.items) ? data.items : [];

  if(!rows.length){
    root.innerHTML = '<div class="admin-empty">No hay candidatos para este filtro.</div>';
    return;
  }

  root.innerHTML = rows.map(item=>{
    let payload={};
    try{ payload=JSON.parse(item.payload_json||'{}'); }catch(_){}
    const variants=Array.isArray(payload.variants)?payload.variants:[];
    return `
      <article class="quality-item">
        <div class="quality-item-head">
          <div>
            <small>${esc(item.issue_type)}</small>
            <h3>${esc(item.brand)} · ${esc(item.model)}</h3>
            <p>${variants.length} registros relacionados · score ${esc(item.score)}</p>
          </div>
          <span class="quality-decision">${esc(item.status)}${item.decision?` · ${esc(item.decision)}`:''}</span>
        </div>
        <div class="quality-variants">${variants.map(variantHtml).join('')}</div>
        ${item.status==='pending' ? `
        <div class="quality-actions">
          <button data-id="${item.id}" data-action="merge">MISMO VEHÍCULO</button>
          <button data-id="${item.id}" data-action="separate">MANTENER SEPARADOS</button>
          <button data-id="${item.id}" data-action="ignore">IGNORAR</button>
        </div>` : ''}
      </article>
    `;
  }).join('');

  root.querySelectorAll('button[data-action]').forEach(btn=>{
    btn.addEventListener('click',()=>decide(Number(btn.dataset.id),btn.dataset.action));
  });
}

async function init(){
  if(!token()) return deny();
  try{
    const me=await api('/api/me');
    if(!me?.authenticated||!me?.is_admin)return deny();
    document.documentElement.classList.remove('fa-quality-pending');
    $('#quality-refresh').addEventListener('click',()=>Promise.all([loadSummary(),loadRules(),loadReview()]));
    $('#quality-status').addEventListener('change',loadReview);
    await Promise.all([loadSummary(),loadRules(),loadReview()]);
  }catch(err){
    if(err?.status===401||err?.status===403)return deny();
    console.error(err);
    document.documentElement.classList.remove('fa-quality-pending');
    $('#quality-review-list').innerHTML='<div class="admin-empty">No se pudo cargar Calidad de datos.</div>';
  }
}
document.readyState==='loading'
  ? document.addEventListener('DOMContentLoaded',init,{once:true})
  : init();
