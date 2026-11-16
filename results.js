import { html, useState, useMemo, useReducer, useStore, nav, Icon, Notice, Stat, Ring, BarList, StackBar, Tabs, Chips, Empty, QuestionBody, QuestionOptions, Explanation, DiffPill, toast, attempt, fmtMarks, fmtPct, fmtDateTime, fmtDate, plural } from './core.js';
import * as E from './engine.js';
import * as D from './domain.js';
import * as S from './store.js';
import { entitlement, launch, UpgradeHint } from './student.js';
import { ReportModal } from './runner.js';
import { downloadResultPdf, downloadResultCsv } from './pdf.js';

export function ResultView({ params }) {
  const s = useStore();
  const { ws, user } = s;
  const [, force] = useReducer((x) => x + 1, 0);
  const [dim, setDim] = useState('subject');
  const [filter, setFilter] = useState('all');
  const [report, setReport] = useState(null);
  const a = ws.attempts.find((x) => x.id === params?.attemptId);
  const paper = a && ws.papers.find((p) => p.id === a.paperId);
  if (!a || !paper || (a.userId !== user.id && user.role === 'student')) return html`<${Empty} title="Result not found" action=${html`<button class="btn" onClick=${() => nav('tests')}>My tests</button>`} />`;
  if (a.status !== 'submitted') return html`<div class="card"><h2>${a.title}</h2><p>This test is still in progress.</p><button class="btn primary" onClick=${() => nav('attempt', { attemptId: a.id })}>Resume</button></div>`;
  const r = a.result;
  const released = S.answersReleased(paper, a);
  const expEnt = entitlement('explanations');
  const dlEnt = entitlement('downloads');
  const items = E.paperItems(paper);
  const owner = ws.users.find((u) => u.id === a.userId);
  const others = ws.attempts.filter((x) => x.userId === a.userId && x.status === 'submitted' && x.id !== a.id);
  const avg = others.length ? others.reduce((t, x) => t + x.result.percentage, 0) / others.length : null;
  const prevSame = others.filter((x) => { const p = ws.papers.find((pp) => pp.id === x.paperId); return p && p.patternId && p.patternId === paper.patternId && x.submittedAt < a.submittedAt; }).sort((x, y) => y.submittedAt - x.submittedAt)[0];
  const rowByQ = Object.fromEntries(r.rows.map((x) => [x.qid, x]));
  const timeOf = (st) => { const rs = r.rows.filter((x) => x.status === st && x.timeMs); return rs.length ? Math.round(rs.reduce((t, x) => t + x.timeMs, 0) / rs.length / 1000) : null; };

  const dims = { section: paper.blocks ? Object.fromEntries(paper.blocks.map((b) => [b.id, null])) && groupBy(r.rows.map((x) => ({ ...x, block: items.find((i) => i.qid === x.qid)?.block || x.sectionId })), 'block') : r.bySection, subject: r.bySubject, chapter: r.byChapter, topic: r.byTopic, difficulty: r.byDifficulty };
  const label = (k) => (dim === 'difficulty' ? E.DIFFICULTY_LABEL[k] : dim === 'section' ? (paper.blocks?.find((b) => b.id === k)?.name || paper.sections.find((x) => x.id === k)?.name || k) : D.taxName(ws, k));
  const groups = Object.values(dims[dim] || {}).sort((x, y) => (dim === 'difficulty' ? E.DIFFICULTIES.indexOf(x.key) - E.DIFFICULTIES.indexOf(y.key) : y.total - x.total));
  const weakTopics = Object.values(r.byTopic).filter((g) => g.correct + g.incorrect + g.unattempted >= 2 && (g.correct / g.total) < 0.6).map((g) => g.key);
  const incorrect = r.rows.filter((x) => x.status === 'incorrect').map((x) => x.qid);
  const shown = items.filter((it) => { const st = rowByQ[it.qid]?.status; return filter === 'all' || filter === st || (filter === 'marked' && rowByQ[it.qid]?.marked); });

  const retryIncorrect = () => { const res = S.generateFixedPaper(incorrect, { title: `Retry incorrect · ${paper.title}`, mode: 'practice' }); res.ok ? launch(res.paper.id) : toast(res.message, 'bad'); };
  const practiseWeak = () => {
    const ent = entitlement('practice'); if (!ent.allowed) return toast(ent.reason, 'bad');
    const pool = ws.questions.filter((q) => q.status === 'published' && weakTopics.includes(q.topicId) && (q.lang || 'en') === 'en');
    const res = S.generatePaper({ title: 'Practice · weak areas from ' + paper.code, mode: 'practice', sections: [{ id: 's1', name: 'Weak areas', count: Math.min(15, pool.length), topicIds: weakTopics }], distribution: E.DISTRIBUTION_PRESETS.mixed, marks: 1, negative: 0, lang: 'en', instantFeedback: true, strategy: 'fill', recentIds: new Set(items.map((i) => i.qid)) });
    res.ok ? launch(res.paper.id) : toast('Not enough questions in these topics yet.', 'bad');
  };

  return html`
    <div class="page-head"><div><span class="mono muted">${paper.code}${a.sample ? ' · sample history' : ''}</span><h1>${a.title}</h1><p>${owner?.id !== user.id ? `${owner?.name} · ` : ''}Submitted ${fmtDateTime(a.submittedAt)}${a.autoSubmitted ? ' · submitted automatically when time ran out' : ''}</p></div>
      <div class="row tight">
        ${dlEnt.allowed ? html`<button class="btn" onClick=${() => downloadResultPdf(a, paper, owner)}>${Icon('download', 16)} PDF report</button><button class="btn ghost" onClick=${() => downloadResultCsv(a, paper)}>CSV</button>` : html`<button class="btn" onClick=${() => toast('Downloadable reports are part of Premium.', 'bad')}>${Icon('lock', 15)} Download</button>`}
      </div></div>
    <div class="card"><div class="score-hero"><${Ring} value=${Math.max(0, r.percentage)} label="of max marks" />
      <div class="stack"><div><span class="score-big">${fmtMarks(r.score)}</span><span class="muted"> / ${fmtMarks(r.max)} marks</span></div>
        <${StackBar} height=${12} segments=${[{ value: r.correct, cls: 'seg-good', label: 'Correct' }, { value: r.incorrect, cls: 'seg-bad', label: 'Incorrect' }, { value: r.unattempted, cls: 'seg-none', label: 'Unattempted' }]} />
        <div class="legend"><span><i class="seg-good"></i>${r.correct} correct</span><span><i class="seg-bad"></i>${r.incorrect} incorrect</span><span><i class="seg-none"></i>${r.unattempted} unattempted</span></div>
        <p class="small">${avg != null ? html`Your average across ${plural(others.length, 'other test')} is <b>${fmtPct(avg, 1)}</b>; this one is <b style=${`color:var(--${r.percentage >= avg ? 'good' : 'bad'})`}>${r.percentage >= avg ? '+' : ''}${(r.percentage - avg).toFixed(1)} points</b>.` : 'This is your first scored test, so there is nothing to compare with yet.'}${prevSame ? html` Last time on this pattern: <b>${fmtPct(prevSame.result.percentage, 1)}</b>.` : ''}</p>
      </div></div></div>
    <div class="stats">
      <${Stat} k="Accuracy" v=${fmtPct(r.accuracy, 1)} s="of attempted questions" />
      <${Stat} k="Negative marks" v=${r.negativeMarks ? '−' + fmtMarks(r.negativeMarks) : '0'} s=${`${r.incorrect} wrong × ${fmtMarks(items[0]?.negative || 0)}`} />
      <${Stat} k="Time used" v=${E.fmtDuration(r.timeMs)} s=${paper.durationMin ? `of ${paper.durationMin}:00` : 'untimed'} />
      <${Stat} k="Avg time, correct" v=${timeOf('correct') != null ? timeOf('correct') + 's' : '—'} />
      <${Stat} k="Avg time, incorrect" v=${timeOf('incorrect') != null ? timeOf('incorrect') + 's' : '—'} />
    </div>
    <div class="card"><div class="card-head"><h3>Breakdown</h3><${Chips} options=${[(paper.sections.length > 1 || paper.blocks) && { id: 'section', label: 'Section' }, { id: 'subject', label: 'Subject' }, { id: 'chapter', label: 'Chapter' }, { id: 'topic', label: 'Topic' }, { id: 'difficulty', label: 'Difficulty' }].filter(Boolean)} value=${dim} onChange=${setDim} /></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>${dim[0].toUpperCase() + dim.slice(1)}</th><th class="r">Qs</th><th class="r">Right</th><th class="r">Wrong</th><th class="r">Blank</th><th class="r">Marks</th><th style="min-width:110px">Accuracy</th></tr></thead><tbody>
        ${groups.map((g) => html`<tr><td>${label(g.key)}</td><td class="r num">${g.total}</td><td class="r num">${g.correct}</td><td class="r num">${g.incorrect}</td><td class="r num">${g.unattempted}</td><td class="r num nowrap">${fmtMarks(g.score)} / ${fmtMarks(g.max)}</td><td><div class="row nowrap tight"><div class="bar thin" style="flex:1;min-width:50px"><span style=${`width:${(g.accuracy || 0) * 100}%`}></span></div><span class="xs num">${g.accuracy == null ? '—' : fmtPct(g.accuracy * 100)}</span></div></td></tr>`)}
      </tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>Keep going</h3></div><div class="row">
      <button class="btn" disabled=${!incorrect.length || !released} onClick=${retryIncorrect}>${Icon('refresh', 16)} Retry ${incorrect.length} incorrect</button>
      <button class="btn" disabled=${!weakTopics.length} onClick=${practiseWeak}>${Icon('target', 16)} Practise weak topics from this test${weakTopics.length ? ` (${weakTopics.length})` : ''}</button>
      <button class="btn ghost" onClick=${() => nav('create')}>Create another test</button></div></div>
    <div class="stack"><div class="row between"><h2>Review answers</h2><${Chips} options=${[{ id: 'all', label: 'All', n: items.length }, { id: 'incorrect', label: 'Incorrect', n: r.incorrect }, { id: 'unattempted', label: 'Unattempted', n: r.unattempted }, { id: 'correct', label: 'Correct', n: r.correct }, { id: 'marked', label: 'Marked', n: r.rows.filter((x) => x.marked).length }]} value=${filter} onChange=${setFilter} /></div>
      ${!released ? html`<${Notice} kind="info">The answer key for this test is released on ${fmtDate(paper.releaseAt)}. Your score is final; answers and explanations open then.</${Notice}>`
        : shown.length ? shown.map((it) => { const row = rowByQ[it.qid]; const n = items.indexOf(it) + 1; const bm = S.isBookmarked(it.qid); return html`<div class="review-card ${row.status}">
          <div class="row between"><div class="row tight"><b>Q${n}</b><span class="pill ${row.status === 'correct' ? 'good' : row.status === 'incorrect' ? 'bad' : ''}">${row.status === 'correct' ? `+${fmtMarks(row.marks)}` : row.status === 'incorrect' ? `${fmtMarks(row.marks)}` : '0'}</span><${DiffPill} d=${it.difficulty} />${row.marked && html`<span class="pill mark">Marked</span>`}<span class="xs muted">${row.timeMs ? Math.round(row.timeMs / 1000) + 's' : ''}</span></div>
            <div class="row tight">${user.role === 'student' && html`<button class="icon-btn ${bm ? 'on' : ''}" aria-pressed=${bm} aria-label=${bm ? 'Remove bookmark' : 'Bookmark'} onClick=${() => { S.toggleBookmark(it.qid); force(); }}>${Icon('bookmark')}</button><button class="icon-btn" aria-label="Report a problem" onClick=${() => setReport(it.qid)}>${Icon('flag')}</button>`}</div></div>
          <${QuestionBody} item=${it} />
          <${QuestionOptions} item=${it} response=${a.responses[it.qid] || {}} reveal />
          ${row.status === 'unattempted' && E.typeKind(it.type) !== 'numeric' && E.typeKind(it.type) !== 'text' && html`<p class="xs muted">Not answered.</p>`}
          <${Explanation} item=${it} topicPath=${D.topicPath(ws, it.topicId)} locked=${!expEnt.allowed} />
          ${row.status !== 'correct' && expEnt.allowed && html`<p class="xs muted">Suggested revision: ${it.revision || `re-read ${D.topicPath(ws, it.topicId)}`}${it.concept ? `, focusing on ${it.concept.toLowerCase()}` : ''}.</p>`}
        </div>`; }) : html`<div class="card"><${Empty} title="No questions in this filter" /></div>`}
    </div>
    ${report && html`<${ReportModal} qid=${report} onClose=${() => setReport(null)} />`}`;
}
function groupBy(rows, key) {
  const g = {};
  rows.forEach((r) => { const k = r[key]; g[k] = g[k] || { key: k, total: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, max: 0 }; g[k].total++; g[k][r.status]++; g[k].score = E.round2(g[k].score + r.marks); g[k].max = E.round2(g[k].max + r.max); });
  Object.values(g).forEach((x) => (x.accuracy = x.correct + x.incorrect ? x.correct / (x.correct + x.incorrect) : null));
  return g;
}
