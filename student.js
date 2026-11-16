import { html, useState, useMemo, useStore, nav, Icon, Field, Notice, Stat, Empty, Tabs, Chips, BarList, StackBar, LineChart, Modal, DiffPill, toast, attempt, fmtDate, fmtShort, fmtPct, fmtMarks, fmtINR, timeAgo, plural, useConfirm, QuestionBody } from './core.js';
import * as E from './engine.js';
import * as D from './domain.js';
const readinessKey = (ws) => ws.exams.map((e) => e.patterns.map((p) => p.id + ':' + p.currentV + ':' + p.versions.length).join(',')).join('|') + '#' + ws.questions.filter((q) => q.status === 'published').length + ':' + ws.questions.length + ':' + ws.topics.filter((t) => t.archived).length;
import * as S from './store.js';

// ---------- shared ----------
export function launch(paperId) {
  const a = attempt(() => S.startAttempt(paperId));
  if (a) nav('attempt', { attemptId: a.id });
}
export function entitlement(feature) {
  const s = S.store;
  return E.checkEntitlement(s.user, s.ws.plans, feature, D.usageToday(s.ws, s.user.id));
}
export function UpgradeHint({ reason, compact }) {
  return html`<div class=${compact ? 'row' : 'lock-overlay'}>${Icon('lock', compact ? 16 : 22)}<span class=${compact ? 'small muted' : ''}>${reason}</span><button class="btn sm" onClick=${() => nav('plans')}>See plans</button></div>`;
}
const myAttempts = (ws, uid) => ws.attempts.filter((a) => a.userId === uid);
function greeting() {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
const modeLabel = { practice: 'Practice', custom: 'Custom mock', simulator: 'Exam simulator', revision: 'Revision', weakness: 'Weak-area test', official: 'Assigned test' };

export function GenerationProblem({ reports, onFill, onReduce, ws }) {
  const shorts = reports.filter((r) => r.shortfalls.length);
  const canFill = shorts.every((r) => r.shortfalls.every((s) => s.kind === 'difficulty'));
  const max = shorts.length === 1 && shorts[0].maxPossible;
  return html`<${Notice} kind="warn"><div class="stack sm">
    <b>The paper could not be generated exactly as requested.</b>
    ${shorts.map((r) => html`<div>${reports.length > 1 && html`<b>${r.name}: </b>`}${r.shortfalls.map((s) => html`<div>${s.message}</div>`)}</div>`)}
    <div class="row tight" style="margin-top:4px">
      ${canFill && onFill && html`<button class="btn sm" onClick=${onFill}>Fill gaps from nearby difficulty</button>`}
      ${max > 0 && onReduce && html`<button class="btn sm" onClick=${() => onReduce(max)}>Make it ${max} questions instead</button>`}
    </div></div></${Notice}>`;
}

// ---------- Dashboard ----------
export function StudentHome() {
  const s = useStore();
  const { ws, user } = s;
  const atts = myAttempts(ws, user.id);
  const an = useMemo(() => E.studentAnalytics(atts), [s.rev]);
  const adv = entitlement('advancedAnalytics');
  const recEnt = entitlement('recommendations');
  const rec = E.recommendations(an, { taxonomyName: (id) => D.taxName(ws, id) });
  const done = atts.filter((a) => a.status === 'submitted').sort((a, b) => b.submittedAt - a.submittedAt);
  const inProgress = atts.filter((a) => a.status === 'in_progress');
  const official = ws.papers.filter((p) => p.published && (!p.assignedTo || p.assignedTo.includes(user.id)) && !atts.some((a) => a.paperId === p.id && a.status === 'submitted'));
  const targets = ws.exams.filter((e) => user.targetExamIds.includes(e.id));

  // Where marks go: last 5 tests with negative marking
  const lastScored = done.filter((a) => (ws.papers.find((p) => p.id === a.paperId)?.mode !== 'practice')).slice(0, 5);
  const loss = lastScored.reduce((acc, a) => {
    a.result.rows.forEach((r) => { if (r.status === 'correct') acc.earned += r.max; else if (r.status === 'incorrect') { acc.wrong += r.max; acc.penalty += r.negative; } else acc.blank += r.max; });
    return acc;
  }, { earned: 0, wrong: 0, penalty: 0, blank: 0 });

  const weakTest = () => {
    const ent = entitlement('weaknessTests');
    if (!ent.allowed) return toast(ent.reason + ' Upgrade to generate weak-area tests.', 'bad');
    const mockEnt = entitlement('mock'); if (!mockEnt.allowed) return toast(mockEnt.reason, 'bad');
    const subjIds = new Set(); targets.forEach((e) => e.patterns.forEach((p) => D.currentVersion(p).sections.forEach((sec) => sec.subjectIds.forEach((x) => subjIds.add(x)))));
    let topicIds = D.topicsForScope(ws, { subjectIds: [...subjIds] });
    const pubTopics = new Set(ws.questions.filter((q) => q.status === 'published').map((q) => q.topicId));
    topicIds = topicIds.filter((t) => pubTopics.has(t));
    const weights = E.weaknessWeights(an, topicIds);
    const res = S.generatePaper({ title: 'Weak-area test', mode: 'weakness', examId: targets[0]?.id, sections: [{ id: 's1', name: 'Weak areas', count: 20, topicIds, topicWeights: weights }], distribution: E.DISTRIBUTION_PRESETS.mixed, marks: 2, negative: 0.6667, durationMin: 24, lang: 'en', strategy: 'fill' }, { titlePrefix: 'Weak-area test' });
    if (!res.ok) return toast('Not enough questions to build a weak-area test yet.', 'bad');
    launch(res.paper.id);
  };
  const practiseTopic = (topicId) => {
    const ent = entitlement('practice');
    if (!ent.allowed) return toast(ent.reason, 'bad');
    const res = S.generatePaper({ title: `Practice · ${D.taxName(ws, topicId)}`, mode: 'practice', sections: [{ id: 's1', name: D.taxName(ws, topicId), count: Math.min(10, ws.questions.filter((q) => q.status === 'published' && q.topicId === topicId && q.lang === 'en').length), topicIds: [topicId] }], distribution: E.DISTRIBUTION_PRESETS.mixed, marks: 1, negative: 0, lang: 'en', instantFeedback: true, strategy: 'fill' });
    if (!res.ok) return toast('Not enough published questions in this topic yet.', 'bad');
    launch(res.paper.id);
  };

  return html`
    <div class="hello">
      <div class="stack sm"><p class="muted">${greeting()},</p><h1>${user.name.split(' ')[0]}</h1>
        <div class="row tight">${targets.length ? targets.map((e) => html`<span class="pill info">${e.short}</span>`) : html`<button class="btn sm" onClick=${() => nav('profile')}>Choose your target exam</button>`}</div></div>
      <div class="row">${an.streak > 0 && html`<span class="streak">${Icon('flame', 16)} ${plural(an.streak, 'day')} streak</span>`}<button class="btn primary" onClick=${() => nav('create')}>${Icon('plus')} Create a test</button></div>
    </div>

    ${inProgress.length > 0 && html`<${Notice} kind="info"><div class="row between" style="width:100%"><span>You have ${plural(inProgress.length, 'test')} in progress: <b>${inProgress[0].title}</b></span><button class="btn sm primary" onClick=${() => nav('attempt', { attemptId: inProgress[0].id })}>Resume</button></div></${Notice}>`}
    ${official.length > 0 && html`<div class="card"><div class="card-head"><h3>Assigned tests</h3><span class="pill accent">${official.length} new</span></div>
      ${official.slice(0, 3).map((p) => html`<div class="row between"><div class="stack sm" style="gap:0"><b>${p.title}</b><span class="xs muted">${p.questionCount} questions · ${p.durationMin} min · ${fmtMarks(p.maxMarks)} marks · published ${timeAgo(p.publishedAt)}</span></div><button class="btn sm" onClick=${() => launch(p.id)}>Start</button></div>`)}</div>`}

    ${done.length === 0 ? html`<div class="card"><h2>Start with one of these</h2><div class="grid g3">
        <button class="chapter-card" style="text-align:left;cursor:pointer" onClick=${() => nav('practice')}>${Icon('book', 22)}<b>Practise a chapter</b><span class="small muted">Untimed, with instant feedback after each question.</span></button>
        <button class="chapter-card" style="text-align:left;cursor:pointer" onClick=${() => nav('create')}>${Icon('plus', 22)}<b>Create a custom test</b><span class="small muted">Pick chapters, topics, difficulty and marking.</span></button>
        <button class="chapter-card" style="text-align:left;cursor:pointer" onClick=${() => nav('simulator')}>${Icon('clock', 22)}<b>Sit a full exam simulation</b><span class="small muted">The real pattern, timer and palette.</span></button></div></div>` : html`
    <div class="stats">
      <${Stat} k="Tests completed" v=${an.tests} s=${`${an.totalQ} questions seen`} />
      <${Stat} k="Average score" v=${fmtPct(an.avgScorePct, 1)} s="after negative marking" />
      <${Stat} k="Best score" v=${fmtPct(an.bestScorePct, 1)} />
      <${Stat} k="Accuracy" v=${fmtPct(an.accuracy, 1)} s=${`${an.correct} right · ${an.incorrect} wrong`} />
      <${Stat} k="Avg time / question" v=${an.avgTimePerQ != null ? `${an.avgTimePerQ}s` : '—'} />
    </div>
    <div class="grid g-side">
      <div class="card"><div class="card-head"><div><h3>Score trend</h3><p>Percentage of maximum marks, oldest to newest</p></div></div>
        <${LineChart} points=${an.trend.map((t, i) => ({ x: fmtShort(t.at), y: t.pct, title: t.title }))} yMin=${0} label="Score" /></div>
      <div class="card"><div class="card-head"><div><h3>Where your marks went</h3><p>Last ${plural(lastScored.length, 'scored test')}</p></div></div>
        ${lastScored.length ? html`<${StackBar} height=${14} segments=${[{ value: loss.earned, cls: 'seg-good', label: 'Earned' }, { value: loss.wrong, cls: 'seg-bad', label: 'Missed on wrong answers' }, { value: loss.penalty, cls: 'seg-warn', label: 'Negative marking' }, { value: loss.blank, cls: 'seg-none', label: 'Left unattempted' }]} />
        <div class="legend"><span><i class="seg-good"></i>Earned ${fmtMarks(loss.earned)}</span><span><i class="seg-bad"></i>Wrong ${fmtMarks(loss.wrong)}</span><span><i class="seg-warn"></i>Penalty ${fmtMarks(loss.penalty)}</span><span><i class="seg-none"></i>Blank ${fmtMarks(loss.blank)}</span></div>
        <p class="small">${loss.penalty > loss.blank * 0.5 ? html`Negative marking took <b>${fmtMarks(loss.penalty)}</b> marks. Skipping questions you are unsure of could raise your score.` : html`You left <b>${fmtMarks(loss.blank)}</b> marks on unattempted questions. Attempting more of the ones you can narrow down may help.`}</p>`
        : html`<p class="small muted">Sit a mock with negative marking to see this breakdown.</p>`}</div>
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>Accuracy by subject</h3></div>
        <${BarList} items=${an.subjects.filter((x) => x.attempted).map((x) => ({ label: D.taxName(ws, x.key), sub: `${x.attempted}`, title: `${x.attempted} answered`, value: x.accuracy }))} /></div>
      <div class="card"><div class="card-head"><h3>Accuracy by difficulty</h3></div>
        ${adv.allowed ? html`<${BarList} items=${E.DIFFICULTIES.map((d) => an.difficulty.find((x) => x.key === d)).filter((x) => x && x.attempted).map((x) => ({ label: E.DIFFICULTY_LABEL[x.key], sub: `${x.attempted}`, value: x.accuracy }))} />` : html`<${UpgradeHint} reason="Difficulty-wise analysis is part of Premium." />`}</div>
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><div><h3>Weakest topics</h3><p>Ranked only after ${E.MIN_TOPIC_SAMPLE}+ answered questions in a topic</p></div></div>
        ${!adv.allowed ? html`<${UpgradeHint} reason="Topic-level analysis is part of Premium." />` : an.weakest.length ? an.weakest.map((t) => html`<div class="row between"><div class="stack sm" style="gap:0;min-width:0"><b class="small">${D.taxName(ws, t.key)}</b><span class="xs muted">${fmtPct(t.accuracy * 100)} accuracy · ${t.correct}/${t.attempted} correct</span></div><button class="btn sm" onClick=${() => practiseTopic(t.key)}>Practise</button></div>`) : html`<p class="small muted">${an.enoughData ? 'No topic is below 60% accuracy. Well done.' : 'Not enough answers per topic yet to rank weaknesses.'}</p>`}</div>
      <div class="card"><div class="card-head"><h3>Strongest topics</h3></div>
        ${!adv.allowed ? html`<${UpgradeHint} reason="Topic-level analysis is part of Premium." />` : an.strongest.length ? html`<${BarList} items=${an.strongest.map((t) => ({ label: D.taxName(ws, t.key), sub: `${t.attempted}`, value: t.accuracy }))} />` : html`<p class="small muted">Topics appear here once you reach 70% accuracy over at least ${E.MIN_TOPIC_SAMPLE} questions.</p>`}</div>
    </div>
    <div class="card"><div class="card-head"><div><h3>What to practise next</h3><p>Based on your answers so far</p></div><button class="btn" onClick=${weakTest}>${Icon('target')} Generate a weak-area test</button></div>
      ${!recEnt.allowed ? html`<${UpgradeHint} reason="Personalised recommendations are part of Premium." />` : !rec.ready ? html`<p class="small muted">${rec.message}</p>` : html`<div class="stack">${rec.items.map((r) => html`<div class="row between"><div class="stack sm" style="gap:0"><b>${r.title}</b><span class="small muted">${r.why}</span></div>
          ${r.kind === 'topic' ? html`<button class="btn sm" onClick=${() => practiseTopic(r.topicId)}>Start practice</button>` : r.kind === 'revision' ? html`<button class="btn sm" onClick=${() => nav('revision')}>Open revision</button>` : r.kind === 'difficulty' ? html`<button class="btn sm" onClick=${() => nav('create', { preset: 'difficult' })}>Create test</button>` : html`<button class="btn sm" onClick=${() => nav('simulator')}>Open simulator</button>`}</div>`)}</div>`}</div>
    <div class="card flush"><div class="card-head" style="padding:16px 18px 6px"><h3>Recent attempts</h3><button class="btn sm ghost" onClick=${() => nav('tests')}>All tests ${Icon('right', 16)}</button></div>
      <${AttemptTable} rows=${done.slice(0, 6)} /></div>`}`;
}

export function AttemptTable({ rows }) {
  const s = useStore();
  if (!rows.length) return html`<${Empty} title="No completed tests yet" />`;
  return html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Test</th><th class="desktop-only">Mode</th><th>Date</th><th class="r">Score</th><th class="r">%</th><th class="r desktop-only">Accuracy</th></tr></thead><tbody>
    ${rows.map((a) => { const p = s.ws.papers.find((x) => x.id === a.paperId); return html`<tr class="clickable" onClick=${() => nav('result', { attemptId: a.id })}>
      <td><b class="small">${a.title}</b><div class="xs muted">${p?.code}${a.autoSubmitted ? ' · auto-submitted' : ''}${a.sample ? ' · sample history' : ''}</div></td>
      <td class="desktop-only small">${modeLabel[a.mode] || a.mode}</td><td class="nowrap small">${fmtShort(a.submittedAt)}</td>
      <td class="r num nowrap">${fmtMarks(a.result.score)} / ${fmtMarks(a.result.max)}</td><td class="r num">${fmtPct(a.result.percentage, 1)}</td><td class="r num desktop-only">${fmtPct(a.result.accuracy)}</td></tr>`; })}
  </tbody></table></div>`;
}

// ---------- Chapter-wise practice ----------
export function PracticeView() {
  const s = useStore();
  const { ws, user } = s;
  const [cfg, setCfg] = useState(null);
  const an = useMemo(() => E.studentAnalytics(myAttempts(ws, user.id)), [s.rev]);
  const seen = useMemo(() => { const set = new Set(); myAttempts(ws, user.id).filter((a) => a.status === 'submitted').forEach((a) => a.result.rows.forEach((r) => set.add(r.qid))); return set; }, [s.rev]);
  const pub = ws.questions.filter((q) => q.status === 'published' && (q.lang || 'en') === 'en');
  const subjects = ws.subjects.filter((x) => !x.archived).sort((a, b) => a.order - b.order).map((sub) => ({ sub, chapters: ws.chapters.filter((c) => c.subjectId === sub.id && !c.archived).sort((a, b) => a.order - b.order) })).filter((g) => g.chapters.some((c) => pub.some((q) => q.chapterId === c.id)));
  const ent = entitlement('practice');
  return html`<div class="page-head"><div><h1>Chapter practice</h1><p>Untimed practice with instant feedback. Pick a chapter, or narrow it to topics.</p></div>
      ${ent.limit != null && html`<span class="pill ${ent.allowed ? 'info' : 'bad'}">${ent.used} of ${ent.limit} practice questions used today</span>`}</div>
    ${subjects.map(({ sub, chapters }) => html`<section class="stack"><h2>${sub.name}</h2><div class="grid g2">
      ${chapters.map((c) => {
        const qs = pub.filter((q) => q.chapterId === c.id);
        if (!qs.length) return null;
        const seenN = qs.filter((q) => seen.has(q.id)).length;
        const ch = an.chapters.find((x) => x.key === c.id);
        const wrong = an.wrongLast.filter((id) => qs.some((q) => q.id === id));
        const topics = ws.topics.filter((t) => t.chapterId === c.id && !t.archived);
        return html`<div class="chapter-card">
          <div class="row between nowrap"><h3>${c.name}</h3>${ch?.attempted ? html`<span class="pill ${ch.accuracy >= 0.7 ? 'good' : ch.accuracy < 0.5 ? 'bad' : 'warn'}">${fmtPct(ch.accuracy * 100)} accuracy</span>` : html`<span class="pill">Not started</span>`}</div>
          <div class="stack sm"><div class="bar thin"><span style=${`width:${(seenN / qs.length) * 100}%`}></span></div><div class="meta"><span>${seenN} of ${qs.length} questions seen</span><span>${plural(topics.length, 'topic')}</span></div></div>
          <div class="row tight"><button class="btn primary sm" onClick=${() => setCfg({ chapter: c })}>${Icon('play', 15)} Practise</button>
            ${wrong.length > 0 && html`<button class="btn sm" onClick=${() => { const r = S.generateFixedPaper(wrong, { title: `Retry incorrect · ${c.name}`, mode: 'practice' }); r.ok ? launch(r.paper.id) : toast(r.message, 'bad'); }}>Retry ${wrong.length} incorrect</button>`}</div>
        </div>`;
      })}</div></section>`)}
    ${cfg && html`<${PracticeSetup} chapter=${cfg.chapter} onClose=${() => setCfg(null)} />`}`;
}

function PracticeSetup({ chapter, onClose }) {
  const s = useStore();
  const { ws } = s;
  const topics = ws.topics.filter((t) => t.chapterId === chapter.id && !t.archived);
  const [sel, setSel] = useState(topics.map((t) => t.id));
  const [count, setCount] = useState(10);
  const [diff, setDiff] = useState('mixed');
  const [instant, setInstant] = useState(true);
  const [prob, setProb] = useState(null);
  const pool = ws.questions.filter((q) => q.status === 'published' && sel.includes(q.topicId) && (q.lang || 'en') === 'en');
  const ent = entitlement('practice');
  const go = (strategy = 'strict', n = count) => {
    if (ent.limit != null && ent.used + n > ent.limit) return setProb({ limit: true });
    const res = S.generatePaper({ title: `Practice · ${chapter.name}`, mode: 'practice', sections: [{ id: 's1', name: chapter.name, count: n, topicIds: sel }], distribution: E.DISTRIBUTION_PRESETS[diff], marks: 1, negative: 0, lang: 'en', instantFeedback: instant, strategy, durationMin: 0 });
    if (!res.ok) return setProb({ reports: res.reports });
    onClose(); launch(res.paper.id);
  };
  return html`<${Modal} title=${`Practise: ${chapter.name}`} onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!sel.length} onClick=${() => go()}>Start practice</button>`}>
    <div class="field"><span class="label">Topics</span><${Chips} multi options=${topics.map((t) => ({ id: t.id, label: t.name, n: ws.questions.filter((q) => q.status === 'published' && q.topicId === t.id && (q.lang || 'en') === 'en').length }))} value=${sel} onChange=${setSel} /></div>
    <div class="field"><span class="label">Number of questions</span><${Chips} options=${[5, 10, 20, 30].map((n) => ({ id: n, label: String(n), disabled: n > pool.length }))} value=${count} onChange=${setCount} /></div>
    <div class="field"><span class="label">Difficulty</span><${Chips} options=${[{ id: 'mixed', label: 'Mixed' }, { id: 'easy', label: 'Easy' }, { id: 'moderate', label: 'Moderate' }, { id: 'difficult', label: 'Difficult' }]} value=${diff} onChange=${setDiff} /></div>
    <label class="check"><input type="checkbox" checked=${instant} onChange=${(e) => setInstant(e.target.checked)} /> Show the answer after each question</label>
    <p class="xs muted">${pool.length} published questions available in the selected topics.</p>
    ${prob?.limit && html`<${UpgradeHint} compact reason=${`${ent.reason} You have ${Math.max(0, ent.limit - ent.used)} left today.`} />`}
    ${prob?.reports && html`<${GenerationProblem} reports=${prob.reports} onFill=${() => go('fill')} onReduce=${(n) => { setCount(n); go('strict', n); }} />`}
  </${Modal}>`;
}

