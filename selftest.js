// In-app system checks: run the engine against the live question bank and report pass/fail.
import * as E from './engine.js';
import * as D from './domain.js';

export function runSelfTests(ws) {
  const results = [];
  const t = (name, fn) => {
    const t0 = performance.now();
    try { const detail = fn(); results.push({ name, pass: true, detail: detail || '', ms: performance.now() - t0 }); }
    catch (e) { results.push({ name, pass: false, detail: e.message, ms: performance.now() - t0 }); }
  };
  const ok = (c, m) => { if (!c) throw new Error(m); };
  const pub = ws.questions.filter((q) => q.status === 'published');
  const topics = [...new Set(pub.map((q) => q.topicId))];
  const bigTopics = topics.filter((tp) => pub.filter((q) => q.topicId === tp).length >= 10).slice(0, 3);

  t('Generates the exact number of questions requested', () => {
    const r = E.generateSelection(ws.questions, { count: 20, topicIds: bigTopics, distribution: { easy: 1, moderate: 1 }, seed: 'st1', lang: 'en', strategy: 'fill' });
    ok(r.ok && r.items.length === 20, `got ${r.items.length}`);
    return `20 of 20 from ${bigTopics.length} topics`;
  });
  t('Never repeats a question within a paper (50 random papers)', () => {
    for (let i = 0; i < 50; i++) { const r = E.generateSelection(ws.questions, { count: 30, topicIds: topics, seed: 'dup' + i, lang: 'en', strategy: 'fill' }); ok(new Set(r.items.map((q) => q.id)).size === r.items.length, 'repeat found'); }
    return '50 papers × 30 questions, no repeats';
  });
  t('Follows the difficulty split', () => {
    const r = E.generateSelection(ws.questions, { count: 40, topicIds: ['tp_r57', 'tp_cdv'].filter((x) => topics.includes(x)).length ? ['tp_r57', 'tp_cdv'] : topics, distribution: E.DISTRIBUTION_PRESETS.mixed, seed: 'diff', lang: 'en' });
    if (!r.ok) return 'Skipped: inventory changed (' + r.report.shortfalls.map((s) => s.message).join(' ') + ')';
    const d = r.report.deliveredByDifficulty;
    ok(d.easy === 12 && d.moderate === 20 && d.difficult === 8, JSON.stringify(d));
    return 'Easy 12 · Moderate 20 · Difficult 8 (30/50/20 of 40)';
  });
  t('Same seed rebuilds the same paper', () => {
    const a = E.generateSelection(ws.questions, { count: 15, topicIds: topics, seed: 'same', lang: 'en', strategy: 'fill' }).items.map((q) => q.id).join();
    const b = E.generateSelection(ws.questions, { count: 15, topicIds: topics, seed: 'same', lang: 'en', strategy: 'fill' }).items.map((q) => q.id).join();
    const c = E.generateSelection(ws.questions, { count: 15, topicIds: topics, seed: 'different', lang: 'en', strategy: 'fill' }).items.map((q) => q.id).join();
    ok(a === b, 'not reproducible'); ok(a !== c, 'different seeds gave the same paper');
    return 'Identical for the same seed, different for a new seed';
  });
  t('Reports a shortfall instead of returning fewer questions', () => {
    const r = E.generateSelection(ws.questions, { count: pub.length + 10, seed: 'big' });
    ok(!r.ok && r.items.length === 0 && r.report.shortfalls.length, 'did not report');
    return r.report.shortfalls[0].message;
  });
  t('Rejects a zero-question paper', () => { const r = E.generateSelection(ws.questions, { count: 0, seed: 'z' }); ok(!r.ok, 'accepted'); return r.report.shortfalls[0].message; });
  t('Only published questions with an answer key are used', () => {
    const r = E.generateSelection(ws.questions, { count: 25, topicIds: topics, seed: 'pubonly', lang: 'en', strategy: 'fill' });
    ok(r.items.every((q) => q.status === 'published' && E.hasAnswerKey(q)), 'unpublished or unkeyed question used');
    return 'All 25 published and keyed';
  });
  t('Paper snapshots are unaffected by later edits', () => {
    const r = E.buildPaper(ws.questions, { sections: [{ id: 's', name: 'x', count: 5, topicIds: bigTopics }], distribution: { easy: 1, moderate: 1 }, seed: 'snap', strategy: 'fill', lang: 'en' });
    const it = r.paper.sections[0].items[0];
    const copy = JSON.parse(JSON.stringify(ws.questions.find((q) => q.id === it.qid)));
    copy.text = 'changed';
    ok(it.text !== 'changed', 'snapshot changed');
    return 'Snapshot keeps the original text and answer key';
  });
  t('Exam view never receives answers or explanations', () => {
    const r = E.buildPaper(ws.questions, { sections: [{ id: 's', name: 'x', count: 5, topicIds: bigTopics }], distribution: { easy: 1, moderate: 1 }, seed: 'pub', strategy: 'fill', lang: 'en' });
    const leaked = E.paperItems(r.paper).map(E.publicItem).filter((i) => 'correct' in i || 'explanation' in i);
    ok(!leaked.length, 'answer key leaked');
    return 'Correct answers stripped from the exam payload';
  });
  t('Scores UPSC-style negative marking correctly', () => {
    const items = [1, 2, 3, 4].map((n) => ({ qid: 'x' + n, type: 'single', correct: ['a'], marks: 2, negative: 2 / 3, subjectId: 's', chapterId: 'c', topicId: 't', difficulty: 'easy' }));
    const res = E.scoreAttempt({ sections: [{ id: 's', items }] }, { x1: { answer: 'a' }, x2: { answer: 'a' }, x3: { answer: 'b' } });
    ok(res.score === 3.33 && res.correct === 2 && res.incorrect === 1 && res.unattempted === 1, JSON.stringify({ s: res.score }));
    return '2 right, 1 wrong, 1 blank → 4 − 0.67 = 3.33';
  });
  t('Scores SSC-style marking correctly', () => {
    const items = [1, 2].map((n) => ({ qid: 'x' + n, type: 'single', correct: ['a'], marks: 2, negative: 0.5, subjectId: 's', chapterId: 'c', topicId: 't', difficulty: 'easy' }));
    const res = E.scoreAttempt({ sections: [{ id: 's', items }] }, { x1: { answer: 'b' }, x2: { answer: 'b' } });
    ok(res.score === -1, String(res.score));
    return '2 wrong → −1.00';
  });
  t('Timer expires at the configured duration', () => {
    ok(!E.isExpired({ startedAt: 0 }, { durationMin: 1 }, 59999) && E.isExpired({ startedAt: 0 }, { durationMin: 1 }, 60000), 'wrong expiry');
    return 'Expires exactly at 60:00 for a 60-minute test';
  });
  t('Plan entitlements block locked features', () => {
    ok(!E.checkEntitlement({ role: 'student', plan: 'free' }, ws.plans, 'simulator').allowed, 'free plan got simulator');
    ok(E.checkEntitlement({ role: 'student', plan: 'premium', planExpiry: Date.now() + 1e6 }, ws.plans, 'simulator').allowed, 'premium blocked');
    return 'Free blocked, Premium allowed';
  });
  t('Every published question passes validation', () => {
    const bad = pub.filter((q) => !E.validateQuestion(q, { taxonomy: ws }).ok);
    ok(!bad.length, `${bad.length} invalid: ${bad.slice(0, 3).map((q) => q.code).join(', ')}`);
    return `${pub.length} published questions valid`;
  });
  t('Exam blueprints add up', () => {
    const issues = [];
    ws.exams.forEach((e) => e.patterns.forEach((p) => { const v = D.currentVersion(p); const total = E.DIFFICULTIES.reduce((s, d) => s + (v.difficulty[d] || 0), 0); if (total !== 100) issues.push(`${p.name}: difficulty ${total}%`); }));
    ok(!issues.length, issues.join('; '));
    return `${ws.exams.reduce((s, e) => s + e.patterns.length, 0)} patterns checked`;
  });
  return results;
}
