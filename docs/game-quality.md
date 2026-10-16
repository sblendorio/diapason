# Game quality measurements

The target for iterative review is a mean **9.5/10** across at least three independent judges. Each judge rates usability, visual design, enjoyment, and learning value after playing the actual game. The judge mean is the average of those four dimensions; the overall score is the average of judge means. A higher score must be supported by observed behavior, not only a visual opinion.

| Measure | How to check | Target |
| --- | --- | --- |
| Entry friction | Actions from landing to a playable question | One visible action at 390 × 844 |
| Round fit | Bounds of stimulus, all answers, and controls | No horizontal overflow or hidden answer at 390 × 844 and 1440 × 900 |
| Feedback response | Time from answer input to readable result | Under 150 ms in local headless testing |
| Error study time | Wait on a wrong solo answer without user input | No forced advance |
| Learning transfer | Try a related new example after a miss | Report separately from identical-item recall |
| Musical fairness | Grade all answer choices with exact sounding voicing | Every equivalent answer accepted; at least one wrong choice |
| Room fairness | Two isolated players in one room | Same question/deadline; no answer leakage before reveal |
| Motion access | Reduced motion and opt-in haptics | Meaning remains clear with both effects off |

These are lab checks. Real completion, replay, retention, and learning gains need actual user data before being stated as outcomes.

## Review ledger

| Pass | Judge means | Overall | Main observed blocker |
| --- | --- | ---: | --- |
| 1 | UX 6.00, visual 6.63, learning 6.40 | 6.34 | Timed answers and results below the phone viewport; weak learning cues |
| 2 | UX 6.75, visual 7.58, learning 7.00 | 7.11 | Abrupt opening difficulty; staff vanishes during explanation; identical miss review |
| 3 | UX 7.25, visual 8.03, learning 7.53 | 7.60 | Four advanced qualities at the opening; repeated sounds; notes too far beyond staff |
| 4 | UX 7.50, visual 8.38, learning 7.75 | 7.88 | A/B playback differed in articulation; retries could repeat earlier sounds; chosen notes not shown |
| 6 | UX 7.63, visual 8.48, learning 7.95 | 8.02 | Zero-point first set falsely called a best; saved misses overwritten by later sets; practice wording inconsistent |
| 7 | UX 7.80, visual 8.38, learning 8.08 | 8.09 | Saved practice hidden behind the new-game action; Foundations retries jumped to four advanced choices |
| 8 | UX 7.90, visual 8.68, learning 8.35 | 8.31 | A/B teaching required another click; the active set did not revisit a miss |
| 9 | UX 8.13, visual 8.75, learning 8.60 | 8.49 | Final-round action implied another question; recap hid recovered misses; automatic comparison felt idle during the original sound |
| 10 | UX 8.20, visual 8.83, learning 8.75 | 8.59 | Recognition rounds still rely on text answers; no path from a finished set into creating with its chords |

Pass 5 has only a partial visual score (8.43). The other two judges reached a Codex usage limit before scoring, so there is no comparable overall mean. The partial review found that the keyboard switched to the chosen chord while the title still named the answer; this was corrected and checked in a headless browser. Release verification below remains independent of the judge score.

Pass 6 measured the first version of local progress. The identified issues were corrected afterward: the home and finish actions now both say **Practice misses**, a zero-point set is not praised as a new best, and unrelated sets preserve the bounded miss queue. An isolated headless run verified miss → new set → practice → clear. Correct answers now advance after five seconds; wrong answers still wait for the player.

Pass 7 measured the persistent practice loop on mobile and desktop. The two main issues were corrected afterward: saved practice becomes the primary home action when the queue is nonempty, and a retry keeps the missed question's difficulty level. The independent judges still found limited immediate musical guidance after a miss and a fairly static game screen. These remain the next design targets; the 9.5 target has not been reached.

Pass 8 checked chord and staff comparison on phone and desktop. The result now visually distinguishes the selected and correct sounds, but the judges found that comparison still required an extra click and the set waited until its end to retry a miss. The next iteration started the sound comparison after a wrong solo answer and used a nearby fresh example in the next suitable round.

Pass 9 checked the automatic comparison and fresh retry in full phone and desktop sets. Correct retries cleared their source miss; failed retries left it in practice. The next iteration labels the final action **See results**, names the original-sound phase **Listening to question**, and counts recovered misses in the finish summary.

Pass 10 confirmed these changes in full headless sets, a one-question review, and phone and desktop layouts. The 9.5 target was not reached. The next large improvement is a more instrument-like answer interaction and a path from recognition into creating musical ideas. The finish screen now promotes saved practice over a new game when misses remain; this final change was checked locally but did not receive a new three-judge score before release.

Each pass uses an isolated headless browser. The user's active browser is never used for testing. The reusable review procedure is in the local `game-ux-feedback` skill.
