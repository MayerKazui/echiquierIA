import { expect, test } from '@playwright/test';
import { waitForAnalysis } from './support/app';

const PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.09.20"]
[White "testeur"]
[Black "adversaire"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0`;

test("importe les parties d'un pseudo chess.com et en analyse une", async ({ page }) => {
  await page.route('https://api.chess.com/pub/player/testeur/games/archives', (route) =>
    route.fulfill({
      json: { archives: ['https://api.chess.com/pub/player/testeur/games/2026/09'] },
    })
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

  const row = page.locator('#main-content').getByRole('button', { name: /adversaire/ });
  await expect(row).toBeVisible();
  await row.click();
  // Le PGN de la partie choisie est dans le champ, prêt à analyser
  await expect(page.getByRole('textbox', { name: /PGN/i })).toHaveValue(/Nf3 Nc6 3\. Bb5/);

  await page.getByRole('button', { name: /Lancer l'Analyse/ }).click();
  await waitForAnalysis(page);
  await expect(page.getByRole('banner')).toContainText('testeur vs adversaire');
});

test("un pseudo introuvable donne un message d'erreur", async ({ page }) => {
  await page.route('https://api.chess.com/pub/player/inconnu/games/archives', (route) =>
    route.fulfill({ status: 404, json: { message: 'not found' } })
  );
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Pseudo chess.com' }).fill('inconnu');
  await page.getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible();
});
