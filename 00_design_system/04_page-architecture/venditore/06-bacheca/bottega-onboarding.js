/* Pagina Bottega — stessa struttura in due stati (16/10/2026, Ruggi): titolo generale + "Crea bottega"; sezione "Le tue botteghe" e, sempre sotto, "Botteghe da cui prendere ispirazione".
   - nessuna bottega  -> nella sezione c'è solo il riquadro tratteggiato ("Qui appariranno le tue botteghe" + Crea)
   - almeno una       -> card: al massimo 1 Pubblicata, le altre Bozza (clic sulla card = editor) + lo stesso riquadro in fondo.
   Ordine: riquadro Crea, poi la pubblicata, poi le bozze per data di creazione (più recente prima). La data di creazione è nella parte testuale di tutte le card (.panel-product-date).
   Parametri di prova: ?stato=vuoto (svuota l'archivio) · ?stato=elenco (se vuoto, inserisce una pubblicata + una bozza) · ?stripe=on (Stripe collegato). */
(function () {
  'use strict';
  var S = window.BottegaStore, PRODOTTI = '../02-Prodotti/prodotti.html';
  var qs = location.search, stripe = false, carry = '';
  function sync() { stripe = window.AccountSetup.get().stripe === 'done'; carry = stripe ? '?stripe=on' : ''; }
  sync();
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

  if (/[?&]stato=vuoto\b/.test(qs)) { S.clear(); window.AccountSetup.clear('bottega'); }
  if (/[?&]stato=elenco\b/.test(qs) && !S.all().length) {
    var base = { theme: 'tema-01', themeName: 'Tema 01 · La Bottega', logo: null, favicon: null, social: [], font: null };
    function mk(o) { var b = {}; for (var k in base) b[k] = base[k]; for (var j in o) b[j] = o[j]; return S.save(b); }
    var DAY = 86400000, now = Date.now();
    mk({ id: 'demo-a', created: now - 40 * DAY, status: 'pubblicata', name: 'Ruggi', slug: 'ruggi', bio: 'Oggetti fatti a mano, a tiratura limitata.', color: 'giallo', toneHex: '#f7d247' });
    mk({ id: 'demo-b', created: now - 6 * DAY, status: 'bozza', name: 'Ruggi Studio', slug: 'ruggi-studio', bio: 'Una seconda idea di bottega.', color: 'azzurro', toneHex: '#73b4e6' });
  }

  var grid = $('#bottegaGrid');

  $('#createShopBtn').addEventListener('click', function () { location.href = 'bottega-creazione.html' + carry; });

  function pill(status) { return status === 'pubblicata' ? '<span class="status-pill pubblicato"><i class="dot"></i>Pubblicata</span>' : '<span class="status-pill bozza"><i class="dot"></i>Bozza</span>'; }
  var KEBAB = '<svg class="svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';

  function svg(p) { return '<svg class="bottega-menu-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var ICON_PUB = svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>'), ICON_DEL = svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'), ICON_INFO = svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>');
  function fmtDate(t) { return t ? new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/(\d) ([a-zà-ù])/, function (m, d, c) { return d + ' ' + c.toUpperCase(); }) : ''; } /* 2/11/2026 (Ruggi): mese con l'iniziale maiuscola ovunque: «3 Set 2026» */
  /* 2/11/2026 (Ruggi): sulla card «Ultima modifica: 3 Set 2026» (senza ora; l'ora sta nel tooltip) al posto della data di creazione. Formato data unico in tutto il DS: «3 Set 2026» (fmtDate). */
  function fmtShort(t) { return fmtDate(t); }
  function fmtStamp(t) { return t ? 'Ultima modifica: ' + fmtShort(t) + ', ' + new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function card(b, online) {
    var draft = b.status !== 'pubblicata';
    var menu = '';
    if (draft) { /* le azioni esistono solo per le bozze; la pubblicata non ne ha ancora (decisione aperta) */
      var pubLabel = online ? 'Pubblica al posto di «' + esc(online.name) + '»' : 'Pubblica';
      menu = '<div class="bottega-card-menu">' +
        '<button type="button" class="icon-btn" data-menu-btn aria-haspopup="true" aria-expanded="false" aria-label="Azioni di ' + esc(b.name) + '">' + KEBAB + '</button>' +
        '<div class="bottega-card-menu-list" role="menu" hidden>' +
          /* Pubblica: azione che cambia stato (non naviga) → <button>. Senza Stripe è aria-disabled (non disabled: così il tooltip dell'«i» resta raggiungibile) */
          '<div class="bottega-menu-row' + (stripe ? '' : ' is-disabled') + '"><button type="button" role="menuitem" data-act="publish"' + (stripe ? '' : ' aria-disabled="true"') + '>' + ICON_PUB + '<span>' + pubLabel + '</span></button>' +
            (stripe ? '' : '<span class="bottega-menu-info" tabindex="0" role="img" aria-label="Perché è disattivato: serve Stripe collegato" data-tooltip="Per pubblicare serve Stripe collegato">' + ICON_INFO + '</span>') + '</div>' +
          '<div class="bottega-menu-row"><button type="button" role="menuitem" class="is-danger" data-act="delete">' + ICON_DEL + '<span>Elimina</span></button></div>' +
        '</div></div>';
    }
    return '<article class="theme-preview bottega-card" data-id="' + esc(b.id) + '">' +
      '<a class="bottega-card-link" href="bottega-editor.html?bottega=' + encodeURIComponent(b.id) + (stripe ? '&amp;stripe=on' : '') + '" aria-label="Apri l’editor di ' + esc(b.name) + '"></a>' +
      '<div class="bottega-card-media"><div class="theme-thumb" data-w="1200" aria-hidden="true"></div>' + pill(b.status) + menu + '</div>' + /* anteprima = pagina Bottega del tema scelto (bottega-thumb.js) */
      '<div class="theme-preview-copy"><div class="card-header-titles theme-preview-titles"><div class="theme-preview-title">' + esc(b.name) + '</div><div class="card-sub">contenomy.it/' + esc(b.slug) + ' • ' + esc(b.themeName || 'Tema') + '</div>' +
        '<span class="panel-product-date" data-tooltip="' + fmtStamp(b.updated || b.created) + '">Ultima modifica: ' + fmtShort(b.updated || b.created) + '</span></div>' +
        (b.status === 'pubblicata' ? '<div class="bottega-card-actions"><a class="btn-ghost sm" href="' + PRODOTTI + '">+ Crea prodotto</a></div>' : '') + '</div>' +
      '</article>';
  }

  function newCard(has) { /* riquadro tratteggiato (come "Nuovo prodotto" del Cruscotto): segnaposto + azione Crea */
    return '<a class="product-new-card" href="bottega-creazione.html' + carry + '">' +
      '<span class="product-new-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>' +
      (has ? '' : '<span>Qui appariranno le tue botteghe</span>') + '<span class="product-new-label">Crea bottega</span></a>';
  }
  /* Banner compatto di completamento account (stato condiviso con il Cruscotto: ../account-setup.js).
     Stesso componente del Cruscotto, comprimibile; qui compare solo con almeno una bottega.
     Nascosto senza botteghe (il riquadro Crea è già l'unica azione). */
  var A = window.AccountSetup;
  A.dest('prodotto', function () { return PRODOTTI; });
  A.dest('bottega', function () { return 'bottega-creazione.html' + carry; });
  var renderBanner = A.mountBanner($('#onbBanner'), { show: function () { return S.all().length > 0; } });

  function render() {
    var all = S.all(), online = all.filter(function (b) { return b.status === 'pubblicata'; })[0] || null, has = all.length > 0;
    sync(); renderBanner();
    grid.innerHTML = newCard(has) + all.map(function (b) { return card(b, online); }).join(''); /* il riquadro "Crea bottega" apre la sezione; poi la pubblicata e le bozze per data di creazione */
    Array.prototype.forEach.call(grid.querySelectorAll('.bottega-card'), function (el, i) { if (window.BottegaThumb) window.BottegaThumb.mount(el.querySelector('.theme-thumb'), all[i]); });
  }

  function closeMenus() { Array.prototype.forEach.call(document.querySelectorAll('.bottega-card-menu-list'), function (m) { m.hidden = true; var b = m.previousElementSibling; if (b) b.setAttribute('aria-expanded', 'false'); }); }
  grid.addEventListener('click', function (e) {
    var kb = e.target.closest('[data-menu-btn]');
    if (kb) { e.stopPropagation(); var m = kb.nextElementSibling, open = m.hidden; closeMenus(); m.hidden = !open; kb.setAttribute('aria-expanded', String(open)); return; }
    var act = e.target.closest('[data-act]');
    if (!act || act.getAttribute('aria-disabled') === 'true') return;
    e.stopPropagation();
    var id = act.closest('.bottega-card').getAttribute('data-id');
    if (act.getAttribute('data-act') === 'publish') { var b = S.get(id); if (b) { b.status = 'pubblicata'; S.save(b); } render(); return; }
    closeMenus(); openDel(id, act.closest('.bottega-card').querySelector('[data-menu-btn]'));
  });
  /* modale di conferma eliminazione */
  var dm = $('#delModal'), dmFrom = null, dmId = null;
  function openDel(id, from) { var b = S.get(id); if (!b) return; dmId = id; dmFrom = from; $('#delModalText').textContent = 'Sei sicuro di voler eliminare la bottega ' + b.name + '?'; dm.hidden = false; $('#delCancel').focus(); }
  function closeDel() { dm.hidden = true; dmId = null; if (dmFrom && document.contains(dmFrom)) dmFrom.focus(); dmFrom = null; }
  dm.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeDel(); });
  $('#delConfirm').addEventListener('click', function () { var id = dmId; dm.hidden = true; dmId = null; dmFrom = null; if (id) { S.remove(id); render(); } });
  document.addEventListener('keydown', function (e) { if (dm.hidden) return; if (e.key === 'Escape') { e.stopPropagation(); closeDel(); } else if (e.key === 'Tab') { var f = Array.prototype.filter.call(dm.querySelectorAll('button'), function (x) { return !x.disabled; }), i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } }, true);
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });

  render();
})();
