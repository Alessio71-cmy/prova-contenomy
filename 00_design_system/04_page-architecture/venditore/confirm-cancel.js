/* 24/11/2026 (Ruggi) — «Annulla creazione» in creazione bottega e creazione prodotto: modale di conferma «Sei sicuro di voler eliminare?».
   Modale di CONFERMA (stile .order-modal di Ordini, 24/11/2026 Ruggi): titolo, testo, azioni; niente header separato, niente X, niente divisori; padding space-8; button a taglia normale (Annulla outline + Elimina ghost rosso); il focus parte su «Annulla» (l'azione distruttiva non è quella di default); Esc equivale ad «Annulla»; il click sullo sfondo NON chiude (24/11/2026, Ruggi: la conferma richiede una scelta esplicita). Candidato locale (le classi .confirm-modal* sono in bottega-creazione.css). */
(function () {
  window.askCancelCreation = function (text, onGo) {
    var m = document.createElement('div'); m.className = 'confirm-modal';
    m.innerHTML = '<div class="confirm-modal-backdrop"></div><div class="confirm-modal-box" tabindex="-1" role="alertdialog" aria-modal="true" aria-labelledby="cfTitle" aria-describedby="cfText">' +
      '<div class="confirm-modal-title" id="cfTitle">Sei sicuro di voler eliminare?</div><p class="confirm-modal-text" id="cfText"></p>' +
      '<div class="confirm-modal-actions"><button type="button" class="btn-ghost danger" data-close>Annulla</button><button type="button" class="btn-pill-dark primary danger" data-go>Elimina</button></div></div>';
    m.querySelector('#cfText').textContent = text;
    var opener = document.activeElement;
    function close() { document.removeEventListener('keydown', key, true); m.remove(); if (opener && opener.focus) try { opener.focus(); } catch (e) {} }
    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') { var f = Array.prototype.slice.call(m.querySelectorAll('button')), i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    }
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) close(); else if (e.target.closest('[data-go]')) { close(); onGo(); } });
    document.addEventListener('keydown', key, true); document.body.appendChild(m); m.querySelector('.btn-pill-dark').focus();
  };
  window.bindCancelCreation = function (link, text, skip) { /* skip(): true = nessuna conferma (es. link «Torna alle botteghe») */
    link.addEventListener('click', function (e) {
      if (skip && skip()) return;
      e.preventDefault(); var href = link.getAttribute('href');
      window.askCancelCreation(text, function () { location.href = href; });
    });
  };
})();
