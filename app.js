import { html, render, useState, useEffect, useStore, useRoute, nav, Icon, Toasts, initials, toast, attempt, Modal } from './core.js';
import * as S from '../store.js';
import { Auth } from './auth.js';
import { StudentHome, PracticeView, CreateView, SimulatorView, TestsView, RevisionView, PlansView, ProfileView } from './student.js';
import { Runner } from './runner.js';
import { ResultView } from './results.js';
import { AdminOverview, UsersView, AnalyticsView, PlansAdminView, AuditView, ChecksView } from './admin.js';
import { TaxonomyView, QuestionsView, ReviewView, ImportView, AIDraftView, QuestionEditorPage } from './admin-content.js';
import { ExamsView, PapersView } from './admin-exams.js';

const STUDENT_NAV = [
  { id: 'home', label: 'Dashboard', icon: 'home' },
  { id: 'practice', label: 'Chapter practice', icon: 'book' },
  { id: 'create', label: 'Create a test', icon: 'plus' },
  { id: 'simulator', label: 'Exam simulator', icon: 'clock' },
  { id: 'tests', label: 'My tests', icon: 'history' },
  { id: 'revision', label: 'Revision', icon: 'bookmark' },
  { id: 'plans', label: 'Plan & billing', icon: 'rupee' },
];
const ADMIN_NAV = [
  { group: 'Overview' },
  { id: 'admin', label: 'Control centre', icon: 'grid' },
  { group: 'Content' },
  { id: 'admin-questions', label: 'Question bank', icon: 'list' },
  { id: 'admin-review', label: 'Review queue', icon: 'check', count: (ws) => ws.questions.filter((q) => q.status === 'pending').length + ws.reports.filter((r) => r.status === 'open').length },
  { id: 'admin-taxonomy', label: 'Subjects & topics', icon: 'layers' },
  { id: 'admin-import', label: 'Bulk import', icon: 'upload' },
  { id: 'admin-ai', label: 'AI drafting', icon: 'sparkles' },
  { group: 'Examinations', admin: true },
  { id: 'admin-exams', label: 'Exams & blueprints', icon: 'target', admin: true },
  { id: 'admin-papers', label: 'Papers & mocks', icon: 'file', admin: true },
  { group: 'Business', admin: true },
  { id: 'admin-users', label: 'Users', icon: 'users', admin: true, count: (ws) => ws.upgradeRequests.filter((r) => r.status === 'open').length },
  { id: 'admin-analytics', label: 'Analytics', icon: 'chart', admin: true },
  { id: 'admin-plans', label: 'Plans & coupons', icon: 'rupee', admin: true },
  { id: 'admin-audit', label: 'Audit log', icon: 'shield', admin: true },
  { id: 'admin-checks', label: 'System checks', icon: 'check', admin: true },
];
const ROUTES = {
  home: StudentHome, practice: PracticeView, create: CreateView, simulator: SimulatorView, tests: TestsView, revision: RevisionView, plans: PlansView, profile: ProfileView, result: ResultView,
  admin: AdminOverview, 'admin-questions': QuestionsView, 'admin-question': QuestionEditorPage, 'admin-review': ReviewView, 'admin-taxonomy': TaxonomyView, 'admin-import': ImportView, 'admin-ai': AIDraftView,
  'admin-exams': ExamsView, 'admin-papers': PapersView, 'admin-users': UsersView, 'admin-analytics': AnalyticsView, 'admin-plans': PlansAdminView, 'admin-audit': AuditView, 'admin-checks': ChecksView,
};

function SaveState() {
  const s = useStore();
  const name = s.adapter?.name;
  const cls = s.saveError ? 'bad' : name === 'memory' ? 'warn' : '';
  const text = s.saveError || (s.saving ? 'Saving…' : s.adapter?.label());
  return html`<span class="save-pill ${cls}" title=${text}><span class="dot"></span><span class="desktop-only">${text}</span></span>`;
}

function AccountMenu({ onClose }) {
  const s = useStore();
  const u = s.user;
  const demos = s.ws.users.filter((x) => x.demo && x.id !== u.id && x.active).slice(0, 4);
  return html`<${Modal} title=${u.name} sub=${`${u.email} · ${u.role === 'admin' ? 'Administrator' : u.role === 'reviewer' ? 'Content reviewer' : 'Student'}`} onClose=${onClose}>
    ${u.role === 'student' && html`<button class="btn" onClick=${() => { nav('profile'); onClose(); }}>${Icon('user')} Profile and target exams</button>`}
    ${demos.length > 0 && html`<div class="stack sm"><p class="label">Switch to another demo account</p>
      ${demos.map((d) => html`<button class="demo-acct" onClick=${() => { S.demoLogin(d.email); nav(d.role === 'student' ? 'home' : 'admin'); onClose(); }}><span class="avatar">${initials(d.name)}</span><span class="stack sm" style="gap:0"><b>${d.name}</b><span class="xs muted">${d.role === 'admin' ? 'Administrator' : d.role === 'reviewer' ? 'Content reviewer' : `Student · ${d.plan}`}</span></span></button>`)}</div>`}
    <button class="btn danger" onClick=${() => { S.logout(); onClose(); }}>${Icon('logout')} Sign out</button>
  </${Modal}>`;
}

