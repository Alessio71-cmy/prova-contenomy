/* Prodotto — archivio dei prodotti del venditore (wireframe, 19/11/2026).
   Solo un mock, sul modello di ../06-bacheca/bottega-store.js: localStorage (fallback sessionStorage), serve a far parlare fra loro
   prodotto-creazione.html e (in seguito, dopo approvazione) prodotti.html / prodotti-panel-static.html.
   Un prodotto: { id, stato:'bozza', nome, categoria, genere, tipo, attributi{}, tag[], storia, netto, prezzoFinale, immagini[], varianti[{nome,tiratura,netto}],
                  tiratura, prezzoNarrato, personalizzato, regalo, garanzia, evento{data,chiusura,politica}, richiedeInput, created, updated } */
(function () {
  'use strict';
  var KEY = 'contenomy.prodotti.v1', mem = [];
  function store(n) { try { var s = window[n]; s.setItem(KEY + '.t', '1'); s.removeItem(KEY + '.t'); return s; } catch (e) { return null; } }
  var ST = store('localStorage') || store('sessionStorage');
  function read() { if (!ST) return mem.slice(); try { return JSON.parse(ST.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function write(list) { mem = list.slice(); if (!ST) return; try { ST.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  window.ProdottoStore = {
    all: function () { return read().sort(function (a, b) { return (b.created || 0) - (a.created || 0); }); },
    get: function (id) { return read().filter(function (p) { return p.id === id; })[0] || null; },
    save: function (p) {
      var list = read(), i = -1; p.updated = Date.now();
      list.forEach(function (x, n) { if (x.id === p.id) i = n; });
      p.created = p.created || (i > -1 && list[i].created) || p.updated;
      if (i > -1) list[i] = p; else list.push(p);
      write(list); return p;
    },
    remove: function (id) { write(read().filter(function (p) { return p.id !== id; })); },
    clear: function () { write([]); }
  };
})();