// ---------- Create a test (paper generator) ----------
export function CreateView({ params }) {
  const s = useStore();
  const { ws, user } = s;
  const exams = ws.exams.filter((e) => e.status === 'active');
  const [st, setSt] = useState(() => {
    const ex = exams.find((e) => user.targetExamIds.includes(e.id)) || exams[0];
    return { examId: ex?.id, stage: ex?.patterns[0]?.stage, subjectIds: [], chapterIds: [], topicIds: [], count: 25, custom: '', diff: params?.preset || 'mixed', dist: { easy: 30, moderate: 50, difficult: 20, advanced: 0 }, types: [], lang: 'en', marks: null, negative: null, duration: null, shuffleOptions: true, instant: false, title: '' };
  });
  const [result, setResult] = useState(null);
  const set = (patch) => { setSt({ ...st, ...patch }); setResult(null); };
  const exam = ws.exams.find((e) => e.id === st.examId);
  const stages = exam ? [...new Set(exam.patterns.map((p) => p.stage))] : [];
  const pattern = exam?.patterns.find((p) => p.stage === st.stage && p.kind === 'exam') || exam?.patterns.find((p) => p.stage === st.stage);
  const ver = pattern && D.currentVersion(pattern);
  const stageSubjects = ver ? [...new Set(ver.sections.flatMap((x) => x.subjectIds))] : ws.subjects.map((x) => x.id);
  const pub = ws.questions.filter((q) => q.status === 'published' && (q.lang || 'en') === st.lang);
  const subjects = ws.subjects.filter((x) => !x.archived && stageSubjects.includes(x.id)).sort((a, b) => a.order - b.order);
  const chapters = ws.chapters.filter((c) => !c.archived && st.subjectIds.includes(c.subjectId)).sort((a, b) => a.order - b.order);
  const topics = ws.topics.filter((t) => !t.archived && st.chapterIds.includes(t.chapterId));
  const scopeTopics = st.topicIds.length ? st.topicIds : D.topicsForScope(ws, { subjectIds: st.subjectIds, chapterIds: st.chapterIds });
  const count = st.count === 'custom' ? Math.floor(Number(st.custom) || 0) : st.count;
  const dist = st.diff === 'custom' ? st.dist : E.DISTRIBUTION_PRESETS[st.diff];
  const pool = pub.filter((q) => scopeTopics.includes(q.topicId) && (!st.types.length || st.types.includes(q.type)));
  const target = E.allocateByRatio(count, E.normaliseDistribution(dist));
  const marks = st.marks ?? ver?.marksPerQ ?? 1;
  const negative = st.negative ?? (ver ? Math.round(ver.marksPerQ * ver.negativeFraction * 10000) / 10000 : 0);
  const duration = st.duration ?? (ver ? Math.round((ver.durationMin / ver.totalQuestions) * count) : count);
  const distTotal = E.DIFFICULTIES.reduce((a, d) => a + (Number(st.dist[d]) || 0), 0);
  const ready = st.examId && st.subjectIds.length && st.chapterIds.length && count > 0 && (st.diff !== 'custom' || distTotal === 100);
  const mockEnt = entitlement('mock');
  const typesAvail = [...new Set(pub.filter((q) => scopeTopics.includes(q.topicId)).map((q) => q.type))];

  const generate = (strategy = 'strict', n = count) => {
    if (!mockEnt.allowed) return setResult({ limit: true });
    const spec = { title: st.title.trim() || `${exam.short} · ${st.chapterIds.length === 1 ? ws.chapters.find((c) => c.id === st.chapterIds[0]).name : subjects.filter((x) => st.subjectIds.includes(x.id)).map((x) => x.name).join(', ')}`, mode: 'custom', examId: exam.id, patternId: pattern?.id, patternVersion: ver?.v, sections: [{ id: 's1', name: st.title.trim() || 'Custom test', count: n, topicIds: scopeTopics }], distribution: dist, types: st.types, lang: st.lang, marks: Number(marks), negative: Number(negative), durationMin: Number(duration), shuffleOptions: st.shuffleOptions, instantFeedback: st.instant, strategy };
    const res = S.generatePaper(spec, { titlePrefix: 'Mock test' });
    setResult(res.ok ? { paper: res.paper, reports: res.reports, spec } : { reports: res.reports, spec, n });
  };
  const anotherVersion = () => {
    const old = result.paper;
    if (!S.store.ws.attempts.some((x) => x.paperId === old.id)) attempt(() => S.deletePaper(old.id));
    generate(old.config?.strategy || 'strict', old.questionCount);
  };

  const stepDone = [!!st.examId, !!st.stage, st.subjectIds.length > 0, st.chapterIds.length > 0, true, ready];
  return html`<div class="page-head"><div><h1>Create a test</h1><p>Choose what to cover and how the paper should be built. Every paper is drawn fresh from approved questions; the same choices give a different paper each time.</p></div></div>
    <div class="grid g-side">
      <div class="card" style="padding-bottom:0">
        <${Step} n=${1} done=${stepDone[0]} title="Examination"><${Chips} options=${exams.map((e) => ({ id: e.id, label: e.short }))} value=${st.examId} onChange=${(id) => { const ex = ws.exams.find((e) => e.id === id); set({ examId: id, stage: ex.patterns[0]?.stage, subjectIds: [], chapterIds: [], topicIds: [], marks: null, negative: null, duration: null }); }} /></${Step}>
        <${Step} n=${2} done=${stepDone[1]} title="Stage">${stages.length ? html`<${Chips} options=${stages.map((x) => ({ id: x, label: x }))} value=${st.stage} onChange=${(x) => set({ stage: x, subjectIds: [], chapterIds: [], topicIds: [], marks: null, negative: null, duration: null })} />` : html`<p class="small muted">This exam has no stages configured yet.</p>`}
          ${ver && html`<p class="xs muted">Marking defaults from ${pattern.name} (v${ver.v}, ${ver.year}): ${fmtMarks(ver.marksPerQ)} marks, −${fmtMarks(Math.round(ver.marksPerQ * ver.negativeFraction * 100) / 100)} per wrong answer. ${pattern.status === 'sample' ? 'Sample pattern, not verified.' : ''}</p>`}</${Step}>
        <${Step} n=${3} done=${stepDone[2]} title="Subjects" hint="Select one or more"><${Chips} multi options=${subjects.map((x) => ({ id: x.id, label: x.name, n: pub.filter((q) => q.subjectId === x.id).length }))} value=${st.subjectIds} onChange=${(v) => set({ subjectIds: v, chapterIds: st.chapterIds.filter((c) => v.includes(ws.chapters.find((x) => x.id === c)?.subjectId)), topicIds: [] })} /></${Step}>
        <${Step} n=${4} done=${stepDone[3]} title="Chapters" hint=${chapters.length ? html`<button class="btn sm ghost" onClick=${() => set({ chapterIds: chapters.map((c) => c.id), topicIds: [] })}>Select all</button>` : ''}>${chapters.length ? html`<${Chips} multi options=${chapters.map((c) => ({ id: c.id, label: c.name, n: pub.filter((q) => q.chapterId === c.id).length, disabled: !pub.some((q) => q.chapterId === c.id) }))} value=${st.chapterIds} onChange=${(v) => set({ chapterIds: v, topicIds: st.topicIds.filter((t) => v.includes(ws.topics.find((x) => x.id === t)?.chapterId)) })} />` : html`<p class="small muted">Choose a subject first.</p>`}</${Step}>
        <${Step} n=${5} done=${stepDone[4]} title="Topics (optional)" hint="Leave empty to cover every topic in the chapters">${topics.length ? html`<${Chips} multi options=${topics.map((t) => ({ id: t.id, label: t.name, n: pub.filter((q) => q.topicId === t.id).length, disabled: !pub.some((q) => q.topicId === t.id) }))} value=${st.topicIds} onChange=${(v) => set({ topicIds: v })} />` : html`<p class="small muted">Choose chapters first.</p>`}</${Step}>
        <${Step} n=${6} done=${stepDone[5]} title="Configure the paper">
          <div class="field"><span class="label">Number of questions</span><div class="row"><${Chips} options=${[10, 25, 40, 50, 100].map((n) => ({ id: n, label: String(n) })).concat([{ id: 'custom', label: 'Custom' }])} value=${st.count} onChange=${(v) => set({ count: v })} />${st.count === 'custom' && html`<input class="input" style="width:110px" type="number" min="1" max="300" aria-label="Custom number of questions" value=${st.custom} onInput=${(e) => set({ custom: e.target.value })} />`}</div></div>
          <div class="field"><span class="label">Difficulty</span><${Chips} options=${[{ id: 'easy', label: 'Easy' }, { id: 'moderate', label: 'Moderate' }, { id: 'difficult', label: 'Difficult' }, { id: 'mixed', label: 'Mixed (30/50/20)' }, { id: 'custom', label: 'Custom mix' }]} value=${st.diff} onChange=${(v) => set({ diff: v })} />
            ${st.diff === 'custom' && html`<div class="grid g4">${E.DIFFICULTIES.map((d) => html`<${Field} label=${`${E.DIFFICULTY_LABEL[d]} %`} id=${'d-' + d}><input id=${'d-' + d} class="input" type="number" min="0" max="100" value=${st.dist[d]} onInput=${(e) => set({ dist: { ...st.dist, [d]: Number(e.target.value) || 0 } })} /></${Field}>`)}</div>
              ${distTotal !== 100 && html`<p class="err small" style="color:var(--bad)">The mix adds up to ${distTotal}%. Make it 100%.</p>`}`}</div>
          <div class="field"><span class="label">Question formats</span><${Chips} multi options=${typesAvail.map((t) => ({ id: t, label: E.QUESTION_TYPES[t].label }))} value=${st.types} onChange=${(v) => set({ types: v })} /><span class="hint">Leave empty to allow every format.</span></div>
          <div class="grid g3">
            <${Field} label="Marks per question" id="c-marks"><input id="c-marks" class="input" type="number" step="0.01" min="0.25" value=${marks} onInput=${(e) => set({ marks: Number(e.target.value) })} /></${Field}>
            <${Field} label="Negative marks per wrong answer" id="c-neg"><input id="c-neg" class="input" type="number" step="0.01" min="0" value=${negative} onInput=${(e) => set({ negative: Number(e.target.value) })} /></${Field}>
            <${Field} label="Time limit (minutes)" id="c-time" hint="0 for untimed"><input id="c-time" class="input" type="number" min="0" value=${duration} onInput=${(e) => set({ duration: Number(e.target.value) })} /></${Field}>
          </div>
          <div class="grid g2">
            <${Field} label="Language" id="c-lang"><select id="c-lang" class="input" value=${st.lang} onChange=${(e) => set({ lang: e.target.value, topicIds: [] })}><option value="en">English</option><option value="hi">Hindi (हिन्दी)</option></select></${Field}>
            <${Field} label="Paper title (optional)" id="c-title"><input id="c-title" class="input" value=${st.title} onInput=${(e) => set({ title: e.target.value })} placeholder="e.g. Modern India revision" /></${Field}>
          </div>
          <div class="stack sm"><label class="check"><input type="checkbox" checked=${st.shuffleOptions} onChange=${(e) => set({ shuffleOptions: e.target.checked })} /> Shuffle answer options (formats with coded options keep their order)</label>
            <label class="check"><input type="checkbox" checked=${st.instant} onChange=${(e) => set({ instant: e.target.checked })} /> Show answers and explanations after each question (practice style)</label>
            <p class="xs muted">Otherwise the answer key and explanations open after you submit.</p></div>
        </${Step}>
        <div class="sticky-cta"><span class="small">${count > 0 ? html`<b>${count}</b> questions · <b>${fmtMarks(count * marks)}</b> marks · ${duration ? `${duration} min` : 'untimed'}` : 'Choose the number of questions'}</span>
          <button class="btn primary" disabled=${!ready} onClick=${() => generate()}>${Icon('sparkles')} Generate paper</button></div>
      </div>
      <div class="stack lg">
        <div class="card"><div class="card-head"><h3>Available questions</h3><span class="pill ${pool.length >= count ? 'good' : 'bad'}">${pool.length} match</span></div>
          <div class="inventory">${E.DIFFICULTIES.map((d) => { const have = pool.filter((q) => q.difficulty === d).length; const need = ready ? target[d] : 0; return html`<div class="inv ${need > have ? 'short' : ''}"><span class="xs">${E.DIFFICULTY_LABEL[d]}</span><span class="n">${have}</span><span class="xs">${need ? `${need} needed` : '—'}</span></div>`; })}</div>
          <p class="xs muted">Only approved, published questions with an answer key are used. Questions you saw in your last five tests are picked less often.</p></div>
        ${!mockEnt.allowed && html`<div class="card"><${UpgradeHint} reason=${`${mockEnt.reason} You have used ${mockEnt.used} today.`} /></div>`}
        ${result?.limit && html`<div class="card"><${UpgradeHint} reason=${mockEnt.reason} /></div>`}
        ${result && !result.paper && result.reports && html`<${GenerationProblem} reports=${result.reports} onFill=${() => generate('fill', result.n)} onReduce=${(n) => generate('strict', n)} />`}
        ${result?.paper && html`<${PaperReady} paper=${result.paper} onAnother=${anotherVersion} />`}
      </div>
    </div>`;
}

