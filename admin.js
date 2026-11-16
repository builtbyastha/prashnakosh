import { html, useState, useMemo, useStore, nav, Icon, Notice, Stat, Empty, Tabs, BarList, Columns, Modal, Field, StatusPill, Pager, toast, attempt, fmtDate, fmtDateTime, fmtShort, fmtPct, fmtINR, timeAgo, plural, initials, useConfirm, DiffPill } from './core.js';
import * as E from '../engine.js';
import * as D from '../domain.js';
import * as S from '../store.js';
import { runSelfTests } from '../selftest.js';

// ---------- Control centre ----------
export function AdminOverview() {
  const s = useStore();
  const { ws, user } = s;
  const isAdmin = user.role === 'admin';
  const qs = ws.questions;
  const by = (st) => qs.filter((q) => q.status === st).length;
  const health = useMemo(() => E.bankHealth(qs, ws, { testSize: ws.settings.healthTestSize || 25, testsWanted: ws.settings.healthTests || 3 }), [s.rev]);
  const alerts = health.filter((h) => h.level !== 'healthy');
  const students = ws.users.filter((u) => u.role === 'student');
  const week = Date.now() - 7 * 86400000;
  const done = ws.attempts.filter((a) => a.status === 'submitted');
  const active = new Set(ws.attempts.filter((a) => a.startedAt > week).map((a) => a.userId));
  const pub = qs.filter((q) => q.status === 'published');
  const openReports = ws.reports.filter((r) => r.status === 'open');
  const openUpgrades = ws.upgradeRequests.filter((r) => r.status === 'open');
  return html`<div class="page-head"><div><h1>${isAdmin ? 'Control centre' : 'Content overview'}</h1><p>Question bank, examinations and platform activity at a glance.</p></div>
      <div class="row tight"><button class="btn" onClick=${() => nav('admin-question', { id: null })}>${Icon('plus')} New question</button>${isAdmin && html`<button class="btn primary" onClick=${() => nav('admin-papers', { create: true })}>${Icon('file')} Create official mock</button>`}</div></div>
    ${ws.meta?.sample && html`<${Notice} kind="info">This workspace holds <b>sample content</b>: original practice questions and sample exam configurations, labelled as such. None of it is an official previous-year paper or a verified current pattern.</${Notice}>`}
    <div class="stats">
      <${Stat} k="Published questions" v=${by('published')} s=${`${qs.length} in the bank`} />
      <${Stat} k="Pending review" v=${by('pending')} s=${`${by('approved')} approved, not yet published`} />
      <${Stat} k="Drafts" v=${by('draft')} s=${`${by('rejected')} rejected · ${by('archived')} archived`} />
      <${Stat} k="Subjects · chapters · topics" v=${`${ws.subjects.filter((x) => !x.archived).length} · ${ws.chapters.filter((x) => !x.archived).length} · ${ws.topics.filter((x) => !x.archived).length}`} />
      ${isAdmin && html`<${Stat} k="Students" v=${students.length} s=${`${[...active].filter((id) => students.some((u) => u.id === id)).length} active this week`} />`}
      ${isAdmin && html`<${Stat} k="Tests completed" v=${done.length} s=${`${done.filter((a) => a.submittedAt > week).length} this week`} />`}
    </div>
    <div class="grid g-side">
      <div class="card flush"><div class="card-head" style="padding:16px 18px 8px"><div><h3>Question bank health</h3><p>Healthy = enough published questions for ${ws.settings.healthTests || 3} non-overlapping ${ws.settings.healthTestSize || 25}-question tests per chapter</p></div><span class="pill ${alerts.length ? 'warn' : 'good'}">${alerts.length ? `${alerts.length} need attention` : 'All healthy'}</span></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Chapter</th><th class="r">Published</th><th class="desktop-only">By difficulty</th><th class="r desktop-only">Pending</th><th>Status</th></tr></thead><tbody>
          ${health.sort((a, b) => a.published - b.published).map((h) => html`<tr class="clickable" onClick=${() => nav('admin-questions', { chapterId: h.chapterId })}><td><b class="small">${h.name}</b><div class="xs muted">${D.taxName(ws, h.subjectId)}</div></td><td class="r num">${h.published}<span class="xs muted"> / ${h.need}</span></td>
            <td class="desktop-only xs muted nowrap">${E.DIFFICULTIES.map((d) => `${E.DIFFICULTY_LABEL[d][0]} ${h.byDifficulty[d]}`).join(' · ')}</td><td class="r num desktop-only">${h.pending || ''}</td>
            <td><span class="pill ${h.level === 'healthy' ? 'good' : h.level === 'low' ? 'warn' : 'bad'}">${h.level === 'healthy' ? 'Healthy' : h.level === 'low' ? 'Low' : h.published === 0 ? 'Empty' : 'Critical'}</span></td></tr>`)}
        </tbody></table></div></div>
      <div class="stack lg">
        <div class="card"><div class="card-head"><h3>Needs action</h3></div>
          <div class="stack">
            <button class="row between nav-item" onClick=${() => nav('admin-review')}><span>${Icon('check')} Questions waiting for review</span><span class="pill warn">${by('pending')}</span></button>
            <button class="row between nav-item" onClick=${() => nav('admin-review', { tab: 'reports' })}><span>${Icon('flag')} Student reports</span><span class="pill ${openReports.length ? 'bad' : ''}">${openReports.length}</span></button>
            ${isAdmin && html`<button class="row between nav-item" onClick=${() => nav('admin-questions', { status: 'approved' })}><span>${Icon('eye')} Approved, ready to publish</span><span class="pill info">${by('approved')}</span></button>`}
            ${isAdmin && html`<button class="row between nav-item" onClick=${() => nav('admin-users', { tab: 'requests' })}><span>${Icon('rupee')} Plan upgrade requests</span><span class="pill">${openUpgrades.length}</span></button>`}
          </div></div>
        <div class="card"><div class="card-head"><h3>Published by difficulty</h3></div>
          <${BarList} max=${pub.length || 1} format=${(v) => String(v)} items=${E.DIFFICULTIES.map((d) => ({ label: E.DIFFICULTY_LABEL[d], value: pub.filter((q) => q.difficulty === d).length }))} /></div>
        <div class="card"><div class="card-head"><h3>Published by format</h3></div>
          <${BarList} max=${pub.length || 1} format=${(v) => String(v)} items=${Object.keys(E.QUESTION_TYPES).map((t) => ({ label: E.QUESTION_TYPES[t].label, value: pub.filter((q) => q.type === t).length })).filter((x) => x.value).sort((a, b) => b.value - a.value)} /></div>
      </div>
    </div>
    ${isAdmin && html`<div class="card"><div class="card-head"><h3>Recent administrative activity</h3><button class="btn sm ghost" onClick=${() => nav('admin-audit')}>Audit log ${Icon('right', 15)}</button></div>
      ${ws.audit.slice(0, 6).map((a) => html`<div class="row between small"><span><span class="mono xs muted">${a.action}</span> ${a.detail}</span><span class="xs muted nowrap">${timeAgo(a.at)}</span></div>`)}</div>`}`;
}

