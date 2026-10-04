import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { violations } from './support/axe';
import { analyzeSample, openFromMenu, waitForGameSaved } from './support/app';

/** The records the vision exercises keep in the browser. */
const storedRecords = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Array<{ key: string; best: number; runs: number }>>((resolve) => {
        const open = indexedDB.open('echiquier-ia-vision');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('records')) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction('records').objectStore('records').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
          all.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      })
  );

test.describe("l'entraînement de la vision", () => {
  test('Coordonnées : on trouve les cases au clic, sans coordonnées, et le score est gardé', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // L'horloge de la page est à nous : 30 secondes passent d'un coup, sans attendre
    await page.clock.install();
    await page.goto('/');
    await openFromMenu(page, /Coordonnées/);
    const dialog = page.getByRole('dialog', { name: 'Vision' });
    await expect(dialog.getByRole('button', { name: 'Coordonnées', pressed: true })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await dialog.getByRole('button', { name: /^Commencer : Côté des Blancs/ }).click();
    const target = dialog.getByRole('status');
    await expect(target).toHaveText(/^[a-h][1-8]$/);
    // Aucune coordonnée sur l'échiquier tant qu'on ne les demande pas
    await expect(dialog.getByRole('grid').getByText(/^[a-h1-8]$/)).toHaveCount(0);
    expect(await violations(page)).toEqual([]);

    // Deux bonnes réponses d'affilée
    for (let i = 1; i <= 2; i++) {
      const square = (await target.textContent())!;
      await dialog.locator(`[data-square="${square}"]`).click();
      await expect(dialog.getByText(new RegExp(`${i} bonnes? réponses? · 0 erreur`))).toBeVisible();
    }

    // Le temps écoulé (30 s)
    await page.clock.fastForward(31_000);
    await expect(dialog.getByText(/^Score : \d+$/)).toBeVisible();
    await expect(dialog.getByText(/Premier score enregistré|Nouveau record|Votre record/)).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await expect
      .poll(() => storedRecords(page))
      .toEqual([expect.objectContaining({ key: 'coordinates:white', runs: 1 })]);

    // Le record est encore là après un rechargement
    await page.reload();
    await openFromMenu(page, /Coordonnées/);
    await expect(page.getByRole('dialog').getByText(/Record : \d+ · 1 partie/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Mode aveugle : la partie est lue sans pièces, puis les questions, puis la position', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await openFromMenu(page, /Mode aveugle/);
    const dialog = page.getByRole('dialog', { name: 'Vision' });
    await dialog.getByRole('button', { name: /^Commencer : Courte/ }).click();

    // Les 6 demi-coups, sans une pièce sur l'échiquier
    const pieces = dialog.locator('[role="gridcell"] svg[viewBox="0 0 45 45"]');
    for (let i = 0; i < 6; i++) {
      await expect(dialog.getByText(`Coup ${i + 1} sur 6`)).toBeVisible();
      await expect(pieces).toHaveCount(0);
      if (i === 0) expect(await violations(page)).toEqual([]);
      await dialog.getByRole('button', { name: i < 5 ? 'Coup suivant' : 'Terminé : poser les questions' }).click();
    }

    // Cinq questions, auxquelles on répond « vide » : le score est ce qu'il est, il est gardé
    for (let i = 1; i <= 5; i++) {
      await expect(dialog.getByText(`Question ${i} sur 5`)).toBeVisible();
      await expect(pieces).toHaveCount(0);
      if (i === 1) expect(await violations(page)).toEqual([]);
      await dialog.getByRole('button', { name: 'Case vide' }).click();
      await expect(dialog.getByRole('status').filter({ hasText: /^(Juste|Raté)/ })).toBeVisible();
      await dialog.getByRole('button', { name: i < 5 ? 'Question suivante' : 'Voir le résultat' }).click();
    }
    await expect(dialog.getByText(/^Score : \d\/5$/)).toBeVisible();
    // Les pièces reviennent pour vérifier
    await expect(pieces.first()).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await expect.poll(() => storedRecords(page)).toEqual([expect.objectContaining({ key: 'blind:short', runs: 1 })]);
    expect(errors).toEqual([]);
  });

  test("Calcul de lignes : une ligne s'écrit sous la position, on répond, la position d'arrivée s'affiche", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await openFromMenu(page, /Calcul de lignes/);
    const dialog = page.getByRole('dialog', { name: 'Vision' });
    await dialog.getByRole('button', { name: /^Commencer : Moyennes/ }).click();

    for (let i = 1; i <= 5; i++) {
      await expect(dialog.getByText(`Question ${i} sur 5`)).toBeVisible();
      await expect(dialog.getByRole('grid', { name: 'Position au début de la ligne' })).toBeVisible();
      if (i === 1) expect(await violations(page)).toEqual([]);
      // Selon la question : la pièce est prise (où est-elle ?) ou la case est vide (que contient-elle ?)
      const taken = dialog.getByRole('button', { name: 'La pièce est prise' });
      if (await taken.isVisible()) await taken.click();
      else await dialog.getByRole('button', { name: 'Case vide' }).click();
      await expect(dialog.getByRole('grid', { name: 'Position à la fin de la ligne' })).toBeVisible();
      if (i === 1) expect(await violations(page)).toEqual([]);
      await dialog.getByRole('button', { name: i < 5 ? 'Question suivante' : 'Voir le résultat' }).click();
    }
    await expect(dialog.getByText(/^Score : \d\/5$/)).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await expect.poll(() => storedRecords(page)).toEqual([expect.objectContaining({ key: 'lines:medium', runs: 1 })]);
    expect(errors).toEqual([]);
  });

  test('Coordonnées : nommer la case éclairée, et dire la couleur d’une case', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await openFromMenu(page, /Coordonnées/);
    const dialog = page.getByRole('dialog', { name: 'Vision' });

    await dialog.getByRole('button', { name: /^Commencer : Nommer la case/ }).click();
    const lit = dialog.locator('[aria-label="case, case demandée"]');
    await expect(lit).toHaveCount(1);
    expect(await violations(page)).toEqual([]);
    const square = (await lit.getAttribute('data-square'))!;
    await page.keyboard.press(square[0]);
    await page.keyboard.press(square[1]);
    await expect(dialog.getByText(/1 bonne réponse · 0 erreur/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Fermer' }).click();
    await openFromMenu(page, /Coordonnées/);
    await dialog.getByRole('button', { name: /^Commencer : Couleur de la case/ }).click();
    await expect(dialog.getByRole('grid')).toHaveCount(0);
    expect(await violations(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Claire' }).click();
    await expect(dialog.getByText(/1 (bonne réponse|erreur)/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Partie à l’aveugle : on tape ses coups sur un échiquier vide, le vrai moteur répond, la progression suit', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await openFromMenu(page, /Partie à l’aveugle/);
    const dialog = page.getByRole('dialog', { name: 'Vision' });
    await expect(dialog.getByRole('button', { name: 'Partie à l’aveugle', pressed: true })).toBeVisible();
    expect(await violations(page)).toEqual([]);

    await dialog.getByRole('button', { name: /^Commencer : Débutant/ }).click();
    const pieces = dialog.locator('[role="gridcell"] svg[viewBox="0 0 45 45"]');
    await expect(pieces).toHaveCount(0);
    await dialog.getByLabel('Votre coup').fill('e4');
    await dialog.getByLabel('Votre coup').press('Enter');
    await expect(dialog.getByRole('status').first()).toContainText('Stockfish a joué', { timeout: 30_000 });
    await expect(pieces).toHaveCount(0);
    expect(await violations(page)).toEqual([]);

    // Un coup illégal est refusé sans pénalité
    await dialog.getByLabel('Votre coup').fill('e9');
    await dialog.getByLabel('Votre coup').press('Enter');
    await expect(dialog.getByRole('alert')).toContainText('n’est pas un coup légal');

    await dialog.getByRole('button', { name: 'Abandonner' }).click();
    await expect(dialog.getByText('Résultat : Défaite')).toBeVisible();
    await expect(pieces.first()).toBeVisible();
    await expect.poll(() => storedRecords(page)).toEqual([expect.objectContaining({ key: 'game:debutant', runs: 1 })]);

    await dialog.getByRole('button', { name: 'Progression' }).click();
    await expect(dialog.getByRole('heading', { name: 'Partie à l’aveugle · Débutant' })).toBeVisible();
    expect(await violations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Mode aveugle : on peut lire une de ses propres parties analysées', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await analyzeSample(page, /Partie de l'Opéra/);
    await waitForGameSaved(page);

    await openFromMenu(page, /Mode aveugle/);
    const dialog = page.getByRole('dialog', { name: 'Vision' });
    await dialog.getByRole('radio', { name: 'Mes parties analysées' }).check();
    await expect(dialog.getByText(/1 partie dans votre historique/)).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await dialog.getByRole('button', { name: /^Commencer : Courte/ }).click();
    for (let i = 0; i < 6; i++) {
      await dialog.getByRole('button', { name: i < 5 ? 'Coup suivant' : 'Terminé : poser les questions' }).click();
    }
    for (let i = 1; i <= 5; i++) {
      await dialog.getByRole('button', { name: 'Case vide' }).click();
      await dialog.getByRole('button', { name: i < 5 ? 'Question suivante' : 'Voir le résultat' }).click();
    }
    await expect(dialog.getByText(/Partie lue : .*\(une de vos parties\)/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('ne demande rien au réseau, et le record voyage dans la sauvegarde', async ({ page, browser }) => {
    const outside: string[] = [];
    await page.goto('/');
    page.on('request', (request) => {
      if (!request.url().startsWith('http://localhost:3100')) outside.push(request.url());
    });
    await openFromMenu(page, /Mode aveugle/);
    const dialog = page.getByRole('dialog', { name: 'Vision' });
    await dialog.getByRole('button', { name: /^Commencer : Courte/ }).click();
    for (let i = 0; i < 6; i++) {
      await dialog.getByRole('button', { name: i < 5 ? 'Coup suivant' : 'Terminé : poser les questions' }).click();
    }
    for (let i = 1; i <= 5; i++) {
      await dialog.getByRole('button', { name: 'Case vide' }).click();
      await dialog.getByRole('button', { name: i < 5 ? 'Question suivante' : 'Voir le résultat' }).click();
    }
    await expect(dialog.getByText(/^Score : \d\/5$/)).toBeVisible();
    await expect.poll(() => storedRecords(page)).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Fermer' }).click();
    expect(outside).toEqual([]);

    // La sauvegarde (format 9) porte le record, et le rend à un navigateur vierge
    await openFromMenu(page, /Mes parties/);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter mes données' }).click();
    const path = await (await downloading).path();
    const backup = JSON.parse(await readFile(path, 'utf8')) as {
      format: number;
      visionRecords: Array<{ key: string; best: number; runs: number }>;
    };
    expect(backup.format).toBe(9);
    expect(backup.visionRecords).toEqual([expect.objectContaining({ key: 'blind:short', runs: 1 })]);
    const { best } = backup.visionRecords[0];

    const fresh = await browser.newContext({ serviceWorkers: 'block' });
    const other = await fresh.newPage();
    await other.goto('/');
    await openFromMenu(other, /Mes parties/);
    await other.getByLabel('Fichier de sauvegarde').setInputFiles(path);
    await expect(other.getByText(/Vision : 1 record restauré/)).toBeVisible();
    await other.getByRole('button', { name: 'Fermer' }).first().click();
    await openFromMenu(other, /Mode aveugle/);
    await expect(other.getByRole('dialog').getByText(`Record : ${best}/5 · 1 partie`)).toBeVisible();
    await fresh.close();
  });
});