function Step({ n, done, title, children, hint }) {
  return html`<div class="step ${done ? 'done' : ''}"><div class="step-n">${done && n < 6 ? Icon('check', 15) : n}</div><div class="step-body"><div class="row between"><h3>${title}</h3>${hint && html`<span class="xs muted">${hint}</span>`}</div>${children}</div></div>`;
}

export function PaperReady({ paper, onAnother }) {
  const s = useStore();
  const rep = paper.reports?.[0];
  return html`<div class="card" style="border-color:var(--primary)">
    <div class="card-head"><div><span class="mono muted">${paper.code}</span><h3>${paper.title}</h3></div><span class="pill good">Ready</span></div>
    <p class="small">${paper.questionCount} questions · ${fmtMarks(paper.maxMarks)} marks · ${paper.durationMin ? `${paper.durationMin} min` : 'untimed'}</p>
    <div class="check-list">${paper.validation.checks.map((c) => html`<div class="check-item"><span class="ic" style=${`color:var(--${c.severity === 'ok' ? 'good' : c.severity === 'warning' ? 'warn' : 'bad'})`}>${Icon(c.severity === 'ok' ? 'check' : 'alert', 16)}</span><span><b>${c.label}</b><br /><span class="xs muted">${c.detail}</span></span></div>`)}</div>
    ${rep && Object.keys(rep.deliveredByTopic || {}).length > 0 && html`<div class="stack sm"><span class="label">Topic coverage</span>${Object.entries(rep.deliveredByTopic).map(([t, n]) => html`<div class="row between small"><span>${D.taxName(s.ws, t)}</span><span class="num">${n}</span></div>`)}</div>`}
    ${rep?.adjustments?.length > 0 && html`<${Notice} kind="warn">Difficulty substitutions: ${rep.adjustments.map((a) => a.message).join('; ')}.</${Notice}>`}
    <div class="row"><button class="btn primary" onClick=${() => launch(paper.id)}>${Icon('play', 16)} Start now</button>${onAnother && html`<button class="btn" onClick=${onAnother}>${Icon('refresh', 16)} Another version</button>`}<button class="btn ghost" onClick=${() => nav('tests')}>Save for later</button></div>
  </div>`;
}

