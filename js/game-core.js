/* Pure question generation and grading shared by the browser and room server. */
(function (global) {
  "use strict";

  const T = global.DiapasonTheory || (typeof require !== "undefined" ? require("./theory.js") : null);
  const ROOT_MIN = 52;
  const ROOT_MAX = 64;
  const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const TIMBRES = ["piano", "organ", "strings"];
  const TYPE_BY_ID = Object.fromEntries(T.CHORD_TYPES.map(type => [type.id, type]));

  function pick(items, random) { return items[Math.floor(random() * items.length)]; }
  function shuffle(items, random) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function validSettings(input = {}) {
    const kinds = ["mixed", "chords", "staff"];
    const mode = kinds.includes(input.mode) ? input.mode : "mixed";
    const rounds = Number(input.rounds ?? 12);
    const seconds = Number(input.seconds ?? 25);
    if (!Number.isInteger(rounds) || rounds < 3 || rounds > 30) throw new Error("Choose 3 to 30 rounds.");
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 90) throw new Error("Choose 10 to 90 seconds per round.");
    const chordTypes = [...new Set((Array.isArray(input.chordTypes) ? input.chordTypes : T.CHORD_TYPES.map(t => t.id))
      .filter(id => typeof id === "string" && Object.hasOwn(TYPE_BY_ID, id)))];
    const clefs = [...new Set((Array.isArray(input.clefs) ? input.clefs : ["treble", "bass"])
      .filter(clef => ["treble", "bass"].includes(clef)))];
    if (mode !== "staff" && chordTypes.length < 2) throw new Error("Choose at least two chord types.");
    if (mode !== "chords" && !clefs.length) throw new Error("Choose at least one clef.");
    const timbre = TIMBRES.includes(input.timbre) ? input.timbre : "piano";
    return { mode, rounds, seconds, chordTypes, clefs, inversions: input.inversions === true,
      arpeggio: input.arpeggio === true, progressive: input.progressive === true,
      randomTimbre: input.randomTimbre === true, timbre };
  }

  function voiced(rootMidi, type, inversion) {
    const notes = T.buildChord(rootMidi, type.intervals);
    return inversion ? T.invert(notes, inversion) : notes;
  }
  function interpretations(notes, settings) {
    const key = notes.join(",");
    const matches = [];
    settings.chordTypes.forEach(id => {
      const type = TYPE_BY_ID[id];
      for (let root = ROOT_MIN; root <= ROOT_MAX; root++) {
        const count = settings.inversions ? type.intervals.length : 1;
        for (let inv = 0; inv < count; inv++) {
          if (voiced(root, type, inv).join(",") === key) matches.push({ rootMidi: root, typeId: id, inversion: inv });
        }
      }
    });
    return matches;
  }
  function equivalentTypes(notes, settings) {
    return [...new Set(interpretations(notes, settings).map(item => item.typeId))];
  }
  function chordQuestion(settings, random, forcedTypeId) {
    const type = TYPE_BY_ID[forcedTypeId || pick(settings.chordTypes, random)];
    const naturalRoots = [52, 53, 55, 57, 59, 60, 62, 64];
    const rootMidi = settings.progressiveLevel === 0 ? pick(naturalRoots, random) :
      ROOT_MIN + Math.floor(random() * (ROOT_MAX - ROOT_MIN + 1));
    const inversion = settings.inversions ? Math.floor(random() * type.intervals.length) : 0;
    const notes = voiced(rootMidi, type, inversion);
    const acceptedIds = equivalentTypes(notes, settings);
    const distractors = shuffle(settings.chordTypes.filter(id => !acceptedIds.includes(id)), random);
    const choices = shuffle(acceptedIds.concat(distractors.slice(0, Math.max(0, 4 - acceptedIds.length))), random);
    return { kind: "chord", rootMidi, typeId: type.id, inversion, notes, acceptedIds, choices,
      arpeggio: settings.arpeggio && random() < 0.5,
      timbre: settings.randomTimbre ? pick(TIMBRES, random) : settings.timbre };
  }
  function staffPool(clef, level = 2) {
    const ranges = clef === 'treble' ? [[65, 76], [64, 77], [60, 81]] :
      [[45, 55], [43, 57], [40, 60]];
    const [low, high] = ranges[level];
    const notes = [];
    for (let midi = low; midi <= high; midi++) {
      const letter = T.NATURAL_LETTERS.find(l => LETTER_SEMITONE[l] === midi % 12);
      if (letter) notes.push({ clef, letter, octave: Math.floor(midi / 12) - 1, midi });
    }
    return notes;
  }
  function staffQuestion(settings, random, forcedClef) {
    const note = pick(staffPool(forcedClef || pick(settings.clefs, random), settings.progressiveLevel ?? 2), random);
    const distractorCount = settings.progressiveLevel === 0 ? 1 : 3;
    const choices = shuffle([note.letter].concat(shuffle(T.NATURAL_LETTERS.filter(l => l !== note.letter), random).slice(0, distractorCount)), random);
    return { kind: "staff", note, acceptedIds: [note.letter], choices };
  }
  function sameSound(a, b) {
    return a.kind === b.kind && (a.kind === 'chord' ? a.notes.join() === b.notes.join() :
      a.note.midi === b.note.midi);
  }
  function settingsAtLevel(settings, level) {
    const next = { ...settings, progressiveLevel: level };
    if (level === 0) {
      next.chordTypes = settings.chordTypes.filter(id => ['maj', 'min'].includes(id));
      if (next.chordTypes.length < 2) next.chordTypes = settings.chordTypes;
      next.inversions = false;
      next.arpeggio = false;
    } else if (level === 1) {
      next.chordTypes = settings.chordTypes.filter(id =>
        ['maj', 'min', 'dim', 'aug', '7', 'maj7', 'min7', 'sus2', 'sus4'].includes(id));
      if (next.chordTypes.length < 4) next.chordTypes = settings.chordTypes;
    }
    return next;
  }
  function makeDeck(rawSettings, random = Math.random, options = {}) {
    const settings = validSettings(rawSettings);
    const kinds = Array.isArray(options.kinds) && options.kinds.length === settings.rounds &&
      options.kinds.every(kind => ['chord', 'staff'].includes(kind)) ? options.kinds.slice() :
      Array.from({ length: settings.rounds }, (_, i) =>
      settings.mode === "mixed" ? (i % 2 === 0 ? "chord" : "staff") :
        (settings.mode === "chords" ? "chord" : "staff"));
    if (!options.kinds && settings.mode === "mixed" && random() < 0.5) kinds.reverse();
    const deck = [];
    for (const kind of kinds) {
      let level;
      if (settings.progressive) {
        level = [0, 1, 2].includes(options.level) ? options.level :
          deck.length < 4 ? 0 : deck.length < 8 ? 1 : 2;
      }
      const roundSettings = settings.progressive ? settingsAtLevel(settings, level) : settings;
      let question;
      for (let tries = 0; tries < 100; tries++) {
        question = kind === "chord" ? chordQuestion(roundSettings, random) : staffQuestion(roundSettings, random);
        const varied = !deck.some(previous => sameSound(previous, question)) &&
          !(options.exclude || []).some(previous => sameSound(previous, question));
        const fair = kind !== "chord" || question.choices.length > question.acceptedIds.length;
        if (varied && fair) break;
      }
      if (deck.some(previous => sameSound(previous, question)) ||
        (options.exclude || []).some(previous => sameSound(previous, question)))
        throw new Error('Could not make enough different questions with these settings. Broaden the filters.');
      if (kind === "chord" && question.choices.length === question.acceptedIds.length)
        throw new Error("These chord settings produce only equivalent answers. Add another chord type.");
      question.id = deck.length + 1;
      if (settings.progressive) question.level = level;
      deck.push(question);
    }
    return deck;
  }
  function makeTransferDeck(misses, rawSettings, { random = Math.random, exclude = misses } = {}) {
    const settings = validSettings(rawSettings);
    const deck = [];
    misses.forEach((old, index) => {
      const level = [0, 1, 2].includes(old.level) ? old.level : null;
      const roundSettings = level === null ? settings : settingsAtLevel(settings, level);
      let question;
      for (let tries = 0; tries < 100; tries++) {
        question = old.kind === 'chord'
          ? chordQuestion(roundSettings, random, old.typeId)
          : staffQuestion(roundSettings, random, old.note.clef);
        const related = old.kind === 'chord' || Math.abs(question.note.midi - old.note.midi) <= 4 || tries >= 50;
        const newSound = !sameSound(old, question) &&
          !exclude.some(previous => sameSound(previous, question)) &&
          !deck.some(previous => sameSound(previous, question));
        if (related && newSound && (old.kind !== 'chord' || question.choices.length > question.acceptedIds.length)) break;
      }
      if (sameSound(old, question) || exclude.some(previous => sameSound(previous, question)) ||
        deck.some(previous => sameSound(previous, question)))
        throw new Error('Could not make enough fresh examples with these settings. Broaden the filters.');
      question.id = index + 1;
      if (level !== null) question.level = level;
      deck.push(question);
    });
    return deck;
  }
  function publicQuestion(question, revealed = false) {
    if (!question) return null;
    const base = { id: question.id, kind: question.kind, choices: question.choices };
    if (question.kind === "chord") {
      Object.assign(base, { notes: question.notes, arpeggio: question.arpeggio, timbre: question.timbre });
      if (revealed) Object.assign(base, { acceptedIds: question.acceptedIds, rootMidi: question.rootMidi,
        typeId: question.typeId, inversion: question.inversion });
    } else {
      base.note = question.note;
      if (revealed) base.acceptedIds = question.acceptedIds;
    }
    return base;
  }
  function grade(question, choice, elapsedMs, seconds) {
    const correct = question.acceptedIds.includes(choice);
    const speed = correct ? Math.max(0, Math.min(20, Math.round(20 * (1 - elapsedMs / (seconds * 1000))))) : 0;
    return { choice, correct, points: correct ? 100 + speed : 0, speed };
  }

  const api = { validSettings, voiced, interpretations, equivalentTypes, makeDeck, makeTransferDeck, publicQuestion, grade, TYPE_BY_ID };
  global.DiapasonGameCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