// ---------- Users ----------
export function UsersView({ params }) {
  const s = useStore();
  const { ws, user } = s;
  const [tab, setTab] = useState(params?.tab || 'users');
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [edit, setEdit] = useState(null);
  const [page, setPage] = useState(1);
  const list = ws.users.filter((u) => (!role || u.role === role) && (!q || (u.name + u.email).toLowerCase().includes(q.toLowerCase())));
  const pages = Math.max(1, Math.ceil(list.length / 20));
  const reqs = ws.upgradeRequests;
  const statsFor = (u) => { const at = ws.attempts.filter((a) => a.userId === u.id); return { n: at.filter((a) => a.status === 'submitted').length, last: Math.max(0, ...at.map((a) => a.startedAt), u.lastLoginAt || 0) }; };
  return html`<div class="page-head"><div><h1>Users</h1><p>Accounts, roles, plans and upgrade requests.</p></div></div>
    <${Tabs} tabs=${[{ id: 'users', label: 'All users', count: ws.users.length }, { id: 'requests', label: 'Upgrade requests', count: reqs.filter((r) => r.status === 'open').length }]} value=${tab} onChange=${setTab} />
    ${tab === 'users' ? html`<div class="card flush">
      <div class="row" style="padding:12px"><input class="input" style="max-width:320px" placeholder="Search name or email" aria-label="Search users" value=${q} onInput=${(e) => { setQ(e.target.value); setPage(1); }} />
        <select class="input" style="width:auto" aria-label="Filter by role" value=${role} onChange=${(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option><option value="student">Students</option><option value="reviewer">Reviewers</option><option value="admin">Administrators</option></select></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Plan</th><th class="r desktop-only">Tests</th><th class="desktop-only">Last active</th><th>Status</th></tr></thead><tbody>
        ${list.slice((page - 1) * 20, page * 20).map((u) => { const st = statsFor(u); const exp = u.planExpiry && Date.now() > u.planExpiry; return html`<tr class="clickable" onClick=${() => setEdit(u)}>
          <td><div class="row nowrap tight"><span class="avatar" style="width:28px;height:28px;font-size:.7rem">${initials(u.name)}</span><div><b class="small">${u.name}</b><div class="xs muted">${u.email}</div></div></div></td>
          <td class="small">${u.role === 'admin' ? 'Administrator' : u.role === 'reviewer' ? 'Reviewer' : 'Student'}</td>
          <td class="small">${u.role === 'student' ? html`${ws.plans.find((p) => p.id === u.plan)?.name}${u.planExpiry ? html`<div class="xs ${exp ? '' : 'muted'}" style=${exp ? 'color:var(--bad)' : ''}>${exp ? 'expired' : 'until'} ${fmtShort(u.planExpiry)}</div>` : ''}` : '—'}</td>
          <td class="r num desktop-only">${st.n}</td><td class="small desktop-only">${st.last ? timeAgo(st.last) : '—'}</td>
          <td><span class="pill ${u.active ? 'good' : 'bad'}">${u.active ? 'Active' : 'Deactivated'}</span></td></tr>`; })}
      </tbody></table></div><${Pager} page=${page} pages=${pages} total=${list.length} onPage=${setPage} label="users" /></div>`
    : html`<div class="card flush">${reqs.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Student</th><th>Plan</th><th class="r">Price</th><th>Requested</th><th>Status</th><th></th></tr></thead><tbody>
        ${reqs.map((r) => { const u = ws.users.find((x) => x.id === r.userId); return html`<tr><td><b class="small">${u?.name}</b><div class="xs muted">${u?.email}</div></td><td>${ws.plans.find((p) => p.id === r.planId)?.name}</td><td class="r num">${fmtINR(r.finalPrice)}${r.coupon ? html`<div class="xs muted">${r.coupon}</div>` : ''}</td><td class="small">${fmtDate(r.createdAt)}</td><td><span class="pill ${r.status === 'granted' ? 'good' : r.status === 'declined' ? 'bad' : 'warn'}">${r.status}</span></td>
          <td class="r nowrap">${r.status === 'open' && html`<button class="btn sm" onClick=${() => attempt(() => S.resolveUpgrade(r.id, false), 'Request declined')}>Decline</button> <button class="btn sm primary" onClick=${() => attempt(() => S.resolveUpgrade(r.id, true, 30), 'Plan granted for 30 days')}>Grant 30 days</button>`}</td></tr>`; })}
      </tbody></table></div>` : html`<${Empty} title="No upgrade requests" />`}
      <div style="padding:12px 16px"><p class="xs muted">Granting a plan here is a manual entitlement change. No payment is captured; it is recorded in the audit log as a manual grant.</p></div></div>`}
    ${edit && html`<${UserEdit} u=${edit} onClose=${() => setEdit(null)} />`}`;
}
function UserEdit({ u, onClose }) {
  const s = useStore();
  const [f, setF] = useState({ role: u.role, plan: u.plan, planExpiry: u.planExpiry ? new Date(u.planExpiry).toISOString().slice(0, 10) : '', active: u.active });
  const save = () => { if (attempt(() => S.updateUser(u.id, { role: f.role, plan: f.plan, planExpiry: f.planExpiry ? Date.parse(f.planExpiry + 'T23:59:59+05:30') : null, active: f.active }), 'User updated') !== undefined || true) onClose(); };
  return html`<${Modal} title=${u.name} sub=${u.email} onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Save</button>`}>
    <div class="grid g2">
      <${Field} label="Role" id="u-role"><select id="u-role" class="input" value=${f.role} onChange=${(e) => setF({ ...f, role: e.target.value })}><option value="student">Student</option><option value="reviewer">Content reviewer</option><option value="admin">Administrator</option></select></${Field}>
      <${Field} label="Plan" id="u-plan"><select id="u-plan" class="input" value=${f.plan} onChange=${(e) => setF({ ...f, plan: e.target.value })}>${s.ws.plans.map((p) => html`<option value=${p.id}>${p.name}</option>`)}</select></${Field}>
      <${Field} label="Plan expiry" id="u-exp" hint="Leave empty for no expiry"><input id="u-exp" class="input" type="date" value=${f.planExpiry} onInput=${(e) => setF({ ...f, planExpiry: e.target.value })} /></${Field}>
    </div>
    <label class="check"><input type="checkbox" checked=${f.active} onChange=${(e) => setF({ ...f, active: e.target.checked })} /> Account is active</label>
    <p class="xs muted">Joined ${fmtDate(u.createdAt)}${u.lastLoginAt ? ` · last sign-in ${fmtDateTime(u.lastLoginAt)}` : ''}</p>
  </${Modal}>`;
}

// ---------- Analytics ----------
export function AnalyticsView() {
  const s = useStore();
  const { ws } = s;
  const done = ws.attempts.filter((a) => a.status === 'submitted');
  const days = [...Array(14)].map((_, i) => { const t = Date.now() - (13 - i) * 86400000; const k = E.dayKey(t); return { label: fmtShort(t).split(' ')[0], value: done.filter((a) => E.dayKey(a.submittedAt) === k).length }; });
  const byExam = ws.exams.map((e) => { const at = done.filter((a) => ws.papers.find((p) => p.id === a.paperId)?.examId === e.id); return { e, n: at.length, avg: at.length ? at.reduce((t, a) => t + a.result.percentage, 0) / at.length : null }; });
  const subj = {}; const chap = {};
  done.forEach((a) => a.result.rows.forEach((r) => { subj[r.subjectId] = (subj[r.subjectId] || 0) + 1; chap[r.chapterId] = (chap[r.chapterId] || 0) + 1; }));
  const qa = useMemo(() => E.questionAnalytics(ws.attempts).filter((x) => x.correct + x.incorrect >= 3).sort((a, b) => b.errorRate - a.errorRate).slice(0, 12), [s.rev]);
  const planMix = ws.plans.map((p) => ({ p, n: ws.users.filter((u) => u.role === 'student' && E.effectivePlan(u, ws.plans).id === p.id).length }));
  const listValue = planMix.reduce((t, x) => t + (x.p.priceMonthly || 0) * x.n, 0);
  return html`<div class="page-head"><div><h1>Platform analytics</h1><p>Usage, performance and content quality, computed from recorded attempts.</p></div></div>
    <div class="stats"><${Stat} k="Tests completed" v=${done.length} /><${Stat} k="Average score" v=${fmtPct(done.length ? done.reduce((t, a) => t + a.result.percentage, 0) / done.length : null, 1)} /><${Stat} k="Questions answered" v=${done.reduce((t, a) => t + a.result.correct + a.result.incorrect, 0)} /><${Stat} k="Open reports" v=${ws.reports.filter((r) => r.status === 'open').length} /></div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><div><h3>Tests completed per day</h3><p>Last 14 days (IST)</p></div></div><${Columns} items=${days} /></div>
      <div class="card"><div class="card-head"><h3>Popular examinations</h3></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Exam</th><th class="r">Tests</th><th class="r">Avg score</th></tr></thead><tbody>${byExam.map((x) => html`<tr><td>${x.e.short}</td><td class="r num">${x.n}</td><td class="r num">${fmtPct(x.avg, 1)}</td></tr>`)}</tbody></table></div></div>
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>Most-used subjects</h3><p>Questions answered</p></div><${BarList} max=${Math.max(1, ...Object.values(subj))} format=${(v) => String(v)} items=${Object.entries(subj).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: D.taxName(ws, k), value: v }))} /></div>
      <div class="card"><div class="card-head"><h3>Most-practised chapters</h3><p>Questions answered</p></div><${BarList} max=${Math.max(1, ...Object.values(chap))} format=${(v) => String(v)} items=${Object.entries(chap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: D.taxName(ws, k), value: v }))} /></div>
    </div>
    <div class="card flush"><div class="card-head" style="padding:16px 18px 8px"><div><h3>Questions most often answered wrongly</h3><p>Minimum three answers. A high error rate can mean a hard question or a faulty key.</p></div></div>
      ${qa.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Question</th><th class="r">Answers</th><th class="r">Error rate</th><th>Flags</th></tr></thead><tbody>
        ${qa.map((x) => { const q = ws.questions.find((y) => y.id === x.qid); return q && html`<tr class="clickable" onClick=${() => nav('admin-question', { id: q.id })}><td><span class="mono xs muted">${q.code}</span> <${DiffPill} d=${q.difficulty} /><div class="small clamp2">${q.text || q.assertion}</div></td><td class="r num">${x.correct + x.incorrect}</td><td class="r num">${fmtPct(x.errorRate * 100)}</td><td>${(q.flags || []).filter((f) => !f.resolved).length ? html`<span class="pill bad">${(q.flags || []).filter((f) => !f.resolved).length} open</span>` : ''}</td></tr>`; })}
      </tbody></table></div>` : html`<${Empty} title="Not enough answers yet" />`}</div>
    <div class="card"><div class="card-head"><div><h3>Plan mix and revenue</h3><p>No payments are captured in this build, so there is no revenue to report yet.</p></div></div>
      <div class="stats">${planMix.map((x) => html`<${Stat} k=${x.p.name} v=${x.n} s=${x.p.priceMonthly ? `${fmtINR(x.p.priceMonthly)}/month list price` : ''} />`)}</div>
      <p class="small muted">Active paid plans are worth ${fmtINR(listValue)} a month at list price. This is a list-price figure, not collected revenue; revenue reporting starts once a payment gateway records real transactions.</p></div>`;
}

// ---------- Plans, coupons, payments ----------
const FEATURES = [['customMocks', 'Custom mocks'], ['explanations', 'Explanations'], ['weaknessTests', 'Weak-area tests'], ['simulator', 'Simulator'], ['advancedAnalytics', 'Advanced analytics'], ['recommendations', 'Recommendations'], ['downloads', 'Downloads'], ['bulkAssignments', 'Bulk assignments']];
export function PlansAdminView() {
  const s = useStore();
  const { ws } = s;
  const [plans, setPlans] = useState(() => JSON.parse(JSON.stringify(ws.plans)));
  const [coupon, setCoupon] = useState(null);
  const upd = (i, path, v) => { const c = JSON.parse(JSON.stringify(plans)); const p = c[i]; if (path[0] === 'limits') p.limits[path[1]] = v; else if (path[0] === 'features') p.features[path[1]] = v; else p[path[0]] = v; setPlans(c); };
  const dirty = JSON.stringify(plans) !== JSON.stringify(ws.plans);
  return html`<div class="page-head"><div><h1>Plans & coupons</h1><p>Plan limits and features are enforced everywhere in the student app.</p></div>${dirty && html`<button class="btn primary" onClick=${() => { plans.forEach((p) => S.savePlan(p)); toast('Plans saved'); }}>Save plan changes</button>`}</div>
    <div class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th></th>${plans.map((p) => html`<th>${p.name}</th>`)}</tr></thead><tbody>
      <tr><td class="small">Monthly price (₹)</td>${plans.map((p, i) => html`<td><input class="input" style="width:100px" type="number" min="0" aria-label=${`${p.name} price`} value=${p.priceMonthly ?? ''} placeholder="Custom" onInput=${(e) => upd(i, ['priceMonthly'], e.target.value === '' ? null : Number(e.target.value))} /></td>`)}</tr>
      <tr><td class="small">Practice questions / day</td>${plans.map((p, i) => html`<td><input class="input" style="width:100px" type="number" min="0" aria-label=${`${p.name} practice limit`} value=${p.limits.practicePerDay ?? ''} placeholder="Unlimited" onInput=${(e) => upd(i, ['limits', 'practicePerDay'], e.target.value === '' ? null : Number(e.target.value))} /></td>`)}</tr>
      <tr><td class="small">Mock tests / day</td>${plans.map((p, i) => html`<td><input class="input" style="width:100px" type="number" min="0" aria-label=${`${p.name} mock limit`} value=${p.limits.mocksPerDay ?? ''} placeholder="Unlimited" onInput=${(e) => upd(i, ['limits', 'mocksPerDay'], e.target.value === '' ? null : Number(e.target.value))} /></td>`)}</tr>
      ${FEATURES.map(([k, l]) => html`<tr><td class="small">${l}</td>${plans.map((p, i) => html`<td><input type="checkbox" aria-label=${`${p.name}: ${l}`} checked=${!!p.features[k]} onChange=${(e) => upd(i, ['features', k], e.target.checked)} /></td>`)}</tr>`)}
    </tbody></table></div></div>
    <div class="card flush"><div class="card-head" style="padding:16px 18px 8px"><h3>Coupons</h3><button class="btn sm" onClick=${() => setCoupon({ code: '', kind: 'percent', value: 10, active: true, planIds: ['basic', 'premium'], maxUses: 100, expiresAt: Date.now() + 30 * 86400000 })}>${Icon('plus', 15)} New coupon</button></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Discount</th><th>Plans</th><th class="r">Used</th><th>Expires</th><th>Status</th></tr></thead><tbody>
        ${ws.coupons.map((c) => { const exp = c.expiresAt && Date.now() > c.expiresAt; const full = c.maxUses != null && c.uses >= c.maxUses; return html`<tr class="clickable" onClick=${() => setCoupon({ ...c })}><td class="mono">${c.code}</td><td>${c.kind === 'percent' ? `${c.value}%` : fmtINR(c.value)}</td><td class="small">${(c.planIds || []).join(', ') || 'All'}</td><td class="r num">${c.uses || 0}${c.maxUses != null ? ` / ${c.maxUses}` : ''}</td><td class="small">${c.expiresAt ? fmtDate(c.expiresAt) : 'Never'}</td><td><span class="pill ${!c.active || exp || full ? 'bad' : 'good'}">${!c.active ? 'Off' : exp ? 'Expired' : full ? 'Used up' : 'Active'}</span></td></tr>`; })}
      </tbody></table></div></div>
    <div class="card"><div class="card-head"><div><h3>Payment gateway</h3><p>Razorpay</p></div><span class="pill warn">Not connected</span></div>
      <p class="small">Students can choose a plan and apply coupons, but no payment is taken in this build: the upgrade becomes a request that an administrator grants by hand. No transaction is ever simulated.</p>
      <p class="small">Connecting Razorpay needs a server: create an order with the secret key on the server, open Razorpay Checkout in the page with the public key, then verify the payment signature on the server before activating the plan and issuing an invoice. Test-mode keys can be used first.</p></div>
    ${coupon && html`<${CouponEdit} c=${coupon} onClose=${() => setCoupon(null)} />`}`;
}
function CouponEdit({ c, onClose }) {
  const s = useStore();
  const [f, setF] = useState({ ...c, expires: c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 10) : '' });
  const save = () => { const ok = attempt(() => { S.saveCoupon({ ...f, value: Number(f.value), maxUses: f.maxUses === '' || f.maxUses == null ? null : Number(f.maxUses), expiresAt: f.expires ? Date.parse(f.expires + 'T23:59:59+05:30') : null }); return true; }, 'Coupon saved'); if (ok) onClose(); };
  return html`<${Modal} title=${c.id ? `Coupon ${c.code}` : 'New coupon'} onClose=${onClose} foot=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Save</button>`}>
    <div class="grid g2">
      <${Field} label="Code" id="cp-code"><input id="cp-code" class="input mono" value=${f.code} onInput=${(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></${Field}>
      <${Field} label="Type" id="cp-kind"><select id="cp-kind" class="input" value=${f.kind} onChange=${(e) => setF({ ...f, kind: e.target.value })}><option value="percent">Percentage</option><option value="flat">Flat amount (₹)</option></select></${Field}>
      <${Field} label=${f.kind === 'percent' ? 'Discount %' : 'Discount ₹'} id="cp-val"><input id="cp-val" class="input" type="number" min="1" value=${f.value} onInput=${(e) => setF({ ...f, value: e.target.value })} /></${Field}>
      <${Field} label="Maximum uses" id="cp-max" hint="Empty for unlimited"><input id="cp-max" class="input" type="number" min="1" value=${f.maxUses ?? ''} onInput=${(e) => setF({ ...f, maxUses: e.target.value })} /></${Field}>
      <${Field} label="Expires on" id="cp-exp"><input id="cp-exp" class="input" type="date" value=${f.expires} onInput=${(e) => setF({ ...f, expires: e.target.value })} /></${Field}>
    </div>
    <div class="field"><span class="label">Applies to</span><div class="row">${s.ws.plans.filter((p) => p.priceMonthly > 0).map((p) => html`<label class="check"><input type="checkbox" checked=${(f.planIds || []).includes(p.id)} onChange=${(e) => setF({ ...f, planIds: e.target.checked ? [...(f.planIds || []), p.id] : (f.planIds || []).filter((x) => x !== p.id) })} /> ${p.name}</label>`)}</div></div>
    <label class="check"><input type="checkbox" checked=${f.active} onChange=${(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
  </${Modal}>`;
}

// ---------- Audit ----------
export function AuditView() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = s.ws.audit.filter((a) => !q || (a.action + ' ' + a.detail).toLowerCase().includes(q.toLowerCase()));
  const pages = Math.max(1, Math.ceil(list.length / 30));
  const who = (id) => s.ws.users.find((u) => u.id === id)?.name || id;
  return html`<div class="page-head"><div><h1>Audit log</h1><p>Every administrative change, newest first.</p></div></div>
    <div class="card flush"><div style="padding:12px"><input class="input" style="max-width:360px" placeholder="Filter by action or detail" aria-label="Filter audit log" value=${q} onInput=${(e) => { setQ(e.target.value); setPage(1); }} /></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>
        ${list.slice((page - 1) * 30, page * 30).map((a) => html`<tr><td class="small nowrap">${fmtDateTime(a.at)}</td><td class="small nowrap">${who(a.userId)}</td><td class="mono xs nowrap">${a.action}</td><td class="small">${a.detail}</td></tr>`)}
      </tbody></table></div><${Pager} page=${page} pages=${pages} total=${list.length} onPage=${setPage} label="entries" /></div>`;
}

