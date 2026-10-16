/* theory.js — note names, MIDI helpers, chord definitions (English notation) */
(function (global) {
  "use strict";

  // Pitch class names (English notation: C D E F G A B). Prefer sharps.
  const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  // The 7 natural note letters used for staff reading.
  const NATURAL_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

  // Chord types: name + label shown to the user + interval pattern in semitones
  // from the root. The label is what the user must recognize.
  // `symbol` is the suffix appended to the root name to form the full chord
  // name (e.g. root "E" + symbol "9" -> "E9"; a major triad has no suffix).
  // `degrees` gives the scale degree of each interval (1=root, 3=third, 5=fifth,
  // 7=seventh, 9/11/13 = extensions). Degrees drive correct enharmonic spelling:
  // each chord tone gets the letter of its degree, then the right accidental
  // (e.g. C7's 7th is a B lowered to Bb, never A#).
  const CHORD_TYPES = [
    { id: "maj",    label: "Major",          symbol: "",     intervals: [0, 4, 7],          degrees: [1, 3, 5] },
    { id: "min",    label: "Minor",          symbol: "m",    intervals: [0, 3, 7],          degrees: [1, 3, 5] },
    { id: "7",      label: "Dominant 7th",   symbol: "7",    intervals: [0, 4, 7, 10],      degrees: [1, 3, 5, 7] },
    { id: "maj7",   label: "Major 7th (maj7)", symbol: "maj7", intervals: [0, 4, 7, 11],    degrees: [1, 3, 5, 7] },
    { id: "min7",   label: "Minor 7th",      symbol: "m7",   intervals: [0, 3, 7, 10],      degrees: [1, 3, 5, 7] },
    { id: "9",      label: "9th",            symbol: "9",    intervals: [0, 4, 7, 10, 14],  degrees: [1, 3, 5, 7, 9] },
    { id: "11",     label: "11th",           symbol: "11",   intervals: [0, 4, 7, 10, 14, 17], degrees: [1, 3, 5, 7, 9, 11] },
    { id: "13",     label: "13th",           symbol: "13",   intervals: [0, 4, 7, 10, 14, 21], degrees: [1, 3, 5, 7, 9, 13] },
    { id: "add9",   label: "Add9",           symbol: "add9", intervals: [0, 4, 7, 14],      degrees: [1, 3, 5, 9] },
    { id: "sus4",   label: "Sus4",           symbol: "sus4", intervals: [0, 5, 7],          degrees: [1, 4, 5] },
    { id: "sus2",   label: "Sus2",           symbol: "sus2", intervals: [0, 2, 7],          degrees: [1, 2, 5] },
    { id: "dim",    label: "Diminished",     symbol: "dim",  intervals: [0, 3, 6],          degrees: [1, 3, 5] },
    { id: "aug",    label: "Augmented",      symbol: "aug",  intervals: [0, 4, 8],          degrees: [1, 3, 5] },
  ];

  // Letter helpers for enharmonic spelling.
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const LETTER_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // Canonical spelling chosen for each chromatic root (flats for Db/Eb/Ab/Bb,
  // sharp for F#) — the common lead-sheet conventions for chord roots.
  const ROOT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

  function randomInt(maxExclusive) {
    return Math.floor(Math.random() * maxExclusive);
  }

  function pick(array) {
    return array[randomInt(array.length)];
  }

  // Build the MIDI notes of a chord given a root MIDI note and an interval list.
  function buildChord(rootMidi, intervals) {
    return intervals.map(function (semi) {
      return rootMidi + semi;
    });
  }

  // Voice a chord as its k-th inversion: raise the lowest k notes by an octave
  // and re-sort. k=0 is root position. Returns a new array.
  function invert(notes, k) {
    const out = notes.slice();
    for (let i = 0; i < k && i < out.length; i++) out[i] += 12;
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  // Pitch class name (with sharp) for a MIDI note.
  function midiToName(midi) {
    return PITCH_NAMES[((midi % 12) + 12) % 12];
  }

  function pitchClass(midi) {
    return ((midi % 12) + 12) % 12;
  }

  function accidentalString(a) {
    return a === 0 ? "" : a > 0 ? "#".repeat(a) : "b".repeat(-a);
  }

  // Canonical name of a chord root, e.g. midi 58 (Bb3) -> "Bb".
  function rootName(rootMidi) {
    return ROOT_NAMES[pitchClass(rootMidi)];
  }

  // Full chord name, e.g. rootMidi=E + type "9" -> "E9", maj triad on C -> "C".
  function chordName(rootMidi, type) {
    return rootName(rootMidi) + type.symbol;
  }

  // Spell each chord tone with the correct letter + accidental, derived from the
  // chord degrees (so C7 is C E G Bb, never C E G A#). Returns an object whose
  // `byPc` maps each chord tone's pitch class to its spelled name, plus the
  // ordered `names`. Falls back to sharp names if a type has no degrees.
  function spellChord(rootMidi, type) {
    const rootPc = pitchClass(rootMidi);
    const rootLetter = rootName(rootMidi).charAt(0);
    const rootLetterIndex = LETTER_INDEX[rootLetter];
    const byPc = {};
    const names = [];

    type.intervals.forEach(function (semi, i) {
      const targetPc = (rootPc + semi) % 12;
      let name;
      if (type.degrees) {
        const letter = LETTERS[(rootLetterIndex + (type.degrees[i] - 1)) % 7];
        let diff = ((targetPc - LETTER_SEMITONE[letter]) % 12 + 12) % 12;
        if (diff > 6) diff -= 12; // choose the nearest accidental (… bb, b, ♮, #, ##)
        name = letter + accidentalString(diff);
      } else {
        name = PITCH_NAMES[targetPc];
      }
      byPc[targetPc] = name;
      names.push(name);
    });

    return { byPc: byPc, names: names };
  }

  global.DiapasonTheory = {
    PITCH_NAMES: PITCH_NAMES,
    NATURAL_LETTERS: NATURAL_LETTERS,
    CHORD_TYPES: CHORD_TYPES,
    randomInt: randomInt,
    pick: pick,
    buildChord: buildChord,
    invert: invert,
    midiToName: midiToName,
    rootName: rootName,
    chordName: chordName,
    spellChord: spellChord,
    ROOT_NAMES: ROOT_NAMES,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.DiapasonTheory;
})(typeof window !== "undefined" ? window : globalThis);
