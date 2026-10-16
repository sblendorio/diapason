import { randomBytes, randomUUID } from 'node:crypto';
import Core from './js/game-core.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from(randomBytes(6), byte => ALPHABET[byte % ALPHABET.length]).join('');
const token = () => randomUUID();
const cleanName = value => {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!name) throw new Error('Enter a player name.');
  return name;
};

export function createRoom(name, settingsInput, now = Date.now()) {
  const host = { id: token(), token: token(), name: cleanName(name), total: 0, streak: 0 };
  return { room: { code: code(), hostId: host.id, players: [host], settings: Core.validSettings(settingsInput),
    phase: 'lobby', deck: [], roundIndex: 0, submissions: {}, startsAt: null, deadline: null,
    revealedAt: null, updatedAt: now }, player: host };
}
export function playerFor(room, playerToken) {
  const player = room.players.find(item => item.token === playerToken);
  if (!player) throw new Error('Player session expired. Rejoin the room.');
  return player;
}
export function joinRoom(room, name, oldToken, now = Date.now()) {
  if (oldToken) {
    const existing = room.players.find(item => item.token === oldToken);
    if (existing) return existing;
  }
  if (room.phase !== 'lobby') throw new Error('This match has already started.');
  if (room.players.length >= 8) throw new Error('The room is full.');
  const candidate = cleanName(name);
  if (room.players.some(item => item.name.toLowerCase() === candidate.toLowerCase())) throw new Error('That name is in use.');
  const player = { id: token(), token: token(), name: candidate, total: 0, streak: 0 };
  room.players.push(player);
  room.updatedAt = now;
  return player;
}
export function leaveRoom(room, playerToken, now = Date.now()) {
  const player = playerFor(room, playerToken);
  room.players = room.players.filter(item => item.id !== player.id);
  delete room.submissions[player.id];
  if (room.hostId === player.id) room.hostId = room.players[0]?.id ?? null;
  room.updatedAt = now;
  if (room.phase === 'question' && room.players.every(item => room.submissions[item.id])) reveal(room, now);
}
export function setSettings(room, playerToken, input, now = Date.now()) {
  const player = playerFor(room, playerToken);
  if (room.hostId !== player.id || room.phase !== 'lobby') throw new Error('Only the host can edit lobby settings.');
  room.settings = Core.validSettings(input);
  room.updatedAt = now;
}
function openRound(room, startsAt) {
  room.phase = 'question';
  room.submissions = {};
  room.startsAt = startsAt;
  room.deadline = startsAt + room.settings.seconds * 1000;
  room.revealedAt = null;
}
export function startRoom(room, playerToken, now = Date.now()) {
  const player = playerFor(room, playerToken);
  if (room.hostId !== player.id || !['lobby', 'finished'].includes(room.phase)) throw new Error('Only the host can start a match.');
  room.deck = Core.makeDeck(room.settings);
  room.roundIndex = 0;
  room.players.forEach(item => { item.total = 0; item.streak = 0; });
  openRound(room, now + 2500);
  room.updatedAt = now;
}
function reveal(room, at) {
  if (room.phase !== 'question') return;
  room.phase = 'reveal';
  room.revealedAt = at;
  room.players.forEach(item => {
    const result = room.submissions[item.id];
    item.total += result?.points ?? 0;
    item.streak = result?.correct ? item.streak + 1 : 0;
  });
}
export function submitAnswer(room, playerToken, choice, now = Date.now()) {
  advanceRoom(room, now);
  const player = playerFor(room, playerToken);
  if (room.phase !== 'question' || now < room.startsAt || now >= room.deadline) throw new Error('This round is closed.');
  if (room.submissions[player.id]) throw new Error('You already answered.');
  const question = room.deck[room.roundIndex];
  if (!question.choices.includes(choice)) throw new Error('Choose one of the answers shown.');
  room.submissions[player.id] = Core.grade(question, choice, now - room.startsAt, room.settings.seconds);
  room.updatedAt = now;
  if (room.players.every(item => room.submissions[item.id])) reveal(room, now);
  return room.submissions[player.id];
}
export function advanceRoom(room, now = Date.now()) {
  let moved = false;
  while (true) {
    if (room.phase === 'question' && now >= room.deadline) {
      reveal(room, room.deadline);
    } else if (room.phase === 'reveal' && now >= room.revealedAt + 8000) {
      if (room.roundIndex === room.deck.length - 1) {
        room.phase = 'finished';
        room.startsAt = room.deadline = null;
      } else {
        room.roundIndex++;
        openRound(room, room.revealedAt + 9500);
      }
    } else break;
    moved = true;
  }
  if (moved) room.updatedAt = now;
  return moved;
}
export function roomView(room, playerToken, now = Date.now()) {
  advanceRoom(room, now);
  const self = playerFor(room, playerToken);
  const revealed = ['reveal', 'finished'].includes(room.phase);
  const question = room.deck[room.roundIndex];
  return { code: room.code, phase: room.phase, settings: room.settings, roundIndex: room.roundIndex,
    roundCount: room.deck.length || room.settings.rounds, serverNow: now, startsAt: room.startsAt,
    deadline: room.deadline, revealedAt: room.revealedAt,
    question: Core.publicQuestion(question, revealed),
    self: { id: self.id, isHost: room.hostId === self.id,
      submitted: !!room.submissions[self.id], result: revealed ? room.submissions[self.id] ?? null : null },
    players: room.players.map(item => ({ id: item.id, name: item.name, total: item.total, streak: item.streak,
      isHost: room.hostId === item.id, submitted: !!room.submissions[item.id],
      result: revealed ? room.submissions[item.id] ?? null : null })) };
}

export function createMemoryStore() {
  const rooms = new Map();
  return {
    async create(name, settings) {
      let created;
      do { created = createRoom(name, settings); } while (rooms.has(created.room.code));
      rooms.set(created.room.code, created.room);
      return { token: created.player.token, room: roomView(created.room, created.player.token) };
    },
    async withRoom(roomCode, action) {
      const room = rooms.get(roomCode);
      if (!room || Date.now() - room.updatedAt > 2 * 60 * 60 * 1000) throw new Error('Room not found.');
      const result = await action(room);
      room.updatedAt = Date.now();
      if (!room.players.length) rooms.delete(roomCode);
      return result;
    }
  };
}
