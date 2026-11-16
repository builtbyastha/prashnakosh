// Prashnakosh exam engine — pure functions, no DOM. Shared by the app and the Node test suite.

export const DIFFICULTIES = ['easy', 'moderate', 'difficult', 'advanced'];
export const DIFFICULTY_LABEL = { easy: 'Easy', moderate: 'Moderate', difficult: 'Difficult', advanced: 'Advanced' };
export const STATUSES = ['draft', 'pending', 'approved', 'published', 'archived', 'rejected'];
export const STATUS_LABEL = { draft: 'Draft', pending: 'Pending review', approved: 'Approved', published: 'Published', archived: 'Archived', rejected: 'Rejected' };
export const PROVENANCE_LABEL = {
  original: 'Original practice question',
  pyq: 'Previous-year question (verified)',
  ai_draft: 'AI-generated draft',
  licensed: 'Licensed content',
};

// Question-format registry. A new format is one entry here plus (optionally) an editor hint in the UI.
// kind decides how a response is captured and evaluated.
export const QUESTION_TYPES = {
  single: { label: 'Single-correct MCQ', kind: 'single' },
  multiple: { label: 'Multiple-correct MCQ', kind: 'multi' },
  assertion_reason: { label: 'Assertion and Reason', kind: 'single' },
  match: { label: 'Match the following', kind: 'single' },
  statement: { label: 'Statement-based', kind: 'single' },
  true_false: { label: 'True or False', kind: 'single' },
  fill_blank: { label: 'Fill in the blank', kind: 'text' },
  passage: { label: 'Passage-based', kind: 'single' },
  image: { label: 'Image / diagram-based', kind: 'single' },
  numerical: { label: 'Numerical answer', kind: 'numeric' },
  sequence: { label: 'Sequence / arrangement', kind: 'single' },
};
export const typeKind = (t) => (QUESTION_TYPES[t] || QUESTION_TYPES.single).kind;

export const AR_OPTIONS = [
  { id: 'a', text: 'Both A and R are true, and R is the correct explanation of A' },
  { id: 'b', text: 'Both A and R are true, but R is not the correct explanation of A' },
  { id: 'c', text: 'A is true, but R is false' },
  { id: 'd', text: 'A is false, but R is true' },
];

// ---------- Seeded randomness ----------
export function hashSeed(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const makeRng = (seed) => mulberry32(hashSeed(seed));
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function newSeed() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

// ---------- Allocation ----------
// Split `total` into integer parts proportional to `weights` (largest-remainder; deterministic tie-break by key order).
export function allocateByRatio(total, weights) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  const sum = keys.reduce((s, k) => s + weights[k], 0);
  const out = {};
  Object.keys(weights).forEach((k) => (out[k] = 0));
  if (!sum || total <= 0) return out;
  let used = 0;
  const rema = keys.map((k, i) => {
    const exact = (total * weights[k]) / sum;
    out[k] = Math.floor(exact);
    used += out[k];
    return { k, r: exact - out[k], i };
  });
  rema.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let i = 0; used < total; i++, used++) out[rema[i % rema.length].k]++;
  return out;
}

// Water-filling: share `total` across buckets in proportion to weights, never above each bucket's cap.
export function cappedAllocation(total, caps, weights) {
  const out = {};
  Object.keys(caps).forEach((k) => (out[k] = 0));
  let remaining = Math.min(total, Object.values(caps).reduce((s, c) => s + c, 0));
  let open = Object.keys(caps).filter((k) => caps[k] > 0 && (weights ? (weights[k] || 0) > 0 : true));
  if (!open.length) open = Object.keys(caps).filter((k) => caps[k] > 0);
  while (remaining > 0 && open.length) {
    const w = {};
    open.forEach((k) => (w[k] = weights ? weights[k] || 1e-6 : 1));
    const share = allocateByRatio(remaining, w);
    let gave = 0;
    open.forEach((k) => {
      const give = Math.min(share[k], caps[k] - out[k]);
      out[k] += give; gave += give;
    });
    remaining -= gave;
    open = open.filter((k) => out[k] < caps[k]);
    if (gave === 0) {
      // rounding stall: give one each to open buckets in order
      for (const k of open) { if (remaining <= 0) break; out[k]++; remaining--; }
      open = open.filter((k) => out[k] < caps[k]);
    }
  }
  return out;
}

export function normaliseDistribution(dist) {
  const d = {};
  DIFFICULTIES.forEach((k) => (d[k] = Math.max(0, Number(dist?.[k]) || 0)));
  return d;
}
export const DISTRIBUTION_PRESETS = {
  easy: { easy: 100, moderate: 0, difficult: 0, advanced: 0 },
  moderate: { easy: 0, moderate: 100, difficult: 0, advanced: 0 },
  difficult: { easy: 0, moderate: 0, difficult: 100, advanced: 0 },
  mixed: { easy: 30, moderate: 50, difficult: 20, advanced: 0 },
};

