import { expect, test } from '@playwright/test';
import { openFromMenu, waitForAnalysis } from './support/app';

// Jouée par « testeur » (Blancs) : une partie sans faute grave, donc rien à rejouer, mais le chemin est complet
const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.09.20"]
[White "testeur"]
[Black "adversaire"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0`;

test("« S'entraîner » s'ouvre une fois une partie analysée, sans erreur d'affichage", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.chess.com/pub/player/testeur/games/archives', (route) =>
    route.fulfill({ json: { archives: ['https://api.chess.com/pub/player/testeur/games/2026/09'] } })
  );
  await page.route('https://api.chess.com/pub/player/testeur/games/2026/09', (route) =>
    route.fulfill({
      json: {
        games: [
          {
            url: 'https://www.chess.com/game/live/1',
            pgn: PGN,
            time_control: '600',
            time_class: 'rapid',
            end_time: 1_790_000_000,
            rated: true,
            rules: 'chess',
            white: { username: 'testeur', rating: 1500, result: 'win' },
            black: { username: 'adversaire', rating: 1480, result: 'resigned' },
          },
        ],
      },
    })
  );

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Pseudo chess.com' }).fill('testeur');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await page.getByRole('button', { name: /adversaire/ }).click();
  await page.getByRole('button', { name: /Lancer l'Analyse/ }).click();
  await waitForAnalysis(page);

  await openFromMenu(page, /S'entraîner/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: "S'entraîner sur mes erreurs" })).toBeVisible();
  // Le chargement se termine : ni message d'attente ni alerte
  await expect(dialog.getByText('Chargement')).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  // Le dialogue tient dans la fenêtre : rien ne déborde de l'écran
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(errors).toEqual([]);
});
