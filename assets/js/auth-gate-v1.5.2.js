/**
 * FACIL AUTO — Consultation manager v1.5.35
 *
 * Flujo robusto:
 * 1) app.js calcula y prepara el resultado en memoria/DOM oculto.
 * 2) app.js llama FACIL_AUTO_GATE.consume().
 * 3) si el Worker autoriza y debita, app.js muestra el resultado.
 *
 * No hay submit anidado ni handshake entre versiones de scripts.
 */
(() => {
  const TOKEN_KEY = 'facilauto_session_v1';
  const REFERRAL_KEY = 'facilauto_referral_v1';
  const ANON_TOKEN_KEY = 'facilauto_anonymous_token_v1';

  const AUTH_API_BASE = 'https://facilauto-auth.emanuelmkt.workers.dev';
  const ANON_API_BASE = 'https://facilauto-anon.emanuelmkt.workers.dev';

  const DEFAULT_ANON_LIMIT = 2;
  const DEFAULT_IP_LIMIT = 5;

  let anonRemaining = null;
  let anonIpRemaining = null;
  let busy = false;

  const gate = window.FACIL_AUTO_GATE = window.FACIL_AUTO_GATE || {};
  gate.version = '1.5.35';
  gate.ownsConsultationFlow = true;
  gate.handler = null;
  gate.allowOnce = false;
  gate.authReady = true;

  function sessionToken() {
    return String(localStorage.getItem(TOKEN_KEY) || '').trim();
  }

  function clearSessionToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function returnTo() {
    const params = new URLSearchParams(location.search);

    if (params.get('embed') === '1' && params.get('share_url')) {
      return params.get('share_url');
    }

    const url = new URL(location.href);
    url.searchParams.delete('login_ticket');
    url.searchParams.delete('login');
    return url.toString();
  }

  function referral() {
    const params = new URLSearchParams(location.search);
    const direct = String(params.get('ref') || '').trim();

    if (/^[A-Za-z0-9_-]{6,32}$/.test(direct)) {
      localStorage.setItem(REFERRAL_KEY, direct);
      return direct;
    }

    const stored = String(localStorage.getItem(REFERRAL_KEY) || '').trim();
    return /^[A-Za-z0-9_-]{6,32}$/.test(stored) ? stored : '';
  }

  function login() {
    const ref = referral();
    const target =
      `${AUTH_API_BASE}/auth/google?return_to=${encodeURIComponent(returnTo())}` +
      (ref ? `&ref=${encodeURIComponent(ref)}` : '');

    if (window.top !== window.self) window.top.location.href = target;
    else window.location.href = target;
  }

  function show(message, duration = 4500) {
    document.querySelector('.fa-gate-message')?.remove();

    const el = document.createElement('div');
    el.className = 'fa-gate-message';
    el.textContent = message;

    Object.assign(el.style, {
      position: 'fixed',
      left: '20px',
      right: '20px',
      bottom: '20px',
      zIndex: '10060',
      background: '#181818',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '4px',
      font: '600 12px/1.4 Arial,sans-serif'
    });

    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  function submitButton() {
    return document.querySelector('#vehicle-form .calc-submit button[type="submit"]');
  }

  function setButtonDisabled(value) {
    const button = submitButton();
    if (button) button.disabled = Boolean(value);
  }

  function renderRegisteredButton(account) {
    if (!sessionToken()) return;
    const button = submitButton();
    if (!button || !account) return;

    const available = Math.max(0, Number(account.available) || 0);
    button.dataset.empty = available <= 0 ? '1' : '0';
    button.innerHTML = `CALCULAR OPERACIÓN <span>(${available}) →</span>`;
    button.setAttribute('aria-label', `Calcular operación. ${available} consultas disponibles`);
  }

  function storedAnonToken() {
    return String(localStorage.getItem(ANON_TOKEN_KEY) || '').trim();
  }

  function setAnonToken(value) {
    const clean = String(value || '').trim();
    if (clean) localStorage.setItem(ANON_TOKEN_KEY, clean);
  }

  function renderAnonymousButton() {
    if (sessionToken()) return;
    const button = submitButton();
    if (!button) return;

    const remaining = Number.isFinite(Number(anonRemaining))
      ? Math.max(0, Number(anonRemaining))
      : DEFAULT_ANON_LIMIT;

    const ipRemaining = Number.isFinite(Number(anonIpRemaining))
      ? Math.max(0, Number(anonIpRemaining))
      : DEFAULT_IP_LIMIT;

    if (remaining <= 0 || ipRemaining <= 0) {
      const html = 'CALCULAR OPERACIÓN <span>INGRESAR →</span>';
      if (button.innerHTML !== html) button.innerHTML = html;
      button.setAttribute('aria-label', 'Ingresar para seguir haciendo consultas');
      return;
    }

    const html = `CALCULAR OPERACIÓN <span>${remaining} GRATIS →</span>`;
    if (button.innerHTML !== html) button.innerHTML = html;
    button.setAttribute(
      'aria-label',
      `Calcular operación. ${remaining} consultas sin registro disponibles`
    );
  }

  async function requestJson(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {cache:'no-store', ...options});
    } catch (cause) {
      const error = new Error('network_error');
      error.cause = cause;
      throw error;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function authApi(path, options = {}) {
    const token = sessionToken();
    if (!token) {
      const error = new Error('not_authenticated');
      error.status = 401;
      throw error;
    }

    const headers = {
      'Accept': 'application/json',
      ...(options.body ? {'Content-Type':'application/json'} : {}),
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`
    };

    return requestJson(`${AUTH_API_BASE}${path}`, {...options, headers});
  }

  async function anonymousApi(path) {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const token = storedAnonToken();
    if (token) headers['X-FA-Anonymous-Token'] = token;

    try {
      const data = await requestJson(`${ANON_API_BASE}${path}`, {
        method:'POST', headers, body:'{}'
      });
      if (data?.token) setAnonToken(data.token);
      return data;
    } catch (err) {
      if (err.data?.token) setAnonToken(err.data.token);
      throw err;
    }
  }

  function goToPlans() {
    const destination = new URL('planes/', location.origin + '/').toString();
    setTimeout(() => {
      if (window.top !== window.self) window.top.location.href = destination;
      else window.location.href = destination;
    }, 850);
  }

  async function refreshAnonymousStatus() {
    if (sessionToken()) return null;
    try {
      const data = await anonymousApi('/api/anonymous/status');
      anonRemaining = Math.max(0, Number(data.remaining ?? DEFAULT_ANON_LIMIT));
      anonIpRemaining = Math.max(0, Number(data.ip_remaining ?? DEFAULT_IP_LIMIT));
      renderAnonymousButton();
      return data;
    } catch (err) {
      console.warn('FACIL AUTO anonymous status:', err);
      anonRemaining = null;
      anonIpRemaining = null;
      renderAnonymousButton();
      return null;
    }
  }

  async function consumeRegistered() {
    let me;
    try {
      me = await authApi('/api/me');
    } catch (err) {
      if (err.status === 401) {
        clearSessionToken();
        show('Tu sesión venció. Volvé a ingresar.');
        setTimeout(login, 500);
        return false;
      }
      show('No se pudo comprobar tus consultas disponibles.');
      return false;
    }

    const account = me?.account || null;
    const isAdmin = Boolean(me?.is_admin);
    const available = Math.max(0, Number(account?.available) || 0);
    renderRegisteredButton(account);

    if (available <= 0 && !isAdmin) {
      show('No te quedan consultas disponibles. Podés ampliar tu plan desde Planes.');
      goToPlans();
      return false;
    }

    try {
      const used = await authApi('/api/consultations/use', {method:'POST'});
      renderRegisteredButton(used?.account || account);
      return true;
    } catch (err) {
      if (isAdmin && (err.status === 402 || err.message === 'no_consultations_left')) {
        try {
          const refreshed = await authApi('/api/me');
          const refreshedAccount = refreshed?.account || null;
          const refreshedAvailable = Math.max(0, Number(refreshedAccount?.available) || 0);

          if (refreshedAvailable > 0) {
            const retry = await authApi('/api/consultations/use', {method:'POST'});
            renderRegisteredButton(retry?.account || refreshedAccount);
            return true;
          }
        } catch (retryErr) {
          console.error('FACIL AUTO admin consultation retry:', retryErr);
        }
      }

      if (err.status === 401) {
        clearSessionToken();
        show('Tu sesión venció. Volvé a ingresar.');
        setTimeout(login, 500);
        return false;
      }

      if (err.status === 402 || err.message === 'no_consultations_left') {
        show('No te quedan consultas disponibles.');
        if (!isAdmin) goToPlans();
        return false;
      }

      show('No se pudo registrar la consulta. Intentá nuevamente.');
      console.error('FACIL AUTO registered consultation:', err);
      return false;
    }
  }

  async function consumeAnonymous() {
    try {
      const status = await anonymousApi('/api/anonymous/status');
      anonRemaining = Math.max(0, Number(status.remaining ?? DEFAULT_ANON_LIMIT));
      anonIpRemaining = Math.max(0, Number(status.ip_remaining ?? DEFAULT_IP_LIMIT));
      renderAnonymousButton();

      if (anonRemaining <= 0 || anonIpRemaining <= 0 || status?.login_required === true) {
        show('Terminaste las consultas sin registro. Ingresá con Google para continuar.');
        setTimeout(login, 700);
        return false;
      }

      const used = await anonymousApi('/api/anonymous/use');
      anonRemaining = Math.max(0, Number(used.remaining ?? 0));
      anonIpRemaining = Math.max(0, Number(used.ip_remaining ?? 0));
      renderAnonymousButton();
      return true;
    } catch (err) {
      const loginRequired =
        err.status === 402 ||
        err.status === 429 ||
        err.data?.login_required === true;

      if (loginRequired) {
        if (err.status === 402) anonRemaining = 0;
        if (err.status === 429) anonIpRemaining = 0;
        renderAnonymousButton();
        show('Terminaste las consultas sin registro. Ingresá con Google para continuar.');
        setTimeout(login, 700);
        return false;
      }

      show('No se pudo validar la consulta gratuita. Intentá nuevamente en unos segundos.');
      console.error('FACIL AUTO anonymous consultation:', err);
      return false;
    }
  }

  async function consume() {
    if (busy) return false;
    busy = true;
    setButtonDisabled(true);

    try {
      return sessionToken()
        ? await consumeRegistered()
        : await consumeAnonymous();
    } finally {
      busy = false;
      setButtonDisabled(false);
    }
  }

  const cta = document.querySelector('[data-auth-entry]');
  if (cta) {
    cta.addEventListener('click', event => {
      event.preventDefault();
      login();
    });
  }

  const button = submitButton();
  if (button) {
    const observer = new MutationObserver(() => {
      if (!sessionToken()) queueMicrotask(renderAnonymousButton);
    });
    observer.observe(button, {childList:true, subtree:true, characterData:true});
  }

  window.addEventListener('storage', event => {
    if (event.key === TOKEN_KEY || event.key === ANON_TOKEN_KEY) {
      refreshAnonymousStatus();
      renderAnonymousButton();
    }
  });

  gate.login = login;
  gate.consume = consume;
  gate.refreshAnonymousStatus = refreshAnonymousStatus;

  if (!sessionToken()) {
    renderAnonymousButton();
    refreshAnonymousStatus();
  }
})();
