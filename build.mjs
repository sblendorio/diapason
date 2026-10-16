import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const name of ['index.html', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'css', 'js']) {
  await cp(name, `dist/${name}`, { recursive: true });
}
