/* RF-01: ricerca per gruppi (riga + varianti), condivisa dalle sei viste elenco. */
(function () {
  var input = document.getElementById('dropSearchInput') || document.getElementById('searchInput');
  if (!input) return;
  var box = input.closest('.search-box');
  var toolbar = box.closest('.table-toolbar-actions');
  var toggle = box.querySelector('.search-toggle');
  var close = box.querySelector('.search-close-btn');
  var rowSelector = '.product-row, .drop-row';
  var tables = Array.from(document.querySelectorAll('.products-table, .drop-table')).filter(function (table) {
    return Array.from(table.children).some(function (child) { return child.matches(rowSelector); });
  });
  var range = document.querySelector('.table-pagination-range');
  var originalRange = range ? range.textContent : '';
  var records = tables.map(function (table) {
    var rows = Array.from(table.children).filter(function (child) { return child.matches(rowSelector); });
    var status = document.createElement('p');
    status.className = 'search-result-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    table.prepend(status);
    return { table: table, status: status, groups: rows.map(function (row) {
      var next = row.nextElementSibling;
      var variants = next && next.classList.contains('product-variants') ? next : null;
      var divider = (variants || row).nextElementSibling;
      if (!divider || !divider.classList.contains('table-row-divider')) divider = null;
      return { row: row, variants: variants, divider: divider };
    }) };
  });
  input.setAttribute('aria-label', 'Cerca in questo elenco');
  toggle.setAttribute('aria-controls', input.id);
  toggle.setAttribute('aria-expanded', 'false');
  function normalize(value) {
    return value.toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
  function filterRows() {
    var query = normalize(input.value);
    var visibleCount = 0;
    records.forEach(function (record) {
      var visible = record.groups.filter(function (group) {
        var text = group.row.textContent + ' ' + (group.variants ? group.variants.textContent : '');
        var match = !query || normalize(text).includes(query);
        group.row.hidden = !match;
        if (group.variants) group.variants.hidden = !match;
        if (group.divider) group.divider.hidden = true;
        return match;
      });
      // Only separators between visible groups; no leading/trailing orphan lines.
      visible.slice(0, -1).forEach(function (group) { if (group.divider) group.divider.hidden = false; });
      record.status.hidden = !query;
      record.status.textContent = !visible.length ? 'Nessun risultato. Prova un altro termine.' : visible.length + ' risultati su ' + record.groups.length + ' in questa vista';
      if (!record.table.closest('[hidden]')) visibleCount += visible.length;
    });
    if (range) {
      var activeStatus = document.querySelector('.status-chip.active[data-pagination-range]');
      range.textContent = query ? visibleCount + ' risultati' : (activeStatus ? activeStatus.getAttribute('data-pagination-range') : originalRange);
    }
  }
  function setOpen(open, returnFocus) {
    box.classList.toggle('open', open);
    toolbar.classList.toggle('search-active', open);
    toggle.setAttribute('aria-expanded', String(open));
    input.disabled = !open;
    input.tabIndex = open ? 0 : -1;
    close.disabled = !open;
    if (open) input.focus({ preventScroll: true });
    else {
      input.value = '';
      filterRows();
      if (returnFocus) toggle.focus({ preventScroll: true });
    }
  }
  toggle.addEventListener('click', function () { setOpen(true); });
  close.addEventListener('click', function () { setOpen(false, true); });
  box.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && box.classList.contains('open')) {
      event.preventDefault(); event.stopPropagation(); setOpen(false, true);
    }
  });
  input.addEventListener('input', filterRows);
  input.addEventListener('search', filterRows);
  var observer = new MutationObserver(filterRows);
  document.querySelectorAll('.drop-table, [data-panel], #dropCalendarView').forEach(function (table) {
    observer.observe(table, { attributes: true, attributeFilter: ['hidden'] });
  });
  setOpen(false, false);
})();
