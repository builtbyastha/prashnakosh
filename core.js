import { html, render, useState, useEffect, useRef, useMemo, useCallback, useReducer } from './preact-htm.js';
import * as E from './engine.js';
import { store, subscribe } from './store.js';
export { html, render, useState, useEffect, useRef, useMemo, useCallback, useReducer };

// ---------- store hook ----------
export function useStore() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { const un = subscribe(force); force(); return un; }, []);
  return store;
}

// ---------- router (hash holds only the view name) ----------
const routeState = { name: null, params: {}, listeners: new Set() };
export function nav(name, params = {}) {
  routeState.name = name; routeState.params = params;
  try { if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name); } catch {}
  routeState.listeners.forEach((f) => f());
  const main = document.querySelector('.content'); if (main) window.scrollTo(0, 0);
}
export function useRoute(defaultName) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { routeState.listeners.add(force); return () => routeState.listeners.delete(force); }, []);
  if (!routeState.name) { const h = (location.hash || '').slice(1); routeState.name = /^[a-z0-9-]+$/.test(h) ? h : defaultName; }
  return routeState;
}
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== routeState.name && /^[a-z0-9-]+$/.test(h)) { routeState.name = h; routeState.params = {}; routeState.listeners.forEach((f) => f()); } });

// ---------- toasts ----------
const toastState = { list: [], listeners: new Set() };
export function toast(message, kind = '') {
  const t = { id: Math.random(), message, kind };
  toastState.list = [...toastState.list, t]; toastState.listeners.forEach((f) => f());
  setTimeout(() => { toastState.list = toastState.list.filter((x) => x !== t); toastState.listeners.forEach((f) => f()); }, kind === 'bad' ? 6000 : 3200);
}
export function Toasts() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { toastState.listeners.add(force); return () => toastState.listeners.delete(force); }, []);
  return html`<div class="toasts" role="status" aria-live="polite">${toastState.list.map((t) => html`<div class="toast ${t.kind}" key=${t.id}>${t.message}</div>`)}</div>`;
}
// Run an action and turn thrown errors into a toast.
export function attempt(fn, okMsg) {
  try { const r = fn(); if (r && r.then) return r.then((v) => { okMsg && toast(okMsg); return v; }).catch((e) => toast(e.message || String(e), 'bad')); okMsg && toast(okMsg); return r; }
  catch (e) { toast(e.message || String(e), 'bad'); return undefined; }
}

