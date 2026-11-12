import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('gateway health, login, and protected route', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workbench-auth-test-'));
  const child = spawn(process.execPath, ['dist/server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '3133', MYSQL_URL: '', WORKBENCH_STATE_FILE: join(temp, 'state.json') }, stdio: 'ignore' });
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { const r = await fetch('http://127.0.0.1:3133/api/health'); ready = r.ok; if (ready) break; } catch {}
      await delay(200);
    }
    assert.equal(ready, true, 'server did not start');
    const unauth = await fetch('http://127.0.0.1:3133/api/projects');
    assert.equal(unauth.status, 401);
    const login = await fetch('http://127.0.0.1:3133/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.DEMO_EMAIL || 'demo@example.com', password: process.env.DEMO_PASSWORD || 'Demo123456!' }) });
    assert.equal(login.status, 200);
    const body = await login.json();
    assert.equal(body.data.email, process.env.DEMO_EMAIL || 'demo@example.com');
    assert.equal(body.data.token, undefined);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie || '', /workbench_session=/);
    assert.match(cookie || '', /HttpOnly/i);
    const me = await fetch('http://127.0.0.1:3133/api/auth/me', { headers: { cookie } });
    assert.equal(me.status, 200);
    const projects = await fetch('http://127.0.0.1:3133/api/projects', { headers: { cookie } });
    assert.equal(projects.status, 200);
    const logout = await fetch('http://127.0.0.1:3133/api/auth/logout', { method: 'POST', headers: { cookie } });
    assert.equal(logout.status, 200);
    const expired = await fetch('http://127.0.0.1:3133/api/auth/me', { headers: { cookie: logout.headers.get('set-cookie') || '' } });
    assert.equal(expired.status, 401);
  } finally { child.kill(); await rm(temp, { recursive: true, force: true }); }
});
