// Application state, persistence and permission-checked actions.
import * as E from './engine.js';
import * as D from './domain.js';
import { buildDemoWorkspace, slimReport } from './seed.js';

const COLLECTIONS = ['subjects', 'chapters', 'topics', 'exams', 'questions', 'papers', 'attempts', 'users', 'bookmarks', 'reports', 'audit', 'importBatches', 'upgradeRequests', 'notifications', 'plans', 'coupons', 'settings', 'meta'];

// ---------------- Password hashing (PBKDF2, WebCrypto) ----------------
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function hashPassword(password, saltHex) {
  const salt = saltHex || toHex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 60000, hash: 'SHA-256' }, key, 256);
  return { hash: toHex(bits), salt };
}

// ---------------- Storage adapters ----------------
const CHUNK = 80000; // characters per document; keeps multi-byte text well under the 256 KiB document limit
function withTimeout(p, ms, fallback) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
}

class DbAdapter {
  constructor(db, uid) { this.db = db; this.base = `data/users/${uid}`; this.name = 'cloud'; this.meta = { collections: {}, live: {} }; }
  label() { return 'Saved to your Claude account'; }
  async load() {
    const snap = await withTimeout(this.db.collection(this.base).get(), 12000, null);
    if (!snap) throw new Error('timeout');
    const docs = {};
    snap.docs.forEach((d) => (docs[d.id] = d.data()));
    const meta = docs.meta;
    if (!meta || !meta.collections) return null;
    this.meta = { collections: { ...meta.collections }, live: { ...(meta.live || {}) } };
    const out = {};
    for (const [name, info] of Object.entries(meta.collections)) {
      let s = '';
      for (let i = 0; i < info.n; i++) {
        const c = docs[`c-${name}-${info.slot}-${i}`];
        if (!c || c.rev !== info.rev) throw new Error(`Incomplete save for ${name}`);
        s += c.chunk;
      }
      out[name] = JSON.parse(s);
    }
    const live = {};
    Object.keys(this.meta.live).forEach((id) => { const d = docs[`live-${id}`]; if (d && d.json) live[id] = JSON.parse(d.json); });
    return { collections: out, live };
  }
  async saveCollection(name, value) {
    const s = JSON.stringify(value);
    const prev = this.meta.collections[name];
    const slot = prev && prev.slot === 'a' ? 'b' : 'a';
    const rev = Date.now();
    const n = Math.max(1, Math.ceil(s.length / CHUNK));
    for (let i = 0; i < n; i++) await this.db.doc(`${this.base}/c-${name}-${slot}-${i}`).set({ rev, chunk: s.slice(i * CHUNK, (i + 1) * CHUNK) });
    this.meta.collections[name] = { slot, n, rev };
    await this.writeMeta();
  }
  async writeMeta() { await this.db.doc(`${this.base}/meta`).set({ collections: this.meta.collections, live: this.meta.live, savedAt: Date.now() }); }
  async saveLive(id, value) {
    await this.db.doc(`${this.base}/live-${id}`).set({ json: JSON.stringify(value) });
    if (!this.meta.live[id]) { this.meta.live[id] = 1; await this.writeMeta(); }
  }
  async deleteLive(id) {
    if (this.meta.live[id]) { delete this.meta.live[id]; await this.writeMeta(); }
    await this.db.doc(`${this.base}/live-${id}`).delete();
  }
  async clear() { this.meta = { collections: {}, live: {} }; await this.writeMeta(); }
}

