// Builds the sample workspace. All content here is SAMPLE content and labelled as such in the app.
import * as E from './engine.js';
import * as D from './domain.js';
import { QUESTION_SOURCE, PIPELINE_SOURCE, IMAGES } from './seed-questions.js';

const SUBJECTS = [
  ['hist', 'History'], ['geog', 'Geography'], ['pol', 'Political Science'], ['econ', 'Economics'], ['sci', 'General Science'],
  ['math', 'Mathematics'], ['reas', 'Reasoning'], ['eng', 'English'], ['comp', 'Computer Knowledge'],
];
const CHAPTERS = [
  ['anc', 'hist', 'Ancient Indian History'], ['med', 'hist', 'Medieval Indian History'], ['mod', 'hist', 'Modern Indian History'], ['inm', 'hist', 'Indian National Movement'],
  ['phyg', 'geog', 'Physical Geography'], ['indg', 'geog', 'Indian Geography'], ['wrld', 'geog', 'World Geography'],
  ['cons', 'pol', 'Indian Constitution'], ['ung', 'pol', 'Union Government'], ['judi', 'pol', 'Judiciary'], ['amdc', 'pol', 'Constitutional Amendments'],
  ['ecb', 'econ', 'Indian Economy: Basics'], ['physc', 'sci', 'Physics'], ['num', 'math', 'Number System'], ['vr', 'reas', 'Verbal Reasoning'], ['gram', 'eng', 'Grammar'], ['cf', 'comp', 'Computer Fundamentals'],
];
const TOPICS = [
  ['ivc', 'anc', 'Indus Valley Civilisation'], ['ved', 'anc', 'Vedic Period'], ['mau', 'anc', 'Mauryan Empire'], ['gup', 'anc', 'Gupta Empire'],
  ['ds', 'med', 'Delhi Sultanate'], ['mug', 'med', 'Mughal Empire'], ['bha', 'med', 'Bhakti and Sufi Movements'],
  ['r57', 'mod', 'Revolt of 1857'], ['cdv', 'mod', 'Constitutional Developments'], ['srm', 'mod', 'Socio-religious Reform Movements'],
  ['inc', 'inm', 'Indian National Congress (1885–1916)'], ['gan', 'inm', 'Gandhian Era'],
  ['phy', 'phyg', 'Earth\'s Interior and Atmosphere'], ['riv', 'indg', 'Rivers and Drainage'], ['cli', 'indg', 'Climate and Monsoon'], ['soi', 'indg', 'Soils and Natural Resources'], ['wor', 'wrld', 'Oceans, Continents and Coordinates'],
  ['pre', 'cons', 'Making of the Constitution and Preamble'], ['fr', 'cons', 'Fundamental Rights'], ['dpsp', 'cons', 'Directive Principles'],
  ['par', 'ung', 'Parliament'], ['pres', 'ung', 'President and Prime Minister'], ['sc', 'judi', 'Supreme Court'], ['amd', 'amdc', 'Major Amendments'],
  ['nat', 'ecb', 'National Income'], ['mot', 'physc', 'Motion and Force'], ['div', 'num', 'Divisibility'], ['ana', 'vr', 'Analogies'], ['ten', 'gram', 'Tenses'], ['hw', 'cf', 'Hardware and Software'],
];

const STATEMENT_STYLE = new Set(['statement', 'assertion_reason', 'match', 'sequence']);

export function buildTaxonomy() {
  const subjects = SUBJECTS.map(([id, name], i) => ({ id: 'sub_' + id, name, order: i, archived: false }));
  const chapters = CHAPTERS.map(([id, s, name], i) => ({ id: 'ch_' + id, subjectId: 'sub_' + s, name, order: i, archived: false }));
  const topics = TOPICS.map(([id, c, name], i) => ({ id: 'tp_' + id, chapterId: 'ch_' + c, name, order: i, archived: false }));
  return { subjects, chapters, topics };
}

function pattern(id, name, stage, kind, status, sourceNote, versions) {
  return { id, name, stage, kind, status, sourceNote, currentV: versions[versions.length - 1].v, versions };
}
const sec = (id, name, subjects, count) => ({ id, name, subjectIds: subjects.map((s) => 'sub_' + s), count });

