/* Small, local-only practice history. No account or server tracking. */
(function (global) {
  'use strict';
  const Core = global.DiapasonGameCore || (typeof require !== 'undefined' ? require('./game-core.js') : null);
  const empty = () => ({ version: 1, bestScore: 0, setsPlayed: 0, lastCorrect: null, pending: [] });

  function compact(question) {
    const level = [0, 1, 2].includes(question?.level) ? { level: question.level } : {};
    if (question?.kind === 'chord' && Object.hasOwn(Core.TYPE_BY_ID, question.typeId) &&
      Array.isArray(question.notes) && question.notes.length >= 3 && question.notes.length <= 6 &&
      question.notes.every(note => Number.isInteger(note) && note >= 0 && note <= 127))
      return { kind: 'chord', typeId: question.typeId, notes: question.notes.slice(), ...level };
    if (question?.kind === 'staff' && ['treble', 'bass'].includes(question.note?.clef) &&
      Number.isInteger(question.note?.midi) && question.note.midi >= 0 && question.note.midi <= 127)
      return { kind: 'staff', note: { clef: question.note.clef, midi: question.note.midi }, ...level };
    return null;
  }

  function normalize(raw) {
    if (!raw || raw.version !== 1) return empty();
    return { version: 1,
      bestScore: Number.isInteger(raw.bestScore) && raw.bestScore >= 0 ? raw.bestScore : 0,
      setsPlayed: Number.isInteger(raw.setsPlayed) && raw.setsPlayed >= 0 ? raw.setsPlayed : 0,
      lastCorrect: Number.isInteger(raw.lastCorrect) && raw.lastCorrect >= 0 && raw.lastCorrect <= 12
        ? raw.lastCorrect : null,
      pending: Array.isArray(raw.pending) ? recentUnique(raw.pending) : [] };
  }

  function soundKey(question) {
    return question.kind === 'chord' ? `chord:${question.notes.join()}` :
      `staff:${question.note.clef}:${question.note.midi}`;
  }

  function recentUnique(questions) {
    const seen = new Set();
    const newestFirst = [];
    for (let index = questions.length - 1; index >= 0 && newestFirst.length < 30; index--) {
      const question = compact(questions[index]);
      if (!question) continue;
      const key = soundKey(question);
      if (seen.has(key)) continue;
      seen.add(key);
      newestFirst.push(question);
    }
    return newestFirst.reverse();
  }

  function record(raw, attempts, score, { review = false, reviewed = [], resolved = [] } = {}) {
    const previous = normalize(raw);
    const recovered = new Set(resolved.map(compact).filter(Boolean).map(soundKey));
    const misses = attempts.filter(item => !item.result.correct && !item.question.followupFor)
      .map(item => compact(item.question)).filter(question => question && !recovered.has(soundKey(question)));
    let pending;
    let cleared = 0;
    if (review) {
      const sources = reviewed.length ? reviewed.map(compact) : previous.pending.slice(0, attempts.length);
      const solved = new Set(attempts.flatMap((item, index) => item.result.correct && sources[index]
        ? [soundKey(sources[index])] : []));
      pending = previous.pending.filter(question => !solved.has(soundKey(question)));
      cleared = previous.pending.length - pending.length;
    } else {
      pending = recentUnique(previous.pending.filter(question => !recovered.has(soundKey(question))).concat(misses));
    }
    const correct = attempts.filter(item => item.result.correct).length;
    const isNewBest = !review && score > previous.bestScore;
    return { isNewBest, cleared,
      progress: { version: 1, bestScore: review ? previous.bestScore : Math.max(previous.bestScore, score),
        setsPlayed: previous.setsPlayed + (review ? 0 : 1),
        lastCorrect: review ? previous.lastCorrect : correct, pending } };
  }

  const api = { empty, compact, normalize, record };
  global.DiapasonProgressCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
