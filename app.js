// WritSpeak IELTS Checker — browser side. No prompts or keys live here: all marking happens on the server (/api/*).
(function () {
'use strict';
const $ = id => document.getElementById(id);

// ─── device id and access code (this browser only) ────────────────────────────
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
// Analytics: the same first-touch label as site.js (a student may land on /app directly). Sent as x-ws-src; the server keeps counts only.
try { if (!store('ws_src')) { const u = new URLSearchParams(location.search).get('utm_source'); let v = 'direct'; if (u) v = 'utm:' + u; else if (document.referrer) { const h = new URL(document.referrer).hostname; if (h && h !== location.hostname) v = 'ref:' + h; } store('ws_src', v.replace(/[^\x20-\x7e]/g, '').slice(0, 60)); } } catch (e) {}
{ const g = $('accGoogle'), s = store('ws_src'); if (g && s) g.href = '/api/account/google/start?src=' + encodeURIComponent(s); }
let deviceId = store('mj_device');
if (!deviceId || !/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) {
  deviceId = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
  store('mj_device', deviceId);
}
let accessCode = store('mj_code') || '';
let CONFIG = null, ME = null;
let wOwn = false, wNew = false, wTimerId = null; const wTopics = new Set();

async function api(path, opts = {}) {
  const headers = Object.assign({ 'x-device': deviceId }, opts.headers || {});
  const src = store('ws_src'); if (src) headers['x-ws-src'] = src;
  const code = opts.code !== undefined ? opts.code : accessCode;
  if (code) headers['x-access-code'] = code;
  else { const ss = store('ws_session'); if (ss) headers['x-session'] = ss; } // a signed-in student; an access code typed by hand takes priority
  if (opts.requestId) headers['x-request-id'] = opts.requestId;
  if (window.WSMockTicket && (path.startsWith('/api/check') || path.startsWith('/api/speaking-test/start') || path.startsWith('/api/mock/reading/mark') || path.startsWith('/api/mock/reading/test') || path.startsWith('/api/listening/test') || path.startsWith('/api/listening/mark'))) headers['x-mock-ticket'] = window.WSMockTicket;
  if (opts.onStage) headers['x-progress'] = '1';
  if (opts.json !== undefined) { headers['content-type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  let r;
  try { r = await fetch(path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers, body: opts.body, signal: opts.signal }); }
  catch (e) { if (e && e.name === 'AbortError') throw e; return { ok: false, code: 'network', message: 'Could not reach the server. Check your internet connection and try again.' }; }
  let j = null;
  if (opts.onStage && /ndjson/.test(r.headers.get('content-type') || '') && r.body) {
    // Progress stream: JSON lines {stage}, {beat}, then {final, status}.
    try {
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      const eat = line => { if (!line.trim()) return; let o = null; try { o = JSON.parse(line); } catch (e) { return; } if (o.stage) opts.onStage(o.stage); else if (o.final) { j = o.final; if (j && o.status >= 400) j.ok = false; } };
      for (;;) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { eat(buf.slice(0, i)); buf = buf.slice(i + 1); } }
      eat(buf);
    } catch (e) { if (e && e.name === 'AbortError') throw e; }
    if (!j) return { ok: false, code: 'network', message: 'The connection was interrupted before the result arrived. If the result could not reach you, the credit is given back automatically within a minute. Check your remaining count, then press Check again; if it fails again, email support@writspeak.com with the time.' };
    return j;
  }
  try { j = await r.json(); } catch (e) {}
  if (!j) return { ok: false, code: 'bad_reply', message: 'The server sent an unexpected reply. Please try again.' };
  if (!r.ok && j.ok !== false) j.ok = false;
  if (j.code === 'register_required' && window.openAccount && document.body.dataset.gate !== '1') setTimeout(window.openAccount, 50);
  if (j.code === 'upgrade_needed') setTimeout(() => { try { document.getElementById('plans').scrollIntoView(); } catch (e) {} }, 50);
  return j;
}

// ─── task copy (labels and help only; rubrics live on the server) ─────────────
const TASKS = {
  writing_task2: { title: 'Writing Task 2', inputLabel: 'Your essay', btn: 'Check my essay', minWords: 40, target: 250, kind: 'writing', upload: true,
    question: true, questionLabel: 'Task 2 question', testType: true, scored: true,
    crit: [['TR', 'Task Response'], ['CC', 'Coherence & Cohesion'], ['LR', 'Lexical Resource'], ['GRA', 'Grammar Range & Accuracy']],
    placeholder: 'Type or paste your IELTS Writing Task 2 essay here, or add a photo of your handwritten essay above. Aim for at least 250 words.',
    how: ['Choose Academic or General Training.', 'Paste the exact question, then type your essay or take a photo of it.', 'Press Check, confirm, and get feedback in about a minute.'],
    marked: '<strong>AI-assisted, IELTS-style estimate</strong> on the four public IELTS Writing criteria. Every quote in the feedback is checked against your text. Borderline results get a second, independent scoring.' },
  writing_task1: { title: 'Writing Task 1', inputLabel: 'Your report or letter', btn: 'Check my answer', minWords: 30, target: 150, kind: 'writing', upload: true,
    question: true, questionLabel: 'Task 1 question', testType: true, scored: true,
    crit: [['TA', 'Task Achievement'], ['CC', 'Coherence & Cohesion'], ['LR', 'Lexical Resource'], ['GRA', 'Grammar Range & Accuracy']],
    placeholder: 'Academic: your report on the graph, table, chart, map or process.\nGeneral Training: your letter.\nAim for at least 150 words.',
    how: ['Choose Academic (report) or General Training (letter).', 'Paste the exact task. Academic: add a picture of the chart or type its figures.', 'Add your answer, typed or from a photo, then press Check.'],
    marked: '<strong>AI-assisted, IELTS-style estimate</strong> on the four public IELTS Writing criteria, with separate rules for Academic reports and General Training letters. Academic Task 1 needs the chart so the figures can be checked.' },
  speaking: { title: 'Speaking', inputLabel: 'Your speaking transcript', btn: 'Check my speaking', minWords: 20, target: 0, kind: 'speaking',
    question: true, questionLabel: 'Speaking question (Part 1, 2 or 3)', testType: false, scored: true,
    crit: [['FC', 'Fluency & Coherence'], ['LR', 'Lexical Resource'], ['GRA', 'Grammar Range & Accuracy']],
    placeholder: 'Paste what you said (typed or voice-to-text). Works for Part 1, 2 or 3.',
    how: ['Choose a Part and a question.', 'Press Start recording and answer as in the exam. Listen back, then press Get my feedback.', 'Or paste a transcript instead.'],
    marked: '<strong>AI-assisted, IELTS-style estimate</strong> on three of the four Speaking criteria, from an automatic transcript. <strong>Pronunciation is not assessed.</strong>' },
  reading: { title: 'Reading', inputLabel: 'Your answers', btn: 'Mark my answers', minWords: 1, target: 0, graded: true, kind: 'extras',
    passage: true, key: true, testType: true,
    placeholder: 'One answer per line with its number:\n1. TRUE\n2. the sun\n3. C', keyPlaceholder: 'limit: 2\n1. TRUE\n2. the sun / sun\n3. C',
    how: ['Do the Reading test on paper or screen.', 'Paste the answer key and your numbered answers.', 'Press Mark. For explanations, also paste the passage.'],
    marked: '<strong>Marked exactly against your answer key</strong>, with no AI and no limit. A band is shown only for a full 40-question test, using published IELTS thresholds. Without a key, an AI review gives an estimate only.' },
  listening: { title: 'Listening', inputLabel: 'Your answers', btn: 'Mark my answers', minWords: 1, target: 0, graded: true, kind: 'none',
    key: true, audio: true,
    placeholder: 'One answer per line with its number:\n1. Thursday\n2. 25\n3. B', keyPlaceholder: 'limit: 2\n1. Thursday\n2. 25 / twenty-five\n3. B',
    how: ['Choose an original WritSpeak recording and press Play.', 'Answer the questions as you listen, then press Mark my answers.'],
    marked: '<strong>Marked against the WritSpeak answer key</strong>, with no AI assessment call. Spelling and word limits matter, as in the real test.' },
  practice: { title: 'Practice drills', inputLabel: 'What do you want to practise?', btn: 'Make my practice', minWords: 2, target: 0, kind: 'extras',
    placeholder: 'Examples:\n• I keep forgetting articles. Give me an article drill at B1.\n• 5 Task 2 questions about technology, then check my plan.\n• My last errors were: informations, depend from, I am agree. Make exercises.',
    how: ['Describe the skill or mistakes you want to work on.', 'Press Make. You get a short lesson, exercises, an answer key and a retest.'],
    marked: '<strong>Written by AI.</strong> Check any rule you are unsure about with the WritSpeak Team.' },
};
const KIND_NAMES = { mocktest: 'Mock tests', writing: 'Writing checks', speaking: 'Speaking checks', upload: 'Photo and PDF readings', extras: 'Practice and explanations', correction: 'Fix-and-resubmit checks', mock: 'Full Speaking tests' };

const SAMPLES = {
  writing_task2: { q: 'Some people think that the government should pay for university education. Others believe students should pay for it themselves. Discuss both views and give your own opinion.',
    t: 'Nowadays, the question of who should pay for the higher education is very actual in many countries, including Kazakhstan. Some people believe that government must pay for it, while others think students should pay themselves. In this essay I will discuss both views and give my opinion.\n\nOn the one hand, free university education gives chances for everyone. If the study is free, also students from poor families and small villages can get a good profession. For example, in my city Almaty many talented young people can not go to Almaty because their parents have not enough money. Moreover, the country gets more qualified specialists, which is good for the economy.\n\nOn the other hand, education is very expensive and government has many other problems, such as hospitals and roads. When students pay themselves, they are more responsible and they study harder, because they do not want to lose their money. Also, they can take loans from bank and return them after they find a job.\n\nIn my opinion, the best solution is a mix of both. The government should pay for the students who have good results and who need help, but other students can pay a part of the cost. In this way the education will be available for all and the state budget will not suffer too much.\n\nIn conclusion, both views have advantages. I believe that government and students should share the costs of the university education.' },
  writing_task1: { q: 'The chart shows the percentage of households in Kazakhstan with internet access from 2010 to 2025 in urban and rural areas. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.\nData: Urban 2010 40%, 2015 65%, 2020 85%, 2025 95%. Rural 2010 12%, 2015 30%, 2020 55%, 2025 80%.',
    t: 'The bar chart illustrate the proportion of homes with internet in urban and rural areas of Kazakhstan between 2010 and 2025.\n\nIn 2010, about 40% of urban households had internet, while in rural areas the figure was only 12%. During next five years both numbers increased, urban reached 65% and rural rose on 30%. By 2020 the urban percentage was 85% and rural was 55%.\n\nIn 2025 almost all city homes (95%) had access, and rural households reached 80%. The gap between two areas became more smaller over the period, from 28 points to 15 points.' },
  writing_task1_gt: { q: 'You recently stayed at a hotel and you left a bag there. Write a letter to the hotel manager. In your letter:\n- say when you stayed at the hotel\n- describe the bag and what was in it\n- explain what you would like the manager to do',
    t: 'Dear Sir or Madam,\n\nI am writing to you because I have left my bag in your hotel. I stayed in room 214 from 3 to 6 October, and I think I forgot the bag under the bed when I was checking out in the morning, because I was in hurry for my flight to Astana.\n\nThe bag is small, black and made from leather, with a silver zip on the front. Inside there are my glasses in a brown case, a charger for my laptop and a notebook with very important informations for my work. The notebook has my name on the first page.\n\nI would be very grateful if you could check the room and the lost property. If you find it, could you please send it to my home address by post? I will of course pay for the delivery. My address is 15 Abai Avenue, Almaty, and you can call me on the number in my booking.\n\nThank you in advance for your help.\n\nYours faithfully,\nAida Serikova' },
  speaking: { q: 'Part 3: Do you think people today spend too much time on their phones?',
    t: 'Yes, I think so. Nowadays people use phones everywhere, in the bus, in the cafe, even when they are speaking with friends. For example my younger brother he plays games every evening maybe four or five hours. I think it is not good for health, especially for eyes and for sleep. But also we must to say that phone is very useful, we can study, we can work, we can find any information. So I think the problem is not phone, the problem is how people control themselves. Maybe parents and schools should teach children how to use it in right way.' },
  reading: { k: 'limit: 2\n1. TRUE\n2. NOT GIVEN\n3. FALSE\n4. the sun / sun\n5. C', t: '1. T\n2. FALSE\n3. false\n4. the sun at noon\n5. c', p: '' },
  listening: { k: 'limit: 2\n1. Thursday\n2. 25 / twenty-five\n3. B\n4. car park\n5. Harrison', t: '1. thursday\n2. twenty-five\n3. A\n4. the car park\n5. Harison' },
};

// ─── scoring display helpers ──────────────────────────────────────────────────
const fmt = n => n == null ? '–' : Number(n).toFixed(1);
const fmtDate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// ─── answer-key marking (Reading / Listening): exact, in the browser, no AI ───
const NUM_WORDS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
const TFNG = { t: 'true', f: 'false', ng: 'not given', y: 'yes', n: 'no' };
function normAnswer(s) { return String(s).toLowerCase().replace(/[“”"']/g, '').replace(/[.,;:!?]+$/g, '').replace(/\s+/g, ' ').trim(); }
function parseNumbered(text) {
  const items = {}; let limit = null; const problems = [];
  String(text).split(/\r?\n/).forEach(line => {
    const l = line.trim(); if (!l) return;
    const lm = l.match(/^limit\s*[:=]\s*(\d+)\s*$/i);
    if (lm) { limit = Number(lm[1]); return; }
    const m = l.match(/^(?:q\s*)?(\d{1,2})\s*[.):\-]?\s+(.+)$/i) || l.match(/^(?:q\s*)?(\d{1,2})\s*[.):\-]\s*(.+)$/i);
    if (!m) { problems.push(l); return; }
    const n = Number(m[1]);
    if (items[n] !== undefined) problems.push(`question ${n} appears twice`);
    items[n] = m[2].trim();
  });
  return { items, limit, problems };
}
function wordCount(s) { return normAnswer(s) ? normAnswer(s).split(' ').length : 0; }
function markOne(given, keyRaw, limit) {
  const g = normAnswer(given || '');
  if (!g) return { ok: false, why: 'No answer' };
  const alts = keyRaw.split('/').map(normAnswer).filter(Boolean);
  const gExp = TFNG[g] || g, gNum = NUM_WORDS[g] || g;
  const hit = alts.some(a => a === g || a === gExp || (TFNG[a] || a) === gExp || (NUM_WORDS[a] || a) === gNum);
  if (!hit) return { ok: false, why: 'Does not match the key' };
  if (limit && wordCount(given) > limit && !alts.some(a => wordCount(a) > limit)) return { ok: false, why: `Over the ${limit}-word limit` };
  const abbreviated = TFNG[g] && !alts.includes(g);
  return { ok: true, why: abbreviated ? 'Accepted (abbreviation — check your test instructions)' : '' };
}
const THRESHOLDS = {
  reading_academic: [[35, 8], [30, 7], [23, 6], [15, 5]],
  reading_general: [[35, 7], [30, 6], [23, 5], [15, 4]],
  listening: [[35, 8], [30, 7], [23, 6], [16, 5]],
};
function bandRange(raw, total, table) {
  if (total !== 40) return null;
  const t = THRESHOLDS[table];
  for (let i = 0; i < t.length; i++) {
    const [marks, band] = t[i];
    if (raw >= marks) return i === 0 ? `Band ${band} or higher` : (raw === marks ? `Band ${band}` : `Band ${band} or ${band + 0.5}`);
  }
  return `Below band ${t[t.length - 1][1]}`;
}
function gradeAnswers(keyText, answerText) {
  const key = parseNumbered(keyText), ans = parseNumbered(answerText);
  const nums = Object.keys(key.items).map(Number).sort((a, b) => a - b);
  const rows = nums.map(n => { const r = markOne(ans.items[n], key.items[n], key.limit); return { n, given: ans.items[n] || '', key: key.items[n], ...r }; });
  const extra = Object.keys(ans.items).map(Number).filter(n => !(n in key.items));
  return { rows, raw: rows.filter(r => r.ok).length, total: rows.length, limit: key.limit, keyProblems: key.problems, ansProblems: ans.problems, extra };
}

// ─── safe markdown (escapes everything, then adds a few tags) ─────────────────
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}
function md(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  let html = '', list = null, para = [];
  const flushP = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const flushL = () => { if (list) { html += `</${list}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const tr = lines[i].trim();
    if (!tr) { flushP(); flushL(); continue; }
    if (/^\|.*\|$/.test(tr)) {
      flushP(); flushL();
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(lines[i].trim()); i++; }
      i--;
      const cells = r => r.slice(1, -1).split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\|[\s:|-]+\|$/.test(r));
      if (!body.length) continue;
      html += '<div class="tbl" tabindex="0" role="region" aria-label="Table"><table><thead><tr>' + cells(body[0]).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
      body.slice(1).forEach(r => { html += '<tr>' + cells(r).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>'; });
      html += '</tbody></table></div>';
      continue;
    }
    let m;
    if ((m = tr.match(/^(#{1,4})\s+(.*)$/))) { flushP(); flushL(); const lvl = m[1].length <= 2 ? 'h2' : 'h3'; html += `<${lvl}>${inline(m[2])}</${lvl}>`; continue; }
    if (/^(-{3,}|\*{3,})$/.test(tr)) { flushP(); flushL(); html += '<hr>'; continue; }
    if ((m = tr.match(/^[-*•]\s+(.*)$/))) { flushP(); if (list !== 'ul') { flushL(); html += '<ul>'; list = 'ul'; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
    if ((m = tr.match(/^\d+[.)]\s+(.*)$/))) { flushP(); if (list !== 'ol') { flushL(); html += '<ol>'; list = 'ol'; } html += '<li>' + inline(m[1]) + '</li>'; continue; }
    flushL(); para.push(tr);
  }
  flushP(); flushL();
  return html;
}

// ─── state ────────────────────────────────────────────────────────────────────
let task = 'writing_task2', busyNow = false, lastText = '', lastGrade = null, lastResult = null;
let speakMode = 'rec', listenMode = 'lib', libCurrent = null, source = 'typed';
function countWords(s) { return s.trim() ? s.trim().split(/\s+/).length : 0; }
function profile() { return { level: $('profLevel').value, target: $('profTarget').value, goal: $('profGoal').value }; }
function showError(m) { $('errorBox').textContent = m || ''; $('errorBox').hidden = !m; }

function saveDraft() {
  try { localStorage.setItem('mjc_draft_' + task, JSON.stringify({ q: $('questionText').value, m: $('materialText').value, p: $('passageText').value, k: $('keyText').value, t: $('inputText').value, tt: $('testType').value, s: source })); } catch (e) {}
}
function updateCount() {
  const t = TASKS[task], text = $('inputText').value;
  const hint = $('wordHint'); hint.className = '';
  if (t.graded) {
    const n = Object.keys(parseNumbered(text).items).length;
    $('wordCount').textContent = n + (n === 1 ? ' answer' : ' answers');
    const k = Object.keys(parseNumbered($('keyText').value).items).length;
    hint.textContent = k ? `${k} questions in the key` : '';
  } else {
    const n = countWords(text);
    $('wordCount').textContent = n + (n === 1 ? ' word' : ' words');
    if (t.target) {
      if (n && n < t.target) { hint.textContent = `${t.target - n} under the ${t.target}-word minimum`; hint.className = 'under'; }
      else hint.textContent = `Minimum ${t.target} words`;
    } else hint.textContent = '';
  }
  const unclear = (text.match(/\[\?\]/g) || []).length;
  $('unclearNote').hidden = !(source !== 'typed' && unclear);
  if (unclear) $('unclearNote').textContent = `${unclear} word${unclear === 1 ? '' : 's'} could not be read and ${unclear === 1 ? 'is' : 'are'} marked [?]. Replace ${unclear === 1 ? 'it' : 'them'} with what you wrote, then press Check.`;
  saveDraft();
}

function applyBlocks() {
  const t = TASKS[task];
  const lib = task === 'listening' && listenMode === 'lib';
  const lmock = task === 'listening' && listenMode === 'mock';
  const rec = task === 'speaking' && speakMode === 'rec';
  const full = task === 'speaking' && speakMode === 'test';
  $('typeBlock').hidden = !t.testType;
  $('speakModeBlock').hidden = task !== 'speaking' || full; // inside the mock test there is nothing to choose: no recording-vs-paste switch
  if (task === 'speaking') $('howSteps').innerHTML = (full ? ['Check your microphone first.', 'Press Start. The examiner asks each question aloud, and recording starts by itself.', 'Press Finish answer when you are done. Part 2 gives you 1 minute to prepare.', 'After Part 3 you get one result for the whole test.'] : TASKS.speaking.how).map(x => '<li>' + esc(x) + '</li>').join('');
  $('recordBlock').hidden = !rec;
  $('testBlock').hidden = !full;
  $('bankBlock').hidden = !task.startsWith('writing');
  if (task.startsWith('writing')) renderBankSelect();
  $('uploadBlock').hidden = !t.upload || full;
  $('questionBlock').hidden = !t.question || rec || full;
  $('listenModeBlock').hidden = task !== 'listening'; // Listening offers Practice tests and Mock tests side by side
  $('libBlock').hidden = !lib;
  $('mockListening').hidden = !lmock;
  $('keyBlock').hidden = !t.key || lib || lmock;
  $('audioBlock').hidden = !t.audio || lib || lmock;
  $('passageBlock').hidden = !t.passage;
  $('materialBlock').hidden = !(task === 'writing_task1' && $('testType').value !== 'general');
  $('answerBlock').hidden = lib || lmock || rec || full;
  $('metaRow').hidden = lib || lmock || rec || full;
  $('actionRow').hidden = lmock || rec || full;
  if (full) renderTestSetup();
  $('btnSample').hidden = lib || lmock || !SAMPLES[task];
  if (lib) renderLibList();
  renderAllowance();
}
// Remember the visitor's chosen assessment so a sign-in link opened in another tab, a reload or a plain /app visit does not drop it.
// setTask only knows the task name, so when the memory already holds the same task, keep its extra details (question, Task 1 type, Speaking full test).
function rememberStart(s, force) {
  if (!force) { try { const n = new URLSearchParams(s), o = JSON.parse(store('mj_start') || 'null'); if (o && typeof o.s === 'string' && Date.now() - o.t < 7200000 && [...n.keys()].length === 1 && new URLSearchParams(o.s).get('task') === n.get('task')) s = o.s; } catch (e) {} }
  store('mj_start', JSON.stringify({ s, t: Date.now() }));
}
function setTask(name) {
  wOwn = false; wNew = false; wTopics.clear(); if (typeof wTimerStop === 'function' && wTimerId) wTimerStop();
  if (revision && revision.task !== name) endRevision();
  task = name;
  const t = TASKS[name];
  document.querySelectorAll('.mod').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.task === name)));
  const studio = name.startsWith('writing') ? 'writing' : name === 'speaking' ? 'speaking' : '';
  document.querySelectorAll('.studio[data-studio]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.studio === studio)));
  $('writingTabs').hidden = studio !== 'writing';
  if (studio === 'writing') store('mj_wtask', name);
  rememberStart('?task=' + name);
  $('formTitle').textContent = t.title;
  $('inputLabel').textContent = t.inputLabel;
  $('inputText').placeholder = t.placeholder;
  $('btnCheck').textContent = t.btn;
  if (t.question) $('questionLabel').firstChild.textContent = t.questionLabel + ' ';
  if (t.key) $('keyText').placeholder = t.keyPlaceholder;
  $('inputText').classList.toggle('mid', !!t.graded);
  $('howSteps').innerHTML = t.how.map(s => '<li>' + esc(s) + '</li>').join('');
  $('howMarked').innerHTML = t.marked;
  let d = null;
  try { d = JSON.parse(localStorage.getItem('mjc_draft_' + name) || 'null'); } catch (e) {}
  $('questionText').value = d?.q || ''; $('materialText').value = d?.m || ''; $('passageText').value = d?.p || ''; $('keyText').value = d?.k || ''; resetEntry(); $('inputText').value = d?.t || '';
  if (d?.tt) $('testType').value = d.tt;
  source = (d?.t && d?.s) || 'typed';
  clearUpload();
  if ($('materialVisual')) { $('materialVisual').innerHTML = ''; $('materialVisual').hidden = true; }
  applyBlocks();
  $('resultPanel').hidden = true; $('report').innerHTML = ''; $('scoreGrid').innerHTML = ''; $('stamp').textContent = ''; $('agreeLine').textContent = ''; $('scorePanel').hidden = true; showError(''); $('statusMsg').textContent = ''; showCheckPanel(''); clearInvalid();
  updateCount();
}

// ─── allowance card + plan chip ───────────────────────────────────────────────
function renderAllowance() { /* Assessment allowances now live only in the top usage strip. */ }
function maskEmail(email) {
  const parts = String(email || '').split('@');
  if (parts.length !== 2) return 'Account';
  const name = parts[0], masked = name.length < 3 ? name[0] + '***' : name[0] + '***' + name.slice(-1);
  return masked + '@' + parts[1];
}
function renderChip() {
  if (!ME) return;
  const chip = $('planChip');
  if (ME.student && ME.student.email) {
    chip.innerHTML = esc(ME.plan.name) + ' · <b>' + esc(maskEmail(ME.student.email)) + '</b>';
    chip.title = ME.student.email;
  } else if (ME.account === 'code') {
    chip.innerHTML = esc(ME.plan.name) + ' plan · <b>code …' + esc(ME.last4 || '') + '</b>';
    chip.title = 'Access code ending ' + (ME.last4 || '');
  } else { chip.innerHTML = 'Account · <b>Sign in</b>'; chip.removeAttribute('title'); }
}
function setDashboardAccess(allowed) {
  const gate = $('gate');
  if (allowed) {
    if (gate) gate.hidden = true;
    document.body.removeAttribute('data-gate');
    return;
  }
  if (gate) gate.hidden = false;
  document.body.dataset.gate = '1';
}
let meError = null; // why the account could not load (shown on the sign-in screen instead of a vague message)
async function loadMe() {
  const j = await api('/api/me');
  meError = j.ok ? null : (j.message || null);
  if (j.ok) {
    ME = j;
    setDashboardAccess(!!(j.student || j.account === 'code'));
    renderChip(); renderAllowance(); renderProgress(); if (CONFIG) renderPlans();
    return j;
  }
  setDashboardAccess(false);
  if (['bad_code', 'code_expired', 'code_disabled', 'too_many_devices'].includes(j.code) && accessCode) {
    showError(j.message + ' The free plan is used until this is fixed.');
    const keep = accessCode; accessCode = '';
    const f = await api('/api/me');
    accessCode = keep;
    if (f.ok) {
      ME = f;
      setDashboardAccess(!!(f.student || f.account === 'code'));
      renderChip(); renderAllowance(); renderProgress(); if (CONFIG) renderPlans();
    }
    $('planChip').innerHTML = 'Code problem · <b>Fix code</b>';
  }
  return j;
}
function updateRemaining(rem) {
  if (!ME || !rem) return;
  if (ME.usage[rem.kind]) { ME.usage[rem.kind].used = rem.used; ME.usage[rem.kind].limit = rem.limit; }
  renderAllowance(); renderUsage(); renderTestSetup();
}

// ─── results ──────────────────────────────────────────────────────────────────
function resetResult() {
  $('resultPanel').hidden = false;
  $('scorePanel').hidden = true; $('cutNotice').hidden = true; $('heardBlock').hidden = true; $('flags').hidden = true;
  $('explainRow').hidden = true; $('explainOut').hidden = true; $('explainOut').innerHTML = '';
  $('copyMsg').textContent = '';
  $('stamp').textContent = ''; showError('');
  try { $('resultPanel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } catch (e) {}
}
function renderScores(scores, crit, label) {
  const grid = $('scoreGrid'); grid.innerHTML = '';
  // A band is shown only for a real, finished assessment: every criterion must carry a valid number.
  if (!scores || typeof scores !== 'object' || !crit.every(([k]) => typeof scores[k] === 'number' && Number.isFinite(scores[k]))) { $('scorePanel').hidden = true; return false; }
  let sum = 0;
  crit.forEach(([k, name]) => {
    sum += scores[k];
    const d = document.createElement('div'); d.className = 'score';
    d.innerHTML = `<div class="n">${scores[k]}</div><div class="c"></div>`;
    d.querySelector('.c').textContent = name; grid.appendChild(d);
  });
  const o = document.createElement('div'); o.className = 'score overall';
  if (crit.length < 4) { o.innerHTML = '<div class="n">–</div><div class="c"></div>'; o.querySelector('.c').textContent = (window.__pronShown ? 'Overall: no band is given for Speaking. Pronunciation is shown below as scores out of 100, not as a band.' : 'Overall: not available until pronunciation is assessed'); }
  else { o.innerHTML = `<div class="n">${fmt(Math.floor(sum / crit.length * 2 + 1e-9) / 2)}</div><div class="c"></div>`; o.querySelector('.c').textContent = label; }
  grid.appendChild(o);
  $('scorePanel').hidden = false;
}
// Truthful progress for a long check: the steps are ticked when the server reports them, with a running timer.
// Also asks the phone to keep the screen on, because a locked screen can drop the connection and lose the result.
function startProgress(el, steps) {
  let done = 0, lock = null; const t0 = Date.now();
  const draw = () => {
    const secs = Math.round((Date.now() - t0) / 1000);
    el.innerHTML = '<div class="progress" role="status" aria-live="polite"><span class="assessment-pen" aria-hidden="true">✎</span><ul>' + steps.map((s, i) => '<li class="' + (i < done ? 'done' : i === done ? 'now' : '') + '">' + esc(s) + (i < done ? ' ✓' : i === done ? '…' : '') + '</li>').join('') + '</ul><p class="thinking">' + secs + ' s · most checks take 20–60 seconds. Please keep this page open.</p></div>';
  };
  draw();
  const timer = setInterval(draw, 1000);
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => {}); } catch (e) {}
  return {
    stage(name) { done = Math.max(done, { accepted: 1, marked: 2, verified: 3 }[name] || done); draw(); },
    stop() { clearInterval(timer); try { if (lock) lock.release(); } catch (e) {} },
  };
}
function setBusy(on, msg) {
  busyNow = on;
  ['btnCheck', 'btnRead', 'btnSend', 'btnRec', 'btnAgain'].forEach(id => { if ($(id)) $(id).disabled = on; });
  $('statusMsg').textContent = msg || '';
}

// ─── checks before anything is sent (mirrors the server's checks) ────────────
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
let chart = null; // { type, data, url } — Academic Task 1 chart picture
function formData() {
  return { task, text: $('inputText').value.trim(), question: $('questionText').value.trim(), material: $('materialText').value.trim(), passage: $('passageText').value.trim(), testType: $('testType').value, profile: profile(), source };
}
function clientCheck(d) {
  const t = TASKS[task], errors = [], warnings = [];
  const words = countWords(d.text), qw = countWords(d.question), mw = countWords(d.material);
  const numbers = (d.question.match(/\d+(?:[.,]\d+)?%?/g) || []).length;
  if (!d.text) errors.push({ field: 'inputText', msg: 'Write or paste your answer.' });
  else if (words < t.minWords) errors.push({ field: 'inputText', msg: `Your answer is only ${words} words. Add your full answer.` });
  if (task === 'writing_task2' && qw < 8) errors.push({ field: 'questionText', msg: 'Paste the exact Task 2 question. Task Response cannot be judged without it.' });
  if (task === 'writing_task1' && d.testType === 'general' && qw < 15) errors.push({ field: 'questionText', msg: 'Paste the full letter task, including its three bullet points.' });
  if (task === 'writing_task1' && d.testType !== 'general') {
    if (qw < 8) errors.push({ field: 'questionText', msg: 'Paste the exact Task 1 question.' });
    if (!chart && mw < 6 && numbers < 4) errors.push({ field: 'materialText', msg: 'Add the chart: upload a picture of it, or type its main figures.' });
  }
  if (task === 'speaking' && qw < 3) errors.push({ field: 'questionText', msg: 'Type the Speaking question you answered.' });
  const swapped = qw > 60 && qw > words * 1.5;
  if (!errors.length && d.text) {
    if (t.target && words < t.target * 0.8) warnings.push({ msg: `Your answer has ${words} words; the task asks for at least ${t.target}. The estimate will reflect that.` });
    if (swapped) warnings.push({ msg: 'Your question box has more words than your answer box. Did you paste them into the wrong boxes?', swap: true });
    const q8 = d.question.split(/\s+/).slice(0, 8).join(' ').toLowerCase();
    if (q8.length > 20 && d.text.toLowerCase().startsWith(q8)) warnings.push({ msg: 'Your answer starts with the question. Remove the question from the answer box so it is not marked as your writing.' });
    if (!/[.!?"”)]$/.test(d.text)) warnings.push({ msg: 'Your answer seems to stop in the middle of a sentence. Check nothing was lost when you pasted it.' });
    if (/\[\?\]/.test(d.text)) warnings.push({ msg: 'Some words are still marked [?]. They will not be counted as errors, but the estimate is less exact.' });
  }
  return { errors, warnings, words, swapped };
}
// How the answer got into the box: characters typed vs pasted or dropped. A sign for the student and the teacher, never proof
// (someone can retype a copied text, or paste their own work). Unknown when too little was counted, e.g. a draft restored from before.
var entryCount = { typed: 0, pasted: 0 }; // var: a draft can be restored before this line runs
function resetEntry() { if (!entryCount) return; entryCount.typed = 0; entryCount.pasted = 0; }
function entryShare(text) {
  const all = entryCount.typed + entryCount.pasted;
  if (!text || all < 0.5 * text.length) return null;
  return Math.round(100 * entryCount.pasted / Math.max(1, all));
}
function entryNote(pct) {
  if (pct === null || pct === undefined) return '';
  const typed = 100 - pct;
  const msg = pct >= 80 ? 'Most of this answer was pasted in. In the computer-delivered test you type everything yourself, within the time, so practise typing your answers here too.'
    : pct >= 20 ? 'Part of this answer was pasted in. For exam practice, try typing the whole answer yourself.'
    : 'You typed this answer yourself, as in the real test.';
  return '<p class="entry-note">How this answer was entered: about ' + typed + '% typed, ' + pct + '% pasted. ' + esc(msg) + '</p>';
}
window.WSEntry = { count: () => ({ ...entryCount }), share: entryShare, note: entryNote }; // read by the browser tests
(function trackEntry() {
  const box = $('inputText'); if (!box) return;
  const len = s => String(s || '').length;
  box.addEventListener('paste', e => { let t = ''; try { t = e.clipboardData.getData('text'); } catch (x) {} entryCount.pasted += len(t); });
  box.addEventListener('drop', e => { let t = ''; try { t = e.dataTransfer.getData('text'); } catch (x) {} entryCount.pasted += len(t); });
  box.addEventListener('input', e => {
    if (!box.value) { resetEntry(); return; }
    if (/^insert(Text|LineBreak|Paragraph|CompositionText|ReplacementText)$/.test(e.inputType || '')) entryCount.typed += Math.max(1, len(e.data));
  });
})();
function clearInvalid() { ['inputText', 'questionText', 'materialText'].forEach(id => { $(id).classList.remove('invalid'); $(id).removeAttribute('aria-invalid'); }); }
function showCheckPanel(html) { $('checkPanel').innerHTML = html; $('checkPanel').hidden = !html; if (html) try { $('checkPanel').scrollIntoView({ block: 'nearest' }); } catch (e) {} }

function swapBoxes() { const a = $('questionText').value; $('questionText').value = $('inputText').value; $('inputText').value = a; updateCount(); runAi(); }
function runAi() {
  const d = formData();
  const t = TASKS[task];
  clearInvalid(); showError('');
  const c = clientCheck(d);
  if (c.errors.length) {
    c.errors.forEach(e => { $(e.field).classList.add('invalid'); $(e.field).setAttribute('aria-invalid', 'true'); });
    showCheckPanel(`<p class="notice bad" role="alert"><strong>Please fix ${c.errors.length === 1 ? 'this' : 'these'} first. Nothing has been sent, and no check was used.</strong></p><ul class="issues">${c.errors.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul>` +
      (c.swapped ? '<p class="notice warn">Your question box has more words than your answer box. Did you paste them into the wrong boxes? <button type="button" class="btn small" id="btnSwap">Swap the boxes</button></p>' : ''));
    if ($('btnSwap')) $('btnSwap').addEventListener('click', swapBoxes);
    $(c.errors[0].field).focus();
    return;
  }
  const kind = t.kind, u = ME?.usage?.[kind];
  const left = u ? Math.max(0, u.limit - u.used) : null;
  const what = t.crit ? t.crit.map(x => x[1]).join(', ') : 'your request';
  let h = '';
  if (c.warnings.length) h += `<div class="notice warn"><strong>Check before you continue:</strong><ul class="issues">${c.warnings.map(w => `<li>${esc(w.msg)}${w.swap ? ' <button type="button" class="btn small" id="btnSwap">Swap the boxes</button>' : ''}</li>`).join('')}</ul></div>`;
  h += `<div class="confirm"><h3>Ready to check</h3><p>${esc(t.title)}${t.testType ? ' · ' + ($('testType').value === 'general' ? 'General Training' : 'Academic') : ''} · ${c.words} words${chart && task === 'writing_task1' ? ' · with your chart picture' : ''}</p>`;
  h += t.crit ? `<p>We will estimate: ${esc(what)}.</p>` : '';
  h += left != null ? `<p><strong>This uses 1 of your ${left} ${esc(KIND_NAMES[kind].toLowerCase())} left.</strong> If the check fails for any reason, it is not counted.</p>` : '';
  h += `<div class="row"><button type="button" class="btn primary" id="btnConfirm">Confirm and check</button><button type="button" class="btn" id="btnBack">Go back and edit</button></div></div>`;
  showCheckPanel(h);
  $('btnConfirm').focus();
  $('btnConfirm').addEventListener('click', () => doAssess(d));
  $('btnBack').addEventListener('click', () => { showCheckPanel(''); $('inputText').focus(); });
  if ($('btnSwap')) $('btnSwap').addEventListener('click', swapBoxes);
}

const TAG_NAMES = { articles: 'Articles', prepositions: 'Prepositions', verb_tense: 'Verb tense', subject_verb_agreement: 'Subject–verb agreement', word_form: 'Word form', countable_uncountable: 'Countable / uncountable', word_order: 'Word order', collocation: 'Collocation', word_choice: 'Word choice', spelling: 'Spelling', punctuation: 'Punctuation', sentence_structure: 'Sentence structure', register_tone: 'Tone and register', linking: 'Linking', paragraphing: 'Paragraphing', idea_development: 'Developing ideas', task_coverage: 'Covering the task', overview_missing: 'Overview', data_accuracy: 'Data accuracy', letter_purpose: 'Purpose of the letter', response_length: 'Length', fluency_markers: 'Fluency', referencing: 'Clear references', argument_logic: 'Logic of the argument' };
// ─── result: fixes first, details folded, then fix-and-resubmit ──────────────
const WRITING_TASKS = new Set(['writing_task1', 'writing_task2']);
const normQ = x => String(x || '').toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const inAnswer = (quote, text) => !!normQ(quote) && normQ(text).includes(normQ(quote));
let lastAssessed = null, revision = null;

// Recurring mistakes, kept on this device only: the tags of the last 20 checks.
function loadHist() { try { const h = JSON.parse(store('mjc_hist') || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; } }
function addHist(taskName, fixes, overall) { const h = loadHist(); const f = fixes.slice(0, 5).map(p => ({ tag: p.tag, original: (p.original || '').slice(0, 120), correction: (p.correction || '').slice(0, 160), why: (p.why || '').slice(0, 300) })); h.push({ t: taskName, at: Date.now(), tags: f.map(x => x.tag), fixes: f, b: taskName.startsWith('writing') ? bankId : null, o: typeof overall === 'number' ? overall : null }); store('mjc_hist', JSON.stringify(h.slice(-20))); }
function recurringLine(tags) {
  const earlier = loadHist().slice(-4); // the 4 checks before this one + this one = last 5
  if (!earlier.length) return '';
  let best = null;
  tags.forEach(tag => { const n = earlier.filter(c => (c.tags || []).includes(tag)).length; if (n && (!best || n > best.n)) best = { tag, n }; });
  if (!best) return '';
  return `<p class="recurring"><strong>${esc(TAG_NAMES[best.tag] || best.tag)}</strong> came up in ${best.n + 1} of your last ${earlier.length + 1} checks. Make it your main practice point this week.</p>`;
}
function trustLine(speaking) {
  return `<p class="trust">${speaking ? (window.__pronShown ? 'Pronunciation is shown above as scores out of 100, never as a band. · ' : 'Pronunciation is not scored, because a transcript cannot show it. · ') : ''}Every quoted mistake was checked against your ${speaking ? 'transcript' : 'answer'} · Accuracy not yet measured against examiner marks · You are not charged if marking fails</p>`;
}
function compareBlock(c) {
  let h = `<section class="compare" aria-labelledby="cmpTitle"><h2 id="cmpTitle">Draft ${c.draft} compared with draft ${c.draft - 1}</h2>`;
  if (c.items.length) {
    const fixedN = c.items.filter(i => i.fixed).length;
    h += `<p><strong>You fixed ${fixedN} of ${c.items.length}.</strong></p><ul class="cmp">`;
    c.items.forEach(i => { h += `<li class="${i.fixed ? 'fixed' : 'still'}"><span class="mark" aria-hidden="true">${i.fixed ? '✔' : '✖'}</span> <strong>${esc(TAG_NAMES[i.tag] || i.tag)}</strong>: ${i.fixed ? 'fixed' : 'still there'} · <span class="was" translate="no">${esc(i.original)}</span></li>`; });
    h += '</ul>';
  }
  if (c.added && c.added.length) h += `<p><strong>New in this draft:</strong> ${c.added.length === 1 ? '1 new mistake' : c.added.length + ' new mistakes'} to look at: ${c.added.map(a => `<span class="was" translate="no">${esc(a.original)}</span> (${esc(TAG_NAMES[a.tag] || a.tag)})`).join(', ')}.</p>`;
  else if (c.items.length) h += '<p>No new mistakes appeared in the parts you changed.</p>';
  if (c.prevOverall != null && c.overall != null) h += `<p>Estimated band: ${fmt(c.prevOverall)} → <strong>${fmt(c.overall)}</strong>. <span class="help">Small changes in the estimate are normal, so the fixes matter more than the number.</span></p>`;
  return h + '</section>';
}
function renderAssessment(fb, opts = {}) {
  let h = '';
  if (opts.compare) h += compareBlock(opts.compare);
  if (fb.limitations) h += `<p class="notice warn">${inline(fb.limitations)}</p>`;
  if (fb.priorities.length) {
    h += `<h2>Your top ${fb.priorities.length === 1 ? 'fix' : fb.priorities.length + ' fixes'}</h2>`;
    const counts = {};
    fb.priorities.forEach(p => { counts[p.tag] = (counts[p.tag] || 0) + 1; });
    const tags = Object.keys(counts);
    if (tags.length > 1) h += `<div class="fchips" role="group" aria-label="Show fixes by type"><button type="button" class="fchip" data-f="" aria-pressed="true">All ${fb.priorities.length}</button>` +
      tags.map(tg => `<button type="button" class="fchip" data-f="${esc(tg)}" aria-pressed="false">${esc(TAG_NAMES[tg] || tg)} ${counts[tg]}</button>`).join('') + '</div>';
    h += '<ol class="fixes">';
    fb.priorities.forEach(p => {
      h += `<li class="fix" data-tag="${esc(p.tag)}"><span class="tag">${esc(TAG_NAMES[p.tag] || p.tag)}${p.optional ? ' · optional' : ''}</span>`;
      h += p.original ? `<p class="change"><span class="was" translate="no">${esc(p.original)}</span> → <span class="now" translate="no">${esc(p.correction)}</span>${p.code ? ` <code>${esc(p.code)}</code>` : ''}</p>` : `<p class="change"><span class="now" translate="no">${esc(p.correction)}</span></p>`;
      if (p.why) h += `<p>${inline(p.why)}</p>`;
      if (p.example) h += `<p class="ex"><strong>Example:</strong> ${inline(p.example)}</p>`;
      if (p.practice) h += `<p class="ex"><strong>Try it:</strong> ${inline(p.practice)}</p>`;
      if (CONFIG?.features?.drills && !p.optional && p.correction && p.original) h += `<button type="button" class="btn small drillBtn" data-i="${fb.priorities.indexOf(p)}">2-minute drill on this</button>`;
      h += '</li>';
    });
    h += '</ol>';
    if (opts.recurring) h += opts.recurring;
    if (opts.extra) h += opts.extra;
  }
  if (opts.marked) h += `<details class="fold"><summary>Your answer with the mistakes marked</summary><div class="transcript marked" translate="no">${opts.marked}</div></details>`;
  if (opts.model) h += modelButton(opts.model);
  if (opts.resubmit) h += '<div class="row resub"><button type="button" class="btn primary" id="btnResubmit">Fix and resubmit</button><span class="help">Correct your answer above. The re-check shows which mistakes you fixed.</span></div>';
  h += trustLine(opts.speaking);
  h += `<details class="fold pr-keep"><summary>By criterion <span class="sum">${fb.criteria.map(c => esc(c.code) + ' ' + c.band).join(' · ')}</span></summary><div class="crits">`;
  fb.criteria.forEach(c => {
    h += `<section class="crit"><h3><span>${esc(c.name)}</span><span class="b">${c.band}</span></h3>`;
    if (c.evidence) h += `<blockquote translate="no">“${esc(c.evidence)}”</blockquote>`;
    if (c.strength) h += `<p><strong>Working well:</strong> ${inline(c.strength)}</p>`;
    if (c.weakness) h += `<p><strong>Holding you back:</strong> ${inline(c.weakness)}</p>`;
    if (c.explanation) h += `<p>${inline(c.explanation)}</p>`;
    if (c.recommendation) h += `<p><strong>Do this next:</strong> ${inline(c.recommendation)}</p>`;
    h += '</section>';
  });
  h += '</div></details>';
  if (fb.upgraded.length) h += `<details class="fold"><summary>Stronger versions of your sentences <span class="sum">${fb.upgraded.length}</span></summary><ul class="ups">` + fb.upgraded.map(u => `<li><p class="was" translate="no">${esc(u.original)}</p><p class="now" translate="no">${esc(u.improved)}</p><p class="help">${inline(u.why)}</p></li>`).join('') + '</ul></details>';
  if (fb.plan.length || fb.practice) {
    h += '<details class="fold pr-keep"><summary>Your next steps</summary>';
    if (fb.plan.length) h += '<ol>' + fb.plan.map(x => `<li>${inline(x)}</li>`).join('') + '</ol>';
    if (fb.practice) h += `<h3>Practice task</h3><p>${inline(fb.practice)}</p>`;
    h += '</details>';
  }
  return h;
}
// ─── Writing 8 result: first screen = bands + one biggest weakness + one action; everything else folded ───
const CRIT_FULL = { TR: 'Task Response', TA: 'Task Achievement', CC: 'Coherence & Cohesion', LR: 'Lexical Resource', GRA: 'Grammar Range & Accuracy' };
const STATUS8 = { active: 'still a problem', improving: 'improving', mastered: 'mastered', slipped: 'came back' };
const PART8 = { fully: 'answered', partly: 'partly answered', not: 'not answered' };
const GAP8 = { missing_link: 'Missing link', unexplained_reference: 'Unclear reference', incomplete_argument: 'Unsupported point', off_topic: 'Off the topic' };
const TASK_SHORT = { writing_task1: 'Task 1', writing_task2: 'Task 2' };
let lesson8 = null;
function revisionBlock8(rv, scores) {
  const total = rv.fixed.length + rv.partly.length + rv.remaining.length;
  let h = `<section class="compare" aria-labelledby="cmpTitle"><h2 id="cmpTitle">Compared with your previous draft</h2><p><strong>Fixed ${rv.fixed.length} of ${total}</strong>${rv.partly.length ? ` · partly fixed ${rv.partly.length}` : ''} · still there ${rv.remaining.length} · new ${rv.added.length}</p><ul class="cmp">`;
  rv.fixed.forEach(f => { h += `<li class="fixed"><span class="mark" aria-hidden="true">✔</span> <strong>${esc(TAG_NAMES[f.tag] || f.tag)}</strong>: fixed · <span class="was" translate="no">${esc(f.quote)}</span></li>`; });
  rv.partly.forEach(f => { h += `<li class="still"><span class="mark" aria-hidden="true">◐</span> <strong>${esc(TAG_NAMES[f.tag] || f.tag)}</strong>: partly fixed · <span translate="no">${esc(f.quote)}</span></li>`; });
  rv.remaining.forEach(f => { h += `<li class="still"><span class="mark" aria-hidden="true">✖</span> <strong>${esc(TAG_NAMES[f.tag] || f.tag)}</strong>: still there · <span translate="no">${esc(f.quote)}</span></li>`; });
  rv.added.forEach(f => { h += `<li class="still"><span class="mark" aria-hidden="true">+</span> <strong>${esc(TAG_NAMES[f.tag] || f.tag)}</strong>: new in this draft · <span translate="no">${esc(f.quote)}</span></li>`; });
  h += '</ul><p>' + Object.keys(scores).map(c => `${c} ${rv.before[c] ?? '–'} → <strong>${scores[c]}</strong>`).join(' · ') + '</p>';
  if (rv.mechanicalOnly) h += '<p class="help">You changed only spelling or punctuation, so the bands stay the same. Correcting these alone does not change an IELTS band.</p>';
  else if (rv.held && rv.held.length) h += '<p class="help">Only the criteria whose evidence changed were reassessed, and a band can rise by at most one per draft.</p>';
  return h + '</section>';
}
function renderWriting8(j, text, task8, modelId) {
  const fb = j.feedback, ig = fb.integrity; let h = '';
  if (j.compareNote) h += `<p class="notice warn">${esc(j.compareNote)}</p>`;
  if (fb.revision) h += revisionBlock8(fb.revision, j.scores);
  const f = fb.focus;
  if (f) {
    const rec = f.recurring && f.recurring.essays > 1 ? ` · seen in ${f.recurring.essays} of your essays${f.recurring.status === 'slipped' ? ' (it came back)' : ''}` : '';
    h += `<section class="focus" aria-labelledby="focusT"><h2 id="focusT">Your biggest weakness</h2><p class="focus-tag">${esc(TAG_NAMES[f.tag] || f.tag)} · ${esc(CRIT_FULL[f.criterion] || f.criterion)}${esc(rec)}</p>`;
    if (f.quote && f.kind === 'error') h += `<p class="change"><span class="was" translate="no">${esc(f.quote)}</span> → <span class="now" translate="no">${esc(f.correction)}</span></p>`;
    else if (f.quote) h += `<p class="ex">In your essay: <span translate="no">“${esc(f.quote)}”</span></p>`;
    h += `<p>${inline(f.why)}</p><p class="action"><strong>Recommended action:</strong> ${inline(f.action)}</p></section>`;
  } else h += '<p class="notice info">No specific weakness was found that needs work first. Keep writing full essays and check the criteria below.</p>';
  if (fb.limitations) h += `<p class="notice warn">${inline(fb.limitations)}</p>`;
  if (modelId) h += modelButton(modelId);
  h += '<div class="row resub no-print"><button type="button" class="btn primary" id="btnResubmit">Fix and resubmit</button><span class="help">Correct your answer above. The re-check shows what you fixed, what is still there and anything new.</span></div>';
  h += `<p class="trust">Every quote was matched against your answer · ${fb.verification.ran ? 'Each correction was checked in a separate step' : 'The extra check of each correction did not run this time'} · Accuracy not yet measured against examiner marks · You are not charged if marking fails</p>`;
  if (j.lessonTicket) h += `<details class="fold lesson no-print" id="lessonFold"><summary>Your 5-minute lesson <span class="sum">${esc(TAG_NAMES[f.tag] || f.tag)} · free, opens when you tap</span></summary><div class="lesson-body" id="lessonBody"><p class="thinking">Preparing your lesson…</p></div></details>`;
  h += `<details class="fold pr-keep"><summary>Why each score <span class="sum">${fb.criteria.map(c => esc(c.code) + ' ' + c.band).join(' · ')}</span></summary><div class="crits">`;
  fb.criteria.forEach(c => {
    h += `<section class="crit"><h3><span>${esc(c.name)}</span><span class="b">${c.band}</span></h3><p class="help">${esc(c.confidence)} confidence</p>`;
    c.evidence.forEach(q => { h += `<blockquote translate="no">“${esc(q)}”</blockquote>`; });
    if (c.justification) h += `<p>${inline(c.justification)}</p>`;
    if (c.limit && c.band < 9) h += `<p><strong>To reach band ${c.band + 1}:</strong> ${inline(c.limit)}</p>`;
    h += '</section>';
  });
  h += '</div></details>';
  const marks = fb.findings.map(x => ({ original: x.quote, tag: x.tag })).concat(ig.gaps.map(g => ({ original: g.quote, tag: g.type === 'unexplained_reference' ? 'referencing' : 'linking' })));
  h += `<details class="fold"><summary>Your essay with notes <span class="sum">${ig.words} words · ${ig.paragraphs} paragraph${ig.paragraphs === 1 ? '' : 's'} · ${marks.length} note${marks.length === 1 ? '' : 's'}</span></summary><div class="integrity">`;
  if (ig.parts.length) h += '<h3>The question</h3><ul class="parts">' + ig.parts.map(p => `<li class="${p.status}"><strong>${esc(PART8[p.status])}</strong>: ${esc(p.part)}</li>`).join('') + '</ul>';
  if (ig.notes.length) h += '<ul class="notes">' + ig.notes.map(n => `<li>${esc(n)}</li>`).join('') + '</ul>';
  if (ig.gaps.length) h += '<h3>Where the logic breaks</h3><ul class="gaps">' + ig.gaps.map((g, i) => `<li><strong>${fb.findings.length + i + 1}. ${esc(GAP8[g.type] || g.type)}</strong>: ${esc(g.explanation)}</li>`).join('') + '</ul>';
  if (ig.indicators.length) h += '<h3>Phrases that may be memorised</h3><p class="help">Unverified indicators, not findings. Nothing here says you copied anything.</p><ul>' + ig.indicators.map(m => `<li translate="no">“${esc(m.quote)}”</li>`).join('') + '</ul>';
  h += `</div><div class="transcript marked" translate="no">${markedText(text, marks)}</div></details>`;
  if (fb.findings.length) {
    h += `<details class="fold"><summary>Sentence corrections <span class="sum">${fb.findings.length}</span></summary><ol class="fixes">`;
    fb.findings.forEach(x => {
      h += `<li class="fix" data-tag="${esc(x.tag)}"><span class="tag">${esc(TAG_NAMES[x.tag] || x.tag)} · ${esc(x.criterion)}${x.severity === 'major' ? ' · important' : ''}${x.isNew ? ' · new' : ''}</span>`;
      h += x.kind === 'error' ? `<p class="change"><span class="was" translate="no">${esc(x.quote)}</span> → <span class="now" translate="no">${esc(x.correction)}</span></p>` : `<p class="change">In: <span translate="no">“${esc(x.quote)}”</span><br><span class="now">${esc(x.correction)}</span></p>`;
      h += `<p>${inline(x.explanation)}</p>`;
      if (CONFIG?.features?.drills && x.kind === 'error') h += `<button type="button" class="btn small drillBtn" data-i="${fb.findings.indexOf(x)}">2-minute drill on this</button>`;
      h += '</li>';
    });
    h += '</ol></details>';
  }
  const hist = j.history;
  if (hist && (hist.profile.length || hist.recent.length)) {
    h += `<details class="fold"><summary>Learning history <span class="sum">${hist.profile.filter(p => p.status === 'mastered').length} mastered · ${hist.profile.filter(p => p.status !== 'mastered').length} to work on</span></summary>`;
    if (hist.profile.length) h += '<div class="data" tabindex="0" role="region" aria-label="Your weaknesses"><table><thead><tr><th>Weakness</th><th>Essays</th><th>Fixed / practised</th><th>Status</th></tr></thead><tbody>' + hist.profile.map(p => `<tr><td>${esc(TAG_NAMES[p.tag] || p.tag)}</td><td class="num">${p.essays}</td><td class="num">${p.fixed} / ${p.exercises}</td><td>${esc(STATUS8[p.status] || p.status)}</td></tr>`).join('') + '</tbody></table></div>';
    if (hist.recent.length) h += '<p class="help">Recent essays: ' + hist.recent.map(r => `${esc(TASK_SHORT[r.task] || r.task)} ${r.overall != null ? fmt(r.overall) : '–'}${r.draft > 1 ? ' (draft ' + r.draft + ')' : ''}`).join(' · ') + '</p>';
    h += '<p class="help">A weakness counts once per essay. It is marked mastered after you practise it and it does not appear in 3 essays in a row.</p></details>';
  }
  lesson8 = j.lessonTicket ? { ticket: j.lessonTicket, loaded: false, answerTicket: null } : null;
  return h;
}
async function openLesson() {
  if (!lesson8 || lesson8.loaded || lesson8.loading) return;
  lesson8.loading = true;
  const j = await api('/api/lesson', { json: { ticket: lesson8.ticket } });
  lesson8.loading = false;
  const box = $('lessonBody'); if (!box) return;
  if (!j.ok) { box.innerHTML = `<p class="status">${esc(j.message || 'The lesson could not be made. Close and open it again.')}</p>`; return; }
  lesson8.loaded = true; lesson8.answerTicket = j.answerTicket;
  const L = j.lesson;
  $('lessonFold').classList.remove('no-print');
  box.innerHTML = `<h3>${esc(L.title)}</h3><p class="lbl">Your sentence</p><p class="was" translate="no">${esc(L.original)}</p><p>${inline(L.why)}</p><p class="lbl">A better version</p><p class="now" translate="no">${esc(L.improved)}</p>
    <div class="exercise no-print"><p class="lbl">Your turn</p><p>${inline(L.instruction)}</p><p class="ex-prompt" translate="no">${esc(L.prompt)}</p>
    <label class="sr-only" for="exAnswer">Your answer</label><textarea id="exAnswer" class="short" rows="3" placeholder="Write your answer here"></textarea>
    <div class="row"><button type="button" class="btn primary" id="btnExCheck">Check my answer</button><span class="status" id="exMsg" aria-live="polite"></span></div><div id="exOut"></div></div>`;
}
async function checkExercise() {
  const ans = ($('exAnswer')?.value || '').trim();
  if (!ans) { $('exMsg').textContent = 'Write your answer first.'; return; }
  $('btnExCheck').disabled = true; $('exMsg').textContent = 'Checking…';
  const j = await api('/api/lesson/answer', { json: { ticket: lesson8.answerTicket, answer: ans } });
  $('btnExCheck').disabled = false; $('exMsg').textContent = '';
  if (!j.ok) { $('exOut').innerHTML = `<p class="status">${esc(j.message || 'Your answer could not be checked. Please try again.')}</p>`; return; }
  if (j.correct) { $('exOut').innerHTML = `<p class="notice ok-box"><strong>✔ Exercise complete.</strong> ${esc(j.feedback)}</p>`; $('btnExCheck').disabled = true; $('exAnswer').readOnly = true; return; }
  $('exOut').innerHTML = `<p class="notice warn"><strong>Not yet.</strong> ${esc(j.feedback)}${j.newErrors && j.newErrors.length ? ' Also check: ' + j.newErrors.map(esc).join(', ') + '.' : ''}${j.attemptsLeft != null ? ` (${j.attemptsLeft} ${j.attemptsLeft === 1 ? 'try' : 'tries'} left)` : ''}</p>` +
    (j.modelAnswer ? `<details class="fold"><summary>Show a correct answer</summary><p class="now" translate="no">${esc(j.modelAnswer)}</p></details>` : '');
}
function feedbackText8(j) {
  const fb = j.feedback, L = [];
  if (fb.revision) L.push(`COMPARED WITH YOUR PREVIOUS DRAFT: fixed ${fb.revision.fixed.length}, still there ${fb.revision.remaining.length}, new ${fb.revision.added.length}`);
  L.push('BANDS: ' + fb.criteria.map(c => `${c.code} ${c.band}`).join(', ') + (j.overall != null ? ` → overall ${fmt(j.overall)}` : ''));
  if (fb.focus) L.push(`BIGGEST WEAKNESS: ${TAG_NAMES[fb.focus.tag] || fb.focus.tag}\n${fb.focus.quote ? `"${fb.focus.quote}"${fb.focus.kind === 'error' ? ' → ' + fb.focus.correction : ''}\n` : ''}${fb.focus.why}\nRECOMMENDED ACTION: ${fb.focus.action}`);
  L.push('WHY EACH SCORE\n' + fb.criteria.map(c => `${c.name}: ${c.band}\n  ${c.justification}\n  To reach the next band: ${c.limit}`).join('\n'));
  if (fb.findings.length) L.push('CORRECTIONS\n' + fb.findings.map((x, i) => `${i + 1}. "${x.quote}" → ${x.correction} — ${x.explanation}`).join('\n'));
  return L.join('\n\n');
}
function onReportClick(ev) {
  const chip = ev.target.closest('.fchip');
  if (chip) {
    const f = chip.dataset.f;
    $('report').querySelectorAll('.fchip').forEach(b => b.setAttribute('aria-pressed', String(b === chip)));
    $('report').querySelectorAll('.fixes .fix').forEach(li => { li.hidden = !!f && li.dataset.tag !== f; });
    return;
  }
  if (ev.target.closest('#btnResubmit')) startRevision();
  if (ev.target.closest('#btnExCheck')) checkExercise();
  const mb = ev.target.closest('.modelBtn'); if (mb) showModel(mb.dataset.id, mb);
  const db = ev.target.closest('.drillBtn'); if (db && lastFixes[Number(db.dataset.i)]) runDrill(lastFixes[Number(db.dataset.i)], db.closest('li'));
}
function startRevision() {
  const la = lastAssessed; if (!la) return;
  if (task !== la.task) setTask(la.task);
  revision = la;
  $('draftNote').innerHTML = `<strong>Draft ${la.draft + 1}.</strong> Correct the mistakes from your result in this box, then press <strong>${esc(TASKS[task].btn)}</strong>. The re-check shows which ones you fixed. <button type="button" class="linkbtn" id="btnEndRev">Cancel</button>`;
  $('draftNote').hidden = false;
  try { $('answerBlock').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } catch (e) {}
  $('inputText').focus();
}
function endRevision() { revision = null; $('draftNote').hidden = true; $('draftNote').innerHTML = ''; }
function feedbackText(fb) {
  const L = [];
  if (fb.priorities.length) L.push('TOP FIXES\n' + fb.priorities.map((p, i) => `${i + 1}. ${p.original ? `"${p.original}" → ${p.correction}` : p.correction} — ${p.why}`).join('\n'));
  L.push('BY CRITERION\n' + fb.criteria.map(c => `${c.name}: ${c.band}\n  Working well: ${c.strength}\n  Holding you back: ${c.weakness}\n  Do this next: ${c.recommendation}`).join('\n'));
  if (fb.plan.length) L.push('PLAN\n' + fb.plan.map((x, i) => `${i + 1}. ${x}`).join('\n'));
  if (fb.practice) L.push('PRACTICE\n' + fb.practice);
  return L.join('\n\n');
}
function showAgreement(j, speaking) {
  const agree = $('agreeLine');
  if (!j.secondTried) { agree.className = 'agree ok'; agree.textContent = 'A second AI assessment was not run for this response.'; }
  else if (j.overall == null) { agree.className = 'agree ok'; agree.textContent = window.__pronShown ? 'No overall band is shown for Speaking. Pronunciation is shown as scores out of 100, not as a band.' : 'No overall band is shown: a band needs all four criteria.'; }
  else if (j.overall2 == null) { agree.className = 'agree wait'; agree.textContent = 'A second AI assessment could not be completed. Treat this as a single AI estimate.'; }
  else if (Math.abs(j.overall - j.overall2) <= 0.5) { agree.className = 'agree ok'; agree.textContent = 'Second AI assessment: ' + fmt(j.overall2) + '. The estimates differ by no more than half a band. This is not a validated accuracy range.'; }
  else { agree.className = 'agree diff'; agree.textContent = 'Second AI assessment: ' + fmt(j.overall2) + '. The two AI estimates differ. Treat this result with caution; a teacher review is recommended.'; }
  if (speaking && j.overall != null && !window.__pronShown) agree.textContent += ' Pronunciation is not assessed.';
}
const stampText = (j, extra) => {
  const d = new Date(), assessed = d.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return ['AI-assisted IELTS-style practice estimate. Not an official IELTS result.', extra, 'Assessed ' + assessed, 'No validated accuracy percentage has been published for this scoring system yet.'].filter(Boolean).join(' · ');
};

function saveLocalReport(j, d, taskName) {
  try {
    const reports = JSON.parse(store('ws_local_reports') || '[]');
    reports.unshift({ id: newId(), task: taskName, testType: d.testType || '', question: d.question || '', at: Date.now(), overall: j.overall ?? null, overall2: j.overall2 ?? null, scores: j.scores || {}, feedback: j.feedback || null, promptVersion: j.promptVersion || '' });
    store('ws_local_reports', JSON.stringify(reports.slice(0, 30)));
  } catch (e) {}
}
async function doAssess(d) {
  if (busyNow) return; // a second press of Confirm (double click, held Enter) must never start a second check
  const thisTask = task, t = TASKS[thisTask];
  showCheckPanel('');
  resetResult();
  const prog = startProgress($('report'), t.scored ? ['Reading your answer', 'Marking each criterion', 'Checking every correction', 'Preparing your feedback'] : ['Reading your answer', 'Preparing your feedback']);
  setBusy(true, 'Checking…');
  const body = { ...d };
  const entryPct = thisTask.startsWith('writing') && d.source === 'typed' ? entryShare(d.text) : null;
  if (thisTask.startsWith('writing') && d.source === 'typed') body.entry = { typed: entryCount.typed, pasted: entryCount.pasted };
  if (thisTask === 'writing_task1' && d.testType !== 'general' && chart) body.chart = { type: chart.type, data: chart.data };
  const rev = revision && revision.task === thisTask && normQ(revision.question) === normQ(d.question) ? revision : null;
  body.draft = rev ? rev.draft + 1 : 1;
  if (rev && rev.ticket) body.previous = { ticket: rev.ticket, text: rev.text };
  const j = await api('/api/check', { json: body, requestId: newId(), onStage: st => prog.stage(st) });
  prog.stop();
  setBusy(false);
  if (!j.ok) {
    $('report').innerHTML = ''; $('resultPanel').hidden = true;
    showError((j.message || 'The check did not finish. Please try again.') + (j.charged === false || j.code === 'network' ? '' : ''));
    if (j.errors) j.errors.forEach(e => { const id = { text: 'inputText', question: 'questionText', material: 'materialText' }[e.field]; if (id) { $(id).classList.add('invalid'); $(id).setAttribute('aria-invalid', 'true'); } });
    if (j.code === 'plan_limit' || j.code === 'not_in_plan' || j.code === 'upgrade_needed') offerPlans();
    if (j.remaining) updateRemaining(j.remaining);
    return;
  }
  if (window.WSMockTicket && thisTask.startsWith('writing')) window.WSMockTicket = '';
  saveLocalReport(j, d, thisTask);
  lastResult = { task: thisTask, testType: d.testType, question: d.question, text: d.text, scores: j.scores };
  updateRemaining(j.remaining);
  try { if (window.WSStudio) window.WSStudio.onAssessed({ task: thisTask, question: d.question, text: d.text, overall: j.overall, scores: j.scores }); } catch (e) {} // Practice Studio history
  try { document.dispatchEvent(new CustomEvent('ws:assessed', { detail: { task: thisTask, question: d.question } })); } catch (e) {} // lets Mock Tests tick the task
  if (j.feedback && j.feedback.engine === 8) {
    renderScores(j.scores, t.crit, 'Overall (approx.)');
    showAgreement(j, false);
    const bm8 = bankMatch(d);
    $('report').innerHTML = entryNote(entryPct) + keyFeaturesCard(bm8) + renderWriting8(j, d.text, thisTask, bm8 && !bm8.generated ? bm8.id : null);
    const fb = j.feedback;
    addHist(thisTask, fb.findings.map(x => ({ tag: x.tag, original: x.quote, correction: x.correction, why: x.explanation })), j.overall);
    lastFixes = fb.findings.map(x => ({ tag: x.tag, original: x.quote, correction: x.correction, why: x.explanation }));
    lastAssessed = { task: thisTask, question: d.question, text: d.text, draft: j.draft || 1, overall: j.overall, ticket: j.revisionTicket || null };
    endRevision();
    lastText = feedbackText8(j);
    if ($('lessonFold')) $('lessonFold').addEventListener('toggle', () => { if ($('lessonFold').open) openLesson(); });
  } else if (j.feedback) {
    renderScores(j.scores, t.crit, 'Overall (approx.)');
    showAgreement(j, thisTask === 'speaking');
    const tags = j.feedback.priorities.map(p => p.tag);
    const compare = rev ? { draft: body.draft, prevOverall: rev.overall, overall: j.overall, items: rev.priorities.filter(p => p.original).map(p => ({ ...p, fixed: !inAnswer(p.original, d.text) })),
      added: j.feedback.priorities.filter(p => p.original && !p.optional && !inAnswer(p.original, rev.text || '')) } : null;
    const bm = WRITING_TASKS.has(thisTask) ? bankMatch(d) : null;
    $('report').innerHTML = entryNote(entryPct) + keyFeaturesCard(bm) + renderAssessment(j.feedback, { speaking: thisTask === 'speaking', resubmit: WRITING_TASKS.has(thisTask), compare, recurring: recurringLine(tags),
      marked: thisTask === 'speaking' ? '' : markedText(d.text, j.feedback.priorities), model: bm && !bm.generated ? bm.id : null, extra: thisTask === 'speaking' ? frameworkCard(j.feedback, [1, 2, 3]) : '' });
    lastFixes = j.feedback.priorities; addHist(thisTask, j.feedback.priorities, j.overall);
    lastAssessed = { task: thisTask, question: d.question, text: d.text, draft: body.draft, overall: j.overall, priorities: j.feedback.priorities.map(p => ({ tag: p.tag, original: p.original, correction: p.correction })) };
    endRevision();
    lastText = (compare ? `DRAFT ${compare.draft}: fixed ${compare.items.filter(i => i.fixed).length} of ${compare.items.length}\n\n` : '') + feedbackText(j.feedback);
  } else {
    $('report').innerHTML = md(j.report || '');
    lastText = j.report || '';
    if (j.truncated) { $('cutNotice').textContent = 'This was cut off before the end, so it was not counted. Press the button again to retry.'; $('cutNotice').hidden = false; }
  }
  $('stamp').textContent = stampText(j, source !== 'typed' ? 'from ' + (source === 'handwriting' ? 'a photo' : 'a document') : '');
  $('statusMsg').textContent = 'Done.';
  loadMe();
}

async function runGrade() {
  const lib = task === 'listening' && listenMode === 'lib';
  if (lib && !libCurrent) { $('statusMsg').textContent = 'Choose a practice test first.'; return; }
  const ansText = lib ? libAnswers(libCurrent).map((a,i)=>`${i+1}. ${a}`).join('\\n') : $('inputText').value;
  if (lib && !libAnswers(libCurrent).some(a => a.trim())) { $('statusMsg').textContent = 'Answer at least one question first.'; return; }
  if (!lib && !Object.keys(parseNumbered($('keyText').value).items).length) { if (task === 'reading') return runAi(); $('statusMsg').textContent = 'Paste the answer key first. Listening needs a key to be marked.'; return; }
  if (!Object.keys(parseNumbered(ansText).items).length) { $('statusMsg').textContent = 'Paste your numbered answers first.'; return; }
  let g;
  if (lib) { const j = await api('/api/listening/mark', { json: { id: libCurrent.id, answers: libAnswers(libCurrent) }, requestId: newId() }); if (!j.ok) { $('statusMsg').textContent = j.message || 'Your answers could not be marked. Please try again.'; return; } g = j; }
  else g = gradeAnswers($('keyText').value, ansText);
  lastGrade = g;
  if (task === 'listening') { try { document.dispatchEvent(new CustomEvent('ws:practice-completed', { detail: { task: 'listening' } })); } catch (e) {} }
  resetResult();
  const table = task === 'listening' ? 'listening' : ('reading_' + $('testType').value);
  const band = bandRange(g.raw, g.total, table);
  let h = `<h2>Your score: ${g.raw} / ${g.total}</h2>`;
  h += band ? `<p><strong>${esc(band)}</strong> (estimate from the published IELTS thresholds for a 40-question ${task === 'listening' ? 'Listening' : (table === 'reading_general' ? 'General Training Reading' : 'Academic Reading')} test).</p>` : `<p>Band shown only for a full 40-question test. This key has ${g.total} questions, so you get a raw score.</p>`;
  h += '<div class="tbl" tabindex="0" role="region" aria-label="Your answers marked"><table><thead><tr><th>Q</th><th>Your answer</th><th>Result</th><th>Key</th></tr></thead><tbody>';
  g.rows.forEach(r => { h += `<tr><td>${r.n}</td><td>${esc(r.given || '—')}</td><td class="${r.ok ? 'ok-cell' : 'bad-cell'}">${r.ok ? 'Correct' : 'Wrong'}${r.why ? ' — ' + esc(r.why) : ''}</td><td>${esc(r.key)}</td></tr>`; });
  h += '</tbody></table></div>';
  const warn = []; if (g.limit) warn.push(`Word limit used: ${g.limit}.`); if (g.extra && g.extra.length) warn.push(`Answers for questions not in the key were ignored: ${g.extra.map(esc).join(', ')}.`); if (g.keyProblems && g.keyProblems.length) warn.push(`Key lines not understood: ${g.keyProblems.slice(0, 3).map(esc).join('; ')}.`); if (g.ansProblems && g.ansProblems.length) warn.push(`Answer lines not understood: ${g.ansProblems.slice(0, 3).map(esc).join('; ')}.`);
  warn.push(lib ? 'Spelling must match exactly, as in the real test.' : 'Spelling must match the key exactly, as in the real test. If your key has more accepted answers, add them after a slash.'); h += '<p>' + warn.join(' ') + '</p>';
  if (lib) h += `<p class="credit">${esc(libCurrent.credit || 'Original WritSpeak listening practice.')}</p>`;
  $('report').innerHTML = h; lastText = `Score ${g.raw}/${g.total}` + (band ? ` (${band})` : '') + '\\n' + g.rows.map(r => `${r.n}. ${r.given || '—'} → ${r.ok ? 'correct' : 'wrong (key: ' + r.key + ')'}`).join('\\n'); $('stamp').textContent = 'Marked by answer key, no AI · ' + new Date().toLocaleString('en-GB'); const wrong = g.rows.filter(r => !r.ok); $('explainRow').hidden = !(task === 'reading' && wrong.length); $('explainMsg').textContent = $('passageText').value.trim() ? '' : 'Paste the passage above for useful explanations.'; $('statusMsg').textContent = 'Marked.';
}

async function explainWrong() {
  const g = lastGrade; if (!g) return;
  const wrong = g.rows.filter(r => !r.ok).map(r => ({ n: r.n, given: r.given, key: r.key }));
  $('explainOut').hidden = false; $('explainOut').innerHTML = '<span class="thinking">Explaining…</span>';
  $('btnExplain').disabled = true;
  const j = await api('/api/explain', { json: { wrong, passage: $('passageText').value.trim() }, requestId: newId() });
  $('btnExplain').disabled = false;
  if (!j.ok) { $('explainOut').innerHTML = ''; $('explainMsg').textContent = j.message; return; }
  $('explainOut').innerHTML = md(j.report);
  $('explainMsg').textContent = j.truncated ? 'The explanation was cut off before the end.' : '';
  updateRemaining(j.remaining);
}

function runCheck() { if (busyNow) return; return TASKS[task].graded ? runGrade() : runAi(); }


// ─── upload: photo / handwriting / PDF / Word / text ──────────────────────────
// Word and text files, and PDFs that contain typed text, are read here in the browser (no AI, no allowance used).
// Photos and scanned PDF pages are sent one page at a time to be read, then the student checks the text.
let pending = null; // { pages: [{ media_type, data, url }] }
const MAX_EDGE = 1800;
function clearUpload() { pending = null; $('thumbs').innerHTML = ''; $('readRow').hidden = true; $('readMsg').textContent = ''; try { $('fileInput').value = ''; } catch (e) {} }
function b64FromBytes(bytes) { let bin = ''; const step = 0x8000; for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step)); return btoa(bin); }
async function canvasToPage(c) {
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new Error('encode');
  return { media_type: 'image/jpeg', data: b64FromBytes(new Uint8Array(await blob.arrayBuffer())), url: URL.createObjectURL(blob) };
}
async function prepImage(file) {
  let src, w, h;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
  catch (e) {
    const url = URL.createObjectURL(file); const img = new Image(); img.src = url;
    try { await img.decode(); } catch (e2) { URL.revokeObjectURL(url); throw new Error('decode'); }
    src = img; w = img.naturalWidth; h = img.naturalHeight;
  }
  if (Math.max(w, h) < 500) throw new Error('small');
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
  return canvasToPage(c);
}
async function docxText(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not_docx');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    if (name === 'word/document.xml') {
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const data = u8.subarray(start, start + csize);
      let xmlBytes;
      if (method === 0) xmlBytes = data;
      else if (method === 8 && window.DecompressionStream) xmlBytes = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else throw new Error('unsupported');
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const paras = Array.from(doc.getElementsByTagNameNS(W, 'p')).map(par => {
        let s = '';
        Array.from(par.getElementsByTagNameNS(W, '*')).forEach(el => { if (el.localName === 't') s += el.textContent; else if (el.localName === 'tab') s += ' '; else if (el.localName === 'br' || el.localName === 'cr') s += '\n'; });
        return s.trim();
      }).filter(Boolean);
      return paras.join('\n\n');
    }
    p += 46 + nl + el + cl;
  }
  throw new Error('not_docx');
}
let pdfjsP = null;
function loadPdfJs() {
  if (!pdfjsP) pdfjsP = import('/vendor/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs'; return m; }).catch(e => { pdfjsP = null; throw e; });
  return pdfjsP;
}
// Returns { text } for a PDF with typed text, or { pages } (photos of each page) for a scanned or handwritten PDF.
async function readPdf(bytes, max) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  if (doc.numPages > max) { const e = new Error('pages'); e.pages = doc.numPages; throw e; }
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    tc.items.forEach(it => { text += it.str + (it.hasEOL ? '\n' : ' '); });
    text += '\n\n';
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (countWords(text) >= 30) return { text };
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const v1 = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: MAX_EDGE / Math.max(v1.width, v1.height) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    pages.push(await canvasToPage(c));
  }
  return { pages };
}
function fillText(answer, question, src) {
  if (question && !$('questionText').value.trim()) $('questionText').value = question;
  $('inputText').value = answer;
  source = src;
  updateCount();
  try { $('inputText').focus({ preventScroll: true }); } catch (e) {}
}
function showPages(pages, label) {
  pending = { pages };
  $('thumbs').innerHTML = pages.map((p, i) => `<img src="${p.url}" alt="Page ${i + 1} of your answer">`).join('');
  $('readRow').hidden = false; $('btnRead').disabled = false;
  $('readMsg').textContent = `${label}: ${pages.length} page${pages.length === 1 ? '' : 's'} ready. Press Read my answer.`;
}
async function onFiles(list) {
  const files = Array.from(list || []); // copy first: clearing the input empties the live FileList
  clearUpload(); showError('');
  if (!files.length) return;
  const max = CONFIG?.maxPages || 3;
  const imgs = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name));
  const pdf = files.find(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  const docx = files.find(f => /\.docx$/i.test(f.name));
  const txt = files.find(f => f.type === 'text/plain' || /\.txt$/i.test(f.name));
  const done = name => { $('statusMsg').textContent = `Text added from ${name}. Check it, then press ${TASKS[task].btn}.`; try { $('fileInput').value = ''; } catch (e) {} };
  if (docx || txt) {
    try {
      const text = docx ? await docxText(await docx.arrayBuffer()) : (await txt.text()).replace(/\r\n/g, '\n').trim();
      if (countWords(text) < 5) throw new Error('empty');
      fillText(text, '', 'document'); done(docx ? docx.name : txt.name);
    } catch (e) { showError(docx ? 'This Word file could not be read. Save it as .docx again, or copy and paste the text.' : 'This text file could not be read.'); }
    return;
  }
  if (pdf) {
    if (pdf.size > 15 * 1024 * 1024) { showError('This PDF is too large. Take photos of the pages instead.'); return; }
    $('readRow').hidden = false; $('btnRead').disabled = true; $('readMsg').textContent = 'Opening the PDF…';
    try {
      const r = await readPdf(new Uint8Array(await pdf.arrayBuffer()), max);
      if (r.text) { $('readRow').hidden = true; fillText(r.text, '', 'document'); done(pdf.name); return; }
      showPages(r.pages, 'Scanned PDF');
    } catch (e) {
      $('readRow').hidden = true;
      showError(e.message === 'pages' ? `This PDF has ${e.pages} pages. Send a PDF of up to ${max} pages with just your answer.` : 'This PDF could not be opened. Take photos of the pages instead.');
    }
    return;
  }
  if (!imgs.length) { showError('Choose a photo (JPG or PNG), a PDF, a Word file (.docx) or a text file.'); return; }
  if (imgs.length > max) { showError(`Choose up to ${max} photos — one for each page of your answer.`); return; }
  $('readMsg').textContent = 'Preparing photos…'; $('readRow').hidden = false; $('btnRead').disabled = true;
  const pages = [];
  for (const f of imgs) {
    try { pages.push(await prepImage(f)); }
    catch (e) {
      $('readRow').hidden = true;
      showError(e.message === 'small' ? 'This photo is too small to read. Take it again closer to the page.' : `“${f.name}” could not be opened. Take the photo again, or save it as JPG.`);
      return;
    }
  }
  showPages(pages, 'Photos');
}
async function readUpload() {
  if (!pending || busyNow) return;
  const pages = pending.pages, of = pages.length;
  setBusy(true, '');
  let ticket = null, answer = '', question = '', notes = [], remaining = null;
  for (let i = 0; i < of; i++) {
    $('readMsg').textContent = of > 1 ? `Reading page ${i + 1} of ${of}…` : 'Reading your answer… this takes about 10–30 seconds.';
    const body = JSON.stringify({ type: pages[i].media_type, page: i + 1, of, ticket }) + '\n' + pages[i].data;
    const rid = newId();
    let j = await api('/api/read-file', { body, headers: { 'content-type': 'text/plain' }, requestId: rid });
    if (!j.ok && i > 0 && j.code && j.code.startsWith('read_')) j = await api('/api/read-file', { body, headers: { 'content-type': 'text/plain' }, requestId: newId() }); // one retry for a later page
    if (!j.ok) { setBusy(false); $('readMsg').textContent = ''; showError((of > 1 ? `Page ${i + 1}: ` : '') + (j.message || 'The photo could not be read. Please try again.')); if (j.code === 'plan_limit') offerPlans(); return; }
    if (j.ticket) ticket = j.ticket;
    if (j.remaining) remaining = j.remaining;
    if (!j.readable) { setBusy(false); $('readMsg').textContent = ''; showError((of > 1 ? `Page ${i + 1}: ` : '') + (j.note ? j.note + ' ' : '') + 'No answer could be read from this photo. Take a clearer photo of the whole page, in good light.'); if (remaining) updateRemaining(remaining); return; }
    if (j.question && !question) question = j.question;
    if (j.note) notes.push(of > 1 ? `Page ${i + 1}: ${j.note}` : j.note);
    // Pages usually continue the same paragraph; the student fixes paragraph breaks while checking.
    answer = !answer ? j.answer : (/[.!?"”]$/.test(answer.trim()) ? answer.trim() + '\n\n' + j.answer : answer.trim() + ' ' + j.answer);
  }
  setBusy(false);
  if (remaining) updateRemaining(remaining);
  fillText(answer, question, 'handwriting');
  $('readMsg').textContent = 'Done. Check the text against your paper' + (of > 1 ? ', including the paragraph breaks where pages join,' : '') + ' and fix any reading mistakes, then press ' + TASKS[task].btn + '.';
  if (notes.length) $('statusMsg').textContent = notes.join(' ');
}

async function onChart(list) {
  const f = (list || [])[0];
  showError('');
  if (!f) return;
  try {
    const p = await prepImage(f);
    chart = { type: p.media_type, data: p.data, url: p.url };
    if (chart.data.length > 1_250_000) { chart = null; showError('This chart picture is too large. Take a closer photo or a screenshot.'); return; }
    $('chartThumb').innerHTML = `<img src="${p.url}" alt="Your chart"> <button type="button" class="btn small" id="btnChartRemove">Remove chart</button>`;
    $('btnChartRemove').addEventListener('click', () => { chart = null; $('chartThumb').innerHTML = ''; try { $('chartInput').value = ''; } catch (e) {} });
    $('materialText').classList.remove('invalid');
  } catch (e) { showError(e.message === 'small' ? 'This chart picture is too small to read.' : 'This picture could not be opened. Save it as JPG or PNG and try again.'); }
}

// ─── original WritSpeak Listening practice library ────────────────────────────
let LISTEN_TESTS = [], listenLoaded = false;
async function loadListeningTests() {
  if (listenLoaded) return;
  const j = await api('/api/listening/tests');
  if (!j || j.ok === false || !Array.isArray(j.tests)) { console.warn('Listening list failed', j); $('libList').innerHTML = '<p class="status">Listening tests could not be loaded. ' + esc(j.message || 'Refresh the page.') + '</p>'; return; }
  LISTEN_TESTS.splice(0, LISTEN_TESTS.length, ...(j.tests || [])); listenLoaded = true; renderLibList();
}
function renderLibList() {
  if (!listenLoaded) { $('libList').innerHTML = '<p class="status">Loading Listening tests…</p>'; loadListeningTests(); return; }
  $('libList').innerHTML = LISTEN_TESTS.map((t, i) => { const lock = !!t.locked; return `<button type="button" class="lib-item${lock ? ' locked' : ''}" data-lib="${esc(t.id)}" aria-pressed="${libCurrent?.id === t.id}"><strong>${esc(t.title)}</strong><span>${esc(t.mins)} · ${esc(t.level)} · ${t.questions} questions${lock ? ' · Locked: Weekly plan' : i === 0 ? ' · Free' : ''}</span></button>`; }).join('');
  $('libList').querySelectorAll('.lib-item').forEach(b => b.addEventListener('click', () => openLibTest(b.dataset.lib)));
}
async function openLibTest(id) {
  const meta = LISTEN_TESTS.find(t => t.id === id);
  if (!meta) return;
  if (meta.locked) { const cur = ME && ME.plan && ME.plan.name ? ME.plan.name : 'Free'; $('libTest').innerHTML = `<div class="lock-msg" role="status"><h3>This practice test is part of the Weekly plan</h3><p>Your ${esc(cur)} plan does not include this Listening test. Do you want to upgrade?</p><p><a class="btn primary" href="#plans" data-upgrade>Upgrade and pay</a> <a class="btn" href="/plans">See pricing</a></p></div>`; $('libTest').hidden = false; $('resultPanel').hidden = true; $('actionRow').hidden = true; showError(''); $('statusMsg').textContent = 'That test is locked on your plan. Upgrade to open it.'; return; }
  const j = await api('/api/listening/test?id=' + encodeURIComponent(id));
  if (!j.ok) { $('statusMsg').textContent = j.message || 'This test is unavailable.'; return; }
  libCurrent = j.test;
  const questions = libCurrent.q || [];
  let h = `<h3>${esc(libCurrent.title)}</h3><audio id="libAudio" controls preload="none" src="${esc(libCurrent.audio)}"></audio>`;
  h += `<p class="credit">${esc(libCurrent.credit || 'Original WritSpeak listening practice.')}</p>`;
  questions.forEach((q, i) => {
    const n = i + 1, choice = !!q.o, previousChoice = i > 0 && !!questions[i - 1].o;
    if (i === 0 || choice !== previousChoice) {
      let end = i + 1;
      while (end < questions.length && !!questions[end].o === choice) end++;
      const instruction = choice ? 'Choose the correct letter, A, B or C.' : 'Complete the notes. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.';
      h += `<p class="instr">Questions ${n}–${end}: ${instruction}</p>`;
    }
    if (!choice) h += `<div class="q"><span class="num">${n}</span><div class="body"><p id="lq-t${n}">${esc(q.t)}</p><input type="text" id="lq-${n}" aria-labelledby="lq-t${n}" autocomplete="off" autocapitalize="off" spellcheck="false"></div></div>`;
    else h += `<div class="q" role="radiogroup" aria-labelledby="lq-t${n}"><span class="num">${n}</span><div class="body"><p id="lq-t${n}">${esc(q.t)}</p>` + q.o.map((o,j) => { const L='ABC'[j]; return `<label class="opt-label"><input type="radio" name="lq-${n}" value="${L}"> <span><strong>${L}</strong> ${esc(o)}</span></label>`; }).join('') + `</div></div>`;
  });
  $('libTest').innerHTML = h; $('libTest').hidden = false; $('resultPanel').hidden = true; showError(''); $('libAudio').addEventListener('error', () => showError('The recording could not be loaded. Check your connection and press Play again.')); $('actionRow').hidden = false; $('btnSample').hidden = true; $('statusMsg').textContent = 'Press Play, answer while you listen, then press Mark my answers.';
  try { $('libTest').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } catch (e) {} // the opened test, with its player, starts at the top of the view
}
function libAnswers(t) { return t.q.map((q, i) => { const n = i + 1; if (!q.o) return (($('lq-' + n)?.value || '').trim()); const c = document.querySelector(`input[name="lq-${n}"]:checked`); return c ? c.value : ''; }); }
function setListenMode(m) { listenMode = m; $('modeLib').setAttribute('aria-pressed', String(m === 'lib')); $('modeMock').setAttribute('aria-pressed', String(m === 'mock')); if (m === 'mock') renderMockListening(); applyBlocks(); }

// ─── Formal mock entry points live in the dedicated Mock Tests dashboard tab ─────────────────────────────
// Listening mock: three parts, each recording plays once; answers are marked against the key with no AI.
const mlSec = d => { const m = /(\d+):(\d+):([\d.]+)/.exec(d || ''); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0; };
let mlCur = null, mlPart = 0, mlAns = {}, mlAudio = null, mlPlayed = false;
function stopMlAudio() { if (mlAudio) { try { mlAudio.pause(); } catch (e) {} mlAudio = null; } }
async function renderMockListening() {
  if (mlCur) return;
  $('mlList').hidden = false; $('mlRun').hidden = true; $('mlList').innerHTML = '<p class="status">Loading Listening mock tests…</p>';
  const j = await api('/api/listening/mock-tests');
  if (!j || j.ok === false || !Array.isArray(j.tests)) { console.warn('Listening mock list failed', j); $('mlList').innerHTML = '<p class="status">The Listening mock tests could not be loaded. ' + esc(j.message || 'Refresh the page.') + '</p>'; return; }
  const L = j.tests || [];
  $('mlList').innerHTML = L.length ? L.map(t => `<button type="button" class="lib-item${t.locked ? ' locked' : ''}" data-ml="${esc(t.id)}"><strong>${esc(t.title)}</strong><span>3 parts · ${t.total} questions${t.locked ? ' · Locked: Weekly plan' : ' · Original WritSpeak material'}</span></button>`).join('') : '<p class="status">No Listening mock tests are available.</p>';
}
function mlCollect() { if (!mlCur) return; mlCur.parts[mlPart].groups.forEach(g => g.qs.forEach(q => { mlAns[q.n] = q.o ? ((document.querySelector(`input[name="mlr-${q.n}"]:checked`) || {}).value || '') : (($('mlq-' + q.n) || {}).value || '').trim(); })); }
function renderMlPart() {
  stopMlAudio(); mlPlayed = false;
  const t = mlCur, p = t.parts[mlPart], last = mlPart === t.parts.length - 1, fq = p.groups[0].qs[0].n, lq = p.groups.at(-1).qs.at(-1).n;
  let h = `<div class="test-head"><span>Part ${p.no} of ${t.parts.length}: ${esc(p.title)}</span><span class="tag-part">Questions ${fq}–${lq}</span></div><div class="test-bar" aria-hidden="true"><progress id="mlBar" max="100" value="0"></progress></div>`;
  h += `<div class="row mt"><button type="button" class="btn primary" id="mlPlay">Play Part ${p.no} (one time only)</button><span class="status" id="mlState" aria-live="polite">Read the questions, then press Play.</span></div>`;
  p.groups.forEach(g => {
    h += `<div class="lib-test ml-group">${g.head ? '<h3>' + esc(g.head) + '</h3>' : ''}<p class="instr">Questions ${g.first}–${g.first + g.qs.length - 1}. ${esc(g.instr)}</p>`;
    g.qs.forEach(q => {
      const v = mlAns[q.n] || '';
      if (!q.o) h += `<div class="q"><span class="num">${q.n}</span><div class="body"><p id="mlt-${q.n}">${esc(q.t)}</p><input type="text" id="mlq-${q.n}" aria-labelledby="mlt-${q.n}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(v)}"></div></div>`;
      else h += `<div class="q" role="radiogroup" aria-labelledby="mlt-${q.n}"><span class="num">${q.n}</span><div class="body"><p id="mlt-${q.n}">${esc(q.t)}</p>` + q.o.map((o, j) => { const L = 'ABC'[j]; return `<label class="opt-label"><input type="radio" name="mlr-${q.n}" value="${L}"${v === L ? ' checked' : ''}> <span><strong>${L}</strong> ${esc(o)}</span></label>`; }).join('') + '</div></div>';
    });
    h += '</div>';
  });
  h += `<div class="row mt"><button type="button" class="btn" id="mlNext" disabled>${last ? 'Finish and mark my answers' : 'Next part'}</button><button type="button" class="btn ghost small" id="mlQuit">Leave this test</button></div><p class="help" id="mlNote">${last ? 'You can finish after the recording ends.' : 'The next part opens after this recording ends.'}</p>`;
  $('mlRun').innerHTML = h; $('mlRun').hidden = false; $('mlList').hidden = true;
}
function mlPlay() {
  if (mlPlayed) return; mlPlayed = true; const p = mlCur.parts[mlPart], b = $('mlPlay'), st = $('mlState');
  b.disabled = true; st.textContent = 'Playing. Answer while you listen.';
  const a = mlAudio = new Audio(p.audio);
  a.addEventListener('timeupdate', () => { if (a.duration) $('mlBar').value = Math.round(100 * a.currentTime / a.duration); });
  a.addEventListener('ended', () => { st.textContent = 'The recording has finished. Check your answers.'; $('mlNext').disabled = false; $('mlBar').value = 100; });
  a.addEventListener('error', () => { mlPlayed = false; b.disabled = false; b.textContent = 'Try the recording again'; st.textContent = 'The recording could not be loaded. Check your connection and try again.'; $('mlNext').disabled = true; });
  a.play().catch(() => { mlPlayed = false; b.disabled = false; st.textContent = 'Your browser blocked the sound. Press the button again.'; });
}
async function mlMark() {
  mlCollect(); stopMlAudio();
  const t = mlCur, all = t.parts.flatMap(p => p.groups.flatMap(g => g.qs));
  if (!all.some(q => (mlAns[q.n] || '').trim())) { $('mlRun').innerHTML = '<div class="empty"><h3>No score yet</h3><p>You did not answer any question, so there is nothing to mark.</p><p><button type="button" class="btn" id="mlAgain">Try another mock test</button></p></div>'; return; }
  $('mlRun').innerHTML = '<p class="status">Marking your answers securely…</p>';
  const j = await api('/api/listening/mock-mark', { json: { id: t.id, answers: mlAns }, requestId: newId() });
  if (!j.ok) { $('mlRun').innerHTML = '<p class="status">' + esc(j.message || 'Your answers could not be marked. Please try again.') + '</p><button type="button" class="btn" id="mlAgain">Return to Listening mocks</button>'; return; }
  const rows = j.rows || [], okBy = new Map(rows.map(r => [r.n, r.ok]));
  let h = `<h3>Your score: ${j.raw} / ${j.total}</h3><p class="help">Marked securely against the answer key. Spelling must match. A band needs a full 40-question test, so this short mock gives a raw score only.</p><ul class="ml-parts">` + t.parts.map(p => { const qs = p.groups.flatMap(x => x.qs); return `<li>Part ${p.no}: ${qs.filter(q => okBy.get(q.n)).length} / ${qs.length}</li>`; }).join('') + '</ul>';
  h += '<div class="tbl" tabindex="0" role="region" aria-label="Your answers marked"><table><thead><tr><th>Q</th><th>Your answer</th><th>Result</th><th>Key</th><th>Where you hear it</th></tr></thead><tbody>';
  rows.forEach(q => { h += `<tr><td>${q.n}</td><td>${esc(q.given || '—')}</td><td class="${q.ok ? 'ok-cell' : 'bad-cell'}">${q.ok ? 'Correct' : 'Wrong'}</td><td>${esc(q.key)}</td><td>“…${esc(q.ev)}…”</td></tr>`; });
  h += '</tbody></table></div>';
  h += '<details class="fold mt"><summary>Listen again and read the transcript</summary>' + j.parts.map(p => `<h4>Part ${p.no}: ${esc(p.title)}</h4><audio controls preload="none" src="${esc(t.parts.find(x => x.no === p.no).audio)}"></audio><p class="ml-script" translate="no">${p.transcript.map(l => esc(l[1])).join('<br>')}</p>`).join('') + '</details>';
  h += `<p class="credit">${esc(j.label)}</p><div class="row mt"><button type="button" class="btn primary" id="mlAgain">Choose another mock test</button></div>`;
  $('mlRun').innerHTML = h;
}
$('mlList').addEventListener('click', async ev => { const b = ev.target.closest('[data-ml]'); if (!b) return; if (b.classList.contains('locked')) { $('mlList').insertAdjacentHTML('beforeend', '<p class="status">This Listening mock is included with the Weekly plan and above.</p>'); return; } const j = await api('/api/listening/mock-test?id=' + encodeURIComponent(b.dataset.ml)); if (!j.ok) { $('mlList').insertAdjacentHTML('beforeend', '<p class="status">' + esc(j.message || 'This test is unavailable.') + '</p>'); return; } mlCur = j.test; mlPart = 0; mlAns = {}; renderMlPart(); });
$('mlRun').addEventListener('click', ev => {
  const id = ev.target.id;
  if (id === 'mlPlay') mlPlay();
  else if (id === 'mlNext') { mlCollect(); if (mlPart < mlCur.parts.length - 1) { mlPart++; renderMlPart(); $('mockListening').scrollIntoView({ block: 'start' }); } else mlMark(); }
  else if (id === 'mlQuit') { if (confirm('Leave this mock test? Your answers will be lost.')) { stopMlAudio(); mlCur = null; renderMockListening(); } }
  else if (id === 'mlAgain') { stopMlAudio(); mlCur = null; renderMockListening(); }
});
$('mwStart').addEventListener('click', () => { location.hash = '#mocks'; });
// ─── speaking recorder ────────────────────────────────────────────────────────
let QUESTIONS = [], part = 1, currentQ = null;
let stream = null, recorder = null, chunks = [], startedAt = 0, tick = null, wavB64 = null, prepTick = null, recordingBlob = null, playbackUrl = null;
const AIM = { 1: 'Aim for 20–40 seconds.', 2: 'Aim for 1–2 minutes.', 3: 'Aim for 30–60 seconds.' };
const fmtTime = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
function setSpeakMode(m) { speakMode = m; if (task === 'speaking') rememberStart(m === 'test' ? '?task=speaking&mode=test' : '?task=speaking', true); $('modeRec').setAttribute('aria-pressed', String(m === 'rec')); $('modeTest').setAttribute('aria-pressed', String(m === 'test')); $('modeText').setAttribute('aria-pressed', String(m === 'text')); if (m !== 'rec') resetRecording(); applyBlocks(); }
function renderQSelect() {
  const list = QUESTIONS.filter(q => q.part === part);
  if (part === 1) {
    const groups = [...new Set(list.map(q => q.topicLabel || q.label))];
    $('qSelect').innerHTML = groups.map(g => `<optgroup label="${esc(g)}">` + list.filter(q => (q.topicLabel || q.label) === g).map(q => `<option value="${q.id}">${esc(q.text.length > 70 ? q.text.slice(0, 67) + '…' : q.text)}</option>`).join('') + '</optgroup>').join('');
  } else $('qSelect').innerHTML = list.map(q => `<option value="${q.id}">${esc(part === 3 ? q.label + ': ' + (q.text.length > 55 ? q.text.slice(0, 52) + '…' : q.text) : q.label)}</option>`).join('');
  pickQ(list[0] && list[0].id);
}
// Examiner voice: every Speaking question is recorded once (Libby, 10% slower) and stored as /audio/examiner/<id>.mp3. Nothing is generated live, so it costs nothing per use.
const hearBtn = id => '<p><button type="button" class="btn ex-hear" data-ex="' + esc(id) + '">Hear the question</button></p>';
let exAudio = null, exClip = null;
document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('.ex-hear'); if (!b) return;
  try {
    if (exAudio) exAudio.pause();
    if (exClip) { exClip.stop(); exClip = null; }
    b.disabled = true;
    const done = () => { b.disabled = false; };
    const id = encodeURIComponent(b.dataset.ex);
    const playMp3 = () => {
      const a = exAudio = new Audio('/audio/examiner/' + id + '.mp3');
      a.addEventListener('ended', done); a.addEventListener('error', () => { done(); b.hidden = true; });
      a.play().catch(done);
    };
    // When the examiner avatar is on screen, play the finished talking clip (same voice, lips move); otherwise just the recording.
    const av = window.WSAvatar && window.WSAvatar.instance;
    exClip = av && av.speak ? av.speak('/avatar/talk/' + id + '.mp4', { onend: done, onfail: playMp3 }) : null;
    if (!exClip) playMp3();
  } catch (e) { b.disabled = false; }
});
function pickQ(id) {
  currentQ = QUESTIONS.find(q => q.id === id) || null;
  if (!currentQ) { $('qBox').textContent = 'Questions could not be loaded. Refresh the page.'; return; }
  markSpeakingSeen(currentQ.id);
  let h = '<p>' + esc(currentQ.text) + '</p>' + hearBtn(currentQ.id);
  if (currentQ.bullets) h += '<p class="help">You should say:</p><ul>' + currentQ.bullets.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>';
  $('qBox').innerHTML = h;
  $('prepRow').hidden = currentQ.part !== 2; $('prepTimer').textContent = '';
  resetRecording();
  try { renderSpCards(); } catch (e) {}
}
function stopTracks() { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } }
function resetRecording() {
  if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; try { recorder.stop(); } catch (e) {} }
  stopTracks(); clearInterval(tick); wavB64 = null; chunks = []; recordingBlob = null;
  if (playbackUrl) { URL.revokeObjectURL(playbackUrl); playbackUrl = null; }
  $('playback').removeAttribute('src'); $('btnDownloadRecording').hidden = true;
  $('timer').textContent = '0:00'; $('recState').textContent = 'Not recording';
  $('btnRec').textContent = 'Start recording'; $('btnRec').disabled = false;
  $('reviewBlock').hidden = true;
}
function pickMime() {
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const t of types) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}
async function startRecording() {
  stopAlarm();
  showError(''); $('micNotice').hidden = true; $('resultPanel').hidden = true;
  if (!currentQ) return;
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    $('micNotice').textContent = 'This browser cannot record audio. Open the page in an up-to-date Chrome, Edge or Safari, or paste a transcript instead.'; $('micNotice').hidden = false; return;
  }
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (e) {
    $('micNotice').textContent = e && e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow the microphone for this website in your browser settings, then press Start recording again.'
      : e && e.name === 'NotFoundError' ? 'No microphone was found. Connect a microphone or use your phone.' : 'The microphone could not be started. Close other apps that use it and try again.';
    $('micNotice').hidden = false; return;
  }
  const mime = pickMime();
  try { recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
  catch (e) { stopTracks(); $('micNotice').textContent = 'Recording is not supported in this browser.'; $('micNotice').hidden = false; return; }
  chunks = [];
  recorder.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  recorder.onstop = onStopped;
  recorder.start(1000);
  startedAt = Date.now();
  $('btnRec').textContent = 'Stop recording';
  $('recState').innerHTML = '<span class="dot" aria-hidden="true"></span>Recording… ' + esc(AIM[currentQ.part] || '');
  $('timer').textContent = '0:00 / ' + fmtTime(currentQ.maxSec);
  tick = setInterval(() => { const s = (Date.now() - startedAt) / 1000; $('timer').textContent = fmtTime(s) + ' / ' + fmtTime(currentQ.maxSec); if (s >= currentQ.maxSec) stopRecording(); }, 250);
}
function stopRecording() { clearInterval(tick); if (recorder && recorder.state !== 'inactive') recorder.stop(); }
async function onStopped() {
  stopTracks();
  $('btnRec').textContent = 'Start recording'; $('recState').textContent = 'Preparing your recording…';
  const blob = recordingBlob = new Blob(chunks, { type: (recorder && recorder.mimeType) || 'audio/webm' });
  if (playbackUrl) URL.revokeObjectURL(playbackUrl);
  playbackUrl = URL.createObjectURL(blob); $('playback').src = playbackUrl;
  $('btnDownloadRecording').hidden = !blob.size;
  try {
    const wav = await toWav16k(blob);
    wavB64 = wav.b64;
    if (wav.seconds < 8) { $('recState').textContent = 'Too short (' + fmtTime(wav.seconds) + '). Speak for at least 10 seconds.'; $('reviewBlock').hidden = true; wavB64 = null; return; }
    $('recState').textContent = 'Recorded ' + fmtTime(wav.seconds) + '. Listen back, then get feedback or record again.';
    speakReq = null; renderCostNote();
    $('reviewBlock').hidden = false;
  } catch (e) { $('recState').textContent = 'Not recording'; showError('Your recording could not be processed in this browser. Try again, or use Chrome.'); }
}
$('btnDownloadRecording').addEventListener('click', () => {
  if (!recordingBlob || !recordingBlob.size) return;
  const a = document.createElement('a'); a.href = playbackUrl || URL.createObjectURL(recordingBlob);
  const ext = /mp4/i.test(recordingBlob.type) ? 'm4a' : /ogg/i.test(recordingBlob.type) ? 'ogg' : 'webm';
  a.download = 'writspeak-speaking-' + new Date().toISOString().slice(0, 10) + '.' + ext;
  document.body.appendChild(a); a.click(); a.remove();
});
// Decode the recording, mix to mono, resample to 16 kHz and encode as 16-bit WAV (what the speech-to-text expects).
async function toWav16k(blob) {
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  const decoded = await new Promise((res, rej) => ac.decodeAudioData(buf.slice(0), res, rej));
  if (ac.close) ac.close();
  const rate = 16000, len = Math.ceil(decoded.duration * rate);
  const off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, len, rate);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start(0);
  const data = (await off.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + data.length * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) { const v = Math.max(-1, Math.min(1, data[i])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return { b64: b64FromBytes(new Uint8Array(out.buffer)), seconds: data.length / rate };
}
// Pronunciation check (scores out of 100, never a band). Everything from the server is escaped.
function renderPronunciation(p) {
  if (!p || !p.assessed) return `<div class="notice mt">${esc((p && p.message) || 'Pronunciation was not assessed this time.')}</div>`;
  const sc = p.scores || {}, tile = (label, v) => v == null ? '' : `<div class="ftile"><span class="lbl">${label}</span><strong>${esc(v)} <span class="of">/ 100</span></strong></div>`;
  let h = `<details class="fold" open><summary>Pronunciation <span class="sum">scores out of 100</span></summary><div class="fbody"><div class="ftiles">${tile('Overall sounds', sc.overall)}${tile('Accuracy', sc.accuracy)}${tile('Fluency', sc.fluency)}${tile('Intonation', sc.intonation)}</div>`;
  if ((p.problemWords || []).length) h += `<span class="lbl">Words to practise</span><ul>${p.problemWords.map(w => `<li><strong translate="no">${esc(w.word)}</strong>${w.heardAs ? ` · heard as <span translate="no">${esc(w.heardAs)}</span>` : ''}${(w.weakSounds || []).length ? ` · weak sound: <span translate="no">${w.weakSounds.map(esc).join(' ')}</span>` : ''}</li>`).join('')}</ul>`;
  if ((p.weakestSounds || []).length) h += `<span class="lbl">Sounds to work on</span><ul>${p.weakestSounds.map(w => `<li><span translate="no">${esc(w.sound)}</span>${(w.examples || []).length ? ` · for example ${w.examples.map(e => '“' + esc(e) + '”').join(', ')}` : ''}</li>`).join('')}</ul>`;
  return h + `<p class="trust">${esc(p.note || '')}</p></div></details>`;
}
window.WSApi = api; // for avatar.js
// Mock Tests: open the normal checkers with the mock's own question.
function mockWriting(q, ticket) {
  window.WSMockTicket = ticket || '';
  try { if (window.WSStudio && window.WSStudio.close) window.WSStudio.close(); } catch (e) {}
  document.body.dataset.skill = 'writing'; setTask('writing_task2');
  const el = $('questionText'); if (el) { el.value = q; el.dispatchEvent(new Event('input', { bubbles: true })); }
  if (window.WSTabs) window.WSTabs.setTab('practice', true, 'writing', false); else location.hash = '#practice'; // the workspace itself, not the card list
  setTimeout(() => { const t = $('inputText'); if (t) t.focus(); }, 350);
}
async function mockSpeaking(id, ticket) {
  window.WSMockTicket = ticket || '';
  const bank = await api('/api/bank', { headers: { 'x-mock-ticket': window.WSMockTicket } });
  if (!bank || !Array.isArray(bank.tests) || !bank.tests.length) { showError((bank && bank.message) || 'The Speaking part of this Mock could not be opened. Please return to Mock Tests and try again.'); return; }
  BANK = bank;
  const selected = bank.tests.find(t => Array.isArray(t.items) && t.items.includes(id));
  mockPreferredTestId = selected ? selected.id : bank.tests[0].id;
  try { if (window.WSStudio && window.WSStudio.close) window.WSStudio.close(); } catch (e) {}
  document.body.dataset.skill = 'speaking'; setTask('speaking'); try { setSpeakMode('test'); } catch (e) {} // use the ticket-authorised timed interview
  if (window.WSTabs) window.WSTabs.setTab('practice', true, 'speaking', false); else location.hash = '#practice';
}
window.WSApp = { clearAccessCodeForStudent, meError: () => meError, LISTEN_TESTS, loadListeningTests, mockWriting, mockSpeaking, listeningAvailable: () => LISTEN_TESTS.filter(t => !t.locked).length, removeCode, api, store, loadMe, fmtDate, openCode, me: () => ME, go: k => goPractice(k),
  // Skill pages (skills.js): read-only views of what the page already loaded, and openers that reuse the existing workspaces.
  bank: () => BANK, questions: () => QUESTIONS, history: () => loadHist(), listenTests: () => LISTEN_TESTS,
  openWriting, openSpeakingPart, openSpeakingTest, openListening, openListeningSet };
// Open the existing Writing workspace on one task (the card's Start button).
function openWriting(id) {
  const w = bankQuestions().find(x => x.id === id); if (!w) return;
  goPractice('writing');
  const key = w.task === 'writing_task2' ? 't2' : (w.testType === 'general' ? 't1g' : 't1a');
  const tab = document.querySelector('#wTabs .ui-tab[data-k="' + key + '"]'); if (tab) tab.click();
  wPick(id);
}
// Open the Speaking workspace on one part (and one topic when given). Practice only: no credit is used until an answer is checked.
function openSpeakingPart(n, topic) {
  goPractice('speaking'); setSpeakMode('rec');
  const b = document.querySelector('.part[data-part="' + n + '"]'); if (b) b.click();
  const q = QUESTIONS.find(x => x.part === n && (!topic || x.topic === topic)) || QUESTIONS.find(x => x.part === n);
  if (q) { $('qSelect').value = q.id; pickQ(q.id); renderSpCards(); }
}
// Open the full Speaking test screen with a test preselected (the server still decides whether the plan allows it).
function openSpeakingTest(id) {
  goPractice('speaking'); setSpeakMode('test');
  const sel = $('testSelect'); if (sel && [...sel.options].some(o => o.value === id)) sel.value = id;
}
// A 3-part Listening set (15 questions, each recording plays once, marked against the key with no AI and no credit).
async function openListeningSet(id) {
  goPractice('listening'); setListenMode('mock');
  for (let i = 0; i < 20; i++) { const b = document.querySelector('#mlList [data-ml="' + id + '"]'); if (b) { b.click(); return; } await new Promise(r => setTimeout(r, 150)); }
}
async function openListening(id) {
  goPractice('listening'); setListenMode('lib');
  await loadListeningTests(); openLibTest(id);
}
loadListeningTests().catch(() => {}); // keep the safe Listening question metadata available to the four-skill Mock // for account.js (app.js is wrapped in a function, so its names are private)
let pronOn = false;
window.WSVoiceMe = api('/api/voice/me'); // one request shared with avatar.js (it used to be fetched twice)
window.WSVoiceMe.then(j => {
  pronOn = !!(j && j.pronEnabled);
  const el = $('qPron'), u = j && j.allowance && j.allowance.pron;
  if (el) {
    el.hidden = !pronOn || !u || !(u.limit > 0);
    if (!el.hidden && window.WSUI) window.WSUI.quota(el, Math.max(0, u.limit - u.used), u.limit);
  }
}).catch(() => {});

// Speaking upgrade (voice phase 2): fluency numbers, "said fluently" version, practice.
function renderFluency(f) {
  const m = f.metrics || {};
  const level = (v, ok, warn) => v == null ? '' : v <= ok ? ' good' : v <= warn ? '' : ' warn';
  const types = Object.entries(m.fillerTypes || {}).map(([k, v]) => `“${esc(k)}” ×${v}`).join(', ');
  const tile = (label, value, note, cls = '') => `<div class="ftile${cls}"><span class="lbl">${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
  let h = `<details class="fold" open><summary>Your fluency (measured from your recording)</summary><div class="fluency-detail">`;
  h += `<div class="ftiles">`;
  h += tile('Speaking speed', m.wordsPerMinute != null ? m.wordsPerMinute + ' words/min' : '—', 'Comfortable: about 110–160');
  h += tile('Fillers (um, uh, like…)', m.fillers ?? 0, `${m.fillersPer100 ?? 0} per 100 words${types ? ' · ' + types : ''}`, level(m.fillersPer100, 4, 8));
  h += tile('Long pauses (2 s+)', m.longPauses == null ? 'not measured' : m.longPauses, '');
  h += tile('Repeated words', m.repetitions ?? 0, (m.repetitionExamples || []).map(x => '“' + esc(x) + '”').join(', '));
  h += `</div><p class="trust">These numbers are measured by software and used as evidence for your Fluency score. Pronunciation is not scored here.</p>`;
  if (f.fluent) h += `<span class="lbl">Your answer, said fluently</span><div class="transcript" translate="no">${esc(f.fluent)}</div><p class="trust">Same ideas as yours, without fillers and with the grammar fixed. Read it aloud, then record your answer again.</p>`;
  if (f.practice && f.practice.length) h += `<span class="lbl">Practice from your answer</span><ol>${f.practice.map(p => `<li><strong>${esc(p.instruction)}</strong><ul>${p.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></li>`).join('')}</ol>`;
  return h + `</div></details>`;
}

let speakReq = null; // one request id per recording, so a double tap is never charged twice
async function sendRecording() {
  if (!wavB64 || !currentQ || busyNow) return;
  showError(''); setBusy(true, pronOn ? 'Uploading your recording, then making the transcript, feedback and pronunciation check. This takes about 20–40 seconds, and up to a minute if the pronunciation coach is warming up…' : 'Uploading your recording, then making the transcript and feedback. This takes about 20–40 seconds…');
  if (!speakReq) speakReq = newId();
  const j = await api('/api/speaking?q=' + encodeURIComponent(currentQ.id), { body: wavB64, headers: { 'content-type': 'text/plain' }, requestId: speakReq });
  setBusy(false);
  if (!j.ok) {
    if (j.code !== 'duplicate') speakReq = null; // a failed attempt may be retried with a fresh id
    showError((j.message || 'The check did not finish. Please try again in a minute.') + (j.charged === false && !/not charged/.test(j.message || '') ? ' You were not charged.' : ''));
    if (j.transcript) { resetResult(); showError(j.message); $('scorePanel').hidden = true; $('report').innerHTML = ''; $('heardBlock').hidden = false; $('transcript').textContent = j.transcript; }
    if (j.code === 'plan_limit') offerPlans();
    return;
  }
  speakReq = null;
  resetResult();
  window.__pronShown = !!(j.pronunciation && j.pronunciation.assessed);
  renderScores(j.bands, TASKS.speaking.crit, 'Overall (approx.)');
  showAgreement(j, true);
  $('heardBlock').hidden = false; $('transcript').innerHTML = markedText(j.transcript, j.feedback.priorities);
  const ra = $('resultAudio'); ra.src = $('playback').src; ra.hidden = !ra.getAttribute('src');
  const flags = j.feedback.flags || [];
  if (flags.length) { $('flags').textContent = 'Possibly misheard by the automatic transcript, so not counted against you: ' + flags.join('; '); $('flags').hidden = false; }
  const sTags = j.feedback.priorities.map(p => p.tag);
  $('report').innerHTML = renderAssessment(j.feedback, { speaking: true, recurring: recurringLine(sTags), model: currentQ ? currentQ.id : null, extra: frameworkCard(j.feedback, [currentQ ? currentQ.part : 1]) });
  if (j.fluency) $('report').insertAdjacentHTML('afterbegin', renderFluency(j.fluency));
  if (j.pronunciation) { $('report').insertAdjacentHTML('afterbegin', renderPronunciation(j.pronunciation)); if (j.pronunciation.assessed && window.WSRec) window.WSRec.markWords(j.pronunciation.problemWords); }
  window.__pronShown = false;
  lastFixes = j.feedback.priorities; addHist('speaking', j.feedback.priorities);
  lastText = 'Transcript:\n' + j.transcript + '\n\n' + feedbackText(j.feedback) + (j.fluency && j.fluency.fluent ? '\n\nYour answer, said fluently:\n' + j.fluency.fluent : '');
  lastResult = { task: 'speaking_audio', testType: '', question: j.question, text: j.transcript, scores: j.bands };
  $('stamp').textContent = stampText(j, `recording ${fmtTime(j.seconds)}, ${j.words} words, automatic transcript`);
  $('statusMsg').textContent = 'Done.';
  updateRemaining(j.remaining); loadMe();
}

// ─── Writing question bank ────────────────────────────────────────────────────
let BANK = null, bankId = null, mockPreferredTestId = '';
const bankLoaded = () => !!(BANK && Array.isArray(BANK.writing));
const bankQuestions = () => bankLoaded() ? BANK.writing : [];
function renderBankSelect() {
  if (!BANK) { $('bankSelect').innerHTML = '<option value="">Loading questions…</option>'; return; }
  if (!bankLoaded()) { $('bankSelect').innerHTML = '<option value="">Questions unavailable. Refresh the page.</option>'; bankId = null; return; }
  const tt = $('testType').value;
  const list = bankQuestions().filter(w => w.task === task && (task === 'writing_task2' || w.testType === tt));
  const topics = [...new Set(list.map(w => w.topic))];
  $('bankSelect').innerHTML = '<option value="">My own question (paste it below)</option>' + topics.map(tp => `<optgroup label="${esc(tp)}">` +
    list.filter(w => w.topic === tp).map(w => `<option value="${w.id}">${esc(w.type)}: ${esc(w.question.replace(/^(The |You )/, '$1').slice(0, 70))}…</option>`).join('') + '</optgroup>').join('');
  const cur = list.find(w => normQ(w.question) === normQ($('questionText').value));
  bankId = cur ? cur.id : null; $('bankSelect').value = bankId || '';
  try { renderWritingCards(); } catch (e) {}
}
function pickBank() {
  const w = bankQuestions().find(x => x.id === $('bankSelect').value);
  bankId = w ? w.id : null;
  if (!w) { if ($('materialVisual')) { $('materialVisual').innerHTML = ''; $('materialVisual').hidden = true; } return; }
  rememberStart('?task=' + task + (task === 'writing_task1' && w.testType === 'general' ? '&type=general' : '') + '&q=' + encodeURIComponent(w.id));
  $('questionText').value = w.question;
  $('materialText').value = w.material || '';
  const visualHtml = window.WSVisual && window.WSVisual.html ? window.WSVisual.html(w) : '';
  if ($('materialVisual')) { $('materialVisual').innerHTML = visualHtml || ''; $('materialVisual').hidden = !visualHtml; }
  if (w.material) { chart = null; $('chartThumb').innerHTML = ''; }
  clearInvalid(); showCheckPanel(''); updateCount();
  $('statusMsg').textContent = 'Question added. Write your answer below. A model answer is shown after you check yours.';
}
const bankMatch = d => bankQuestions().find(w => w.task === d.task && normQ(w.question) === normQ(d.question));
// Free overview checklist (no AI): the key features stored with a chart question, shown after the student's report is marked.
function keyFeaturesCard(w) {
  if (!w || !Array.isArray(w.keyFeatures) || !w.keyFeatures.length) return '';
  return '<section class="kf-card" aria-labelledby="kfTitle"><h3 id="kfTitle">Check your overview</h3><p>A strong overview of this chart mentions:</p><ul>' +
    w.keyFeatures.map(k => '<li>' + esc(k) + '</li>').join('') + '</ul><p class="kf-note">Tick off each one you included. If one is missing, add it to your overview and check again.</p></section>';
}

// ─── Model answers (shown only after the student's own attempt) ───────────────
async function showModel(id, btn) {
  btn.disabled = true;
  const j = await api('/api/model?id=' + encodeURIComponent(id));
  const box = btn.closest('.model-wrap').querySelector('.model-box');
  if (!j.ok) { box.innerHTML = `<p class="status">${esc(j.message || 'The model answer could not be loaded.')}</p>`; btn.disabled = false; return; }
  box.innerHTML = `<p class="help">One possible answer at about Band 7. Notice how it is organised and how ideas are developed. Do not memorise it: examiners recognise learned answers.</p><div class="model-text" translate="no">${j.model.split(/\n\n+/).map(p => '<p>' + esc(p) + '</p>').join('')}</div>`;
  btn.hidden = true;
}
const modelButton = id => `<div class="model-wrap"><button type="button" class="btn modelBtn" data-id="${esc(id)}">See a model answer</button><div class="model-box"></div></div>`;

// ─── Mistakes marked inside the answer or transcript ─────────────────────────
function markedText(text, priorities) {
  const lower = text.toLowerCase(), spans = [];
  priorities.forEach((p, k) => {
    if (!p.original) return;
    const at = lower.indexOf(p.original.toLowerCase());
    if (at < 0 || spans.some(sp => at < sp.end && at + p.original.length > sp.start)) return;
    spans.push({ start: at, end: at + p.original.length, n: k + 1, tag: TAG_NAMES[p.tag] || p.tag });
  });
  spans.sort((a, b) => a.start - b.start);
  let h = '', pos = 0;
  spans.forEach(sp => { h += esc(text.slice(pos, sp.start)) + `<mark data-n="${sp.n}" title="Fix ${sp.n}: ${esc(sp.tag)}">${esc(text.slice(sp.start, sp.end))}</mark>`; pos = sp.end; });
  return h + esc(text.slice(pos));
}

// ─── Speaking frameworks, shown only when answers are short or undeveloped ────
const FRAMEWORKS = {
  1: { name: 'Part 1: Answer + Reason + Example', steps: ['Answer the question directly.', 'Give one reason ("because…", "mainly since…").', 'Add a short example or detail from your life.'], eg: 'Yes, I do. Mainly because it helps me relax. For example, I usually go running after a busy day at university.' },
  2: { name: 'Part 2: Set the scene → Story → Feelings', steps: ['In your minute of preparation, write one key word for each bullet point.', 'Start with when and where, then tell what happened, one bullet at a time.', 'Finish with how you felt and why it mattered. Keep talking until the examiner stops you.'], eg: 'I’d like to talk about… It happened about two years ago, when… What I remember most is… Looking back, it was important because…' },
  3: { name: 'Part 3: Point + Reason + Example + Point', steps: ['Give your opinion clearly.', 'Explain the reason behind it.', 'Support it with an example (from society, your country or the news).', 'Finish by linking back to your point, or mention the other side.'], eg: 'I think governments should lead. The main reason is that… For instance, in my country… So overall, although individuals matter, governments have more power.' },
};
function frameworkCard(fb, parts) {
  const weak = fb.priorities.some(p => ['idea_development', 'response_length', 'fluency_markers'].includes(p.tag)) || /short|develop|extend/i.test(fb.limitations || '');
  if (!weak) return '';
  return '<section class="framework"><h2>A simple structure to make your answers longer</h2>' + parts.map(n => { const f = FRAMEWORKS[n];
    return `<h3>${esc(f.name)}</h3><ol>${f.steps.map(x => '<li>' + esc(x) + '</li>').join('')}</ol><p class="ex"><strong>Example:</strong> ${esc(f.eg)}</p>`; }).join('') + '</section>';
}

// ─── Mock Speaking test (timed, examiner-led, microphone only) ────────────────
// Real IELTS timing: Part 1 about 4–5 min, Part 2 = 1 min preparation + up to 2 min speaking + a brief follow-up, Part 3 about 4–5 min.
// The examiner's questions are spoken (recorded clips). Recording starts by itself after each question and the student answers aloud.
// There is NO paste-a-script step in the mock test. Each answer is transcribed in the background while the next question begins.
const MOCK_TARGET = { 1: 'about 4–5 min', 2: 'about 3–4 min', 3: 'about 4–5 min' };
let tTicket = null, tTest = null, tIdx = 0, tAnswers = [], tFail = [], tBusy = 0, tRec = null, tStart = 0, tTick = null, tPrepTick = null, tFinishReq = null;
let tAudio = null, tClock = null, tT0 = 0, tSecStart = {}, tRedo = false, tRun = 0, tPrepSkip = null, micStream = null, micOk = false, micStopMeter = null;
const groupOf = q => q.part === 4 ? 2 : q.part;
const wcOf = a => (a && a.transcript ? a.transcript.trim().split(/\s+/).filter(Boolean).length : 0);
const partName = q => q.part === 4 ? 'Part 2 follow-up' : 'Part ' + q.part;

// Microphone: opened once for the check and kept for the whole test, so the browser does not ask again for every question.
function micHelpText(e) {
  const n = e && e.name;
  if (n === 'Unsupported') return 'This browser or page cannot record audio. Use an up-to-date Chrome, Edge, Firefox or Safari, and open the secure (https) address of the site. The mock test needs the microphone, so there is no typed alternative here. You can still use “Paste a transcript” in Practice.';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Microphone access is blocked. Click the lock or camera icon beside the web address, set Microphone to Allow, then press “Check my microphone” again. On a phone, also check Settings → your browser → Microphone.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No microphone was found. Plug in a microphone or headset, or check that your device’s sound input is switched on, then press “Check my microphone” again.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'The microphone is being used by another app (for example a call or recorder). Close it, then press “Check my microphone” again.';
  return 'The microphone could not be started. Check your browser and device settings, then press “Check my microphone” again.';
}
async function openMic() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { const e = new Error('unsupported'); e.name = 'Unsupported'; throw e; }
  if (micStream && micStream.getAudioTracks().some(t => t.readyState === 'live')) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  return micStream;
}
function closeMic() { if (micStopMeter) { micStopMeter(); micStopMeter = null; } if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; } }
function meterOn(stream, onLevel) {
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return () => {};
  const ctx = new Ctx(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  const id = setInterval(() => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) { const d = (v - 128) / 128; s += d * d; } onLevel(Math.sqrt(s / buf.length)); }, 80);
  return () => { clearInterval(id); try { src.disconnect(); ctx.close(); } catch (e) {} };
}
async function runMicCheck() {
  const btn = $('btnMockMic'), st = $('micCheckState'), help = $('micHelp');
  help.hidden = true; micOk = false; $('btnTestStart').disabled = true; $('micPlayback').hidden = true; btn.disabled = true; st.textContent = 'Asking for the microphone…';
  let s; try { s = await openMic(); } catch (e) { btn.disabled = false; st.textContent = 'Microphone not available.'; help.textContent = micHelpText(e); help.hidden = false; return; }
  st.textContent = 'Say “My name is …” now. Listening for 4 seconds…';
  let peak = 0; micStopMeter = meterOn(s, l => { peak = Math.max(peak, l); window.WSWave && WSWave.push($('micMeter'), Math.min(1, l * 4)); });
  const mime = pickMime(), r = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s), ch = [];
  r.ondataavailable = ev => { if (ev.data && ev.data.size) ch.push(ev.data); };
  r.onstop = () => {
    if (micStopMeter) { micStopMeter(); micStopMeter = null; } window.WSWave && WSWave.clear($('micMeter')); btn.disabled = false; btn.textContent = 'Check again';
    if (peak < 0.02 || !ch.length) { st.textContent = 'We could not hear you.'; help.textContent = 'No sound reached the microphone. Check that the right microphone is selected in your browser, that it is not muted, and that you are close enough. Then press “Check again”.'; help.hidden = false; return; }
    micOk = true; st.textContent = 'Microphone works. We heard you. Play it back to check the sound.';
    const pb = $('micPlayback'); try { pb.src = URL.createObjectURL(new Blob(ch, { type: r.mimeType || 'audio/webm' })); pb.hidden = false; } catch (e) {}
    renderTestSetup();
  };
  r.start(); setTimeout(() => { if (r.state !== 'inactive') r.stop(); }, 4000);
}

function renderTestSetup() {
  if (!$('testSelect')) return;
  if (!BANK) { $('testSelect').innerHTML = '<option value="">Loading questions…</option>'; $('btnTestStart').disabled = true; return; }
  if (!Array.isArray(BANK.tests)) {
    $('testSelect').innerHTML = '<option value="">Speaking test questions unavailable. Refresh the page.</option>';
    $('btnTestStart').disabled = true;
    $('testStartHint').textContent = 'Speaking test questions could not be loaded. Refresh the page and try again.';
    return;
  }
  if (!BANK.tests.length) {
    $('testSelect').innerHTML = '<option value="">Full mock tests are locked on your current plan</option>';
    $('btnTestStart').disabled = true;
    $('testStartHint').textContent = 'Full Speaking mock tests are included with paid plans. You can still practise individual Speaking questions on your current plan.';
    return;
  }
  if (!$('testSelect').options.length || ![...$('testSelect').options].some(o => BANK.tests.some(t => t.id === o.value))) $('testSelect').innerHTML = BANK.tests.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('');
  { const want = mockPreferredTestId || startParams.get('test'); if (want && [...$('testSelect').options].some(o => o.value === want)) { $('testSelect').value = want; $('testSelect').dataset.pre = '1'; } } // preselect a test for a four-skill Mock ticket
  const mockTicketActive = !!window.WSMockTicket;
  const mN = ME?.plan?.mockUsesSpeaking || 0, u = mN ? ME?.usage?.speaking : ME?.usage?.mock, left = mockTicketActive ? 1 : (u ? (mN ? Math.floor(Math.max(0, u.limit - u.used) / mN) : Math.max(0, u.limit - u.used)) : null);
  $('testCost').textContent = mockTicketActive ? 'Included in your four-skill Mock. No separate Speaking credit is used.' : (left == null ? '' : left > 0 ? `A full test uses ${mN || 1} of your ${mN ? 'Speaking assessments (you can take ' + left + ' more full test' + (left === 1 ? '' : 's') + ')' : left + ' full Speaking test' + (left === 1 ? '' : 's')}, only when your result is ready. If something fails, nothing is used.` : (u.limit ? 'You have used all your full Speaking tests. You can still practise single questions.' : 'Full Speaking tests are part of Pro and Exam Sprint. You can still practise single questions.'));
  $('btnTestStart').disabled = !micOk || (left != null && left < 1);
  $('testStartHint').textContent = micOk ? '' : 'Check your microphone first. The test starts when you press the button.';
}
async function startTest() {
  showError(''); $('btnTestStart').disabled = true;
  try { await openMic(); } catch (e) { micOk = false; $('micHelp').textContent = micHelpText(e); $('micHelp').hidden = false; renderTestSetup(); return; }
  const j = await api('/api/speaking-test/start', { json: { testId: $('testSelect').value } });
  if (!j.ok) { $('btnTestStart').disabled = false; showError(j.message || 'The test could not start. Please try again.'); if (j.code === 'plan_limit') offerPlans(); return; }
  window.WSMockTicket = ''; // the signed Speaking-test ticket now carries the mock entitlement
  tTicket = j.ticket; tTest = j.test; tIdx = 0; tAnswers = new Array(j.test.items.length).fill(null); tFail = []; tBusy = 0; tFinishReq = null; tRedo = false; tSecStart = {}; tT0 = Date.now();
  $('testSetup').hidden = true; $('testRun').hidden = false; $('testDone').hidden = true; $('resultPanel').hidden = true; $('testResultNote').hidden = true;
  clearInterval(tClock); tClock = setInterval(paintClock, 500); paintClock();
  runItem(0);
}
function paintClock() {
  if (!tTest) return;
  const q = tTest.items[Math.min(tIdx, tTest.items.length - 1)], g = groupOf(q);
  $('mockElapsed').textContent = fmtTime((Date.now() - tT0) / 1000);
  $('mockSection').textContent = (tSecStart[g] ? fmtTime((Date.now() - tSecStart[g]) / 1000) : '0:00') + ' · target ' + MOCK_TARGET[g];
}
function paintHead(q) {
  const n = tTest.items.length, g = groupOf(q), inGroup = tTest.items.filter(x => groupOf(x) === g), k = inGroup.indexOf(q) + 1;
  $('testStep').textContent = q.part === 4 ? 'Part 2 · follow-up question' : `Part ${q.part} · question ${k} of ${inGroup.filter(x => x.part !== 4).length}`;
  $('testPart').textContent = 'Part ' + g;
  $('testBarFill').value = Math.round(100 * tIdx / n);
}
function stopExaminer() { if (tAudio) { try { tAudio.pause(); } catch (e) {} tAudio = null; } }
function examinerSay(id, run) { // resolves when the question has been spoken (or the clip cannot play)
  return new Promise(res => {
    let over = false; const end = () => { if (!over) { over = true; res(); } };
    try {
      const a = tAudio = new Audio('/audio/examiner/' + encodeURIComponent(id) + '.mp3');
      a.addEventListener('ended', end); a.addEventListener('error', end);
      a.play().catch(end);
      setTimeout(end, 25000); // never wait longer than 25 s for a clip
    } catch (e) { end(); }
  }).then(() => { if (run !== tRun) return; tAudio = null; });
}
async function runItem(idx) {
  const run = ++tRun; stopAlarm(); clearInterval(tTick); clearInterval(tPrepTick); stopExaminer();
  if (idx >= tTest.items.length) return showTestDone();
  tIdx = idx; const q = tTest.items[idx], g = groupOf(q);
  if (!tSecStart[g]) tSecStart[g] = Date.now();
  paintHead(q); paintClock();
  $('testDone').hidden = true; $('btnTestRec').hidden = false; $('testTimer').hidden = false; $('testPrepRow').hidden = true;
  $('testQ').innerHTML = '<p>' + esc(q.text) + '</p>' + (q.bullets ? '<p class="help">You should say:</p><ul>' + q.bullets.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '');
  $('btnTestRec').disabled = true; $('btnTestRec').textContent = 'Finish answer'; $('testTimer').textContent = '0:00 / ' + fmtTime(q.maxSec);
  $('testState').textContent = 'The examiner is asking the question…';
  await examinerSay(q.id, run); if (run !== tRun) return;
  if (q.part === 2) { await prepPhase(run); if (run !== tRun) return; }
  beginAnswer(idx, run);
}
function prepPhase(run) { // one minute to prepare for the cue card; ends by itself with a short beep
  return new Promise(res => {
    let left = 60, done = false;
    const finish = () => { if (done) return; done = true; clearInterval(tPrepTick); tPrepSkip = null; $('testPrepRow').hidden = true; $('testPrepTimer').textContent = ''; res(); };
    tPrepSkip = () => finish();
    $('testPrepRow').hidden = false; $('btnTestPrep').textContent = 'I am ready, start now';
    try { (alarm.ctx = alarm.ctx || new (window.AudioContext || window.webkitAudioContext)()).resume(); } catch (e) {}
    $('testState').textContent = 'Preparation time. Make notes if you like. Recording starts when the minute ends.';
    $('testPrepTimer').textContent = 'Preparation: 1:00';
    tPrepTick = setInterval(() => { if (run !== tRun) return finish(); left--; $('testPrepTimer').textContent = 'Preparation: ' + fmtTime(left); if (left <= 0) { beepOnce(); finish(); } }, 1000);
  });
}
async function beginAnswer(idx, run) {
  const q = tTest.items[idx];
  let s; try { s = await openMic(); } catch (e) { $('testState').textContent = 'The microphone stopped. ' + micHelpText(e); $('btnTestRec').disabled = false; $('btnTestRec').textContent = 'Try the microphone again'; $('btnTestRec').onclick = () => { $('btnTestRec').onclick = null; beginAnswer(idx, run); }; return; }
  if (run !== tRun) return;
  const mime = pickMime(), chunks = [];
  const rec = tRec = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
  rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  rec.onstop = () => onAnswerStopped(idx, run, new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
  rec.start(1000); tStart = Date.now();
  $('btnTestRec').disabled = false; $('btnTestRec').textContent = 'Finish answer'; $('btnTestRec').onclick = null;
  $('testState').innerHTML = '<span class="dot" aria-hidden="true"></span>Recording. Speak now. ' + esc(AIM[q.part === 4 ? 1 : q.part] || '');
  tTick = setInterval(() => { const sec = (Date.now() - tStart) / 1000; $('testTimer').textContent = fmtTime(sec) + ' / ' + fmtTime(q.maxSec); if (sec >= q.maxSec) stopTestRec(); }, 250);
}
function stopTestRec() { clearInterval(tTick); if (tRec && tRec.state !== 'inactive') tRec.stop(); }
function onAnswerStopped(idx, run, blob) {
  clearInterval(tTick); if (run !== tRun) return;
  tBusy++; uploadAnswer(idx, blob).finally(() => { tBusy--; if (!$('testDone').hidden) renderTestSummary(); });
  if (tRedo) { tRedo = false; showTestDone(); } else runItem(idx + 1); // the next question starts at once; transcription runs in the background
}
async function uploadAnswer(idx, blob) {
  tFail[idx] = ''; tAnswers[idx] = null;
  let wav; try { wav = await toWav16k(blob); } catch (e) { tFail[idx] = 'This recording could not be processed. Record it again.'; return; }
  const j = await api(`/api/speaking-test/answer?ticket=${encodeURIComponent(tTicket)}&i=${idx}`, { body: wav.b64, headers: { 'content-type': 'text/plain' } });
  if (!j.ok) { tFail[idx] = j.message || 'This answer could not be transcribed. Record it again.'; return; }
  tAnswers[idx] = { i: idx, transcript: j.transcript, seconds: j.seconds, sig: j.sig };
}
function showTestDone() {
  const run = ++tRun; stopAlarm(); clearInterval(tTick); clearInterval(tPrepTick); stopExaminer(); clearInterval(tClock);
  $('testDone').hidden = false; $('testQ').innerHTML = ''; $('btnTestRec').hidden = true; $('testTimer').hidden = true; $('testState').textContent = ''; $('testPrepRow').hidden = true;
  $('testStep').textContent = 'Finished'; $('testBarFill').value = 100; $('testPart').textContent = 'All parts';
  $('mockElapsed').textContent = fmtTime((Date.now() - tT0) / 1000);
  renderTestSummary();
}
function renderTestSummary() {
  const n = tTest.items.length, total = tAnswers.reduce((m, a) => m + wcOf(a), 0), p2 = tTest.items.findIndex(q => q.part === 2);
  $('testSummary').innerHTML = tTest.items.map((q, k) => {
    const a = tAnswers[k], w = wcOf(a), bad = tFail[k], wait = !a && !bad, short = a && ((q.part === 2 && w < 50) || w < 3);
    const status = wait ? 'Transcribing…' : bad ? '<strong class="bad-mark">' + esc(bad) + '</strong>' : w + ' words' + (short ? ' <strong class="bad-mark">(too short)</strong>' : '');
    return `<li><span>${esc(partName(q))} · question ${k + 1} of ${n}: ${status}</span>${wait ? '' : `<button type="button" class="btn small redoBtn" data-k="${k}">Record again</button>`}</li>`;
  }).join('');
  const missing = tAnswers.some(a => !a), short = total < 150 || (p2 >= 0 && wcOf(tAnswers[p2]) < 50);
  $('testShort').hidden = !(short && !missing && tBusy === 0);
  $('testShort').textContent = `Your answers have ${total} words in total. A result needs at least 150 words, including at least 50 in Part 2 (aim for 1–2 minutes). Record the short answers again before getting your result.`;
  $('btnTestFinish').disabled = missing || short || tBusy > 0;
  $('testWait').hidden = tBusy === 0;
  $('testFinishCost').textContent = 'This uses 1 full Speaking test. If marking fails, nothing is used.';
}
async function finishTest() {
  if (busyNow) return;
  if (tAnswers.some(a => !a)) { showError('Answer every question first.'); return; }
  if (!tFinishReq) tFinishReq = newId();
  setBusy(true, 'Marking your whole test. This takes about 30–60 seconds…'); $('btnTestFinish').disabled = true;
  const j = await api('/api/speaking-test/finish', { json: { ticket: tTicket, answers: tAnswers }, requestId: tFinishReq });
  setBusy(false); $('btnTestFinish').disabled = false;
  if (!j.ok) {
    if (j.code !== 'duplicate') tFinishReq = null;
    showError((j.message || 'The test could not be marked. Please try again.') + (j.charged === false && !/not charged/.test(j.message || '') ? ' You were not charged.' : ''));
    if (j.code === 'already_finished') resetTest();
    return;
  }
  if (!j.bands || !TASKS.speaking.crit.every(([k]) => Number.isFinite(j.bands[k]))) { // no valid assessment: never show a band
    resetResult(); $('report').innerHTML = '<div class="empty"><h3>No score yet</h3><p>The assessment did not return valid scores for this test, so no band is shown. You were not charged. Please try the test again.</p></div>'; resetTest(); return;
  }
  resetResult();
  window.__pronShown = !!(j.pronunciation && j.pronunciation.assessed);
  renderScores(j.bands, TASKS.speaking.crit, 'Overall (approx.)');
  try { document.dispatchEvent(new CustomEvent('ws:assessed', { detail: { task: 'speaking_test', question: j.test } })); } catch (e) {} // ticks the Speaking step of a Mock Test
  showAgreement(j, true);
  const labelled = tTest.items.map((q, i) => `${partName(q)} · question ${i + 1}: ${tAnswers[i].transcript}`).join('\n\n');
  $('heardBlock').hidden = false; $('resultAudio').hidden = true; $('transcript').innerHTML = markedText(labelled, j.feedback.priorities);
  const flags = j.feedback.flags || [];
  if (flags.length) { $('flags').textContent = 'Possibly misheard by the automatic transcript, so not counted against you: ' + flags.join('; '); $('flags').hidden = false; }
  const sTags = j.feedback.priorities.map(p => p.tag);
  $('report').innerHTML = renderAssessment(j.feedback, { speaking: true, recurring: recurringLine(sTags), extra: frameworkCard(j.feedback, [1, 2, 3]) });
  if (j.pronunciation) $('report').insertAdjacentHTML('afterbegin', renderPronunciation(j.pronunciation)); // 'not assessed' is shown only when the coach was on but failed
  window.__pronShown = false;
  lastFixes = j.feedback.priorities; addHist('speaking', j.feedback.priorities);
  lastText = 'FULL SPEAKING TEST: ' + j.test + '\n\n' + labelled + '\n\n' + feedbackText(j.feedback);
  lastResult = { task: 'speaking_audio', testType: '', question: tTest.items.map(q => q.text).join(' / '), text: j.transcript, scores: j.bands };
  $('stamp').textContent = stampText(j, `full test, ${fmtTime(j.seconds)}, ${j.words} words, automatic transcript`);
  updateRemaining(j.remaining); loadMe(); resetTest();
  // resetTest() puts the setup screen back above the result, which moves the page: scroll to the finished result only now, after all content and layout are in place.
  $('testResultNote').hidden = false;
  const toResult = () => { try { $('resultPanel').scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (e) {} };
  toResult(); requestAnimationFrame(toResult); setTimeout(toResult, 400);
}
function resetTest() {
  tRun++; clearInterval(tClock); clearInterval(tTick); clearInterval(tPrepTick); stopAlarm(); stopExaminer();
  if (tRec && tRec.state !== 'inactive') { tRec.onstop = null; try { tRec.stop(); } catch (e) {} }
  closeMic(); micOk = false; tTicket = null; tTest = null;
  $('testRun').hidden = true; $('testSetup').hidden = false; $('btnMockMic').textContent = 'Check my microphone'; $('micCheckState').textContent = 'Not checked yet'; $('micHelp').hidden = true; $('micPlayback').hidden = true;
  renderTestSetup();
}
function leaveTestSafely() { if (tTest && !$('testRun').hidden) resetTest(); } // used when the student switches away mid-test

// ─── 2-minute drills built from the student's own mistakes ───────────────────
let lastFixes = [];
async function runDrill(fix, host) {
  let box = host.querySelector('.drill');
  if (!box) { box = document.createElement('div'); box.className = 'drill'; host.appendChild(box); }
  box.innerHTML = '<p class="thinking">Making 5 practice items on this mistake…</p>';
  const j = await api('/api/drill', { json: { tag: fix.tag, original: fix.original || '', correction: fix.correction || '', why: fix.why || '' }, requestId: newId() });
  if (!j.ok) { box.innerHTML = `<p class="status">${esc(j.message || 'The practice could not be made. Please try again.')}</p>`; if (j.code === 'plan_limit') offerPlans(); return; }
  box.innerHTML = '<h4>2-minute drill</h4><ol class="drill-items" translate="no">' + j.items.map((it, k) => {
    const parts = it.prompt.split(/_{3,}/);
    return `<li data-k="${k}"><label>${esc(parts[0])}<input type="text" class="gap" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Gap ${k + 1}">${esc(parts.slice(1).join('____'))}</label><span class="res" aria-live="polite"></span></li>`; }).join('') +
    '</ol><div class="row"><button type="button" class="btn primary small drillCheck">Check my answers</button><span class="status drillScore"></span></div>';
  box._items = j.items;
  box.querySelector('.drillCheck').addEventListener('click', () => {
    let right = 0;
    box.querySelectorAll('.drill-items li').forEach(li => {
      const it = box._items[Number(li.dataset.k)], v = normAnswer(li.querySelector('input').value);
      const ok = it.answers.some(a => normAnswer(a) === v);
      if (ok) right++;
      li.querySelector('.res').innerHTML = ok ? ' <span class="ok-mark">✔</span>' : ` <span class="bad-mark">✖</span> <span class="help">${esc(it.answers.join(' / '))}. ${esc(it.explanation)}</span>`;
    });
    box.querySelector('.drillScore').textContent = `${right} of ${box._items.length} correct.`;
  });
  if (j.remaining) updateRemaining(j.remaining);
}
function renderMistakes() {
  const h = loadHist().slice(-10), counts = {}, ex = {};
  h.forEach(c => (c.fixes || (c.tags || []).map(t => ({ tag: t }))).forEach(f => { counts[f.tag] = (counts[f.tag] || 0) + 1; if (f.correction) ex[f.tag] = f; }));
  const top = Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top.length) return;
  $('mistakeList').innerHTML = '<ol class="mistakes">' + top.map(([tag, n]) => `<li><strong>${esc(TAG_NAMES[tag] || tag)}</strong>, ${n} times in your last ${h.length} checks` +
    (ex[tag] ? `${ex[tag].original ? ` <span class="was" translate="no">${esc(ex[tag].original)}</span> → <span class="now" translate="no">${esc(ex[tag].correction)}</span>` : ''}${CONFIG?.features?.drills ? ` <button type="button" class="btn small drillBtn" data-fix="${esc(JSON.stringify(ex[tag]))}">2-minute drill</button>` : ''}` : '') + '</li>').join('') + '</ol>';
}

function renderCostNote() {
  const u = ME?.usage?.speaking;
  $('costNote').textContent = u ? `Getting feedback uses 1 of your ${Math.max(0, u.limit - u.used)} Speaking checks left. Listening back is free. If processing fails, the check is not counted.` : '';
}

// ─── plans + progress ─────────────────────────────────────────────────────────
const kzt = n => n.toLocaleString('en-US').replace(/,/g, ' ') + ' ₸';
function renderPlans() {
  if (!CONFIG || !Array.isArray(CONFIG.plans)) return;
  const paidPlans = CONFIG.plans.filter(p => p.priceUsd > 0 && p.days);
  const bestValue = paidPlans.length ? Math.min(...paidPlans.map(p => p.priceUsd / ((p.writing || 0) + (p.speaking || 0) || 1))) : Infinity;
  const activePaid = !!(ME && ME.plan && !['free', 'trial', 'lapsed', 'none'].includes(ME.plan.id) && (ME.account === 'code' || ME.student));
  $('planCards').innerHTML = CONFIG.plans.map(p => {
    const free = p.id === 'free';
    const totalAssessments = (p.writing || 0) + (p.speaking || 0);
    const featured = !!p.recommended && !free && totalAssessments > 0 && p.priceUsd / totalAssessments <= bestValue + 1e-9;
    const current = activePaid && ME.plan.id === p.id;
    const price = free ? '$0' : '$' + p.priceUsd;
    const period = free ? 'Free · no card · never expires' : 'One-time payment · ' + p.days + ' days · no automatic renewal';
    const listening = Number.isFinite(Number(p.listening)) ? Math.max(0, Number(p.listening)) : (free ? 1 : LISTEN_TESTS.length);
    const listeningLabel = listening === LISTEN_TESTS.length ? 'All' : String(listening);
    const items = [
      (p.writing || 0) + ' Writing assessment' + (p.writing === 1 ? '' : 's'),
      (p.speaking || 0) + ' Speaking assessment' + (p.speaking === 1 ? '' : 's'),
      (p.mocktest || 0) + ' full four-skill mock test' + (p.mocktest === 1 ? '' : 's'),
      (p.mockUsesSpeaking ? 1 : (p.mock || 0)) + ' full Speaking test' + ((p.mockUsesSpeaking ? 1 : (p.mock || 0)) === 1 ? '' : 's'),
      ...(CONFIG.features?.pronunciation && p.pronChecks ? [(p.pronChecks || 0) + ' pronunciation check' + (p.pronChecks === 1 ? '' : 's') + '*'] : []),
      listeningLabel + ' Listening practice test' + (listening === 1 ? '' : 's'),
      (p.upload || 0) + ' photo/PDF assessment' + (p.upload === 1 ? '' : 's'),
      (p.correction || 0) + ' correction credit' + (p.correction === 1 ? '' : 's'),
      'Model answers: ' + (p.modelAnswers ? 'included' : 'not included')
    ];
    const badge = current ? '<span class="tag current-plan">Your current plan · valid until ' + esc(fmtDate(ME.expires)) + '</span>' : featured ? '<span class="tag">Recommended</span>' : '';
    const cta = free ? (activePaid ? '' : '<a class="btn plan-cta" href="#check">Start free</a>') :
      '<button type="button" class="btn primary plan-cta" data-plan="' + esc(p.id) + '" data-name="' + esc(p.name) + '">' + (current ? 'Extend plan' : 'Choose ' + esc(p.name)) + '</button>';
    return '<article class="plan' + (featured ? ' featured' : '') + (current ? ' current' : '') + '" data-plan-card="' + esc(p.id) + '">' + badge + '<h3>' + esc(p.name) + '</h3>' +
      '<div class="price">' + price + '<small> USD</small></div><p class="alt">' + period + '</p>' +
      '<p class="blurb">' + esc(p.blurb || '') + '</p><ul>' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' + cta + '</article>';
  }).join('');
  try { renderPlanTable(CONFIG.plans); } catch (e) { console.error('plan_table', e && e.message); }
  try { const want = new URLSearchParams(location.search).get('plan'), b = want && document.querySelector('[data-plan="' + want.replace(/[^a-z]/g, '') + '"]'); if (b) b.closest('.plan').classList.add('picked'); } catch (e) {}
}
// Comparison table: every row comes from the plan data, nothing is typed in by hand. Yes / No are words, not just colours.
function renderPlanTable(plans) {
  const t = $('appPlanTable'); if (!t || !plans || !plans.length) return;
  const num = k => p => p[k] ? String(p[k]) : '-', yes = k => p => p[k] ? 'Yes' : 'No';
  const rows = [
    ['Price (USD)', p => '$' + (p.priceUsd || 0)],
    ['Writing assessments', num('writing')],
    ['Speaking assessments', num('speaking')],
    ['Full four-skill mock tests', num('mocktest')],
    ['Full Speaking tests', p => String(p.mockUsesSpeaking ? 1 : (p.mock || 0))],
    ...(CONFIG.features?.pronunciation ? [['Pronunciation checks*', num('pronChecks')]] : []),
    ['Corrections', p => String(p.correction || 0)],
    ['Model answers', yes('modelAnswers')],
    ['Second AI check on every essay', yes('doubleMarked')],
    ['Photo or PDF assessments', num('upload')],
    ['Devices', num('devices')],
    ['Valid for (days)', p => p.priceUsd ? String(p.days) : '30 (one-time)']
  ];
  const used = rows.filter(([label, f], i) => i === 0 || plans.some(p => f(p) !== '-'));
  t.innerHTML = '<thead><tr><th></th>' + plans.map(p => `<th scope="col">${esc(p.name)}${p.recommended ? ' <span class="band-badge">Recommended</span>' : ''}</th>`).join('') + '</tr></thead><tbody>' +
    used.map(([label, f]) => `<tr><th scope="row">${esc(label)}</th>${plans.map(p => `<td>${esc(f(p))}</td>`).join('')}</tr>`).join('') + '</tbody>';
}
// Upgrade prompt: a dialog (never a banner), only when the checks for this kind of task are down to 1 or 0, once a day per kind.
function maybeUpgradePrompt() {
  if (!ME || !ME.usage || $('upgradeDialog').open) return;
  const kind = task === 'speaking' ? 'speaking' : task.startsWith('writing') ? 'writing' : ''; const u = kind && ME.usage[kind];
  if (!u || !(u.limit > 0)) return;
  const left = Math.max(0, u.limit - u.used); if (left > 1) return;
  const key = 'ws_up_' + kind, today = new Date().toISOString().slice(0, 10);
  if (store(key) === today) return; store(key, today);
  const name = kind === 'writing' ? 'Writing' : 'Speaking';
  $('upTitle').textContent = left === 0 ? 'You have used your ' + name + ' checks' : 'You have 1 ' + name + ' check left';
  $('upText').textContent = left === 0 ? 'Choose a plan to keep practising. Your results and progress stay in your account.' : 'Choose a plan when you are ready for more checks.';
  try { $('upgradeDialog').showModal(); } catch (e) {}
}
$('upClose').addEventListener('click', () => $('upgradeDialog').close());
$('upPlans').addEventListener('click', () => { $('upgradeDialog').close(); const p = $('plans'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
// Active item in the navigation follows the section being read (one observer, no scroll handler).
(function () {
  const links = [...document.querySelectorAll('.top-nav a[data-nav]')]; if (!links.length || !('IntersectionObserver' in window)) return;
  const mark = id => links.forEach(a => { const on = a.dataset.nav === id && (!a.dataset.go || a.dataset.go === studioNow()); a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const secs = ['plans', 'progress'].map(id => document.getElementById(id)).filter(Boolean); let busy = false;
  const prac = document.getElementById('practice'); const studioNow = () => document.body.dataset.skill ? document.body.dataset.skill : document.querySelector('.mod.more[data-task="listening"][aria-pressed="true"]') ? 'listening' : (document.querySelector('.studio[data-studio][aria-pressed="true"]') || { dataset: { studio: 'writing' } }).dataset.studio;
  const spy = () => { busy = false; const tb = document.body.dataset.tab; if (tb === 'skill') { mark('check'); return; } if (tb && tb !== 'practice') { mark(tb === 'home' ? 'dash' : tb === 'plans' ? 'plans' : tb === 'mocks' ? 'mocks' : tb === 'reports' ? 'reports' : tb === 'contact' ? 'contact' : 'none'); return; } let cur = prac && prac.getBoundingClientRect().top > innerHeight * 0.45 ? 'dash' : 'check'; secs.forEach(s => { if (s.offsetParent && s.getBoundingClientRect().top < innerHeight * 0.4) cur = s.id; }); mark(cur); };
  addEventListener('scroll', () => { if (!busy) { busy = true; requestAnimationFrame(spy); } }, { passive: true });
  spy();
})();
// Plan request dialog: works with or without a mail app on the device (no mailto: popup).
function openPlanRequest(name) {
  const mail = 'support@writspeak.com', subj = `WritSpeak ${name} plan`, body = `Hello, I would like the ${name} plan. My country is: `;
  let d = $('planReq');
  if (!d) {
    d = document.createElement('dialog'); d.id = 'planReq'; d.setAttribute('aria-labelledby', 'planReqT');
    d.innerHTML = `<h2 id="planReqT"></h2><p class="help">Online payment is not open yet. Email us the plan name and your country. We reply within two working days with the price and how to pay, then send your access code.</p>
      <label class="lbl" for="planReqMail">Send to</label><input type="text" id="planReqMail" readonly value="${mail}">
      <label class="lbl" for="planReqText">Message (copy it)</label><input type="text" id="planReqText" readonly>
      <p class="status" id="planReqMsg" aria-live="polite"></p>
      <div class="row"><button class="btn primary" id="planReqCopy" type="button">Copy email address</button><a class="btn" id="planReqGmail" target="_blank" rel="noopener">Open Gmail</a><a class="btn" id="planReqApp">Open mail app</a><button class="btn" id="planReqClose" type="button">Close</button></div>`;
    document.body.append(d);
    $('planReqClose').addEventListener('click', () => { try { d.close(); } catch (e) { d.removeAttribute('open'); } });
    $('planReqCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(mail); $('planReqMsg').textContent = 'Copied: ' + mail; }
      catch (e) { $('planReqMail').select(); $('planReqMsg').textContent = 'Press Ctrl+C to copy the address.'; }
    });
  }
  $('planReqT').textContent = `Get the ${name} plan`;
  $('planReqText').value = `${subj}: ${body}`; $('planReqMsg').textContent = '';
  const q = `subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  $('planReqGmail').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${mail}&${q}`;
  $('planReqApp').href = `mailto:${mail}?${q}`;
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}
// "Choose plan": opens the checkout box when online payment is on, otherwise falls back to the email link in the button.
document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('.plan-cta[data-plan]'); if (!b) return;
  const box = $('payBox'), sel = $('payPlan');
  if (!box || box.hidden || ![...sel.options].some(o => o.value === b.dataset.plan)) { openPlanRequest(b.dataset.name); return; } // checkout closed: show how to ask for the plan
  ev.preventDefault(); sel.value = b.dataset.plan; sel.dispatchEvent(new Event('change'));
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
function offerPlans() { const a = document.createElement('a'); a.href = '#plans'; a.textContent = 'See plans'; $('errorBox').append(' ', a); }
function renderDash() { // overview tiles from the same data as the progress section (no extra requests)
  const el = $('dash'); if (!el || !ME || !ME.usage) return;
  const left = k => { const u = ME.usage[k]; return u && u.limit > 0 ? `${Math.max(0, u.limit - u.used)} of ${u.limit}` : '-'; };
  $('dPlan').textContent = ME.account === 'code' || ME.student ? ME.plan.name : 'Free';
  $('dPlanSub').textContent = ME.expires ? 'until ' + fmtDate(ME.expires) : (ME.resets ? 'renews ' + fmtDate(ME.resets) : '');
  $('dWriting').textContent = left('writing'); $('dSpeaking').textContent = left('speaking');
  const w = (ME.history || []).find(h => /^writing/.test(h.task));
  $('dBand').textContent = w && w.overall != null ? fmt(w.overall) : '-'; $('dBandSub').textContent = w ? fmtDate(w.at) : 'No results yet';
  const pr = (ME.history || []).find(h => /^speaking/.test(h.task) && h.pronunciation && h.pronunciation.assessed && h.pronunciation.scores && h.pronunciation.scores.overall != null);
  $('dPron').textContent = pr ? Math.round(Number(pr.pronunciation.scores.overall)) + '/100' : '-';
  $('dPronSub').textContent = pr ? fmtDate(pr.at) + ' · pronunciation practice score' : 'Not assessed yet';
  el.hidden = false;
  try { renderTopQuota(); renderGoal(); renderNextTask(); renderMiniTrend(); } catch (e) { console.error('dashboard', e && e.message); }
}
function renderUsage() {
  if (!ME) return;
  try { renderDash(); } catch (e) {}
  $('planLine').textContent = ME.account === 'code' ? (ME.plan.startsAtFirstUse ? `${ME.plan.name} · your ${ME.plan.hours} hours start at your first check (start it before ${fmtDate(ME.expires)})` : `${ME.plan.name} plan · valid until ${fmtDate(ME.expires)} · allowances renew ${fmtDate(ME.resets)}`) : (ME.student ? `Free account · one-time, valid until ${fmtDate(ME.expires)}` : `Free plan · renews ${fmtDate(ME.resets)}`);
  $('usageList').innerHTML = Object.entries(ME.usage).filter(([, u]) => u.limit > 0).map(([k, u]) => {
    const usedPct = u.limit ? Math.max(0, Math.min(100, Math.round(100 * u.used / u.limit))) : 0;
    return `<li><span>${esc(KIND_NAMES[k])}</span><span>${u.limit - u.used} of ${u.limit} left</span><svg class="usage-meter" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${esc(KIND_NAMES[k])}: ${u.limit - u.used} of ${u.limit} left"><rect class="meter-track" width="100" height="10" rx="5"></rect><rect class="meter-fill" width="${usedPct}" height="10" rx="5"></rect></svg></li>`;
  }).join('');
}
let trendSkill = 'writing';
function renderTrend() {
  if (!ME) return;
  const pts = ME.history.filter(h => trendSkill === 'writing' ? /^writing/.test(h.task) : /^speaking/.test(h.task)).slice(0, 20).reverse();
  if (trendSkill !== 'writing') {
    const sPts = ME.history.filter(h => /^speaking/.test(h.task) && h.scores && typeof h.scores === 'object').slice(0, 20).reverse();
    if (!sPts.length) { $('trend').innerHTML = '<p class="status">No Speaking results yet. Complete a Speaking assessment to see your criterion progress.</p>'; return; }
    const keys = [['FC', 'Fluency & Coherence', 'fc'], ['LR', 'Lexical Resource', 'lr'], ['GRA', 'Grammar Range & Accuracy', 'gra']];
    const W = 560, H = 150, padL = 30, padR = 12, padT = 12, padB = 24;
    const x = i => sPts.length === 1 ? (padL + W - padR) / 2 : padL + i * (W - padL - padR) / (sPts.length - 1);
    const y = v => padT + (9 - v) * (H - padT - padB) / 9;
    let g = '';
    for (let b = 0; b <= 9; b += 3) g += `<line class="ax" x1="${padL}" x2="${W - padR}" y1="${y(b)}" y2="${y(b)}"/><text x="4" y="${y(b) + 4}">${b}</text>`;
    const legend = [];
    keys.forEach(([k, label, cls]) => {
      const vals = sPts.map((p, idx) => ({ v: Number(p.scores[k]), i: idx })).filter(p => Number.isFinite(p.v));
      if (!vals.length) return;
      const path = vals.map((p, i) => (i ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
      g += `<path class="ln ${cls}" d="${path}"/>` + vals.map(p => `<circle class="pt ${cls}" cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4"><title>${label}: ${fmt(p.v)} · ${fmtDate(sPts[p.i].at)}</title></circle>`).join('');
      legend.push(`<span class="trend-key ${cls}">${label}</span>`);
    });
    g += `<text x="${padL}" y="${H - 4}">${fmtDate(sPts[0].at)}</text><text x="${W - padR}" y="${H - 4}" text-anchor="end">${fmtDate(sPts[sPts.length - 1].at)}</text>`;
    $('trend').innerHTML = `<svg class="spark speaking-trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Speaking criterion bands across ${sPts.length} assessments">${g}</svg><div class="trend-legend">${legend.join('')}</div><p class="status">Criterion bands only. WritSpeak does not calculate an overall IELTS Speaking band. Pronunciation, when assessed, is reported separately out of 100.</p>`;
    return;
  }
  if (!pts.length) { $('trend').innerHTML = `<p class="status">No ${trendSkill} results yet. Check an answer to start your record.</p>`; return; }
  const W = 560, H = 140, padL = 30, padR = 10, padT = 10, padB = 22;
  const vals = pts.map(p => p.overall); // the first marking's approximate overall band
  const lo = Math.max(0, Math.floor(Math.min(...vals)) - 1), hi = Math.min(9, Math.ceil(Math.max(...vals)) + 1);
  const x = i => pts.length === 1 ? (padL + W - padR) / 2 : padL + i * (W - padL - padR) / (pts.length - 1);
  const y = v => padT + (hi - v) * (H - padT - padB) / Math.max(1, hi - lo);
  let g = '';
  for (let b = lo; b <= hi; b++) g += `<line class="ax" x1="${padL}" x2="${W - padR}" y1="${y(b)}" y2="${y(b)}"/><text x="4" y="${y(b) + 4}">${b}</text>`;
  const path = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  g += `<path class="ln" d="${path}"/>` + vals.map((v, i) => `<circle class="pt" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4"><title>${fmtDate(pts[i].at)}: ${fmt(v)}</title></circle>`).join('');
  g += `<text x="${padL}" y="${H - 4}">${fmtDate(pts[0].at)}</text><text x="${W - padR}" y="${H - 4}" text-anchor="end">${fmtDate(pts[pts.length - 1].at)}</text>`;
  const last = vals[vals.length - 1], first = vals[0];
  $('trend').innerHTML = `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${trendSkill} band estimates over your last ${pts.length} checks, from ${fmt(first)} to ${fmt(last)}">${g}</svg>
    <p class="status">Latest: <strong>${fmt(last)}</strong> · ${pts.length} result${pts.length === 1 ? '' : 's'}${pts.length > 1 ? ` · change ${last - first >= 0 ? '+' : ''}${(last - first).toFixed(1)}` : ''}. Estimates move up and down; look at the trend over several weeks.</p>`;
}
// "Your next practice": no AI. The most repeated mistake to watch, and a bank question the student has not tried yet.
function renderNext() {
  const box = $('nextPractice'); if (!box) return;
  const h = loadHist(); if (!h.length) return;
  const last = h[h.length - 1], counts = {}, ex = {};
  h.slice(-10).forEach(c => (c.fixes || []).forEach(f => { counts[f.tag] = (counts[f.tag] || 0) + 1; if (f.why) ex[f.tag] = f; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  let html = top ? `<p><strong>Watch for:</strong> ${esc(TAG_NAMES[top[0]] || top[0])} (${top[1]} time${top[1] > 1 ? 's' : ''} in your recent checks).${ex[top[0]] ? ' ' + esc(ex[top[0]].why) : ''}</p>` : '';
  if (last.t.startsWith('writing') && BANK) {
    const tried = new Set(h.map(x => x.b).filter(Boolean));
    const next = bankQuestions().find(w => w.task === last.t && !tried.has(w.id));
    if (next) html += `<p><strong>Next task:</strong> ${esc(next.question.slice(0, 140))}${next.question.length > 140 ? '…' : ''}</p><a class="btn primary" href="/app?task=${esc(next.task)}&q=${esc(next.id)}#check">Practise this question</a>`;
  } else if (last.t === 'speaking') html += '<p><strong>Next:</strong> a full Speaking test (Parts 1, 2 and 3) shows how you do over the whole interview.</p><a class="btn primary" href="/app?task=speaking&mode=test#check">Take a full Speaking test</a>';
  if (html) { box.innerHTML = html; $('nextCard').hidden = false; }
}
// ─── dashboard (phase 3): top-bar quota meters, goal, next task, last 5 bands ─────
function renderTopQuota() {
  if (!ME) return;
  const set = (id, k) => { const u = ME.usage && ME.usage[k]; const el = $(id); if (!el) return; el.hidden = !(u && u.limit > 0); if (u && u.limit > 0 && window.WSUI) window.WSUI.quota(el, Math.max(0, u.limit - u.used), u.limit); };
  set('qWriting', 'writing'); set('qSpeaking', 'speaking'); set('qMock', 'mocktest');
  const listeningEl = $('qListening'), planListening = ME.plan && ME.plan.listening;
  const listeningAvailable = planListening !== undefined && planListening !== null && Number.isFinite(Number(planListening)) ? Math.max(0, Number(planListening)) : LISTEN_TESTS.filter(t => !t.locked).length;
  if (listeningEl) {
    listeningEl.hidden = false;
    // Until the Listening list has loaded, show the plan's count on its own rather than "4 of 0".
    const listeningTotal = Math.max(LISTEN_TESTS.length, listeningAvailable);
    if (window.WSUI) window.WSUI.quota(listeningEl, Math.min(listeningAvailable, listeningTotal), listeningTotal);
    const txt = listeningEl.querySelector('.txt');
    if (txt) txt.textContent = LISTEN_TESTS.length ? Math.min(listeningAvailable, LISTEN_TESTS.length) + ' of ' + LISTEN_TESTS.length + ' available' : listeningAvailable + ' available';
  }
  const low = ['writing', 'speaking'].some(k => { const u = ME.usage && ME.usage[k]; return u && u.limit > 0 && u.limit - u.used <= 1; }) || (() => { const u = ME.usage && ME.usage.mocktest; return !!(u && u.limit > 0 && u.limit - u.used === 0); })() || listeningAvailable < LISTEN_TESTS.length;
  $('qUpgrade').hidden = !low;
}
function loadGoal() { try { const g = JSON.parse(store('ws_goal') || '{}'); return g && typeof g === 'object' ? g : {}; } catch (e) { return {}; } }
function renderGoal() {
  const sel = $('goalBand'); if (!sel) return;
  if (!sel.options.length) for (let b = 5; b <= 9; b += 0.5) sel.add(new Option(b.toFixed(1), String(b)));
  const g = loadGoal();
  if (g.type) $('goalType').value = g.type;
  if (g.band) sel.value = String(g.band);
  $('goalDate').value = g.date || '';
  if ($('goalHours')) $('goalHours').value = String(g.weeklyHours || 4);
  const setup = $('goalSetup'); if (setup && !g.setupComplete && !g.skipped) setup.open = true; else if (setup && g.skipped) setup.open = false;
  const last = (ME.history || []).find(h => /^writing/.test(h.task) && h.overall != null);
  const out = [];
  if (g.date) { const d = Math.ceil((new Date(g.date + 'T00:00:00') - new Date(new Date().toDateString())) / 864e5); out.push(d > 1 ? d + ' days to your exam' : d === 1 ? 'Your exam is tomorrow' : d === 0 ? 'Your exam is today' : 'This exam date has passed'); }
  if (g.band && last) { const gap = g.band - last.overall; out.push(gap > 0 ? 'Latest Writing band ' + fmt(last.overall) + ', ' + gap.toFixed(1) + ' below your target' : 'Latest Writing band ' + fmt(last.overall) + ': at or above your target'); }
  if (g.weeklyHours) out.push('Weekly study target: ' + g.weeklyHours + ' hours');
  $('goalOut').textContent = out.length ? out.join(' · ') : 'Set your study preferences or skip for now.';
}
function saveGoal() { const old = loadGoal(); store('ws_goal', JSON.stringify({ type: $('goalType').value, date: $('goalDate').value, band: Number($('goalBand').value), weeklyHours: Number(($('goalHours') && $('goalHours').value) || old.weeklyHours || 4), setupComplete: true, skipped: false })); if (ME) renderGoal(); }
function goPractice(studio) { const b = studio === 'listening' ? document.querySelector('.mod.more[data-task="listening"]') : document.querySelector('.studio[data-studio="' + studio + '"]'); if (b) b.click(); const t = $('practice'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function renderNextTask() {
  const btn = $('nextTaskBtn'); if (!btn) return;
  const h = loadHist(), last = h.length ? h[h.length - 1] : null;
  let text = 'Start with a Writing Task 2 check. You get your estimated band and your 3 most important fixes.', label = 'Start a Writing check', act = () => goPractice('writing');
  if (last && last.t.startsWith('writing') && bankLoaded()) {
    const tried = new Set(h.map(x => x.b).filter(Boolean)), next = bankQuestions().find(w => w.task === last.t && !tried.has(w.id));
    if (next) { text = 'Try a new ' + (TASKS[next.task] ? TASKS[next.task].title : 'Writing') + ' question: ' + next.question.slice(0, 110) + (next.question.length > 110 ? '…' : ''); label = 'Practise this question'; act = () => { location.href = '/app?task=' + encodeURIComponent(next.task) + '&q=' + encodeURIComponent(next.id) + '#practice'; }; }
  } else if (last && last.t === 'speaking') { text = 'A full Speaking test (Parts 1, 2 and 3) shows how you do over the whole interview.'; label = 'Take a full Speaking test'; act = () => { location.href = '/app?task=speaking&mode=test#practice'; }; }
  $('nextTaskText').textContent = text; btn.textContent = label; btn.onclick = act;
  maybeTopUpTask1(h);
}
// When a signed-in student has tried every Academic Task 1 question on their plan, ask the server for a new chart question
// (at most once a day from this browser; the server has its own limits). It joins the question list for everyone.
let t1TopUpAsked = false;
function maybeTopUpTask1(h) {
  if (t1TopUpAsked || !ME || !bankLoaded()) return;
  const list = bankQuestions().filter(w => w.task === 'writing_task1' && w.testType === 'academic');
  const tried = new Set(h.map(x => x.b).filter(Boolean));
  if (!list.length || list.some(w => !tried.has(w.id))) return;
  const today = new Date().toISOString().slice(0, 10);
  if (store('ws_t1_topup') === today) return;
  t1TopUpAsked = true; store('ws_t1_topup', today);
  api('/api/task1/top-up', { method: 'POST', json: {} }).then(j => {
    if (j && j.ok && j.made > 0) api('/api/bank').then(b => { if (b && Array.isArray(b.writing)) { BANK = b; try { renderNextTask(); if (task.startsWith('writing')) renderBankSelect(); } catch (e) {} } });
  }).catch(() => {});
}
function renderMiniTrend() {
  const box = $('miniTrend'); if (!box) return;
  const pts = (ME.history || []).filter(h => /^writing/.test(h.task) && h.overall != null).slice(0, 5).reverse();
  if (!pts.length) { box.innerHTML = '<p class="status">No results yet. Your bands will appear here.</p>'; return; }
  const W = 240, H = 70, vals = pts.map(p => p.overall), lo = Math.min(...vals) - 0.5, hi = Math.max(...vals) + 0.5;
  const x = i => pts.length === 1 ? W / 2 : 12 + i * (W - 24) / (pts.length - 1), y = v => 8 + (hi - v) * (H - 16) / Math.max(0.5, hi - lo);
  const path = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  box.innerHTML = `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Last ${pts.length} Writing bands: ${vals.map(fmt).join(', ')}"><path class="ln" d="${path}"/>${vals.map((v, i) => `<circle class="pt" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4"><title>${fmtDate(pts[i].at)}: ${fmt(v)}</title></circle>`).join('')}</svg><p class="status">Latest ${fmt(vals[vals.length - 1])}${vals.length > 1 ? ' · first of these ' + fmt(vals[0]) : ''}</p>`;
}
['goalType', 'goalDate', 'goalBand', 'goalHours'].forEach(id => { const el = $(id); if (el) el.addEventListener('change', saveGoal); });
const goalSkip = $('goalSkip'); if (goalSkip) goalSkip.addEventListener('click', () => { const g = loadGoal(); g.skipped = true; store('ws_goal', JSON.stringify(g)); renderGoal(); });
document.querySelectorAll('.top-nav a[data-go]').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); goPractice(a.dataset.go); }));
// ─── phase 4: task cards (Writing and Speaking), optional Writing timer, "Try again" / "Next task" ─────
const WMIN = { writing_task2: 40, writing_task1: 20 };
const wKey = () => wOwn ? 'own' : task === 'writing_task2' ? 't2' : ($('testType').value === 'general' ? 't1g' : 't1a');
function cardTime(maxSec) { const m = maxSec / 60; return 'up to ' + (m === Math.floor(m) ? m : m.toFixed(1)) + ' min'; }
function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function dailyOrder(items, scope) {
  const day = new Date().toISOString().slice(0, 10);
  const score = id => { let h = 2166136261; for (const ch of day + ':' + scope + ':' + id) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  return items.slice().sort((a, b) => score(a.id) - score(b.id));
}
const speakingSeenKey = () => 'ws_sp_seen_' + new Date().toISOString().slice(0, 10) + '_' + part;
function speakingSeen() { try { return new Set(JSON.parse(store(speakingSeenKey()) || '[]')); } catch (e) { return new Set(); } }
function markSpeakingSeen(id) { const s = speakingSeen(); s.add(id); store(speakingSeenKey(), JSON.stringify([...s])); }
function renderWritingCards() {
  const box = $('wCards'); if (!box) return;
  const key = wKey();
  document.querySelectorAll('#wTabs .ui-tab').forEach(b => { const on = b.dataset.k === key; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  $('typeBlock').classList.toggle('dup', key !== 'own');
  $('wCards').hidden = $('wChips').hidden = key === 'own';
  if ($('btnWTimer') && !wTimerId) $('btnWTimer').textContent = 'Start ' + (WMIN[task] || 40) + '-minute timer';
  if (key === 'own') { box.innerHTML = ''; return; }
  if (!BANK) { box.innerHTML = '<p class="status">Loading questions…</p>'; return; }
  if (!bankLoaded()) { box.innerHTML = '<p class="status">Questions could not be loaded. Refresh the page and try again.</p>'; return; }
  const list = dailyOrder(bankQuestions().filter(w => w.task === task && (task === 'writing_task2' || w.testType === $('testType').value)), 'writing:' + key);
  const last = {}; loadHist().forEach(h => { if (h.b) last[h.b] = h; });
  const allTopics = BANK.access && BANK.access.writing && BANK.access.writing.topics || [];
  const topics = allTopics.length ? allTopics.filter(t => (!t.tasks || !t.tasks.length || t.tasks.includes(task)) && (task !== 'writing_task1' || !t.testTypes || !t.testTypes.length || t.testTypes.includes($('testType').value)) && (list.some(w => w.topic === t.topic) || t.locked)) : [...new Set(list.map(w => w.topic))].map(topic => ({ topic, label: topic, locked: false }));
  $('wChips').innerHTML = topics.map(t => `<button type="button" class="ui-chip ${t.locked ? 'locked-chip' : ''}" aria-pressed="${wTopics.has(t.topic)}" data-value="${esc(t.topic)}">${t.locked ? '🔒 ' : ''}${esc(t.label)}</button>`).join('') +
    `<button type="button" class="ui-chip" aria-pressed="${wNew}" data-value="__new">Not tried yet</button>`;
  const shown = list.filter(w => (!wTopics.size || wTopics.has(w.topic)) && (!wNew || !last[w.id]));
  const cards = shown.map(w => {
    const h = last[w.id], badge = h ? (typeof h.o === 'number' ? `<span class="band-badge">${fmt(h.o)} <small>last band</small></span>` : '<span class="locked-badge">Tried</span>') : '';
    return `<button type="button" class="task-card" data-id="${esc(w.id)}" aria-pressed="${w.id === bankId}"><span class="tc-top"><span class="tc-topic">${esc(w.topic)}</span><span class="tc-time">${WMIN[w.task]} min</span></span><span class="tc-q">${esc(clip(w.question, 120))}</span><span class="tc-foot"><span class="tc-type">${esc(w.type || '')}</span>${badge}</span></button>`;
  }).join('');
  const locked = (BANK.access && BANK.access.writing && BANK.access.writing.locked || []).filter(t => (!t.tasks || !t.tasks.length || t.tasks.includes(task)) && (task !== 'writing_task1' || !t.testTypes || !t.testTypes.length || t.testTypes.includes($('testType').value)) && (!wTopics.size || wTopics.has(t.topic)));
  const lockedCards = locked.map(t => `<div class="task-card locked-card" aria-disabled="true"><span class="tc-top"><span class="tc-topic">🔒 ${esc(t.label)}</span><span class="tc-time">${t.count} questions</span></span><span class="tc-q">More original IELTS-style questions in this topic are available on a higher plan.</span><span class="tc-foot"><span class="tc-type">Included from ${esc(t.requiredPlan)}</span><a class="btn small" href="#plans">View plans</a></span></div>`).join('');
  box.innerHTML = (cards || (lockedCards ? '<div class="ui-empty"><p>No unlocked questions match this filter yet.</p></div>' : '<div class="ui-empty"><p>No questions match these filters.</p><button class="btn" type="button" id="wClear">Clear filters</button></div>')) + lockedCards;
}
function wPick(id) { $('bankSelect').value = id; pickBank(); wTimerStop(); renderWritingCards(); const t = $('inputText'); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.focus({ preventScroll: true }); }
$('wTabs').addEventListener('click', ev => {
  const b = ev.target.closest('.ui-tab'); if (!b) return; const k = b.dataset.k;
  if (k === 'own') { if (bankId) { $('questionText').value = ''; $('materialText').value = ''; bankId = null; $('bankSelect').value = ''; } wOwn = true; renderWritingCards(); $('questionText').focus(); return; }
  const target = k === 't2' ? 'writing_task2' : 'writing_task1';
  if (task !== target) setTask(target);
  wOwn = false; wTopics.clear(); wNew = false;
  if (k === 't1a') $('testType').value = 'academic'; if (k === 't1g') $('testType').value = 'general';
  applyBlocks(); renderWritingCards();
});
$('wChips').addEventListener('click', ev => {
  const b = ev.target.closest('.ui-chip'); if (!b) return; const v = b.dataset.value;
  if (v === '__new') wNew = !wNew; else if (wTopics.has(v)) wTopics.delete(v); else wTopics.add(v);
  renderWritingCards();
});
$('wCards').addEventListener('click', ev => {
  if (ev.target.id === 'wClear') { wTopics.clear(); wNew = false; renderWritingCards(); return; }
  const c = ev.target.closest('.task-card'); if (c) wPick(c.dataset.id);
});
// Optional Writing timer: counts down, never submits for the student
function wTimerStop() { clearInterval(wTimerId); wTimerId = null; if ($('wTimer')) $('wTimer').textContent = ''; if ($('btnWTimer')) $('btnWTimer').textContent = 'Start ' + (WMIN[task] || 40) + '-minute timer'; }
$('btnWTimer').addEventListener('click', () => {
  if (wTimerId) { wTimerStop(); return; }
  let left = (WMIN[task] || 40) * 60; $('btnWTimer').textContent = 'Stop timer';
  const t = () => { if (left <= 0) { clearInterval(wTimerId); wTimerId = null; $('wTimer').textContent = ' Time is up. Finish your sentence, then check your answer.'; $('btnWTimer').textContent = 'Start ' + (WMIN[task] || 40) + '-minute timer'; return; } $('wTimer').textContent = ' ' + fmtTime(left) + ' left'; left--; };
  t(); wTimerId = setInterval(t, 1000);
});
// Speaking cards: the same cards for the current part. The old question list stays as a fallback.
function renderSpCards() {
  const box = $('spCards'); if (!box) return;
  const list = dailyOrder(QUESTIONS.filter(q => q.part === part), 'speaking:' + part);
  const seen = speakingSeen();
  const cards = list.map(q => `<button type="button" class="task-card" data-id="${esc(q.id)}" aria-pressed="${!!currentQ && currentQ.id === q.id}"><span class="tc-top"><span class="tc-topic">${esc(q.topicLabel || q.label)}</span><span class="tc-time">${cardTime(q.maxSec)}</span></span><span class="tc-q">${esc(clip(q.text, 110))}</span><span class="tc-foot"><span class="tc-type">${q.part === 2 ? '1 minute to prepare' : 'Original IELTS-style practice'}</span>${seen.has(q.id) ? '<span class="locked-badge">Seen today</span>' : ''}</span></button>`).join('');
  const locked = (BANK && BANK.access && BANK.access.speaking && BANK.access.speaking.locked || []).filter(t => (t.parts || []).includes(part));
  const lockedCards = locked.map(t => `<div class="task-card locked-card" aria-disabled="true"><span class="tc-top"><span class="tc-topic">🔒 ${esc(t.label)}</span><span class="tc-time">${t.count} questions</span></span><span class="tc-q">Unlock this Speaking topic to practise more original questions.</span><span class="tc-foot"><span class="tc-type">Included from ${esc(t.requiredPlan)}</span><a class="btn small" href="#plans">View plans</a></span></div>`).join('');
  box.innerHTML = cards + lockedCards;
}
$('spCards').addEventListener('click', ev => { const c = ev.target.closest('.task-card'); if (!c) return; $('qSelect').value = c.dataset.id; pickQ(c.dataset.id); renderSpCards(); const q = $('qBox'); q.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
// Report view: Try again (same question, new attempt) and Next task
function resultButtonsOn() { return (task.startsWith('writing') || (task === 'speaking' && speakMode === 'rec')) && !!$('btnTryAgain'); }
new MutationObserver(() => { const on = resultButtonsOn() && !$('resultPanel').hidden; $('btnTryAgain').hidden = $('btnNextTask').hidden = !on; if (!$('resultPanel').hidden) setTimeout(() => { try { maybeUpgradePrompt(); } catch (e) {} }, 2500); }).observe($('resultPanel'), { attributes: true, attributeFilter: ['hidden'] });
function backToTask() { $('resultPanel').hidden = true; const t = task === 'speaking' ? $('qBox') : $('inputText'); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
$('btnTryAgain').addEventListener('click', () => {
  if (task === 'speaking') resetRecording(); else { $('inputText').value = ''; $('inputText').dispatchEvent(new Event('input')); updateCount(); endRevision(); }
  backToTask(); if (task !== 'speaking') $('inputText').focus({ preventScroll: true });
});
$('btnNextTask').addEventListener('click', () => {
  if (task === 'speaking') {
    const list = dailyOrder(QUESTIONS.filter(q => q.part === part), 'speaking:' + part), seen = speakingSeen();
    const nx = list.find(q => q.id !== (currentQ && currentQ.id) && !seen.has(q.id)) || list.find(q => q.id !== (currentQ && currentQ.id));
    if (!nx) return; $('qSelect').value = nx.id; pickQ(nx.id); renderSpCards(); backToTask(); return;
  }
  const list = bankLoaded() ? dailyOrder(bankQuestions().filter(w => w.task === task && (task === 'writing_task2' || w.testType === $('testType').value)), 'writing:' + wKey()) : [];
  const tried = new Set(loadHist().map(h => h.b).filter(Boolean)), i = list.findIndex(w => w.id === bankId);
  const nx = list.slice(i + 1).concat(list.slice(0, Math.max(0, i))).find(w => !tried.has(w.id));
  if (!nx) { window.WSUI.toast('You have tried every question in this list. Pick one to repeat.'); wOwn = false; renderWritingCards(); $('wCards').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  $('inputText').value = ''; $('inputText').dispatchEvent(new Event('input')); endRevision(); $('resultPanel').hidden = true; wPick(nx.id);
});
function renderSkillsProgress() {
  const box = $('skillsProgress'); if (!box || !ME) return;
  const learning = ME.learning || {}, listen = learning.listening || {}, read = learning.reading || {};
  const listening = listen.latest || [], reading = read.latest || [];
  const stat = (label, value, note) => `<div class="skill-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
  const recent = [
    ...listening.map(x => ({ skill: 'Listening', title: x.test_type === 'mock' ? 'Listening mock' : (x.test_id || 'Listening practice'), raw: x.raw, total: x.total, at: x.completed_at })),
    ...reading.map(x => ({ skill: 'Reading', title: x.title, raw: x.raw, total: x.total, at: x.at }))
  ].sort((x,y) => Number(y.at||0)-Number(x.at||0)).slice(0,6);
  box.innerHTML = '<div class="learning-stats">' +
    stat('Listening attempts', listen.attempts || 0, (listen.completed || 0) + ' perfect scores') +
    stat('Reading attempts', read.attempts || 0, 'Full 60-minute tests') +
    '</div>' +
    (recent.length ? '<h4 class="learning-recent-title">Recent completed work</h4><ul class="learning-recent">' + recent.map(x => '<li><span><strong>' + esc(x.skill) + '</strong><small>' + esc(x.title) + '</small></span><span class="learning-score">' + x.raw + ' / ' + x.total + '<small>' + (x.at ? esc(fmtDate(x.at)) : '') + '</small></span></li>').join('') + '</ul>' : '<p class="status">No completed Reading or Listening assessments yet. Your results will appear here automatically.</p>');
}
function renderProgress() { renderUsage(); renderSkillsProgress(); renderTrend(); renderMistakes(); renderNext(); try { document.dispatchEvent(new Event('ws:me')); } catch (e) {} }

// ─── access code dialog ───────────────────────────────────────────────────────
function openCode() {
  $('codeInput').value = accessCode; $('codeMsg').textContent = '';
  $('btnCodeRemove').hidden = !accessCode;
  try { $('codeDialog').showModal(); } catch (e) { $('codeDialog').setAttribute('open', ''); }
  $('codeInput').focus();
}
async function saveCode(ev) {
  ev.preventDefault();
  const raw = $('codeInput').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d{6}$/.test(raw) && window.resumeAccountCode) { // the 6-digit email sign-in code was typed in the access-code box: send it to the right place
    try { $('codeDialog').close(); } catch (e) { $('codeDialog').removeAttribute('open'); }
    window.resumeAccountCode(raw); return;
  }
  if (!/^(MJ|WS)[A-Z0-9]{8}$/.test(raw)) { $('codeMsg').textContent = 'Codes look like WS-AB12-CD34. Check and type it again.'; return; }
  const code = `${raw.slice(0, 2)}-${raw.slice(2, 6)}-${raw.slice(6)}`;
  $('codeMsg').textContent = 'Checking…'; $('btnCodeSave').disabled = true;
  const j = await api('/api/me', { code });
  $('btnCodeSave').disabled = false;
  if (!j.ok) { $('codeMsg').textContent = j.message; return; }
  accessCode = code; store('mj_code', code); ME = j;
  setDashboardAccess(true);
  renderChip(); renderAllowance(); renderProgress(); showError('');
  $('codeMsg').textContent = `${j.plan.name} plan active until ${fmtDate(j.expires)}.`;
  setTimeout(() => { try { $('codeDialog').close(); } catch (e) {} }, 900);
}
async function removeCode() { accessCode = ''; store('mj_code', null); $('codeDialog').close(); await loadMe(); }
function clearAccessCodeForStudent() { accessCode = ''; store('mj_code', null); }

// ─── wiring ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.mod').forEach(b => b.addEventListener('click', () => setTask(b.dataset.task)));
['inputText', 'questionText', 'materialText', 'passageText', 'keyText'].forEach(id => $(id).addEventListener('input', updateCount));
$('inputText').addEventListener('input', () => { if (!$('inputText').value.trim()) source = 'typed'; });
$('testType').addEventListener('change', () => { saveDraft(); applyBlocks(); });
$('chartInput').addEventListener('change', e => onChart(Array.from(e.target.files || [])));
['inputText', 'questionText', 'materialText'].forEach(id => $(id).addEventListener('input', () => { $(id).classList.remove('invalid'); $(id).removeAttribute('aria-invalid'); }));
$('btnCheck').addEventListener('click', runCheck);
$('btnExplain').addEventListener('click', explainWrong);
$('btnClear').addEventListener('click', () => {
  ['questionText', 'materialText', 'passageText', 'keyText', 'inputText'].forEach(id => { $(id).value = ''; });
  source = 'typed'; clearUpload(); chart = null; $('chartThumb').innerHTML = ''; showCheckPanel(''); clearInvalid();
  if (task === 'listening' && listenMode === 'lib' && libCurrent) openLibTest(libCurrent.id);
  $('resultPanel').hidden = true; $('statusMsg').textContent = ''; showError(''); updateCount();
});
$('btnSample').addEventListener('click', () => {
  const s = (task === 'writing_task1' && $('testType').value === 'general') ? SAMPLES.writing_task1_gt : SAMPLES[task]; if (!s) return;
  if (s.q) $('questionText').value = s.q;
  if (s.k) $('keyText').value = s.k;
  if (s.p !== undefined) $('passageText').value = s.p;
  $('inputText').value = s.t; source = 'typed'; updateCount();
  $('statusMsg').textContent = 'Sample loaded (an example, not your work). Press the check button to see the result.';
});
$('fileInput').addEventListener('change', e => onFiles(e.target.files));
$('btnRead').addEventListener('click', readUpload);
$('audioFile').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; const a = $('audioPlayer');
  if (!f) { a.hidden = true; return; }
  try { a.src = URL.createObjectURL(f); a.hidden = false; } catch (err) { showError('This audio file could not be opened. Try an MP3 or M4A file.'); }
});
$('audioPlayer').addEventListener('error', () => { if ($('audioPlayer').getAttribute('src')) showError('This audio file could not be played. Try an MP3 or M4A file.'); });
async function copyText(text, msgEl, okMsg) { try { await navigator.clipboard.writeText(text); msgEl.textContent = okMsg; } catch (e) { msgEl.textContent = 'Copy was blocked — select the text and copy it by hand.'; } }
$('btnCopy').addEventListener('click', () => copyText(lastText || $('report').innerText, $('copyMsg'), 'Copied.'));
// Download PDF: the browser's own "Save as PDF" (free, works on phones and computers). Only the result is printed,
// as ONE page: bands, the main fixes, a short line per criterion and the next steps, plus the date, the task and the
// question. Long sections (marked essay, sentence corrections, history) stay on screen only. If the summary is still
// taller than a page it is scaled down to fit (never below 55%). Nothing is sent anywhere.
const PR_W = 186 * 3.7795, PR_H = 250 * 3.7795; // printable area in px: A4 width and US Letter height, 12 mm margins
const TASK_NAMES = { writing_task2: 'IELTS Writing Task 2', writing_task1: 'IELTS Writing Task 1', speaking: 'IELTS Speaking' };
function printResult() {
  const panel = $('resultPanel'); if (panel.hidden) return;
  const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const oldTitle = document.title;
  const reportTask = task === 'writing_task1' && $('testType').value === 'general' ? 'IELTS Writing Task 1 General Training' : (TASK_NAMES[task] || 'IELTS Assessment');
  document.title = 'WritSpeak ' + reportTask + ' Assessment ' + day;
  const q = task === 'speaking' ? ($('qBox') ? $('qBox').innerText.trim() : '') : $('questionText').value.trim();
  const head = $('printHead');
  head.innerHTML = `<p class="ph-brand">WritSpeak</p><p>${esc(TASK_NAMES[task] || 'IELTS practice')}${task.startsWith('writing') ? ' · ' + ($('testType').value === 'general' ? 'General Training' : 'Academic') : ''} · ${esc(day)}</p>${q ? `<p class="ph-q"><strong>Question:</strong> ${esc(q.length > 320 ? q.slice(0, 317).trimEnd() + '…' : q)}</p>` : ''}<p class="ph-note">AI practice estimate — not an official IELTS result.</p>`;
  head.hidden = false;
  const closed = [...panel.querySelectorAll('details.pr-keep:not([open])')]; closed.forEach(d => { d.open = true; });
  const hidden = [];
  for (let el = panel; el && el !== document.body; el = el.parentElement) for (const sib of el.parentElement.children) if (sib !== el && !sib.classList.contains('pr-hide')) { sib.classList.add('pr-hide'); hidden.push(sib); }
  // Measure the one-page layout at paper width, then scale it to fit one page.
  const notes = [];
  panel.querySelectorAll('#report > ol.fixes').forEach(ol => { const n = ol.children.length; if (n > 3) { const p = document.createElement('p'); p.className = 'help pr-more'; p.textContent = `Only the first 3 of your ${n} fixes fit on this page. Use “Copy feedback” in WritSpeak to keep the full list.`; ol.after(p); notes.push(p); } });
  document.body.classList.add('pr-one', 'pr-measure');
  const fit = Math.max(0.55, Math.min(1, PR_H / panel.scrollHeight));
  document.body.classList.remove('pr-measure');
  const zoomClass = 'pr-zoom-' + Math.round(fit * 100);
  panel.classList.add(zoomClass);
  // Keep the meaningful task-specific title set above for the browser's Save as PDF filename.
  const restore = () => { notes.forEach(p => p.remove()); closed.forEach(d => { d.open = false; }); hidden.forEach(x => x.classList.remove('pr-hide')); head.hidden = true; panel.classList.remove(zoomClass); document.body.classList.remove('pr-one', 'pr-measure'); document.title = oldTitle; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  window.print();
  setTimeout(() => { if (!matchMedia('print').matches) restore(); }, 1000);
}
$('btnPdf').addEventListener('click', printResult);
$('modeLib').addEventListener('click', () => setListenMode('lib'));
$('modeMock').addEventListener('click', () => setListenMode('mock'));
$('modeRec').addEventListener('click', () => setSpeakMode('rec'));
$('modeText').addEventListener('click', () => setSpeakMode('text'));
$('modeTest').addEventListener('click', () => setSpeakMode('test'));
document.querySelectorAll('.studio[data-studio]').forEach(b => b.addEventListener('click', () => setTask(b.dataset.studio === 'speaking' ? 'speaking' : (store('mj_wtask') === 'writing_task1' ? 'writing_task1' : 'writing_task2'))));
$('bankSelect').addEventListener('change', pickBank);
$('btnTestStart').addEventListener('click', startTest);
$('btnTestRec').addEventListener('click', () => { if (tRec && tRec.state === 'recording') stopTestRec(); });
$('btnMockMic').addEventListener('click', runMicCheck);
$('testSummary').addEventListener('click', ev => { const b = ev.target.closest('.redoBtn'); if (b) { tRedo = true; $('testRun').scrollIntoView({ block: 'start' }); runItem(Number(b.dataset.k)); } });
$('btnTestFinish').addEventListener('click', finishTest);
$('btnTestPrep').addEventListener('click', () => { if (tPrepSkip) tPrepSkip(); });
$('btnTestQuit').addEventListener('click', () => { if (confirm('Leave this mock test? Your answers so far will be lost and nothing is used from your plan.')) resetTest(); });
$('mistakeList').addEventListener('click', ev => { const b = ev.target.closest('.drillBtn'); if (b) runDrill(JSON.parse(b.dataset.fix), b.closest('li')); });
document.querySelectorAll('.part').forEach(b => b.addEventListener('click', () => {
  part = Number(b.dataset.part);
  document.querySelectorAll('.part').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  renderQSelect();
}));
$('qSelect').addEventListener('change', () => pickQ($('qSelect').value));
$('report').addEventListener('click', onReportClick);
$('draftNote').addEventListener('click', ev => { if (ev.target.closest('#btnEndRev')) endRevision(); });
// When the minute of preparation is over, the timer stops at 0:00 and beeps until the student starts recording
// (or presses "Stop the sound"); it never runs on by itself. The beeping stops on its own after 60 seconds.
const alarm = { on: false, t: null, stopT: null, ctx: null, btn: null, label: '' };
function beepOnce() { try { alarm.ctx = alarm.ctx || new (window.AudioContext || window.webkitAudioContext)(); const o = alarm.ctx.createOscillator(), g = alarm.ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.18; o.connect(g); g.connect(alarm.ctx.destination); o.start(); o.stop(alarm.ctx.currentTime + 0.3); } catch (e) {} }
function startAlarm(btn) {
  stopAlarm(); alarm.on = true; alarm.btn = btn; alarm.label = btn.textContent; btn.textContent = 'Stop the sound';
  beepOnce(); alarm.t = setInterval(beepOnce, 700); alarm.stopT = setTimeout(stopAlarm, 60000);
}
function stopAlarm() { clearInterval(alarm.t); clearTimeout(alarm.stopT); if (alarm.btn) alarm.btn.textContent = alarm.label; alarm.on = false; alarm.btn = null; }
$('btnPrep').addEventListener('click', () => {
  if (alarm.on) { stopAlarm(); return; }
  try { (alarm.ctx = alarm.ctx || new (window.AudioContext || window.webkitAudioContext)()).resume(); } catch (e) {} // phones only allow sound after a tap
  clearInterval(prepTick); let left = 60; $('prepTimer').textContent = 'Preparation: 1:00';
  prepTick = setInterval(() => { left--; $('prepTimer').textContent = left > 0 ? 'Preparation: ' + fmtTime(left) : 'Time is up: 0:00. Press Start recording.'; if (left <= 0) { clearInterval(prepTick); startAlarm($('btnPrep')); } }, 1000);
});
$('btnRec').addEventListener('click', () => { if (recorder && recorder.state === 'recording') stopRecording(); else startRecording(); });
$('btnAgain').addEventListener('click', resetRecording);
$('btnSend').addEventListener('click', sendRecording);
$('planChip').addEventListener('click', () => { if (window.openAccount) window.openAccount(accessCode ? 'in' : undefined); else openCode(); });
$('codeForm').addEventListener('submit', saveCode);
$('btnCodeClose').addEventListener('click', () => $('codeDialog').close());
$('btnCodeRemove').addEventListener('click', removeCode);
document.querySelectorAll('.trendBtn').forEach(b => b.addEventListener('click', () => {
  trendSkill = b.dataset.skill; document.querySelectorAll('.trendBtn').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderTrend();
}));

let startParams = new URLSearchParams(location.search);
const urlHadTask = !!startParams.get('task');
if (!urlHadTask) { try { const r = JSON.parse(store('mj_start') || 'null'); if (r && typeof r.s === 'string' && Date.now() - r.t < 7200000) startParams = new URLSearchParams(r.s); } catch (e) {} } // 2 hours
const startTask = startParams.get('task');
setTask(TASKS[startTask] ? startTask : (store('mj_wtask') === 'writing_task1' ? 'writing_task1' : 'writing_task2'));
if (urlHadTask) rememberStart(location.search); // keep question and type from the link
if (startTask === 'speaking' && startParams.get('mode') === 'test') setSpeakMode('test');
if (startTask === 'listening' && startParams.get('mode') === 'mock') setListenMode('mock');
if (startTask === 'writing_task1' && startParams.get('type') === 'general') { $('testType').value = 'general'; applyBlocks(); } // /writing links to Task 1 General
// Practice Studio bridge: the Studio fills the normal Writing form and uses the normal check screen, so allowances, refunds and duplicate protection are unchanged.
window.WSBridge = {
  bank: () => BANK,
  submit(w, text) {
    if (busyNow || !BANK) return false;
    setTask(w.task);
    if (w.testType) { $('testType').value = w.testType; applyBlocks(); }
    bankId = w.id; $('questionText').value = w.question; $('materialText').value = w.material || ''; chart = null; $('chartThumb').innerHTML = '';
    source = 'typed'; $('inputText').value = text; updateCount();
    runCheck();
    const cp = $('checkPanel'); if (cp && !cp.hidden) cp.scrollIntoView({ behavior: 'smooth', block: 'center' }); else $('inputText').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  },
};
fetch('/api/config').then(r => r.json()).then(c => { CONFIG = c; renderPlans(); }).catch(() => { $('planCards').innerHTML = '<p class="status">Plans could not be loaded. Email support@writspeak.com.</p>'; });
api('/api/bank').then(b => {
  BANK = b; try { if (ME) renderNextTask(); } catch (e) {}
  const q = startParams.get('q'), w = q && bankQuestions().find(x => x.id === q && x.task === task);
  if (w && w.testType && task === 'writing_task1' && $('testType').value !== w.testType) { $('testType').value = w.testType; applyBlocks(); }
  if (task.startsWith('writing')) renderBankSelect();
  if (w) { $('bankSelect').value = w.id; pickBank(); }
  renderTestSetup(); renderNext(); renderSpCards();
}).catch(() => {});
api('/api/questions').then(q => { if (!Array.isArray(q)) throw new Error('question response'); QUESTIONS = q; renderQSelect(); }).catch(() => { $('qBox').textContent = 'Questions could not be loaded. Check your connection and refresh the page.'; });
loadMe();
// Installable website: register the service worker and offer an "Install app" button where the browser supports it.
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('btnInstall').hidden = false; });
$('btnInstall').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; $('btnInstall').hidden = true; });
window.addEventListener('appinstalled', () => { $('btnInstall').hidden = true; });
const linkCode = new URLSearchParams(location.search).get('code');
if (linkCode && linkCode !== accessCode) { openCode(); $('codeInput').value = linkCode.slice(0, 20); history.replaceState(null, '', location.pathname + location.hash); }
})();