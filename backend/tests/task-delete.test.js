import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('delete completed task persists, preserves dataset and rejects foreign/running tasks', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workbench-task-delete-'));
  const file = join(temp, 'state.json');
  const now = new Date().toISOString();
  const task = (id, projectId, status) => ({ id, projectId, name: id, type: 'descriptive', status, progress: status === 'completed' ? 100 : 0, result: {}, createdAt: now, updatedAt: now });
  await writeFile(file, JSON.stringify({ users: [], projects: [{ id: 'owned', ownerId: 'demo-user' }, { id: 'foreign', ownerId: 'another-user' }], datasets: [{ id: 'keep-dataset', projectId: 'owned' }], versions: [], charts: [], tasks: [task('completed-task', 'owned', 'completed'), task('running-task', 'owned', 'running'), task('foreign-task', 'foreign', 'completed')], sessions: [], messages: [], reports: [], logs: [] }));
  const child = spawn(process.execPath, ['dist/server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, NODE_ENV: 'development', PORT: '3138', MYSQL_URL: '', DEMO_EMAIL: 'demo@example.com', DEMO_PASSWORD: 'Demo123456!', WORKBENCH_STATE_FILE: file }, stdio: 'ignore' });
  const base = 'http://127.0.0.1:3138';
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { ready = (await fetch(`${base}/api/health`)).ok; if (ready) break; } catch {}
      await delay(200);
    }
    assert.equal(ready, true);
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@example.com', password: 'Demo123456!' }) });
    assert.equal(login.status, 200);
    const headers = { cookie: login.headers.get('set-cookie') };
    assert.equal((await fetch(`${base}/api/tasks/foreign-task`, { method: 'DELETE', headers })).status, 404);
    assert.equal((await fetch(`${base}/api/tasks/running-task`, { method: 'DELETE', headers })).status, 409);
    assert.equal((await fetch(`${base}/api/tasks/completed-task`, { method: 'DELETE', headers })).status, 200);
    assert.equal((await fetch(`${base}/api/tasks/completed-task`, { headers })).status, 404);
    const stored = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(stored.tasks.some(t => t.id === 'completed-task'), false);
    assert.equal(stored.tasks.length, 2);
    assert.equal(stored.datasets[0].id, 'keep-dataset');
  } finally {
    child.kill();
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