export function buildExams(now) {
  const created = now - 40 * 86400000;
  const upscBase = { durationMin: 120, totalQuestions: 100, marksPerQ: 2, negativeFraction: 1 / 3, mergeSections: true, mergedName: 'General Studies Paper I', syllabusVersion: 'CSE notification (verify)', formats: [], instructions: 'All questions carry equal marks. One-third of the marks assigned to a question is deducted for each wrong answer. There is no penalty for an unanswered question.', sections: [sec('h', 'History', ['hist'], 40), sec('g', 'Geography', ['geog'], 30), sec('p', 'Polity', ['pol'], 30)] };
  return [
    {
      id: 'upsc', name: 'UPSC Civil Services Examination', short: 'UPSC CSE', category: 'Civil Services', status: 'active', createdAt: created,
      description: 'Sample configuration for practice. Prelims structure is modelled on the published pattern; verify every value against the latest UPSC notification before launch.',
      patterns: [
        pattern('upsc-pre-gs1', 'Prelims · General Studies Paper I', 'Prelims', 'exam', 'sample', 'Modelled on the UPSC CSE Prelims structure (100 questions, 200 marks, 2 hours, one-third negative marking). The subject split is an administrator choice, not an official quota. Not verified against a current notification.', [
          { v: 1, year: 2025, effectiveFrom: '2025-01-01', ...upscBase, difficulty: { easy: 30, moderate: 50, difficult: 20, advanced: 0 }, createdAt: created, note: 'Initial sample configuration' },
          { v: 2, year: 2026, effectiveFrom: '2026-01-01', ...upscBase, difficulty: { easy: 25, moderate: 50, difficult: 25, advanced: 0 }, createdAt: created + 20 * 86400000, note: 'Raised the share of difficult questions' },
        ]),
        pattern('upsc-mini', 'Prelims mini mock', 'Prelims', 'template', 'practice', 'Practice template defined by the platform. Not an official pattern.', [
          { v: 1, year: 2026, effectiveFrom: '2026-01-01', durationMin: 36, totalQuestions: 30, marksPerQ: 2, negativeFraction: 1 / 3, mergeSections: true, mergedName: 'General Studies (mini)', syllabusVersion: 'Platform template', formats: [], difficulty: { easy: 30, moderate: 50, difficult: 20, advanced: 0 }, instructions: 'A 30-question rehearsal of the Prelims format with the same marking scheme.', sections: [sec('h', 'History', ['hist'], 12), sec('g', 'Geography', ['geog'], 9), sec('p', 'Polity', ['pol'], 9)], createdAt: created },
        ]),
      ],
    },
    {
      id: 'ssc-cgl', name: 'SSC Combined Graduate Level', short: 'SSC CGL', category: 'Staff Selection Commission', status: 'active', createdAt: created,
      description: 'Sample configuration for practice. Tier 1 structure is modelled on the published pattern; verify against the latest SSC notice.',
      patterns: [
        pattern('cgl-t1', 'Tier 1', 'Tier 1', 'exam', 'sample', 'Modelled on the SSC CGL Tier 1 structure (4 sections × 25 questions, 2 marks each, 0.5 negative, 60 minutes). Not verified against a current notice.', [
          { v: 1, year: 2026, effectiveFrom: '2026-01-01', durationMin: 60, totalQuestions: 100, marksPerQ: 2, negativeFraction: 0.25, mergeSections: false, syllabusVersion: 'SSC notice (verify)', formats: [], difficulty: { easy: 35, moderate: 45, difficult: 20, advanced: 0 }, instructions: 'Four sections of 25 questions. 2 marks for a correct answer and 0.50 deducted for a wrong answer.', sections: [sec('r', 'General Intelligence and Reasoning', ['reas'], 25), sec('ga', 'General Awareness', ['hist', 'geog', 'pol', 'econ', 'sci'], 25), sec('q', 'Quantitative Aptitude', ['math'], 25), sec('e', 'English Comprehension', ['eng'], 25)], createdAt: created },
        ]),
        pattern('cgl-ga', 'General Awareness sectional', 'Tier 1', 'template', 'practice', 'Practice template defined by the platform. Not an official pattern.', [
          { v: 1, year: 2026, effectiveFrom: '2026-01-01', durationMin: 15, totalQuestions: 25, marksPerQ: 2, negativeFraction: 0.25, mergeSections: false, syllabusVersion: 'Platform template', formats: [], difficulty: { easy: 40, moderate: 45, difficult: 15, advanced: 0 }, instructions: 'One timed section of 25 General Awareness questions with Tier 1 marking.', sections: [sec('ga', 'General Awareness', ['hist', 'geog', 'pol', 'econ', 'sci'], 25)], createdAt: created },
        ]),
      ],
    },
    {
      id: 'pcs', name: 'State PCS (sample, Uttar Pradesh model)', short: 'State PCS', category: 'State Civil Services', status: 'active', createdAt: created,
      description: 'Sample state-level configuration modelled loosely on a UP PCS Prelims paper. Every state publishes its own pattern; verify before use.',
      patterns: [
        pattern('pcs-pre-gs1', 'Prelims · General Studies Paper I', 'Prelims', 'exam', 'sample', 'Modelled on a 150-question, 200-mark, 2-hour state Prelims paper with one-third negative marking. Not verified against a current notification.', [
          { v: 1, year: 2026, effectiveFrom: '2026-01-01', durationMin: 120, totalQuestions: 150, marksPerQ: 4 / 3, negativeFraction: 1 / 3, mergeSections: true, mergedName: 'General Studies Paper I', syllabusVersion: 'State notification (verify)', formats: [], difficulty: { easy: 30, moderate: 50, difficult: 20, advanced: 0 }, instructions: '150 questions for 200 marks. One-third of a question\'s marks is deducted for a wrong answer.', sections: [sec('h', 'History', ['hist'], 60), sec('g', 'Geography', ['geog'], 40), sec('p', 'Polity', ['pol'], 50)], createdAt: created },
        ]),
        pattern('pcs-mini', 'Prelims mini mock', 'Prelims', 'template', 'practice', 'Practice template defined by the platform. Not an official pattern.', [
          { v: 1, year: 2026, effectiveFrom: '2026-01-01', durationMin: 48, totalQuestions: 40, marksPerQ: 4 / 3, negativeFraction: 1 / 3, mergeSections: true, mergedName: 'General Studies (mini)', syllabusVersion: 'Platform template', formats: [], difficulty: { easy: 30, moderate: 50, difficult: 20, advanced: 0 }, instructions: 'A 40-question rehearsal with state Prelims marking.', sections: [sec('h', 'History', ['hist'], 16), sec('g', 'Geography', ['geog'], 10), sec('p', 'Polity', ['pol'], 14)], createdAt: created },
        ]),
      ],
    },
  ];
}

