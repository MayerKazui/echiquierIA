import { expect, type Page } from '@playwright/test';

/**
 * Opens a view from the navigation: the side panel of the large screens, where every entry is already in sight, or the
 * « Menu » (burger) of the header on the smaller ones.
 */
export async function openFromMenu(page: Page, item: string | RegExp): Promise<void> {
  const burger = page.getByRole('button', { name: 'Menu' });
  if (await burger.isVisible()) {
    await burger.click();
    await page.getByRole('menuitem', { name: item }).click();
    return;
  }
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: item }).click();
}

/** Waits for the screen-reader announcement the app makes once the analysis of a game is complete. */
export async function waitForAnalysis(page: Page): Promise<void> {
  await expect(page.getByText(/Analyse terminée, \d+ demi-coups/)).toBeAttached({ timeout: 75_000 });
}

/** Picks one of the example games, starts the analysis and waits for it to end. */
export async function analyzeSample(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name }).click();
  await page.getByRole('button', { name: /Lancer l'Analyse/ }).click();
  await waitForAnalysis(page);
}

/**
 * Waits until the analysed game is in the browser's history. The app writes it a moment (250 ms) after the analysis
 * ends: a reload or a look at « Mes parties » before that would not find it.
 */
export async function waitForGameSaved(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open('echiquier-ia');
              open.onerror = () => resolve(0);
              open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains('games')) {
                  db.close();
                  resolve(0);
                  return;
                }
                const count = db.transaction('games').objectStore('games').count();
                count.onsuccess = () => {
                  db.close();
                  resolve(count.result);
                };
                count.onerror = () => {
                  db.close();
                  resolve(0);
                };
              };
            })
        ),
      { message: 'la partie analysée est enregistrée dans le navigateur' }
    )
    .toBeGreaterThan(0);
}
