// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProfileGame } from '../../utils/weaknessProfile';
import { TrendChart } from './TrendChart';

const day = (d: number) => new Date(2020, 2, d, 12).getTime();

const games = (...accuracies: number[]): ProfileGame[] =>
  accuracies.map((accuracy, i) => ({
    id: `g${i}`,
    date: day(i + 1),
    opponent: `Opp${i}`,
    color: 'w',
    outcome: 'win',
    accuracy,
    faults: 2,
    moves: 30,
  }));

describe('TrendChart', () => {
  it('asks for at least two games', () => {
    render(<TrendChart games={games(80)} />);
    expect(screen.getByText(/au moins deux parties/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('describes the chart in words: how many games, from which accuracy to which', () => {
    render(<TrendChart games={games(70.4, 75, 82.6)} />);
    expect(screen.getByRole('img', { name: /3 parties.*plus ancienne \(70 %\).*plus récente \(83 %\)/ })).toBeTruthy();
  });

  it('draws one point per game, with the opponent, the date and the accuracy', () => {
    const { container } = render(<TrendChart games={games(70, 75, 82)} />);
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(container.querySelectorAll('circle title')[1].textContent).toBe('Contre Opp1, 2 mars 2020 : 75 %');
  });

  it('draws the games and the average of the last five through them', () => {
    const { container } = render(<TrendChart games={games(60, 80, 70, 90, 50, 100)} />);
    const lines = container.querySelectorAll('polyline');
    expect(lines).toHaveLength(2);
    const [raw, average] = Array.from(lines).map((l) =>
      l
        .getAttribute('points')!
        .split(' ')
        .map((p) => Number(p.split(',')[1]))
    );
    expect(raw).toHaveLength(6);
    expect(average).toHaveLength(6);
    expect(average[0]).toBe(raw[0]); // the first point is its own average
    // Higher accuracy is higher on the chart (a smaller y)
    expect(raw[5]).toBeLessThan(raw[0]);
    // The average of 60, 80, 70, 90, 50 is 70: the point of the 5th game has the height of a 70
    expect(average[4]).toBeCloseTo(raw[2], 1);
  });

  it('puts the dates of the first and the last game under the chart', () => {
    render(<TrendChart games={games(70, 75, 82)} />);
    expect(screen.getByText('1 mars 2020')).toBeTruthy();
    expect(screen.getByText('3 mars 2020')).toBeTruthy();
  });

  it('scales the axis to the games, in steps of 5, without leaving 0 to 100', () => {
    const { container } = render(<TrendChart games={games(72, 78)} />);
    const ticks = Array.from(container.querySelectorAll('text'))
      .map((t) => t.textContent!)
      .filter((t) => /^\d+$/.test(t));
    expect(ticks).toEqual(['65', '75', '85']);

    const edges = render(<TrendChart games={games(1, 99)} />).container;
    const edgeTicks = Array.from(edges.querySelectorAll('text'))
      .map((t) => t.textContent!)
      .filter((t) => /^\d+$/.test(t));
    expect(edgeTicks).toEqual(['0', '50', '100']);
  });

  it('does not fail when all the games have the same accuracy', () => {
    const { container } = render(<TrendChart games={games(80, 80, 80)} />);
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(container.innerHTML).not.toContain('NaN');
  });

  it('explains the two lines', () => {
    render(<TrendChart games={games(70, 75)} />);
    expect(screen.getByText('Une partie')).toBeTruthy();
    expect(screen.getByText(/Moyenne des 5 dernières/)).toBeTruthy();
  });
});
