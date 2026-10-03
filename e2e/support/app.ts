import { expect, type Page } from '@playwright/test';

/** Opens a view from the « Menu » of the header (« Mes parties », « Mon profil »…). */
export async function openFromMenu(page: Page, item: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: item }).click();
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
