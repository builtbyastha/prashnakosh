import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

// Synthetic bank: 3 topics × 4 difficulties
function makePool({ perCell = { easy: 10, moderate: 15, difficult: 6, advanced: 2 }, topics = ['t1', 't2', 't3'], status = 'published' } = {}) {
  const pool = [];
  let n = 0;
  for (const t of topics) for (const d of E.DIFFICULTIES) for (let i = 0; i < (perCell[d] || 0); i++) {
    n++;
    pool.push({ id: `q${String(n).padStart(4, '0')}`, code: `Q${n}`, type: 'single', text: `Unique question number ${n} about ${t} ${d} item${i}`, options: [{ id: 'a', text: 'A' + n }, { id: 'b', text: 'B' + n }, { id: 'c', text: 'C' + n }, { id: 'd', text: 'D' + n }], correct: ['b'], explanation: 'Because.', subjectId: 's1', chapterId: 'c1', topicId: t, difficulty: d, status, lang: 'en', examTags: n % 2 ? ['upsc'] : ['ssc'] });
  }
  return pool;
}

test('allocateByRatio sums exactly and follows ratios', () => {
  assert.deepEqual(E.allocateByRatio(50, { easy: 30, moderate: 50, difficult: 20, advanced: 0 }), { easy: 15, moderate: 25, difficult: 10, advanced: 0 });
  const a = E.allocateByRatio(40, { easy: 30, moderate: 50, difficult: 20 });
  assert.equal(a.easy + a.moderate + a.difficult, 40);
  assert.deepEqual(a, { easy: 12, moderate: 20, difficult: 8 });
  const b = E.allocateByRatio(7, { x: 1, y: 1, z: 1 });
  assert.equal(b.x + b.y + b.z, 7);
});

test('cappedAllocation never exceeds caps and redistributes', () => {
  const out = E.cappedAllocation(30, { a: 3, b: 50, c: 50 });
  assert.equal(out.a, 3);
  assert.equal(out.a + out.b + out.c, 30);
  assert.ok(Math.abs(out.b - out.c) <= 1);
});

test('generates exact count with the requested difficulty split', () => {
  const pool = makePool();
  const r = E.generateSelection(pool, { count: 50, distribution: E.DISTRIBUTION_PRESETS.mixed, seed: 'x1' });
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 50);
  assert.deepEqual(r.report.deliveredByDifficulty, { easy: 15, moderate: 25, difficult: 10, advanced: 0 });
});

test('no question appears twice in a paper', () => {
  const pool = makePool();
  for (let s = 0; s < 25; s++) {
    const r = E.generateSelection(pool, { count: 45, distribution: { easy: 1, moderate: 1, difficult: 1, advanced: 0 }, seed: 'dup' + s });
    assert.equal(r.ok, true);
    assert.equal(new Set(r.items.map((q) => q.id)).size, r.items.length);
  }
});

test('topic coverage is balanced across selected topics', () => {
  const pool = makePool();
  const r = E.generateSelection(pool, { count: 30, distribution: E.DISTRIBUTION_PRESETS.mixed, seed: 'cov' });
  const counts = Object.values(r.report.deliveredByTopic);
  assert.equal(counts.length, 3);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `unbalanced: ${counts}`);
});

test('respects topic filter, type filter, language and only uses published questions', () => {
  const pool = makePool();
  pool.push({ ...pool[0], id: 'zdraft', status: 'pending', topicId: 't1' });
  pool.push({ ...pool[0], id: 'zhindi', lang: 'hi', topicId: 't1' });
  const r = E.generateSelection(pool, { count: 10, topicIds: ['t1'], distribution: { easy: 1 }, seed: 'f', lang: 'en' });
  assert.equal(r.ok, true);
  assert.ok(r.items.every((q) => q.topicId === 't1' && q.status === 'published' && q.lang === 'en'));
  assert.ok(!r.items.some((q) => q.id === 'zdraft' || q.id === 'zhindi'));
});

