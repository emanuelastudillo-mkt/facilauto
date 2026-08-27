/**
 * FACIL AUTO — Auth + Anonymous consultation gate v1.5.30
 *
 * Mantiene el flujo autenticado existente y agrega:
 * - 2 consultas sin registro por identificador anónimo.
 * - validación real en Worker/D1 antes de permitir cada consulta.
 * - el tercer intento deriva al login con Google.
 *
 * Este archivo conserva el mismo path usado por index.html:
 * assets/js/auth-gate-v1.5.2.js
 */
(() => {
  const TOKEN_KEY = 'facilauto_session_v1';
  const REFERRAL_KEY = 'facilauto_referral_v1';
  const ANON_TOKEN_KEY = 'facilauto_anonymous_token_v1';

  const AUTH_API_BASE = 'https://facilauto-auth.emanuelmkt.workers.dev';
  const ANON_API_BASE = 'https://facilauto-anon.emanuelmkt.workers.dev';

  const DEFAULT_ANON_LIMIT = 2;

  let anonRemaining = null;
  let anonIpRemaining = null;
  let anonBusy = false;

  const gate = window.FACIL_AUTO_GATE = window.FACIL_AUTO_GATE || {
    handler: null,
    allowOnce: false,
    authReady: false
  };

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

    if (window.top !== window.self) {
      window.top.location.href = target;
    } else {
      window.location.href = target;
    }
  }

  function show(message, duration = 4200) {
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
    return document.querySelector(
      '#vehicle-form .calc-submit button[type="submit"]'
    );
  }

  function storedAnonToken() {
    return String(localStorage.getItem(ANON_TOKEN_KEY) || '').trim();
  }

  function setAnonToken(value) {
    const clean = String(value || '').trim();
    if (clean) localStorage.setItem(ANON_TOKEN_KEY, clean);
  }

  async function anonymousApi(path) {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const anonymousToken = storedAnonToken();
    if (anonymousToken) {
      headers['X-FA-Anonymous-Token'] = anonymousToken;
    }

    let response;
    try {
      response = await fetch(`${ANON_API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: '{}',
        cache: 'no-store'
      });
    } catch (cause) {
      const error = new Error('anonymous_service_unavailable');
      error.cause = cause;
      throw error;
    }

    const data = await response.json().catch(() => ({}));

    if (data?.token) {
      setAnonToken(data.token);
    }

    if (!response.ok) {
      const error = new Error(
        data.message || data.error || `HTTP ${response.status}`
      );
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function renderAnonymousButton() {
    if (localStorage.getItem(TOKEN_KEY)) return;

    const button = submitButton();
    if (!button) return;

    const remaining = Number.isFinite(Number(anonRemaining))
      ? Math.max(0, Number(anonRemaining))
      : DEFAULT_ANON_LIMIT;

    let html;
    let label;

    if (remaining <= 0 || anonIpRemaining === 0) {
      html = 'CALCULAR OPERACIÓN <span>INGRESAR →</span>';
      label = 'Ingresar para seguir haciendo consultas';
    } else {
      html = `CALCULAR OPERACIÓN <span>${remaining} GRATIS →</span>`;
      label = `Calcular operación. ${remaining} consultas sin registro disponibles`;
    }

    if (button.innerHTML !== html) {
      button.innerHTML = html;
    }

    button.setAttribute('aria-label', label);
  }

  async function refreshAnonymousStatus() {
    if (localStorage.getItem(TOKEN_KEY)) return;

    try {
      const data = await anonymousApi('/api/anonymous/status');
      anonRemaining = Math.max(
        0,
        Number(data.remaining ?? DEFAULT_ANON_LIMIT)
      );
      anonIpRemaining = Math.max(
        0,
        Number(data.ip_remaining ?? 5)
      );
    } catch (err) {
      console.warn('FACIL AUTO anonymous status:', err);
      anonRemaining = null;
      anonIpRemaining = null;
    }

    renderAnonymousButton();
  }

  function continueCalculation(form) {
    gate.allowOnce = true;

    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true
      }));
    }
  }

  async function useAnonymousConsultation(form) {
    if (anonBusy) return;

    anonBusy = true;
    const button = submitButton();
    if (button) button.disabled = true;

    try {
      const data = await anonymousApi('/api/anonymous/use');

      anonRemaining = Math.max(0, Number(data.remaining ?? 0));
      anonIpRemaining = Math.max(0, Number(data.ip_remaining ?? 0));
      renderAnonymousButton();

      continueCalculation(form);
    } catch (err) {
      const loginRequired =
        err.status === 402 ||
        err.status === 429 ||
        err.data?.login_required === true;

      if (loginRequired) {
        if (err.status === 402) anonRemaining = 0;
        if (err.status === 429) anonIpRemaining = 0;

        renderAnonymousButton();

        show(
          'Terminaste las consultas sin registro. Ingresá con Google para continuar.'
        );

        setTimeout(() => {
          if (typeof gate.login === 'function') gate.login();
          else login();
        }, 700);

        return;
      }

      console.error('FACIL AUTO anonymous consultation:', err);
      show(
        'No se pudo validar la consulta gratuita. Intentá nuevamente en unos segundos.'
      );
    } finally {
      anonBusy = false;
      if (button) button.disabled = false;
    }
  }

  const form = document.getElementById('vehicle-form');

  if (form) {
    form.addEventListener('submit', event => {
      if (gate.allowOnce === true) {
        gate.allowOnce = false;
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      // Con sesión: se conserva exactamente el gate de créditos actual.
      if (localStorage.getItem(TOKEN_KEY)) {
        if (typeof gate.handler === 'function') {
          gate.handler(form);
          return;
        }

        show('Preparando tu cuenta. Intentá nuevamente en un instante.');
        return;
      }

      // Sin sesión: el Worker anónimo decide si queda una consulta.
      useAnonymousConsultation(form);
    }, true);
  }

  const cta = document.querySelector('[data-auth-entry]');
  if (cta) {
    cta.addEventListener('click', event => {
      event.preventDefault();
      login();
    });
  }

  // Mantiene el CTA correcto aunque servicios-auth.js vuelva a renderizar
  // temporalmente "INGRESAR" mientras inicializa la cuenta.
  const button = submitButton();
  if (button) {
    const observer = new MutationObserver(() => {
      if (!localStorage.getItem(TOKEN_KEY)) {
        queueMicrotask(renderAnonymousButton);
      }
    });

    observer.observe(button, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // Versión visible sin obligar a modificar index.html en este incremental.
  document.querySelectorAll('footer p').forEach(el => {
    if (/v\d+\.\d+\.\d+/.test(el.textContent || '')) {
      el.textContent = el.textContent.replace(
        /v\d+\.\d+\.\d+/g,
        'v1.5.30'
      );
    }
  });

  window.addEventListener('storage', event => {
    if (event.key === TOKEN_KEY || event.key === ANON_TOKEN_KEY) {
      refreshAnonymousStatus();
      renderAnonymousButton();
    }
  });

  gate.login = login;

  renderAnonymousButton();
  refreshAnonymousStatus();
})();
