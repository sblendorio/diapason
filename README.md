# Diapason

A small music practice game. Play a 12-round set of chord listening and staff reading, choose a focused practice set, or create a room and compete with friends. **Play now** starts with familiar chords and notes near the middle of the staff, then widens the challenge as answers improve.

The interface starts in dark mode and supports keyboard answers (`1`–`4`), `Space` to replay, a light mode switch, reduced motion, and optional vibration. Solo results explain the answer and let you retry misses with related new examples. Correct answers move on after five seconds; wrong answers wait until you continue. Quick-play best scores and up to 30 missed sounds are saved locally. **Practice misses** reviews up to 12 at a time and works after a reload; no account is required.

## Run locally

Node.js 20 or newer is required. There are no runtime packages to install.

```sh
npm test
npm run build
npm start
```

Open `http://localhost:4173`. `npm run build` copies the browser files into `dist/`. The Node server serves `dist/` and the room API. Room state is in memory locally, so rooms disappear when the process restarts. Run one server instance for a shared room.

## Portainer / Docker Compose

Create a Portainer stack from [`compose.yaml`](compose.yaml). It pulls the published image and serves Diapason on port `4173` by default. Set `DIAPASON_PORT` in the stack environment to use a different host port. Set `DIAPASON_TAG` to pin a release tag such as `v1.1.0` instead of `latest`.

To build the image from this checkout:

```sh
docker compose -f compose.yaml -f compose.build.yaml up --build -d
```

Stop with `docker compose -f compose.yaml -f compose.build.yaml down`. The container is a single Node server; its room state is in memory and does not survive a restart. The health check calls `/api/health`.

## Vercel

The Vercel project builds the same browser files from this repository. Its `/api/rooms` routes use Upstash Redis REST storage because serverless functions do not share memory. Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` in the Vercel project for multiplayer rooms. Diapason uses keys prefixed `diapason:room:` so it can share an Upstash database with another app without sharing room records. Solo play works without these variables.

Each Vercel project connects to one Git repository; this project is connected to `p4xx07/diapason`. A single Vercel project can host both apps only by combining them into one repository/build, or by making one app a separately hosted subdomain. This release keeps Diapason independent.

## Musical rules

Chord answers are graded from the exact sounding MIDI notes and voicing. If two enabled chord names describe the same voicing, either answer is accepted. For example, an inverted suspended chord can coincide with another suspended chord. Enharmonic roots such as C♯ and D♭ are shown as one chord-type answer, so the game does not ask players to distinguish identical sounds. The result lists alternate interpretations when present. Staff answers use natural letter names.

## Project files

- `js/game-core.js`: shared deck generation, equivalence, and scoring for solo and rooms.
- `js/progress-core.js`: local practice queue and comparable quick-play records.
- `js/challenge.js`: browser game and room flow.
- `rooms.mjs`, `api-handler.mjs`, `server.mjs`: room state, HTTP API, and local server.
- `api/room.mjs`, `redis-rest.mjs`: Vercel API and Redis REST store.
- `js/theory.js`, `js/audio.js`, `js/staff-render.js`, `js/piano-render.js`: music theory, sound, and notation.
- [`docs/chord-explorer-plan.md`](docs/chord-explorer-plan.md): next feature proposal.
- [`docs/game-quality.md`](docs/game-quality.md): game quality measurements and review history.

Audio uses the Web Audio API and begins after a player gesture, as browsers require.
