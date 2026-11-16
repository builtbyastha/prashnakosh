import { html, useState, useMemo, useStore, nav, Icon, Notice, Empty, Tabs, Modal, Field, Chips, Pager, toast, attempt, fmtDate, fmtDateTime, fmtMarks, timeAgo, plural, useConfirm, QuestionBody, QuestionOptions, DiffPill } from './core.js';
import * as E from './engine.js';
import * as D from './domain.js';
const readinessKey = (ws) => ws.exams.map((e) => e.patterns.map((p) => p.id + ':' + p.currentV + ':' + p.versions.length).join(',')).join('|') + '#' + ws.questions.filter((q) => q.status === 'published').length + ':' + ws.questions.length + ':' + ws.topics.filter((t) => t.archived).length;
import * as S from './store.js';
import { downloadPaperPdf } from './pdf.js';

// ---------- Exams & blueprints ----------
export function ExamsView() {
  const s = useStore();
  const { ws } = s;
  const [examDlg, setExamDlg] = useState(null);
  const [patDlg, setPatDlg] = useState(null);
  const readiness = useMemo(() => { const m = {}; ws.exams.forEach((e) => e.patterns.forEach((p) => (m[p.id] = D.patternReadiness(ws, e, p)))); return m; }, [readinessKey(ws)]);
  return html`<div class="page-head"><div><h1>Examinations & blueprints</h1><p>Each examination has its own stages and patterns. Saving a pattern creates a new version; earlier versions stay attached to the papers built from them.</p></div><button class="btn primary" onClick=${() => setExamDlg({ name: '', short: '', category: '', description: '', status: 'active' })}>${Icon('plus')} New examination</button></div>
    ${ws.exams.map((e) => html`<div class="card">
      <div class="card-head"><div><span class="xs muted">${e.category}</span><h2>${e.name}</h2><p class="small muted" style="max-width:80ch">${e.description}</p></div>
        <div class="row tight"><span class="pill ${e.status === 'active' ? 'good' : ''}">${e.status === 'active' ? 'Active' : 'Hidden'}</span><button class="btn sm" onClick=${() => setExamDlg({ ...e })}>${Icon('edit', 15)} Edit</button><button class="btn sm" onClick=${() => setPatDlg({ exam: e, pattern: null })}>${Icon('plus', 15)} Pattern</button></div></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Pattern</th><th>Current version</th><th class="r">Questions</th><th class="r">Marks</th><th class="r">Time</th><th>Marking</th><th>Bank readiness</th><th></th></tr></thead><tbody>
        ${e.patterns.map((p) => { const v = D.currentVersion(p); const r = readiness[p.id]; return html`<tr>
          <td><b class="small">${p.name}</b><div class="xs muted">${p.stage} · <span class=${p.status === 'verified' ? '' : ''}>${p.status === 'verified' ? 'Verified' : p.kind === 'template' ? 'Practice template' : 'Sample (unverified)'}</span></div></td>
          <td class="small">v${v.v} · ${v.year}<div class="xs muted">${plural(p.versions.length, 'version')}</div></td>
          <td class="r num">${v.totalQuestions}</td><td class="r num">${fmtMarks(E.round2(v.totalQuestions * v.marksPerQ))}</td><td class="r num">${v.durationMin} min</td>
          <td class="small nowrap">+${fmtMarks(E.round2(v.marksPerQ))} / −${fmtMarks(E.round2(v.marksPerQ * v.negativeFraction))}</td>
          <td><span class="pill ${r.level === 'ready' ? 'good' : r.level === 'substitute' ? 'warn' : 'bad'}">${r.label}</span>${r.missing && html`<div class="xs" style="color:var(--bad);max-width:240px">${r.missing.map((m) => `${m.name}: ${m.shortfalls[0].message}`).join(' ')}</div>`}</td>
          <td class="r"><button class="btn sm" onClick=${() => setPatDlg({ exam: e, pattern: p })}>Open</button></td></tr>`; })}
      </tbody></table></div>
      ${!e.patterns.length && html`<p class="small muted">No patterns yet. Add one to make this exam available in the simulator and the test generator.</p>`}
    </div>`)}
    ${examDlg && html`<${ExamDialog} exam=${examDlg} onClose=${() => setExamDlg(null)} />`}
    ${patDlg && html`<${PatternEditor} ...${patDlg} onClose=${() => setPatDlg(null)} />`}`;
}
function ExamDialog({ exam, onClose }) {
  const [f, setF] = useState(exam);
  const save = () => { if (attempt(() => S.saveExam(f), exam.id ? 'Examination updated' : 'Examination created')) onClose(); };
  return html`<${Modal} title=${exam.id ? 'Edit examination' : 'New examination'} onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Save</button>`}>
    <${Field} label="Examination name" id="ex-name"><input id="ex-name" class="input" value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. RRB NTPC" /></${Field}>
    <div class="grid g2"><${Field} label="Short name" id="ex-short"><input id="ex-short" class="input" value=${f.short} onInput=${(e) => setF({ ...f, short: e.target.value })} /></${Field}><${Field} label="Category" id="ex-cat"><input id="ex-cat" class="input" value=${f.category} onInput=${(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. Railways" /></${Field}></div>
    <${Field} label="Description" id="ex-desc"><textarea id="ex-desc" class="input" value=${f.description} onInput=${(e) => setF({ ...f, description: e.target.value })}></textarea></${Field}>
    <${Field} label="Visibility" id="ex-st"><select id="ex-st" class="input" value=${f.status} onChange=${(e) => setF({ ...f, status: e.target.value })}><option value="active">Active: visible to students</option><option value="hidden">Hidden</option></select></${Field}>
  </${Modal}>`;
}

const blankVersion = () => ({ year: new Date().getFullYear(), effectiveFrom: new Date().toISOString().slice(0, 10), syllabusVersion: '', durationMin: 60, marksPerQ: 2, negativeFraction: 1 / 3, mergeSections: false, mergedName: '', formats: [], difficulty: { easy: 30, moderate: 50, difficult: 20, advanced: 0 }, instructions: '', shuffleOptions: false, sections: [{ id: 's1', name: 'Section 1', subjectIds: [], count: 25 }] });
function PatternEditor({ exam, pattern, onClose }) {
  const s = useStore();
  const { ws } = s;
  const [meta, setMeta] = useState(pattern ? { name: pattern.name, stage: pattern.stage, kind: pattern.kind, status: pattern.status, sourceNote: pattern.sourceNote, id: pattern.id } : { name: '', stage: 'Prelims', kind: 'exam', status: 'sample', sourceNote: '' });
  const [v, setV] = useState(() => pattern ? JSON.parse(JSON.stringify(D.currentVersion(pattern))) : blankVersion());
  const [note, setNote] = useState('');
  const [tab, setTab] = useState('edit');
  const errs = S.validateVersion({ ...v, difficulty: E.normaliseDistribution(v.difficulty) });
  const total = v.sections.reduce((t, x) => t + (Number(x.count) || 0), 0);
  const fracs = [[0, 'None'], [0.25, '¼ (e.g. SSC: 0.5 of 2)'], [1 / 3, '⅓ (e.g. UPSC: 0.66 of 2)'], [0.5, '½'], [1, 'Full marks']];
  const setSec = (i, patch) => setV({ ...v, sections: v.sections.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const save = () => {
    if (!meta.name.trim()) return toast('Name the pattern.', 'bad');
    const r = attempt(() => S.savePattern(exam.id, meta, { ...v, sections: v.sections.map((x) => ({ ...x, count: Number(x.count) })), durationMin: Number(v.durationMin), marksPerQ: Number(v.marksPerQ), negativeFraction: Number(v.negativeFraction), year: Number(v.year) }, note));
    if (r) { toast(`Saved as version ${D.currentVersion(r).v}`); onClose(); }
  };
  return html`<${Modal} wide title=${pattern ? `${exam.short} · ${pattern.name}` : `New pattern for ${exam.short}`} sub=${pattern ? `Editing creates version ${Math.max(...pattern.versions.map((x) => x.v)) + 1}. Papers already generated keep their version.` : ''} onClose=${onClose}
    foot=${tab === 'edit' && html`<input class="input" style="max-width:320px" aria-label="Change note" placeholder="What changed? (shown in version history)" value=${note} onInput=${(e) => setNote(e.target.value)} /><button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${errs.length > 0} onClick=${save}>Save ${pattern ? 'new version' : 'pattern'}</button>`}>
    ${pattern && html`<${Tabs} tabs=${[{ id: 'edit', label: 'Edit' }, { id: 'history', label: 'Version history', count: pattern.versions.length }]} value=${tab} onChange=${setTab} />`}
    ${tab === 'history' ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Version</th><th>Year</th><th>Saved</th><th>Change</th><th class="r">Papers</th><th></th></tr></thead><tbody>
      ${[...pattern.versions].reverse().map((x) => html`<tr><td><b>v${x.v}</b>${x.v === pattern.currentV && html` <span class="pill good">Current</span>`}</td><td>${x.year}</td><td class="small">${fmtDate(x.createdAt)}</td><td class="small">${x.note || '—'}<div class="xs muted">${x.totalQuestions} Q · ${x.durationMin} min · ${E.DIFFICULTIES.filter((d) => x.difficulty[d]).map((d) => `${E.DIFFICULTY_LABEL[d][0]}${x.difficulty[d]}`).join('/')}</div></td><td class="r num">${ws.papers.filter((p) => p.patternId === pattern.id && p.patternVersion === x.v).length}</td>
        <td class="r">${x.v !== pattern.currentV && html`<button class="btn sm" onClick=${() => attempt(() => S.setCurrentVersion(exam.id, pattern.id, x.v), `v${x.v} is now current`)}>Make current</button>`}</td></tr>`)}
    </tbody></table></div>` : html`
    <div class="grid g3">
      <${Field} label="Pattern name" id="pt-name"><input id="pt-name" class="input" value=${meta.name} onInput=${(e) => setMeta({ ...meta, name: e.target.value })} placeholder="e.g. Prelims · GS Paper I" /></${Field}>
      <${Field} label="Stage" id="pt-stage"><input id="pt-stage" class="input" value=${meta.stage} onInput=${(e) => setMeta({ ...meta, stage: e.target.value })} /></${Field}>
      <${Field} label="Kind" id="pt-kind"><select id="pt-kind" class="input" value=${meta.kind} onChange=${(e) => setMeta({ ...meta, kind: e.target.value, status: e.target.value === 'template' ? 'practice' : meta.status })}><option value="exam">Examination pattern</option><option value="template">Practice template</option></select></${Field}>
    </div>
    ${meta.kind === 'exam' && html`<div class="grid g2"><${Field} label="Verification" id="pt-ver"><select id="pt-ver" class="input" value=${meta.status} onChange=${(e) => setMeta({ ...meta, status: e.target.value })}><option value="sample">Sample: not verified against a notification</option><option value="verified">Verified against the official notification</option></select></${Field}>
      <${Field} label="Source note" id="pt-src" hint=${meta.status === 'verified' ? 'Cite the notification (number and date).' : 'Explain what it is modelled on.'}><input id="pt-src" class="input" value=${meta.sourceNote} onInput=${(e) => setMeta({ ...meta, sourceNote: e.target.value })} /></${Field}></div>`}
    <div class="grid g4">
      <${Field} label="Applicable year" id="v-year"><input id="v-year" class="input" type="number" value=${v.year} onInput=${(e) => setV({ ...v, year: e.target.value })} /></${Field}>
      <${Field} label="Effective from" id="v-eff"><input id="v-eff" class="input" type="date" value=${v.effectiveFrom} onInput=${(e) => setV({ ...v, effectiveFrom: e.target.value })} /></${Field}>
      <${Field} label="Syllabus version" id="v-syl"><input id="v-syl" class="input" value=${v.syllabusVersion} onInput=${(e) => setV({ ...v, syllabusVersion: e.target.value })} /></${Field}>
      <${Field} label="Duration (minutes)" id="v-dur"><input id="v-dur" class="input" type="number" min="1" value=${v.durationMin} onInput=${(e) => setV({ ...v, durationMin: e.target.value })} /></${Field}>
      <${Field} label="Marks per question" id="v-mk"><input id="v-mk" class="input" type="number" step="0.01" min="0.25" value=${E.round2(v.marksPerQ)} onInput=${(e) => setV({ ...v, marksPerQ: Number(e.target.value) })} /></${Field}>
      <${Field} label="Negative marking (fraction of marks)" id="v-neg"><select id="v-neg" class="input" value=${String(fracs.find((x) => Math.abs(x[0] - v.negativeFraction) < 1e-6)?.[0] ?? v.negativeFraction)} onChange=${(e) => setV({ ...v, negativeFraction: Number(e.target.value) })}>${fracs.map(([x, l]) => html`<option value=${String(x)}>${l}</option>`)}</select></${Field}>
      <div class="stat"><span class="k">Total</span><span class="v">${total} Q</span><span class="s">${fmtMarks(E.round2(total * v.marksPerQ))} marks · −${fmtMarks(E.round2(v.marksPerQ * v.negativeFraction))} per wrong</span></div>
    </div>
    <div class="field"><span class="label">Difficulty distribution (%)</span><div class="grid g4">${E.DIFFICULTIES.map((d) => html`<${Field} label=${E.DIFFICULTY_LABEL[d]} id=${'vd-' + d}><input id=${'vd-' + d} class="input" type="number" min="0" max="100" value=${v.difficulty[d] || 0} onInput=${(e) => setV({ ...v, difficulty: { ...v.difficulty, [d]: Number(e.target.value) || 0 } })} /></${Field}>`)}</div></div>
    <div class="field"><div class="row between"><span class="label">Sections</span><button class="btn sm" onClick=${() => setV({ ...v, sections: [...v.sections, { id: 's' + (v.sections.length + 1) + Math.random().toString(36).slice(2, 5), name: '', subjectIds: [], count: 25 }] })}>${Icon('plus', 14)} Section</button></div>
      ${v.sections.map((sec, i) => html`<div class="card" style="padding:12px;gap:8px;background:var(--surface-2)"><div class="row nowrap"><input class="input" aria-label=${`Section ${i + 1} name`} value=${sec.name} placeholder="Section name" onInput=${(e) => setSec(i, { name: e.target.value })} /><input class="input" style="width:90px" type="number" min="1" aria-label=${`Section ${i + 1} questions`} value=${sec.count} onInput=${(e) => setSec(i, { count: e.target.value })} /><span class="xs muted">Q</span>${v.sections.length > 1 && html`<button class="icon-btn" aria-label="Remove section" onClick=${() => setV({ ...v, sections: v.sections.filter((_, j) => j !== i) })}>${Icon('trash', 16)}</button>`}</div>
        <${Chips} multi options=${ws.subjects.filter((x) => !x.archived).map((x) => ({ id: x.id, label: x.name, n: ws.questions.filter((q) => q.status === 'published' && q.subjectId === x.id).length }))} value=${sec.subjectIds} onChange=${(ids) => setSec(i, { subjectIds: ids })} /></div>`)}
      <label class="check small"><input type="checkbox" checked=${v.mergeSections} onChange=${(e) => setV({ ...v, mergeSections: e.target.checked })} /> Present all sections as one undivided paper (subject quotas still apply)</label>
      ${v.mergeSections && html`<input class="input" aria-label="Merged paper name" placeholder="Name shown to the candidate, e.g. General Studies Paper I" value=${v.mergedName} onInput=${(e) => setV({ ...v, mergedName: e.target.value })} />`}
      <label class="check small"><input type="checkbox" checked=${v.shuffleOptions} onChange=${(e) => setV({ ...v, shuffleOptions: e.target.checked })} /> Shuffle answer options</label></div>
    <div class="field"><span class="label">Allowed question formats</span><${Chips} multi options=${Object.entries(E.QUESTION_TYPES).map(([k, x]) => ({ id: k, label: x.label }))} value=${v.formats || []} onChange=${(f) => setV({ ...v, formats: f })} /><span class="hint">Leave empty to allow all formats.</span></div>
    <${Field} label="Candidate instructions" id="v-ins"><textarea id="v-ins" class="input" value=${v.instructions} onInput=${(e) => setV({ ...v, instructions: e.target.value })}></textarea></${Field}>
    ${errs.length > 0 && html`<${Notice} kind="bad">${errs.join(' ')}</${Notice}>`}`}
  </${Modal}>`;
}

// ---------- Papers ----------
export function PapersView({ params }) {
  const s = useStore();
  const { ws } = s;
  const [tab, setTab] = useState('official');
  const [create, setCreate] = useState(!!params?.create);
  const [view, setView] = useState(null);
  const [page, setPage] = useState(1);
  const official = ws.papers.filter((p) => !p.ownerId).sort((a, b) => b.createdAt - a.createdAt);
  const student = ws.papers.filter((p) => p.ownerId).sort((a, b) => b.createdAt - a.createdAt);
  const list = tab === 'official' ? official : student;
  const pages = Math.max(1, Math.ceil(list.length / 20));
  const atts = (p) => ws.attempts.filter((a) => a.paperId === p.id && a.status === 'submitted');
  if (view) return html`<${PaperDetail} paper=${ws.papers.find((p) => p.id === view)} onBack=${() => setView(null)} />`;
  return html`<div class="page-head"><div><h1>Papers & mocks</h1><p>Official mocks you publish to students, and every paper students have generated. Each paper is a frozen snapshot with its seed.</p></div><button class="btn primary" onClick=${() => setCreate(true)}>${Icon('plus')} Create official mock</button></div>
    <${Tabs} tabs=${[{ id: 'official', label: 'Official mocks', count: official.length }, { id: 'student', label: 'Student-generated', count: student.length }]} value=${tab} onChange=${(t) => { setTab(t); setPage(1); }} />
    <div class="card flush">${list.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Paper</th><th>Exam / pattern</th>${tab === 'student' && html`<th>Student</th>`}<th class="r">Q</th><th class="r">Attempts</th><th>Quality</th><th>Status</th></tr></thead><tbody>
      ${list.slice((page - 1) * 20, page * 20).map((p) => { const ex = ws.exams.find((e) => e.id === p.examId); const pat = ex?.patterns.find((x) => x.id === p.patternId); const a = atts(p); return html`<tr class="clickable" onClick=${() => setView(p.id)}>
        <td><b class="small">${p.title}</b><div class="xs muted mono">${p.code} · ${timeAgo(p.createdAt)}</div></td><td class="small">${ex?.short || '—'}${pat ? html`<div class="xs muted">${pat.name} v${p.patternVersion}</div>` : ''}</td>
        ${tab === 'student' && html`<td class="small">${ws.users.find((u) => u.id === p.ownerId)?.name}</td>`}
        <td class="r num">${p.questionCount}</td><td class="r num">${a.length}${a.length ? html`<div class="xs muted">avg ${(a.reduce((t, x) => t + x.result.percentage, 0) / a.length).toFixed(0)}%</div>` : ''}</td>
        <td><span class="pill ${p.validation?.pass ? 'good' : 'bad'}">${p.validation?.pass ? 'Passed' : 'Failed'}</span></td>
        <td>${p.ownerId ? html`<span class="pill outline">${p.mode}</span>` : p.published ? html`<span class="pill good">Published</span>` : html`<span class="pill">Draft</span>`}</td></tr>`; })}
    </tbody></table></div><${Pager} page=${page} pages=${pages} total=${list.length} onPage=${setPage} label="papers" />` : html`<${Empty} title="No papers yet" />`}</div>
    ${create && html`<${CreateOfficial} onClose=${() => setCreate(false)} onCreated=${(id) => { setCreate(false); setView(id); }} />`}`;
}
function CreateOfficial({ onClose, onCreated }) {
  const s = useStore();
  const { ws } = s;
  const [examId, setExamId] = useState(ws.exams[0]?.id);
  const exam = ws.exams.find((e) => e.id === examId);
  const [patternId, setPatternId] = useState(exam?.patterns[0]?.id);
  const [title, setTitle] = useState('');
  const [prob, setProb] = useState(null);
  const pattern = exam?.patterns.find((p) => p.id === patternId);
  const r = useMemo(() => pattern && D.patternReadiness(ws, exam, pattern), [patternId, examId]);
  const go = (strategy) => {
    const spec = D.specFromPattern(ws, exam, pattern, D.currentVersion(pattern), { mode: 'official', strategy, title: title.trim() || `${exam.short} · ${pattern.name}` });
    const res = attempt(() => S.generatePaper(spec, { official: true }));
    if (!res) return;
    if (!res.ok) return setProb(res.reports);
    toast(`${res.paper.code} created as a draft`); onCreated(res.paper.id);
  };
  return html`<${Modal} title="Create official mock" sub="Built from an examination blueprint. It stays a draft until you publish it." onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button>${r?.level === 'substitute' && html`<button class="btn" onClick=${() => go('fill')}>Generate with substitutions</button>`}<button class="btn primary" disabled=${!pattern || r?.level !== 'ready'} onClick=${() => go('strict')}>Generate</button>`}>
    <${Field} label="Examination" id="of-ex"><select id="of-ex" class="input" value=${examId} onChange=${(e) => { setExamId(e.target.value); setPatternId(ws.exams.find((x) => x.id === e.target.value)?.patterns[0]?.id); setProb(null); }}>${ws.exams.map((e) => html`<option value=${e.id}>${e.name}</option>`)}</select></${Field}>
    <${Field} label="Pattern" id="of-pt"><select id="of-pt" class="input" value=${patternId} onChange=${(e) => { setPatternId(e.target.value); setProb(null); }}>${exam?.patterns.map((p) => html`<option value=${p.id}>${p.name} (v${D.currentVersion(p).v}, ${D.currentVersion(p).totalQuestions} Q)</option>`)}</select></${Field}>
    <${Field} label="Title" id="of-title"><input id="of-title" class="input" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder=${pattern ? `${exam.short} · ${pattern.name}` : ''} /></${Field}>
    ${r && html`<${Notice} kind=${r.level === 'ready' ? 'good' : r.level === 'substitute' ? 'warn' : 'bad'}><b>${r.label}.</b> ${r.level === 'blocked' ? r.missing.map((m) => `${m.name}: ${m.shortfalls.map((x) => x.message).join(' ')}`).join(' ') : r.level === 'substitute' ? r.reports.flatMap((x) => x.adjustments.map((a) => a.message)).join('; ') : 'The bank can supply every section at the blueprint\'s difficulty mix.'}</${Notice}>`}
    ${prob && html`<${Notice} kind="bad">${prob.flatMap((x) => x.shortfalls.map((y) => `${x.name}: ${y.message}`)).join(' ')}</${Notice}>`}
  </${Modal}>`;
}
function PaperDetail({ paper, onBack }) {
  const s = useStore();
  const { ws } = s;
  const [pub, setPub] = useState(null);
  const [recon, setRecon] = useState(null);
  const [confirm, confirmEl] = useConfirm();
  if (!paper) return html`<${Empty} title="Paper not found" action=${html`<button class="btn" onClick=${onBack}>Back</button>`} />`;
  const items = E.paperItems(paper);
  const a = ws.attempts.filter((x) => x.paperId === paper.id && x.status === 'submitted');
  const ex = ws.exams.find((e) => e.id === paper.examId);
  const reconstruct = () => {
    // Rebuild from seed against today's bank and compare with the stored snapshot.
    if (paper.config?.fixed) return setRecon({ same: null, msg: 'This paper was built from a fixed list of questions, not a seed.' });
    const spec = { ...paper.config, seed: paper.seed, recentIds: null };
    const res = E.buildPaper(ws.questions, spec);
    if (!res.ok) return setRecon({ same: false, msg: 'The current bank can no longer satisfy this specification. The stored snapshot remains the paper of record.' });
    const a1 = items.map((i) => i.qid).sort().join(), b1 = E.paperItems(res.paper).map((i) => i.qid).sort().join();
    setRecon({ same: a1 === b1, msg: a1 === b1 ? 'Same seed, same questions: the paper reconstructs exactly from the current bank.' : 'The bank has changed since this paper was built (questions added, edited or archived), so the seed now selects a different set. The stored snapshot is what students saw and is unaffected.' });
  };
  return html`<div class="page-head"><div><button class="btn sm ghost" onClick=${onBack}>${Icon('left', 15)} Papers</button><span class="mono muted"> ${paper.code}</span><h1>${paper.title}</h1>
      <p>${ex?.name || 'Custom'}${paper.patternVersion ? ` · pattern v${paper.patternVersion}` : ''} · ${paper.questionCount} questions · ${fmtMarks(paper.maxMarks)} marks · ${paper.durationMin ? paper.durationMin + ' min' : 'untimed'} · seed <span class="mono">${paper.seed}</span></p></div>
    <div class="row tight"><button class="btn" onClick=${() => downloadPaperPdf(paper)}>${Icon('download', 16)} Paper PDF</button><button class="btn" onClick=${() => downloadPaperPdf(paper, { answers: true })}>With answer key</button>
      ${!paper.ownerId && (paper.published ? html`<button class="btn" onClick=${() => attempt(() => S.unpublishPaper(paper.id), 'Unpublished')}>Unpublish</button>` : html`<button class="btn primary" disabled=${!paper.validation?.pass} onClick=${() => setPub({ releaseAt: '', audience: 'all', ids: [] })}>Publish to students</button>`)}</div></div>
    ${paper.published && html`<${Notice} kind="good">Published ${fmtDateTime(paper.publishedAt)} to ${paper.assignedTo ? plural(paper.assignedTo.length, 'student') : 'all students'}${paper.releaseAt ? `; answer key released ${fmtDate(paper.releaseAt)}` : '; answers shown after each student submits'}. ${plural(a.length, 'attempt')} so far.</${Notice}>`}
    <div class="grid g2">
      <div class="card"><h3>Quality validation</h3><div class="check-list">${paper.validation.checks.map((c) => html`<div class="check-item"><span class="ic" style=${`color:var(--${c.severity === 'ok' ? 'good' : c.severity === 'warning' ? 'warn' : 'bad'})`}>${Icon(c.severity === 'ok' ? 'check' : 'alert', 16)}</span><span><b class="small">${c.label}</b><br /><span class="xs muted">${c.detail}</span></span></div>`)}</div></div>
      <div class="card"><h3>Generation report</h3>
        ${(paper.reports || []).map((r) => html`<div class="stack sm"><b class="small">${r.name}</b><span class="xs muted">${E.DIFFICULTIES.filter((d) => r.targetByDifficulty?.[d] || r.deliveredByDifficulty?.[d]).map((d) => `${E.DIFFICULTY_LABEL[d]} ${r.deliveredByDifficulty[d]}/${r.targetByDifficulty?.[d] ?? '–'}`).join(' · ')}</span>${r.adjustments?.length > 0 && html`<span class="xs" style="color:var(--warn)">${r.adjustments.map((x) => x.message).join('; ')}</span>`}</div>`)}
        <div class="row"><button class="btn sm" onClick=${reconstruct}>${Icon('refresh', 15)} Reconstruct from seed</button></div>
        ${recon && html`<${Notice} kind=${recon.same ? 'good' : 'info'}>${recon.msg}</${Notice}>`}</div>
    </div>
    <div class="stack"><h2>Questions</h2>${paper.sections.map((sec) => html`${paper.sections.length > 1 && html`<h3>${sec.name}</h3>`}${sec.items.map((it, i) => html`<div class="card" style="gap:10px"><div class="row tight"><b>Q${items.indexOf(it) + 1}</b><span class="mono xs muted">${it.code} v${it.version}</span><${DiffPill} d=${it.difficulty} /><span class="xs muted">${D.topicPath(ws, it.topicId)}</span></div><${QuestionBody} item=${it} /><${QuestionOptions} item=${it} response=${{}} reveal /></div>`)}`)}</div>
    ${pub && html`<${Modal} title="Publish to students" onClose=${() => setPub(null)} foot=${html`<button class="btn" onClick=${() => setPub(null)}>Cancel</button><button class="btn primary" onClick=${() => { if (attempt(() => { S.publishPaper(paper.id, { releaseAt: pub.releaseAt ? Date.parse(pub.releaseAt + 'T18:00:00+05:30') : null, assignedTo: pub.audience === 'some' ? pub.ids : null }); return true; }, 'Published')) setPub(null); }}>Publish</button>`}>
      <div class="field"><span class="label">Who gets it</span><label class="check"><input type="radio" checked=${pub.audience === 'all'} onChange=${() => setPub({ ...pub, audience: 'all' })} /> All students</label><label class="check"><input type="radio" checked=${pub.audience === 'some'} onChange=${() => setPub({ ...pub, audience: 'some' })} /> Selected students (bulk assignment)</label></div>
      ${pub.audience === 'some' && html`<div class="stack sm" style="max-height:200px;overflow:auto">${ws.users.filter((u) => u.role === 'student').map((u) => html`<label class="check"><input type="checkbox" checked=${pub.ids.includes(u.id)} onChange=${(e) => setPub({ ...pub, ids: e.target.checked ? [...pub.ids, u.id] : pub.ids.filter((x) => x !== u.id) })} /> ${u.name} <span class="xs muted">${u.email}</span></label>`)}</div>`}
      <${Field} label="Release answer key on (optional)" id="pb-rel" hint="Until then students see their score but not the answers. Leave empty to show answers after each student submits."><input id="pb-rel" class="input" type="date" value=${pub.releaseAt} onInput=${(e) => setPub({ ...pub, releaseAt: e.target.value })} /></${Field}>
    </${Modal}>`}
    ${confirmEl}`;
}