// ---------- Text similarity / duplicate detection ----------
const STOP = new Set('the a an of in on to and or is are was were which following who what with for by from as at be it its this that these those not correct incorrect statement statements consider given about'.split(' '));
export function normaliseText(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(s) {
  return new Set(normaliseText(s).split(' ').filter((w) => w && !STOP.has(w)));
}
export function questionFingerprint(q) {
  const opts = (q.options || []).map((o) => o.text).join(' ');
  return `${q.text || ''} ${(q.statements || []).join(' ')} ${opts}`;
}
export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / (A.size + B.size - inter);
}
export function findSimilar(q, pool, { threshold = 0.6, limit = 5 } = {}) {
  const fp = questionFingerprint(q);
  const out = [];
  for (const p of pool) {
    if (p.id === q.id || p.status === 'archived' || p.status === 'rejected') continue;
    const s = similarity(fp, questionFingerprint(p));
    if (s >= threshold) out.push({ id: p.id, code: p.code, text: p.text, score: Math.round(s * 100) / 100 });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}
export const DUPLICATE_THRESHOLD = 0.85;

// ---------- Question validation ----------
export function validateQuestion(q, { taxonomy, now = Date.now() } = {}) {
  const errors = [], warnings = [];
  const kind = typeKind(q.type);
  if (!QUESTION_TYPES[q.type]) errors.push(`Unknown question type "${q.type}".`);
  if (!String(q.text || '').trim()) errors.push('Question text is empty.');
  if (!q.subjectId || !q.chapterId || !q.topicId) errors.push('Subject, chapter and topic are all required.');
  if (taxonomy && q.topicId) {
    const t = taxonomy.topics.find((x) => x.id === q.topicId);
    if (!t) errors.push('The topic does not exist.');
    else if (t.chapterId !== q.chapterId) errors.push('The topic does not belong to the selected chapter.');
    const c = taxonomy.chapters.find((x) => x.id === q.chapterId);
    if (c && c.subjectId !== q.subjectId) errors.push('The chapter does not belong to the selected subject.');
  }
  if (!DIFFICULTIES.includes(q.difficulty)) errors.push('Difficulty must be Easy, Moderate, Difficult or Advanced.');
  if (kind === 'single' || kind === 'multi') {
    const opts = q.options || [];
    if (opts.length < 2) errors.push('At least two answer options are needed.');
    if (opts.some((o) => !String(o.text || '').trim())) errors.push('One or more options are blank.');
    const texts = opts.map((o) => normaliseText(o.text));
    if (new Set(texts).size !== texts.length) errors.push('Two options have the same text.');
    const correct = Array.isArray(q.correct) ? q.correct : [];
    if (!correct.length) errors.push('No correct answer is marked.');
    if (correct.some((c) => !opts.find((o) => o.id === c))) errors.push('The answer key points to an option that does not exist.');
    if (kind === 'single' && correct.length > 1) errors.push('A single-correct question has more than one answer marked.');
    if (kind === 'multi' && correct.length < 1) errors.push('Mark at least one correct option.');
  } else if (kind === 'text') {
    if (!Array.isArray(q.correct) || !q.correct.filter((x) => String(x).trim()).length) errors.push('Add at least one accepted answer.');
  } else if (kind === 'numeric') {
    if (!q.correct || typeof q.correct.value !== 'number' || Number.isNaN(q.correct.value)) errors.push('Add the numerical answer.');
  }
  if ((q.type === 'statement' || q.type === 'sequence') && !(q.statements || []).length) errors.push(q.type === 'sequence' ? 'Add the items to be arranged.' : 'Add the statements for a statement-based question.');
  if (q.type === 'assertion_reason' && !(String(q.assertion || '').trim() && String(q.reason || '').trim())) errors.push('Add both the Assertion and the Reason.');
  if (q.type === 'match' && (!(q.listA || []).length || !(q.listB || []).length)) errors.push('Add both lists for a match-the-following question.');
  if (q.type === 'passage' && !String(q.passage || '').trim()) errors.push('Add the passage text.');
  if (q.type === 'image' && !q.image) warnings.push('No image is attached to this image-based question.');
  if (!String(q.explanation || '').trim()) warnings.push('Explanation is missing.');
  if (q.provenance === 'pyq' && (!q.examYear || !String(q.source || '').trim())) errors.push('A previous-year question needs a verified source and exam year.');
  if (q.provenance !== 'pyq' && q.examYear) warnings.push('Exam year is set but the question is not marked as a verified previous-year question.');
  if (!String(q.source || '').trim()) warnings.push('Source / reference is missing.');
  if (q.reviewByDate && Date.parse(q.reviewByDate) < now) warnings.push('Contains time-sensitive facts that are past their review date.');
  if ((q.flags || []).some((f) => !f.resolved)) warnings.push('Has unresolved reports or flags.');
  return { errors, warnings, ok: errors.length === 0 };
}

// ---------- Paper generation ----------
/**
 * generateSelection: pick `count` questions from `pool`.
 * opts: { count, distribution, topicIds, types, lang, seed, examId, recentIds:Set, excludeIds:Set,
 *         topicWeights, strategy:'strict'|'fill', randomise:true }
 * Returns { ok, items, report }. When ok is false, items is empty and report.shortfalls says why.
 */
export function generateSelection(pool, opts) {
  const count = Math.floor(Number(opts.count) || 0);
  const rng = makeRng(opts.seed || 'seed');
  const report = { requested: count, delivered: 0, targetByDifficulty: {}, availableByDifficulty: {}, deliveredByDifficulty: {}, topicTargets: {}, deliveredByTopic: {}, availableByTopic: {}, adjustments: [], shortfalls: [] };
  if (count <= 0) {
    report.shortfalls.push({ kind: 'zero', message: 'A paper needs at least one question.' });
    return { ok: false, items: [], report };
  }
  const topicSet = opts.topicIds ? new Set(opts.topicIds) : null;
  const typeSet = opts.types && opts.types.length ? new Set(opts.types) : null;
  const exclude = opts.excludeIds || new Set();
  const eligible = pool
    .filter((q) => q.status === 'published' && !exclude.has(q.id) && (!topicSet || topicSet.has(q.topicId)) && (!typeSet || typeSet.has(q.type)) && (!opts.lang || (q.lang || 'en') === opts.lang) && hasAnswerKey(q))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const dist = normaliseDistribution(opts.distribution || DISTRIBUTION_PRESETS.mixed);
  if (!DIFFICULTIES.some((d) => dist[d] > 0)) {
    report.shortfalls.push({ kind: 'distribution', message: 'The difficulty mix adds up to zero.' });
    return { ok: false, items: [], report };
  }
  const byDiff = {};
  DIFFICULTIES.forEach((d) => (byDiff[d] = eligible.filter((q) => q.difficulty === d)));
  DIFFICULTIES.forEach((d) => (report.availableByDifficulty[d] = byDiff[d].length));
  eligible.forEach((q) => (report.availableByTopic[q.topicId] = (report.availableByTopic[q.topicId] || 0) + 1));

  if (eligible.length < count) {
    report.shortfalls.push({ kind: 'total', needed: count, available: eligible.length, message: `Only ${eligible.length} published question${eligible.length === 1 ? '' : 's'} match these filters; ${count} were requested.` });
    report.maxPossible = eligible.length;
    return { ok: false, items: [], report };
  }

  let target = allocateByRatio(count, dist);
  report.targetByDifficulty = { ...target };
  const short = DIFFICULTIES.filter((d) => target[d] > byDiff[d].length);
  if (short.length) {
    if (opts.strategy !== 'fill') {
      short.forEach((d) => report.shortfalls.push({ kind: 'difficulty', difficulty: d, needed: target[d], available: byDiff[d].length, message: `${DIFFICULTY_LABEL[d]}: ${target[d]} needed, ${byDiff[d].length} available.` }));
      return { ok: false, items: [], report };
    }
    // Borrow the deficit from the nearest difficulty levels that have spare inventory.
    for (const d of short) {
      let deficit = target[d] - byDiff[d].length;
      target[d] = byDiff[d].length;
      const idx = DIFFICULTIES.indexOf(d);
      const order = DIFFICULTIES.map((x, i) => ({ x, dist: Math.abs(i - idx) + (i > idx ? 0.1 : 0) })).filter((o) => o.x !== d).sort((a, b) => a.dist - b.dist).map((o) => o.x);
      for (const alt of order) {
        if (!deficit) break;
        const spare = byDiff[alt].length - target[alt];
        const take = Math.min(spare, deficit);
        if (take > 0) {
          target[alt] += take; deficit -= take;
          report.adjustments.push({ from: d, to: alt, count: take, message: `${take} ${DIFFICULTY_LABEL[d]} → ${DIFFICULTY_LABEL[alt]} (not enough ${DIFFICULTY_LABEL[d].toLowerCase()} questions)` });
        }
      }
    }
  }

  // Topic coverage targets (equal share or weighted), capped by inventory.
  const caps = {};
  eligible.forEach((q) => (caps[q.topicId] = (caps[q.topicId] || 0) + 1));
  const topicTarget = cappedAllocation(count, caps, opts.topicWeights || null);
  report.topicTargets = topicTarget;

  const weight = (q) => {
    let w = 1;
    if (opts.examId && (q.examTags || []).includes(opts.examId)) w *= 1.6;
    if (opts.recentIds && opts.recentIds.has(q.id)) w *= 0.15;
    w *= 1 / (1 + (q.usageCount || 0) / 40);
    return w;
  };
  const picked = [];
  const pickedByTopic = {};
  const usedGroups = new Set();
  const remaining = {};
  DIFFICULTIES.forEach((d) => (remaining[d] = byDiff[d].slice()));
  // Hardest-to-satisfy difficulty first (least slack).
  const diffOrder = DIFFICULTIES.filter((d) => target[d] > 0).sort((a, b) => (byDiff[a].length - target[a]) - (byDiff[b].length - target[b]));
  for (const d of diffOrder) {
    for (let k = 0; k < target[d]; k++) {
      const cands = remaining[d].filter((q) => !q.dupGroup || !usedGroups.has(q.dupGroup));
      if (!cands.length) break;
      const topicsHere = [...new Set(cands.map((q) => q.topicId))];
      let best = -Infinity, bestTopics = [];
      for (const t of topicsHere) {
        const deficit = (topicTarget[t] || 0) - (pickedByTopic[t] || 0);
        if (deficit > best) { best = deficit; bestTopics = [t]; } else if (deficit === best) bestTopics.push(t);
      }
      const topic = bestTopics[Math.floor(rng() * bestTopics.length)];
      const inTopic = cands.filter((q) => q.topicId === topic);
      const ws = inTopic.map(weight);
      let r = rng() * ws.reduce((s, x) => s + x, 0), chosen = inTopic[inTopic.length - 1];
      for (let i = 0; i < inTopic.length; i++) { r -= ws[i]; if (r <= 0) { chosen = inTopic[i]; break; } }
      picked.push(chosen);
      pickedByTopic[topic] = (pickedByTopic[topic] || 0) + 1;
      if (chosen.dupGroup) usedGroups.add(chosen.dupGroup);
      remaining[d] = remaining[d].filter((q) => q.id !== chosen.id);
    }
  }
  if (picked.length < count) {
    report.shortfalls.push({ kind: 'duplicates', message: `Only ${picked.length} questions could be picked without repeating near-duplicate questions.` });
    report.maxPossible = picked.length;
    return { ok: false, items: [], report };
  }
  const items = opts.randomise === false ? picked : shuffle(picked, rng);
  report.delivered = items.length;
  DIFFICULTIES.forEach((d) => (report.deliveredByDifficulty[d] = items.filter((q) => q.difficulty === d).length));
  items.forEach((q) => (report.deliveredByTopic[q.topicId] = (report.deliveredByTopic[q.topicId] || 0) + 1));
  return { ok: true, items, report };
}

export function hasAnswerKey(q) {
  const k = typeKind(q.type);
  if (k === 'numeric') return q.correct && typeof q.correct.value === 'number';
  return Array.isArray(q.correct) && q.correct.length > 0;
}

// Snapshot a question into a paper so later edits to the bank never change the paper.
export function snapshotQuestion(q, { marks = 1, negative = 0, sectionId = 's1', shuffleOptions = false, rng } = {}) {
  let options = (q.options || []).map((o) => ({ ...o }));
  if (shuffleOptions && rng && typeKind(q.type) !== 'numeric' && !['assertion_reason', 'true_false', 'sequence', 'match', 'statement'].includes(q.type)) options = shuffle(options, rng);
  return {
    qid: q.id, code: q.code, version: q.version || 1, type: q.type, lang: q.lang || 'en',
    text: q.text, statements: q.statements ? q.statements.slice() : undefined, passage: q.passage, image: q.image,
    listA: q.listA ? q.listA.slice() : undefined, listB: q.listB ? q.listB.slice() : undefined, ask: q.ask, assertion: q.assertion, reason: q.reason,
    options, correct: JSON.parse(JSON.stringify(q.correct)), explanation: q.explanation || '', optionNotes: q.optionNotes ? { ...q.optionNotes } : undefined,
    concept: q.concept || '', revision: q.revision || '',
    subjectId: q.subjectId, chapterId: q.chapterId, topicId: q.topicId, difficulty: q.difficulty,
    provenance: q.provenance, sample: !!q.sample, source: q.source || '',
    marks, negative, sectionId,
  };
}

// What the exam runner is allowed to see while an attempt is active.
export function publicItem(item) {
  const { correct, explanation, optionNotes, revision, ...rest } = item;
  return rest;
}

/**
 * Build a full paper. spec: { title, mode, examId, patternId, patternVersion, sections:[{id,name,count,topicIds,distribution,marks,negative}],
 *  types, lang, seed, recentIds, strategy, shuffleOptions, durationMin, answerRelease, explanationRelease, instantFeedback }
 */
export function buildPaper(pool, spec) {
  const seed = spec.seed || newSeed();
  const used = new Set();
  const sections = [];
  const reports = [];
  let ok = true;
  for (const [i, s] of spec.sections.entries()) {
    const res = generateSelection(pool, { count: s.count, distribution: s.distribution || spec.distribution, topicIds: s.topicIds, types: spec.types, lang: spec.lang, seed: `${seed}:${s.id || i}`, examId: spec.examId, recentIds: spec.recentIds, excludeIds: used, topicWeights: s.topicWeights, strategy: spec.strategy, randomise: spec.randomise !== false });
    reports.push({ sectionId: s.id, name: s.name, ...res.report });
    if (!res.ok) { ok = false; continue; }
    const rng = makeRng(`${seed}:${s.id || i}:opts`);
    res.items.forEach((q) => used.add(q.id));
    sections.push({ id: s.id || `s${i + 1}`, name: s.name, items: res.items.map((q) => snapshotQuestion(q, { marks: s.marks ?? spec.marks ?? 1, negative: s.negative ?? spec.negative ?? 0, sectionId: s.id || `s${i + 1}`, shuffleOptions: spec.shuffleOptions, rng })) });
  }
  if (!ok) return { ok: false, reports, seed };
  const paper = {
    title: spec.title, mode: spec.mode, examId: spec.examId, patternId: spec.patternId, patternVersion: spec.patternVersion,
    seed, config: { ...spec, recentIds: undefined, pool: undefined }, sections,
    durationMin: spec.durationMin || 0, answerRelease: spec.answerRelease || 'after_submit', explanationRelease: spec.explanationRelease || 'after_submit',
    instantFeedback: !!spec.instantFeedback, createdAt: spec.now || Date.now(),
  };
  paper.maxMarks = round2(paperItems(paper).reduce((s, it) => s + it.marks, 0));
  paper.questionCount = paperItems(paper).length;
  paper.validation = validatePaper(paper, { expectedCount: spec.sections.reduce((s, x) => s + x.count, 0), distribution: spec.sections.every((s) => !s.distribution) ? spec.distribution : null, sectionSpecs: spec.sections });
  if (spec.mergeAs) {
    // Exams like UPSC GS have subject quotas but present one undivided section to the candidate.
    const all = shuffle(paperItems(paper).map((it) => ({ ...it, block: it.sectionId, sectionId: 'all' })), makeRng(`${seed}:merge`));
    paper.blocks = paper.sections.map((s) => ({ id: s.id, name: s.name, count: s.items.length }));
    paper.sections = [{ id: 'all', name: spec.mergeAs, items: all }];
  }
  return { ok: true, paper, reports, seed };
}
export const paperItems = (paper) => paper.sections.flatMap((s) => s.items);
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------- Paper quality validation ----------
export function validatePaper(paper, { expectedCount, distribution, sectionSpecs } = {}) {
  const items = paperItems(paper);
  const checks = [];
  const add = (id, label, pass, detail, severity = 'error') => checks.push({ id, label, pass, detail, severity: pass ? 'ok' : severity });
  add('count', 'Total question count', expectedCount == null || items.length === expectedCount, `${items.length} of ${expectedCount ?? items.length} questions`);
  if (sectionSpecs) {
    const bad = paper.sections.filter((s) => { const sp = sectionSpecs.find((x) => (x.id || '') === s.id); return sp && sp.count !== s.items.length; });
    add('sections', 'Section-wise distribution', bad.length === 0, bad.length ? bad.map((s) => s.name).join(', ') + ' do not match' : `${paper.sections.length} section(s) match the blueprint`);
  }
  const ids = items.map((i) => i.qid);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  add('duplicates', 'No repeated questions', dupes.length === 0, dupes.length ? `${dupes.length} repeated` : 'Every question is unique');
  const missingKey = items.filter((i) => !hasAnswerKey(i));
  add('answers', 'Every question has an answer key', missingKey.length === 0, missingKey.length ? `${missingKey.length} without a key` : 'All keyed');
  const missingExp = items.filter((i) => !String(i.explanation || '').trim());
  add('explanations', 'Every question has an explanation', missingExp.length === 0, missingExp.length ? `${missingExp.length} without an explanation` : 'All explained', 'warning');
  if (distribution) {
    const target = allocateByRatio(items.length, normaliseDistribution(distribution));
    const actual = {};
    DIFFICULTIES.forEach((d) => (actual[d] = items.filter((i) => i.difficulty === d).length));
    const off = DIFFICULTIES.filter((d) => actual[d] !== target[d]);
    add('difficulty', 'Difficulty distribution', off.length === 0, DIFFICULTIES.filter((d) => target[d] || actual[d]).map((d) => `${DIFFICULTY_LABEL[d]} ${actual[d]}/${target[d]}`).join(' · '), 'warning');
  }
  const topics = new Set(items.map((i) => i.topicId));
  add('coverage', 'Topic coverage', topics.size > 0, `${topics.size} topic${topics.size === 1 ? '' : 's'} covered`);
  const max = round2(items.reduce((s, i) => s + i.marks, 0));
  const badMarks = items.filter((i) => !(i.marks > 0) || i.negative < 0 || i.negative > i.marks);
  add('marking', 'Marking scheme is consistent', badMarks.length === 0 && max > 0, `Maximum ${max} marks${badMarks.length ? `; ${badMarks.length} item(s) with invalid marks` : ''}`);
  return { pass: checks.every((c) => c.severity !== 'error'), checks };
}

// ---------- Evaluation & scoring ----------
export function isAnswered(item, resp) {
  const a = resp?.answer;
  const k = typeKind(item.type);
  if (k === 'multi') return Array.isArray(a) && a.length > 0;
  if (k === 'numeric') return a !== undefined && a !== null && String(a).trim() !== '' && !Number.isNaN(Number(a));
  if (k === 'text') return typeof a === 'string' && a.trim() !== '';
  return a !== undefined && a !== null && a !== '';
}
export function evaluate(item, resp) {
  if (!isAnswered(item, resp)) return 'unattempted';
  const a = resp.answer;
  const k = typeKind(item.type);
  if (k === 'single') return item.correct.includes(a) ? 'correct' : 'incorrect';
  if (k === 'multi') {
    const s = new Set(a);
    return s.size === item.correct.length && item.correct.every((c) => s.has(c)) ? 'correct' : 'incorrect';
  }
  if (k === 'numeric') {
    const tol = Number(item.correct.tolerance) || 0;
    return Math.abs(Number(a) - item.correct.value) <= tol + 1e-9 ? 'correct' : 'incorrect';
  }
  if (k === 'text') {
    const n = normaliseText(a);
    return item.correct.some((c) => normaliseText(c) === n) ? 'correct' : 'incorrect';
  }
  return 'incorrect';
}

export function scoreAttempt(paper, responses = {}, { taxonomy } = {}) {
  const rows = [];
  for (const s of paper.sections) {
    for (const it of s.items) {
      const r = responses[it.qid] || {};
      const status = evaluate(it, r);
      const marks = status === 'correct' ? it.marks : status === 'incorrect' ? -it.negative : 0;
      rows.push({ qid: it.qid, sectionId: s.id, status, marks, timeMs: r.timeMs || 0, answer: r.answer, marked: !!r.marked, subjectId: it.subjectId, chapterId: it.chapterId, topicId: it.topicId, difficulty: it.difficulty, max: it.marks, negative: it.negative });
    }
  }
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const group = (key) => {
    const g = {};
    rows.forEach((r) => {
      const k = r[key];
      g[k] = g[k] || { key: k, total: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, max: 0, timeMs: 0 };
      g[k].total++; g[k][r.status]++; g[k].score += r.marks; g[k].max += r.max; g[k].timeMs += r.timeMs;
    });
    Object.values(g).forEach((x) => { x.score = round2(x.score); x.max = round2(x.max); x.accuracy = x.correct + x.incorrect ? x.correct / (x.correct + x.incorrect) : null; });
    return g;
  };
  const correct = rows.filter((r) => r.status === 'correct').length;
  const incorrect = rows.filter((r) => r.status === 'incorrect').length;
  const unattempted = rows.length - correct - incorrect;
  const max = round2(sum(rows, (r) => r.max));
  const score = round2(sum(rows, (r) => r.marks));
  const negativeMarks = round2(sum(rows.filter((r) => r.status === 'incorrect'), (r) => r.negative));
  return {
    score, max, correct, incorrect, unattempted, total: rows.length, negativeMarks,
    positiveMarks: round2(sum(rows.filter((r) => r.status === 'correct'), (r) => r.max)),
    percentage: max ? round2((score / max) * 100) : 0,
    accuracy: correct + incorrect ? round2((correct / (correct + incorrect)) * 100) : null,
    timeMs: sum(rows, (r) => r.timeMs),
    rows, bySection: group('sectionId'), bySubject: group('subjectId'), byChapter: group('chapterId'), byTopic: group('topicId'), byDifficulty: group('difficulty'),
  };
}

// ---------- Attempt lifecycle ----------
export function attemptDeadline(attempt, paper) {
  if (!paper.durationMin) return null;
  return attempt.startedAt + paper.durationMin * 60000;
}
export function remainingMs(attempt, paper, now = Date.now()) {
  const d = attemptDeadline(attempt, paper);
  return d == null ? null : Math.max(0, d - now);
}
export function isExpired(attempt, paper, now = Date.now()) {
  const d = attemptDeadline(attempt, paper);
  return d != null && now >= d;
}
// Palette status used by the exam simulator.
export function paletteStatus(item, resp) {
  const answered = isAnswered(item, resp);
  if (resp?.marked) return answered ? 'answered-marked' : 'marked';
  if (answered) return 'answered';
  if (resp?.visited) return 'not-answered';
  return 'not-visited';
}

// ---------- Student analytics ----------
export const MIN_TOPIC_SAMPLE = 5;
export function studentAnalytics(attempts, { now = Date.now() } = {}) {
  const done = attempts.filter((a) => a.status === 'submitted' && a.result).sort((a, b) => a.submittedAt - b.submittedAt);
  const topic = {}, chapter = {}, subject = {}, diff = {};
  const qHistory = {};
  let totalQ = 0, correct = 0, incorrect = 0, timeMs = 0, timedQ = 0;
  for (const a of done) {
    for (const r of a.result.rows) {
      totalQ++;
      if (r.status === 'correct') correct++;
      if (r.status === 'incorrect') incorrect++;
      if (r.timeMs) { timeMs += r.timeMs; timedQ++; }
      for (const [map, key] of [[topic, r.topicId], [chapter, r.chapterId], [subject, r.subjectId], [diff, r.difficulty]]) {
        map[key] = map[key] || { key, seen: 0, correct: 0, incorrect: 0, unattempted: 0, timeMs: 0 };
        map[key].seen++; map[key][r.status]++; map[key].timeMs += r.timeMs || 0;
      }
      qHistory[r.qid] = qHistory[r.qid] || { qid: r.qid, wrong: 0, right: 0, last: null, topicId: r.topicId };
      if (r.status === 'incorrect') qHistory[r.qid].wrong++;
      if (r.status === 'correct') qHistory[r.qid].right++;
      qHistory[r.qid].last = r.status;
    }
  }
  const finish = (m) => Object.values(m).map((x) => ({ ...x, attempted: x.correct + x.incorrect, accuracy: x.correct + x.incorrect ? x.correct / (x.correct + x.incorrect) : null }));
  const topics = finish(topic);
  const ranked = topics.filter((t) => t.attempted >= MIN_TOPIC_SAMPLE);
  const weakest = ranked.filter((t) => t.accuracy < 0.6).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
  const strongest = ranked.filter((t) => t.accuracy >= 0.7).sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
  const days = [...new Set(done.map((a) => dayKey(a.submittedAt)))].sort();
  let streak = 0;
  const today = dayKey(now), yesterday = dayKey(now - 86400000);
  if (days.includes(today) || days.includes(yesterday)) {
    let d = days.includes(today) ? now : now - 86400000;
    while (days.includes(dayKey(d))) { streak++; d -= 86400000; }
  }
  return {
    tests: done.length,
    avgScorePct: done.length ? round2(done.reduce((s, a) => s + a.result.percentage, 0) / done.length) : null,
    bestScorePct: done.length ? Math.max(...done.map((a) => a.result.percentage)) : null,
    accuracy: correct + incorrect ? round2((correct / (correct + incorrect)) * 100) : null,
    totalQ, correct, incorrect, unattempted: totalQ - correct - incorrect,
    avgTimePerQ: timedQ ? Math.round(timeMs / timedQ / 1000) : null,
    trend: done.map((a) => ({ id: a.id, at: a.submittedAt, pct: a.result.percentage, title: a.title })),
    topics, chapters: finish(chapter), subjects: finish(subject), difficulty: finish(diff),
    weakest, strongest, enoughData: ranked.length > 0,
    repeatedMistakes: Object.values(qHistory).filter((h) => h.wrong >= 2),
    wrongLast: Object.values(qHistory).filter((h) => h.last === 'incorrect').map((h) => h.qid),
    streak,
  };
}
export function dayKey(ts) {
  const d = new Date(ts + 330 * 60000); // IST calendar day
  return d.toISOString().slice(0, 10);
}

// Weighted topic emphasis for a weakness test: weak topics get more questions, untested ones a fair share.
export function weaknessWeights(analytics, topicIds) {
  const w = {};
  for (const t of topicIds) {
    const a = analytics.topics.find((x) => x.key === t);
    if (!a || a.attempted < MIN_TOPIC_SAMPLE) w[t] = 1;
    else w[t] = Math.max(0.25, 1 + (0.7 - a.accuracy) * 4); // 30% accuracy -> 2.6x, 90% -> 0.25x
  }
  return w;
}

export function recommendations(analytics, { taxonomyName = (id) => id } = {}) {
  if (analytics.totalQ < 20 || !analytics.enoughData) {
    return { ready: false, message: `Answer at least 20 questions across a few tests (you have ${analytics.totalQ}) so recommendations are based on real evidence.`, items: [] };
  }
  const items = [];
  analytics.weakest.slice(0, 3).forEach((t) => items.push({ kind: 'topic', topicId: t.key, title: `Practise ${taxonomyName(t.key)}`, why: `${Math.round(t.accuracy * 100)}% accuracy over ${t.attempted} attempted questions` }));
  const d = analytics.difficulty.find((x) => x.key === 'difficult');
  if (d && d.attempted >= MIN_TOPIC_SAMPLE && d.accuracy < 0.5) items.push({ kind: 'difficulty', title: 'Add more Difficult questions to your mocks', why: `${Math.round(d.accuracy * 100)}% accuracy on Difficult questions` });
  const skip = analytics.unattempted / Math.max(1, analytics.totalQ);
  if (skip > 0.25) items.push({ kind: 'pace', title: 'Work on attempt rate', why: `${Math.round(skip * 100)}% of questions left unattempted` });
  if (analytics.repeatedMistakes.length) items.push({ kind: 'revision', title: 'Revise repeated mistakes', why: `${analytics.repeatedMistakes.length} question${analytics.repeatedMistakes.length === 1 ? '' : 's'} answered wrongly more than once` });
  return { ready: true, items };
}

// ---------- Question-bank health ----------
export function bankHealth(questions, taxonomy, { testSize = 25, testsWanted = 3 } = {}) {
  const need = testSize * testsWanted;
  return taxonomy.chapters.filter((c) => !c.archived).map((c) => {
    const qs = questions.filter((q) => q.chapterId === c.id);
    const pub = qs.filter((q) => q.status === 'published');
    const byD = {};
    DIFFICULTIES.forEach((d) => (byD[d] = pub.filter((q) => q.difficulty === d).length));
    const level = pub.length >= need ? 'healthy' : pub.length >= testSize ? 'low' : 'critical';
    return { chapterId: c.id, subjectId: c.subjectId, name: c.name, published: pub.length, pending: qs.filter((q) => q.status === 'pending').length, total: qs.length, byDifficulty: byD, need, level, missingExplanations: pub.filter((q) => !String(q.explanation || '').trim()).length };
  });
}

// Question analytics across all attempts (admin)
export function questionAnalytics(attempts) {
  const m = {};
  for (const a of attempts) {
    if (a.status !== 'submitted' || !a.result) continue;
    for (const r of a.result.rows) {
      m[r.qid] = m[r.qid] || { qid: r.qid, seen: 0, correct: 0, incorrect: 0, unattempted: 0 };
      m[r.qid].seen++; m[r.qid][r.status]++;
    }
  }
  return Object.values(m).map((x) => ({ ...x, errorRate: x.correct + x.incorrect ? x.incorrect / (x.correct + x.incorrect) : null }));
}

// ---------- Plans & entitlements ----------
export const DEFAULT_PLANS = [
  { id: 'free', name: 'Free', priceMonthly: 0, limits: { practicePerDay: 30, mocksPerDay: 1 }, features: { customMocks: true, explanations: false, simulator: false, advancedAnalytics: false, recommendations: false, downloads: false, weaknessTests: false } },
  { id: 'basic', name: 'Basic', priceMonthly: 299, limits: { practicePerDay: 150, mocksPerDay: 5 }, features: { customMocks: true, explanations: true, simulator: false, advancedAnalytics: false, recommendations: false, downloads: false, weaknessTests: true } },
  { id: 'premium', name: 'Premium', priceMonthly: 599, limits: { practicePerDay: null, mocksPerDay: null }, features: { customMocks: true, explanations: true, simulator: true, advancedAnalytics: true, recommendations: true, downloads: true, weaknessTests: true } },
  { id: 'institutional', name: 'Institutional', priceMonthly: null, limits: { practicePerDay: null, mocksPerDay: null }, features: { customMocks: true, explanations: true, simulator: true, advancedAnalytics: true, recommendations: true, downloads: true, weaknessTests: true, bulkAssignments: true } },
];
export function effectivePlan(user, plans, now = Date.now()) {
  if (!user) return plans[0];
  if (user.role !== 'student') return plans.find((p) => p.id === 'premium');
  const expired = user.planExpiry && now > user.planExpiry;
  return plans.find((p) => p.id === (expired ? 'free' : user.plan)) || plans[0];
}
/** usage: { practiceToday, mocksToday } */
export function checkEntitlement(user, plans, feature, usage = {}, now = Date.now()) {
  const plan = effectivePlan(user, plans, now);
  const expired = user?.planExpiry && now > user.planExpiry && user.plan !== 'free';
  if (feature === 'practice') {
    const lim = plan.limits.practicePerDay;
    return { allowed: lim == null || (usage.practiceToday || 0) < lim, limit: lim, used: usage.practiceToday || 0, plan, expired, reason: lim != null ? `${plan.name} includes ${lim} practice questions a day.` : '' };
  }
  if (feature === 'mock') {
    const lim = plan.limits.mocksPerDay;
    return { allowed: lim == null || (usage.mocksToday || 0) < lim, limit: lim, used: usage.mocksToday || 0, plan, expired, reason: lim != null ? `${plan.name} includes ${lim} mock test${lim === 1 ? '' : 's'} a day.` : '' };
  }
  const allowed = !!plan.features[feature];
  return { allowed, plan, expired, reason: allowed ? '' : `Not included in ${plan.name}${expired ? ' (your previous plan has expired)' : ''}.` };
}
export function applyCoupon(price, coupon, { planId, now = Date.now() } = {}) {
  if (!coupon) return { ok: false, reason: 'Enter a coupon code.' };
  if (!coupon.active) return { ok: false, reason: 'This coupon is not active.' };
  if (coupon.expiresAt && now > coupon.expiresAt) return { ok: false, reason: 'This coupon has expired.' };
  if (coupon.maxUses != null && (coupon.uses || 0) >= coupon.maxUses) return { ok: false, reason: 'This coupon has reached its usage limit.' };
  if (coupon.planIds && coupon.planIds.length && !coupon.planIds.includes(planId)) return { ok: false, reason: 'This coupon does not apply to the selected plan.' };
  const off = coupon.kind === 'percent' ? Math.round((price * coupon.value) / 100) : coupon.value;
  return { ok: true, discount: Math.min(price, off), finalPrice: Math.max(0, price - off) };
}

// ---------- CSV / import ----------
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}
export function toCSV(rows) {
  return rows.map((r) => r.map((v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
}
export const IMPORT_FIELDS = [
  { key: 'text', label: 'Question text', required: true, aliases: ['question', 'question text', 'stem'] },
  { key: 'type', label: 'Question type', aliases: ['type', 'format'] },
  { key: 'optionA', label: 'Option A', aliases: ['a', 'option a', 'option1', 'opt a'] },
  { key: 'optionB', label: 'Option B', aliases: ['b', 'option b', 'option2', 'opt b'] },
  { key: 'optionC', label: 'Option C', aliases: ['c', 'option c', 'option3', 'opt c'] },
  { key: 'optionD', label: 'Option D', aliases: ['d', 'option d', 'option4', 'opt d'] },
  { key: 'answer', label: 'Correct answer', required: true, aliases: ['answer', 'correct', 'correct answer', 'key'] },
  { key: 'explanation', label: 'Explanation', aliases: ['explanation', 'solution'] },
  { key: 'subject', label: 'Subject', required: true, aliases: ['subject'] },
  { key: 'chapter', label: 'Chapter', required: true, aliases: ['chapter'] },
  { key: 'topic', label: 'Topic', required: true, aliases: ['topic'] },
  { key: 'difficulty', label: 'Difficulty', required: true, aliases: ['difficulty', 'level'] },
  { key: 'exams', label: 'Exam tags', aliases: ['exams', 'exam', 'exam tags', 'tags'] },
  { key: 'source', label: 'Source / reference', aliases: ['source', 'reference'] },
  { key: 'concept', label: 'Concept tested', aliases: ['concept'] },
  { key: 'language', label: 'Language', aliases: ['language', 'lang'] },
];
export function guessMapping(headers) {
  const map = {};
  IMPORT_FIELDS.forEach((f) => {
    const i = headers.findIndex((h) => { const n = normaliseText(h); return n === normaliseText(f.label) || f.aliases.includes(n) || n === f.key.toLowerCase(); });
    if (i >= 0) map[f.key] = i;
  });
  return map;
}
const findByName = (list, name) => list.find((x) => normaliseText(x.name) === normaliseText(name));
export function mapImportRows(rows, mapping, { taxonomy, exams, existing }) {
  const get = (r, k) => (mapping[k] != null && mapping[k] !== '' ? String(r[mapping[k]] ?? '').trim() : '');
  const seen = [];
  return rows.map((r, idx) => {
    const errors = [], warnings = [];
    const subj = findByName(taxonomy.subjects.filter((s) => !s.archived), get(r, 'subject'));
    const chap = subj && findByName(taxonomy.chapters.filter((c) => c.subjectId === subj.id && !c.archived), get(r, 'chapter'));
    const top = chap && findByName(taxonomy.topics.filter((t) => t.chapterId === chap.id && !t.archived), get(r, 'topic'));
    if (!subj) errors.push(`Subject "${get(r, 'subject')}" not found`);
    else if (!chap) errors.push(`Chapter "${get(r, 'chapter')}" not found in ${subj.name}`);
    else if (!top) errors.push(`Topic "${get(r, 'topic')}" not found in ${chap.name}`);
    let type = normaliseText(get(r, 'type')).replace(/ /g, '_') || 'single';
    const typeAlias = { mcq: 'single', single_correct: 'single', multiple_correct: 'multiple', truefalse: 'true_false', tf: 'true_false', fill: 'fill_blank', fill_in_the_blank: 'fill_blank', numeric: 'numerical', ar: 'assertion_reason' };
    type = typeAlias[type] || type;
    if (!QUESTION_TYPES[type]) { errors.push(`Unknown type "${get(r, 'type')}"`); type = 'single'; }
    const diffRaw = normaliseText(get(r, 'difficulty'));
    const difficulty = DIFFICULTIES.find((d) => d === diffRaw || DIFFICULTY_LABEL[d].toLowerCase() === diffRaw) || (diffRaw === 'medium' ? 'moderate' : diffRaw === 'hard' ? 'difficult' : null);
    if (!difficulty) errors.push(`Difficulty "${get(r, 'difficulty')}" is not Easy / Moderate / Difficult / Advanced`);
    const kind = typeKind(type);
    const options = ['A', 'B', 'C', 'D'].map((L) => ({ id: L.toLowerCase(), text: get(r, 'option' + L) })).filter((o) => o.text);
    let correct;
    const ans = get(r, 'answer');
    if (kind === 'single' || kind === 'multi') {
      correct = ans.split(/[;|,\s]+/).filter(Boolean).map((x) => x.toLowerCase());
      if (type === 'true_false' && !options.length) { options.push({ id: 'a', text: 'True' }, { id: 'b', text: 'False' }); correct = correct.map((x) => (x === 'true' ? 'a' : x === 'false' ? 'b' : x)); }
    } else if (kind === 'numeric') correct = { value: Number(ans), tolerance: 0 };
    else correct = ans.split('|').map((x) => x.trim()).filter(Boolean);
    const examTags = get(r, 'exams').split(/[;|,]/).map((x) => x.trim()).filter(Boolean).map((name) => { const e = exams.find((x) => normaliseText(x.name) === normaliseText(name) || normaliseText(x.short || '') === normaliseText(name)); if (!e) warnings.push(`Exam tag "${name}" not recognised and skipped`); return e?.id; }).filter(Boolean);
    const lang = (get(r, 'language') || 'en').toLowerCase().startsWith('h') ? 'hi' : 'en';
    const q = { type, text: get(r, 'text'), options: kind === 'single' || kind === 'multi' ? options : [], correct, explanation: get(r, 'explanation'), subjectId: subj?.id, chapterId: chap?.id, topicId: top?.id, difficulty, examTags, source: get(r, 'source'), concept: get(r, 'concept'), lang, provenance: 'original' };
    const v = validateQuestion(q, { taxonomy });
    v.errors.forEach((e) => !errors.includes(e) && !(e.startsWith('Subject, chapter') && errors.length) && errors.push(e));
    warnings.push(...v.warnings.filter((w) => !w.startsWith('Source')));
    const sim = findSimilar(q, existing, { threshold: DUPLICATE_THRESHOLD, limit: 1 });
    const inFile = seen.find((s) => similarity(questionFingerprint(s.q), questionFingerprint(q)) >= DUPLICATE_THRESHOLD);
    const duplicateOf = sim[0] ? { where: 'bank', ...sim[0] } : inFile ? { where: 'file', row: inFile.idx + 1 } : null;
    seen.push({ q, idx });
    return { row: idx + 1, question: q, errors, warnings, duplicateOf };
  });
}

// ---------- Small helpers ----------
export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
export function fmtDuration(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
