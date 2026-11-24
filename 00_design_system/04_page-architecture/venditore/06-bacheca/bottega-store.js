/* Bottega — archivio delle botteghe del venditore (wireframe, 16/10/2026).
   Solo un mock: le botteghe stanno in localStorage (fallback sessionStorage) e servono a far parlare fra loro
   bottega-creazione.html e bottega-onboarding.html. Regola di prodotto: al massimo UNA bottega pubblicata, le altre sono bozze;
   pubblicarne una riporta in bozza quella online.
   Una bottega: { id, status:'bozza'|'pubblicata', theme, themeName, name, slug, bio, logo, favicon, social[], color, toneHex, font, created, updated } */
(function () {
  'use strict';
  var KEY = 'contenomy.botteghe.v1', mem = [];
  function store(n) { try { var s = window[n]; s.setItem(KEY + '.t', '1'); s.removeItem(KEY + '.t'); return s; } catch (e) { return null; } }
  var ST = store('localStorage') || store('sessionStorage');
  function read() { if (!ST) return mem.slice(); try { return JSON.parse(ST.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function write(list) {
    mem = list.slice(); if (!ST) return;
    try { ST.setItem(KEY, JSON.stringify(list)); }
    catch (e) { /* quota (logo/favicon grandi): riprova senza immagini */
      try { ST.setItem(KEY, JSON.stringify(list.map(function (b) { var c = {}; for (var k in b) c[k] = b[k]; c.logo = null; c.favicon = null; return c; }))); } catch (e2) {}
    }
  }
  window.BottegaStore = {
    all: function () { return read().sort(function (a, b) { return (b.status === 'pubblicata') - (a.status === 'pubblicata') || (b.created || b.updated || 0) - (a.created || a.updated || 0); }); }, /* la pubblicata per prima, poi le bozze per data di creazione (la più recente prima) */
    get: function (id) { return read().filter(function (b) { return b.id === id; })[0] || null; },
    save: function (b) {
      var list = read(), i = -1; b.updated = Date.now();
      list.forEach(function (x, n) { if (x.id === b.id) i = n; });
      b.created = b.created || (i > -1 && list[i].created) || b.updated; /* data di creazione: si scrive una volta sola */
      if (i > -1) list[i] = b; else list.push(b);
      if (b.status === 'pubblicata') list.forEach(function (x) { if (x.id !== b.id && x.status === 'pubblicata') x.status = 'bozza'; });
      write(list); return b;
    },
    remove: function (id) { write(read().filter(function (b) { return b.id !== id; })); },
    clear: function () { write([]); }
  };
})();