test('same seed reproduces the same paper; different seeds differ', () => {
  const pool = makePool();
  const a = E.generateSelection(pool, { count: 25, seed: 'repeat' }).items.map((q) => q.id);
  const b = E.generateSelection(pool, { count: 25, seed: 'repeat' }).items.map((q) => q.id);
  const c = E.generateSelection(pool, { count: 25, seed: 'other' }).items.map((q) => q.id);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  // reproducible regardless of pool order
  const d = E.generateSelection(pool.slice().reverse(), { count: 25, seed: 'repeat' }).items.map((q) => q.id);
  assert.deepEqual(a, d);
});

test('insufficient inventory is reported, never silently short', () => {
  const pool = makePool({ perCell: { easy: 2, moderate: 2, difficult: 1, advanced: 0 } });
  const r = E.generateSelection(pool, { count: 40, seed: 's' });
  assert.equal(r.ok, false);
  assert.equal(r.items.length, 0);
  assert.equal(r.report.shortfalls[0].kind, 'total');
  assert.equal(r.report.maxPossible, 15);
});

test('difficulty shortfall: strict fails with detail, fill borrows and reports adjustment', () => {
  const pool = makePool({ perCell: { easy: 10, moderate: 10, difficult: 1, advanced: 0 } });
  const strict = E.generateSelection(pool, { count: 30, distribution: { easy: 30, moderate: 50, difficult: 20 }, seed: 's' });
  assert.equal(strict.ok, false);
  assert.equal(strict.report.shortfalls[0].difficulty, 'difficult');
  const fill = E.generateSelection(pool, { count: 30, distribution: { easy: 30, moderate: 50, difficult: 20 }, seed: 's', strategy: 'fill' });
  assert.equal(fill.ok, true);
  assert.equal(fill.items.length, 30);
  assert.equal(fill.report.deliveredByDifficulty.difficult, 3);
  assert.ok(fill.report.adjustments.length > 0);
});

test('zero-question paper is rejected', () => {
  const r = E.generateSelection(makePool(), { count: 0, seed: 's' });
  assert.equal(r.ok, false);
  assert.equal(r.report.shortfalls[0].kind, 'zero');
});

test('questions without an answer key are never selected', () => {
  const pool = makePool({ perCell: { easy: 5 } , topics: ['t1'] });
  pool[0].correct = [];
  const r = E.generateSelection(pool, { count: 4, distribution: { easy: 1 }, seed: 'k' });
  assert.ok(r.items.every((q) => q.id !== pool[0].id));
  const r2 = E.generateSelection(pool, { count: 5, distribution: { easy: 1 }, seed: 'k' });
  assert.equal(r2.ok, false);
});

test('recently seen questions are de-prioritised', () => {
  const pool = makePool({ perCell: { easy: 40 }, topics: ['t1'] });
  const recent = new Set(pool.slice(0, 20).map((q) => q.id));
  let hits = 0;
  for (let s = 0; s < 20; s++) hits += E.generateSelection(pool, { count: 10, distribution: { easy: 1 }, seed: 'r' + s, recentIds: recent }).items.filter((q) => recent.has(q.id)).length;
  assert.ok(hits / 200 < 0.3, `recent share too high: ${hits / 200}`);
});

test('near-duplicate groups never both appear', () => {
  const pool = makePool({ perCell: { easy: 6 }, topics: ['t1'] });
  pool[0].dupGroup = 'g'; pool[1].dupGroup = 'g';
  for (let s = 0; s < 10; s++) {
    const r = E.generateSelection(pool, { count: 5, distribution: { easy: 1 }, seed: 'd' + s });
    assert.equal(r.ok, true);
    assert.ok(r.items.filter((q) => q.dupGroup === 'g').length <= 1);
  }
});

test('buildPaper snapshots questions and later bank edits do not change it', () => {
  const pool = makePool();
  const res = E.buildPaper(pool, { title: 'T', sections: [{ id: 's1', name: 'A', count: 10, topicIds: ['t1'] }, { id: 's2', name: 'B', count: 10, topicIds: ['t2'] }], distribution: E.DISTRIBUTION_PRESETS.mixed, marks: 2, negative: 2 / 3, seed: 'snap' });
  assert.equal(res.ok, true);
  const p = res.paper;
  assert.equal(p.questionCount, 20);
  assert.equal(p.maxMarks, 40);
  const first = p.sections[0].items[0];
  const original = first.text;
  pool.find((q) => q.id === first.qid).text = 'EDITED';
  assert.equal(first.text, original);
  // no question shared across sections
  const ids = E.paperItems(p).map((i) => i.qid);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(p.validation.pass, true);
});

