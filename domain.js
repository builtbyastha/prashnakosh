// Domain helpers that work on the whole workspace object (still pure: no DOM, no storage).
import * as E from './engine.js';

export const byId = (list, id) => list.find((x) => x.id === id);
export const currentVersion = (pattern) => pattern.versions.find((v) => v.v === pattern.currentV) || pattern.versions[pattern.versions.length - 1];

export function topicsForScope(ws, scope = {}) {
  const subj = scope.subjectIds && scope.subjectIds.length ? new Set(scope.subjectIds) : null;
  const chap = scope.chapterIds && scope.chapterIds.length ? new Set(scope.chapterIds) : null;
  const tops = scope.topicIds && scope.topicIds.length ? new Set(scope.topicIds) : null;
  return ws.topics.filter((t) => {
    if (t.archived) return false;
    const c = byId(ws.chapters, t.chapterId);
    if (!c || c.archived) return false;
    const s = byId(ws.subjects, c.subjectId);
    if (!s || s.archived) return false;
    if (subj && !subj.has(c.subjectId)) return false;
    if (chap && !chap.has(c.id)) return false;
    if (tops && !tops.has(t.id)) return false;
    return true;
  }).map((t) => t.id);
}

export function specFromPattern(ws, exam, pattern, version, opts = {}) {
  return {
    title: opts.title || `${exam.short || exam.name} · ${pattern.name}`,
    mode: opts.mode || 'simulator',
    examId: exam.id, patternId: pattern.id, patternVersion: version.v,
    sections: version.sections.map((s) => ({ id: s.id, name: s.name, count: s.count, topicIds: topicsForScope(ws, s), marks: s.marks ?? version.marksPerQ, negative: s.negative ?? round4(version.marksPerQ * version.negativeFraction), distribution: s.distribution })),
    distribution: version.difficulty,
    types: version.formats && version.formats.length ? version.formats : null,
    lang: opts.lang || 'en',
    seed: opts.seed, recentIds: opts.recentIds, strategy: opts.strategy || 'strict',
    shuffleOptions: !!version.shuffleOptions,
    durationMin: version.durationMin, mergeAs: version.mergeSections ? version.mergedName || pattern.name : null,
    answerRelease: 'after_submit', explanationRelease: 'after_submit',
    instructions: version.instructions,
  };
}
const round4 = (n) => Math.round(n * 10000) / 10000;

// How ready is a pattern, given today's published inventory? Uses a fixed seed: it's a capacity check, not a paper.
export function patternReadiness(ws, exam, pattern) {
  const v = currentVersion(pattern);
  const spec = specFromPattern(ws, exam, pattern, v, { seed: 'readiness' });
  const strict = E.buildPaper(ws.questions, spec);
  if (strict.ok) return { level: 'ready', label: 'Ready', reports: strict.reports };
  const fill = E.buildPaper(ws.questions, { ...spec, strategy: 'fill' });
  if (fill.ok) {
    const n = fill.reports.reduce((s, r) => s + r.adjustments.reduce((a, x) => a + x.count, 0), 0);
    return { level: 'substitute', label: `Ready with ${n} difficulty substitution${n === 1 ? '' : 's'}`, reports: fill.reports, strictReports: strict.reports };
  }
  const missing = fill.reports.filter((r) => r.shortfalls.length).map((r) => ({ name: r.name, shortfalls: r.shortfalls }));
  return { level: 'blocked', label: 'Not enough questions', reports: fill.reports, missing };
}

export function taxName(ws, id) {
  return (byId(ws.topics, id) || byId(ws.chapters, id) || byId(ws.subjects, id) || {}).name || id;
}
export function topicPath(ws, topicId) {
  const t = byId(ws.topics, topicId); if (!t) return '';
  const c = byId(ws.chapters, t.chapterId); const s = c && byId(ws.subjects, c.subjectId);
  return [s?.name, c?.name, t.name].filter(Boolean).join(' › ');
}

// Usage today (IST calendar day) for plan limits.
export function usageToday(ws, userId, now = Date.now()) {
  const today = E.dayKey(now);
  const mine = ws.attempts.filter((a) => a.userId === userId && E.dayKey(a.startedAt) === today);
  const practiceToday = mine.filter((a) => a.mode === 'practice' || a.mode === 'revision').reduce((s, a) => s + (byId(ws.papers, a.paperId)?.questionCount || 0), 0);
  const mocksToday = mine.filter((a) => ['custom', 'weakness', 'simulator', 'official'].includes(a.mode)).length;
  return { practiceToday, mocksToday };
}

export function recentQuestionIds(ws, userId, lastN = 5) {
  const atts = ws.attempts.filter((a) => a.userId === userId).sort((a, b) => b.startedAt - a.startedAt).slice(0, lastN);
  const ids = new Set();
  atts.forEach((a) => { const p = byId(ws.papers, a.paperId); p && E.paperItems(p).forEach((i) => ids.add(i.qid)); });
  return ids;
}

export function nextPaperCode(ws, ownerId, prefix = 'MT') {
  const n = ws.papers.filter((p) => (p.ownerId || null) === (ownerId || null) && (p.code || '').startsWith(prefix)).length + 1;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

export function questionCode(ws) {
  const max = ws.questions.reduce((m, q) => Math.max(m, Number(String(q.code || '').replace(/\D/g, '')) || 0), 0);
  return `PK-${String(max + 1).padStart(5, '0')}`;
}
