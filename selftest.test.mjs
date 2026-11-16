import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoWorkspace } from './seed.js';
import { runSelfTests } from './selftest.js';
import * as E from './engine.js';
import * as D from './domain.js';

const ws = await buildDemoWorkspace(async (p) => ({ hash: 'h' + p, salt: 's' }));

test('in-app system checks all pass on the sample bank', () => {
  const r = runSelfTests(ws);
  const failed = r.filter((x) => !x.pass);
  assert.deepEqual(failed, []);
});

test('the brief\'s example: 40 mixed questions on Revolt of 1857 + Constitutional Developments', () => {
  const g = E.generateSelection(ws.questions, { count: 40, topicIds: ['tp_r57', 'tp_cdv'], distribution: E.DISTRIBUTION_PRESETS.mixed, seed: 'brief', lang: 'en' });
  assert.equal(g.ok, true);
  assert.equal(g.items.length, 40);
});

test('same bank powers different exam patterns (multi-exam reusability)', () => {
  const upsc = ws.exams.find((e) => e.id === 'upsc'); const ssc = ws.exams.find((e) => e.id === 'ssc-cgl');
  const a = E.buildPaper(ws.questions, D.specFromPattern(ws, upsc, upsc.patterns[1], D.currentVersion(upsc.patterns[1]), { seed: 'a' }));
  const b = E.buildPaper(ws.questions, D.specFromPattern(ws, ssc, ssc.patterns[1], D.currentVersion(ssc.patterns[1]), { seed: 'b' }));
  assert.ok(a.ok && b.ok);
  assert.equal(a.paper.maxMarks, 60);
  assert.equal(b.paper.maxMarks, 50);
  assert.equal(E.paperItems(b.paper)[0].negative, 0.5);
});

test('pattern versioning keeps old versions', () => {
  const p = ws.exams[0].patterns[0];
  assert.equal(p.versions.length, 2);
  assert.equal(D.currentVersion(p).v, 2);
  assert.equal(p.versions[0].difficulty.difficult, 20);
});

test('readiness reports blocked patterns honestly', () => {
  const ssc = ws.exams.find((e) => e.id === 'ssc-cgl');
  assert.equal(D.patternReadiness(ws, ssc, ssc.patterns[0]).level, 'blocked');
});

test('sample attempts are scored by the real scorer and are internally consistent', () => {
  for (const a of ws.attempts) {
    const p = ws.papers.find((x) => x.id === a.paperId);
    const again = E.scoreAttempt(p, a.responses);
    assert.equal(again.score, a.result.score);
    assert.equal(a.result.correct + a.result.incorrect + a.result.unattempted, p.questionCount);
  }
});