function Shell({ route }) {
  const s = useStore();
  const u = s.user;
  const [menu, setMenu] = useState(false);
  const [acct, setAcct] = useState(false);
  const isStudent = u.role === 'student';
  const items = isStudent ? STUDENT_NAV : ADMIN_NAV.filter((n) => !n.admin || u.role === 'admin');
  const def = isStudent ? 'home' : 'admin';
  let name = route.name;
  const allowed = isStudent ? !name.startsWith('admin') : name.startsWith('admin');
  if (!ROUTES[name] || !allowed) name = def;
  const View = ROUTES[name];
  const active = name === 'admin-question' ? 'admin-questions' : name === 'result' ? 'tests' : name;
  const current = items.find((i) => i.id === active);
  const navList = html`
    <div class="brand"><div class="brand-mark">प्र</div><div><div class="brand-name">Prashnakosh</div><div class="brand-sub">${isStudent ? 'Exam preparation' : u.role === 'admin' ? 'Admin console' : 'Content console'}</div></div></div>
    ${items.map((n) => n.group ? html`<div class="nav-group">${n.group}</div>` : html`<button class="nav-item" aria-current=${active === n.id ? 'page' : undefined} onClick=${() => { nav(n.id); setMenu(false); }}>${Icon(n.icon)}<span>${n.label}</span>${n.count && n.count(s.ws) > 0 && html`<span class="count">${n.count(s.ws)}</span>`}</button>`)}
    <div class="side-foot">
      <button class="nav-item" onClick=${() => setAcct(true)}><span class="avatar" style="width:28px;height:28px;font-size:.72rem">${initials(u.name)}</span><span class="stack sm" style="gap:0;min-width:0"><b class="small" style="overflow:hidden;text-overflow:ellipsis">${u.name}</b><span class="xs muted">${isStudent ? `${(s.ws.plans.find((p) => p.id === u.plan) || {}).name || 'Free'} plan` : u.role === 'admin' ? 'Administrator' : 'Reviewer'}</span></span></button>
    </div>`;
  return html`<div class="shell">
    <aside class="side ${menu ? 'open' : ''}" aria-label="Main navigation">${navList}</aside>
    ${menu && html`<div class="scrim" onClick=${() => setMenu(false)}></div>`}
    <div class="main">
      <header class="topbar">
        ${!isStudent && html`<button class="icon-btn mobile-only" aria-label="Open menu" onClick=${() => setMenu(true)}>${Icon('menu', 22)}</button>`}
        ${isStudent && html`<div class="brand-mark mobile-only" style="width:28px;height:28px;font-size:13px">प्र</div>`}
        <span class="title">${current?.label || (name === 'result' ? 'Result' : name === 'profile' ? 'Profile' : name === 'admin-question' ? 'Question editor' : '')}</span>
        <span class="spacer"></span>
        <${SaveState} />
        <button class="icon-btn" aria-label="Account" onClick=${() => setAcct(true)}><span class="avatar" style="width:30px;height:30px;font-size:.74rem">${initials(u.name)}</span></button>
      </header>
      <main class="content" id="main"><${View} params=${route.params} key=${name + JSON.stringify(route.params || {})} /></main>
    </div>
    ${isStudent && html`<nav class="tabbar" aria-label="Sections">${[STUDENT_NAV[0], STUDENT_NAV[1], STUDENT_NAV[2], STUDENT_NAV[4], STUDENT_NAV[5]].map((n) => html`<button aria-current=${active === n.id ? 'page' : undefined} onClick=${() => nav(n.id)}>${Icon(n.icon, 20)}<span>${n.label.split(' ')[0] === 'Chapter' ? 'Practice' : n.label.split(' ')[0] === 'Create' ? 'Create' : n.label === 'My tests' ? 'Tests' : n.label}</span></button>`)}</nav>`}
    ${acct && html`<${AccountMenu} onClose=${() => setAcct(false)} />`}
  </div>`;
}

function App() {
  const s = useStore();
  const route = useRoute('home');
  if (s.error) return html`<div class="loading"><div class="stack"><h2>Prashnakosh could not start</h2><p class="muted">${s.error}</p><button class="btn primary" onClick=${() => location.reload()}>Reload</button></div></div>`;
  if (!s.ready) return html`<div class="loading"><div class="stack" style="justify-items:center"><div class="spinner"></div><p class="muted">Loading your workspace…</p></div></div>`;
  if (!s.user) return html`<${Auth} /><${Toasts} />`;
  if (route.name === 'attempt' && !route.params.attemptId) {
    // After a reload the hash keeps only the view name: reopen the student's open attempt.
    const open = s.ws.attempts.filter((a) => a.userId === s.user.id && a.status === 'in_progress').sort((a, b) => b.startedAt - a.startedAt)[0];
    if (open) route.params = { attemptId: open.id }; else route.name = s.user.role === 'student' ? 'tests' : 'admin';
  }
  if (route.name === 'attempt' && route.params.attemptId) return html`<${Runner} attemptId=${route.params.attemptId} key=${route.params.attemptId} /><${Toasts} />`;
  return html`<${Shell} route=${route} /><${Toasts} />`;
}

render(html`<${App} />`, document.getElementById('app'));
S.init();
window.__pk = { store: S.store, S };
window.addEventListener('beforeunload', () => { S.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') S.flush(); });
