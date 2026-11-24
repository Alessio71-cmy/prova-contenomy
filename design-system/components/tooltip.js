/* Tooltip condiviso: il layer vive in <body>, non nel contenitore del trigger.
   Così non può essere tagliato da pannelli con overflow o transform.

   Comportamento (2/11/2026, su richiesta di Ruggi):
   - il ritardo di apparizione vale solo al PRIMO tooltip; passando da un'icona
     a quella accanto (tooltip visibile o appena chiuso) il nuovo compare subito;
   - il ritardo è gestito qui, non nel CSS, così un re-show durante il fade-out
     riparte dall'opacità corrente invece di restare opacizzato;
   - cambio scheda / finestra: il tooltip viene azzerato e gli eventi sintetici
     che il browser rilancia al ritorno (pointerover, focusin) vengono ignorati
     finché non c'è un vero movimento del mouse o un tasto;
   - il focus mostra il tooltip solo se è :focus-visible (tastiera);
   - se il trigger sparisce dal DOM o perde data-tooltip, il tooltip si chiude. */
(function () {
  var activeTrigger = null;
  var tooltip = null;
  var frame = null;
  var showTimer = null;
  var warmTimer = null;
  var observer = null;
  var warm = false;          /* true = tooltip visibile o chiuso da poco: niente ritardo */
  var armed = true;          /* false dopo cambio scheda/finestra, finché non c'è input reale */
  var GAP = 8;
  var GUTTER = 8;
  var WARM_GRACE = 300;      /* ms in cui un nuovo trigger compare senza ritardo dopo una chiusura */

  function cssMs(name, fallback) {
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
    return isNaN(v) ? fallback : v;
  }

  /* stesso ritardo di prima: 150 + 280 + 150 ms, letto dalle variabili motion */
  function showDelay() {
    return cssMs('--motion-duration-150', 150) * 2 + cssMs('--motion-duration-280', 280);
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = 'app-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function positionTooltip() {
    if (!activeTrigger || !tooltip) return;
    var rect = activeTrigger.getBoundingClientRect();
    var width = tooltip.offsetWidth;
    var height = tooltip.offsetHeight;
    var spaceAbove = rect.top - GAP - GUTTER;
    var spaceBelow = window.innerHeight - rect.bottom - GAP - GUTTER;
    var openBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
    var left = clamp(rect.left + rect.width / 2 - width / 2, GUTTER, window.innerWidth - width - GUTTER);
    var top = openBelow ? rect.bottom + GAP : rect.top - height - GAP;

    tooltip.style.left = left + 'px';
    tooltip.style.top = clamp(top, GUTTER, window.innerHeight - height - GUTTER) + 'px';
    tooltip.classList.toggle('app-tooltip--below', openBelow);
  }

  function reveal() {
    showTimer = null;
    if (!activeTrigger || !activeTrigger.isConnected) return hideNow();
    var text = activeTrigger.getAttribute('data-tooltip');
    if (!text) return hideNow();
    ensureTooltip();
    tooltip.textContent = text;
    positionTooltip();
    tooltip.classList.add('is-visible');
    warm = true;
    clearTimeout(warmTimer);
    watchTrigger();
  }

  function show(trigger) {
    if (!trigger.getAttribute('data-tooltip')) return;
    clearTimeout(showTimer);
    clearTimeout(warmTimer);
    showTimer = null;
    activeTrigger = trigger;
    if (warm) reveal();
    else showTimer = setTimeout(reveal, showDelay());
  }

  function hide(trigger) {
    if (trigger && trigger !== activeTrigger) return;
    hideNow(true);
  }

  /* keepWarm: dopo un normale mouseout il prossimo trigger vicino compare subito */
  function hideNow(keepWarm) {
    clearTimeout(showTimer);
    clearTimeout(warmTimer);
    showTimer = null;
    if (tooltip) tooltip.classList.remove('is-visible');
    activeTrigger = null;
    unwatchTrigger();
    if (keepWarm && warm) warmTimer = setTimeout(function () { warm = false; }, WARM_GRACE);
    else warm = false;
  }

  /* trigger rimosso dal DOM (re-render con innerHTML) o data-tooltip cambiato/tolto */
  function watchTrigger() {
    if (!observer) {
      observer = new MutationObserver(function () {
        if (!activeTrigger) return;
        var text = activeTrigger.getAttribute('data-tooltip');
        if (!activeTrigger.isConnected || !text) return hideNow();
        if (tooltip && tooltip.textContent !== text) {
          tooltip.textContent = text;
          positionTooltip();
        }
      });
    }
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tooltip'] });
  }

  function unwatchTrigger() {
    if (observer) observer.disconnect();
  }

  function queuePosition() {
    if (!activeTrigger || frame) return;
    frame = window.requestAnimationFrame(function () {
      frame = null;
      if (activeTrigger && !activeTrigger.isConnected) return hideNow();
      positionTooltip();
    });
  }

  function disarm() {
    armed = false;
    hideNow();
  }

  function isFocusVisible(el) {
    try { return el.matches(':focus-visible'); } catch (e) { return true; }
  }

  /* eventi sintetici del nostro codice (isTrusted false, es. proxy dell'iframe nell'editor) passano sempre */
  document.addEventListener('pointerover', function (event) {
    if (!armed && event.isTrusted) return;
    var trigger = event.target.closest('[data-tooltip]');
    if (trigger) show(trigger);
  });

  document.addEventListener('pointerout', function (event) {
    var trigger = event.target.closest('[data-tooltip]');
    if (trigger && !trigger.contains(event.relatedTarget)) hide(trigger);
  });

  /* primo vero movimento dopo il ritorno: riarma e, se il mouse è già su un trigger, lo mostra */
  document.addEventListener('pointermove', function (event) {
    if (armed || !event.isTrusted) return;
    armed = true;
    var trigger = event.target.closest && event.target.closest('[data-tooltip]');
    if (trigger) show(trigger);
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.isTrusted) armed = true;
  }, true);

  document.addEventListener('focusin', function (event) {
    if (!armed) return;
    var trigger = event.target.closest('[data-tooltip]');
    if (trigger && isFocusVisible(trigger)) show(trigger);
  });

  document.addEventListener('focusout', function (event) {
    var trigger = event.target.closest('[data-tooltip]');
    if (trigger && !trigger.contains(event.relatedTarget)) hide(trigger);
  });

  /* cambio scheda / app / ripristino dalla cache */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') disarm();
  });
  window.addEventListener('pagehide', disarm);
  window.addEventListener('pageshow', function (event) { if (event.persisted) disarm(); });
  window.addEventListener('blur', function () {
    /* il blur scatta anche cliccando dentro un iframe: lì hasFocus() resta true */
    setTimeout(function () { if (!document.hasFocus()) disarm(); }, 0);
  });

  window.addEventListener('resize', queuePosition);
  window.addEventListener('scroll', queuePosition, true);
}());
