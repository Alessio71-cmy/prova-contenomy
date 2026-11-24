/* Stato condiviso dei passaggi di attivazione account + rendering del banner (16/10/2026, Ruggi).
   SOLO WIREFRAME: nel prodotto reale lo stato arriva dal backend (dati fiscali, bottega, prodotti, stripe_account_id).
   Usato da: 01-Cruscotto/cruscotto-onboarding (banner esteso) e 06-bacheca/bottega-onboarding (banner compatto).
   Passaggi (ordine, aggiornato 12/11/2026 — Ruggi, sostituisce l'ordine precedente del 12/10 e del 16/10): prodotto · bottega · fiscali · stripe.
   Stati: todo | done | verifica (solo stripe).
   - "bottega" è completato se esiste almeno una bottega nel BottegaStore (se caricato) oppure per flag.
   - Nessun passaggio è più bloccato da un altro (12/11/2026, Ruggi): il prodotto si crea anche senza bottega, con i dati minimi, e resta in bozza finché non c'è una bottega a cui agganciarlo.
   Parametri di prova valgono solo per il caricamento corrente: lo stato NON è più persistito (ogni refresh riparte da zero passaggi fatti, come nel prodotto reale dove arriva dal backend).
   ?reset=1 azzera anche BottegaStore (eventuali botteghe di test salvate in precedenza nel browser) per poter vedere/presentare lo stato a zero su richiesta:
     ?fatti=prodotto,bottega,fiscali,stripe · ?verifica=stripe · ?stripe=on · ?prodotti=0|N · ?reset=1 */