// ---------- Exam simulator ----------
export function SimulatorView() {
  const s = useStore();
  const { ws, user } = s;
  const [start, setStart] = useState(null);
  const ent = entitlement('simulator');
  const exams = ws.exams.filter((e) => e.status === 'active').sort((a, b) => (user.targetExamIds.includes(b.id) ? 1 : 0) - (user.targetExamIds.includes(a.id) ? 1 : 0));
  const readiness = useMemo(() => { const m = {}; exams.forEach((e) => e.patterns.forEach((p) => (m[p.id] = D.patternReadiness(ws, e, p)))); return m; }, [readinessKey(ws)]);
  return html`<div class="page-head"><div><h1>Exam simulator</h1><p>Full papers built to each examination's blueprint, with the countdown timer, question palette, mark-for-review and auto-submit of the real exam.</p></div></div>
    ${!ent.allowed && html`<div class="card"><${UpgradeHint} reason=${`The full-length simulator is part of Premium. ${ent.reason}`} /></div>`}
    ${exams.map((e) => html`<section class="stack"><div class="row"><h2>${e.name}</h2>${user.targetExamIds.includes(e.id) && html`<span class="pill info">Your target</span>`}</div>
      <div class="grid g2">${e.patterns.map((p) => { const v = D.currentVersion(p); const r = readiness[p.id]; return html`<div class="card">
        <div class="card-head"><div><span class="xs muted">${p.stage} · v${v.v} (${v.year})</span><h3>${p.name}</h3></div><span class="pill ${p.status === 'verified' ? 'good' : p.kind === 'template' ? 'info' : 'warn'}">${p.status === 'verified' ? 'Verified pattern' : p.kind === 'template' ? 'Practice template' : 'Sample pattern'}</span></div>
        <div class="row small"><span>${Icon('list', 15)} ${v.totalQuestions} questions</span><span>${Icon('clock', 15)} ${v.durationMin} min</span><span>${Icon('target', 15)} ${fmtMarks(E.round2(v.totalQuestions * v.marksPerQ))} marks</span><span>−${fmtMarks(E.round2(v.marksPerQ * v.negativeFraction))} per wrong</span></div>
        ${!v.mergeSections && v.sections.length > 1 && html`<p class="xs muted">Sections: ${v.sections.map((x) => `${x.name} (${x.count})`).join(' · ')}</p>`}
        <p class="xs muted">${p.sourceNote}</p>
        <div class="row between"><span class="pill ${r.level === 'ready' ? 'good' : r.level === 'substitute' ? 'warn' : 'bad'}">${r.label}</span>
          <button class="btn primary sm" disabled=${!ent.allowed || r.level === 'blocked'} onClick=${() => setStart({ exam: e, pattern: p, readiness: r })}>Start simulation</button></div>
        ${r.level === 'blocked' && html`<p class="xs" style="color:var(--bad)">${r.missing.map((m) => `${m.name}: ${m.shortfalls[0].message}`).join(' ')}</p>`}
      </div>`; })}</div></section>`)}
    ${start && html`<${SimStart} ...${start} onClose=${() => setStart(null)} />`}`;
}
function SimStart({ exam, pattern, readiness, onClose }) {
  const s = useStore();
  const v = D.currentVersion(pattern);
  const [ok, setOk] = useState(false);
  const begin = () => {
    const mockEnt = entitlement('mock'); if (!mockEnt.allowed) return toast(mockEnt.reason, 'bad');
    const spec = D.specFromPattern(s.ws, exam, pattern, v, { mode: 'simulator', strategy: readiness.level === 'substitute' ? 'fill' : 'strict', title: `${exam.short} · ${pattern.name}` });
    const res = S.generatePaper(spec);
    if (!res.ok) return toast('The paper could not be generated: ' + res.reports.flatMap((r) => r.shortfalls.map((x) => x.message)).join(' '), 'bad');
    onClose(); launch(res.paper.id);
  };
  return html`<${Modal} title="Instructions" sub=${`${exam.name} · ${pattern.name}`} onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!ok} onClick=${begin}>I am ready to begin</button>`}>
    <ul class="stack sm" style="padding-left:18px;margin:0">
      <li>The paper has <b>${v.totalQuestions} questions</b> for <b>${fmtMarks(E.round2(v.totalQuestions * v.marksPerQ))} marks</b>. You have <b>${v.durationMin} minutes</b>.</li>
      <li>Each correct answer earns ${fmtMarks(v.marksPerQ)} marks. Each wrong answer costs ${fmtMarks(E.round2(v.marksPerQ * v.negativeFraction))}. Unanswered questions score zero.</li>
      <li>The clock keeps running if you close the page. When time is up, your answers are submitted automatically.</li>
      <li>Use <b>Save & next</b> to move on, <b>Mark for review</b> to flag a question, and the palette to jump between questions.</li>
      <li>Questions answered and marked for review are counted in the final score.</li>
    </ul>
    ${v.instructions && html`<p class="small muted">${v.instructions}</p>`}
    ${readiness.level === 'substitute' && html`<${Notice} kind="warn">${readiness.label}: the bank has too few questions at one difficulty level, so the nearest level fills the gap.</${Notice}>`}
    ${pattern.status === 'sample' && html`<${Notice} kind="info">This is a sample pattern for practice. It is not an official paper.</${Notice}>`}
    <label class="check"><input type="checkbox" checked=${ok} onChange=${(e) => setOk(e.target.checked)} /> I have read the instructions</label>
  </${Modal}>`;
}

// ---------- My tests ----------
export function TestsView() {
  const s = useStore();
  const { ws, user } = s;
  const [tab, setTab] = useState('done');
  const [confirm, confirmEl] = useConfirm();
  const atts = myAttempts(ws, user.id);
  const done = atts.filter((a) => a.status === 'submitted').sort((a, b) => b.submittedAt - a.submittedAt);
  const open = atts.filter((a) => a.status === 'in_progress');
  const unstarted = ws.papers.filter((p) => p.ownerId === user.id && !atts.some((a) => a.paperId === p.id)).sort((a, b) => b.createdAt - a.createdAt);
  const assigned = ws.papers.filter((p) => p.published && (!p.assignedTo || p.assignedTo.includes(user.id))).sort((a, b) => b.publishedAt - a.publishedAt);
  const regen = (paper) => {
    const spec = { ...paper.config, seed: undefined, title: paper.config.title };
    if (paper.config.fixed) return toast('Revision papers use a fixed question list. Create a new revision test instead.', 'bad');
    const ent = entitlement(paper.mode === 'practice' ? 'practice' : 'mock'); if (!ent.allowed) return toast(ent.reason, 'bad');
    const res = S.generatePaper(spec, { titlePrefix: paper.mode === 'practice' ? 'Practice' : 'Mock test' });
    if (!res.ok) return toast('Not enough questions for a fresh version with these settings.', 'bad');
    toast(`${res.paper.code} generated with the same settings`); setTab('saved');
  };
  return html`<div class="page-head"><div><h1>My tests</h1><p>Every paper keeps the exact questions and answer key it was generated with, so past results never change.</p></div><button class="btn primary" onClick=${() => nav('create')}>${Icon('plus')} Create a test</button></div>
    <${Tabs} tabs=${[{ id: 'done', label: 'Completed', count: done.length }, { id: 'saved', label: 'In progress & saved', count: open.length + unstarted.length }, { id: 'assigned', label: 'Assigned', count: assigned.length }]} value=${tab} onChange=${setTab} />
    ${tab === 'done' && html`<div class="card flush">${done.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Test</th><th>Date</th><th class="r">Score</th><th class="r">%</th><th></th></tr></thead><tbody>
      ${done.map((a) => { const p = ws.papers.find((x) => x.id === a.paperId); return html`<tr><td><b class="small">${a.title}</b><div class="xs muted">${p?.code} · ${modeLabel[a.mode] || a.mode} · ${p?.questionCount} Q${a.autoSubmitted ? ' · auto-submitted' : ''}</div></td><td class="small nowrap">${fmtShort(a.submittedAt)}</td><td class="r num nowrap">${fmtMarks(a.result.score)} / ${fmtMarks(a.result.max)}</td><td class="r num">${fmtPct(a.result.percentage, 1)}</td>
        <td class="r nowrap"><button class="btn sm" onClick=${() => nav('result', { attemptId: a.id })}>Result</button> ${p && p.ownerId && !p.config?.fixed && html`<button class="btn sm ghost desktop-only" title="Same settings, new questions" onClick=${() => regen(p)}>${Icon('refresh', 15)} New version</button>`}</td></tr>`; })}
      </tbody></table></div>` : html`<${Empty} title="No completed tests yet" action=${html`<button class="btn" onClick=${() => nav('create')}>Create your first test</button>`} />`}</div>`}
    ${tab === 'saved' && html`<div class="stack">${open.map((a) => { const p = ws.papers.find((x) => x.id === a.paperId); const rem = E.remainingMs(a, p); return html`<div class="card"><div class="row between"><div><b>${a.title}</b><div class="xs muted">${p.code} · started ${timeAgo(a.startedAt)} · ${Object.values(a.responses).filter((r) => r.answer != null && r.answer !== '').length} of ${p.questionCount} answered${rem != null ? ` · ${Math.ceil(rem / 60000)} min left` : ''}</div></div><button class="btn primary sm" onClick=${() => nav('attempt', { attemptId: a.id })}>Resume</button></div></div>`; })}
      ${unstarted.map((p) => html`<div class="card"><div class="row between"><div><b>${p.title}</b><div class="xs muted">${p.code} · ${p.questionCount} questions · ${fmtMarks(p.maxMarks)} marks · ${p.durationMin ? `${p.durationMin} min` : 'untimed'} · created ${timeAgo(p.createdAt)}</div></div><div class="row tight"><button class="btn sm ghost" onClick=${async () => { if (await confirm({ title: 'Delete this paper?', body: 'It has not been attempted, so nothing else is affected.', ok: 'Delete', danger: true })) attempt(() => S.deletePaper(p.id), 'Paper deleted'); }}>${Icon('trash', 15)}</button><button class="btn primary sm" onClick=${() => launch(p.id)}>Start</button></div></div></div>`)}
      ${!open.length && !unstarted.length && html`<div class="card"><${Empty} title="Nothing saved">Papers you generate but do not start yet appear here.</${Empty}></div>`}</div>`}
    ${tab === 'assigned' && html`<div class="stack">${assigned.length ? assigned.map((p) => { const mine = atts.find((a) => a.paperId === p.id && a.status === 'submitted'); return html`<div class="card"><div class="row between"><div><b>${p.title}</b><div class="xs muted">${p.code} · ${p.questionCount} questions · ${p.durationMin} min · ${fmtMarks(p.maxMarks)} marks · published ${fmtDate(p.publishedAt)}${p.releaseAt ? ` · answers released ${fmtDate(p.releaseAt)}` : ''}</div></div>${mine ? html`<button class="btn sm" onClick=${() => nav('result', { attemptId: mine.id })}>View result</button>` : html`<button class="btn primary sm" onClick=${() => launch(p.id)}>Start</button>`}</div></div>`; }) : html`<div class="card"><${Empty} title="No assigned tests">Tests your institute or the platform publishes appear here.</${Empty}></div>`}</div>`}
    ${confirmEl}`;
}

