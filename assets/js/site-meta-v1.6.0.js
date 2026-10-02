const META_URL = new URL('../../data/site_meta.json', import.meta.url);

const formatMetric = metric => {
  const decimals = Number(metric?.decimals || 0);
  const formatted = Number(metric?.value).toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return metric?.format === 'percent' ? `${formatted}%` : formatted;
};

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

function updateHomePulse(meta) {
  const pulse = meta?.home_pulse;
  if (!pulse) return;

  const title = String(pulse.title || 'Pulso de valuaciones').toUpperCase();
  setText('#market-pulse-period', `${title} · ${String(pulse.period || '').toUpperCase()}`);
  setText('#market-pulse-country', pulse.subtitle);
  setText('#market-pulse-note', pulse.note);

  const targets = [
    ['#market-pulse-monthly-label', '#market-pulse-monthly', '#market-pulse-monthly-caption'],
    ['#market-pulse-ytd-label', '#market-pulse-ytd', '#market-pulse-ytd-caption'],
    ['#market-pulse-leader-label', '#market-pulse-leader', '#market-pulse-leader-caption'],
  ];
  targets.forEach(([labelSelector, valueSelector, captionSelector], index) => {
    const metric = pulse.metrics?.[index];
    if (!metric) return;
    setText(labelSelector, metric.label);
    setText(valueSelector, formatMetric(metric));
    setText(captionSelector, metric.caption);
    const element = document.querySelector(valueSelector);
    if (!element) return;
    element.dataset.marketCount = String(metric.value);
    element.dataset.marketDecimals = String(metric.decimals || 0);
    element.dataset.marketSuffix = metric.format === 'percent' ? '%' : '';
  });
}

async function loadSiteMeta() {
  try {
    const response = await fetch(META_URL, {cache: 'no-store', headers: {'Accept': 'application/json'}});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const meta = await response.json();
    updateVersion(meta);
    updateHomePulse(meta);
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
