# Next: turn Chord Explorer into an idea sketchpad

## Goal

Let someone hear a chord, change it, and capture a short musical idea before the sound is forgotten. Keep the existing root, type, octave, inversion, arpeggio, and instrument controls.

## Proposed first version

1. **Audition immediately.** Selecting a root or chord type plays the current voicing. The selected chord appears on a compact piano with its note names; changing inversion previews the new voicing.
2. **Build a phrase.** An **Add to idea** action appends the current chord to a 1–8 slot strip. Tap a slot to replay it, drag or use move controls to reorder it, and remove or replace a slot. Show bar divisions every four slots.
3. **Hear the phrase.** Play/stop the whole strip at a chosen tempo. A visible playhead follows the sounding chord. Each slot has a simple duration choice (one, two, or four beats). Keep one instrument for the whole idea initially.
4. **Suggest the next chord.** Offer a small set of optional, playable suggestions based on a chosen key and common diatonic moves. Label suggestions as ideas, not rules; allow any chord regardless of key. Show common tones and nearest voice movement so a suggestion teaches *why* it connects.
5. **Keep and share it.** Save ideas in local storage, name them, and encode a short idea in a shareable URL. A link opens the idea for listening and editing. Export the sequence as a `.mid` file after the core flow is stable; do not claim MIDI export until tested in another player.

## Interaction sketch

On phones, the current chord and **Add to idea** stay visible above the chord picker. The idea strip scrolls horizontally while the selected slot remains visible. On desktop, the picker and idea strip sit side by side. Space plays or stops the idea when focus is not in an input; arrow keys move through slots; buttons remain usable with touch and keyboard. Playback uses one scheduler so stopping, tab changes, and rapid edits cannot leave hanging notes.

## Music and data rules

Store each slot as `{ rootMidi, typeId, inversion, durationBeats }`, plus idea tempo, key preference, and schema version. Build the sounding MIDI notes from the shared theory module; do not store only a chord label. Keep enharmonic spelling as a display choice while playback and common-tone calculations use pitch classes. Suggested voice leading should search a limited octave range and preserve the actual voicing shown in the piano.

## Acceptance checks

- A new player can hear a chord and make a four-chord idea on a phone without opening a help panel.
- Replay, reorder, replace, undo removal, save, reload, and share preserve the exact notes and order.
- Playhead, stop, and audio timing remain coherent through rapid edits and a backgrounded tab.
- Suggestions show a reason and never block a chromatic chord choice.
- A shared link is read-only until edited locally and contains no user identity.
- Headless tests cover the sequence model, URL round trip, mobile fit, and keyboard flow; human listening checks confirm the scheduled audio and musical usefulness.

## Delivery order

Implement the phrase strip and playback first, then persistence/share, then suggestions. Evaluate the first version with the same usability, design, enjoyment, and learning judges before adding more controls.
