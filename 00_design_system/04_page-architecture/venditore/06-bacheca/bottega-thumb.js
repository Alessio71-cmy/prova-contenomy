/* Anteprima del tema per le card della pagina Bottega (16/10/2026).
   Come le card dei temi in bottega-creazione: un iframe `srcdoc` costruito dal pacchetto del tema (Temi/NN_tema/NN_tema_Package/package.js),
   non interattivo e scalato alla larghezza del riquadro. Viene riempito con i dati della bottega (nome, presentazione, logo, link social, colore della copertina).
   NOTA: logica copiata e ridotta da bottega-creazione.js (themeDoc / bindFrame / paintFrame / fitBox). Quando l'editor avrà una pagina propria,
   le due pagine dovranno usare un solo file condiviso. */
(function () {
  'use strict';
  var PKG = window.ContenomyThemes || {}, W = 1200, NAME_TOKEN = '[NOME BOTTEGA]', DEMO_NAME = 'Nome della bottega', SOCIAL_ARROW = 'M3 10h14M11 4l6 6-6 6';

  function HOST() { /* eseguito DENTRO l'iframe prima dello script del tema */
    var mem = {};
    ['sessionStorage', 'localStorage'].forEach(function (n) {
      try { void window[n].length; } catch (e) {
        var s = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, n + k) ? mem[n + k] : null; }, setItem: function (k, v) { mem[n + k] = String(v); }, removeItem: function (k) { delete mem[n + k]; }, clear: function () { mem = {}; }, key: function () { return null; }, length: 0 };
        try { Object.defineProperty(window, n, { value: s, configurable: true }); } catch (_) {}
      }
    });
    document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) e.preventDefault(); }, true);
  }
  function doc(t) {
    return '<!doctype html><html lang="it" data-host="thumb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + t.css + '</style>' +
      '<style>html{scrollbar-width:thin;overflow-x:clip;overflow:hidden}body{margin:0}</style><script>(' + HOST.toString() + ')();<\/script></head><body>' + t.pages.bottega.html +
      '<script>' + t.script.replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>';
  }
  function socialLabel(u) { var h = u.replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').split(/[\/?#]/)[0], s = h.split('.')[0] || h; return s.charAt(0).toUpperCase() + s.slice(1); }

  function paint(fr, b) { /* dati della bottega -> DOM dell'anteprima */
    var d; try { d = fr.contentDocument; } catch (e) { return; }
    if (!d || !d.body || !d.documentElement.hasAttribute('data-host')) return;
    var name = (b.name || '').trim() || DEMO_NAME, q = function (s, r) { return (r || d).querySelector(s); }, qa = function (s) { return Array.prototype.slice.call(d.querySelectorAll(s)); };
    var hero = q('[data-component="C05"]'), h1 = hero && hero.querySelector('h1'), bio = hero && hero.querySelector('p.t-lead');
    var w = d.createTreeWalker(d.body, 4, null), n;
    while ((n = w.nextNode())) {
      if (n.nodeValue.indexOf(NAME_TOKEN) < 0 || /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) || (h1 && h1.contains(n))) continue;
      n.nodeValue = n.nodeValue.split(NAME_TOKEN).join(name);
    }
    if (h1) h1.textContent = name;
    if (bio && (b.bio || '').trim()) bio.textContent = b.bio.trim();
    qa('a.nav__logo').forEach(function (a) {
      a.textContent = '';
      if (b.logo) { var img = d.createElement('img'); img.alt = ''; img.src = b.logo; img.style.cssText = 'height:2rem;width:auto;max-width:12rem;object-fit:contain'; a.appendChild(img); } else a.textContent = name;
    });
    var links = (b.social || []).map(function (s) { return s.trim(); }).filter(Boolean);
    qa('nav[aria-label="Social"]').forEach(function (nav) {
      Array.prototype.slice.call(nav.querySelectorAll('a')).forEach(function (a) { a.parentNode.removeChild(a); });
      links.forEach(function (u) { var a = d.createElement('a'); a.setAttribute('href', '#'); a.innerHTML = '<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><path d="' + SOCIAL_ARROW + '"></path></svg><span></span>'; a.lastChild.textContent = socialLabel(u); nav.appendChild(a); });
      nav.style.display = links.length ? '' : 'none';
    });
    if (hero) { var tone = b.color || 'ink', fb = hero.querySelector('[data-action="follow"]'); hero.setAttribute('data-tone', tone); if (fb) fb.classList.toggle('btn--light', tone === 'ink'); }
  }

  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; io.unobserve(e.target); var fr = e.target.firstChild; if (fr && fr._doc) { fr.srcdoc = fr._doc; fr._doc = null; } }); }, { rootMargin: '400px' }) : null;
  function fit(box) { var fr = box.firstChild, cw = box.clientWidth, ch = box.clientHeight; if (!fr || !cw || !ch) return; var k = cw / W; fr.style.width = W + 'px'; fr.style.height = Math.ceil(ch / k) + 'px'; fr.style.transform = 'scale(' + k + ')'; }
  var ro = 'ResizeObserver' in window ? new ResizeObserver(function (es) { es.forEach(function (e) { fit(e.target); }); }) : null;

  window.BottegaThumb = {
    has: function (id) { return !!(PKG[id] && PKG[id].pages && PKG[id].pages.bottega); },
    mount: function (box, b) { /* box = .theme-thumb vuoto */
      var t = PKG[b.theme]; if (!t || !t.pages || !t.pages.bottega) return false;
      var fr = document.createElement('iframe'); fr.className = 'theme-frame'; fr.title = 'Anteprima di ' + (b.name || 'bottega'); fr.tabIndex = -1; fr.setAttribute('aria-hidden', 'true');
      fr.addEventListener('load', function () { paint(fr, b); });
      fr._doc = doc(t); box.appendChild(fr);
      if (io) io.observe(box); else { fr.srcdoc = fr._doc; fr._doc = null; }
      if (ro) ro.observe(box); fit(box); return true;
    }
  };
})();