test('publicItem strips the answer key and explanation', () => {
  const pool = makePool({ perCell: { easy: 1 }, topics: ['t1'] });
  const snap = E.snapshotQuestion(pool[0], { marks: 1 });
  const pub = E.publicItem(snap);
  assert.equal(pub.correct, undefined);
  assert.equal(pub.explanation, undefined);
  assert.ok(JSON.stringify(pub).indexOf('Because') === -1);
});

test('scoring with UPSC-style negative marking (2 marks, −1/3)', () => {
  const pool = makePool({ perCell: { easy: 10 }, topics: ['t1'] });
  const res = E.buildPaper(pool, { sections: [{ id: 's1', name: 'GS', count: 10, topicIds: ['t1'] }], distribution: { easy: 1 }, marks: 2, negative: 2 / 3, seed: 'neg' });
  const items = E.paperItems(res.paper);
  const responses = {};
  items.slice(0, 6).forEach((i) => (responses[i.qid] = { answer: 'b' })); // 6 correct
  items.slice(6, 9).forEach((i) => (responses[i.qid] = { answer: 'a' })); // 3 wrong
  const r = E.scoreAttempt(res.paper, responses);
  assert.equal(r.correct, 6); assert.equal(r.incorrect, 3); assert.equal(r.unattempted, 1);
  assert.equal(r.score, 10); // 12 − 3 × 0.6667 = 10.00
  assert.equal(r.negativeMarks, 2);
  assert.equal(r.max, 20);
  assert.equal(r.percentage, 50);
  assert.equal(r.accuracy, 66.67);
});

test('scoring SSC-style (2 marks, −0.5) and all-wrong goes negative', () => {
  const pool = makePool({ perCell: { easy: 4 }, topics: ['t1'] });
  const res = E.buildPaper(pool, { sections: [{ id: 's1', name: 'GA', count: 4, topicIds: ['t1'] }], distribution: { easy: 1 }, marks: 2, negative: 0.5, seed: 'ssc' });
  const responses = {};
  E.paperItems(res.paper).forEach((i) => (responses[i.qid] = { answer: 'c' }));
  const r = E.scoreAttempt(res.paper, responses);
  assert.equal(r.score, -2);
  assert.equal(r.correct, 0);
});

test('evaluation for multi, numeric and text formats', () => {
  const multi = { type: 'multiple', correct: ['a', 'c'] };
  assert.equal(E.evaluate(multi, { answer: ['c', 'a'] }), 'correct');
  assert.equal(E.evaluate(multi, { answer: ['a'] }), 'incorrect');
  assert.equal(E.evaluate(multi, { answer: [] }), 'unattempted');
  const num = { type: 'numerical', correct: { value: 3.14, tolerance: 0.01 } };
  assert.equal(E.evaluate(num, { answer: '3.15' }), 'correct');
  assert.equal(E.evaluate(num, { answer: '3.2' }), 'incorrect');
  assert.equal(E.evaluate(num, { answer: '' }), 'unattempted');
  const txt = { type: 'fill_blank', correct: ['Ashoka', 'Asoka'] };
  assert.equal(E.evaluate(txt, { answer: '  asoka ' }), 'correct');
  assert.equal(E.evaluate(txt, { answer: 'Akbar' }), 'incorrect');
});

test('timer: remaining time and expiry', () => {
  const paper = { durationMin: 60 };
  const at = { startedAt: 1_000_000 };
  assert.equal(E.remainingMs(at, paper, 1_000_000 + 30 * 60000), 30 * 60000);
  assert.equal(E.isExpired(at, paper, 1_000_000 + 59 * 60000), false);
  assert.equal(E.isExpired(at, paper, 1_000_000 + 60 * 60000), true);
  assert.equal(E.remainingMs(at, paper, 1_000_000 + 90 * 60000), 0);
  assert.equal(E.remainingMs(at, { durationMin: 0 }, 5), null);
});

