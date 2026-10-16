import { joinRoom, leaveRoom, setSettings, startRoom, submitAnswer, roomView } from './rooms.mjs';

export async function handleApi(method, pathname, body, playerToken, store) {
  if (pathname === '/api/health' && method === 'GET') return { status: 200, data: { ok: true } };
  if (pathname === '/api/rooms' && method === 'POST') {
    return { status: 201, data: await store.create(body.name, body.settings) };
  }
  const match = pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|leave|settings|start|submit))?$/i);
  if (!match) return { status: 404, data: { error: 'Not found.' } };
  const code = match[1].toUpperCase();
  const action = match[2] || '';
  if (method !== (action ? 'POST' : 'GET'))
    return { status: 405, data: { error: 'Method not allowed.' } };
  return store.withRoom(code, async room => {
    const now = Date.now();
    if (action === 'join' && method === 'POST') {
      const player = joinRoom(room, body.name, body.token, now);
      return { status: 200, data: { token: player.token, room: roomView(room, player.token, now) } };
    }
    if (action === 'leave' && method === 'POST') {
      leaveRoom(room, playerToken, now);
      return { status: 200, data: { ok: true } };
    }
    if (action === 'settings' && method === 'POST') setSettings(room, playerToken, body.settings, now);
    else if (action === 'start' && method === 'POST') startRoom(room, playerToken, now);
    else if (action === 'submit' && method === 'POST') submitAnswer(room, playerToken, body.choice, now);
    else if (action !== '' && !['settings', 'start', 'submit'].includes(action))
      return { status: 404, data: { error: 'Not found.' } };
    return { status: 200, data: { room: roomView(room, playerToken, now) } };
  });
}

export function errorResponse(error) {
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  const status = /not found/i.test(message) ? 404 : /already|closed|started|full|in use/i.test(message) ? 409 :
    /Storage|busy/i.test(message) ? 503 : 400;
  return { status, data: { error: message } };
}
