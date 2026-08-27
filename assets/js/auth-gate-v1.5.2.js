/**
 * FACIL AUTO — Consultation gate v1.5.33
 *
 * Corrección:
 * - una consulta se debita SOLO si app.js produjo un resultado visible;
 * - evita consumir créditos cuando la combinación no puede calcularse;
 * - corrige el flujo dentro de las páginas SEO embebidas;
 * - mantiene 2 consultas anónimas + límite por IP;
 * - mantiene Google login, referidos y cuentas registradas.
 *
 * IMPORTANTE:
 * servicios-auth.js conserva el manejo de cuenta/planes/login, pero este
 * archivo pasa a controlar el ciclo "validar -> calcular -> debitar".
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
  gate.handler = gate.handler || null;
  gate.allowOnce = false;
  gate.authReady = gate.authReady || false;
  gate.version = '1.5.33';
  gate.ownsConsultationFlow = true;

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

    if (window.top !== window.self) {
      window.top.location.href = target;
    } else {
      window.location.href = target;
    }
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
    return document.querySelector(
      '#vehicle-form .calc-submit button[type="submit"]'
    );
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
    button.setAttribute(
      'aria-label',
      `Calcular operación. ${available} consultas disponibles`
    );
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
      button.innerHTML = 'CALCULAR OPERACIÓN <span>INGRESAR →</span>';
      button.setAttribute(
        'aria-label',
        'Ingresar para seguir haciendo consultas'
      );
      return;
    }

    button.innerHTML =
      `CALCULAR OPERACIÓN <span>${remaining} GRATIS →</span>`;

    button.setAttribute(
      'aria-label',
      `Calcular operación. ${remaining} consultas sin registro disponibles`
    );
  }

  async function requestJson(url, options = {}) {
    let response;

    try {
      response = await fetch(url, {
        cache: 'no-store',
        ...options
      });
    } catch (cause) {
      const error = new Error('network_error');
      error.cause = cause;
      throw error;
    }

    const data = await response.json().catch(() => ({}));

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

  async function authApi(path, options = {}) {
    const token = sessionToken();
    if (!token) {
      const error = new Error('not_authenticated');
      error.status = 401;
      throw error;
    }

    const headers = {
      'Accept': 'application/json',
      ...(options.body ? {'Content-Type': 'application/json'} : {}),
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`
    };

    return requestJson(
      `${AUTH_API_BASE}${path}`,
      {
        ...options,
        headers
      }
    );
  }

  async function anonymousApi(path) {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    const token = storedAnonToken();
    if (token) headers['X-FA-Anonymous-Token'] = token;

    try {
      const data = await requestJson(
        `${ANON_API_BASE}${path}`,
        {
          method: 'POST',
          headers,
          body: '{}'
        }
      );

      if (data?.token) setAnonToken(data.token);
      return data;
    } catch (err) {
      if (err.data?.token) setAnonToken(err.data.token);
      throw err;
    }
  }

  async function refreshAnonymousStatus() {
    if (sessionToken()) return null;

    try {
      const data = await anonymousApi('/api/anonymous/status');

      anonRemaining = Math.max(
        0,
        Number(data.remaining ?? DEFAULT_ANON_LIMIT)
      );

      anonIpRemaining = Math.max(
        0,
        Number(data.ip_remaining ?? DEFAULT_IP_LIMIT)
      );

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

  /**
   * Ejecuta app.js SIN debitar antes.
   *
   * app.js calcula de forma sincrónica y solamente pone #resultados.hidden=false
   * cuando pudo construir la valuación. Ese estado es nuestra confirmación de éxito.
   */
  function calculateWithoutCharging(form) {
    const result = document.getElementById('resultados');
    const hadVisibleResult = Boolean(result && !result.hidden);

    // Evita que un resultado anterior sea confundido con uno nuevo.
    if (result) result.hidden = true;

    // requestSubmit vuelve a ejecutar el evento submit. allowOnce deja pasar
    // exactamente ese submit hacia app.js.
    gate.allowOnce = true;

    try {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', {
          bubbles: true,
          cancelable: true
        }));
      }
    } catch (err) {
      gate.allowOnce = false;
      if (result && hadVisibleResult) result.hidden = false;
      console.error('FACIL AUTO calculation:', err);
      return false;
    }

    // Si la validación nativa frenó requestSubmit, el segundo submit no ocurrió.
    // No dejamos allowOnce armado para un intento posterior.
    gate.allowOnce = false;

    const success = Boolean(result && !result.hidden);

    if (!success && result && hadVisibleResult) {
      result.hidden = false;
    }

    return success;
  }

  function hideCurrentResult() {
    const result = document.getElementById('resultados');
    if (result) result.hidden = true;
  }

  function goToPlans() {
    const destination = new URL('planes/', location.origin + '/').toString();

    setTimeout(() => {
      if (window.top !== window.self) {
        window.top.location.href = destination;
      } else {
        window.location.href = destination;
      }
    }, 850);
  }

  async function registeredFlow(form) {
    let me;

    try {
      me = await authApi('/api/me');
    } catch (err) {
      if (err.status === 401) {
        clearSessionToken();
        show('Tu sesión venció. Volvé a ingresar.');
        setTimeout(login, 500);
        return;
      }

      show('No se pudo comprobar tus consultas disponibles.');
      return;
    }

    const account = me?.account || null;
    const isAdmin = Boolean(me?.is_admin);
    const available = Math.max(0, Number(account?.available) || 0);

    renderRegisteredButton(account);

    if (available <= 0 && !isAdmin) {
      show(
        'No te quedan consultas disponibles. Podés ampliar tu plan desde Planes.'
      );
      goToPlans();
      return;
    }

    // Primero se calcula. Si app.js no produce resultado, NO se debita.
    const calculated = calculateWithoutCharging(form);

    if (!calculated) {
      show(
        'No se pudo generar un resultado para esta combinación. No se consumió ninguna consulta.'
      );
      return;
    }

    try {
      const charged = await authApi(
        '/api/consultations/use',
        { method: 'POST' }
      );

      renderRegisteredButton(charged?.account || account);
      return;
    } catch (err) {
      // El administrador con saldo 0 utiliza el comportamiento existente:
      // el primer 402 regenera bonus. Luego debitamos automáticamente una vez.
      if (
        isAdmin &&
        (err.status === 402 || err.message === 'no_consultations_left')
      ) {
        try {
          const refreshed = await authApi('/api/me');
          const refreshedAccount = refreshed?.account || null;
          const refreshedAvailable = Math.max(
            0,
            Number(refreshedAccount?.available) || 0
          );

          if (refreshedAvailable > 0) {
            const retry = await authApi(
              '/api/consultations/use',
              { method: 'POST' }
            );

            renderRegisteredButton(
              retry?.account || refreshedAccount
            );
            return;
          }
        } catch (retryErr) {
          console.error(
            'FACIL AUTO admin consultation retry:',
            retryErr
          );
        }
      }

      if (err.status === 401) {
        hideCurrentResult();
        clearSessionToken();
        show('Tu sesión venció. Volvé a ingresar.');
        setTimeout(login, 500);
        return;
      }

      if (
        err.status === 402 ||
        err.message === 'no_consultations_left'
      ) {
        hideCurrentResult();
        show('No te quedan consultas disponibles.');
        goToPlans();
        return;
      }

      // Si hubo un error de red después de calcular, comprobamos el saldo:
      // si el Worker alcanzó a debitar, mantenemos el resultado.
      try {
        const after = await authApi('/api/me');
        const afterAccount = after?.account || null;
        const afterAvailable = Math.max(
          0,
          Number(afterAccount?.available) || 0
        );

        renderRegisteredButton(afterAccount);

        if (afterAvailable < available) {
          return;
        }
      } catch (_) {}

      hideCurrentResult();
      show(
        'No se pudo registrar la consulta. El resultado fue descartado para evitar un débito incorrecto.'
      );
    }
  }

  async function anonymousFlow(form) {
    let status;

    try {
      status = await anonymousApi('/api/anonymous/status');

      anonRemaining = Math.max(
        0,
        Number(status.remaining ?? DEFAULT_ANON_LIMIT)
      );

      anonIpRemaining = Math.max(
        0,
        Number(status.ip_remaining ?? DEFAULT_IP_LIMIT)
      );

      renderAnonymousButton();
    } catch (err) {
      console.error('FACIL AUTO anonymous status:', err);
      show(
        'No se pudo validar la consulta gratuita. Intentá nuevamente en unos segundos.'
      );
      return;
    }

    if (
      anonRemaining <= 0 ||
      anonIpRemaining <= 0 ||
      status?.login_required === true
    ) {
      show(
        'Terminaste las consultas sin registro. Ingresá con Google para continuar.'
      );
      setTimeout(login, 700);
      return;
    }

    const beforeRemaining = anonRemaining;

    // Igual que en usuarios registrados: se consume SOLO si hubo resultado.
    const calculated = calculateWithoutCharging(form);

    if (!calculated) {
      show(
        'No se pudo generar un resultado para esta combinación. No se consumió ninguna consulta gratis.'
      );
      return;
    }

    try {
      const used = await anonymousApi('/api/anonymous/use');

      anonRemaining = Math.max(
        0,
        Number(used.remaining ?? 0)
      );

      anonIpRemaining = Math.max(
        0,
        Number(used.ip_remaining ?? 0)
      );

      renderAnonymousButton();
      return;
    } catch (err) {
      const limitReached =
        err.status === 402 ||
        err.status === 429 ||
        err.data?.login_required === true;

      if (limitReached) {
        hideCurrentResult();

        if (err.status === 402) anonRemaining = 0;
        if (err.status === 429) anonIpRemaining = 0;

        renderAnonymousButton();

        show(
          'Terminaste las consultas sin registro. Ingresá con Google para continuar.'
        );

        setTimeout(login, 700);
        return;
      }

      // Una respuesta puede perderse después de que el Worker consumió.
      // Verificamos el estado antes de descartar el resultado.
      try {
        const after = await anonymousApi('/api/anonymous/status');

        anonRemaining = Math.max(
          0,
          Number(after.remaining ?? DEFAULT_ANON_LIMIT)
        );

        anonIpRemaining = Math.max(
          0,
          Number(after.ip_remaining ?? DEFAULT_IP_LIMIT)
        );

        renderAnonymousButton();

        if (anonRemaining < beforeRemaining) {
          return;
        }
      } catch (_) {}

      hideCurrentResult();

      show(
        'No se pudo registrar la consulta gratuita. El resultado fue descartado y podés volver a intentar.'
      );
    }
  }

  async function handleSubmit(form) {
    if (busy) return;

    busy = true;
    setButtonDisabled(true);

    try {
      if (sessionToken()) {
        await registeredFlow(form);
      } else {
        await anonymousFlow(form);
      }
    } finally {
      busy = false;
      setButtonDisabled(false);
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

      handleSubmit(form);
    }, true);
  }

  const cta = document.querySelector('[data-auth-entry]');

  if (cta) {
    cta.addEventListener('click', event => {
      event.preventDefault();
      login();
    });
  }

  // servicios-auth.js puede actualizar el texto del botón durante su init.
  // En modo anónimo lo corregimos automáticamente con el saldo anónimo.
  const button = submitButton();

  if (button) {
    const observer = new MutationObserver(() => {
      if (!sessionToken()) {
        queueMicrotask(renderAnonymousButton);
      }
    });

    observer.observe(button, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  document.querySelectorAll('footer p').forEach(el => {
    if (/v\d+\.\d+\.\d+/.test(el.textContent || '')) {
      el.textContent = el.textContent.replace(
        /v\d+\.\d+\.\d+/g,
        'v1.5.33'
      );
    }
  });

  window.addEventListener('storage', event => {
    if (
      event.key === TOKEN_KEY ||
      event.key === ANON_TOKEN_KEY
    ) {
      refreshAnonymousStatus();
      renderAnonymousButton();
    }
  });

  gate.login = login;

  if (!sessionToken()) {
    renderAnonymousButton();
    refreshAnonymousStatus();
  }
})();
