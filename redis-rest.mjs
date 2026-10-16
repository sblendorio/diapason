import { randomUUID } from 'node:crypto';
import { createRoom, roomView } from './rooms.mjs';

const TTL = 7200;
const RELEASE = 'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end';

export function createRedisStore({ url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  request = fetch } = {}) {
  if (!url || !token) throw new Error('Storage is not configured. Set Upstash Redis credentials.');
  async function command(...args) {
    const response = await request(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!response.ok) throw new Error(`Storage unavailable (${response.status}).`);
    const result = await response.json();
    if (result.error) throw new Error(`Storage error: ${result.error}`);
    return result.result;
  }
  const key = code => `diapason:room:${code}`;
  return {
    async ping() { return await command('PING') === 'PONG'; },
    async create(name, settings) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const { room, player } = createRoom(name, settings);
        if (await command('SET', key(room.code), JSON.stringify(room), 'NX', 'EX', TTL) === 'OK') {
          return { token: player.token, room: roomView(room, player.token) };
        }
      }
      throw new Error('Could not create a unique room. Try again.');
    },
    async withRoom(code, action) {
      const lockKey = `${key(code)}:lock`;
      const owner = randomUUID();
      const until = Date.now() + 4000;
      while (await command('SET', lockKey, owner, 'NX', 'PX', 20000) !== 'OK') {
        if (Date.now() > until) throw new Error('Room busy. Try again.');
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 40));
      }
      try {
        const saved = await command('GET', key(code));
        if (!saved) throw new Error('Room not found.');
        const room = JSON.parse(saved);
        const result = await action(room);
        if (room.players.length) await command('SET', key(code), JSON.stringify(room), 'EX', TTL);
        else await command('DEL', key(code));
        return result;
      } finally {
        await command('EVAL', RELEASE, 1, lockKey, owner);
      }
    }
  };
}
