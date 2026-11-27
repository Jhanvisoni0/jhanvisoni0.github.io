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

  /* ---------------- split-flap board: letters flip tile by tile, like an old station board ---------------- */
  var FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function flapSet(el, text, delay, hold) {
    var up = text.toUpperCase();
    var prev = el._shown || '';
    el._text = text; el._shown = up;
    var run = el._run = (el._run || 0) + 1;
    var wrap = doc.createElement('span');
    wrap.className = 'fl'; wrap.setAttribute('aria-hidden', 'true');
    var sr = doc.createElement('span'); sr.className = 'sr'; sr.textContent = text;
    var cells = [], idx = 0;
    up.split(' ').forEach(function (w, wi) {
      if (wi) wrap.appendChild(doc.createTextNode(' '));
      var word = doc.createElement('span'); word.className = 'fw';
      for (var k = 0; k < w.length; k++, idx++) {
        var c = doc.createElement('i'); c.className = 'fc';
        var g = doc.createElement('b'); c.appendChild(g);
        var to = w.charAt(k), from = prev.charAt(idx) || ' ';
        g.textContent = to === from ? to : from.trim() ? from : '';
        word.appendChild(c);
        if (to !== from) cells.push({ g: g, to: to, from: from, i: idx, left: 0 });
      }
      idx++;
      wrap.appendChild(word);
    });
    el.textContent = '';
    el.appendChild(sr); el.appendChild(wrap);
    if (hold) { el._shown = ''; return; }
    if (!cells.length) return;
    cells.forEach(function (c) {
      var t = FLAP.indexOf(c.to);
      c.left = 4 + ((c.i * 5 + 3) % 8);
      c.seq = [];
      for (var n = c.left; n > 0; n--) c.seq.push(t > -1 ? FLAP.charAt(((t - n) % 36 + 36) % 36) : FLAP.charAt((c.i * 7 + n * 3) % 26));
      c.seq.push(c.to);
      c.at = (delay || 0) + c.i * 22;
    });
    var t0 = Date.now();
    (function tick() {
      if (el._run !== run) return;
      var now = Date.now() - t0, live = false;
      cells.forEach(function (c) {
        if (!c.seq.length) return;
        live = true;
        if (now < c.at) return;
        c.at = now + 42;
        var ch = c.seq.shift();
        c.g.textContent = ch === ' ' ? '' : ch;
        if (c.g.animate) c.g.animate([{ transform: 'scaleY(.12)' }, { transform: 'scaleY(1)' }], { duration: 60, easing: 'ease-out' });
      });
      if (live) setTimeout(tick, 21);
    })();
  }
  var boardEls = $$('.board-row > .b-k, .board-row > .b-v, .board-row > .b-s').filter(function (n) { return !n.classList.contains('ask-actions'); });
  boardEls.forEach(function (n) { n._final = n.getAttribute('data-text') || n.textContent.trim(); });
  var boardInView = false, boardHover = false;
  (function boardInit() {
    var board = $('.board');
    if (!board || !boardEls.length) return;
    if (reduce) { boardInView = true; return; }
    boardEls.forEach(function (n) { flapSet(n, n._final, 0, true); });
    var started = false;
    function start() {
      if (started) return; started = true;
      $$('.board-row', board).forEach(function (r, ri) {
        $$('.b-k, .b-v, .b-s', r).forEach(function (n, ci) {
          if (!n.classList.contains('ask-actions')) flapSet(n, n._final, 120 + ri * 260 + ci * 110);
        });
      });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        boardInView = es[0].isIntersecting;
        if (boardInView) start();
      }, { threshold: 0.35 }).observe(board);
    } else { boardInView = true; start(); }
    board.addEventListener('mouseenter', function () { boardHover = true; });
    board.addEventListener('mouseleave', function () { boardHover = false; });
    board.addEventListener('focusin', function () { boardHover = true; });
    board.addEventListener('focusout', function () { boardHover = false; });
  })();

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
    var askI = 0, askUser = false;
    function showAsk(i, user) {
      askI = (i + TEASERS.length) % TEASERS.length;
      var t = TEASERS[askI];
      if (user) askUser = true;
      if (reduce) askV.textContent = t[0]; else flapSet(askV, t[0], 0);
      askGo.setAttribute('href', '#' + t[1]);
      if (user) askLive.textContent = 'Next question: ' + t[0];
      if (askApi && askApi.onChange) askApi.onChange();
    }
    askNext.addEventListener('click', function () { showAsk(askI + 1, true); });
    /* like a real board, the question changes by itself now and then, until the visitor takes over */
    if (!reduce) setInterval(function () {
      if (askUser || doc.hidden || !boardInView || boardHover) return;
      showAsk(askI + 1, false);
    }, 9000);
    askApi = { teasers: TEASERS, cur: function () { return askI; }, show: showAsk, stopAuto: function () {}, hold: function () {}, onChange: null };
  }

  /* ---------------- route progress under the top bar ---------------- */
  (function routeInit() {
    var bar = $('.bar');
    if (!bar) return;
    var r = doc.createElement('div');
    r.className = 'route';
    r.setAttribute('aria-hidden', 'true');
    r.innerHTML = '<i class="route-fill"></i><b class="route-train"></b>';
    var ticks = [];
    ['#toolkit', '#contact'].forEach(function (sel) {
      if (!$(sel)) return;
      var t = doc.createElement('s'); t.setAttribute('data-sel', sel); r.appendChild(t); ticks.push(t);
    });
    bar.appendChild(r);
    var fill = $('.route-fill', r), train = $('.route-train', r), raf = 0;
    function update() {
      raf = 0;
      var max = doc.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) { r.style.visibility = 'hidden'; return; }
      r.style.visibility = '';
      var p = Math.min(1, Math.max(0, window.scrollY / max));
      fill.style.clipPath = 'inset(0 ' + (100 - p * 100).toFixed(2) + '% 0 0)';
      train.style.left = 'calc(' + (p * 100).toFixed(2) + '% - ' + (p * 24).toFixed(1) + 'px)';
      ticks.forEach(function (t) {
        var sec = $(t.getAttribute('data-sel'));
        if (!sec || !sec.offsetParent) { t.style.display = 'none'; return; }
        t.style.display = '';
        var f = Math.min(0.97, Math.max(0.03, (sec.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.45) / max));
        t.style.left = (f * 100).toFixed(2) + '%';
        t.classList.toggle('on', p >= f);
      });
    }
    function req() { if (!raf) raf = requestAnimationFrame(update); }
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    window.addEventListener('load', req);
    if (window.MutationObserver) new MutationObserver(req).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-view'] });
    update();
  })();

  /* ---------------- things arrive as you scroll: rules draw in, list stops light up ---------------- */
  (function arriveInit() {
    var targets = $$('.list-head, .sec-head, .lgroup .station');
    if (!targets.length) return;
    if (!('IntersectionObserver' in window) || reduce) { targets.forEach(function (t) { t.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
    targets.forEach(function (t) { io.observe(t); });
  })();

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

  /* small trains ride each line, slowly */
  if (!reduce) {
    [['eng', 'M120 150H2390L2560 320', 48, 2.8], ['lrn', 'M120 490H2390L2560 320', 54, 6.4], ['ai', 'M1300 150V320H2280', 26, 4.6]].forEach(function (t) {
      var wrap = doc.createElementNS(NS, 'g');
      wrap.setAttribute('class', 'train'); wrap.setAttribute('data-line', t[0]);
      var cars = '';
      [-44, -15, 14].forEach(function (x) {
        cars += '<rect x="' + x + '" y="-8" width="27" height="16" rx="4"/>' +
          '<rect class="win" x="' + (x + 4) + '" y="-4" width="5" height="5" rx="1"/><rect class="win" x="' + (x + 11) + '" y="-4" width="5" height="5" rx="1"/><rect class="win" x="' + (x + 18) + '" y="-4" width="5" height="5" rx="1"/>';
      });
      var inner = doc.createElementNS(NS, 'g');
      inner.innerHTML = cars +
        '<animateMotion dur="' + t[2] + 's" begin="' + t[3] + 's" repeatCount="indefinite" rotate="auto" path="' + t[1] + '"/>' +
        '<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.03;0.97;1" dur="' + t[2] + 's" begin="' + t[3] + 's" repeatCount="indefinite"/>';
      inner.setAttribute('opacity', '0');
      wrap.appendChild(inner);
      svg.appendChild(wrap);
    });
  }

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
  /* hovering a line badge previews that line; clicking it keeps the focus */
  legend.forEach(function (l) {
    l.addEventListener('mouseenter', function () {
      if (coarse || frame.getAttribute('data-focus')) return;
      frame.setAttribute('data-focus', l.getAttribute('data-line')); frame._preview = true;
    });
    l.addEventListener('mouseleave', function () {
      if (frame._preview) { frame.setAttribute('data-focus', ''); frame._preview = false; }
    });
    l.addEventListener('click', function () {
      if (frame._preview) { frame.setAttribute('data-focus', ''); frame._preview = false; }
    });
  });
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
    stamps.add(id);
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

  /* ---------------- stamp passport: every station you visit gets a stamp ---------------- */
  var stamps = (function () {
    var got = {}, subs = [], ids = $$('article.station[id^="st-"]').map(function (a) { return a.id; });
    try { got = JSON.parse(localStorage.getItem('stamps') || '{}') || {}; } catch (e) { got = {}; }
    function save() { try { localStorage.setItem('stamps', JSON.stringify(got)); } catch (e) {} }
    return {
      total: ids.length,
      count: function () { return ids.filter(function (i) { return got[i]; }).length; },
      has: function (id) { return !!got[id]; },
      add: function (id) { if (ids.indexOf(id) < 0 || got[id]) return; got[id] = 1; save(); subs.forEach(function (f) { f(id); }); },
      clear: function () { got = {}; save(); subs.forEach(function (f) { f(null); }); },
      on: function (f) { subs.push(f); }
    };
  })();
  (function dwell() {  /* list view: a station counts once it has sat mid-screen for a moment */
    if (!('IntersectionObserver' in window)) return;
    var timers = {};
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var id = e.target.id;
        if (e.isIntersecting) { if (!timers[id]) timers[id] = setTimeout(function () { stamps.add(id); }, 1100); }
        else { clearTimeout(timers[id]); timers[id] = 0; }
      });
    }, { rootMargin: '-32% 0px -32% 0px', threshold: 0 });
    $$('article.station[id^="st-"]').forEach(function (a) { io.observe(a); });
  })();

  /* ---------------- the Conductor: a ticket-office guide (Dot with a cap) ---------------- */
  (function pipInit() {  /* Dot sits still in the corner and only reacts when you click it */
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
      '<div class="pip-bubble" role="dialog" aria-label="Station cat menu">' +
        '<div class="cd">' +
          '<div class="cd-head"><span class="cd-av" aria-hidden="true"><svg viewBox="0 0 40 36" width="40" height="36"><path class="fur ol-s" d="M5 16 L5 2 L16 8Z"/><path class="fur ol-s" d="M35 16 L35 2 L24 8Z"/><ellipse class="fur ol-s" cx="20" cy="20" rx="15" ry="13"/><path class="se" d="M11 19 Q14.5 22.5 18 19 M22 19 Q25.5 22.5 29 19" fill="none" stroke-width="1.8" stroke-linecap="round"/><path class="tgn" d="M18 24 L22 24 L20 26.2Z"/></svg></span><div class="cd-who"><b>Station Cat</b><small>Ticket office</small></div><button type="button" class="pip-x" aria-label="Close the menu">✕</button></div>' +
          '<div class="cd-view"></div>' +
          '<button type="button" class="cd-pass" data-act="passport"></button>' +
        '</div>' +
      '</div>' +
      '<span class="pip-tag" aria-hidden="true">There it is.</span>' +
      '<span class="pip-say" aria-hidden="true"></span>' +
      '<button type="button" class="pip-body" aria-expanded="false" aria-label="The station cat, asleep. Wake it to open the menu: guided rides, tricks and your stamp passport.">' +
        '<svg class="pip-svg" viewBox="0 0 76 84" width="76" height="84" aria-hidden="true" focusable="false">' +
        '<defs><radialGradient id="dotGrad" cx="40%" cy="30%" r="80%"><stop class="g1" offset="0"/><stop class="g2" offset="1"/></radialGradient></defs>' +
        '<ellipse cx="38" cy="80.5" rx="25" ry="3" fill="#000" opacity=".1"/>' +
        '<g class="ct-tail"><path class="ol-t" d="M56 72 Q75 72 71 52 Q69 44 63 46" fill="none" stroke-width="10" stroke-linecap="round"/><path class="fur-t" d="M56 72 Q75 72 71 52 Q69 44 63 46" fill="none" stroke-width="7" stroke-linecap="round"/></g>' +
        '<g class="ct-body"><path class="fur ol-s" d="M15 75 Q12 52 26 49 Q38 46 50 49 Q64 52 61 75 Q38 82 15 75Z"/><path class="st" d="M23 60 q4 3 2 9 M53 60 q-4 3 -2 9 M38 52 v7" fill="none" stroke-width="2" stroke-linecap="round"/><ellipse class="paw ol-s" cx="29" cy="77" rx="8.5" ry="4.6"/><ellipse class="paw ol-s" cx="47" cy="77" rx="8.5" ry="4.6"/></g>' +
        '<g class="ct-head">' +
        '<g class="ear el"><path class="fur ol-s" d="M14 28 L14 3 L31 15Z"/><path class="ear-in" d="M17.5 21 L17.5 9 L26 15Z"/></g>' +
        '<g class="ear er"><path class="fur ol-s" d="M62 28 L62 3 L45 15Z"/><path class="ear-in" d="M58.5 21 L58.5 9 L50 15Z"/></g>' +
        '<ellipse class="fur ol-s" cx="38" cy="37" rx="26" ry="21.5"/>' +
        '<path class="st" d="M33.5 19 v5 M38 18 v6.5 M42.5 19 v5" fill="none" stroke-width="2" stroke-linecap="round"/>' +
        '<path class="wk" d="M13 43 L3 40 M13 47 L3 48.5 M63 43 L73 40 M63 47 L73 48.5" fill="none" stroke-width="1.4" stroke-linecap="round"/>' +
        '<g class="pip-look">' +
        '<path class="tgn" d="M35 41.5 L41 41.5 L38 45Z"/>' +
        '<g class="pip-m m-calm"><path class="se" d="M22 35 Q27 39.5 32 35" fill="none" stroke-width="2.4" stroke-linecap="round"/><path class="se" d="M44 35 Q49 39.5 54 35" fill="none" stroke-width="2.4" stroke-linecap="round"/><path class="se" d="M38 45 Q38 48 35 48.5 M38 45 Q38 48 41 48.5" fill="none" stroke-width="1.8" stroke-linecap="round"/><g class="peek"><ellipse class="fe" cx="49" cy="34.5" rx="3.6" ry="4.2"/><circle class="gl" cx="50.3" cy="33" r="1.2"/></g></g>' +
        '<g class="pip-m m-hello"><g class="pip-blink"><ellipse class="fe" cx="27" cy="34" rx="4" ry="5"/><ellipse class="fe" cx="49" cy="34" rx="4" ry="5"/><circle class="gl" cx="28.4" cy="32.2" r="1.4"/><circle class="gl" cx="50.4" cy="32.2" r="1.4"/></g><path class="se" d="M38 45 Q38 48.5 34.5 49 M38 45 Q38 48.5 41.5 49" fill="none" stroke-width="1.8" stroke-linecap="round"/></g>' +
        '<g class="pip-m m-happy"><path class="se" d="M22 37 Q27 30 32 37" fill="none" stroke-width="2.8" stroke-linecap="round"/><path class="se" d="M44 37 Q49 30 54 37" fill="none" stroke-width="2.8" stroke-linecap="round"/><path class="fe" d="M33 47 Q38 55 43 47Z"/><path class="tg" d="M35.8 51.5 Q38 49.5 40.2 51.5 Q38 54 35.8 51.5Z"/></g>' +
        '<g class="pip-m m-wow"><ellipse class="fe" cx="27" cy="34" rx="5" ry="6.5"/><ellipse class="fe" cx="49" cy="34" rx="5" ry="6.5"/><circle class="gl" cx="28.6" cy="31.8" r="1.6"/><circle class="gl" cx="50.6" cy="31.8" r="1.6"/><ellipse class="fe" cx="38" cy="50" rx="2.6" ry="3.4"/></g>' +
        '<g class="pip-m m-curious"><ellipse class="fe" cx="27" cy="34" rx="4" ry="5"/><circle class="gl" cx="28.4" cy="32.2" r="1.4"/><ellipse class="fe" cx="49" cy="35" rx="4" ry="2.7"/><path class="se" d="M33 48.5 Q38 51 43 47.5" fill="none" stroke-width="1.8" stroke-linecap="round"/></g>' +
        '<g class="pip-m m-wink"><path class="se" d="M22 35 Q27 39.5 32 35" fill="none" stroke-width="2.6" stroke-linecap="round"/><ellipse class="fe" cx="49" cy="34" rx="4" ry="5"/><circle class="gl" cx="50.4" cy="32.2" r="1.4"/><path class="fe" d="M33.5 47 Q38 54 42.5 47Z"/><path class="tg" d="M36 51 Q38 49.2 40 51 Q38 53.4 36 51Z"/></g>' +
        '<g class="pip-m m-think"><ellipse class="fe" cx="27" cy="35" rx="4" ry="2.6"/><ellipse class="fe" cx="49" cy="35" rx="4" ry="2.6"/><path class="se" d="M22 31.5 H32 M44 31.5 H54" fill="none" stroke-width="2" stroke-linecap="round"/><path class="se" d="M33 49 Q35.5 46.5 38 49 T43 49" fill="none" stroke-width="1.8" stroke-linecap="round"/></g>' +
        '</g>' +
        '<g class="ct-cap" transform="rotate(-7 38 14) translate(38 13) scale(.62) translate(-38 -10)"><path class="cp-a" d="M20 15 L22.5 0.5 Q38 -5 53.5 0.5 L56 15 Q38 20.5 20 15Z"/><path class="cp-b" d="M20.2 11.2 Q38 16.8 55.8 11.2 L56 15 Q38 20.5 20 15Z"/><path class="cp-c" d="M27 16.5 Q38 23 49 16.5 L47.5 20.5 Q38 26.5 28.5 20.5Z"/><circle class="cp-d" cx="38" cy="14.6" r="3.1" stroke-width="1"/></g>' +
        '</g>' +
        '<g class="zs"><text class="z z1" x="58" y="13">z</text><text class="z z2" x="63" y="5">z</text><text class="z z3" x="68" y="-4">z</text></g>' +
        '</svg>' +
      '</button>';
    doc.body.appendChild(el);

    var body = $('.pip-body', el), bubble = $('.pip-bubble', el), logEl = $('.pc-log', el), chipsEl = $('.pc-chips', el);
    var sayEl = $('.pip-say', el), xEl = $('.pip-x', el), look = $('.pip-look', el);
    var lastAct = Date.now(), tricking = false, typing = false, tour = null;
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
      var a = [[w - W0 - 14, h - S - 14, 'r'], [14, h - S - 14 - (tour ? 100 : 0), 'l']];
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
    function sync() {}
    function setOpen(v, auto) {
      if (v && (el.classList.contains('away') || guiding || tricking)) return;
      open = v;
      el.classList.toggle('open', v);
      body.setAttribute('aria-expanded', String(v));
      askApi.hold(v);
      clearTimeout(timers.close);
      if (v) { showView('home'); }
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
      if (!needle) return;
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
    xEl.addEventListener('click', function () { touched(); setOpen(false); body.focus(); });
    function go(e) { e.preventDefault(); touched(); goTo(askApi.cur()); }
    var boardGo = $('.ask-go');
    if (boardGo) boardGo.addEventListener('click', go);
    askApi.onChange = function () { sync(); };
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open && !drawerOpen()) { setOpen(false); body.focus(); }
    });
    window.addEventListener('scroll', function () { if (guiding) updateGuide(); }, { passive: true });
    drBody.addEventListener('scroll', function () { if (guiding) updateGuide(); }, { passive: true });
    window.addEventListener('resize', function () { refreshAway(); if (guiding) updateGuide(); else settle(); });
    /* ---- the trick: Dot "reads your mind" (a 5-card binary guessing trick) ---- */
    function say(text, ms) {
      sayEl.textContent = text;
      el.classList.add('saying');
      clearTimeout(timers.say);
      timers.say = setTimeout(function () { el.classList.remove('saying'); }, ms || 1500);
    }
    function confetti() {
      var r = body.getBoundingClientRect(), cx = r.left + 38, cy = r.top + 42;
      var cols = ['#d9a441', '#6f7f9e', '#b9ab8c', '#a8625c', '#6d9a80'];
      for (var i = 0; i < 18; i++) {
        var d = doc.createElement('i');
        d.className = 'pip-conf';
        d.style.left = cx + 'px'; d.style.top = cy + 'px';
        d.style.background = cols[i % 5];
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

    /* ---- tickets: three little tricks and games, all drawn as train tickets ---- */
    var trick = null, tBody = null, tCard = null, tNo = null, tTitle = null, tKind = 'number', tStep = 0, tSum = 0, tReturn = null;
    var QUIPS = ['Hmm…', 'Interesting…', 'I can feel it…', 'Almost there…'];
    var TICKETS = {
      number: ['Ticket 01', 'Read my mind'],
      quiz: ['Ticket 03', 'Whose work is this?'],
      platform: ['Ticket 05', 'The secret platform']
    };
    var STN = $$('article.station[id^="st-"]').map(function (a) {
      return { id: a.id, line: a.getAttribute('data-line'), name: a.getAttribute('data-name'), sub: a.getAttribute('data-sub') };
    });
    function stn(id) { return STN.filter(function (s) { return s.id === id; })[0] || { id: id, name: id, line: 'all', sub: '' }; }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function findLine(id, needle) {
      var a = doc.getElementById(id);
      if (!a) return '';
      var low = needle.toLowerCase();
      var node = $$('li, .st-sum, .st-note, .st-metrics > div', a).filter(function (n) { return n.textContent.toLowerCase().indexOf(low) > -1; })[0];
      return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function buildTrick() {
      trick = doc.createElement('div');
      trick.className = 'trick';
      trick.hidden = true;
      trick.innerHTML =
        '<div class="trick-back"></div>' +
        '<div class="trick-card" role="dialog" aria-modal="true" aria-labelledby="trickT" tabindex="-1">' +
          '<div class="trick-head"><span class="trick-no"></span><p class="trick-k" id="trickT"></p><button type="button" class="trick-x" aria-label="Close this ticket">✕</button></div>' +
          '<div class="trick-body"></div>' +
        '</div>';
      doc.body.appendChild(trick);
      tBody = $('.trick-body', trick);
      tCard = $('.trick-card', trick);
      tNo = $('.trick-no', trick); tTitle = $('.trick-k', trick);
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
        if (act === 'start') { if (tKind === 'platform') dealStart(); else { tStep = 0; tSum = 0; renderCard(); } }
        else if (act === 'yes' || act === 'no') { if (act === 'yes') tSum += (1 << tStep); tStep++; if (tStep < 5) { say(QUIPS[tStep - 1], 1200); renderCard(); } else reveal(); }
        else if (act === 'pick') platPick(+b.getAttribute('data-col'));
        else if (act === 'qpick') quizPick(b);
        else if (act === 'qnext') renderQuiz();
        else if (act === 'again') renderIntro();
        else if (act === 'close') closeTrick();
        else if (act === 'how') {
          var ex = $('.trick-explain', tBody);
          ex.hidden = !ex.hidden;
          b.setAttribute('aria-expanded', String(!ex.hidden));
          b.textContent = ex.hidden ? 'How did I do that?' : 'Hide the explanation';
        } else if (act === 'see') { closeTrick(); goToStation('st-msci', 'partition pruning'); }
        else if (act === 'gotostn') { var id = b.getAttribute('data-id'), nd = b.getAttribute('data-needle'); closeTrick(); goToStation(id, nd); }
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
    function holes(n, done) {
      var d = '';
      for (var i = 0; i < n; i++) d += '<i class="' + (i < done ? 'done' : i === done ? 'now' : '') + '"></i>';
      return '<div class="trick-prog" aria-hidden="true">' + d + '</div>';
    }
    function renderIntro() {
      tStep = 0; tSum = 0;
      el.classList.remove('trick-think');
      if (tKind === 'quiz') { renderQuiz(); return; }
      if (tKind === 'platform') {
        setBody(
          '<p class="trick-lead">Think of one station on the map.</p>' +
          '<p class="trick-sub">I’ll lay out fifteen stations on three platforms. Tell me which platform yours is on, three times, and I’ll find it.</p>' +
          '<div class="trick-btns"><button type="button" class="trick-primary" data-act="start">I’ve got one</button></div>',
          '.trick-primary');
        say('Pick a station…', 2200);
        return;
      }
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
      setBody(
        holes(5, tStep) +
        '<p class="trick-lead">Card ' + (tStep + 1) + ' of 5. Is your number on it?</p>' +
        '<ul class="trick-grid" aria-label="Numbers on card ' + (tStep + 1) + '">' + nums.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>' +
        '<div class="trick-btns"><button type="button" class="trick-primary" data-act="yes">Yes</button><button type="button" class="trick-alt" data-act="no">No</button></div>',
        '.trick-primary');
    }
    function thinking(then) {
      el.classList.add('trick-think');
      setBody('<p class="trick-lead" aria-live="polite">Reading your mind<span class="trick-dots"><i>.</i><i>.</i><i>.</i></span></p>', null);
      say('Hold still…', 1300);
      setTimeout(function () {
        if (!tricking) return;
        el.classList.remove('trick-think');
        then();
      }, reduce ? 200 : 1500);
    }
    function reveal() {
      thinking(function () {
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
      });
    }

    /* the secret platform: 15 stations, three platforms, three answers */
    var pStack = [], pRound = 0, pCols = [];
    function deal3(stack) { var c = [[], [], []]; stack.forEach(function (x, i) { c[i % 3].push(x); }); return c; }
    function dealStart() {
      pStack = shuffle(STN.filter(function (s) { return s.id !== 'st-contact'; }));
      pRound = 0; pCols = deal3(pStack);
      renderPlat();
    }
    function renderPlat() {
      setBody(
        holes(3, pRound) +
        '<p class="trick-lead">Round ' + (pRound + 1) + ' of 3. Which platform is your station on?</p>' +
        '<div class="plat-row">' + pCols.map(function (c, j) {
          return '<button type="button" class="plat" data-act="pick" data-col="' + j + '"><b>Platform ' + (j + 1) + '</b>' +
            c.map(function (s) { return '<span data-line="' + s.line + '">' + esc(s.name) + '</span>'; }).join('') + '</button>';
        }).join('') + '</div>',
        '.plat');
    }
    function platPick(j) {
      var o = [0, 1, 2].filter(function (k) { return k !== j; });
      pStack = pCols[o[0]].concat(pCols[j], pCols[o[1]]);
      pRound++;
      if (pRound < 3) { pCols = deal3(pStack); say(QUIPS[pRound - 1], 1100); renderPlat(); return; }
      thinking(function () {
        var s = pStack[7];
        say('Got it!', 1600); confetti(); hop();
        setBody(
          '<p class="trick-sub">Your station is</p>' +
          '<p class="trick-stn" data-line="' + s.line + '" aria-live="polite">' + esc(s.name) + '</p>' +
          '<div class="trick-btns"><button type="button" class="trick-primary" data-act="gotostn" data-id="' + s.id + '">Take me there</button><button type="button" class="trick-alt" data-act="how" aria-expanded="false">How did I do that?</button><button type="button" class="trick-alt" data-act="again">Again</button></div>' +
          '<div class="trick-explain" hidden>' +
            '<p>Each time you point at a platform, I stack that platform in the middle of the pile, and the middle is where your station drifts. After three rounds there is only one place it can be: the eighth of the fifteen.</p>' +
            '<p>Same idea as a binary search: every answer throws away most of the options, so three questions are enough for fifteen stations.</p>' +
          '</div>',
          '.trick-primary');
      });
    }

    /* whose work is this: read a line from the site, pick the station */
    var QUIZ = [
      ['st-msci', 'Lifted reporting accuracy'], ['st-msci', 'Migrated 20+ legacy'],
      ['st-techved', 'Promoted from Associate'], ['st-banking', 'Cut the reporting cycle'],
      ['st-assets', 'simulated $10K'], ['st-rag', 'Found and fixed inline-XBRL']
    ];
    var qLast = -1, qRight = 0, qTotal = 0, qCur = null;
    function renderQuiz() {
      var i, text = '', tries = 0;
      do { i = Math.floor(Math.random() * QUIZ.length); tries++; text = findLine(QUIZ[i][0], QUIZ[i][1]); } while ((i === qLast || !text) && tries < 20);
      if (!text) { setBody('<p class="trick-lead">I couldn’t find a line to quiz you on.</p><div class="trick-btns"><button type="button" class="trick-primary" data-act="close">Close</button></div>', '.trick-primary'); return; }
      qLast = i;
      var ans = QUIZ[i][0];
      var pool = shuffle(['st-techved', 'st-msci', 'st-banking', 'st-assets', 'st-rag'].filter(function (x) { return x !== ans; }));
      var opts = shuffle([ans, pool[0], pool[1]]);
      qCur = { ans: ans, needle: QUIZ[i][1] };
      setBody(
        '<p class="trick-sub">Which station is this line from?</p>' +
        '<blockquote class="trick-fact">' + esc(text) + '</blockquote>' +
        '<div class="quiz-opts">' + opts.map(function (id) {
          return '<button type="button" class="quiz-o" data-act="qpick" data-id="' + id + '" data-line="' + stn(id).line + '"><b>' + esc(stn(id).name) + '</b><small>' + esc(stn(id).sub) + '</small></button>';
        }).join('') + '</div>' +
        '<div class="quiz-res" aria-live="polite"></div>',
        '.quiz-o');
    }
    function quizPick(b) {
      if (!qCur || qCur.done) return;
      qCur.done = true;
      var id = b.getAttribute('data-id'), ok = id === qCur.ans;
      qTotal++; if (ok) qRight++;
      $$('.quiz-o', tBody).forEach(function (o) {
        o.disabled = true;
        if (o.getAttribute('data-id') === qCur.ans) o.classList.add('right');
        else if (o === b) o.classList.add('wrong');
      });
      if (ok) { say('Nice!', 1300); confetti(); hop(); } else say('So close!', 1300);
      $('.quiz-res', tBody).innerHTML =
        '<p class="quiz-msg"><b>' + (ok ? 'Right.' : 'Not quite.') + '</b> That one is from ' + esc(stn(qCur.ans).name) + '. Score so far: ' + qRight + ' of ' + qTotal + '.</p>' +
        '<div class="trick-btns"><button type="button" class="trick-primary" data-act="qnext">Another one</button><button type="button" class="trick-alt" data-act="gotostn" data-id="' + qCur.ans + '" data-needle="' + esc(qCur.needle) + '">Show me where</button></div>';
      var nx = $('.trick-primary', tBody); if (nx) nx.focus({ preventScroll: true });
    }

    function openTrick(kind) {
      if (tricking) return;
      if (!trick) buildTrick();
      tKind = kind || 'number';
      tNo.textContent = TICKETS[tKind][0]; tTitle.textContent = TICKETS[tKind][1];
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

    /* ---- guided rides: a ticket picks the stops, the bar at the bottom walks you through them ---- */
    var TOURS = {
      recruiter: { label: 'Recruiter', blurb: 'The two-minute version', stops: [
        ['st-msci', 'Lifted reporting accuracy', 'Two years running production pipelines at MSCI.'],
        ['st-techved', 'Promoted from Associate', 'Where it started: analytics consulting for six-plus clients.'],
        ['st-rag', '100% retrieval', 'The flagship: a research assistant that cites its sources.'],
        ['st-cert-azure', null, 'Credentials you can verify yourself.'],
        ['st-contact', null, 'Available immediately, based in Houston.']
      ] },
      manager: { label: 'Hiring manager', blurb: 'How I build and what changed', stops: [
        ['st-msci', 'Cut average query time', 'A measurable win on a production lakehouse.'],
        ['st-banking', 'Cut the reporting cycle', 'A full pipeline from raw data to a live dashboard.'],
        ['st-rag', 'Found and fixed inline-XBRL', 'A bug that silently broke the data, and how it was found.'],
        ['st-contact', null, 'If this looks like a fit, say hello.']
      ] },
      engineer: { label: 'Fellow engineer', blurb: 'The technical details', stops: [
        ['st-msci', 'Migrated 20+ legacy', 'SQL to PySpark, with data-quality checks on 100+ feeds.'],
        ['st-banking', 'Ingests 50K', 'ADF, Auto Loader, a Medallion pipeline and scheduled Workflows.'],
        ['st-assets', 'PySpark window functions', 'Rolling volatility, Sharpe ratio and drawdown in PySpark.'],
        ['st-rag', 'Citation-grounded generation', 'Retrieval, citations and LLM-as-judge evaluation.'],
        ['#toolkit', null, 'The full technical toolkit.']
      ] },
      reader: { label: 'Just reading', blurb: 'The writing', stops: [
        ['st-post-realization', 'managed Spark', 'What building a platform taught me about Databricks.'],
        ['st-post-ltap', 'restaurant', 'LTAP, explained with a restaurant.'],
        ['st-post-rt', '10ms latency', 'What a real-time lakehouse means in practice.'],
        ['st-post-layers', 'AI/BI Genie', 'AI in every layer of the platform.'],
        ['st-chatbot', 'conversational assistant', 'And what I am building next.']
      ] }
    };
    var tourEl = null;
    function buildTour() {
      tourEl = doc.createElement('div');
      tourEl.className = 'tour';
      tourEl.hidden = true;
      tourEl.setAttribute('role', 'region');
      tourEl.setAttribute('aria-label', 'Guided ride');
      tourEl.innerHTML =
        '<div class="tour-txt"><small class="tour-k"></small><b class="tour-t"></b><span class="tour-d"></span></div>' +
        '<div class="tour-btns"><button type="button" class="tour-b" data-t="prev">Back</button><button type="button" class="tour-b tour-next" data-t="next">Next stop →</button><button type="button" class="tour-b tour-end" data-t="end" aria-label="End the ride">✕</button></div>';
      doc.body.appendChild(tourEl);
      tourEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-t]');
        if (!b) return;
        var t = b.getAttribute('data-t');
        if (t === 'end') endTour();
        else if (t === 'prev') tourGo(tour.i - 1);
        else if (t === 'next') tourGo(tour.i + 1);
        else if (t === 'pass') { endTour(); setOpen(true); showView('passport'); }
      });
    }
    function tourGo(i) {
      var stops = tour.def.stops;
      if (i < 0) i = 0;
      tour.i = i;
      var k = $('.tour-k', tourEl), t = $('.tour-t', tourEl), d = $('.tour-d', tourEl), btns = $('.tour-btns', tourEl);
      var next = $('.tour-next', tourEl), prev = $('[data-t="prev"]', tourEl);
      tourEl.hidden = false;
      el.classList.add('touring');
      if (i >= stops.length) {
        k.textContent = tour.def.label + ' ticket · arrived';
        t.textContent = 'End of the line';
        d.textContent = stamps.count() + ' of ' + stamps.total + ' stamps in your passport.';
        next.textContent = 'Passport'; next.setAttribute('data-t', 'pass');
        prev.disabled = false;
        endGuide();
        return;
      }
      var st = stops[i], isSec = st[0].charAt(0) === '#';
      k.textContent = tour.def.label + ' ticket · stop ' + (i + 1) + ' of ' + stops.length;
      t.textContent = isSec ? 'Technical toolkit' : stn(st[0]).name;
      d.textContent = st[2];
      next.textContent = i === stops.length - 1 ? 'Finish' : 'Next stop →';
      next.setAttribute('data-t', 'next');
      prev.disabled = i === 0;
      if (isSec) {
        endGuide();
        if (drawerOpen()) closeDrawer(false);
        var sec = $(st[0]);
        if (sec) sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      } else goToStation(st[0], st[1]);
      settle();
    }
    function startTour(key) {
      if (!tourEl) buildTour();
      tour = { key: key, def: TOURS[key], i: 0 };
      setOpen(false);
      say('Next stop!', 1200);
      tourGo(0);
    }
    function endTour() {
      if (!tour) return;
      tour = null;
      tourEl.hidden = true;
      el.classList.remove('touring');
      endGuide(); settle();
    }

    /* ---- the menu: ticket rows, no typing ---- */
    var viewEl = $('.cd-view', el), passEl = $('.cd-pass', el), view = 'home', lastPlay = '', clearArmed = false;
    var ABBR = { 'st-techved': 'TECH', 'st-msci': 'MSCI', 'st-banking': 'BANK', 'st-assets': 'REAL', 'st-rag': 'RAG', 'st-post-realization': 'DBX', 'st-post-ltap': 'LTAP', 'st-post-rt': 'RT', 'st-post-layers': 'AI', 'st-chatbot': 'BOT', 'st-ba': 'BA', 'st-ms': 'MS', 'st-cert-fund': 'FUND', 'st-cert-aws': 'AWS', 'st-cert-azure': 'AZ', 'st-contact': 'HI' };
    var LINE_NAME = { eng: 'Engineering line', ai: 'AI & Writing line', lrn: 'Learning line', all: 'Contact' };
    function row(act, code, title, sub, extra) {
      return '<button type="button" class="cd-row" data-act="' + act + '"' + (extra || '') + '><i>' + code + '</i><span><b>' + title + '</b><small>' + sub + '</small></span><em aria-hidden="true">→</em></button>';
    }
    function passBtn() {
      var n = stamps.count(), t = stamps.total || 1;
      passEl.innerHTML = '<span>Passport</span><b>' + n + ' of ' + stamps.total + ' stamps</b><i class="cd-bar"><u style="width:' + Math.round(n / t * 100) + '%"></u></i>';
      passEl.setAttribute('aria-label', 'Passport, ' + n + ' of ' + stamps.total + ' stamps. Open it.');
    }
    function viewHtml(v) {
      var n = stamps.count(), back = '<button type="button" class="cd-back" data-act="home">← Back</button>';
      if (v === 'ride') {
        return back + '<p class="cd-lead">Who is riding today?</p>' + Object.keys(TOURS).map(function (k) {
          return row('tour', TOURS[k].stops.length, TOURS[k].label, TOURS[k].blurb, ' data-k="' + k + '"');
        }).join('');
      }
      if (v === 'board') {
        return back + '<p class="cd-lead">Where to?</p>' + ['eng', 'ai', 'lrn', 'all'].map(function (l) {
          var items = STN.filter(function (s) { return s.line === l; });
          if (!items.length) return '';
          return '<p class="cd-line" data-line="' + l + '"><i>' + (BADGE[l] || '') + '</i>' + LINE_NAME[l] + '</p><ul class="cd-stops">' + items.map(function (s) {
            return '<li><button type="button" class="cd-stop" data-act="go" data-id="' + s.id + '" data-line="' + s.line + '"><span>' + esc(s.name) + '<small>' + esc(s.sub) + '</small></span><u>' + (stamps.has(s.id) ? '✓' : '') + '</u></button></li>';
          }).join('') + '</ul>';
        }).join('');
      }
      if (v === 'passport') {
        var done = n >= stamps.total && stamps.total > 0;
        return back + '<p class="cd-lead">Your passport</p><p class="cd-note">' + n + ' of ' + stamps.total + ' stamps. Visit a station to collect its stamp.</p>' +
          '<div class="cd-stamps">' + STN.map(function (s, i) {
            var got = stamps.has(s.id);
            return '<button type="button" class="cd-stamp' + (got ? ' got' : '') + '" data-act="go" data-id="' + s.id + '" data-line="' + s.line + '" style="--r:' + ((i % 3) * 5 - 5) + 'deg" aria-label="' + esc(s.name) + (got ? ', stamped' : ', not visited yet') + '"><span>' + (got ? ABBR[s.id] || '' : '') + '</span></button>';
          }).join('') + '</div>' +
          '<ul class="cd-miles"><li class="' + (n >= 5 ? 'on' : '') + '"><b>5 stamps</b>' + (n >= 5 ? '<button type="button" class="cd-mini" data-act="platform">Play the secret platform</button>' : '<span>Unlocks a secret trick</span>') + '</li>' +
          '<li class="' + (done ? 'on' : '') + '"><b>All ' + stamps.total + '</b><span>' + (done ? 'Station Master. You have seen everything.' : 'Become Station Master') + '</span></li></ul>' +
          (n ? '<button type="button" class="cd-clear" data-act="clear">' + (clearArmed ? 'Press again to clear' : 'Clear my stamps') + '</button>' : '');
      }
      return '<p class="cd-lead">Welcome aboard. Pick a ticket.</p>' +
        row('ride', '01', 'Take a guided ride', 'I walk you through the highlights') +
        row('board', '02', 'Where to?', 'Jump to any station') +
        row('surprise', '03', 'Surprise me', 'A trick or a quiz, picked for you') +
        row('trick', '04', 'Read my mind', 'Think of a number from 1 to 31') +
        (n >= 5 ? row('platform', '05', 'The secret platform', 'Unlocked. Think of a station') :
          '<div class="cd-row cd-lock"><i>05</i><span><b>The secret platform</b><small>Collect 5 stamps to unlock (' + n + ' of 5)</small></span><em class="cd-tag">locked</em></div>');
    }
    function showView(v, quiet) {
      view = v;
      if (v !== 'passport') clearArmed = false;
      viewEl.innerHTML = viewHtml(v);
      passBtn();
      if (!quiet) { var f = $('button', viewEl); if (f) f.focus({ preventScroll: true }); }
    }
    function surprise() {
      var pool = ['number', 'quiz'];
      if (stamps.count() >= 5) pool.push('platform');
      pool = pool.filter(function (k) { return k !== lastPlay; });
      lastPlay = pool[Math.floor(Math.random() * pool.length)];
      say('Surprise!', 1200);
      openTrick(lastPlay);
    }
    bubble.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      touched();
      var act = b.getAttribute('data-act');
      if (act === 'home' || act === 'ride' || act === 'board' || act === 'passport') showView(act);
      else if (act === 'surprise') surprise();
      else if (act === 'trick') openTrick('number');
      else if (act === 'platform') openTrick('platform');
      else if (act === 'tour') startTour(b.getAttribute('data-k'));
      else if (act === 'go') goToStation(b.getAttribute('data-id'), null);
      else if (act === 'clear') { if (!clearArmed) { clearArmed = true; showView('passport', true); } else { clearArmed = false; stamps.clear(); } }
    });
    stamps.on(function (id) {
      if (view === 'home' || view === 'passport' || view === 'board') showView(view, true); else passBtn();
      if (!id) return;
      var n = stamps.count();
      hop();
      say('Stamped: ' + stn(id).name, 1800);
      if (n === 5) setTimeout(function () { say('Secret platform unlocked!', 2400); confetti(); }, 1900);
      else if (n === stamps.total) setTimeout(function () { say('Station Master!', 2600); confetti(); }, 1900);
    });
    showView('home', true);

    /* ---- reactions: the face follows what you hover ---- */
    var react = '', saidHi = 0, hookI = Math.floor(Math.random() * 4);
    function nextHook() {  /* what the conductor says when you hover it: a reason to click, never "click me" */
      var n = stamps.count(), left = 5 - n;
      var hs = [
        'Mrrp. Think of a number. I’ll guess it.',
        'Two-minute tour? Pick a ticket.',
        n >= 5 ? 'The secret platform is open.' : (n ? n + ' of ' + stamps.total + ' stamps. ' + left + ' to a secret.' : 'Collect 5 stamps. Something unlocks.'),
        'Think you know her work? Try the quiz.'
      ];
      hookI = (hookI + 1) % hs.length;
      return hs[hookI];
    }
    var REACT = [
      ['.pip-body', 'hello'],
      ['.stn, .ask-flip, .ask-go', 'curious'],
      ['.st-metrics, .board-row, .route', 'wow'],
      ['a[href^="mailto"], .term-links a, .st-links a, .photo', 'happy'],
      ['.lg, .seg, .icon-btn', 'wink'],
      ['.kit-row, .st-points li', 'think']
    ];
    function reactFor(t) {
      if (!t || !t.closest) return '';
      for (var k = 0; k < REACT.length; k++) if (t.closest(REACT[k][0])) return REACT[k][1];
      return '';
    }
    function gaze(t) {
      if (!t || !t.getBoundingClientRect || !react || react === 'hello') { look.style.transform = ''; return; }
      var r = t.getBoundingClientRect(), b = body.getBoundingClientRect();
      var dx = r.left + r.width / 2 - (b.left + b.width / 2), dy = r.top + r.height / 2 - (b.top + b.height / 2);
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      look.style.transform = 'translate(' + (dx / d * 2.6).toFixed(1) + 'px,' + (dy / d * 2).toFixed(1) + 'px)';
    }
    if (!coarse) {
      doc.addEventListener('mouseover', function (e) {
        var r = reactFor(e.target);
        if (r === react) return;
        react = r; gaze(e.target); mood();
        if (r === 'hello' && !open && !tricking && Date.now() - saidHi > 7000) { saidHi = Date.now(); say(nextHook(), 2600); }
      }, { passive: true });
      doc.addEventListener('mouseout', function (e) { if (!e.relatedTarget) { react = ''; look.style.transform = ''; mood(); } }, { passive: true });
    }
    /* mood: the face changes with what is going on */
    var curMood = '';
    function mood() {
      var m = 'calm', now = Date.now();
      if (now < happyUntil) m = 'happy';
      else if (tricking) m = el.classList.contains('trick-think') ? 'think' : 'hello';
      else if (typing) m = 'think';
      else if (guiding) m = 'wink';
      else if (open) m = 'hello';
      else if (react) m = react;
      if (m !== curMood) { curMood = m; el.setAttribute('data-mood', m); }
    }
    el.setAttribute('data-mood', 'calm');
    setInterval(mood, 250);
    function activity() { lastAct = Date.now(); }
    ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach(function (t) {
      window.addEventListener(t, activity, { passive: true });
    });
    settle();
    sync();
    setTimeout(function () { el.classList.add('in'); }, 900);
  })();
})();
