import { test, expect } from '@playwright/test';
import { openApp, capture, addTopTask, openEveningClose, dismissCaptureBar } from './helpers.mjs';

test.afterEach(async ({ request }) => {
  await request.get('/__test/sw-version?v=');
});

test('مسودة توجّه الغد تبقى بعد حسم بطاقات الإغلاق، والإلغاء يعيد المحفوظ', async ({ page }) => {
  await openApp(page);
  await addTopTask(page, 'مهمة أ');
  await addTopTask(page, 'مهمة ب');
  await openEveningClose(page);

  const draft = page.locator('#eveningTomorrowDirection');
  await draft.fill('مسودة لم تُحفظ');
  const reflection = page.locator('#eveningReflection');
  await reflection.fill('تأمل لم يُحفظ');
  await page.locator('#eveningOpenDetails > summary').click();
  const list = page.locator('#eveningOpenDoList');
  await list.locator('.return-card', { hasText: 'مهمة أ' }).getByRole('button', { name: 'تمّ' }).click();
  await expect(page.locator('#eveningCompletedCount')).toHaveText('1');
  await expect(draft).toHaveValue('مسودة لم تُحفظ');

  await list.locator('.return-card', { hasText: 'مهمة ب' }).getByRole('button', { name: 'أغلق' }).click();
  await expect(page.locator('#eveningOpenDoCount')).toHaveText('0');
  await expect(draft).toHaveValue('مسودة لم تُحفظ');
  await expect(reflection).toHaveValue('تأمل لم يُحفظ');

  await page.locator('#eveningCloseDialog .dialog-actions .quiet-btn').click();
  await openEveningClose(page);
  await expect(draft).toHaveValue('');
  await expect(reflection).toHaveValue('');
});

test('وصول تحديث أثناء كتابة التقاطة لا يعيد التحميل ولا يمس المسودة', async ({ page, request }) => {
  await openApp(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // إعادة فتح تحت تحكم العامل الحالي، كما يحدث عند فتح التطبيق المثبّت.
  await openApp(page);
  await page.evaluate(() => { window.__notReloaded = true; });

  await page.locator('#captureFab').click();
  await page.locator('#captureText').fill('مسودة أثناء التحديث');

  await request.get('/__test/sw-version?v=update-test');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  await page.waitForFunction(async () => (await caches.keys()).some(key => key.endsWith('-update-test')));
  await page.waitForTimeout(2000);

  expect(await page.evaluate(() => window.__notReloaded === true)).toBe(true);
  await expect(page.locator('#captureDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#captureText')).toHaveValue('مسودة أثناء التحديث');

  await page.locator('#saveCaptureButton').click();
  await expect(page.locator('#captureDialog')).not.toHaveAttribute('open', '');
  // تأكيد الالتقاط ما زال ظاهرًا؛ لا إعادة تحميل بعد.
  expect(await page.evaluate(() => window.__notReloaded === true)).toBe(true);

  await dismissCaptureBar(page);
  await page.waitForFunction(() => window.__notReloaded !== true, null, { timeout: 10_000 });
  await expect(page.locator('#yearProgress')).not.toHaveText('');
  await expect(page.locator('#todayLogCount')).toHaveText('1');
});
