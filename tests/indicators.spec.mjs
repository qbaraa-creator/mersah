import { test, expect } from '@playwright/test';
import { openApp, capture, openTodayLog, logCard, showView, dismissCaptureBar, openEveningClose } from './helpers.mjs';

test('المكتمل والمغلق في «للنظر» لا يُحسبان عالقين، والمفتوح يُحسب', async ({ page }) => {
  await openApp(page);
  await capture(page, 'فكرة تُكمل');
  await capture(page, 'فكرة تُغلق');
  await dismissCaptureBar(page);
  await openTodayLog(page);
  await logCard(page, 'فكرة تُكمل').getByRole('button', { name: 'إكمال' }).click();
  await logCard(page, 'فكرة تُغلق').getByRole('button', { name: 'إغلاق' }).click();

  await showView(page, 'days');
  await expect(page.locator('#analysisOldestDetail')).toHaveText('لا عوالق');
  await expect(page.locator('#analysisResolutionRate')).toHaveText('100%');
  await expect(page.locator('#pathBacklogList .path-backlog-meta').first()).toHaveText('0');

  await showView(page, 'today');
  await capture(page, 'فكرة مفتوحة');
  await showView(page, 'days');
  await expect(page.locator('#analysisOldestDetail')).toHaveText('1 في للنظر');
  await expect(page.locator('#analysisResolutionRate')).toHaveText('67%');
});

test('«أُنجز» للإكمال وحده، والإغلاق يُحسب في «حُسم»', async ({ page }) => {
  await openApp(page);
  await capture(page, 'فكرة تُكمل');
  await capture(page, 'فكرة تُغلق');
  await dismissCaptureBar(page);
  await openTodayLog(page);
  await logCard(page, 'فكرة تُكمل').getByRole('button', { name: 'إكمال' }).click();
  await logCard(page, 'فكرة تُغلق').getByRole('button', { name: 'إغلاق' }).click();

  await openEveningClose(page);
  await expect(page.locator('#eveningCompletedCount')).toHaveText('1');
  await expect(page.locator('#eveningResolvedCount')).toHaveText('2');
});
