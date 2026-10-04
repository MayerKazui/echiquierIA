import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { analyzeSample, openFromMenu } from './support/app';

const axeSource = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** The WCAG A and AA rules of axe-core on what the page shows now. */
async function violations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axeSource });
  const found = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            c: Document,
            o: object
          ) => Promise<{
            violations: { id: string; impact?: string | null; help: string; nodes: { target: unknown[] }[] }[];
          }>;
        };
      }
    ).axe;
    return (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations;
  });
  return found.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe("l'usage de tous les jours", () => {
  test('« Mes parties » : recherche, filtres, note et étiquette, qui survivent à un rechargement', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await analyzeSample(page, /Partie de l'Opéra/);
    // La partie est enregistrée un instant après l'analyse : on rouvre la liste tant qu'elle n'y est pas
    const dialog = page.getByRole('dialog');
    await expect(async () => {
      await openFromMenu(page, /Mes parties/);
      try {
        await expect(dialog.getByRole('button', { name: /^Ouvrir la partie/ })).toHaveCount(1, { timeout: 1000 });
      } catch (error) {
        await page.keyboard.press('Escape');
        throw error;
      }
    }).toPass({ timeout: 15_000 });

    // La recherche et les filtres, accessibles
    await dialog.getByRole('button', { name: /^Filtres/ }).click();
    await expect(dialog.getByLabel('Période')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await dialog.getByRole('searchbox', { name: 'Rechercher une partie' }).fill('zzz-introuvable');
    await expect(dialog.getByText('Aucune partie ne correspond à cette recherche.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Afficher toutes les parties' }).click();
    await expect(dialog.getByRole('button', { name: /^Ouvrir la partie/ })).toHaveCount(1);

    // Une note et une étiquette
    await dialog.getByRole('button', { name: /Ajouter une note de la partie/ }).click();
    await dialog.getByLabel('Note personnelle').fill('Le sacrifice de dame à voir et revoir');
    await dialog.getByLabel('Étiquettes', { exact: true }).fill('classique');
    await dialog.getByLabel('Étiquettes', { exact: true }).press('Enter');
    expect(await violations(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog.getByText('Le sacrifice de dame à voir et revoir')).toBeVisible();

    // La note se retrouve par la recherche, et reste après un rechargement
    await page.reload();
    await openFromMenu(page, /Mes parties/);
    await page.getByRole('searchbox', { name: 'Rechercher une partie' }).fill('sacrifice de dame');
    await expect(page.getByText('Le sacrifice de dame à voir et revoir')).toBeVisible();
    await expect(page.getByText('classique', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("l'export en PGN annoté : le fichier relu garde les coups, les évaluations et les symboles", async ({
    page,
  }) => {
    await page.goto('/');
    await analyzeSample(page, /Partie de l'Opéra/);
    await page.getByRole('button', { name: 'Exporter', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Exporter la partie en PGN annoté' })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: /Enregistrer le \.pgn/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pgn$/);
    const path = await download.path();
    const text = await readFile(path, 'utf8');
    expect(text).toContain('[Annotator "Échiquier IA (Stockfish');
    expect(text).toMatch(/\[%eval -?\d+\.\d{2}\]/);
    expect(text).toContain('1. e4');
    // Aucun lien : ni vers Lichess ni vers un autre site écrit par l'application
    expect(text.toLowerCase()).not.toContain('lichess');
  });

  test("« À réviser aujourd'hui » : vide au début, la fenêtre s'ouvre, sans erreur ni défaut d'accessibilité", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    // Rien n'a encore été travaillé : l'accueil ne montre pas la carte
    await expect(page.getByRole('region', { name: "À réviser aujourd'hui" })).toHaveCount(0);
    await openFromMenu(page, /À réviser aujourd'hui/);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: "À réviser aujourd'hui" })).toBeVisible();
    await expect(dialog.getByText('Chargement…')).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("« Tout réviser » : la carte de l'accueil compte ce qui revient, ouvre la finale, puis propose de continuer", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    // Une finale ratée hier, qui revient aujourd'hui (la même carte que la répétition espacée écrit)
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('echiquier-ia-training', 1);
          open.onupgradeneeded = () => open.result.createObjectStore('cards', { keyPath: 'id' });
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('cards', 'readwrite');
            const day = 24 * 60 * 60 * 1000;
            tx.objectStore('cards').put({
              id: 'finale:mat-dame',
              level: 1,
              dueAt: Date.now() - day / 2,
              lastSeen: Date.now() - day,
              attempts: 1,
              failures: 1,
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          };
        })
    );
    await page.reload();

    const card = page.getByRole('region', { name: "À réviser aujourd'hui" });
    await expect(card.getByRole('status')).toContainText('1 chose à réviser');
    await expect(card.getByText('1 finale à rejouer')).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await card.getByRole('button', { name: 'Tout réviser' }).click();
    const finales = page.getByRole('dialog');
    await expect(finales.getByRole('heading', { name: 'Finales', exact: true })).toBeVisible();
    await finales.getByRole('button', { name: 'Fermer' }).click();

    // La finale n'a pas été jouée : elle reste à réviser, et la liste revient pour continuer
    const review = page.getByRole('dialog');
    await expect(review.getByRole('button', { name: 'Continuer à réviser' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
