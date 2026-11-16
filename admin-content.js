import { html, useState, useMemo, useEffect, useStore, nav, Icon, Notice, Empty, Tabs, Modal, Field, StatusPill, DiffPill, Pager, Chips, toast, attempt, fmtDate, timeAgo, plural, useConfirm, QuestionBody, QuestionOptions, Explanation } from './core.js';
import * as E from './engine.js';
import * as D from './domain.js';
import * as S from './store.js';
import { saveFile } from './pdf.js';

const isAdmin = () => S.store.user.role === 'admin';

// ---------- Taxonomy ----------
export function TaxonomyView() {
  const s = useStore();
  const { ws } = s;
  const [showArchived, setShowArchived] = useState(false);
  const [dlg, setDlg] = useState(null);
  const [open, setOpen] = useState(() => new Set(ws.subjects.slice(0, 1).map((x) => x.id)));
  const canEdit = isAdmin();
  const counts = useMemo(() => { const m = {}; ws.questions.forEach((q) => { [q.subjectId, q.chapterId, q.topicId].forEach((k) => { m[k] = m[k] || { pub: 0, all: 0 }; m[k].all++; if (q.status === 'published') m[k].pub++; }); }); return m; }, [s.rev]);
  const vis = (x) => showArchived || !x.archived;
  const toggle = (id) => { const n = new Set(open); n.has(id) ? n.delete(id) : n.add(id); setOpen(n); };
  const Actions = ({ kind, item }) => canEdit && html`<div class="tree-actions">
    <button class="icon-btn" aria-label=${`Move ${item.name} up`} onClick=${() => S.moveTaxon(kind, item.id, -1)}>${Icon('up', 16)}</button>
    <button class="icon-btn" aria-label=${`Move ${item.name} down`} onClick=${() => S.moveTaxon(kind, item.id, 1)}>${Icon('down', 16)}</button>
    <button class="icon-btn" aria-label=${`Rename ${item.name}`} onClick=${() => setDlg({ mode: 'rename', kind, item })}>${Icon('edit', 16)}</button>
    ${kind !== 'subject' && html`<button class="icon-btn" aria-label=${`Merge ${item.name}`} onClick=${() => setDlg({ mode: 'merge', kind, item })}>${Icon('merge', 16)}</button>`}
    <button class="icon-btn" aria-label=${item.archived ? `Restore ${item.name}` : `Archive ${item.name}`} onClick=${() => attempt(() => S.archiveTaxon(kind, item.id, !item.archived), item.archived ? 'Restored' : 'Archived')}>${Icon(item.archived ? 'refresh' : 'archive', 16)}</button>
  </div>`;
  const Count = ({ id }) => html`<span class="xs muted num nowrap">${counts[id]?.pub || 0} published${counts[id]?.all > (counts[id]?.pub || 0) ? ` · ${counts[id].all - counts[id].pub} other` : ''}</span>`;
  return html`<div class="page-head"><div><h1>Subjects, chapters & topics</h1><p>Exam → Subject → Chapter → Topic → Question. Archiving hides an item from new papers; existing papers keep their snapshots.</p></div>
      <div class="row tight"><label class="check small"><input type="checkbox" checked=${showArchived} onChange=${(e) => setShowArchived(e.target.checked)} /> Show archived</label>${canEdit && html`<button class="btn primary" onClick=${() => setDlg({ mode: 'add', kind: 'subject' })}>${Icon('plus')} Subject</button>`}</div></div>
    ${!canEdit && html`<${Notice}>Only administrators can change the structure. You can still browse it.</${Notice}>`}
    <div class="card" style="padding:8px"><div class="tree">
      ${ws.subjects.filter(vis).sort((a, b) => a.order - b.order).map((sub) => html`
        <div class="tree-row ${sub.archived ? 'archived' : ''}"><button class="icon-btn" aria-label=${open.has(sub.id) ? 'Collapse' : 'Expand'} aria-expanded=${open.has(sub.id)} onClick=${() => toggle(sub.id)}>${Icon(open.has(sub.id) ? 'down' : 'right', 16)}</button><b class="name">${sub.name}</b><${Count} id=${sub.id} /><${Actions} kind="subject" item=${sub} />${canEdit && html`<button class="btn sm ghost" onClick=${() => { setDlg({ mode: 'add', kind: 'chapter', parent: sub }); setOpen(new Set([...open, sub.id])); }}>${Icon('plus', 14)} Chapter</button>`}</div>
        ${open.has(sub.id) && ws.chapters.filter((c) => c.subjectId === sub.id && vis(c)).sort((a, b) => a.order - b.order).map((c) => html`
          <div class="tree-row l1 ${c.archived ? 'archived' : ''}"><span class="name strong small">${c.name}</span><${Count} id=${c.id} /><${Actions} kind="chapter" item=${c} />${canEdit && html`<button class="btn sm ghost" onClick=${() => setDlg({ mode: 'add', kind: 'topic', parent: c })}>${Icon('plus', 14)} Topic</button>`}</div>
          ${ws.topics.filter((t) => t.chapterId === c.id && vis(t)).sort((a, b) => a.order - b.order).map((t) => html`<div class="tree-row l2 ${t.archived ? 'archived' : ''}"><button class="name" style="background:none;border:0;text-align:left;cursor:pointer;color:inherit;padding:0" onClick=${() => nav('admin-questions', { topicId: t.id })}>${t.name}</button><${Count} id=${t.id} /><${Actions} kind="topic" item=${t} /></div>`)}`)}`)}
    </div></div>
    ${dlg && html`<${TaxDialog} ...${dlg} onClose=${() => setDlg(null)} />`}`;
}
function TaxDialog({ mode, kind, item, parent, onClose }) {
  const s = useStore();
  const [name, setName] = useState(item?.name || '');
  const [target, setTarget] = useState('');
  const peers = kind === 'topic' ? s.ws.topics.filter((t) => !t.archived && t.id !== item?.id) : s.ws.chapters.filter((c) => !c.archived && c.id !== item?.id && c.subjectId === item?.subjectId);
  const go = () => {
    let ok;
    if (mode === 'add') ok = attempt(() => S.addTaxon(kind, name, parent?.id), `${kind[0].toUpperCase() + kind.slice(1)} added`);
    else if (mode === 'rename') ok = attempt(() => { S.renameTaxon(kind, item.id, name); return true; }, 'Renamed');
    else ok = attempt(() => { const n = S.mergeTaxon(kind, item.id, target); return n ?? true; }, 'Merged');
    if (ok !== undefined) onClose();
  };
  return html`<${Modal} title=${mode === 'add' ? `New ${kind}${parent ? ` in ${parent.name}` : ''}` : mode === 'rename' ? `Rename ${kind}` : `Merge "${item.name}" into…`} onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${mode === 'merge' ? !target : !name.trim()} onClick=${go}>${mode === 'merge' ? 'Merge' : 'Save'}</button>`}>
    ${mode === 'merge' ? html`<${Field} label=${`Target ${kind}`} id="tx-target" hint="Questions move to the target with their primary classification updated. The merged item is archived."><select id="tx-target" class="input" value=${target} onChange=${(e) => setTarget(e.target.value)}><option value="">Choose…</option>${peers.map((p) => html`<option value=${p.id}>${kind === 'topic' ? `${D.taxName(s.ws, p.chapterId)} › ${p.name}` : p.name}</option>`)}</select></${Field}>`
      : html`<${Field} label="Name" id="tx-name"><input id="tx-name" class="input" value=${name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && go()} /></${Field}>`}
  </${Modal}>`;
}

// ---------- Question bank list ----------
const PAGE = 25;
export function QuestionsView({ params }) {
  const s = useStore();
  const { ws } = s;
  const [f, setF] = useState({ q: '', subjectId: '', chapterId: params?.chapterId || (params?.topicId ? ws.topics.find((t) => t.id === params.topicId)?.chapterId : '') || '', topicId: params?.topicId || '', difficulty: '', status: params?.status || '', type: '', provenance: '', lang: '', flagged: false });
  const [sel, setSel] = useState(new Set());
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ k: 'updatedAt', dir: -1 });
  const [bulk, setBulk] = useState(null);
  const set = (patch) => { setF({ ...f, ...patch }); setPage(1); setSel(new Set()); };
  const list = useMemo(() => {
    const needle = E.normaliseText(f.q);
    let l = ws.questions.filter((q) => (!f.subjectId || q.subjectId === f.subjectId) && (!f.chapterId || q.chapterId === f.chapterId) && (!f.topicId || q.topicId === f.topicId) && (!f.difficulty || q.difficulty === f.difficulty) && (!f.status || q.status === f.status) && (!f.type || q.type === f.type) && (!f.provenance || q.provenance === f.provenance) && (!f.lang || (q.lang || 'en') === f.lang) && (!f.flagged || (q.flags || []).some((x) => !x.resolved)) && (!needle || E.normaliseText(`${q.code} ${q.text} ${q.assertion || ''} ${(q.options || []).map((o) => o.text).join(' ')}`).includes(needle)));
    l.sort((a, b) => { const x = a[sort.k] ?? '', y = b[sort.k] ?? ''; return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
    return l;
  }, [s.rev, f, sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const rows = list.slice((page - 1) * PAGE, page * PAGE);
  const allOnPage = rows.length && rows.every((q) => sel.has(q.id));
  const chapters = ws.chapters.filter((c) => !f.subjectId || c.subjectId === f.subjectId);
  const topics = ws.topics.filter((t) => !f.chapterId || t.chapterId === f.chapterId);
  const th = (k, label, cls = '') => html`<th class=${cls}><button onClick=${() => setSort({ k, dir: sort.k === k ? -sort.dir : 1 })}>${label}${sort.k === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  const doBulk = (status, note) => { const r = attempt(() => S.setQuestionStatus([...sel], status, note)); if (r) { toast(`${r.done.length} updated${r.skipped.length ? `, ${r.skipped.length} skipped (failed validation: ${r.skipped[0].code} ${r.skipped[0].reason})` : ''}`, r.skipped.length ? 'bad' : ''); setSel(new Set()); } };
  return html`<div class="page-head"><div><h1>Question bank</h1><p>${ws.questions.length.toLocaleString('en-IN')} questions. One record per question, reusable across examinations through exam tags.</p></div>
      <div class="row tight"><button class="btn" onClick=${() => nav('admin-import')}>${Icon('upload')} Import</button><button class="btn primary" onClick=${() => nav('admin-question', { id: null })}>${Icon('plus')} New question</button></div></div>
    <div class="card" style="gap:10px">
      <div class="filters">
        <input class="input" placeholder="Search text, options or code" aria-label="Search questions" value=${f.q} onInput=${(e) => set({ q: e.target.value })} />
        <select class="input" aria-label="Subject" value=${f.subjectId} onChange=${(e) => set({ subjectId: e.target.value, chapterId: '', topicId: '' })}><option value="">All subjects</option>${ws.subjects.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
        <select class="input" aria-label="Chapter" value=${f.chapterId} onChange=${(e) => set({ chapterId: e.target.value, topicId: '' })}><option value="">All chapters</option>${chapters.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
        <select class="input" aria-label="Topic" value=${f.topicId} onChange=${(e) => set({ topicId: e.target.value })}><option value="">All topics</option>${topics.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
        <select class="input" aria-label="Status" value=${f.status} onChange=${(e) => set({ status: e.target.value })}><option value="">Any status</option>${E.STATUSES.map((x) => html`<option value=${x}>${E.STATUS_LABEL[x]}</option>`)}</select>
      </div>
      <div class="row tight">
        <select class="input" style="width:auto" aria-label="Difficulty" value=${f.difficulty} onChange=${(e) => set({ difficulty: e.target.value })}><option value="">Any difficulty</option>${E.DIFFICULTIES.map((d) => html`<option value=${d}>${E.DIFFICULTY_LABEL[d]}</option>`)}</select>
        <select class="input" style="width:auto" aria-label="Format" value=${f.type} onChange=${(e) => set({ type: e.target.value })}><option value="">Any format</option>${Object.entries(E.QUESTION_TYPES).map(([k, v]) => html`<option value=${k}>${v.label}</option>`)}</select>
        <select class="input" style="width:auto" aria-label="Provenance" value=${f.provenance} onChange=${(e) => set({ provenance: e.target.value })}><option value="">Any source type</option>${Object.entries(E.PROVENANCE_LABEL).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
        <select class="input" style="width:auto" aria-label="Language" value=${f.lang} onChange=${(e) => set({ lang: e.target.value })}><option value="">Any language</option><option value="en">English</option><option value="hi">Hindi</option></select>
        <label class="check small"><input type="checkbox" checked=${f.flagged} onChange=${(e) => set({ flagged: e.target.checked })} /> Has open reports</label>
        ${Object.values(f).some(Boolean) && html`<button class="btn sm ghost" onClick=${() => set({ q: '', subjectId: '', chapterId: '', topicId: '', difficulty: '', status: '', type: '', provenance: '', lang: '', flagged: false })}>Clear filters</button>`}
      </div>
    </div>
    ${sel.size > 0 && html`<div class="card" style="position:sticky;top:60px;z-index:15;border-color:var(--primary);padding:10px 14px"><div class="row"><b class="small">${sel.size} selected</b>
      <button class="btn sm" onClick=${() => doBulk('pending')}>Send for review</button>
      <button class="btn sm" onClick=${() => doBulk('approved')}>Approve</button>
      ${isAdmin() && html`<button class="btn sm primary" onClick=${() => doBulk('published')}>Publish</button>`}
      <button class="btn sm" onClick=${() => setBulk('tag')}>Exam tags…</button>
      <button class="btn sm" onClick=${() => doBulk('archived')}>Archive</button>
      <button class="btn sm danger" onClick=${() => { const n = attempt(() => S.deleteDrafts([...sel])); if (n !== undefined) { toast(n ? `${n} draft(s) deleted` : 'Only unused drafts can be deleted. Archive the others.', n ? '' : 'bad'); setSel(new Set()); } }}>Delete drafts</button>
      <button class="btn sm ghost" onClick=${() => setSel(new Set())}>Clear</button></div></div>`}
    <div class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr>
      <th style="width:34px"><input type="checkbox" aria-label="Select page" checked=${allOnPage} onChange=${() => { const n = new Set(sel); rows.forEach((q) => (allOnPage ? n.delete(q.id) : n.add(q.id))); setSel(n); }} /></th>
      ${th('code', 'Code')}<th>Question</th>${th('topicId', 'Topic', 'desktop-only')}${th('difficulty', 'Level')}${th('status', 'Status')}${th('usageCount', 'Used', 'r desktop-only')}${th('updatedAt', 'Updated', 'desktop-only')}</tr></thead><tbody>
      ${rows.map((q) => html`<tr class="clickable" onClick=${(e) => { if (e.target.type !== 'checkbox') nav('admin-question', { id: q.id }); }}>
        <td><input type="checkbox" aria-label=${`Select ${q.code}`} checked=${sel.has(q.id)} onChange=${() => { const n = new Set(sel); n.has(q.id) ? n.delete(q.id) : n.add(q.id); setSel(n); }} /></td>
        <td class="mono xs nowrap">${q.code}<div class="xs muted">v${q.version || 1}</div></td>
        <td style="min-width:240px"><div class="small clamp2">${q.text || q.assertion}</div><div class="row tight" style="margin-top:3px"><span class="xs muted">${E.QUESTION_TYPES[q.type]?.label}</span>${q.lang === 'hi' && html`<span class="pill outline">हिन्दी</span>`}${q.aiGenerated && html`<span class="pill mark">AI draft</span>`}${q.sample && html`<span class="pill outline">Sample</span>`}${(q.flags || []).some((x) => !x.resolved) && html`<span class="pill bad">Reported</span>`}${q.dupGroup && html`<span class="pill warn">Possible duplicate</span>`}</div></td>
        <td class="small desktop-only">${D.taxName(ws, q.topicId)}<div class="xs muted">${D.taxName(ws, q.chapterId)}</div></td>
        <td><${DiffPill} d=${q.difficulty} /></td><td><${StatusPill} status=${q.status} /></td><td class="r num desktop-only">${q.usageCount || 0}</td><td class="small nowrap desktop-only">${timeAgo(q.updatedAt)}</td></tr>`)}
    </tbody></table></div>${!rows.length && html`<${Empty} title="No questions match these filters" />`}<${Pager} page=${page} pages=${pages} total=${list.length} onPage=${setPage} /></div>
    ${bulk === 'tag' && html`<${TagDialog} ids=${[...sel]} onClose=${() => setBulk(null)} />`}`;
}
function TagDialog({ ids, onClose }) {
  const s = useStore();
  return html`<${Modal} title=${`Exam tags for ${plural(ids.length, 'question')}`} sub="Tags make a question preferred when papers are generated for that examination." onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Done</button>`}>
    ${s.ws.exams.map((e) => html`<div class="row between"><span>${e.name}</span><div class="row tight"><button class="btn sm" onClick=${() => { S.bulkTag(ids, e.id, false); toast(`Removed ${e.short}`); }}>Remove</button><button class="btn sm primary" onClick=${() => { S.bulkTag(ids, e.id, true); toast(`Tagged ${e.short}`); }}>Add</button></div></div>`)}
  </${Modal}>`;
}

// ---------- Question editor ----------
export function QuestionEditorPage({ params }) {
  const s = useStore();
  const { ws } = s;
  const existing = params?.id && ws.questions.find((q) => q.id === params.id);
  const [q, setQ] = useState(() => existing ? JSON.parse(JSON.stringify(existing)) : S.newQuestionDraft(params?.defaults || {}));
  const [aiBusy, setAiBusy] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [confirm, confirmEl] = useConfirm();
  const set = (patch) => setQ({ ...q, ...patch });
  const kind = E.typeKind(q.type);
  const v = E.validateQuestion(q, { taxonomy: ws });
  const similar = useMemo(() => (q.text.length > 12 ? E.findSimilar(q, ws.questions, { threshold: 0.55, limit: 4 }) : []), [q.text, JSON.stringify(q.options)]);
  const usedIn = existing ? ws.papers.filter((p) => E.paperItems(p).some((i) => i.qid === existing.id)).length : 0;
  const changeType = (type) => {
    const k = E.typeKind(type);
    const patch = { type };
    if (type === 'assertion_reason') { patch.options = E.AR_OPTIONS.map((o) => ({ ...o })); patch.correct = []; patch.text = q.text || 'Read the Assertion (A) and the Reason (R) and choose the correct option.'; }
    else if (type === 'true_false') { patch.options = [{ id: 'a', text: 'True' }, { id: 'b', text: 'False' }]; patch.correct = []; }
    else if (type === 'statement') { patch.statements = q.statements?.length ? q.statements : ['', '']; patch.ask = q.ask || 'Which of the statements given above is/are correct?'; patch.options = [{ id: 'a', text: '1 only' }, { id: 'b', text: '2 only' }, { id: 'c', text: 'Both 1 and 2' }, { id: 'd', text: 'Neither 1 nor 2' }]; patch.correct = []; }
    else if (type === 'sequence') { patch.statements = q.statements?.length ? q.statements : ['', '', '', '']; patch.ask = q.ask || 'Select the correct order using the codes below:'; }
    else if (type === 'match') { patch.listA = q.listA || ['A. ', 'B. ', 'C. ', 'D. ']; patch.listB = q.listB || ['1. ', '2. ', '3. ', '4. ']; }
    if (k === 'numeric') patch.correct = { value: NaN, tolerance: 0 };
    else if (k === 'text') patch.correct = [];
    else if (!Array.isArray(q.correct) || (E.typeKind(q.type) !== 'single' && E.typeKind(q.type) !== 'multi')) { patch.correct = []; if (!patch.options && (!q.options || q.options.length < 2)) patch.options = 'abcd'.split('').map((id) => ({ id, text: '' })); }
    if (k === 'single' && Array.isArray(q.correct) && q.correct.length > 1) patch.correct = q.correct.slice(0, 1);
    set(patch);
  };
  const save = (status) => {
    const r = attempt(() => S.saveQuestion(q, { status }));
    if (r) { toast(`${r.code} saved · ${E.STATUS_LABEL[r.status]}`); setQ(JSON.parse(JSON.stringify(r))); if (!existing) nav('admin-question', { id: r.id }); }
  };
  const ai = async (task) => {
    const sample = s.caps.sample; if (!sample) return toast('AI assistance is not available in this view.', 'bad');
    setAiBusy(task);
    try {
      const qtext = `Question: ${q.text}\n${q.assertion ? `Assertion: ${q.assertion}\nReason: ${q.reason}\n` : ''}${(q.statements || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}\nOptions:\n${(q.options || []).map((o, i) => `${'ABCD'[i]}. ${o.text}`).join('\n')}\nMarked correct: ${(Array.isArray(q.correct) ? q.correct : [q.correct?.value]).join(', ')}`;
      if (task === 'explain') {
        const out = await sample.json(`You help an Indian competitive-exam content team. Write a concise, factual explanation (2–4 sentences) for why the marked answer is correct, and one short note for each wrong option saying why it is wrong. If you believe the marked answer is wrong, say so in "concern". Return JSON {"explanation": string, "optionNotes": {"a": string, ...}, "concern": string|null}.\n\n${qtext}`, { modelTier: 'default' });
        set({ explanation: out.explanation || q.explanation, optionNotes: { ...(q.optionNotes || {}), ...(out.optionNotes || {}) } });
        toast(out.concern ? `AI flagged a concern: ${out.concern}` : 'Explanation drafted by AI. Check it before saving.', out.concern ? 'bad' : '');
      } else if (task === 'classify') {
        const topics = ws.topics.filter((t) => !t.archived).map((t) => `${t.id}: ${D.topicPath(ws, t.id)}`).join('\n');
        const out = await sample.json(`Classify this exam question into exactly one topic id from the list, and rate difficulty for Indian competitive exams as easy, moderate, difficult or advanced. Return JSON {"topicId": string, "difficulty": string, "reason": string}.\n\nTopics:\n${topics}\n\n${qtext}`, { modelTier: 'quick' });
        const t = ws.topics.find((x) => x.id === out.topicId);
        if (!t) throw new Error('The AI suggested a topic that does not exist.');
        const c = ws.chapters.find((x) => x.id === t.chapterId);
        set({ topicId: t.id, chapterId: c.id, subjectId: c.subjectId, difficulty: E.DIFFICULTIES.includes(out.difficulty) ? out.difficulty : q.difficulty });
        toast(`Suggested: ${D.topicPath(ws, t.id)} · ${out.difficulty}. ${out.reason || ''}`);
      } else if (task === 'distractors') {
        const out = await sample.json(`Suggest three plausible but clearly incorrect options (distractors) for this exam question. Keep the same style and length as the correct option. Return JSON {"distractors": [string, string, string]}.\n\n${qtext}`, { modelTier: 'quick' });
        const correctOpt = q.options.find((o) => q.correct.includes(o.id));
        const opts = [correctOpt || { id: 'a', text: '' }, ...(out.distractors || []).slice(0, 3).map((t) => ({ text: t }))].map((o, i) => ({ id: 'abcd'[i], text: o.text }));
        set({ options: opts, correct: correctOpt ? ['a'] : [] });
        toast('Distractors suggested. The correct option is now A; review before saving.');
      }
    } catch (e) { toast(e?.message || 'The AI request failed.', 'bad'); }
    setAiBusy('');
  };
  const subjects = ws.subjects.filter((x) => !x.archived);
  const chapters = ws.chapters.filter((c) => c.subjectId === q.subjectId && !c.archived);
  const topics = ws.topics.filter((t) => t.chapterId === q.chapterId && !t.archived);
  const listEditor = (key, label, min = 2) => html`<div class="field"><span class="label">${label}</span>${(q[key] || []).map((x, i) => html`<div class="row nowrap"><span class="muted small" style="width:20px">${i + 1}.</span><input class="input" aria-label=${`${label} ${i + 1}`} value=${x} onInput=${(e) => { const a = [...q[key]]; a[i] = e.target.value; set({ [key]: a }); }} />${(q[key] || []).length > min && html`<button class="icon-btn" aria-label="Remove" onClick=${() => set({ [key]: q[key].filter((_, j) => j !== i) })}>${Icon('x', 16)}</button>`}</div>`)}<button class="btn sm ghost" style="justify-self:start" onClick=${() => set({ [key]: [...(q[key] || []), ''] })}>${Icon('plus', 14)} Add</button></div>`;
  const onImage = (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 400000) return toast('Use an image under 400 KB.', 'bad'); const r = new FileReader(); r.onload = () => set({ image: r.result }); r.readAsDataURL(file); };
  const preview = { ...q, qid: 'preview' };

  return html`<div class="page-head"><div><button class="btn sm ghost" onClick=${() => nav('admin-questions')}>${Icon('left', 15)} Question bank</button><h1>${existing ? existing.code : 'New question'}</h1>
      <div class="row tight">${existing && html`<${StatusPill} status=${existing.status} /><span class="xs muted">v${existing.version || 1} · created ${fmtDate(existing.createdAt)} · used in ${plural(usedIn, 'paper')}</span>`}${q.aiGenerated && html`<span class="pill mark">AI-generated draft</span>`}${q.sample && html`<span class="pill outline">Sample content</span>`}</div></div>
      <div class="row tight">
        <button class="btn" onClick=${() => save('draft')}>Save draft</button>
        ${q.status !== 'pending' && html`<button class="btn" onClick=${() => save('pending')}>Send for review</button>`}
        ${S.can('question.review') && html`<button class="btn" onClick=${() => save('approved')}>Approve</button>`}
        ${isAdmin() && html`<button class="btn primary" onClick=${() => save('published')}>${existing?.status === 'published' ? 'Save & keep published' : 'Publish'}</button>`}
      </div></div>
    ${existing?.status === 'published' && usedIn > 0 && html`<${Notice} kind="info">This question is in ${plural(usedIn, 'paper')}. Edits create version ${(existing.version || 1) + 1}; papers already generated keep the version they were built with${isAdmin() ? '' : ', and the edit goes back to review'}.</${Notice}>`}
    <div class="grid g-side">
      <div class="stack lg">
        <div class="card">
          <div class="grid g2">
            <${Field} label="Format" id="q-type"><select id="q-type" class="input" value=${q.type} onChange=${(e) => changeType(e.target.value)}>${Object.entries(E.QUESTION_TYPES).map(([k, x]) => html`<option value=${k}>${x.label}</option>`)}</select></${Field}>
            <${Field} label="Language" id="q-lang"><select id="q-lang" class="input" value=${q.lang} onChange=${(e) => set({ lang: e.target.value })}><option value="en">English</option><option value="hi">Hindi</option></select></${Field}>
          </div>
          ${q.type === 'passage' && html`<${Field} label="Passage" id="q-passage"><textarea id="q-passage" class="input" style="min-height:140px" value=${q.passage || ''} onInput=${(e) => set({ passage: e.target.value })}></textarea></${Field}>`}
          <${Field} label=${q.type === 'statement' || q.type === 'sequence' ? 'Lead-in' : 'Question'} id="q-text"><textarea id="q-text" class="input" value=${q.text} onInput=${(e) => set({ text: e.target.value })} placeholder=${q.type === 'statement' ? 'Consider the following statements about…' : 'Write the question'}></textarea></${Field}>
          ${q.type === 'assertion_reason' && html`<${Field} label="Assertion (A)" id="q-as"><textarea id="q-as" class="input" style="min-height:60px" value=${q.assertion || ''} onInput=${(e) => set({ assertion: e.target.value })}></textarea></${Field}><${Field} label="Reason (R)" id="q-rs"><textarea id="q-rs" class="input" style="min-height:60px" value=${q.reason || ''} onInput=${(e) => set({ reason: e.target.value })}></textarea></${Field}>`}
          ${(q.type === 'statement' || q.type === 'sequence') && html`${listEditor('statements', q.type === 'sequence' ? 'Items to arrange' : 'Statements')}<${Field} label="Question line" id="q-ask"><input id="q-ask" class="input" value=${q.ask || ''} onInput=${(e) => set({ ask: e.target.value })} /></${Field}>`}
          ${q.type === 'match' && html`<div class="grid g2">${listEditor('listA', 'List I', 2)}${listEditor('listB', 'List II', 2)}</div>`}
          ${q.type === 'image' && html`<div class="field"><span class="label">Image or diagram</span>${q.image && html`<img class="q-img" src=${q.image} alt="Attached diagram" />`}<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange=${onImage} aria-label="Upload image" /><span class="hint">PNG, JPG, SVG or WebP under 400 KB.</span></div>`}
        </div>
        <div class="card"><div class="card-head"><h3>Answer</h3>${s.caps.sample && (kind === 'single' || kind === 'multi') && q.type === 'single' && html`<button class="btn sm ghost" disabled=${!!aiBusy} onClick=${() => ai('distractors')}>${Icon('sparkles', 15)} ${aiBusy === 'distractors' ? 'Thinking…' : 'Suggest distractors'}</button>`}</div>
          ${(kind === 'single' || kind === 'multi') ? html`<div class="stack sm"><p class="xs muted">${kind === 'multi' ? 'Tick every correct option.' : 'Select the one correct option.'}</p>
            ${q.options.map((o, i) => html`<div class="opt-edit"><input type=${kind === 'multi' ? 'checkbox' : 'radio'} name="correct" aria-label=${`Option ${'ABCDEFGH'[i]} is correct`} checked=${(q.correct || []).includes(o.id)} onChange=${(e) => set({ correct: kind === 'multi' ? (e.target.checked ? [...q.correct, o.id] : q.correct.filter((x) => x !== o.id)) : [o.id] })} style="width:18px;height:18px;accent-color:var(--good)" />
              <input class="input" aria-label=${`Option ${'ABCDEFGH'[i]}`} value=${o.text} disabled=${q.type === 'assertion_reason'} onInput=${(e) => set({ options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} placeholder=${`Option ${'ABCDEFGH'[i]}`} />
              ${q.options.length > 2 && !['assertion_reason', 'true_false'].includes(q.type) ? html`<button class="icon-btn" aria-label="Remove option" onClick=${() => set({ options: q.options.filter((x) => x.id !== o.id), correct: (q.correct || []).filter((x) => x !== o.id) })}>${Icon('x', 16)}</button>` : html`<span></span>`}</div>`)}
            ${q.options.length < 6 && !['assertion_reason', 'true_false'].includes(q.type) && html`<button class="btn sm ghost" style="justify-self:start" onClick=${() => { const id = 'abcdefgh'.split('').find((x) => !q.options.some((o) => o.id === x)); set({ options: [...q.options, { id, text: '' }] }); }}>${Icon('plus', 14)} Add option</button>`}</div>`
          : kind === 'numeric' ? html`<div class="grid g2"><${Field} label="Correct value" id="q-num"><input id="q-num" class="input" type="number" step="any" value=${Number.isNaN(q.correct?.value) ? '' : q.correct?.value} onInput=${(e) => set({ correct: { ...q.correct, value: e.target.value === '' ? NaN : Number(e.target.value) } })} /></${Field}><${Field} label="Tolerance (±)" id="q-tol"><input id="q-tol" class="input" type="number" step="any" min="0" value=${q.correct?.tolerance ?? 0} onInput=${(e) => set({ correct: { ...q.correct, tolerance: Number(e.target.value) || 0 } })} /></${Field}></div>`
          : html`<${Field} label="Accepted answers" id="q-acc" hint="Separate alternatives with |. Matching ignores case, spacing and punctuation."><input id="q-acc" class="input" value=${(q.correct || []).join(' | ')} onInput=${(e) => set({ correct: e.target.value.split('|').map((x) => x.trim()).filter(Boolean) })} /></${Field}>`}
        </div>
        <div class="card"><div class="card-head"><h3>Explanation</h3>${s.caps.sample && html`<button class="btn sm ghost" disabled=${!!aiBusy} onClick=${() => ai('explain')}>${Icon('sparkles', 15)} ${aiBusy === 'explain' ? 'Thinking…' : 'Draft with AI'}</button>`}</div>
          <${Field} label="Why the answer is correct" id="q-exp"><textarea id="q-exp" class="input" value=${q.explanation} onInput=${(e) => set({ explanation: e.target.value })}></textarea></${Field}>
          ${(kind === 'single' || kind === 'multi') && q.type !== 'assertion_reason' && html`<details><summary class="small strong" style="cursor:pointer">Why the other options are wrong (optional)</summary><div class="stack sm" style="margin-top:8px">${q.options.filter((o) => !(q.correct || []).includes(o.id)).map((o) => html`<${Field} label=${`Option ${'ABCDEFGH'[q.options.indexOf(o)]}: ${o.text}`} id=${'on-' + o.id}><input id=${'on-' + o.id} class="input" value=${q.optionNotes?.[o.id] || ''} onInput=${(e) => set({ optionNotes: { ...(q.optionNotes || {}), [o.id]: e.target.value } })} /></${Field}>`)}</div></details>`}
          <div class="grid g2"><${Field} label="Concept tested" id="q-con"><input id="q-con" class="input" value=${q.concept} onInput=${(e) => set({ concept: e.target.value })} /></${Field}><${Field} label="Suggested revision material" id="q-rev"><input id="q-rev" class="input" value=${q.revision} onInput=${(e) => set({ revision: e.target.value })} placeholder="e.g. NCERT Class 12, Themes in Indian History II, ch. 11" /></${Field}></div>
        </div>
        <div class="card"><div class="card-head"><h3>Student preview</h3></div><${QuestionBody} item=${preview} /><${QuestionOptions} item=${preview} response=${{}} reveal=${v.ok} /></div>
      </div>
      <div class="stack lg">
        <div class="card"><div class="card-head"><h3>Classification</h3>${s.caps.sample && html`<button class="btn sm ghost" disabled=${!!aiBusy || !q.text} onClick=${() => ai('classify')}>${Icon('sparkles', 15)} ${aiBusy === 'classify' ? '…' : 'Suggest'}</button>`}</div>
          <${Field} label="Subject" id="q-sub"><select id="q-sub" class="input" value=${q.subjectId} onChange=${(e) => set({ subjectId: e.target.value, chapterId: '', topicId: '' })}><option value="">Choose…</option>${subjects.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select></${Field}>
          <${Field} label="Chapter" id="q-ch"><select id="q-ch" class="input" value=${q.chapterId} onChange=${(e) => set({ chapterId: e.target.value, topicId: '' })}><option value="">Choose…</option>${chapters.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select></${Field}>
          <${Field} label="Topic (primary)" id="q-tp"><select id="q-tp" class="input" value=${q.topicId} onChange=${(e) => set({ topicId: e.target.value })}><option value="">Choose…</option>${topics.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select></${Field}>
          <${Field} label="Subtopic" id="q-st"><input id="q-st" class="input" value=${q.subtopic || ''} onInput=${(e) => set({ subtopic: e.target.value })} /></${Field}>
          <div class="field"><span class="label">Difficulty</span><${Chips} options=${E.DIFFICULTIES.map((d) => ({ id: d, label: E.DIFFICULTY_LABEL[d] }))} value=${q.difficulty} onChange=${(d) => set({ difficulty: d })} /></div>
          <div class="field"><span class="label">Exam tags</span><${Chips} multi options=${ws.exams.map((e) => ({ id: e.id, label: e.short }))} value=${q.examTags || []} onChange=${(t) => set({ examTags: t })} /></div>
        </div>
        <div class="card"><h3>Source & provenance</h3>
          <${Field} label="Content type" id="q-prov"><select id="q-prov" class="input" value=${q.provenance} onChange=${(e) => set({ provenance: e.target.value, aiGenerated: e.target.value === 'ai_draft' ? true : q.aiGenerated })}>${Object.entries(E.PROVENANCE_LABEL).map(([k, x]) => html`<option value=${k}>${x}</option>`)}</select></${Field}>
          ${q.provenance === 'pyq' && html`<${Field} label="Exam year" id="q-yr" hint="Only for questions whose previous-year provenance has been verified."><input id="q-yr" class="input" type="number" min="1950" max="2100" value=${q.examYear || ''} onInput=${(e) => set({ examYear: e.target.value ? Number(e.target.value) : null })} /></${Field}>`}
          <${Field} label="Source / reference" id="q-src" hint=${q.provenance === 'pyq' ? 'Required: the official paper or licensed source.' : 'Book, notification or licence the facts come from.'}><input id="q-src" class="input" value=${q.source} onInput=${(e) => set({ source: e.target.value })} /></${Field}>
        </div>
        <div class="card"><h3>Checks</h3>
          ${v.errors.length === 0 && v.warnings.length === 0 && html`<p class="small" style="color:var(--good)">${Icon('check', 15)} Ready for review.</p>`}
          ${v.errors.map((x) => html`<div class="check-item"><span class="ic" style="color:var(--bad)">${Icon('x', 15)}</span><span class="small">${x}</span></div>`)}
          ${v.warnings.map((x) => html`<div class="check-item"><span class="ic" style="color:var(--warn)">${Icon('alert', 15)}</span><span class="small">${x}</span></div>`)}
          ${similar.length > 0 && html`<div class="stack sm"><span class="label">Similar questions</span>${similar.map((x) => html`<button class="nav-item" style="align-items:flex-start" onClick=${() => nav('admin-question', { id: x.id })}><span class="pill ${x.score >= E.DUPLICATE_THRESHOLD ? 'bad' : 'warn'}">${Math.round(x.score * 100)}%</span><span class="small clamp2"><span class="mono xs">${x.code}</span> ${x.text}</span></button>`)}</div>`}
        </div>
        ${existing && html`<div class="card"><h3>Review history</h3>
          ${(existing.reviewNotes || []).length ? existing.reviewNotes.map((n) => html`<div class="small"><b>${E.STATUS_LABEL[n.status] || n.status}</b> · ${ws.users.find((u) => u.id === n.by)?.name} · ${timeAgo(n.at)}<div class="muted">${n.note}</div></div>`) : html`<p class="small muted">No notes yet.</p>`}
          ${(existing.flags || []).filter((f) => !f.resolved).map((f) => html`<${Notice} kind="bad">Reported as ${f.reason.replace('_', ' ')} ${timeAgo(f.at)}.</${Notice}>`)}
          <div class="row">${S.can('question.review') && existing.status === 'pending' && html`<button class="btn sm danger" onClick=${() => setRejecting(true)}>Reject…</button>`}
            ${existing.status !== 'archived' ? html`<button class="btn sm" onClick=${async () => { if (await confirm({ title: 'Archive this question?', body: 'It will no longer be used in new papers. Existing papers keep it.', ok: 'Archive' })) { attempt(() => S.setQuestionStatus([existing.id], 'archived'), 'Archived'); setQ({ ...q, status: 'archived' }); } }}>${Icon('archive', 15)} Archive</button>` : html`<button class="btn sm" onClick=${() => { attempt(() => S.setQuestionStatus([existing.id], 'draft'), 'Restored as draft'); setQ({ ...q, status: 'draft' }); }}>Restore as draft</button>`}</div></div>`}
      </div>
    </div>
    ${rejecting && html`<${RejectDialog} ids=${[existing.id]} onClose=${() => setRejecting(false)} />`}
    ${confirmEl}`;
}
function RejectDialog({ ids, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [back, setBack] = useState('rejected');
  return html`<${Modal} title=${ids.length > 1 ? `Reject ${ids.length} questions` : 'Reject question'} onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn danger solid" disabled=${!note.trim()} onClick=${() => { attempt(() => S.setQuestionStatus(ids, back, note), back === 'rejected' ? 'Rejected' : 'Sent back to the author'); onDone && onDone(); onClose(); }}>Confirm</button>`}>
    <div class="stack sm"><label class="check"><input type="radio" checked=${back === 'draft'} onChange=${() => setBack('draft')} /> Send back for changes (returns to Draft)</label><label class="check"><input type="radio" checked=${back === 'rejected'} onChange=${() => setBack('rejected')} /> Reject</label></div>
    <${Field} label="Note for the author" id="rj-note"><textarea id="rj-note" class="input" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="e.g. Option C is also defensible; tighten the wording."></textarea></${Field}>
  </${Modal}>`;
}

// ---------- Review queue ----------
export function ReviewView({ params }) {
  const s = useStore();
  const { ws } = s;
  const [tab, setTab] = useState(params?.tab || 'pending');
  const [rej, setRej] = useState(null);
  const pending = ws.questions.filter((q) => q.status === 'pending').sort((a, b) => a.updatedAt - b.updatedAt);
  const reports = ws.reports.filter((r) => r.status === 'open');
  const approved = ws.questions.filter((q) => q.status === 'approved');
  const approve = (q, publish) => { const r = attempt(() => S.setQuestionStatus([q.id], publish ? 'published' : 'approved', publish ? 'Approved and published' : 'Approved')); if (r) r.skipped.length ? toast(`${q.code}: ${r.skipped[0].reason}`, 'bad') : toast(`${q.code} ${publish ? 'published' : 'approved'}`); };
  return html`<div class="page-head"><div><h1>Review queue</h1><p>Nothing reaches students until a reviewer approves it${isAdmin() ? ' and an administrator publishes it' : ''}. AI drafts stay labelled until reviewed.</p></div></div>
    <${Tabs} tabs=${[{ id: 'pending', label: 'Waiting for review', count: pending.length }, { id: 'reports', label: 'Student reports', count: reports.length }, isAdmin() && { id: 'approved', label: 'Approved, not published', count: approved.length }].filter(Boolean)} value=${tab} onChange=${setTab} />
    ${tab === 'pending' && (pending.length ? pending.map((q) => { const v = E.validateQuestion(q, { taxonomy: ws }); const sim = E.findSimilar(q, ws.questions, { threshold: 0.6, limit: 2 }); return html`<div class="card">
      <div class="row between"><div class="row tight"><span class="mono xs">${q.code}</span>${q.aiGenerated && html`<span class="pill mark">AI-generated draft</span>`}<${DiffPill} d=${q.difficulty} /><span class="xs muted">${D.topicPath(ws, q.topicId)} · ${E.QUESTION_TYPES[q.type].label} · submitted ${timeAgo(q.updatedAt)}</span></div></div>
      <${QuestionBody} item=${q} /><${QuestionOptions} item=${{ ...q, qid: q.id }} response=${{}} reveal=${E.hasAnswerKey(q)} />
      <${Explanation} item=${q} />
      <p class="xs muted">Source: ${q.source || 'not given'}</p>
      ${v.errors.map((x) => html`<${Notice} kind="bad">${x}</${Notice}>`)}${v.warnings.map((x) => html`<${Notice} kind="warn">${x}</${Notice}>`)}
      ${sim.map((x) => html`<${Notice} kind=${x.score >= E.DUPLICATE_THRESHOLD ? 'bad' : 'warn'}>${x.score >= E.DUPLICATE_THRESHOLD ? 'Likely duplicate' : 'Similar to'} <b class="mono">${x.code}</b> (${Math.round(x.score * 100)}% overlap): ${x.text}</${Notice}>`)}
      <div class="row"><button class="btn" onClick=${() => nav('admin-question', { id: q.id })}>${Icon('edit', 15)} Edit</button><button class="btn danger" onClick=${() => setRej(q.id)}>Reject or send back</button><span style="flex:1"></span>
        <button class="btn" disabled=${!v.ok} onClick=${() => approve(q, false)}>Approve</button>${isAdmin() && html`<button class="btn primary" disabled=${!v.ok} onClick=${() => approve(q, true)}>Approve & publish</button>`}</div>
    </div>`; }) : html`<div class="card"><${Empty} title="The queue is clear" /></div>`)}
    ${tab === 'reports' && (reports.length ? reports.map((r) => { const q = ws.questions.find((x) => x.id === r.qid); return html`<div class="card">
      <div class="row between"><div class="row tight"><span class="pill bad">${r.reason.replace('_', ' ')}</span><span class="xs muted">${ws.users.find((u) => u.id === r.userId)?.name} · ${timeAgo(r.createdAt)}</span></div><span class="mono xs">${q?.code}</span></div>
      ${r.message && html`<p class="small">"${r.message}"</p>`}
      ${q && html`<${QuestionBody} item=${q} /><${QuestionOptions} item=${{ ...q, qid: q.id }} response=${{}} reveal />`}
      <div class="row"><button class="btn" onClick=${() => nav('admin-question', { id: q.id })}>${Icon('edit', 15)} Edit question</button><span style="flex:1"></span><button class="btn" onClick=${() => attempt(() => S.resolveReport(r.id, 'dismissed'), 'Report dismissed')}>Dismiss</button><button class="btn primary" onClick=${() => attempt(() => S.resolveReport(r.id, 'resolved'), 'Marked as fixed')}>Mark fixed</button></div>
    </div>`; }) : html`<div class="card"><${Empty} title="No open reports" /></div>`)}
    ${tab === 'approved' && (approved.length ? html`<div class="card flush"><div class="row" style="padding:12px"><button class="btn primary" onClick=${() => { const r = attempt(() => S.setQuestionStatus(approved.map((q) => q.id), 'published', 'Bulk publish')); r && toast(`${r.done.length} published`); }}>Publish all ${approved.length}</button></div>
      <div class="table-wrap"><table class="tbl"><tbody>${approved.map((q) => html`<tr class="clickable" onClick=${() => nav('admin-question', { id: q.id })}><td class="mono xs">${q.code}</td><td class="small">${q.text}</td><td><${DiffPill} d=${q.difficulty} /></td></tr>`)}</tbody></table></div></div>` : html`<div class="card"><${Empty} title="Nothing waiting to be published" /></div>`)}
    ${rej && html`<${RejectDialog} ids=${[rej]} onClose=${() => setRej(null)} />`}`;
}

// ---------- Bulk import ----------
let xlsxPromise = null;
const loadScript = (src, global) => new Promise((res, rej) => { if (window[global]) return res(window[global]); const s = document.createElement('script'); s.src = src; s.onload = () => res(window[global]); s.onerror = () => rej(new Error('Could not load the file reader.')); document.head.appendChild(s); });
const TEMPLATE = [['Question', 'Type', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Explanation', 'Subject', 'Chapter', 'Topic', 'Difficulty', 'Exams', 'Source', 'Language'],
  ['Who built the Sun Temple at Konark?', 'single', 'Narasimhadeva I', 'Anantavarman Chodaganga', 'Raja Raja Chola', 'Krishnadeva Raya', 'A', 'The Eastern Ganga king Narasimhadeva I built it in the 13th century.', 'History', 'Medieval Indian History', 'Delhi Sultanate', 'Moderate', 'UPSC CSE; State PCS', 'Sample row', 'English']];
export function ImportView() {
  const s = useStore();
  const { ws } = s;
  const [file, setFile] = useState(null);
  const [table, setTable] = useState(null);
  const [map, setMap] = useState({});
  const [opts, setOpts] = useState({ status: 'pending', skipDuplicates: true });
  const [result, setResult] = useState(null);
  const [paste, setPaste] = useState('');
  const [confirm, confirmEl] = useConfirm();
  const load = (rows, name) => { if (rows.length < 2) return toast('The file needs a header row and at least one question.', 'bad'); setTable({ headers: rows[0].map(String), rows: rows.slice(1) }); setMap(E.guessMapping(rows[0].map(String))); setFile(name); setResult(null); };
  const onFile = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const XLSX = await (xlsxPromise = xlsxPromise || loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX'));
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        load(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }), f.name);
      } else if (/\.(csv|txt)$/i.test(f.name)) load(E.parseCSV(await f.text()), f.name);
      else toast('Upload a CSV or XLSX file. For PDF or Word notes, use AI drafting.', 'bad');
    } catch (x) { toast(x.message, 'bad'); }
    e.target.value = '';
  };
  const mapped = useMemo(() => table ? E.mapImportRows(table.rows, map, { taxonomy: ws, exams: ws.exams, existing: ws.questions }) : [], [table, map]);
  const counts = { ok: mapped.filter((r) => !r.errors.length && !r.duplicateOf).length, dup: mapped.filter((r) => !r.errors.length && r.duplicateOf).length, err: mapped.filter((r) => r.errors.length).length, warn: mapped.filter((r) => !r.errors.length && r.warnings.length).length };
  const missingRequired = E.IMPORT_FIELDS.filter((f) => f.required && (map[f.key] == null || map[f.key] === ''));
  const commit = () => { const b = attempt(() => S.commitImport(mapped, { status: opts.status, fileName: file, skipDuplicates: opts.skipDuplicates })); if (b) { setResult(b); setTable(null); } };
  const template = () => saveFile('prashnakosh-import-template.csv', E.toCSV(TEMPLATE));
  return html`<div class="page-head"><div><h1>Bulk import</h1><p>Upload a CSV or Excel sheet, map its columns, check every row, then import as drafts or straight into the review queue.</p></div><button class="btn" onClick=${template}>${Icon('download', 16)} CSV template</button></div>
    ${result && html`<${Notice} kind="good"><b>Imported ${plural(result.imported.length, 'question')}</b> from ${result.fileName} as ${E.STATUS_LABEL[opts.status]}. ${result.skipped.length ? `${result.skipped.length} row(s) skipped: ${result.skipped.slice(0, 4).map((x) => `row ${x.row} (${x.reason})`).join('; ')}${result.skipped.length > 4 ? '…' : ''}.` : ''} <button class="btn sm" onClick=${() => nav('admin-review')}>Open review queue</button></${Notice}>`}
    ${!table && html`<div class="grid g2">
      <div class="card"><h3>Upload a file</h3><input type="file" accept=".csv,.txt,.xlsx,.xls" onChange=${onFile} aria-label="Choose CSV or Excel file" />
        <p class="xs muted">Columns: Question, Type, Option A–D, Answer (letter, or several letters for multiple-correct), Explanation, Subject, Chapter, Topic, Difficulty, Exams, Source, Language. Subject, chapter and topic names must match the taxonomy.</p></div>
      <div class="card"><h3>Or paste CSV</h3><textarea class="input" aria-label="Paste CSV" value=${paste} onInput=${(e) => setPaste(e.target.value)} placeholder=${E.toCSV(TEMPLATE)}></textarea><button class="btn" style="justify-self:start" disabled=${!paste.trim()} onClick=${() => load(E.parseCSV(paste), 'pasted CSV')}>Preview</button></div>
    </div>`}
    ${table && html`<div class="card"><div class="card-head"><div><h3>${file}</h3><p>${table.rows.length} rows</p></div><button class="btn sm ghost" onClick=${() => setTable(null)}>Choose another file</button></div>
      <h4>Column mapping</h4>
      <div class="grid g4">${E.IMPORT_FIELDS.map((f) => html`<${Field} label=${`${f.label}${f.required ? ' *' : ''}`} id=${'map-' + f.key}><select id=${'map-' + f.key} class="input ${f.required && (map[f.key] == null || map[f.key] === '') ? 'invalid' : ''}" value=${map[f.key] ?? ''} onChange=${(e) => setMap({ ...map, [f.key]: e.target.value === '' ? null : Number(e.target.value) })}><option value="">(not mapped)</option>${table.headers.map((h, i) => html`<option value=${i}>${h || `Column ${i + 1}`}</option>`)}</select></${Field}>`)}</div>
      ${missingRequired.length > 0 && html`<${Notice} kind="bad">Map the required columns: ${missingRequired.map((f) => f.label).join(', ')}.</${Notice}>`}
    </div>
    <div class="stats"><div class="stat"><span class="k">Ready</span><span class="v" style="color:var(--good)">${counts.ok}</span><span class="s">${counts.warn} with warnings</span></div><div class="stat"><span class="k">Duplicates</span><span class="v" style="color:var(--warn)">${counts.dup}</span></div><div class="stat"><span class="k">Errors</span><span class="v" style="color:var(--bad)">${counts.err}</span><span class="s">will be skipped</span></div></div>
    <div class="card flush"><div class="table-wrap" style="max-height:440px"><table class="tbl"><thead><tr><th>Row</th><th>Question</th><th>Classification</th><th>Check</th></tr></thead><tbody>
      ${mapped.map((r) => html`<tr><td class="num">${r.row}</td><td class="small" style="min-width:220px">${r.question.text || html`<i class="muted">empty</i>`}</td><td class="xs">${r.question.topicId ? D.topicPath(ws, r.question.topicId) : '—'}${r.question.difficulty ? ` · ${E.DIFFICULTY_LABEL[r.question.difficulty]}` : ''}</td>
        <td class="xs" style="min-width:200px">${r.errors.length ? r.errors.map((e) => html`<div style="color:var(--bad)">${e}</div>`) : r.duplicateOf ? html`<span class="pill warn">${r.duplicateOf.where === 'bank' ? `Duplicate of ${r.duplicateOf.code}` : `Same as row ${r.duplicateOf.row}`}</span>` : html`<span class="pill good">OK</span>`}${!r.errors.length && r.warnings.map((w) => html`<div class="muted">${w}</div>`)}</td></tr>`)}
    </tbody></table></div>
    <div class="sticky-cta"><div class="row"><label class="small">Import as <select class="input" style="width:auto;display:inline-block" value=${opts.status} onChange=${(e) => setOpts({ ...opts, status: e.target.value })}><option value="pending">Pending review</option><option value="draft">Draft</option></select></label><label class="check small"><input type="checkbox" checked=${opts.skipDuplicates} onChange=${(e) => setOpts({ ...opts, skipDuplicates: e.target.checked })} /> Skip duplicates</label></div>
      <button class="btn primary" disabled=${missingRequired.length > 0 || !(counts.ok + (opts.skipDuplicates ? 0 : counts.dup))} onClick=${commit}>Import ${counts.ok + (opts.skipDuplicates ? 0 : counts.dup)} questions</button></div></div>`}
    <div class="card flush"><div class="card-head" style="padding:16px 18px 8px"><div><h3>Import history</h3><p>Rolling back removes a batch's questions. Any already used in a paper are archived instead, so past attempts stay intact.</p></div></div>
      ${ws.importBatches.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>File</th><th>When</th><th class="r">Imported</th><th class="r">Skipped</th><th>Status</th><th></th></tr></thead><tbody>
        ${ws.importBatches.map((b) => html`<tr><td class="small">${b.fileName}</td><td class="small">${timeAgo(b.at)}</td><td class="r num">${b.imported.length}</td><td class="r num">${b.skipped.length}</td><td><span class="pill ${b.status === 'rolled_back' ? '' : 'good'}">${b.status === 'rolled_back' ? 'Rolled back' : 'Imported'}</span></td>
          <td class="r">${b.status !== 'rolled_back' && html`<button class="btn sm danger" onClick=${async () => { if (await confirm({ title: 'Roll back this import?', body: `Removes the ${b.imported.length} questions from ${b.fileName}.`, ok: 'Roll back', danger: true })) { const r = attempt(() => S.rollbackImport(b.id)); r && toast(`${r.removed} removed, ${r.archived} archived`); } }}>Roll back</button>`}</td></tr>`)}
      </tbody></table></div>` : html`<${Empty} title="No imports yet" />`}</div>
    ${confirmEl}`;
}

// ---------- AI drafting ----------
let pdfjsPromise = null, mammothPromise = null;
async function extractText(file) {
  if (/\.(txt|md|csv)$/i.test(file.name)) return file.text();
  if (/\.docx$/i.test(file.name)) {
    const m = await (mammothPromise = mammothPromise || loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', 'mammoth'));
    return (await m.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  if (/\.pdf$/i.test(file.name)) {
    const lib = await (pdfjsPromise = pdfjsPromise || loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib').then(async (p) => { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', 'pdfjsWorker'); return p; }));
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = '';
    for (let i = 1; i <= Math.min(doc.numPages, 30); i++) { const c = await (await doc.getPage(i)).getTextContent(); out += c.items.map((x) => x.str).join(' ') + '\n'; }
    return out;
  }
  throw new Error('Use a PDF, Word (.docx) or text file.');
}
export function AIDraftView() {
  const s = useStore();
  const { ws } = s;
  const [src, setSrc] = useState('');
  const [srcName, setSrcName] = useState('');
  const [cfg, setCfg] = useState({ subjectId: 'sub_hist', chapterId: '', topicId: '', count: 5, difficulty: 'moderate', type: 'single', exams: ['upsc'] });
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [err, setErr] = useState('');
  const sample = s.caps.sample;
  const chapters = ws.chapters.filter((c) => c.subjectId === cfg.subjectId && !c.archived);
  const topics = ws.topics.filter((t) => t.chapterId === cfg.chapterId && !t.archived);
  const onFile = async (e) => { const f = e.target.files[0]; if (!f) return; setErr(''); try { const t = await extractText(f); setSrc(t.slice(0, 24000)); setSrcName(f.name); if (t.length > 24000) toast('Only the first 24,000 characters are used.'); } catch (x) { setErr(x.message + ' You can paste the text instead.'); } e.target.value = ''; };
  const run = async () => {
    setErr(''); setBusy(true); setDrafts([]);
    try {
      const topicName = D.topicPath(ws, cfg.topicId);
      const shape = cfg.type === 'statement' ? '{"text": "Consider the following statements about …:", "statements": [string, string], "options": ["1 only","2 only","Both 1 and 2","Neither 1 nor 2"], "answerIndex": 0-3, "explanation": string, "concept": string}' : '{"text": string, "options": [4 strings], "answerIndex": 0-3, "explanation": string, "optionNotes": [why each wrong option is wrong, or "" for the correct one], "concept": string}';
      const out = await sample.json(`You draft original multiple-choice questions for Indian competitive examinations (UPSC, SSC, State PCS). Use ONLY facts stated in the source material below. Do not copy sentences verbatim, do not invent sources or exam years, and do not claim any question appeared in a past paper. Topic: ${topicName}. Difficulty: ${cfg.difficulty}. Write ${cfg.count} questions. If the material does not support ${cfg.count} good questions, write fewer.\nReturn JSON {"questions": [${shape}]}.\n\nSOURCE MATERIAL:\n${src}`, { modelTier: 'default' });
      const list = (out.questions || []).filter((x) => x && x.text && Array.isArray(x.options) && x.options.length >= 2);
      if (!list.length) throw new Error('No usable questions came back. Try more source text.');
      setDrafts(list); setSel(new Set(list.map((_, i) => i)));
    } catch (x) { setErr(x?.code === 'rate_limited' ? 'Too many AI requests just now. Wait a minute and try again.' : x?.message || 'The AI request failed.'); }
    setBusy(false);
  };
  const send = () => {
    const ch = ws.chapters.find((c) => c.id === cfg.chapterId);
    let n = 0;
    drafts.forEach((d, i) => {
      if (!sel.has(i)) return;
      const opts = d.options.slice(0, 6).map((t, j) => ({ id: 'abcdef'[j], text: String(t) }));
      const notes = {}; (d.optionNotes || []).forEach((t, j) => { if (t && j !== d.answerIndex) notes['abcdef'[j]] = String(t); });
      const q = S.newQuestionDraft({ type: cfg.type, text: d.text, statements: d.statements, ask: cfg.type === 'statement' ? 'Which of the statements given above is/are correct?' : undefined, options: opts, correct: [opts[d.answerIndex]?.id].filter(Boolean), explanation: d.explanation || '', optionNotes: notes, concept: d.concept || '', subjectId: ch.subjectId, chapterId: ch.id, topicId: cfg.topicId, difficulty: cfg.difficulty, examTags: cfg.exams, provenance: 'ai_draft', aiGenerated: true, source: `AI draft from ${srcName || 'pasted notes'} (verify facts before approval)` });
      if (attempt(() => S.saveQuestion(q, { status: 'pending' }))) n++;
    });
    toast(`${n} AI draft(s) sent to the review queue`);
    setDrafts([]); setSel(new Set());
  };
  return html`<div class="page-head"><div><h1>AI drafting</h1><p>Turn study material into draft questions. AI never publishes: every draft is labelled and goes to the review queue, where a person checks facts and the answer key.</p></div></div>
    ${!sample && html`<${Notice} kind="warn">AI drafting needs the Claude connection, which is not available in this view. Open the app from claude.ai to use it. Everything else works without it.</${Notice}>`}
    <div class="grid g-side">
      <div class="card"><h3>Source material</h3>
        <div class="row"><input type="file" accept=".pdf,.docx,.txt,.md" onChange=${onFile} aria-label="Upload PDF, Word or text file" />${srcName && html`<span class="pill info">${srcName}</span>`}</div>
        <textarea class="input" style="min-height:240px" aria-label="Source text" value=${src} onInput=${(e) => { setSrc(e.target.value); setSrcName(''); }} placeholder="Paste chapter notes or a textbook section here, or upload a PDF, Word or text file."></textarea>
        <p class="xs muted">${src.length.toLocaleString('en-IN')} characters. Use material you are licensed to use.</p></div>
      <div class="card"><h3>Draft settings</h3>
        <${Field} label="Subject" id="ai-sub"><select id="ai-sub" class="input" value=${cfg.subjectId} onChange=${(e) => setCfg({ ...cfg, subjectId: e.target.value, chapterId: '', topicId: '' })}>${ws.subjects.filter((x) => !x.archived).map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select></${Field}>
        <${Field} label="Chapter" id="ai-ch"><select id="ai-ch" class="input" value=${cfg.chapterId} onChange=${(e) => setCfg({ ...cfg, chapterId: e.target.value, topicId: '' })}><option value="">Choose…</option>${chapters.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select></${Field}>
        <${Field} label="Topic" id="ai-tp"><select id="ai-tp" class="input" value=${cfg.topicId} onChange=${(e) => setCfg({ ...cfg, topicId: e.target.value })}><option value="">Choose…</option>${topics.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select></${Field}>
        <div class="field"><span class="label">Format</span><${Chips} options=${[{ id: 'single', label: 'Single-correct' }, { id: 'statement', label: 'Statement-based' }]} value=${cfg.type} onChange=${(t) => setCfg({ ...cfg, type: t })} /></div>
        <div class="field"><span class="label">Difficulty</span><${Chips} options=${E.DIFFICULTIES.map((d) => ({ id: d, label: E.DIFFICULTY_LABEL[d] }))} value=${cfg.difficulty} onChange=${(d) => setCfg({ ...cfg, difficulty: d })} /></div>
        <div class="field"><span class="label">How many</span><${Chips} options=${[3, 5, 8, 10].map((n) => ({ id: n, label: String(n) }))} value=${cfg.count} onChange=${(n) => setCfg({ ...cfg, count: n })} /></div>
        <div class="field"><span class="label">Exam tags</span><${Chips} multi options=${ws.exams.map((e) => ({ id: e.id, label: e.short }))} value=${cfg.exams} onChange=${(x) => setCfg({ ...cfg, exams: x })} /></div>
        <button class="btn primary" disabled=${!sample || busy || src.trim().length < 200 || !cfg.topicId} onClick=${run}>${Icon('sparkles', 16)} ${busy ? 'Drafting…' : 'Draft questions'}</button>
        ${src.trim().length < 200 && html`<p class="xs muted">Add at least 200 characters of source material.</p>`}
        ${err && html`<${Notice} kind="bad">${err}</${Notice}>`}
      </div>
    </div>
    ${drafts.length > 0 && html`<div class="stack"><div class="row between"><h2>${drafts.length} drafts</h2><button class="btn primary" disabled=${!sel.size} onClick=${send}>Send ${sel.size} to review queue</button></div>
      ${drafts.map((d, i) => html`<div class="card"><label class="check"><input type="checkbox" checked=${sel.has(i)} onChange=${() => { const n = new Set(sel); n.has(i) ? n.delete(i) : n.add(i); setSel(n); }} /> <span class="pill mark">AI-generated draft</span></label>
        <${QuestionBody} item=${{ text: d.text, statements: d.statements, ask: cfg.type === 'statement' ? 'Which of the statements given above is/are correct?' : null }} />
        <${QuestionOptions} item=${{ qid: 'd' + i, type: 'single', options: d.options.map((t, j) => ({ id: 'abcdef'[j], text: t })), correct: ['abcdef'[d.answerIndex]] }} response=${{}} reveal />
        <p class="small muted">${d.explanation}</p></div>`)}</div>`}`;
}
