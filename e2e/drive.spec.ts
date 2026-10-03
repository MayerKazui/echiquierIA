import { expect, test } from '@playwright/test';
import { analyzeSample, openFromMenu } from './support/app';
import { FakeDrive, installFakeGoogle } from './support/google';

const GAME = 'Paul Morphy – Duke Karl / Count Isouard';

test('deux appareils se retrouvent par Google Drive', async ({ browser }) => {
  const drive = new FakeDrive();

  // Premier appareil : une partie analysée, envoyée sur Drive
  const phone = await browser.newContext({ serviceWorkers: 'block' });
  await installFakeGoogle(phone, drive);
  const first = await phone.newPage();
  await first.goto('/');
  await analyzeSample(first, /Partie de l'Opéra/);
  await openFromMenu(first, /Mes parties/);
  await first.getByRole('button', { name: 'Synchroniser avec Google Drive' }).click();
  await expect(first.getByText(/Drive ne contenait pas encore de copie\. Copie envoyée : 1 partie/)).toBeVisible();
  expect(drive.uploads).toBe(1);

  // Second appareil, vierge : la synchronisation ramène la partie
  const laptop = await browser.newContext({ serviceWorkers: 'block' });
  await installFakeGoogle(laptop, drive);
  const second = await laptop.newPage();
  await second.goto('/');
  await openFromMenu(second, /Mes parties/);
  await expect(second.getByText(GAME)).toHaveCount(0);
  await second.getByRole('button', { name: 'Synchroniser avec Google Drive' }).click();
  await expect(second.getByText(/Depuis Drive : Parties : 1 partie ajoutée/)).toBeVisible();
  await expect(second.getByText(GAME)).toBeVisible();

  await phone.close();
  await laptop.close();
});

test('un refus de Google est expliqué, sans casser la page', async ({ page }) => {
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `window.google = { accounts: { oauth2: { initTokenClient(c) {
        return { requestAccessToken() { setTimeout(() => c.callback({ error: 'access_denied' }), 0); } };
      } } } };`,
    })
  );
  await page.goto('/');
  await openFromMenu(page, /Mes parties/);
  await page.getByRole('button', { name: 'Synchroniser avec Google Drive' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Synchroniser avec Google Drive' })).toBeEnabled();
});
