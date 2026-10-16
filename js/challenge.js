/* Timed solo and multiplayer challenges. Rooms use the same questions and grading. */
(function (global) {
  "use strict";
  const Core = global.DiapasonGameCore;
  const Progress = global.DiapasonProgressCore;
  const T = global.DiapasonTheory;
  const Audio = global.DiapasonAudio;
  const $ = id => document.getElementById(id);
  const PROGRESS_KEY = 'diapason-progress-v1';
  const CHORD_CUES = {
    maj: 'Major 3rd · perfect 5th', min: 'Minor 3rd · perfect 5th',
    '7': 'Major triad · minor 7th', maj7: 'Major triad · major 7th',
    min7: 'Minor triad · minor 7th', '9': 'Dominant 7th · added 9th',
    '11': 'Dominant 7th · 9th · 11th', '13': 'Dominant 7th · 9th · 13th',
    add9: 'Major triad · added 9th, no 7th', sus4: '4th replaces the 3rd',
    sus2: '2nd replaces the 3rd', dim: 'Minor 3rd · diminished 5th',
    aug: 'Major 3rd · augmented 5th',
  };
  const state = { tab: "solo", soloDeck: null, soloConfig: null, soloIndex: 0, soloTotal: 0, soloCorrect: 0, soloStreak: 0, soloBestStreak: 0,
    soloAttempts: [], soloResolved: [], isReview: false, reviewSources: [],
    soloStartedAt: 0, soloDeadline: 0, soloAnswered: false, room: null, roomToken: null,
    shownQuestionId: null, shownPhase: null, serverOffset: 0, pollTimer: null, pollBusy: false,
    soundTimer: null, nextTimer: null, heartbeat: null, effectTimer: null, playTimer: null, compareTimer: null,
    lastQuestionPlayedAt: 0, lastQuestionDuration: 0,
    compareNotes: null, compareTimbre: null, compareArpeggio: false,
    answerPiano: null, comparePiano: null, answerStaff: null, compareStaff: null, contrastCue: '' };

  function readProgress() {
    try { return Progress.normalize(JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null')); }
    catch { return Progress.empty(); }
  }
  function updateHomeProgress(progress = readProgress()) {
    const hasMisses = progress.pending.length > 0;
    const practice = $('home-continue');
    const play = $('home-play-now');
    practice.classList.toggle('hidden', !hasMisses);
    practice.classList.toggle('primary', hasMisses);
    practice.classList.toggle('text-action', !hasMisses);
    practice.textContent = `Practice misses (${progress.pending.length})`;
    play.classList.toggle('primary', !hasMisses);
    play.classList.toggle('text-action', hasMisses);
    play.textContent = hasMisses ? 'New game' : 'Play now →';
    if (hasMisses) play.parentElement.prepend(practice);
    else play.after(practice);
    $('home-progress').classList.toggle('hidden', !progress.setsPlayed);
    const sets = `${progress.setsPlayed} ${progress.setsPlayed === 1 ? 'set' : 'sets'}`;
    $('home-progress').textContent = (progress.bestScore > 0
      ? `Best set ${progress.bestScore.toLocaleString()} · ${sets}` : `${sets} played`) +
      (!progress.pending.length && progress.setsPlayed ? ' · practice clear' : '');
  }
  function saveProgress(progress) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch {}
    updateHomeProgress(progress);
  }

  function motionAllowed() {
    return $('challenge-motion').checked && !global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function feedbackEffect(outcome) {
    const stage = $('challenge-result');
    stage.classList.remove('answer-correct', 'answer-wrong');
    $('challenge-score').classList.remove('score-pop');
    clearTimeout(state.effectTimer);
    if (motionAllowed() && outcome !== 'timeout') {
      void stage.offsetWidth;
      stage.classList.add(outcome === 'correct' ? 'answer-correct' : 'answer-wrong');
      if (outcome === 'correct') $('challenge-score').classList.add('score-pop');
      state.effectTimer = setTimeout(() => {
        stage.classList.remove('answer-correct', 'answer-wrong');
        $('challenge-score').classList.remove('score-pop');
      }, 650);
    }
    if ($('challenge-haptics').checked && typeof navigator.vibrate === 'function' && outcome !== 'timeout')
      navigator.vibrate(outcome === 'correct' ? 18 : [22, 35, 22]);
  }

  function show(name) {
    ["setup", "lobby", "play", "finish"].forEach(part =>
      $("challenge-" + part).classList.toggle("hidden", part !== name));
    document.querySelector('.challenge-tabs').classList.toggle('hidden', name !== 'setup');
    document.querySelector('.challenge-heading').classList.toggle('hidden', name !== 'setup');
    document.querySelector('#challenge > [data-back]').classList.toggle('hidden', name === 'play');
  }
  function setTab(tab) {
    state.tab = tab;
    $("challenge-solo-tab").classList.toggle("active", tab === "solo");
    $("challenge-room-tab").classList.toggle("active", tab === "room");
    $("challenge-solo-entry").classList.toggle("hidden", tab !== "solo");
    $("challenge-room-entry").classList.toggle("hidden", tab !== "room");
    $('challenge-pause-wrap').classList.toggle('hidden', tab !== 'solo');
    show("setup");
  }
  function settings() {
    const chordTypes = [...$("challenge-type-toggles").querySelectorAll("input:checked")].map(input => input.value);
    const clefs = ["treble", "bass"].filter(clef => $("challenge-" + clef).checked);
    return Core.validSettings({ mode: $("challenge-kind").value, rounds: Number($("challenge-rounds").value),
      seconds: Number($("challenge-seconds").value), chordTypes, clefs,
      inversions: $("challenge-inversions").checked, arpeggio: $("challenge-arpeggio").checked,
      randomTimbre: $("challenge-random-timbre").checked, timbre: $("instrument").value });
  }
  function error(message) {
    $("challenge-error").textContent = message;
    $("challenge-error").hidden = !message;
  }
  function buildTypeToggles() {
    const parent = $("challenge-type-toggles");
    T.CHORD_TYPES.forEach(type => {
      const label = document.createElement("label");
      label.className = "toggle";
      const input = document.createElement("input");
      input.type = "checkbox"; input.value = type.id; input.checked = true;
      label.append(input, document.createTextNode(" " + type.label));
      parent.appendChild(label);
    });
  }
  function playQuestion(question) {
    if (!question) return;
    state.lastQuestionPlayedAt = Date.now();
    state.lastQuestionDuration = question.kind === 'staff' ? 1400 :
      question.arpeggio ? (question.notes.length - 1) * 300 + 1400 : 1800;
    const stage = document.querySelector('.question-stage');
    clearTimeout(state.playTimer);
    stage.classList.remove('is-playing');
    if (question.kind === 'chord' && motionAllowed()) {
      void stage.offsetWidth;
      stage.classList.add('is-playing');
      state.playTimer = setTimeout(() => stage.classList.remove('is-playing'),
        question.arpeggio ? (question.notes.length - 1) * 300 + 1400 : 1800);
    }
    const old = Audio.getTimbre();
    if (question.timbre) Audio.setTimbre(question.timbre);
    if (question.kind === "chord") {
      if (question.arpeggio) Audio.playArpeggio(question.notes);
      else Audio.playChord(question.notes);
    } else Audio.playNote(question.note.midi);
    Audio.setTimbre(old);
  }
  function showResultPiano(which) {
    const visual = which === 'choice' ? state.comparePiano : state.answerPiano;
    if (!visual) return;
    $('challenge-result-label').textContent = which === 'choice' ? 'YOUR CHOICE' : 'THE ANSWER';
    $('challenge-reveal-name').textContent = visual.title;
    $('challenge-learning').textContent = visual.learning;
    $('challenge-reveal-piano').replaceChildren(global.DiapasonPiano.render(
      visual.notes, visual.rootMidi, visual.names, visual.differentPcs));
    const caption = $('challenge-piano-caption');
    caption.classList.toggle('hidden', !state.comparePiano);
    caption.textContent = state.contrastCue;
  }
  function chordDifference(answerNotes, answerNames, choiceNotes, choiceNames) {
    const pitchClasses = notes => new Set(notes.map(note => note % 12));
    const answer = pitchClasses(answerNotes);
    const choice = pitchClasses(choiceNotes);
    const chosenOnly = [...choice].filter(pc => !answer.has(pc));
    const answerOnly = [...answer].filter(pc => !choice.has(pc));
    const changed = chosenOnly.concat(answerOnly);
    const chosenText = chosenOnly.map(pc => choiceNames[pc]).join(', ');
    const answerText = answerOnly.map(pc => answerNames[pc]).join(', ');
    const cue = !changed.length ? 'same pitch classes · different voicing' :
      chosenOnly.length && answerOnly.length ? `${chosenText} → ${answerText}` :
      chosenOnly.length ? `${chosenText} leaves` : `${answerText} enters`;
    return { changed, cue: changed.length ? `CHANGED TONES · ${cue}` : cue };
  }
  function nearestStaffNote(note, letter) {
    const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
    const target = global.DiapasonStaff.diatonicIndex(note.letter, note.octave);
    return [note.octave - 1, note.octave, note.octave + 1]
      .map(octave => ({ clef: note.clef, letter, octave, midi: 12 * (octave + 1) + semitone }))
      .sort((a, b) => Math.abs(global.DiapasonStaff.diatonicIndex(a.letter, a.octave) - target) -
        Math.abs(global.DiapasonStaff.diatonicIndex(b.letter, b.octave) - target) ||
        Math.abs(a.midi - note.midi) - Math.abs(b.midi - note.midi))[0];
  }
  function showResultStaff(which) {
    const visual = which === 'choice' ? state.compareStaff : state.answerStaff;
    if (!visual) return;
    $('challenge-result-label').textContent = which === 'choice' ? 'YOUR CHOICE' : 'THE ANSWER';
    $('challenge-reveal-name').textContent = visual.title;
    $('challenge-learning').textContent = visual.learning;
    $('challenge-staff-choice-label').classList.toggle('active', which === 'choice');
    $('challenge-staff-answer-label').classList.toggle('active', which !== 'choice');
  }
  function runComparison() {
    if ((!state.compareNotes && !state.compareStaff) || $('challenge-result').classList.contains('hidden')) return;
    clearTimeout(state.compareTimer);
    const button = $('challenge-compare');
    button.disabled = true;
    button.textContent = 'Comparing…';
    let delay;
    if (state.compareStaff) {
      Audio.playNote(state.compareStaff.note.midi);
      showResultStaff('choice');
      delay = 1750;
    } else {
      const old = Audio.getTimbre();
      if (state.compareTimbre) Audio.setTimbre(state.compareTimbre);
      if (state.compareArpeggio) Audio.playArpeggio(state.compareNotes);
      else Audio.playChord(state.compareNotes);
      Audio.setTimbre(old);
      showResultPiano('choice');
      const length = Math.max(state.compareNotes.length, currentQuestion().notes.length);
      delay = state.compareArpeggio ? (length - 1) * 300 + 1650 : 2200;
    }
    const question = currentQuestion();
    state.compareTimer = setTimeout(() => {
      if ($('challenge-result').classList.contains('hidden')) return;
      playQuestion(question);
      showResultPiano('answer');
      showResultStaff('answer');
      state.compareTimer = setTimeout(() => {
        button.disabled = false;
        button.textContent = '▶ Compare again';
      }, state.lastQuestionDuration + 100);
    }, delay);
  }
  function autoCompareAfterMiss() {
    if (state.room || (!state.compareNotes && !state.compareStaff)) return;
    const button = $('challenge-compare');
    button.disabled = true;
    const remainingSound = state.lastQuestionPlayedAt + state.lastQuestionDuration - Date.now();
    button.textContent = 'Listening to question…';
    state.compareTimer = setTimeout(runComparison, Math.max(0, remainingSound) + 120);
  }
  function currentQuestion() {
    return state.room ? state.room.question : state.soloDeck?.[state.soloIndex];
  }
  function makeButton(choice, index, question) {
    const button = document.createElement("button");
    button.className = "game-answer";
    button.type = "button";
    button.dataset.choice = choice;
    const key = document.createElement("span"); key.className = "answer-key"; key.textContent = String(index + 1);
    const label = document.createElement("span");
    label.textContent = question.kind === "chord" ? Core.TYPE_BY_ID[choice].label : choice;
    button.append(key, label);
    button.addEventListener("click", () => answer(choice));
    return button;
  }
  function renderQuestion(question, count, total) {
    clearTimeout(state.soundTimer);
    clearTimeout(state.effectTimer);
    clearTimeout(state.playTimer);
    clearTimeout(state.compareTimer);
    state.lastQuestionPlayedAt = 0;
    state.lastQuestionDuration = 0;
    $('challenge-compare').disabled = false;
    $('challenge-compare').textContent = '▶ Compare sounds';
    const stage = document.querySelector('.question-stage');
    stage.classList.remove('is-playing', 'answer-correct', 'answer-wrong');
    stage.classList.toggle('staff-question', question.kind === 'staff');
    $("challenge-progress").textContent = String(count).padStart(2, "0") + " / " + total;
    const verb = question.kind === 'chord' ? 'LISTEN' : 'READ';
    const stages = ['FOUNDATIONS', 'EXPLORE', 'STRETCH'];
    const level = state.room || !state.soloConfig?.progressive || state.isReview ? '' :
      ` · ${stages[question.level ?? 0]}`;
    $("challenge-question-label").textContent = state.isReview || question.followupFor ? `${verb} · RETRY` : verb + level;
    $("challenge-prompt").textContent = question.kind === "chord" ? "Which chord?" : "Name this note.";
    $("challenge-stimulus").replaceChildren();
    $("challenge-stimulus").classList.toggle("hidden", question.kind !== "staff");
    $('challenge-sound-visual').classList.toggle('hidden', question.kind !== 'chord');
    if (question.kind === "staff") $("challenge-stimulus").appendChild(global.DiapasonStaff.render(question.note));
    $("challenge-replay").textContent = question.kind === "chord" ? "▶ Replay · Space" : "▶ Hear note · Space";
    $("challenge-replay").classList.toggle("quiet-replay", question.kind === "staff");
    $("challenge-options").replaceChildren(...question.choices.map((choice, index) => makeButton(choice, index, question)));
    $('challenge-answer-range').textContent = `1–${question.choices.length}`;
    state.compareNotes = null;
    state.answerPiano = null;
    state.comparePiano = null;
    state.answerStaff = null;
    state.compareStaff = null;
    state.contrastCue = '';
    $('challenge-staff-contrast').classList.add('hidden');
    $('challenge-compare').classList.add('hidden');
    $("challenge-reveal").classList.add("hidden");
    $('challenge-result').classList.add('hidden');
    $('challenge-result').classList.remove('answer-correct', 'answer-wrong');
    $('challenge-play').classList.remove('is-reveal');
    $("challenge-feedback").textContent = "";
    $("challenge-feedback").className = "challenge-feedback";
    $("challenge-next").classList.add("hidden");
    $('challenge-hold').classList.add('hidden');
    $('challenge-advance-hint').classList.add('hidden');
    $("challenge-waiting").classList.add("hidden");
    show("play");
  }
  function markAnswers(question, choice) {
    [...$("challenge-options").children].forEach(button => {
      button.disabled = true;
      button.classList.toggle("correct", question.acceptedIds.includes(button.dataset.choice));
      button.classList.toggle("wrong", button.dataset.choice === choice && !question.acceptedIds.includes(choice));
    });
  }
  function revealQuestion(question, result) {
    markAnswers(question, result?.choice);
    $('challenge-waiting').classList.add('hidden');
    $('challenge-play').classList.add('is-reveal');
    $('challenge-result').classList.remove('hidden');
    feedbackEffect(result?.choice ? (result.correct ? 'correct' : 'wrong') : 'timeout');
    const feedback = $("challenge-feedback");
    feedback.classList.add(result?.correct ? "correct" : "wrong");
    const selectedName = result?.choice ? (question.kind === 'chord' ? Core.TYPE_BY_ID[result.choice]?.label : result.choice) : null;
    feedback.textContent = result?.correct ? `${question.followupFor ? 'Recovered' : 'Correct'} · +${result.points}` :
      (selectedName ? `Not quite · you chose ${selectedName}` : "Time's up");
    const name = $("challenge-reveal-name");
    const learning = $('challenge-learning');
    const piano = $("challenge-reveal-piano");
    const staff = $('challenge-reveal-staff');
    const compare = $('challenge-compare');
    const replay = $('challenge-result-replay');
    $('challenge-result-label').textContent = 'THE ANSWER';
    compare.classList.add('hidden');
    replay.textContent = '▶ Hear it again';
    piano.replaceChildren();
    $('challenge-piano-caption').classList.add('hidden');
    staff.replaceChildren();
    staff.classList.toggle('hidden', question.kind !== 'staff');
    if (question.kind === "chord") {
      const type = Core.TYPE_BY_ID[question.typeId];
      const original = T.chordName(question.rootMidi, type);
      const alternatives = Core.interpretations(question.notes, { chordTypes: question.acceptedIds, inversions: true })
        .filter(item => item.typeId !== question.typeId)
        .map(item => T.chordName(item.rootMidi, Core.TYPE_BY_ID[item.typeId]));
      const unique = [...new Set(alternatives)];
      const spelled = T.spellChord(question.rootMidi, type);
      state.answerPiano = { notes: question.notes,
        rootMidi: question.rootMidi + (question.inversion ? 12 : 0), names: spelled.byPc,
        title: original + (unique.length ? ' · also ' + unique.join(' / ') : ''),
        learning: `${spelled.names.join(' · ')}  |  ${CHORD_CUES[type.id]}` };
      if (selectedName && !result.correct) {
        const selectedType = Core.TYPE_BY_ID[result.choice];
        const base = T.buildChord(question.rootMidi, selectedType.intervals);
        const selectedInversion = Math.min(question.inversion, base.length - 1);
        state.compareNotes = selectedInversion ? T.invert(base, selectedInversion) : base;
        state.compareTimbre = question.timbre;
        state.compareArpeggio = question.arpeggio;
        const selectedSpelling = T.spellChord(question.rootMidi, selectedType);
        state.comparePiano = { notes: state.compareNotes,
          rootMidi: question.rootMidi + (selectedInversion ? 12 : 0),
          names: selectedSpelling.byPc,
          title: T.chordName(question.rootMidi, selectedType),
          learning: `${selectedSpelling.names.join(' · ')}  |  ${CHORD_CUES[selectedType.id]}` };
        const contrast = chordDifference(question.notes, spelled.byPc,
          state.compareNotes, selectedSpelling.byPc);
        state.answerPiano.differentPcs = contrast.changed;
        state.comparePiano.differentPcs = contrast.changed;
        state.contrastCue = contrast.cue;
        compare.textContent = '▶ Compare sounds';
        compare.classList.remove('hidden');
        replay.textContent = '▶ Hear answer';
      }
      showResultPiano('answer');
    } else {
      state.answerStaff = { title: question.note.letter + question.note.octave,
        learning: staffCue(question.note) };
      if (selectedName && !result.correct) {
        const chosen = nearestStaffNote(question.note, selectedName);
        state.compareStaff = { note: chosen, title: `${chosen.letter}${chosen.octave} (nearest)`,
          learning: staffCue(chosen) };
        $('challenge-staff-choice-label').textContent = `NEAREST ${chosen.letter}`;
        $('challenge-staff-answer-label').textContent = `ANSWER ${question.note.letter}`;
        $('challenge-staff-contrast').classList.remove('hidden');
        staff.appendChild(global.DiapasonStaff.renderComparison(question.note, chosen));
        compare.textContent = '▶ Compare notes';
        compare.classList.remove('hidden');
        replay.textContent = '▶ Hear answer';
      } else staff.appendChild(global.DiapasonStaff.render(question.note));
      showResultStaff('answer');
    }
    $("challenge-reveal").classList.remove("hidden");
    if (result?.choice && !result.correct) autoCompareAfterMiss();
  }
  function staffCue(note) {
    const ref = note.clef === 'treble' ? 30 : 18;
    const offset = global.DiapasonStaff.diatonicIndex(note.letter, note.octave) - ref;
    const positions = ['bottom line', 'bottom space', 'second line', 'second space',
      'middle line', 'third space', 'fourth line', 'top space', 'top line'];
    const ordinal = ['first', 'second', 'third', 'fourth'];
    let position = positions[offset];
    if (!position && offset < 0) {
      const distance = -offset;
      position = distance === 1 ? 'space below the staff' : distance % 2 === 0
        ? `${ordinal[distance / 2 - 1] || 'lower'} ledger line below`
        : `space below the ${ordinal[Math.floor(distance / 2) - 1] || 'last'} ledger line`;
    }
    if (!position && offset > 8) {
      const distance = offset - 8;
      position = distance === 1 ? 'space above the staff' : distance % 2 === 0
        ? `${ordinal[distance / 2 - 1] || 'higher'} ledger line above`
        : `space above the ${ordinal[Math.floor(distance / 2) - 1] || 'last'} ledger line`;
    }
    return `${position} · ${note.clef} clef`;
  }
  function updateClock() {
    if ($("challenge-play").classList.contains("hidden")) return;
    if (!state.room && state.soloAnswered) {
      $('challenge-time').textContent = '—';
      $('challenge-timer-fill').style.width = '0%';
      return;
    }
    let remaining;
    let duration;
    if (state.room) {
      if (state.room.phase !== "question") {
        $("challenge-time").textContent = "—";
        $("challenge-timer-fill").style.width = "0%";
        return;
      }
      remaining = state.room.deadline - (Date.now() + state.serverOffset);
      duration = state.room.settings.seconds * 1000;
    } else {
      remaining = state.soloDeadline - Date.now();
      duration = state.soloConfig ? state.soloConfig.seconds * 1000 : 25000;
      if (remaining <= 0 && !state.soloAnswered) answer(null);
    }
    $("challenge-time").textContent = Math.ceil(Math.max(0, Math.min(duration, remaining)) / 1000) + "s";
    $("challenge-timer-fill").style.width = (Math.max(0, Math.min(1, remaining / duration)) * 100) + "%";
  }
  function nextSolo() {
    clearTimeout(state.nextTimer);
    clearTimeout(state.compareTimer);
    state.soloIndex++;
    if (state.soloIndex >= state.soloDeck.length) return finishSolo();
    openSolo();
  }
  function openSolo() {
    const question = currentQuestion();
    state.soloAnswered = false;
    state.soloStartedAt = Date.now();
    state.soloDeadline = state.soloStartedAt + state.soloConfig.seconds * 1000;
    renderQuestion(question, state.soloIndex + 1, state.soloDeck.length);
    $("challenge-score").textContent = state.soloTotal;
    $('challenge-streak').textContent = state.soloStreak;
    if (question.kind === "chord") playQuestion(question);
    updateClock();
  }
  function beginSolo(config, deck = null, review = false, reviewSources = []) {
    error("");
    try {
      Audio.getContext(); // Start audio from this user gesture.
      state.room = null;
      state.soloConfig = config;
      state.soloDeck = deck || Core.makeDeck(config);
      state.soloIndex = state.soloTotal = state.soloCorrect = state.soloStreak = state.soloBestStreak = 0;
      state.soloAttempts = [];
      state.soloResolved = [];
      state.isReview = review;
      state.reviewSources = reviewSources;
      openSolo();
    } catch (caught) { error(caught.message); }
  }
  function startSolo() {
    try { beginSolo(settings()); }
    catch (caught) { error(caught.message); }
  }
  function quickConfig() {
    return Core.validSettings({ mode: 'mixed', rounds: 12, seconds: 25,
      inversions: true, arpeggio: true, progressive: true, timbre: $('instrument').value });
  }
  async function quickSolo() {
    if (state.room) await leave();
    beginSolo(quickConfig());
  }
  async function continuePractice() {
    if (state.room) await leave();
    const progress = readProgress();
    if (!progress.pending.length) return;
    try {
      const config = quickConfig();
      const sources = progress.pending.slice(0, 12);
      const deck = Core.makeTransferDeck(sources, config, { exclude: [] });
      beginSolo(config, deck, true, sources);
    } catch (caught) { error(caught.message); }
  }
  function finishSolo() {
    show("finish");
    $("challenge-finish-title").textContent = state.isReview ? 'Review complete' : 'Set complete';
    const recovered = state.soloAttempts.filter(item => item.result.correct && item.question.followupFor).length;
    $("challenge-finish-summary").textContent = `${state.soloCorrect} / ${state.soloDeck.length} correct` +
      (recovered ? ` · ${recovered} recovered` : '') + ` · ${state.soloTotal} points`;
    const recap = $('challenge-recap');
    recap.replaceChildren();
    const groups = [['Chords', 'chord'], ['Notes', 'staff']];
    groups.forEach(([label, kind]) => {
      const attempts = state.soloAttempts.filter(item => item.question.kind === kind);
      if (!attempts.length) return;
      const tile = document.createElement('div');
      const caption = document.createElement('span'); caption.textContent = label;
      const value = document.createElement('strong');
      value.textContent = `${attempts.filter(item => item.result.correct).length} / ${attempts.length}`;
      tile.append(caption, value); recap.appendChild(tile);
    });
    const streakTile = document.createElement('div');
    const caption = document.createElement('span'); caption.textContent = 'Best streak';
    const value = document.createElement('strong'); value.textContent = state.soloBestStreak;
    streakTile.append(caption, value); recap.appendChild(streakTile);
    recap.classList.remove('hidden');
    const misses = state.soloAttempts.filter(item => !item.result.correct);
    let reviewCount = misses.length;
    const note = $('challenge-finish-note');
    note.classList.toggle('hidden', !state.soloConfig?.progressive ||
      (!state.isReview && state.soloTotal === 0 && readProgress().bestScore === 0));
    if (state.soloConfig?.progressive) {
      const outcome = Progress.record(readProgress(), state.soloAttempts, state.soloTotal,
        { review: state.isReview, reviewed: state.reviewSources, resolved: state.soloResolved });
      saveProgress(outcome.progress);
      reviewCount = outcome.progress.pending.length;
      note.textContent = state.isReview
        ? (outcome.progress.pending.length ? `${outcome.cleared} cleared · ${outcome.progress.pending.length} to revisit` : 'All clear for now.')
        : (outcome.isNewBest ? 'New personal best' : `Personal best · ${outcome.progress.bestScore.toLocaleString()} points`);
    }
    const review = $('challenge-review');
    const playAgain = $('challenge-finish-action');
    review.classList.toggle('hidden', !reviewCount);
    review.classList.toggle('primary', !!reviewCount);
    review.classList.toggle('secondary', !reviewCount);
    review.textContent = `Practice misses (${reviewCount})`;
    playAgain.classList.toggle('primary', !reviewCount);
    playAgain.classList.toggle('secondary', !!reviewCount);
    if (reviewCount) playAgain.before(review);
    else playAgain.after(review);
    $("challenge-final-standings").replaceChildren();
    playAgain.textContent = "Play again →";
  }
  function reviewMisses() {
    const misses = state.soloConfig?.progressive ? readProgress().pending.slice(0, 12) :
      state.soloAttempts.filter(item => !item.result.correct).map(item => item.question);
    if (!misses.length) return;
    let deck;
    try { deck = Core.makeTransferDeck(misses, state.soloConfig, { exclude: state.soloDeck }); }
    catch { deck = Core.makeTransferDeck(misses, state.soloConfig, { exclude: [] }); }
    beginSolo(state.soloConfig, deck, true, misses);
  }
  function adaptQuickDeck() {
    if (!state.soloConfig?.progressive || state.isReview || ![3, 7].includes(state.soloIndex)) return;
    const start = state.soloIndex + 1;
    const recentCorrect = state.soloAttempts.slice(-4).filter(item => item.result.correct).length;
    const currentLevel = state.soloDeck[state.soloIndex].level ?? 0;
    const nextLevel = recentCorrect >= 3 ? Math.min(2, currentLevel + 1) : currentLevel;
    const kinds = state.soloDeck.slice(start, start + 4).map(question => question.kind);
    try {
      const segment = Core.makeDeck({ ...state.soloConfig, rounds: 4 }, Math.random,
        { level: nextLevel, kinds, exclude: state.soloDeck.slice(0, start) });
      segment.forEach((question, index) => { question.id = start + index + 1; });
      state.soloDeck.splice(start, 4, ...segment);
    } catch { /* The original varied deck remains playable if filters are too narrow. */ }
  }
  function queueImmediateFollowup(source) {
    if (!state.soloConfig?.progressive || state.isReview || source.followupFor ||
      state.soloIndex >= state.soloDeck.length - 1) return;
    const nextIndex = state.soloIndex + 1;
    const sameKindIndex = state.soloDeck.findIndex((question, index) =>
      index >= nextIndex && question.kind === source.kind && !question.followupFor);
    if (sameKindIndex < 0) return;
    try {
      const followup = Core.makeTransferDeck([source], state.soloConfig,
        { exclude: state.soloDeck })[0];
      followup.followupFor = Progress.compact(source);
      followup.id = nextIndex + 1;
      const displaced = state.soloDeck[nextIndex];
      state.soloDeck[nextIndex] = followup;
      if (sameKindIndex !== nextIndex) {
        displaced.id = sameKindIndex + 1;
        state.soloDeck[sameKindIndex] = displaced;
      }
    } catch { /* A narrow sound pool leaves the original round in place. */ }
  }
  async function answer(choice) {
    const question = currentQuestion();
    if (!question) return;
    if (state.room) {
      if (state.room.phase !== "question" || state.room.self.submitted || Date.now() + state.serverOffset < state.room.startsAt) return;
      [...$('challenge-options').children].forEach(button => { button.disabled = true; });
      try {
        const data = await request(`/api/rooms/${state.room.code}/submit`, { method: "POST", body: { choice } });
        acceptRoom(data.room);
      } catch (caught) {
        $("challenge-feedback").textContent = caught.message;
        if (state.room?.phase === 'question') [...$('challenge-options').children].forEach(button => { button.disabled = false; });
      }
      return;
    }
    if (state.soloAnswered) return;
    state.soloAnswered = true;
    const elapsed = Math.min(state.soloConfig.seconds * 1000, Date.now() - state.soloStartedAt);
    const result = Core.grade(question, choice, elapsed, state.soloConfig.seconds);
    state.soloTotal += result.points;
    state.soloAttempts.push({ question, result });
    if (result.correct) { state.soloCorrect++; state.soloStreak++; state.soloBestStreak = Math.max(state.soloBestStreak, state.soloStreak); }
    else state.soloStreak = 0;
    if (result.correct && question.followupFor) state.soloResolved.push(question.followupFor);
    adaptQuickDeck();
    if (!result.correct) queueImmediateFollowup(question);
    $("challenge-score").textContent = state.soloTotal;
    $('challenge-streak').textContent = state.soloStreak;
    revealQuestion(question, result);
    $("challenge-next").classList.remove("hidden");
    $('challenge-advance-hint').classList.remove('hidden');
    const waitForLearner = $('challenge-pause-reveal').checked || !result.correct;
    const lastQuestion = state.soloIndex === state.soloDeck.length - 1;
    $('challenge-next').textContent = lastQuestion ? 'See results →' : 'Next question →';
    $('challenge-advance-hint').textContent = waitForLearner ? 'Continue when ready.' :
      lastQuestion ? 'Results in 5 seconds.' : 'Next round in 5 seconds.';
    $('challenge-hold').classList.toggle('hidden', waitForLearner);
    if (!waitForLearner) state.nextTimer = setTimeout(nextSolo, 5000);
    $('challenge-next').focus({ preventScroll: true });
    updateClock();
  }

  async function request(path, { method = "GET", body } = {}) {
    const response = await fetch(path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(state.roomToken ? { 'X-Player-Token': state.roomToken } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }
  function saveRoom() {
    if (state.room && state.roomToken) localStorage.setItem('diapason-room', JSON.stringify({ code: state.room.code, token: state.roomToken }));
    else localStorage.removeItem('diapason-room');
  }
  function stopPoll() { clearTimeout(state.pollTimer); state.pollTimer = null; }
  function pollSoon(delay = 950) {
    stopPoll();
    if (state.room) state.pollTimer = setTimeout(pollRoom, delay);
  }
  async function pollRoom() {
    if (!state.room || state.pollBusy) return;
    state.pollBusy = true;
    try { acceptRoom((await request(`/api/rooms/${state.room.code}`)).room); }
    catch (caught) { $("challenge-feedback").textContent = caught.message; }
    finally { state.pollBusy = false; pollSoon(); }
  }
  function rows(container, players, reveal = false) {
    container.replaceChildren();
    players.slice().sort((a, b) => b.total - a.total).forEach((player, index) => {
      const row = document.createElement('div'); row.className = 'player-row';
      const name = document.createElement('span'); name.textContent = `${index + 1}. ${player.name}${player.isHost ? ' ♛' : ''}`;
      const score = document.createElement('strong');
      score.textContent = reveal ? `${player.total} pts` : (player.submitted ? 'Answered' : 'Listening');
      row.append(name, score); container.appendChild(row);
    });
  }
  function acceptRoom(view) {
    const previous = state.room;
    state.room = view;
    state.serverOffset = view.serverNow - Date.now();
    saveRoom();
    if (view.phase === 'lobby') {
      show('lobby');
      $('challenge-room-code').textContent = view.code;
      rows($('challenge-lobby-players'), view.players);
      $('challenge-room-start').classList.toggle('hidden', !view.self.isHost);
    } else if (view.phase === 'finished') {
      state.shownQuestionId = state.shownPhase = null;
      show('finish');
      $('challenge-finish-title').textContent = 'Match complete';
      $('challenge-finish-summary').textContent = `${view.roundCount} rounds · final standings`;
      $('challenge-finish-note').classList.add('hidden');
      $('challenge-recap').classList.add('hidden');
      $('challenge-review').classList.add('hidden');
      rows($('challenge-final-standings'), view.players, true);
      const action = $('challenge-finish-action');
      action.classList.add('primary');
      action.classList.remove('secondary');
      action.textContent = view.self.isHost ? 'Play again →' : 'Leave room';
    } else {
      const question = view.question;
      if (state.shownQuestionId !== question.id) {
        state.shownQuestionId = question.id;
        state.shownPhase = 'question';
        renderQuestion(question, view.roundIndex + 1, view.roundCount);
        if (question.kind === 'chord') {
          state.soundTimer = setTimeout(() => {
            if (state.room?.question?.id === question.id) playQuestion(question);
          }, Math.max(0, view.startsAt - (Date.now() + state.serverOffset)));
        }
      }
      const currentPlayer = view.players.find(player => player.id === view.self.id);
      $('challenge-score').textContent = currentPlayer?.total ?? 0;
      $('challenge-streak').textContent = currentPlayer?.streak ?? 0;
      if (view.phase === 'question') {
        const before = Date.now() + state.serverOffset < view.startsAt;
        [...$('challenge-options').children].forEach(button => { button.disabled = before || view.self.submitted; });
        $('challenge-waiting').classList.toggle('hidden', !before && !view.self.submitted);
        $('challenge-waiting').textContent = before ? 'Get ready — the round is starting.' : 'Answer locked. Waiting for everyone…';
        if (view.self.submitted) {
          [...$('challenge-options').children].forEach(button => { button.disabled = true; });
          $('challenge-waiting').classList.remove('hidden');
        }
      } else if (state.shownPhase !== 'reveal') {
        state.shownPhase = 'reveal';
        revealQuestion(question, view.self.result);
        $('challenge-result-replay').focus({ preventScroll: true });
        $('challenge-advance-hint').textContent = 'Next round soon.';
        $('challenge-advance-hint').classList.remove('hidden');
      }
      rows($('challenge-standings'), view.players, view.phase === 'reveal');
      $('challenge-standings').classList.toggle('hidden', view.phase !== 'reveal');
      updateClock();
    }
    if (!previous || previous.phase !== view.phase) error('');
    pollSoon();
  }
  async function createRoom(event) {
    event.preventDefault(); error('');
    try {
      const config = settings();
      Audio.getContext();
      state.roomToken = null;
      const data = await request('/api/rooms', { method: 'POST', body: { name: $('challenge-create-name').value, settings: config } });
      state.roomToken = data.token; acceptRoom(data.room);
    } catch (caught) { error(caught.message); }
  }
  async function joinExisting(event) {
    event.preventDefault(); error('');
    try {
      Audio.getContext();
      const code = $('challenge-join-code').value.trim().toUpperCase();
      const data = await request(`/api/rooms/${code}/join`, { method: 'POST',
        body: { name: $('challenge-join-name').value, token: state.roomToken } });
      state.roomToken = data.token; acceptRoom(data.room);
    } catch (caught) { error(caught.message); }
  }
  async function leave() {
    try { if (state.room) await request(`/api/rooms/${state.room.code}/leave`, { method: 'POST' }); } catch {}
    stopPoll(); clearTimeout(state.soundTimer);
    state.room = state.roomToken = null;
    state.shownQuestionId = state.shownPhase = null;
    saveRoom(); setTab('room');
  }
  async function startRoom() {
    try { acceptRoom((await request(`/api/rooms/${state.room.code}/start`, { method: 'POST' })).room); }
    catch (caught) { error(caught.message); }
  }
  function onKeyDown(event) {
    if (!$('challenge').classList.contains('active') || $('challenge-play').classList.contains('hidden')) return;
    if (event.metaKey || event.ctrlKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if (event.key === ' ') {
      event.preventDefault();
      clearTimeout(state.compareTimer);
      $('challenge-compare').disabled = false;
      if (state.compareNotes || state.compareStaff) $('challenge-compare').textContent = '▶ Compare again';
      playQuestion(currentQuestion());
      if (!$('challenge-result').classList.contains('hidden')) {
        showResultPiano('answer');
        showResultStaff('answer');
      }
    }
    else if (/^[1-4]$/.test(event.key)) {
      const button = $('challenge-options').children[Number(event.key) - 1];
      if (button && !button.disabled) { event.preventDefault(); button.click(); }
    }
  }
  function init() {
    buildTypeToggles();
    const savedMotion = localStorage.getItem('diapason-motion');
    $('challenge-motion').checked = savedMotion === null
      ? !global.matchMedia('(prefers-reduced-motion: reduce)').matches : savedMotion === 'true';
    $('challenge-haptics').checked = localStorage.getItem('diapason-haptics') === 'true';
    $('challenge-pause-reveal').checked = localStorage.getItem('diapason-pause-reveal') === 'true';
    $('challenge-haptics-wrap').classList.toggle('hidden', typeof navigator.vibrate !== 'function');
    $('challenge-motion').addEventListener('change', event => localStorage.setItem('diapason-motion', String(event.target.checked)));
    $('challenge-haptics').addEventListener('change', event => localStorage.setItem('diapason-haptics', String(event.target.checked)));
    $('challenge-pause-reveal').addEventListener('change', event => localStorage.setItem('diapason-pause-reveal', String(event.target.checked)));
    $('challenge-solo-tab').addEventListener('click', () => setTab('solo'));
    $('challenge-room-tab').addEventListener('click', () => setTab('room'));
    $('challenge-start').addEventListener('click', startSolo);
    $('challenge-create-form').addEventListener('submit', createRoom);
    $('challenge-join-form').addEventListener('submit', joinExisting);
    $('challenge-room-start').addEventListener('click', startRoom);
    $('challenge-leave').addEventListener('click', leave);
    $('challenge-copy-link').addEventListener('click', async () => {
      const link = `${location.origin}${location.pathname}?room=${state.room.code}`;
      try { await navigator.clipboard.writeText(link); $('challenge-copy-link').textContent = 'Link copied ✓'; }
      catch { $('challenge-copy-link').textContent = link; }
    });
    $('challenge-replay').addEventListener('click', () => playQuestion(currentQuestion()));
    $('challenge-result-replay').addEventListener('click', () => {
      clearTimeout(state.compareTimer);
      $('challenge-compare').disabled = false;
      if (state.compareNotes || state.compareStaff) $('challenge-compare').textContent = '▶ Compare again';
      playQuestion(currentQuestion());
      showResultPiano('answer');
      showResultStaff('answer');
    });
    $('challenge-compare').addEventListener('click', runComparison);
    $('challenge-hold').addEventListener('click', () => {
      clearTimeout(state.nextTimer);
      $('challenge-hold').classList.add('hidden');
      $('challenge-advance-hint').textContent = 'Continue when ready.';
    });
    $('challenge-exit').addEventListener('click', () => {
      clearTimeout(state.compareTimer);
      if (state.room) leave();
      else { clearTimeout(state.nextTimer); state.soloDeck = state.soloConfig = null; show('setup'); }
    });
    $('challenge-next').addEventListener('click', nextSolo);
    $('challenge-finish-action').addEventListener('click', () => {
      if (state.room) { if (state.room.self.isHost) startRoom(); else leave(); }
      else beginSolo(state.soloConfig);
    });
    $('challenge-review').addEventListener('click', reviewMisses);
    document.addEventListener('keydown', onKeyDown);
    updateHomeProgress();
    state.heartbeat = setInterval(updateClock, 100);
    const invite = new URLSearchParams(location.search).get('room');
    if (invite) { setTab('room'); $('challenge-join-code').value = invite.toUpperCase(); }
    try {
      const saved = JSON.parse(localStorage.getItem('diapason-room') || 'null');
      if (saved?.code && saved?.token) {
        state.room = { code: saved.code }; state.roomToken = saved.token;
        request(`/api/rooms/${saved.code}`).then(data => { setTab('room'); acceptRoom(data.room); })
          .catch(() => { state.room = state.roomToken = null; saveRoom(); });
      }
    } catch {}
  }
  function onEnter() {
    if (state.room) { if (state.room.phase) acceptRoom(state.room); else pollSoon(0); }
    else if (!state.soloDeck || state.soloIndex >= state.soloDeck.length) show('setup');
  }
  global.DiapasonChallenge = { init, onEnter, quickSolo, continuePractice, setTab };
})(window);