function buildQuestion(row, i, tax, now, extraDefaults = {}) {
  const [tk, difficulty, text, opts, ans, explanation, extra = {}] = row;
  const topic = tax.topics.find((t) => t.id === 'tp_' + tk);
  const chapter = tax.chapters.find((c) => c.id === topic.chapterId);
  const type = extra.type || 'single';
  const kind = E.typeKind(type);
  let options = [];
  if (type === 'assertion_reason') options = E.AR_OPTIONS.map((o) => ({ ...o }));
  else if (opts) options = opts.map((t, j) => ({ id: 'abcdefgh'[j], text: t }));
  const correct = kind === 'numeric' ? ans : Array.isArray(ans) ? ans : [ans];
  const tags = STATEMENT_STYLE.has(type) || difficulty === 'advanced' ? ['upsc', 'pcs'] : ['upsc', 'ssc-cgl', 'pcs'];
  const created = now - (60 - (i % 50)) * 86400000;
  const q = {
    id: `q_${String(i + 1).padStart(4, '0')}`, code: `PK-${String(i + 1).padStart(5, '0')}`, version: 1,
    type, lang: extra.lang || 'en',
    text: type === 'assertion_reason' && !text ? 'Read the Assertion (A) and the Reason (R) and choose the correct option.' : text,
    statements: extra.statements, ask: extra.ask, assertion: extra.assertion, reason: extra.reason, listA: extra.listA, listB: extra.listB, passage: extra.passage,
    image: extra.image ? IMAGES[extra.image] : undefined,
    options, correct, explanation, optionNotes: extra.optionNotes, concept: extra.concept || '', revision: '',
    subjectId: chapter.subjectId, chapterId: chapter.id, topicId: topic.id, subtopic: '', extraTopicIds: [],
    examTags: extra.tags || tags, examYear: null, difficulty,
    provenance: extra.provenance || 'original', aiGenerated: !!extra.aiGenerated, sample: true,
    source: extra.source ?? 'Sample content: original question written for this demo',
    status: extra.status || 'published', reviewerId: (extra.status || 'published') === 'published' || extra.status === 'approved' ? 'u_reviewer' : null,
    reviewNotes: [], flags: [], createdAt: created, updatedAt: created, createdBy: 'u_admin', importBatchId: null, dupGroup: null,
    ...extraDefaults,
  };
  Object.keys(q).forEach((k) => q[k] === undefined && delete q[k]);
  return q;
}

