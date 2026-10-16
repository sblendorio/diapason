import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, startRoom, submitAnswer, advanceRoom, roomView, playerFor } from '../rooms.mjs';
import { createAppServer } from '../server.mjs';

test('two players get the same timed question and reveal together', () => {
  const { room, player: host } = createRoom('Host', { mode: 'mixed', rounds: 3, seconds: 10 }, 1000);
  const guest = joinRoom(room, 'Guest', null, 1000);
  startRoom(room, host.token, 1000);
  const hostView = roomView(room, host.token, 1001);
  const guestView = roomView(room, guest.token, 1001);
  assert.deepEqual(hostView.question, guestView.question);
  assert.equal(hostView.phase, 'question');
  assert.equal(hostView.question.acceptedIds, undefined);
  assert.throws(() => submitAnswer(room, host.token, room.deck[0].choices[0], 2000), /closed/);
  const answer = room.deck[0].acceptedIds[0];
  submitAnswer(room, host.token, answer, 3500);
  assert.equal(roomView(room, guest.token, 3501).players.find(p => p.id === host.id).result, null);
  assert.throws(() => submitAnswer(room, host.token, answer, 3502), /already/);
  submitAnswer(room, guest.token, answer, 3600);
  const revealed = roomView(room, host.token, 3601);
  assert.equal(revealed.phase, 'reveal');
  assert.ok(revealed.self.result.correct);
  assert.ok(revealed.players.every(p => p.total >= 100));
  assert.ok(revealed.players.every(p => p.streak === 1));
  advanceRoom(room, room.revealedAt + 8000);
  assert.equal(room.roundIndex, 1);
  assert.equal(room.phase, 'question');
});

test('a room rejects unknown players and late answers', () => {
  const { room, player } = createRoom('Host', { mode: 'staff', rounds: 3, seconds: 10 }, 1000);
  assert.throws(() => playerFor(room, 'wrong'), /expired/);
  startRoom(room, player.token, 1000);
  const oldChoice = room.deck[0].choices[0];
  assert.throws(() => submitAnswer(room, player.token, oldChoice, room.deadline + 1), /closed/);
  assert.equal(room.phase, 'reveal');
});

test('HTTP API creates, joins, and starts a room', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(base + '/api/health');
    assert.deepEqual(await health.json(), { ok: true });
    const created = await fetch(base + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ada', settings: { mode: 'mixed', rounds: 3 } }) });
    assert.equal(created.status, 201);
    const { token, room } = await created.json();
    const joined = await fetch(`${base}/api/rooms/${room.code}/join`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Bea' }) });
    assert.equal(joined.status, 200);
    assert.equal((await joined.json()).room.players.length, 2);
    const started = await fetch(`${base}/api/rooms/${room.code}/start`, { method: 'POST', headers: { 'X-Player-Token': token } });
    assert.equal(started.status, 200);
    const view = (await started.json()).room;
    assert.equal(view.phase, 'question');
    assert.equal(view.question.acceptedIds, undefined);
    const script = await fetch(base + '/server.mjs');
    assert.equal(script.status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
