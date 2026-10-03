/**
 * How the faults of the reference games (see `scripts/calibration`) are sorted into kinds: the share of each kind,
 * and a few examples to read. Usage: `bun run faultstats [kind|theme:name]` (examples of that kind, default `other`,
 * or of faults with that theme, such as `theme:deflection`).
 */
import { ensureOpeningBookLoaded } from '../src/services/openingBook';
import { loadOpeningsFromDisk } from '../src/test/openings';
import { FAULT_CLASSIFICATIONS, FAULT_KINDS, diagnoseFault, type FaultKind } from '../src/utils/faultKinds';
import { analyseRecorded, loadReference } from './calibration/reference';

const wanted = process.argv[2] ?? 'other';
const wantedTheme = wanted.startsWith('theme:') ? wanted.slice('theme:'.length) : null;

await ensureOpeningBookLoaded(loadOpeningsFromDisk);
const counts = Object.fromEntries(FAULT_KINDS.map((k) => [k, 0])) as Record<FaultKind, number>;
const examples: string[] = [];
const themes: Record<string, number> = {};
let total = 0;
for (const game of loadReference().games.filter((g) => g.evals)) {
  const { moves } = await analyseRecorded(game);
  for (const move of moves) {
    if (!FAULT_CLASSIFICATIONS.has(move.classification)) continue;
    const { kind, theme } = diagnoseFault(move);
    if (theme) themes[theme] = (themes[theme] ?? 0) + 1;
    counts[kind] += 1;
    total += 1;
    if ((wantedTheme ? theme === wantedTheme : kind === wanted) && examples.length < 400)
      examples.push(
        `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san} (best ${move.bestMoveSan}) ${move.fenBefore}  [${game.url}]`
      );
  }
}
console.log(`${total} faults`);
for (const kind of FAULT_KINDS)
  console.log(
    `  ${kind.padEnd(12)} ${String(counts[kind]).padStart(5)}  ${((counts[kind] / total) * 100).toFixed(1)} %`
  );
console.log(
  '\nThemes:',
  Object.entries(themes)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} ${n}`)
    .join(', ')
);
console.log(`\nExamples of ${wanted}:`);
for (const line of examples.filter((_, i) => i % Math.max(1, Math.floor(examples.length / 25)) === 0))
  console.log(line);
