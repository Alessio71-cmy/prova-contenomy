/* 13/10/2026, richiesta Ruggi: attiva/disattiva .workspace-content-fit in base al contenuto (vedi workspace-fit.css).
   Il contenuto "sta" se l'altezza di .workspace-inner entra nell'area utile del .workspace calcolata COME SE il margin-bottom fosse sempre presente:
   cosi' aggiungere/togliere la classe non cambia il risultato (nessuna oscillazione).
   Pannello destro: aprendolo/chiudendolo il .workspace anima margin-right (la larghezza cambia, quindi anche l'altezza del contenuto). Durante la transizione
   la valutazione e' sospesa e viene rifatta alla fine, cosi' la regola non "salta" a meta' animazione; a transizione finita vale la stessa regola di sempre. */
(function () {
  function init() {
    var workspace = document.querySelector('.workspace');
    if (!workspace) return;
    var inner = workspace.querySelector('.workspace-inner');
    var body = workspace.closest('.body');
    var transitioning = false;

    function update() {
      if (transitioning) return;
      var cs = getComputedStyle(workspace);
      var gap = parseFloat(cs.getPropertyValue('--space-4')) || 0;
      var padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      var isFit = workspace.classList.contains('workspace-content-fit');
      var available = workspace.clientHeight - padding + (isFit ? gap : 0) - gap;
      var content = inner ? inner.scrollHeight : workspace.scrollHeight;
      var fits = content <= available + 1;
      workspace.classList.toggle('workspace-content-fit', fits);
      /* 13/10/2026: lo stesso stato sul .body, per il pannello destro (vedi workspace-fit.css). */
      if (body) body.classList.toggle('workspace-fit', fits);
    }

    function isMargin(e) { return e.target === workspace && e.propertyName === 'margin-right'; }
    workspace.addEventListener('transitionrun', function (e) { if (isMargin(e)) transitioning = true; });
    workspace.addEventListener('transitionend', function (e) { if (isMargin(e)) { transitioning = false; update(); } });
    workspace.addEventListener('transitioncancel', function (e) { if (isMargin(e)) { transitioning = false; update(); } });

    update();
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(update);
      ro.observe(workspace);
      if (inner) ro.observe(inner);
    }
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
