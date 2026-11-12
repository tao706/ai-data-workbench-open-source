import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('production disables demo account, validates origin and limits auth attempts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workbench-production-'));
  const child = spawn(process.execPath, ['dist/server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, NODE_ENV: 'production', PORT: '3137', HOST: '127.0.0.1', PUBLIC_ORIGIN: 'https://example.com', JWT_SECRET: 'test-secret-only-0123456789-abcdefghijklmnopqrstuvwxyz', MYSQL_URL: '', WORKBENCH_STATE_FILE: join(temp, 'state.json') }, stdio: 'ignore' });
  const url = 'http://127.0.0.1:3137';
  const headers = { 'content-type': 'application/json', origin: 'https://example.com' };
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { ready = (await fetch(`${url}/api/health`)).ok; if (ready) break; } catch {}
      await delay(200);
    }
    assert.equal(ready, true);
    const login = () => fetch(`${url}/api/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email: 'demo@example.com', password: 'Demo123456!' }) });
    assert.equal((await login()).status, 401);
    assert.equal((await fetch(`${url}/api/auth/register`, { method: 'POST', headers: { ...headers, origin: 'https://other.example' }, body: '{}' })).status, 403);
    const registered = await fetch(`${url}/api/auth/register`, { method: 'POST', headers, body: JSON.stringify({ email: 'production@example.com', name: '生产测试', password: 'ProductionTest123' }) });
    assert.equal(registered.status, 201);
    assert.match(registered.headers.get('set-cookie') || '', /Secure/);
    let last;
    for (let i = 0; i < 30; i++) last = await login();
    assert.equal(last.status, 429);
    assert.ok(Number(last.headers.get('retry-after')) > 0);
  } finally {
    child.kill();
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
