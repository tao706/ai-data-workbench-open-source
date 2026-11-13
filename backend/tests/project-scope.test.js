import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('dashboard counts and recent records are scoped to the selected owned project', async () => {
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  const foreign = '00000000-0000-4000-8000-000000000003';
  const temp = await mkdtemp(join(tmpdir(), 'workbench-project-scope-'));
  const file = join(temp, 'state.json');
  const item = (id, projectId) => ({ id, projectId });
  await writeFile(file, JSON.stringify({ users: [], projects: [{ id: a, ownerId: 'demo-user' }, { id: b, ownerId: 'demo-user' }, { id: foreign, ownerId: 'another-user' }], datasets: [item('a-data', a), item('b-data1', b), item('b-data2', b), item('foreign-data', foreign)], tasks: [item('a-task1', a), item('a-task2', a), item('b-task', b)], charts: [item('a-chart', a)], reports: [item('b-report', b)], versions: [], sessions: [], messages: [], logs: [] }));
  const child = spawn(process.execPath, ['dist/server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, NODE_ENV: 'development', PORT: '3139', MYSQL_URL: '', DEMO_EMAIL: 'demo@example.com', DEMO_PASSWORD: 'Demo123456!', WORKBENCH_STATE_FILE: file }, stdio: 'ignore' });
  const base = 'http://127.0.0.1:3139';
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) { try { ready = (await fetch(`${base}/api/health`)).ok; if (ready) break; } catch {} await delay(200); }
    assert.equal(ready, true);
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@example.com', password: 'Demo123456!' }) });
    assert.equal(login.status, 200);
    const headers = { cookie: login.headers.get('set-cookie') };
    const dashboard = async project => (await (await fetch(`${base}/api/dashboard?projectId=${project}`, { headers })).json()).data;
    const first = await dashboard(a);
    assert.deepEqual([first.datasets, first.tasks, first.charts, first.reports], [1, 2, 1, 0]);
    assert.ok(first.recentDatasets.every(row => row.projectId === a));
    assert.ok(first.recentTasks.every(row => row.projectId === a));
    const second = await dashboard(b);
    assert.deepEqual([second.datasets, second.tasks, second.charts, second.reports], [2, 1, 0, 1]);
    assert.ok(second.recentDatasets.every(row => row.projectId === b));
    assert.ok(second.recentTasks.every(row => row.projectId === b));
    assert.equal((await fetch(`${base}/api/dashboard?projectId=${foreign}`, { headers })).status, 404);
  } finally {
    child.kill();
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
