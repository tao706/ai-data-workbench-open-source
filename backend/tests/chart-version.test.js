import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('saved chart preview reads its recorded dataset version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'workbench-chart-test-'));
  const stateFile = join(dir, 'state.json');
  const datasetId = '11111111-1111-4111-8111-111111111111';
  const projectId = '22222222-2222-4222-8222-222222222222';
  const state = {
    projects: [{ id: projectId, name: '测试项目', ownerId: 'demo-user' }],
    datasets: [{ id: datasetId, name: '测试数据', projectId, file: 'current.csv', version: 2, fields: [] }],
    versions: [
      { id: 'v1', datasetId, version: 1, file: 'old.csv', rows: 1, createdAt: '' },
      { id: 'v2', datasetId, version: 2, file: 'current.csv', rows: 1, createdAt: '' },
    ],
    charts: [], tasks: [], sessions: [], messages: [], reports: [], logs: [],
  };
  await writeFile(stateFile, JSON.stringify(state));
  const analysis = createServer(async (req, res) => {
    if (req.url === '/internal/health') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: { fileUsed: body.file, categories: [], series: [] } }));
  });
  await new Promise(resolve => analysis.listen(0, '127.0.0.1', resolve));
  const analysisPort = analysis.address().port;
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '3135', ANALYSIS_URL: `http://127.0.0.1:${analysisPort}`, MYSQL_URL: '', WORKBENCH_STATE_FILE: stateFile },
    stdio: 'ignore',
  });
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { ready = (await fetch('http://127.0.0.1:3135/api/health')).ok; if (ready) break; } catch {}
      await delay(200);
    }
    assert.equal(ready, true, 'gateway did not start');
    const login = await fetch('http://127.0.0.1:3135/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.DEMO_EMAIL || 'demo@example.com', password: process.env.DEMO_PASSWORD || 'Demo123456!' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    const chart = async version => fetch('http://127.0.0.1:3135/api/charts/data', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ datasetId, ...(version === undefined ? {} : { version }), chartType: 'bar', dimension: '月份' }),
    });
    assert.equal((await (await chart(1)).json()).data.fileUsed, 'old.csv');
    assert.equal((await (await chart(2)).json()).data.fileUsed, 'current.csv');
    assert.equal((await (await chart()).json()).data.fileUsed, 'current.csv');
    assert.equal((await chart(3)).status, 404);
    const saved = await fetch('http://127.0.0.1:3135/api/charts', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ projectId, datasetId, version: 1, title: '历史版本图表', config: { chartType: 'bar', dimension: '月份' } }),
    });
    assert.equal(saved.status, 201);
    assert.equal((await saved.json()).data.datasetVersion, 1);
    const registration = await fetch('http://127.0.0.1:3135/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'second@example.com', name: '第二位用户', password: 'Example12345' }),
    });
    assert.equal(registration.status, 201);
    const otherCookie = registration.headers.get('set-cookie');
    const registeredUser = (await registration.json()).data;
    const storedState = JSON.parse(await readFile(stateFile, 'utf8'));
    const savedUser = storedState.users.find(user => user.id === registeredUser.id);
    assert.ok(savedUser?.passwordHash);
    assert.notEqual(savedUser.passwordHash, 'Example12345');
    assert.equal(savedUser.password, undefined);
    const secondLogin = await fetch('http://127.0.0.1:3135/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'second@example.com', password: 'Example12345' }),
    });
    assert.equal(secondLogin.status, 200);
    assert.equal((await secondLogin.json()).data.id, registeredUser.id);
    const duplicate = await fetch('http://127.0.0.1:3135/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'SECOND@example.com', name: '重复用户', password: 'Example12345' }),
    });
    assert.equal(duplicate.status, 409);
    const otherHeaders = { cookie: otherCookie };
    const otherProjects = await fetch('http://127.0.0.1:3135/api/projects', { headers: otherHeaders });
    assert.deepEqual((await otherProjects.json()).data, []);
    const otherDatasets = await fetch('http://127.0.0.1:3135/api/datasets', { headers: otherHeaders });
    assert.deepEqual((await otherDatasets.json()).data, []);
    assert.equal((await fetch(`http://127.0.0.1:3135/api/projects/${projectId}`, { headers: otherHeaders })).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:3135/api/datasets/${datasetId}`, { headers: otherHeaders })).status, 404);
    assert.equal((await fetch('http://127.0.0.1:3135/api/charts/data', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: otherCookie },
      body: JSON.stringify({ datasetId, chartType: 'bar', dimension: '月份' }),
    })).status, 404);
  } finally {
    child.kill();
    await new Promise(resolve => analysis.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
