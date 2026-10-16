import test from 'node:test';
import assert from 'node:assert/strict';
import Core from '../js/game-core.js';
import Theory from '../js/theory.js';

test('identical sus2 and sus4 voicings both count when inversions are allowed', () => {
  const settings = Core.validSettings({ mode: 'chords', chordTypes: ['sus2', 'sus4'], inversions: true });
  const esus4 = Core.voiced(52, Core.TYPE_BY_ID.sus4, 1);
  const asus2 = Core.voiced(57, Core.TYPE_BY_ID.sus2, 0);
  assert.deepEqual(esus4, [57, 59, 64]);
  assert.deepEqual(asus2, esus4);
  assert.deepEqual(Core.equivalentTypes(esus4, settings).sort(), ['sus2', 'sus4']);
  assert.equal(Core.grade({ acceptedIds: ['sus2', 'sus4'] }, 'sus2', 2000, 25).correct, true);
  assert.equal(Core.grade({ acceptedIds: ['sus2', 'sus4'] }, 'sus4', 2000, 25).correct, true);
});

test('root-position-only practice still distinguishes the two suspended types', () => {
  const settings = Core.validSettings({ mode: 'chords', chordTypes: ['sus2', 'sus4'], inversions: false });
  const notes = Core.voiced(57, Core.TYPE_BY_ID.sus2, 0);
  assert.deepEqual(Core.equivalentTypes(notes, settings), ['sus2']);
});

test('enharmonic root names do not add duplicate chord-type choices', () => {
  const settings = Core.validSettings({ mode: 'chords', chordTypes: ['maj', 'min'] });
  const notes = Core.voiced(61, Core.TYPE_BY_ID.maj, 0);
  assert.equal(Theory.chordName(61, Core.TYPE_BY_ID.maj), 'Db');
  assert.deepEqual(Core.equivalentTypes(notes, settings), ['maj']);
});

test('mixed deck balances kinds and each question has a wrong choice', () => {
  const deck = Core.makeDeck({ mode: 'mixed', rounds: 12, inversions: true });
  assert.equal(deck.length, 12);
  assert.equal(deck.filter(q => q.kind === 'chord').length, 6);
  assert.equal(deck.filter(q => q.kind === 'staff').length, 6);
  for (const question of deck) {
    assert.equal(new Set(question.choices).size, question.choices.length);
    assert.ok(question.choices.some(id => question.acceptedIds.includes(id)));
    assert.ok(question.choices.some(id => !question.acceptedIds.includes(id)));
  }
});

test('quick play opens on familiar chord types and notes close to the staff centre', () => {
  for (let run = 0; run < 30; run++) {
    const deck = Core.makeDeck({ mode: 'mixed', rounds: 12, progressive: true,
      inversions: true, arpeggio: true });
    for (const question of deck.slice(0, 4)) {
      assert.equal(question.choices.length, 2);
      if (question.kind === 'chord') {
        assert.ok(['maj', 'min'].includes(question.typeId));
        assert.equal(question.inversion, 0);
        assert.equal(question.arpeggio, false);
      } else {
        const [low, high] = question.note.clef === 'treble' ? [65, 76] : [45, 55];
        assert.ok(question.note.midi >= low && question.note.midi <= high);
      }
    }
  }
});

test('adaptive segments retain the kind order and avoid sounds from earlier rounds', () => {
  for (let run = 0; run < 30; run++) {
    const settings = { mode: 'mixed', rounds: 12, progressive: true, inversions: true };
    const first = Core.makeDeck(settings).slice(0, 4);
    const kinds = first.map(question => question.kind);
    const next = Core.makeDeck({ ...settings, rounds: 4 }, Math.random,
      { level: 0, kinds, exclude: first });
    assert.deepEqual(next.map(question => question.kind), kinds);
    assert.ok(next.every(question => question.level === 0 && question.choices.length === 2));
    const sound = question => question.kind === 'chord' ? `chord:${question.notes.join()}` : `staff:${question.note.midi}`;
    assert.equal(new Set([...first, ...next].map(sound)).size, 8);
  }
});

