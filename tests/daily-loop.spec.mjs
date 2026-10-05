import { test, expect } from '@playwright/test';
import {
  openApp, capture, addTopTask, openEveningClose, openTodayLog, logCard, showView, dismissCaptureBar
} from './helpers.mjs';

const DAY_ONE = new Date('2026-10-05T10:00:00+03:00');

test('«عاد اليوم» يعرض خمسة أولًا، و«عرض الباقي» يكشف البقية بمواعيدها', async ({ page }) => {
  await page.clock.install({ time: DAY_ONE });
  await openApp(page);
  for (let index = 1; index <= 7; index += 1) await capture(page, `عائد ${index}`);
  await dismissCaptureBar(page);

  await page.clock.fastForward('24:00:00');
  const section = page.locator('#returnedTodaySection');
  await expect(section).toBeVisible();
  await expect(page.locator('#returnedTodayCount')).toHaveText('7');
  await expect(section.locator('.return-card')).toHaveCount(5);
  const more = page.locator('#showMoreReturnsButton');
  await expect(more).toHaveText('عرض الباقي (2)');

  await more.click();
  await expect(section.locator('.return-card')).toHaveCount(7);
  await expect(more).toBeHidden();
});

test('بطاقات «حسم الآن» في الإغلاق مطوية، وتختفي حين لا مفتوح', async ({ page }) => {
  await openApp(page);
  await openEveningClose(page);
  await expect(page.locator('#eveningOpenDetails')).toBeHidden();
  await page.locator('#eveningCloseDialog .dialog-actions .quiet-btn').click();

  await addTopTask(page, 'مهمة مفتوحة');
  await openEveningClose(page);
  const details = page.locator('#eveningOpenDetails');
  await expect(details).toBeVisible();
  await expect(details).not.toHaveAttribute('open', '');
  await expect(page.locator('#eveningOpenDoCount')).toHaveText('1');
  await expect(details.locator('.return-card')).toBeHidden();
  await page.locator('#eveningOpenDetails > summary').click();
  await expect(details.locator('.return-card')).toBeVisible();
});

test('سؤال «ما الذي تغيّر؟» اختياري، ويُحفظ مع الإغلاق ويظهر في الأرشيف', async ({ page }) => {
  await openApp(page);
  await openEveningClose(page);
  await page.locator('#eveningReflection').fill('صار العرض أوضح');
  await page.locator('#saveEveningCloseButton').click();
  await expect(page.locator('#eveningCloseDialog')).not.toHaveAttribute('open', '');

  await openEveningClose(page);
  await expect(page.locator('#eveningReflection')).toHaveValue('صار العرض أوضح');
  await page.locator('#eveningCloseDialog .dialog-actions .quiet-btn').click();

  await showView(page, 'days');
  await expect(page.locator('#selectedDayContent')).toContainText('ما تغيّر: صار العرض أوضح');
});

test('مؤشر أهم اليوم يحترم عدد المختار: مهمة واحدة مكتملة يوم مكتمل', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#topTasksList')).toHaveText('حتى ثلاث مهام');
  await expect(page.locator('#topProgress')).toHaveAttribute('aria-label', 'لم تُحدد مهام اليوم بعد');

  await addTopTask(page, 'المهمة الوحيدة');
  await expect(page.locator('#topProgress .top-progress-dot')).toHaveCount(1);
  await page.locator('#topTasksList .top-task-check').click();
  await expect(page.locator('#topProgress')).toHaveAttribute('aria-label', 'أهم اليوم: أُنجز 1 من 1');
  await expect(page.locator('#topProgress .top-progress-dot.done')).toHaveCount(1);
});

test('ثلاثة تأجيلات متتالية تدعو لإعادة الصياغة، وتعديل النص يبدأ العدّ من جديد', async ({ page }) => {
  await page.clock.install({ time: DAY_ONE });
  await openApp(page);
  await capture(page, 'مهمة تتأجل');
  await dismissCaptureBar(page);

  const card = page.locator('#returnedTodayList .return-card', { hasText: 'مهمة تتأجل' });
  for (let round = 1; round <= 3; round += 1) {
    await page.clock.fastForward('24:00:00');
    await expect(card).toBeVisible();
    await card.locator('.return-defer-menu > summary').click();
    await card.getByRole('button', { name: 'غدًا', exact: true }).click();
    await expect(card).toHaveCount(0);
  }

  await page.clock.fastForward('24:00:00');
  const invite = card.locator('.deferral-invite');
  await expect(invite).toHaveText('أُجّلت 3 مرات متتالية · أعد صياغتها؟');
  await invite.click();
  await expect(page.locator('#editDialog')).toHaveAttribute('open', '');
  await expect(page.locator('#editText')).not.toHaveAttribute('readonly', '');
  await page.locator('#editText').fill('خطوة أولى أصغر');
  await page.locator('#editForm button[type="submit"]').click();
  await expect(page.locator('#editDialog')).not.toHaveAttribute('open', '');

  const renamed = page.locator('#returnedTodayList .return-card', { hasText: 'خطوة أولى أصغر' });
  await expect(renamed).toBeVisible();
  await expect(renamed.locator('.deferral-invite')).toHaveCount(0);
});

test('الوصول من «أقدم عالق» يعرض المفتوح فقط، وشريحته تُزال بلمسة', async ({ page }) => {
  await openApp(page);
  await capture(page, 'فكرة محسومة');
  await capture(page, 'فكرة مفتوحة');
  await dismissCaptureBar(page);
  await openTodayLog(page);
  await logCard(page, 'فكرة محسومة').getByRole('button', { name: 'إكمال' }).click();

  await showView(page, 'days');
  await page.locator('.analysis-overview > summary').click();
  await page.locator('#analysisOldestRow').click();
  await expect(page.locator('.nav-btn[data-target="entries"]')).toHaveAttribute('aria-current', 'page');
  const list = page.locator('#entriesList .entry-card');
  await expect(list).toHaveCount(1);
  await expect(list).toContainText('فكرة مفتوحة');
  const chip = page.locator('#entriesOpenOnlyButton');
  await expect(chip).toBeVisible();

  await chip.click();
  await expect(chip).toBeHidden();
  await expect(list).toHaveCount(2);
});
