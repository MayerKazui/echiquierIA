import { expect, test } from '@playwright/test';
import { analyzeSample, openFromMenu, waitForAnalysis, waitForGameSaved } from './support/app';

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
    // La partie est écrite un instant après l'analyse : recharger avant ne retrouverait rien
    await waitForGameSaved(page);

    await page.reload();
    await expect(page.getByRole('banner')).toContainText('Paul Morphy vs Duke Karl');
    await expect(page.getByRole('button', { name: /Liste \(33\)/ })).toBeVisible();
    // « Mes parties » la garde, marquée comme affichée
    await openFromMenu(page, /Mes parties/);
    await expect(page.getByText('Paul Morphy – Duke Karl / Count Isouard')).toBeVisible();
    await expect(page.getByText('AFFICHÉE')).toBeVisible();
  });

  test('recharger tout de suite après une analyse ne fait pas perdre la partie', async ({ page }) => {
    // La sauvegarde différée de l'application (250 ms) est repoussée d'une minute : seule la fermeture de la page,
    // qui écrit la partie sans attendre, peut alors la garder (sans cela le test dépendrait de la vitesse du rechargement)
    await page.addInitScript(() => {
      const setTimeoutNow = window.setTimeout.bind(window);
      window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
        setTimeoutNow(handler, delay === 250 ? 60_000 : delay, ...args)) as typeof window.setTimeout;
    });
    await page.goto('/');
    await analyzeSample(page, OPERA);
    await page.reload();
    await expect(page.getByRole('banner')).toContainText('Paul Morphy vs Duke Karl');
    await openFromMenu(page, /Mes parties/);
    await expect(page.getByText('Paul Morphy – Duke Karl / Count Isouard')).toBeVisible();
  });

  test("l'entraîneur explique un coup sans rien demander au réseau", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
    });
    await page.goto('/');
    await analyzeSample(page, OPERA);

    await page.getByRole('button', { name: 'Expliquer ce coup' }).click();
    await expect(page.getByText('Concept clé : Théorie de l’ouverture', { exact: true })).toBeVisible();
    await expect(page.getByText(/e4 est un coup de théorie \(Partie du pion roi\)/)).toBeVisible();
    await expect(page.getByText(/Plan (suggéré|de redressement)/)).toBeVisible();
    expect(apiCalls).toEqual([]);
  });
});
