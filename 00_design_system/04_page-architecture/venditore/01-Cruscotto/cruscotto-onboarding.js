// Cruscotto onboarding — Venditore v2 (12/10/2026)
//
// 1) Sidebar comprimibile (identico a cruscotto.js).
// 2) Stato dei tre passaggi del banner. SOLO WIREFRAME: nel prodotto reale lo stato arriva dal backend
//    (fiscal_regime e dati fiscali, campi Identità pubblica / template, stripe_account_id).
//
//    Anteprima degli stati via URL, ad esempio (NON persistono al refresh — ogni ricarica riparte da zero passaggi fatti):
//      cruscotto-onboarding.html                                   -> nessun passaggio fatto
//      cruscotto-onboarding.html?fatti=prodotto                    -> 1 su 4
//      cruscotto-onboarding.html?fatti=prodotto,bottega            -> 2 su 4
//      cruscotto-onboarding.html?fatti=bottega&verifica=stripe     -> bottega fatta, Stripe in verifica
//    Chiavi valide: prodotto | bottega | fiscali | stripe (ordine 12/11/2026, Ruggi — sostituisce l'ordine precedente). Stato condiviso con la
//    pagina Bottega (account-setup.js), solo in memoria: nessun passaggio è bloccato da un altro. "La tua bottega" e "Il primo prodotto" portano
//    alle pagine reali; fiscali e Stripe simulano il completamento (Stripe passa prima da "in verifica").
//
//    Regole dei blocchi condizionali (attributo data-mostra-se, condizioni separate da spazio, "!" = non completato):
//      incassi                         -> solo con "fiscali" (il regime determina il componente)
//      azioni header, drop attivabili  -> solo con "bottega"
//      Ultimi prodotti (3 stati)       -> "!prodotto !bottega": CTA crea prodotto · "prodotto !bottega": card bozza da completare · "bottega": griglia "Nuovo prodotto"
document.addEventListener('DOMContentLoaded', () => {
  const shell = document.querySelector('.shell');
  const toggleBtn = document.getElementById('sidebarToggle');
  if (shell && toggleBtn) {
    toggleBtn.addEventListener('click', () => shell.classList.toggle('sidebar-collapsed'));
  }

  // 16/10/2026: stato e rendering del banner arrivano da ../account-setup.js (condiviso con la pagina Bottega). Qui restano toast e blocchi condizionali.
  const A = window.AccountSetup;
  A.dest('bottega', () => '../06-bacheca/bottega-onboarding.html');
  A.dest('prodotto', () => '../02-Prodotti/prodotti.html');
  const banner = document.getElementById('onbBanner');
  const toastStack = document.getElementById('onbToastStack');
  const toastMotionMs = 560; // due incrementi del token motion-duration-280

  function dismissToast(toast) {
    if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
    clearTimeout(toast.dismissTimer);
    toast.classList.remove('is-visible');
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), toastMotionMs);
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = 'onb-toast ' + type;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = '<span class="onb-toast-message"></span><span class="onb-toast-close-wrap"><svg class="onb-toast-timer" viewBox="0 0 20 20" aria-hidden="true"><circle class="onb-toast-timer-track" cx="10" cy="10" r="8"/><circle class="onb-toast-timer-fill" cx="10" cy="10" r="8"/></svg><button class="onb-toast-dismiss" type="button" aria-label="Chiudi notifica"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></span>';
    toast.querySelector('.onb-toast-message').textContent = message;
    toast.querySelector('.onb-toast-dismiss').addEventListener('click', () => dismissToast(toast));
    toastStack.append(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    toast.dismissTimer = setTimeout(() => dismissToast(toast), 5000);
  }

  const LABELS = { fiscali: 'Dati fiscali', bottega: 'La tua bottega', prodotto: 'Il primo prodotto', stripe: 'Pagamenti con Stripe' };

  // Blocchi condizionali (data-mostra-se): leggono lo stato condiviso
  function renderConditionals(state) {
    document.querySelectorAll('[data-mostra-se]').forEach((el) => {
      const ok = el.dataset.mostraSe.split(/\s+/).every((cond) => {
        const negato = cond.startsWith('!');
        const key = negato ? cond.slice(1) : cond;
        return negato ? state[key] !== 'done' : state[key] === 'done';
      });
      el.hidden = !ok;
    });
  }

  A.mountBanner(banner, {
    onRender: renderConditionals,
    onDone: (k) => { if (A.get()[k] === 'done') showToast(LABELS[k] + ' completato.'); }
  });
  document.querySelectorAll('[data-vai]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); A.complete(a.dataset.vai); }));
});
