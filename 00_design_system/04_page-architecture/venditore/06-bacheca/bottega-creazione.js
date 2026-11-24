/* Bottega creazione — 13/10/2026. Wireframe: stato in memoria, nessun salvataggio.
   Flusso: vedi FLUSSO_CREAZIONE_BOTTEGA.md (proposta). Passi 1-3 = wizard, passo 4 = anteprima con pannello destro.
   Dati dimostrativi: nome/social precompilati dal "profilo". ?stripe=on simula Stripe connesso. */
(function () {
  'use strict';

  /* ---- Temi: caricati dai pacchetti (Temi/NN_tema/NN_tema_Package/package.js → window.ContenomyThemes[id]) ----
     Il manifest di ogni pacchetto è il contratto del tema: qui si legge soltanto, nessun dato di un tema è scritto a mano in questo file. */
  var PKG = window.ContenomyThemes || {};
  var THEMES = {};
  Object.keys(PKG).forEach(function (id) {
    var m = PKG[id].manifest, byId = {}, ident = m.pageModel.fixed.filter(function (b) { return b.id === 'identita'; })[0];
    m.palette.forEach(function (c) { byId[c.id] = c; });
    byId.ink = { id: 'ink', label: 'Nero', hex: '#000000', on: '#ffffff' };
    THEMES[id] = {
      name: m.name, cat: m.listing.categories, desc: m.listing.description, fit: m.listing.fit,
      sections: String(m.families.length), nComp: m.components.length,
      colors: m.palette, /* palette del tema */
      heroColors: (ident ? ident.axes[0].values.map(function (v) { return byId[v]; }).filter(Boolean) : m.palette), /* colori ammessi per la copertina (blocco Identità) */
      fontLabel: m.fonts.display.label + ' · ' + m.fonts.body.label, fontsSelectable: !!m.fonts.selectable
    };
  });
  var THEME_ORDER = Object.keys(THEMES);
  if (!THEME_ORDER.length) console.error('Pacchetto tema non caricato: controlla il percorso di package.js in bottega-creazione.html.');

  var STEP_TEXT = {
    1: ['Seleziona il tuo tema', 'Parti da una struttura già pronta: colori e testi li personalizzi dopo.'],
    2: ['Come si chiama la tua bottega?', 'Nome, indirizzo e una breve presentazione.'],
    3: ['Marchio e social', 'Tutto facoltativo: puoi aggiungerlo o cambiarlo anche dopo.'],
    4: ['Riepilogo', 'Controlla i dati prima di creare la bottega. Puoi modificarli quando vuoi.'],
    5: ['Anteprima della tua bottega', 'Modifica il colore dal pannello, i testi direttamente nell’anteprima.']
  };

  var state = {
    step: 1, theme: null,
    name: 'Ruggi', slug: 'ruggi', slugTouched: false, bio: '',
    logo: null, favicon: null,
    social: ['instagram.com/ruggi', 'behance.net/ruggi'],
    color: null, font: null, published: false,
    stripe: /[?&]stripe=on\b/.test(location.search)
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function slugify(v) {
    return String(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* ---- riferimenti ---- */
  var flow = $('#bottegaFlow'), body = $('#pageBody');
  var stepActions = $('#stepActions');
  var SOCIAL0 = state.social.join('|'); /* link precompilati: non contano come "campo inserito" nel passo 3 */
  var ICON_TRASH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>';
  var prevBtn = $('#prevBtn'), skipBtn = $('#skipBtn'), nextBtn = $('#nextBtn');
  var fName = $('#fName'), fSlug = $('#fSlug'), fBio = $('#fBio');

  /* ---- passi ---- */
  function canContinue() {
    if (state.step === 1) return !!state.theme;
    if (state.step === 2) return !!(state.name.trim() && state.slug.trim() && state.bio.trim());
    if (state.step === 3) return !!(state.logo || state.favicon || state.social.map(function (x) { return x.trim(); }).filter(Boolean).join('|') !== SOCIAL0); /* 22/10/2026: Continua solo con almeno un campo inserito, altrimenti c'è "Salta" */
    return true;
  }
  function goTo(n) {
    state.step = n;
    if (n === 4) state.reached = true;
    if (n !== 1) state.editingTheme = false;
    if (n === 1) themeOpen = false;
    flow.setAttribute('data-step', n);
    $$('.bottega-step-panel').forEach(function (p) { p.hidden = Number(p.getAttribute('data-step-panel')) !== n; });
    renderStepHead();
    var editor = n === 5;
    stepActions.hidden = false;
    body.classList.add('panel-open');
    $('#publishBlock').hidden = !editor;
    $('#bottegaPanel').classList.toggle('is-minimal', !editor);
    $('#bottegaPanel').setAttribute('data-step', n);
    $$('[data-step-ind]').forEach(function (el) {
      var i = Number(el.getAttribute('data-step-ind'));
      el.classList.toggle('is-active', i === n);
      /* rev. 97: i passi già superati sono pieni con check, il corrente è attivo, i successivi vuoti; nel cambio tema (dal riepilogo) il corrente è il tema e gli altri restano spuntati ma in lilla più chiaro */
      var muted = !!(state.editingTheme && n === 1 && i >= 2 && i <= 4);
      var dn = muted || i < n;
      el.classList.toggle('is-done', dn);
      el.classList.toggle('is-muted', muted);
      if (i === n) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      $('.phase-step-marker', el).textContent = dn ? '✓' : '';
    });
    prevBtn.hidden = n === 5 || (n === 1 && !state.editingTheme); /* cambio tema dal riepilogo: "Indietro" riporta al riepilogo senza cambiare */
    skipBtn.hidden = n !== 3;
    nextBtn.hidden = editor;
    nextBtn.textContent = n === 1 ? 'Seleziona' : n === 4 ? 'Crea bottega' : 'Continua';
    if (n === 4) renderSummary();
    syncPanel();
    renderStepPreview();
    refreshNext();
    window.scrollTo(0, 0);
    var ws = $('#bottegaScroll'); if (ws) ws.scrollTop = 0;
    var wk = document.querySelector('.workspace'); if (wk) wk.scrollTop = 0;
  }
  var themeOpen = false; /* true = dettaglio del tema aperto nel workspace; la selezione (state.theme) è indipendente */
  function renderStepHead() { /* passo 1 con tema selezionato: titolo = tema, tag + categorie, descrizione, freccia indietro */
    var th = state.step === 1 && state.theme && themeOpen ? THEMES[state.theme] : null;
    $('#stepMeta').hidden = !th;
    prevBtn.hidden = state.step === 5 || (state.step === 1 && !state.editingTheme && !themeOpen); /* 24/11/2026 (Ruggi): col dettaglio tema aperto «Indietro» (accanto a «Seleziona») riporta alla lista, al posto del link «Torna ai temi» */
    var back = state.step === 5; /* 16/10/2026: l'editor si apre dalla card in Bottega, non fa più parte della creazione: al suo posto "Torna alle botteghe" */
    $('#cancelLink').hidden = !!th; /* "Annulla creazione" in tutti i passi dal 1 al 4 (non col dettaglio tema aperto) */
    $('#cancelLink').innerHTML = back ? 'Torna alle botteghe' : ICON_TRASH + 'Annulla creazione'; $('#cancelLink').classList.toggle('is-back', back);
    $('#stepTitle').textContent = th ? th.name : STEP_TEXT[state.step][0];
    $('#stepSub').textContent = th ? th.desc : STEP_TEXT[state.step][1];
    if (th) $('#stepCat').innerHTML = th.cat.map(function (x) { return '<span class="theme-detail-cat ' + x[1] + '">' + esc(x[0]) + '</span>'; }).join('');
  }
  function renderThemeView() { /* griglia temi <-> dettaglio tema (anteprime reali di pagine e gruppi di componenti) nel workspace */
    var has = state.step === 1 && !!state.theme && themeOpen, view = $('#themeView');
    view.hidden = !has; $('#themeGrid').hidden = has;
    $('#themeFilters').hidden = has || THEME_ORDER.length < 2; /* con un solo tema filtri e ordinamento non servono */
    if (has) $('#themeFiltersEmpty').hidden = true; else applyFilters();
    $('#bottegaPanel').classList.toggle('is-theme-open', has); /* dettaglio aperto: nel pannello via lo stepper, su il panel-header con le frecce */
    renderStepHead();
    if (!has) { clearShowcase(); syncViewToggle('desktop'); return; } /* dettaglio chiuso: la vista torna Desktop per tutti i temi */
    renderShowcase();
  }
  function renderPanelSpecs() {
    $('#panelSpecTheme').textContent = THEMES[state.theme].name;
    renderFacts(state.theme, $('#panelSpecFacts'));
    var i = THEME_ORDER.indexOf(state.theme);
    $('#themePrevBtn').parentNode.hidden = THEME_ORDER.length < 2; /* con un solo tema le frecce non servono */
    $('#themePrevBtn').disabled = i <= 0; $('#themeNextBtn').disabled = i >= THEME_ORDER.length - 1;
  }
  function syncPanel() {
    var has = !!state.theme;
    $('#panelSpecs').hidden = !has; $('#panelPlaceholder').hidden = has;
    if (has) renderPanelSpecs();
    renderThemeView();
    $('#panelEmpty').hidden = has;
    $$('#bottegaPanelBody .panel-section').forEach(function (s) { s.hidden = !has; });
    if (has) initEditor(); else $('#panelThemeName').textContent = '';
  }
  function refreshNext() { nextBtn.disabled = !canContinue(); }

  nextBtn.addEventListener('click', function () { if (!canContinue()) return; if (state.step === 4) { createDraft(); return; } /* Riepilogo -> "Crea": nasce la bozza e si torna alla pagina Bottega */ if (state.step === 1 && state.editingTheme) { goTo(4); return; } goTo(state.step + 1); }); /* cambio tema dal riepilogo: scelto il tema si torna al riepilogo */
  skipBtn.addEventListener('click', function () { goTo(4); });
  prevBtn.addEventListener('click', function () { if (state.step === 1 && themeOpen) { themeOpen = false; renderThemeView(); return; } /* dal dettaglio alla lista: il tema resta selezionato */
    if (state.step === 1 && state.editingTheme) { var bk = state.editBackup; if (bk && bk.theme !== state.theme) { selectTheme(bk.theme, true); state.color = bk.color; state.font = bk.font; } goTo(4); return; } goTo(state.step - 1); });
  $$('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { goTo(Number(b.getAttribute('data-goto'))); }); });
  function renderSummary() {
    function set(id, v, empty) { var e = document.getElementById(id); if (e.parentNode.classList.contains('is-editing')) return; e.textContent = v || empty || '—'; e.classList.toggle('is-empty', !v); }
    set('sumTheme', state.theme ? THEMES[state.theme].name : '');
    set('sumName', state.name.trim()); set('sumSlug', state.slug ? 'contenomy.it/' + state.slug : '');
    set('sumBio', state.bio.trim());
    ['logo', 'favicon'].forEach(function (k) { var row = $('[data-edit="' + k + '"]'); if (row) row.classList.toggle('has-asset', !!state[k]); });
    var sd = document.getElementById('sumSocial'), list = state.social.map(function (x) { return x.trim(); }).filter(Boolean);
    if (!sd.parentNode.classList.contains('is-editing')) {
      sd.textContent = ''; sd.classList.toggle('is-empty', !list.length);
      if (!list.length) sd.textContent = 'Nessun link'; else list.forEach(function (u) { var d = document.createElement('div'); d.textContent = u; sd.appendChild(d); });
    }
  }

  /* ---- passo 1: tema (pallino = seleziona; clic sulla card = anteprima a schermo) ---- */
  function deselectTheme() {
    themeOpen = false;
    state.theme = null; state.color = null; state.font = null;
    $$('.theme-choice').forEach(function (c) { c.classList.remove('is-selected'); $('[data-theme-radio]', c).setAttribute('aria-checked', 'false'); });
    syncPanel();
    refreshNext();
  }
  function selectTheme(id, keepView) {
    if (!keepView) themeOpen = true;
    if (state.theme !== id) {
      state.theme = id;
      state.color = null; state.font = null; /* nessun colore globale: parte dal default del tema */
    }
    $$('.theme-choice').forEach(function (c) {
      var on = c.getAttribute('data-theme-choice') === id;
      c.classList.toggle('is-selected', on);
      $('[data-theme-radio]', c).setAttribute('aria-checked', String(on));
    });
    syncPanel();
    refreshNext();
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
  /* ---- Anteprime reali del tema ----
     Ogni anteprima (card, dettaglio, passi 2-3, lightbox, editor) è un iframe `srcdoc` costruito dal pacchetto del tema: CSS + HTML + script del tema, così com'è.
     Il tema vive nell'iframe (CSS isolato, larghezze reali: Desktop/Mobile cambiano i breakpoint veri); la pagina lo legge e lo scrive via DOM (nome, bio, logo, social, tono, testi). */
  var VIEW_W = { desktop: 1200, mobile: 390 }, viewMode = 'desktop';
  var NAME_TOKEN = '[NOME BOTTEGA]', DEMO_NAME = 'Nome della bottega', SOCIAL_ARROW = 'M3 10h14M11 4l6 6-6 6';
  var CHECK_SVG = '<svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  function HOST_MAIN() { /* eseguito DENTRO l'iframe, prima dello script del tema (viene iniettato come testo: non usare variabili esterne) */
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
    document.addEventListener('keydown', function (e) { /* lightbox: Esc e frecce vanno alla pagina che ospita l'iframe */
      if (document.documentElement.getAttribute('data-host') !== 'lightbox') return;
      if (e.key !== 'Escape' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.key !== 'Escape' && /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
      parent.postMessage({ ctnKey: e.key }, '*');
    }, true);
  }
  var EDIT_CSS = '[data-edit]{cursor:text;outline:2px dashed transparent;outline-offset:6px;border-radius:2px;transition:outline-color .15s}[data-edit]:hover{outline-color:rgba(108,76,241,.55)}[data-edit]:focus{outline:2px solid #6c4cf1}[data-edit]:empty:before{content:attr(data-ph);opacity:.55}';

  function themeDoc(id, html, o) { /* documento completo di un'anteprima */
    var t = PKG[id];
    return '<!doctype html><html lang="it" data-host="' + (o.host || 'thumb') + '"' + (o.motion ? ' class="motion-ready"' : '') + '><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><style>' + t.css + '</style>' +
      '<style>html{scrollbar-width:thin;overflow-x:clip}body{margin:0}' + (o.autoHeight || !o.interactive ? 'html{overflow:hidden}' : '') + (o.edit ? EDIT_CSS : '') + '</style>' +
      '<script>(' + HOST_MAIN.toString() + ')();<\/script></head><body' + (o.bodyClass ? ' class="' + o.bodyClass + '"' : '') + '>' + html +
      '<script>' + t.script.replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>';
  }
  function groupHtml(id, gid) { var t = PKG[id]; return t.shell + '<div class="frame"><main id="contenuto">' + t.groups[gid] + '</main></div>'; }
  function showcaseItems(id) { /* 4 pagine reali + gruppi di componenti, nell'ordine del manifest */
    id = id || state.theme; var t = PKG[id], sc = t.manifest.showcase, items = [];
    sc.pages.forEach(function (p) { items.push({ kind: 'page', id: p.id, label: p.label, sub: p.sub, html: t.pages[p.id].html }); });
    sc.groups.forEach(function (g) { items.push({ kind: 'group', id: g.id, label: g.label, sub: g.count + ' esempi', html: groupHtml(id, g.id), bodyClass: 'catalog' }); });
    return items;
  }

  /* caricamento differito (le anteprime sono pesanti: partono quando entrano in vista) e adattamento al riquadro */
  var lazyIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (!e.isIntersecting) return; lazyIO.unobserve(e.target); var fr = e.target._lazy; if (fr && fr._doc) { fr.srcdoc = fr._doc; fr._doc = null; } });
  }, { rootMargin: '400px' }) : null;
  function lazyBox(box, fr) { box._lazy = fr; if (lazyIO) lazyIO.observe(box); else { fr.srcdoc = fr._doc; fr._doc = null; } }
  function fitBox(box) { /* iframe larghezza data-w, scalato alla larghezza del riquadro; l'altezza riempie il riquadro */
    var fr = box.querySelector('.theme-frame'); if (!fr) return;
    var w = Number(box.getAttribute('data-w')) || VIEW_W.desktop, cw = box.clientWidth, ch = box.clientHeight; if (!cw || !ch) return;
    var k = cw / w;
    fr.style.width = w + 'px'; fr.style.height = Math.ceil(ch / k) + 'px'; fr.style.transform = 'scale(' + k + ')';
  }
  var boxRO = 'ResizeObserver' in window ? new ResizeObserver(function (es) { es.forEach(function (e) { fitBox(e.target); }); }) : null;
  function watchBox(box) { if (boxRO) boxRO.observe(box); fitBox(box); }

  function makeFrame(id, html, o) {
    o = o || {};
    var fr = document.createElement('iframe');
    fr.className = 'theme-frame' + (o.interactive ? ' is-live' : ''); fr.title = o.title || 'Anteprima del tema'; fr.tabIndex = o.interactive ? 0 : -1;
    fr._theme = id; fr._o = o;
    fr.addEventListener('load', function () { bindFrame(fr); });
    var doc = themeDoc(id, html, o);
    if (o.lazy) fr._doc = doc; else fr.srcdoc = doc;
    return fr;
  }

  function socialLabel(u) { var h = u.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').split(/[\/?#]/)[0], s = h.split('.')[0] || h; return s.charAt(0).toUpperCase() + s.slice(1); }
  function socialLinks() { return state.social.map(function (s) { return s.trim(); }).filter(Boolean); }
  function heroTone() { return state.color || 'ink'; } /* nessun colore globale nel Tema 01: il colore scelto è il tono del blocco Identità (copertina) */

  function bindFrame(fr) { /* iframe caricato: trova i punti da riempire e li lega allo stato */
    var d, o = fr._o;
    try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body || !d.documentElement.hasAttribute('data-host')) return; /* il load dell'iframe vuoto non conta */
    var nodes = [], w = d.createTreeWalker(d.body, 4, null), n;
    var hero = o.group ? null : d.querySelector('[data-component="C05"]'), h1 = hero && hero.querySelector('h1'), bio = hero && hero.querySelector('p.t-lead');
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
    if (o.edit) wireEditable(fr);
    paintFrame(fr);
    if (o.autoHeight) autoHeight(fr);
  }
  function paintFrame(fr) { /* stato della pagina -> DOM dell'anteprima (non tocca il testo che l'utente sta scrivendo) */
    if (!fr._nodes) return;
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body) return;
    var act = d.activeElement, name = state.name.trim() || DEMO_NAME;
    fr._nodes.forEach(function (x) { if (x.n.isConnected) x.n.nodeValue = x.tpl.split(NAME_TOKEN).join(name); });
    if (fr._h1 && act !== fr._h1 && fr._h1.textContent !== name) fr._h1.textContent = name;
    var bio = state.bio.trim() || fr._bioTpl;
    if (fr._bio && act !== fr._bio && fr._bio.textContent !== bio) fr._bio.textContent = bio;
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
    if (fr._hero && fr._o.tone) {
      var tone = heroTone(), fb = fr._hero.querySelector('[data-action="follow"]');
      if (fr._hero.getAttribute('data-tone') !== tone) fr._hero.setAttribute('data-tone', tone);
      if (fb) fb.classList.toggle('btn--light', tone === 'ink'); /* pulsante chiaro solo sul fondo nero */
    }
  }
  function paintAll() { $$('iframe.theme-frame').forEach(paintFrame); }
  function autoHeight(fr) { /* l'iframe prende l'altezza del contenuto (l'editor scorre con la pagina) */
    var d = fr.contentDocument, win = fr.contentWindow, count = 0;
    function fit() {
      var root = d.querySelector('.frame') || d.body, h = Math.min(Math.ceil(root.getBoundingClientRect().height), 12000);
      if (h > 0 && Math.abs(h - (fr._h || 0)) > 1 && count++ < 60) { fr._h = h; fr.style.height = h + 'px'; if (fr._onHeight) fr._onHeight(); }
    }
    fit(); win.addEventListener('load', fit);
    if (win.ResizeObserver) new win.ResizeObserver(fit).observe(d.querySelector('.frame') || d.body);
  }
  function wireEditable(fr) { /* nome (h1) e presentazione (p.t-lead) della copertina si scrivono direttamente nell'anteprima */
    var d = fr.contentDocument;
    [[fr._h1, 'name', 'Nome della bottega'], [fr._bio, 'bio', 'Presentazione della bottega']].forEach(function (x) {
      var el = x[0], key = x[1]; if (!el) return;
      el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); el.setAttribute('role', 'textbox');
      el.setAttribute('aria-label', x[2]); el.setAttribute('data-edit', key); el.setAttribute('data-ph', x[2]);
      el.addEventListener('focus', function () {
        if (key === 'name' && !nameBannerShown) { nameBannerShown = true; $('#nameBanner').hidden = false; }
        if (!state[key].trim()) el.textContent = ''; /* vuoto: via il testo di esempio, resta il segnaposto */
      });
      el.addEventListener('blur', paintAll);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); }); /* niente a capo: testo semplice */
      el.addEventListener('paste', function (e) { e.preventDefault(); var t = (e.clipboardData || fr.contentWindow.clipboardData).getData('text'); d.execCommand('insertText', false, t.replace(/\s+/g, ' ')); });
      el.addEventListener('input', function () {
        if (key === 'name') {
          state.name = el.textContent.replace(/\s+/g, ' '); fName.value = state.name;
          if (!state.slugTouched && !state.published) { state.slug = slugify(state.name); fSlug.value = state.slug; $('#panelSlug').value = state.slug; }
        } else { state.bio = el.textContent; fBio.value = state.bio; }
        renderPreview();
      });
    });
  }

  /* ---- dettaglio del tema: copertina = pagina Bottega, poi le altre pagine e i gruppi di componenti ---- */
  function syncViewToggle(v) { $$('.theme-view-btn').forEach(function (x) { var on = x.getAttribute('data-view') === v; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', String(on)); }); }
  function clearShowcase() {
    viewMode = 'desktop'; $('#themeComponents').setAttribute('data-view', 'desktop');
    [$('#themeModalHero'), $('#themeComponents')].forEach(function (h) { $$('[data-w]', h).concat(h.hasAttribute('data-w') ? [h] : []).forEach(function (b) { if (boxRO) boxRO.unobserve(b); if (lazyIO) lazyIO.unobserve(b); }); h.innerHTML = ''; });
  }
  function renderHero() {
    var hero = $('#themeModalHero'), it = showcaseItems()[0];
    hero.innerHTML = ''; hero.setAttribute('data-w', String(VIEW_W.desktop));
    var fr = makeFrame(state.theme, it.html, { title: it.label, lazy: true, tone: true });
    hero.appendChild(fr); lazyBox(hero, fr); watchBox(hero);
  }
  function renderGrid() {
    var host = $('#themeComponents'), mobile = viewMode === 'mobile', items = showcaseItems(), id = state.theme;
    $$('[data-w]', host).forEach(function (b) { if (boxRO) boxRO.unobserve(b); if (lazyIO) lazyIO.unobserve(b); });
    host.innerHTML = ''; host.setAttribute('data-view', viewMode);
    items.slice(1).forEach(function (it, i) {
      var fig = document.createElement('figure'); fig.className = 'theme-component';
      var box = document.createElement('div'); box.className = 'theme-component-frame'; box.setAttribute('data-w', String(mobile ? VIEW_W.mobile : VIEW_W.desktop));
      box.setAttribute('data-idx', String(i + 1)); box.setAttribute('tabindex', '0'); box.setAttribute('role', 'button'); box.setAttribute('aria-label', 'Ingrandisci: ' + it.label);
      var fr = makeFrame(id, it.html, { title: it.label, lazy: true, group: it.kind === 'group', bodyClass: it.bodyClass, tone: it.id === 'bottega' });
      box.appendChild(fr);
      var cap = document.createElement('figcaption'); cap.className = 'theme-component-caption';
      cap.innerHTML = '<span>' + esc(it.label) + '</span><span class="theme-component-sub">' + esc(it.sub) + '</span>';
      fig.appendChild(box); fig.appendChild(cap); host.appendChild(fig); lazyBox(box, fr); watchBox(box);
    });
  }
  function renderShowcase() { renderHero(); renderGrid(); }
  function setView(v) { /* Desktop / Mobile: cambia la larghezza reale dell'iframe, quindi i breakpoint del tema */
    var wk = document.querySelector('.workspace'), top = wk ? wk.scrollTop : 0;
    viewMode = v; syncViewToggle(v); renderGrid();
    if (wk) { wk.scrollTop = top; requestAnimationFrame(function () { wk.scrollTop = top; }); } /* mantiene la posizione di scroll */
  }
  $$('.theme-view-btn').forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view')); }); });

  function renderFacts(id, target) {
    var t = THEMES[id];
    var sw = '<span class="theme-fact-swatches">' + t.colors.map(function (c) { return '<i style="background:' + c.hex + '" title="' + esc(c.label) + '"></i>'; }).join('') + '</span>';
    var rows = [['Palette', sw], ['Font', esc(t.fontLabel)], ['Componenti', String(t.nComp)], ['Sezioni opzionali', esc(t.sections)], ['Adatto a', esc(t.fit)]];
    (target || $('#themeFacts')).innerHTML = rows.map(function (r) { return '<div class="theme-fact"><dt class="panel-field-label">' + r[0] + '</dt><dd class="panel-field-value">' + r[1] + '</dd></div>'; }).join('');
  }

  /* ---- anteprima a tutto schermo (lightbox): pagina o gruppo VERO, scorrevole; X, Esc o clic sullo sfondo per chiudere, frecce per scorrere ---- */
  var lb = $('#themeLightbox'), lbStage = $('#themeLightboxStage'), lbOpener = null, lbIdx = 0, lbFrame = null, lbPrev = $('#themeLightboxPrev'), lbNext = $('#themeLightboxNext');
  function lbRender() {
    var items = showcaseItems(), it = items[lbIdx], mobile = viewMode === 'mobile';
    var bx = document.createElement('div'); bx.className = 'theme-lightbox-box' + (mobile ? ' is-mobile' : ''); bx.setAttribute('data-w', String(mobile ? VIEW_W.mobile : VIEW_W.desktop));
    lbFrame = makeFrame(state.theme, it.html, { title: it.label, interactive: true, motion: true, host: 'lightbox', group: it.kind === 'group', bodyClass: it.bodyClass, tone: it.id === 'bottega' });
    bx.appendChild(lbFrame);
    var cap = document.createElement('p'); cap.className = 'theme-lightbox-caption'; cap.textContent = it.label + ' · ' + (lbIdx + 1) + ' / ' + items.length;
    $$('[data-w]', lbStage).forEach(function (b) { if (boxRO) boxRO.unobserve(b); });
    lbStage.innerHTML = ''; lbStage.appendChild(bx); lbStage.appendChild(cap);
    lbPrev.disabled = lbIdx === 0; lbNext.disabled = lbIdx === items.length - 1;
    watchBox(bx);
  }
  function lbGo(d) { var n = lbIdx + d; if (n < 0 || n >= showcaseItems().length) return; lbIdx = n; lbRender(); }
  function openLightbox(idx, opener) { lbIdx = idx; lbOpener = opener || null; lb.hidden = false; lbRender(); $('#themeLightboxClose').focus(); }
  function closeLightbox() { if (lb.hidden) return; lb.hidden = true; $$('[data-w]', lbStage).forEach(function (b) { if (boxRO) boxRO.unobserve(b); }); lbStage.innerHTML = ''; lbFrame = null; if (lbOpener) lbOpener.focus(); }
  function lbKey(k) { if (lb.hidden) return; if (k === 'Escape') closeLightbox(); else if (k === 'ArrowLeft') lbGo(-1); else if (k === 'ArrowRight') lbGo(1); }
  $('#themeView').addEventListener('click', function (e) {
    var fr = e.target.closest('.theme-component-frame');
    if (fr) { openLightbox(Number(fr.getAttribute('data-idx')), fr); return; }
    var hero = e.target.closest('#themeModalHero');
    if (hero) openLightbox(0, hero);
  });
  $('#themeView').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('theme-component-frame')) { e.preventDefault(); e.target.click(); } });
  $('#themeLightboxClose').addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', function () { lbGo(-1); }); lbNext.addEventListener('click', function () { lbGo(1); });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target === lbStage) closeLightbox(); });
  document.addEventListener('keydown', function (e) { lbKey(e.key); });
  window.addEventListener('message', function (e) { if (lbFrame && e.source === lbFrame.contentWindow && e.data && e.data.ctnKey) lbKey(e.data.ctnKey); }); /* tasti premuti dentro l'iframe */

  /* ---- card dei temi: generate dal manifest di ogni pacchetto ---- */
  function buildCards() {
    var grid = $('#themeGrid'); grid.innerHTML = '';
    THEME_ORDER.forEach(function (id) {
      var m = PKG[id].manifest, f = m.listing.filters || {}, card = document.createElement('div');
      card.className = 'theme-preview theme-choice'; card.setAttribute('data-theme-choice', id);
      card.setAttribute('data-cat', f.cat || ''); card.setAttribute('data-font', f.font || ''); card.setAttribute('data-stile', f.stile || '');
      card.innerHTML = '<button type="button" class="theme-radio" role="radio" aria-checked="false" aria-label="Seleziona ' + esc(m.name) + '" data-theme-radio></button>' +
        '<span class="theme-choice-state" aria-hidden="true">Selezionato</span><div class="theme-thumb" data-w="' + VIEW_W.desktop + '" aria-hidden="true"></div>' +
        '<div class="theme-preview-copy"><div class="card-header-titles theme-preview-titles"><div class="theme-preview-title">' + esc(m.name) + '</div><div class="card-sub">' + esc(m.listing.description) + '</div></div></div>';
      grid.appendChild(card);
      var box = $('.theme-thumb', card), fr = makeFrame(id, PKG[id].pages.bottega.html, { title: m.name, lazy: true, tone: true });
      box.appendChild(fr); lazyBox(box, fr); watchBox(box);
    });
  }
  buildCards();
  $$('.theme-choice').forEach(function (card) {
    var id = card.getAttribute('data-theme-choice');
    card.addEventListener('click', function () { selectTheme(id); });
    $('[data-theme-radio]', card).addEventListener('click', function (e) { e.stopPropagation(); if (state.editingTheme) { if (state.theme !== id) selectTheme(id, true); return; } /* in modifica tema il checkbox cambia solo la selezione: al Riepilogo si torna con "Seleziona" */ if (state.theme === id) deselectTheme(); else selectTheme(id, true); });
  });
  function stepTheme(d) { var i = THEME_ORDER.indexOf(state.theme) + d; if (i >= 0 && i < THEME_ORDER.length) selectTheme(THEME_ORDER[i], true); }
  $('#themePrevBtn').addEventListener('click', function () { stepTheme(-1); });
  $('#themeNextBtn').addEventListener('click', function () { stepTheme(1); });

  /* ---- passo 2: identità ---- */
  fName.value = state.name; fSlug.value = state.slug; fBio.value = state.bio;
  fName.addEventListener('input', function () {
    state.name = fName.value;
    renderStepPreview();
    if (!state.slugTouched) { state.slug = slugify(state.name); fSlug.value = state.slug; }
    refreshNext();
  });
  fSlug.addEventListener('input', function () {
    state.slugTouched = true;
    var c = slugify(fSlug.value.replace(/\s+$/, '-'));
    state.slug = c; refreshNext(); renderStepPreview();
  });
  fSlug.addEventListener('blur', function () { fSlug.value = state.slug; });
  fBio.addEventListener('input', function () { state.bio = fBio.value; refreshNext(); renderStepPreview(); });

  /* ---- passo 3: upload ---- */
  function bindUpload(box) {
    var kind = box.getAttribute('data-upload');
    var input = $('[data-upload-input]', box), pick = $('[data-upload-pick]', box), clear = $('[data-upload-clear]', box);
    var img = $('img', box), nameEl = $('.bottega-upload-name', box);
    pick.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { setAsset(kind, rd.result, f.name); };
      rd.readAsDataURL(f);
    });
    clear.addEventListener('click', function () { input.value = ''; setAsset(kind, null, null); });
    box._sync = function () {
      var v = state[kind];
      img.hidden = !v; if (v) img.src = v;
      nameEl.textContent = v ? (state[kind + 'Name'] || 'File scelto') : 'Nessun file scelto';
      clear.hidden = !v; pick.textContent = v ? 'Cambia' : 'Scegli file';
    };
  }
  function setAsset(kind, data, fname) {
    state[kind] = data; state[kind + 'Name'] = fname;
    $$('[data-upload="' + kind + '"]').forEach(function (b) { b._sync && b._sync(); });
    renderPreview(); renderSummary(); renderStepPreview();
    var pb = kind === 'logo' ? $('#panelLogoBtn') : $('#panelFaviconBtn');
    pb.textContent = data ? 'Cambia' : 'Scegli file';
  }
  $$('.bottega-upload').forEach(bindUpload);

  /* ---- riepilogo: modifica inline dei testi (matita); tema -> passo 1; logo/favicon -> selettore file ---- */
  var X_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var EDITS = {
    name: { get: function () { return state.name; }, set: function (v) { v = v.trim(); if (!v) return false; state.name = v; fName.value = v; if (!state.slugTouched) { state.slug = slugify(v); fSlug.value = state.slug; } return true; } },
    slug: { prefix: 'contenomy.it/', get: function () { return state.slug; }, set: function (v) { var c = slugify(v); if (!c) return false; state.slug = c; fSlug.value = c; state.slugTouched = true; return true; } },
    bio: { multi: true, get: function () { return state.bio; }, set: function (v) { v = v.trim(); if (!v) return false; state.bio = v; fBio.value = v; return true; } }
  };
  /* modifica inline nel riepilogo: nessun salvataggio implicito, si decide con Salva / Annulla (Invio = Salva, Esc = Annulla) */
  function startEdit(key) {
    var row = $('[data-edit="' + key + '"]'); if (!row || row.classList.contains('is-editing')) return;
    var dd = $('dd', row), commit, first, draft;
    dd.textContent = '';
    if (key === 'social') {
      draft = state.social.map(function (x) { return x.trim(); }).filter(Boolean); if (!draft.length) draft = [''];
      var list = document.createElement('div'), add = document.createElement('button');
      list.className = 'bottega-social-list'; add.type = 'button'; add.className = 'btn-ghost sm bottega-add-link'; add.textContent = 'Aggiungi link';
      var draw = function (focusLast) {
        list.textContent = '';
        draft.forEach(function (url, i) {
          var r = document.createElement('div'), inp = document.createElement('input'), rm = document.createElement('button');
          r.className = 'bottega-social-row'; inp.className = 'bottega-input'; inp.type = 'url'; inp.value = url; inp.placeholder = 'https://…'; inp.setAttribute('aria-label', 'Link social ' + (i + 1));
          inp.addEventListener('input', function () { draft[i] = inp.value; });
          rm.type = 'button'; rm.className = 'bottega-remove-btn'; rm.innerHTML = X_SVG; rm.setAttribute('aria-label', 'Rimuovi link');
          rm.addEventListener('click', function () { draft.splice(i, 1); if (!draft.length) draft = ['']; draw(); });
          r.appendChild(inp); r.appendChild(rm); list.appendChild(r);
        });
        var ins = $$('input', list); if (focusLast) ins[ins.length - 1].focus();
      };
      add.addEventListener('click', function () { draft.push(''); draw(true); });
      draw(); dd.appendChild(list); dd.appendChild(add); first = $('input', list);
      commit = function () { state.social = draft.map(function (x) { return x.trim(); }).filter(Boolean); renderSocialLists(); renderPreview(); return true; };
    } else {
      var cfg = EDITS[key], inp = document.createElement(cfg.multi ? 'textarea' : 'input');
      inp.className = 'bottega-input' + (cfg.multi ? ' bottega-textarea' : ''); inp.value = cfg.get(); if (cfg.multi) inp.rows = 3; else inp.type = 'text';
      inp.setAttribute('aria-label', $('dt', row).textContent);
      if (cfg.prefix) { var g = document.createElement('div'); g.className = 'bottega-input-group'; var pf = document.createElement('span'); pf.className = 'bottega-input-prefix'; pf.textContent = cfg.prefix; g.appendChild(pf); g.appendChild(inp); dd.appendChild(g); } else dd.appendChild(inp);
      first = inp;
      commit = function () { var ok = cfg.set(inp.value) !== false; inp.setAttribute('aria-invalid', String(!ok)); if (!ok) inp.focus(); return ok; };
    }
    var act = document.createElement('div'), cancel = document.createElement('button'), save = document.createElement('button');
    act.className = 'bottega-edit-actions';
    cancel.type = 'button'; cancel.className = 'btn-ghost sm danger'; cancel.textContent = 'Annulla';
    save.type = 'button'; save.className = 'btn-pill-dark primary sm'; save.textContent = 'Salva';
    act.appendChild(cancel); act.appendChild(save); dd.appendChild(act);
    function close() { row.classList.remove('is-editing'); renderSummary(); renderStepPreview(); refreshNext(); }
    cancel.addEventListener('click', close);
    save.addEventListener('click', function () { if (commit()) close(); });
    dd.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && key !== 'social') { e.preventDefault(); save.click(); }
      else if (e.key === 'Enter' && e.target.tagName === 'TEXTAREA' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save.click(); }
    });
    row.classList.add('is-editing'); first.focus(); if (first.select && first.tagName === 'INPUT' && key !== 'social') first.select();
  }
  $$('[data-edit-btn]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-edit-btn');
      if (k === 'theme') { state.editBackup = { theme: state.theme, color: state.color, font: state.font }; state.editingTheme = true; goTo(1); }
      else if (k === 'logo' || k === 'favicon') $('[data-edit="' + k + '"] [data-upload-input]').click();
      else startEdit(k);
    });
  });

  /* pulsanti del pannello: riusano gli stessi input file del passo 3 */
  $('#panelLogoBtn').addEventListener('click', function () { $('[data-upload="logo"] [data-upload-input]').click(); });
  $('#panelFaviconBtn').addEventListener('click', function () { $('[data-upload="favicon"] [data-upload-input]').click(); });

  /* ---- link social (stessa lista nel passo 3 e nel pannello) ---- */
  function renderSocialLists() {
    ['socialList', 'panelSocialList'].forEach(function (id) {
      var host = document.getElementById(id), focusedIdx = null;
      host.innerHTML = '';
      state.social.forEach(function (url, i) {
        var row = document.createElement('div'); row.className = 'bottega-social-row';
        var inp = document.createElement('input'); inp.className = 'bottega-input'; inp.type = 'url'; inp.value = url;
        inp.placeholder = 'https://…'; inp.setAttribute('aria-label', 'Link social ' + (i + 1));
        inp.addEventListener('input', function () { state.social[i] = inp.value; renderPreview(); syncOtherSocial(id); });
        var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'bottega-remove-btn'; rm.innerHTML = X_SVG; rm.setAttribute('aria-label', 'Rimuovi link');
        rm.addEventListener('click', function () { state.social.splice(i, 1); renderSocialLists(); renderPreview(); });
        row.appendChild(inp); row.appendChild(rm); host.appendChild(row);
      });
    });
  }
  function syncOtherSocial(fromId) {
    var other = document.getElementById(fromId === 'socialList' ? 'panelSocialList' : 'socialList');
    $$('input', other).forEach(function (inp, i) { inp.value = state.social[i] || ''; });
  }
  $('#addSocialBtn').addEventListener('click', function () { state.social.push(''); renderSocialLists(); var l = $$('#socialList input'); l[l.length - 1].focus(); renderPreview(); });

  /* ---- bozza: salvataggio nell'archivio condiviso con la pagina Bottega (bottega-store.js) ---- */
  var STORE = window.BottegaStore, carry = state.stripe ? '?stripe=on' : '';
  function snapshot() {
    var t = THEMES[state.theme], tone = t.heroColors.filter(function (c) { return c.id === heroTone(); })[0];
    return { id: state.id, status: state.published ? 'pubblicata' : 'bozza', theme: state.theme, themeName: t.name,
      name: state.name.trim(), slug: state.slug, bio: state.bio, logo: state.logo, favicon: state.favicon, social: state.social.slice(),
      color: state.color, toneHex: tone ? tone.hex : '#000000', font: state.font };
  }
  function saveDraft() { if (STORE && state.id && state.theme) STORE.save(snapshot()); }
  function createDraft() {
    state.id = 'b' + Date.now().toString(36); state.published = false; saveDraft();
    location.href = 'bottega-onboarding.html' + carry;
  }
  /* l'editor salva quando si esce dalla pagina (il testo si scrive nell'anteprima, non c'è un "Salva") */
  window.addEventListener('pagehide', function () { if (state.step === 5) saveDraft(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && state.step === 5) saveDraft(); });
  $('#cancelLink').addEventListener('click', function () { if (state.step === 5) saveDraft(); });
  window.bindCancelCreation($('#cancelLink'), 'Stai per eliminare la bottega in creazione. I dati inseriti andranno persi.', function () { return state.step === 5; }); /* 24/11/2026 (Ruggi): conferma prima di uscire; al passo 5 il link è «Torna alle botteghe» e non elimina nulla */
  $('#cancelLink').setAttribute('href', 'bottega-onboarding.html' + carry);

  /* ---- passo 5: editor (iframe vivo del tema; i testi della copertina si scrivono direttamente, il colore sta nel pannello) ---- */
  var nameBannerShown = false, editorStage = $('#editorStage');
  function mountEditor() {
    var cur = $('.theme-frame', editorStage);
    if (cur && cur._theme === state.theme) return; /* stesso tema: l'iframe resta (e con lui il testo in modifica) */
    editorStage.innerHTML = '';
    editorStage.appendChild(makeFrame(state.theme, PKG[state.theme].pages.bottega.html, { title: 'Anteprima della tua bottega', interactive: true, edit: true, autoHeight: true, tone: true, motion: true, host: 'editor' }));
  }
  function initEditor() {
    var t = THEMES[state.theme];
    $('#panelThemeName').textContent = t.name;
    var sw = $('#swatches'); sw.innerHTML = '';
    t.heroColors.forEach(function (c) { /* colori ammessi dal tema per la copertina (blocco Identità) */
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bottega-swatch'; b.style.setProperty('--sw', c.hex);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c.label); b.setAttribute('data-tooltip', c.label); b.setAttribute('aria-checked', String(c.id === heroTone()));
      b.addEventListener('click', function () { state.color = c.id; $$('.bottega-swatch', sw).forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); renderPreview(); });
      sw.appendChild(b);
    });
    $('#fontSection').hidden = !t.fontsSelectable; /* il Tema 01 ha font fissi: la sezione compare solo se il manifest li rende scelti */
    $('#panelSlug').value = state.slug;
    if (state.step === 5) mountEditor();
    renderPreview();
  }
  $('#panelSlug').addEventListener('input', function (e) {
    state.slug = slugify(e.target.value); fSlug.value = state.slug; state.slugTouched = true; renderPreview();
  });
  $('#panelSlug').addEventListener('blur', function (e) { e.target.value = state.slug; });

  function renderPreview() {
    refreshNext();
    renderStepPreview();
    if (!state.theme) return;
    var fav = $('#pvFavicon img'); fav.hidden = !state.favicon; if (state.favicon) fav.src = state.favicon; /* favicon e indirizzo nella barra dell'anteprima */
    $('#pvUrl').textContent = 'contenomy.it/' + state.slug;
    renderPublish();
  }
  $('#nameBannerClose').addEventListener('click', function () { $('#nameBanner').hidden = true; });

  /* ---- pubblicazione ---- */
  function renderPublish() {
    var missing = [];
    if (!state.name.trim()) missing.push('il nome');
    if (!state.bio.trim()) missing.push('la presentazione');
    if (!state.slug.trim()) missing.push('l’indirizzo');
    var stripeOk = state.stripe;
    $('#stripeBanner').hidden = stripeOk || state.published;
    $('#publishedBanner').hidden = !state.published;
    var btn = $('#publishBtn');
    btn.hidden = !stripeOk || state.published;
    btn.disabled = missing.length > 0;
    var msg = $('#publishMissing');
    msg.hidden = !(stripeOk && !state.published && missing.length);
    msg.textContent = missing.length ? 'Per pubblicare mancano: ' + missing.join(', ') + '.' : '';
    var badge = $('#pvBadge'); badge.textContent = state.published ? 'Pubblicata' : 'Anteprima · non pubblicata'; badge.classList.toggle('is-live', state.published);
    var ps = $('#panelSlug'); ps.disabled = state.published;
    $('#panelSlugHint').textContent = state.published ? 'Dopo la pubblicazione l’indirizzo non si modifica: i link già condivisi non devono rompersi.' : 'Modificabile fino alla prima pubblicazione.';
  }
  $('#publishBtn').addEventListener('click', function () { state.published = true; renderPublish(); saveDraft(); /* l'archivio riporta in bozza l'eventuale altra bottega online */ });


  /* ---- rev. 86: filtri temi (Categoria / Font / Stile multi-selezione, Ordina singola) ---- */
  var fSel = { cat: [], font: [], stile: [], sort: 'default' };
  function applyFilters() {
    var cards = $$('.theme-choice'), shown = 0, n = 0;
    cards.forEach(function (c) {
      var ok = ['cat', 'font', 'stile'].every(function (k) {
        if (!fSel[k].length) return true;
        var have = (c.getAttribute('data-' + k) || '').split(' ');
        return fSel[k].some(function (v) { return have.indexOf(v) > -1; });
      });
      c.hidden = !ok; if (ok) shown++;
    });
    var grid = $('#themeGrid');
    cards.slice().sort(function (a, b) {
      if (state.editingTheme && state.theme) { var sa = a.getAttribute('data-theme-choice') === state.theme, sb = b.getAttribute('data-theme-choice') === state.theme; if (sa !== sb) return sa ? -1 : 1; }
      if (fSel.sort === 'default') return a.getAttribute('data-theme-choice') < b.getAttribute('data-theme-choice') ? -1 : 1;
      var na = THEMES[a.getAttribute('data-theme-choice')].name, nb = THEMES[b.getAttribute('data-theme-choice')].name;
      return fSel.sort === 'az' ? na.localeCompare(nb) : nb.localeCompare(na);
    }).forEach(function (c) { grid.appendChild(c); });
    ['cat', 'font', 'stile'].forEach(function (k) { n += fSel[k].length; var w = $('.theme-filter[data-filter="' + k + '"]'); w.classList.toggle('is-active', fSel[k].length > 0); });
    var cnt = $('#themeFiltersCount'); cnt.textContent = String(n); cnt.hidden = n === 0;
    $('#themeFiltersEmpty').hidden = shown > 0; grid.hidden = shown === 0 || themeOpen && !!state.theme && state.step === 1;
  }
  function closeFilterMenus(except) {
    $$('.theme-filter').forEach(function (w) { if (w === except) return; $('.theme-filter-menu', w).hidden = true; $('.theme-filter-btn', w).setAttribute('aria-expanded', 'false'); });
  }
  $$('.theme-filter').forEach(function (w) {
    var btn = $('.theme-filter-btn', w), menu = $('.theme-filter-menu', w), key = w.getAttribute('data-filter');
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); var open = menu.hidden; closeFilterMenus(w); menu.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    $$('input', menu).forEach(function (inp) {
      inp.addEventListener('click', function () {
        if (key === 'sort') fSel.sort = inp.value;
        else if (fSel[key][0] === inp.value) { inp.checked = false; fSel[key] = []; } /* secondo clic sulla voce scelta = toglie il filtro */
        else fSel[key] = [inp.value];
        menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
        applyFilters();
      });
    });
  });
  $('#themeFiltersReset').addEventListener('click', function () {
    fSel = { cat: [], font: [], stile: [], sort: 'default' };
    $$('.theme-filter-menu input').forEach(function (i) { i.checked = i.type === 'radio' && i.value === 'default'; });
    closeFilterMenus(); applyFilters();
  });
  document.addEventListener('click', function () { closeFilterMenus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeFilterMenus(); });
  $('.theme-filter[data-filter="sort"] input[value="default"]').checked = true;

  /* 15/10/2026 (Ruggi): sidebar BLOCCATA chiusa in questo flusso (il pannello destro e' sempre aperto e sidebar+pannello non stanno mai aperti insieme).
     L'icona #sidebarToggle resta ma e' inattiva (aria-disabled, nessun listener); la sidebar resta raggiungibile solo in hover (flyout). */

  /* ---- anteprima "Così apparirà" nei passi 2 e 3: la pagina Bottega del tema, riempita con i dati del form (colore di default: si sceglie nel passo finale) ---- */
  function fitMini() { /* iframe a larghezza piena (1200) scalato alla larghezza del riquadro; il riquadro scorre in verticale */
    $$('.bottega-mini-body').forEach(function (b) {
      var fr = $('.theme-frame', b), sz = $('.bottega-mini-sizer', b); if (!fr || !sz || !b.clientWidth) return;
      var w = Number(b.getAttribute('data-w')) || VIEW_W.desktop, k = b.clientWidth / w, h = fr._h || Math.round(w * 0.65);
      fr.style.width = w + 'px'; fr.style.height = h + 'px'; fr.style.transform = 'scale(' + k + ')'; sz.style.height = Math.ceil(h * k) + 'px';
    });
  }
  function buildMini() { /* contenitore: barra (favicon + indirizzo) + corpo; l'iframe si crea quando c'è un tema */
    $$('[data-preview-host]').forEach(function (host) {
      host.innerHTML = '<h2 class="card-title title-lg bottega-specs-title bottega-preview-theme"></h2><h3 class="card-title title-lg bottega-specs-sub">Anteprima</h3>' + /* 4/11/2026: nome del tema grande, sotto «Anteprima» */
        '<div class="bottega-preview-frame"><div class="bottega-preview-bar"><span class="bottega-preview-tabicon"><img alt="" hidden></span><span class="bottega-preview-url"></span></div>' +
        '<div class="bottega-mini-body" data-w="' + VIEW_W.desktop + '"><div class="bottega-mini-sizer"></div></div></div>';
      if ('ResizeObserver' in window) new ResizeObserver(fitMini).observe($('.bottega-mini-body', host));
    });
  }
  function renderStepPreview() {
    if (!state.theme) return;
    $$('[data-preview-host]').forEach(function (host) {
      var sz = $('.bottega-mini-sizer', host), cur = $('.theme-frame', sz); var pt = $('.bottega-preview-theme', host); if (pt) pt.textContent = THEMES[state.theme].name;
      if (!cur || cur._theme !== state.theme) { /* nuovo tema: nuovo iframe */
        sz.innerHTML = '';
        var fr = makeFrame(state.theme, PKG[state.theme].pages.bottega.html, { title: 'Anteprima della bottega', autoHeight: true, tone: true, host: 'mini' });
        fr._onHeight = fitMini; sz.appendChild(fr);
      }
      var fv = $('.bottega-preview-tabicon img', host); fv.hidden = !state.favicon; if (state.favicon) fv.src = state.favicon;
      $('.bottega-preview-url', host).textContent = 'contenomy.it/' + (state.slug || '');
    });
    paintAll(); fitMini();
  }
  window.addEventListener('resize', fitMini);
  buildMini();

  /* ---- avvio ---- */
  renderSocialLists();
  var openId = (location.search.match(/[?&]bottega=([^&]+)/) || [])[1], saved = STORE && openId ? STORE.get(decodeURIComponent(openId)) : null;
  if (saved && THEMES[saved.theme]) { /* ?bottega=ID: si entra direttamente nell'editor di una bottega già creata (card in pagina Bottega) */
    state.id = saved.id; state.name = saved.name; state.slug = saved.slug; state.slugTouched = true; state.bio = saved.bio || '';
    state.logo = saved.logo || null; state.favicon = saved.favicon || null; state.social = (saved.social || []).slice(); state.published = saved.status === 'pubblicata';
    fName.value = state.name; fSlug.value = state.slug; fBio.value = state.bio;
    renderSocialLists();
    selectTheme(saved.theme, true); state.color = saved.color || null; state.font = saved.font || null; /* selectTheme azzera colore e font: si rimettono dopo */
    goTo(5);
  } else goTo(1);
})();
