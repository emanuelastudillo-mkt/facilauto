(() => {
  const IDS = ['brand', 'model', 'variant', 'year'];

  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  function enhance(select) {
    if (!select || select.dataset.searchableReady === '1') return;
    select.dataset.searchableReady = '1';

    const label = select.closest('label');
    const fieldName = label?.querySelector(':scope > span')?.textContent?.trim() || 'Opción';
    const input = document.createElement('input');
    const datalist = document.createElement('datalist');
    const listId = `fa-options-${select.id}`;
    let displayToValue = new Map();
    let selectionTimer = 0;

    datalist.id = listId;
    input.id = `fa-search-${select.id}`;
    input.type = 'text';
    input.className = 'fa-searchable-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.required = select.required;
    input.setAttribute('list', listId);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', fieldName);
    input.setAttribute('aria-autocomplete', 'list');

    select.required = false;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.classList.add('fa-searchable-native');

    select.insertAdjacentElement('afterend', input);
    input.insertAdjacentElement('afterend', datalist);
    if (label) label.htmlFor = input.id;

    function rebuild() {
      const seen = new Map();
      displayToValue = new Map();
      datalist.replaceChildren();

      [...select.options].filter(option => option.value && !option.disabled).forEach(option => {
        const original = option.textContent.trim();
        const repeated = (seen.get(original) || 0) + 1;
        seen.set(original, repeated);
        const display = repeated === 1 ? original : `${original} · opción ${repeated}`;
        displayToValue.set(normalize(display), option.value);
        const suggestion = document.createElement('option');
        suggestion.value = display;
        datalist.appendChild(suggestion);
      });

      input.disabled = select.disabled;
      input.placeholder = select.options[0]?.textContent?.trim() || `Escribí para buscar ${fieldName.toLowerCase()}`;
      const selected = select.selectedOptions[0];
      input.value = select.value && selected ? selected.textContent.trim() : '';
      input.setCustomValidity('');
    }

    function commitTypedValue() {
      const key = normalize(input.value);
      const value = displayToValue.get(key) || '';
      select.value = value;
      input.setCustomValidity(value || !input.value.trim() ? '' : 'Elegí una opción de la lista.');
      if (!value) return;

      const selected = select.selectedOptions[0];
      if (selected) input.value = selected.textContent.trim();
      window.clearTimeout(selectionTimer);
      // El cambio se procesa fuera del evento nativo del datalist para que los
      // selects dependientes puedan reconstruirse sin bloquear el campo activo.
      selectionTimer = window.setTimeout(() => {
        select.dispatchEvent(new Event('change', {bubbles: true}));
      }, 0);
    }

    input.addEventListener('input', () => {
      const exact = displayToValue.has(normalize(input.value));
      if (exact) commitTypedValue();
      else {
        select.value = '';
        input.setCustomValidity(input.value.trim() ? 'Elegí una opción de la lista.' : '');
      }
    });
    input.addEventListener('change', commitTypedValue);
    input.addEventListener('blur', () => {
      if (!select.value) input.value = '';
      input.setCustomValidity('');
    });
    input.addEventListener('invalid', () => {
      input.setCustomValidity(input.value.trim() ? 'Elegí una opción de la lista.' : `Completá ${fieldName.toLowerCase()}.`);
    });
    select.addEventListener('change', rebuild);

    new MutationObserver(rebuild).observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled']
    });
    rebuild();
  }

  const init = () => IDS.forEach(id => enhance(document.getElementById(id)));
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, {once: true})
    : init();
})();
