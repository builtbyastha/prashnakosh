// PDF and CSV exports. jsPDF is loaded on demand from cdnjs.
import * as E from '../engine.js';
import * as D from '../domain.js';
import { store } from '../store.js';
import { toast } from './core.js';

let jsPdfPromise = null;
function loadJsPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  if (!jsPdfPromise) jsPdfPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => res(window.jspdf); s.onerror = () => { jsPdfPromise = null; rej(new Error('Could not load the PDF library.')); };
    document.head.appendChild(s);
  });
  return jsPdfPromise;
}
// Built-in PDF fonts cover Latin-1 only.
const clean = (t) => String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/›/g, '>').replace(/₹/g, 'Rs ').replace(/…/g, '...').replace(/[ऀ-ॿ]+(\s+[ऀ-ॿ]+)*/g, '[Hindi text: view in the app]').replace(/[^\x00-\xFF]/g, '');

// Inside Claude the downloads capability is used; on a normal web host (e.g. GitHub Pages) a plain browser download.
export async function saveFile(filename, data) { return save(filename, data); }
async function save(filename, data) {
  const dl = store.caps.downloads;
  const inClaude = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function';
  if (!dl && !inClaude) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.csv') ? 'text/csv' : 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
  if (!dl) { toast('Downloads are not available in this view.', 'bad'); return false; }
  try { await dl.save({ filename, data }); return true; }
  catch (e) { if (e?.code !== 'declined') toast(e?.message || 'The download did not complete.', 'bad'); return false; }
}

function writer(doc) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const line = (text, { size = 10, bold = false, gap = 4, color = 20, indent = 0 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
    const lines = doc.splitTextToSize(clean(text), W - M * 2 - indent);
    for (const l of lines) { if (y > H - M) { doc.addPage(); y = M; } doc.text(l, M + indent, y); y += size * 1.35; }
    y += gap;
  };
  const rule = () => { if (y > H - M) { doc.addPage(); y = M; } doc.setDrawColor(210); doc.line(M, y, W - M, y); y += 12; };
  const footer = (label) => { const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120); doc.text(clean(`${label} · page ${i} of ${n}`), M, H - 24); } };
  return { line, rule, footer, gapY: (n) => (y += n) };
}
function itemLines(w, it, n, { answers, response }) {
  w.line(`Q${n}. ${it.type === 'assertion_reason' ? it.text : it.text || ''}`, { bold: true, size: 10.5, gap: 2 });
  if (it.passage) w.line(it.passage, { size: 9.5, indent: 12, color: 70 });
  if (it.assertion) { w.line(`Assertion (A): ${it.assertion}`, { indent: 12, gap: 0 }); w.line(`Reason (R): ${it.reason}`, { indent: 12 }); }
  if (it.listA) it.listA.forEach((a, i) => w.line(`${a}    ${it.listB[i] || ''}`, { indent: 12, gap: 0 }));
  if (it.statements) it.statements.forEach((s, i) => w.line(`${i + 1}. ${s}`, { indent: 12, gap: 0 }));
  if (it.ask) w.line(it.ask, { indent: 0, gap: 2 });
  if (it.image) w.line('[Diagram: view in the app]', { indent: 12, color: 110 });
  (it.options || []).forEach((o, i) => w.line(`(${'abcdefgh'[i]}) ${o.text}${answers && it.correct.includes(o.id) ? '   [correct]' : ''}`, { indent: 12, gap: 0 }));
  if (answers) {
    const k = E.typeKind(it.type);
    if (k === 'numeric') w.line(`Answer: ${it.correct.value}`, { indent: 12, gap: 0 });
    if (k === 'text') w.line(`Answer: ${it.correct.join(' / ')}`, { indent: 12, gap: 0 });
    if (response) { const st = E.evaluate(it, response); const a = response.answer; const shown = Array.isArray(a) ? a.map((x) => 'abcdefgh'[it.options.findIndex((o) => o.id === x)]).join(', ') : it.options?.length ? (a ? 'abcdefgh'[it.options.findIndex((o) => o.id === a)] : '-') : a ?? '-'; w.line(`Your answer: ${shown || '-'} (${st})`, { indent: 12, gap: 0, color: st === 'correct' ? 30 : 90 }); }
    if (it.explanation) w.line(`Explanation: ${it.explanation}`, { indent: 12, size: 9, color: 70 });
  }
  w.gapY(6);
}

