import { handleApi, errorResponse } from '../api-handler.mjs';
import { createRedisStore } from '../redis-rest.mjs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = req.query?.route || url.searchParams.get('route');
    const code = req.query?.code || url.searchParams.get('code');
    const action = req.query?.action || url.searchParams.get('action');
    const path = route === 'health' ? '/api/health' : route === 'rooms' ?
      '/api/rooms' + (code ? '/' + code : '') + (action ? '/' + action : '') : url.pathname;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const store = createRedisStore();
    if (path === '/api/health' && !await store.ping()) throw new Error('Storage unavailable.');
    const result = await handleApi(req.method, path, body, req.headers['x-player-token'], store);
    res.statusCode = result.status;
    res.end(JSON.stringify(result.data));
  } catch (error) {
    const result = errorResponse(error);
    res.statusCode = result.status;
    res.end(JSON.stringify(result.data));
  }
}
