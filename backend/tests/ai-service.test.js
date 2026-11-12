import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { streamExplanation } from '../dist/ai.service.js';

test('model stream uses computed result and returns tokens', async () => {
  let requestBody;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requestBody = JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"content":"销售额为 42"},"index":0}],"id":"test","model":"test","object":"chat.completion.chunk"}\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = { key: process.env.OPENAI_API_KEY, base: process.env.OPENAI_BASE_URL, model: process.env.OPENAI_MODEL };
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.OPENAI_MODEL = 'test';
  try {
    const tokens = [];
    const answer = await streamExplanation({
      question: '销售额是多少？', dataset: { name: '测试数据', rows: 1, columns: 1 },
      plan: { type: 'descriptive' }, result: { sales: 42 },
      sendToken: token => tokens.push(token), isClosed: () => false,
    });
    assert.equal(answer, '销售额为 42');
    assert.deepEqual(tokens, ['销售额为 42']);
    assert.match(requestBody.messages[1].content, /"sales":42/);
    assert.match(JSON.stringify(requestBody), /测试数据/);
  } finally {
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
    if (previous.base === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = previous.base;
    if (previous.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = previous.model;
    await new Promise(resolve => server.close(resolve));
  }
});
