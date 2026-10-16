/* chords.js — "Chord Types" module logic */
(function (global) {
  "use strict";

  const T = global.DiapasonTheory;
  const Audio = global.DiapasonAudio;
  const Core = global.DiapasonGameCore;

  // Root notes are chosen from a comfortable octave so chords stay audible.
  const ROOT_MIN = 52; // E3
  const ROOT_MAX = 64; // E4

  const ORDINALS = ["root position", "1st inversion", "2nd inversion",
    "3rd inversion", "4th inversion", "5th inversion"];

  const state = {
    current: null,   // { type, rootMidi, rootVoiced, notes, inv }
    answered: false,
    correct: 0,
    wrong: 0,
    enabled: {},     // type id -> bool (which types are in the practice set)
    arpeggio: false, // play one note at a time
    inversions: false, // voice chords as random inversions
  };

  let dom = {};

  function init() {
    dom = {
      play: document.getElementById("chord-play"),
      next: document.getElementById("chord-new"),
      reset: document.getElementById("chord-reset"),
      arpeggio: document.getElementById("chord-arpeggio"),
      inversions: document.getElementById("chord-inversions"),
      typeToggles: document.getElementById("chord-type-toggles"),
      typesAll: document.getElementById("chord-types-all"),
      typesNone: document.getElementById("chord-types-none"),
      options: document.getElementById("chord-options"),
      feedback: document.getElementById("chord-feedback"),
      name: document.getElementById("chord-name"),
      piano: document.getElementById("chord-piano"),
      correct: document.getElementById("chord-correct"),
      wrong: document.getElementById("chord-wrong"),
    };

    // Every chord type starts enabled.
    T.CHORD_TYPES.forEach(function (type) { state.enabled[type.id] = true; });

    dom.play.addEventListener("click", playCurrent);
    dom.next.addEventListener("click", function () { newRound(true); });
    dom.reset.addEventListener("click", resetScore);

    dom.arpeggio.addEventListener("change", function () {
      state.arpeggio = dom.arpeggio.checked;
    });
    dom.inversions.addEventListener("change", function () {
      state.inversions = dom.inversions.checked;
    });

    dom.typesAll.addEventListener("click", function () { setAllTypes(true); });
    dom.typesNone.addEventListener("click", function () { setAllTypes(false); });

    buildTypeToggles();
    buildOptionButtons();
  }

  // ----- playback -----

  function playCurrent() {
    if (!state.current) return;
    if (state.arpeggio) Audio.playArpeggio(state.current.notes);
    else Audio.playChord(state.current.notes);
  }

  // ----- chord-type practice set -----

  function enabledTypes() {
    return T.CHORD_TYPES.filter(function (t) { return state.enabled[t.id]; });
  }

  function buildTypeToggles() {
    dom.typeToggles.innerHTML = "";
    T.CHORD_TYPES.forEach(function (type) {
      const label = document.createElement("label");
      label.className = "toggle";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!state.enabled[type.id];
      cb.dataset.id = type.id;
      cb.addEventListener("change", function () {
        state.enabled[type.id] = cb.checked;
        onTypesChanged();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(" " + type.label));
      dom.typeToggles.appendChild(label);
    });
  }

  function setAllTypes(value) {
    T.CHORD_TYPES.forEach(function (type) { state.enabled[type.id] = value; });
    buildTypeToggles();
    onTypesChanged();
  }

  // Practice set changed: rebuild the answer buttons and start a fresh round.
  function onTypesChanged() {
    buildOptionButtons();
    newRound(false);
  }

  // Build one answer button per enabled chord type.
  function buildOptionButtons() {
    dom.options.innerHTML = "";
    enabledTypes().forEach(function (type) {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.textContent = type.label;
      btn.dataset.id = type.id;
      btn.addEventListener("click", function () { guess(type); });
      dom.options.appendChild(btn);
    });
  }

  // ----- rounds -----

  // play = true sounds the new chord right away (used by the "New chord"
  // button). Entering the module leaves it silent until the user presses Play.
  function newRound(play) {
    hideAnswer();

    const types = enabledTypes();
    if (!types.length) {
      state.current = null;
      dom.feedback.textContent = "Select at least one chord type to practice.";
      dom.feedback.className = "feedback";
      return;
    }

    const type = T.pick(types);
    const rootMidi = ROOT_MIN + T.randomInt(ROOT_MAX - ROOT_MIN + 1);
    let notes = T.buildChord(rootMidi, type.intervals);
    let rootVoiced = rootMidi;
    let inv = 0;

    if (state.inversions && notes.length > 1) {
      inv = T.randomInt(notes.length); // 0 = root position
      notes = T.invert(notes, inv);
      // The root was the lowest note; raised by an octave for any inversion > 0.
      if (inv > 0) rootVoiced = rootMidi + 12;
    }

    state.current = { type: type, rootMidi: rootMidi, rootVoiced: rootVoiced, notes: notes, inv: inv,
      inversionsEnabled: state.inversions };
    state.answered = false;

    Array.prototype.forEach.call(dom.options.children, function (btn) {
      btn.classList.remove("correct", "wrong");
      btn.disabled = false;
    });

    dom.feedback.textContent = "";
    dom.feedback.className = "feedback";

    if (play) playCurrent();
  }

  function hideAnswer() {
    dom.name.innerHTML = "";
    dom.name.classList.add("hidden");
    dom.piano.innerHTML = "";
    dom.piano.classList.add("hidden");
  }

  function guess(type) {
    if (state.answered || !state.current) return;
    state.answered = true;

    const matches = Core.interpretations(state.current.notes, {
      chordTypes: enabledTypes().map(function (t) { return t.id; }), inversions: state.current.inversionsEnabled,
    });
    const acceptedIds = [...new Set(matches.map(function (match) { return match.typeId; }))];
    const isRight = acceptedIds.includes(type.id);

    Array.prototype.forEach.call(dom.options.children, function (btn) {
      btn.disabled = true;
      if (acceptedIds.includes(btn.dataset.id)) btn.classList.add("correct");
      else if (btn.dataset.id === type.id) btn.classList.add("wrong");
    });

    const alternatives = matches.filter(function (match) {
      return match.typeId !== state.current.type.id;
    }).map(function (match) {
      return T.chordName(match.rootMidi, Core.TYPE_BY_ID[match.typeId]);
    });
    const aliasText = alternatives.length ? " Also heard as " + [...new Set(alternatives)].join(" / ") + "." : "";
    if (isRight) {
      state.correct++;
      dom.feedback.textContent = "✓ Correct! It was " + state.current.type.label + "." + aliasText;
      dom.feedback.className = "feedback correct";
    } else {
      state.wrong++;
      dom.feedback.textContent = "✗ Wrong. It was " + state.current.type.label + "." + aliasText;
      dom.feedback.className = "feedback wrong";
    }
    dom.correct.textContent = state.correct;
    dom.wrong.textContent = state.wrong;

    // Show the full chord name (e.g. "E9") with the inversion (if any) and the
    // keyboard, with the chord notes highlighted (root in green).
    const fullName = T.chordName(state.current.rootMidi, state.current.type);
    let sub = state.current.type.label;
    if (state.current.inv > 0) sub += " · " + ORDINALS[state.current.inv];
    dom.name.innerHTML = fullName + '<span class="ctype">' + sub + "</span>";
    dom.name.classList.remove("hidden");

    dom.piano.innerHTML = "";
    const spelled = T.spellChord(state.current.rootMidi, state.current.type);
    dom.piano.appendChild(
      global.DiapasonPiano.render(state.current.notes, state.current.rootVoiced, spelled.byPc));
    dom.piano.classList.remove("hidden");
  }

  function resetScore() {
    state.correct = 0;
    state.wrong = 0;
    dom.correct.textContent = "0";
    dom.wrong.textContent = "0";
  }

  // Called by app.js when the chord screen is opened.
  function onEnter() {
    if (!state.current) newRound();
  }

  global.DiapasonChords = { init: init, onEnter: onEnter, newRound: newRound };
})(window);
