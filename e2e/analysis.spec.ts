import { expect, test } from '@playwright/test';
import { analyzeSample, openFromMenu, waitForAnalysis } from './support/app';

const OPERA = /Partie de l'Opéra/;

test.describe('import et analyse', () => {
  test("analyse un exemple de partie et l'affiche", async ({ page }) => {
    await page.goto('/');
    await analyzeSample(page, OPERA);

    await expect(page.getByRole('banner')).toContainText('Paul Morphy vs Duke Karl');
    // La première position est « théorique » : la base d'ouvertures est chargée
    await expect(page.getByText('[B00] Partie du pion roi')).toBeVisible();
    await expect(page.getByRole('button', { name: /Liste \(33\)/ })).toBeVisible();
  });

  test('une partie collée est validée avant analyse', async ({ page }) => {
    await page.goto('/');
    const field = page.getByRole('textbox', { name: /PGN/i });

    await field.fill('ceci n’est pas une partie');
    await page.getByRole('button', { name: /Lancer l'Analyse/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await field.fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O');
    await page.getByRole('button', { name: /Lancer l'Analyse/ }).click();
    await waitForAnalysis(page);
    await expect(page.getByRole('button', { name: /Liste \(16\)/ })).toBeVisible();
  });

  test('la dernière partie se rouvre après un rechargement, sans nouvelle analyse', async ({ page }) => {
    await page.goto('/');
    await analyzeSample(page, OPERA);

    await page.reload();
    await expect(page.getByRole('banner')).toContainText('Paul Morphy vs Duke Karl');
    await expect(page.getByRole('button', { name: /Liste \(33\)/ })).toBeVisible();
    // « Mes parties » la garde, marquée comme affichée
    await openFromMenu(page, /Mes parties/);
    await expect(page.getByText('Paul Morphy – Duke Karl / Count Isouard')).toBeVisible();
    await expect(page.getByText('AFFICHÉE')).toBeVisible();
  });
});
