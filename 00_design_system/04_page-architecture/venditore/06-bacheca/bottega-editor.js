/* Bottega EDITOR — 22/10/2026 (Ruggi). Wireframe: pagina separata da bottega-creazione.
   - Il tema (Temi/NN_tema/NN_tema_Package/package.js) vive in un iframe `srcdoc` a LARGHEZZA REALE (nessuna scala): Desktop = tutto lo spazio del canvas, Mobile = 390px,
     quindi i breakpoint del tema scattano davvero. L'iframe scorre da sé. La pagina legge/scrive il suo DOM (nome, bio, logo, social, tono copertina).
   - Fuori dall'iframe: toolbar, pannello. Dentro: solo il tema + lo stile dei testi modificabili (nome e presentazione, testo semplice).
   - Salvataggio automatico nella bozza (bottega-store.js, localStorage = mock). Una bottega già PUBBLICATA si modifica su una COPIA DI LAVORO (campo `pending` del record):
     la versione online non cambia finché non si preme «Aggiorna».
   - Si apre con ?bottega=ID. Senza ID: bottega di prova non salvata. ?stripe=on simula Stripe collegato.
   Debito noto (rev. 103): themeDoc/bindFrame/paintFrame/wireEditable duplicano in forma ridotta bottega-creazione.js e bottega-thumb.js: da unificare in un modulo condiviso. */
(function () {
  'use strict';

  var PKG = window.ContenomyThemes || {}, THEMES = {};
  Object.keys(PKG).forEach(function (id) {
    var m = PKG[id].manifest, byId = {}, ident = m.pageModel.fixed.filter(function (b) { return b.id === 'identita'; })[0];
    m.palette.forEach(function (c) { byId[c.id] = c; });
    byId.ink = { id: 'ink', label: 'Nero', hex: '#000000', on: '#ffffff' };
    THEMES[id] = { name: m.name, heroColors: (ident ? ident.axes[0].values.map(function (v) { return byId[v]; }).filter(Boolean) : m.palette) };
  });
  var THEME_ORDER = Object.keys(THEMES);
  if (!THEME_ORDER.length) console.error('Pacchetto tema non caricato: controlla il percorso di package.js in bottega-editor.html.');

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function slugify(v) { return String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  /* ---- 30/10/2026: pezzi CONDIVISI tra il pannello Generali → Colori e la modale "Aggiungi una sezione": toast, ponte verso i colori generali (COLORS_API, riempito dal pannello Colori) e pannello "Nuovo colore". ---- */
  var toastEl = null, toastT = null, newPop = null, newPopOff = null, newPopScroll = null;
  var COLORS_API = { customs: function () { return []; }, system: function () { return []; }, names: function () { return []; }, add: function () {} }; /* customs() = Aggiuntivi generali [{hex,name}]; add(hex,name) = aggiunge un Aggiuntivo generale */
    function showToast(msg, undo) {
      if (toastEl) toastEl.remove(); clearTimeout(toastT);
      toastEl = document.createElement('div'); toastEl.className = 'editor-toast'; toastEl.setAttribute('role', 'status');
      var t = document.createElement('span'); t.textContent = msg; toastEl.appendChild(t);
      if (undo) { var b = document.createElement('button'); b.type = 'button'; b.className = 'editor-toast-undo'; b.textContent = 'Annulla'; b.addEventListener('click', function () { undo(); toastEl.remove(); toastEl = null; }); toastEl.appendChild(b); }
      document.body.appendChild(toastEl);
      toastT = setTimeout(function () { if (toastEl) { toastEl.remove(); toastEl = null; } }, 6000);
    }
  /* 19/11/2026 (Ruggi): toast di SUCCESSO della piattaforma (stesso di Cruscotto: .onb-toast.success in basso a destra, anello-timer + chiudi, 5s). Il toast neutro showToast resta per le azioni annullabili. */
  var okStack = null;
  function dismissOk(t) { if (!t.isConnected || t.classList.contains('is-leaving')) return; clearTimeout(t.dismissTimer); t.classList.remove('is-visible'); t.classList.add('is-leaving'); setTimeout(function () { t.remove(); }, 560); }
  function showSuccessToast(msg) {
    if (!okStack) { okStack = document.createElement('div'); okStack.className = 'onb-toast-stack'; document.body.appendChild(okStack); }
    var t = document.createElement('div'); t.className = 'onb-toast success'; t.setAttribute('role', 'status');
    t.innerHTML = '<span class="onb-toast-message"></span><span class="onb-toast-close-wrap"><svg class="onb-toast-timer" viewBox="0 0 20 20" aria-hidden="true"><circle class="onb-toast-timer-track" cx="10" cy="10" r="8"/><circle class="onb-toast-timer-fill" cx="10" cy="10" r="8"/></svg><button class="onb-toast-dismiss" type="button" aria-label="Chiudi notifica"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>';
    t.querySelector('.onb-toast-message').textContent = msg;
    t.querySelector('.onb-toast-dismiss').addEventListener('click', function () { dismissOk(t); });
    okStack.appendChild(t); requestAnimationFrame(function () { t.classList.add('is-visible'); });
    t.dismissTimer = setTimeout(function () { dismissOk(t); }, 5000);
  }
  function newPopKey(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    var m = newPop && newPop.querySelector('.editor-select-menu:not([hidden])');
    if (m) { m.hidden = true; var bt = m.parentNode.querySelector('.editor-select-btn'); if (bt) { bt.setAttribute('aria-expanded', 'false'); bt.focus(); } return; } /* Esc chiude prima il dropdown, poi il pannello */
    closeNewPanel();
  }
    function closeNewPanel() { if (newPop) { newPop.remove(); newPop = null; } if (newPopOff) { document.removeEventListener('mousedown', newPopOff, true); document.removeEventListener('keydown', newPopKey, true); newPopOff = null; } if (newPopScroll) { document.removeEventListener('scroll', newPopScroll, true); newPopScroll = null; } }
  /* 30/10/2026 (Ruggi): dropdown "Colori esistenti" del pannello Nuovo colore. Stesso aspetto di makeSelect (font): bottone .bottega-input + lista; voci con cerchio colore + nome, divise per gruppi (Colori di sistema / Aggiuntivi generali / Aggiuntivi locali). Scegliere una voce mette quel colore nel campo Colore; se poi si cambia col selettore, il dropdown torna vuoto. */
  function makeColorSelect(label, groups, onPick) {
    var wrap = document.createElement('div'); wrap.className = 'editor-select';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bottega-input editor-select-btn'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', label);
    var val = document.createElement('span'); val.className = 'editor-select-value editor-select-placeholder'; val.textContent = 'Scegli un colore'; btn.appendChild(val); btn.insertAdjacentHTML('beforeend', CHEV);
    var menu = document.createElement('ul'); menu.className = 'editor-select-menu'; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', label); menu.hidden = true;
    var opts = [];
    groups.forEach(function (g) {
      if (!g.items.length) return;
      var t = document.createElement('li'); t.setAttribute('role', 'presentation'); t.className = 'editor-select-group'; t.textContent = g.title; menu.appendChild(t);
      g.items.forEach(function (it) {
        var li = document.createElement('li'); li.setAttribute('role', 'option'); li.tabIndex = -1; li.setAttribute('aria-selected', 'false');
        li.innerHTML = '<span class="editor-color-pop-sw"></span><span class="editor-color-pop-name"></span>';
        li.firstChild.style.setProperty('--sw', it.hex); li.lastChild.textContent = it.name;
        li.addEventListener('click', function () { choose(li, it); setOpen(false); btn.focus(); onPick(it); });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); var n = opts[opts.indexOf(li) + 1]; if (n) n.focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); var q = opts[opts.indexOf(li) - 1]; if (q) q.focus(); }
        });
        opts.push(li); menu.appendChild(li);
      });
    });
    function choose(li, it) {
      opts.forEach(function (x) { x.setAttribute('aria-selected', String(x === li)); });
      val.className = 'editor-select-value editor-select-picked'; val.innerHTML = '<span class="editor-color-pop-sw"></span><span class="editor-color-pop-name"></span>';
      val.firstChild.style.setProperty('--sw', it.hex); val.lastChild.textContent = it.name;
    }
    function setOpen(o) { menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); if (o) { var s0 = menu.querySelector('[aria-selected="true"]') || opts[0]; if (s0) s0.focus(); } }
    btn.addEventListener('click', function () { setOpen(menu.hidden); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } });
    function outside(e) { if (!wrap.isConnected) { document.removeEventListener('mousedown', outside, true); return; } if (!wrap.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', outside, true);
    wrap.appendChild(btn); wrap.appendChild(menu);
    return { el: wrap, reset: function () { opts.forEach(function (x) { x.setAttribute('aria-selected', 'false'); }); val.className = 'editor-select-value editor-select-placeholder'; val.textContent = 'Scegli un colore'; } };
  }
  /* opzioni: groups() -> [{title,items:[{name,hex}]}] (dropdown Colori esistenti), names() -> nomi gia' usati, prefix(aGenerali) -> 'Aggiuntivo'|'Locale', duplicate(hex) -> nome|null, onConfirm(hex, nome, aGenerali), general (mostra la casella "Aggiungi ai colori generali"), over (sopra la modale), bounds (elemento che limita l'altezza) */
  function openNewColorPanel(btn, o) {
    closeNewPanel();
    newPop = document.createElement('div'); newPop.className = 'editor-color-pop editor-color-new'; newPop.setAttribute('role', 'dialog'); newPop.setAttribute('aria-labelledby', 'colorNewTitle');
    newPop.innerHTML = '<div class="editor-color-new-head"><h2 class="card-title title-sm" id="colorNewTitle">Nuovo colore</h2>' +
      '<button type="button" class="panel-close-btn editor-modal-close" data-tooltip="Chiudi" aria-label="Chiudi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="editor-color-new-body"><label class="panel-field-label" for="colorNewName">Nome</label><input class="bottega-input" id="colorNewName" type="text" maxlength="24" autocomplete="off" spellcheck="false">' +
      '<span class="panel-field-label">Colore</span><div class="editor-color-new-pick" role="button" tabindex="0" aria-label="Scegli il colore" data-tooltip="Scegli il colore"><span class="bottega-swatch"></span><span class="panel-field-value editor-color-new-hex"></span></div><input type="color" class="editor-color-new-anchor" tabindex="-1" aria-hidden="true"></div>' +
      '<div class="editor-color-new-foot"><button type="button" class="btn-pill-dark primary">Aggiungi</button></div>';
    $('#colorNewTitle', newPop).textContent = o.title || 'Nuovo colore'; $('.editor-color-new-foot .btn-pill-dark', newPop).textContent = o.confirmLabel || 'Aggiungi';
    var name = $('#colorNewName', newPop), ci = $('input[type=color]', newPop), sw = $('.bottega-swatch', newPop), hx = $('.editor-color-new-hex', newPop);
    newPop.classList.toggle('is-over', !!o.over); /* sopra la modale (z-index > modale) quando si apre da li' */
    /* nome unico: errore rosso sotto al campo (12px, come gli altri errori del pannello); se vuoto si usa il segnaposto, gia' scelto libero */
    var err = document.createElement('p'); err.className = 'editor-field-error editor-color-new-err'; err.setAttribute('role', 'alert'); err.hidden = true; name.insertAdjacentElement('afterend', err);
    function nameTaken(v) { v = v.trim().toLowerCase(); return !!v && o.names().some(function (n) { return String(n).toLowerCase() === v; }); }
    function validate() { var bad = !name.disabled && nameTaken(name.value); err.hidden = !bad; err.textContent = bad ? 'Nome già in uso.' : ''; if (bad) name.setAttribute('aria-invalid', 'true'); else name.removeAttribute('aria-invalid'); return !bad; }
    name.addEventListener('input', validate);
    /* esadecimale gia' presente: errore sotto al campo Colore, mostrato alla conferma (non appena si sceglie un colore esistente dal dropdown: si parte da li' per cercarne uno simile) e tolto appena il colore cambia */
    var errC = document.createElement('p'); errC.className = 'editor-field-error editor-color-new-err'; errC.setAttribute('role', 'alert'); errC.hidden = true; $('.editor-color-new-pick', newPop).insertAdjacentElement('afterend', errC);
    function clearErrC() { errC.hidden = true; errC.textContent = ''; }
    /* dropdown "Colori esistenti" sotto al campo Colore: scorciatoia per partire da un colore gia' presente (anche di sistema) e cercarne una tonalita' simile */
    var dd = makeColorSelect('Colori esistenti', o.groups(), function (it) { ci.value = it.hex.toLowerCase(); paint(); clearErrC(); });
    var dl = document.createElement('span'); dl.className = 'panel-field-label'; dl.textContent = 'Colori esistenti';
    var drow = document.createElement('div'); drow.className = 'editor-font-row editor-color-new-existing'; /* stessa struttura delle righe Font: etichetta sopra, dropdown a tutta larghezza */
    var dsr = document.createElement('div'); dsr.className = 'editor-slug-row'; dsr.appendChild(dd.el); drow.appendChild(dl); drow.appendChild(dsr);
    $('.editor-color-new-body', newPop).appendChild(drow);
    var chk = null;
    if (o.general) { /* 30/10/2026 (Ruggi): colore creato dentro una sezione = locale; la casella lo promuove ai colori generali (spenta di default). Casella nativa con accent-color: il DS non ha un componente checkbox (candidato) */
      var gl = document.createElement('div'); gl.className = 'editor-color-new-gen';
      gl.innerHTML = '<label><input type="checkbox"><span>Aggiungi ai colori generali</span></label><span class="editor-tone-info" tabindex="0" role="img" aria-label="Saranno visibili in tutto il progetto, in ogni sezione." data-tooltip="Saranno visibili in tutto il progetto, in ogni sezione."></span>';
      $('.editor-color-new-body', newPop).appendChild(gl); chk = $('input', gl);
    }
    function uniq(prefix) { var used = o.names().map(function (n) { return String(n).toLowerCase(); }), n = 1; while (used.indexOf((prefix + ' ' + n).toLowerCase()) >= 0) n++; return prefix + ' ' + n; }
    function setPh() { name.placeholder = uniq(o.prefix(chk ? chk.checked : o.target === 'general')); }
    setPh(); if (chk) chk.addEventListener('change', function () { setPh(); validate(); });
    ci.value = o.initial || '#888888';
    /* 30/10/2026 (Ruggi, Sostituisci colore): se l'esadecimale coincide con un colore esistente la sostituzione e' un alias di quel colore: niente nome da dare, il campo Nome e' disattivato e mostra il nome di quel colore */
    /* riepilogo (solo se la sostituzione e' con un colore esistente): [colore sostituito] → [colore che lo sostituisce], ciascuno con cerchio, nome (14px) ed esadecimale (12px) in colonna */
    var sum = null;
    if (o.match && o.from) { sum = document.createElement('div'); sum.className = 'editor-color-new-sum'; sum.setAttribute('role', 'group'); sum.hidden = true; errC.insertAdjacentElement('afterend', sum); }
    function sumItem(c) {
      var it = document.createElement('span'); it.className = 'editor-color-new-sum-item';
      var s1 = document.createElement('span'); s1.className = 'bottega-swatch'; s1.style.setProperty('--sw', c.hex);
      var n1 = document.createElement('span'); n1.className = 'editor-color-new-sum-name'; n1.textContent = c.name;
      var h1 = document.createElement('span'); h1.className = 'editor-color-new-sum-hex'; h1.textContent = c.hex;
      it.appendChild(s1); it.appendChild(n1); it.appendChild(h1); return it;
    }
    function renderSum(m) {
      if (!sum) return; sum.hidden = !m; if (!m) return;
      var f = o.from(); sum.innerHTML = ''; sum.setAttribute('aria-label', f.name + ' sarà sostituito da ' + m.name);
      var ar = document.createElement('span'); ar.className = 'editor-color-new-sum-arrow'; ar.setAttribute('aria-hidden', 'true');
      ar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
      sum.appendChild(sumItem(f)); sum.appendChild(ar); sum.appendChild(sumItem(m));
    }
    function applyMatch() { if (!o.match) return; var m = o.match(ci.value.toLowerCase()); if (m) { name.disabled = true; name.value = ''; name.placeholder = m.name; err.hidden = true; name.removeAttribute('aria-invalid'); } else { name.disabled = false; setPh(); } renderSum(m); }
    function paint() { sw.style.setProperty('--sw', ci.value); hx.textContent = ci.value.toUpperCase(); applyMatch(); }
    paint(); ci.addEventListener('input', function () { paint(); dd.reset(); clearErrC(); }); ci.addEventListener('change', function () { paint(); dd.reset(); clearErrC(); });
    /* 30/10/2026 (Ruggi): il selettore nativo si apre A SINISTRA del cerchio. Il browser lo ancora al bordo sinistro/inferiore dell'input: un input invisibile (larghezza ~ quella del selettore, altezza 0) viene piazzato a sinistra del cerchio, all'altezza del suo bordo alto, e il selettore si apre li'. Dipende dal browser (non verificabile in headless). */
    var pick = $('.editor-color-new-pick', newPop);
    /* 30/10/2026: la PRIMA apertura usava la posizione vecchia dell'ancora (il browser leggeva il layout prima che lo stile fosse applicato): ora l'ancora viene posizionata quando il pannello si apre e di nuovo, con layout forzato, prima di ogni showPicker(). */
    function placeAnchor() {
      var r = sw.getBoundingClientRect(), w = ci.offsetWidth || 240;
      ci.style.left = Math.round(Math.max(8, r.left - w - 8)) + 'px'; ci.style.top = Math.round(r.top) + 'px';
      return ci.getBoundingClientRect();
    }
    function openNative() {
      placeAnchor();
      try { ci.showPicker(); } catch (err) { ci.click(); }
    }
    pick.addEventListener('click', openNative);
    pick.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNative(); } });
    function confirm() {
      if (!validate()) { name.focus(); return; }
      var h = ci.value.toLowerCase(), dup = o.duplicate(h);
      if (dup) { errC.textContent = 'Già presente: ' + dup; errC.hidden = false; return; }
      var nm = name.value.trim() || name.placeholder, gen = chk ? chk.checked : o.target === 'general';
      closeNewPanel(); o.onConfirm(h, nm, gen, name.value.trim());
    }
    $('.btn-pill-dark', newPop).addEventListener('click', confirm);
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
    $('.editor-modal-close', newPop).addEventListener('click', function () { closeNewPanel(); btn.focus(); });
    /* 30/10/2026 (Ruggi): il pannello esce A SINISTRA del pannello dell'editor (sopra l'anteprima), all'altezza del pulsante, sopra a tutto: position fixed sul body (non viene tagliato dallo scroll del pannello). */
    document.body.appendChild(newPop);
    var pr = (o.bounds || $('.editor-panel') || document.body).getBoundingClientRect(), br = btn.getBoundingClientRect(), ph = newPop.offsetHeight;
    newPop.style.right = Math.round(window.innerWidth - (o.rightOf ? o.rightOf.getBoundingClientRect().left : br.left) + 8) + 'px'; /* dalla modale: a sinistra di tutta la colonna dei controlli, cosi' non copre i cerchi */ /* 30/10/2026 (Ruggi): piu' vicino al pulsante: il bordo destro del pannello sta 8px a sinistra del pulsante, quindi entra sopra il pannello dell'editor (sul suo padding, senza coprire il contenuto); il selettore nativo segue (distanze dal cerchio invariate) */
    newPop.style.top = Math.round(Math.max(pr.top, Math.min(br.bottom - ph - (o.over ? 24 : 0), window.innerHeight - ph - 8))) + 'px'; /* 30/10/2026 (Ruggi): piu' in alto: il bordo inferiore del pannello coincide con quello del pulsante (si apre verso l'alto), senza uscire sopra il pannello dell'editor */
    placeAnchor();
    var me = newPop;
    newPopOff = function (e) { if (!me.contains(e.target) && !btn.contains(e.target)) closeNewPanel(); };
    newPopScroll = function (e) { if (!me.contains(e.target)) closeNewPanel(); };
    setTimeout(function () { if (newPop !== me) return; document.addEventListener('mousedown', newPopOff, true); document.addEventListener('keydown', newPopKey, true); document.addEventListener('scroll', newPopScroll, true); name.focus(); }, 0);
  }

  var STORE = window.BottegaStore;
  var dispProd = null, noTirDismissed = {}, noTirSession = {}, NTKEY = 'contenomy.editor.noTir.dismissed'; /* 3/11/2026: «Non mostrare più» del banner «Nessuna tiratura», PER PRODOTTO */
  try { noTirDismissed = JSON.parse(localStorage.getItem(NTKEY) || '{}') || {}; } catch (e) { noTirDismissed = {}; }
  var stripeDismissed = false, DKEY = 'contenomy.editor.stripeBanner.dismissed';
  try { stripeDismissed = localStorage.getItem(DKEY) === '1'; } catch (e) {}
  /* 19/11/2026 (Ruggi): pagamenti = due passaggi (dati fiscali, Stripe); simulazione wireframe come account-setup.js: ?stripe=on · ?fiscali=on · ?fatti=fiscali,stripe. ?setup=1 = rientro dal flusso (riapre l'invito). */
  var fattiQs = ((/[?&]fatti=([^&]*)/.exec(location.search) || [])[1] || '').split(',');
  var stripe = /[?&]stripe=on\b/.test(location.search) || fattiQs.indexOf('stripe') > -1;
  var bannerWait = false, setupOff = false, SKEY = 'contenomy.editor.setupBanner.dismissed', JKEY = 'contenomy.editor.justPublished';
  try { setupOff = localStorage.getItem(SKEY) === '1'; } catch (e) {}
  var fiscali = /[?&]fiscali=on\b/.test(location.search) || fattiQs.indexOf('fiscali') > -1;
  var carry = (stripe || fiscali) ? '?' + [stripe ? 'stripe=on' : '', fiscali ? 'fiscali=on' : ''].filter(Boolean).join('&') : '';
  var FIELDS = ['name', 'slug', 'bio', 'logo', 'favicon', 'social', 'contatti', 'color', 'font', 'evid'];

  /* ---- stato ---- */
  var state = { id: null, theme: THEME_ORDER[0], name: 'Ruggi', slug: 'ruggi', slugTouched: false, bio: '', logo: null, favicon: null,
                social: ['instagram.com/ruggi', 'behance.net/ruggi'], contatti: [{ t: 'email', v: 'ciao@bottega-demo.test' }, { t: 'telefono', v: '+39 02 0000 0000' }], color: null, font: null };
  var status = 'bozza', rec = null, saveMsg = '';

  function pick(o) { var f = {}; FIELDS.forEach(function (k) { f[k] = o[k]; }); f.social = (o.social || []).map(function (s) { return String(s).trim(); }).filter(Boolean); f.contatti = (o.contatti || []).map(function (c) { return { t: c.t, v: String(c.v || '').trim() }; }).filter(function (c) { return c.v; }); f.name = String(o.name || '').trim(); f.bio = String(o.bio || '').trim(); f.logo = o.logo || null; f.favicon = o.favicon || null; f.color = o.color || null; f.font = o.font || null; return f; }
  function same(a, b) { return JSON.stringify(pick(a)) === JSON.stringify(pick(b)); }
  function apply(o) { FIELDS.forEach(function (k) { if (o[k] !== undefined) state[k] = k === 'social' ? o[k].slice() : k === 'contatti' ? o[k].map(function (c) { return { t: c.t, v: c.v }; }) : o[k]; }); state.logo = state.logo || null; state.favicon = state.favicon || null; }

  var openId = (location.search.match(/[?&]bottega=([^&]+)/) || [])[1];
  var found = STORE && openId ? STORE.get(decodeURIComponent(openId)) : null;
  if (found && THEMES[found.theme]) {
    rec = found; status = rec.status === 'pubblicata' ? 'pubblicata' : 'bozza';
    /* SOLO PROVA WIREFRAME (19/11/2026, Ruggi): per poter verificare la pubblicazione, qualsiasi REFRESH dell'editor rimette la bottega in bozza e azzera i passaggi dei pagamenti; ?bozza=1 fa lo stesso a richiesta. Navigare altrove e tornare NON annulla la pubblicazione. */
    var bz = /[?&]bozza=1\b/.test(location.search), rl = false, jp = null;
    try { rl = (performance.getEntriesByType('navigation')[0] || {}).type === 'reload'; } catch (e) {}
    if (!rl) { try { rl = performance.navigation && performance.navigation.type === 1; } catch (e) {} }
    try { jp = sessionStorage.getItem(JKEY); } catch (e) {}
    if (status === 'pubblicata' && (bz || rl)) {
      rec.status = 'bozza'; status = 'bozza'; STORE.save(rec); rec = STORE.get(rec.id) || rec;
      try { sessionStorage.removeItem(JKEY); localStorage.removeItem(SKEY); } catch (e) {} setupOff = false;
      if (!bz) { stripe = false; fiscali = false; carry = ''; }
      try { var bu = new URL(location.href); ['bozza', 'setup'].concat(bz ? [] : ['stripe', 'fiscali', 'fatti']).forEach(function (k) { bu.searchParams.delete(k); }); history.replaceState(null, '', bu.toString()); } catch (e) {}
    }
    state.id = rec.id; state.theme = rec.theme; apply(rec);
    if (status === 'pubblicata' && rec.pending) apply(rec.pending); /* si riparte dalla copia di lavoro */
    state.slugTouched = true; state.bio = state.bio || '';
  }
  function isPublished() { return status === 'pubblicata'; }
  function isDirty() { return isPublished() && rec && !same(state, rec); } /* copia di lavoro diversa dalla versione online */
  function heroTone() { return state.color || 'ink'; } /* nessun colore globale nel Tema 01: il colore scelto è il tono del blocco Identità */
  function toneHex() { var c = THEMES[state.theme].heroColors.filter(function (x) { return x.id === heroTone(); })[0]; return c ? c.hex : '#000000'; }

  /* ---- salvataggio automatico ---- */
  var saveT = null, bFlash = false, bFlashT = null;
  var localEdit = Date.now(); /* bottega di prova (senza ?bottega=ID): non c'è un record, vale l'ultima modifica in questa sessione */
  /* "Modificato il …": data/ora dell'ultimo salvataggio (campo updated del record) */
  function renderModified() {   /* 2/11/2026: niente piu' data nel pannello: qui c'e' lo stato di salvataggio (Salvato / Salvataggio… / Non salvata); la data «Ultima modifica» sta sulla card in bottega-onboarding */
    var el = $('#panelSave'), lb = $('#panelSaveLabel'); if (!el) return;
    var st, d = '';
    if (curPage === 'prodotto' && curProduct) { /* nel prodotto lo stato e' quello del prodotto: Salvataggio… → Salvato (2s) → «Da pubblicare» se e' online con modifiche, altrimenti «Ultima modifica» */
      var pend = curProduct.status === 'pubblicato' && curProduct.dirty;
      st = prodSaving ? 'saving' : (prodFlash ? 'saved' : (pend ? 'pending' : 'idle')); d = fmtMod(curProduct.modified);
    } else if (isListMode() && listProduct()) { st = 'idle'; d = fmtMod(listProduct().modified); }
    else { st = saveT ? 'saving' : (bFlash ? 'saved' : (rec && isDirty() ? 'pending' : 'idle')); d = fmtMod(rec ? rec.updated : (localEdit || Date.now())); } /* 22:19: anche la bottega di prova non salvata mostra «Ultima modifica» (niente «Non salvata») */ /* 2/11/2026 (Ruggi, 22:15): a riposo NON «Salvato» ma «Ultima modifica <data>» (anche nella lista Prodotti); «Salvato» resta il flash di 2s */
    if (st === 'idle' && !d) st = 'saved';
    el.setAttribute('data-state', st);
    lb.textContent = st === 'saving' ? 'Salvataggio…' : (st === 'saved' ? 'Salvato' : (st === 'pending' ? 'Da pubblicare' : (st === 'idle' ? 'Ultima modifica: ' + d : 'Non salvata')));
  }
  function renderSave() { renderModified(); var m = saveMsg + (saveMsg && isDirty() ? ' · modifiche non pubblicate' : (isDirty() ? 'Modifiche non pubblicate' : '')); $('#edSave').textContent = m; if (m) $('#edBrowser').setAttribute('data-tooltip', m); else $('#edBrowser').removeAttribute('data-tooltip'); }
  function save() {
    clearTimeout(saveT); saveT = null;
    if (!STORE || !rec) { localEdit = Date.now(); saveMsg = 'Bottega di prova: non salvata'; bFlash = true; clearTimeout(bFlashT); bFlashT = setTimeout(function () { bFlash = false; renderModified(); }, 2000); renderSave(); return; }
    var cur = STORE.get(state.id) || rec, f = pick(state);
    if (isPublished()) { if (same(f, cur)) delete cur.pending; else cur.pending = f; }
    else { FIELDS.forEach(function (k) { cur[k] = f[k]; }); cur.toneHex = toneHex(); }
    STORE.save(cur); rec = STORE.get(state.id) || cur;
    saveMsg = 'Salvato'; bFlash = true; clearTimeout(bFlashT); bFlashT = setTimeout(function () { bFlash = false; renderModified(); }, 2000); renderSave(); renderPublish();
  }
  function touch() { saveMsg = rec ? 'Salvataggio…' : 'Bottega di prova: non salvata'; clearTimeout(saveT); saveT = setTimeout(save, 500); /* 5/11/2026: anche la bottega di prova fa il ciclo Salvataggio… → Salvato → Ultima modifica (senza scrivere nulla) */ renderSave(); renderPublish(); renderName(); }
  window.addEventListener('pagehide', function () { if (saveT) save(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && saveT) save(); });
  $('#bcBack').setAttribute('href', 'bottega-onboarding.html' + carry);
  $('#bcBack').addEventListener('click', function () { if (saveT) save(); });

  /* ---- toolbar: nome, stato, pubblica ---- */
  /* barra "browser" in toolbar: favicon scelta (altrimenti globo), indirizzo e badge */
  var FAV_FALLBACK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/></svg>';
  function renderName() {
    var f = $('#edFavicon');
    if (state.favicon) { var im = document.createElement('img'); im.alt = ''; im.src = state.favicon; f.textContent = ''; f.appendChild(im); } else f.innerHTML = FAV_FALLBACK;
    $('#edUrl').textContent = 'contenomy.it/' + state.slug + (curPage === 'bottega' ? '' : '/' + curPage + (curProduct ? '/' + slugify(curProduct.name) : ''));
    renderBreadcrumb();
  }
  function missingList() { var m = []; if (!state.name.trim()) m.push('il nome'); if (!state.bio.trim()) m.push('la presentazione'); if (!state.slug.trim()) m.push('l’indirizzo'); return m; }
  function renderPublish() {
    renderModified();
    var published = isPublished(), dirty = isDirty(), missing = missingList(), reason = '', quiet = false;
    var btn = $('#publishBtn'), wrap = $('#publishWrap');
    btn.textContent = published ? 'Aggiorna' : 'Pubblica';
    if (!rec) reason = 'Apri una bottega dalla pagina Bottega per pubblicarla.';
    else if (missing.length) reason = 'Per pubblicare mancano: ' + missing.join(', ') + '.';
    else if (published && !dirty) { reason = 'Nessuna modifica da pubblicare.'; quiet = true; } /* disabilitato senza tooltip: è ovvio */
    btn.disabled = !!reason;
    /* 22/10: niente ⓘ — il motivo sta nel tooltip del pulsante (sul wrapper: un button disabilitato non riceve l'hover) */
    if (reason && !quiet) { wrap.setAttribute('data-tooltip', reason); wrap.setAttribute('tabindex', '0'); } else { wrap.removeAttribute('data-tooltip'); wrap.removeAttribute('tabindex'); }
    $('#edStatus').innerHTML = published ? '<span class="status-pill pubblicato"><i class="dot"></i>Attivo</span>' : '<span class="status-pill bozza"><i class="dot"></i>Bozza</span>';
    $('#stripeBanner').hidden = stripe || published || stripeDismissed;
    $('#pendingBanner').hidden = !(published && dirty);
    renderSetupBanner();
    var ps = $('#panelSlug'); ps.disabled = published; $('#slugCopyBtn').hidden = !published;
    $('#panelSlugHint').hidden = published; /* 19/11/2026 (Ruggi): dopo la pubblicazione nessun messaggio sotto l'indirizzo */
    if (!published) $('#panelSlugHint').textContent = 'Modificabile fino alla prima pubblicazione.';
    renderSave(); renderPanel();
  }
  $('#publishBtn').addEventListener('click', function () {
    if ($('#publishBtn').disabled || !rec) return;
    var wasPublished = isPublished();
    askMissingImages(missingImages(null), function () {
      /* 19/11/2026 (Ruggi): la pubblicazione non e' istantanea: il pulsante passa a «Pubblico…», poi feedback «Bottega pubblicata», e solo dopo qualche secondo compare l'invito ai pagamenti */
      var pb = $('#publishBtn'); pb.disabled = true; pb.textContent = wasPublished ? 'Aggiorno…' : 'Pubblico…';
      setTimeout(function () {
        if (!wasPublished && setupMissing().length) bannerWait = true; /* il banner compare solo dopo aver chiuso l'invito */
        doPublishShop(); showSuccessToast(wasPublished ? 'Bottega aggiornata.' : 'Bottega pubblicata.');
        if (!wasPublished) { try { sessionStorage.setItem(JKEY, state.id); } catch (e) {} }
        if (!wasPublished && setupMissing().length) setTimeout(openSetup, 6800);
      }, 1400);
    });
  });
  /* ---- 19/11/2026 (Ruggi): INVITO A ATTIVARE I PAGAMENTI. Dopo la prima pubblicazione, se mancano dati fiscali e/o Stripe, una card centrata (sfondo scuro solo per contrasto, non bloccante) invita a completare i passaggi. La CTA porta al primo passaggio mancante; al rientro (?setup=1) la card si riapre da sola sul successivo. Chiudibile (X, Esc, sfondo, «Più tardi»); resta l'indicatore «Attiva i pagamenti» in testata che la riapre. Pubblicare NON dipende da questi passaggi. ---- */
  var SETUP_STEPS = [
    { id: 'fiscali', title: 'Dati fiscali', desc: 'Ti servono per poter vendere e fatturare.', cta: 'Inserisci i dati fiscali' },
    { id: 'stripe', title: 'Pagamenti con Stripe', desc: 'Ti servono documento e IBAN.', cta: 'Collega Stripe' }
  ];
  function setupDone(id) { return id === 'stripe' ? stripe : fiscali; }
  function setupMissing() { return SETUP_STEPS.filter(function (x) { return !setupDone(x.id); }); }
  function setupGo(id, fromBanner) { var u = new URL(location.href); u.searchParams.set(id === 'stripe' ? 'stripe' : 'fiscali', 'on'); u.searchParams.set('setup', fromBanner ? '2' : '1'); location.href = u.toString(); } /* SIMULAZIONE wireframe: nel prodotto porta al flusso reale e rientra qui */
  var SETUP_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function openSetup() {
    if ($('.editor-setup')) return;
    if (okStack) Array.prototype.forEach.call(okStack.children, dismissOk);
    if (toastEl) { toastEl.remove(); toastEl = null; }
    var miss = setupMissing(), all = !miss.length, first = miss[0], two = miss.length > 1;
    var title = all ? 'Tutto pronto: la tua bottega può incassare' : (two ? 'Manca poco per iniziare.' : 'Ora manca un ultimo passo per iniziare.');
    var text = all ? 'Hai completato tutti i passaggi. Ora i tuoi clienti possono acquistare.' : (two ? 'Inserisci i dati fiscali e collega i pagamenti: ci vogliono pochi minuti e potrai ricevere i primi ordini.' : 'Completa questo passaggio e i tuoi clienti potranno acquistare dalla tua bottega.');
    var m = document.createElement('div'); m.className = 'editor-modal editor-setup';
    m.innerHTML = '<div class="editor-modal-backdrop" data-close></div><div class="editor-modal-box editor-setup-box" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="setupTitle">' +
      '<button type="button" class="panel-close-btn editor-modal-close editor-setup-close" data-close data-tooltip="Chiudi" aria-label="Chiudi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="editor-setup-art" aria-hidden="true"><div class="editor-setup-window"><span class="editor-setup-kicker">La bottega</span><span class="editor-setup-line long"></span><span class="editor-setup-line short"></span><span class="editor-setup-cta"></span></div><div class="editor-setup-orb"></div><span class="editor-setup-badge">' + SETUP_CHECK + '</span></div>' +
      '<div class="editor-setup-body"><h2 class="card-title title-lg" id="setupTitle"></h2><p class="editor-setup-text"></p><ol class="editor-setup-steps"></ol></div>' +
      '<div class="editor-modal-foot"></div></div>';
    m.querySelector('#setupTitle').textContent = title; m.querySelector('.editor-setup-text').textContent = text;
    var ol = m.querySelector('.editor-setup-steps');
    var sel = first;
    if (all) ol.remove(); else SETUP_STEPS.forEach(function (x, i) {
      var done = setupDone(x.id), li = document.createElement(done ? 'li' : 'li'); li.className = 'editor-setup-step' + (done ? ' is-done' : '');
      li.setAttribute('data-step', x.id);
      if (!done) { li.setAttribute('role', 'button'); li.tabIndex = 0; li.setAttribute('aria-pressed', x === first ? 'true' : 'false'); }
      li.innerHTML = '<span class="editor-setup-mark">' + (done ? SETUP_CHECK : (i + 1)) + '</span><span class="editor-setup-copy"><span class="editor-setup-name todo-label"></span><span class="editor-setup-desc todo-meta"></span></span>';
      li.querySelector('.editor-setup-name').textContent = x.title; li.querySelector('.editor-setup-desc').textContent = done ? 'Completato' : x.desc; ol.appendChild(li);
      if (!done && x === first) li.classList.add('is-next');
    });
    var foot = m.querySelector('.editor-modal-foot'), go = document.createElement('button'); go.type = 'button'; go.className = 'btn-pill-dark primary'; go.textContent = all ? 'Fatto' : first.cta;
    function pickStep(li) { var id = li.getAttribute('data-step'); sel = SETUP_STEPS.filter(function (s) { return s.id === id; })[0]; Array.prototype.forEach.call(ol.querySelectorAll('.editor-setup-step'), function (n) { var on = n === li; n.classList.toggle('is-next', on); if (n.getAttribute('role')) n.setAttribute('aria-pressed', on ? 'true' : 'false'); }); go.textContent = sel.cta; }
    if (!all) { ol.addEventListener('click', function (e) { var li = e.target.closest('.editor-setup-step'); if (li && li.getAttribute('role')) pickStep(li); }); ol.addEventListener('keydown', function (e) { var li = e.target.closest && e.target.closest('.editor-setup-step'); if (li && li.getAttribute('role') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickStep(li); } }); }
    if (all) go.setAttribute('data-close', ''); else go.addEventListener('click', function () { setupGo(sel.id); });
    if (!all) { var later = document.createElement('button'); later.type = 'button'; later.className = 'btn-ghost'; later.setAttribute('data-close', ''); later.textContent = 'Più tardi'; foot.appendChild(later); }
    foot.appendChild(go);
    var opener = document.activeElement;
    function close() { document.removeEventListener('keydown', key, true); m.remove(); bannerWait = false; renderSetupBanner(); if (opener && opener.focus) try { opener.focus(); } catch (e) {} }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (e.key === 'Tab') { var f = Array.prototype.filter.call(m.querySelectorAll('button'), function (b) { return !b.disabled; }), i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } }
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', key, true); document.body.appendChild(m); go.focus();
  }
  function renderSetupBanner() {
    var miss = setupMissing(), b = $('#setupBanner'); b.hidden = !(isPublished() && miss.length && !setupOff && !bannerWait && !$('.editor-setup')); if (b.hidden) return;
    var two = miss.length > 1;
    $('#setupBannerTitle').textContent = 'Manca poco per iniziare!';
    $('#setupBannerText').textContent = two ? 'La tua bottega è online. Inserisci i dati fiscali e collega Stripe:\nbastano pochi minuti e potrai ricevere i primi ordini.' : (miss[0].id === 'stripe' ? 'Collega Stripe per ricevere i pagamenti. Ti servono documento e IBAN.' : 'Inserisci i tuoi dati fiscali per poter vendere dalla tua bottega.');
  }
  /* 19/11/2026 (Ruggi): «Attiva pagamenti» nel banner porta DIRETTAMENTE al primo passaggio mancante (fiscali → Stripe), senza popup (meno clic); al rientro (?setup=2) niente popup: il banner resta finche' manca qualcosa e continua dal passaggio successivo */
  $('#setupBannerGo').addEventListener('click', function () { var m = setupMissing(); if (m.length) setupGo(m[0].id, true); else openSetup(); });
  $('#setupBannerOff').addEventListener('click', function () {
    setupOff = true; try { localStorage.setItem(SKEY, '1'); } catch (e) {}
    var b = $('#setupBanner'), still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || b.hidden) { renderSetupBanner(); return; }
    b.classList.add('is-leaving'); /* uscita con motion, poi nascosto */
    setTimeout(function () { b.classList.remove('is-leaving'); renderSetupBanner(); }, 430);
  });
  function doPublishShop() {
    var cur = STORE.get(state.id) || rec, f = pick(state);
    FIELDS.forEach(function (k) { cur[k] = f[k]; }); cur.toneHex = toneHex(); delete cur.pending;
    cur.status = 'pubblicata'; /* lo store riporta in bozza l'eventuale altra bottega online */
    STORE.save(cur); rec = STORE.get(state.id) || cur; status = 'pubblicata'; saveMsg = 'Salvato'; renderPublish();
  }

  /* ---- canvas: iframe del tema ---- */
  function HOST_MAIN() { /* eseguito DENTRO l'iframe, prima dello script del tema (iniettato come testo: nessuna variabile esterna) */
    var mem = {};
    ['sessionStorage', 'localStorage'].forEach(function (n) { /* da file:// lo storage di un iframe può essere negato: copia in memoria */
      try { void window[n].length; } catch (e) {
        var s = {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, n + k) ? mem[n + k] : null; },
          setItem: function (k, v) { mem[n + k] = String(v); }, removeItem: function (k) { delete mem[n + k]; }, clear: function () { mem = {}; }, key: function () { return null; }, length: 0
        };
        try { Object.defineProperty(window, n, { value: s, configurable: true }); } catch (_) {}
      }
    });
    document.addEventListener('click', function (e) { /* i link del tema non navigano: restano solo le ancore interne */
      var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      var h = a.getAttribute('href'); e.preventDefault();
      if (h.length > 1 && h.charAt(0) === '#') { var t = document.getElementById(h.slice(1)); if (t && t.scrollIntoView) t.scrollIntoView(); }
    }, true);
  }
  var EDIT_CSS = '[data-edit]{cursor:text;outline:2px dashed transparent;outline-offset:6px;border-radius:2px;transition:outline-color .15s}[data-edit]:hover{outline-color:color-mix(in srgb,var(--ed-lilla) 55%,transparent)}html [data-edit]:focus,html [data-edit]:focus-visible{outline:2px solid var(--ed-lilla)!important;outline-offset:6px}html [data-edit]::selection{background:var(--ed-lilla);color:#fff}[data-ed-hover]:not([data-ed-selected]){outline:2px solid color-mix(in srgb,var(--ed-lilla) 55%,transparent);outline-offset:2px}html body *:not([data-edit]):not([data-edit] *):not(.editor-inserter):not(.editor-inserter *):not(.ed-handle):not(.ed-handle *):not(.ed-rtb):not(.ed-rtb *){cursor:default!important}html [data-ed-hover] *:not([data-edit]):not([data-edit] *):not(.editor-inserter):not(.editor-inserter *),html [data-ed-hover]:not([data-edit]):not([data-edit] *):not(.editor-inserter):not(.editor-inserter *){cursor:pointer!important}[data-edit]:empty:before{content:attr(data-ph);opacity:.55}' +
    /* 10/11/2026 (Ruggi): maniglia di spostamento al centro del bordo superiore della sezione in hover (lucchetto se bloccata) */
    '.ed-handle{position:fixed;z-index:99999;display:none;align-items:center;justify-content:center;width:44px;height:28px;padding:0;border:0;border-radius:8px;background:var(--ed-lilla);color:#fff;cursor:grab;touch-action:none;box-shadow:0 2px 6px rgba(0,0,0,.18)}.ed-handle.is-on{display:flex}.ed-handle.is-locked{cursor:default}html.ed-dragging,html.ed-dragging *{cursor:grabbing!important;user-select:none!important}' +
    '.ed-handle.is-drag{opacity:0}.ed-ghost{position:fixed;z-index:99998;overflow:hidden;pointer-events:none;border:2px solid var(--ed-lilla);border-radius:8px;background:#fff;opacity:.92;box-shadow:0 12px 32px rgba(0,0,0,.28);transition:opacity .12s}.ed-ghost.is-denied{opacity:.5;border-style:dashed}.ed-ghost-tag{position:absolute;left:6px;top:6px;padding:2px 8px;border-radius:999px;background:var(--ed-lilla);color:#fff;font:600 12px/1.4 Switzer,system-ui,sans-serif}html [data-ed-dragging]{opacity:.35;outline:2px dashed var(--ed-lilla)!important;outline-offset:2px!important}html.ed-dragging [data-ed-locked]{filter:grayscale(1);opacity:.5}html.ed-dragging [data-ed-locked],html.ed-dragging [data-ed-locked] *{cursor:not-allowed!important}' +
    /* 10/11/2026 (Ruggi): testo formattato nelle sezioni: toolbar flottante (grassetto, corsivo, link, elenco puntato/numerato) + resa di elenchi e link dentro i box; grassetto/corsivo usano il font se ha quei pesi, altrimenti il browser li forza */
    ':is([data-edit="sec"],[data-edit="bio"]){font-synthesis:weight style}:is([data-edit="sec"],[data-edit="bio"]) strong,:is([data-edit="sec"],[data-edit="bio"]) b{font-weight:bolder}:is([data-edit="sec"],[data-edit="bio"]) em,:is([data-edit="sec"],[data-edit="bio"]) i{font-style:italic}:is([data-edit="sec"],[data-edit="bio"]) a{text-decoration:underline;color:inherit}:is([data-edit="sec"],[data-edit="bio"]) ul,:is([data-edit="sec"],[data-edit="bio"]) ol{margin:var(--space-2,8px) 0;padding-inline-start:var(--space-6,24px)}:is([data-edit="sec"],[data-edit="bio"]) :is(ul,ol):first-child{margin-top:0}:is([data-edit="sec"],[data-edit="bio"]) :is(ul,ol):last-child{margin-bottom:0}:is([data-edit="sec"],[data-edit="bio"]) li+li{margin-top:var(--space-2,8px)}:is([data-edit="sec"],[data-edit="bio"]) ul{list-style:disc}:is([data-edit="sec"],[data-edit="bio"]) ol{list-style:decimal}:is([data-edit="sec"],[data-edit="bio"]) li{display:list-item}:is([data-edit="sec"],[data-edit="bio"]) li>ul{list-style:circle}' +
    '.ed-rtb{position:fixed;z-index:99997;display:none;align-items:center;padding:4px;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.18);font:500 13px/1 Switzer,system-ui,sans-serif;color:#1a1a1a}.ed-rtb.is-on{display:flex}.ed-rtb-main,.ed-rtb-link{display:flex;align-items:center;gap:2px}.ed-rtb-link{display:none;gap:6px}.ed-rtb.is-link .ed-rtb-main{display:none}.ed-rtb.is-link .ed-rtb-link{display:flex}' +
    '.ed-rtb button{min-width:28px;height:28px;padding:0 6px;border:0;border-radius:6px;background:none;color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;font:inherit}.ed-rtb button:hover{background:#f3f1f4}.ed-rtb button[aria-pressed="true"]{background:var(--ed-lilla);color:#fff}.ed-rtb [hidden]{display:none!important}.ed-rtb .sep{width:1px;height:18px;margin:0 4px;background:rgba(0,0,0,.12)}.ed-rtb input{width:210px;height:28px;padding:0 8px;border:1px solid rgba(0,0,0,.2);border-radius:6px;font:inherit;cursor:text}.ed-rtb input:focus{outline:2px solid var(--ed-lilla);outline-offset:-1px}.ed-rtb-err{color:#b42318;font-size:12px}' +
    /* 22/10/2026: sezioni di PROVA (solo nell'editor): contorno tratteggiato lilla, contenuto attenuato ed etichetta che dice quando la sezione comparirà davvero */
    '@media(min-width:1025px){.product-grid.ed-cols-2>.product-card{grid-column:span 6}.product-grid.ed-cols-3>.product-card{grid-column:span 4}.product-grid.ed-cols-4>.product-card{grid-column:span 3}}' +
    '[data-sample]{position:relative;outline:2px dashed var(--ed-lilla);outline-offset:8px;border-radius:2px}[data-sample]>:not(.editor-sample-note){opacity:.55;pointer-events:none}' +
    '.editor-inserter{display:flex;align-items:center;gap:12px;padding:20px 0;opacity:.45;transition:opacity .15s}.editor-inserter:hover,.editor-inserter:has(:focus-visible){opacity:1}.editor-inserter:before,.editor-inserter:after{content:\'\';flex:1;height:2px;background:var(--ed-lilla);border-radius:1px}' +
    '.editor-inserter button{flex:none;width:var(--ed-tool);height:var(--ed-tool);padding:0;border:0;border-radius:50%;background:var(--ed-lilla);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}.editor-inserter button:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.editor-sample-note{display:block;width:fit-content;justify-self:start;align-self:flex-start;margin:0 0 12px;padding:4px 10px;border-radius:999px;background:var(--ed-lilla);color:#fff;font:600 12px/1.4 Switzer,system-ui,sans-serif;letter-spacing:.01em}' +
    /* 12/11/2026 (Ruggi): dentro una sezione "di prova" (data-sample) un eventuale countdown non deve mai apparire attivo: cifra sempre statica "—" */
    '[data-sample] [data-countdown]{position:relative}[data-sample] [data-countdown] output{visibility:hidden}[data-sample] [data-countdown]::after{content:"—";position:absolute;inset:0;display:flex;align-items:center}' +
    /* 12/11/2026 (Ruggi): Banner drop / sezioni Drop in editor -- il contenuto reale (testi, date, fasi) deve restare IDENTICO, solo il counter diventa trattino: il badge "Anteprima" non puo' essere un figlio normale (sballerebbe il flex interno del tema), quindi e' fuori flusso (position:absolute, non conta come figlio) */
    '[data-sample]{position:relative}[data-sample]>.editor-sample-note{position:absolute;top:-12px;left:12px;margin:0;z-index:2}';
  var NAME_TOKEN = '[NOME BOTTEGA]', DEMO_NAME = 'Nome della bottega', SOCIAL_ARROW = 'M3 10h14M11 4l6 6-6 6';
  var nameBannerOpen = false, nameBannerCtx = false; function syncNameBanner(ctx) { if (ctx !== undefined) nameBannerCtx = ctx; $('#nameBanner').hidden = !(nameBannerOpen && nameBannerCtx); } /* 7/11/2026 (Ruggi): l'avviso sul nome si vede solo in Home → Generali, non in ogni sezione */
  var nameBannerShown = false, nameBannerOff = false, NBKEY = 'contenomy.editor.nameBanner.dismissed'; try { nameBannerOff = localStorage.getItem(NBKEY) === '1'; } catch (e) {}

  /* 22/10/2026 (Ruggi): la bottega APPENA CREATA parte essenziale. Dal HTML del tema (package.js, non si modifica) si tengono: navbar, banner drop, Identità, blocco Prodotti e footer con Supporta.
     Si tolgono le sezioni aggiuntive di dimostrazione ("Chi è", "Il dettaglio prende spazio"). Le due parti del blocco Prodotti restano come PROVA, con etichetta:
     - in evidenza: compare solo quando il venditore inserisce un prodotto;
     Catalogo con ricerca e filtri e tessere del footer (C21): tolti, saranno componenti/sezioni aggiuntive scelte dal venditore. */
  function starterHtml(html) {
    var t = document.createElement('template'); t.innerHTML = html;
    var main = t.content.querySelector('main'); if (!main) return html;
    Array.prototype.slice.call(main.children).forEach(function (el) {
      if (el.tagName === 'SECTION' && el.id !== 'prodotti' && !el.classList.contains('hero')) el.parentNode.removeChild(el);
    });
    function note(host, text) {
      if (!host) return; host.setAttribute('data-sample', '');
      var p = document.createElement('p'); p.className = 'editor-sample-note'; p.setAttribute('role', 'note'); p.textContent = text;
      host.insertBefore(p, host.firstChild);
    }
    var prod = main.querySelector('#prodotti');
    if (prod) {
      note(prod.querySelector('.evidence-intro'), 'Anteprima · così appariranno i tuoi prodotti');
      var cat = prod.querySelector('.catalogue-listing'); if (cat) cat.parentNode.removeChild(cat); /* catalogo con filtri = componente scelto dal venditore, non parte della bottega iniziale */
    }
    /* punti di inserimento delle sezioni aggiuntive (manifest: placement before-prodotti / after-prodotti): linea + "+" + linea, come in WordPress. Niente prima di Identità né dopo il footer. */
    function inserter(pos, label) {
      var d = document.createElement('div'); d.className = 'editor-inserter'; d.setAttribute('data-pos', pos);
      d.innerHTML = '<button type="button" aria-label="' + label + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>';
      return d;
    }
    if (prod) { main.insertBefore(inserter('before-prodotti', 'Aggiungi una sezione prima dei prodotti'), prod); main.appendChild(inserter('after-prodotti', 'Aggiungi una sezione dopo i prodotti')); }
    var tiles = t.content.querySelector('[data-component="C21"]'); if (tiles) tiles.parentNode.removeChild(tiles); /* tessere Diario/Oggetti/Drop/Contatti = sezione aggiuntiva */
    return t.innerHTML;
  }
  /* lilla di sistema e misura del "+" ricavati dal "+" della toolbar (l'iframe non vede le variabili del design system) */
  function edVars() {
    var b = $('#addSectionBtn'), r = b ? b.getBoundingClientRect() : { width: 0 }, c = b ? getComputedStyle(b).backgroundColor : '';
    return '--ed-lilla:' + (c && c !== 'rgba(0, 0, 0, 0)' ? c : '#6c4cf1') + ';--ed-red:' + (getComputedStyle(document.documentElement).getPropertyValue('--color-red-500').trim() || '#ba3244') + ';--ed-tool:' + (r.width ? Math.round(r.width) : 32) + 'px';
  }
  var curPage = 'bottega';
  var curProduct = null;
  var listSel = null, panelReady = false, homeTab = 'pagina'; /* listSel = prodotto selezionato nella lista; panelReady = il pannello destro si disegna solo dopo l'avvio */
  function themeDoc(id, page, prod) {
    var t = PKG[id]; page = page || 'bottega';
    return '<!doctype html><html lang="it" data-host="editor" class="motion-ready"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' + t.css + '</style><style>:root{' + edVars() + '}html{scrollbar-width:thin;overflow-x:clip}body{margin:0}' + EDIT_CSS + '</style>' +
      '<script>(' + HOST_MAIN.toString() + ')();<\/script></head><body>' + (page === 'bottega' ? starterHtml(t.pages.bottega.html) : prod ? t.pages[page].html.split('[NOME PRODOTTO]').join(prod.name) : t.pages[page].html) +
      '<script>' + t.script.replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>';
  }
  function makeFrame(id, page, prod) {
    var fr = document.createElement('iframe');
    fr.className = 'theme-frame is-live'; fr.title = 'Anteprima modificabile della tua bottega'; fr._theme = id;
    fr.addEventListener('load', function () { bindFrame(fr); applySel(fr); });
    fr.srcdoc = themeDoc(id, page, prod);
    return fr;
  }
  var CONTACT_TYPES = {
    email: { label: 'Email', link: 'mailto:', icon: 'M2 4h16v12H2zM2 5l8 6 8-6', ph: 'nome@esempio.it', type: 'email' },
    telefono: { label: 'Telefono', link: 'tel:', icon: 'M6 2l3 3-2 2c1 2 2 3 4 4l2-2 3 3-2 3c-5-1-9-5-10-10z', ph: '+39 000 000 0000', type: 'tel' },
    indirizzo: { label: 'Indirizzo', link: '', icon: 'M10 18s6-5 6-10a6 6 0 10-12 0c0 5 6 10 6 10zM10 10a2 2 0 100-4 2 2 0 000 4z', ph: 'Via, numero, città', type: 'text' }
  };
  function socialLabel(u) { var h = u.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').split(/[\/?#]/)[0], s = h.split('.')[0] || h; return s.charAt(0).toUpperCase() + s.slice(1); }
  function socialLinks() { return state.social.map(function (s) { return s.trim(); }).filter(Boolean); }

  /* tooltip del "+" in pagina: il "+" sta dentro l'iframe, quindi si usa il tooltip condiviso del design system (tooltip.js) tramite un elemento-proxy sovrapposto al pulsante, nella pagina principale */
  var tipProxy = null;
  function tipShow(fr, btn) {
    if (!tipProxy) { tipProxy = document.createElement('span'); tipProxy.setAttribute('data-tooltip', 'Aggiungi una sezione'); tipProxy.setAttribute('aria-hidden', 'true'); tipProxy.style.cssText = 'position:fixed;pointer-events:none;visibility:hidden'; document.body.appendChild(tipProxy); }
    var a = fr.getBoundingClientRect(), r = btn.getBoundingClientRect();
    tipProxy.style.left = (a.left + r.left) + 'px'; tipProxy.style.top = (a.top + r.top) + 'px'; tipProxy.style.width = r.width + 'px'; tipProxy.style.height = r.height + 'px';
    tipProxy.dispatchEvent(new Event('pointerover', { bubbles: true }));
  }
  function tipHide() { if (tipProxy) tipProxy.dispatchEvent(new Event('pointerout', { bubbles: true })); }
  function markSample(host, text) { /* 12/11/2026 (Ruggi): badge "Anteprima" per Banner drop e sezioni Drop in editor -- stesso trattamento di "Prodotti in evidenza" (data-sample/.editor-sample-note): il contenuto reale resta intatto, il badge e' fuori flusso (vedi CSS [data-sample]) */
    if (!host || host.hasAttribute('data-sample')) return; host.setAttribute('data-sample', '');
    var p = host.ownerDocument.createElement('p'); p.className = 'editor-sample-note'; p.setAttribute('role', 'note'); p.textContent = text;
    host.insertBefore(p, host.firstChild);
  }
  function bindFrame(fr) { /* iframe caricato: trova i punti da riempire e li lega allo stato */
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body || !d.documentElement.hasAttribute('data-host')) return;
    var nodes = [], w = d.createTreeWalker(d.body, 4, null), n;
    var hero = d.querySelector('[data-component="C05"]'), h1 = hero && hero.querySelector('h1'), bio = hero && hero.querySelector('p.t-lead');
    if (curPage !== 'bottega') { h1 = null; bio = null; } /* 5/11/2026: titolo e bio della bottega solo nell'Identità della Home; Catalogo, Drop, ecc. tengono il proprio titolo */
    if (curPage === 'bottega') { markSample(d.querySelector('aside.drop-banner'), 'Anteprima'); } /* 12/11/2026 (Ruggi): in editor il Banner drop e' sempre un'anteprima, mai il counter live */
    else if (curPage === 'drop') { markSample(d.querySelector('.drop-hub'), 'Anteprima'); markSample(d.querySelector('aside.drop-bottom-banner'), 'Anteprima'); } /* idem per le card dei drop e il banner fisso in basso */
    while ((n = w.nextNode())) {
      if (n.nodeValue.indexOf(NAME_TOKEN) < 0 || /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) || (h1 && h1.contains(n))) continue;
      nodes.push({ n: n, tpl: n.nodeValue });
    }
    fr._nodes = nodes; fr._hero = hero; fr._h1 = h1; fr._bio = bio; fr._bioTpl = bio ? bio.textContent : '';
    fr._brands = $$('a.nav__logo', d).map(function (a) { /* logo: immagine (se caricata) al posto del nome */
      var img = d.createElement('img'), sp = d.createElement('span');
      img.alt = ''; img.style.cssText = 'display:none;height:2rem;width:auto;max-width:12rem;object-fit:contain';
      a.textContent = ''; a.appendChild(img); a.appendChild(sp);
      return { img: img, sp: sp };
    });
    fr._socials = $$('nav[aria-label="Social"]', d);
    fr._contacts = $$('address.legal__group', d);
    d.addEventListener('scroll', tipHide, true);
    $$('.editor-inserter button', d).forEach(function (b) { /* «+» nell'anteprima: inserisce esattamente in quel punto */
      b.addEventListener('click', function () { openInsert(b.parentNode.getAttribute('data-pos')); });
      ['mouseenter', 'focus'].forEach(function (ev) { b.addEventListener(ev, function () { tipShow(fr, b); }); });
      ['mouseleave', 'blur'].forEach(function (ev) { b.addEventListener(ev, tipHide); });
    });
    wireEditable(fr);
    framePick(fr); scanStructure(fr); syncSections(fr);
    try { applyEvidence(d); } catch (_) {}
    paintFrame(fr);
  }
  function paintFrame(fr) { /* stato -> DOM dell'anteprima (non tocca il testo che l'utente sta scrivendo) */
    if (!fr._nodes) return;
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body) return;
    var act = d.activeElement, name = state.name.trim() || DEMO_NAME;
    fr._nodes.forEach(function (x) { if (x.n.isConnected) x.n.nodeValue = x.tpl.split(NAME_TOKEN).join(name); });
    if (fr._h1 && act !== fr._h1 && fr._h1.textContent !== name) fr._h1.textContent = name;
    if (fr._bio && act !== fr._bio && !d._rtbBusy) { if (state.bio.trim()) { var bioH = rtClean(state.bio, false); if (fr._bio.innerHTML !== bioH) fr._bio.innerHTML = bioH; } else if (fr._bio.textContent !== fr._bioTpl) fr._bio.textContent = fr._bioTpl; }
    fr._brands.forEach(function (b) {
      b.sp.textContent = name; b.sp.style.display = state.logo ? 'none' : ''; b.img.style.display = state.logo ? 'block' : 'none';
      if (state.logo && b.img.getAttribute('src') !== state.logo) b.img.src = state.logo;
    });
    var links = socialLinks(), sig = links.join('\n');
    fr._socials.forEach(function (nav) {
      if (nav._sig !== sig) {
        nav._sig = sig;
        $$('a', nav).forEach(function (a) { a.parentNode.removeChild(a); });
        links.forEach(function (u) {
          var a = d.createElement('a'); a.setAttribute('href', '#'); a.setAttribute('data-href', u);
          a.innerHTML = '<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><path d="' + SOCIAL_ARROW + '"></path></svg><span></span>';
          a.lastChild.textContent = socialLabel(u); nav.appendChild(a);
        });
      }
      nav.style.display = links.length ? '' : 'none';
    });
    var cl = state.contatti.filter(function (c) { return c.v.trim() && !contactError(c); }), csig = JSON.stringify(cl);
    fr._contacts.forEach(function (ad) { /* contatti del footer: uno per riga, link per email/telefono, testo per l'indirizzo */
      if (ad._sig !== csig) {
        ad._sig = csig;
        $$('a, span.legal__line', ad).forEach(function (x) { x.parentNode.removeChild(x); });
        cl.forEach(function (c) {
          var k = CONTACT_TYPES[c.t] || CONTACT_TYPES.email, v = c.v.trim(), el = d.createElement(k.link ? 'a' : 'span');
          if (k.link) el.setAttribute('href', '#'); else el.className = 'legal__line';
          if (k.link) el.setAttribute('data-href', k.link + v.replace(/\s+/g, ''));
          el.innerHTML = '<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><path d="' + k.icon + '"></path></svg><span></span>'; el.lastChild.textContent = v; ad.appendChild(el);
        });
      }
      ad.style.display = cl.length ? '' : 'none';
    });
    if (fr._hero) {
      var tone = heroTone(), fb = fr._hero.querySelector('[data-action="follow"]');
      var isHex = tone && tone.charAt(0) === '#', ht = tone === NONE ? 'none' : isHex ? 'ink' : tone; /* colore personalizzato = tono base + --tone/--on inline (come le altre sezioni) */
      if (fr._hero.getAttribute('data-tone') !== ht) fr._hero.setAttribute('data-tone', ht);
      if (isHex) { fr._hero.style.setProperty('--tone', tone); fr._hero.style.setProperty('--on', onFor(tone)); } else { fr._hero.style.removeProperty('--tone'); fr._hero.style.removeProperty('--on'); } /* il pulsante Segui segue i colori del blocco (CSS del tema), nessuna variante qui */
    }
  }
  function paintAll() { $$('iframe.theme-frame').forEach(paintFrame); }
  function wireEditable(fr) { /* nome (h1) e presentazione (p.t-lead) della copertina si scrivono direttamente nel tema: solo testo semplice */
    var d = fr.contentDocument; richToolbar(fr, d);
    [[fr._h1, 'name', 'Nome della bottega'], [fr._bio, 'bio', 'Presentazione della bottega']].forEach(function (x) {
      var el = x[0], key = x[1]; if (!el) return;
      el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); el.setAttribute('role', 'textbox'); el._lists = false; /* presentazione: grassetto, corsivo e link (niente elenchi); il nome resta testo semplice */
      el.setAttribute('aria-label', x[2]); el.setAttribute('data-edit', key); el.setAttribute('data-ph', x[2]);
      el.addEventListener('focus', function () {
        if (key === 'name' && !nameBannerShown && !nameBannerOff) { nameBannerShown = true; nameBannerOpen = true; syncNameBanner(); }
        if (!state[key].trim()) el.textContent = ''; /* vuoto: via il testo di esempio, resta il segnaposto */
      });
      el.addEventListener('blur', function () { if (d._rtbBusy) return; if (key === 'bio' && el.textContent.trim()) { var c = rtClean(el.innerHTML, false); if (el.innerHTML !== c) el.innerHTML = c; } paintAll(); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); }); /* niente a capo */
      el.addEventListener('paste', function (e) { e.preventDefault(); var cd = e.clipboardData || fr.contentWindow.clipboardData, t = cd.getData('text'); if (key === 'bio' && cd.getData('text/html')) { var c = rtClean(cd.getData('text/html'), false); if (c) d.execCommand('insertHTML', false, c); } else d.execCommand('insertText', false, t.replace(/\s+/g, ' ')); });
      el.addEventListener('input', function () {
        if (key === 'name') {
          state.name = el.textContent.replace(/\s+/g, ' ');
          if (!state.slugTouched && !isPublished()) { state.slug = slugify(state.name); $('#panelSlug').value = state.slug; }
        } else state.bio = rtClean(el.innerHTML, false); /* 10/11/2026: la presentazione ora si salva come HTML ripulito */
        paintAll(); touch();
      });
    });
  }

  /* ---- dispositivo (Desktop / Mobile): cambia la larghezza reale dell'iframe, quindi i breakpoint del tema ---- */
  $$('.editor-device-switch [data-view]').forEach(function (b) { /* 2/11/2026 (Ruggi): desktop/mobile disabilitati (aria-disabled), nessuna vista attiva */
    b.addEventListener('click', function () {
      if (b.getAttribute('aria-disabled') === 'true') return;
      var v = b.getAttribute('data-view'); $('#editorDevice').setAttribute('data-view', v);
      $$('.editor-device-switch [data-view]').forEach(function (x) { var on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', String(on)); });
    });
  });
  /* 5/11/2026 (Ruggi): Desktop/Mobile sono attivi in Home, Prodotto singolo, Drop e Riepilogo; disattivati SOLO nella lista prodotti (nel workspace non c'e' un'anteprima del tema da ridimensionare). Entrando nella lista la vista torna a Desktop. */
  function syncDevice() {
    var off = isListMode(), dev = $('#editorDevice');
    if (off && dev) dev.setAttribute('data-view', 'desktop');
    var cur = (dev && dev.getAttribute('data-view')) || 'desktop';
    $$('.editor-device-switch [data-view]').forEach(function (b) {
      var on = !off && b.getAttribute('data-view') === cur;
      b.setAttribute('aria-disabled', String(off)); b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', String(on));
    });
  }
  /* ---- aggiunta sezione: il "+" nella pagina inserisce esattamente in quel punto; il "+" in toolbar inserisce sempre in fondo (dopo i prodotti, prima del footer fisso) ---- */
  var insertPos = 'after-prodotti', addFam = null, addVar = null, addTone = null, addOpener = null, addModal = $('#addModal');
  /* Modale (29/10/2026, decisione Ruggi): griglia di card (una per componente, con anteprima della prima variante e «N varianti») + ricerca; clic su una card = dettaglio nella stessa modale
     con anteprima grande, varianti e colore. Raggruppamento SOLO nell'interfaccia (il manifest del tema non cambia): Testo manifesto dentro Sezione testo, Galleria doppia a vivo / distanziata dentro Galleria;
     Colonne si chiama «Due colonne». Le anteprime sono i campioni del pacchetto (groups[family.group], <article id="id variante">) in iframe srcdoc a 1200px logici, scalati al riquadro. */
  var UI_GROUPS = [
    { id: 'titolo', label: 'Sezione titolo', fams: ['titolo'], desc: 'Una frase grande per aprire la pagina o dichiarare qualcosa: poche parole, molto spazio.' },
    { id: 'testo', label: 'Sezione testo', fams: ['testo', 'manifesto'], desc: 'Per raccontare in poche righe: un\'introduzione, un racconto o un manifesto.' },
    { id: 'informazioni', label: 'Informazioni', fams: ['informazioni'], desc: 'Dati in forma ordinata, come elenco, griglia o numeri, da leggere a colpo d\'occhio.' },
    { id: 'tecnica', label: 'Scheda tecnica', fams: ['tecnica'], desc: 'Materiali, misure e dettagli di un oggetto, in forma di scheda.' },
    { id: 'colonne', label: 'Due colonne', fams: ['colonne'], desc: 'Due blocchi affiancati: testo e immagine, oppure due testi.' },
    { id: 'galleria', label: 'Galleria', fams: ['galleria'], desc: 'Più immagini insieme: in griglia (2, 3 o 4 per riga), a mosaico, in colonna singola o in carosello.' },
    { id: 'persone', label: 'Persone e citazioni', fams: ['persone'], desc: 'Ritratti e citazioni: una strip da scorrere o in griglia, oppure una citazione singola con immagine.' },
    { id: 'editoriale', label: 'Editoriale con meta', fams: ['editoriale'], desc: 'Un\'immagine con titolo e dati essenziali (categoria, materiale, misure): a tutta larghezza, con l\'immagine a sinistra o a destra, oppure due blocchi affiancati.' },
    { id: 'elenchi', label: 'Elenco a filetti', fams: ['elenchi'], desc: 'Articoli, collezioni o link in elenco a filetti, su una o due colonne, con o senza dettaglio.' },
    { id: 'fascia', label: 'Fascia', fams: ['fascia'], desc: 'Una frase che si ripete e scorre, oppure una fila di loghi.' },
    { id: 'immagine', label: 'Immagine', fams: ['immagine'], desc: 'Una sola immagine, contenuta o a tutta larghezza.' },
    { id: 'schede', label: 'Schede', fams: ['schede'], desc: 'Piccole schede indipendenti, con o senza immagine, per presentare più elementi.' },
    { id: 'percorso', label: 'Percorso', fams: ['percorso'], desc: 'Come nasce un oggetto o come funziona: i passi uno dopo l\'altro.' },
    { id: 'faq', label: 'FAQ', fams: ['faq'], desc: 'Le risposte alle domande che i visitatori si pongono più spesso.' },
    { id: 'griglia-prodotti', label: 'Griglia prodotti', fams: ['griglia-prodotti'], desc: 'I prodotti della bottega in griglia, come nella pagina Catalogo.' }
  ];
  var VLABEL = { 'doppia-distanziata-0': 'doppia distanziata, senza testo', 'doppia-distanziata-1': 'doppia distanziata, con testo' };
  var addPair = null; /* 5/11/2026 (Ruggi): abbinamento colore scelto nella modale (chiaro/scuro/invert) */
  var addPair = null; /* 5/11/2026 (Ruggi): abbinamento colore scelto nella modale (chiaro/scuro/invert) */
  var insertPos = 'after-prodotti', addGroup = null, addItem = null, addFam = null, addVar = null, addTone = null, addOpener = null, addModal = $('#addModal');
  function addGroups() {
    var fams = PKG[state.theme].manifest.families, byId = {}, used = {}, out = [];
    fams.forEach(function (f) { byId[f.id] = f; });
    UI_GROUPS.forEach(function (g) {
      var items = [];
      g.fams.forEach(function (id) { var f = byId[id]; if (!f) return; used[id] = 1; f.axes[0].values.forEach(function (v) { items.push({ f: f, v: v, label: cap(VLABEL[v.id] || v.label) }); }); });
      if (items.length) out.push({ id: g.id, label: g.label, desc: g.desc || '', items: items });
    });
    fams.forEach(function (f) { if (!used[f.id]) out.push({ id: f.id, label: f.label, items: f.axes[0].values.map(function (v) { return { f: f, v: v, label: cap(v.label) }; }) }); });
    return out;
  }
  function hexOf(tone) { var p = PKG[state.theme].manifest.palette.filter(function (c) { return c.id === tone; })[0]; return p ? p.hex : (tone === 'ink' ? '#000000' : '#ffffff'); }
  function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function plain(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  var PREV_W = 1200, PREV_H = 750, specCache = {};
  function specHtml(f, id) {
    if (specCache[id] !== undefined) return specCache[id];
    var t = document.createElement('template'); t.innerHTML = PKG[state.theme].groups[f.group] || '';
    var a = t.content.querySelector('#' + id), h = '';
    if (a) { var l = a.querySelector('.specimen-label'); if (l) l.parentNode.removeChild(l); h = a.innerHTML; }
    return (specCache[id] = h);
  }
  function previewDoc(f, v, scroll) {
    var th = PKG[state.theme], h = specHtml(f, v.id).split('[NOME BOTTEGA]').join((state.name || '').trim() || DEMO_NAME);
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + th.css + '</style><style>' + (scroll ? 'html{overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}body{margin:0}a,button,summary{pointer-events:none}' : 'html,body{margin:0;overflow:hidden}') + 'html{height:100%}body{min-height:100%;display:flex;flex-direction:column;justify-content:center}.frame{width:100%}' + '.marquee__track,.ticker-track{animation-play-state:paused}body.is-hover .marquee__track,body.is-hover .ticker-track{animation-play-state:running}</style></head><body><div class="frame"><main>' + h + '</main></div></body></html>';
  }
  var NONE = '__none', addLocals = []; /* colori creati dentro la sezione (locali): [{hex,name}] */
  function lum(hex) { var c = [1, 3, 5].map(function (i) { var v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function onFor(hex) { return contrast(hex, hexOf('ink')) >= contrast(hex, hexOf('paper')) ? 'var(--ink)' : 'var(--paper)'; } /* testo sopra un colore personalizzato: il più contrastato tra ink e paper del tema (sempre >= 4,5:1) */
  function setPreviewTone(fr, tone) { /* cambia data-tone (o --tone/--on inline per Nessun colore e colori personalizzati) nel DOM dell'iframe (nessun ricaricamento); null = tono originale del campione */
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body) { fr._tone = tone; return; }
    Array.prototype.slice.call(d.querySelectorAll('[data-tone]')).forEach(function (el) {
      if (el._t0 === undefined) el._t0 = el.getAttribute('data-tone');
      var custom = tone !== NONE && tone && tone.charAt(0) === '#'; /* «Nessun colore» = stato del tema data-tone="none" */
      el.setAttribute('data-tone', tone === NONE ? 'none' : custom ? el._t0 : (tone || el._t0));
      if (custom) { el.style.setProperty('--tone', tone); el.style.setProperty('--on', onFor(tone)); }
      else { el.style.removeProperty('--tone'); el.style.removeProperty('--on'); }
      applyPair(el, (tone && tone !== NONE) ? tone : el._t0, fr._pair || null);
    });
  }
  function fitPreview(box) { /* scala = larghezza riquadro / 1200. Riquadro di dimensione fissa dal CSS (card, miniature, anteprima grande): l'iframe copre il riquadro (fill) o 1200x750 (card/miniature, ritaglio); nell'anteprima grande una sezione più alta si scorre dentro */
    var fr = box.firstChild, cw = box.clientWidth, ch = box.clientHeight; if (!fr || !cw) return;
    var k = cw / PREV_W; fr.style.width = PREV_W + 'px'; fr.style.height = (box._fill ? Math.ceil(ch / k) : PREV_H) + 'px'; fr.style.transform = 'scale(' + k + ')';
  }
  var prevRO = 'ResizeObserver' in window ? new ResizeObserver(function (es) { es.forEach(function (e) { fitPreview(e.target); }); }) : null;
  function mountPreview(box, f, v, o) { /* o: { fixed, fill, tone } */
    o = o || {}; box.innerHTML = ''; box._fill = !!o.fill;
    var fr = document.createElement('iframe'); fr.className = 'editor-modal-variant-frame'; fr.title = 'Anteprima: ' + v.label; fr.tabIndex = -1; fr.setAttribute('aria-hidden', 'true'); fr._tone = o.tone || null; fr._pair = o.pair || null;
    fr.addEventListener('load', function () { fitPreview(box); if (fr._tone || fr._pair) setPreviewTone(fr, fr._tone); });
    fr.srcdoc = previewDoc(f, v, !!o.fill); box.appendChild(fr);
    if (o.fixed) { var host = box.parentNode || box, hv = function (on) { try { fr.contentDocument.body.classList.toggle('is-hover', on); } catch (e) {} }; host.addEventListener('mouseenter', function () { hv(true); }); host.addEventListener('mouseleave', function () { hv(false); }); host.addEventListener('focusin', function () { hv(true); }); host.addEventListener('focusout', function () { hv(false); }); } /* miniature: fascia ferma, si muove solo al passaggio */
    if (prevRO) prevRO.observe(box);
  }

  /* ---- griglia ---- */
  function renderGrid() {
    var grid = $('#addGrid'), q = plain($('#addSearch').value.trim()); grid.innerHTML = '';
    var list = addGroups().filter(function (g) { return !q || plain(g.label).indexOf(q) >= 0 || g.items.some(function (it) { return plain(it.label).indexOf(q) >= 0; }); });
    $('#addEmpty').hidden = list.length > 0;
    list.forEach(function (g) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'editor-modal-card'; b._g = g;
      b.innerHTML = '<span class="editor-modal-variant-sw"></span><span class="editor-modal-card-text"><span class="product-card-name"></span><span class="editor-modal-card-count"></span></span>';
      $('.product-card-name', b).textContent = g.label; $('.editor-modal-card-count', b).textContent = g.items.length + (g.items.length === 1 ? ' variante' : ' varianti');
      mountPreview(b.firstChild, g.items[0].f, g.items[0].v, { fixed: true });
      b.addEventListener('click', function () { openGroup(g); });
      grid.appendChild(b);
    });
  }
  /* ---- dettaglio ---- */
  function openGroup(g) {
    addGroup = g; $('#addGridView').hidden = true; $('#addDetailView').hidden = false; $('#addDetailTitle').textContent = g.label; $('#addDetailDesc').textContent = g.desc || ''; $('#addDetailDesc').hidden = !g.desc;
    var vs = $('#addVariants'); vs.innerHTML = '';
    g.items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'editor-modal-variant'; b.setAttribute('role', 'radio'); b._it = it;
      b.innerHTML = '<span class="editor-modal-variant-sw"></span><span class="editor-modal-variant-text"><span class="editor-modal-variant-name"></span></span>'; $('.editor-modal-variant-name', b).textContent = it.label;
      mountPreview(b.firstChild, it.f, it.v, { fixed: true });
      b.addEventListener('click', function () { selectItem(it); });
      vs.appendChild(b);
    });
    $('#addPreview')._it = null; selectItem(g.items[0]);
    $('#addFoot').hidden = false; var ctl = $('.editor-modal-controls'); if (ctl) ctl.scrollTop = 0; $('#addBack').focus();
  }
  function selectItem(it) {
    addItem = it; addFam = it.f; addVar = it.v; addTone = it.v.baseTone || null; addPair = null; renderDetail();
  }
  function renderDetail() {
    if (addPair && (!addFam.toneable || pairsFor(addTone).indexOf(addPair) < 0)) addPair = null; /* l'abbinamento vale solo se esiste per il colore scelto */
    var pv = $('#addPreview');
    if (pv._it !== addItem) { pv._it = addItem; mountPreview(pv, addFam, addVar, { fill: true, tone: addFam.toneable ? addTone : null, pair: addPair }); }
    else { var fr = pv.firstChild; if (fr) { fr._tone = addFam.toneable && addTone ? addTone : null; fr._pair = addPair; setPreviewTone(fr, fr._tone); } }
    $$('.editor-modal-variant', $('#addVariants')).forEach(function (b) { b.setAttribute('aria-checked', String(b._it === addItem)); });
    var tones = addFam.toneable ? addFam.axes[1].values : [];
    $('#addToneWrap').hidden = !tones.length;
    var ts = $('#addTones'); ts.innerHTML = '';
    /* 30/10/2026 (Ruggi): colori su gruppi con sottotitolo (12px, come .panel-field-label): toni del tema + Nessun colore; "Aggiuntivi generali" (si gestiscono in Generali, senza x); "Aggiuntivi locali" (icona i: vivono solo nel componente) = colori locali della sezione (x in hover/focus per eliminarli). Il + sta sempre in fondo, apre "Nuovo colore". */
    var X = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    function group(title, tip) {
      var g = document.createElement('div'); g.className = 'editor-tone-group';
      if (title) {
        var h = document.createElement('p'); h.className = 'panel-field-label editor-tone-group-title'; h.textContent = title;
        if (tip) { var i = document.createElement('span'); i.className = 'editor-tone-info'; i.tabIndex = 0; i.setAttribute('role', 'img'); i.setAttribute('aria-label', tip); i.setAttribute('data-tooltip', tip); h.appendChild(i); }
        g.appendChild(h);
      }
      var r = document.createElement('div'); r.className = 'editor-tone-row'; g.appendChild(r); ts.appendChild(g); return r;
    }
    function delLocal(hex) {
      var i = addLocals.map(function (c) { return c.hex; }).indexOf(hex); if (i < 0) return;
      var gone = addLocals.splice(i, 1)[0], wasSel = addTone === hex;
      if (wasSel) addTone = (addVar && addVar.baseTone) || null; /* se era applicato, la sezione torna al tono di default (e' locale: nessuna sostituzione) */
      renderDetail();
      showToast('Colore eliminato: ' + gone.name, function () { addLocals.splice(i, 0, gone); if (wasSel) addTone = hex; renderDetail(); });
    }
    function sw(row, val, label, cls, color, local) {
      var wrap = document.createElement('span'); wrap.className = 'editor-tone-item';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bottega-swatch' + (cls ? ' ' + cls : ''); if (color) b.style.setProperty('--sw', color);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', label); b.setAttribute('data-tooltip', label); b.setAttribute('aria-checked', String(addTone === val || (val === NONE && addTone == null)));
      b.addEventListener('click', function () { addTone = val; renderDetail(); });
      wrap.appendChild(b);
      if (local) {
        b.addEventListener('keydown', function (e) { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delLocal(val); } });
        var x = document.createElement('button'); x.type = 'button'; x.className = 'editor-tone-del'; x.setAttribute('aria-label', 'Elimina ' + label); x.setAttribute('data-tooltip', 'Elimina'); x.innerHTML = X;
        x.addEventListener('click', function (e) { e.stopPropagation(); delLocal(val); }); wrap.appendChild(x);
      }
      row.appendChild(wrap);
    }
    if (tones.length) {
      var last = group(null);
      tones.forEach(function (t) { sw(last, t, t, '', hexOf(t)); });
      sw(last, NONE, 'Nessun colore', 'is-none');
      var gen = COLORS_API.customs();
      /* 30/10/2026 (Ruggi): il + sta dentro il gruppo a cui aggiunge. Senza colori aggiuntivi: un solo + in fondo, con la casella "Aggiungi ai colori generali" (locale di default). Appena esiste un gruppo compaiono entrambi (quello vuoto ha solo il +), ogni + aggiunge al proprio gruppo e la casella non c'e'. */
      function mkAdd(target) {
        var add = document.createElement('button'); add.type = 'button'; add.className = 'bottega-swatch is-add';
        var tip = target === 'general' ? 'Aggiungi colore generale' : target === 'local' ? 'Aggiungi colore locale' : 'Aggiungi colore';
        add.setAttribute('data-tooltip', tip); add.setAttribute('aria-label', tip); add.setAttribute('aria-haspopup', 'dialog');
        add.addEventListener('click', function () {
          openNewColorPanel(add, {
            general: !target, target: target, over: true, bounds: document.body, rightOf: $('.editor-modal-controls'),
            prefix: function (toGeneral) { return toGeneral ? 'Aggiuntivo' : 'Locale'; },
            names: function () { return COLORS_API.names().concat(addLocals.map(function (c) { return c.name; })); },
            groups: function () { return [{ title: 'Colori di sistema', items: COLORS_API.system() }, { title: 'Aggiuntivi generali', items: COLORS_API.customs() }, { title: 'Aggiuntivi locali', items: addLocals.map(function (c) { return { name: c.name, hex: c.hex }; }) }]; },
            duplicate: function (h) {
              var t = tones.filter(function (x) { return hexOf(x).toLowerCase() === h; })[0]; if (t) return t.charAt(0).toUpperCase() + t.slice(1);
              var g = COLORS_API.customs().filter(function (c) { return c.hex.toLowerCase() === h; })[0]; if (g) return g.name;
              var l = addLocals.filter(function (c) { return c.hex === h; })[0]; return l ? l.name : null;
            },
            onConfirm: function (h, nm, toGeneral) {
              if (toGeneral) COLORS_API.add(h, nm); else addLocals.push({ hex: h, name: nm });
              addTone = h; renderDetail();
            }
          });
        });
        return add;
      }
      if (!gen.length && !addLocals.length) { last.appendChild(mkAdd(null)); }
      else {
        last = group('Aggiuntivi generali'); gen.forEach(function (c) { sw(last, c.hex.toLowerCase(), c.name + ' (si gestisce in Generali)', '', c.hex); }); last.appendChild(mkAdd('general'));
        last = group('Aggiuntivi locali', 'Esistono solo in questo componente'); addLocals.forEach(function (c) { sw(last, c.hex, c.name, '', c.hex, true); }); last.appendChild(mkAdd('local'));
      }
    }
    /* 5/11/2026 (Ruggi): abbinamenti anche nella modale (stesse opzioni del pannello: solo quelle che esistono per il colore scelto) */
    var pb = $('#addPairBox'); if (!pb) { pb = document.createElement('div'); pb.id = 'addPairBox'; pb.className = 'editor-tone-group'; $('#addToneWrap').appendChild(pb); }
    pb.innerHTML = ''; var av = tones.length ? pairsFor(addTone) : []; pb.hidden = !av.length;
    if (av.length) {
      var pl = document.createElement('p'); pl.className = 'panel-field-label editor-tone-group-title'; pl.textContent = 'Abbinamento'; pb.appendChild(pl);
      var psel = makeSelect('Abbinamento colore', ['Predefinito'].concat(av.map(function (x) { return PAIR_LABEL[x]; })), addPair ? PAIR_LABEL[addPair] : 'Predefinito', function (v) {
        var k = Object.keys(PAIR_LABEL).filter(function (x) { return PAIR_LABEL[x] === v; })[0]; addPair = k || null;
        var f2 = $('#addPreview').firstChild; if (f2) { f2._pair = addPair; setPreviewTone(f2, f2._tone); }
      });
      pb.appendChild(psel.el);
    }
    $('#addConfirm').disabled = !addVar;
  }
  function backToGrid() {
    var g = addGroup; addGroup = addItem = addFam = addVar = addTone = addPair = null;
    $('#addDetailView').hidden = true; $('#addGridView').hidden = false; $('#addFoot').hidden = true; $('#addConfirm').disabled = true;
    var c = $$('.editor-modal-card').filter(function (x) { return x._g === g; })[0]; if (c) c.focus();
  }
  function closeAdd() { closeNewPanel(); addModal.hidden = true; if (addOpener && addOpener.focus) addOpener.focus(); }
  function openInsert(pos) {
    insertPos = pos; addLocals = []; addOpener = document.activeElement; addGroup = addItem = addFam = addVar = addTone = addPair = null; specCache = {};
    $('#addSearch').value = ''; $('#addDetailView').hidden = true; $('#addGridView').hidden = false; $('#addFoot').hidden = true; $('#addConfirm').disabled = true;
    renderGrid(); addModal.hidden = false; $('#addGridView').scrollTop = 0; $('.editor-modal-box', addModal).focus(); /* niente focus sulla ricerca: ci si arriva con Tab */
  }
  $('#addSearch').addEventListener('input', renderGrid);
  $('#addBack').addEventListener('click', backToGrid);
  $$('[data-close]', addModal).forEach(function (b) { b.addEventListener('click', closeAdd); });
  addModal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeAdd(); return; }
    if (e.key !== 'Tab') return; var f = $$('button:not([disabled]), input', $('.editor-modal-box', addModal)).filter(function (x) { return x.offsetParent !== null; }); if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  $('#addConfirm').addEventListener('click', function () {
    if (!addVar) return;
    var id = 'n' + Date.now(), label = addGroup.label + ' · ' + addItem.label;
    var at = idxOf((insertPos === 'before-prodotti' && ANCHOR) ? ANCHOR : 'footer'); if (at < 0) at = STRUCT.length;
    STRUCT.splice(at, 0, { id: id, label: label, family: addFam.id, variant: addVar.id, tone: addTone, pair: addPair, locals: addLocals.slice() });
    selId = id; renderStructure(); syncAll(); var pf = $('#editorDevice iframe'); if (pf) applySel(pf, true); closeAdd(); if (typeof productEdited === 'function') productEdited(); /* la nuova sezione entra subito nell'anteprima */
    var row = rowEl(id); if (row) row.scrollIntoView({ block: 'nearest' });
    if ($('#editorShell').classList.contains('panel-closed')) $('#panelToggle').click();
    setStructOpen(true); homeTab = 'sezioni'; renderPanel(); /* 10/11/2026 (Ruggi): la sezione appena aggiunta e' selezionata: il pannello va sempre sulla tab Sezioni, mai su Generali/Pagina */
  });
  $('#addSectionBtn').addEventListener('click', function () { if (this.getAttribute('aria-disabled') === 'true') return; openInsert('after-prodotti'); });
  /* ---- Pagine: scelta della pagina del tema da vedere nel canvas. Bottega = modificabile; le altre sono anteprime (Drop: struttura definita dal tema; Prodotto: si modifica dalla scheda del prodotto; Riepilogo: pagina del tema) ---- */
  /* 1/11/2026 (Ruggi): Home, Prodotto | divider | Drop, Riepilogo. Il divider separa le pagine che si MODIFICANO nell'editor (Home, Prodotto) da quelle che sono solo anteprima del tema. «Bottega» diventa «Home»; «Prodotto» non ha sottomenu: apre la lista dei prodotti nel workspace. */
  var PAGES = [
    { id: 'bottega', label: 'Home', group: 1 },
    { id: 'prodotto', label: 'Prodotti', group: 1 },
    { id: 'drop', label: 'Drop', group: 2 },
    { id: 'riepilogo', label: 'Riepilogo', group: 2 }
  ];
  var PAGE_ICONS = {
    bottega: '<svg class="editor-page-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 12v8h14v-8"/></svg>',
    drop: '<svg class="editor-page-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/></svg>',
    prodotto: '<svg class="editor-page-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/></svg>',
    riepilogo: '<svg class="editor-page-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    catalogo: '<svg class="editor-page-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></svg>',
    lista: '<svg class="editor-page-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    generale: '<svg class="editor-page-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>',
    tuoi: '<svg class="editor-page-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>'
  };
  var CHECK = '<svg class="editor-page-row-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var pagesMenu = $('#pagesMenu'), pagesBtn = $('#pagesBtn');
  /* prodotti del venditore (dati di prova, gli stessi della pagina Prodotti) */
  var PRODUCTS = [
    { id: 'p1', name: 'Maglione oversize', status: 'pubblicato', label: 'Pubblicato', price: '€ 49–52', cat: 'Moda', desc: 'Maglione oversize in cotone pesante, taglio morbido e dettagli ricamati.', tag: 'Edizione limitata', featured: true, stock: 42, lot: 2, sold: 38, total: 80, created: '2026-09-03', modified: '2026-10-30', warn: '1 di 3 varianti esaurita', drop: { time: '2h 26m', phase: 'Primi sostenitori', segs: [100, 100, 55] }, variants: [{ n: 'Nero', price: '€ 49', st: 'pubblicato', l: 'Disponibile', warn: 'Esaurita la taglia M', sizes: [['S', 1], ['M', 0], ['L', 1], ['XL', 1]] }, { n: 'Blu', price: '€ 49', st: 'esaurito', l: 'Esaurito', out: 'Esaurito: tutte le taglie', sizes: [['S', 0], ['M', 0], ['L', 0], ['XL', 0]] }, { n: 'Rosso', price: '€ 52', st: 'pubblicato', l: 'Disponibile', sizes: [['S', 1], ['M', 1], ['L', 1], ['XL', 1]] }] },
    { id: 'p2', name: 'Borsa in tela', status: 'bozza', label: 'Bozza', price: '€ 32', cat: 'Accessori', created: '2026-10-14', modified: '2026-11-01' },
    { id: 'p7', name: 'Zaino in canvas', status: 'bozza', label: 'Bozza', price: '€ 60–72', cat: 'Accessori', qty: 60, created: '2026-10-31', modified: '2026-11-02', variants: [{ n: 'Sabbia', price: '€ 60', st: 'bozza', l: 'Bozza' }, { n: 'Verde', price: '€ 66', st: 'bozza', l: 'Bozza' }, { n: 'Nero', price: '€ 72', st: 'bozza', l: 'Bozza' }] },
    { id: 'p3', name: 'Felpa logo', status: 'esaurito', label: 'Esaurito', price: '€ 55', cat: 'Moda', desc: 'Felpa con logo ricamato, serie limitata in due colori.', sold: 30, total: 30, lot: 1, created: '2026-09-28', modified: '2026-10-22', variants: [{ n: 'Nera', price: '€ 55', st: 'esaurito', l: 'Esaurito', out: 'Esaurito: tutte le taglie', sizes: [['M', 0], ['L', 0]] }, { n: 'Grigia', price: '€ 55', st: 'esaurito', l: 'Esaurito', out: 'Esaurito: tutte le taglie', sizes: [['M', 0], ['L', 0]] }] },
    { id: 'p4', name: 'Tazza in ceramica', status: 'archiviato', label: 'Archiviato', price: '€ 18', cat: 'Casa', stock: 8, sold: 12, total: 20, lot: 1, created: '2026-08-10', modified: '2026-09-12' },
    { id: 'p5', name: 'Cappellino ricamato', status: 'in-drop', label: 'In drop', price: '€ 28', cat: 'Moda', created: '2026-10-20', modified: '2026-11-01', drop: { time: '2g 4h', phase: 'Anteprima', segs: [0, 0, 0] } },
    { id: 'p8', name: 'Calze in cotone', status: 'pubblicato', label: 'Pubblicato', price: '€ 12', cat: 'Moda', desc: 'Calze in cotone pettinato, colori a tinta unita.', created: '2026-09-18', modified: '2026-10-27' },
    { id: 'p6', name: 'Sciarpa in lana', status: 'pubblicato', label: 'Pubblicato', price: '€ 39', cat: 'Moda', desc: 'Sciarpa in lana lavorata a mano, morbida e calda.', stock: 18, lot: 1, sold: 120, total: 138, created: '2026-08-22', modified: '2026-10-29', drop: { closed: true, time: 'Concluso', date: '28 Ott 2026', phase: '120 pezzi venduti', segs: [100, 100, 100] } }
  ];
  function availOf(pr) { return pr.status === 'pubblicato' ? 'Disponibile' : pr.status === 'esaurito' ? 'Esaurito' : '—'; } /* DATI DI PROVA: deriva dallo stato; il dato vero arriva da Prodotti */
  function pill(pr) { return '<span class="status-pill ' + pr.status + '"><i class="dot"></i>' + pr.label + '</span>'; }
  function row(label, note, checked, extra, onClick, role, icon) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'editor-page-row'; b.setAttribute('role', role || 'menuitemradio');
    if (checked !== null) b.setAttribute('aria-checked', String(checked));
    b.innerHTML = (icon || '') + '<span class="editor-page-row-text"><span>' + label + '</span>' + (note ? '<span class="editor-page-row-note">' + note + '</span>' : '') + '</span>' + (extra || '');
    b.addEventListener('click', onClick); return b;
  }
  function renderPagesMenu() {
    pagesMenu.innerHTML = '<p class="editor-pages-title">Pagine</p>';
    var prev = null;
    PAGES.filter(function (p) { return PKG[state.theme].pages[p.id]; }).forEach(function (p) {
      if (prev !== null && prev !== p.group) { var dv = document.createElement('div'); dv.className = 'editor-pages-divider'; dv.setAttribute('role', 'separator'); pagesMenu.appendChild(dv); } /* niente divider se un gruppo e' vuoto */
      prev = p.group;
      if (p.id === 'prodotto') { pagesMenu.appendChild(productsSubmenu(p)); return; }
      pagesMenu.appendChild(row(p.label, '', p.id === curPage, '', function () { setPage(p.id, null); closePages(true); }, null, PAGE_ICONS[p.id]));
    });
  }
  /* 5/11/2026 (Ruggi): «Prodotti» ha di nuovo un sottomenu (chevron) con Catalogo (pagina del tema, obbligatoria), Lista prodotti (la lista nel workspace) e gli ultimi 3 prodotti modificati. La voce «Prodotti» in sé non porta da nessuna parte: apre solo il sottomenu. */
  function productsSubmenu(p) {
    var wrap = document.createElement('div'); wrap.className = 'editor-page-sub';
    var head = row(p.label, '', curPage === 'prodotto' || curPage === 'catalogo', '<svg class="editor-page-row-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>', function (e) { e.preventDefault(); }, 'menuitem', PAGE_ICONS.prodotto);
    head.setAttribute('aria-haspopup', 'menu'); head.removeAttribute('aria-checked'); head.classList.toggle('is-current', curPage === 'prodotto' || curPage === 'catalogo');
    wrap.appendChild(head);
    var sub = document.createElement('div'); sub.className = 'editor-pages-sub'; sub.setAttribute('role', 'menu'); sub.setAttribute('aria-label', p.label);
    if (PKG[state.theme].pages.catalogo) sub.appendChild(row('Catalogo', '', curPage === 'catalogo', '', function () { setPage('catalogo', null); closePages(true); }, null, PAGE_ICONS.catalogo));
    sub.appendChild(row('Lista prodotti', '', curPage === 'prodotto' && !curProduct, '', function () { setPage('prodotto', null); closePages(true); }, null, PAGE_ICONS.lista));
    var rec = PRODUCTS.slice().sort(function (a, b) { return a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : 0; }).slice(0, 3);
    if (rec.length) {
      var dv = document.createElement('div'); dv.className = 'editor-pages-divider'; dv.setAttribute('role', 'separator'); sub.appendChild(dv);
      var t = document.createElement('p'); t.className = 'editor-pages-title'; t.textContent = 'Recenti'; sub.appendChild(t);
      rec.forEach(function (pr) { sub.appendChild(row(pr.name, '', !!curProduct && curProduct.id === pr.id, pill(pr), function () { setPage('prodotto', pr); closePages(true); }, null)); });
    }
    wrap.appendChild(sub); return wrap;
  }
  function openPages(focusIn) { if (!pagesMenu.hidden) return; renderPagesMenu(); pagesMenu.hidden = false; pagesBtn.setAttribute('aria-expanded', 'true'); if (focusIn) { var f = $('[aria-checked="true"]', pagesMenu) || $('button', pagesMenu); if (f) f.focus(); } }
  /* 29/10/2026 (Ruggi): modalità «menu fissi» per lavorarci sopra — aprendo la pagina con ?pinpages (es. bottega-editor.html?bottega=ID&pinpages) il menu Pagine e il sottomenu Prodotto restano APERTI (non si chiudono a mouseleave, clic fuori, Esc o scelta di una voce). Senza il parametro il comportamento resta quello all'hover. */
  var PIN_PAGES = false; /* menu fissi solo per modifiche veloci: true = menu Pagine + sottomenu Prodotto sempre aperti */
  function closePages(refocus) { if (PIN_PAGES) { renderPagesMenu(); return; } pagesMenu.hidden = true; pagesBtn.setAttribute('aria-expanded', 'false'); if (refocus) pagesBtn.focus(); }
  /* 22/10/2026 (Ruggi): il menu Pagine si apre all'HOVER (non al clic), come il sottomenu di Prodotto; il pulsante tiene lo sfondo hover finché il menu è aperto. Da tastiera: Invio/Spazio (clic sintetico) apre e porta il focus nel menu. */
  var pagesWrap = pagesBtn.closest('.editor-pages');
  pagesWrap.addEventListener('mouseenter', function () { openPages(false); });
  pagesWrap.addEventListener('mouseleave', function () { closePages(); });
  pagesBtn.addEventListener('click', function (e) { if (e.detail === 0) openPages(true); });
  if (PIN_PAGES) { pagesWrap.classList.add('is-pinned'); openPages(false); }
  document.addEventListener('mousedown', function (e) { if (!pagesMenu.hidden && !e.target.closest('.editor-pages')) closePages(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pagesMenu.hidden) closePages(true); });
  function isListMode() { return curPage === 'prodotto' && !curProduct; } /* Prodotto senza prodotto scelto = lista nel workspace */
  function isEditable() { return curPage === 'bottega' || (curPage === 'prodotto' && !!curProduct); } /* Home e pagina di un prodotto */
  function listProduct() { for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === listSel) return PRODUCTS[i]; return null; }
  function prodUrl(pr) { /* «Dati del prodotto»: esce dall'editor; il ritorno riapre l'editor di QUESTO prodotto */
    var u = new URL(location.href); u.searchParams.set('prodotto', pr.id);
    return '../02-Prodotti/prodotti.html?prodotto=' + encodeURIComponent(pr.id) + '&ritorno=' + encodeURIComponent(u.pathname.split('/').pop() + u.search);
  }
  /* breadcrumb dinamico (1/11/2026): Bottega (uscita) / Nome bottega / [Pagina] / [Prodotto]. L'ultima voce e' la pagina corrente (aria-current); le altre sono link. */
  function renderBreadcrumb() {
    var back = $('#bcBack'), ol = back && back.closest('ol'); if (!ol || !curPage) return;
    while (ol.children.length > 1) ol.removeChild(ol.lastChild);
    var names = { bottega: 'Home', prodotto: 'Lista prodotti', catalogo: 'Catalogo', drop: 'Drop', riepilogo: 'Riepilogo' };
    var c = [{ t: (state.name || '').trim() || 'Nome bottega', go: function () { setPage('bottega', null); } }];
    if (curPage !== 'bottega') c.push({ t: names[curPage], go: curProduct ? function () { setPage('prodotto', null); } : null });
    if (curProduct) c.push({ t: curProduct.name, go: null });
    c.forEach(function (x, i) {
      var li = document.createElement('li'), last = i === c.length - 1;
      if (last) { li.setAttribute('aria-current', 'page'); li.textContent = x.t; li.title = x.t; }
      else { var a = document.createElement('a'); a.href = '#'; a.textContent = x.t; a.title = x.t; a.addEventListener('click', function (e) { e.preventDefault(); if (x.go) x.go(); }); li.appendChild(a); }
      ol.appendChild(li);
    });
  }
  /* lista prodotti (workspace): ricerca + tabella. Riga = seleziona (info nel pannello destro), doppio clic = apre l'editor del prodotto. */
  var listFilter = 'tutti';
  function normTxt(v) { return String(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  var ICO_CHEV = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>', ICO_WARN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.3 3.9 2.7 17.5A1.8 1.8 0 0 0 4.3 20h15.4a1.8 1.8 0 0 0 1.6-2.5L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z"/><circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none"/></svg>', ICO_OUT = '<svg width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>', ICO_GOTO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>';
  var listOpen = {};   /* righe con le varianti aperte (dati di prova: le varianti vere arrivano da Prodotti) */
  function fmtMod(s) { var d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/(\d) ([a-zà-ù])/, function (m, d, c) { return d + ' ' + c.toUpperCase(); }); } /* mese con l'iniziale maiuscola: «2 Nov 2026» */
  function visibleProducts() { var q = normTxt(($('#searchInput') && $('#searchInput').value) || ''); return PRODUCTS.filter(function (p) { return (listFilter === 'tutti' || p.status === listFilter) && (!q || normTxt(p.name).indexOf(q) >= 0); }); }
  function renderProductRows() {
    var body = $('#prodRows'); body.innerHTML = '';
    var cnt = { tutti: PRODUCTS.length, pubblicato: 0, bozza: 0 }; PRODUCTS.forEach(function (p) { if (cnt[p.status] !== undefined) cnt[p.status]++; });
    $$('#prodChips .status-chip').forEach(function (c) { var k = c.getAttribute('data-status'); c.classList.toggle('active', k === listFilter); $('.count', c).textContent = cnt[k]; });
    var rows = visibleProducts();
    var head = document.createElement('div'); head.className = 'product-row-head'; head.innerHTML = '<div>Prodotto</div><div>Stato</div><div>Prezzo</div><div>Ultima modifica</div>'; body.appendChild(head);
    rows.forEach(function (p, i) {
      var vs = p.variants || [], has = vs.length > 0, open = has && !!listOpen[p.id];
      var r = document.createElement('div'); r.className = 'product-row' + (p.id === listSel ? ' selected' : '') + (open ? ' expanded' : ''); r.setAttribute('data-id', p.id); r.tabIndex = 0;
      if (has) r.setAttribute('data-has-variants', 'true');
      r.innerHTML = '<div class="product-row-main">' + (has ? '<span class="product-row-chevron" role="button" tabindex="0" data-tooltip="' + (open ? 'Nascondi varianti' : 'Mostra varianti') + '" aria-label="' + (open ? 'Nascondi varianti' : 'Mostra varianti') + '" aria-expanded="' + open + '">' + ICO_CHEV + '</span>' : '<span class="product-row-chevron placeholder" aria-hidden="true"></span>') +
        '<span class="product-row-thumb" aria-hidden="true"></span>' +
        '<div class="product-row-textblock"><span class="product-row-title-line"><span class="product-row-name"></span>' + (p.warn ? '<span class="variant-esaurito-warning" data-tooltip="' + p.warn + '" aria-label="' + p.warn + '">' + ICO_WARN + '</span>' : '') + '</span>' + (has ? '<span class="product-row-variant-count">' + vs.length + ' varianti</span>' : '') + '</div></div>' +
        pill(p) + '<div class="product-row-price"></div><div class="product-row-date"></div>' +
        '<div class="row-actions"><a class="row-goto-btn" href="' + prodUrl(p) + '" data-tooltip="Vai alla pagina del prodotto" aria-label="Vai alla pagina del prodotto: ' + p.name + '">' + ICO_GOTO + '</a></div>';
      $('.product-row-name', r).textContent = p.name; $('.product-row-price', r).textContent = p.price; $('.product-row-date', r).textContent = fmtMod(p.modified);
      if (p.id === listSel) r.setAttribute('aria-current', 'true');
      r.addEventListener('click', function () { pickProduct(p.id); });
      r.addEventListener('dblclick', function () { setPage('prodotto', p); });
      r.addEventListener('keydown', function (e) { if (e.target !== r) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickProduct(p.id); } });
      var go = $('.row-goto-btn', r); go.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setPage('prodotto', p); });
      go.addEventListener('dblclick', function (e) { e.stopPropagation(); });
      var ch = $('.product-row-chevron', r);
      if (has) {
        var tg = function (e) { e.preventDefault(); e.stopPropagation(); listOpen[p.id] = !listOpen[p.id]; var on = !!listOpen[p.id], vb = r.nextElementSibling; r.classList.toggle('expanded', on); ch.setAttribute('aria-expanded', String(on)); var t = on ? 'Nascondi varianti' : 'Mostra varianti'; ch.setAttribute('data-tooltip', t); ch.setAttribute('aria-label', t); if (vb) vb.setAttribute('aria-hidden', String(!on)); };
        ch.addEventListener('click', tg); ch.addEventListener('dblclick', function (e) { e.stopPropagation(); });
        ch.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') tg(e); });
      }
      body.appendChild(r);
      if (has) {
        var vb = document.createElement('div'); vb.className = 'product-variants'; vb.setAttribute('aria-hidden', String(!open));
        var h = '<div class="product-variants-inner"><div class="product-variant-head"><div>Variante</div><div>Stato</div><div>Prezzo</div><div class="product-variant-cat-slot"></div></div>';
        vs.forEach(function (v, k) {
          h += (k ? '<div class="product-variant-divider"></div>' : '') + '<div class="product-variant-row"><div class="product-variant-name"><span class="vn"></span>' + (v.warn ? '<span class="variant-esaurito-warning" data-tooltip="' + v.warn + '" aria-label="' + v.warn + '">' + ICO_WARN + '</span>' : '') + (v.out ? '<span class="variant-esaurito-dot" data-tooltip="' + v.out + '" aria-label="' + v.out + '">' + ICO_OUT + '</span>' : '') + '</div><span class="status-pill ' + v.st + '"><i class="dot"></i>' + v.l + '</span><div class="product-variant-price">' + v.price + '</div><div class="product-variant-cat-slot"></div></div>';
        });
        vb.innerHTML = h + '</div>'; $$('.product-variant-row', vb).forEach(function (el, k) { $('.vn', el).textContent = vs[k].n; });
        body.appendChild(vb);
      }
      if (i < rows.length - 1) { var dv = document.createElement('div'); dv.className = 'table-row-divider'; body.appendChild(dv); }
    });
    $('#prodEmpty').hidden = rows.length > 0;
    $('#prodRange').textContent = rows.length ? '1 – ' + rows.length : '0';
  }
  function pickProduct(id) {
    listSel = id; if ($('#editorShell').classList.contains('panel-closed')) { setPanelOpen(true); listAutoClosed = false; }
    $$('#prodRows .product-row').forEach(function (r) { var on = r.getAttribute('data-id') === id; r.classList.toggle('selected', on); if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
    renderPanel();
  }
  /* chip di stato + ricerca (stesso comportamento di Prodotti: la lente apre il campo, la X lo chiude e azzera) */
  $$('#prodChips .status-chip').forEach(function (c) { c.addEventListener('click', function () { listFilter = c.getAttribute('data-status'); renderProductRows(); }); });
  (function () {
    var box = $('#searchBox'), inp = $('#searchInput'), tgl = $('#searchToggleBtn'), cls = $('#searchCloseBtn'), bar = $('#toolbarActions');
    function setOpen(o, back) { box.classList.toggle('open', o); bar.classList.toggle('search-active', o); tgl.setAttribute('aria-expanded', String(o)); inp.tabIndex = o ? 0 : -1; if (o) inp.focus(); else { inp.value = ''; renderProductRows(); if (back) tgl.focus(); } }
    tgl.setAttribute('aria-expanded', 'false');
    tgl.addEventListener('click', function () { setOpen(true); }); tgl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } });
    cls.addEventListener('click', function () { setOpen(false, true); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.classList.contains('open')) { e.preventDefault(); e.stopPropagation(); setOpen(false, true); } });
    inp.addEventListener('input', renderProductRows);
  })();
  /* «Pubblica prodotto»: possibile solo se la bottega e' pubblicata (un prodotto non esiste online senza la sua bottega). */
  function productPublishReason() { return isPublished() ? '' : 'Pubblica prima la bottega.'; }
  /* pannello destro: segue il contesto (lista / editor prodotto / Home / pagina del tema) e la SELEZIONE (nessuna = contenuto base; una sezione = vista della sezione). */
  function renderPanel() {
    if (!panelReady) return;
    syncDevice();
    var panel = $('#editorPanel'), list = isListMode(), prodEd = curPage === 'prodotto' && !!curProduct, home = curPage === 'bottega';
    var pr = list ? listProduct() : curProduct; dispProd = pr; var mode = list ? 'list' : prodEd ? 'product' : home ? 'home' : 'fixed';
    var hasSel = !!selId && !list && idxOf(selId) >= 0; /* 5/11/2026: la selezione vale anche nelle pagine a struttura fissa (Catalogo, Drop, Riepilogo): lì il pannello mostra solo le spaziature */
    panel.setAttribute('data-mode', mode); panel.setAttribute('data-prod', pr ? 'on' : 'off'); /* 22:24: serve al divider della lista */
    $('#prodBack').hidden = !prodEd || homeTab === 'sezioni'; /* «Tutti i prodotti» solo nella tab Prodotto */
    $('#prodHead').hidden = !pr || (prodEd && homeTab === 'sezioni'); /* 2/11/2026: nell'editor prodotto la tab «Prodotto» mostra l'intestazione, «Sezioni» l'editing */
    $('#prodGoto').hidden = !pr; /* 10/11/2026: «Vai al prodotto» c'e' in ogni tab quando c'e' un prodotto; sta nella riga sotto le tab, sempre a destra */
    if (pr) {
      $('#prodName').textContent = pr.name; $('#prodStatus').innerHTML = pill(pr); $('#prodPrice').textContent = pr.price;
      var cat = $('#prodCat'), tg = $('#prodTag'), nv = pr.variants ? pr.variants.length : 0, live = pr.status === 'pubblicato';
      $('#prodFeat').hidden = !pr.featured; cat.textContent = pr.cat || ''; cat.className = 'panel-product-category' + (pr.cat ? ' cat-' + pr.cat.toLowerCase() : ''); cat.hidden = !pr.cat;
      tg.textContent = pr.tag || ''; tg.hidden = !pr.tag; $('#prodMetaDiv').hidden = !(pr.cat || pr.tag);
      var isDraft = pr.status === 'bozza', nvE = nv || 1, vTxt = nvE + (nvE === 1 ? ' variante' : ' varianti'); /* 4/11/2026: un prodotto senza varianti esplicite ne ha comunque 1 → sempre «• 1 variante» */
      $('#prodMeta').hidden = isDraft && !pr.qty; $('#prodDraft').hidden = !isDraft;
      if (isDraft) { /* 3/11/2026: bozza. SE c'e' la tiratura il numero grande e' «N pezzi» e prezzo • varianti vanno sotto (.panel-stock-meta); altrimenti prezzo grande + sottotitolo a fianco */
        var sub = $('#prodDraftSub'); $('#prodDraftTir').hidden = true;
        if (isDraft && pr.qty) { $('#prodDraftPrice').textContent = pr.qty; sub.textContent = 'tiratura totale'; }
        else { $('#prodDraftPrice').textContent = pr.price; sub.textContent = '• ' + vTxt; }
      }
      $('#prodGoto').setAttribute('href', prodUrl(pr));
      var noTir = pr.status === 'pubblicato' && !pr.total; /* pubblicato senza tiratura (illimitato) */
      $('#noTirBanner').hidden = !noTir || !!noTirDismissed[pr.id] || !!noTirSession[pr.id];
      $('#noTirManage').setAttribute('href', prodUrl(pr));
      var vEl = $('#prodVariants'); $('#prodVarSep').hidden = vEl.hidden = false;
      vEl.textContent = vTxt;
      if (nv) vEl.setAttribute('data-tooltip', pr.variants.map(function (v) { return v.n; }).join(', ')); else vEl.removeAttribute('data-tooltip');
      var soldOut = pr.status === 'esaurito', arch = pr.status === 'archiviato'; $('#prodHead').classList.toggle('is-soldout', soldOut || arch); $('#prodProgress').hidden = true; /* esaurito e archiviato: riepilogo tutto muted */
      var noTirSold = !isDraft && !pr.total && (live || pr.status === 'in-drop'); /* 4/11/2026: senza tiratura (pubblicato / in drop) i venduti ci sono comunque: «0 pezzi venduti» in alto, prezzo • varianti piccolo sotto */
      var archLeft = arch && pr.stock > 0, soldView = soldOut || noTirSold || (arch && !archLeft); /* archiviato con invenduti: «N pezzi invenduti»; altrimenti «N pezzi venduti» */
      var showStock = (live && pr.stock != null) || noTirSold || soldOut || (arch && pr.total != null); $('#prodStockRow').hidden = !showStock;
      $('#prodReprop').hidden = !soldOut; $('#prodRepropBtn').setAttribute('href', prodUrl(pr) + '&azione=riproponi'); $('#prodArchiveBtn').setAttribute('href', prodUrl(pr) + '&azione=archivia');
      $('#prodArchived').hidden = !arch; $('#prodRestoreBtn').setAttribute('href', prodUrl(pr) + '&azione=ripristina'); $('#prodArchRepropBtn').setAttribute('href', prodUrl(pr) + '&azione=riproponi');
      if (arch) { $('#prodArchTitle').textContent = archLeft ? 'Vuoi rimetterlo in vendita?' : 'Tutto venduto!'; $('#prodArchText').textContent = archLeft ? 'Ripristinalo com\'è, oppure riproponilo cambiando pezzi e prezzo.' : 'Vuoi riproporlo? Scegli tiratura e prezzo di un nuovo lotto.'; }
      $('#prodStockLabel').textContent = archLeft ? (pr.stock === 1 ? 'pezzo invenduto' : 'pezzi invenduti') : soldView ? 'pezzi venduti' : 'pezzi rimanenti';
      if (showStock) { $('#prodStockNum').textContent = archLeft ? pr.stock : soldView ? (pr.sold || 0) : pr.stock; $('#prodLot').textContent = 'Lotto N. ' + (pr.lot || 1); $('#prodLot').hidden = noTirSold; var pg = $('#prodProgress'); pg.hidden = soldOut || arch || !pr.total; if (!pg.hidden) { pg.max = pr.total; pg.value = pr.sold; pg.setAttribute('aria-label', pr.sold + ' pezzi venduti su ' + pr.total); } var w = $('#prodStockWarn'); w.hidden = !pr.warn; if (pr.warn) { w.setAttribute('data-tooltip', pr.warn); w.setAttribute('aria-label', pr.warn); } }
      var dr = pr.drop; $('#prodDrop').hidden = !dr; $('#prodDropTitle').textContent = dr && dr.closed ? 'Drop concluso' : 'Drop collegato'; $('#prodDropInvite').hidden = !(pr.status === 'bozza' && !dr); $('#prodDropNote').hidden = pr.status !== 'in-drop';
      if (dr) { $('#prodDropDate').textContent = dr.date || ''; $('#prodDropDate').hidden = !dr.date; $('#prodDropTime').textContent = dr.time; $('#prodDropPhase').textContent = dr.phase; $('#prodDropSegs').innerHTML = dr.segs.map(function (w, i) { return '<div class="drop-seg' + (w > 0 && w < 100 ? ' active' : '') + '"><div class="drop-fill" style="width:' + w + '%"></div></div>'; }).join(''); }
      $('#prodAttention').hidden = !(live && pr.warn); $('#prodAttentionText').textContent = pr.warn || '';
    }
    var tabsOn = mode === 'home' || mode === 'product', sezOn = (tabsOn && homeTab === 'sezioni') || mode === 'fixed'; /* pagine fisse: niente tab, solo la vista della sezione */
    $('#tabPagina').textContent = prodEd ? 'Prodotto' : 'Generali'; $('#tabPagina').setAttribute('data-label', prodEd ? 'Prodotto' : 'Generali'); /* 2/11/2026 (Ruggi, 22:19): nel prodotto le tab sono Prodotto | Sezioni (niente Generali: sono del sito intero) */
    syncNameBanner(mode === 'home' && homeTab === 'pagina');
    $('#editorTabs').hidden = !tabsOn; syncTabs(tabsOn && renderPanel._tab !== undefined && homeTab !== renderPanel._tab);
    $('#tabpanelPagina').hidden = !(mode === 'home' && homeTab === 'pagina');
    $('#tabpanelSezioni').hidden = !sezOn;
    $('#viewSection').hidden = !hasSel; $('#secEmpty').hidden = hasSel; $('#sectionNav').hidden = list ? !listSel : !(hasSel && sezOn);
    (function () { var pv = $('#sectionPrevBtn'), nx = $('#sectionNextBtn'); pv.setAttribute('data-tooltip', list ? 'Prodotto precedente' : 'Sezione precedente'); pv.setAttribute('aria-label', list ? 'Prodotto precedente' : 'Sezione precedente'); nx.setAttribute('data-tooltip', list ? 'Prodotto successivo' : 'Sezione successiva'); nx.setAttribute('aria-label', list ? 'Prodotto successivo' : 'Sezione successiva'); if (list) { var vp = visibleProducts(), k = -1; vp.forEach(function (p, n) { if (p.id === listSel) k = n; }); pv.setAttribute('aria-disabled', String(k <= 0)); nx.setAttribute('aria-disabled', String(k < 0 || k >= vp.length - 1)); } })();
    if (hasSel) {
      var i = idxOf(selId);
      fillLabel($('#secTitle'), STRUCT[i].label);
      buildControls(STRUCT[i]);
      var dp = $('#secDropPreview'); if (dp) dp.hidden = !{ 'drop-banner': 1, 'drop-hub': 1, 'drop-bottom-banner': 1 }[STRUCT[i].id]; /* 12/11/2026 (Ruggi): riquadro "Anteprima drop", in aggiunta ai controlli generici sopra */
      var rp = $('#secReviewsPreview'); if (rp) rp.hidden = STRUCT[i].id !== 'recensioni'; /* 19/11/2026 (Ruggi): riquadro "Anteprima recensioni" */
      $('#sectionPrevBtn').setAttribute('aria-disabled', String(i <= 0)); $('#sectionNextBtn').setAttribute('aria-disabled', String(i >= STRUCT.length - 1));
    } else { var dp0 = $('#secDropPreview'); if (dp0) dp0.hidden = true; var rp0 = $('#secReviewsPreview'); if (rp0) rp0.hidden = true; }
    var hint = $('#viewHint'), ht = '';
    if (list && !pr) ht = 'Seleziona un prodotto per vedere le sue informazioni e modificare la sua pagina.';
    /* 4/11/2026 (Ruggi): nell'editor di un prodotto la tab «Prodotto» non ha piu' il riquadro «Seleziona una sezione per modificarla»; la tab «Sezioni» mostra solo #secEmpty («Seleziona un elemento per poterlo modificare») */
    hint.hidden = !ht; $('#viewHintText').textContent = ht;
    panel.setAttribute('data-empty', ((sezOn && !hasSel) || !!ht) ? 'on' : 'off'); /* il riquadro tratteggiato riempie il corpo */
    var foot = 'off', label = '', reason = '';
    if (list && pr) { foot = 'on'; label = 'Modifica pagina'; }
    else if (prodEd && curProduct.status === 'bozza') { foot = 'on'; label = 'Pubblica prodotto'; reason = productPublishReason(); }
    else if (prodEd && curProduct.status === 'pubblicato' && curProduct.dirty) { foot = 'on'; label = 'Aggiorna prodotto'; } /* 2/11/2026: modifiche salvate ma non online */
    var pb = $('#panelPrimary'), fr = $('#footReason');
    panel.setAttribute('data-foot', foot); pb.textContent = label;
    pb.setAttribute('aria-disabled', String(!!reason));
    if (reason) pb.setAttribute('data-tooltip', reason); else pb.removeAttribute('data-tooltip');
    fr.hidden = !reason; fr.textContent = reason;
    $('#panelReset').hidden = !(prodEd && curProduct.status === 'pubblicato' && curProduct.dirty); disarmReset();
    renderModified();
  }
  $('#panelPrimary').addEventListener('click', function () {
    if (this.getAttribute('aria-disabled') === 'true') return;
    if (isListMode()) { var p = listProduct(); if (p) setPage('prodotto', p); return; }
    if (curPage === 'prodotto' && curProduct && curProduct.status === 'bozza') {
      var pr1 = curProduct; askMissingImages(missingImages(pr1.id), function () { pr1.status = 'pubblicato'; pr1.label = 'Pubblicato'; evOnPublish(pr1); renderPanel(); renderBreadcrumb(); showToast('«' + pr1.name + '» pubblicato'); });
    } else if (curPage === 'prodotto' && curProduct && curProduct.status === 'pubblicato' && curProduct.dirty) {
      var pr2 = curProduct; askMissingImages(missingImages(pr2.id), function () { pr2.dirty = false; pr2.snap = JSON.stringify(STRUCT); renderPanel(); showToast('«' + pr2.name + '» aggiornato'); }, 'Aggiorna comunque');
    }
  });
  /* 2/11/2026 (Ruggi): stato del prodotto in alto a destra (#panelSave). Autosave (500ms). Una bozza non ha nulla online con cui divergere: resta «Salvato». */
  var prodSaving = false, prodFlash = false, prodSaveT = null, prodFlashT = null;
  function productEdited() { /* chiamata da ogni modifica alla pagina di un prodotto (sezioni aggiunte/spostate) */
    if (!(curPage === 'prodotto' && curProduct)) return;
    if (curProduct.status === 'pubblicato') curProduct.dirty = true;
    curProduct.modified = new Date().toISOString().slice(0, 10); renderProductRows(); /* la data si propaga alla lista */
    prodSaving = true; prodFlash = false; clearTimeout(prodSaveT); clearTimeout(prodFlashT);
    prodSaveT = setTimeout(function () { prodSaving = false; prodFlash = true; renderModified(); prodFlashT = setTimeout(function () { prodFlash = false; renderModified(); }, 2000); }, 500);
    renderPanel();
  }  /* 2/11/2026 (Ruggi): «Ripristina» = torna alla versione online del prodotto e scarta le modifiche non pubblicate (l'autosave non permette di tornare indietro: conferma inline in due passi, 4s, CANDIDATO locale: il DS non ha un componente di conferma). */
  var resetArmed = false, resetT = null;
  function disarmReset() { resetArmed = false; clearTimeout(resetT); var b = $('#panelReset'); if (b) { b.textContent = 'Ripristina'; b.removeAttribute('data-armed'); } }
  $('#panelReset').addEventListener('click', function () {
    if (!(curProduct && curProduct.snap)) return;
    if (!resetArmed) { resetArmed = true; this.textContent = 'Conferma ripristino'; this.setAttribute('data-armed', 'true'); resetT = setTimeout(disarmReset, 4000); return; }
    disarmReset();
    STRUCT = STRUCT_STORE[ctxKey()] = JSON.parse(curProduct.snap); selId = null;
    curProduct.dirty = false; prodSaving = false; prodFlash = false; clearTimeout(prodSaveT); clearTimeout(prodFlashT);
    var dv = $('#editorDevice'); dv.innerHTML = ''; dv.appendChild(makeFrame(state.theme, curPage, curProduct)); /* anteprima rifatta dalla versione online */ renderStructure(); renderPanel(); showToast('«' + curProduct.name + '» ripristinato alla versione online');
  });

  /* tab Generali / Sezioni (solo Home): la linea attiva scorre sotto la tab scelta */
  var tabNav = $('#editorTabs'), tabLine = tabNav.querySelector('.panel-tab-active-line');
  function syncTabs(animate) {
    var on = homeTab === 'sezioni' ? $('#tabSezioni') : $('#tabPagina');
    $$('.panel-tab', tabNav).forEach(function (t) { var a = t === on; t.classList.toggle('active', a); t.setAttribute('aria-selected', String(a)); });
    if (tabNav.hidden) return;
    var tr = on.getBoundingClientRect(), nr = tabNav.getBoundingClientRect();
    if (!animate) tabLine.style.transition = 'none';
    tabLine.style.width = tr.width + 'px'; tabLine.style.transform = 'translateX(' + (tr.left - nr.left + tabNav.scrollLeft) + 'px)';
    if (!animate) { tabLine.offsetHeight; tabLine.style.transition = ''; }
    renderPanel._tab = homeTab;
  }
  $$('.panel-tab', tabNav).forEach(function (t) {
    function go() { homeTab = t.getAttribute('data-tab'); renderPanel(); }
    t.addEventListener('click', go);
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  /* 5/11/2026 (Ruggi): niente «Indietro» nella vista sezione. Si deseleziona con Esc o con un clic su una zona libera dell'anteprima. «Tutti i prodotti» (tab Prodotto) torna alla lista. */
  function deselectOnEsc(e) {
    if (e.key !== 'Escape' || !selId || !addModal.hidden || !pagesMenu.hidden || newPop) return;
    var t = e.target; if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"],.editor-select-menu,[aria-expanded="true"]')) return;
    selectRow(null);
  }
  document.addEventListener('keydown', deselectOnEsc);
  $('#prodBack').addEventListener('click', function () { setPage('prodotto', null); });
  [['#sectionPrevBtn', -1], ['#sectionNextBtn', 1]].forEach(function (x) {
    $(x[0]).addEventListener('click', function () { if (this.getAttribute('aria-disabled') === 'true') return; if (isListMode()) { var vp = visibleProducts(), k = -1; vp.forEach(function (p, n) { if (p.id === listSel) k = n; }); if (vp[k + x[1]]) pickProduct(vp[k + x[1]].id); return; } var i = idxOf(selId) + x[1]; if (STRUCT[i]) selectRow(STRUCT[i].id); });
  });
  /* pannello Sezioni (a sinistra, sopra l'anteprima): resta aperto finche' non si chiude con la X, con lo stesso pulsante o con Esc */
  var structPanel = $('#structPanel'), structBtn = $('#structBtn'), structHead = $('.editor-struct-head', structPanel), structBody = $('#structBody'), structMin = $('#structMin'), structT = null;
  var ICO_MIN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';
  var ICO_MAX = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  function structIsOpen() { return structPanel.classList.contains('is-open'); }
  function structUnit() { return parseFloat(getComputedStyle(structBody).paddingBottom) || 16; } /* = space-4 */
  /* 2/11/2026 (Ruggi): il pannello e' libero nella pagina (position: fixed, coordinate della finestra) tranne sopra topbar e sidebar: i limiti sono il bordo basso della topbar e il bordo destro della sidebar (chiusa, anche in hover: il flyout sta sopra, z-index piu' alto). */
  function structBounds() { var sb = $('#sidebarV2'), tb = $('.topbar'); return { l: sb ? sb.getBoundingClientRect().right : 0, t: tb ? tb.getBoundingClientRect().bottom : 0, r: window.innerWidth, b: window.innerHeight }; }
  function fitStruct() { structPanel.style.maxHeight = Math.max(120, window.innerHeight - structPanel.getBoundingClientRect().top - structUnit()) + 'px'; }
  function placeStruct() { /* posizione iniziale: sotto la toolbar, allineato al pulsante «Struttura» (a ogni apertura) */
    var bd = structBounds(), tr = $('.editor-toolbar').getBoundingClientRect(), u = structUnit();
    structPanel.style.left = Math.round(bd.l + u) + 'px'; /* 2/11/2026: piu' a sinistra del pulsante, a un'unita' (space-4) dal bordo della sidebar */
    structPanel.style.top = Math.round(tr.bottom + u / 2) + 'px'; fitStruct();
  }
  var structCT = null;
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function setStructCompact(c, instant) { /* ridotto = ~4 righe visibili + un po' d'aria sotto (il padding del corpo); il resto scorre. Cambio di altezza ANIMATO (max-height del corpo, stesso motion dell'apertura). */
    structPanel.classList.toggle('is-compact', c); structMin.innerHTML = c ? ICO_MAX : ICO_MIN;
    structMin.setAttribute('data-tooltip', c ? 'Espandi' : 'Riduci'); structMin.setAttribute('aria-label', c ? 'Espandi la struttura' : 'Riduci la struttura'); structMin.setAttribute('aria-expanded', String(!c));
    clearTimeout(structCT);
    var h0 = structBody.getBoundingClientRect().height, target;
    if (c) {
      structBody.scrollTop = 0; var rows = $$('.editor-struct-row', structList), r = rows[Math.min(3, rows.length - 1)];
      target = r ? Math.round(r.getBoundingClientRect().bottom - structBody.getBoundingClientRect().top + structUnit()) : h0;
    } else {
      var avail = (parseFloat(structPanel.style.maxHeight) || 9999) - structHead.offsetHeight - 2; /* 2 = bordo del pannello */
      target = Math.round(Math.min(structBody.scrollHeight, avail));
    }
    if (instant || reducedMotion()) { structBody.style.maxHeight = c ? target + 'px' : ''; return; }
    structBody.style.transition = 'none'; structBody.style.maxHeight = h0 + 'px'; void structBody.offsetHeight; /* parte dall'altezza attuale */
    structBody.style.transition = ''; structBody.style.maxHeight = target + 'px';
    if (!c) structCT = setTimeout(function () { structBody.style.maxHeight = ''; }, 300); /* tornato naturale: si libera il limite (la lista puo' crescere) */
  }
  function setStructOpen(o) {
    if (o && structBtn.hidden) return;
    structBtn.setAttribute('aria-pressed', String(!!o)); structBtn.classList.toggle('is-active', !!o); clearTimeout(structT);
    if (o) {
      if (structIsOpen()) return;
      structPanel.hidden = false; setStructCompact(false, true); placeStruct(); void structPanel.offsetWidth; structPanel.classList.add('is-open'); /* il reflow fa partire la transizione */
    } else {
      if (structPanel.hidden) return;
      structPanel.classList.remove('is-open');
      var still = reducedMotion();
      structT = setTimeout(function () { structPanel.hidden = true; }, still ? 0 : 150);
    }
  }
  structMin.innerHTML = ICO_MIN;
  structMin.addEventListener('click', function () { setStructCompact(!structPanel.classList.contains('is-compact')); });
  structBtn.addEventListener('click', function () { if (this.getAttribute('aria-disabled') === 'true') return; setStructOpen(!structIsOpen()); });
  $('#structClose').addEventListener('click', function () { setStructOpen(false); structBtn.focus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && structIsOpen() && addModal.hidden && pagesMenu.hidden && !newPop && structPanel.contains(document.activeElement)) { setStructOpen(false); structBtn.focus(); } });
  /* trascinamento dalla testata (non dai pulsanti). Non interferisce con il trascinamento delle voci: quello e' HTML5 drag sulle righe nel corpo, questo e' pointer sulla testata. */
  structHead.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.target.closest('button')) return;
    var sx = e.clientX, sy = e.clientY, r0 = structPanel.getBoundingClientRect(), l0 = r0.left, t0 = r0.top;
    structPanel.classList.add('is-moving'); if (structHead.setPointerCapture) { try { structHead.setPointerCapture(e.pointerId); } catch (x) {} }
    function mv(ev) {
      var bd = structBounds();
      structPanel.style.left = Math.max(bd.l, Math.min(l0 + ev.clientX - sx, bd.r - structPanel.offsetWidth)) + 'px';
      structPanel.style.top = Math.max(bd.t, Math.min(t0 + ev.clientY - sy, bd.b - structHead.offsetHeight - structUnit())) + 'px'; fitStruct();
    }
    function up() { structPanel.classList.remove('is-moving'); structHead.removeEventListener('pointermove', mv); structHead.removeEventListener('pointerup', up); structHead.removeEventListener('pointercancel', up); }
    structHead.addEventListener('pointermove', mv); structHead.addEventListener('pointerup', up); structHead.addEventListener('pointercancel', up);
  });
  window.addEventListener('resize', function () { if (!structIsOpen()) return; var bd = structBounds(), r = structPanel.getBoundingClientRect(); structPanel.style.left = Math.max(bd.l, Math.min(r.left, bd.r - r.width)) + 'px'; structPanel.style.top = Math.max(bd.t, Math.min(r.top, bd.b - structHead.offsetHeight - structUnit())) + 'px'; fitStruct(); });
  function setPage(id, prod) {
    prod = prod || null;
    if (id === curPage && (prod ? prod.id : null) === (curProduct ? curProduct.id : null)) return;
    curPage = id; curProduct = prod; selId = null; homeTab = 'pagina';
    if (prod) listSel = prod.id; else if (id !== 'prodotto') listSel = null; /* tornando alla lista resta selezionato il prodotto appena modificato */
    var list = isListMode(), edit = isEditable(), dev = $('#editorDevice'), add = $('#addSectionBtn');
    dev.innerHTML = ''; dev.hidden = list; $('#editorProducts').hidden = !list;
    if (list) renderProductRows(); else dev.appendChild(makeFrame(state.theme, id, curProduct));
    useStruct(); renderStructure(); renderStructTitle();
    add.hidden = false; add.setAttribute('aria-disabled', String(!edit));
    add.setAttribute('data-tooltip', edit ? 'Aggiungi sezione in fondo alla pagina' : 'Si aggiungono sezioni solo in Home e Prodotto');
    structBtn.setAttribute('aria-disabled', String(list)); structBtn.setAttribute('data-tooltip', list ? 'La struttura è disponibile quando si apre una pagina' : 'Struttura');
    structBtn.hidden = false; if (list) setStructOpen(false);
    $('#editorPanel').setAttribute('data-page', id);
    renderPanel(); renderName();
  }
  /* ---- Struttura della pagina (pannello a sinistra). 5/11/2026 (Ruggi): la lista NON e' piu' un elenco scritto a mano: si LEGGE dalla pagina che l'anteprima mostra davvero (Home, singolo prodotto, Drop, Riepilogo). Fisse = non si spostano; aggiuntive (e le sezioni di dimostrazione del prodotto dopo «Acquisto») = riordinabili solo tra la zona START e il Footer, col trascinamento o con le frecce ↑/↓ sulla maniglia. Drop e Riepilogo: struttura definita dal tema, solo lettura. ---- */
  var STRUCT = [];
  /* STRUCT_STORE = una lista per contesto (pagina + prodotto): tiene le sezioni aggiunte e l'ordine scelto; le voci «lette» si rileggono dall'anteprima a ogni caricamento. START = ultima voce fissa prima della zona riordinabile; ANCHOR = voce fissa che divide la zona in «prima/dopo» (solo Home: Prodotti). null = nessuna zona riordinabile (Drop, Riepilogo). */
  var START = null, ANCHOR = null, STRUCT_STORE = {};
  var DELETED = {}; /* 10/11/2026 (Ruggi): sezioni lette dalla pagina (non aggiunte) eliminate dall'utente: per contesto (pagina+prodotto), chiave = id posizionale xN; scanPage le toglie dall'anteprima a ogni caricamento */
  function ctxKey() { return curPage + '|' + (curProduct ? curProduct.id : ''); }
  function useStruct() {
    STRUCT = STRUCT_STORE[ctxKey()] || (STRUCT_STORE[ctxKey()] = []);
    if (curPage === 'prodotto' && curProduct) { START = STRUCT.some(function (x) { return x.id === 'recensioni'; }) ? 'recensioni' : 'acquisto'; ANCHOR = null; } /* 19/11/2026 (Ruggi): le Recensioni stanno sotto il prezzo e sono fisse: l'ultima voce fissa diventa «Recensioni» (se il tema le ha) */
    else if (curPage === 'bottega') { START = 'identita'; ANCHOR = 'prodotti'; }
    else { START = null; ANCHOR = null; }
  }
  /* --- lettura della pagina: elenco ordinato delle sezioni realmente presenti nell'anteprima --- */
  function famLabel(id) { var f = (manifestOf().families || []).filter(function (x) { return x.id === id; })[0]; return f ? f.label : null; }
  function scanPage(d) {
    var out = [], main = d.querySelector('main'), ro = !(curPage === 'bottega' || (curPage === 'prodotto' && curProduct)), n = 0, seen = {};
    if (!main) return out;
    function shown(el) { var cs = d.defaultView.getComputedStyle(el); return !el.hidden && cs.display !== 'none'; }
    function add(el, id, label, fixed) { out.push({ id: id, label: label, fixed: fixed || ro, note: ro ? 'La struttura di questa pagina è definita dal tema' : '', _el: el }); }
    if (d.querySelector('header.site-header, nav[data-component="C01"]')) add(null, 'navbar', 'Navbar', true);
    Array.prototype.slice.call(main.children).forEach(function (el) { /* copia: scanPage puo' togliere dal DOM le sezioni eliminate e la collezione viva salterebbe la successiva */
      if (!/^(SECTION|ASIDE|DIV)$/.test(el.tagName) || el.classList.contains('editor-inserter') || !shown(el)) return;
      if (curPage === 'bottega') {
        if (el.matches('aside.drop-banner')) return add(el, 'drop-banner', 'Banner drop', true);
        if (el.matches('[data-component="C05"]')) return add(el, 'identita', 'Identità', true);
        if (el.matches('#prodotti')) return add(el, 'prodotti', 'Prodotti in evidenza', true);
      } else if (curPage === 'prodotto') {
        if (!seen.immagini && el.querySelector('[data-component="C12"]')) { seen.immagini = 1; return add(el, 'immagini', 'Immagini e descrizione', true); }
        if (!seen.storia && !seen.acquisto && el.classList.contains('text-section')) { seen.storia = 1; return add(el, 'storia', 'Storia', true); }
        if (el.matches('#recensioni')) { var rv = add(el, 'recensioni', 'Recensioni', true); out[out.length - 1].note = 'Le recensioni arrivano dai clienti: qui si regolano solo colore e spazi'; return rv; } /* 19/11/2026 (Ruggi): sezione Recensioni sotto il prezzo (Tema 01, C33) */
        if (el.matches('#acquisto')) { seen.acquisto = 1; var a = add(el, 'acquisto', 'Acquisto', true); out[out.length - 1].note = 'Prezzo e disponibilità si gestiscono in Prodotti'; return a; }
      } else if (curPage === 'catalogo') {
        if (el.matches('[data-component="C05"]')) return add(el, 'catalogo-intro', 'Intestazione', true);
        if (el.matches('#catalogo')) return add(el, 'catalogo', 'Catalogo', true);
      } else if (curPage === 'drop') {
        if (el.matches('[data-component="C05"]')) return add(el, 'drop-intro', 'Intestazione', true);
        if (el.matches('.drop-hub')) return add(el, 'drop-hub', 'Drop', true);
        if (el.matches('#accesso-prioritario')) return add(el, 'accesso-prioritario', 'Accesso prioritario', true);
      } else if (curPage === 'riepilogo') {
        if (el.matches('.page-title')) return add(el, 'riepilogo-titolo', 'Titolo', true);
        if (el.matches('[data-summary]')) return add(el, 'riepilogo-prodotto', 'Prodotto', true);
        if (el.matches('.summary-support')) return add(el, 'riepilogo-sostegno', 'Sostegno', true);
      }
      var lab = el.matches('[data-component="C26"]') ? 'FAQ' : famLabel(el.getAttribute('data-family')) || 'Sezione';
      var sid = el.getAttribute('data-ed-xid'); if (!sid) { sid = 'x' + (++n); el.setAttribute('data-ed-xid', sid); } /* id stabile: marcato alla prima lettura, cosi' una seconda lettura dopo un'eliminazione non rinumera le sezioni */ if ((DELETED[ctxKey()] || {})[sid]) { if (el.parentNode) el.parentNode.removeChild(el); return; } add(el, sid, lab, false);
    });
    var bb = d.querySelector('aside.drop-bottom-banner'); if (bb) add(bb, 'drop-bottom-banner', 'Banner drop', true);
    if (d.querySelector('[data-component="C04"], footer[data-component="C03"]')) add(null, 'footer', 'Footer', true);
    return out;
  }
  function reconcileStruct(found) { /* tiene le sezioni aggiunte e l'ordine scelto dall'utente, aggiorna le voci lette dalla pagina */
    var out = STRUCT.filter(function (it) { return it.family || found.some(function (x) { return x.id === it.id; }); });
    function at(id) { for (var i = 0; i < out.length; i++) if (out[i].id === id) return i; return -1; }
    found.forEach(function (x, i) {
      var k = at(x.id);
      if (k >= 0) { out[k].label = x.label; out[k].note = x.note; if (!out[k].family) out[k].fixed = x.fixed; return; }
      var pos = 0; for (var j = i - 1; j >= 0; j--) { var q = at(found[j].id); if (q >= 0) { pos = q + 1; break; } }
      out.splice(pos, 0, { id: x.id, label: x.label, fixed: x.fixed, note: x.note });
    });
    /* 5/11/2026 (Ruggi): il Banner drop e' il PRIMO elemento della lista (sopra la Navbar) anche se nel codice della pagina viene dopo */
    var bi = at('drop-banner'); if (bi > 0) out.unshift(out.splice(bi, 1)[0]);
    return out;
  }
  function scanStructure(fr) { /* chiamata al caricamento dell'anteprima: legge la pagina, etichetta i nodi, aggiorna lista e pannello */
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body || !d.documentElement.hasAttribute('data-host')) return;
    var found = scanPage(d);
    var rvd = d.querySelector('#recensioni details.reviews-panel'); if (rvd) rvd.open = true; /* 19/11/2026 (Ruggi): nell'editor le Recensioni si presentano come anteprima APERTA */
    found.forEach(function (x) { if (x._el && !FIXEL[x.id]) x._el.setAttribute('data-ed-sid', x.id); delete x._el; }); /* nodi senza selettore proprio: si ritrovano con data-ed-sid */
    STRUCT = STRUCT_STORE[ctxKey()] = reconcileStruct(found);
    if (curPage === 'prodotto' && curProduct) useStruct(); /* 19/11/2026: ricalcola START (ultima voce fissa) ora che la struttura e' letta */
    if (curPage === 'prodotto' && curProduct && !curProduct.snap) curProduct.snap = JSON.stringify(STRUCT); /* versione online di partenza (wireframe) */
    renderStructure(); renderPanel();
  }
  var GRIP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
  var LOCK = '<svg class="editor-struct-lock" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var structList = $('#structList'), dragId = null;
  function renderStructTitle() { $('#structTitle').textContent = 'Struttura della pagina'; } /* stesso testo di prima, con la formattazione del titolo della tab Pagina (card-title title-lg) */
  function idxOf(id) { for (var i = 0; i < STRUCT.length; i++) if (STRUCT[i].id === id) return i; return -1; }
  function bounds() { return [idxOf(START) + 1, idxOf('footer') < 0 ? STRUCT.length : idxOf('footer')]; } /* posizioni ammesse (dopo aver tolto l'elemento): tra Identità e Footer */
  function moveTo(id, pos) { var i = idxOf(id), it = STRUCT.splice(i, 1)[0], b = bounds(); pos = Math.max(b[0], Math.min(pos, b[1])); STRUCT.splice(pos, 0, it); if (typeof productEdited === 'function' && pos !== i) productEdited(); }
  function rowEl(id) { return $('[data-id="' + id + '"]', structList); }
  function syncDom(id) { /* riporta nel DOM l'ordine di STRUCT spostando il solo nodo trascinato (niente ri-render durante il trascinamento: lo interromperebbe) */
    var i = idxOf(id), el = rowEl(id), nx = STRUCT[i + 1], next = !nx ? null : (ANCHOR && nx.id === ANCHOR) ? ($('[data-dash="d2"]', structList) || rowEl(nx.id)) : nx.id === 'footer' ? $('[data-dash="d4"]', structList) : rowEl(nx.id); /* le linee delimitano le zone: l'elemento va prima della linea che precede Prodotti / Footer */
    structList.insertBefore(el, next); syncAll();
  }
  /* selezione: il clic su una voce la seleziona (stile item attivo) e nell'anteprima evidenzia e porta in vista la sezione corrispondente (solo quelle che esistono nel tema: le sezioni aggiuntive di prova no). */
  var selId = null, SEL_MAP = { navbar: ['nav[data-component="C01"]'], 'drop-banner': ['aside.drop-banner'], identita: ['[data-component="C05"]'], prodotti: ['#prodotti'], immagini: ['[data-component="C12"]'], storia: ['section.text-section'], acquisto: ['#acquisto'], recensioni: ['#recensioni'], footer: ['[data-component="C04"]', 'footer[data-component="C03"]'] };
  function selTarget(d, id) { var it = STRUCT[idxOf(id)]; if (it && it.family) return itemRoot(d, it); var rt = it && itemRoot(d, it); if (rt) return rt; /* 7/11/2026 (Ruggi): selezione = stessa radice dell'hover (es. «Immagini e descrizione» = blocco intero, non solo le immagini): un solo bordo */ var q = SEL_MAP[id] || []; for (var i = 0; i < q.length; i++) { var el = d.querySelector(q[i]); if (el) return el; } return it ? itemRoot(d, it) : null; }
  function applySel(fr, scroll) {
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body) return;
    var st = d.getElementById('ed-sel-style');
    if (!st) { st = d.createElement('style'); st.id = 'ed-sel-style'; st.textContent = '[data-ed-selected]{outline:2px solid ' + (getComputedStyle(document.documentElement).getPropertyValue('--color-lilla-500').trim() || '#9346A9') + ';outline-offset:2px}' /* 7/11/2026 (Ruggi): bordo di selezione leggermente staccato (come Prodotti) su tutte le componenti, anche aggiuntive */; d.head.appendChild(st); }
    Array.prototype.forEach.call(d.querySelectorAll('[data-ed-selected]'), function (x) { x.removeAttribute('data-ed-selected'); });
    var el = selId && selTarget(d, selId); if (!el) return;
    el.setAttribute('data-ed-selected', '');
    if (scroll) { var w = d.defaultView, nav = d.querySelector('nav[data-component="C01"]'), off = (nav && el !== nav && w.getComputedStyle(nav).position !== 'static') ? nav.offsetHeight : 0; w.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + w.scrollY - off), behavior: 'smooth' }); }
  }
  function selectRow(id, noScroll) {
    selId = id; if (id && (curPage === 'bottega' || curPage === 'prodotto')) homeTab = 'sezioni'; $$('.editor-struct-row', structList).forEach(function (r) { var on = r.getAttribute('data-id') === id; r.classList.toggle('is-selected', on); if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
    var fr = $('#editorDevice iframe'); if (fr) applySel(fr, !noScroll);
    renderPanel();
  }
  /* ---- 10/11/2026 (Ruggi): ELIMINARE UNA SEZIONE. Solo le sezioni non fisse (quelle con maniglia di spostamento). Si fa dal button «Elimina» in fondo al pannello (la X nell'anteprima e' stata scartata, 10/11 13:25), che apre la modale di conferma (header titolo + X, body, footer Elimina ghost rosso + Annulla primary, come «Elimina bottega»). Niente toast «Annulla». ---- */
  function askDeleteSection(it, onGo) {
    var m = document.createElement('div'); m.className = 'editor-modal';
    m.innerHTML = '<div class="editor-modal-backdrop"></div><div class="editor-modal-box editor-delsec" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="delSecTitle"><div class="editor-modal-head"><h2 class="card-title title-lg" id="delSecTitle">Elimina sezione</h2><button type="button" class="panel-close-btn editor-modal-close" data-close data-tooltip="Chiudi" aria-label="Chiudi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="editor-modal-body"><div class="editor-modal-view"><p class="editor-modal-desc" id="delSecText"></p></div></div>' +
      '<div class="editor-modal-foot"><button type="button" class="btn-pill-dark primary danger" data-go>Elimina</button><button type="button" class="btn-ghost danger" data-close>Annulla</button></div></div>';
    m.querySelector('#delSecText').textContent = 'Vuoi eliminare la sezione «' + (it.label || 'Sezione') + '»? I suoi contenuti e le sue impostazioni andranno persi.';
    var opener = document.activeElement;
    function close() { document.removeEventListener('keydown', key, true); m.remove(); bannerWait = false; renderSetupBanner(); if (opener && opener.focus) try { opener.focus(); } catch (e) {} }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (e.key === 'Tab') { var f = Array.prototype.filter.call(m.querySelectorAll('button'), function (b) { return !b.disabled; }), i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } }
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); else if (e.target.closest('[data-go]')) { close(); onGo(); } });
    document.addEventListener('keydown', key, true); document.body.appendChild(m); m.querySelector('.btn-pill-dark').focus(); /* il focus parte su «Annulla»: l'azione distruttiva non e' quella di default */
  }
  function addDeleteZone(host, it) { /* 10/11/2026 (Ruggi): «Elimina» in fondo a tutto il pannello, molto staccato dall'ultimo elemento; solo sezioni non fisse; vale anche per le sezioni di dimostrazione senza controlli */
    if (it.fixed) return;
    var dz = document.createElement('div'); dz.className = 'editor-section-delete-zone'; var db = document.createElement('button'); db.type = 'button'; db.className = 'btn-ghost danger editor-section-delete'; db.textContent = 'Elimina';
    db.addEventListener('click', function () { askDeleteSection(it, function () { deleteSection(it.id); }); }); dz.appendChild(db); host.appendChild(dz);
  }
  function deleteSection(id) {
    var i = idxOf(id), it = STRUCT[i]; if (!it || it.fixed) return;
    var fr0 = $('#editorDevice iframe'), d0 = null; try { d0 = fr0 && fr0.contentDocument; } catch (e) {}
    if (!it.family) { var K = ctxKey(); (DELETED[K] = DELETED[K] || {})[it.id] = 1; var r0 = d0 && itemRoot(d0, it); if (r0 && r0.parentNode) r0.parentNode.removeChild(r0); } /* sezione di dimostrazione letta dalla pagina: si toglie dal DOM e si ricorda */
    STRUCT.splice(i, 1); selId = null; renderStructure(); syncAll(); if (fr0 && fr0._edHide) fr0._edHide(); selectRow(null); editedNow();
  }
  /* ---- 4/11/2026 (Ruggi): CONTROLLI GENERICI DI SEZIONE. Selezionare una sezione (fissa o aggiuntiva, anche future) = selezionarla per intero; il pannello mostra i controlli dichiarati dal tema (manifest → slots): colore per ogni superficie, dimensione titolo/testo, margini, gap. Il padding è una capacità del tema (flag `padding`, ora false ovunque): non compare. Lo stato vive nella voce di STRUCT (`ov` = solo le differenze dal tema) e si applica all'anteprima con le classi del tema (size-*, tsize-*, sp-mt/mb/g-*) o con data-tone: nessun ricaricamento. ---- */
  var SCALE = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl'], TXT_SCALE = ['xs', 's', 'm', 'l', 'xl'];
  var LEGACY_STEP = { 't-giant': '3xl', 't-display-xl': '3xl', 't-display': '2xl', 't-h1': 'xl', 't-h2': 'l', 't-h3': 'm', 't-h4': 's' }, HEAD_STEP = { h1: '3xl', h2: 'l', h3: 's', h4: 'xs' };
  var SPACE_LABELS = ['Tema', 'Nessuno', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  var FIXEL = { /* elementi delle sezioni FISSE nel tema (non hanno data-slot): radice, titolo, testo, dove vale il margine */
    navbar: { root: 'nav[data-component="C01"]', mEl: 'header.site-header', ui: { mt: false, mb: true }, mbLabel: 'Spazio sotto la navbar' },
    'drop-banner': { root: 'aside.drop-banner', ui: { mt: true, mb: true } },
    identita: { root: '[data-component="C05"]', title: 'h1', text: 'p.t-lead', ui: { mt: true, mb: true }, tones: 'hero' },
    prodotti: { root: '#prodotti', title: '.evidence-intro .product-card h3', text: '.evidence-intro .product-card .card-meta', all: true, ui: { mt: true, mb: true } }, /* titoli e testi di TUTTE le card in evidenza + spaziatura (margini, spazio tra le card); niente colore (5/11/2026) */
    'catalogo-intro': { root: '[data-component="C05"]', title: 'h1', text: 'p.t-lead', ui: { mt: true, mb: true }, tones: 'hero' }, /* 7/11/2026 (Ruggi): Intestazione del Catalogo = Hero come Identità: colore, testi, spaziatura */
    catalogo: { root: '#catalogo', title: '.product-grid .product-card h3', text: '.product-grid .product-card .card-meta', all: true, ui: { mt: true, mb: true } }, /* 5/11/2026 (Ruggi): griglia del Catalogo = come Prodotti in evidenza — solo testi delle card e spaziature (margini, spazio tra le card), niente colore */
    acquisto: { root: '#acquisto', ui: { mt: true, mb: true }, tones: 'all' }, /* 10/11/2026 (Ruggi): il prezzo ha il controllo colore usato ovunque (cerchi, Nessun colore, abbinamenti) + spaziatura */
    recensioni: { root: '#recensioni', ui: { mt: true, mb: true }, tones: 'all' }, /* 19/11/2026 (Ruggi): come Acquisto: colore + spaziatura; testi/contenuto non modificabili */
    footer: { root: '[data-component="C04"]', alt: 'footer[data-component="C03"]', colorSel: '.block', ui: {}, tones: 'all' }
  };
  function manifestOf() { return PKG[state.theme].manifest; }
  function varOf(it) {
    var r = null; if (!it || !it.family) return r;
    (manifestOf().families || []).forEach(function (f) { if (f.id !== it.family) return; f.axes.forEach(function (a) { if (a.kind === 'structure') a.values.forEach(function (v) { if (v.id === it.variant) r = { f: f, v: v }; }); }); });
    return r;
  }
  function slotsOf(it) {
    if (it.family) { var fv = varOf(it); return fv && fv.v.slots || null; }
    var fx = (manifestOf().pageModel.fixed || []).filter(function (x) { return x.id === it.id; })[0]; return fx && fx.slots || null;
  }

  /* ---- Prodotti in evidenza (Home). 5/11/2026 (Ruggi): il venditore sceglie quanti mostrarne (1, 2 o 3) e QUALI; layout 1 = largo, 2 = due metà uguali, 3 = grande + due. Se i prodotti pubblicati sono meno del numero scelto, se ne vedono meno (3 impostati ma 1 pubblicato = 1 largo). Un prodotto appena pubblicato entra da solo SOLO se c'è un posto libero; altrimenti la sostituzione è manuale. Senza prodotti pubblicati: anteprima con esempi + riquadro «Crea prodotto». ---- */
  var EV_NOTE = 'Anteprima'; /* 12/11/2026 (Ruggi): badge corto, coerente con Banner drop/sezioni Drop */
  function EV() { if (!state.evid) state.evid = { n: 3, ids: null }; return state.evid; }
  function evPublished() { return PRODUCTS.filter(function (p) { return p.status === 'pubblicato' || p.status === 'esaurito'; }); }
  function evById(id) { for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i]; return null; }
  function evDefault() { return evPublished().slice().sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); }).slice(0, 3).map(function (p) { return p.id; }); }
  function evFull() { var a = (EV().ids || evDefault()).slice(0, 3); while (a.length < 3) a.push(null); return a; }
  function evShown() { var pub = evPublished(); return evFull().slice(0, EV().n).map(evById).filter(function (p) { return p && pub.indexOf(p) >= 0; }); }
  function evOnPublish(pr) { /* nuovo prodotto pubblicato: entra solo in un posto libero */
    var e = EV(); if (!e.ids || !pr) return; var full = evFull(), pub = evPublished();
    if (full.indexOf(pr.id) >= 0) return;
    for (var i = 0; i < e.n; i++) { var cur = evById(full[i]); if (!cur || pub.indexOf(cur) < 0) { full[i] = pr.id; e.ids = full; touch(); return; } }
  }
  function applyEvidence(d) {
    var sec = d && d.querySelector('#prodotti'), intro = sec && sec.querySelector('.evidence-intro'), grid = intro && intro.querySelector('.product-grid'); if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.product-card')), shown = evShown(), real = shown.length > 0, note = intro.querySelector('.editor-sample-note');
    if (real) { intro.removeAttribute('data-sample'); if (note) note.parentNode.removeChild(note); }
    else { intro.setAttribute('data-sample', ''); if (!note) { note = d.createElement('p'); note.className = 'editor-sample-note'; note.setAttribute('role', 'note'); note.textContent = EV_NOTE; intro.insertBefore(note, intro.firstChild); } }
    var n = real ? shown.length : EV().n; grid.setAttribute('data-count', String(n)); /* 12/11/2026 (Ruggi): in anteprima (nessun prodotto reale) il numero di card mostrate segue «Numero di prodotti» (EV().n), non piu' fisso a 3 */
    cards.forEach(function (c, i) {
      var a = c.querySelector('h3 a'), m = c.querySelector('.card-meta'), k = c.querySelector('.card-category');
      if (c._t0 === undefined) c._t0 = [a ? a.textContent : '', m ? m.textContent : '', k ? k.textContent : ''];
      var pr = real ? shown[i] : null;
      c.style.display = (i >= n) ? 'none' : '';
      if (a) a.textContent = pr ? pr.name : c._t0[0]; if (m) m.textContent = pr ? (pr.desc || '') : c._t0[1]; if (k) k.textContent = pr ? pr.cat : c._t0[2]; /* 5/11/2026: niente prezzo nelle card; categoria (scelta dall'elenco) + descrizione breve */
      c.classList.toggle('featured', i === 0 || (n === 2 && i === 1));
    });
  }
  function evChanged() { var f = $('#editorDevice iframe'), d = null; try { d = f && f.contentDocument; } catch (e) {} if (d) applyEvidence(d); editedNow(); }
  function evCompact(full, n) { var a = full.filter(Boolean).slice(0, n); while (a.length < 3) a.push(null); return a; }
  var EV_MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  function evDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? (parseInt(m[3], 10) + ' ' + EV_MESI[parseInt(m[2], 10) - 1] + ' ' + m[1]) : '—'; }
  function evEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var EV_WARN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.3 3.9 2.7 17.5A1.8 1.8 0 0 0 4.3 20h15.4a1.8 1.8 0 0 0 1.6-2.5L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z"/><circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none"/></svg>';
  var EV_TICK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
  var EV_STATUS_LABEL = { pubblicato: 'Pubblicato', bozza: 'Bozza', esaurito: 'Esaurito' };
  function evPicker(onPick) { /* 5/11/2026 (Ruggi): modale-tabella dei prodotti (pubblicati, esauriti e bozze) non ancora in evidenza; selezione multipla (max = posti liberi) per pubblicato/esaurito, footer Annulla / Aggiungi (n); 12/11/2026 (Ruggi): aggiunte le bozze -- stessa checkbox di tutte le altre righe (non si inserisce nulla finche' non si conferma dal footer), ma selezionare una bozza e' mutuamente esclusivo col resto: appena selezionata disabilita tutte le altre righe (al massimo una bozza alla volta) e il footer "Aggiungi (n)" diventa "Completa bozza", che chiude la modale e apre il prodotto da completare invece di inserirlo nello slot -- piu' filtri status-chips (Tutti/Pubblicati/Bozze/Esauriti) sopra la tabella, come in prodotti.html */
    var m = document.createElement('div'); m.className = 'editor-modal'; m.setAttribute('data-ev-picker', '');
    var slots = evFull().slice(0, EV().n), used = slots.filter(Boolean), free = EV().n - used.length;
    var list = PRODUCTS.filter(function (p) { return used.indexOf(p.id) < 0; }), picked = [], pickedBozza = null, statusFilter = 'tutti';
    var counts = { tutti: list.length, pubblicato: 0, bozza: 0, esaurito: 0 };
    list.forEach(function (p) { if (counts[p.status] !== undefined) counts[p.status]++; });
    function chip(st, label) { return '<button class="status-chip' + (st === 'tutti' ? ' active' : '') + '" data-status="' + st + '">' + label + '<span class="count">' + counts[st] + '</span></button>'; }
    m.innerHTML = '<div class="editor-modal-backdrop" data-close></div><div class="editor-modal-box editor-ev-picker" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="evPickTitle"><div class="editor-modal-head"><h2 class="card-title title-lg" id="evPickTitle">Aggiungi prodotto</h2><button type="button" class="panel-close-btn editor-modal-close" data-close data-tooltip="Chiudi" aria-label="Chiudi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="editor-modal-body"><div class="editor-modal-view">' + (list.length ? '<div class="status-chips">' + chip('tutti', 'Tutti') + '<span class="status-chip-divider"></span>' + chip('pubblicato', 'Pubblicati') + '<span class="status-chip-divider"></span>' + chip('bozza', 'Bozze') + '<span class="status-chip-divider"></span>' + chip('esaurito', 'Esauriti') + '</div>' : '') + (list.length > 8 ? '<input class="bottega-input" type="search" autocomplete="off" spellcheck="false" placeholder="Cerca un prodotto" aria-label="Cerca un prodotto" data-ev-search>' : '') +
      '<div class="editor-ev-table" role="group" aria-label="Prodotti"></div><div class="editor-ev-picker-empty" data-ev-empty hidden><p class="editor-ev-picker-empty-text">Nessun prodotto trovato.</p></div></div>' +
      '<div class="editor-ev-foot"><span class="bottega-hint" data-ev-hint></span><div class="editor-ev-foot-actions"><button type="button" class="btn-ghost danger" data-close>Annulla</button><button type="button" class="btn-pill-dark primary" data-ev-add disabled>Aggiungi</button></div></div></div></div>';
    var tb = $('.editor-ev-table', m), addBtn = $('[data-ev-add]', m), hint = $('[data-ev-hint]', m);
    var head = document.createElement('div'); head.className = 'editor-ev-tr editor-ev-th'; head.innerHTML = '<span></span><span>Prodotto</span><span>Stato</span><span>Prezzo</span><span>Venduti</span><span>Categoria</span><span>Data</span>'; tb.appendChild(head);
    if (!list.length) { /* 12/11/2026 (Ruggi): nessun prodotto creato -> messaggio centrato + button «Crea prodotto»; se esistono prodotti ma tutti già in evidenza, resta il semplice avviso testuale */
      tb.hidden = true; var e0 = $('[data-ev-empty]', m), e0t = $('.editor-ev-picker-empty-text', e0);
      if (!PRODUCTS.length) {
        e0t.innerHTML = 'Al momento non ci sono<br>prodotti creati';
        e0.innerHTML = e0.innerHTML + '<a class="btn-pill-dark sm" href="../02-Prodotti/prodotti.html?nuovo=1&ritorno=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) + '"><svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Crea prodotto</a>';
      } else { e0t.textContent = 'Non ci sono altri prodotti pubblicati.'; }
      e0.hidden = false;
    }
    var rows = list.map(function (p) {
      var isBozza = p.status === 'bozza', b = document.createElement('div'); b.tabIndex = 0; b.className = 'editor-ev-tr editor-ev-pk'; b.setAttribute('role', 'checkbox'); /* div e non button: dentro c'e' il link «Vai al prodotto» (a in button non e' valido) */ b.setAttribute('aria-checked', 'false'); b.setAttribute('data-name', p.name.toLowerCase()); b.setAttribute('data-status', p.status);
      var nv = (p.variants && p.variants.length) ? p.variants.length + ' varianti' : '', sold = (p.total ? '<strong>' + p.sold + '</strong> di <strong>' + p.total + '</strong>' : '—');
      b.innerHTML = '<span class="order-checkbox-box" aria-hidden="true">' + EV_TICK + '</span>' +
        '<span class="editor-ev-pk-prod"><span class="editor-ev-thumb" aria-hidden="true"></span><span class="editor-ev-pk-col"><span class="editor-ev-pk-line"><span class="editor-ev-pk-name">' + evEsc(p.name) + '</span>' + (!isBozza && p.warn ? '<span class="variant-esaurito-warning" role="img" aria-label="' + evEsc(p.warn) + '" data-tooltip="' + evEsc(p.warn) + '">' + EV_WARN + '</span>' : '') + '</span>' + (nv ? '<span class="editor-ev-pk-sub">' + nv + '</span>' : '') + '</span></span>' +
        '<span class="editor-ev-pk-status"><span class="status-pill ' + p.status + '"><i class="dot"></i>' + EV_STATUS_LABEL[p.status] + '</span></span>' +
        '<span class="editor-ev-pk-price">' + evEsc(p.price) + '</span><span class="editor-ev-pk-stat">' + sold + '</span><span class="editor-ev-pk-meta"><span class="panel-product-category cat-' + evEsc((p.cat || '').toLowerCase()) + '">' + evEsc(p.cat) + '</span></span><span class="editor-ev-pk-meta">' + evDate(p.created) + '</span>' +
        '<div class="row-actions"><a class="row-goto-btn" href="' + prodUrl(p) + '" data-tooltip="' + (isBozza ? 'Completa e pubblica' : 'Vai alla pagina del prodotto') + '" aria-label="' + (isBozza ? 'Completa e pubblica: ' : 'Vai alla pagina del prodotto: ') + evEsc(p.name) + '">' + ICO_GOTO + '</a></div>';
      var go = $('.row-goto-btn', b); go.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); close(); setPage('prodotto', p); });
      go.addEventListener('keydown', function (e) { e.stopPropagation(); });
      b.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && e.target === b) { e.preventDefault(); b.click(); } });
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-disabled') === 'true') return;
        if (isBozza) { pickedBozza = (pickedBozza === p.id) ? null : p.id; }
        else { var i = picked.indexOf(p.id); if (i >= 0) picked.splice(i, 1); else if (picked.length < free) picked.push(p.id); else return; }
        sync();
      });
      tb.appendChild(b); var dv = document.createElement('div'); dv.className = 'table-row-divider'; tb.appendChild(dv); /* 5/11: divider tra le righe come nelle altre tabelle */ return { el: b, p: p, dv: dv, isBozza: isBozza };
    });
    function syncDiv() { var vis = rows.filter(function (r) { return !r.el.hidden; }); rows.forEach(function (r) { r.dv.hidden = vis.indexOf(r) < 0 || vis[vis.length - 1] === r; }); }
    syncDiv();
    function sync() { /* 12/11/2026 (Ruggi): selezionare una bozza e' mutuamente esclusivo col resto -- al massimo una bozza, e se c'e' una bozza selezionata tutte le altre righe si disabilitano (il footer puo' fare una sola cosa alla volta: o "Aggiungi (n)" pubblicati/esauriti, o "Completa bozza") */
      rows.forEach(function (r) {
        if (r.isBozza) { var on = pickedBozza === r.p.id; r.el.setAttribute('aria-checked', String(on)); r.el.setAttribute('aria-disabled', String(!on && (pickedBozza !== null || free <= 0 || picked.length > 0))); }
        else { var on2 = picked.indexOf(r.p.id) >= 0; r.el.setAttribute('aria-checked', String(on2)); r.el.setAttribute('aria-disabled', String(pickedBozza !== null || (!on2 && picked.length >= free))); }
      });
      if (pickedBozza !== null) {
        addBtn.disabled = false; addBtn.textContent = 'Completa';
        hint.classList.add('is-info'); hint.textContent = 'Completa e pubblica il tuo prodotto';
      } else {
        addBtn.disabled = !picked.length; addBtn.textContent = picked.length ? 'Aggiungi (' + picked.length + ')' : 'Aggiungi';
        hint.classList.toggle('is-info', free > 0 && picked.length >= free);
        hint.textContent = free <= 0 ? 'Nessun posto libero: aumenta il numero di prodotti o rimuovine uno.' : (picked.length >= free ? 'Hai riempito i posti liberi.' : (free - picked.length) + (free - picked.length === 1 ? ' posto libero' : ' posti liberi'));
      }
    }
    var q = $('[data-ev-search]', m);
    function refineVisibility() {
      var v = q ? q.value.trim().toLowerCase() : '', n = 0;
      rows.forEach(function (r) { var okStatus = statusFilter === 'tutti' || r.el.getAttribute('data-status') === statusFilter, okSearch = !v || r.el.getAttribute('data-name').indexOf(v) >= 0, ok = okStatus && okSearch; r.el.hidden = !ok; if (ok) n++; });
      syncDiv(); $('[data-ev-empty]', m).hidden = n > 0;
    }
    if (q) q.addEventListener('input', refineVisibility);
    var chipsEl = $('.status-chips', m);
    if (chipsEl) chipsEl.addEventListener('click', function (e) { var c = e.target.closest('.status-chip'); if (!c) return; Array.prototype.forEach.call(chipsEl.querySelectorAll('.status-chip'), function (x) { x.classList.remove('active'); }); c.classList.add('active'); statusFilter = c.getAttribute('data-status'); refineVisibility(); });
    addBtn.addEventListener('click', function () {
      if (pickedBozza !== null) { var pb = evById(pickedBozza); close(); if (pb) setPage('prodotto', pb); return; }
      var ps = picked.map(evById).filter(Boolean); close(); onPick(ps);
    });
    function close() { document.removeEventListener('keydown', esc); if (m.parentNode) m.parentNode.removeChild(m); }
    function esc(e) { if (e.key === 'Escape') close(); }
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    sync(); document.addEventListener('keydown', esc); document.body.appendChild(m); var f = $('.editor-ev-picker', m); if (f) f.focus();
  }
  function buildEvidence(box) {
    box.innerHTML = ''; allSelects = allSelects.filter(function (x) { return x.el.isConnected; });
    var e = EV();
    function title(t) { var h = document.createElement('div'); h.className = 'panel-accordion-header-label editor-ctl-title'; h.textContent = t; box.appendChild(h); }
    /* 12/11/2026 (Ruggi): nessun prodotto creato (bozze comprese, non solo pubblicati) -> riquadro invito sopra a tutto, stesso stile di #secDropPreview (.editor-drop-invite); «Numero di prodotti» e «Aggiungi prodotto» restano visibili sotto */
    if (!PRODUCTS.length) {
      var emp = document.createElement('div'); emp.className = 'editor-drop-invite';
      emp.innerHTML = '<div class="editor-drop-invite-body"><span class="editor-drop-invite-title panel-drop-title">Crea il tuo primo prodotto</span><p class="editor-drop-invite-text">Qui compariranno i prodotti in evidenza della tua bottega, una volta creati e pubblicati.</p></div>' +
        '<a class="btn-pill-dark sm secondary" href="../02-Prodotti/prodotti.html?nuovo=1&ritorno=' + encodeURIComponent(location.pathname.split('/').pop() + location.search) + '"><svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Crea prodotto</a>';
      box.appendChild(emp);
    }
    /* titolo del gruppo = «Numero di prodotti», con il menu 1/2/3 accanto. Riducendo il numero, i prodotti oltre l'ultimo posto escono dalla selezione. */
    var nr = document.createElement('div'); nr.className = 'editor-ev-numrow';
    var nl = document.createElement('div'); nl.className = 'panel-accordion-header-label editor-ctl-title'; nl.textContent = 'Numero di prodotti'; nr.appendChild(nl);
    var ns = makeSelect('Numero di prodotti', ['1', '2', '3'], String(e.n), function (v) { var k = parseInt(v, 10); if (k === e.n) return; e.ids = evCompact(evFull(), k).map(function (id, i) { return i < k ? id : null; }); e.n = k; evChanged(); buildEvidence(box); });
    ns.el.classList.add('editor-ev-num'); nr.appendChild(ns.el); box.appendChild(nr);
    /* 5/11/2026 (Ruggi): niente titolo «Prodotti selezionati»; la lista sta direttamente sotto «Numero di prodotti» */
    var ol = document.createElement('ol'); ol.className = 'editor-ev-list'; box.appendChild(ol);
    var full = evCompact(evFull().slice(0, e.n), e.n), dragI = null, dragLi = null;
    function commit(a) { e.ids = a; evChanged(); buildEvidence(box); }
    function move(i, to) { if (to < 0 || to >= e.n || !full[to] || to === i) return; var a = full.slice(), t = a[i]; a.splice(i, 1); a.splice(to, 0, t); commit(a); }
    for (var i = 0; i < e.n; i++) (function (i) {
      var li = document.createElement('li'), num = document.createElement('span'); li.className = 'editor-ev-row'; num.className = 'editor-ev-num-label'; num.textContent = (i + 1) + '.'; li.appendChild(num);
      var pr = evById(full[i]); li._id = pr ? pr.id : null;
      if (!pr) {
        var add = document.createElement('button'); add.type = 'button'; add.className = 'editor-ev-item is-empty';
        add.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Aggiungi prodotto</span>';
        add.addEventListener('click', function () { evPicker(function (ps) { var a = full.slice(); ps.forEach(function (p) { var k = a.slice(0, e.n).indexOf(null); if (k >= 0) a[k] = p.id; }); commit(a); }); });
        li.appendChild(add);
      } else {
        var it2 = document.createElement('div'); it2.className = 'editor-ev-item'; it2.draggable = true;
        it2.innerHTML = '<button type="button" class="editor-struct-grip" aria-label="Sposta «' + pr.name.replace(/"/g, '') + '» (frecce su e giù)">' + GRIP + '</button><span class="editor-ev-name"></span><button type="button" class="editor-ev-goto" aria-label="Vai alla pagina del prodotto: ' + pr.name.replace(/"/g, '') + '" data-tooltip="Vai alla pagina del prodotto">' + ICO_GOTO + '</button><button type="button" class="editor-ev-remove" aria-label="Rimuovi dalla selezione" data-tooltip="Rimuovi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
        $('.editor-ev-name', it2).textContent = pr.name;
        $('.editor-ev-goto', it2).addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); setPage('prodotto', pr); }); /* 10/11/2026 (Ruggi): freccia «Vai al prodotto» prima della x */
        $('.editor-ev-remove', it2).addEventListener('click', function () { var a = full.slice(); a[i] = null; commit(evCompact(a, e.n)); });
        $('.editor-struct-grip', it2).addEventListener('keydown', function (ev) { if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return; ev.preventDefault(); move(i, i + (ev.key === 'ArrowUp' ? -1 : 1)); });
        /* 10/11/2026 (Ruggi): come nella lista Struttura, la riga si riordina MENTRE si trascina (numeri compresi) e quella trascinata ha lo stesso stato; lo scambio si registra al rilascio. */
        function renumber() { Array.prototype.forEach.call(ol.children, function (l, k) { l.firstChild.textContent = (k + 1) + '.'; }); }
        it2.addEventListener('dragstart', function (ev) { dragI = i; dragLi = li; it2.classList.add('is-dragging'); try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(i)); } catch (x) {} });
        it2.addEventListener('dragend', function () {
          it2.classList.remove('is-dragging'); var ids = Array.prototype.map.call(ol.children, function (l) { return l._id || null; }).filter(Boolean);
          var same = ids.every(function (id, k) { return id === full[k]; }); dragI = null; dragLi = null;
          if (!same) { var a = ids.slice(); while (a.length < e.n) a.push(null); commit(a); }
        });
        li.addEventListener('dragover', function (ev) {
          if (dragLi === null || dragLi === li || !li._id) return; ev.preventDefault();
          var r = li.getBoundingClientRect(), after = ev.clientY > r.top + r.height / 2, ref = after ? li.nextSibling : li;
          if (ref !== dragLi && (after ? li.nextSibling !== dragLi : li.previousSibling !== dragLi)) { ol.insertBefore(dragLi, ref); renumber(); }
        });
        li.addEventListener('drop', function (ev) { if (dragLi !== null) ev.preventDefault(); });
        li.appendChild(it2);
      }
      ol.appendChild(li);
    })(i);
  }
  function qa(root, sel) { var a = Array.prototype.slice.call(root.querySelectorAll(sel)); if (root.matches && root.matches(sel)) a.unshift(root); return a; }
  function ensureOv(it) {
    if (it.ov) return it.ov;
    it.ov = { c: {}, p: {} };
    if (it.family && it.tone) { var s = slotsOf(it), c0 = s && s.colors && s.colors[0]; if (c0 && it.tone !== c0.tone && !(it.tone === NONE && !c0.tone)) it.ov.c[c0.id] = it.tone; if (c0 && it.pair) it.ov.p[c0.id] = it.pair; } /* il colore scelto in fase di aggiunta diventa lo scostamento della prima superficie */
    return it.ov;
  }
  function ovCount(it) { var o = it.ov; if (!o) return 0; return Object.keys(o.c || {}).filter(function (k) { return o.c[k]; }).length + Object.keys(o.p || {}).filter(function (k) { return o.p[k]; }).length + ['tt', 'tx', 'mt', 'mb', 'gap', 'cols', 'rows'].filter(function (k) { return o[k]; }).length; }
  function itemRoot(d, it) {
    if (it.family) return d.querySelector('[data-ed-sid="' + it.id + '"]');
    var fx = FIXEL[it.id]; if (fx) return d.querySelector(fx.root) || (fx.alt && d.querySelector(fx.alt)) || null;
    return d.querySelector('[data-ed-sid="' + it.id + '"]'); /* sezioni lette dalla pagina (scanStructure) */
  }
  function stepOfTitle(el) {
    for (var i = 0; i < el.classList.length; i++) { var m = /^size-(.+)$/.exec(el.classList[i]); if (m && SCALE.indexOf(m[1]) >= 0) return m[1]; }
    for (i = 0; i < el.classList.length; i++) if (LEGACY_STEP[el.classList[i]]) return LEGACY_STEP[el.classList[i]];
    return HEAD_STEP[el.tagName.toLowerCase()] || 'm';
  }
  function setCls(el, prefix, val) { Array.prototype.slice.call(el.classList).forEach(function (c) { if (c.indexOf(prefix) === 0) el.classList.remove(c); }); if (val) el.classList.add(prefix + val); }
  function toneEl(el, tone) { /* data-tone del tema; «Nessun colore» e colori personalizzati = --tone/--on inline (stessa logica di setPreviewTone, ma su un solo elemento) */
    if (el._t0 === undefined) el._t0 = el.getAttribute('data-tone');
    var custom = tone !== NONE && tone && tone.charAt(0) === '#';
    if (tone === NONE) { el.setAttribute('data-tone', 'none'); el.style.removeProperty('--tone'); el.style.removeProperty('--on'); return; }
    if (!tone) { if (el._t0 === null) el.removeAttribute('data-tone'); else el.setAttribute('data-tone', el._t0); el.style.removeProperty('--tone'); el.style.removeProperty('--on'); return; }
    if (custom) { if (el._t0 !== null) el.setAttribute('data-tone', el._t0); el.style.setProperty('--tone', tone); el.style.setProperty('--on', onFor(tone)); }
    else { el.setAttribute('data-tone', tone); el.style.removeProperty('--tone'); el.style.removeProperty('--on'); }
  }
  /* Abbinamenti colore (stessa formula del tema, theme-manifest.ts → shadeFor): per i colori PERSONALIZZATI si calcolano qui; per i toni del tema le opzioni sono nel manifest (`pairs`). */
  var PAIR_LABEL = { chiaro: 'Chiaro', scuro: 'Scuro', invert: 'Invertito' };
  function oLin(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function oGam(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
  function toOk(hex) {
    var r = oLin(parseInt(hex.substr(1, 2), 16) / 255), g = oLin(parseInt(hex.substr(3, 2), 16) / 255), b = oLin(parseInt(hex.substr(5, 2), 16) / 255);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, Math.hypot(A, B), Math.atan2(B, A)];
  }
  function fromOk(L, C, h) {
    var A = C * Math.cos(h), B = C * Math.sin(h), l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3), m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3), s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
    var rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
    if (rgb.some(function (v) { return v < -0.0005 || v > 1.0005; })) return null;
    return '#' + rgb.map(function (v) { var x = Math.round(Math.min(1, Math.max(0, oGam(Math.min(1, Math.max(0, v))))) * 255).toString(16); return x.length < 2 ? '0' + x : x; }).join('');
  }
  function shadeJs(bg, dir) { /* testo della stessa tinta, piu' chiaro (up) o scuro (down), il piu' vicino allo sfondo che arriva a 4,5:1; null = non esiste */
    var k = toOk(bg), L = k[0], C = k[1], h = k[2];
    function at(l) { var c = C; for (var i = 0; i < 40; i++) { var x = fromOk(l, c, h); if (x) return x; c *= 0.9; } return fromOk(l, 0, h); }
    var end = dir === 'up' ? 1 : 0; if (contrast(at(end), bg) < 4.5) return null;
    var lo = L, hi = end; for (var j = 0; j < 28; j++) { var mid = (lo + hi) / 2; if (contrast(at(mid), bg) >= 4.5) hi = mid; else lo = mid; }
    return at(hi);
  }
  function baseOnHex(hex) { var i = hexOf('ink'), p = hexOf('paper'); return contrast(hex, i) >= contrast(hex, p) ? i : p; }
  function pairsFor(tone) { /* opzioni di abbinamento disponibili per un tono del tema o per un colore personalizzato */
    if (!tone || tone === NONE) return [];
    if (tone.charAt(0) !== '#') return (manifestOf().pairs || {})[tone] || [];
    var out = [], base = baseOnHex(tone);
    [['chiaro', 'up'], ['scuro', 'down']].forEach(function (x) { var c = shadeJs(tone, x[1]); if (c && c.toLowerCase() !== base.toLowerCase()) out.push(x[0]); });
    if (contrast(tone, base) >= 4.5) out.push('invert'); return out;
  }
  function applyPair(el, tone, pair) { /* tono del tema: data-pair (CSS del tema); colore personalizzato: variabili inline */
    el.removeAttribute('data-pair'); if (!pair || !tone || tone === NONE || pairsFor(tone).indexOf(pair) < 0) return;
    if (tone.charAt(0) === '#') { if (pair === 'invert') { el.style.setProperty('--tone', baseOnHex(tone)); el.style.setProperty('--on', tone); } else { var c = shadeJs(tone, pair === 'chiaro' ? 'up' : 'down'); if (c) el.style.setProperty('--on', c); } }
    else el.setAttribute('data-pair', pair);
  }
  function slotEls(it, root, kind, id) {
    var fx = FIXEL[it.id];
    if (kind === 'color') return it.family ? qa(root, '[data-slot="' + id + '"]').slice(0, 1) : (fx && fx.colorSel ? qa(root, fx.colorSel).slice(0, 1) : [root]);
    if (kind === 'title') return it.family ? qa(root, '[data-slot="title"],[data-slot="title-sub"]') : (fx && fx.title ? qa(root, fx.title).slice(0, fx.all ? undefined : 1) : []);
    if (kind === 'text') return it.family ? qa(root, '[data-slot="text"]') : (fx && fx.text ? qa(root, fx.text).slice(0, fx.all ? undefined : 1) : []);
    return [];
  }
  /* 10/11/2026 (Ruggi): IMMAGINI delle sezioni aggiunte (galleria, doppie, immagine, colonne, percorso...): una per ogni segnaposto editoriale della variante (it.imgs[i], data URL ridimensionato). Immagini prodotto (griglia, Prodotti in evidenza, «Immagini e descrizione», segnaposto «object») non si toccano. */
  /* 11/11/2026 (Ruggi): GALLERIA unificata, una sola famiglia organizzata per tipo (griglia, mosaico, colonna singola, carosello). it.g = { n: numero immagini (2-12), cols: immagini per riga (solo griglia: 2, 3, 4), cap: false = didascalie spente }. Le figure si rigenerano da qui (gli scostamenti di testo e immagini restano per posizione). */
  var GAL_MAX = 12, GAL_MIN = 2, GAL_DEF = { griglia: 4, mosaico: 3, 'colonna singola': 3, carosello: 4 };
  /* 11/11/2026 (Ruggi): nuove famiglie con elementi generati (Persone e citazioni, Elenco articoli, Elenchi a filetti, Fascia scorrevole): it.g = {n, img, quote, scroll, cols, move}. Gli elementi si clonano dal primo del campione (stessi slot e classi del tema); immagine/citazione si accendono e spengono con classi (il testo resta in posizione). */
  var GEN = {
    persone: { title: 'Persone', ctl: function (k) { return k === 'strip' ? [{ key: 'n', label: 'Numero di persone', type: 'num', min: 2, max: 12, def: 5 }, { key: 'img', label: 'Immagine', type: 'bool', on: 'Mostra', off: 'Nascondi', def: true }, { key: 'quote', label: 'Citazione', type: 'bool', on: 'Mostra', off: 'Nascondi', def: false }, { key: 'scroll', label: 'Scorrimento', type: 'bool', on: 'Acceso', off: 'Spento', def: true }, { key: 'cols', label: 'Persone per riga', type: 'list', values: [2, 3, 4], def: 4, show: function (it) { return genV(it, 'scroll') === false; } }] : [{ key: 'n', label: 'Numero di testimonial', type: 'num', min: 1, max: 12, def: 1 }, { key: 'cols', label: 'Testimonial per riga', type: 'list', values: [1, 2, 3], def: 1 }, { key: 'img', label: 'Immagine', type: 'bool', on: 'Mostra', off: 'Nascondi', def: true }]; } },
    tecnica: { title: 'Righe', custom: true, ctl: function () { return [{ key: 'n', label: 'Numero di righe', type: 'num', min: 1, max: 12, def: 4 }]; } }, /* 10/11/2026 (Ruggi): righe info+valore o solo testo, controlli sempre visibili (buildTecnica) */
    editoriale: { title: 'Dati', ctl: function () { return [{ key: 'n', label: 'Numero di righe dati', type: 'num', min: 1, max: 8, def: 4 }]; } },
    elenchi: { title: 'Elenco', ctl: function () { return [{ key: 'n', label: 'Numero di voci', type: 'num', min: 1, max: 12, def: 3 }, { key: 'meta', label: 'Dettaglio', type: 'bool', on: 'Mostra', off: 'Nascondi', def: false }, { key: 'cols', label: 'Colonne', type: 'list', values: [1, 2], def: 1 }]; } },
    fascia: { title: 'Fascia', ctl: function (k) { var sp = { key: 'speed', label: 'Velocità', type: 'choice', values: ['Lenta', 'Normale', 'Veloce'], def: 'Normale' }; return k === 'loghi' ? [{ key: 'move', label: 'Scorrimento nel sito', type: 'bool', on: 'Acceso', off: 'Spento', def: true }, sp] : [sp]; } }
  };
  var GEN_TONES = ['giallo', 'rosa', 'verde', 'azzurro', 'giallo'];
  function genV(it, key) { var cfg = GEN[it.family], c = cfg && cfg.ctl(galKind(it)).filter(function (x) { return x.key === key; })[0], v = it.g && it.g[key]; return v == null ? (c ? c.def : null) : v; }
  function genSyncDup(root) { /* le copie aria-hidden del marquee e del ticker seguono il testo modificato */
    Array.prototype.forEach.call(root.querySelectorAll('.marquee__track'), function (tr) { var f = tr.querySelector('span:not([aria-hidden])'); if (f) Array.prototype.forEach.call(tr.querySelectorAll('[aria-hidden]'), function (x) { if (x.innerHTML !== f.innerHTML) x.innerHTML = f.innerHTML; }); });
    Array.prototype.forEach.call(root.querySelectorAll('.ticker-track'), function (tr) { var all = Array.prototype.slice.call(tr.children), vis = all.filter(function (c) { return !c.hasAttribute('aria-hidden'); }); all.filter(function (c) { return c.hasAttribute('aria-hidden'); }).forEach(function (x, i) { var sp = vis[i % (vis.length || 1)]; if (sp && x.innerHTML !== sp.innerHTML) x.innerHTML = sp.innerHTML; }); });
  }
  /* 11/11/2026 (Ruggi): FASCIA. Frase = un solo testo scritto una volta (le copie per lo scorrimento si rigenerano da lui). Loghi = immagini caricate (fino a 12, ordinabili e eliminabili dall'accordion «Loghi»). Nell'anteprima principale la fascia resta ferma (solo il primo giro, a capo se serve); velocità e scorrimento valgono per il sito. */
  var FASCIA_SPEED = { Lenta: '48s', Normale: '28s', Veloce: '16s' }, LOGO_MAX = 12;
  function applyFascia(d, it, root, kind) {
    if (!d.getElementById('ed-fascia-style')) { var st = d.createElement('style'); st.id = 'ed-fascia-style'; st.textContent = '[data-ed-added] .marquee__track,[data-ed-added] .ticker-track{animation:none!important;transform:none!important}[data-ed-added] .marquee__track{width:100%;white-space:normal}[data-ed-added] .marquee__track>[aria-hidden],[data-ed-added] .ticker-track>[aria-hidden]{display:none!important}[data-ed-added] .ticker-track{width:100%;flex-wrap:wrap}'; d.head.appendChild(st); }
    root.style.setProperty('--marquee-speed', FASCIA_SPEED[genV(it, 'speed')] || '28s');
    root.classList.toggle('static', kind === 'loghi' && genV(it, 'move') === false);
    if (kind !== 'loghi') return;
    var tr = root.querySelector('.ticker-track'); if (!tr) return;
    var imgs = (it.imgs || []).filter(Boolean), nm = it.imgNames || [], sig = imgs.length ? 'i' + imgs.map(function (x) { return x.length + ':' + x.slice(-24); }).join(',') : 't';
    if (root._fsig === sig) return; root._fsig = sig; tr.innerHTML = '';
    if (imgs.length) imgs.forEach(function (src, i) { var sp = d.createElement('span'), im = d.createElement('img'); im.src = src; im.alt = ((it.imgAlts || [])[i] || '').trim() || autoAlt('Logo', i, nm[i]); im.style.objectFit = 'contain'; im.style.objectPosition = '50% 50%'; sp.appendChild(im); tr.appendChild(sp); });
    else for (var k = 0; k < 4; k++) { var s2 = d.createElement('span'); s2.textContent = 'Nome partner'; tr.appendChild(s2); }
  }
  /* 10/11/2026 (Ruggi): SCHEDA TECNICA. Numero di righe e, per ogni riga, «Info + valore» oppure «Solo testo». it.g.n = numero righe, it.g.rows[i] = 'text' | undefined (info + valore). Le righe gia' presenti si tengono (i testi scritti non si perdono): si aggiungono/tolgono in coda e si cambia solo la modalita'. */
  var TEC_DEF = [['Materiale', '[MATERIALE]'], ['Dimensioni', '[DIMENSIONI]'], ['Categoria', '[CATEGORIA]'], ['Disponibilità', '[DISPONIBILITÀ]']], TEC_MAX = 12;
  function tecRows(it) { it.g = it.g || {}; var n = genV(it, 'n'); it.g.rows = (it.g.rows || []).slice(0, TEC_MAX); while (it.g.rows.length < n) it.g.rows.push(null); return it.g.rows; }
  function applyTecnica(d, it, root) {
    var dl = root.querySelector('dl.spec'); if (!dl) return;
    if (!d.getElementById('ed-tec-style')) { var st = d.createElement('style'); st.id = 'ed-tec-style'; st.textContent = '.spec-row.is-text{display:block}.spec-row.is-text dt{display:none}.spec-row.is-text dd{text-align:left}'; d.head.appendChild(st); }
    var n = genV(it, 'n'), rows = tecRows(it), cur = Array.prototype.slice.call(dl.querySelectorAll('.spec-row'));
    if (!dl._proto && cur[0]) dl._proto = cur[0].cloneNode(true);
    if (!dl._proto) return;
    while (cur.length > n) { var x = cur.pop(); x.parentNode.removeChild(x); }
    while (cur.length < n) { var i = cur.length, c = dl._proto.cloneNode(true); c.classList.remove('is-text'); var dt = c.querySelector('dt'), dd = c.querySelector('dd'); if (dt) dt.textContent = (TEC_DEF[i] || ['Voce ' + (i + 1)])[0]; if (dd) dd.textContent = (TEC_DEF[i] || [0, '[VALORE]'])[1]; dl.appendChild(c); cur.push(c); }
    cur.forEach(function (r, i) { r.classList.toggle('is-text', rows[i] === 'text'); });
  }
  function buildTecnica(host, it, onApply) {
    var box = document.createElement('div'); box.className = 'editor-ev editor-tec'; host.appendChild(box);
    function paint() {
      box.innerHTML = ''; allSelects = allSelects.filter(function (x) { return x.el.isConnected; });
      var n = genV(it, 'n'), rows = tecRows(it);
      var nr = document.createElement('div'); nr.className = 'editor-ev-numrow';
      var nl = document.createElement('div'); nl.className = 'panel-accordion-header-label editor-ctl-title'; nl.textContent = 'Numero di righe'; nr.appendChild(nl);
      var opts = []; for (var k = 1; k <= TEC_MAX; k++) opts.push(String(k));
      var ns = makeSelect('Numero di righe', opts, String(n), function (v) { it.g.n = +v; tecRows(it); onApply(); paint(); }); ns.el.classList.add('editor-ev-num'); nr.appendChild(ns.el); box.appendChild(nr);
      var ol = document.createElement('ol'); ol.className = 'editor-ev-list'; box.appendChild(ol);
      for (var i = 0; i < n; i++) (function (i) {
        var li = document.createElement('li'); li.className = 'editor-ev-row';
        var num = document.createElement('span'); num.className = 'editor-ev-num-label'; num.textContent = (i + 1) + '.'; li.appendChild(num);
        var sl = makeSelect('Riga ' + (i + 1), ['Info + valore', 'Solo testo'], rows[i] === 'text' ? 'Solo testo' : 'Info + valore', function (v) { it.g.rows[i] = v === 'Solo testo' ? 'text' : null; onApply(); });
        sl.el.style.flex = '1 1 auto'; li.appendChild(sl.el); ol.appendChild(li);
      })(i);
    }
    paint();
  }
  function applyGen(d, it) {
    var cfg = it && GEN[it.family]; if (!cfg || !d) return; var root = itemRoot(d, it); if (!root) return;
    var kind = galKind(it), conts = root.hasAttribute('data-gen') ? [root] : Array.prototype.slice.call(root.querySelectorAll('[data-gen]')), cont = conts[0], hasN = cfg.ctl(kind).some(function (c) { return c.key === 'n'; });
    if (cont && hasN) {
      var n = genV(it, 'n'), sig = kind + '|' + n;
      if (root._gsig !== sig) {
        root._gsig = sig;
        conts.forEach(function (cont) {
        if (!cont._proto) { var pr = Array.prototype.filter.call(cont.children, function (c) { return !c.hasAttribute('aria-hidden'); })[0]; cont._proto = pr && pr.cloneNode(true); }
        if (cont._proto) {
          cont.innerHTML = '';
          for (var i = 0; i < n; i++) { var c1 = cont._proto.cloneNode(true); if (it.family === 'persone') c1.setAttribute('data-tone', GEN_TONES[i % GEN_TONES.length]); cont.appendChild(c1); }
          if (it.family === 'fascia') for (i = 0; i < n; i++) { var c2 = cont._proto.cloneNode(true); c2.setAttribute('aria-hidden', 'true'); cont.appendChild(c2); }
        }
        });
      }
    }
    if (it.family === 'persone') {
      if (kind === 'strip') {
        var sc = genV(it, 'scroll') !== false; root.classList.toggle('portrait-strip', sc); root.classList.toggle('people-grid', !sc);
        root.classList.remove('cols-2', 'cols-3', 'cols-4'); if (!sc && genV(it, 'cols') !== 4) root.classList.add('cols-' + genV(it, 'cols'));
        root.classList.toggle('pers-noimg', !genV(it, 'img')); root.classList.toggle('pers-noquote', !genV(it, 'quote'));
      } else { Array.prototype.forEach.call(root.querySelectorAll('.testimonial'), function (q) { q.classList.toggle('no-img', !genV(it, 'img')); }); root.classList.remove('tg-2', 'tg-3'); if (genV(it, 'cols') > 1) root.classList.add('tg-' + genV(it, 'cols')); }
    }
    if (it.family === 'elenchi' && cont) { cont.classList.toggle('two', genV(it, 'cols') === 2); cont.classList.toggle('list-nometa', !genV(it, 'meta')); }
    if (it.family === 'fascia') applyFascia(d, it, root, kind);
    if (it.family === 'tecnica') applyTecnica(d, it, root);
    genSyncDup(root);
  }
  function galKind(it) { var fv = varOf(it); return fv ? fv.v.label : ''; }
  function galN(it) { return (it.g && it.g.n) || GAL_DEF[galKind(it)] || 4; }
  function galFig(i) { return '<figure><div class="placeholder placeholder--editorial shape-' + (i % 4) + '" role="img" aria-label="Immagine"><div class="object" aria-hidden="true"><span></span><span></span><span></span></div></div><figcaption>Didascalia</figcaption></figure>'; }
  function galNav() { var c = function (d) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" aria-hidden="true"><path d="' + d + '"/></svg>'; }; return '<div class="carousel-nav"><button type="button" data-gal="prev" aria-label="Immagine precedente">' + c('M15 5l-7 7 7 7') + '</button><button type="button" data-gal="next" aria-label="Immagine successiva">' + c('M9 5l7 7-7 7') + '</button></div>'; }
  function autoAlt(label, i, name) { /* testo alternativo automatico: nome del file se descrive qualcosa, altrimenti «<sezione> – immagine N» */
    var b = (name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ').trim();
    if (b && /[a-zà-ù]{3,}\s+[a-zà-ù]{3,}/i.test(b) && !/^(img|dsc|pxl|image|foto|screenshot|schermata|whatsapp)\b/i.test(b) && !/\d{4,}/.test(b)) return b.charAt(0).toUpperCase() + b.slice(1);
    return (label || 'Immagine') + ' – immagine ' + (i + 1);
  }
  function imgStore(it) { return (it && it.id === 'immagini' && curProduct) ? curProduct : it; }
  function effAlt(it, i) { var S = imgStore(it); return ((S.imgAlts || [])[i] || '').trim() || autoAlt(it.label, i, (S.imgNames || [])[i]); }
  var PROD_IMG_MAX = 4, PROD_IMG_MIN = 1;
  function galGap(v) { return /^(none|xs|s|m|l|xl)$/.test(v || '') ? 'var(--gutter-' + v + ')' : ''; } /* spazio tra le immagini (orizzontale/verticale): scala gutter del tema, come «Spazio tra gli elementi» */
  function applyGallery(d, it) {
    if (!d || !it || it.family !== 'galleria') return; var root = itemRoot(d, it); if (!root) return;
    var kind = galKind(it), n = galN(it), g = it.g || {}, cols = kind === 'griglia' ? (g.cols || 2) : 2, sig = kind + '|' + n;
    var GG = galGap(g.gx), GY = galGap(g.gy); if (GG) root.style.setProperty('--gal-gap-x', GG); else root.style.removeProperty('--gal-gap-x'); if (GY) root.style.setProperty('--gal-gap-y', GY); else root.style.removeProperty('--gal-gap-y'); /* spazio laterale e verticale tra le immagini, tutte le varianti */
    root.classList.toggle('no-cap', g.cap === false); root.classList.toggle('cols-3', cols === 3); root.classList.toggle('cols-4', cols === 4);
    if (root._gsig === sig) return; root._gsig = sig;
    var i, h = '';
    if (kind === 'mosaico') { /* blocchi da 3 (grande + due piccole), alternati e specchiati; avanzo: 1 = a tutta larghezza, 2 = due uguali */
      for (i = 0; i < n; i += 3) { var k = Math.min(3, n - i), cls = k === 3 ? ((i / 3) % 2 ? ' is-flip' : '') : ' is-' + k; h += '<div class="mosaic-block' + cls + '">'; for (var j = 0; j < k; j++) h += galFig(i + j); h += '</div>'; }
    } else if (kind === 'carosello') { h = '<div class="carousel-track">'; for (i = 0; i < n; i++) h += galFig(i); h += '</div>' + galNav(); }
    else for (i = 0; i < n; i++) h += galFig(i);
    root.innerHTML = h;
  }
  function applyProductImgs(d) { /* «Immagini e descrizione» del prodotto: le immagini sono quelle del prodotto (max 4); se mancano resta il campione del tema */
    var g = d && d.querySelector('[data-component="C12"]'); if (!g || !curProduct) return;
    var imgs = (curProduct.imgs || []).filter(Boolean).slice(0, PROD_IMG_MAX), n = imgs.length, it0 = { id: 'immagini', label: 'Immagini e descrizione' };
    var main = g.querySelector('.gallery-main > .placeholder'), tw = g.querySelector('.gallery-thumbs'), ctr = g.querySelector('.gallery-controls'), ind = g.querySelector('.gallery-indicator');
    function paint(ph, src, alt) { if (!ph) return; var ob = ph.querySelector('.object,.portrait'); if (src) { ph.style.backgroundImage = 'url("' + src + '")'; ph.style.backgroundSize = 'cover'; ph.style.backgroundPosition = '50% 50%'; ph.style.backgroundRepeat = 'no-repeat'; ph.setAttribute('aria-label', alt); if (ob) ob.style.display = 'none'; } else { ph.style.backgroundImage = ph.style.backgroundSize = ph.style.backgroundPosition = ph.style.backgroundRepeat = ''; if (ob) ob.style.display = ''; } }
    paint(main, imgs[0], n ? effAlt(it0, 0) : '');
    if (tw) {
      var bs = tw.querySelectorAll('button[data-gallery-index]');
      while (n && bs.length && bs.length < n) { var cl = bs[bs.length - 1].cloneNode(true); cl.setAttribute('data-gallery-index', String(bs.length)); cl.setAttribute('aria-pressed', 'false'); tw.appendChild(cl); bs = tw.querySelectorAll('button[data-gallery-index]'); }
      Array.prototype.forEach.call(bs, function (b, i) { b.style.display = (n && i >= n) ? 'none' : ''; var ph = b.querySelector('.placeholder'); paint(ph, imgs[i], n ? effAlt(it0, i) : ''); if (n && imgs[i]) b.setAttribute('aria-label', effAlt(it0, i)); });
    }
    var show = n === 0 ? '' : (n > 1 ? '' : 'none'); if (tw) tw.style.display = show; if (ctr) ctr.style.display = show; if (ind) ind.style.display = show;
  }
  function imgCount(it) { if (it && it.id === 'immagini' && curPage === 'prodotto') return curProduct ? PROD_IMG_MAX : 0; if (!it || !it.family) return 0; var fv = varOf(it); if (!fv) return 0; if (it.family === 'galleria') return galN(it); if (it.family === 'persone') return genV(it, 'img') ? genV(it, 'n') : 0; if (it.family === 'fascia') return galKind(it) === 'loghi' ? LOGO_MAX : 0; return (specHtml(fv.f, it.variant).match(/placeholder--(editorial|portrait)/g) || []).length; }
  /* ---- 10/11/2026 (Ruggi): immagini mancanti alla pubblicazione — la pubblicazione resta attiva, ma si apre un avviso con pagina e sezione; si puo' pubblicare comunque ---- */
  function needImg(it) { if (!it || !it.family) return 0; if (it.family === 'galleria') return GAL_MIN; if (it.family === 'fascia') return galKind(it) === 'loghi' ? 1 : 0; return imgCount(it); }
  function pageNameOf(page, pr) { return page === 'bottega' ? 'Home' : page === 'prodotto' ? 'Prodotto' + (pr ? ' «' + pr.name + '»' : '') : page === 'catalogo' ? 'Catalogo' : page === 'drop' ? 'Drop' : page; }
  function missingImages(onlyProductId) { /* [{page, section, detail}] */
    var out = [];
    Object.keys(STRUCT_STORE).forEach(function (k) {
      var parts = k.split('|'), page = parts[0], pid = parts[1] || '', pr = pid ? PRODUCTS.filter(function (x) { return x.id === pid; })[0] : null;
      if (onlyProductId && pid !== onlyProductId) return;
      (STRUCT_STORE[k] || []).forEach(function (it) {
        if (!it.family) return; var need = needImg(it), have = (it.imgs || []).filter(Boolean).length;
        if (need > have) out.push({ page: pageNameOf(page, pr), section: it.label || 'Sezione', detail: have ? (need - have === 1 ? 'manca 1 immagine' : 'mancano ' + (need - have) + ' immagini') : (need === 1 ? 'manca l’immagine' : 'nessuna immagine') });
      });
    });
    PRODUCTS.forEach(function (pr) { /* «Immagini e descrizione»: le immagini sono quelle del prodotto; se non sono mai state tolte si considerano presenti */
      if (onlyProductId ? pr.id !== onlyProductId : pr.status !== 'pubblicato') return;
      if (Array.isArray(pr.imgs) && pr.imgs.filter(Boolean).length < PROD_IMG_MIN) out.push({ page: pageNameOf('prodotto', pr), section: 'Immagini e descrizione', detail: 'nessuna immagine' });
    });
    return out;
  }
  function askMissingImages(list, onGo, goLabel) {
    if (!list.length) { onGo(); return; }
    var m = document.createElement('div'); m.className = 'editor-modal';
    m.innerHTML = '<div class="editor-modal-backdrop" data-close></div><div class="editor-modal-box editor-pubimg" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="pubImgTitle"><div class="editor-modal-head"><h2 class="card-title title-lg" id="pubImgTitle">Mancano delle immagini</h2><button type="button" class="panel-close-btn editor-modal-close" data-close data-tooltip="Chiudi" aria-label="Chiudi">' + IMG_X + '</button></div>' +
      '<div class="editor-modal-body"><div class="editor-modal-view"><p class="editor-modal-desc">Queste sezioni prevedono delle immagini che non hai inserito. Puoi pubblicare comunque: al loro posto resterà un riquadro vuoto.</p><ul class="editor-pubimg-list"></ul></div></div>' +
      '<div class="editor-modal-foot"><button type="button" class="btn-ghost" data-close>Torna all’editor</button><button type="button" class="btn-pill-dark primary" data-go>' + (goLabel || 'Pubblica comunque') + '</button></div></div>';
    var ul = m.querySelector('.editor-pubimg-list'); list.forEach(function (x) { var li = document.createElement('li'); li.innerHTML = '<span class="editor-pubimg-where"></span><span class="editor-pubimg-what"></span>'; li.firstChild.textContent = x.page + ' · ' + x.section; li.lastChild.textContent = x.detail; ul.appendChild(li); });
    var opener = document.activeElement;
    function close() { document.removeEventListener('keydown', key, true); m.remove(); bannerWait = false; renderSetupBanner(); if (opener && opener.focus) opener.focus(); }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (e.key === 'Tab') { var f = Array.prototype.filter.call(m.querySelectorAll('button'), function (b) { return !b.disabled; }), i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } }
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); else if (e.target.closest('[data-go]')) { close(); onGo(); } });
    document.addEventListener('keydown', key, true); document.body.appendChild(m); m.querySelector('[data-go]').focus();
  }
  function applyImgs(d, it) {
    if (it && it.id === 'immagini') { applyProductImgs(d); return; }
    if (!d || !it || !it.family) return; applyGallery(d, it); applyGen(d, it); var root = itemRoot(d, it); if (!root) return;
    var phs = root.querySelectorAll('.placeholder--editorial,.placeholder--portrait');
    Array.prototype.forEach.call(phs, function (ph, i) {
      var src = it.imgs && it.imgs[i], ob = ph.querySelector('.object,.portrait');
      if (src) { ph.style.backgroundImage = 'url("' + src + '")'; ph.style.backgroundSize = 'cover'; ph.style.backgroundPosition = '50% 50%'; ph.style.backgroundRepeat = 'no-repeat'; ph.setAttribute('aria-label', effAlt(it, i)); if (ob) ob.style.display = 'none'; }
      else { ph.style.backgroundImage = ph.style.backgroundSize = ph.style.backgroundPosition = ''; if (ob) ob.style.display = ''; }
    });
  }
  /* ---- 10/11/2026 (Ruggi): immagini delle sezioni — messaggi a scala (max 2, il nuovo sopra) e anteprima ingrandita ---- */
  var IMG_STAGE = {}, imgLbPaint = null, imgToasts = [], imgToastBox = null;
  var IMG_SVG = function (p, s) { return '<svg width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var IMG_X = IMG_SVG('<path d="M6 6l12 12M18 6L6 18"/>');
  function imgToast(msg, undo) {
    if (!imgToastBox) { imgToastBox = document.createElement('div'); imgToastBox.className = 'editor-toasts'; imgToastBox.setAttribute('role', 'status'); imgToastBox.setAttribute('aria-live', 'polite'); document.body.appendChild(imgToastBox); }
    var el = document.createElement('div'), t = { el: el, timer: 0 }; el.className = 'editor-toast';
    var sp = document.createElement('span'); sp.className = 'editor-toast-text'; sp.textContent = msg; el.appendChild(sp);
    t.kill = function (fast) { clearTimeout(t.timer); var k = imgToasts.indexOf(t); if (k < 0) return; imgToasts.splice(k, 1); el.classList.add('is-out'); setTimeout(function () { el.remove(); }, fast ? 90 : 200); };
    function arm(ms) { clearTimeout(t.timer); t.timer = setTimeout(function () { t.kill(false); }, ms); }
    if (undo) { var b = document.createElement('button'); b.type = 'button'; b.className = 'editor-toast-undo'; b.textContent = 'Annulla'; b.addEventListener('click', function () { t.kill(true); undo(); }); el.appendChild(b); }
    el.addEventListener('mouseenter', function () { clearTimeout(t.timer); }); el.addEventListener('mouseleave', function () { arm(2000); });
    el.addEventListener('focusin', function () { clearTimeout(t.timer); }); el.addEventListener('focusout', function () { arm(2000); });
    imgToastBox.insertBefore(el, imgToastBox.firstChild); imgToasts.unshift(t);
    while (imgToasts.length > 2) imgToasts[imgToasts.length - 1].kill(true); /* mai una scala di tre: il piu' vecchio se ne va subito */
    arm(5000);
  }
  function openImgLb(getList, removeAt, start, setAlt, onClose) { /* anteprima ingrandita al centro: chevron, conteggio, elimina */
    if (document.querySelector('.editor-lb')) return;
    var idx = start, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, root = document.createElement('div'); root.className = 'editor-lb';
    root.innerHTML = '<div class="editor-modal-backdrop" data-close></div><div class="editor-modal-box editor-lb-box" role="dialog" aria-modal="true" aria-labelledby="editorLbTitle" tabindex="-1">' +
      '<div class="editor-modal-head"><h2 class="card-title title-lg" id="editorLbTitle">Galleria</h2><button type="button" class="panel-close-btn editor-modal-close" data-close data-tooltip="Chiudi" aria-label="Chiudi">' + IMG_X + '</button></div>' +
      '<div class="editor-modal-body"><div class="editor-lb-stage"><button type="button" class="editor-lb-nav is-prev" aria-label="Immagine precedente">' + IMG_SVG('<path d="M15 5l-7 7 7 7"/>', 20) + '</button><img class="editor-lb-img" alt=""><button type="button" class="editor-lb-nav is-next" aria-label="Immagine successiva">' + IMG_SVG('<path d="M9 5l7 7-7 7"/>', 20) + '</button></div>' +
      '<div class="editor-lb-alt"><div class="editor-lb-alt-head"><label class="panel-field-label" for="editorLbAlt">Testo alternativo</label><span class="editor-tone-info" tabindex="0" role="img" aria-label="Descrivi cosa si vede per migliorare l’accessibilità" data-tooltip="Descrivi cosa si vede per migliorare l’accessibilità"></span></div><input class="bottega-input" id="editorLbAlt" type="text" autocomplete="off"></div></div>' +
      '<div class="editor-modal-foot editor-lb-foot"><span class="editor-lb-name"></span><span class="editor-sr editor-lb-count" aria-live="polite"></span><button type="button" class="btn-ghost danger editor-lb-del">Elimina immagine</button></div></div>';
    var box = root.querySelector('.editor-lb-box'), im = root.querySelector('.editor-lb-img'), altIn = root.querySelector('#editorLbAlt'), prev = root.querySelector('.is-prev'), next = root.querySelector('.is-next'), del = root.querySelector('.editor-lb-del');
    function close() { document.removeEventListener('keydown', onKey, true); root.remove(); if (imgLbPaint === paint) imgLbPaint = null; if (onClose) onClose(idx); }
    function paint() {
      var l = getList(); if (!l.length) { close(); return; } if (idx >= l.length) idx = l.length - 1; if (idx < 0) idx = 0;
      var x = l[idx]; altIn.value = x.alt || ''; altIn.placeholder = x.auto || ''; im.src = x.src; im.alt = x.name || ('Immagine ' + (idx + 1)); root.querySelector('.editor-lb-count').textContent = (idx + 1) + ' di ' + l.length;
      prev.hidden = next.hidden = l.length < 2; prev.disabled = idx === 0; next.disabled = idx === l.length - 1;
      var a = document.activeElement; if (!a || a === document.body || a.disabled || a.hidden) box.focus();
    }
    altIn.addEventListener('input', function () { if (setAlt) setAlt(idx, altIn.value); });
    function go(k) { var l = getList(); if (k < 0 || k >= l.length) return; idx = k; paint(); }
    function onKey(e) {
      if (!root.isConnected) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.target && e.target.tagName === 'INPUT' && /^Arrow/.test(e.key)) { /* si sta scrivendo */ }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
      else if (e.key === 'Tab') { var f = Array.prototype.filter.call(root.querySelectorAll('button, input'), function (b) { return !b.disabled && !b.hidden; }); if (!f.length) { e.preventDefault(); return; } var i = f.indexOf(document.activeElement); if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    }
    root.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); });
    prev.addEventListener('click', function () { go(idx - 1); }); next.addEventListener('click', function () { go(idx + 1); });
    del.addEventListener('click', function () { var k = idx; if (reduce) { removeAt(k); return; } im.classList.add('is-out'); setTimeout(function () { removeAt(k); im.classList.remove('is-out'); }, 180); });
    document.addEventListener('keydown', onKey, true); document.body.appendChild(root); imgLbPaint = paint; paint(); box.focus();
  }
  function readImage(file, cb) { /* ridimensiona (lato lungo max 1600px) e comprime: il wireframe tiene tutto in memoria */
    var rd = new FileReader(); rd.onload = function () {
      var im = new Image(); im.onload = function () {
        var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', 0.85));
      }; im.onerror = function () { cb(rd.result); }; im.src = rd.result;
    }; rd.readAsDataURL(file);
  }
  function applyOv(d, it) { /* scostamenti della voce -> DOM dell'anteprima */
    applyImgs(d, it);
    var root = itemRoot(d, it); if (!root) return; var o = it.ov, s = slotsOf(it); if (!o || !s) return;
    var fx = FIXEL[it.id], mEl = (fx && fx.mEl && d.querySelector(fx.mEl)) || root;
    setCls(mEl, 'sp-mt-', o.mt || null); setCls(mEl, 'sp-mb-', o.mb || null);
    if (s.gap) setCls(root, 'sp-g-', o.gap || null);
    if (s.columns || s.rows) { /* 7/11/2026 (Ruggi): prodotti per riga (desktop) e righe prima di «Carica altri» */
      var gridEl = root.classList && root.classList.contains('product-grid') ? root : root.querySelector('.product-grid');
      if (gridEl) {
        setCls(gridEl, 'ed-cols-', o.cols || null);
        var cards = Array.prototype.slice.call(gridEl.querySelectorAll('.product-card')), nc = o.cols || (s.columns && s.columns.default) || 4, lim = null;
        if (s.rows) { if (o.rows) lim = o.rows === 'all' ? Infinity : o.rows * nc; else if (o.cols) lim = (s.rows.default || 2) * nc; } /* cambiando le colonne senza scegliere le righe si tengono le righe del tema: l'ultima riga resta piena */
        cards.forEach(function (c, i) {
          if (c._x0 === undefined) c._x0 = c.hasAttribute('data-extra');
          var hide = lim === null ? c._x0 : i >= lim; c.hidden = hide;
          if (hide) c.setAttribute('data-extra', ''); else { c.removeAttribute('data-extra'); c.classList.add('is-in'); }
        });
        var lm = root.querySelector('[data-action="load-more"]'); if (lm) lm.hidden = !cards.some(function (c) { return c.hidden; });
      }
    }
    (s.colors || []).forEach(function (c) {
      slotEls(it, root, 'color', c.id).forEach(function (el) {
        var t = null; if (it.id !== 'identita') { t = o.c && o.c[c.id] || null; toneEl(el, t); }
        applyPair(el, t || (it.id === 'identita' ? heroTone() : (el._t0 !== undefined ? el._t0 : el.getAttribute('data-tone'))), o.p && o.p[c.id]);
      });
    });
    if (s.title) {
      var els = slotEls(it, root, 'title'), d0 = SCALE.indexOf(s.title.default), delta = o.tt ? SCALE.indexOf(o.tt) - d0 : 0;
      els.forEach(function (el) {
        if (el._c0 === undefined) { el._c0 = el.className; el._s0 = stepOfTitle(el); }
        if (!o.tt) { el.className = el._c0; return; }
        setCls(el, 'size-', SCALE[Math.max(0, Math.min(SCALE.length - 1, SCALE.indexOf(el._s0) + delta))]); /* i titoli secondari seguono il principale in proporzione */
      });
    }
    if (s.text) slotEls(it, root, 'text').forEach(function (el) { if (el._tc0 === undefined) el._tc0 = el.className; if (!o.tx) el.className = el._tc0; else setCls(el, 'tsize-', o.tx); });
  }
  function buildSection(d, it) {
    var fv = varOf(it); if (!fv) return null;
    var t = d.createElement('template'); t.innerHTML = specHtml(fv.f, it.variant).split('[NOME PRODOTTO]').join(curProduct ? curProduct.name : 'Nome prodotto');
    var root = t.content.querySelector('[data-slot-root]') || t.content.firstElementChild; if (!root) return null;
    root.setAttribute('data-ed-sid', it.id); return root;
  }
  function syncSections(fr) { /* STRUCT -> anteprima: inserisce le sezioni aggiunte (con i loro scostamenti), toglie quelle non piu' in lista (ripristino) e porta nell'ordine della lista TUTTE le sezioni dentro <main> */
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body || !d.documentElement.hasAttribute('data-host')) return;
    var main = d.querySelector('main'); if (!main) return;
    Array.prototype.slice.call(d.querySelectorAll('[data-ed-added]')).forEach(function (el) { if (idxOf(el.getAttribute('data-ed-sid')) < 0) el.parentNode.removeChild(el); });
    STRUCT.forEach(function (it) {
      if (!it.family || d.querySelector('[data-ed-sid="' + it.id + '"]')) return;
      var el = buildSection(d, it); if (!el) return; el.setAttribute('data-ed-added', ''); ensureOv(it); main.appendChild(el);
      var w = d.createTreeWalker(el, 4, null), n; while ((n = w.nextNode())) if (n.nodeValue.indexOf(NAME_TOKEN) >= 0) (fr._nodes = fr._nodes || []).push({ n: n, tpl: n.nodeValue });
    });
    var seq = [];
    STRUCT.forEach(function (it) {
      var el = itemRoot(d, it); if (!el || el.parentNode !== main) return;
      if (it.id === 'prodotti') { var bi = d.querySelector('.editor-inserter[data-pos="before-prodotti"]'); if (bi && bi.parentNode === main) seq.push(bi); }
      seq.push(el);
    });
    var ai = d.querySelector('.editor-inserter[data-pos="after-prodotti"]'); if (ai && ai.parentNode === main) seq.push(ai);
    var cur = main.firstElementChild;
    seq.forEach(function (el) { if (el === cur) cur = el.nextElementSibling; else main.insertBefore(el, cur); }); /* sposta solo cio' che e' fuori posto */
    STRUCT.forEach(function (it) { if (it.ov) applyOv(d, it); else if (it.imgs || it.family === 'galleria' || GEN[it.family] || it.id === 'immagini') applyImgs(d, it); });
    wireSectionText(fr, d);
    paintFrame(fr); applySel(fr, false);
  }
  /* 10/11/2026 (Ruggi): i testi di ogni sezione si selezionano e si scrivono direttamente nell'anteprima, come in Identita'. Escluse le sezioni «speciali» (navbar, banner drop, identita' che ha il suo cablaggio, prodotti in evidenza, griglie prodotti/catalogo, acquisto, footer) e i pulsanti/link. Testo semplice, niente a capo; la modifica vive nella voce di STRUCT (it.txt, per posizione) e si riapplica se la sezione viene ricostruita. */
  var TXT_SPECIAL = { navbar: 1, 'drop-banner': 1, 'drop-bottom-banner': 1, identita: 1, prodotti: 1, catalogo: 1, 'catalogo-intro': 1, acquisto: 1, recensioni: 1, footer: 1 };
  var TXT_SKIP = 'a:not(.list-row),[aria-hidden="true"],button,summary,nav,svg,label,select,input,textarea,script,style,.editor-inserter,.ed-handle,.product-card,[contenteditable],[data-edit],[data-sample-note],.editor-sample-note';
  /* 10/11/2026 (Ruggi): TESTO FORMATTATO nei box delle sezioni. Si tengono solo grassetto, corsivo, link, elenchi puntati/numerati (con rientro): niente font, colori, dimensioni, maiuscolo (li decide il tema). Vale per l'incolla e per cio' che si salva in it.txt (ora HTML ripulito). */
  function rtEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function rtSafeUrl(u) { /* solo http(s), mailto, tel, ancore e percorsi relativi; senza schema si assume https:// */
    u = (u || '').trim(); if (!u || /\s/.test(u)) return null;
    if (/^(https?:\/\/|mailto:|tel:)/i.test(u) || /^(\/|#|\.\.?\/)/.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
    return /^[^\s.\/]+(\.[^\s.\/]+)+/.test(u) ? 'https://' + u : null;
  }
  function rtClean(html, lists) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    var SKIP = /^(SCRIPT|STYLE|META|LINK|TITLE|HEAD|NOSCRIPT|TEMPLATE|SVG|IFRAME|OBJECT|IMG)$/, BLOCK = /^(P|DIV|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE|HEADER|FOOTER|TABLE|TR|TD|TH|PRE|HR|BR|FIGURE|FIGCAPTION)$/;
    function bold(n) { var w = n.style && n.style.fontWeight; if (w) return w === 'bold' || w === 'bolder' || parseInt(w, 10) >= 600; return /^(B|STRONG)$/.test(n.tagName); } /* Google Docs avvolge tutto in <b style="font-weight:normal">: conta lo stile */
    function ital(n) { var f = n.style && n.style.fontStyle; if (f) return f === 'italic' || f === 'oblique'; return /^(I|EM)$/.test(n.tagName); }
    function kids(n, inLi) { var o = ''; Array.prototype.forEach.call(n.childNodes, function (c) { o += walk(c, inLi); }); return o; }
    function walk(n, inLi) {
      if (n.nodeType === 3) return rtEsc(n.nodeValue);
      if (n.nodeType !== 1 || SKIP.test(n.tagName)) return '';
      var tag = n.tagName, inner;
      if (/^(UL|OL)$/.test(tag)) {
        if (!lists) return ' ' + kids(n, false) + ' ';
        var li = ''; Array.prototype.forEach.call(n.childNodes, function (c) { if (c.nodeType === 1 && c.tagName === 'LI') li += walk(c, true); else if (c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName)) { var sub = walk(c, true); if (/<\/li>$/.test(li)) li = li.slice(0, -5) + sub + '</li>'; else li += '<li>' + sub + '</li>'; } }); /* Chrome (Tab) mette la sotto-lista direttamente nell'elenco: va dentro l'elemento precedente, senza un puntino vuoto */
        li = li.replace(/<li>(\s|<br>)*<\/li>/g, ''); return li.trim() ? '<' + tag.toLowerCase() + ' class="rt-list">' + li + '</' + tag.toLowerCase() + '>' : '';
      }
      if (tag === 'LI') return lists ? '<li>' + kids(n, true) + '</li>' : ' ' + kids(n, false) + ' ';
      if (tag === 'BR') return inLi ? '<br>' : ' ';
      inner = kids(n, inLi);
      if (BLOCK.test(tag)) return ' ' + inner + ' ';
      if (tag === 'A') { var h = rtSafeUrl(n.getAttribute('href')); if (h && inner.trim()) inner = '<a class="rt-link" href="' + rtEsc(h) + '">' + inner + '</a>'; } /* 10/11/2026: i link si aprono nella stessa scheda (nessun target=_blank: niente sorprese per chi usa tastiera o lettore di schermo); sempre sottolineati dal tema (.rt-link) */
      if (inner.trim() && ital(n)) inner = '<em>' + inner + '</em>';
      if (inner.trim() && bold(n)) inner = '<strong>' + inner + '</strong>';
      return inner;
    }
    var out = kids(doc.body, false).replace(/ /g, ' ').replace(/[ \t\r\n]+/g, ' ').replace(/ ?<(\/?)(ul|ol|li)( class="rt-list")?> ?/g, '<$1$2$3>').replace(/<(strong|em)>\s*<\/\1>/g, '');
    return out.trim();
  }
  /* 10/11/2026 — Testo ricco -> blocchi VALIDI per il sito pubblicato.
     Nel testo salvato (rtClean) un paragrafo puo' contenere elenchi: dentro un <p> sono HTML non valido (il browser chiude il <p> prima dell'<ul>).
     Alla pubblicazione si divide in fratelli: il testo prima/dopo l'elenco diventa un <p> (stesso tag e stesse classi dell'elemento del tema, cosi' la tipografia resta quella),
     l'elenco resta <ul>/<ol> con le classi del tema (.rt-list). host = { tag:'p', className:'editorial' }. Se non ci sono elenchi il risultato e' un solo elemento. */
  function rtToBlocks(html, host) {
    host = host || {}; var tag = (host.tag || 'p').toLowerCase(), cls = host.className || '', out = [], run = '';
    var doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
    function flush() { var r = run.trim(); run = ''; if (r) out.push('<' + tag + (cls ? ' class="' + rtEsc(cls) + '"' : '') + '>' + r + '</' + tag + '>'); }
    Array.prototype.forEach.call(doc.body.childNodes, function (n) {
      if (n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName)) { flush(); if (cls) n.setAttribute('class', 'rt-list ' + cls); out.push(n.outerHTML); }
      else run += n.nodeType === 1 ? n.outerHTML : rtEsc(n.nodeValue);
    });
    flush(); return out.join('');
  }
  window.BottegaRich = { clean: rtClean, toBlocks: rtToBlocks }; /* contratto per il rendering finale */
  function richToolbar(fr, d) { /* toolbar flottante sopra il testo che si sta scrivendo (dentro l'iframe, come la maniglia di spostamento) */
    if (d._rtb) return d._rtb; var W = d.defaultView, cur = null, saved = null, T = d.createElement('div');
    T.className = 'ed-rtb'; T.setAttribute('role', 'toolbar'); T.setAttribute('aria-label', 'Formattazione del testo');
    var SV = function (p) { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
    var DEFS = [['bold', 'Grassetto (Ctrl+B)', '<b style="font-weight:800;font-size:15px">B</b>'], ['italic', 'Corsivo (Ctrl+I)', '<i style="font:italic 600 15px Georgia,serif">I</i>'], ['link', 'Link', SV('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>')], ['sep'], ['insertUnorderedList', 'Elenco puntato (Tab per il rientro)', SV('<circle cx="5" cy="7" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="17" r="1.2" fill="currentColor"/><path d="M10 7h10M10 12h10M10 17h10"/>')], ['insertOrderedList', 'Elenco numerato (Tab per il rientro)', SV('<path d="M10 7h10M10 12h10M10 17h10"/><path d="M4 6h1.5v4M4 15.5c.5-.8 2.2-.8 2.2.3 0 1-2.2 1.2-2.2 2.2h2.4" stroke-width="1.4"/>')]];
    var main = d.createElement('div'); main.className = 'ed-rtb-main';
    DEFS.forEach(function (x) { if (x[0] === 'sep') { var sp = d.createElement('span'); sp.className = 'sep'; sp.setAttribute('data-list', ''); main.appendChild(sp); return; } var b = d.createElement('button'); b.type = 'button'; b.setAttribute('data-cmd', x[0]); b.setAttribute('aria-label', x[1]); b.title = x[1]; b.setAttribute('aria-pressed', 'false'); if (/List$/.test(x[0])) b.setAttribute('data-list', ''); b.innerHTML = x[2]; main.appendChild(b); });
    var lk = d.createElement('div'); lk.className = 'ed-rtb-link';
    var inp = d.createElement('input'); inp.type = 'text'; inp.placeholder = 'https://…'; inp.setAttribute('aria-label', 'Indirizzo del link');
    var ok = d.createElement('button'); ok.type = 'button'; ok.setAttribute('data-cmd', 'apply'); ok.textContent = 'Applica';
    var rm = d.createElement('button'); rm.type = 'button'; rm.setAttribute('data-cmd', 'unlink'); rm.textContent = 'Rimuovi';
    var cn = d.createElement('button'); cn.type = 'button'; cn.setAttribute('data-cmd', 'cancel'); cn.setAttribute('aria-label', 'Annulla'); cn.innerHTML = SV('<path d="M6 6l12 12M18 6L6 18"/>');
    var er = d.createElement('span'); er.className = 'ed-rtb-err'; er.hidden = true; er.textContent = 'Indirizzo non valido';
    [inp, ok, rm, cn, er].forEach(function (x) { lk.appendChild(x); }); T.appendChild(main); T.appendChild(lk); d.body.appendChild(T);
    function selRange() { var s = d.getSelection(); return s && s.rangeCount ? s.getRangeAt(0) : null; }
    function anchorAt(r) { var n = r && r.commonAncestorContainer; n = n && (n.nodeType === 1 ? n : n.parentElement); return n && n.closest ? n.closest('a') : null; }
    function position() {
      if (!cur || !T.classList.contains('is-on')) return; var r = selRange(), rc = (r && !r.collapsed) ? r.getBoundingClientRect() : null; if (!rc || !rc.width) rc = cur.getBoundingClientRect();
      var nav = d.querySelector('nav[data-component="C01"]'), minTop = 4 + ((nav && W.getComputedStyle(nav).position !== 'static') ? nav.offsetHeight : 0), h = T.offsetHeight || 36, w = T.offsetWidth || 160;
      var top = rc.top - h - 8; if (top < minTop) top = rc.bottom + 8;
      T.style.top = Math.round(Math.max(minTop, Math.min(top, W.innerHeight - h - 4))) + 'px'; T.style.left = Math.round(Math.max(4, Math.min(rc.left, W.innerWidth - w - 4))) + 'px';
    }
    function update() {
      Array.prototype.forEach.call(T.querySelectorAll('[data-cmd]'), function (b) { var c = b.getAttribute('data-cmd'), on = false; try { on = c === 'link' ? !!anchorAt(selRange()) : /^(bold|italic|insertUnorderedList|insertOrderedList)$/.test(c) && d.queryCommandState(c); } catch (e) {} b.setAttribute('aria-pressed', String(!!on)); });
    }
    function show(el) { cur = el; T.classList.add('is-on'); Array.prototype.forEach.call(T.querySelectorAll('[data-list]'), function (x) { x.hidden = !el._lists; }); update(); position(); }
    function hide() { T.classList.remove('is-on', 'is-link'); d._rtbBusy = false; cur = null; }
    function closeLink(refocus) { T.classList.remove('is-link'); er.hidden = true; d._rtbBusy = false; if (refocus && cur) { cur.focus(); if (saved) { var s = d.getSelection(); s.removeAllRanges(); s.addRange(saved); } } position(); }
    function restore() { cur.focus(); if (saved) { var s = d.getSelection(); s.removeAllRanges(); s.addRange(saved); } }
    function touched() { if (cur) cur.dispatchEvent(new Event('input', { bubbles: true })); }
    function apply() {
      var u = rtSafeUrl(inp.value); if (!u) { er.hidden = false; return; }
      d._rtbBusy = false; restore(); var r = selRange(), a = anchorAt(r);
      if (a) a.setAttribute('href', u); else if (r && r.collapsed) d.execCommand('insertHTML', false, '<a class="rt-link" href="' + rtEsc(u) + '">' + rtEsc(u) + '</a>'); else d.execCommand('createLink', false, u);
      Array.prototype.forEach.call(cur.querySelectorAll('a[href]'), function (x) { x.classList.add('rt-link'); x.removeAttribute('target'); x.removeAttribute('rel'); });
      touched(); T.classList.remove('is-link'); er.hidden = true; saved = selRange(); update(); position();
    }
    T.addEventListener('mousedown', function (e) { if (e.target !== inp) e.preventDefault(); }); /* i pulsanti non tolgono il fuoco (e la selezione) dal testo */
    T.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-cmd]'); if (!b || !cur) return; var c = b.getAttribute('data-cmd');
      if (c === 'link') { saved = selRange(); var a = anchorAt(saved); inp.value = a ? a.getAttribute('href') : ''; rm.hidden = !a; er.hidden = true; d._rtbBusy = true; T.classList.add('is-link'); position(); inp.focus(); inp.select(); return; }
      if (c === 'apply') return apply();
      if (c === 'cancel') return closeLink(true);
      if (c === 'unlink') { d._rtbBusy = false; restore(); var r = selRange(), a2 = anchorAt(r); if (a2 && r.collapsed) { var nr = d.createRange(); nr.selectNodeContents(a2); var s = d.getSelection(); s.removeAllRanges(); s.addRange(nr); } d.execCommand('unlink'); touched(); T.classList.remove('is-link'); update(); return; }
      d.execCommand(c); update(); position();
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLink(true); } });
    d.addEventListener('selectionchange', function () {
      if (d._rtbBusy) return; var s = d.getSelection(), n = s && s.anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement), leaf = el && el.closest && el.closest('[data-edit="sec"],[data-edit="bio"]');
      if (leaf && leaf.isContentEditable) { if (cur !== leaf || !T.classList.contains('is-on')) show(leaf); else { update(); position(); } } else if (!T.contains(d.activeElement)) hide();
    });
    d.addEventListener('scroll', position, true); W.addEventListener('resize', position);
    return (d._rtb = { T: T, hide: hide });
  }
  var NO_LIST_CLS = /(^|\s)(eyebrow|status|t-caption|t-lead|t-h\d|t-display\S*|t-giant|card-meta|numeric|copy-status|support-optional|dialog-intro)(\s|$)/;
  function listOk(el) { return el.tagName === 'P' && !NO_LIST_CLS.test(el.className || '') && !el.closest('.faq-answer,.legal,.crumbs,.drop-banner,.drop-card'); } /* FAQ: la risposta ha animazione/spaziatura propria sul <p> */
  function wireSectionText(fr, d) {
    if (!(curPage === 'bottega' || (curPage === 'prodotto' && curProduct))) return;
    richToolbar(fr, d);
    STRUCT.forEach(function (it) {
      if (TXT_SPECIAL[it.id] || it.family === 'griglia-prodotti') return;
      var root = itemRoot(d, it); if (!root || root.closest('[data-ed-nowire]')) return;
      var list = textLeaves(root);
      list.forEach(function (el, i) {
        if (!el._tw) {
          el._tw = true; el._lists = listOk(el); /* gli elenchi solo nei paragrafi di corpo, non in titoli, righe singole, etichette, FAQ */
          function slot() { var cur = idxOf(it.id) >= 0 ? STRUCT[idxOf(it.id)] : it; return { cur: cur, pos: Array.prototype.indexOf.call(root.querySelectorAll('[data-edit="sec"]'), el) }; }
          el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); el.setAttribute('role', 'textbox');
          el.setAttribute('data-edit', 'sec'); el.setAttribute('data-ph', 'Scrivi il testo'); el.setAttribute('aria-label', 'Testo della sezione ' + it.label);
          el.addEventListener('keydown', function (e) { /* niente a capo, tranne dentro un elenco; Tab / Maiusc+Tab = rientro dell'elemento di elenco (fuori da un elenco Tab resta il normale spostamento del fuoco) */
            var sl = d.getSelection(), nn = sl && sl.anchorNode, li = nn && (nn.nodeType === 1 ? nn : nn.parentElement); li = li && li.closest ? li.closest('li') : null; if (li && !el.contains(li)) li = null;
            if (e.key === 'Enter') { if (!li) e.preventDefault(); return; }
            if (e.key === 'Tab' && li) { e.preventDefault(); d.execCommand(e.shiftKey ? 'outdent' : 'indent'); }
          });
          /* 10/11/2026 (Ruggi): come nome/presentazione: cliccando nel testo previsto (non ancora modificato) il testo scompare e resta il segnaposto; se non scrivi nulla, all'uscita torna il testo previsto. Un testo gia' modificato non si svuota. */
          el.addEventListener('focus', function () { var cur = idxOf(it.id) >= 0 ? STRUCT[idxOf(it.id)] : it, pos = Array.prototype.indexOf.call(root.querySelectorAll('[data-edit="sec"]'), el); if (cur.txt && cur.txt[pos]) return; el._def = el.innerHTML; el.innerHTML = ''; });
          el.addEventListener('blur', function () {
            if (d._rtbBusy) return; var sl = slot(), empty = !el.textContent.trim();
            if (el._def !== undefined && empty) { el.innerHTML = el._def; if (sl.cur.txt) delete sl.cur.txt[sl.pos]; }
            else if (!empty) { var c = rtClean(el.innerHTML, el._lists); if (el.innerHTML !== c) el.innerHTML = c; }
            el._def = undefined;
          });
          el.addEventListener('paste', function (e) { /* si tiene grassetto, corsivo, link ed elenchi; font, colori e dimensioni dell'origine si scartano (resta il font del tema) */
            e.preventDefault(); var cd = e.clipboardData || fr.contentWindow.clipboardData, h = cd.getData('text/html'), t2 = cd.getData('text'), c = h ? rtClean(h, el._lists) : rtEsc(t2.replace(/\s+/g, ' '));
            if (c) d.execCommand('insertHTML', false, c);
          });
          el.addEventListener('input', function () { var sl = slot(); (sl.cur.txt = sl.cur.txt || {})[sl.pos] = rtClean(el.innerHTML, el._lists); genSyncDup(root); editedNow(); });
        }
        if (it.txt && it.txt[i] != null && d.activeElement !== el && !d._rtbBusy && el.innerHTML !== it.txt[i]) el.innerHTML = it.txt[i];
      });
      genSyncDup(root);
    });
  }
  function textLeaves(root) { /* elementi di testo modificabili di una sezione, in ordine di documento (stessa regola per cablare e per cambiare variante) */
    var list = [];
    Array.prototype.forEach.call(root.querySelectorAll('*'), function (el) {
      if (el.closest(TXT_SKIP) && !el._tw) return;
      if (!el._tw) { if (!el.textContent.trim()) return; for (var i = 0; i < el.children.length; i++) if (!/^(EM|STRONG|I|B|SPAN|BR|SMALL|MARK)$/.test(el.children[i].tagName) || el.children[i].children.length) return; var own = false; for (i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) own = true; if (!own) return; }
      list.push(el);
    });
    return list;
  }
  function leafRole(el) { return /^H[1-6]$/.test(el.tagName) ? 'H' : el.tagName; }
  function leafSig(el) { return leafRole(el) + '|' + (el.getAttribute('data-slot') || ''); }
  /* 10/11/2026 (Ruggi): cambio di variante di una sezione aggiunta. La sezione viene ricostruita dal campione della nuova variante; i testi MODIFICATI dal venditore passano ai campi corrispondenti (stesso ruolo/slot, nell'ordine); i campi che la nuova variante non prevede si perdono; colori, margini e dimensioni (it.ov) restano. */
  function switchVariant(it, f, v, label) {
    if (it.family === f.id && it.variant === v.id) return;
    var fr = $('#editorDevice iframe'), d = null; try { d = fr && fr.contentDocument; } catch (e) { d = null; }
    var oldSlots = JSON.stringify(slotsOf(it)), oldImgN = imgCount(it), keep = [], old = d && itemRoot(d, it);
    if (old) { var ol = textLeaves(old); Object.keys(it.txt || {}).forEach(function (k) { var el = ol[+k]; if (el && it.txt[k]) keep.push({ el: el, sig: leafSig(el), role: leafRole(el), t: it.txt[k] }); }); }
    it.family = f.id; it.variant = v.id; it.label = label; it.txt = null;
    if (old) {
      var nw = buildSection(d, it);
      if (nw) {
        nw.setAttribute('data-ed-added', ''); old.parentNode.replaceChild(nw, old);
        var nl = textLeaves(nw), map = {}, left = nl.map(function (_, j) { return j; });
        [function (k, e) { return k.sig === leafSig(e); }, function (k, e) { return k.role === leafRole(e); }].forEach(function (match) {
          keep.forEach(function (k) { if (k.done) return; for (var q = 0; q < left.length; q++) if (match(k, nl[left[q]])) { map[left[q]] = k.t; left.splice(q, 1); k.done = true; return; } });
        });
        if (Object.keys(map).length) it.txt = map;
        var w = d.createTreeWalker(nw, 4, null), n; while ((n = w.nextNode())) if (n.nodeValue.indexOf(NAME_TOKEN) >= 0) (fr._nodes = fr._nodes || []).push({ n: n, tpl: n.nodeValue });
      }
    }
    renderStructure(); if (fr) syncSections(fr);
    fillLabel($('#secTitle'), it.label);
    if (JSON.stringify(slotsOf(it)) !== oldSlots || imgCount(it) !== oldImgN) buildControls(it, true);
    else $$('.editor-modal-variant', $('#secControls')).forEach(function (b) { b.setAttribute('aria-checked', String(b._it && b._it.f.id === it.family && b._it.v.id === it.variant)); });
    editedNow();
  }
  function syncAll() { var fr = $('#editorDevice iframe'); if (fr) syncSections(fr); }
  function framePick(fr) { /* clic in anteprima = selezione dell'intera sezione sotto il cursore */
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    d.addEventListener('keydown', deselectOnEsc);
    /* 5/11/2026 (Ruggi): hover sulla sezione = stesso bordo lilla attenuato dei campi di testo, ma PIENO invece che tratteggiato (la sezione selezionata ha il bordo lilla pieno) */
    var hov = null, hovIt = null, drag = null, lastY = 0, lastX = 0, raf = 0, W = d.defaultView;
    var GRIP_H = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="6" cy="9" r="1.8"/><circle cx="12" cy="9" r="1.8"/><circle cx="18" cy="9" r="1.8"/><circle cx="6" cy="15" r="1.8"/><circle cx="12" cy="15" r="1.8"/><circle cx="18" cy="15" r="1.8"/></svg>';
    var LOCK_H = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
    var H = d.createElement('button'); H.type = 'button'; H.className = 'ed-handle'; H.tabIndex = -1; d.body.appendChild(H);
    function placeH() { /* centro del bordo superiore; resta in vista se la sezione esce dall'alto (sotto la navbar sticky) */
      if (!hov) return; var r = hov.getBoundingClientRect(), nav = d.querySelector('nav[data-component="C01"]'), h = H.offsetHeight || 28, w = H.offsetWidth || 44;
      var minTop = 4 + ((nav && hov !== nav && W.getComputedStyle(nav).position !== 'static') ? nav.offsetHeight : 0);
      var top = Math.min(Math.max(r.top - 2 - h / 2, minTop), Math.max(minTop, r.bottom - h - 4));
      H.style.top = Math.round(top) + 'px'; H.style.left = Math.round(Math.max(4, Math.min(r.left + r.width / 2 - w / 2, W.innerWidth - w - 4))) + 'px';
    }
    function showH(it) {
      hovIt = it; H.className = 'ed-handle is-on' + (it.fixed ? ' is-locked' : ''); H.innerHTML = it.fixed ? LOCK_H : GRIP_H;
      var t = it.fixed ? (it.note || 'Sezione bloccata: non si sposta') : 'Trascina per spostare «' + it.label + '»'; H.title = t; H.setAttribute('aria-label', t); placeH();
    }
    fr._edHide = function () { setHover(null); }; /* dopo un'eliminazione: nasconde la maniglia di spostamento */
    d.addEventListener('scroll', placeH, true); W.addEventListener('resize', placeH);
    H.addEventListener('click', function () { if (hovIt && hovIt.fixed && hovIt.id !== selId) selectRow(hovIt.id, true); });
    function reorder() {
      var cur = idxOf(drag.id); if (cur < 0) return; var me = itemRoot(d, STRUCT[cur]); if (me) { var mr = me.getBoundingClientRect(); if (lastY >= mr.top && lastY < mr.bottom) { setDenied(false); return; } } /* il puntatore e' sulla sezione stessa: nessuno scambio (evita oscillazioni) */
      for (var i = 0; i < STRUCT.length; i++) {
        var t = STRUCT[i]; if (t.id === drag.id) continue; var el = itemRoot(d, t); if (!el) continue; var r = el.getBoundingClientRect();
        if (lastY < r.top || lastY >= r.bottom) continue;
        if (t.fixed && t.id !== START && t.id !== ANCHOR && t.id !== 'footer') { setDenied(true); return; } /* sezione bloccata: qui non si inserisce nulla */
        if (t.id === 'navbar' || t.id === 'drop-banner') { setDenied(true); return; }
        setDenied(false);
        var after = lastY > r.top + r.height / 2; if (t.id === START) after = true; if (t.id === 'footer') after = false;
        var tgt = i + (after ? 1 : 0); if (cur < tgt) tgt -= 1; if (cur === tgt) return;
        moveTo(drag.id, tgt); syncDom(drag.id); return;
      }
      setDenied(false);
    }
    function setDenied(v) { if (drag && drag.ghost) drag.ghost.classList.toggle('is-denied', v); }
    function startVisuals() { /* fantasma della sezione che segue il puntatore + sezione originale attenuata (e' il «buco» dove atterra) + sezioni bloccate in grigio */
      var it = STRUCT[idxOf(drag.id)], el = it && itemRoot(d, it); if (!el) return;
      var r = el.getBoundingClientRect(), gw = Math.round(Math.min(380, Math.max(220, r.width * 0.45))), k = gw / r.width;
      var g = d.createElement('div'); g.className = 'ed-ghost'; g.style.width = gw + 'px'; g.style.height = Math.round(Math.min(r.height * k, 190)) + 'px';
      var cl = el.cloneNode(true); [cl].concat(Array.prototype.slice.call(cl.querySelectorAll('*'))).forEach(function (n) { n.removeAttribute('id'); Array.prototype.slice.call(n.attributes).forEach(function (at) { if (/^data-ed-/.test(at.name)) n.removeAttribute(at.name); }); });
      cl.style.cssText += ';width:' + r.width + 'px;max-width:none;margin:0;transform:scale(' + k + ');transform-origin:0 0;pointer-events:none';
      var tag = d.createElement('span'); tag.className = 'ed-ghost-tag'; tag.textContent = it.label; g.appendChild(cl); g.appendChild(tag); d.body.appendChild(g); drag.ghost = g; drag.gw = gw;
      el.setAttribute('data-ed-dragging', '');
      STRUCT.forEach(function (x) { if (!x.fixed && x.id !== 'navbar' && x.id !== 'drop-banner') return; var n = itemRoot(d, x); if (n) { n.setAttribute('data-ed-locked', ''); (drag.locked = drag.locked || []).push(n); } });
      H.classList.add('is-drag'); moveGhost();
    }
    function moveGhost() { if (drag && drag.ghost) { drag.ghost.style.left = Math.round(lastX - drag.gw / 2) + 'px'; drag.ghost.style.top = Math.round(lastY + 14) + 'px'; } }
    function loop() { /* ai bordi dell'anteprima la pagina scorre da sola, piu' veloce vicino al bordo; behavior istantaneo: il tema ha scroll-behavior:smooth, che rallenterebbe ogni passo */
      if (!drag) return; var edge = 140, vh = W.innerHeight, dy = 0;
      if (lastY < edge) dy = -(8 + Math.min(1, (edge - lastY) / edge) * 52); else if (lastY > vh - edge) dy = 8 + Math.min(1, (lastY - (vh - edge)) / edge) * 52;
      if (dy) W.scrollBy({ top: Math.round(dy), left: 0, behavior: 'instant' });
      reorder(); placeH(); raf = W.requestAnimationFrame(loop);
    }
    function endDrag() {
      if (!drag) return; var dd = drag; drag = null; W.cancelAnimationFrame(raf); d.documentElement.classList.remove('ed-dragging'); H.classList.remove('is-drag');
      if (dd.ghost && dd.ghost.parentNode) dd.ghost.parentNode.removeChild(dd.ghost);
      Array.prototype.forEach.call(d.querySelectorAll('[data-ed-dragging]'), function (n) { n.removeAttribute('data-ed-dragging'); });
      (dd.locked || []).forEach(function (n) { n.removeAttribute('data-ed-locked'); });
      if (dd.moved) { if (!structIsOpen()) setStructOpen(true); selectRow(dd.id, true); var row = rowEl(dd.id); if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' }); } /* rilascio: si apre il pannello Struttura con la sezione nella sua nuova posizione */
      else selectRow(dd.id);
    }
    H.addEventListener('pointerdown', function (e) {
      if (!hovIt || hovIt.fixed || e.button) return; e.preventDefault();
      drag = { id: hovIt.id, moved: false, y0: e.clientY }; lastY = e.clientY; lastX = e.clientX; try { H.setPointerCapture(e.pointerId); } catch (x) {}
      d.documentElement.classList.add('ed-dragging'); raf = W.requestAnimationFrame(loop);
    });
    H.addEventListener('pointermove', function (e) { if (!drag) return; lastY = e.clientY; lastX = e.clientX; if (!drag.moved && Math.abs(lastY - drag.y0) > 4) { drag.moved = true; startVisuals(); } moveGhost(); });
    H.addEventListener('pointerup', endDrag); H.addEventListener('pointercancel', endDrag);
    function setHover(el) { if (drag || hov === el) return; if (!el) H.className = 'ed-handle'; if (hov) hov.removeAttribute('data-ed-hover'); hov = el; if (hov) hov.setAttribute('data-ed-hover', ''); }
    d.addEventListener('mouseover', function (e) {
      if (e.target.closest && (e.target.closest('.ed-handle') || e.target.closest('.ed-rtb'))) return;
      if (e.target.closest && e.target.closest('.editor-inserter')) { setHover(null); return; }
      for (var i = 0; i < STRUCT.length; i++) { var r = itemRoot(d, STRUCT[i]); if (r && (r === e.target || r.contains(e.target))) { setHover(r); showH(STRUCT[i]); return; } }
      setHover(null);
    }, true);
    d.documentElement.addEventListener('mouseleave', function () { setHover(null); });
    d.addEventListener('click', function (e) {
      if (e.target.closest && (e.target.closest('.ed-handle') || e.target.closest('.ed-rtb') || e.target.closest('.editor-inserter') || e.target.closest('[contenteditable="true"]'))) return;
      for (var i = 0; i < STRUCT.length; i++) { var r = itemRoot(d, STRUCT[i]); if (r && (r === e.target || r.contains(e.target))) { if (STRUCT[i].id !== selId) selectRow(STRUCT[i].id, true); return; } }
      if (selId) selectRow(null); /* zona libera: deseleziona */
    }, true);
  }
  function editedNow() { if (curPage === 'prodotto' && curProduct) productEdited(); else touch(); }

  /* --- pannello: costruzione dei controlli --- */
  var ctlKey = null, ctlOpen = {};
  function tonesFor(it, slot) {
    var fx = FIXEL[it.id], pal = manifestOf().palette.map(function (c) { return c.id; });
    if (fx && fx.tones === 'hero') return THEMES[state.theme].heroColors.map(function (c) { return c.id; });
    if (fx && fx.tones === 'all') return ['ink', 'paper'].concat(pal);
    var fv = varOf(it); return fv && fv.f.toneable ? fv.f.axes[1].values.slice() : pal;
  }
  function toneRows(host, it, slot, tones, getVal, setVal) { /* stesso processo colore della modale «Aggiungi una sezione»: colori di sistema, Nessun colore, aggiuntivi generali e locali, + per aggiungere */
    host.innerHTML = '';
    var X = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>', locals = it.locals || (it.locals = []);
    function group(title, tip) {
      var g = document.createElement('div'); g.className = 'editor-tone-group';
      if (title) { var h = document.createElement('p'); h.className = 'panel-field-label editor-tone-group-title'; h.textContent = title; if (tip) { var i = document.createElement('span'); i.className = 'editor-tone-info'; i.tabIndex = 0; i.setAttribute('role', 'img'); i.setAttribute('aria-label', tip); i.setAttribute('data-tooltip', tip); h.appendChild(i); } g.appendChild(h); }
      var r = document.createElement('div'); r.className = 'editor-tone-row'; g.appendChild(r); host.appendChild(g); return r;
    }
    function delLocal(hex) {
      var i = locals.map(function (c) { return c.hex; }).indexOf(hex); if (i < 0) return;
      var gone = locals.splice(i, 1)[0], was = getVal() === hex; if (was) setVal(null); else toneRows(host, it, slot, tones, getVal, setVal);
      showToast('Colore eliminato: ' + gone.name, function () { locals.splice(i, 0, gone); if (was) setVal(hex); else toneRows(host, it, slot, tones, getVal, setVal); });
    }
    function sw(row, val, label, cls, color, local) {
      var wrap = document.createElement('span'); wrap.className = 'editor-tone-item';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bottega-swatch' + (cls ? ' ' + cls : ''); if (color) b.style.setProperty('--sw', color);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', label); b.setAttribute('data-tooltip', label); var cur = getVal(); b.setAttribute('aria-checked', String(cur === val || (val === NONE && cur == null))); /* 5/11/2026 (Ruggi): senza colore = «Nessun colore» selezionato */
      b.addEventListener('click', function () { setVal(val); }); wrap.appendChild(b);
      if (local) {
        b.addEventListener('keydown', function (e) { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delLocal(val); } });
        var x = document.createElement('button'); x.type = 'button'; x.className = 'editor-tone-del'; x.setAttribute('aria-label', 'Elimina ' + label); x.setAttribute('data-tooltip', 'Elimina'); x.innerHTML = X;
        x.addEventListener('click', function (e) { e.stopPropagation(); delLocal(val); }); wrap.appendChild(x);
      }
      row.appendChild(wrap);
    }
    var last = group(null);
    tones.forEach(function (t) { sw(last, t, t, '', hexOf(t)); });
    sw(last, NONE, 'Nessun colore', 'is-none'); /* 5/11/2026 (Ruggi): anche nelle sezioni fisse, come nella modale */
    var gen = COLORS_API.customs();
    function mkAdd(target) {
      var add = document.createElement('button'); add.type = 'button'; add.className = 'bottega-swatch is-add';
      var tip = target === 'general' ? 'Aggiungi colore generale' : target === 'local' ? 'Aggiungi colore locale' : 'Aggiungi colore';
      add.setAttribute('data-tooltip', tip); add.setAttribute('aria-label', tip); add.setAttribute('aria-haspopup', 'dialog');
      add.addEventListener('click', function () {
        openNewColorPanel(add, {
          general: !target, target: target, over: false, bounds: document.body, rightOf: $('.editor-panel'),
          prefix: function (toGeneral) { return toGeneral ? 'Aggiuntivo' : 'Locale'; },
          names: function () { return COLORS_API.names().concat(locals.map(function (c) { return c.name; })); },
          groups: function () { return [{ title: 'Colori di sistema', items: COLORS_API.system() }, { title: 'Aggiuntivi generali', items: COLORS_API.customs() }, { title: 'Aggiuntivi locali', items: locals.map(function (c) { return { name: c.name, hex: c.hex }; }) }]; },
          duplicate: function (h) {
            var t = tones.filter(function (x) { return hexOf(x).toLowerCase() === h; })[0]; if (t) return t.charAt(0).toUpperCase() + t.slice(1);
            var g = COLORS_API.customs().filter(function (c) { return c.hex.toLowerCase() === h; })[0]; if (g) return g.name;
            var l = locals.filter(function (c) { return c.hex === h; })[0]; return l ? l.name : null;
          },
          onConfirm: function (h, nm, toGeneral) { if (toGeneral) COLORS_API.add(h, nm); else locals.push({ hex: h, name: nm }); setVal(h); }
        });
      });
      return add;
    }
    if (!gen.length && !locals.length) last.appendChild(mkAdd(null));
    else {
      last = group('Aggiuntivi generali'); gen.forEach(function (c) { sw(last, c.hex.toLowerCase(), c.name + ' (si gestisce in Generali)', '', c.hex); }); last.appendChild(mkAdd('general'));
      last = group('Aggiuntivi locali', 'Esistono solo in questa sezione'); locals.forEach(function (c) { sw(last, c.hex, c.name, '', c.hex, true); }); last.appendChild(mkAdd('local'));
    }
  }
  /* 10/11/2026 (Ruggi): Catalogo e sezione aggiuntiva «Griglia prodotti» — fuori dagli accordion, titolo «Categorie» e sotto le label delle categorie incluse (anche se e' una sola) con il numero di prodotti associati. Conta i prodotti che il Catalogo mostra (pubblicati ed esauriti). DATI DI PROVA: arrivano da PRODUCTS. */
  function buildCategories(host) {
    var box = document.createElement('div'); box.className = 'editor-ev editor-cats';
    var h = document.createElement('div'); h.className = 'panel-accordion-header-label editor-ctl-title'; h.textContent = 'Categorie'; box.appendChild(h);
    var order = [], n = {}; evPublished().forEach(function (p) { var c = p.cat || 'Senza categoria'; if (!n[c]) { n[c] = 0; order.push(c); } n[c]++; });
    if (!order.length) { var e = document.createElement('p'); e.className = 'bottega-hint'; e.textContent = 'Nessuna categoria: non ci sono ancora prodotti pubblicati.'; box.appendChild(e); }
    else {
      var ul = document.createElement('ul'); ul.className = 'editor-cat-list';
      order.forEach(function (c) {
        var li = document.createElement('li'); li.className = 'editor-cat-row';
        var chip = document.createElement('span'); chip.className = 'panel-product-category cat-' + c.toLowerCase(); chip.textContent = c + ' (' + n[c] + ')'; /* 10/11/2026 (Ruggi): «Label (N)» dentro la chip */
        li.appendChild(chip); ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    host.appendChild(box);
  }
  /* 10/11/2026 (Ruggi): nome di una sezione aggiuntiva = «Famiglia · variante»: la variante e' piu' piccola e attenuata, non uguale al titolo (lista Struttura e titolo del pannello). it.label resta la stringa intera. */
  function fillLabel(el, label) {
    if (!el) return; var i = String(label == null ? '' : label).indexOf(' · '); el.textContent = '';
    if (i < 0) { el.textContent = label; return; }
    el.appendChild(document.createTextNode(label.slice(0, i)));
    var v = document.createElement('span'); v.className = 'editor-label-var'; v.textContent = label.slice(i); el.appendChild(v);
  }
  function buildControls(it, force) {
    var host = $('#secControls'), key = curPage + '|' + (curProduct ? curProduct.id : '') + '|' + it.id;
    if (!force && ctlKey === key && host.firstChild) return;
    ctlKey = key; host.innerHTML = ''; allSelects = allSelects.filter(function (x) { return x.el.isConnected; });
    var s = slotsOf(it), fx = FIXEL[it.id] || {}, note = $('#secNote');
    if (!s) { note.hidden = false; note.textContent = 'Le impostazioni di questa sezione sono ancora da definire.'; addDeleteZone(host, it); return; }
    note.hidden = true; var o = ensureOv(it), refreshers = []; o.p = o.p || {};
    if (it.id === 'prodotti') { var evBox = document.createElement('div'); evBox.className = 'editor-ev'; host.appendChild(evBox); buildEvidence(evBox); } /* sezione «particolare»: numero e scelta dei prodotti, poi i testi comuni a tutte le card */
    if (it.id === 'catalogo' || it.family === 'griglia-prodotti') buildCategories(host);
    if (it.family === 'tecnica') buildTecnica(host, it, function () { var d = doc(), f = fr(); if (d) { applyGen(d, it); if (f) wireSectionText(f, d); } editedNow(); }); /* 10/11/2026: sempre visibile, non e' un accordion */
    function fr() { return $('#editorDevice iframe'); }
    function doc() { var f = fr(); try { return f && f.contentDocument; } catch (e) { return null; } }
    function changed() { var d = doc(); if (d) applyOv(d, it); refreshers.forEach(function (r) { r(); }); editedNow(); }
    function group(title, openDef) { /* gruppi = stesso componente accordion di Generali (.panel-accordion-header-label); aperti di default, lo stato resta tra una selezione e l'altra */
      var d = document.createElement('details'); d.className = 'panel-accordion editor-accordion'; d.open = ctlOpen[title] === undefined ? !!openDef : ctlOpen[title] === true; /* 5/11/2026 (Ruggi): chiusi di default */
      d.addEventListener('toggle', function () { ctlOpen[title] = d.open; });
      var sm = document.createElement('summary'); sm.className = 'panel-accordion-header';
      sm.innerHTML = '<span class="panel-accordion-header-label"></span><span class="panel-accordion-toggle" aria-hidden="true"></span>'; sm.firstChild.textContent = title; var cnt = document.createElement('span'); cnt.className = 'panel-accordion-count'; cnt.hidden = true; sm.firstChild.appendChild(document.createTextNode(' ')); sm.firstChild.appendChild(cnt); d.appendChild(sm); /* 7/11/2026 (Ruggi): numero dei parametri modificati accanto al titolo del gruppo (stesso pattern di «Recensioni (14)») */
      var g = document.createElement('div'); g.className = 'panel-accordion-body editor-ctl-group'; g._cnt = cnt; g._dirty = []; d.appendChild(g); host.appendChild(d); return g;
    }
    function field(g, label, ctl, isDirty, reset) { /* etichetta + controllo + «Ripristina» (solo se diverso dal tema) */
      var row = document.createElement('div'); row.className = 'editor-ctl-field';
      var top = document.createElement('div'); top.className = 'editor-ctl-top'; var l = document.createElement('span'); l.className = 'panel-field-label'; l.textContent = label; top.appendChild(l);
      var rb = document.createElement('button'); rb.type = 'button'; rb.className = 'btn-ghost xs'; rb.textContent = 'Ripristina'; rb.hidden = true; rb.addEventListener('click', function () { reset(); changed(); }); top.appendChild(rb);
      row.appendChild(top); row.appendChild(ctl); g.appendChild(row);
      g._dirty.push(isDirty); refreshers.push(function () { rb.hidden = !isDirty(); var n = g._dirty.filter(function (f) { return f(); }).length; g._cnt.hidden = !n; g._cnt.textContent = '(' + n + ')'; }); refreshers[refreshers.length - 1]();
      return row;
    }
    /* 10/11/2026 (Ruggi): «Varianti» = prima voce, aperta all'inizio, per ogni sezione con piu' varianti di struttura: stesse anteprime della modale «Aggiungi una sezione»; il clic cambia la vista nell'anteprima mantenendo i testi modificati. */
    var vg = it.family ? addGroups().filter(function (g) { return g.items.some(function (x) { return x.f.id === it.family; }); })[0] : null;
    if (vg && vg.items.length > 1) {
      var gv = group('Varianti', true), vgrid = document.createElement('div'); vgrid.className = 'editor-modal-variants'; vgrid.setAttribute('role', 'radiogroup'); vgrid.setAttribute('aria-label', 'Varianti');
      vg.items.forEach(function (x) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'editor-modal-variant'; b.setAttribute('role', 'radio'); b._it = x;
        b.setAttribute('aria-checked', String(x.f.id === it.family && x.v.id === it.variant));
        b.innerHTML = '<span class="editor-modal-variant-sw"></span><span class="editor-modal-variant-text"><span class="editor-modal-variant-name"></span></span>'; $('.editor-modal-variant-name', b).textContent = x.label;
        mountPreview(b.firstChild, x.f, x.v, { fixed: true, tone: x.f.toneable ? (o.c['color-0'] || null) : null });
        b.addEventListener('click', function () { switchVariant(it, x.f, x.v, vg.label + ' · ' + x.label); });
        vgrid.appendChild(b);
      });
      gv.appendChild(vgrid);
    }
    /* 10/11/2026 (Ruggi): «Immagini» = seconda voce, per le sezioni aggiunte che prevedono immagini: una riga per ogni immagine prevista (carica / sostituisci / rimuovi); scegliendo piu' file si riempiono le righe in ordine. */
    if (it.family === 'galleria') { /* opzioni della Galleria: immagini per riga (solo griglia), didascalie, numero di immagini */
      var gg0 = group('Galleria', true), kd = galKind(it); it.g = it.g || {};
      function galApply() { var d = doc(), f = fr(); if (d) { applyGallery(d, it); if (f) wireSectionText(f, d); } editedNow(); }
      if (kd === 'griglia') { var sCols = makeSelect('Immagini per riga', ['2', '3', '4'], String(it.g.cols || 2), function (v) { it.g.cols = +v; galApply(); }); field(gg0, 'Immagini per riga', sCols.el, function () { return !!it.g.cols && it.g.cols !== 2; }, function () { it.g.cols = null; sCols.value = '2'; galApply(); }); }
      var sCap = makeSelect('Didascalie', ['Mostra', 'Nascondi'], it.g.cap === false ? 'Nascondi' : 'Mostra', function (v) { it.g.cap = v === 'Mostra'; galApply(); }); field(gg0, 'Didascalie', sCap.el, function () { return it.g.cap === false; }, function () { it.g.cap = true; sCap.value = 'Mostra'; galApply(); });
      if (!(it.imgs && it.imgs.some(Boolean))) { /* con immagini caricate il numero segue le immagini; senza, serve per vedere il layout */
      var nOpts = []; for (var gi0 = GAL_MIN; gi0 <= GAL_MAX; gi0++) nOpts.push(String(gi0));
      var sN = makeSelect('Numero di immagini', nOpts, String(galN(it)), function (v) { it.g.n = +v; galApply(); buildControls(it, true); }); field(gg0, 'Numero di immagini (max ' + GAL_MAX + ')', sN.el, function () { return galN(it) !== (GAL_DEF[kd] || 4); }, function () { it.g.n = null; galApply(); buildControls(it, true); });
      }
    }
    if (GEN[it.family] && !GEN[it.family].custom && GEN[it.family].ctl(galKind(it)).length) { /* opzioni delle famiglie con elementi generati */
      var gg2 = group(GEN[it.family].title, true), gl = GEN[it.family].ctl(galKind(it)); it.g = it.g || {};
      function genApply(rebuild) { var d = doc(), f = fr(); if (d) { applyImgs(d, it); if (f) wireSectionText(f, d); } editedNow(); if (rebuild) buildControls(it, true); }
      gl.forEach(function (c) {
        if (c.show && !c.show(it)) return;
        var cur = genV(it, c.key), sel, label = c.label + (c.type === 'num' ? ' (max ' + c.max + ')' : '');
        if (c.type === 'bool') {
          sel = makeSelect(c.label, [c.on, c.off], cur === false ? c.off : c.on, function (v) { it.g[c.key] = v === c.on; if (it.family === 'persone' && !genV(it, 'img') && !genV(it, 'quote')) it.g[c.key === 'img' ? 'quote' : 'img'] = true; genApply(true); }); /* almeno uno tra immagine e citazione resta acceso */
          field(gg2, c.label, sel.el, function () { return genV(it, c.key) !== c.def; }, function () { it.g[c.key] = null; genApply(true); });
        } else if (c.type === 'choice') {
          sel = makeSelect(c.label, c.values, String(cur), function (v) { it.g[c.key] = v; genApply(false); });
          field(gg2, c.label, sel.el, function () { return genV(it, c.key) !== c.def; }, function () { it.g[c.key] = null; genApply(true); });
        } else {
          var opts = c.type === 'num' ? Array.apply(null, Array(c.max - c.min + 1)).map(function (_, j) { return String(c.min + j); }) : c.values.map(String);
          sel = makeSelect(c.label, opts, String(cur), function (v) { it.g[c.key] = +v; genApply(c.key === 'n'); });
          field(gg2, label, sel.el, function () { return genV(it, c.key) !== c.def; }, function () { it.g[c.key] = null; genApply(true); });
        }
      });
    }
    var nImg = imgCount(it);
    if (nImg) {
      var isGal = it.family === 'galleria', isLogo = it.family === 'fascia', maxImg = (isGal || isLogo) ? GAL_MAX : nImg, maxTxt = maxImg === 1 ? '1 immagine' : maxImg + ' immagini';
      var gi = group(isLogo ? 'Loghi' : 'Immagini', true), wrap = document.createElement('div'); wrap.className = 'editor-img-wrap'; gi.appendChild(wrap);
      var pick = document.createElement('input'); pick.type = 'file'; pick.accept = 'image/*'; pick.multiple = maxImg > 1; pick.hidden = true; gi.appendChild(pick);
      var live = document.createElement('p'); live.className = 'editor-sr'; live.setAttribute('aria-live', 'polite'); gi.appendChild(live);
      var UP = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>';
      var GRIP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
      var S = imgStore(it), stKey = it.id + (S === it ? '' : '|' + S.id), stage = IMG_STAGE[stKey] = IMG_STAGE[stKey] || [], msgT = 0;
      function lst() { var a = S.imgs || [], nm = S.imgNames || [], al = S.imgAlts || [], o = [], i; for (i = 0; i < a.length; i++) if (a[i]) o.push({ src: a[i], name: nm[i] || '', alt: al[i] || '', auto: autoAlt(it.label, o.length, nm[i]) }); return o; }
      function put(l) { S.imgs = l.map(function (x) { return x.src; }); S.imgNames = l.map(function (x) { return x.name; }); S.imgAlts = l.map(function (x) { return x.alt || ''; }); }
      function setAlt(i, v) { var l = lst(); if (!l[i]) return; l[i].alt = v; put(l); var d0 = doc(); if (d0) applyImgs(d0, it); editedNow(); }
      function nm(x, i) { return x.name || ('Immagine ' + (i + 1)); }
      function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
      function imgsChanged(prev) {
        var d = doc(), f = fr(), cnt = lst().length, rb = false; if (prev == null) prev = cnt;
        if (isGal) { it.g = it.g || {}; if (cnt) { var nn = Math.max(GAL_MIN, cnt); if (galN(it) !== nn) it.g.n = nn; } if ((prev > 0) !== (cnt > 0)) rb = true; } /* galleria: il numero di immagini segue quelle caricate */
        if (d) { applyImgs(d, it); if (f) wireSectionText(f, d); }
        editedNow(); if (imgLbPaint) imgLbPaint();
        if (rb) buildControls(it, true); else paintImgs();
      }
      function removeAt(i) {
        var l = lst(), rem = l[i]; if (!rem) return; var prev = l.length; l.splice(i, 1); put(l); imgsChanged(prev);
        imgToast('«' + nm(rem, i) + '» eliminata', function () { var l2 = lst(); if (l2.length >= maxImg) { imgToast('Non c’è più posto: il massimo è ' + maxTxt + '.'); return; } var p2 = l2.length; l2.splice(Math.min(i, l2.length), 0, rem); put(l2); imgsChanged(p2); });
      }
      function move(from, to) { var l = lst(); if (to < 0 || to >= l.length || from === to) return; var x = l.splice(from, 1)[0]; l.splice(to, 0, x); put(l); live.textContent = 'Immagine spostata in posizione ' + (to + 1) + ' di ' + l.length + '.'; imgsChanged(); var t = wrap.querySelectorAll('.editor-img-tile')[to]; if (t) t.focus(); }
      /* riquadro di caricamento: separato, sempre a tutta larghezza */
      var drop = document.createElement('div'); drop.className = 'editor-img-drop';
      var dText = document.createElement('span'); dText.className = 'editor-img-text'; var dHint = document.createElement('span'); dHint.className = 'editor-img-hint';
      var br = document.createElement('button'); br.type = 'button'; br.className = 'btn-ghost xs editor-img-browse'; br.textContent = 'Sfoglia i file';
      var dUp = document.createElement('span'); dUp.className = 'editor-img-up'; dUp.innerHTML = UP; drop.appendChild(dUp); drop.appendChild(dText); drop.appendChild(br);
      var msgEl = document.createElement('p'); msgEl.className = 'editor-img-msg'; msgEl.setAttribute('role', 'alert'); msgEl.hidden = true;
      var stBox = document.createElement('div'); stBox.className = 'editor-img-stage'; stBox.hidden = true;
      var stLb = document.createElement('p'); stLb.className = 'editor-img-title'; var stList = document.createElement('div'); stList.className = 'editor-img-stage-list';
      var stAct = document.createElement('div'); stAct.className = 'editor-img-stage-act';
      var okB = document.createElement('button'); okB.type = 'button'; okB.className = 'btn-pill-dark sm primary'; var noB = document.createElement('button'); noB.type = 'button'; noB.className = 'btn-ghost sm danger'; noB.textContent = 'Annulla';
      stAct.appendChild(noB); stAct.appendChild(okB); [stLb, stList, stAct].forEach(function (x) { stBox.appendChild(x); });
      var grid = document.createElement('div'); grid.className = 'editor-img-grid' + (isLogo ? ' is-logo' : ''); var gLb = document.createElement('p'); gLb.className = 'editor-img-title'; gLb.textContent = isLogo ? 'Loghi caricati' : 'Immagini caricate';
      [drop, msgEl, stBox, gLb, grid].forEach(function (x) { wrap.appendChild(x); });
      function say(t) { clearTimeout(msgT); msgEl.textContent = t || ''; msgEl.hidden = !t; if (t) msgT = setTimeout(function () { msgEl.hidden = true; }, 9000); }
      function paintDrop() { var full = lst().length + stage.length >= maxImg; drop.classList.toggle('is-full', full); br.disabled = full; dText.textContent = full ? 'Hai raggiunto il massimo di ' + maxTxt : 'Trascina qui il tuo file oppure'; }
      function paintStage() {
        stBox.hidden = !stage.length; stList.innerHTML = ''; var ready = stage.every(function (e) { return e.url; });
        stage.forEach(function (e, k) {
          var th = document.createElement('div'); th.className = 'editor-img-stage-item' + (e.url ? '' : ' is-loading'); if (e.url) th.style.backgroundImage = 'url("' + e.url + '")'; th.title = e.name;
          var x = document.createElement('button'); x.type = 'button'; x.className = 'editor-img-x'; x.setAttribute('aria-label', 'Togli ' + (e.name || 'immagine') + ' dalla lista'); x.innerHTML = IMG_X; x.addEventListener('click', function () { stage.splice(k, 1); say(''); paintStage(); }); th.appendChild(x); stList.appendChild(th);
        });
        stLb.textContent = 'Da caricare (' + stage.length + ')'; okB.textContent = 'Aggiungi'; okB.disabled = !stage.length || !ready; paintDrop();
      }
      function addFiles(files) {
        files = Array.prototype.slice.call(files || []); var imgs = files.filter(function (f) { return /^image\//.test(f.type); }), bad = files.length - imgs.length, msgs = [];
        var free = maxImg - lst().length - stage.length, take = imgs.slice(0, Math.max(0, free)), over = imgs.length - take.length;
        if (bad) msgs.push(bad === 1 ? '1 file non è un’immagine e non è stato inserito.' : bad + ' file non sono immagini e non sono stati inseriti.');
        if (over) msgs.push('Il massimo è ' + maxTxt + ': ' + (over === 1 ? '1 non verrà aggiunta.' : over + ' non verranno aggiunte.'));
        say(msgs.join(' '));
        take.forEach(function (f) { var e = { name: f.name || '', url: null }; stage.push(e); readImage(f, function (u) { e.url = u; paintStage(); }); });
        paintStage();
      }
      okB.addEventListener('click', function () { var l = lst(), prev = l.length; stage.forEach(function (e) { if (e.url) l.push({ src: e.url, name: e.name }); }); stage.length = 0; say(''); put(l); imgsChanged(prev); });
      noB.addEventListener('click', function () { stage.length = 0; say(''); paintStage(); });
      br.addEventListener('click', function () { pick.value = ''; pick.click(); });
      pick.addEventListener('change', function () { addFiles(pick.files); });
      drop.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); drop.classList.add('is-over'); }); /* trascinando un file: sfondo lilla chiaro e bordo tratteggiato lilla */
      drop.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (x) {} });
      drop.addEventListener('dragleave', function (e) { if (!drop.contains(e.relatedTarget)) drop.classList.remove('is-over'); });
      drop.addEventListener('drop', function (e) { if (!hasFiles(e)) return; e.preventDefault(); drop.classList.remove('is-over'); addFiles(e.dataTransfer.files); });
      /* miniature inserite: clic = ingrandisci, trascina o Alt+frecce = riordina, X = elimina */
      var dragEl = null;
      grid.addEventListener('dragover', function (e) { if (dragEl) e.preventDefault(); }); grid.addEventListener('drop', function (e) { if (dragEl) e.preventDefault(); });
      function paintGrid() {
        grid.innerHTML = ''; var l = lst(); grid.hidden = gLb.hidden = !l.length;
        l.forEach(function (im, i) {
          var t = document.createElement('div'); t.className = 'editor-img-tile'; t._i = i; t.style.backgroundImage = 'url("' + im.src + '")'; t.tabIndex = 0; t.draggable = true; t.setAttribute('role', 'button');
          t.setAttribute('aria-label', nm(im, i) + ', ' + (i + 1) + ' di ' + l.length + '. Invio per ingrandire, Alt più frecce per spostare.');
          t.innerHTML = '<span class="editor-img-grip" aria-hidden="true">' + GRIP + '</span><span class="editor-img-num" aria-hidden="true">' + (i + 1) + '</span>';
          var x = document.createElement('button'); x.type = 'button'; x.className = 'editor-img-x'; x.setAttribute('aria-label', 'Elimina ' + nm(im, i)); x.setAttribute('data-tooltip', 'Elimina'); x.innerHTML = IMG_X; x.draggable = false;
          x.addEventListener('click', function (e) { e.stopPropagation(); removeAt(t._i); }); t.appendChild(x);
          var open = function () { openImgLb(lst, removeAt, t._i, setAlt, function (k) { var tt = wrap.querySelectorAll('.editor-img-tile'); (tt[Math.min(k, tt.length - 1)] || {focus: function () {}}).focus(); }); };
          t.addEventListener('click', open);
          t.addEventListener('keydown', function (e) {
            if (e.target !== t) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
            else if (e.altKey && /^Arrow(Left|Up)$/.test(e.key)) { e.preventDefault(); move(t._i, t._i - 1); } else if (e.altKey && /^Arrow(Right|Down)$/.test(e.key)) { e.preventDefault(); move(t._i, t._i + 1); }
          });
          t.addEventListener('dragstart', function (e) { if (hasFiles(e)) return; dragEl = t; t.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(t._i)); } catch (x2) {} });
          t.addEventListener('dragover', function (e) { /* riordino in tempo reale: le altre miniature si spostano mentre trascini */
            if (!dragEl || dragEl === t) return; e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (x3) {}
            var r = t.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2, ref = after ? t.nextSibling : t; if (ref !== dragEl && (after ? t.nextSibling !== dragEl : t.previousSibling !== dragEl)) grid.insertBefore(dragEl, ref);
          });
          t.addEventListener('dragend', function () {
            t.classList.remove('is-dragging'); var order = Array.prototype.map.call(grid.children, function (c) { return c._i; }); dragEl = null;
            if (order.some(function (v, k) { return v !== k; })) { var l2 = lst(), n2 = order.map(function (k) { return l2[k]; }); put(n2); live.textContent = 'Immagini riordinate.'; imgsChanged(); }
          });
          grid.appendChild(t);
        });
      }
      function paintImgs() { put(lst()); paintGrid(); paintStage(); var set = lst().length; gi._cnt.hidden = false; gi._cnt.textContent = '(' + set + ' di ' + maxImg + ')'; }
      paintImgs();
    }
    /* colore: un selettore per ogni superficie colorata */
    var cols = it.id === 'identita' ? [{ id: 'color-0', label: 'Sfondo', pairs: true }] : (s.colors || []);
    if (cols.length) {
      var gc = group('Colore');
      cols.forEach(function (c) {
        var tones = tonesFor(it, c), box = document.createElement('div'); box.className = 'editor-ctl-tones';
        var def = it.id === 'identita' ? 'ink' : (c.tone || null);
        function origTone() { var d = doc(), r = d && itemRoot(d, it), e = r && slotEls(it, r, 'color', c.id)[0]; return e ? (e._t0 !== undefined ? e._t0 : e.getAttribute('data-tone')) : null; }
        function getVal() { if (it.id === 'identita') return heroTone(); return o.c[c.id] || def || (function () { var d = doc(), r = d && itemRoot(d, it), e = r && slotEls(it, r, 'color', c.id)[0]; return e ? (e._t0 !== undefined ? e._t0 : e.getAttribute('data-tone')) : null; })(); }
        function setVal(v) {
          if (it.id === 'identita') { state.color = v && v !== 'ink' ? v : ''; paintAll(); touch(); }
          else { if (!v || v === def || (v === NONE && !def && !origTone())) delete o.c[c.id]; else o.c[c.id] = v; } /* “Nessun colore” è il default solo se l'elemento nel tema non ha già un tono (es. il blocco del footer ce l'ha) */
          drawPair(); changed();
          toneRows(box, it, c, tones, getVal, setVal);
        }
        var pbox = document.createElement('div'), prow = null;
        function drawPair() { /* Abbinamento: solo le opzioni che esistono per il colore scelto */
          pbox.innerHTML = ''; var av = c.pairs ? pairsFor(getVal()) : [];
          if (!av.length) { delete o.p[c.id]; if (prow) prow.hidden = true; return; }
          if (o.p[c.id] && av.indexOf(o.p[c.id]) < 0) delete o.p[c.id];
          if (prow) prow.hidden = false;
          var names = ['Predefinito'].concat(av.map(function (x) { return PAIR_LABEL[x]; }));
          var sel = makeSelect('Abbinamento colore', names, o.p[c.id] ? PAIR_LABEL[o.p[c.id]] : 'Predefinito', function (v) {
            var k = Object.keys(PAIR_LABEL).filter(function (x) { return PAIR_LABEL[x] === v; })[0]; if (k) o.p[c.id] = k; else delete o.p[c.id]; changed();
          });
          pbox.appendChild(sel.el);
        }
        field(gc, cols.length > 1 ? c.label : (c.label || 'Sfondo'), box, function () { return it.id === 'identita' ? !!state.color : !!o.c[c.id]; }, function () { setVal(null); });
        toneRows(box, it, c, tones, getVal, setVal);
        if (c.pairs) { prow = field(gc, 'Abbinamento', pbox, function () { return !!o.p[c.id]; }, function () { delete o.p[c.id]; drawPair(); }); drawPair(); }
      });
    }
    if (s.columns || s.rows) { /* 7/11/2026 (Ruggi): griglia del Catalogo (e della sezione aggiuntiva «Griglia prodotti») */
      var gg = group('Griglia');
      if (s.columns) {
        var sc = makeSelect('Prodotti per riga', ['Tema'].concat(s.columns.values.map(String)), o.cols ? String(o.cols) : 'Tema', function (v) { o.cols = v === 'Tema' ? null : +v; changed(); });
        field(gg, 'Prodotti per riga', sc.el, function () { return !!o.cols; }, function () { o.cols = null; sc.value = 'Tema'; });
      }
      if (s.rows) {
        var sr = makeSelect('Righe prima di «Carica altri»', ['Tema'].concat(s.rows.values.map(function (v) { return v === 'all' ? 'Tutti' : String(v); })), o.rows ? (o.rows === 'all' ? 'Tutti' : String(o.rows)) : 'Tema', function (v) { o.rows = v === 'Tema' ? null : v === 'Tutti' ? 'all' : +v; changed(); });
        field(gg, 'Righe prima di «Carica altri»', sr.el, function () { return !!o.rows; }, function () { o.rows = null; sr.value = 'Tema'; });
      }
    }
    /* testi: titolo e testo indipendenti */
    var warn = document.createElement('p'); warn.className = 'bottega-hint editor-ctl-warn'; warn.setAttribute('role', 'status'); warn.hidden = true;
    function checkWarn() { /* il testo non dovrebbe superare il titolo (avviso, non blocca) */
      var d = doc(), r = d && itemRoot(d, it); if (!r) { warn.hidden = true; return; }
      var t = slotEls(it, r, 'title')[0], x = slotEls(it, r, 'text')[0]; if (!t || !x) { warn.hidden = true; return; }
      var ft = parseFloat(d.defaultView.getComputedStyle(t).fontSize), fx2 = parseFloat(d.defaultView.getComputedStyle(x).fontSize);
      warn.hidden = !(fx2 > ft); warn.textContent = fx2 > ft ? 'Il testo è più grande del titolo: la gerarchia si legge al contrario.' : '';
    }
    if (s.title || s.text) {
      var gt = group('Testi');
      if (s.title) {
        var st = makeSelect('Dimensione titolo', SCALE.map(function (x) { return x.toUpperCase(); }), (o.tt || s.title.default).toUpperCase(), function (v) { o.tt = v.toLowerCase() === s.title.default ? null : v.toLowerCase(); changed(); });
        field(gt, s.title.sub || s.title.scope === 'items' ? 'Titoli' : 'Titolo', st.el, function () { return !!o.tt; }, function () { o.tt = null; st.value = s.title.default.toUpperCase(); });
      }
      if (s.text) {
        var def2 = s.text.default || 'm', sx = makeSelect('Dimensione testo', TXT_SCALE.map(function (x) { return x.toUpperCase(); }), (o.tx || def2).toUpperCase(), function (v) { o.tx = v.toLowerCase() === def2 ? null : v.toLowerCase(); changed(); });
        field(gt, 'Testo', sx.el, function () { return !!o.tx; }, function () { o.tx = null; sx.value = def2.toUpperCase(); });
      }
      gt.appendChild(warn); refreshers.push(checkWarn);
    }
    /* spaziatura: margini e gap */
    var ui = { mt: fx.ui ? fx.ui.mt : true, mb: fx.ui ? fx.ui.mb : true };
    if (it.id === 'footer') ui = { mt: false, mb: false };
    if (!s.margin) ui = { mt: false, mb: false };
    if (ui.mt || ui.mb || s.gap) {
      var gs = group('Spaziatura');
      function spaceSel(label, key) {
        /* 5/11/2026 (Ruggi): lo spazio tra colonne/card arriva solo fino a XL (2XL/3XL rompono il layout) */
        var labels = key === 'gap' ? SPACE_LABELS.filter(function (l) { return l !== '2XL' && l !== '3XL'; }) : SPACE_LABELS;
        if (key === 'gap' && (o.gap === '2xl' || o.gap === '3xl')) o.gap = null;
        var cur = o[key] ? (o[key] === 'none' ? 'Nessuno' : o[key].toUpperCase()) : 'Tema';
        var sel = makeSelect(label, labels, cur, function (v) { o[key] = v === 'Tema' ? null : v === 'Nessuno' ? 'none' : v.toLowerCase(); changed(); });
        field(gs, label, sel.el, function () { return !!o[key]; }, function () { o[key] = null; sel.value = 'Tema'; });
      }
      if (ui.mt) spaceSel('Margine sopra', 'mt');
      if (ui.mb) spaceSel(fx.mbLabel || 'Margine sotto', 'mb');
      if (s.gap && it.family !== 'galleria') spaceSel(it.id === 'prodotti' ? 'Spazio tra le card' : 'Spazio tra gli elementi', 'gap');
      if (it.family === 'galleria') { /* 10/11/2026 (Ruggi): nella Galleria lo spazio tra gli elementi si regola in orizzontale e in verticale, dentro Spaziatura */
        it.g = it.g || {}; var gLabs = SPACE_LABELS.filter(function (l) { return l !== '2XL' && l !== '3XL'; });
        [['gx', 'Spazio tra gli elementi (orizzontale)'], ['gy', 'Spazio tra gli elementi (verticale)']].forEach(function (q) {
          var k = q[0], cur0 = it.g[k] ? (it.g[k] === 'none' ? 'Nessuno' : it.g[k].toUpperCase()) : 'Tema';
          function gApply() { var d0 = doc(); if (d0) applyGallery(d0, it); editedNow(); }
          var sg = makeSelect(q[1], gLabs, cur0, function (v) { it.g[k] = v === 'Tema' ? null : v === 'Nessuno' ? 'none' : v.toLowerCase(); gApply(); });
          field(gs, q[1], sg.el, function () { return !!it.g[k]; }, function () { it.g[k] = null; sg.value = 'Tema'; gApply(); });
        });
      }
    }
    var rz = document.createElement('div'); rz.className = 'editor-section-reset-zone'; rz.hidden = true;
    var rb2 = document.createElement('button'); rb2.type = 'button'; rb2.className = 'btn-ghost editor-section-reset'; rb2.textContent = 'Ripristina sezione';
    rb2.addEventListener('click', function () {
      it.ov = { c: {}, p: {} }; if (it.id === 'identita') { state.color = ''; paintAll(); touch(); } var d = doc(); if (d) applyOv(d, it); editedNow(); buildControls(it, true);
    });
    rz.appendChild(rb2); host.appendChild(rz); refreshers.push(function () { rz.hidden = !(ovCount(it) || (it.id === 'identita' && state.color)); });  /* 7/11/2026 (Ruggi): «Ripristina sezione» torna in fondo al pannello, ghost e con divider sopra (come Colori/Font in Generali) */
    addDeleteZone(host, it);
    refreshers.forEach(function (r) { r(); });
  }
  function dashed(n) { var d = document.createElement('li'); d.className = 'editor-struct-block'; d.setAttribute('data-dash', n); d.setAttribute('aria-hidden', 'true'); return d; }
  function renderStructure(focusId) {
    structList.innerHTML = '';
    STRUCT.forEach(function (it) {
      var li = document.createElement('li'); li.className = 'editor-struct-row ' + (it.fixed ? 'is-fixed' : 'is-movable'); li.setAttribute('data-id', it.id);
      li.tabindex = 0; li.setAttribute('tabindex', '0');
      li.addEventListener('click', function () { selectRow(it.id); });
      li.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && (e.target === li || e.target.classList.contains('editor-struct-grip'))) { e.preventDefault(); selectRow(it.id); } });
      if (it.fixed) { li.innerHTML = LOCK + '<span class="editor-struct-label"></span>'; fillLabel($('.editor-struct-label', li), it.label); li.setAttribute('data-tooltip', it.note || 'Questa sezione non si sposta'); }
      else {
        li.draggable = true; li.removeAttribute('tabindex');
        li.innerHTML = '<button type="button" class="editor-struct-grip" aria-label="Sposta «' + it.label + '» (frecce su e giù)">' + GRIP + '</button><span class="editor-struct-label"></span>'; fillLabel($('.editor-struct-label', li), it.label);
        li.addEventListener('dragstart', function (e) { dragId = it.id; li.classList.add('is-dragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.id); } catch (x) {} });
        li.addEventListener('dragend', function () { dragId = null; $$('.is-dragging', structList).forEach(function (x) { x.classList.remove('is-dragging'); }); });
        $('.editor-struct-grip', li).addEventListener('keydown', function (e) {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return; e.preventDefault();
          var i = idxOf(it.id), b = bounds(), to = i + (e.key === 'ArrowUp' ? -1 : 1);
          if (to < b[0] || to > b[1] - 1) return; moveTo(it.id, to); syncDom(it.id); $('.editor-struct-grip', li).focus();
        });
      }
      li.addEventListener('dragover', function (e) {
        if (!dragId || dragId === it.id || it.id === 'navbar') return; e.preventDefault();
        var r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        if (it.id === START) after = true; if (it.id === 'footer') after = false;
        var cur = idxOf(dragId), tgt = idxOf(it.id) + (after ? 1 : 0); if (cur < tgt) tgt -= 1;
        if (cur === tgt) return; moveTo(dragId, tgt); syncDom(dragId);
      });
      if (ANCHOR && it.id === ANCHOR) structList.appendChild(dashed('d2')); /* linea sopra Prodotti: sempre, in coppia con quella sotto il blocco precedente (d1), come sotto Prodotti (d3 + d4) */
      if (START && it.id === 'footer') structList.appendChild(dashed('d4')); /* linea sopra Footer */
      if (selId === it.id) { li.classList.add('is-selected'); li.setAttribute('aria-current', 'true'); }
      structList.appendChild(li);
      if (it.id === START) structList.appendChild(dashed('d1')); /* linea sotto l'ultima voce fissa iniziale */
      if (ANCHOR && it.id === ANCHOR) structList.appendChild(dashed('d3')); /* linea sotto Prodotti */
    });
  }
  structList.addEventListener('drop', function (e) { e.preventDefault(); });
  renderStructure(); renderStructTitle();

  /* ---- pannello: apri / chiudi ---- */
  /* 22:24 (Ruggi): il pannello resta APERTO anche nella lista (la chiusura di default del 22:20 e' stata annullata). */
  var listAutoClosed = false;
  function setPanelOpen(o) { var t = $('#panelToggle'); $('#editorShell').classList.toggle('panel-closed', !o); t.classList.toggle('is-active', !!o); t.setAttribute('aria-pressed', String(!!o)); }
  $('#panelToggle').addEventListener('click', function () { listAutoClosed = false; setPanelOpen($('#editorShell').classList.contains('panel-closed')); });
  $('#panelCloseBtn').addEventListener('click', function () { $('#panelToggle').click(); }); /* la X fa lo stesso del toggle della toolbar (stato condiviso) */
  /* 1/11/2026: niente piu' tab Pagina / Sezioni: il pannello segue la selezione (renderPanel). */
  /* SIMULAZIONE wireframe: "Collega Stripe" ricarica con ?stripe=on (stesso interruttore di prova di prima); nel prodotto porta al flusso Stripe. */
  $('#stripeConnectBtn').addEventListener('click', function () { var u = new URL(location.href); u.searchParams.set('stripe', 'on'); location.href = u.toString(); });
  /* banner Stripe (standard panel-alert): X = nasconde per questa visita; "Non mostrare più" = lo ricorda (localStorage, solo preferenza per-visitatore) */
  $('#noTirClose').addEventListener('click', function () { if (dispProd) { noTirSession[dispProd.id] = true; renderPanel(); } });
  $('#noTirDismiss').addEventListener('click', function () { if (dispProd) { noTirDismissed[dispProd.id] = true; try { localStorage.setItem(NTKEY, JSON.stringify(noTirDismissed)); } catch (e) {} renderPanel(); } });
  $('#stripeCloseBtn').addEventListener('click', function () { stripeDismissed = true; renderPublish(); });
  $('#stripeDismissBtn').addEventListener('click', function () { stripeDismissed = true; try { localStorage.setItem(DKEY, '1'); } catch (e) {} renderPublish(); });
  $('#nameBannerClose').addEventListener('click', function () { nameBannerOpen = false; syncNameBanner(); });
  $('#nameBannerDismiss').addEventListener('click', function () { nameBannerOff = true; nameBannerOpen = false; syncNameBanner(); try { localStorage.setItem(NBKEY, '1'); } catch (e) {} });

  /* ---- pannello: contenuto (invariato rispetto all'editor di prima) ---- */
  function renderSwatches() {
    var sw = $('#swatches'); if (!sw) return; sw.innerHTML = '';
    THEMES[state.theme].heroColors.forEach(function (c) { /* colori ammessi dal tema per la copertina (blocco Identità) */
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bottega-swatch'; b.style.setProperty('--sw', c.hex);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c.label); b.setAttribute('data-tooltip', c.label); b.setAttribute('aria-checked', String(c.id === heroTone()));
      b.addEventListener('click', function () { state.color = c.id; $$('.bottega-swatch', sw).forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); paintAll(); touch(); });
      sw.appendChild(b);
    });
  }
  $('#panelThemeName').textContent = THEMES[state.theme].name;
  $('#slugCopyBtn').addEventListener('click', function () { var b = this; try { navigator.clipboard.writeText('contenomy.it/' + state.slug); } catch (e) {} b.classList.add('is-copied'); b.setAttribute('aria-label', 'Link copiato'); clearTimeout(b._t); b._t = setTimeout(function () { b.classList.remove('is-copied'); b.setAttribute('aria-label', 'Copia link'); }, 2000); });
  /* Ripristina: un solo pulsante in fondo a ogni sezione (Colori, Font); compare solo se almeno un valore è diverso dal predefinito */
  function sectionReset(host, label, isDirty, restore, countFn) {
    /* 30/10/2026 (Ruggi): Ripristina = primary (lilla), tutta larghezza, struttura di #panelEditProductBtn (testo + .panel-action-count). Il numero = colori di SISTEMA modificati (gli Aggiuntivi non si ripristinano, quindi non si contano). Divider sopra, compare solo quando serve. */
    var zone = document.createElement('div'); zone.className = 'editor-section-reset-zone'; zone.hidden = true;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn-ghost editor-section-reset'; /* 7/11/2026 (Ruggi): Ripristina in Generali (Colori, Font) = ghost, non più primary lilla */
    var t = document.createElement('span'); t.textContent = 'Ripristina ' + label; b.appendChild(t);
    var cnt = null; if (countFn) { b.appendChild(document.createTextNode(' ')); cnt = document.createElement('span'); cnt.className = 'panel-action-count'; b.appendChild(cnt); }
    b.addEventListener('click', function () { restore(); zone.hidden = true; });
    zone.appendChild(b); host.appendChild(zone);
    return function () { zone.hidden = !isDirty(); if (cnt) cnt.textContent = countFn(); };
  }

  /* Colori (WIREFRAME, non collegato al tema): Sfondo + 8 Secondari (colori di SISTEMA, slot del tema) + "Aggiuntivi" (colori creati da Ruggi, estesi a tutto il tema).
     29/10/2026 (Ruggi): regole.
     - Sistema: non si elimina, si SOSTITUISCE con un altro colore (alias: i due coincidono e nei selettori delle sezioni resta un cerchio solo). Mai vacante. Sfondo: solo modificabile.
     - Aggiuntivi: si aggiungono e si eliminano; se in uso, l'eliminazione chiede il colore con cui sostituirlo. Numerazione automatica (Aggiuntivo 1, 2, ...).
     - Ripristina: per riga (icona on-hover, solo se il colore e' cambiato: hex o alias) e generale in fondo (solo colori di sistema, mai gli Aggiuntivi) con avviso + Annulla.
     - Azioni di riga = stesso schema della maschera delle tabelle (pannello pieno con sfondo della riga in hover, hover icone neutro).
     "Usato in N sezioni" e' SIMULATO (il wireframe non lega ancora i colori alle sezioni): dal secondo Aggiuntivo in poi risulta in uso, per poter provare la sostituzione obbligatoria. Collegamento: colorSlots nel manifest + ink/paper separati per ruolo. */
  (function () {
    var SYS = [
      { id: 'sfondo', name: 'Sfondo', use: 'Pagina e navbar', def: '#000000', fixed: true },
      { group: 'Secondari', id: 's1', name: 'Secondario 1', use: 'Sezioni, evidenze e focus', def: '#f7d247' },
      { id: 's2', name: 'Secondario 2', use: 'Sezioni e decorazioni', def: '#ec6c2c' },
      { id: 's3', name: 'Secondario 3', use: 'Sezioni, conferme e accesso prioritario', def: '#57be58' },
      { id: 's4', name: 'Secondario 4', use: 'Sezioni e decorazioni', def: '#73b4e6' },
      { id: 's5', name: 'Secondario 5', use: 'Sezioni e decorazioni', def: '#d6a8b0' },
      { id: 's6', name: 'Secondario 6', use: 'Sezioni e decorazioni', def: '#704bb8' },
      { id: 's7', name: 'Secondario 7', use: 'Sezioni e decorazioni', def: '#294183' },
      { id: 's8', name: 'Secondario 8', use: 'Sezioni ed errori nei campi', def: '#c83f2b' }
    ];
    SYS.forEach(function (c) { c.hex = c.def; c.alias = null; c.rname = null; c.sys = true; }); /* rname = nome dato da Ruggi alla voce quando la sostituisce con un colore nuovo (il nome segue il colore) */
    var CUS = [], seq = 0, rows = {};
    var host = $('#colorRows'), list = document.createElement('div'), pop = null, popOff = null, popScroll = null, refresh = null;
    host.style.position = 'relative'; list.className = 'editor-color-list'; host.appendChild(list);
    var I = {
      swap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg>',
      undo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
      trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>'
    };
    function all() { return SYS.concat(CUS); }
    function byId(id) { return all().filter(function (c) { return c.id === id; })[0]; }
    function nameOf(c) { return c.sys ? (c.rname || c.name) : (c.name || 'Aggiuntivo ' + (CUS.indexOf(c) + 1)); }
    function dispName(c) { return c.alias ? nameOf(root(c)) : nameOf(c); } /* nome mostrato nei dropdown: se e' sostituita da un altro colore, quello */
    function reserved() { return all().map(nameOf).concat(SYS.filter(function (c) { return c.rname; }).map(function (c) { return c.name; })); } /* i nomi originali restano riservati: il Ripristina li rimette */
    function root(c) { var n = 0; while (c.alias && n++ < 20) c = byId(c.alias); return c; }
    function effHex(c) { return root(c).hex; }
    function dependents(c) { return all().filter(function (x) { return x.alias === c.id; }); }
    function dirty(c) { return c.sys && (c.hex.toLowerCase() !== c.def.toLowerCase() || !!c.alias || !!c.rname); }
    function anyDirty() { return SYS.some(dirty); }
    function popKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closePop(); } }
    function closePop() { if (pop) { pop.remove(); pop = null; } if (popOff) { document.removeEventListener('mousedown', popOff, true); document.removeEventListener('keydown', popKey, true); popOff = null; } if (popScroll) { document.removeEventListener('scroll', popScroll, true); popScroll = null; } }
    /* scelta del colore con cui sostituire: colori "reali" (non alias) diversi da quello in questione */
    function openPicker(row, c, heading, onPick) {
      closePop();
      var targets = all().filter(function (x) { return !x.alias && x !== c; }), cur = root(c);
      pop = document.createElement('div'); pop.className = 'editor-color-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', heading);
      var h = document.createElement('p'); h.className = 'editor-pages-title'; /* titoletto = quello del pannello Pagine (12px muted, padding space-2/space-3, allineato al testo delle voci) */ h.textContent = heading; pop.appendChild(h);
      var ul = document.createElement('ul'); ul.setAttribute('role', 'listbox'); ul.setAttribute('aria-label', heading);
      targets.forEach(function (x) {
        var li = document.createElement('li'); li.setAttribute('role', 'option'); li.tabIndex = 0; li.setAttribute('aria-selected', String(x === cur && c.alias != null));
        li.innerHTML = '<span class="editor-color-pop-sw" style="--sw:' + x.hex + '"></span><span class="editor-color-pop-name"></span><span class="panel-field-label editor-color-hex"></span>';
        $('.editor-color-pop-name', li).textContent = nameOf(x); $('.editor-color-hex', li).textContent = x.hex;
        function pick() { closePop(); onPick(x); }
        li.addEventListener('click', pick);
        li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } else if (e.key === 'ArrowDown' && li.nextSibling) { e.preventDefault(); li.nextSibling.focus(); } else if (e.key === 'ArrowUp' && li.previousSibling) { e.preventDefault(); li.previousSibling.focus(); } });
        ul.appendChild(li);
      });
      pop.appendChild(ul); host.appendChild(pop);
      pop.style.top = (row.offsetTop + row.offsetHeight + 4) + 'px'; try { pop.scrollIntoView({ block: 'nearest' }); } catch (err) {}
      var me = pop;
      popOff = function (e) { if (!me.contains(e.target)) closePop(); };
      setTimeout(function () { if (pop !== me) return; document.addEventListener('mousedown', popOff, true); document.addEventListener('keydown', popKey, true); var f = $('li', me); if (f) f.focus(); }, 0);
    }
    /* 30/10/2026 (Ruggi): "Aggiungi colore" apre un pannello vicino al pulsante, con lo stile della modale (titolo + X, divider, corpo, footer con il pulsante di conferma): Nome + Colore (cerchio con esadecimale, in hover come le righe; apre il selettore nativo). Niente descrizione. WIREFRAME: i colori non sono ancora collegati al tema. */
    function openNew(btn) {
      closePop();
      openNewColorPanel(btn, {
        prefix: function () { return 'Aggiuntivo'; },
        names: function () { return reserved(); },
        groups: function () { return [{ title: 'Colori di sistema', items: SYS.map(function (c) { return { name: dispName(c), hex: effHex(c) }; }) }, { title: 'Aggiuntivi generali', items: CUS.map(function (c) { return { name: nameOf(c), hex: effHex(c) }; }) }]; },
        duplicate: function (h) { var d = all().filter(function (x) { return !x.alias && x.hex.toLowerCase() === h; })[0]; return d ? nameOf(d) : null; },
        onConfirm: function (h, nm) { CUS.push({ id: 'c' + (++seq), hex: h, name: nm, uses: CUS.length % 2 === 1 ? 2 : 0 }); render(); }
      });
    }
    /* 30/10/2026 (Ruggi): "Sostituisci colore" = stesso pannello di "Nuovo colore" (sempre a lato): Nome, Colore, dropdown Colori esistenti, pulsante Sostituisci. Il nome segue il colore: con un esadecimale nuovo la voce prende il nome dato (segnaposto "Aggiuntivo N"); se coincide con un colore esistente diventa un alias di quello (Nome disattivato). Prima prova sui colori di sistema, poi si estende a locali/Aggiuntivi. */
    function openReplace(btn, c) {
      closePop();
      function matchColor(h) { return all().filter(function (x) { return !x.alias && x !== c && x.hex.toLowerCase() === h; })[0] || null; }
      openNewColorPanel(btn, {
        title: 'Sostituisci colore', confirmLabel: 'Sostituisci', initial: effHex(c), rightOf: $('.editor-panel'), /* sempre a lato: a sinistra del pannello dell'editor, mai sopra la lista (il pulsante sta a destra della riga) */
        prefix: function () { return 'Aggiuntivo'; },
        names: function () { return reserved(); },
        groups: function () { return [{ title: 'Colori di sistema', items: SYS.map(function (x) { return { name: dispName(x), hex: effHex(x) }; }) }, { title: 'Aggiuntivi generali', items: CUS.map(function (x) { return { name: nameOf(x), hex: effHex(x) }; }) }]; },
        duplicate: function () { return null; },
        match: function (h) { var m = matchColor(h); return m ? { name: nameOf(m), hex: m.hex } : null; },
        from: function () { return { name: nameOf(c), hex: effHex(c) }; },
        onConfirm: function (h, nm, gen, typed) {
          var m = matchColor(h), prev = { hex: c.hex, alias: c.alias, rname: c.rname }, before = dispName(c), msg;
          if (m) { if (c.alias === m.id) return; c.alias = m.id; c.rname = null; msg = before + ' sostituito con ' + nameOf(m); }
          else {
            if (!c.alias && h === c.hex.toLowerCase() && !typed) return; /* stesso colore, nessun nome: niente da fare */
            c.alias = null; c.hex = h; c.rname = nm; msg = before + ' sostituito con ' + nm;
          }
          render(); showToast(msg, function () { c.hex = prev.hex; c.alias = prev.alias; c.rname = prev.rname; render(); });
        }
      });
    }
    function actBtn(icon, label, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'icon-btn editor-color-act'; b.setAttribute('data-tooltip', label); b.setAttribute('aria-label', label); b.innerHTML = icon;
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); }); return b;
    }
    function removeCustom(c) {
      var deps = dependents(c), inUse = c.uses > 0 || deps.length > 0;
      function doDelete(target) { if (target) deps.forEach(function (d) { d.alias = target.id; }); CUS.splice(CUS.indexOf(c), 1); render(); }
      if (!inUse) { doDelete(null); return; }
      var n = c.uses + deps.length;
      openPicker(rows[c.id], c, 'Usato in ' + n + (n === 1 ? ' sezione' : ' sezioni') + ': scegli il colore con cui sostituirlo', doDelete);
    }
    function buildRow(c, sub) {
      var row = document.createElement('div'); row.className = 'panel-field-row editor-color-row' + (sub ? ' is-sub' : ''); rows[c.id] = row;
      row.innerHTML = '<label class="bottega-swatch" data-tooltip="Cambia colore"><input type="color" class="editor-color-input"></label>' +
        '<span class="editor-color-text"><span class="panel-field-value"></span><span class="panel-field-label editor-color-use"></span></span>' +
        '<span class="editor-color-meta"><span class="editor-color-alias"></span><span class="panel-field-label editor-color-hex"></span></span><span class="editor-color-actions"></span>';
      var inp = $('input', row), acts = $('.editor-color-actions', row);
      inp.addEventListener('input', function () { c.hex = inp.value; sync(); });
      row.addEventListener('click', function (e) {
        if (e.target.closest('.editor-color-actions') || e.target.closest('.bottega-swatch') || c.alias) return;
        try { inp.showPicker(); } catch (err) { inp.click(); }
      });
      if (c.sys) {
        if (!c.fixed) { var sb = actBtn(I.swap, 'Sostituisci colore', function (b) { openReplace(b, c); }); acts.appendChild(sb); }
        var rb = actBtn(I.undo, 'Ripristina', function () { c.hex = c.def; c.alias = null; c.rname = null; render(); }); rb.classList.add('is-restore'); acts.appendChild(rb);
      } else {
        acts.appendChild(actBtn(I.trash, 'Elimina', function () { removeCustom(c); }));
      }
      return row;
    }
    function sync() {
      all().forEach(function (c) {
        var row = rows[c.id]; if (!row) return;
        var al = c.alias ? byId(c.alias) : null, inp = $('input', row), deps = dependents(c), use;
        $('.bottega-swatch', row).style.setProperty('--sw', effHex(c));
        inp.value = effHex(c); inp.disabled = !!al; row.classList.toggle('is-alias', !!al);
        inp.setAttribute('aria-label', nameOf(c));
        $('.panel-field-value', row).textContent = nameOf(c);
        $('.editor-color-hex', row).textContent = effHex(c); /* 29/10/2026 (Ruggi): l'hex c'e' sempre; se il colore e' sostituito, sopra compare il nome di quello che lo sostituisce (lilla) */
        /* 30/10/2026 (Ruggi): colore di sistema cambiato col selettore (nessun alias) = valore personalizzato: sopra l'hex compare "Aggiuntivo" in lilla, come il nome del sostituto */
        $('.editor-color-alias', row).textContent = al ? nameOf(root(c)) : (c.sys && c.hex.toLowerCase() !== c.def.toLowerCase() ? 'Aggiuntivo' : '');
        if (c.sys) use = c.use;
        else { var n = c.uses + deps.length; use = n ? 'Usato in ' + n + (n === 1 ? ' sezione' : ' sezioni') : 'Non in uso'; }
        $('.editor-color-use', row).textContent = use;
        var rb = $('.is-restore', row); if (rb) rb.hidden = !dirty(c);
      });
      if (refresh) refresh();
    }
    function title(t) { var g = document.createElement('h3'); g.className = 'panel-section-title editor-color-group'; g.textContent = t; return g; }
    function render() {
      closePop(); list.innerHTML = ''; rows = {};
      /* 29/10/2026 (Ruggi): il pulsante nero sm "+ Aggiungi colore" sta in fondo alla lista; "Aggiuntivi" compare, senza pulsante, solo quando esiste almeno un colore aggiunto. */
      function addButton() {
        var add = document.createElement('button'); add.type = 'button'; add.className = 'btn-pill-dark sm secondary bottega-add-link editor-color-addbtn';
        add.setAttribute('aria-haspopup', 'dialog');
        add.innerHTML = '<svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Aggiungi colore';
        add.addEventListener('click', function () { openNew(add); });
        return add;
      }
      /* 30/10/2026 (Ruggi): un colore di sistema sostituito da un altro colore non ha piu' la riga al suo posto (sarebbe un doppione identico): compare come sotto-riga sotto il colore che lo sostituisce (rientrata, cerchio piccolo, solo nome + esadecimale, con un raccordo che la lega al colore) e mantiene il Ripristina. Nei selettori delle sezioni i due sono un cerchio solo. */
      function appendSubs(r) {
        var subs = SYS.filter(function (x) { return x.alias && root(x) === r; });
        subs.forEach(function (x, i) { var sr = buildRow(x, true); if (i === subs.length - 1) sr.classList.add('is-sub-last'); list.appendChild(sr); });
      }
      SYS.forEach(function (c) {
        if (c.group) list.appendChild(title(c.group));
        if (c.alias) return;
        list.appendChild(buildRow(c)); appendSubs(c);
      });
      if (CUS.length) list.appendChild(title('Aggiuntivi'));
      CUS.forEach(function (c) { list.appendChild(buildRow(c)); appendSubs(c); });
      list.appendChild(addButton()); /* 29/10/2026 (Ruggi): "+ Aggiungi colore" in fondo a tutta la lista, a sinistra, distanziato space-8 dall'ultimo colore (il pulsante e' in revisione di dimensioni) */
      sync();
    }
    render();
    COLORS_API.customs = function () { return CUS.map(function (c) { return { hex: c.hex, name: nameOf(c) }; }); };
    COLORS_API.system = function () { return SYS.map(function (c) { return { name: dispName(c), hex: effHex(c) }; }); };
    COLORS_API.names = reserved;
    COLORS_API.add = function (hex, nm) { CUS.push({ id: 'c' + (++seq), hex: hex, name: nm, uses: 1 }); render(); };
    refresh = sectionReset(host, 'colori del tema', anyDirty, function () {
      var snap = SYS.map(function (c) { return { hex: c.hex, alias: c.alias, rname: c.rname }; });
      SYS.forEach(function (c) { c.hex = c.def; c.alias = null; c.rname = null; }); render();
      showToast('Colori del tema ripristinati', function () { SYS.forEach(function (c, i) { c.hex = snap[i].hex; c.alias = snap[i].alias; c.rname = snap[i].rname; }); render(); });
    }, function () { return SYS.filter(dirty).length; });
    refresh();
  })();
  /* 29/10/2026 (Ruggi): dropdown CUSTOM, stesso pattern del Corriere in Ordini (ordini-statico: bottone + listbox, pannello bianco con ombra elevation, hover sulle voci, voce selezionata semibold); la freccia rispetta il padding orizzontale di .bottega-input (space-3). */
  var CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var allSelects = [];
  function makeSelect(label, options, value, onChange) {
    var wrap = document.createElement('div'); wrap.className = 'editor-select';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bottega-input editor-select-btn'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', label);
    var val = document.createElement('span'); val.className = 'editor-select-value'; btn.appendChild(val); btn.insertAdjacentHTML('beforeend', CHEV);
    var menu = document.createElement('ul'); menu.className = 'editor-select-menu'; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', label); menu.hidden = true;
    var cur = value;
    options.forEach(function (o) {
      var li = document.createElement('li'); li.setAttribute('role', 'option'); li.tabIndex = -1; li.textContent = o;
      li.addEventListener('click', function () { set(o); setOpen(false); btn.focus(); if (onChange) onChange(o); });
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } else if (e.key === 'ArrowDown' && li.nextSibling) { e.preventDefault(); li.nextSibling.focus(); } else if (e.key === 'ArrowUp' && li.previousSibling) { e.preventDefault(); li.previousSibling.focus(); } });
      menu.appendChild(li);
    });
    function set(v) { cur = v; val.textContent = v; Array.prototype.forEach.call(menu.children, function (li) { li.setAttribute('aria-selected', String(li.textContent === v)); }); }
    /* 24/11/2026 (Ruggi): nella modale «Aggiungi una sezione» il pannello del dropdown sta sopra ai contenuti (position: fixed, non tagliato dalla colonna che scorre); le coordinate si calcolano all'apertura, e se sotto non c'è spazio si apre verso l'alto */
    function place() {
      if (!wrap.closest('.editor-modal-controls')) return;
      var r = btn.getBoundingClientRect(), h = menu.offsetHeight, gap = 4;
      var up = r.bottom + gap + h > window.innerHeight - 8 && r.top - gap - h > 8;
      menu.style.left = r.left + 'px'; menu.style.width = r.width + 'px';
      menu.style.top = (up ? r.top - gap - h : r.bottom + gap) + 'px';
    }
    function setOpen(o) { menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); if (o) { place(); var s = menu.querySelector('[aria-selected="true"]') || menu.firstChild; if (s) s.focus({ preventScroll: true }); } }
    window.addEventListener('resize', function () { if (!menu.hidden) place(); });
    document.addEventListener('scroll', function (e) { if (!menu.hidden && !menu.contains(e.target) && wrap.closest('.editor-modal-controls')) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } }, true);
    btn.addEventListener('click', function () { var o = menu.hidden; allSelects.forEach(function (x) { x.close(); }); setOpen(o); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); setOpen(false); btn.focus(); } });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    set(value); wrap.appendChild(btn); wrap.appendChild(menu);
    var api = { el: wrap, get value() { return cur; }, set value(v) { set(v); }, close: function () { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } };
    allSelects.push(api); return api;
  }
  /* Font (WIREFRAME, non collegato al tema): tipologie (Titoli, Testo) con scelta da elenco e Ripristina di sezione. Le opzioni sono i font presenti nel progetto; per ora il manifest ha fonts.selectable = false. */
  (function () {
    var ROLES = [
      { name: 'Titoli', use: 'Titoli, logo in navbar, numeri ed etichette', def: 'Barlow Condensed Black', options: ['Barlow Condensed Black', 'Archivo'] },
      { name: 'Testo', use: 'Testo corrente, pulsanti e filtri', def: 'Switzer', options: ['Switzer'] }
    ];
    var host = $('#fontRows'), sels = [];
    ROLES.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'editor-font-row';
      row.innerHTML = '<span class="panel-field-label">' + r.name + '</span><div class="editor-slug-row"></div>';
      var sel = makeSelect('Font: ' + r.name, r.options, r.def, function () { refresh(); });
      sels.push({ sel: sel, def: r.def });
      $('.editor-slug-row', row).appendChild(sel.el);
      host.appendChild(row);
    });
    var refresh = sectionReset(host, 'font', function () { return sels.some(function (x) { return x.sel.value !== x.def; }); }, function () { sels.forEach(function (x) { x.sel.value = x.def; }); });
  })();
  $('#panelSlug').value = state.slug;
  $('#panelSlug').addEventListener('input', function (e) { state.slug = slugify(e.target.value); state.slugTouched = true; touch(); });
  $('#panelSlug').addEventListener('blur', function (e) { e.target.value = state.slug; });

  function assetBtn(kind) { var b = $(kind === 'logo' ? '#panelLogoBtn' : '#panelFaviconBtn'); b.textContent = state[kind] ? 'Cambia' : 'Scegli file'; }
  /* 4/11/2026 (Ruggi): riga Favicon ripristinata in Marchio (tolta il 29/10 «in revisione»). */
  [['logo', '#panelLogoBtn', '#logoInput'], ['favicon', '#panelFaviconBtn', '#faviconInput']].forEach(function (x) {
    $(x[1]).addEventListener('click', function () { $(x[2]).click(); });
    $(x[2]).addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { state[x[0]] = rd.result; assetBtn(x[0]); paintAll(); touch(); }; rd.readAsDataURL(f); e.target.value = '';
    });
    assetBtn(x[0]);
  });

  var X_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  function renderSocial(focusLast) {
    var host = $('#panelSocialList'); host.innerHTML = '';
    state.social.forEach(function (url, i) {
      var row = document.createElement('div'); row.className = 'bottega-social-row';
      var inp = document.createElement('input'); inp.className = 'bottega-input'; inp.type = 'url'; inp.value = url; inp.placeholder = 'https://…'; inp.setAttribute('aria-label', 'Link social ' + (i + 1));
      inp.addEventListener('input', function () { state.social[i] = inp.value; paintAll(); touch(); });
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'bottega-remove-btn'; rm.innerHTML = X_SVG; rm.setAttribute('aria-label', 'Rimuovi link');
      rm.addEventListener('click', function () { state.social.splice(i, 1); renderSocial(); paintAll(); touch(); });
      row.appendChild(inp); row.appendChild(rm); host.appendChild(row);
    });
    if (focusLast) { var l = $$('input', host); if (l.length) l[l.length - 1].focus(); }
  }
  /* Contatti: precompilati con quelli delle impostazioni della piattaforma (qui dati di prova), modificabili. Tipo (Email / Telefono / Indirizzo) + valore, quanti ne servono; compaiono nel footer del tema */
  /* 29/10/2026 (Ruggi): contatti rifatti. Il TIPO si sceglie quando si aggiunge (menu del pulsante) e poi non cambia; ogni contatto = etichetta del tipo + campo a tutta larghezza + ×. Telefono = gruppo input con prefisso (+39, modificabile per i numeri esteri). Errori sotto il campo, alla perdita del focus. Un contatto non valido resta nella bozza ma NON compare nel footer del tema (non blocca Pubblica). */
  var PHONE_DEF_PREFIX = '+39';
  function splitPhone(v) { var m = /^\s*(\+\d{1,3})\s*(.*)$/.exec(v || ''); return m ? { p: m[1], n: m[2] } : { p: PHONE_DEF_PREFIX, n: (v || '').trim() }; }
  function joinPhone(p, n) { n = n.trim(); return n ? (p.trim() || PHONE_DEF_PREFIX) + ' ' + n : ''; }
  function contactError(c) {
    var v = (c.v || '').trim(); if (!v) return '';
    if (c.t === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Inserisci un’email valida, ad esempio nome@esempio.it.';
    if (c.t === 'telefono') { var ph = splitPhone(v), digits = ph.n.replace(/\D/g, ''); return (/^\+\d{1,3}$/.test(ph.p) && /^[\d\s]+$/.test(ph.n) && digits.length >= 6 && digits.length <= 12) ? '' : 'Controlla il numero: servono un prefisso come +39 e da 6 a 12 cifre.'; }
    return '';
  }
  function renderContatti(focusLast) {
    var host = $('#panelContattiList'); host.innerHTML = '';
    state.contatti.forEach(function (c, i) {
      var k = CONTACT_TYPES[c.t], row = document.createElement('div'); row.className = 'editor-contact';
      var lab = document.createElement('span'); lab.className = 'panel-field-label'; lab.textContent = k.label;
      var line = document.createElement('div'); line.className = 'editor-slug-row';
      var err = document.createElement('p'); err.className = 'editor-field-error'; err.id = 'contactErr' + i; err.hidden = true;
      var field, inp;
      if (c.t === 'telefono') {
        var ph = splitPhone(c.v);
        field = document.createElement('div'); field.className = 'bottega-input-group';
        var pre = document.createElement('input'); pre.className = 'bottega-input editor-phone-prefix'; pre.type = 'text'; pre.inputMode = 'tel'; pre.value = ph.p; pre.setAttribute('aria-label', 'Prefisso del telefono ' + (i + 1));
        inp = document.createElement('input'); inp.className = 'bottega-input'; inp.type = 'tel'; inp.value = ph.n; inp.placeholder = '02 0000 0000'; inp.setAttribute('aria-label', 'Telefono ' + (i + 1));
        var upd = function () { c.v = joinPhone(pre.value, inp.value); if (!err.hidden) check(); paintAll(); touch(); };
        pre.addEventListener('input', upd); inp.addEventListener('input', upd);
        pre.addEventListener('blur', function () { if (!pre.value.trim()) pre.value = PHONE_DEF_PREFIX; upd(); check(); });
        field.addEventListener('focusout', function (e) { if (!field.contains(e.relatedTarget)) check(); });
        field.appendChild(pre); field.appendChild(inp);
      } else {
        inp = document.createElement('input'); inp.className = 'bottega-input'; inp.type = k.type; inp.value = c.v; inp.placeholder = k.ph; inp.setAttribute('aria-label', k.label + ' ' + (i + 1));
        inp.addEventListener('input', function () { c.v = inp.value; if (!err.hidden) check(); paintAll(); touch(); });
        inp.addEventListener('blur', check);
        field = inp;
      }
      function check() { var m = contactError(c); err.hidden = !m; err.textContent = m; row.classList.toggle('is-invalid', !!m); $$('input', field.tagName === 'INPUT' ? row : field).forEach(function (x) { x.setAttribute('aria-invalid', String(!!m)); if (m) x.setAttribute('aria-describedby', err.id); else x.removeAttribute('aria-describedby'); }); }
      field.style.flex = '1'; field.style.minWidth = '0';
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'bottega-remove-btn'; rm.innerHTML = X_SVG; rm.setAttribute('aria-label', 'Rimuovi contatto: ' + k.label.toLowerCase());
      rm.addEventListener('click', function () { state.contatti.splice(i, 1); renderContatti(); paintAll(); touch(); });
      line.appendChild(field); line.appendChild(rm); row.appendChild(lab); row.appendChild(line); row.appendChild(err); host.appendChild(row);
      if (c.v) check();
    });
    if (focusLast) { var l = $$('.editor-contact', host).pop(); if (l) { var f = $('input:not(.editor-phone-prefix)', l); if (f) f.focus(); } }
  }
  /* pulsante «Aggiungi contatto»: apre un menu con i tipi (pannello e voci = dropdown custom del DS) */
  (function () {
    var btn = $('#addContattoBtn'), wrap = btn.parentNode, menu = document.createElement('ul');
    menu.className = 'editor-select-menu editor-add-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Tipo di contatto'); menu.hidden = true;
    Object.keys(CONTACT_TYPES).forEach(function (t) {
      var li = document.createElement('li'); li.setAttribute('role', 'menuitem'); li.tabIndex = -1; li.textContent = CONTACT_TYPES[t].label;
      li.addEventListener('click', function () { close(); state.contatti.push({ t: t, v: '' }); renderContatti(true); });
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } else if (e.key === 'ArrowDown' && li.nextSibling) { e.preventDefault(); li.nextSibling.focus(); } else if (e.key === 'ArrowUp' && li.previousSibling) { e.preventDefault(); li.previousSibling.focus(); } });
      menu.appendChild(li);
    });
    wrap.appendChild(menu);
    function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () { var o = menu.hidden; menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); if (o) menu.firstChild.focus(); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); close(); btn.focus(); } });
  })();
  $('#addSocialBtn').addEventListener('click', function () { state.social.push(''); renderSocial(true); });

  /* ---- avvio ---- */
  if (THEME_ORDER.length) $('#editorDevice').appendChild(makeFrame(state.theme));
  renderSwatches(); renderSocial(); renderContatti(); renderName();
  saveMsg = rec ? 'Salvato' : 'Bottega di prova: non salvata';
  if (/[?&]setup=1\b/.test(location.search)) bannerWait = true; /* rientro dal flusso: il banner aspetta la chiusura dell'invito */
  renderPublish();
  if (/[?&]setup=2\b/.test(location.search)) { try { var s2 = new URL(location.href); s2.searchParams.delete('setup'); history.replaceState(null, '', s2.toString()); } catch (e) {} }
  if (/[?&]setup=1\b/.test(location.search) && isPublished()) { /* rientro dal flusso pagamenti: riapre l'invito sul passaggio successivo (o conferma se e' tutto fatto) */
    try { var su = new URL(location.href); su.searchParams.delete('setup'); history.replaceState(null, '', su.toString()); } catch (e) {}
    setTimeout(openSetup, 250);
  }
  useStruct(); renderStructure(); renderStructTitle(); renderBreadcrumb(); panelReady = true; renderPanel();
  /* link diretto dall'editor/Prodotti: ?prodotto=ID apre l'editor di quel prodotto */
  (function () { var id = (location.search.match(/[?&]prodotto=([^&]+)/) || [])[1]; if (!id) return; id = decodeURIComponent(id); var pr = PRODUCTS.filter(function (x) { return x.id === id; })[0]; if (pr && PKG[state.theme].pages.prodotto) setPage('prodotto', pr); })();
})();

/* 10/11/2026 (Ruggi): la piattaforma non deve MAI scorrere: un focus() o scrollIntoView() (anche da dentro l'anteprima o da una modale) puo' far scorrere la pagina o un contenitore con overflow:hidden, lasciando uno spazio vuoto sotto. Qui ogni scroll dei contenitori della shell viene riportato a zero. */
(function () {
  var SHELL = '.editor-shell, .editor-main, .editor-canvas, .editor-device, .editor-panel, .editor-shell .body';
  function fix(t) {
    try {
      if (t === document || t === window || t === document.documentElement || t === document.body || t === document.scrollingElement) {
        var se = document.scrollingElement || document.documentElement; if (se.scrollTop || se.scrollLeft) se.scrollTo(0, 0);
      } else if (t && t.nodeType === 1 && t.matches && t.matches(SHELL) && (t.scrollTop || t.scrollLeft)) { t.scrollTop = 0; t.scrollLeft = 0; }
    } catch (e) {}
  }
  document.addEventListener('scroll', function (e) { fix(e.target); }, true);
  window.addEventListener('scroll', function () { fix(document); }, { passive: true });
})();
