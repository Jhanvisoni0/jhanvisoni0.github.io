/* Jhanvi Soni — transit-map portfolio
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
  var LINES = { eng: 'Engineering line', ai: 'AI & Writing line', lrn: 'Learning line', all: 'Terminus' };
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
    var dur = 650 + Math.min(finalText.length, 60) * 8;
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
    $$('.board-row').forEach(function (row, r) {
      $$('.flip', row).forEach(function (el, c) { scramble(el, 250 + r * 220 + c * 60); });
    });
  }


  /* ---------------- "Ask me": flip through teasers ---------------- */
  var ask = $('.board-ask');
  if (ask) {
    var TEASERS = [
      ['The XBRL bug that silently zeroed my keyword detection', 'st-rag', 'XBRL'],
      ['How Z-ordering cut query time 40% at MSCI', 'st-msci', 'Z-ordering'],
      ['4 days of bank reporting down to 15 minutes. How?', 'st-banking', '15 minutes'],
      ['A chatbot that says "I don\'t know" instead of guessing', 'st-rag', 'unanswerable'],
      ['Why Databricks isn\'t just managed Spark', 'st-post-realization', 'managed Spark'],
      ['45 years of databases, one restaurant whiteboard', 'st-post-ltap', 'restaurant'],
      ['REITs: +23% in low-rate years, \u22128% when rates shift', 'st-assets', 'REITs returning']
    ];
    var askV = $('.ask-v', ask), askGo = $('.ask-go', ask), askFlip = $('.ask-flip', ask), askLive = $('.ask-live', ask);
    var askI = 0, askTimer = null, askPaused = false, askHold = false;
    function showAsk(i, user) {
      askI = (i + TEASERS.length) % TEASERS.length;
      var t = TEASERS[askI];
      askV.setAttribute('data-text', t[0]);
      askGo.setAttribute('href', '#' + t[1]);
      if (reduce) askV.textContent = t[0]; else scramble(askV, 0);
      if (user) askLive.textContent = 'Next question: ' + t[0];
      if (askApi && askApi.onChange) askApi.onChange();
    }
    function stopAuto() { if (askTimer) { clearInterval(askTimer); askTimer = null; } }
    askFlip.addEventListener('click', function () {
      stopAuto();
      askFlip.classList.add('used');
      showAsk(askI + 1, true);
    });
    ask.addEventListener('mouseenter', function () { askPaused = true; });
    ask.addEventListener('mouseleave', function () { askPaused = false; });
    ask.addEventListener('focusin', function () { askPaused = true; });
    ask.addEventListener('focusout', function () { askPaused = false; });
    askApi = { teasers: TEASERS, cur: function () { return askI; }, show: showAsk, stopAuto: stopAuto, hold: function (v) { askHold = v; }, onChange: null };
    if (!reduce) {
      askTimer = setInterval(function () {
        if (!askPaused && !askHold && !doc.hidden) showAsk(askI + 1, false);
      }, 6500);
    }
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

  $$('[data-count]').forEach(function (n) { n.textContent = articles.length; });
  var hint = $('#mapHint');
  if (hint && coarse) hint.textContent = 'Swipe the map sideways · tap a station';

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

  /* drag (mouse only — touch uses native scrolling) */
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

  /* ---------------- Pip: a little guide that hovers around and points at the answer ---------------- */
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
      '<div class="pip-bubble" role="group" aria-label="A question from Pip">' +
        '<button type="button" class="pip-x" aria-label="Stop the tips">✕</button>' +
        '<p class="pip-k">Ask Jhanvi about…</p>' +
        '<p class="pip-q"></p>' +
        '<div class="pip-btns"><button type="button" class="pip-flip">Another ↻</button><a class="pip-go" href="#">Show me →</a><button type="button" class="pip-play">Play catch</button></div>' +
      '</div>' +
      '<span class="pip-tag" aria-hidden="true">There it is.</span>' +
      '<span class="pip-say" aria-hidden="true"></span>' +
      '<button type="button" class="pip-body" aria-expanded="false" aria-label="Pip, your guide. Open a question about Jhanvi\'s work.">' +
        '<svg class="pip-svg" viewBox="0 0 76 84" width="76" height="84" aria-hidden="true" focusable="false">' +
          '<line x1="38" y1="14" x2="38" y2="7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
          '<circle class="pip-lamp" cx="38" cy="5" r="4.5" fill="#ff58b4"/>' +
          '<rect x="6" y="14" width="64" height="56" rx="26" fill="#0a1022" stroke="currentColor" stroke-width="2.5"/>' +
          '<rect x="13" y="26" width="50" height="28" rx="14" fill="#f4f6fb"/>' +
          '<g class="pip-look"><g class="pip-blink"><circle cx="28" cy="40" r="5" fill="#0a1022"/><circle cx="48" cy="40" r="5" fill="#0a1022"/><circle cx="29.6" cy="38.4" r="1.6" fill="#fff"/><circle cx="49.6" cy="38.4" r="1.6" fill="#fff"/></g></g>' +
          '<circle cx="20" cy="49" r="3" fill="#ff58b4" opacity=".5"/><circle cx="56" cy="49" r="3" fill="#ff58b4" opacity=".5"/>' +
          '<path d="M33 49 Q38 53 43 49" stroke="#0a1022" stroke-width="2" fill="none" stroke-linecap="round"/>' +
          '<rect x="16" y="58" width="14" height="4" rx="2" fill="#5d8bff"/><rect x="31" y="58" width="14" height="4" rx="2" fill="#ff58b4"/><rect x="46" y="58" width="14" height="4" rx="2" fill="#2fe3b0"/>' +
          '<path class="pip-sweat" d="M66 24 q4 6 0 10 q-4 -4 0 -10z" fill="#5dc8ff"/>' +
          '<circle cx="24" cy="75" r="6" fill="#ff58b4" stroke="#0a1022" stroke-width="2"/><circle cx="52" cy="75" r="6" fill="#2fe3b0" stroke="#0a1022" stroke-width="2"/>' +
        '</svg>' +
      '</button>';
    doc.body.appendChild(el);

    var body = $('.pip-body', el), bubble = $('.pip-bubble', el), qEl = $('.pip-q', el);
    var kEl = $('.pip-k', el), sayEl = $('.pip-say', el), playEl = $('.pip-play', el), goEl = $('.pip-go', el), flipEl = $('.pip-flip', el), xEl = $('.pip-x', el), look = $('.pip-look', el);
    var game = null, lastAct = Date.now(), lastMove = 0, moves = 0, plays = 0, ptr = { x: -999, y: -999 };
    var caughtN = 0; try { caughtN = +sessionStorage.getItem('pipCaught') || 0; } catch (e) {}
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
      var t = T[askApi.cur()];
      qEl.textContent = t[0];
      goEl.setAttribute('href', '#' + t[1]);
    }
    function setOpen(v, auto) {
      if (v && (el.classList.contains('away') || guiding)) return;
      open = v;
      el.classList.toggle('open', v);
      body.setAttribute('aria-expanded', String(v));
      askApi.hold(v);
      clearTimeout(timers.close);
      if (!v) kEl.textContent = 'Ask Jhanvi about\u2026';
      if (v) {
        sync();
        if (auto) timers.close = setTimeout(function () { if (!el.matches(':hover') && !el.contains(doc.activeElement)) setOpen(false); }, 10000);
      }
    }
    function hop() {
      el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
    }
    function wander() {
      if (open || guiding || game || el.classList.contains('away') || reduce) return;
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
    function goTo(i) {
      var t = T[i];
      setOpen(false);
      endGame();
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
      if (game) endGame();
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
      if (game === 'peek') { startChase('Found me! Now catch me!'); return; }
      if (game === 'chase' || game === 'tired') { caught(); return; }
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
      if (game || quiet || userTouched || guiding || open || doc.hidden || drawerOpen() || autoPops >= 4) return false;
      autoPops++; setOpen(true, true); hop(); return true;
    }

    /* ---- idle game: hide-and-seek, then catch-me ---- */
    function say(text, ms) {
      sayEl.textContent = text;
      el.classList.add('saying');
      clearTimeout(timers.say);
      timers.say = setTimeout(function () { el.classList.remove('saying'); }, ms || 1400);
    }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function near(x, y, d) {
      var r = body.getBoundingClientRect();
      var dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      return Math.sqrt(dx * dx + dy * dy) < d;
    }
    function zipTo(s) {
      el.classList.add('zip');
      place(s[0], s[1], s[0] < W() / 2 ? 'l' : 'r');
      clearTimeout(timers.zip);
      timers.zip = setTimeout(function () { el.classList.remove('zip'); }, 460);
      lastMove = Date.now();
    }
    function randSpot() {
      var w = W(), h = H();
      var maxX = w - W0 - 14 - (drawerOpen() && w >= 900 ? 470 : 0);
      var x, y, k = 0;
      do {
        x = 14 + Math.random() * Math.max(10, maxX - 14);
        y = 80 + Math.random() * Math.max(10, h - S - 94);
        k++;
      } while (k < 14 && (near(x + W0 / 2, y + S / 2, 120) || Math.hypot(x + W0 / 2 - ptr.x, y + S / 2 - ptr.y) < 230));
      return [x, y];
    }
    function confetti() {
      var r = body.getBoundingClientRect(), cx = r.left + 38, cy = r.top + 42;
      var cols = ['#5d8bff', '#ff58b4', '#2fe3b0'];
      for (var i = 0; i < 18; i++) {
        var d = doc.createElement('i');
        d.className = 'pip-conf';
        d.style.left = cx + 'px'; d.style.top = cy + 'px';
        d.style.background = cols[i % 3];
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
    function clearGameTimers() {
      clearTimeout(timers.peek); clearTimeout(timers.tired); clearInterval(timers.chase); timers.chase = null;
    }
    function endGame() {
      if (!game) return;
      clearGameTimers();
      game = null;
      el.classList.remove('peeking', 'tired', 'zip', 'saying');
      look.style.transform = '';
      lastAct = Date.now();
      settle();
    }
    function startPeek() {
      game = 'peek'; plays++;
      setOpen(false);
      el.classList.add('peeking');
      var x = 40 + Math.random() * Math.max(10, W() - W0 - 80);
      place(x, H() - 52, 'l');
      look.style.transform = 'translate(0,-2px)';
      setTimeout(function () { if (game === 'peek') say('Psst… find me!', 3000); }, 1500);
      timers.peek = setTimeout(function () { if (game === 'peek') endGame(); }, 10000);
    }
    function startChase(msg) {
      clearGameTimers();
      game = 'chase'; moves = 0;
      setOpen(false);
      el.classList.remove('peeking', 'tired');
      look.style.transform = '';
      zipTo(randSpot());
      say(msg || 'Catch me if you can!', 1600);
      timers.chase = setInterval(function () {
        if (game === 'chase' && Date.now() - lastMove > 1900) dodge();
      }, 600);
    }
    function dodge() {
      if (game !== 'chase') return;
      moves++;
      if (moves >= 6) { tire(); return; }
      zipTo(randSpot());
      say(pick(['Too slow!', 'Nope!', 'Over here!', 'Whoosh!']), 900);
    }
    function tire() {
      game = 'tired';
      clearInterval(timers.chase); timers.chase = null;
      el.classList.add('tired');
      say('Phew… okay, you got me?', 3200);
      timers.tired = setTimeout(function () {
        say('Ha! I win this round.', 2200);
        setTimeout(endGame, 2300);
      }, 5200);
    }
    function caught() {
      clearGameTimers();
      game = 'won';
      el.classList.remove('tired');
      confetti(); hop();
      caughtN++;
      try { sessionStorage.setItem('pipCaught', String(caughtN)); } catch (e) {}
      say('Caught!', 1200);
      setTimeout(function () {
        game = null;
        el.classList.remove('peeking', 'zip', 'saying');
        lastAct = Date.now();
        askApi.show(askApi.cur() + 1, true);
        kEl.textContent = 'You caught me' + (caughtN > 1 ? ' ×' + caughtN : '') + '! Try this one:';
        sync();
        setOpen(true, false);
      }, 900);
    }
    playEl.addEventListener('click', function () { touched(); setOpen(false); startChase('Okay, catch me!'); });
    function activity(e) {
      if (e.type === 'pointermove') { ptr.x = e.clientX; ptr.y = e.clientY; }
      if (game === 'peek') {
        if (e.type === 'pointermove' && near(e.clientX, e.clientY, 150)) { startChase('Found me! Now catch me!'); return; }
        if (e.type === 'scroll' || e.type === 'keydown' || e.type === 'wheel') { endGame(); }
        return;
      }
      if (game === 'chase') {
        if (e.type === 'pointermove' && Date.now() - lastMove > 480 && near(e.clientX, e.clientY, 135)) setTimeout(dodge, 190);
        return;
      }
      if (game) return;
      lastAct = Date.now();
    }
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach(function (t) {
      window.addEventListener(t, activity, { passive: true });
    });
    if (!reduce) {
      setInterval(function () {
        if (game || quiet || guiding || open || doc.hidden || drawerOpen() || plays >= 2) return;
        if (Date.now() - lastAct > 12000) startPeek();
      }, 1000);
    }

    settle();
    sync();
    setTimeout(function () { el.classList.add('in'); }, 900);
    if (!reduce) {
      setTimeout(autoPop, 4200);
      var tick = setInterval(function () {
        if (open || guiding || game) return;
        wander();
        if (!quiet && !userTouched && autoPops < 4) setTimeout(autoPop, 1700);
      }, 14000);
    }
  })();
})();
