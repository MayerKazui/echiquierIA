import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { analyzeSample, openFromMenu } from './support/app';
import { chessComGame, fakeChessComPlayer } from './support/chesscom';

const axeSource = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

interface Violation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: { target: unknown[] }[];
}

/** The WCAG A and AA rules of axe-core, run on what the page shows now (contrast included: it needs a real browser). */
async function violations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axeSource });
  const found = await page.evaluate(async () => {
    const axe = (
      window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: Violation[] }> } }
    ).axe;
    const results = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return results.violations;
  });
  return found.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('accessibilité (axe-core)', () => {
  test("l'écran d'import", async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /Lancer l'Analyse/ })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('une partie analysée, avec son bilan', async ({ page }) => {
    await page.goto('/');
    await analyzeSample(page, /Partie de l'Opéra/);
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Bilan' }).click();
    await expect(page.getByRole('button', { name: 'Échiquier' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('« Mes parties » et la sauvegarde', async ({ page }) => {
    await page.goto('/');
    await analyzeSample(page, /Partie de l'Opéra/);
    await openFromMenu(page, /Mes parties/);
    await expect(page.getByRole('button', { name: 'Exporter mes données' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });

  test('« Jouer contre Stockfish » : le choix de la partie, puis la partie', async ({ page }) => {
    await page.goto('/');
    await openFromMenu(page, /Jouer contre Stockfish/);
    await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    // Avec pendule : les deux choix, puis les deux pendules de la partie
    await page.getByRole('radio', { name: 'Avec pendule' }).check();
    await expect(page.getByRole('combobox', { name: 'Temps de chaque camp' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Jouer', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'À vous de jouer' })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(2);
    expect(await violations(page)).toEqual([]);
  });

  test("« Préparer un adversaire » : le formulaire, puis les ouvertures et l'explorateur", async ({ page }) => {
    const moves = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6';
    await fakeChessComPlayer(
      page,
      'rival',
      [1, 2, 3].map((id) => chessComGame(id, 'rival', moves))
    );
    await page.goto('/');
    await openFromMenu(page, /Préparer un adversaire/);
    await expect(page.getByRole('button', { name: 'Préparer', exact: true })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await page.getByRole('textbox', { name: /Pseudo de l'adversaire/ }).fill('rival');
    await page.getByRole('button', { name: 'Préparer', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Avec les Blancs' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});
