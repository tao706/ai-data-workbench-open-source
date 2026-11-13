import { test, expect } from '@playwright/test';

test('删除失败在确认弹窗内提示，重试成功后移除记录', async ({ page }) => {
  let deleted = false;
  let attempts = 0;
  const task = { id: 'task-delete-ui', projectId: 'project-delete-ui', name: '删除回归测试', type: 'descriptive', status: 'completed', progress: 100, createdAt: '2026-11-13T00:00:00Z' };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: unknown = null;
    if (path === '/api/auth/me') data = { id: 'ui-user', name: '测试用户', email: 'ui@example.com' };
    else if (path === '/api/projects') data = [{ id: 'project-delete-ui', name: '测试项目' }];
    else if (path === '/api/health') data = { express: 'online', fastapi: 'online', database: 'local-json', model: 'mock' };
    else if (path === '/api/tasks') data = deleted ? [] : [task];
    else if (path === '/api/tasks/task-delete-ui' && request.method() === 'DELETE') {
      if (++attempts === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, message: '暂时无法删除，请重试', data: null }) });
        return;
      }
      deleted = true;
      data = true;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, data }) });
  });
  await page.goto('/tasks');
  await page.getByRole('button', { name: '删除任务记录：删除回归测试', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '确认删除' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('暂时无法删除，请重试');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '确认删除' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('任务记录已删除')).toBeVisible();
  await expect(page.getByRole('button', { name: '删除任务记录：删除回归测试', exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
});
