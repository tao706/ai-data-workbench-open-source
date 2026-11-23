import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('project documents to confirmed plan, computed result and SSE citations; unauthorized access and deletion', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workbench-rag-api-'));
  const stateFile = join(temp, 'state.json');
  const a = '00000000-0000-4000-8000-000000000011', b = '00000000-0000-4000-8000-000000000012', datasetId = '00000000-0000-4000-8000-000000000013';
  const foreignId = '00000000-0000-4000-8000-000000000014';
  await writeFile(stateFile, JSON.stringify({ users: [], projects: [{ id: a, ownerId: 'demo-user' }, { id: b, ownerId: 'foreign-user' }], datasets: [{ id: datasetId, projectId: a, name: '销售示例', rows: 2, columns: 3, version: 1, file: 'test-only.csv', fields: [{ name: '日期', type: 'date' }, { name: '区域', type: 'text' }, { name: '销售额', type: 'number' }] }], versions: [], charts: [], tasks: [], sessions: [], messages: [], reports: [], logs: [], knowledge: [{ id: foreignId, projectId: b, name: '其他用户私密口径', content: '不可泄露的净销售额', status: 'ready', mode: 'keyword', revision: 1, chunks: [{ id: 'secret', index: 1, text: '不可泄露的净销售额' }] }, { id: 'interrupted', projectId: a, name: '中断资料', content: '旧资料', status: 'indexing', mode: 'keyword', chunks: [], revision: 1 }] }));
  let computedBody;
  const analysis = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/internal/health') { res.end(JSON.stringify({ service: 'fastapi' })); return; }
    const chunks = [];for await (const chunk of req) chunks.push(chunk);computedBody = JSON.parse(Buffer.concat(chunks).toString());
    res.end(JSON.stringify({ data: { categories: ['华东'], series: [110], metadata: { dimension: '区域', metric: '销售额', aggregate: 'sum' } } }));
  });
  await new Promise(resolve => analysis.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:3146';
  const child = spawn(process.execPath, ['dist/server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '3146', NODE_ENV: 'development', MYSQL_URL: '', OPENAI_API_KEY: '', EMBEDDING_MODEL: '', EMBEDDING_API_KEY: '', DEMO_EMAIL: 'demo@example.com', DEMO_PASSWORD: 'Demo123456!', ANALYSIS_URL: `http://127.0.0.1:${analysis.address().port}`, WORKBENCH_STATE_FILE: stateFile }, stdio: 'ignore' });
  try {
    let started = false;
    for (let i = 0; i < 80; i++) { try { started = (await fetch(`${base}/api/health`)).ok; if (started) break; } catch {} await delay(100); }
    assert.ok(started);
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@example.com', password: 'Demo123456!' }) });
    const cookie = login.headers.get('set-cookie');assert.ok(cookie);
    const request = (path, method = 'GET', body) => fetch(base + '/api' + path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await fetch(base + '/api/knowledge?projectId=' + a)).status, 401);
    assert.equal((await request('/knowledge?projectId=' + b)).status, 404);
    assert.equal((await request('/knowledge/' + foreignId)).status, 404);
    assert.equal((await request('/knowledge/' + foreignId, 'DELETE')).status, 404);
    assert.equal((await request('/knowledge/search', 'POST', { projectId: b, question: '净销售额' })).status, 404);
    let list = (await (await request('/knowledge?projectId=' + a)).json()).data;
    assert.equal(list.documents[0].status, 'failed');assert.match(list.documents[0].error, /服务重启/);
    const upload = async (filename, bytes) => { const form = new FormData();form.append('projectId', a);form.append('file', new Blob([bytes]), filename);return fetch(base + '/api/knowledge', { method: 'POST', headers: { cookie }, body: form }); };
    assert.equal((await upload('规则.html', '不应导入')).status, 400);
    assert.equal((await upload('规则.txt', new Uint8Array([255, 254, 255]))).status, 400);
    assert.equal((await request('/knowledge', 'POST', { projectId: a, name: '空资料', content: ' ' })).status, 400);
    const response = await upload('销售口径.md', '# 销售额与净销售额\n销售额是含退款前的金额。净销售额应扣除退款。未提供区域目标时，不应判断是否达标。');
    assert.equal(response.status, 202);const doc = (await response.json()).data;assert.equal(doc.name, '销售口径.md');
    for (let i = 0; i < 80; i++) { list = (await (await request('/knowledge?projectId=' + a)).json()).data;if (list.documents.find(item => item.id === doc.id)?.status === 'ready') break;await delay(50); }
    const ready = list.documents.find(item => item.id === doc.id);assert.equal(ready.status, 'ready');assert.equal(ready.mode, 'keyword');assert.equal(ready.content, undefined);assert.equal(ready.chunks, undefined);
    const planResponse = await request('/ai/plan', 'POST', { datasetId, question: '按区域对比销售额，说明统计口径', useKnowledge: true });
    assert.equal(planResponse.status, 200);const plan = (await planResponse.json()).data;
    assert.equal(plan.dimension, '区域');assert.equal(plan.metric, '销售额');assert.equal(plan.retrieval.sources[0].documentId, doc.id);
    const chat = await request('/ai/chat', 'POST', { datasetId, question: '按区域对比销售额，说明统计口径', useKnowledge: true, plan });
    assert.equal(chat.status, 200);const stream = await chat.text();
    assert.match(stream, /event: sources/);assert.match(stream, /event: done/);assert.match(stream, /净销售额/);assert.match(stream, /\[S1\]/);assert.match(stream, /演示解读/);assert.doesNotMatch(stream, /不可泄露/);
    assert.equal(computedBody.dimension, '区域');assert.equal(computedBody.metric, '销售额');
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    assert.equal(state.messages.at(-1).references.sources[0].documentId, doc.id);
    assert.equal((await request('/knowledge/' + doc.id, 'DELETE')).status, 200);
    const searched = (await (await request('/knowledge/search', 'POST', { projectId: a, question: '销售额口径' })).json()).data;
    assert.deepEqual(searched.sources, []);
    assert.equal((await request('/knowledge/' + doc.id)).status, 404);
  } finally {
    child.kill();await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    analysis.closeAllConnections();await new Promise(resolve => analysis.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
