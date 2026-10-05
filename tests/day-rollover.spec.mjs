import { test, expect } from '@playwright/test';
import { openApp, capture } from './helpers.mjs';

test('ما يُلتقط قبل 04:00 ينتمي لليوم السابق، ويبدأ يوم جديد عند 04:00', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T03:58:00+03:00') });
  await openApp(page);
  await expect(page.locator('#brandToday')).toContainText('4 أكتوبر');

  await capture(page, 'التقاطة بعد منتصف الليل');
  await expect(page.locator('#todayLogCount')).toHaveText('1');

  await page.clock.runFor('03:00');
  await expect(page.locator('#brandToday')).toContainText('5 أكتوبر');
  await expect(page.locator('#todayLogCount')).toHaveText('0');
});
