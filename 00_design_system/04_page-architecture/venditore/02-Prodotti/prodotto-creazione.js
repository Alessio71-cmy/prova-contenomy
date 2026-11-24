/* Prodotto — creazione (wireframe, 19/11/2026). Mock: nessun backend. Dati di taxonomy, aliquote e commissioni sono DIMOSTRATIVI.
   Flusso: 1 Le basi → 2 Cosa vendi davvero → 3 Riepilogo → «Salvato» (bozza). Pannello destro guidato dal passo, non dal focus dei campi.
   Parametri di prova: ?bottega=1 (bottega esistente) · ?bottega=0 (nessuna) · ?reset=1 (svuota prodotti salvati). */
(function () {
  'use strict';
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var params = new URLSearchParams(location.search);
  if (params.get('reset') === '1') { try { window.ProdottoStore.clear(); } catch (e) {} }

  /* ---------- Dati dimostrativi ---------- */
  var CATS = { fisico: 'Oggetto fisico', digitale: 'File digitale', esperienza: 'Esperienza', servizio: 'Servizio' };
  var TAXO = {
    'Moda': ['Felpe', 'Pantaloni', 'Maglieria'],
    'Casa': ['Ceramiche', 'Tessili', 'Candele'],
    'Cartoleria': ['Quaderni', 'Stampe'],
    'Pittura': ['Tele', 'Acquerelli']
  };
  var ATTRS = {
    'Felpe': [{ id: 'mat', label: 'Materiale', opts: ['Cotone', 'Cotone biologico', 'Misto lana'] }, { id: 'vest', label: 'Vestibilità', opts: ['Regular', 'Oversize'] }],
    'Ceramiche': [{ id: 'mat', label: 'Materiale', opts: ['Gres', 'Porcellana', 'Terracotta'] }, { id: 'fin', label: 'Finitura', opts: ['Opaca', 'Lucida'] }]
  };
  var DEFAULT_ATTRS = [{ id: 'mat', label: 'Materiale', opts: ['Cotone', 'Carta', 'Legno', 'Metallo', 'Altro'] }];
  /* Calcolo del prezzo — DEMO: le aliquote reali dipendono da regime fiscale e categoria, la commissione è provvisoria */
  var DEMO = { iva: { fisico: 0.22, digitale: 0.22, servizio: 0.22, esperienza: 0.10 }, comm: 0.08, stripePct: 0.015, stripeFix: 0.25 };

  var STEPS = {
    1: ['Prodotto', 'Come si chiama e che tipo di prodotto è. Il resto si costruisce dopo.'],
    2: ['Prezzo', 'Dimmi quanto vuoi guadagnare: il prezzo per il cliente si calcola da solo.'],
    3: ['Varianti e opzioni', 'Foto, pezzi disponibili e opzioni.'],
    4: ['Controlla e salva', 'Il prodotto resta in bozza finché non lo pubblichi.'],
    done: ['Prodotto salvato in bozza', 'Nessuno lo vede ancora: scegli come proseguire.']
  };
  var step = 1;
  var imgs = [];

  /* ---------- Info icon ---------- */
  var INFO_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>';
  $$('[data-info]').forEach(function (el) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'bottega-info'; b.setAttribute('data-tooltip', el.getAttribute('data-info')); b.setAttribute('aria-label', 'Maggiori informazioni'); b.innerHTML = INFO_SVG;
    el.replaceWith(b);
  });

  /* ---------- Helpers dati ---------- */
  function money(n) { return Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }
  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function hasBottega() { var p = params.get('bottega'); if (p === '1') return true; if (p === '0') return false; try { return window.BottegaStore.all().length > 0; } catch (e) { return false; } }
  function cat() { var c = $('#pcCat [aria-checked="true"]'); return c ? c.getAttribute('data-val') : ''; }
  function calc(netto, c) {
    if (!(netto > 0) || !c) return null;
    var iva = DEMO.iva[c] || 0;
    var den = 1 / (1 + iva) - DEMO.comm - DEMO.stripePct;
    var P = Math.round(((netto + DEMO.stripeFix) / den) * 100) / 100;
    var vat = Math.round((P - P / (1 + iva)) * 100) / 100;
    var com = Math.round(P * DEMO.comm * 100) / 100;
    var str = Math.round((P * DEMO.stripePct + DEMO.stripeFix) * 100) / 100;
    return { price: P, vat: vat, comm: com, stripe: str, net: Math.round((P - vat - com - str) * 100) / 100, ivaPct: iva };
  }
  function variants() {
    return $$('.pc-var-row').map(function (r) {
      var i = $$('input', r);
      return { nome: i[0].value.trim(), tiratura: parseInt(i[1].value, 10) || 0, netto: num(i[2].value), _raw: [i[0].value, i[1].value, i[2].value] };
    });
  }
  function totalTir() {
    var v = variants().filter(function (x) { return x.nome; });
    var s = v.reduce(function (a, x) { return a + x.tiratura; }, 0);
    if (v.length && s > 0) return s;
    return parseInt($('#pcTir').value, 10) || 0;
  }
  function attrDefs() { return ATTRS[$('#pcTipo').value] || DEFAULT_ATTRS; }

  /* ---------- Costruzione campi ---------- */
  var gSel = $('#pcGenere');
  Object.keys(TAXO).forEach(function (g) { var o = document.createElement('option'); o.value = g; o.textContent = g; gSel.appendChild(o); });
  gSel.addEventListener('change', function () {
    var t = $('#pcTipo'); t.innerHTML = '';
    var first = document.createElement('option'); first.value = ''; first.textContent = gSel.value ? 'Scegli il tipo' : 'Prima scegli la categoria'; t.appendChild(first);
    (TAXO[gSel.value] || []).forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; t.appendChild(o); });
    t.disabled = !gSel.value; renderAttrs(); refresh();
  });
  $('#pcTipo').addEventListener('change', function () { renderAttrs(); refresh(); });
  function renderAttrs() {
    var host = $('#pcAttrs'); host.innerHTML = '';
    if (!$('#pcTipo').value) return;
    attrDefs().forEach(function (a) {
      var row = document.createElement('div'); row.className = 'bottega-field bottega-form-row';
      row.innerHTML = '<div class="bottega-label-row"><label class="bottega-label panel-field-label" for="pcA_' + a.id + '">' + esc(a.label) + ' <span class="bottega-required" aria-hidden="true">*</span><span class="visually-hidden"> (obbligatorio)</span></label></div>' +
        '<select class="bottega-input" id="pcA_' + a.id + '" data-attr="' + a.id + '"><option value="">Scegli</option>' + a.opts.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
      host.appendChild(row);
      $('select', row).addEventListener('change', refresh);
    });
  }

  /* categoria */
  $$('#pcCat .pc-choice').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#pcCat .pc-choice').forEach(function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
      onCategory(); refresh();
    });
  });
  function onCategory() {
    var c = cat();
    $('#pcNetto').disabled = !c;
    $('#pcNettoHint').textContent = c ? 'Il prezzo finale per il cliente si calcola in automatico, a lato.' : 'Scegli prima la categoria: serve per calcolare l’IVA.';
    $('#pcVarBlock').hidden = c !== 'fisico';
    $('#pcExpBlock').hidden = c !== 'esperienza';
    $('#pcSrvRow').hidden = c !== 'servizio';
    $('#pcGarRow').hidden = c === 'esperienza';
    $('#pcExpGarNote').hidden = c !== 'esperienza';
    $('#pcTirTitle').textContent = c === 'esperienza' ? 'Posti disponibili' : 'Tiratura';
    var g = $('#pcGar'); g.innerHTML = '';
    ['Default della piattaforma · ' + (CATS[c] || '').toLowerCase(), 'Reso entro 14 giorni (il tuo modello)', 'Reso entro 30 giorni (il tuo modello)'].forEach(function (t) { var o = document.createElement('option'); o.textContent = t; g.appendChild(o); });
    if (c !== 'fisico') { $('#pcVarList').innerHTML = ''; }
  }

  /* switch */
  $$('.pc-switch').forEach(function (s) {
    s.addEventListener('click', function () {
      var on = s.getAttribute('aria-checked') === 'true'; s.setAttribute('aria-checked', on ? 'false' : 'true');
      if (s.id === 'pcPers') $('#pcPersHint').hidden = on;
      refresh();
    });
  });

  /* foto */
  $('#pcAddImg').addEventListener('click', function () { $('#pcImgInput').click(); });
  $('#pcImgInput').addEventListener('change', function (e) {
    Array.prototype.forEach.call(e.target.files || [], function (f) { imgs.push(f.name); });
    e.target.value = ''; renderImgs(); refresh();
  });
  function renderImgs() {
    var host = $('#pcImgs'); host.innerHTML = '';
    imgs.forEach(function (n, i) {
      var r = document.createElement('div'); r.className = 'pc-file';
      r.innerHTML = '<span class="pc-file-name">' + esc(n) + '</span><button type="button" class="bottega-remove-btn" aria-label="Rimuovi foto"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
      $('button', r).addEventListener('click', function () { imgs.splice(i, 1); renderImgs(); refresh(); });
      host.appendChild(r);
    });
  }

  /* varianti */
  function addVar() {
    var list = $('#pcVarList');
    if (!list.children.length) { var h = document.createElement('div'); h.className = 'pc-var-head'; h.innerHTML = '<span>Nome</span><span>Pezzi</span><span>Netto (facoltativo)</span><span></span>'; list.appendChild(h); }
    var r = document.createElement('div'); r.className = 'pc-var-row';
    r.innerHTML = '<input class="bottega-input" type="text" placeholder="Es. M · Verde" aria-label="Nome variante" autocomplete="off">' +
      '<input class="bottega-input" type="number" min="1" step="1" inputmode="numeric" placeholder="Pezzi" aria-label="Pezzi della variante">' +
      '<input class="bottega-input" type="number" min="0" step="0.5" inputmode="decimal" placeholder="Come il prodotto" aria-label="Netto della variante">' +
      '<button type="button" class="bottega-remove-btn" aria-label="Rimuovi variante"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    $$('input', r).forEach(function (i) { i.addEventListener('input', refresh); });
    $('button', r).addEventListener('click', function () { r.remove(); if (!$$('.pc-var-row').length) $('#pcVarList').innerHTML = ''; refresh(); });
    list.appendChild(r); $('input', r).focus(); refresh();
  }
  $('#pcAddVar').addEventListener('click', addVar);

  /* input generici */
  ['#pcName', '#pcStory', '#pcNetto', '#pcTir', '#pcNarrato', '#pcEvDate', '#pcEvClose', '#pcEvPolicy', '#pcGar'].forEach(function (s) { $(s).addEventListener('input', refresh); $(s).addEventListener('change', refresh); });

  /* ---------- Stato derivato + pannello ---------- */
  function priceRange() {
    var c = cat(), base = calc(num($('#pcNetto').value), c);
    if (!base) return null;
    var vs = variants().filter(function (v) { return v.nome && v.netto > 0; }).map(function (v) { var k = calc(v.netto, c); return k ? k.price : null; }).filter(Boolean);
    var all = [base.price].concat(vs), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    return lo === hi ? money(lo) : money(lo) + ' – ' + money(hi);
  }
  function headInto(ids, withEmpty) {
    var name = $('#pcName').value.trim(), c = cat(), pr = priceRange(), tir = totalTir(), vs = variants().filter(function (v) { return v.nome; });
    var nameEl = $(ids.name); nameEl.textContent = name || 'Nome del prodotto'; nameEl.classList.toggle('is-empty', !name);
    $(ids.cat).textContent = c ? CATS[c] : 'Categoria';
    var vLabel = vs.length ? '• ' + vs.length + (vs.length === 1 ? ' variante' : ' varianti') : '';
    var numEl = $(ids.num), sub = $(ids.sub), meta = $(ids.meta);
    if (tir > 0) {
      numEl.textContent = tir; sub.textContent = 'tiratura totale';
      meta.hidden = false; meta.textContent = (pr || '—') + (vLabel ? ' ' + vLabel : '');
    } else {
      numEl.textContent = pr || '—'; sub.textContent = vLabel || (pr ? 'prezzo prodotto' : '');
      meta.hidden = true;
    }
    if (withEmpty) $(withEmpty).hidden = !!(pr || name);
  }
  function renderPanel() {
    var c = cat(), name = $('#pcName').value.trim();
    /* pane 1: card + calcolatore */
    var cn = $('#pcCardName'); cn.textContent = name || 'Nome del prodotto'; cn.classList.toggle('is-empty', !name);
    var cc = $('#pcCardCat'); cc.textContent = c ? CATS[c] : 'Categoria'; cc.classList.toggle('is-empty', !c);
    var k = calc(num($('#pcNetto').value), c), pr = priceRange();
    $('#pcCardPrice').textContent = pr || '—';
    $('#pcCalcEmpty').hidden = !!k; $('#pcCalc').hidden = !k; $('#pcCalcNote').hidden = !k;
    if (k) {
      $('#pcCalc').innerHTML =
        '<div class="pc-calc-row is-total"><dt>Prezzo per il cliente</dt><dd>' + money(k.price) + '</dd></div>' +
        '<div class="pc-calc-row"><dt>IVA (' + Math.round(k.ivaPct * 100) + '%)</dt><dd>− ' + money(k.vat) + '</dd></div>' +
        '<div class="pc-calc-row"><dt>Commissione Contenomy (' + Math.round(DEMO.comm * 100) + '%)</dt><dd>− ' + money(k.comm) + '</dd></div>' +
        '<div class="pc-calc-row"><dt>Costi di pagamento</dt><dd>− ' + money(k.stripe) + '</dd></div>' +
        '<div class="pc-calc-row is-total is-net"><dt>Ti restano</dt><dd>' + money(k.net) + '</dd></div>';
    }
    /* pane 2: riepilogo bozza */
    headInto({ name: '#pcHeadName', cat: '#pcHeadCat', num: '#pcHeadNum', sub: '#pcHeadSub', meta: '#pcHeadMeta' }, '#pcHeadEmpty');
    /* tiratura: somma da varianti */
    var vs = variants().filter(function (v) { return v.nome; }), sum = vs.reduce(function (a, v) { return a + v.tiratura; }, 0), t = $('#pcTir');
    var auto = vs.length > 0 && sum > 0; t.readOnly = auto; if (auto) t.value = sum; $('#pcTirHint').hidden = !auto;
    $('#pcNarratoRow').hidden = !(totalTir() > 0);
    /* pane 3 */
    $('#pcNoShop').hidden = hasBottega();
  }

  /* ---------- Validazione ---------- */
  function valid(n) {
    var c = cat();
    if (n === 1) {
      if (!$('#pcName').value.trim() || !$('#pcStory').value.trim() || !c || !$('#pcGenere').value || !$('#pcTipo').value) return false;
      return !$$('#pcAttrs select').some(function (s) { return !s.value; });
    }
    if (n === 2) return num($('#pcNetto').value) > 0;
    if (n === 3) {
      var vs = variants(), names = [];
      for (var i = 0; i < vs.length; i++) {
        var v = vs[i], filled = v._raw.some(function (x) { return String(x).trim() !== ''; });
        if (filled && !v.nome) return false;
        if (v.nome) { if (names.indexOf(v.nome.toLowerCase()) > -1) return false; names.push(v.nome.toLowerCase()); }
      }
      if (totalTir() > 0 && !$('#pcNarrato').value.trim()) return false;
      if (c === 'esperienza' && (!$('#pcEvDate').value || !$('#pcEvPolicy').value.trim())) return false;
      return true;
    }
    return true;
  }
  function refresh() { renderPanel(); $('#nextBtn').disabled = step === 'done' ? true : !valid(step); }

  /* ---------- Riepilogo (passo 4) ---------- */
  var PEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  function block(title, rows) {
    return '<div class="bottega-form-table bottega-summary-block"><div class="card-header no-sub"><div class="card-header-titles"><div class="card-title title-lg">' + esc(title) + '</div></div></div><div class="card-divider"></div><dl class="bottega-summary-list">' +
      rows.map(function (r) { return '<div class="bottega-summary-row"><dt>' + esc(r[0]) + '</dt><dd class="' + (r[1] ? '' : 'is-empty') + '">' + (r[1] ? r[1] : '—') + '</dd><button type="button" class="icon-btn" data-goto="' + r[2] + '" data-tooltip="Modifica" aria-label="Modifica ' + esc(r[0].toLowerCase()) + '">' + PEN + '</button></div>'; }).join('') + '</dl></div>';
  }
  function renderSummary() {
    var c = cat(), k = calc(num($('#pcNetto').value), c), vs = variants().filter(function (v) { return v.nome; }), tir = totalTir();
    var attrs = $$('#pcAttrs select').map(function (s) { return esc($('label', s.closest('.bottega-form-row')).firstChild.textContent.trim()) + ': ' + esc(s.value); }).join(' · ');
    var on = function (id) { return $(id).getAttribute('aria-checked') === 'true'; };
    var r1 = [['Nome', esc($('#pcName').value.trim()), 1], ['Descrizione', esc($('#pcStory').value.trim()), 1]];
    var r2 = [['Tipo di prodotto', esc(CATS[c] || ''), 1], ['Categoria e tipo', esc($('#pcGenere').value + ' › ' + $('#pcTipo').value), 1], ['Attributi', attrs, 1]];
    var r3 = [['Netto per pezzo', k ? money(num($('#pcNetto').value)) : '', 2], ['Prezzo per il cliente', k ? money(k.price) + '<small>Calcolato in automatico</small>' : '', 2]];
    var r4 = [['Foto', imgs.length ? imgs.length + (imgs.length === 1 ? ' foto' : ' foto') : '', 3]];
    if (c === 'fisico') r4.push(['Varianti', vs.map(function (v) { return esc(v.nome) + (v.tiratura ? ' (' + v.tiratura + ')' : ''); }).join(', '), 3]);
    r4.push([c === 'esperienza' ? 'Posti' : 'Tiratura', tir ? String(tir) : 'Non in serie limitata', 3]);
    if (tir) r4.push(['Prezzo raccontato', esc($('#pcNarrato').value.trim()), 3]);
    if (c === 'esperienza') { r4.push(['Data e ora', esc($('#pcEvDate').value.replace('T', ' ')), 3]); r4.push(['Se annulli', esc($('#pcEvPolicy').value.trim()), 3]); }
    if (c === 'servizio') r4.push(['Input del cliente', on('#pcInput') ? 'Sì' : 'No', 3]);
    r4.push(['Personalizzato', on('#pcPers') ? 'Sì, non rimborsabile per cambio idea' : 'No', 3]);
    r4.push(['Regalo', on('#pcGift') ? 'Sì' : 'No', 3]);
    if (c !== 'esperienza') r4.push(['Garanzia', esc($('#pcGar').value), 3]);
    $('#pcSummary').innerHTML = block('Il prodotto', r1) + block('Categoria', r2) + block('Prezzo', r3) + block('Cosa vendi', r4);
    $$('#pcSummary [data-goto]').forEach(function (b) { b.addEventListener('click', function () { goTo(Number(b.getAttribute('data-goto'))); }); });
  }

  /* ---------- Navigazione ---------- */
  function goTo(n) {
    step = n;
    $('#prodFlow').setAttribute('data-step', n);
    $('#prodPanel').setAttribute('data-step', n);
    $$('.bottega-step-panel').forEach(function (p) { p.hidden = p.getAttribute('data-step-panel') !== String(n); });
    $$('.pc-pane').forEach(function (p) { p.hidden = p.getAttribute('data-pane').split(' ').indexOf(String(n)) < 0; });
    $('#stepTitle').textContent = STEPS[n][0]; $('#stepSub').textContent = STEPS[n][1];
    $$('[data-step-ind]').forEach(function (el) {
      var i = Number(el.getAttribute('data-step-ind')), dn = n === 'done' ? true : i < n, act = n !== 'done' && i === n;
      el.classList.toggle('is-active', act); el.classList.toggle('is-done', dn);
      if (act) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      $('.phase-step-marker', el).textContent = dn ? '✓' : '';
    });
    var isDone = n === 'done';
    $('#stepActions').hidden = isDone; $('#cancelLink').hidden = isDone;
    $('#prevBtn').hidden = n === 1;
    $('#nextBtn').textContent = n === 4 ? 'Salva bozza' : 'Continua';
    if (n === 4) renderSummary();
    $('#prodScroll').scrollTop = 0;
    refresh();
  }
  $('#nextBtn').addEventListener('click', function () {
    if (step === 4) return save();
    if (valid(step)) goTo(step + 1);
  });
  $('#prevBtn').addEventListener('click', function () { if (step > 1) goTo(step - 1); });

  /* ---------- Salvataggio ---------- */
  function save() {
    var c = cat(), first = window.ProdottoStore.all().length === 0, k = calc(num($('#pcNetto').value), c);
    var attrs = {}; $$('#pcAttrs select').forEach(function (s) { attrs[s.getAttribute('data-attr')] = s.value; });
    var p = window.ProdottoStore.save({
      id: 'p' + Date.now(), stato: 'bozza', nome: $('#pcName').value.trim(), storia: $('#pcStory').value.trim(), categoria: c,
      genere: $('#pcGenere').value, tipo: $('#pcTipo').value, attributi: attrs, netto: num($('#pcNetto').value), prezzoFinale: k ? k.price : 0,
      immagini: imgs.slice(), varianti: variants().filter(function (v) { return v.nome; }).map(function (v) { return { nome: v.nome, tiratura: v.tiratura, netto: v.netto }; }),
      tiratura: totalTir(), prezzoNarrato: $('#pcNarrato').value.trim(), personalizzato: $('#pcPers').getAttribute('aria-checked') === 'true', regalo: $('#pcGift').getAttribute('aria-checked') === 'true',
      garanzia: c === 'esperienza' ? null : $('#pcGar').value, richiedeInput: $('#pcInput').getAttribute('aria-checked') === 'true',
      evento: c === 'esperienza' ? { data: $('#pcEvDate').value, chiusura: $('#pcEvClose').value, politica: $('#pcEvPolicy').value.trim() } : null
    });
    showDone(p, first);
  }
  function showDone(p, first) {
    goTo('done');
    headInto({ name: '#pcDoneName', cat: '#pcDoneCat', num: '#pcDoneNum', sub: '#pcDoneSub', meta: '#pcDoneMeta' });
    var shop = hasBottega(), page = $('#pcNextPage'), drop = $('#pcNextDrop');
    if (shop) {
      page.textContent = 'Modifica pagina'; page.href = '../06-bacheca/bottega-editor.html?prodotto=' + encodeURIComponent(p.id);
      $('#pcNextPageDesc').textContent = 'Aggiungi copertina, storia e sezioni nell’editor.';
      drop.removeAttribute('aria-disabled'); $('#pcNextDropDesc').textContent = 'Un drop parte sempre da un prodotto: puoi partire da questo.';
    } else {
      page.textContent = 'Crea bottega'; page.href = '../06-bacheca/bottega-creazione.html';
      $('#pcNextPageDesc').textContent = 'Per costruire la pagina e pubblicare serve una bottega.';
      drop.setAttribute('aria-disabled', 'true'); $('#pcNextDropDesc').textContent = 'Per creare un drop serve prima una bottega.';
    }
    if (first && !shop) openSetup();
  }

  /* ---------- Popup bottega ---------- */
  var lastFocus = null;
  function openSetup() { lastFocus = document.activeElement; $('#pcSetup').hidden = false; $('#pcSetupGo').focus(); }
  function closeSetup() { $('#pcSetup').hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  ['#pcSetupLater', '#pcSetupClose', '#pcSetupBackdrop'].forEach(function (s) { $(s).addEventListener('click', closeSetup); });
  document.addEventListener('keydown', function (e) {
    if ($('#pcSetup').hidden) return;
    if (e.key === 'Escape') { closeSetup(); return; }
    if (e.key === 'Tab') {
      var f = $$('#pcSetup a[href], #pcSetup button').filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Avvio ---------- */
  $('#pageBody').classList.add('panel-open');

  /* ---------- Dropdown custom (regola Ruggi 29/10/2026: niente select nativo, pattern .order-select/.editor-select) ----------
     Il <select> nativo resta come contenitore del valore (nascosto) e viene sincronizzato: il resto del codice continua a leggere .value / evento change. */
  var CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var openSel = null;
  function closeSel() { if (!openSel) return; openSel.menu.hidden = true; openSel.btn.setAttribute('aria-expanded', 'false'); openSel = null; }
  function enhanceSelect(sel) {
    if (sel.getAttribute('data-pc-enh')) return;
    sel.setAttribute('data-pc-enh', '1'); sel.classList.add('pc-select-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    var wrap = document.createElement('div'); wrap.className = 'pc-select';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bottega-input pc-select-btn'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="pc-select-value"></span>' + CHEV;
    var menu = document.createElement('ul'); menu.className = 'pc-select-menu'; menu.setAttribute('role', 'listbox'); menu.hidden = true;
    var lab = sel.id ? document.querySelector('label[for="' + sel.id + '"]') : null;
    if (lab) { if (!lab.id) lab.id = 'lbl_' + sel.id; btn.id = 'btn_' + sel.id; btn.setAttribute('aria-labelledby', lab.id + ' ' + btn.id); menu.setAttribute('aria-labelledby', lab.id); }
    wrap.appendChild(btn); wrap.appendChild(menu); sel.parentNode.insertBefore(wrap, sel.nextSibling);
    var valEl = $('.pc-select-value', btn);
    function sync() {
      var cur = sel.options[sel.selectedIndex];
      valEl.textContent = cur ? cur.textContent : ''; valEl.classList.toggle('is-placeholder', !sel.value);
      btn.disabled = sel.disabled;
      menu.innerHTML = '';
      Array.prototype.forEach.call(sel.options, function (o) {
        if (o.value === '') return;
        var li = document.createElement('li'); li.setAttribute('role', 'option'); li.tabIndex = -1; li.textContent = o.textContent; li.setAttribute('aria-selected', String(o.value === sel.value));
        li.addEventListener('click', function () { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.dispatchEvent(new Event('input', { bubbles: true })); closeSel(); sync(); btn.focus(); });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowDown' && li.nextSibling) { e.preventDefault(); li.nextSibling.focus(); }
          else if (e.key === 'ArrowUp' && li.previousSibling) { e.preventDefault(); li.previousSibling.focus(); }
          else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); }
          else if (e.key === 'Escape') { e.preventDefault(); closeSel(); btn.focus(); }
        });
        menu.appendChild(li);
      });
    }
    function open() {
      if (btn.disabled || !menu.children.length) return;
      closeSel(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); openSel = { btn: btn, menu: menu };
      var s = $('[aria-selected="true"]', menu) || menu.firstChild; if (s) s.focus();
    }
    btn.addEventListener('click', function () { if (menu.hidden) open(); else closeSel(); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    sel.addEventListener('change', sync);
    new MutationObserver(sync).observe(sel, { childList: true, attributes: true, attributeFilter: ['disabled'] });
    sync();
  }
  document.addEventListener('click', function (e) { if (openSel && !openSel.menu.parentNode.contains(e.target)) closeSel(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSel(); });
  function enhanceAll() { $$('select.bottega-input').forEach(enhanceSelect); }
  new MutationObserver(enhanceAll).observe(document.querySelector('.bottega-scroll') || document.body, { childList: true, subtree: true });
  enhanceAll();

  window.bindCancelCreation($('#cancelLink'), 'Stai per eliminare il prodotto in creazione. I dati inseriti andranno persi.'); /* 24/11/2026 (Ruggi): conferma prima di uscire */
  onCategory(); goTo(1);
})();
