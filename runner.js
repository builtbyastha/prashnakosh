import { html, useState, useEffect, useRef, useReducer, useStore, nav, Icon, Modal, toast, QuestionBody, QuestionOptions, Explanation, fmtMarks, plural, Field } from './core.js';
import * as E from '../engine.js';
import * as D from '../domain.js';
import * as S from '../store.js';
import { entitlement } from './student.js';

export function Runner({ attemptId }) {
  const s = useStore();
  const a = s.ws.attempts.find((x) => x.id === attemptId);
  const paper = a && s.ws.papers.find((p) => p.id === a.paperId);
  useEffect(() => { if (!a || a.userId !== s.user.id) nav('tests'); else if (a.status !== 'in_progress') nav('result', { attemptId }); }, []);
  if (!a || !paper || a.userId !== s.user.id) return null;
  return paper.instantFeedback ? html`<${PracticeRunner} attempt=${a} paper=${paper} />` : html`<${ExamRunner} attempt=${a} paper=${paper} />`;
}

// Time-on-question tracking shared by both runners.
function useQuestionClock(attempt, qid) {
  const since = useRef({ qid, t: Date.now() });
  const commit = () => {
    const { qid: q, t } = since.current;
    if (!q || attempt.status !== 'in_progress') return;
    const prev = attempt.responses[q]?.timeMs || 0;
    S.saveResponse(attempt.id, q, { timeMs: prev + (Date.now() - t), visited: true });
    since.current = { qid: q, t: Date.now() };
  };
  useEffect(() => { commit(); since.current = { qid, t: Date.now() }; if (attempt.status === 'in_progress' && !attempt.responses[qid]?.visited) S.saveResponse(attempt.id, qid, { visited: true }); }, [qid]);
  useEffect(() => () => commit(), []);
  return commit;
}