class LocalAdapter {
  constructor() { this.name = 'browser'; this.prefix = 'pk1:'; }
  label() { return 'Saved in this browser only'; }
  static available() { try { const k = '__pk_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; } }
  async load() {
    const meta = localStorage.getItem(this.prefix + 'meta-index');
    if (!meta) return null;
    const out = {};
    for (const name of JSON.parse(meta)) { const v = localStorage.getItem(this.prefix + name); if (v == null) return null; out[name] = JSON.parse(v); }
    const live = {};
    Object.keys(localStorage).filter((k) => k.startsWith(this.prefix + 'live-')).forEach((k) => (live[k.slice((this.prefix + 'live-').length)] = JSON.parse(localStorage.getItem(k))));
    return { collections: out, live };
  }
  async saveCollection(name, value) {
    localStorage.setItem(this.prefix + name, JSON.stringify(value));
    const idx = new Set(JSON.parse(localStorage.getItem(this.prefix + 'meta-index') || '[]')); idx.add(name);
    localStorage.setItem(this.prefix + 'meta-index', JSON.stringify([...idx]));
  }
  async saveLive(id, value) { localStorage.setItem(this.prefix + 'live-' + id, JSON.stringify(value)); }
  async deleteLive(id) { localStorage.removeItem(this.prefix + 'live-' + id); }
  async clear() { Object.keys(localStorage).filter((k) => k.startsWith(this.prefix)).forEach((k) => localStorage.removeItem(k)); }
}

class MemoryAdapter {
  constructor() { this.name = 'memory'; }
  label() { return 'Not saved: changes last until you close this page'; }
  async load() { return null; }
  async saveCollection() {}
  async saveLive() {}
  async deleteLive() {}
  async clear() {}
}

// ---------------- Store ----------------
export const store = {
  ws: null, rev: 0, user: null, adapter: null, ready: false, error: null, saving: false, saveError: null,
  caps: { sample: null, downloads: null },
  listeners: new Set(),
  dirty: new Set(), liveDirty: new Map(), timer: null, chain: Promise.resolve(),
};
export function subscribe(fn) { store.listeners.add(fn); return () => store.listeners.delete(fn); }
function emit() { store.listeners.forEach((fn) => fn()); }
export function touch(...cols) { cols.forEach((c) => store.dirty.add(c)); store.rev++; scheduleSave(); emit(); }

function scheduleSave(delay = 900) {
  clearTimeout(store.timer);
  store.timer = setTimeout(flush, delay);
}
export function flush() {
  clearTimeout(store.timer);
  const cols = [...store.dirty]; store.dirty.clear();
  const live = [...store.liveDirty.entries()]; store.liveDirty.clear();
  if (!cols.length && !live.length) return store.chain;
  store.saving = true; emit();
  store.chain = store.chain.then(async () => {
    try {
      for (const c of cols) await store.adapter.saveCollection(c, store.ws[c]);
      for (const [id, v] of live) v === null ? await store.adapter.deleteLive(id) : await store.adapter.saveLive(id, v);
      store.saveError = null;
    } catch (e) {
      console.error('save failed', e);
      cols.forEach((c) => store.dirty.add(c));
      store.saveError = e?.code === 'quota_exceeded' ? 'Storage is full. Archive or delete old papers to free space.' : 'Could not save the latest changes. Retrying shortly.';
      if (e?.code !== 'quota_exceeded') scheduleSave(6000);
    } finally { store.saving = false; emit(); }
  });
  return store.chain;
}

async function pickAdapter() {
  const c = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function' ? window.claude : null;
  if (c) {
    try {
      const [db, user] = await Promise.all([withTimeout(c.use('db'), 10000, null), withTimeout(c.use('user'), 10000, null)]);
      const id = user && (await withTimeout(user.id(), 5000, null));
      if (db && id) return new DbAdapter(db, id);
    } catch (e) { console.warn('db unavailable', e); }
  }
  if (LocalAdapter.available()) return new LocalAdapter();
  return new MemoryAdapter();
}

export async function init() {
  try {
    const c = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function' ? window.claude : null;
    if (c) {
      withTimeout(c.use('sample'), 10000, null).then((s) => { store.caps.sample = s; emit(); }).catch(() => {});
      withTimeout(c.use('downloads'), 10000, null).then((d) => { store.caps.downloads = d; emit(); }).catch(() => {});
    }
    store.adapter = await pickAdapter();
    let loaded = null;
    try { loaded = await store.adapter.load(); } catch (e) {
      console.warn('load failed, falling back', e);
      if (store.adapter.name === 'cloud') { store.adapter = LocalAdapter.available() ? new LocalAdapter() : new MemoryAdapter(); loaded = await store.adapter.load().catch(() => null); }
    }
    if (loaded && loaded.collections.meta) {
      store.ws = { ...loaded.collections };
      COLLECTIONS.forEach((k) => { if (store.ws[k] == null) store.ws[k] = k === 'settings' || k === 'meta' ? {} : []; });
      // merge in-progress attempt answers saved separately
      Object.entries(loaded.live || {}).forEach(([id, live]) => { const a = store.ws.attempts.find((x) => x.id === id); if (a && a.status === 'in_progress') a.responses = live.responses; });
    } else {
      store.ws = await buildDemoWorkspace(hashPassword);
      COLLECTIONS.forEach((k) => store.dirty.add(k));
      flush();
    }
    restoreSession();
    sweepExpired();
    store.ready = true;
  } catch (e) {
    console.error(e);
    store.error = String(e?.message || e);
  }
  emit();
}

export async function resetWorkspace() {
  requireRole('admin');
  await flush();
  await store.adapter.clear();
  store.ws = await buildDemoWorkspace(hashPassword);
  COLLECTIONS.forEach((k) => store.dirty.add(k));
  await flush();
  const me = store.ws.users.find((u) => u.email === store.user?.email);
  store.user = me || null;
  emit();
}

// ---------------- Auth & permissions ----------------
const PERMS = {
  admin: ['*'],
  reviewer: ['content.view', 'question.create', 'question.edit', 'question.review', 'import.run', 'ai.draft', 'taxonomy.view', 'reports.manage'],
  student: ['student'],
};
export function can(perm, user = store.user) {
  if (!user || !user.active) return false;
  const p = PERMS[user.role] || [];
  return p.includes('*') || p.includes(perm);
}
function require(perm) { if (!can(perm)) throw new Error('You do not have permission to do that.'); }
function requireRole(role) { if (store.user?.role !== role) throw new Error('You do not have permission to do that.'); }
function audit(action, detail, target) {
  store.ws.audit.unshift({ id: E.uid('au'), at: Date.now(), userId: store.user?.id || 'system', action, detail, target });
  if (store.ws.audit.length > 800) store.ws.audit.length = 800;
  store.dirty.add('audit');
}

function restoreSession() {
  let id = null;
  try { id = localStorage.getItem('pk_session'); } catch {}
  const u = id && store.ws.users.find((x) => x.id === id && x.active);
  store.user = u || null;
}
function setSession(u) {
  store.user = u;
  try { u ? localStorage.setItem('pk_session', u.id) : localStorage.removeItem('pk_session'); } catch {}
  emit();
}
const attemptsByEmail = new Map();
export async function login(email, password) {
  const key = String(email).trim().toLowerCase();
  const rec = attemptsByEmail.get(key) || { n: 0, until: 0 };
  if (Date.now() < rec.until) throw new Error(`Too many attempts. Try again in ${Math.ceil((rec.until - Date.now()) / 1000)} seconds.`);
  const u = store.ws.users.find((x) => x.email.toLowerCase() === key);
  const ok = u && (await hashPassword(password, u.salt)).hash === u.passHash;
  if (!ok) {
    rec.n++; if (rec.n >= 5) { rec.until = Date.now() + 30000; rec.n = 0; }
    attemptsByEmail.set(key, rec);
    throw new Error('That email and password do not match an account.');
  }
  if (!u.active) throw new Error('This account has been deactivated. Contact the administrator.');
  attemptsByEmail.delete(key);
  u.lastLoginAt = Date.now(); touch('users');
  setSession(u);
  return u;
}
export async function register({ name, email, password, targetExamIds }) {
  name = String(name || '').trim(); email = String(email || '').trim().toLowerCase();
  if (name.length < 2) throw new Error('Enter your full name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (String(password).length < 8 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) throw new Error('Use at least 8 characters, including a letter and a number.');
  if (store.ws.users.some((u) => u.email.toLowerCase() === email)) throw new Error('An account with this email already exists. Sign in instead.');
  const { hash, salt } = await hashPassword(password);
  const u = { id: E.uid('u'), name, email, role: 'student', passHash: hash, salt, plan: 'free', planExpiry: null, targetExamIds: targetExamIds || [], createdAt: Date.now(), active: true };
  store.ws.users.push(u);
  touch('users');
  setSession(u);
  return u;
}
export async function demoLogin(email) {
  const u = store.ws.users.find((x) => x.email === email && x.demo);
  if (!u) throw new Error('Demo account not found.');
  setSession(u);
}
export function logout() { setSession(null); }
export function updateProfile(patch) {
  const u = store.user; if (!u) return;
  if (patch.name != null) u.name = String(patch.name).trim() || u.name;
  if (patch.targetExamIds) u.targetExamIds = patch.targetExamIds;
  touch('users');
}

// ---------------- Taxonomy ----------------
const TAX = { subject: 'subjects', chapter: 'chapters', topic: 'topics' };
export function addTaxon(kind, name, parentId) {
  require('*');
  name = String(name || '').trim();
  if (!name) throw new Error('Enter a name.');
  const col = TAX[kind];
  const list = store.ws[col];
  const siblings = list.filter((x) => (kind === 'chapter' ? x.subjectId === parentId : kind === 'topic' ? x.chapterId === parentId : true));
  if (siblings.some((x) => E.normaliseText(x.name) === E.normaliseText(name) && !x.archived)) throw new Error(`A ${kind} with this name already exists here.`);
  const item = { id: E.uid(kind.slice(0, 2)), name, order: list.length, archived: false };
  if (kind === 'chapter') item.subjectId = parentId;
  if (kind === 'topic') item.chapterId = parentId;
  list.push(item);
  audit(`${kind}.created`, name, item.id);
  touch(col);
  return item;
}
export function renameTaxon(kind, id, name) {
  require('*');
  const it = store.ws[TAX[kind]].find((x) => x.id === id);
  name = String(name || '').trim(); if (!name) throw new Error('Enter a name.');
  audit(`${kind}.renamed`, `${it.name} → ${name}`, id);
  it.name = name; touch(TAX[kind]);
}
export function moveTaxon(kind, id, dir) {
  require('*');
  const list = store.ws[TAX[kind]];
  const it = list.find((x) => x.id === id);
  const sib = list.filter((x) => (kind === 'chapter' ? x.subjectId === it.subjectId : kind === 'topic' ? x.chapterId === it.chapterId : true)).sort((a, b) => a.order - b.order);
  const i = sib.indexOf(it), j = i + dir;
  if (j < 0 || j >= sib.length) return;
  const t = sib[j].order; sib[j].order = it.order; it.order = t;
  touch(TAX[kind]);
}
export function archiveTaxon(kind, id, archived) {
  require('*');
  const it = store.ws[TAX[kind]].find((x) => x.id === id);
  it.archived = archived;
  audit(`${kind}.${archived ? 'archived' : 'restored'}`, it.name, id);
  touch(TAX[kind]);
}
export function mergeTaxon(kind, fromId, intoId) {
  require('*');
  if (fromId === intoId) throw new Error('Choose a different target.');
  const ws = store.ws;
  if (kind === 'topic') {
    const into = ws.topics.find((t) => t.id === intoId);
    const ch = ws.chapters.find((c) => c.id === into.chapterId);
    let n = 0;
    ws.questions.forEach((q) => { if (q.topicId === fromId) { q.topicId = intoId; q.chapterId = ch.id; q.subjectId = ch.subjectId; q.updatedAt = Date.now(); n++; } });
    const from = ws.topics.find((t) => t.id === fromId); from.archived = true; from.mergedInto = intoId;
    audit('topic.merged', `${from.name} → ${into.name} (${n} questions moved)`, fromId);
    touch('topics', 'questions');
    return n;
  }
  if (kind === 'chapter') {
    const into = ws.chapters.find((c) => c.id === intoId);
    const from = ws.chapters.find((c) => c.id === fromId);
    ws.topics.forEach((t) => { if (t.chapterId === fromId) t.chapterId = intoId; });
    let n = 0;
    ws.questions.forEach((q) => { if (q.chapterId === fromId) { q.chapterId = intoId; q.subjectId = into.subjectId; n++; } });
    from.archived = true; from.mergedInto = intoId;
    audit('chapter.merged', `${from.name} → ${into.name}`, fromId);
    touch('chapters', 'topics', 'questions');
    return n;
  }
  throw new Error('Subjects cannot be merged; move chapters instead.');
}

// ---------------- Exams & versioned blueprints ----------------
export function saveExam(exam) {
  require('*');
  if (!String(exam.name || '').trim()) throw new Error('Enter the examination name.');
  const ws = store.ws;
  let e = exam.id && ws.exams.find((x) => x.id === exam.id);
  if (e) { Object.assign(e, { name: exam.name.trim(), short: exam.short, category: exam.category, description: exam.description, status: exam.status }); audit('exam.updated', e.name, e.id); }
  else {
    e = { id: E.uid('ex'), name: exam.name.trim(), short: exam.short || exam.name.trim(), category: exam.category || '', description: exam.description || '', status: exam.status || 'active', createdAt: Date.now(), patterns: [] };
    ws.exams.push(e); audit('exam.created', e.name, e.id);
  }
  touch('exams');
  return e;
}
export function validateVersion(v) {
  const errs = [];
  if (!(v.durationMin > 0)) errs.push('Duration must be more than zero minutes.');
  if (!(v.marksPerQ > 0)) errs.push('Marks per question must be more than zero.');
  if (v.negativeFraction < 0 || v.negativeFraction > 1) errs.push('Negative marking must be between 0 and 1 of a question\'s marks.');
  const total = E.DIFFICULTIES.reduce((s, d) => s + (Number(v.difficulty[d]) || 0), 0);
  if (total !== 100) errs.push(`Difficulty percentages add up to ${total}, not 100.`);
  if (!v.sections.length) errs.push('Add at least one section.');
  v.sections.forEach((s, i) => { if (!String(s.name || '').trim()) errs.push(`Section ${i + 1} needs a name.`); if (!(s.count > 0)) errs.push(`Section "${s.name || i + 1}" needs at least one question.`); if (!s.subjectIds.length) errs.push(`Section "${s.name || i + 1}" needs at least one subject.`); });
  return errs;
}
export function savePattern(examId, pattern, versionDraft, note) {
  require('*');
  const exam = store.ws.exams.find((e) => e.id === examId);
  const errs = validateVersion(versionDraft);
  if (errs.length) throw new Error(errs.join(' '));
  const v = { ...JSON.parse(JSON.stringify(versionDraft)), totalQuestions: versionDraft.sections.reduce((s, x) => s + Number(x.count), 0), createdAt: Date.now(), createdBy: store.user.id, note: note || '' };
  let p = pattern.id && exam.patterns.find((x) => x.id === pattern.id);
  if (!p) {
    p = { id: E.uid('pt'), name: pattern.name, stage: pattern.stage, kind: pattern.kind, status: pattern.status, sourceNote: pattern.sourceNote, versions: [], currentV: 1 };
    exam.patterns.push(p);
  } else Object.assign(p, { name: pattern.name, stage: pattern.stage, kind: pattern.kind, status: pattern.status, sourceNote: pattern.sourceNote });
  v.v = (p.versions.reduce((m, x) => Math.max(m, x.v), 0) || 0) + 1;
  p.versions.push(v);
  p.currentV = v.v;
  audit('pattern.version', `${exam.short} · ${p.name} v${v.v}${note ? ` (${note})` : ''}`, p.id);
  touch('exams');
  return p;
}
export function setCurrentVersion(examId, patternId, v) {
  require('*');
  const p = store.ws.exams.find((e) => e.id === examId).patterns.find((x) => x.id === patternId);
  p.currentV = v; audit('pattern.current', `${p.name} → v${v}`, p.id); touch('exams');
}

// ---------------- Questions ----------------
export function newQuestionDraft(defaults = {}) {
  return { id: null, type: 'single', lang: 'en', text: '', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }, { id: 'c', text: '' }, { id: 'd', text: '' }], correct: [], explanation: '', optionNotes: {}, concept: '', revision: '', subjectId: '', chapterId: '', topicId: '', subtopic: '', examTags: [], difficulty: 'moderate', provenance: 'original', aiGenerated: false, sample: false, source: '', status: 'draft', examYear: null, reviewNotes: [], flags: [], ...defaults };
}
const CONTENT_FIELDS = ['type', 'text', 'statements', 'ask', 'assertion', 'reason', 'listA', 'listB', 'passage', 'image', 'options', 'correct', 'explanation'];
export function saveQuestion(draft, { status } = {}) {
  if (!can('question.create')) throw new Error('You do not have permission to do that.');
  const ws = store.ws;
  const q = JSON.parse(JSON.stringify(draft));
  const v = E.validateQuestion(q, { taxonomy: ws });
  const target = status || q.status || 'draft';
  if (target !== 'draft' && !v.ok) throw new Error('Fix these before sending it on: ' + v.errors.join(' '));
  if (target === 'published' && store.user.role !== 'admin') throw new Error('Only an administrator can publish.');
  if (target === 'approved' && !can('question.review')) throw new Error('Only reviewers can approve questions.');
  const now = Date.now();
  let existing = q.id && ws.questions.find((x) => x.id === q.id);
  if (existing) {
    const changed = CONTENT_FIELDS.some((f) => JSON.stringify(existing[f] ?? null) !== JSON.stringify(q[f] ?? null));
    if (changed && ['published', 'approved'].includes(existing.status) && !status) {
      // Content edits to live questions go back through review. Generated papers keep their snapshot.
      q.status = store.user.role === 'admin' ? existing.status : 'pending';
    }
    if (changed) q.version = (existing.version || 1) + 1;
    if (status) q.status = status;
    if (q.status === 'approved' || q.status === 'published') q.reviewerId = q.reviewerId || store.user.id;
    Object.assign(existing, q, { updatedAt: now });
    audit('question.updated', `${existing.code}${changed ? ` → v${existing.version}` : ''} (${E.STATUS_LABEL[existing.status]})`, existing.id);
  } else {
    existing = { ...q, id: E.uid('q'), code: D.questionCode(ws), version: 1, createdAt: now, updatedAt: now, createdBy: store.user.id, status: target, usageCount: 0 };
    if (target === 'approved' || target === 'published') existing.reviewerId = store.user.id;
    ws.questions.push(existing);
    audit('question.created', `${existing.code} (${E.STATUS_LABEL[existing.status]})`, existing.id);
  }
  applyDuplicateGroup(existing);
  touch('questions');
  return existing;
}
function applyDuplicateGroup(q) {
  const near = E.findSimilar(q, store.ws.questions, { threshold: E.DUPLICATE_THRESHOLD, limit: 3 });
  q.duplicateOf = near.length ? near[0].id : null;
  if (near.length) {
    const other = store.ws.questions.find((x) => x.id === near[0].id);
    const g = other.dupGroup || q.dupGroup || E.uid('dg');
    other.dupGroup = g; q.dupGroup = g;
  }
}
export function setQuestionStatus(ids, status, note) {
  const ws = store.ws;
  if (status === 'published' && store.user.role !== 'admin') throw new Error('Only an administrator can publish.');
  if (['approved', 'rejected'].includes(status) && !can('question.review')) throw new Error('Only reviewers can approve or reject.');
  if (!can('question.edit')) throw new Error('You do not have permission to do that.');
  const done = [], skipped = [];
  for (const id of ids) {
    const q = ws.questions.find((x) => x.id === id);
    if (!q) continue;
    if (['pending', 'approved', 'published'].includes(status)) {
      const v = E.validateQuestion(q, { taxonomy: ws });
      if (!v.ok) { skipped.push({ code: q.code, reason: v.errors[0] }); continue; }
    }
    q.status = status; q.updatedAt = Date.now();
    if (['approved', 'published'].includes(status)) { q.reviewerId = q.reviewerId || store.user.id; if (q.provenance === 'ai_draft' && status === 'published') q.reviewedAI = true; }
    if (note) q.reviewNotes = [...(q.reviewNotes || []), { by: store.user.id, at: Date.now(), status, note }];
    done.push(q.code);
  }
  if (done.length) audit(`question.${status}`, `${done.length} question(s): ${done.slice(0, 6).join(', ')}${done.length > 6 ? '…' : ''}${note ? ` — ${note}` : ''}`);
  touch('questions');
  return { done, skipped };
}
export function deleteDrafts(ids) {
  require('question.edit');
  const ws = store.ws;
  const used = new Set(ws.papers.flatMap((p) => E.paperItems(p).map((i) => i.qid)));
  let n = 0;
  ws.questions = ws.questions.filter((q) => { const del = ids.includes(q.id) && q.status === 'draft' && !used.has(q.id); if (del) n++; return !del; });
  if (n) audit('question.deleted', `${n} draft(s) deleted`);
  touch('questions');
  return n;
}
export function bulkTag(ids, examId, add = true) {
  require('question.edit');
  ids.forEach((id) => { const q = store.ws.questions.find((x) => x.id === id); if (!q) return; const s = new Set(q.examTags || []); add ? s.add(examId) : s.delete(examId); q.examTags = [...s]; });
  audit('question.tagged', `${ids.length} question(s) ${add ? '+' : '−'} ${examId}`);
  touch('questions');
}

// ---------------- Reports / flags ----------------
export function reportQuestion(qid, reason, message) {
  if (!store.user) throw new Error('Sign in first.');
  const r = { id: E.uid('r'), qid, userId: store.user.id, reason, message: String(message || '').slice(0, 600), status: 'open', createdAt: Date.now() };
  store.ws.reports.unshift(r);
  const q = store.ws.questions.find((x) => x.id === qid);
  if (q) q.flags = [...(q.flags || []), { id: r.id, by: store.user.id, reason, at: r.createdAt, resolved: false }];
  touch('reports', 'questions');
  return r;
}
export function resolveReport(id, resolution) {
  if (!can('reports.manage')) throw new Error('You do not have permission to do that.');
  const r = store.ws.reports.find((x) => x.id === id);
  r.status = resolution; r.resolvedBy = store.user.id; r.resolvedAt = Date.now();
  const q = store.ws.questions.find((x) => x.id === r.qid);
  if (q) q.flags = (q.flags || []).map((f) => (f.id === id ? { ...f, resolved: true } : f));
  audit('report.' + resolution, q?.code || r.qid, id);
  touch('reports', 'questions');
}

// ---------------- Import ----------------
export function commitImport(rows, { status = 'pending', fileName = 'import', skipDuplicates = true }) {
  require('import.run');
  const ws = store.ws;
  const batch = { id: E.uid('ib'), fileName, at: Date.now(), by: store.user.id, status: 'committed', imported: [], skipped: [] };
  for (const r of rows) {
    if (r.errors.length) { batch.skipped.push({ row: r.row, reason: r.errors[0] }); continue; }
    if (r.duplicateOf && skipDuplicates) { batch.skipped.push({ row: r.row, reason: r.duplicateOf.where === 'bank' ? `Duplicate of ${r.duplicateOf.code}` : `Duplicate of row ${r.duplicateOf.row}` }); continue; }
    const q = { ...newQuestionDraft(), ...r.question, id: E.uid('q'), code: D.questionCode(ws), version: 1, status, createdAt: Date.now(), updatedAt: Date.now(), createdBy: store.user.id, importBatchId: batch.id, usageCount: 0 };
    ws.questions.push(q);
    batch.imported.push(q.id);
  }
  ws.importBatches.unshift(batch);
  audit('import.committed', `${fileName}: ${batch.imported.length} imported, ${batch.skipped.length} skipped`, batch.id);
  touch('questions', 'importBatches');
  return batch;
}
export function rollbackImport(batchId) {
  require('import.run');
  const ws = store.ws;
  const b = ws.importBatches.find((x) => x.id === batchId);
  const used = new Set(ws.papers.flatMap((p) => E.paperItems(p).map((i) => i.qid)));
  let removed = 0, archived = 0;
  ws.questions = ws.questions.filter((q) => {
    if (q.importBatchId !== batchId) return true;
    if (used.has(q.id)) { q.status = 'archived'; archived++; return true; }
    removed++; return false;
  });
  b.status = 'rolled_back'; b.rolledBackAt = Date.now();
  audit('import.rolled_back', `${b.fileName}: ${removed} removed, ${archived} archived (already used in papers)`, batchId);
  touch('questions', 'importBatches');
  return { removed, archived };
}

// ---------------- Papers & attempts ----------------
export function generatePaper(spec, { official = false, titlePrefix } = {}) {
  const ws = store.ws;
  const user = store.user;
  if (official) require('*');
  const now = Date.now();
  const res = E.buildPaper(ws.questions, { ...spec, seed: spec.seed || E.newSeed(), recentIds: official ? null : D.recentQuestionIds(ws, user.id), now });
  if (!res.ok) return res;
  const prefix = official ? 'OFF' : spec.mode === 'practice' || spec.mode === 'revision' ? 'PR' : spec.mode === 'simulator' ? 'SIM' : 'MT';
  const code = D.nextPaperCode(ws, official ? null : user.id, prefix);
  const paper = { id: E.uid('p'), code, ownerId: official ? null : user.id, published: false, ...res.paper, title: spec.title || code, mode: official ? 'official' : spec.mode, createdBy: user.id, reports: res.reports.map(slimReport) };
  if (!spec.title || titlePrefix) paper.title = `${titlePrefix || 'Mock test'} ${code.split('-')[1]}${spec.title ? ' · ' + spec.title : ''}`;
  ws.papers.push(paper);
  E.paperItems(paper).forEach((it) => { const q = ws.questions.find((x) => x.id === it.qid); if (q) q.usageCount = (q.usageCount || 0) + 1; });
  if (official) audit('paper.created', `${paper.code} ${paper.title}`, paper.id);
  touch('papers', 'questions');
  return { ok: true, paper, reports: res.reports };
}
// A paper from a fixed list of questions (revision, retry-incorrect). Uses the current published version of each.
export function generateFixedPaper(qids, { title, mode = 'revision', instantFeedback = true, marks = 1, negative = 0, durationMin = 0, examId = null }) {
  const ws = store.ws;
  const qs = [...new Set(qids)].map((id) => ws.questions.find((q) => q.id === id)).filter((q) => q && q.status === 'published' && E.hasAnswerKey(q));
  if (!qs.length) return { ok: false, message: 'None of these questions are currently published, so a paper cannot be built from them.' };
  const seed = E.newSeed();
  const rng = E.makeRng(seed);
  const items = E.shuffle(qs, rng).map((q) => E.snapshotQuestion(q, { marks, negative, sectionId: 's1' }));
  const code = D.nextPaperCode(ws, store.user.id, 'PR');
  const paper = { id: E.uid('p'), code, ownerId: store.user.id, published: false, title: title || `Revision ${code.split('-')[1]}`, mode, examId, seed, config: { fixed: true, qids: qs.map((q) => q.id) }, sections: [{ id: 's1', name: title || 'Revision', items }], durationMin, answerRelease: 'after_submit', explanationRelease: 'after_submit', instantFeedback, createdAt: Date.now(), createdBy: store.user.id };
  paper.maxMarks = E.round2(items.reduce((s, i) => s + i.marks, 0));
  paper.questionCount = items.length;
  paper.validation = E.validatePaper(paper, { expectedCount: items.length });
  ws.papers.push(paper);
  touch('papers');
  return { ok: true, paper, skipped: qids.length - qs.length };
}
export function publishPaper(paperId, { releaseAt = null, assignedTo = null } = {}) {
  require('*');
  const p = store.ws.papers.find((x) => x.id === paperId);
  if (!p.validation?.pass) throw new Error('This paper failed a quality check and cannot be published.');
  p.published = true; p.publishedAt = Date.now(); p.answerRelease = releaseAt ? 'scheduled' : 'after_submit'; p.releaseAt = releaseAt; p.assignedTo = assignedTo;
  audit('paper.published', `${p.code} ${p.title}${assignedTo ? ` to ${assignedTo.length} student(s)` : ' to all students'}`, p.id);
  touch('papers');
}
export function unpublishPaper(paperId) {
  require('*');
  const p = store.ws.papers.find((x) => x.id === paperId);
  p.published = false; audit('paper.unpublished', p.code, p.id); touch('papers');
}
export function deletePaper(paperId) {
  const ws = store.ws;
  const p = ws.papers.find((x) => x.id === paperId);
  if (!p) return;
  if (p.ownerId !== store.user.id && store.user.role !== 'admin') throw new Error('You can only remove your own papers.');
  if (ws.attempts.some((a) => a.paperId === paperId)) throw new Error('This paper has attempts and is kept for your history.');
  ws.papers = ws.papers.filter((x) => x.id !== paperId);
  touch('papers');
}

export function startAttempt(paperId) {
  const ws = store.ws, user = store.user;
  const paper = ws.papers.find((p) => p.id === paperId);
  if (!paper) throw new Error('Paper not found.');
  if (paper.ownerId && paper.ownerId !== user.id) throw new Error('This paper belongs to another student.');
  if (!paper.ownerId && !paper.published && user.role === 'student') throw new Error('This test is not published.');
  // One in-progress attempt per paper per student: resume it instead of opening a second one.
  const open = ws.attempts.find((a) => a.paperId === paperId && a.userId === user.id && a.status === 'in_progress');
  if (open) { if (E.isExpired(open, paper)) { submitAttempt(open.id, { auto: true }); } else return open; }
  const a = { id: E.uid('a'), paperId, userId: user.id, title: paper.title, mode: paper.mode, status: 'in_progress', startedAt: Date.now(), responses: {}, result: null };
  ws.attempts.push(a);
  touch('attempts');
  return a;
}
export function saveResponse(attemptId, qid, patch) {
  const a = store.ws.attempts.find((x) => x.id === attemptId);
  if (!a || a.status !== 'in_progress') return false;
  const paper = store.ws.papers.find((p) => p.id === a.paperId);
  if (E.isExpired(a, paper, Date.now() - 1500)) return false; // grace for in-flight clicks; the runner submits on expiry
  a.responses[qid] = { ...(a.responses[qid] || {}), ...patch, changedAt: Date.now() };
  store.liveDirty.set(attemptId, { responses: a.responses });
  scheduleSave(700);
  return true;
}
export function submitAttempt(attemptId, { auto = false } = {}) {
  const ws = store.ws;
  const a = ws.attempts.find((x) => x.id === attemptId);
  if (!a || a.status !== 'in_progress') return a;
  const paper = ws.papers.find((p) => p.id === a.paperId);
  const deadline = E.attemptDeadline(a, paper);
  a.result = E.scoreAttempt(paper, a.responses);
  a.status = 'submitted';
  a.autoSubmitted = auto;
  a.submittedAt = deadline ? Math.min(Date.now(), deadline) : Date.now();
  store.liveDirty.set(attemptId, null);
  touch('attempts');
  return a;
}
// Submit any attempt whose time ran out while the page was closed.
export function sweepExpired() {
  const ws = store.ws;
  ws.attempts.filter((a) => a.status === 'in_progress').forEach((a) => { const p = ws.papers.find((x) => x.id === a.paperId); if (p && E.isExpired(a, p)) submitAttempt(a.id, { auto: true }); });
}
export function answersReleased(paper, attempt, now = Date.now()) {
  if (!attempt || attempt.status !== 'submitted') return paper.instantFeedback;
  if (paper.answerRelease === 'scheduled' && paper.releaseAt && now < paper.releaseAt && store.user?.role === 'student') return false;
  return true;
}

// ---------------- Bookmarks ----------------
export function toggleBookmark(qid, note = '') {
  const ws = store.ws;
  const b = ws.bookmarks.find((x) => x.userId === store.user.id && x.qid === qid);
  if (b) ws.bookmarks = ws.bookmarks.filter((x) => x !== b);
  else ws.bookmarks.push({ id: E.uid('b'), userId: store.user.id, qid, note, createdAt: Date.now() });
  touch('bookmarks');
  return !b;
}
export const isBookmarked = (qid) => store.ws.bookmarks.some((b) => b.userId === store.user?.id && b.qid === qid);

// ---------------- Users, plans, coupons ----------------
export function updateUser(id, patch) {
  require('*');
  const u = store.ws.users.find((x) => x.id === id);
  if (id === store.user.id && patch.role && patch.role !== 'admin') throw new Error('You cannot remove your own administrator role.');
  if (id === store.user.id && patch.active === false) throw new Error('You cannot deactivate your own account.');
  const before = { role: u.role, plan: u.plan, active: u.active };
  Object.assign(u, patch);
  audit('user.updated', `${u.email}: ${Object.keys(patch).map((k) => `${k} ${before[k] ?? ''}→${patch[k] instanceof Object ? '…' : patch[k] ?? ''}`).join(', ')}`, id);
  touch('users');
}
export function savePlan(plan) {
  require('*');
  const p = store.ws.plans.find((x) => x.id === plan.id);
  Object.assign(p, JSON.parse(JSON.stringify(plan)));
  audit('plan.updated', p.name, p.id); touch('plans');
}
export function saveCoupon(c) {
  require('*');
  const code = String(c.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new Error('Coupon codes use 3–20 letters or digits.');
  const list = store.ws.coupons;
  if (list.some((x) => x.code === code && x.id !== c.id)) throw new Error('That code already exists.');
  if (!(c.value > 0) || (c.kind === 'percent' && c.value > 100)) throw new Error('Enter a valid discount.');
  const ex = c.id && list.find((x) => x.id === c.id);
  if (ex) Object.assign(ex, { ...c, code }); else list.push({ ...c, code, id: E.uid('cp'), uses: 0 });
  audit('coupon.saved', code); touch('coupons');
}
export function findCoupon(code) { return store.ws.coupons.find((c) => c.code === String(code || '').trim().toUpperCase()); }
export function requestUpgrade(planId, couponCode) {
  const plan = store.ws.plans.find((p) => p.id === planId);
  let finalPrice = plan.priceMonthly, couponOk = null;
  if (couponCode) { const r = E.applyCoupon(plan.priceMonthly, findCoupon(couponCode), { planId }); if (!r.ok) throw new Error(r.reason); finalPrice = r.finalPrice; couponOk = couponCode.toUpperCase(); }
  const req = { id: E.uid('ur'), userId: store.user.id, planId, coupon: couponOk, price: plan.priceMonthly, finalPrice, status: 'open', createdAt: Date.now() };
  store.ws.upgradeRequests.unshift(req);
  touch('upgradeRequests');
  return req;
}
export function resolveUpgrade(id, approve, days = 30) {
  require('*');
  const r = store.ws.upgradeRequests.find((x) => x.id === id);
  r.status = approve ? 'granted' : 'declined'; r.resolvedAt = Date.now(); r.resolvedBy = store.user.id;
  if (approve) {
    const u = store.ws.users.find((x) => x.id === r.userId);
    u.plan = r.planId; u.planExpiry = Date.now() + days * 86400000;
    if (r.coupon) { const c = findCoupon(r.coupon); if (c) c.uses = (c.uses || 0) + 1; }
    audit('plan.granted', `${u.email} → ${r.planId} for ${days} days (manual grant, no payment captured)`, u.id);
  } else audit('plan.declined', r.userId, id);
  touch('upgradeRequests', 'users', 'coupons');
}
export function saveSettings(patch) { require('*'); Object.assign(store.ws.settings, patch); touch('settings'); }
export { DbAdapter };
