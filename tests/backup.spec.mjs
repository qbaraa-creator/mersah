import { test, expect } from '@playwright/test';
import { openApp, capture, setDirection, openEveningClose, openSettings } from './helpers.mjs';

// نُجبر مسار التنزيل بدل نافذة المشاركة غير المتاحة في المتصفح الآلي.
async function disableWebShare(page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
}

test('تصدير JSON ثم استعادته في متصفح فارغ يعيد الإدخالات والتوجّه والإغلاق', async ({ page, browser }, testInfo) => {
  await disableWebShare(page);
  await openApp(page);
  await setDirection(page, 'توجّه للاختبار');
  await capture(page, 'التقاطة للنسخ');
  await openEveningClose(page);
  await page.locator('#eveningReflection').fill('تغيّر ترتيب الأولويات');
  await page.locator('#eveningTomorrowDirection').fill('توجّه الغد للاختبار');
  await page.locator('#saveEveningCloseButton').click();
  await expect(page.locator('#eveningCloseDialog')).not.toHaveAttribute('open', '');

  await openSettings(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportJsonButton').click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(backupPath);
  const exported = JSON.parse(await (await import('node:fs/promises')).readFile(backupPath, 'utf8'));
  expect(exported.schemaVersion).toBe(7);

  const { baseURL, locale, timezoneId, viewport } = testInfo.project.use;
  const fresh = await browser.newContext({ baseURL, locale, timezoneId, viewport });
  const restored = await fresh.newPage();
  await openApp(restored);
  await expect(restored.locator('#todayLogCount')).toHaveText('0');
  await restored.locator('#importInput').setInputFiles(backupPath);
  await expect(restored.locator('#confirmDialog')).toHaveAttribute('open', '');
  await restored.locator('#confirmAccept').click();

  await expect(restored.locator('#todayLogCount')).toHaveText('1');
  await expect(restored.locator('#directionDisplay')).toHaveText('توجّه للاختبار');
  await expect(restored.locator('#eveningCloseButtonStatus')).toContainText('أُغلق');
  await openEveningClose(restored);
  await expect(restored.locator('#eveningReflection')).toHaveValue('تغيّر ترتيب الأولويات');
  await fresh.close();
});
