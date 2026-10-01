// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PSEUDO, blunder, game, mv } from '../../test/profileFixtures';
import { buildProfile, type ProfileSource } from '../../utils/weaknessProfile';
import { ProfileView } from './ProfileView';

async function show(sources: ProfileSource[]) {
  const profile = await buildProfile(sources);
  render(<ProfileView profile={profile} />);
  return profile;
}

/** `count` games of 40 moves for Alice (80 plies), blunders at the given ply of each game. */
const games = (count: number, blunderPlies: number[] = [], over: Parameters<typeof game>[0] = {}) =>
  Array.from({ length: count }, (_, i) =>
    game({
      id: `g${i}`,
      savedAt: i + 1,
      meta: { date: `2024.03.${String(i + 1).padStart(2, '0')}`, ...over.meta },
      moves: Array.from({ length: 80 }, (_, ply) => (blunderPlies.includes(ply) ? blunder(ply) : mv(ply))),
      ...over,
    })
  );

const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;

describe('ProfileView', () => {
  describe('summary', () => {
    it('shows the games counted, the mean accuracy, the results and the faults per game', async () => {
      await show(games(6, [60, 62]));
      const tile = (label: string) => screen.getByText(label).parentElement!;
      expect(within(tile('Parties comptées')).getByText('6')).toBeTruthy();
      expect(within(tile('Précision moyenne')).getByText(/^\d+(,\d)? %$/)).toBeTruthy();
      expect(within(tile('Résultats')).getByText('6-0-0')).toBeTruthy();
      expect(within(tile('Erreurs par partie')).getByText('2')).toBeTruthy();
    });

    it('warns that few games are a first idea only, up to four games', async () => {
      await show(games(4));
      expect(screen.getByRole('note').textContent).toContain('Seulement 4 parties');
    });

    it('says "partie" for one game', async () => {
      await show(games(1));
      expect(screen.getByRole('note').textContent).toContain('Seulement 1 partie :');
    });

    it('does not warn from five games', async () => {
      await show(games(5));
      expect(screen.queryByRole('note')).toBeNull();
    });
  });

  describe('insights', () => {
    it('lists what stands out', async () => {
      // 6 blunders of the same kind in 8 games: far more than a quarter of the faults
      const hanging = Array.from({ length: 8 }, (_, i) =>
        game({
          id: `h${i}`,
          savedAt: i,
          moves: Array.from({ length: 40 }, (_, ply) =>
            ply === 20 && i < 6 ? blunder(ply, { faultKind: 'hanging' }) : mv(ply)
          ),
        })
      );
      await show(hanging);
      const list = within(section('À retenir')).getByRole('list');
      expect(within(list).getByText('100 % de vos erreurs (6 sur 6) laissent une pièce en prise.')).toBeTruthy();
    });

    it('says so when nothing stands out', async () => {
      await show(games(6));
      expect(within(section('À retenir')).getByText(/Aucun écart marqué/)).toBeTruthy();
    });
  });

  describe('by phase', () => {
    it('gives the average of all the moves, to compare the phases with', async () => {
      await show(games(6));
      expect(
        within(section('Par phase de la partie')).getByText(
          /théorie d'ouverture exclue \(100 % en moyenne sur l'ensemble\)\./
        )
      ).toBeTruthy();
    });

    it('shows the three phases with their accuracy, number of moves and faults per 100 moves', async () => {
      await show(games(8, [2, 40, 70]));
      const list = within(section('Par phase de la partie')).getByRole('list');
      const [opening, middle, end] = within(list).getAllByRole('listitem');
      expect(opening.textContent).toContain('Ouverture (coups 1 à 12)');
      expect(middle.textContent).toContain('Milieu de jeu (coups 13 à 30)');
      expect(end.textContent).toContain('Finale (coup 31 et après)');
      // 8 games × 12 moves in the opening, one blunder in each game
      expect(opening.textContent).toContain('96 coups · 8,3 erreurs pour 100 coups');
      expect(end.textContent).toContain('80 coups · 10 erreurs pour 100 coups');
    });

    it('marks the phase to work on, and only that one', async () => {
      // 8 games with 2 blunders in the endgame (moves 31+): 80 endgame moves, 16 faults
      await show(games(8, [62, 66]));
      const rows = within(within(section('Par phase de la partie')).getByRole('list')).getAllByRole('listitem');
      expect(within(rows[2]).getByText('À travailler')).toBeTruthy();
      expect(within(rows[0]).queryByText('À travailler')).toBeNull();
      expect(within(rows[1]).queryByText('À travailler')).toBeNull();
    });

    it('warns when a phase has few moves', async () => {
      await show(games(1));
      const rows = within(within(section('Par phase de la partie')).getByRole('list')).getAllByRole('listitem');
      expect(rows[0].textContent).toContain('peu de coups, à prendre avec prudence');
      expect(rows[0].textContent).toContain('12 coups');
    });
  });

  describe('by kind of fault', () => {
    const kinded = () =>
      Array.from({ length: 6 }, (_, i) =>
        game({
          id: `k${i}`,
          savedAt: i,
          moves: Array.from({ length: 40 }, (_, ply) =>
            ply === 20 ? blunder(ply, { faultKind: i < 3 ? 'wasted' : i < 5 ? 'mate' : 'other' }) : mv(ply)
          ),
        })
      );

    it('shows each kind with its share and its count', async () => {
      await show(kinded());
      const section_ = section('Vos erreurs, par type');
      expect(within(section_).getByText('6 erreurs (erreurs, gaffes et occasions manquées).')).toBeTruthy();
      const rows = within(within(section_).getAllByRole('list')[0]).getAllByRole('listitem');
      expect(rows).toHaveLength(5);
      expect(rows[0].textContent).toContain('Mat manqué ou subi');
      expect(rows[0].textContent).toContain('33 % · 2');
      expect(rows[1].textContent).toContain('0 % · 0');
      expect(rows[3].textContent).toContain('Avantage gâché');
      expect(rows[3].textContent).toContain('50 % · 3');
      expect(rows[4].textContent).toContain('17 % · 1');
    });

    it('explains each kind', async () => {
      await show(kinded());
      expect(screen.getByText(/Fourchette, clouage ou pièce adverse à prendre/)).toBeTruthy();
    });

    it('says so when there is no fault', async () => {
      await show(games(6));
      expect(within(section('Vos erreurs, par type')).getByText('Aucune erreur dans ces parties.')).toBeTruthy();
    });

    it('lists the worst faults, with the moves in French notation and the engine move', async () => {
      const moves = [
        ...Array.from({ length: 20 }, (_, i) => mv(i)),
        blunder(20, { san: 'Nf3', bestMoveSan: 'Qh5', winPercentLoss: 42, faultKind: 'hanging' }),
      ];
      await show([game({ moves, black: 'Bob', meta: { date: '2024.03.17' } })]);
      const item = screen.getByText(/Contre Bob/).closest('li')!;
      expect(item.textContent).toContain('Contre Bob · 17 mars 2024 · coup 11 · pièce laissée en prise');
      expect(item.textContent).toContain(
        'Vous avez joué Cf3 (42 points de chances de gain en moins), le moteur proposait Dh5.'
      );
    });

    it('does not suggest the move that was played', async () => {
      const moves = [...Array.from({ length: 20 }, (_, i) => mv(i)), blunder(20, { san: 'Nf3', bestMoveSan: 'Nf3' })];
      await show([game({ moves })]);
      expect(screen.getByText(/Contre Bob/).closest('li')!.textContent).not.toContain('le moteur proposait');
    });
  });

  describe('by situation', () => {
    it('always shows the colours, with accuracy, games, score and moves', async () => {
      await show([
        ...games(2),
        game({
          id: 'b',
          white: 'Carl',
          black: PSEUDO,
          meta: { result: '0-1' },
          moves: Array.from({ length: 80 }, (_, i) => mv(i)),
        }),
      ]);
      const colours = within(section('Selon la situation')).getByText('Couleur').parentElement!;
      expect(within(colours).getByText('Avec les Blancs').closest('li')!.textContent).toContain(
        '2 parties · score 100 % · 80 coups'
      );
      expect(within(colours).getByText('Avec les Noirs').closest('li')!.textContent).toContain(
        '1 partie · score 100 % · 40 coups'
      );
    });

    it('shows no figure for a colour never played', async () => {
      await show(games(1));
      const row = screen.getByText('Avec les Noirs').closest('li')!;
      expect(row.textContent).toContain('—');
      expect(row.textContent).toContain('0 partie · Aucun coup.');
    });

    it('shows nothing about the clock, the speed, the opponents or the time control when there is no data', async () => {
      await show(games(2));
      for (const title of ['Temps à la pendule', 'Vitesse de jeu', "Force de l'adversaire", 'Cadence']) {
        expect(screen.queryByText(title)).toBeNull();
      }
    });

    it('shows the time left, with the limit explained and the games with a clock', async () => {
      const timed = game({
        meta: { timeControl: '300' },
        moves: Array.from({ length: 60 }, (_, i) =>
          mv(i, i % 2 === 0 ? { clock: i < 20 ? '0:20' : '3:00', thinkTimeSeconds: 5 } : {})
        ),
      });
      await show([timed]);
      const block = screen.getByText('Temps à la pendule').parentElement!;
      expect(within(block).getByText('Avec peu de temps').closest('li')!.textContent).toContain('10 coups');
      expect(within(block).getByText('Avec du temps').closest('li')!.textContent).toContain('20 coups');
      expect(block.textContent).toContain('1 partie avec pendule');
    });

    it('shows the speed of play', async () => {
      const fast = game({
        moves: Array.from({ length: 40 }, (_, i) => mv(i, { thinkTimeSeconds: i % 4 === 0 ? 1 : 8 })),
      });
      await show([fast]);
      const block = screen.getByText('Vitesse de jeu').parentElement!;
      expect(
        within(block)
          .getByText(/d'un seul coup/)
          .closest('li')!.textContent
      ).toContain('10 coups');
      expect(within(block).getByText('Coups réfléchis').closest('li')!.textContent).toContain('10 coups');
    });

    it('shows only the groups of opponents there are games against', async () => {
      await show([
        game({ id: 'a', meta: { whiteElo: '1500', blackElo: '1700' } }),
        game({ id: 'b', meta: { whiteElo: '1500', blackElo: '1510' } }),
      ]);
      const block = screen.getByText("Force de l'adversaire").parentElement!;
      expect(within(block).getByText(/^Plus fort/)).toBeTruthy();
      expect(within(block).getByText(/^De votre niveau/)).toBeTruthy();
      expect(within(block).queryByText(/^Plus faible/)).toBeNull();
    });

    it('shows the time controls played', async () => {
      await show([
        game({ id: 'a', meta: { timeControl: '180' } }),
        game({ id: 'b', meta: { timeControl: '1/86400' } }),
      ]);
      const block = screen.getByText('Cadence').parentElement!;
      expect(within(block).getByText('Blitz')).toBeTruthy();
      expect(within(block).getByText('Par correspondance')).toBeTruthy();
      expect(within(block).queryByText('Bullet')).toBeNull();
    });
  });

  describe('evolution', () => {
    it('draws the chart and compares the last games with the previous ones', async () => {
      await show(games(8, [60]));
      const block = section('Évolution');
      expect(within(block).getByRole('img')).toBeTruthy();
      expect(block.textContent).toMatch(
        /Vos 4 dernières parties : \d+(,\d)? % de précision \(.* pts par rapport aux 4 précédentes\)/
      );
      expect(block.textContent).toContain('erreurs par partie (');
    });

    it('calls an unchanged number of faults "stable", and not 0', async () => {
      await show(games(8, [60]));
      expect(within(section('Évolution')).getByText(/erreurs par partie \(stable\)/)).toBeTruthy();
    });

    it('signs a change in the number of faults', async () => {
      // The last games have no fault, the first ones have two
      const early = games(4, [60, 62]).map((g, i) => ({ ...g, savedAt: i }));
      const late = games(4).map((g, i) => ({
        ...g,
        id: `late${i}`,
        savedAt: 100 + i,
        result: { ...g.result, metadata: { ...g.result.metadata, date: `2024.04.0${i + 1}` } },
      }));
      await show([...early, ...late]);
      expect(section('Évolution').textContent).toMatch(/erreurs par partie \([−-]2\)/);
    });

    it('says how many games are needed when there are too few', async () => {
      await show(games(3));
      expect(within(section('Évolution')).getByText(/au moins 6 parties/)).toBeTruthy();
    });
  });
});
