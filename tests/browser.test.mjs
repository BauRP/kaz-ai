import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const appUrl = pathToFileURL(resolve('public/preview.html')).href;

test('real browser: interactive Kaz AI design preview', async () => {
  const chromePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync);
  const browser = await chromium.launch({
    ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(appUrl);
    assert.equal(await page.locator('#view-welcome').isVisible(), true);
    assert.equal(await page.locator('#view-settings').isVisible(), false);

    await page.locator('#reasonToggle').click();
    assert.equal(await page.locator('#reasonMenu').isVisible(), true);
    assert.equal(await page.locator('#reasonMenu [data-reason]').count(), 3);
    assert.equal(await page.locator('#reasonMenu [data-feature="deep-reason"]').count(), 1);
    await page.locator('#reasonMenu [data-reason="high"]').click();
    assert.equal(await page.locator('#currentReason').textContent(), 'Высокий');

    await page.locator('#languageToggle').click();
    assert.equal(await page.locator('#languageMenu').isVisible(), true);
    await page.locator('#languageMenu [data-language="kk"]').click();
    assert.equal(await page.locator('#languageToggle .language-current').textContent(), 'Қазақша');

    await page.locator('#attachToggle').click();
    assert.equal(await page.locator('#attachMenu').isVisible(), true);
    await page.locator('#attachMenu [data-feature="file"]').click();
    assert.equal(await page.locator('#modalOverlay').isVisible(), true);
    await page.locator('#modalOverlay [data-action="close-modal"]').first().click();
    assert.equal(await page.locator('#modalOverlay').isVisible(), false);

    await page.locator('.sidebar .google-button').click();
    assert.equal(await page.locator('#googleOverlay').isVisible(), true);
    await page.locator('[data-action="google-demo"]').click();
    assert.equal(await page.locator('#googleOverlay').isVisible(), true);
    await page.locator('[data-action="close-google"]').first().click();
    assert.equal(await page.locator('#googleOverlay').isVisible(), false);

    await page.locator('.sidebar [data-screen="settings"]').click();
    assert.equal(await page.locator('#view-settings').isVisible(), true);
    await page.locator('#fontToggle').click();
    assert.equal(await page.locator('#fontMenu').isVisible(), true);
    await page.locator('[data-font="large"]').click();
    assert.equal(await page.locator('body').getAttribute('class'), 'font-large');
    await page.locator('#settingsLanguageToggle').click();
    assert.equal(await page.locator('#settingsLanguageMenu').isVisible(), true);
    await page.locator('#settingsLanguageMenu [data-language="en"]').click();
    assert.equal(await page.locator('#settingsLanguageToggle .language-current').textContent(), 'English');

    for (const screen of ['history', 'projects', 'tools', 'settings']) {
      await page.locator('.sidebar [data-screen="' + screen + '"]').click();
      assert.equal(await page.locator('#view-' + screen).isVisible(), true, 'navigation to ' + screen);
    }
    await page.locator('#messageInput').fill('Пример сообщения');
    await page.locator('#sendButton').click();
    assert.equal(await page.locator('#view-chat').isVisible(), true);
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Пример сообщения'));
    assert.deepEqual(errors, []);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mobileErrors = [];
    mobile.on('pageerror', e => mobileErrors.push(e.message));
    await mobile.goto(appUrl);
    await mobile.locator('[data-action="toggle-sidebar"]').click();
    assert.equal(await mobile.locator('#sidebar').evaluate(el => el.classList.contains('open')), true);
    await mobile.locator('.sidebar [data-screen="settings"]').click();
    assert.equal(await mobile.locator('#view-settings').isVisible(), true);
    await mobile.locator('#reasonToggle').click();
    assert.equal(await mobile.locator('#reasonMenu').isVisible(), true);
    assert.deepEqual(mobileErrors, []);
    await mobile.close();
    await page.close();
  } finally {
    await browser.close();
  }
});
