import { expect, test } from '@playwright/test';
import { chessComGame, fakeChessComPlayer } from './support/chesscom';
import { openFromMenu } from './support/app';

const RUY = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6';
const SICILIAN = '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6';

test("prépare un adversaire : ses ouvertures, sa ligne favorite, puis l'explorateur de ses parties", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fakeChessComPlayer(page, 'rival', [
    chessComGame(1, 'rival', RUY),
    chessComGame(2, 'rival', RUY),
    chessComGame(3, 'rival', RUY, 'loss'),
    chessComGame(4, 'rival', SICILIAN),
  ]);

  await page.goto('/');
  await openFromMenu(page, /Préparer un adversaire/);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Préparer un adversaire' })).toHaveAttribute('aria-pressed', 'true');

  await dialog.getByRole('textbox', { name: /Pseudo de l'adversaire/ }).fill('rival');
  await dialog.getByRole('button', { name: 'Préparer', exact: true }).click();

  await expect(dialog.getByText(/4 parties lues/)).toBeVisible();
  const white = dialog.getByRole('region', { name: 'Avec les Blancs' });
  await expect(white.getByText(/Partie espagnole/).first()).toBeVisible();
  await expect(white.locator('p', { hasText: 'Sa ligne favorite' })).toContainText(
    '1.e4 e5 2.Cf3 Cc6 3.Fb5 a6 4.Fa4 Cf6'
  );

  // La ligne favorite s'ouvre dans l'explorateur, avec les Blancs de l'adversaire
  await white.getByRole('button', { name: /Voir sa ligne favorite/ }).click();
  await expect(dialog.getByRole('list', { name: 'Coups joués' }).getByRole('button')).toHaveCount(8);
  await expect(dialog.getByRole('button', { name: 'Il joue les Blancs' })).toHaveAttribute('aria-pressed', 'true');
  // Les coups de l'adversaire sont comptés dans le tableau de l'explorateur
  await expect(dialog.getByRole('columnheader', { name: 'Parties de rival' })).toBeVisible();

  // Rien d'envoyé à un autre serveur que chess.com, et aucune erreur
  expect(errors).toEqual([]);
});

test("un pseudo introuvable donne un message d'erreur, sans résultat", async ({ page }) => {
  await page.route('https://api.chess.com/pub/player/inconnu/games/archives', (route) =>
    route.fulfill({ status: 404, json: { message: 'not found' } })
  );
  await page.goto('/');
  await openFromMenu(page, /Préparer un adversaire/);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Pseudo de l'adversaire/ }).fill('inconnu');
  await dialog.getByRole('button', { name: 'Préparer', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Aucun joueur de ce nom');
  await expect(dialog.getByRole('region', { name: 'Avec les Blancs' })).toHaveCount(0);
});
