import { expect, test } from '@playwright/test';
import { analyzeSample, openFromMenu } from './support/app';

test('une partie contre Stockfish : on joue un coup, le vrai moteur répond, on abandonne', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await openFromMenu(page, /Jouer contre Stockfish/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Jouer contre Stockfish' })).toBeVisible();

  await dialog.getByRole('radio', { name: /Facile/ }).check();
  await dialog.getByRole('button', { name: 'Jouer' }).click();
  await expect(dialog.getByRole('status')).toContainText('À vous de jouer');

  await dialog.locator('[data-square="e2"]').click();
  await dialog.locator('[data-square="e4"]').click();

  // Le moteur répond : un coup noir s'ajoute à la liste, et c'est de nouveau à nous
  await expect(dialog.getByText(/1\.e4 1…/)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('status')).toContainText('À vous de jouer');

  await dialog.getByRole('button', { name: 'Abandonner' }).click();
  await expect(dialog.getByRole('status')).toContainText('Vous avez abandonné.');
  await expect(dialog.getByRole('button', { name: 'Analyser la partie' })).toBeVisible();

  // Le dialogue tient dans la fenêtre
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(errors).toEqual([]);
});

test('le moteur ouvre quand on prend les Noirs, et la partie jouée peut être analysée', async ({ page }) => {
  await page.goto('/');
  await openFromMenu(page, /Jouer contre Stockfish/);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Noirs' }).check();
  await dialog.getByRole('radio', { name: /Débutant/ }).check();
  await dialog.getByRole('button', { name: 'Jouer' }).click();
  await expect(dialog.getByText(/^Coups :/)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('status')).toContainText('À vous de jouer');

  await dialog.getByRole('button', { name: 'Abandonner' }).click();
  await dialog.getByRole('button', { name: 'Analyser la partie' }).click();
  // La partie est analysée : le bilan devient disponible
  await expect(page.getByText(/Analyse terminée, \d+ demi-coups/)).toBeAttached({ timeout: 75_000 });
});

test('« Jouer ici » reprend la position de la partie analysée, et la partie jouée garde le chemin pour être analysée', async ({
  page,
}) => {
  await page.goto('/');
  await analyzeSample(page, /Partie de l'Opéra/);
  // Après le premier coup (1.e4) : le moteur doit répondre depuis cette position
  await page.getByRole('button', { name: 'Jouer ici' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /Position de la partie/ })).toBeChecked();
  await dialog.getByRole('radio', { name: /Débutant/ }).check();
  await dialog.getByRole('button', { name: 'Jouer' }).click();
  await expect(dialog.getByText(/Contre Stockfish · Débutant/)).toBeVisible();
  await dialog.locator('[data-square="e7"]').click();
  await dialog.locator('[data-square="e5"]').click();
  await expect(dialog.getByText(/^1…e5 2\./)).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Abandonner' }).click();
  // La partie complète (1.e4 e5 et la suite) est analysée comme n'importe quelle partie
  await dialog.getByRole('button', { name: 'Analyser la partie' }).click();
  await expect(page.getByText(/Analyse terminée, \d+ demi-coups/).last()).toBeAttached({ timeout: 75_000 });
});
