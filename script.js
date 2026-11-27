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
  var pendingMark = null, onStationOpened = null, onStationClosed = null, askApi = null;
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
      ['The XBRL bug: 0% keyword detection', 'st-rag', 'XBRL'],
      ['Z-ordering: 40% faster queries', 'st-msci', 'Z-ordering'],
      ['4 days of reporting in 15 minutes', 'st-banking', '15 minutes'],
      ['A RAG bot that admits "I don\'t know"', 'st-rag', 'unanswerable'],
      ['Databricks is not just managed Spark', 'st-post-realization', 'managed Spark'],
      ['LTAP, explained with a restaurant', 'st-post-ltap', 'restaurant'],
      ['REITs: +23% vs −8% by rate regime', 'st-assets', 'REITs returning']
    ];
    var askV = $('.ask-v', ask), askGo = $('.ask-go', ask), askNext = $('.ask-flip', ask), askLive = $('.ask-live', ask);
    var askI = 0;
    function showAsk(i, user) {
      askI = (i + TEASERS.length) % TEASERS.length;
      var t = TEASERS[askI];
      askV.textContent = t[0];
      askGo.setAttribute('href', '#' + t[1]);
      if (user) askLive.textContent = 'Next question: ' + t[0];
      if (askApi && askApi.onChange) askApi.onChange();
    }
    askNext.addEventListener('click', function () { showAsk(askI + 1, true); });
    askApi = { teasers: TEASERS, cur: function () { return askI; }, show: showAsk, stopAuto: function () {}, hold: function () {}, onChange: null };
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
    if (onStationOpened) onStationOpened();
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
    if (onStationClosed) onStationClosed();
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

  /* ---------------- Dot: a little guide that hovers around and points at the answer ---------------- */
  (function pipInit() {
    if (!askApi) return;
    var S = 84, W0 = 76;
    var quiet = false;
    try { quiet = sessionStorage.getItem('pipQuiet') === '1'; } catch (e) {}
    var T = askApi.teasers;
    var el = doc.createElement('div');
    el.className = 'pip';
    el.setAttribute('data-side', 'r');
    el.setAttribute('data-v', 'up');
    el.innerHTML =
      '<div class="pip-bubble" role="group" aria-label="A question from Dot">' +
        '<button type="button" class="pip-x" aria-label="Stop the tips">✕</button>' +
        '<p class="pip-k">Ask Jhanvi about…</p>' +
        '<p class="pip-q"></p>' +
        '<div class="pip-btns"><button type="button" class="pip-flip">Another ↻</button><a class="pip-go" href="#">Show me →</a><button type="button" class="pip-trick">Mind-reading trick</button><button type="button" class="pip-try">Try it</button><button type="button" class="pip-no">Not now</button></div>' +
      '</div>' +
      '<span class="pip-tag" aria-hidden="true">There it is.</span>' +
      '<span class="pip-say" aria-hidden="true"></span>' +
      '<button type="button" class="pip-body" aria-expanded="false" aria-label="Dot, your guide. Open a question about Jhanvi\'s work.">' +
        '<svg class="pip-svg" viewBox="0 0 76 84" width="76" height="84" aria-hidden="true" focusable="false">' +
          '<rect class="pip-tile" x="1" y="7" width="74" height="74" rx="6"/>' +
          '<circle class="pip-face" cx="38" cy="44" r="30"/>' +
          '<g class="pip-look">' +
            /* calm: two dot eyes, a flat mouth */
            '<g class="pip-m m-calm"><g class="pip-blink"><circle class="f1" cx="27" cy="40" r="4.4"/><circle class="f1" cx="49" cy="40" r="4.4"/></g><rect class="f1" x="31" y="57" width="14" height="3.6"/></g>' +
            /* hello: ringed eyes, small round mouth */
            '<g class="pip-m m-hello"><circle class="s2" cx="27" cy="38" r="7.5" fill="none" stroke-width="3.4"/><circle class="s2" cx="49" cy="38" r="7.5" fill="none" stroke-width="3.4"/><circle class="f1" cx="28.5" cy="38" r="3"/><circle class="f1" cx="50.5" cy="38" r="3"/><circle class="s1" cx="38" cy="58" r="4" fill="none" stroke-width="3.2"/></g>' +
            /* happy: arched eyes, wide smile */
            '<g class="pip-m m-happy"><path class="s1" d="M20 42 A7 7 0 0 1 34 42" fill="none" stroke-width="4"/><path class="s1" d="M42 42 A7 7 0 0 1 56 42" fill="none" stroke-width="4"/><path class="s1" d="M28 54 Q38 66 48 54" fill="none" stroke-width="4" stroke-linecap="round"/></g>' +
            /* think: eyes up, zigzag mouth */
            '<g class="pip-m m-think"><circle class="f1" cx="27" cy="36" r="4.4"/><circle class="f1" cx="49" cy="36" r="4.4"/><path class="s1" d="M25 60 L31.5 53 L38 60 L44.5 53 L51 60" fill="none" stroke-width="3.4"/></g>' +
            /* wink: one bar eye, one arched eye, small smile */
            '<g class="pip-m m-wink"><rect class="f1" x="20" y="38" width="14" height="4"/><path class="s2" d="M42 43 A7 7 0 0 1 56 43" fill="none" stroke-width="4"/><path class="s1" d="M31 55 Q38 61 45 55" fill="none" stroke-width="3.4" stroke-linecap="round"/></g>' +
            /* sleepy: heavy lids over dots, tiny mouth */
            '<g class="pip-m m-sleepy"><circle class="f2" cx="27" cy="42" r="4.6"/><circle class="f2" cx="49" cy="42" r="4.6"/><rect class="f1" x="19" y="34" width="16" height="4" transform="rotate(-8 27 36)"/><rect class="f1" x="41" y="34" width="16" height="4" transform="rotate(8 49 36)"/><rect class="f1" x="34" y="58" width="8" height="3.4"/></g>' +
          '</g>' +
        '</svg>' +
      '</button>';
    doc.body.appendChild(el);

    var body = $('.pip-body', el), bubble = $('.pip-bubble', el), qEl = $('.pip-q', el);
    var kEl = $('.pip-k', el), sayEl = $('.pip-say', el), trickBtn = $('.pip-trick', el), goEl = $('.pip-go', el), flipEl = $('.pip-flip', el), xEl = $('.pip-x', el), look = $('.pip-look', el);
    var lastAct = Date.now(), tricking = false;
        var open = false, guiding = false, anchorI = 0, hit = null, autoPops = 0, userTouched = false;
    var timers = { close: null, guide: null, track: null, clear: null, peek: null, tired: null, zip: null, say: null, chase: null };

    function W() { return doc.documentElement.clientWidth; }
    function H() { return window.innerHeight; }
    function drawerOpen() { return !!(drawer && drawer.classList.contains('open')); }
    function place(x, y, side) {
      el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      el.setAttribute('data-side', side);
      el.setAttribute('data-v', y < 230 ? 'down' : 'up');
    }
    function anchors() {
      var w = W(), h = H(), narrow = w < 900;
      var a = [[w - W0 - 14, h - S - 14, 'r'], [14, h - S - 14, 'l']];
      if (!narrow) { a.push([w - W0 - 14, 78, 'r']); a.push([14, Math.round(h * 0.6), 'l']); }
      if (drawerOpen() && !narrow) a = a.filter(function (p) { return p[2] === 'l'; });
      return a;
    }
    function settle() {
      var a = anchors();
      anchorI = Math.min(anchorI, a.length - 1);
      place(a[anchorI][0], a[anchorI][1], a[anchorI][2]);
    }
    function refreshAway() {
      el.classList.toggle('away', !guiding && drawerOpen() && W() < 900);
    }
    function sync() {
      if (el.hasAttribute('data-offer')) return;
      var t = T[askApi.cur()];
      qEl.textContent = t[0];
      goEl.setAttribute('href', '#' + t[1]);
    }
    function setOpen(v, auto) {
      if (v && (el.classList.contains('away') || guiding || tricking)) return;
      open = v;
      el.classList.toggle('open', v);
      body.setAttribute('aria-expanded', String(v));
      askApi.hold(v);
      clearTimeout(timers.close);
      if (!v) { kEl.textContent = 'Ask Jhanvi about\u2026'; if (el.hasAttribute('data-offer')) { el.removeAttribute('data-offer'); sync(); } }
      if (v) {
        sync();
        if (auto) timers.close = setTimeout(function () { if (!el.matches(':hover') && !el.contains(doc.activeElement)) setOpen(false); }, 10000);
      }
    }
    var happyUntil = 0;
    function hop() {
      happyUntil = Date.now() + 1300;
      el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
    }
    function wander() {
      if (open || guiding || tricking || el.classList.contains('away') || reduce) return;
      var a = anchors(), n = anchorI;
      if (a.length > 1) { do { n = Math.floor(Math.random() * a.length); } while (n === anchorI); }
      anchorI = n;
      place(a[n][0], a[n][1], a[n][2]);
      el.classList.add('moving');
      setTimeout(function () { el.classList.remove('moving'); }, 1500);
    }

    /* highlight + guide */
    function clearMarks() {
      $$('.hl-target').forEach(function (n) { n.classList.remove('hl-target'); });
    }
    function updateGuide() {
      if (!guiding || !hit) return;
      var r = hit.getBoundingClientRect(), w = W(), x, y, side;
      if (r.bottom < 60 || r.top > H()) return;
      if (w >= 900) {
        if (drawerOpen()) { x = drawer.getBoundingClientRect().left - W0 - 12; side = 'r'; }
        else { x = Math.max(8, r.left - W0 - 14); side = 'l'; }
        y = r.top + r.height / 2 - S / 2;
        look.style.transform = 'translate(3px,0)';
      } else {
        x = w - W0 - 10; y = r.top - S + 8; side = 'r';
        look.style.transform = 'translate(0,3px)';
      }
      y = Math.min(Math.max(y, 72), H() - S - 8);
      place(x, y, side);
    }
    function endGuide() {
      if (!guiding) return;
      guiding = false;
      clearTimeout(timers.guide); clearTimeout(timers.track);
      el.classList.remove('guiding', 'tracking');
      look.style.transform = '';
      timers.clear = setTimeout(clearMarks, 4000);
      refreshAway();
      settle();
    }
    function startGuide(node) {
      hit = node; guiding = true;
      setOpen(false);
      el.classList.remove('away');
      el.classList.add('guiding');
      updateGuide();
      clearTimeout(timers.track);
      timers.track = setTimeout(function () { el.classList.add('tracking'); }, 1400);
      clearTimeout(timers.guide);
      timers.guide = setTimeout(endGuide, 12000);
    }
    function markIn(container, needle) {
      clearTimeout(timers.clear); clearMarks();
      var low = needle.toLowerCase();
      var node = $$('li, .st-sum, .st-note, .st-metrics > div', container).filter(function (n) {
        return n.textContent.toLowerCase().indexOf(low) > -1;
      })[0];
      if (!node) return;
      var d = node.closest('details'); if (d) d.open = true;
      node.classList.add('hl-target');
      node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      setTimeout(function () { startGuide(node); }, reduce ? 60 : 550);
    }
    function goTo(i) { goToStation(T[i][1], T[i][2]); }
    function goToStation(id, needle) {
      var t = [null, id, needle];
      setOpen(false);
      endGuide();
      if (root.getAttribute('data-view') === 'map') {
        pendingMark = t[2];
        openStation(t[1], false);
      } else {
        var a = doc.getElementById(t[1]);
        if (!a) return;
        a.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        setTimeout(function () { markIn(a, t[2]); }, reduce ? 60 : 700);
      }
    }
    onStationOpened = function () {
      refreshAway();
      if (!guiding) settle();
      if (pendingMark) {
        var n = pendingMark; pendingMark = null;
        setTimeout(function () { markIn(drBody, n); }, 450);
      }
    };
    onStationClosed = function () { endGuide(); clearMarks(); refreshAway(); settle(); };

    /* interactions */
    function touched() { userTouched = true; }
    body.addEventListener('click', function () {
      touched(); hop(); setOpen(!open, false);
    });
    xEl.addEventListener('click', function () {
      touched(); quiet = true;
      try { sessionStorage.setItem('pipQuiet', '1'); } catch (e) {}
      setOpen(false); body.focus();
    });
    flipEl.addEventListener('click', function () {
      touched(); askApi.stopAuto(); askApi.show(askApi.cur() + 1, true); hop();
    });
    function go(e) { e.preventDefault(); touched(); goTo(askApi.cur()); }
    goEl.addEventListener('click', go);
    var boardGo = $('.ask-go');
    if (boardGo) boardGo.addEventListener('click', go);
    askApi.onChange = function () { sync(); };
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open && !drawerOpen()) { setOpen(false); body.focus(); }
    });
    window.addEventListener('scroll', function () { if (guiding) updateGuide(); }, { passive: true });
    drBody.addEventListener('scroll', function () { if (guiding) updateGuide(); }, { passive: true });
    window.addEventListener('resize', function () { refreshAway(); if (guiding) updateGuide(); else settle(); });
    /* eyes follow the pointer */
    if (!coarse && !reduce) {
      window.addEventListener('pointermove', function (e) {
        if (guiding || e.pointerType === 'touch') return;
        var r = body.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        var d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(1, d / 160);
        look.style.transform = 'translate(' + (dx / d * 3.2 * k).toFixed(2) + 'px,' + (dy / d * 2.4 * k).toFixed(2) + 'px)';
      }, { passive: true });
    }
    /* a bubble the viewer has not asked for appears at most a few times, then stays quiet */
    function autoPop() {
      if (tricking || quiet || userTouched || guiding || open || doc.hidden || drawerOpen() || autoPops >= 3) return false;
      var ar = ask && ask.getBoundingClientRect();
      if (ar && ar.bottom > 0 && ar.top < H()) return false; /* the board already offers the questions; do not cover it */
      autoPops++; setOpen(true, true); hop(); return true;
    }


    /* ---- the trick: Dot "reads your mind" (a 5-card binary guessing trick) ---- */
    function say(text, ms) {
      sayEl.textContent = text;
      el.classList.add('saying');
      clearTimeout(timers.say);
      timers.say = setTimeout(function () { el.classList.remove('saying'); }, ms || 1500);
    }
    function confetti() {
      var r = body.getBoundingClientRect(), cx = r.left + 38, cy = r.top + 42;
      var cols = ['#f0464e', '#2865a9', '#fad276', '#9ad7df'];
      for (var i = 0; i < 18; i++) {
        var d = doc.createElement('i');
        d.className = 'pip-conf';
        d.style.left = cx + 'px'; d.style.top = cy + 'px';
        d.style.background = cols[i % 4];
        doc.body.appendChild(d);
        var a = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 90;
        (function (n, ang, dd) {
          if (!n.animate) { n.remove(); return; }
          n.animate([
            { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
            { transform: 'translate(' + Math.cos(ang) * dd + 'px,' + (Math.sin(ang) * dd + 40) + 'px) rotate(260deg) scale(.4)', opacity: 0 }
          ], { duration: 950, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = function () { n.remove(); };
        })(d, a, dist);
      }
    }

    var trick = null, tBody = null, tCard = null, tStep = 0, tSum = 0, tReturn = null, offered = false;
    var QUIPS = ['Hmm…', 'Interesting…', 'I can feel it…', 'Almost there…'];

    function buildTrick() {
      trick = doc.createElement('div');
      trick.className = 'trick';
      trick.hidden = true;
      trick.innerHTML =
        '<div class="trick-back"></div>' +
        '<div class="trick-card" role="dialog" aria-modal="true" aria-labelledby="trickT" tabindex="-1">' +
          '<button type="button" class="trick-x" aria-label="Close the trick">✕</button>' +
          '<p class="trick-k" id="trickT">Dot reads your mind</p>' +
          '<div class="trick-body"></div>' +
        '</div>';
      doc.body.appendChild(trick);
      tBody = $('.trick-body', trick);
      tCard = $('.trick-card', trick);
      $('.trick-x', trick).addEventListener('click', closeTrick);
      $('.trick-back', trick).addEventListener('click', closeTrick);
      trick.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); closeTrick(); return; }
        if (e.key !== 'Tab') return;
        var f = $$('button', tCard).filter(function (b) { return !b.disabled && b.offsetParent; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (doc.activeElement === first || doc.activeElement === tCard)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      });
      tBody.addEventListener('click', function (e) {
        var b = e.target.closest('[data-act]');
        if (!b) return;
        var act = b.getAttribute('data-act');
        if (act === 'start') { tStep = 0; tSum = 0; renderCard(); }
        else if (act === 'yes' || act === 'no') { if (act === 'yes') tSum += (1 << tStep); tStep++; if (tStep < 5) { say(QUIPS[tStep - 1], 1200); renderCard(); } else reveal(); }
        else if (act === 'again') renderIntro();
        else if (act === 'close') closeTrick();
        else if (act === 'how') {
          var ex = $('.trick-explain', tBody);
          ex.hidden = !ex.hidden;
          b.setAttribute('aria-expanded', String(!ex.hidden));
          b.textContent = ex.hidden ? 'How did I do that?' : 'Hide the explanation';
        } else if (act === 'see') {
          closeTrick();
          goToStation('st-msci', 'partition pruning');
        }
      });
    }
    function pipBeside() {
      if (!tricking) return;
      var r = tCard.getBoundingClientRect(), w = W(), x, y, side;
      if (w - r.right > W0 + 24) { x = r.right + 14; y = r.top + 24; side = 'l'; look.style.transform = 'translate(-3px,0)'; }
      else if (r.left > W0 + 24) { x = r.left - W0 - 14; y = r.top + 24; side = 'r'; look.style.transform = 'translate(3px,0)'; }
      else { x = r.right - W0 - 6; y = Math.max(70, r.top - S + 8); side = 'r'; look.style.transform = 'translate(0,3px)'; }
      place(x, y, side);
    }
    function setBody(html, focusSel) {
      tBody.innerHTML = html;
      var f = focusSel ? $(focusSel, tBody) : null;
      (f || tCard).focus({ preventScroll: true });
      setTimeout(pipBeside, 30);
    }
    function renderIntro() {
      tStep = 0; tSum = 0;
      el.classList.remove('trick-think');
      setBody(
        '<p class="trick-lead">Think of any number from <b>1 to 31</b>. Keep it secret.</p>' +
        '<p class="trick-sub">I’ll show you five cards. Just tell me if your number is on each one, and I’ll read your mind.</p>' +
        '<div class="trick-btns"><button type="button" class="trick-primary" data-act="start">I’ve got one</button></div>',
        '.trick-primary');
      say('Think of a number…', 2200);
    }
    function renderCard() {
      var nums = [];
      for (var n = 1; n <= 31; n++) if (n & (1 << tStep)) nums.push(n);
      var dots = '';
      for (var i = 0; i < 5; i++) dots += '<i class="' + (i < tStep ? 'done' : i === tStep ? 'now' : '') + '"></i>';
      setBody(
        '<div class="trick-prog" aria-hidden="true">' + dots + '</div>' +
        '<p class="trick-lead">Card ' + (tStep + 1) + ' of 5. Is your number on it?</p>' +
        '<ul class="trick-grid" aria-label="Numbers on card ' + (tStep + 1) + '">' + nums.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' +
        '<div class="trick-btns"><button type="button" class="trick-primary" data-act="yes">Yes</button><button type="button" class="trick-alt" data-act="no">No</button></div>',
        '.trick-primary');
    }
    function reveal() {
      el.classList.add('trick-think');
      setBody('<p class="trick-lead" aria-live="polite">Reading your mind<span class="trick-dots"><i>.</i><i>.</i><i>.</i></span></p>', null);
      say('Hold still…', 1300);
      setTimeout(function () {
        if (!tricking) return;
        el.classList.remove('trick-think');
        if (tSum === 0) {
          say('Hmm?', 1800);
          setBody(
            '<p class="trick-lead">You said no to every card, so I get zero. I asked for 1 to 31!</p>' +
            '<div class="trick-btns"><button type="button" class="trick-primary" data-act="again">Try again</button><button type="button" class="trick-alt" data-act="close">Close</button></div>',
            '.trick-primary');
          return;
        }
        say('Got it!', 1600); confetti(); hop();
        setBody(
          '<p class="trick-sub">Your number is</p>' +
          '<p class="trick-answer" aria-live="polite">' + tSum + '</p>' +
          '<div class="trick-btns"><button type="button" class="trick-primary" data-act="how" aria-expanded="false">How did I do that?</button><button type="button" class="trick-alt" data-act="again">Again</button></div>' +
          '<div class="trick-explain" hidden>' +
            '<p>No mind-reading, just binary. Card 1 holds every number with the 1s place switched on, card 2 the 2s place, then 4, 8 and 16. Your five yes/no answers spelled your number in binary, so I added up the first number of each card you said yes to.</p>' +
            '<p>It’s the same instinct as partition pruning: every question rules out half of the options, so you never have to look at the rest.</p>' +
            '<button type="button" class="trick-link" data-act="see">See where I used it →</button>' +
          '</div>',
          '.trick-primary');
      }, reduce ? 200 : 1500);
    }
    function openTrick() {
      if (tricking) return;
      if (!trick) buildTrick();
      tricking = true;
      tReturn = doc.activeElement;
      setOpen(false);
      endGuide();
      el.classList.remove('away');
      el.classList.add('trick-on', 'zip');
      trick.hidden = false;
      renderIntro();
      setTimeout(function () { el.classList.remove('zip'); }, 500);
      window.addEventListener('resize', pipBeside);
    }
    function closeTrick() {
      if (!tricking) return;
      tricking = false;
      trick.hidden = true;
      el.classList.remove('trick-on', 'trick-think', 'saying');
      look.style.transform = '';
      window.removeEventListener('resize', pipBeside);
      settle();
      if (tReturn && tReturn.focus && doc.contains(tReturn)) tReturn.focus({ preventScroll: true }); else body.focus({ preventScroll: true });
    }

    /* the offer: Dot suggests the trick once, when the page has been still for a while */
    function offerTrick() {
      offered = true;
      el.setAttribute('data-offer', '1');
      kEl.textContent = 'A little trick';
      qEl.textContent = 'Think of a number from 1 to 31. I can read your mind.';
      setOpen(true, false);
      hop();
    }
    /* mood: the face changes with what is going on */
    var curMood = '';
    function mood() {
      var m = 'calm', now = Date.now();
      if (now < happyUntil) m = 'happy';
      else if (tricking) m = el.classList.contains('trick-think') ? 'think' : 'hello';
      else if (guiding) m = 'wink';
      else if (open) m = 'hello';
      else if (!reduce && now - lastAct > 9000) m = 'sleepy';
      if (m !== curMood) { curMood = m; el.setAttribute('data-mood', m); }
    }
    el.setAttribute('data-mood', 'calm');
    setInterval(mood, 250);
    trickBtn.addEventListener('click', function () { touched(); openTrick(); });
    $('.pip-try', el).addEventListener('click', function () { touched(); openTrick(); });
    $('.pip-no', el).addEventListener('click', function () { setOpen(false); });
    function activity() { lastAct = Date.now(); }
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach(function (t) {
      window.addEventListener(t, activity, { passive: true });
    });
    if (!reduce) {
      setInterval(function () {
        if (offered || quiet || userTouched || tricking || guiding || open || doc.hidden || drawerOpen()) return;
        if (Date.now() - lastAct > 14000) offerTrick();
      }, 1000);
    }

    settle();
    sync();
    setTimeout(function () { el.classList.add('in'); }, 900);
    if (!reduce) {
      setTimeout(autoPop, 4200);
      var tick = setInterval(function () {
        if (open || guiding || tricking) return;
        wander();
        if (!quiet && !userTouched && autoPops < 3) setTimeout(autoPop, 1700);
      }, 14000);
    }
  })();
})();