export function ReportModal({ qid, onClose }) {
  const [reason, setReason] = useState('wrong_answer');
  const [msg, setMsg] = useState('');
  return html`<${Modal} title="Report a problem with this question" onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${() => { S.reportQuestion(qid, reason, msg); toast('Thanks. The content team will review it.'); onClose(); }}>Send report</button>`}>
    <div class="field"><span class="label">What is wrong?</span><div class="stack sm">${[['wrong_answer', 'The answer key looks wrong'], ['ambiguous', 'The question or options are ambiguous'], ['outdated', 'A fact is outdated'], ['typo', 'Spelling or formatting error'], ['other', 'Something else']].map(([k, l]) => html`<label class="check"><input type="radio" name="reason" checked=${reason === k} onChange=${() => setReason(k)} /> ${l}</label>`)}</div></div>
    <${Field} label="Details (optional)" id="rep-msg"><textarea id="rep-msg" class="input" maxlength="600" value=${msg} onInput=${(e) => setMsg(e.target.value)} placeholder="What should it say instead? A source helps."></textarea></${Field}>
  </${Modal}>`;
}

function ExamRunner({ attempt, paper }) {
  const s = useStore();
  const [, force] = useReducer((x) => x + 1, 0);
  const items = paper.sections.flatMap((sec) => sec.items.map((it) => ({ ...E.publicItem(it), section: sec })));
  const [idx, setIdx] = useState(() => { const firstOpen = items.findIndex((it) => !attempt.responses[it.qid]?.visited); return firstOpen > 0 ? firstOpen : 0; });
  const [palette, setPalette] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [report, setReport] = useState(null);
  const [now, setNow] = useState(Date.now());
  const cur = items[idx];
  const commit = useQuestionClock(attempt, cur.qid);
  const resp = attempt.responses[cur.qid] || {};
  const remaining = E.remainingMs(attempt, paper, now);
  const sections = paper.sections;

  useEffect(() => {
    if (remaining == null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (remaining === 0 && attempt.status === 'in_progress') { commit(); S.submitAttempt(attempt.id, { auto: true }); S.flush(); setTimeUp(true); }
  }, [remaining === 0]);
  useEffect(() => {
    const k = (e) => {
      if (confirm || timeUp || report || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const kind = E.typeKind(cur.type);
      const i = 'abcdefgh'.indexOf(e.key.toLowerCase()); const n = Number(e.key) - 1;
      const opt = kind === 'single' && (i >= 0 ? cur.options[i] : n >= 0 ? cur.options[n] : null);
      if (opt) { answer(resp.answer === opt.id ? null : opt.id); e.preventDefault(); }
      else if (e.key === 'ArrowRight') go(idx + 1); else if (e.key === 'ArrowLeft') go(idx - 1);
    };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  });

  const answer = (v) => { if (S.saveResponse(attempt.id, cur.qid, { answer: v })) force(); };
  const go = (i) => { if (i < 0 || i >= items.length) return; setIdx(i); setPalette(false); };
  const saveNext = () => { if (idx < items.length - 1) go(idx + 1); else setConfirm(true); };
  const markNext = () => { S.saveResponse(attempt.id, cur.qid, { marked: !resp.marked }); force(); if (!resp.marked && idx < items.length - 1) go(idx + 1); };
  const clear = () => { S.saveResponse(attempt.id, cur.qid, { answer: null }); force(); };
  const submit = () => { commit(); S.submitAttempt(attempt.id); S.flush(); nav('result', { attemptId: attempt.id }); };
  const counts = (list) => { const c = { 'answered': 0, 'not-answered': 0, 'marked': 0, 'answered-marked': 0, 'not-visited': 0 }; list.forEach((it) => c[E.paletteStatus(it, attempt.responses[it.qid])]++); return c; };
  const all = counts(items);
  const fmtT = (ms) => E.fmtDuration(ms);
  const secItems = items.filter((it) => it.section.id === cur.section.id);
  const numInSec = secItems.indexOf(cur) + 1;
  const isBm = S.isBookmarked(cur.qid);

  const Palette = () => html`<aside class="exam-palette ${palette ? 'open' : ''}" aria-label="Question palette">
    <div class="row between"><b>${sections.length > 1 ? cur.section.name : 'Questions'}</b><button class="icon-btn mobile-only" aria-label="Close palette" onClick=${() => setPalette(false)}>${Icon('x')}</button></div>
    <div class="palette-legend">
      <span><b class="pq answered">${all.answered}</b>Answered</span><span><b class="pq not-answered">${all['not-answered']}</b>Not answered</span>
      <span><b class="pq">${all['not-visited']}</b>Not visited</span><span><b class="pq marked">${all.marked}</b>Marked</span>
      <span style="grid-column:1/3"><b class="pq answered-marked">${all['answered-marked']}</b>Answered & marked (will be evaluated)</span>
    </div>
    <div class="palette-grid">${secItems.map((it) => { const i = items.indexOf(it); return html`<button class="pq ${E.paletteStatus(it, attempt.responses[it.qid])} ${i === idx ? 'current' : ''}" aria-label=${`Question ${secItems.indexOf(it) + 1}`} onClick=${() => go(i)}>${secItems.indexOf(it) + 1}</button>`; })}</div>
    <button class="btn primary block" onClick=${() => setConfirm(true)}>Submit test</button>
  </aside>`;

  return html`<div class="exam" role="application" aria-label=${paper.title}>
    <div class="exam-top">
      <div class="stack sm" style="gap:0;min-width:0;flex:1"><span class="ttl">${paper.title}</span><span class="xs muted">${s.user.name} · ${paper.code}${paper.questionCount ? ` · ${paper.questionCount} questions · ${fmtMarks(paper.maxMarks)} marks` : ''}</span></div>
      ${remaining != null ? html`<span class="timer ${remaining < 5 * 60000 ? 'low' : ''}" role="timer" aria-label="Time left">${fmtT(remaining)}</span>` : html`<span class="pill">Untimed</span>`}
      <button class="btn sm ghost" onClick=${() => { commit(); S.flush(); nav('tests'); }}>Pause<span class="desktop-only">&nbsp;& exit</span></button>
    </div>
    ${sections.length > 1 ? html`<div class="exam-sections">${sections.map((sec) => { const first = items.findIndex((it) => it.section.id === sec.id); const c = counts(items.filter((it) => it.section.id === sec.id)); return html`<button class="chip" aria-pressed=${sec.id === cur.section.id} onClick=${() => go(first)}>${sec.name} <span class="n">${c.answered + c['answered-marked']}/${sec.items.length}</span></button>`; })}</div>` : html`<div class="exam-sections"><span class="small"><b>${sections[0].name}</b></span><span class="spacer" style="flex:1"></span><span class="xs muted desktop-only">Keys: A–D to answer · ← → to move</span></div>`}
    <div class="exam-body">
      <div class="exam-q"><div class="exam-q-inner">
        <div class="row between"><b>Question ${numInSec}${sections.length > 1 ? html`<span class="muted small"> of ${secItems.length}</span>` : html`<span class="muted small"> of ${items.length}</span>`}</b>
          <div class="row tight"><span class="xs muted">+${fmtMarks(cur.marks)} / −${fmtMarks(cur.negative)}</span>
          <button class="icon-btn ${isBm ? 'on' : ''}" aria-label=${isBm ? 'Remove bookmark' : 'Bookmark question'} aria-pressed=${isBm} onClick=${() => { S.toggleBookmark(cur.qid); force(); }}>${Icon('bookmark')}</button>
          <button class="icon-btn" aria-label="Report a problem" onClick=${() => setReport(cur.qid)}>${Icon('flag')}</button></div></div>
        <${QuestionBody} item=${cur} lg />
        <${QuestionOptions} item=${cur} response=${resp} onAnswer=${answer} />
        ${resp.marked && html`<span class="pill mark">Marked for review</span>`}
      </div></div>
      ${Palette()}
    </div>
    <div class="exam-foot">
      <button class="btn" onClick=${markNext}>${resp.marked ? 'Unmark' : 'Mark for review & next'}</button>
      <button class="btn" onClick=${clear} disabled=${!E.isAnswered(cur, resp)}>Clear response</button>
      <span class="spacer desktop-only"></span>
      <button class="btn mobile-only" onClick=${() => setPalette(true)}>${Icon('grid', 16)} ${idx + 1}/${items.length}</button>
      <button class="btn desktop-only" onClick=${() => go(idx - 1)} disabled=${idx === 0}>${Icon('left', 16)} Previous</button>
      <button class="btn primary" onClick=${saveNext}>${idx === items.length - 1 ? 'Save & finish' : 'Save & next'}</button>
    </div>
    ${confirm && html`<${Modal} title="Submit this test?" onClose=${() => setConfirm(false)} foot=${html`<button class="btn" onClick=${() => setConfirm(false)}>Keep working</button><button class="btn primary" onClick=${submit}>Submit</button>`}>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Section</th><th class="r">Answered</th><th class="r">Not answered</th><th class="r">Marked</th><th class="r">Not visited</th></tr></thead><tbody>
        ${sections.map((sec) => { const c = counts(items.filter((it) => it.section.id === sec.id)); return html`<tr><td>${sec.name}</td><td class="r num">${c.answered + c['answered-marked']}</td><td class="r num">${c['not-answered']}</td><td class="r num">${c.marked + c['answered-marked']}</td><td class="r num">${c['not-visited']}</td></tr>`; })}
      </tbody></table></div>
      ${remaining != null && html`<p class="small muted">${fmtT(remaining)} remaining. You cannot change answers after submitting.</p>`}
    </${Modal}>`}
    ${timeUp && html`<${Modal} title="Time is up" foot=${html`<button class="btn primary" onClick=${() => nav('result', { attemptId: attempt.id })}>See my result</button>`}><p>Your answers were saved and submitted automatically.</p></${Modal}>`}
    ${report && html`<${ReportModal} qid=${report} onClose=${() => setReport(null)} />`}
  </div>`;
}

function PracticeRunner({ attempt, paper }) {
  const s = useStore();
  const [, force] = useReducer((x) => x + 1, 0);
  const items = E.paperItems(paper);
  const [idx, setIdx] = useState(() => { const i = items.findIndex((it) => !attempt.responses[it.qid]?.checked); return i < 0 ? items.length - 1 : i; });
  const [report, setReport] = useState(null);
  const cur = items[idx];
  const commit = useQuestionClock(attempt, cur.qid);
  const resp = attempt.responses[cur.qid] || {};
  const checked = !!resp.checked;
  const expEnt = entitlement('explanations');
  const done = items.filter((it) => attempt.responses[it.qid]?.checked);
  const right = done.filter((it) => E.evaluate(it, attempt.responses[it.qid]) === 'correct').length;
  const answer = (v) => { if (!checked && S.saveResponse(attempt.id, cur.qid, { answer: v })) force(); };
  const check = () => { commit(); S.saveResponse(attempt.id, cur.qid, { checked: true }); force(); };
  const finish = () => { commit(); S.submitAttempt(attempt.id); S.flush(); nav('result', { attemptId: attempt.id }); };
  const status = checked ? E.evaluate(cur, resp) : null;
  const isBm = S.isBookmarked(cur.qid);
  const view = checked ? cur : E.publicItem(cur);
  return html`<div class="exam" style="grid-template-rows:auto 1fr auto">
    <div class="exam-top">
      <button class="icon-btn" aria-label="Exit practice" onClick=${() => { commit(); S.flush(); nav('practice'); }}>${Icon('left', 20)}</button>
      <div class="stack sm" style="gap:4px;min-width:0;flex:1"><span class="ttl">${paper.title}</span><div class="bar thin" style="max-width:360px"><span style=${`width:${(done.length / items.length) * 100}%`}></span></div></div>
      <span class="pill good">${right} correct</span><span class="pill">${done.length}/${items.length}</span>
    </div>
    <div class="exam-q"><div class="exam-q-inner" style="margin:0 auto">
      <div class="row between"><span class="small muted">Question ${idx + 1} of ${items.length} · ${D.taxName(s.ws, cur.topicId)}</span>
        <div class="row tight"><button class="icon-btn ${isBm ? 'on' : ''}" aria-label=${isBm ? 'Remove bookmark' : 'Bookmark question'} aria-pressed=${isBm} onClick=${() => { S.toggleBookmark(cur.qid); force(); }}>${Icon('bookmark')}</button><button class="icon-btn" aria-label="Report a problem" onClick=${() => setReport(cur.qid)}>${Icon('flag')}</button></div></div>
      <${QuestionBody} item=${view} lg />
      <${QuestionOptions} item=${view} response=${resp} onAnswer=${answer} reveal=${checked} />
      ${checked && html`<div class="notice ${status === 'correct' ? 'good' : status === 'incorrect' ? 'bad' : ''}">${Icon(status === 'correct' ? 'check' : status === 'incorrect' ? 'x' : 'info', 17)}<b>${status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Not quite' : 'Skipped'}</b></div>
        <${Explanation} item=${cur} topicPath=${D.topicPath(s.ws, cur.topicId)} locked=${!expEnt.allowed} />`}
    </div></div>
    <div class="exam-foot">
      <button class="btn" onClick=${() => setIdx(idx - 1)} disabled=${idx === 0}>${Icon('left', 16)} Back</button>
      <span class="spacer"></span>
      ${!checked ? html`<button class="btn ghost" onClick=${check}>Skip</button><button class="btn primary" onClick=${check} disabled=${!E.isAnswered(cur, resp)}>Check answer</button>`
        : idx < items.length - 1 ? html`<button class="btn primary" onClick=${() => setIdx(idx + 1)}>Next question ${Icon('right', 16)}</button>` : html`<button class="btn primary" onClick=${finish}>Finish and see summary</button>`}
      ${checked && idx < items.length - 1 && html`<button class="btn ghost" onClick=${finish}>End practice</button>`}
    </div>
    ${report && html`<${ReportModal} qid=${report} onClose=${() => setReport(null)} />`}
  </div>`;
}