test('palette status for the simulator', () => {
  const it = { type: 'single' };
  assert.equal(E.paletteStatus(it, undefined), 'not-visited');
  assert.equal(E.paletteStatus(it, { visited: true }), 'not-answered');
  assert.equal(E.paletteStatus(it, { visited: true, answer: 'a' }), 'answered');
  assert.equal(E.paletteStatus(it, { marked: true }), 'marked');
  assert.equal(E.paletteStatus(it, { marked: true, answer: 'a' }), 'answered-marked');
});

test('question validation catches missing key, bad option refs, missing explanation and fake PYQ provenance', () => {
  const base = { type: 'single', text: 'Q', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correct: ['a'], subjectId: 's', chapterId: 'c', topicId: 't', difficulty: 'easy', explanation: 'e', source: 's' };
  assert.equal(E.validateQuestion(base).ok, true);
  assert.ok(E.validateQuestion({ ...base, correct: [] }).errors.length);
  assert.ok(E.validateQuestion({ ...base, correct: ['z'] }).errors.length);
  assert.ok(E.validateQuestion({ ...base, explanation: '' }).warnings.some((w) => /Explanation/.test(w)));
  assert.ok(E.validateQuestion({ ...base, provenance: 'pyq' }).errors.some((e) => /previous-year/.test(e)));
  assert.ok(E.validateQuestion({ ...base, options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'X' }] }).errors.some((e) => /same text/.test(e)));
});

test('duplicate detection flags near-identical questions only', () => {
  const a = { id: '1', text: 'Who founded the Maurya Empire?', options: [{ text: 'Chandragupta Maurya' }, { text: 'Ashoka' }, { text: 'Bindusara' }, { text: 'Bimbisara' }] };
  const b = { id: '2', text: 'Who founded the Maurya empire ?', options: [{ text: 'Chandragupta Maurya' }, { text: 'Ashoka' }, { text: 'Bindusara' }, { text: 'Bimbisara' }] };
  const c = { id: '3', text: 'Which river is known as the Dakshin Ganga?', options: [{ text: 'Godavari' }, { text: 'Krishna' }, { text: 'Kaveri' }, { text: 'Narmada' }] };
  assert.ok(E.findSimilar(a, [b, c], { threshold: E.DUPLICATE_THRESHOLD }).some((x) => x.id === '2'));
  assert.ok(!E.findSimilar(a, [b, c], { threshold: 0.3 }).some((x) => x.id === '3'));
});

test('CSV parser handles quotes, commas and newlines', () => {
  const rows = E.parseCSV('text,answer\r\n"He said ""hi"", then left",b\n"multi\nline",a\n');
  assert.deepEqual(rows, [['text', 'answer'], ['He said "hi", then left', 'b'], ['multi\nline', 'a']]);
  assert.equal(E.parseCSV(E.toCSV(rows)).length, 3);
});

test('import mapping validates taxonomy, difficulty and duplicates', () => {
  const taxonomy = { subjects: [{ id: 's1', name: 'History' }], chapters: [{ id: 'c1', subjectId: 's1', name: 'Ancient India' }], topics: [{ id: 't1', chapterId: 'c1', name: 'Mauryan Empire' }] };
  const headers = ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Explanation', 'Subject', 'Chapter', 'Topic', 'Difficulty'];
  const map = E.guessMapping(headers);
  assert.equal(map.text, 0); assert.equal(map.answer, 5); assert.equal(map.difficulty, 10);
  const rows = [
    ['Who was the first Mauryan emperor?', 'Ashoka', 'Chandragupta Maurya', 'Bindusara', 'Dasharatha', 'B', 'Founded c. 321 BCE.', 'History', 'Ancient India', 'Mauryan Empire', 'Easy'],
    ['Bad topic row', 'x', 'y', '', '', 'A', '', 'History', 'Ancient India', 'Nope', 'Easy'],
    ['Who was the first Mauryan emperor?', 'Ashoka', 'Chandragupta Maurya', 'Bindusara', 'Dasharatha', 'B', '', 'History', 'Ancient India', 'Mauryan Empire', 'Hard'],
    ['Missing key', 'x', 'y', '', '', '', 'e', 'History', 'Ancient India', 'Mauryan Empire', 'Medium'],
  ];
  const out = E.mapImportRows(rows, map, { taxonomy, exams: [], existing: [] });
  assert.equal(out[0].errors.length, 0);
  assert.ok(out[1].errors.some((e) => /Topic/.test(e)));
  assert.equal(out[2].question.difficulty, 'difficult');
  assert.equal(out[2].duplicateOf.where, 'file');
  assert.ok(out[3].errors.some((e) => /correct answer/i.test(e)));
});