// ---------- System checks ----------
export function ChecksView() {
  const s = useStore();
  const [res, setRes] = useState(null);
  const [confirm, confirmEl] = useConfirm();
  const run = () => setRes(runSelfTests(s.ws));
  const failed = res?.filter((r) => !r.pass).length;
  return html`<div class="page-head"><div><h1>System checks</h1><p>Runs the paper-generation, scoring and access rules against the live question bank. The same rules are covered by the automated test suite.</p></div><button class="btn primary" onClick=${run}>${Icon('play', 16)} Run checks</button></div>
    ${res && html`<${Notice} kind=${failed ? 'bad' : 'good'}>${failed ? `${failed} of ${res.length} checks failed.` : `All ${res.length} checks passed.`}</${Notice}>`}
    ${res ? html`<div class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>Check</th><th>Result</th><th class="r">Time</th></tr></thead><tbody>
      ${res.map((r) => html`<tr><td><b class="small">${r.name}</b><div class="xs muted">${r.detail}</div></td><td><span class="pill ${r.pass ? 'good' : 'bad'}">${r.pass ? 'Pass' : 'Fail'}</span></td><td class="r xs num">${r.ms.toFixed(1)} ms</td></tr>`)}
    </tbody></table></div></div>` : html`<div class="card"><${Empty} title="Not run yet">Press Run checks.</${Empty}></div>`}
    <div class="card"><div class="card-head"><div><h3>Storage</h3><p>${s.adapter?.label()}</p></div></div>
      <p class="small">Each person who opens this app gets a private workspace. Resetting replaces everything here with the original sample content.</p>
      <div class="row"><button class="btn danger" onClick=${async () => { if (await confirm({ title: 'Reset to sample content?', body: 'All questions, exams, users and attempts in this workspace are replaced with the original sample content. This cannot be undone.', ok: 'Reset workspace', danger: true })) { await S.resetWorkspace(); toast('Workspace reset'); nav('admin'); } }}>${Icon('refresh', 16)} Reset workspace</button></div></div>
    ${confirmEl}`;
}
