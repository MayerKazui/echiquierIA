import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { analyzeSample, openFromMenu } from './support/app';

const GAME = 'Paul Morphy – Duke Karl / Count Isouard';

test('la sauvegarde exportée se réimporte dans un navigateur vierge', async ({ page, browser }) => {
  await page.goto('/');
  await analyzeSample(page, /Partie de l'Opéra/);
  await openFromMenu(page, /Mes parties/);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter mes données' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  await expect(page.getByText(/Sauvegarde exportée : 1 partie/)).toBeVisible();

  const path = await download.path();
  const backup = JSON.parse(await readFile(path, 'utf8')) as { games: unknown[] };
  expect(backup.games).toHaveLength(1);

  // Un autre navigateur (stockage vierge) : l'historique est vide, puis la sauvegarde le remplit
  const fresh = await browser.newContext({ serviceWorkers: 'block' });
  const other = await fresh.newPage();
  await other.goto('/');
  await openFromMenu(other, /Mes parties/);
  await expect(other.getByText(GAME)).toHaveCount(0);

  await other.getByLabel('Fichier de sauvegarde').setInputFiles(path);
  await expect(other.getByText(/Parties : 1 partie ajoutée/)).toBeVisible();
  await expect(other.getByText(GAME)).toBeVisible();
  await fresh.close();
});

test("un fichier qui n'est pas une sauvegarde est refusé sans rien changer", async ({ page }) => {
  await page.goto('/');
  await openFromMenu(page, /Mes parties/);

  await page.getByLabel('Fichier de sauvegarde').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"bonjour": "monde"}'),
  });
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
  await expect(page.getByText(GAME)).toHaveCount(0);
});