test('quick play avoids repeated sounds and extreme ledger notes across the set', () => {
  for (let run = 0; run < 30; run++) {
    const deck = Core.makeDeck({ mode: 'mixed', rounds: 12, progressive: true,
      inversions: true, arpeggio: true });
    const sounds = deck.map(question => question.kind === 'chord'
      ? `chord:${question.notes.join()}` : `staff:${question.note.midi}`);
    assert.equal(new Set(sounds).size, sounds.length);
    for (const question of deck.filter(item => item.kind === 'staff')) {
      const [low, high] = question.note.clef === 'treble' ? [60, 81] : [40, 60];
      assert.ok(question.note.midi >= low && question.note.midi <= high);
    }
  }
});

test('miss review generates related but new examples', () => {
  const settings = { mode: 'mixed', rounds: 12, inversions: true };
  const original = Core.makeDeck(settings);
  const missed = original.slice(0, 8);
  const retry = Core.makeTransferDeck(missed, settings, { exclude: original });
  assert.equal(retry.length, missed.length);
  const sound = question => question.kind === 'chord' ? `chord:${question.notes.join()}` : `staff:${question.note.midi}`;
  assert.equal(new Set([...original, ...retry].map(sound)).size, original.length + retry.length);
  retry.forEach((question, index) => {
    assert.equal(question.kind, missed[index].kind);
    if (question.kind === 'chord') {
      assert.equal(question.typeId, missed[index].typeId);
      assert.notDeepEqual(question.notes, missed[index].notes);
    } else {
      assert.equal(question.note.clef, missed[index].note.clef);
      assert.notEqual(question.note.midi, missed[index].note.midi);
    }
  });
});

test('a foundations retry keeps its two-choice difficulty', () => {
  const config = Core.validSettings({ mode: 'mixed', rounds: 12, seconds: 25,
    progressive: true, inversions: true, arpeggio: true });
  const source = Core.makeDeck(config).slice(0, 4);
  const retry = Core.makeTransferDeck(source, config, { exclude: [] });
  assert.equal(retry.length, 4);
  retry.forEach((question, index) => {
    assert.equal(question.level, 0);
    assert.equal(question.choices.length, 2);
    assert.equal(question.kind, source[index].kind);
    if (question.kind === 'chord') assert.ok(question.choices.every(id => ['maj', 'min'].includes(id)));
  });
});

test('a staff retry chooses a nearby new note when one is available', () => {
  let seed = 1249;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  const source = { kind: 'staff', note: { clef: 'treble', letter: 'G', octave: 4, midi: 67 }, level: 0 };
  const retry = Core.makeTransferDeck([source], { mode: 'mixed', rounds: 12, progressive: true },
    { random, exclude: [] })[0];
  assert.equal(retry.note.clef, 'treble');
  assert.notEqual(retry.note.midi, 67);
  assert.ok(Math.abs(retry.note.midi - 67) <= 4);
  assert.equal(retry.choices.length, 2);
});

test('the public chord question hides the answer until reveal', () => {
  const question = Core.makeDeck({ mode: 'chords', rounds: 3 })[0];
  const hidden = Core.publicQuestion(question);
  assert.equal(hidden.typeId, undefined);
  assert.equal(hidden.acceptedIds, undefined);
  assert.deepEqual(hidden.notes, question.notes);
  assert.deepEqual(Core.publicQuestion(question, true).acceptedIds, question.acceptedIds);
});

test('settings reject unplayable filters and unknown chord IDs', () => {
  assert.throws(() => Core.validSettings({ mode: 'chords', chordTypes: ['maj'] }), /at least two/);
  assert.throws(() => Core.validSettings({ mode: 'staff', clefs: [] }), /at least one/);
  assert.deepEqual(Core.validSettings({ mode: 'chords', chordTypes: ['maj', 'min', '__proto__'] }).chordTypes,
    ['maj', 'min']);
});
