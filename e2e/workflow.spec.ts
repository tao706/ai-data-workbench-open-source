import { test, expect } from '@playwright/test';

test('注册、导入、分析、图表和报告的浏览器流程', async ({ page }) => {
  const email = `workflow-${Date.now()}@example.com`;
  await page.goto('/login');
  await page.getByRole('button', { name: '注册账号' }).click();
  await page.getByLabel('邮箱地址').fill(email);
  await page.getByLabel('显示名称').fill('流程测试用户');
  await page.getByLabel('设置密码').fill('Workflow12345');
  await page.getByLabel('确认密码').fill('Workflow12345');
  await page.getByRole('button', { name: '创建账号并进入' }).click();
  await expect(page.getByText('从数据，开始新的发现')).toBeVisible();

  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByPlaceholder('输入项目名称').fill('端到端验证项目');
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await page.goto('/datasets');
  await expect(page.getByRole('heading', { name: '数据集管理' })).toBeVisible();
  await page.getByRole('button', { name: /导入示例数据/ }).click();
  await expect(page.getByText('示例数据已导入')).toBeVisible();

  await page.goto('/analysis');
  await page.getByRole('button', { name: '运行分析' }).click();
  await expect(page.getByRole('heading', { name: '分析结果' })).toBeVisible();

  await page.goto('/studio');
  await page.getByRole('button', { name: /保存图表/ }).click();
  await expect(page.getByText('图表配置已保存')).toBeVisible();

  await page.goto('/reports');
  await page.getByRole('textbox', { name: '分析摘要' }).fill('基于销售样例数据完成统计分析和图表展示。');
  await page.getByRole('button', { name: '保存报告草稿' }).click();
  await expect(page.getByText('报告草稿已保存')).toBeVisible();
});