export async function downloadPaperPdf(paper, { answers = false } = {}) {
  try {
    const { jsPDF } = await loadJsPdf();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const w = writer(doc);
    w.line(paper.title, { size: 16, bold: true });
    w.line(`${paper.code} · ${paper.questionCount} questions · ${E.round2(paper.maxMarks)} marks · ${paper.durationMin ? paper.durationMin + ' minutes' : 'untimed'}`, { color: 90 });
    w.line('Practice paper generated from the question bank. Not an official examination paper.', { size: 8.5, color: 120 });
    w.rule();
    let n = 0;
    for (const sec of paper.sections) { if (paper.sections.length > 1) w.line(sec.name, { size: 12, bold: true }); sec.items.forEach((it) => itemLines(w, it, ++n, { answers })); }
    w.footer(`${paper.code} ${answers ? 'with answer key' : ''}`);
    return save(`${paper.code}${answers ? '-answer-key' : ''}.pdf`, doc.output('blob'));
  } catch (e) { toast(e.message, 'bad'); return false; }
}

export async function downloadResultPdf(attempt, paper, user) {
  try {
    const { jsPDF } = await loadJsPdf();
    const ws = store.ws;
    const r = attempt.result;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const w = writer(doc);
    w.line('Result report', { size: 16, bold: true });
    w.line(`${paper.title} (${paper.code})`, { size: 11 });
    w.line(`${user.name} · submitted ${new Date(attempt.submittedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { color: 90 });
    w.rule();
    w.line(`Score: ${r.score} / ${r.max}  (${r.percentage}%)`, { size: 13, bold: true });
    w.line(`Correct ${r.correct} · Incorrect ${r.incorrect} · Unattempted ${r.unattempted} · Negative marks ${r.negativeMarks} · Accuracy ${r.accuracy ?? '-'}% · Time ${E.fmtDuration(r.timeMs)}`);
    w.rule();
    const table = (title, group) => { w.line(title, { bold: true, size: 11 }); Object.values(group).forEach((g) => w.line(`${D.taxName(ws, g.key) || g.key}: ${g.score}/${g.max} · ${g.correct} correct, ${g.incorrect} wrong, ${g.unattempted} blank`, { indent: 12, gap: 0 })); w.gapY(8); };
    table('By subject', r.bySubject); table('By chapter', r.byChapter);
    w.line('By difficulty', { bold: true, size: 11 }); E.DIFFICULTIES.filter((d) => r.byDifficulty[d]).forEach((d) => { const g = r.byDifficulty[d]; w.line(`${E.DIFFICULTY_LABEL[d]}: ${g.correct}/${g.total} correct`, { indent: 12, gap: 0 }); });
    w.gapY(8); w.rule();
    w.line('Question review', { bold: true, size: 12 });
    let n = 0; for (const sec of paper.sections) sec.items.forEach((it) => itemLines(w, it, ++n, { answers: true, response: attempt.responses[it.qid] || {} }));
    w.footer(`${paper.code} result · ${user.name}`);
    return save(`${paper.code}-result.pdf`, doc.output('blob'));
  } catch (e) { toast(e.message, 'bad'); return false; }
}

export function downloadResultCsv(attempt, paper) {
  const ws = store.ws;
  const rows = [['#', 'Question code', 'Subject', 'Chapter', 'Topic', 'Difficulty', 'Status', 'Marks', 'Time (s)']];
  attempt.result.rows.forEach((r, i) => { const it = E.paperItems(paper).find((x) => x.qid === r.qid); rows.push([i + 1, it?.code, D.taxName(ws, r.subjectId), D.taxName(ws, r.chapterId), D.taxName(ws, r.topicId), r.difficulty, r.status, r.marks, Math.round(r.timeMs / 1000)]); });
  return save(`${paper.code}-result.csv`, E.toCSV(rows));
}
