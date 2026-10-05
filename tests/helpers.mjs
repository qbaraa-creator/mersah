import { expect } from '@playwright/test';

export async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#yearProgress')).not.toHaveText('');
}

export async function showView(page, target) {
  await page.locator(`.nav-btn[data-target="${target}"]`).click();
  await expect(page.locator(`.nav-btn[data-target="${target}"]`)).toHaveAttribute('aria-current', 'page');
}

// تبديل الشاشة يخفي تأكيد ما بعد الالتقاط حتى لا يحجب أزرار أسفل الشاشة.
export async function dismissCaptureBar(page) {
  if (await page.locator('#captureReturnBar').isHidden()) return;
  await showView(page, 'entries');
  await showView(page, 'today');
}

export async function capture(page, text) {
  await page.locator('#captureFab').click();
  await page.locator('#captureText').fill(text);
  await page.locator('#saveCaptureButton').click();
  await expect(page.locator('#captureDialog')).not.toHaveAttribute('open', '');
}

export async function addTopTask(page, text) {
  await page.locator('#openTopTaskDialog').click();
  await page.locator('#quickTaskInput').fill(text);
  await page.locator('#addTopTaskButton').click();
  await expect(page.locator('#topTasksList')).toContainText(text);
}

export async function setDirection(page, text) {
  await page.locator('#directionButton').click();
  await page.locator('#directionEditor').fill(text);
  await page.locator('#directionForm button[type="submit"]').click();
  await expect(page.locator('#directionDisplay')).toHaveText(text);
}

export async function openTodayLog(page) {
  const log = page.locator('#todayLogSection');
  if (await log.getAttribute('open') === null) await page.locator('#todayLogSection > summary').click();
}

export function logCard(page, text) {
  return page.locator('#todayTimeline .entry-card', { hasText: text });
}

export async function openEveningClose(page) {
  await dismissCaptureBar(page);
  await page.locator('#openEveningCloseButton').click();
  await expect(page.locator('#eveningCloseDialog')).toHaveAttribute('open', '');
}

export async function openSettings(page) {
  await page.locator('#settingsButton').click();
  await expect(page.locator('#settingsDialog')).toHaveAttribute('open', '');
}