// ---------- Revision ----------
export function RevisionView() {
  const s = useStore();
  const { ws, user } = s;
  const [tab, setTab] = useState('mistakes');
  const an = useMemo(() => E.studentAnalytics(myAttempts(ws, user.id)), [s.rev]);
  const marks = ws.bookmarks.filter((b) => b.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
  const qOf = (id) => ws.questions.find((q) => q.id === id);
  const mistakes = an.wrongLast.map(qOf).filter(Boolean);
  const repeated = an.repeatedMistakes.map((h) => ({ ...h, q: qOf(h.qid) })).filter((x) => x.q);
  const build = (ids, title) => { const ent = entitlement('practice'); if (ent.limit != null && ent.used + ids.length > ent.limit) return toast(ent.reason, 'bad'); const r = S.generateFixedPaper(ids, { title, mode: 'revision' }); if (!r.ok) return toast(r.message, 'bad'); if (r.skipped) toast(`${r.skipped} question(s) skipped because they are no longer published`); launch(r.paper.id); };
  const List = ({ items, render }) => items.length ? html`<div class="stack">${items.map(render)}</div>` : html`<div class="card"><${Empty} title="Nothing here yet" /></div>`;
  const QRow = ({ q, extra, right }) => html`<div class="card" style="gap:8px"><div class="row between nowrap" style="align-items:flex-start"><div class="stack sm" style="min-width:0"><span class="xs muted">${D.topicPath(ws, q.topicId)} · ${q.code}</span><p class="clamp2">${q.text || q.assertion}</p>${extra}</div>${right}</div></div>`;
  return html`<div class="page-head"><div><h1>Revision</h1><p>Revisit questions you got wrong and those you bookmarked, then turn them into a practice paper.</p></div>
      <button class="btn primary" disabled=${!mistakes.length && !marks.length} onClick=${() => build([...mistakes.map((q) => q.id), ...marks.map((b) => b.qid)], 'Revision: mistakes and bookmarks')}>${Icon('play', 16)} Revise all (${new Set([...mistakes.map((q) => q.id), ...marks.map((b) => b.qid)]).size})</button></div>
    <${Tabs} tabs=${[{ id: 'mistakes', label: 'Last answered wrong', count: mistakes.length }, { id: 'repeated', label: 'Repeated mistakes', count: repeated.length }, { id: 'bookmarks', label: 'Bookmarks', count: marks.length }]} value=${tab} onChange=${setTab} />
    ${tab === 'mistakes' && html`${mistakes.length > 0 && html`<div class="row end"><button class="btn" onClick=${() => build(mistakes.map((q) => q.id), 'Retry incorrect')}>Practise these ${mistakes.length}</button></div>`}<${List} items=${mistakes} render=${(q) => html`<${QRow} q=${q} right=${html`<${DiffPill} d=${q.difficulty} />`} />`} />`}
    ${tab === 'repeated' && html`<${List} items=${repeated} render=${(x) => html`<${QRow} q=${x.q} extra=${html`<span class="xs" style="color:var(--bad)">Wrong ${x.wrong} times, right ${x.right} times</span>`} right=${html`<${DiffPill} d=${x.q.difficulty} />`} />`} />`}
    ${tab === 'bookmarks' && html`${marks.length > 0 && html`<div class="row end"><button class="btn" onClick=${() => build(marks.map((b) => b.qid), 'Bookmarked questions')}>Practise ${marks.length} bookmarks</button></div>`}<${List} items=${marks.map((b) => ({ b, q: qOf(b.qid) })).filter((x) => x.q)} render=${({ b, q }) => html`<${QRow} q=${q} extra=${b.note && html`<span class="xs muted">Note: ${b.note}</span>`} right=${html`<button class="icon-btn on" aria-label="Remove bookmark" onClick=${() => S.toggleBookmark(q.id)}>${Icon('bookmark')}</button>`} />`} />`}`;
}

// ---------- Plans ----------
const FEATURE_LABELS = [['customMocks', 'Custom mock tests'], ['explanations', 'Detailed explanations'], ['weaknessTests', 'Weak-area tests'], ['simulator', 'Full-length exam simulator'], ['advancedAnalytics', 'Advanced analytics'], ['recommendations', 'Personalised recommendations'], ['downloads', 'Downloadable reports'], ['bulkAssignments', 'Batches and bulk test assignment']];
export function PlansView() {
  const s = useStore();
  const { ws, user } = s;
  const [buy, setBuy] = useState(null);
  const cur = E.effectivePlan(user, ws.plans);
  const usage = D.usageToday(ws, user.id);
  const reqs = ws.upgradeRequests.filter((r) => r.userId === user.id);
  const expired = user.planExpiry && Date.now() > user.planExpiry && user.plan !== 'free';
  return html`<div class="page-head"><div><h1>Plan & billing</h1><p>Your current plan, today's usage and upgrade options.</p></div></div>
    <div class="card"><div class="row between"><div><span class="xs muted">Current plan</span><h2>${cur.name}</h2><p class="small muted">${expired ? `Your ${user.plan} plan expired on ${fmtDate(user.planExpiry)}. You are on Free until it is renewed.` : user.planExpiry ? `Renews or expires on ${fmtDate(user.planExpiry)}` : 'No expiry'}</p></div>
      <div class="row"><${Stat} k="Practice questions today" v=${`${usage.practiceToday}${cur.limits.practicePerDay != null ? ` / ${cur.limits.practicePerDay}` : ''}`} /><${Stat} k="Mock tests today" v=${`${usage.mocksToday}${cur.limits.mocksPerDay != null ? ` / ${cur.limits.mocksPerDay}` : ''}`} /></div></div></div>
    ${reqs.length > 0 && html`<div class="card"><h3>Upgrade requests</h3>${reqs.map((r) => html`<div class="row between small"><span>${ws.plans.find((p) => p.id === r.planId)?.name} · ${fmtINR(r.finalPrice)}${r.coupon ? ` with ${r.coupon}` : ''} · ${fmtDate(r.createdAt)}</span><span class="pill ${r.status === 'granted' ? 'good' : r.status === 'declined' ? 'bad' : 'warn'}">${r.status === 'open' ? 'Waiting for the administrator' : r.status === 'granted' ? 'Granted' : 'Declined'}</span></div>`)}</div>`}
    <div class="grid g4">${ws.plans.map((p) => html`<div class="card" style=${p.id === cur.id ? 'border-color:var(--primary)' : ''}>
      <div class="stack sm"><h3>${p.name}</h3><div><span style="font:700 1.6rem var(--font-display)">${fmtINR(p.priceMonthly)}</span>${p.priceMonthly ? html`<span class="muted small"> / month</span>` : ''}</div></div>
      <ul class="stack sm" style="list-style:none;padding:0;margin:0;font-size:.86rem">
        <li>${Icon('check', 15)} ${p.limits.practicePerDay == null ? 'Unlimited practice' : `${p.limits.practicePerDay} practice questions a day`}</li>
        <li>${Icon('check', 15)} ${p.limits.mocksPerDay == null ? 'Unlimited mock tests' : `${p.limits.mocksPerDay} mock test${p.limits.mocksPerDay === 1 ? '' : 's'} a day`}</li>
        ${FEATURE_LABELS.map(([k, label]) => html`<li style=${p.features[k] ? '' : 'color:var(--muted);text-decoration:line-through'}>${Icon(p.features[k] ? 'check' : 'x', 15)} ${label}</li>`)}
      </ul>
      ${p.id === cur.id ? html`<span class="pill info">Current plan</span>` : p.id === 'institutional' ? html`<p class="xs muted">For coaching institutes. The administrator sets this up.</p>` : p.priceMonthly > 0 && html`<button class="btn primary" onClick=${() => setBuy(p)}>Upgrade to ${p.name}</button>`}
    </div>`)}</div>
    <p class="xs muted">Prices shown are the platform's configured list prices.</p>
    ${buy && html`<${UpgradeModal} plan=${buy} onClose=${() => setBuy(null)} />`}`;
}
function UpgradeModal({ plan, onClose }) {
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState(null);
  const [err, setErr] = useState('');
  const apply = () => { setErr(''); const c = S.findCoupon(code); const r = E.applyCoupon(plan.priceMonthly, c || null, { planId: plan.id }); if (!c) return setErr('That coupon code does not exist.'); if (!r.ok) return setErr(r.reason); setApplied({ code: c.code, ...r }); };
  const send = () => { try { S.requestUpgrade(plan.id, applied?.code); toast('Upgrade request sent to the administrator'); onClose(); } catch (e) { setErr(e.message); } };
  return html`<${Modal} title=${`Upgrade to ${plan.name}`} onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${send}>Send upgrade request</button>`}>
    <div class="stack sm"><div class="row between"><span>${plan.name}, monthly</span><span class="num">${fmtINR(plan.priceMonthly)}</span></div>
      ${applied && html`<div class="row between" style="color:var(--good)"><span>Coupon ${applied.code}</span><span class="num">−${fmtINR(applied.discount)}</span></div>`}
      <div class="divider"></div><div class="row between"><b>Total</b><b class="num">${fmtINR(applied ? applied.finalPrice : plan.priceMonthly)}</b></div></div>
    <div class="row nowrap"><input class="input" placeholder="Coupon code" aria-label="Coupon code" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} /><button class="btn" onClick=${apply}>Apply</button></div>
    ${err && html`<p class="small" style="color:var(--bad)">${err}</p>`}
    <${Notice} kind="warn"><b>Online payment is not connected in this build.</b> No payment will be taken and nothing is charged. Your request goes to the administrator, who can activate the plan manually. The Razorpay checkout will replace this step once live keys and a server are configured.</${Notice}>
  </${Modal}>`;
}

// ---------- Profile ----------
export function ProfileView() {
  const s = useStore();
  const { ws, user } = s;
  const [name, setName] = useState(user.name);
  const [targets, setTargets] = useState(user.targetExamIds);
  return html`<div class="page-head"><div><h1>Profile</h1><p>Your name and the examinations you are preparing for.</p></div></div>
    <div class="card" style="max-width:640px">
      <${Field} label="Full name" id="p-name"><input id="p-name" class="input" value=${name} onInput=${(e) => setName(e.target.value)} /></${Field}>
      <${Field} label="Email" id="p-email"><input id="p-email" class="input" value=${user.email} disabled /></${Field}>
      <div class="field"><span class="label">Target examinations</span><${Chips} multi options=${ws.exams.filter((e) => e.status === 'active').map((e) => ({ id: e.id, label: e.short }))} value=${targets} onChange=${setTargets} /></div>
      <div class="row"><button class="btn primary" onClick=${() => { S.updateProfile({ name, targetExamIds: targets }); toast('Profile saved'); }}>Save</button></div>
    </div>`;
}
