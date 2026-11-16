import { html, useState, useStore, Field, Tabs, Notice, initials, nav, Icon } from './core.js';
import * as S from './store.js';

const DEMO_LABEL = { admin: 'Administrator: exams, blueprints, users, analytics', reviewer: 'Content reviewer: review queue, imports, AI drafts', student: 'Student' };

export function Auth() {
  const s = useStore();
  const [tab, setTab] = useState('signin');
  const [form, setForm] = useState({ name: '', email: '', password: '', exams: [] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const demos = s.ws.users.filter((u) => u.demo && u.active && ['u_admin', 'u_reviewer', 'u_riya', 'u_arjun'].includes(u.id));
  const pub = s.ws.questions.filter((q) => q.status === 'published').length;

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (tab === 'signin') { const u = await S.login(form.email, form.password); nav(u.role === 'student' ? 'home' : 'admin'); }
      else { await S.register({ name: form.name, email: form.email, password: form.password, targetExamIds: form.exams }); nav('home'); }
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return html`<div class="auth">
    <section class="auth-art">
      <div class="row"><div class="brand-mark" style="background:var(--primary-ink);color:var(--primary)">प्र</div><b style="font-family:var(--font-display);font-size:1.15rem">Prashnakosh</b></div>
      <div class="stack lg">
        <h1>One question bank. Every exam pattern.</h1>
        <p>Build structured question banks once, then generate papers that follow each examination's blueprint: subjects, chapters, difficulty and marking.</p>
      </div>
      <div class="ledger">
        <span>BANK  ${pub} published questions · ${s.ws.topics.filter((t) => !t.archived).length} topics</span>
        <span>EXAMS ${s.ws.exams.map((e) => e.short).join(' · ')}</span>
        <span>NOTE  Sample content for demonstration. Not official papers.</span>
      </div>
    </section>
    <section class="auth-form">
      <div class="stack sm"><h2>${tab === 'signin' ? 'Sign in' : 'Create a student account'}</h2><p class="muted small">${tab === 'signin' ? 'Use your email and password, or open one of the demo accounts below.' : 'Free plan to start. You can upgrade later.'}</p></div>
      <${Tabs} tabs=${[{ id: 'signin', label: 'Sign in' }, { id: 'register', label: 'Register' }]} value=${tab} onChange=${(t) => { setTab(t); setErr(''); }} />
      <form onSubmit=${submit} noValidate>
        ${tab === 'register' && html`<${Field} label="Full name" id="r-name"><input id="r-name" class="input" value=${form.name} onInput=${set('name')} autocomplete="name" required /></${Field}>`}
        <${Field} label="Email" id="f-email"><input id="f-email" class="input" type="email" value=${form.email} onInput=${set('email')} autocomplete="email" required /></${Field}>
        <${Field} label="Password" id="f-pass" hint=${tab === 'register' ? 'At least 8 characters with a letter and a number.' : ''}><input id="f-pass" class="input" type="password" value=${form.password} onInput=${set('password')} autocomplete=${tab === 'signin' ? 'current-password' : 'new-password'} required /></${Field}>
        ${tab === 'register' && html`<div class="field"><span class="label">Target examinations</span><div class="chips">${s.ws.exams.filter((e) => e.status === 'active').map((e) => { const on = form.exams.includes(e.id); return html`<button type="button" class="chip" aria-pressed=${on} onClick=${() => setForm({ ...form, exams: on ? form.exams.filter((x) => x !== e.id) : [...form.exams, e.id] })}>${e.short}</button>`; })}</div></div>`}
        ${err && html`<${Notice} kind="bad">${err}</${Notice}>`}
        <button class="btn primary lg" type="submit" disabled=${busy}>${busy ? 'Please wait…' : tab === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>
      ${tab === 'signin' && html`<div class="stack sm"><div class="divider"></div><p class="label">Demo accounts</p>
        <div class="demo-accounts">${demos.map((u) => html`<button class="demo-acct" onClick=${async () => { await S.demoLogin(u.email); nav(u.role === 'student' ? 'home' : 'admin'); }}>
          <span class="avatar">${initials(u.name)}</span>
          <span class="stack sm" style="gap:0;flex:1"><b>${u.name}</b><span class="xs muted">${u.role === 'student' ? `Student · ${u.plan === 'premium' ? 'Premium plan, sample history' : 'Free plan'}` : DEMO_LABEL[u.role]}</span></span>${Icon('right')}</button>`)}</div>
        <p class="xs muted">Demo passwords: Admin@123, Review@123, Student@123.</p></div>`}
    </section></div>`;
}
