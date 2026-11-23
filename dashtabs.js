// Dashboard tabs: Home, Reports, My Learning. Everything here is read from data the page already has
// (account history from /api/me, goal and Studio drafts kept on this device). No AI call, no credit used, no new request.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const A = () => window.WSApp || {};
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const TABS = ['home', 'skill', 'practice', 'plans', 'reports', 'mocks', 'contact'];
  const SKILLS = ['writing', 'speaking', 'listening'];
  const HASH = { home: '#top', practice: '#writing', writing: '#writing', speaking: '#speaking', listening: '#listening', plans: '#plans', reports: '#reports', mocks: '#mocks', contact: '#contact' };
  const PAGE_TITLE = { home: 'Dashboard', plans: 'Plans & Pricing', reports: 'Reports', mocks: 'Mock Exams', contact: 'Contact Support' };
  const SKILL_TITLE = { writing: 'Writing practice', speaking: 'Speaking practice', listening: 'Listening practice' };
  const CRIT = { TR: 'Task Response', TA: 'Task Achievement', CC: 'Coherence and Cohesion', LR: 'Lexical Resource', GRA: 'Grammatical Range and Accuracy', FC: 'Fluency and Coherence' };
  const TASKNAME = { writing_task1: 'Writing Task 1', writing_task2: 'Writing Task 2', writing_mock: '60-minute Writing Mock', speaking: 'Speaking', speaking_test: 'Full Speaking test' };
  const fmtBand = n => (n == null || isNaN(n)) ? '-' : (Math.round(n * 2) / 2).toFixed(1);
  const fmtDate = t => { try { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
  const goal = () => { try { return JSON.parse(store('ws_goal') || '{}') || {}; } catch (e) { return {}; } };

  function skillFromHash() { return location.hash === '#speaking' ? 'speaking' : location.hash === '#listening' ? 'listening' : 'writing'; }
  function tabFromHash() { const h = location.hash; return h === '#reports' ? 'reports' : h === '#progress' || h === '#study-plan' ? 'reports' : (h === '#writing' || h === '#speaking' || h === '#listening') ? (/[?&]task=/.test(location.search) ? 'practice' : 'skill') : (h === '#practice' || h === '#check') ? 'practice' : h === '#plans' ? 'plans' : h === '#mocks' ? 'mocks' : h === '#contact' ? 'contact' : 'home'; }
  function clearHash() { try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  const SKILL_LIST = { writing: 'Writing tests', speaking: 'Speaking tests', listening: 'Listening tests' };
  function paintBack(t, sk) { const a = document.querySelector('.dash-back a[data-back-dashboard]'); if (!a) return; if (t === 'practice' && window.WSMockTicket) { a.textContent = '← Mock exam'; a.setAttribute('href', '#mocks'); } else if (t === 'practice' && SKILL_LIST[sk]) { a.textContent = '\u2190 ' + SKILL_LIST[sk]; a.setAttribute('href', HASH[sk]); } else { a.textContent = '\u2190 Dashboard'; a.setAttribute('href', '#top'); } }
  function setTab(t, push, skill, activate) {
    if (t === 'progress' || t === 'plan') t = 'reports';
    if (!TABS.includes(t)) t = 'home';
    const currentSkill = (t === 'practice' || t === 'skill') ? (SKILLS.includes(skill) ? skill : skillFromHash()) : '';
    if (t === 'practice' || t === 'skill') document.body.dataset.skill = currentSkill;
    document.body.dataset.tab = t;
    document.title = ((t === 'practice' || t === 'skill') ? SKILL_TITLE[currentSkill] : PAGE_TITLE[t]) + ' | WritSpeak';
    document.querySelectorAll('.app-tabs [role="tab"]').forEach(b => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    if (t === 'reports') renderReports();
    if (t === 'home' && !push && Object.values(HASH).includes(location.hash)) clearHash();
    const nextHash = (t === 'practice' || t === 'skill') ? HASH[currentSkill] : HASH[t];
    paintBack(t, currentSkill);
    if (t === 'skill' && window.WSSkills) window.WSSkills.render(currentSkill);
    if (push && location.hash !== nextHash && !(t === 'home' && !location.hash)) { try { history.pushState(null, '', location.pathname + location.search + (t === 'home' ? '' : nextHash)); } catch (e) {} }
    if (t !== 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (t === 'practice' && activate) { const f = A().go; if (f) f(currentSkill); }
    try { window.dispatchEvent(new Event('scroll')); } catch (e) {}
  }
  document.querySelectorAll('.app-tabs [role="tab"]').forEach((b, i, all) => {
    b.addEventListener('click', () => setTab(b.dataset.tab, true));
    b.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; n.focus(); setTab(n.dataset.tab, true); } });
  });
  document.addEventListener('click', ev => {
    const a = ev.target.closest('a[href^="#"], .top-nav a[data-go], .qa'); if (!a) return;
    if (a.hasAttribute('data-challenge-quick')) { ev.preventDefault(); setTab('home', false); const c = $('dailyChallengeTop'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const href = a.getAttribute('href') || '';
    if (a.closest('.top-nav') && window.WSStudio && window.WSStudio.close) { try { window.WSStudio.close(); } catch (e) {} }
    if (a.closest('.top-nav') && a.dataset && SKILLS.includes(a.dataset.go)) { ev.preventDefault(); ev.stopImmediatePropagation(); go(a.dataset.go); return; }
    if (a.classList.contains('qa')) { ev.preventDefault(); const k = a.dataset.go; if (k === 'studio') { setTab('practice', true, document.body.dataset.skill || 'writing', false); const o = $('openStudio'); if (o) o.click(); } else if (k === 'mocks') setTab('mocks', true); else if (k === 'reports') setTab('reports', true); else go(k); return; }
    if (href === '#progress' || href === '#study-plan' || href === '#reports') setTab('reports', true);
    else if (href === '#plans') setTab('plans', true);
    else if (href === '#mocks') setTab('mocks', true);
    else if (href === '#contact') setTab('contact', true);
    else if (href === '#practice' || href === '#check') { ev.preventDefault(); setTab('practice', true, 'writing', true); }
    else if (href === '#writing' || href === '#speaking' || href === '#listening') { ev.preventDefault(); go(href.slice(1)); }
    else if (href === '#top') { ev.preventDefault(); setTab('home', false); clearHash(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }, true);
  const VIEW_OF = [['#contact', 'contact'], ['#plans', 'plans'], ['#progress', 'reports'], ['#reportsTab', 'reports'], ['[data-view="practice"], #workspace, #resultPanel, #checkPanel, #errorBox', 'practice'], ['[data-view="home"]', 'home']];
  const origScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (a) {
    try { if (this.closest && this.closest('main')) { for (const [sel, v] of VIEW_OF) { if (this.closest(sel)) { if (document.body.dataset.tab !== v) setTab(v, false, skillFromHash(), false); break; } } } } catch (e) {}
    return origScroll.call(this, a);
  };
  window.addEventListener('hashchange', () => { const t = tabFromHash(); if (t !== 'home' || document.body.dataset.tab !== 'home') setTab(t, false, skillFromHash(), t === 'practice'); });
  window.addEventListener('popstate', () => { const t = tabFromHash(); if (document.body.dataset.tab !== t || ((t === 'practice' || t === 'skill') && document.body.dataset.skill !== skillFromHash())) setTab(t, false, skillFromHash(), t === 'practice'); });
  const go = k => { setTab('skill', true, SKILLS.includes(k) ? k : 'writing', false); }; // the skill's test cards; a card's Start opens the workspace
  const goListening = () => go('listening');
  function localReports() { try { return JSON.parse(store('ws_local_reports') || '[]') || []; } catch (e) { return []; } }
  function reportSection(label, item) {
    const fb = item.feedback || {}, criteria = Array.isArray(fb.criteria) ? fb.criteria : [], priorities = Array.isArray(fb.priorities) ? fb.priorities : [], findings = Array.isArray(fb.findings) ? fb.findings : [], upgraded = Array.isArray(fb.upgraded) ? fb.upgraded : [], plan = Array.isArray(fb.plan) ? fb.plan : [];
    let out = '<section><h2>' + esc(label) + ' · Band ' + fmtBand(item.overall) + '</h2>';
    if (criteria.length) out += '<div class="criteria">' + criteria.map(c => '<article><h3>' + esc(c.name || c.criterion || c.code || 'Criterion') + ' · ' + esc(c.band == null ? '—' : c.band) + '</h3><p><b>Working well:</b> ' + esc(c.strength || c.justification || '') + '</p><p><b>Holding you back:</b> ' + esc(c.weakness || '') + '</p><p><b>Next step:</b> ' + esc(c.recommendation || c.limit || '') + '</p></article>').join('') + '</div>';
    const fixes = upgraded.length ? upgraded.map(x => ({ original:x.original, correction:x.improved, why:x.why })) : findings.length ? findings.map(x => ({ original:x.quote, correction:x.correction, why:x.explanation })) : priorities.map(x => ({ original:x.original, correction:x.correction, why:x.why }));
    if (fixes.length) out += '<h3>Corrections and priority improvements</h3><ol>' + fixes.slice(0,10).map(x => '<li><b>' + esc(x.original || '') + '</b><p>' + esc(x.correction || '') + '</p><p>' + esc(x.why || '') + '</p></li>').join('') + '</ol>';
    if (fb.focus) out += '<h3>Priority focus</h3><p>' + esc(fb.focus.why || '') + '</p><p><b>Recommended action:</b> ' + esc(fb.focus.action || '') + '</p>';
    if (plan.length) out += '<h3>Priority action plan</h3><ol>' + plan.slice(0,5).map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>';
    if (fb.integrity && fb.integrity.words) out += '<p class="help">Response length: ' + esc(fb.integrity.words) + ' words.</p>';
    if (fb.practice) out += '<p><b>Suggested practice:</b> ' + esc(fb.practice) + '</p>';
    if (item.report) out += '<pre>' + esc(item.report) + '</pre>';
    return out + '</section>';
  }
  function printLocalReport(id) {
    const item = localReports().find(x => x.id === id); if (!item) return;
    const day = new Date(item.at || Date.now()).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
    const label = TASKNAME[item.task] || item.task || 'IELTS Assessment';
    const title = 'WritSpeak ' + label + ' Assessment ' + day;
    let body = '<header><h1>' + esc(title) + '</h1><p>' + esc(day) + ' · ' + esc(item.testType === 'general' ? 'General Training' : item.testType === 'academic' ? 'Academic' : '') + '</p><h2>Estimated band: ' + fmtBand(item.overall) + '</h2></header>';
    if (item.task === 'writing_mock' && item.task1 && item.task2) {
      body += '<p>Task 1 and Task 2 were assessed separately. Task 2 carries twice the weighting in the combined Writing estimate.</p>';
      if (item.task1Question) body += '<p><b>Task 1 prompt:</b> ' + esc(item.task1Question) + '</p>';
      if (item.task1Svg) body += '<div class="report-visual">' + item.task1Svg + '</div>';
      if (item.task1Material) body += '<details><summary>Task 1 diagram description</summary><p>' + esc(item.task1Material) + '</p></details>';
      if (item.task2Question) body += '<p><b>Task 2 prompt:</b> ' + esc(item.task2Question) + '</p>';
      body += reportSection('Task 1 feedback', item.task1) + reportSection('Task 2 feedback', item.task2);
    } else {
      if (item.question) body += '<p><b>Question:</b> ' + esc(item.question) + '</p>';
      body += reportSection(label, item);
    }
    if (item.overall2 != null) body += '<p>Second AI assessment estimate: ' + fmtBand(item.overall2) + '. This is a separate AI estimate, not a statistical confidence interval. If the estimates differ substantially, a teacher review is recommended.</p>';
    body += '<footer><p>AI-assisted IELTS-style practice estimate. Not an official IELTS result.</p><p>WritSpeak has not yet published a validated accuracy percentage. Essay text and recordings are not included in this report.</p></footer>';
    const win = window.open('', '_blank'); if (!win) { alert('Please allow pop-ups to print or save your report.'); return; }
    win.document.open();
    win.document.write('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>body{font:14px/1.55 Arial,sans-serif;color:#17243b;max-width:850px;margin:35px auto;padding:0 24px}h1{font-size:25px}h2{font-size:19px;margin:20px 0 8px}h3{font-size:15px}section{border-top:1px solid #ccd2dc;padding:14px 0}.criteria{display:grid;grid-template-columns:1fr 1fr;gap:10px}.criteria article{border:1px solid #d7dce4;border-radius:8px;padding:10px}.criteria p{margin:5px 0}li{margin:10px 0}footer{border-top:1px solid #ccd2dc;margin-top:28px;padding-top:12px;color:#586477;font-size:12px}@media print{body{margin:0 auto;padding:0 12mm}.criteria{break-inside:avoid}section{break-inside:avoid}}</style></head><body>' + body + '<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>');
    win.document.close(); win.focus();
  }
  // ── Reports: every past assessment, newest first ──
  function renderReports() {
    const box = $('reportsList'); if (!box) return;
    const ME = A().me && A().me(); const hist = (ME && ME.history) || [], local = localReports();
    // Performance by IELTS skill: every figure comes from recorded activity (server history for
    // Writing and Speaking, server learning stats for Reading and Listening). No invented numbers.
    const learning = (ME && ME.learning) || {}, listen = learning.listening || {}, read = learning.reading || {};
    const wRes = hist.filter(r => /^writing/.test(r.task)), sRes = hist.filter(r => /^speaking/.test(r.task));
    const bands = a => a.map(x => x.overall).filter(v => typeof v === 'number' && !isNaN(v));
    const stat = (label, value, note) => '<div class="skill-stat"><span>' + label + '</span><strong>' + value + '</strong><small>' + note + '</small></div>';
    const wb = bands(wRes), sb = bands(sRes);
    const l0 = (listen.latest || [])[0], r0 = (read.latest || [])[0];
    const skillSummary = '<h3 class="rep-sub">Performance by IELTS skill</h3><div class="learning-stats">' +
      stat('Writing', wb.length ? 'Band ' + fmtBand(wb[0]) : 'Not started', wRes.length + ' assessed' + (wb.length > 1 ? ' · best ' + fmtBand(Math.max(...wb)) : '')) +
      stat('Speaking', sb.length ? 'Band ' + fmtBand(sb[0]) : 'Not started', sRes.length + ' assessed' + (sb.length > 1 ? ' · best ' + fmtBand(Math.max(...sb)) : '')) +
      stat('Listening', l0 ? l0.raw + ' / ' + l0.total : 'Not started', (listen.attempts || 0) + ' attempts') +
      stat('Reading', r0 ? r0.raw + ' / ' + r0.total : 'Not started', (read.attempts || 0) + ' attempts') +
      '</div>';
    // Mock exams: progress recorded on this device when a part is completed (the same store the
    // Mock exams page reads); the Writing mock band appears under Downloadable reports below.
    let mockState = {}; try { mockState = JSON.parse(store('ws_mocks') || '{}') || {}; } catch (e) {}
    const MOCK_PARTS = ['listening', 'reading', 'writing', 'speaking'];
    const mockRows = ['m1', 'm2', 'm3', 'm4'].map((id, i) => {
      const s = mockState[id] || {};
      const done = MOCK_PARTS.filter(p => s.done && s.done[p]).length;
      const stateTxt = done === 4 ? 'Completed' : s.started ? 'In progress' : 'Available';
      const detail = done ? done + ' of 4 parts done' : s.started ? 'Started · no parts completed yet' : 'Not started yet';
      return '<li><span><b>Mock exam ' + (i + 1) + '</b> · ' + detail + '</span><span class="muted">' + stateTxt + '</span></li>';
    });
    const mockSection = '<h3 class="rep-sub">Mock exams</h3><ul class="rep-drafts">' + mockRows.join('') +
      '<li><span>Start or resume a full mock (Listening · Reading · Writing · Speaking)</span><button type="button" class="btn small" data-act="go-mocks">Open Mock exams</button></li></ul>' +
      '<p class="help">Mock progress is kept on this device, exactly where you take the exam. Reading and Listening part scores are also recorded in your account history below.</p>';
    let h = '';
    if (!hist.length) h = '<div class="empty"><h3>No reports yet</h3><p>Your first assessment will appear here with its band and scores.</p><p><button type="button" class="btn primary" data-act="go-writing">Start a Writing check</button></p></div>';
    else {
      h = '<div class="rep-wrap"><table class="rep-table"><thead><tr><th>Date</th><th>Skill</th><th>Band</th><th>Criteria</th></tr></thead><tbody>' + hist.slice(0, 60).map(r => {
        const sc = r.scores && typeof r.scores === 'object' ? Object.entries(r.scores).filter(([, v]) => typeof v === 'number').map(([k, v]) => `<span class="pill" title="${esc(CRIT[k] || k)}">${esc(k)} ${fmtBand(v)}</span>`).join(' ') : '';
        const pr = r.pronunciation && r.pronunciation.assessed && r.pronunciation.scores && r.pronunciation.scores.overall != null ? `<span class="pill pron-pill" title="Automatic pronunciation practice score, out of 100">Pronunciation ${Math.round(Number(r.pronunciation.scores.overall))}/100</span>` : '';
        return `<tr><td>${esc(fmtDate(r.at))}</td><td>${esc(TASKNAME[r.task] || r.task)}</td><td><b>${fmtBand(r.overall)}</b></td><td>${sc || '<span class="muted">-</span>'} ${pr}</td></tr>`;
      }).join('') + '</tbody></table></div><p class="help">Scores only. Essay text, recordings and full feedback pages are not stored on our server. Pronunciation scores, when available, are out of 100 and are not IELTS bands.</p>';
    }
    h = skillSummary + h;
    h += mockSection;
    // Practice Studio drafts and results live on this device
    let drafts = [];
    try { if (window.WSCore) drafts = window.WSCore.load(localStorage).slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8); } catch (e) {}
    if (drafts.length) h += '<h3 class="rep-sub">Practice Studio on this device</h3><ul class="rep-drafts">' + drafts.map(a => `<li><span><b>${esc(a.topic || TASKNAME[a.task] || '')}</b> · ${esc(TASKNAME[a.task] || '')} · ${a.words} words</span><span class="muted">${a.status === 'assessed' ? 'Band ' + fmtBand(a.overall) : a.status === 'timeout' ? 'Not assessed' : 'Unfinished'}</span></li>`).join('') + '</ul><p><button type="button" class="btn" data-act="open-studio">Open Practice Studio history</button></p>';
    if (local.length) h += '<h3 class="rep-sub">Downloadable reports on this device</h3><ul class="rep-drafts">' + local.map(r => '<li><span><b>' + esc(TASKNAME[r.task] || r.task) + '</b> · ' + esc(fmtDate(r.at)) + ' · Band ' + fmtBand(r.overall) + '</span><button type="button" class="btn small" data-act="download-report" data-id="' + esc(r.id) + '">Download / Print PDF</button></li>').join('') + '</ul><p class="help">The latest 30 detailed reports are stored only in this browser. Server history keeps scores, not essays or full feedback.</p>';
    else h += '<p class="help">Detailed report downloads will appear here after your next assessment. The latest 30 are stored on this device only; server history keeps scores.</p>';
    box.innerHTML = h;
  }

  const challengeKey = () => { const d = new Date(); return 'ws_challenge_' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const challengeItems = [
    { id: 'A', title: 'Writing practice', note: 'Complete a Writing assessment or the 60-minute Writing Mock.', points: 10 },
    { id: 'B', title: 'Speaking practice', note: 'Complete a Speaking assessment and review your feedback.', points: 10 },
    { id: 'C', title: 'Listening practice', note: 'Complete a Listening set and check your answers.', points: 10 },
  ];
  function challengeState() { try { return JSON.parse(store(challengeKey()) || '{}') || {}; } catch (e) { return {}; } }
  function renderChallenge() {
    const done = challengeState(), points = challengeItems.filter(x => done[x.id]).reduce((n, x) => n + x.points, 0);
    return '<section class="daily-challenge"><header><div><span class="plan-eyebrow">Today’s challenge</span><h3>Choose a short practice goal</h3></div><b class="challenge-points">' + points + ' / 30 XP</b></header>' +
      '<div class="challenge-grid">' + challengeItems.map(x => '<article class="challenge-item ' + (done[x.id] ? 'done' : '') + '"><span class="challenge-letter">' + x.id + '</span><div><b>' + x.title + '</b><p>' + x.note + '</p></div><button type="button" class="btn small" data-act="challenge-start" data-id="' + x.id + '" ' + (done[x.id] ? 'disabled' : '') + '>' + (done[x.id] ? 'Completed · +' + x.points + ' XP' : 'Start practice') + '</button></article>').join('') + '</div>' +
      '<p class="help">XP is awarded only after a real practice or assessment is completed. XP is not an IELTS score and resets daily.</p></section>';
  }
  function renderDailyChallenge() { const box = $('dailyChallengeTop'); if (box) box.innerHTML = renderChallenge(); }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]'); if (!b || !b.closest('#reportsTab, #dailyChallengeTop')) return; const act = b.dataset.act;
    if (act === 'download-report') { printLocalReport(b.dataset.id); }
    else if (act === 'go-mocks') setTab('mocks', true);
    else if (act === 'go-writing') go('writing');
    else if (act === 'challenge-start') { if (b.dataset.id === 'A') go('writing'); else if (b.dataset.id === 'B') go('speaking'); else if (b.dataset.id === 'C') goListening(); }
    else if (act === 'open-studio') { const o = $('openStudio'); if (o) { setTab('practice', false); o.click(); } }
  });

  function markChallengeFromActivity(task) {
    const id = /^writing/.test(task || '') ? 'A' : /^speaking/.test(task || '') ? 'B' : task === 'listening' ? 'C' : '';
    if (!id) return;
    const done = challengeState(); if (!done[id]) { done[id] = true; store(challengeKey(), JSON.stringify(done)); renderDailyChallenge(); }
  }
  document.addEventListener('ws:assessed', ev => { const task = ev.detail && ev.detail.task; markChallengeFromActivity(task); });
  document.addEventListener('ws:practice-completed', ev => { const task = ev.detail && ev.detail.task; markChallengeFromActivity(task); });

  // Recent activity: the last three assessments, under the trend line on the dashboard.
  function renderRecent() {
    const card = $('miniTrendCard'); if (!card) return; let ul = $('recentList');
    if (!ul) { ul = document.createElement('ul'); ul.id = 'recentList'; ul.className = 'recent'; card.append(ul); }
    const ME = A().me && A().me(); const hist = ((ME && ME.history) || []).slice(0, 3);
    ul.innerHTML = hist.map(r => `<li><span>${esc(TASKNAME[r.task] || r.task)}</span><span class="muted">${esc(fmtDate(r.at))}</span><b>${fmtBand(r.overall)}</b></li>`).join('');
  }
  // History arrives after /api/me; refresh whichever tab is showing when it does.
  let tries = 0; (function wait() { const ME = A().me && A().me(); if (ME) { const t = document.body.dataset.tab; if (t === 'reports') renderReports(); return; } if (++tries < 40) setTimeout(wait, 400); })();
  document.addEventListener('ws:me', () => { renderRecent(); renderDailyChallenge(); const t = document.body.dataset.tab; if (t === 'reports') renderReports(); });
  // The dashboard is private: no email sign-in (and no paid access code) means a sign-in screen, never the dashboard.
  function gateCheck() {
    const ME = A().me && A().me(); if (!ME) return false;
    const signed = !!(ME.student || ME.account === 'code');
    if (signed) { delete document.body.dataset.gate; $('gate').hidden = true; return true; }
    document.body.dataset.gate = '1'; $('gate').hidden = false; return true;
  }
  $('gateBtn').addEventListener('click', () => window.openAccount && window.openAccount('in'));
  $('gateUp').addEventListener('click', () => window.openAccount && window.openAccount('up'));
  let gTries = 0; (function gwait() {
    if (gateCheck()) { return; } // signed out: the sign-in card on the page is the one prompt, no second box pops up over it
    if (++gTries < 25) setTimeout(gwait, 300); else { // the server never answered: never show a dashboard full of dashes. Say so, and offer sign-in again.
      document.body.dataset.gate = '1'; $('gate').hidden = false; const t = $('gateTitle'); if (t) t.textContent = 'We could not load your account';
      const why = A().meError && A().meError(), p = $('gate').querySelector('p'); if (p) p.textContent = why || 'Check your internet connection and reload the page. If you were signing in, log in again.';
    }
  })();
  document.addEventListener('ws:me', gateCheck);
  window.WSTabs = { setTab };
  const initialTab = tabFromHash(); setTab(initialTab, false, skillFromHash(), initialTab === 'practice'); renderRecent(); renderDailyChallenge();
  // Contact view: copy the support address (the public pages do this in site.js, which the dashboard does not load).
  const cp = $('copySupport'); if (cp) cp.addEventListener('click', async () => {
    const st = $('copyState'); let ok = false;
    try { await navigator.clipboard.writeText('support@writspeak.com'); ok = true; } catch (e) {}
    if (!ok) { try { const t = document.createElement('textarea'); t.value = 'support@writspeak.com'; document.body.append(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (e) {} }
    if (st) st.textContent = ok ? 'Copied: support@writspeak.com' : 'Select and copy: support@writspeak.com';
  });
})();
