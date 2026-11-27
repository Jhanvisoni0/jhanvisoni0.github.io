/* Jhanvi Soni: transit-map portfolio
   One source of truth: the <article class="station"> blocks in index.html.
   The list view shows them as-is; the map view builds stations from them and
   opens a copy in the drawer. Everything here no-ops on pages without a map. */
(function () {
  'use strict';

  var root = document.documentElement;
  var doc = document;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var coarse = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  var LINES = { eng: 'Engineering line', ai: 'AI & Writing line', lrn: 'Learning line', all: 'Contact' };
  var BADGE = { eng: 'E', ai: 'A', lrn: 'L', all: '★' };

  /* ---------------- theme ---------------- */
  var tBtn = $('#themeToggle');
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    if (tBtn) tBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
  if (root.getAttribute('data-theme') !== 'light' && root.getAttribute('data-theme') !== 'dark') {
    var hr = new Date().getHours();
    applyTheme(hr >= 7 && hr < 19 ? 'light' : 'dark');
  } else {
    applyTheme(root.getAttribute('data-theme'));
  }
  if (tBtn) tBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store('theme', next);
  });


  /* ---------------- collapsible highlights (points, note, tags) ---------------- */
  $$('.station').forEach(function (a) {
    var parts = $$('.st-points, .st-note, .st-tags', a);
    if (!parts.length) return;
    var d = doc.createElement('details');
    d.className = 'st-more';
    var sm = doc.createElement('summary');
    sm.textContent = $('.st-points', a) ? 'Highlights & stack' : 'More';
    d.appendChild(sm);
    var links = $('.st-links', a);
    a.insertBefore(d, links || null);
    parts.forEach(function (p) { d.appendChild(p); });
  });

  /* ---------------- board scramble ---------------- */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function scramble(el, delay) {
    var finalText = el.getAttribute('data-text') || el.textContent;
    var dur = 300 + Math.min(finalText.length, 40) * 6;
    var t0 = null;
    var run = el._run = (el._run || 0) + 1;
    function frame(ts) {
      if (el._run !== run) return;
      if (t0 === null) t0 = ts;
      var p = (ts - t0) / dur;
      if (p >= 1) { el.textContent = finalText; return; }
      var out = '';
      var cut = Math.floor(finalText.length * p);
      for (var i = 0; i < finalText.length; i++) {
        var ch = finalText.charAt(i);
        out += (i < cut || ch === ' ') ? ch : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
      }
      el.textContent = out;
      setTimeout(function () { requestAnimationFrame(frame); }, 34);
    }
    setTimeout(function () { requestAnimationFrame(frame); }, delay);
  }
  if (!reduce) {
    /* only the first row flips, and it settles in well under a second */
    var firstRow = $('.board-row');
    if (firstRow) $$('.flip', firstRow).forEach(function (el, c) { scramble(el, 100 + c * 60); });
  }


  /* ---------------- "Ask me": step through a few questions ---------------- */
  var ask = $('.board-ask');
  if (ask) {
    var TEASERS = [
      ['The XBRL bug: 0% keyword detection', 'st-rag'],
      ['Z-ordering: 40% faster queries', 'st-msci'],
      ['4 days of reporting in 15 minutes', 'st-banking'],
      ['A RAG bot that admits "I don\'t know"', 'st-rag'],
      ['Databricks is not just managed Spark', 'st-post-realization'],
      ['LTAP, explained with a restaurant', 'st-post-ltap'],
      ['REITs: +23% vs \u22128% by rate regime', 'st-assets']
    ];
    var askV = $('.ask-v', ask), askGo = $('.ask-go', ask), askNext = $('.ask-flip', ask), askLive = $('.ask-live', ask);
    var askI = 0;
    askNext.addEventListener('click', function () {
      askI = (askI + 1) % TEASERS.length;
      var t = TEASERS[askI];
      askV.textContent = t[0];
      askGo.setAttribute('href', '#' + t[1]);
      askLive.textContent = 'Next question: ' + t[0];
    });
  }

  /* ---------------- map ---------------- */
  var canvas = $('#mapCanvas');
  if (!canvas) return;

  var scroller = $('#mapScroll');
  var frame = $('#mapFrame');
  var drawer = $('#drawer');
  var drBody = $('#drBody');
  var drBadge = $('#drBadge');
  var drLine = $('#drLine');
  var drPrev = $('#drPrev');
  var drNext = $('#drNext');
  var barEl = $('#mapBar');
  var NS = 'http://www.w3.org/2000/svg';
  var W = 2800, H = 640;

  var articles = $$('.station').map(function (a) {
    return {
      el: a,
      id: a.id,
      line: a.getAttribute('data-line'),
      x: +a.getAttribute('data-x'),
      y: +a.getAttribute('data-y'),
      label: a.getAttribute('data-label') || 'down',
      name: a.getAttribute('data-name') || '',
      sub: a.getAttribute('data-sub') || '',
      link: a.getAttribute('data-link'),
      big: a.getAttribute('data-big') === '1',
      building: a.getAttribute('data-state') === 'building'
    };
  }).sort(function (a, b) { return a.x - b.x; });

  var hint = $('#mapHint');
  if (hint && coarse) hint.textContent = 'Swipe the map sideways. Tap a station for details.';

  /* tracks */
  var svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('aria-hidden', 'true');
  function track(line, d, cls, solid) {
    var p = doc.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'trk ' + cls);
    p.setAttribute('data-line', line);
    if (solid) p.setAttribute('pathLength', '1');
    svg.appendChild(p);
  }
  track('lrn', 'M120 490H2390L2560 320', 'draw', true);
  track('eng', 'M120 150H2390L2560 320', 'draw', true);
  track('ai', 'M1300 150V320H2280', 'draw', true);
  track('ai', 'M2280 320H2560', 'dashed', false);
  canvas.insertBefore(svg, canvas.firstChild);

  function put(tag, cls, x, y, text, line) {
    var d = doc.createElement(tag);
    d.className = cls;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    if (text) d.textContent = text;
    if (line) d.setAttribute('data-line', line);
    canvas.appendChild(d);
    return d;
  }
  /* line start tags */
  [['eng', 150, 'E'], ['lrn', 490, 'L']].forEach(function (t) {
    put('span', 'line-tag', 48, t[1] - 20, t[2], t[0]).setAttribute('aria-hidden', 'true');
  });
  /* transfer: AI line leaves the Engineering line */
  put('span', 'xdot', 1300, 150, '', 'eng').setAttribute('aria-hidden', 'true');
  put('span', 'xlabel', 1316, 232, '↔ Engineering').setAttribute('aria-hidden', 'true');

  /* stations */
  var btns = {};
  articles.forEach(function (s, i) {
    var b = doc.createElement('button');
    b.type = 'button';
    b.className = 'stn ' + s.label + (s.big ? ' big' : '') + (s.building ? ' building' : '');
    b.setAttribute('data-line', s.line);
    b.setAttribute('data-id', s.id);
    if (s.link) b.setAttribute('data-link', s.link);
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-label', s.name + (s.sub ? ', ' + s.sub : '') + '. ' + LINES[s.line] + '. Open details.');
    b.style.setProperty('--x', s.x + 'px');
    b.style.setProperty('--y', s.y + 'px');
    b.style.setProperty('--i', i);
    b.innerHTML = '<span class="dot"></span><span class="stn-label"><span class="stn-name"></span><span class="stn-sub"></span></span>';
    $('.stn-name', b).textContent = s.name;
    $('.stn-sub', b).textContent = s.sub;
    canvas.appendChild(b);
    btns[s.id] = b;
    b.addEventListener('click', function () { openStation(s.id, true); });
  });

  /* drag (mouse only, touch uses native scrolling) */
  var down = false, moved = false, sx = 0, sl = 0;
  scroller.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false; sx = e.clientX; sl = scroller.scrollLeft;
  });
  window.addEventListener('pointermove', function (e) {
    if (!down) return;
    var dx = e.clientX - sx;
    if (!moved && Math.abs(dx) > 4) { moved = true; scroller.classList.add('dragging'); }
    if (moved) scroller.scrollLeft = sl - dx;
  });
  function endDrag() {
    if (!down) return;
    down = false;
    scroller.classList.remove('dragging');
    setTimeout(function () { moved = false; }, 0);
  }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  scroller.addEventListener('click', function (e) {
    if (moved) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* arrows + progress */
  var prevBtn = $('#mapPrev'), nextBtn = $('#mapNext');
  function smooth(left) { scroller.scrollTo({ left: left, behavior: reduce ? 'auto' : 'smooth' }); }
  if (prevBtn) prevBtn.addEventListener('click', function () { smooth(scroller.scrollLeft - Math.max(360, scroller.clientWidth * 0.7)); });
  if (nextBtn) nextBtn.addEventListener('click', function () { smooth(scroller.scrollLeft + Math.max(360, scroller.clientWidth * 0.7)); });
  function updateProgress() {
    var sw = scroller.scrollWidth, cw = scroller.clientWidth;
    if (!sw || !cw) return;
    var max = sw - cw;
    if (barEl) {
      barEl.style.width = (cw / sw * 100) + '%';
      barEl.style.left = (scroller.scrollLeft / sw * 100) + '%';
    }
    if (prevBtn) prevBtn.disabled = scroller.scrollLeft <= 4;
    if (nextBtn) nextBtn.disabled = scroller.scrollLeft >= max - 4;
  }
  scroller.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);

  /* legend focus */
  var legend = $$('.lg');
  function focusLine(line) {
    frame.setAttribute('data-focus', line || '');
    legend.forEach(function (l) { l.setAttribute('aria-pressed', String(l.getAttribute('data-line') === line)); });
    if (line) {
      var first = articles.filter(function (a) { return a.line === line; })[0];
      if (first) centerOn(first.x, true);
    }
  }
  legend.forEach(function (l) {
    l.addEventListener('click', function () {
      var line = l.getAttribute('data-line');
      focusLine(frame.getAttribute('data-focus') === line ? '' : line);
    });
  });

  /* centring */
  function centerOn(x, withDrawer) {
    var vw = scroller.clientWidth;
    var avail = (withDrawer && window.innerWidth >= 900) ? Math.max(320, vw - 460) : vw;
    smooth(Math.max(0, x - avail / 2));
  }
  function bringMapIntoView(y) {
    var barH = 62;
    var r = frame.getBoundingClientRect();
    if (window.innerWidth < 900) {
      var sheet = Math.min(window.innerHeight * 0.68, 580);
      var targetY = barH + (window.innerHeight - sheet - barH) / 2;
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top + y - targetY), behavior: reduce ? 'auto' : 'smooth' });
    } else if (r.top < barH || r.bottom > window.innerHeight) {
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - barH - 8), behavior: reduce ? 'auto' : 'smooth' });
    }
  }

  /* drawer */
  var current = null;
  var lastFocus = null;
  function peers(s) {
    var term = articles.filter(function (a) { return a.line === 'all'; })[0];
    if (s.line === 'all') {
      var ai = articles.filter(function (a) { return a.line === 'ai'; });
      return { list: ai.concat([s]), i: ai.length };
    }
    var list = articles.filter(function (a) { return a.line === s.line; });
    if (term) list = list.concat([term]);
    return { list: list, i: list.indexOf(s) };
  }
  function fillNav(btn, s, dir) {
    if (!s) { btn.disabled = true; btn.innerHTML = ''; btn.setAttribute('data-to', ''); return; }
    btn.disabled = false;
    btn.setAttribute('data-to', s.id);
    btn.innerHTML = '<small></small><span></span>';
    $('small', btn).textContent = dir;
    $('span', btn).textContent = s.name;
  }
  function setHash(h) {
    try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) {}
  }
  function openStation(id, fromClick) {
    var s = articles.filter(function (a) { return a.id === id; })[0];
    if (!s || !drawer) return;
    if (!drawer.classList.contains('open')) lastFocus = (fromClick && btns[id]) ? btns[id] : doc.activeElement;
    current = s;
    var clone = s.el.cloneNode(true);
    clone.removeAttribute('id');
    clone.className = 'station-detail';
    $$('[id]', clone).forEach(function (n) { n.removeAttribute('id'); });
    $$('details', clone).forEach(function (d) { d.open = true; });
    drBody.innerHTML = '';
    drBody.appendChild(clone);
    drBody.scrollTop = 0;
    drawer.setAttribute('data-line', s.line);
    drBadge.textContent = BADGE[s.line] || '';
    drLine.textContent = LINES[s.line] || '';
    var p = peers(s);
    fillNav(drPrev, p.list[p.i - 1], 'Previous stop');
    fillNav(drNext, p.list[p.i + 1], 'Next stop');
    Object.keys(btns).forEach(function (k) { btns[k].classList.toggle('is-active', k === id); });
    drawer.classList.add('open');
    centerOn(s.x, true);
    bringMapIntoView(s.y);
    setHash(id);
    if (fromClick || doc.activeElement === doc.body) {
      setTimeout(function () { drawer.focus({ preventScroll: true }); }, 60);
    }
  }
  function closeDrawer(restore) {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    Object.keys(btns).forEach(function (k) { btns[k].classList.remove('is-active'); });
    current = null;
    setHash('map');
    if (restore && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $('#drClose').addEventListener('click', function () { closeDrawer(true); });
  [drPrev, drNext].forEach(function (b) {
    b.addEventListener('click', function () {
      var to = b.getAttribute('data-to');
      if (to) openStation(to, true);
    });
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(true);
  });
  /* tap on empty map closes the drawer */
  scroller.addEventListener('click', function (e) {
    if (e.target === scroller || e.target === canvas || e.target === svg) closeDrawer(false);
  });

  /* view toggle */
  var viewBtns = $$('[data-view-btn]');
  function setView(v, persist) {
    root.setAttribute('data-view', v);
    viewBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view-btn') === v)); });
    if (persist) store('view', v);
    if (v !== 'map') closeDrawer(false);
    else requestAnimationFrame(updateProgress);
  }
  viewBtns.forEach(function (b) {
    b.addEventListener('click', function () { setView(b.getAttribute('data-view-btn'), true); });
  });
  setView(root.getAttribute('data-view') === 'map' ? 'map' : 'list', false);
  updateProgress();

  /* deep links */
  function fromHash() {
    var id = decodeURIComponent((location.hash || '').slice(1));
    if (!/^st-/.test(id) || !btns[id]) return;
    if (root.getAttribute('data-view') === 'map') {
      var sec = $('#map');
      if (sec) sec.scrollIntoView();
      openStation(id, false);
    }
  }
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('load', function () { updateProgress(); fromHash(); });

})();