// ---------- modal ----------
export function Modal({ title, sub, onClose, children, foot, wide }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    const k = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', k);
    setTimeout(() => { const el = ref.current?.querySelector('input,select,textarea,button.primary'); el && el.focus(); }, 30);
    return () => { document.removeEventListener('keydown', k); prev && prev.focus && prev.focus(); };
  }, []);
  return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose && onClose()}>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label=${title} ref=${ref}>
      <div class="modal-head"><div class="stack sm"><h2>${title}</h2>${sub && html`<p class="muted small">${sub}</p>`}</div>${onClose && html`<button class="icon-btn" onClick=${onClose} aria-label="Close">${Icon('x')}</button>`}</div>
      <div class="modal-body">${children}</div>
      ${foot && html`<div class="modal-foot">${foot}</div>`}
    </div></div>`;
}
export function useConfirm() {
  const [cfg, setCfg] = useState(null);
  const confirm = (opts) => new Promise((resolve) => setCfg({ ...opts, resolve }));
  const el = cfg && html`<${Modal} title=${cfg.title} onClose=${() => { cfg.resolve(false); setCfg(null); }} foot=${html`
      <button class="btn" onClick=${() => { cfg.resolve(false); setCfg(null); }}>${cfg.cancel || 'Cancel'}</button>
      <button class="btn ${cfg.danger ? 'danger solid' : 'primary'}" onClick=${() => { cfg.resolve(true); setCfg(null); }}>${cfg.ok || 'Confirm'}</button>`}>
      <div class="stack">${typeof cfg.body === 'string' ? html`<p>${cfg.body}</p>` : cfg.body}</div></${Modal}>`;
  return [confirm, el];
}

// ---------- icons ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z', book: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 21.5V4.5M8 7h8', plus: 'M12 5v14M5 12h14',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5', clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  bookmark: 'M6 3h12v18l-6-4-6 4z', flag: 'M5 21V4h11l-1.5 4L16 12H5', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  check: 'm5 12 5 5 9-10', x: 'M6 6l12 12M18 6 6 18', alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', info: 'M12 16v-4M12 8h.01M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3', upload: 'M12 16V4M7 9l5-5 5 5M4 20h16', sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  file: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6', users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-4-6.3', shield: 'M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6z',
  rupee: 'M6 4h12M6 9h12M14 20 7 13h2a4 4 0 0 0 0-8', list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', menu: 'M3 6h18M3 12h18M3 18h18',
  left: 'm15 18-6-6 6-6', right: 'm9 18 6-6-6-6', down: 'm6 9 6 6 6-6', up: 'm18 15-6-6-6 6', logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3', refresh: 'M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16', trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  play: 'M7 4v16l13-8z', archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4', merge: 'M6 3v6a6 6 0 0 0 6 6h6M15 12l3 3-3 3M6 21v-6', lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  flame: 'M12 22c4 0 7-3 7-7 0-3-2-5.5-3.5-7.5-.5 2-1.5 3-3 3.5C13 7 12 4 9 2c0 4-4 6.5-4 12 0 4.5 3 8 7 8z', target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01', inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z', copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4', moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
};
export function Icon(name, size = 18, extra = '') {
  return html`<svg class=${extra} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[name] || P.info} /></svg>`;
}

// ---------- formatting ----------
const IST = 'Asia/Kolkata';
export const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '—';
export const fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST }) : '—';
export const fmtShort = (ts) => ts ? new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST }) : '—';
export const fmtPct = (x, d = 0) => (x == null || Number.isNaN(x) ? '—' : `${Number(x).toFixed(d)}%`);
export const fmtMarks = (x) => { if (x == null) return '—'; const r = Math.round((Number(x) + Number.EPSILON) * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2); };
export const fmtINR = (n) => (n == null ? 'Custom' : n === 0 ? 'Free' : '₹' + Number(n).toLocaleString('en-IN'));
export function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : fmtDate(ts);
}
export const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
export const plural = (n, w, p) => `${n} ${n === 1 ? w : p || w + 's'}`;

// ---------- small components ----------
export function Field({ label, hint, error, children, id }) {
  return html`<div class="field">${label && html`<label for=${id}>${label}</label>`}${children}${error ? html`<div class="err">${error}</div>` : hint && html`<div class="hint">${hint}</div>`}</div>`;
}
export function Notice({ kind = 'info', icon, children }) {
  return html`<div class="notice ${kind}">${Icon(icon || (kind === 'bad' || kind === 'warn' ? 'alert' : kind === 'good' ? 'check' : 'info'), 17)}<div>${children}</div></div>`;
}
export function Stat({ k, v, s }) { return html`<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${s && html`<div class="s">${s}</div>`}</div>`; }
export function Empty({ title, children, action }) { return html`<div class="empty">${Icon('inbox', 26)}<h3>${title}</h3>${children && html`<p class="small">${children}</p>`}${action}</div>`; }
export function Tabs({ tabs, value, onChange }) {
  return html`<div class="tabs" role="tablist">${tabs.map((t) => html`<button role="tab" aria-selected=${value === t.id} onClick=${() => onChange(t.id)}>${t.label}${t.count != null ? html` <span class="pill" style="margin-left:4px">${t.count}</span>` : ''}</button>`)}</div>`;
}
export function Chips({ options, value, onChange, multi }) {
  const sel = multi ? new Set(value) : null;
  return html`<div class="chips">${options.map((o) => {
    const on = multi ? sel.has(o.id) : value === o.id;
    return html`<button type="button" class="chip" aria-pressed=${on} disabled=${o.disabled} onClick=${() => { if (multi) { const s = new Set(value); on ? s.delete(o.id) : s.add(o.id); onChange([...s]); } else onChange(o.id); }}>${o.label}${o.n != null && html`<span class="n">${o.n}</span>`}</button>`;
  })}</div>`;
}
export function StatusPill({ status }) {
  const k = { published: 'good', approved: 'info', pending: 'warn', draft: '', archived: 'outline', rejected: 'bad' }[status] || '';
  return html`<span class="pill ${k}">${E.STATUS_LABEL[status] || status}</span>`;
}
export function DiffPill({ d }) { const k = { easy: 'good', moderate: 'info', difficult: 'warn', advanced: 'bad' }[d]; return html`<span class="pill ${k}">${E.DIFFICULTY_LABEL[d] || d}</span>`; }
export function Pager({ page, pages, total, onPage, label = 'questions' }) {
  if (pages <= 1) return html`<div class="pager"><span>${plural(total, label.replace(/s$/, ''), label)}</span></div>`;
  return html`<div class="pager"><span>${total.toLocaleString('en-IN')} ${label} · page ${page} of ${pages}</span><div class="row tight"><button class="btn sm" disabled=${page <= 1} onClick=${() => onPage(page - 1)}>${Icon('left', 16)} Previous</button><button class="btn sm" disabled=${page >= pages} onClick=${() => onPage(page + 1)}>Next ${Icon('right', 16)}</button></div></div>`;
}

// ---------- charts ----------
export function BarList({ items, max = 1, format = (v) => fmtPct(v * 100), color }) {
  if (!items.length) return html`<p class="muted small">No data yet.</p>`;
  return html`<div class="barlist">${items.map((it) => html`<div class="item" title=${it.title || ''}>
    <span class="lbl">${it.label}${it.sub && html` <span class="muted xs">${it.sub}</span>`}</span>
    <div class="bar"><span style=${`width:${Math.max(0, Math.min(100, ((it.value ?? 0) / max) * 100))}%;${it.color || color ? `background:${it.color || color}` : ''}`}></span></div>
    <span class="val">${it.value == null ? '—' : format(it.value)}</span></div>`)}</div>`;
}
export function StackBar({ segments, height = 10 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return html`<div class="bar" style=${`height:${height}px`} role="img" aria-label=${segments.map((s) => `${s.label} ${s.value}`).join(', ')}>${segments.filter((s) => s.value > 0).map((s) => html`<span class=${s.cls} style=${`width:${(s.value / total) * 100}%`} title=${`${s.label}: ${s.value}`}></span>`)}</div>`;
}
export function LineChart({ points, height = 180, yMax = 100, yMin = 0, format = (v) => `${Math.round(v)}%`, label = 'Score' }) {
  const [hover, setHover] = useState(null);
  if (!points.length) return html`<p class="muted small">No attempts yet.</p>`;
  const W = 600, H = height, pl = 34, pr = 14, pt = 12, pb = 26;
  const lo = Math.min(yMin, ...points.map((p) => p.y)), hi = Math.max(yMax, ...points.map((p) => p.y));
  const x = (i) => pl + (points.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (points.length - 1));
  const y = (v) => pt + (1 - (v - lo) / (hi - lo || 1)) * (H - pt - pb);
  const ticks = [lo, lo + (hi - lo) / 2, hi].map((v) => Math.round(v));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
  const area = `${d}L${x(points.length - 1)},${y(lo)}L${x(0)},${y(lo)}Z`;
  const last = points[points.length - 1];
  const h = hover != null ? points[hover] : null;
  return html`<div class="chart" style="position:relative">
    <svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${`${label} trend: ${points.map((p) => `${p.x} ${format(p.y)}`).join(', ')}`} onMouseLeave=${() => setHover(null)}>
      <g class="grid">${ticks.map((t) => html`<line x1=${pl} x2=${W - pr} y1=${y(t)} y2=${y(t)} /><text x=${pl - 6} y=${y(t) + 4} text-anchor="end">${format(t)}</text>`)}</g>
      ${lo < 0 && html`<line x1=${pl} x2=${W - pr} y1=${y(0)} y2=${y(0)} stroke="var(--line-2)" stroke-dasharray="3 3" />`}
      <path d=${area} fill="var(--chart-1)" opacity=".1" />
      <path d=${d} fill="none" stroke="var(--chart-1)" stroke-width="2" stroke-linejoin="round" />
      ${points.map((p, i) => html`<g><circle cx=${x(i)} cy=${y(p.y)} r=${i === points.length - 1 ? 5 : 3.5} fill=${i === points.length - 1 ? 'var(--chart-1)' : 'var(--surface)'} stroke="var(--chart-1)" stroke-width="2" />
        <rect x=${x(i) - 14} y=${pt} width="28" height=${H - pt - pb} fill="transparent" onMouseEnter=${() => setHover(i)} onClick=${() => setHover(i)} /></g>`)}
      ${points.length <= 12 ? points.map((p, i) => html`<text x=${x(i)} y=${H - 6} text-anchor="middle">${p.x}</text>`) : [0, points.length - 1].map((i) => html`<text x=${x(i)} y=${H - 6} text-anchor=${i ? 'end' : 'start'}>${points[i].x}</text>`)}
      <text x=${x(points.length - 1)} y=${y(last.y) - 10} text-anchor="end" style="fill:var(--ink);font-weight:600">${format(last.y)}</text>
      ${h && html`<line x1=${x(hover)} x2=${x(hover)} y1=${pt} y2=${H - pb} stroke="var(--line-2)" />`}
    </svg>
    ${h && html`<div style=${`position:absolute;top:0;left:${Math.min(80, (x(hover) / W) * 100)}%;background:var(--ink);color:var(--bg);padding:6px 9px;border-radius:7px;font-size:.78rem;pointer-events:none;white-space:nowrap`}>${h.title || h.x}: <b>${format(h.y)}</b></div>`}
  </div>`;
}
export function Columns({ items, height = 150, format = (v) => String(v) }) {
  const W = 600, H = height, pl = 28, pb = 22, pt = 10;
  const max = Math.max(1, ...items.map((i) => i.value));
  const bw = (W - pl) / items.length;
  return html`<div class="chart"><svg viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${items.map((i) => `${i.label}: ${format(i.value)}`).join(', ')}>
    <g class="grid">${[0, max / 2, max].map((t) => html`<line x1=${pl} x2=${W} y1=${pt + (1 - t / max) * (H - pt - pb)} y2=${pt + (1 - t / max) * (H - pt - pb)} /><text x=${pl - 6} y=${pt + (1 - t / max) * (H - pt - pb) + 4} text-anchor="end">${format(Math.round(t))}</text>`)}</g>
    ${items.map((it, i) => { const h = (it.value / max) * (H - pt - pb); return html`<g><rect x=${pl + i * bw + bw * 0.18} y=${H - pb - h} width=${bw * 0.64} height=${Math.max(0, h)} rx="3" fill="var(--chart-1)"><title>${it.label}: ${format(it.value)}</title></rect>${(items.length <= 14 || i % 2 === 0) && html`<text x=${pl + i * bw + bw / 2} y=${H - 6} text-anchor="middle">${it.label}</text>`}</g>`; })}
  </svg></div>`;
}
export function Ring({ value, label, size = 132 }) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, value || 0));
  return html`<svg class="score-ring" viewBox="0 0 120 120" role="img" aria-label=${`${label} ${fmtPct(value)}`}>
    <circle cx="60" cy="60" r=${r} fill="none" stroke="var(--surface-3)" stroke-width="10" />
    <circle cx="60" cy="60" r=${r} fill="none" stroke="var(--primary)" stroke-width="10" stroke-linecap="round" stroke-dasharray=${`${(v / 100) * c} ${c}`} transform="rotate(-90 60 60)" />
    <text x="60" y="58" text-anchor="middle" style="font:700 24px var(--font-display);fill:var(--ink)">${fmtPct(value)}</text>
    <text x="60" y="78" text-anchor="middle" style="font:11px var(--font-body);fill:var(--muted)">${label}</text></svg>`;
}

// ---------- question body ----------
export function QuestionBody({ item, lg }) {
  return html`<div class="stack">
    ${item.passage && html`<div class="q-passage">${item.passage}</div>`}
    ${item.type === 'assertion_reason' ? html`<div class="stack sm"><p class="q-text ${lg ? 'lg' : ''}">${item.text}</p><div class="q-ar"><div><b>Assertion (A):</b><span>${item.assertion}</span></div><div><b>Reason (R):</b><span>${item.reason}</span></div></div></div>`
      : item.text && html`<p class="q-text ${lg ? 'lg' : ''}">${item.text}</p>`}
    ${item.image && html`<img class="q-img" src=${item.image} alt="Diagram for this question" />`}
    ${item.type === 'match' && item.listA && html`<div class="q-match"><div class="h">List I</div><div class="h">List II</div>${item.listA.map((a, i) => html`<div>${a}</div><div>${item.listB[i] || ''}</div>`)}</div>`}
    ${item.statements && item.statements.length > 0 && html`<ol class="q-statements">${item.statements.map((s, i) => html`<li><span class="muted">${i + 1}.</span><span>${s}</span></li>`)}</ol>`}
    ${item.ask && html`<p class="q-ask">${item.ask}</p>`}
  </div>`;
}
/** Options for answering or reviewing. mode: 'answer' | 'reveal' */
export function QuestionOptions({ item, response, onAnswer, reveal, disabled }) {
  const kind = E.typeKind(item.type);
  const ans = response?.answer;
  if (kind === 'numeric' || kind === 'text') {
    const status = reveal ? E.evaluate(item, response || {}) : null;
    return html`<div class="stack sm">
      <label class="label" for=${'ans-' + item.qid}>${kind === 'numeric' ? 'Your answer (number)' : 'Your answer'}</label>
      <input id=${'ans-' + item.qid} class="input ${status === 'incorrect' ? 'invalid' : ''}" style="max-width:320px" inputmode=${kind === 'numeric' ? 'decimal' : 'text'} value=${ans ?? ''} disabled=${disabled || reveal} onInput=${(e) => onAnswer && onAnswer(e.target.value)} placeholder=${kind === 'numeric' ? 'e.g. 1857' : 'Type your answer'} autocomplete="off" />
      ${reveal && html`<p class="small"><span class="pill ${status === 'correct' ? 'good' : status === 'incorrect' ? 'bad' : ''}">${status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Incorrect' : 'Not answered'}</span> Accepted answer: <b>${kind === 'numeric' ? item.correct.value : item.correct.join(' / ')}</b></p>`}
    </div>`;
  }
  const multi = kind === 'multi';
  const sel = multi ? new Set(ans || []) : null;
  return html`<div class="options" role=${multi ? 'group' : 'radiogroup'}>
    ${multi && !reveal && html`<p class="xs muted">Select all that apply.</p>`}
    ${item.options.map((o, i) => {
      const chosen = multi ? sel.has(o.id) : ans === o.id;
      const isCorrect = reveal && item.correct.includes(o.id);
      const cls = reveal ? (isCorrect ? 'correct' : chosen ? 'wrong' : '') : '';
      return html`<button type="button" class="opt ${multi ? 'multi' : ''} ${cls}" role=${multi ? 'checkbox' : 'radio'} aria-checked=${chosen} disabled=${disabled || reveal}
        onClick=${() => { if (!onAnswer) return; if (multi) { const s = new Set(sel); chosen ? s.delete(o.id) : s.add(o.id); onAnswer([...s]); } else onAnswer(chosen ? null : o.id); }}>
        <span class="key">${'ABCDEFGH'[i]}</span><span>${o.text}</span>
        <span>${reveal && isCorrect ? Icon('check', 18) : reveal && chosen ? Icon('x', 18) : ''}</span>
        ${reveal && item.optionNotes?.[o.id] && !isCorrect && html`<span class="opt-note">${item.optionNotes[o.id]}</span>`}
      </button>`;
    })}</div>`;
}
export function Explanation({ item, topicPath, locked }) {
  if (locked) return html`<div class="explain"><h4>Explanation</h4><p class="small muted">${Icon('lock', 14)} Detailed explanations are included in Basic and higher plans. The correct answer is marked above.</p></div>`;
  return html`<div class="explain">
    <h4>Explanation</h4><p>${item.explanation || 'No explanation has been added for this question yet.'}</p>
    ${topicPath && html`<p class="xs muted">Topic: ${topicPath}${item.concept ? ` · Concept: ${item.concept}` : ''}</p>`}
    ${item.revision && html`<p class="xs">Revise: ${item.revision}</p>`}
  </div>`;
}