// Deterministic "student" who answers according to a skill profile. Used only to create sample attempt history.
function simulateResponses(paper, profile, rng, step) {
  const responses = {};
  for (const it of E.paperItems(paper)) {
    const subjKey = it.subjectId.replace('sub_', '');
    const topicKey = it.topicId.replace('tp_', '');
    let p = (profile.base[subjKey] ?? 0.55) - ({ easy: 0, moderate: 0.1, difficult: 0.22, advanced: 0.32 }[it.difficulty]) + (profile.topic[topicKey] || 0) + step * (profile.growth || 0);
    p = Math.min(0.97, Math.max(0.08, p));
    const timeMs = Math.round((25 + rng() * 70) * 1000 * ({ easy: 0.7, moderate: 1, difficult: 1.3, advanced: 1.5 }[it.difficulty]));
    if (rng() > profile.attemptRate) { responses[it.qid] = { visited: true, timeMs: Math.round(timeMs / 2) }; continue; }
    const kind = E.typeKind(it.type);
    const right = rng() < p;
    let answer;
    if (kind === 'single') answer = right ? it.correct[0] : (it.options.find((o) => !it.correct.includes(o.id)) || it.options[0]).id;
    else if (kind === 'multi') answer = right ? it.correct.slice() : [it.options[0].id];
    else if (kind === 'numeric') answer = String(right ? it.correct.value : it.correct.value + 1);
    else answer = right ? it.correct[0] : 'not sure';
    responses[it.qid] = { answer, visited: true, timeMs, marked: rng() < 0.05 };
  }
  return responses;
}