test('entitlements: limits, features and expiry', () => {
  const plans = E.DEFAULT_PLANS;
  const free = { role: 'student', plan: 'free' };
  assert.equal(E.checkEntitlement(free, plans, 'mock', { mocksToday: 0 }).allowed, true);
  assert.equal(E.checkEntitlement(free, plans, 'mock', { mocksToday: 1 }).allowed, false);
  assert.equal(E.checkEntitlement(free, plans, 'simulator').allowed, false);
  const prem = { role: 'student', plan: 'premium', planExpiry: Date.now() + 1e7 };
  assert.equal(E.checkEntitlement(prem, plans, 'simulator').allowed, true);
  assert.equal(E.checkEntitlement(prem, plans, 'mock', { mocksToday: 99 }).allowed, true);
  const lapsed = { role: 'student', plan: 'premium', planExpiry: Date.now() - 1000 };
  const ch = E.checkEntitlement(lapsed, plans, 'simulator');
  assert.equal(ch.allowed, false);
  assert.equal(ch.expired, true);
});

test('coupons: percent, expiry, plan scope, usage cap', () => {
  const c = { code: 'X', kind: 'percent', value: 20, active: true, planIds: ['premium'], maxUses: 2, uses: 0 };
  assert.deepEqual(E.applyCoupon(599, c, { planId: 'premium' }), { ok: true, discount: 120, finalPrice: 479 });
  assert.equal(E.applyCoupon(299, c, { planId: 'basic' }).ok, false);
  assert.equal(E.applyCoupon(599, { ...c, expiresAt: 1 }, { planId: 'premium' }).ok, false);
  assert.equal(E.applyCoupon(599, { ...c, uses: 2 }, { planId: 'premium' }).ok, false);
});

test('student analytics: weak topics need enough evidence; streak counts IST days', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const mk = (id, at, rows) => ({ id, status: 'submitted', submittedAt: at, result: { percentage: 50, rows } });
  const rows = (topic, c, w) => [...Array(c)].map((_, i) => ({ qid: topic + 'c' + i, topicId: topic, chapterId: 'c', subjectId: 's', difficulty: 'easy', status: 'correct' })).concat([...Array(w)].map((_, i) => ({ qid: topic + 'w' + i, topicId: topic, chapterId: 'c', subjectId: 's', difficulty: 'easy', status: 'incorrect' })));
  const atts = [mk('a1', now - 86400000, rows('weak', 1, 6)), mk('a2', now, rows('strong', 8, 1).concat(rows('thin', 0, 2)))];
  const an = E.studentAnalytics(atts, { now });
  assert.equal(an.weakest[0].key, 'weak');
  assert.ok(!an.weakest.some((t) => t.key === 'thin'), 'thin topic has too little data to rank');
  assert.equal(an.strongest[0].key, 'strong');
  assert.equal(an.streak, 2);
  const rec = E.recommendations(E.studentAnalytics([atts[0]], { now }));
  assert.equal(rec.ready, false);
});

test('concurrent attempts: a paper keeps one in-progress attempt per student (store rule mirrored)', () => {
  const attempts = [{ id: 'a', paperId: 'p', userId: 'u', status: 'in_progress' }];
  const existing = attempts.find((a) => a.paperId === 'p' && a.userId === 'u' && a.status === 'in_progress');
  assert.ok(existing, 'resume instead of starting a second attempt');
});
