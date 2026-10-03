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