(function () {
  'use strict';
  var ORDER = ['prodotto', 'bottega', 'fiscali', 'stripe'], CIRC = 50.27, mem = {}, subs = [];
  var qs = location.search;
  /* 12/11/2026 (Ruggi): stato non persistito — ogni refresh riparte da zero, i parametri ?fatti=... valgono solo per questo caricamento. */
  function read() { return mem; }
  function write(o) { mem = o; }
  function par(n) { var m = new RegExp('[?&]' + n + '=([^&]*)').exec(qs); return m ? decodeURIComponent(m[1]) : null; }

  var s = read();
  if (par('reset') === '1') { s = {}; if (window.BottegaStore) window.BottegaStore.clear(); } /* 12/11/2026 (Ruggi): reset esplicito su richiesta, azzera anche i dati mock di BottegaStore */
  (par('fatti') || '').split(',').forEach(function (k) { if (ORDER.indexOf(k) > -1) s[k] = 'done'; });
  if (par('verifica') === 'stripe' && s.stripe !== 'done') s.stripe = 'verifica';
  if (par('stripe') === 'on') s.stripe = 'done';
  if (par('prodotti') !== null) s.prodotto = parseInt(par('prodotti'), 10) > 0 ? 'done' : 'todo';
  write(s);

  function get() {
    var cur = read(), st = {}, BS = window.BottegaStore;
    ORDER.forEach(function (k) { st[k] = cur[k] || 'todo'; });
    if (BS && BS.all().length) st.bottega = 'done';
    return st;
  }
  function blocked(k) { return false; } /* 12/11/2026 (Ruggi): nessun passaggio è più bloccato da un altro */
  function set(k, v) { var cur = read(); cur[k] = v; write(cur); subs.forEach(function (f) { f(); }); }
  function clear(k) { var cur = read(); delete cur[k]; write(cur); }
  function subscribe(f) { subs.push(f); }
  function $(sel, r) { return (r || document).querySelector(sel); }
  function counts() { var st = get(); return ORDER.filter(function (k) { return st[k] === 'done'; }).length; }
  function ring(el, n) { el.setAttribute('stroke-dashoffset', (CIRC * (1 - n / ORDER.length)).toFixed(2)); }

  /* Cosa succede al clic: bottega e prodotto portano alle pagine reali, gli altri passaggi (senza pagina nel wireframe) simulano il completamento. */
  var DEST = {};
  function complete(k, opts) {
    if (DEST[k]) { location.href = DEST[k](); return; }
    set(k, k === 'stripe' && get().stripe === 'todo' ? 'verifica' : 'done');
    if (opts && opts.onDone) opts.onDone(k);
  }

  /* Banner unico e comprimibile (16/10/2026, decisione Ruggi): stesso componente in tutte le pagine.
     Chiuso: titolo fisso + contatore/chevron in alto a destra (tutta la riga è il bottone che apre e chiude) e, sotto, il prossimo passaggio con la CTA primaria.
     Aperto: sotto compaiono le card dei passaggi (la CTA del "prossimo" resta solo nella riga sopra). Aperto di default con 0 passaggi fatti, poi si ricorda la scelta.
     opts.show(): false = nascosto a prescindere (es. Bottega senza botteghe) · opts.onRender(stato) · opts.onDone(chiave). */
  var STEPS = {
    fiscali: { title: 'Dati fiscali', headline: 'Completa i dati fiscali', cta: 'Completa i dati fiscali', long: "Indica il tuo regime fiscale e i dati della tua attività.", desc: 'Indica regime fiscale e dati della tua attività. Servono per calcolare incassi e fatture.' },
    prodotto: { title: 'Il tuo primo prodotto', headline: 'Crea il tuo primo prodotto', cta: 'Crea prodotto', long: "Inizia da qui: inserisci tipologia, prezzo e quantità del tuo primo prodotto. Foto e varianti sono facoltative, puoi completarlo più avanti insieme alla bottega.", desc: 'Inserisci tipologia, prezzo e quantità per iniziare. Il resto si completa più avanti.' },
    bottega: { title: 'La tua bottega', headline: 'Costruisci la tua bottega', cta: 'Costruisci la bottega', long: "Scegli lo stile della tua bottega e presentati ai clienti con nome, storia e immagine. I drop e la vendita pubblica partono da qui.", desc: 'Scegli lo stile della tua bottega e presentati ai clienti. I drop partono da qui.' },
    stripe: { title: 'Pagamenti con Stripe', headline: 'Collega Stripe per incassare', cta: 'Collega Stripe', long: "Collega Stripe per ricevere i pagamenti dei tuoi clienti e poter pubblicare la bottega. Ti servono un documento d'identità e l'IBAN del conto su cui incassare.", desc: 'Collega Stripe per ricevere i pagamenti. Ti servono documento e IBAN.', descVerifica: 'Stripe sta verificando i tuoi dati. Ti avvisiamo appena il conto sarà attivo.' }
  };
  var RING = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle class="ring-track" cx="10" cy="10" r="8" fill="none" stroke-width="2.5" /><circle class="ring-fill" cx="10" cy="10" r="8" fill="none" stroke-width="2.5" stroke-dasharray="50.27" stroke-dashoffset="50.27" stroke-linecap="round" transform="rotate(-90 10 10)" /></svg>';
  var CHEV = '<svg class="onb-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  function stepLi(k, i) {
    var c = STEPS[k];
    return '<li class="onb-step" data-step="' + k + '"><div class="onb-step-main"><div class="onb-step-marker-row"><span class="status-dot" aria-hidden="true">' + (i + 1) + '</span><span class="tag" hidden>Consigliato</span><span class="onb-step-done-label" hidden>Completato</span>' +
      (k === 'stripe' ? '<span class="status-pill pausa" hidden><i class="dot"></i>In verifica</span>' : '') + '</div><div class="onb-step-text"><h3 class="onb-step-title">' + c.title + '</h3><p class="onb-step-desc">' + c.desc + '</p></div></div>' +
      '<div class="onb-step-action"><button class="btn-ghost onb-cta" type="button" data-step="' + k + '">' + c.cta + '</button></div></li>';
  }
  function mountBanner(root, opts) {
    opts = opts || {};
    root.classList.add('onb-banner');
    root.innerHTML = '<div class="onb-head">' +
        '<button type="button" class="onb-toggle" aria-expanded="false" aria-controls="onbPanel"><span class="card-title title-lg onb-next-title"></span>' +
          '<span class="onb-toggle-meta" data-tooltip="Mostra i passaggi"><span class="todo-progress">' + RING + '<span class="onb-count"></span></span>' + CHEV + '</span></button>' +
        '<p class="onb-next-desc"></p><button type="button" class="btn-pill-dark primary onb-next-cta"></button></div>' +
      '<div class="onb-panel" id="onbPanel"><div class="onb-panel-inner"><ol class="onb-steps" aria-label="Passaggi per attivare il tuo account">' + ORDER.map(stepLi).join('') + '</ol></div></div>';
    var toggle = $('.onb-toggle', root), panel = $('.onb-panel', root), nextCta = $('.onb-next-cta', root);
    var nextK = null;
    function isOpen(n) { var cur = read(); return typeof cur.open === 'boolean' ? cur.open : n === 0; }
    function applyOpen(open) {
      root.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); panel.inert = !open;
      $('.onb-toggle-meta', root).setAttribute('data-tooltip', open ? 'Nascondi i passaggi' : 'Mostra i passaggi'); /* sul gruppo contatore+chevron, così il tooltip sta accanto al chevron */
    }
    function render() {
      var st = get(), n = counts(), next = ORDER.filter(function (k) { return st[k] === 'todo' && !blocked(k); })[0];
      nextK = next || null;
      root.hidden = !((!opts.show || opts.show()) && n < ORDER.length);
      $('.onb-count', root).textContent = n + ' di ' + ORDER.length + ' passaggi'; ring($('.ring-fill', root), n);
      applyOpen(isOpen(n));
      var tt = $('.onb-next-title', root), dd = $('.onb-next-desc', root);
      if (next) { tt.textContent = STEPS[next].headline; dd.textContent = STEPS[next].long; nextCta.hidden = false; nextCta.textContent = STEPS[next].cta; }
      else { tt.textContent = 'Stripe sta verificando i tuoi dati'; dd.textContent = 'Stripe sta controllando i tuoi dati. Ti avvisiamo appena il conto sarà attivo: da quel momento potrai pubblicare la bottega e incassare i pagamenti.'; nextCta.hidden = true; }
      Array.prototype.forEach.call(root.querySelectorAll('.onb-step'), function (li) {
        var k = li.dataset.step, v = st[k], isNext = k === next, bl = blocked(k), c = STEPS[k];
        li.classList.toggle('done', v === 'done'); li.classList.toggle('is-next', isNext);
        var dot = $('.status-dot', li); dot.classList.toggle('done', v === 'done'); dot.textContent = v === 'done' ? '✓' : String(ORDER.indexOf(k) + 1);
        $('.tag', li).hidden = !isNext; $('.onb-step-done-label', li).hidden = v !== 'done';
        var pill = $('.status-pill', li); if (pill) pill.hidden = v !== 'verifica';
        $('.onb-step-desc', li).textContent = (k === 'stripe' && v === 'verifica') ? c.descVerifica : c.desc;
        $('.onb-step-action', li).hidden = v !== 'todo' || bl || isNext; /* la CTA del prossimo passaggio vive solo nella riga sopra */
      });
      if (opts.onRender) opts.onRender(st);
    }
    toggle.addEventListener('click', function () { var open = !root.classList.contains('is-open'); var cur = read(); cur.open = open; write(cur); applyOpen(open); });
    nextCta.addEventListener('click', function () { if (nextK) complete(nextK, opts); });
    $('.onb-steps', root).addEventListener('click', function (e) { var b = e.target.closest('.onb-cta'); if (b && !blocked(b.dataset.step)) complete(b.dataset.step, opts); });
    subscribe(render); render(); return render;
  }

  window.AccountSetup = { ORDER: ORDER, get: get, set: set, clear: clear, blocked: blocked, subscribe: subscribe, mountBanner: mountBanner, complete: complete, dest: function (k, fn) { DEST[k] = fn; } };
})();
