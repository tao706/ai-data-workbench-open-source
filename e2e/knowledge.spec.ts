import { test, expect } from '@playwright/test';

test('业务资料索引、引用计划、流式引用原文与删除', async ({ page }) => {
  const projectId = '00000000-0000-4000-8000-000000000021';
  const datasetId = '00000000-0000-4000-8000-000000000022';
  const doc = { id: 'doc-test', projectId, name: '销售指标说明', content: '销售额为退款前金额。净销售额需扣除退款。没有区域目标时无法判断是否达标。', characters: 42, chunkCount: 1, status: 'indexing', mode: 'keyword', createdAt: '', updatedAt: '' };
  const dataset = { id: datasetId, projectId, name: '销售示例', rows: 2, version: 1, fields: [{ name: '区域', type: 'text' }, { name: '销售额', type: 'number' }] };
  let exists = false, lists = 0;
  const retrieval = { mode: 'keyword', sources: [{ id: 'S1', documentId: doc.id, name: doc.name, chunk: 1, text: doc.content, score: 1 }], notice: '资料仅作解释依据，不会自动修改已确认的计算口径' };
  await page.addInitScript(({ projectId, datasetId }) => { localStorage.setItem('workbench-owner', 'knowledge-user');localStorage.setItem('workbench-project', JSON.stringify(projectId));localStorage.setItem('workbench-dataset', JSON.stringify(datasetId)); }, { projectId, datasetId });
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let data: unknown = [];
    if (path === '/api/auth/me') data = { id: 'knowledge-user', email: 'knowledge@example.com', name: '测试用户' };
    else if (path === '/api/projects') data = [{ id: projectId, name: '销售分析' }];
    else if (path === '/api/health') data = { fastapi: 'online' };
    else if (path === '/api/datasets') data = [dataset];
    else if (path === '/api/datasets/' + datasetId) data = dataset;
    else if (path === '/api/knowledge' && request.method() === 'POST') { exists = true;data = doc; }
    else if (path === '/api/knowledge') { if (exists && ++lists > 1) doc.status = 'ready';data = { mode: 'keyword', documents: exists ? [doc] : [] }; }
    else if (path === '/api/knowledge/' + doc.id && request.method() === 'DELETE') { exists = false;data = true; }
    else if (path === '/api/knowledge/' + doc.id) data = doc;
    else if (path === '/api/ai/plan') data = { type: 'groupby', title: '按区域汇总销售额', dimension: '区域', metric: '销售额', aggregate: 'sum', retrieval };
    else if (path === '/api/ai/chat') {
      expect(request.postDataJSON().useKnowledge).toBe(true);
      await route.fulfill({ contentType: 'text/event-stream', body: [
        ['meta', { model: 'mock' }], ['sources', retrieval], ['token', { text: '华东销售额合计 110。文档规定净销售额需扣除退款 [S1]。未提供目标，无法判断达标。' }], ['done', { result: { categories: ['华东'], series: [110] } }],
      ].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('') });return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data }) });
  });
  await page.goto('/knowledge');
  await page.getByLabel('资料名称', { exact: true }).fill(doc.name);
  await page.getByLabel('资料正文', { exact: true }).fill(doc.content);
  await page.getByRole('button', { name: '添加并建立索引', exact: true }).click();
  await expect(page.getByText('正在索引…', { exact: true })).toBeVisible();
  await expect(page.getByText('可引用', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看原文', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(doc.content);
  await page.keyboard.press('Escape');
  await page.goto('/assistant');
  await page.getByLabel('分析问题', { exact: true }).fill('按区域对比销售额，说明统计口径');
  await page.getByRole('button', { name: '生成分析计划', exact: true }).click();
  await expect(page.locator('.plan-panel')).toContainText(doc.name);
  await expect(page.locator('.plan-panel')).toContainText('关键词检索');
  await page.getByRole('button', { name: '确认并执行', exact: true }).click();
  await expect(page.locator('.ai-message')).toContainText('销售额合计 110');
  await page.getByRole('button', { name: '查看引用 S1', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(doc.content);
  await expect(page.getByRole('dialog').locator('mark').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/knowledge');
  await page.getByRole('button', { name: '删除资料 ' + doc.name, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('索引会删除');
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('还没有业务资料', { exact: false })).toBeVisible();
});
