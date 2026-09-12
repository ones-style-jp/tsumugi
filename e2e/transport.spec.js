import { test, expect } from '@playwright/test';
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err && err.stack ? err.stack : err)));
  return errors;
}
test('送迎表が開けて操作できる', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByText('利用者マスタ管理', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByText('送迎表', { exact: true }).click();
  await expect(page.getByText('送迎表（運行表）').first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  expect(errors, `未捕捉エラー: ${errors.join(' / ')}`).toEqual([]);
});
