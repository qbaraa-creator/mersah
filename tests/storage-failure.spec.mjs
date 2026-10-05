import { test, expect } from '@playwright/test';
import { openApp } from './helpers.mjs';

test('امتلاء المساحة يبقي ورقة الالتقاط مفتوحة ومسودتها محفوظة', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const quota = () => { throw new DOMException('Simulated quota', 'QuotaExceededError'); };
    IDBObjectStore.prototype.put = quota;
    IDBObjectStore.prototype.add = quota;
  });

  await page.locator('#captureFab').click();
  await page.locator('#captureText').fill('نص لا يجب أن يضيع');
  await page.locator('#saveCaptureButton').click();

  await expect(page.locator('#captureStatus')).toContainText('مساحة تخزين مرساة غير كافية');
  await expect(page.locator('#captureDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#captureText')).toHaveValue('نص لا يجب أن يضيع');
  await expect(page.locator('#todayLogCount')).toHaveText('0');
});
