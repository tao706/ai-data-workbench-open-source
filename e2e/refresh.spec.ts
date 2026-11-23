import { test, expect } from '@playwright/test';

test('顶栏刷新更新当前页面，保留草稿，并展示加载与失败状态', async ({ page }) => {
  const user = { id: 'refresh-user', name: '测试用户', email: 'refresh@example.com' };
  const project = { id: 'refresh-project', name: '刷新测试项目' };
  const dataset = { id: 'refresh-dataset', projectId: project.id, name: '测试数据', rows: 2, version: 1, fields: [{ name: '类别', type: 'string' }, { name: '金额', type: 'number' }] };
  let dashboards = 0, previews = 0, failHealth = false, delayHealth = false;
  let releaseHealth: (() => void) | undefined;
  await page.addInitScript(({ user, project, dataset }) => {
    localStorage.setItem('workbench-owner', user.id);
    localStorage.setItem('workbench-project', JSON.stringify(project.id));
    localStorage.setItem('workbench-dataset', JSON.stringify(dataset.id));
  }, { user, project, dataset });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === '/api/auth/me') data = user;
    else if (path === '/api/projects') data = [project];
    else if (path === '/api/health') {
      if (delayHealth) await new Promise<void>(resolve => { releaseHealth = resolve; });
      if (failHealth) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '测试服务暂不可用' }) }); return; }
      data = { fastapi: 'online', express: 'online' };
    } else if (path === '/api/dashboard') data = { datasets: ++dashboards, tasks: 0, charts: 0, reports: 0, recentDatasets: [], recentTasks: [] };
    else if (path === '/api/datasets') data = [dataset];
    else if (path === '/api/datasets/refresh-dataset') data = dataset;
    else if (path === '/api/charts/data') { previews++; data = { categories: ['甲'], series: [10] }; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data }) });
  });
  await page.goto('/');
  await expect(page.locator('.metric-strip button strong').first()).toHaveText('1');
  delayHealth = true;
  await page.getByRole('button', { name: '刷新当前页面', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在刷新', exact: true })).toBeDisabled();
  await expect(page.locator('.workspace-refresh')).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => !!releaseHealth).toBe(true);
  delayHealth = false; releaseHealth!();
  await expect(page.locator('.metric-strip button strong').first()).toHaveText('2');
  await expect(page.getByRole('status')).toHaveText('当前页面数据已更新');
  await page.goto('/studio');
  const title = page.getByLabel('图表标题', { exact: true });
  await title.fill('保留我的未保存图表标题');
  await expect.poll(() => previews).toBeGreaterThan(0);
  const before = previews;
  await page.getByRole('button', { name: '刷新当前页面', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('当前页面数据已更新');
  await expect.poll(() => previews).toBeGreaterThan(before);
  await expect(title).toHaveValue('保留我的未保存图表标题');
  await page.goto('/reports');
  const summary = page.locator('textarea').first();
  await summary.fill('保留我的未保存报告摘要');
  await page.getByRole('button', { name: '刷新当前页面', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('当前页面数据已更新');
  await expect(summary).toHaveValue('保留我的未保存报告摘要');
  failHealth = true;
  await page.getByRole('button', { name: '刷新当前页面', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '刷新失败' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  failHealth = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('当前页面数据已更新');
});
