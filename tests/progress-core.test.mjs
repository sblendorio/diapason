import test from 'node:test';
import assert from 'node:assert/strict';
import Progress from '../js/progress-core.js';

const chord = { kind: 'chord', typeId: 'min', notes: [57, 60, 64] };
const staff = { kind: 'staff', note: { clef: 'treble', midi: 71 } };

test('a quick set stores only missed concepts and a comparable personal best', () => {
  const first = Progress.record(null, [
    { question: chord, result: { correct: false } },
    { question: staff, result: { correct: true } },
  ], 220);
  assert.equal(first.isNewBest, true);
  assert.equal(first.progress.bestScore, 220);
  assert.equal(first.progress.setsPlayed, 1);
  assert.equal(first.progress.lastCorrect, 1);
  assert.deepEqual(first.progress.pending, [chord]);

  const review = Progress.record(first.progress, [
    { question: { ...chord, notes: [59, 62, 66] }, result: { correct: true } },
  ], 120, { review: true });
  assert.equal(review.progress.bestScore, 220);
  assert.equal(review.progress.setsPlayed, 1);
  assert.equal(review.progress.lastCorrect, 1);
  assert.equal(review.cleared, 1);
  assert.deepEqual(review.progress.pending, []);

  const later = Progress.record(review.progress, [
    { question: staff, result: { correct: false } },
  ], 0);
  assert.equal(later.isNewBest, false);
  assert.equal(later.progress.bestScore, 220);
  assert.equal(later.progress.setsPlayed, 2);
  assert.deepEqual(later.progress.pending, [staff]);

  const unrelatedSet = Progress.record(later.progress, [
    { question: chord, result: { correct: true } },
  ], 120);
  assert.deepEqual(unrelatedSet.progress.pending, [staff]);

  const mixedMisses = Progress.record(unrelatedSet.progress, [
    { question: chord, result: { correct: false } },
    { question: staff, result: { correct: false } },
  ], 0);
  assert.deepEqual(mixedMisses.progress.pending, [chord, staff]);

  const firstZero = Progress.record(null, [{ question: chord, result: { correct: false } }], 0);
  assert.equal(firstZero.isNewBest, false);
});

test('saved progress drops malformed practice questions', () => {
  const data = Progress.normalize({ version: 1, bestScore: 180, setsPlayed: 2,
    pending: [chord, { kind: 'chord', typeId: '__proto__', notes: [1, 2, 3] },
      { kind: 'staff', note: { clef: 'other', midi: 60 } }] });
  assert.deepEqual(data.pending, [chord]);
  assert.deepEqual(Progress.normalize({ version: 99 }).pending, []);
});

test('review clears only solved concepts in the current batch and keeps the backlog', () => {
  const pending = Array.from({ length: 14 }, (_, index) => ({
    kind: 'staff', note: { clef: index % 2 ? 'bass' : 'treble', midi: 48 + index },
  }));
  const reviewed = pending.slice(0, 12);
  const attempts = reviewed.map((source, index) => ({
    question: { ...source, note: { ...source.note, midi: source.note.midi + 12 } },
    result: { correct: index < 2 },
  }));
  const outcome = Progress.record({ ...Progress.empty(), pending }, attempts, 240,
    { review: true, reviewed });
  assert.equal(outcome.cleared, 2);
  assert.deepEqual(outcome.progress.pending, pending.slice(2));
  assert.equal(outcome.progress.setsPlayed, 0);
  assert.equal(outcome.progress.bestScore, 0);
});

test('a full backlog retains new misses and drops its oldest sound', () => {
  const pending = Array.from({ length: 30 }, (_, index) => ({
    kind: 'staff', note: { clef: 'treble', midi: 40 + index },
  }));
  const newMiss = { kind: 'staff', note: { clef: 'bass', midi: 70 } };
  const result = Progress.record({ ...Progress.empty(), pending }, [
    { question: newMiss, result: { correct: false } },
  ], 0);
  assert.equal(result.progress.pending.length, 30);
  assert.deepEqual(result.progress.pending[0], pending[1]);
  assert.deepEqual(result.progress.pending.at(-1), newMiss);
  const duplicate = Progress.record(result.progress, [
    { question: pending[1], result: { correct: false } },
  ], 0);
  assert.equal(duplicate.progress.pending.length, 30);
  assert.deepEqual(duplicate.progress.pending.at(-1), pending[1]);
});

test('a correct immediate transfer clears its source without adding a second miss', () => {
  const transfer = { ...chord, notes: [59, 62, 66], followupFor: chord };
  const attempts = [
    { question: chord, result: { correct: false } },
    { question: transfer, result: { correct: true } },
  ];
  const recovered = Progress.record({ ...Progress.empty(), pending: [chord] }, attempts, 110,
    { resolved: [chord] });
  assert.deepEqual(recovered.progress.pending, []);
  const stillMissed = Progress.record(null, [attempts[0],
    { question: transfer, result: { correct: false } }], 0);
  assert.deepEqual(stillMissed.progress.pending, [chord]);
});
