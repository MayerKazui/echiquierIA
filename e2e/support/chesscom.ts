import type { Page } from '@playwright/test';

/** A game of a chess.com archive: `username` plays White against `other`, from the moves given as PGN text. */
export function chessComGame(id: number, username: string, moves: string, result: 'win' | 'loss' = 'win') {
  return {
    url: `https://www.chess.com/game/live/${id}`,
    pgn: `[Event "Live Chess"]\n[White "${username}"]\n[Black "autre"]\n[Result "1-0"]\n\n${moves} 1-0`,
    time_control: '300',
    time_class: 'blitz',
    end_time: 1_790_000_000 + id,
    rated: true,
    rules: 'chess',
    white: { username, rating: 1850, result },
    black: { username: 'autre', rating: 1800, result: result === 'win' ? 'resigned' : 'win' },
  };
}

/** A fake chess.com for one player: a single monthly archive holding these games. */
export async function fakeChessComPlayer(page: Page, username: string, games: unknown[]): Promise<void> {
  const base = `https://api.chess.com/pub/player/${username}/games`;
  await page.route(`${base}/archives`, (route) => route.fulfill({ json: { archives: [`${base}/2026/09`] } }));
  await page.route(`${base}/2026/09`, (route) => route.fulfill({ json: { games } }));
}
