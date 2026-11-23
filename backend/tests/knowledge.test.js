import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('knowledge splitting, project isolation, vector retrieval, failure and deletion lifecycle', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'workbench-knowledge-'));
  process.env.WORKBENCH_STATE_FILE = join(temp, 'state.json');
  delete process.env.MYSQL_URL;
  delete process.env.EMBEDDING_MODEL;
  const { db } = await import('../dist/store.js');
  const { splitDocument, indexDocument, retrieve, cancelIndex } = await import('../dist/knowledge.service.js');
  let fail = false, requests = 0, release;
  const server = createServer(async (req, res) => {
    const chunks = [];for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());requests++;
    if (body.input.some(text => text.includes('等待索引'))) await new Promise(resolve => { release = resolve; });
    if (fail) { res.writeHead(401);res.end('{}');return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: body.input.map((text, index) => ({ index, embedding: text.includes('考勤') ? [0, 1, 0] : [1, 0, 0] })) }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const make = (id, projectId, content) => ({ id, projectId, content, name: id, status: 'indexing', mode: 'keyword', chunks: [], revision: 0, createdAt: '', updatedAt: '' });
  try {
    const text = '净销售额统计口径为销售额减退款。\n'.repeat(100);
    const chunks = splitDocument(text);
    assert.ok(chunks.length > 1);assert.ok(chunks.every(chunk => chunk.text.length <= 700));
    assert.throws(() => splitDocument('   '));assert.throws(() => splitDocument('文'.repeat(50001)));
    const a = make('口径', 'project-a', '净销售额按销售额扣除退款统计，目标需要另行提供。');
    const foreign = make('其他项目秘密', 'project-b', '净销售额口径：秘密业务数据。');
    db().knowledge = [a, foreign];await indexDocument(a);await indexDocument(foreign);
    assert.equal(a.status, 'ready');assert.equal(a.mode, 'keyword');
    let result = await retrieve('project-a', '净销售额统计口径是什么');
    assert.equal(result.mode, 'keyword');assert.equal(result.sources[0].documentId, a.id);
    assert.ok(result.sources.every(source => source.documentId !== foreign.id));
    assert.deepEqual((await retrieve('project-a', '火星发动机维修指南')).sources, []);
    assert.equal((await retrieve('project-a', '净销售额', false)).mode, 'off');
    process.env.EMBEDDING_MODEL = 'test-embedding';process.env.EMBEDDING_API_KEY = 'test-not-a-secret';
    process.env.EMBEDDING_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
    const unrelated = make('行政资料', 'project-a', '考勤规则只用于行政管理。');
    db().knowledge.push(unrelated);await indexDocument(a);await indexDocument(unrelated);
    assert.equal(a.mode, 'vector');assert.ok(a.chunks[0].vector);
    result = await retrieve('project-a', '到账营收怎样核实');
    assert.equal(result.mode, 'vector');assert.equal(result.sources[0].documentId, a.id);
    assert.equal(result.sources.length, 1);assert.ok(requests >= 3);
    process.env.EMBEDDING_MODEL = 'changed-model';
    assert.match((await retrieve('project-a', '净销售额')).notice, /重新索引/);
    process.env.EMBEDDING_MODEL = 'test-embedding';fail = true;
    await indexDocument(a);assert.equal(a.status, 'failed');assert.match(a.error, /鉴权/);assert.equal(a.chunks.length, 0);
    fail = false;await indexDocument(a);assert.equal(a.status, 'ready');
    const pending = make('中途删除', 'project-a', '等待索引的净销售额规则');db().knowledge.push(pending);
    const operation = indexDocument(pending);
    for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(release);cancelIndex(pending.id);db().knowledge = db().knowledge.filter(doc => doc !== pending);release();await operation;
    assert.ok(!db().knowledge.includes(pending));
    db().knowledge = db().knowledge.filter(doc => doc !== a);
    assert.deepEqual((await retrieve('project-a', '到账营收怎样核实')).sources, []);
  } finally {
    release?.();server.closeAllConnections();await new Promise(resolve => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