export async function buildDemoWorkspace(hashPassword, now = Date.now()) {
  const tax = buildTaxonomy();
  const exams = buildExams(now);
  const questions = QUESTION_SOURCE.map((r, i) => buildQuestion(r, i, tax, now));
  const pipeline = PIPELINE_SOURCE.map((r, i) => buildQuestion(r, QUESTION_SOURCE.length + i, tax, now - 2 * 86400000));
  // mark the duplicate submission so the review queue shows the warning
  const dupe = pipeline.find((q) => q.topicId === 'tp_mau' && q.status === 'pending');
  if (dupe) dupe.reviewNotes = [];
  const allQ = questions.concat(pipeline);

  const users = [];
  const mkUser = async (id, name, email, role, password, extra = {}) => {
    const { hash, salt } = await hashPassword(password);
    users.push({ id, name, email, role, passHash: hash, salt, plan: 'free', planExpiry: null, targetExamIds: [], createdAt: now - 45 * 86400000, active: true, demo: true, ...extra });
  };
  await mkUser('u_admin', 'Ananya Rao', 'admin@prashnakosh.demo', 'admin', 'Admin@123');
  await mkUser('u_reviewer', 'Dr Imran Qureshi', 'reviewer@prashnakosh.demo', 'reviewer', 'Review@123');
  await mkUser('u_riya', 'Riya Sharma', 'student@prashnakosh.demo', 'student', 'Student@123', { plan: 'premium', planExpiry: now + 200 * 86400000, targetExamIds: ['upsc'] });
  await mkUser('u_arjun', 'Arjun Verma', 'arjun@prashnakosh.demo', 'student', 'Student@123', { plan: 'free', targetExamIds: ['ssc-cgl'] });
  await mkUser('u_meera', 'Meera Iyer', 'meera@prashnakosh.demo', 'student', 'Student@123', { plan: 'basic', planExpiry: now + 20 * 86400000, targetExamIds: ['pcs'] });
  await mkUser('u_karan', 'Karan Singh', 'karan@prashnakosh.demo', 'student', 'Student@123', { plan: 'free', targetExamIds: ['upsc'] });

  const ws = {
    meta: { schema: 1, createdAt: now, sample: true },
    ...tax, exams, questions: allQ, papers: [], attempts: [], users,
    bookmarks: [], reports: [], audit: [], importBatches: [], upgradeRequests: [], notifications: [],
    plans: JSON.parse(JSON.stringify(E.DEFAULT_PLANS)),
    coupons: [
      { id: 'cp1', code: 'LAUNCH20', kind: 'percent', value: 20, active: true, planIds: ['basic', 'premium'], maxUses: 500, uses: 37, expiresAt: now + 60 * 86400000 },
      { id: 'cp2', code: 'EARLYBIRD', kind: 'percent', value: 40, active: true, planIds: ['premium'], maxUses: 100, uses: 100, expiresAt: now - 5 * 86400000 },
    ],
    settings: { healthTestSize: 25, healthTests: 3, paymentMode: 'not_connected' },
  };

  // Sample attempt history, produced by the real engine and scorer.
  const profiles = {
    u_riya: { base: { hist: 0.8, geog: 0.72, pol: 0.88 }, topic: { ds: -0.32, mug: -0.26, r57: -0.12, cli: -0.15 }, attemptRate: 0.9, growth: 0.015 },
    u_arjun: { base: { hist: 0.56, geog: 0.62, pol: 0.5 }, topic: {}, attemptRate: 0.8 },
    u_meera: { base: { hist: 0.66, geog: 0.7, pol: 0.63 }, topic: { gup: -0.2 }, attemptRate: 0.85 },
    u_karan: { base: { hist: 0.5, geog: 0.45, pol: 0.55 }, topic: {}, attemptRate: 0.7 },
  };
  const plan = [
    ['u_riya', 11, 'practice', { topics: ['ivc', 'ved', 'mau', 'gup'], count: 15, label: 'Ancient Indian History' }],
    ['u_riya', 9, 'custom', { topics: ['ds', 'mug', 'bha'], count: 20, label: 'Medieval India' }],
    ['u_riya', 7, 'practice', { topics: ['pre', 'fr', 'dpsp'], count: 15, label: 'Indian Constitution' }],
    ['u_riya', 5, 'custom', { topics: ['r57', 'cdv'], count: 25, label: 'Revolt of 1857 & Constitutional Developments' }],
    ['u_riya', 3, 'simulator', { pattern: ['upsc', 'upsc-mini'] }],
    ['u_riya', 1, 'custom', { topics: ['riv', 'cli', 'soi', 'phy'], count: 20, label: 'Geography' }],
    ['u_riya', 0, 'practice', { topics: ['ds', 'mug'], count: 10, label: 'Medieval India' }],
    ['u_arjun', 4, 'custom', { topics: ['ivc', 'mau', 'gup', 'riv', 'par'], count: 20, label: 'General Awareness mix' }],
    ['u_arjun', 2, 'simulator', { pattern: ['ssc-cgl', 'cgl-ga'] }],
    ['u_meera', 8, 'custom', { topics: ['gup', 'mau', 'ivc'], count: 20, label: 'Ancient India' }],
    ['u_meera', 6, 'practice', { topics: ['fr', 'par', 'pres'], count: 15, label: 'Polity' }],
    ['u_meera', 2, 'simulator', { pattern: ['pcs', 'pcs-mini'] }],
    ['u_karan', 6, 'custom', { topics: ['inc', 'gan', 'srm'], count: 15, label: 'National Movement' }],
  ];
  const steps = {};
  for (const [uid, daysAgo, mode, cfg] of plan) {
    const rng = E.makeRng(`${uid}-${daysAgo}-${mode}`);
    const startedAt = now - daysAgo * 86400000 - Math.round((2 + rng() * 6) * 3600000);
    let built;
    if (cfg.pattern) {
      const exam = exams.find((e) => e.id === cfg.pattern[0]);
      const pat = exam.patterns.find((p) => p.id === cfg.pattern[1]);
      built = E.buildPaper(ws.questions, { ...D.specFromPattern(ws, exam, pat, D.currentVersion(pat), { seed: `${uid}-${daysAgo}`, strategy: 'fill' }), now: startedAt });
      if (built.ok) built.paper.title = `${exam.short} · ${pat.name}`;
    } else {
      const exam = profiles[uid] && users.find((u) => u.id === uid).targetExamIds[0];
      const marks = exam === 'ssc-cgl' ? 2 : 2, negative = exam === 'ssc-cgl' ? 0.5 : round4(2 / 3);
      built = E.buildPaper(ws.questions, { title: `${mode === 'practice' ? 'Practice' : 'Custom mock'} · ${cfg.label}`, mode, examId: exam, sections: [{ id: 's1', name: cfg.label, count: cfg.count, topicIds: cfg.topics.map((t) => 'tp_' + t) }], distribution: E.DISTRIBUTION_PRESETS.mixed, marks: mode === 'practice' ? 1 : marks, negative: mode === 'practice' ? 0 : negative, lang: 'en', seed: `${uid}-${daysAgo}`, strategy: 'fill', durationMin: mode === 'practice' ? 0 : Math.round(cfg.count * 1.2), instantFeedback: mode === 'practice', now: startedAt });
    }
    if (!built.ok) continue;
    const paperId = `p_${uid}_${daysAgo}_${mode}`;
    const prefix = mode === 'practice' ? 'PR' : mode === 'simulator' ? 'SIM' : 'MT';
    const paper = { id: paperId, code: D.nextPaperCode(ws, uid, prefix), ownerId: uid, published: false, sample: true, ...built.paper, mode, createdAt: startedAt, reports: built.reports.map(slimReport) };
    ws.papers.push(paper);
    steps[uid] = (steps[uid] || 0) + 1;
    const responses = simulateResponses(paper, profiles[uid], rng, steps[uid]);
    const result = E.scoreAttempt(paper, responses);
    const spent = result.timeMs;
    ws.attempts.push({ id: `a_${uid}_${daysAgo}_${mode}`, paperId, userId: uid, title: paper.title, mode, status: 'submitted', startedAt, submittedAt: startedAt + Math.min(spent, (paper.durationMin || 999) * 60000), responses, result, sample: true });
    E.paperItems(paper).forEach((it) => { const q = ws.questions.find((x) => x.id === it.qid); if (q) q.usageCount = (q.usageCount || 0) + 1; });
  }

  // Official mock published by the admin for all students.
  const upsc = exams[0];
  const mini = upsc.patterns[1];
  const off = E.buildPaper(ws.questions, { ...D.specFromPattern(ws, upsc, mini, D.currentVersion(mini), { seed: 'official-001', strategy: 'fill' }), now: now - 3 * 86400000 });
  if (off.ok) ws.papers.push({ id: 'p_official_001', code: 'OFF-001', ownerId: null, published: true, publishedAt: now - 3 * 86400000, sample: true, ...off.paper, mode: 'official', title: 'UPSC Prelims mini mock · Weekly test 01', createdBy: 'u_admin', reports: off.reports.map(slimReport) });

  ws.bookmarks = [
    { id: 'b1', userId: 'u_riya', qid: 'q_0049', createdAt: now - 9 * 86400000, note: '' },
    { id: 'b2', userId: 'u_riya', qid: 'q_0056', createdAt: now - 5 * 86400000, note: 'Confused Iltutmish and Balban' },
    { id: 'b3', userId: 'u_riya', qid: 'q_0090', createdAt: now - 4 * 86400000, note: '' },
  ].filter((b) => ws.questions.find((q) => q.id === b.qid));
  ws.reports = [{ id: 'r1', qid: 'q_0040', userId: 'u_riya', reason: 'ambiguous', message: 'The Chandra identification is debated. Should the question say "generally identified"? It does, but option D could confuse.', status: 'open', createdAt: now - 2 * 86400000 }];
  const flagged = ws.questions.find((q) => q.id === 'q_0040');
  if (flagged) flagged.flags = [{ id: 'f1', by: 'u_riya', reason: 'ambiguous', at: now - 2 * 86400000, resolved: false }];
  ws.upgradeRequests = [{ id: 'ur1', userId: 'u_arjun', planId: 'basic', coupon: 'LAUNCH20', price: 299, finalPrice: 239, status: 'open', createdAt: now - 1 * 86400000 }];
  ws.audit = [{ id: 'au1', at: now, userId: 'system', action: 'workspace.created', detail: `Sample workspace created with ${questions.length} published questions, ${pipeline.length} in the review pipeline, ${exams.length} exams` }];
  return ws;
}
const round4 = (n) => Math.round(n * 10000) / 10000;
export function slimReport(r) {
  return { name: r.name, requested: r.requested, delivered: r.delivered, deliveredByDifficulty: r.deliveredByDifficulty, targetByDifficulty: r.targetByDifficulty, adjustments: r.adjustments, deliveredByTopic: r.deliveredByTopic };
}
