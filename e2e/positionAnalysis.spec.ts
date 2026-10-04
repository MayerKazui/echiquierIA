import { expect, test } from '@playwright/test';
import { violations } from './support/axe';
import { analyzeSample, openFromMenu } from './support/app';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

test("l'analyse libre : les trois meilleures lignes du vrai moteur, en direct, et on joue dessus", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await openFromMenu(page, /Analyser une position/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Analyser une position' })).toBeVisible();

  // Trois lignes, qui s'approfondissent d'elles-mêmes
  const lines = dialog.getByRole('list', { name: 'Meilleures lignes' }).getByRole('listitem');
  await expect(lines).toHaveCount(3, { timeout: 30_000 });
  const depthOf = async () =>
    Number(((await dialog.getByText(/^profondeur \d+/).textContent()) ?? '').match(/\d+/)?.[0]);
  await expect.poll(depthOf, { timeout: 30_000 }).toBeGreaterThan(10);

  // Un clic sur un coup de la deuxième ligne le joue, et la position suivante est analysée à son tour
  const secondLine = lines.nth(1);
  const firstMove = secondLine.getByRole('button').first();
  const label = ((await firstMove.getAttribute('aria-label')) ?? '').replace('Jouer la ligne jusqu’à ', '');
  await firstMove.click();
  await expect(dialog.locator('p', { hasText: 'Coups joués' })).toContainText(label);
  await expect(lines).toHaveCount(3, { timeout: 30_000 });
  await expect.poll(depthOf, { timeout: 30_000 }).toBeGreaterThan(8);

  // Le moteur se met en pause, et reprend
  await dialog.getByRole('button', { name: 'Pause' }).click();
  await expect(dialog.getByRole('status').first()).toContainText('En pause');
  await dialog.getByRole('button', { name: 'Reprendre' }).click();
  await expect(dialog.getByRole('status').first()).toContainText('Analyse en cours');

  expect(await violations(page)).toEqual([]);

  // Le dialogue tient dans la fenêtre
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(errors).toEqual([]);
});

test('une FEN collée : un mat en un coup est vu, avec les lignes suivantes', async ({ page }) => {
  await page.goto('/');
  await openFromMenu(page, /Analyser une position/);
  const dialog = page.getByRole('dialog');

  const field = dialog.getByLabel('Position (FEN)');
  await field.fill('6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1');
  await field.press('Enter');
  const lines = dialog.getByRole('list', { name: 'Meilleures lignes' }).getByRole('listitem');
  await expect(lines.first()).toContainText('M1', { timeout: 30_000 });
  await expect(lines.first()).toContainText('1.Ta8#');
  await expect(lines).toHaveCount(3);

  // Une position impossible est refusée, avec la raison
  await field.fill('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1');
  await field.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('échec');
});

test("l'éditeur : on pose les pièces, puis le moteur analyse cette position", async ({ page }) => {
  await page.goto('/');
  await openFromMenu(page, /Analyser une position/);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Éditer la position' }).click();
  await dialog.getByRole('button', { name: 'Vider l’échiquier' }).click();
  await expect(dialog.getByRole('button', { name: 'Analyser cette position' })).toBeDisabled();

  const put = async (piece: string, square: string) => {
    await dialog.getByRole('button', { name: piece, exact: true }).click();
    await dialog.locator(`[data-square="${square}"]`).click();
  };
  await put('Roi blanc', 'g1');
  await put('Roi noir', 'g8');
  await put('Dame blanche', 'd1');
  await put('Pion noir', 'f7');
  await put('Pion noir', 'g7');
  await put('Pion noir', 'h7');
  await expect(dialog.getByLabel('Position (FEN)')).toHaveValue('6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1');
  await expect(dialog.getByText('La position est valide.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Analyser cette position' }).click();
  const lines = dialog.getByRole('list', { name: 'Meilleures lignes' }).getByRole('listitem');
  await expect(lines.first()).toContainText('M1', { timeout: 30_000 });
  await expect(lines.first()).toContainText('1.Dd8#'); // le mat du rang arrière
  expect(await violations(page)).toEqual([]);
});

test('« Analyser ici » reprend la position de la partie analysée', async ({ page }) => {
  await page.goto('/');
  await analyzeSample(page, /Partie de l'Opéra/);
  await page.getByRole('button', { name: 'Analyser ici' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Analyser une position' })).toBeVisible();
  // La position de la partie (au premier coup : 1.e4), pas la position initiale
  await expect(dialog.getByLabel('Position (FEN)')).not.toHaveValue(FEN);
  await expect(dialog.getByRole('list', { name: 'Meilleures lignes' }).getByRole('listitem')).toHaveCount(3, {
    timeout: 30_000,
  });
});
