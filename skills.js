// Skill pages: Writing, Speaking and Listening each open on a grid of compact test cards. A card's Start button opens the existing
// practice workspace (same checker, same credits, same server rules). Nothing here decides access: locked content is simply not sent
// by the server, and locked cards only describe what a higher plan adds. Reading has its own page (/reading) with the same card design.
(function () {
  'use strict';
  var A = function () { return window.WSApp || {}; };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var ICON = {
    writing: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>',
    speaking: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    listening: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    studio: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
  };
  var svg = function (k) { return '<span class="sk-ico" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ICON[k] || ICON.writing) + '</svg></span>'; };
  var WMIN = { writing_task1: 20, writing_task2: 40 };
  var state = { writing: { tab: 't2', shown: 12 }, speaking: { shown: 12 }, listening: { sets: null } };
  var retries = 0;

  function card(o) {
    var h = '<li class="sk-card' + (o.locked ? ' locked' : '') + '"><div class="sk-top">' + svg(o.locked ? 'lock' : o.icon) + '<div><h3>' + esc(o.title) + '</h3><p class="sk-label">' + esc(o.label || '') + '</p></div></div>';
    h += '<p class="sk-status">' + (o.status || '') + '</p>';
    if (o.locked) h += '<a class="btn" href="#plans" data-upgrade>' + esc(o.lockBtn || 'See plans') + '</a>';
    else if (o.start) h += '<button type="button" class="btn primary" ' + o.start + '>' + esc(o.startLabel || 'Start') + '</button>';
    if (o.chips && o.chips.length) h += '<div class="sk-parts"><span>Practice by part:</span>' + o.chips.map(function (c) {
      return '<button type="button" class="sk-chip" ' + c.attr + (c.off ? ' disabled' : '') + '>' + esc(c.label) + '</button>';
    }).join('') + '</div>';
    return h + '</li>';
  }
  function grid(cards, id) { return '<ul class="sk-grid"' + (id ? ' id="' + id + '"' : '') + '>' + cards.join('') + '</ul>'; }
  function head(title, sub) { return '<div class="sk-head"><h2 id="skillTitle">' + esc(title) + '</h2></div>' + (sub ? '<p class="sk-sub">' + esc(sub) + '</p>' : ''); }
  // Two primary options at the top of every module (same pattern on Writing, Speaking, Listening and the Reading page):
  // A. Practice tests scrolls to this module's practice area; B. Mock exams opens this module's existing mock interface.
  function entry(mockAttr) { return '<div class="sk-entry" role="group" aria-label="Choose Practice tests or Mock exams"><button type="button" class="btn primary" data-sk-jump="skPractice">Practice tests</button><button type="button" class="btn" ' + mockAttr + '>Mock exams</button></div>'; }
  function jumpHandler(e) { var b = e.target.closest('[data-sk-jump]'); if (!b) return; var t = document.getElementById(b.dataset.skJump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
  function loading(box, what) { box.innerHTML = '<p class="status" role="status">Loading ' + esc(what) + '…</p>'; }
  function planName() { var m = A().me && A().me(); return (m && m.plan && m.plan.name) || 'Free'; }

  // ── Writing ──
  function writingCards() {
    var bank = A().bank && A().bank(); if (!bank || !Array.isArray(bank.writing)) return null;
    var st = state.writing, t = st.tab, task = t === 't2' ? 'writing_task2' : 'writing_task1', type = t === 't1g' ? 'general' : 'academic';
    var hist = (A().history && A().history()) || [], last = {};
    hist.forEach(function (h) { if (h.b) last[h.b] = h; });
    var list = bank.writing.filter(function (w) { return w.task === task && (task === 'writing_task2' || w.testType === type); });
    var locked = ((bank.access && bank.access.writing && bank.access.writing.locked) || []).filter(function (g) {
      return (!g.tasks || !g.tasks.length || g.tasks.indexOf(task) >= 0) && (task === 'writing_task2' || !g.testTypes || !g.testTypes.length || g.testTypes.indexOf(type) >= 0);
    });
    var cards = list.map(function (w) {
      var h = last[w.id], band = h && typeof h.o === 'number' ? h.o : null;
      return card({ icon: 'writing', title: w.type || w.topic, label: w.topic + ' · ' + (task === 'writing_task2' ? 'Task 2 essay' : (type === 'general' ? 'Task 1 letter' : 'Task 1 report')) + ' · ' + WMIN[task] + ' min',
        status: h ? (band != null ? 'Last band <b>' + band.toFixed(1) + '</b>' : 'Tried before') : 'No attempts yet', start: 'data-sk-writing="' + esc(w.id) + '"' });
    });
    var lockedCards = locked.map(function (g) { return card({ locked: true, title: g.label, label: g.count + ' more questions', status: 'Included in a higher plan', lockBtn: 'See plans' }); });
    return { cards: cards, locked: lockedCards };
  }
  function renderWriting(box) {
    var st = state.writing, data = writingCards();
    var h = head('Writing practice', 'Choose a task. Drafting and timing are free; a credit is used only when you check your answer.');
    // skMock targets the grid holding the 60-minute Writing test (the module's mock interface).
    h += entry('data-sk-jump="skMock"');
    h += '<div id="skPractice" class="sk-filter" role="group" aria-label="Writing task type">' + [['t2', 'Task 2 essay'], ['t1a', 'Task 1 Academic'], ['t1g', 'Task 1 General letter']].map(function (x) { return '<button type="button" data-sk-wtab="' + x[0] + '" aria-pressed="' + (st.tab === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    h += grid([
      card({ icon: 'studio', title: 'Practice Studio', label: 'Timed drills · autosave · history on this device', status: 'Drafting and timing are free', start: 'data-sk-studio', startLabel: 'Open' }),
      card({ icon: 'clock', title: '60-minute Writing test', label: 'Task 1 + Task 2 · one timer', status: 'Uses one Writing credit, only when assessed', start: 'data-sk-wtest', startLabel: 'Start',
        chips: [{ label: 'Task 1', attr: 'data-sk-wpart="1"' }, { label: 'Task 2', attr: 'data-sk-wpart="2"' }] })
    ], 'skMock');
    if (!data) { box.innerHTML = h + '<p class="status" role="status">Loading tasks…</p>'; return false; }
    var shown = data.cards.slice(0, st.shown);
    h += grid(shown.concat(data.locked));
    if (!data.cards.length && !data.locked.length) h += '<p class="sk-empty">No tasks of this type yet.</p>';
    if (data.cards.length > st.shown) h += '<div class="sk-more"><button type="button" class="btn" data-sk-more="writing">Show more tasks</button></div>';
    box.innerHTML = h; return true;
  }

  // ── Speaking ──
  function speakingTopicOf(q) { return q && q.topic; }
  function renderSpeaking(box) {
    var bank = A().bank && A().bank(), qs = (A().questions && A().questions()) || [];
    var h = head('Speaking practice', 'Practise one part at a time, or take a full Part 1, 2 and 3 interview.');
    h += entry('data-sk-jump="skMock"');
    if (!bank || !Array.isArray(bank.tests) || !qs.length) { box.innerHTML = h + '<p class="status" role="status">Loading questions…</p>'; return false; }
    var byId = {}; qs.forEach(function (q) { byId[q.id] = q; });
    // Full tests (paid plans). On a plan without them, one locked card says so.
    h += '<h3 class="sk-group" id="skMock">Full Speaking tests</h3>';
    if (bank.tests.length) {
      h += grid(bank.tests.slice(0, state.speaking.shown).map(function (t) {
        var items = t.items || [], q1 = byId[items[0]], q2 = byId[items.filter(function (id) { return /^p2-/.test(id); })[0]];
        var topic2 = q2 ? q2.topic : '';
        return card({ icon: 'speaking', title: t.label.replace(/^Test \d+:\s*/, ''), label: 'Test ' + (t.label.match(/^Test (\d+)/) || [0, ''])[1] + ' · Parts 1, 2 and 3 · 11–14 min', status: 'No attempts yet', start: 'data-sk-stest="' + esc(t.id) + '"',
          chips: [{ label: 'Part 1', attr: 'data-sk-spart="1" data-topic="' + esc(speakingTopicOf(q1) || '') + '"' }, { label: 'Part 2', attr: 'data-sk-spart="2" data-topic="' + esc(topic2) + '"' }, { label: 'Part 3', attr: 'data-sk-spart="3" data-topic="' + esc(topic2) + '"' }] });
      }));
      if (bank.tests.length > state.speaking.shown) h += '<div class="sk-more"><button type="button" class="btn" data-sk-more="speaking">Show more tests</button></div>';
    } else h += grid([card({ locked: true, title: 'Full Speaking tests', label: 'Parts 1, 2 and 3 · 11–14 min', status: 'Included in paid plans. You can still practise each part below.', lockBtn: 'See plans' })]);
    // Practice by part: the topics this plan can open, then the ones a higher plan adds.
    var access = (bank.access && bank.access.speaking) || { locked: [] };
    [[1, 'Part 1 topics', 'Short answers about familiar topics · up to 1 min each'], [2, 'Part 2 cue cards', 'One long turn · 1 min to prepare, up to 2 min to speak']].forEach(function (g) {
      var seen = {}, cards = [];
      qs.filter(function (q) { return q.part === g[0]; }).forEach(function (q) {
        var key = q.topic || q.id; if (seen[key]) return; seen[key] = 1;
        var n = qs.filter(function (x) { return x.part === g[0] && x.topic === q.topic; }).length;
        var chips = g[0] === 2 ? [{ label: 'Part 2', attr: 'data-sk-spart="2" data-topic="' + esc(q.topic) + '"' }, { label: 'Part 3', attr: 'data-sk-spart="3" data-topic="' + esc(q.topic) + '"' }] : null;
        cards.push(card({ icon: 'speaking', title: q.topicLabel || q.label, label: 'Part ' + g[0] + ' · ' + n + (n === 1 ? ' question' : ' questions'), status: 'Practice only until you check an answer', start: 'data-sk-spart="' + g[0] + '" data-topic="' + esc(q.topic) + '"', chips: chips }));
      });
      (access.locked || []).filter(function (l) { return (l.parts || []).indexOf(g[0]) >= 0; }).forEach(function (l) { cards.push(card({ locked: true, title: l.label, label: 'Part ' + g[0] + ' · ' + l.count + ' questions', status: 'Included in a higher plan' })); });
      h += '<h3 class="sk-group"' + (g[0] === 1 ? ' id="skPractice"' : '') + '>' + g[1] + '</h3><p class="sk-note">' + g[2] + '</p>' + grid(cards);
    });
    box.innerHTML = h; return true;
  }

  // ── Listening ──
  function renderListening(box) {
    var tests = (A().listenTests && A().listenTests()) || [];
    var h = head('Listening practice', 'Short recordings with questions, marked against the answer key.');
    var fullNow = (window.WSMocks && WSMocks.fullListeningMocks) ? WSMocks.fullListeningMocks() : [];
    h += entry(fullNow.length ? 'data-sk-jump="skMock"' : 'data-sk-mocks');
    if (!tests.length) {
      box.innerHTML = h + '<p class="status" role="status">Loading tests…</p>';
      if (A().loadListeningTests) A().loadListeningTests().then(function () { if (document.body.dataset.tab === 'skill' && document.body.dataset.skill === 'listening') renderListening(box); });
      return false;
    }
    var me = A().me && A().me(), latest = (me && me.learning && me.learning.listening && me.learning.listening.latest) || [], last = {};
    latest.forEach(function (r) { if (!last[r.test_id]) last[r.test_id] = r; });
    h += '<div id="skPractice"></div>' + grid(tests.map(function (t, i) {
      var r = last[t.id];
      return card({ icon: 'listening', locked: !!t.locked, title: t.title, label: 'Practice ' + (i + 1) + ' · ' + t.mins + ' · ' + t.questions + ' questions · ' + t.level,
        status: t.locked ? 'Included in the Weekly plan and above' : r ? 'Last score <b>' + r.raw + '/' + r.total + '</b>' : 'No attempts yet', start: 'data-sk-listen="' + esc(t.id) + '"' });
    }));
    var sets = state.listening.sets;
    if (sets === null) {
      state.listening.sets = [];
      A().api('/api/listening/mock-tests').then(function (j) { state.listening.sets = (j && Array.isArray(j.tests)) ? j.tests : []; if (document.body.dataset.tab === 'skill' && document.body.dataset.skill === 'listening') renderListening(box); }).catch(function () {});
    } else if (sets.length) {
      h += '<h3 class="sk-group">3-part sets</h3><p class="sk-note">Three recordings in a row, each played once, as in the real test.</p>' + grid(sets.map(function (t, i) {
        return card({ icon: 'listening', locked: !!t.locked, title: 'Listening set ' + (i + 1), label: '3 parts · ' + t.total + ' questions · about 6 minutes', status: t.locked ? 'Included in the Weekly plan and above' : 'Marked against the answer key', start: 'data-sk-lset="' + esc(t.id) + '"' });
      }));
    }
    var mk = window.WSMocks, full = mk && mk.fullListeningMocks ? mk.fullListeningMocks() : [];
    if (full.length) {
      h += '<h3 class="sk-group" id="skMock">Full Listening tests</h3><p class="sk-note">Four sections, 40 questions, about 30 minutes. The recordings open after you start that Mock exam, which uses its one mock credit; then you can practise any section on its own.</p>' + grid(full.map(function (id) {
        var started = mk.hasTicket(id), n = id.replace('m', '');
        return card({ icon: 'listening', title: 'Mock exam ' + n + ' · full Listening test', label: '4 sections · 40 questions · about 29 minutes', status: started ? 'Started: practise any section below' : 'Start Mock exam ' + n + ' to open its recordings',
          start: started ? 'data-sk-lxopen="' + id + '"' : 'data-sk-mocks', startLabel: started ? 'Open the test' : 'Go to Mock exams',
          chips: [1, 2, 3, 4].map(function (p) { return { label: 'Part ' + p, attr: 'data-sk-lxpart="' + id + ':' + p + '"', off: !started }; }) });
      }));
    }
    h += '<p class="sk-note">Full-length Listening tests (4 sections, 40 questions) are also part of Mock exams.</p>';
    box.innerHTML = h; return true;
  }

  function render(skill) {
    var box = $('skillHome'); if (!box) return;
    box.dataset.skill = skill;
    var ok = skill === 'speaking' ? renderSpeaking(box) : skill === 'listening' ? renderListening(box) : renderWriting(box);
    if (!ok && retries < 40) { retries++; setTimeout(function () { if (document.body.dataset.tab === 'skill' && document.body.dataset.skill === skill) render(skill); }, 400); } else if (ok) retries = 0;
  }

  function openWorkspace(skill) { if (window.WSTabs) window.WSTabs.setTab('practice', true, skill, false); }
  document.addEventListener('click', function (e) {
    var root = $('skillHome'); if (!root || !root.contains(e.target)) return;
    var b;
    if ((b = e.target.closest('[data-sk-wtab]'))) { state.writing.tab = b.dataset.skWtab; state.writing.shown = 12; render('writing'); return; }
    if (jumpHandler(e)) return;
    if ((b = e.target.closest('[data-sk-more]'))) { state[b.dataset.skMore].shown += 12; render(b.dataset.skMore); return; }
    if ((b = e.target.closest('[data-sk-writing]'))) { openWorkspace('writing'); A().openWriting(b.dataset.skWriting); return; }
    if (e.target.closest('[data-sk-studio]')) { openWorkspace('writing'); var o = $('openStudio'); if (o) o.click(); return; }
    if (e.target.closest('[data-sk-wtest]')) { if (window.WSMocks && window.WSMocks.openWriting) window.WSMocks.openWriting(); return; }
    if ((b = e.target.closest('[data-sk-spart]'))) { openWorkspace('speaking'); A().openSpeakingPart(Number(b.dataset.skSpart), b.dataset.topic || ''); return; }
    if ((b = e.target.closest('[data-sk-stest]'))) { openWorkspace('speaking'); A().openSpeakingTest(b.dataset.skStest); return; }
    if ((b = e.target.closest('[data-sk-wpart]'))) {
      var bank = A().bank && A().bank(), want = b.dataset.skWpart === '1' ? 'writing_task1' : 'writing_task2', first = bank && Array.isArray(bank.writing) ? bank.writing.filter(function (w) { return w.task === want; })[0] : null;
      if (first) { openWorkspace('writing'); A().openWriting(first.id); }
      return;
    }
    if (e.target.closest('[data-sk-mocks]')) { if (window.WSTabs) window.WSTabs.setTab('mocks', true); return; }
    if ((b = e.target.closest('[data-sk-lxopen]'))) { window.WSMocks.openListening(b.dataset.skLxopen, 0); return; }
    if ((b = e.target.closest('[data-sk-lxpart]'))) { if (b.disabled) return; var pr = b.dataset.skLxpart.split(':'); window.WSMocks.openListening(pr[0], Number(pr[1])); return; }
    if ((b = e.target.closest('[data-sk-lset]'))) { openWorkspace('listening'); A().openListeningSet(b.dataset.skLset); return; }
    if ((b = e.target.closest('[data-sk-listen]'))) { openWorkspace('listening'); A().openListening(b.dataset.skListen); return; }
  });
  document.addEventListener('ws:me', function () { if (document.body.dataset.tab === 'skill') render(document.body.dataset.skill || 'writing'); });
  window.WSSkills = { render: render };
  if (document.body.dataset.tab === 'skill') render(document.body.dataset.skill || 'writing'); // opened straight on a skill page
})();
