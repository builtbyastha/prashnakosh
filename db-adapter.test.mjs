import test from 'node:test';
import assert from 'node:assert/strict';
import { DbAdapter } from './store.js';

// Minimal in-memory stand-in for the artifact db capability (paths, set/get/delete, collection get).
function fakeDb() {
  const docs = new Map();
  const check = (p, even) => { const n = p.split('/').length; if ((n % 2 === 0) !== even) throw new TypeError('parity ' + p); };
  return {
    docs,
    doc(p) { check(p, true); return { set: async (d) => { const s = JSON.stringify(d); if (Buffer.byteLength(s) > 256 * 1024) throw { code: 'invalid_argument', message: 'too big' }; docs.set(p, JSON.parse(s)); }, get: async () => ({ exists: docs.has(p), data: () => docs.get(p) }), delete: async () => docs.delete(p) }; },
    collection(p) { check(p, false); return { get: async () => { const out = [...docs.entries()].filter(([k]) => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map(([k, v]) => ({ id: k.split('/').pop(), data: () => v })); return { docs: out, size: out.length }; } }; },
  };
}

test('cloud adapter round-trips large and multi-byte collections with double buffering', async () => {
  const db = fakeDb();
  const a = new DbAdapter(db, 'user123');
  const big = Array.from({ length: 3000 }, (_, i) => ({ id: i, text: 'मौलिक अधिकार संविधान के भाग III में '.repeat(3) + i }));
  await a.saveCollection('questions', big);
  await a.saveCollection('meta', { schema: 1 });
  await a.saveCollection('questions', big.slice(0, 10)); // second save goes to the other slot
  await a.saveLive('att1', { responses: { q1: { answer: 'b' } } });
  const b = new DbAdapter(db, 'user123');
  const loaded = await b.load();
  assert.equal(loaded.collections.questions.length, 10);
  assert.deepEqual(loaded.collections.meta, { schema: 1 });
  assert.equal(loaded.live.att1.responses.q1.answer, 'b');
  await b.deleteLive('att1');
  const again = await new DbAdapter(db, 'user123').load();
  assert.equal(again.live.att1, undefined);
});

test('a torn write (chunks without meta update) still loads the last complete version', async () => {
  const db = fakeDb();
  const a = new DbAdapter(db, 'u');
  await a.saveCollection('meta', { schema: 1 });
  await a.saveCollection('papers', [{ id: 'old' }]);
  // simulate a crash: new slot chunk written, meta never flipped
  await db.doc('data/users/u/c-papers-b-0').set({ rev: 999, chunk: '[{"id":"new"' });
  const loaded = await new DbAdapter(db, 'u').load();
  assert.deepEqual(loaded.collections.papers, [{ id: 'old' }]);
});
