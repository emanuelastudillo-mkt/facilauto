const META_URL = new URL('../../data/site_meta.json', import.meta.url);

const formatNumber = value => Number(value).toLocaleString('es-AR');

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element && value !== undefined && value !== null) element.textContent = String(value);
}

function updateVersion(meta) {
  const version = String(meta?.release?.version || '').trim();
  if (!version) return;

  document.documentElement.dataset.siteVersion = version;
  document.querySelectorAll('.footer p, .seo-footer p').forEach(element => {
    const base = element.textContent.replace(/\s*·\s*v\d+(?:\.\d+)*\s*$/i, '').trim();
    element.textContent = `${base} · v${version}`;
  });
}

function updateMarketPulse(meta) {
  const pulse = meta?.market_pulse;
  if (!pulse) return;

  setText('#market-pulse-period', `PULSO DEL MERCADO · ${String(pulse.period || '').toUpperCase()}`);
  setText('#market-pulse-country', pulse.country_label);
  setText('#market-pulse-monthly', formatNumber(pulse.monthly_transactions));
  setText('#market-pulse-monthly-caption', pulse.monthly_caption);
  setText('#market-pulse-ytd-label', pulse.year_to_date_label);
  setText('#market-pulse-ytd', formatNumber(pulse.year_to_date));
  setText('#market-pulse-ytd-caption', pulse.year_to_date_caption);
  setText('#market-pulse-leader', formatNumber(pulse.leader_transactions));
  setText('#market-pulse-leader-caption', pulse.leader_caption);

  ['#market-pulse-monthly', '#market-pulse-ytd', '#market-pulse-leader'].forEach(selector => {
    const element = document.querySelector(selector);
    if (element) element.dataset.marketCount = String(element.textContent).replace(/\D/g, '');
  });

  const source = document.querySelector('#market-pulse-source');
  if (source && pulse.source_url) {
    source.href = pulse.source_url;
    source.textContent = pulse.source_name || 'Fuente oficial';
  }
}

async function loadSiteMeta() {
  try {
    const response = await fetch(META_URL, {cache: 'no-store', headers: {'Accept': 'application/json'}});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const meta = await response.json();
    updateVersion(meta);
    updateMarketPulse(meta);
    window.FACIL_AUTO_SITE_META = meta;
    window.dispatchEvent(new CustomEvent('facilauto:site-meta', {detail: meta}));
  } catch (error) {
    console.warn('FACIL AUTO site metadata:', error);
  }
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', loadSiteMeta, {once: true})
  : loadSiteMeta();

export {loadSiteMeta};
