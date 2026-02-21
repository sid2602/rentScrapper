const { test, expect } = require('@playwright/test');

test('has title', async ({ page }) => {
  await page.goto('https://www.otodom.pl/pl/oferta/przestronne-mieszkanie-65-m-z-balkonem-w-krakowie-ID4Ad2s.html');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Olx/);
});
