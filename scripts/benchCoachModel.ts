/**
 * Measures a language model on the job of the "local model" coach: for eight typical moves, does it follow the format, does
 * its answer pass the check against the facts (`isGroundedIn`), and how long does it take. It prints the rule-based text,
 * the model's answer and the final text side by side, so that the quality is read, not guessed: the check cannot tell a
 * correct sentence from a wrong one.
 *
 *   bun run bench:coach-model onnx-community/Qwen2.5-1.5B-Instruct q4
 *
 * Runs on the processor with onnxruntime-node (faster than the browser's WebAssembly); the model is downloaded on the first run.
 */
import { Chess } from 'chess.js';
import type { MoveAnalysis } from '../src/types/chess';
import { pipeline } from '@huggingface/transformers';
import { coachParts, composeExplanation } from '../src/utils/moveCoach';
import { buildRewriteMessages, parseRewrite, isGroundedIn, sourceText, applyRewrite } from '../src/utils/coachRewrite';

function analysed(fen: string, uci: string, bestUci: string, o: Partial<MoveAnalysis> = {}): MoveAnalysis {
  const mv = (u: string) => new Chess(fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  const p = mv(uci),
    b = mv(bestUci);
  return {
    ply: 20,
    moveNumber: 10,
    color: p.color,
    san: p.san,
    uci,
    from: p.from,
    to: p.to,
    fenBefore: fen,
    fenAfter: fen,
    evalBefore: 300,
    evalAfter: -100,
    mateBefore: null,
    mateAfter: null,
    bestMoveUci: bestUci,
    bestMoveSan: b.san,
    bestMoveFrom: b.from,
    bestMoveTo: b.to,
    pv: [bestUci],
    centipawnLoss: 400,
    winPercentBefore: 80,
    winPercentAfter: 45,
    winPercentLoss: 35,
    classification: 'blunder',
    ...o,
  };
}
const after = (...m: string[]) => {
  const c = new Chess();
  m.forEach((x) => c.move(x));
  return c.fen();
};
const FORK = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
const MID = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7';
const cases: Array<[string, MoveAnalysis]> = [
  ['fourchette manquée', analysed(FORK, 'e1d2', 'd5c7', { pv: ['d5c7', 'e8d8', 'c7a8'] })],
  [
    'fourchette jouée',
    analysed(FORK, 'd5c7', 'd5c7', {
      classification: 'best',
      evalBefore: 0,
      evalAfter: 500,
      pv: ['d5c7', 'e8d8', 'c7a8'],
    }),
  ],
  ['mat manqué', analysed('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'g1f1', 'a1a8', { mateBefore: 1, evalBefore: 0 })],
  [
    'pièce en prise',
    analysed('4k3/8/8/3q4/8/2N5/8/4K3 b - - 0 1', 'e8d8', 'd5d2', {
      evalBefore: 0,
      evalAfter: 600,
      classification: 'mistake',
    }),
  ],
  [
    'échange',
    analysed(after('e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5'), 'g4f3', 'b8d7', {
      classification: 'mistake',
      winPercentBefore: 50,
      winPercentAfter: 42,
      pv: ['b8d7', 'e5d6', 'f8d6'],
    }),
  ],
  [
    'ouverture',
    analysed(MID, 'c4b3', 'c1e3', {
      classification: 'inaccuracy',
      winPercentBefore: 52,
      winPercentAfter: 44,
      phase: 'opening',
      pv: ['c1e3', 'c5e3', 'f2e3'],
    }),
  ],
  [
    'avantage gâché',
    analysed(MID, 'h2h3', 'c1e3', {
      classification: 'mistake',
      winPercentBefore: 78,
      winPercentAfter: 51,
      phase: 'middlegame',
      pv: ['c1e3', 'c5e3', 'f2e3'],
    }),
  ],
  [
    'coup de théorie',
    analysed('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4', 'e2e4', {
      classification: 'book',
      openingName: "King's Pawn Game",
      pv: ['e2e4', 'e7e5', 'g1f3'],
    }),
  ],
];
const [model, dtype] = [process.argv[2], process.argv[3] ?? 'q8'];
const t0 = Date.now();
const gen = await pipeline('text-generation', model, { dtype: dtype as 'q4' | 'q8' | 'fp16' | 'fp32', device: 'cpu' });
console.log(`# ${model} (${dtype}) chargé en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
let ok = 0,
  grounded = 0,
  total = 0,
  totalMs = 0;
for (const [name, move] of cases) {
  const parts = coachParts(move);
  const isGood = !parts.problem;
  const t = Date.now();
  const out = await gen(buildRewriteMessages(parts), { max_new_tokens: 220, do_sample: false });
  const ms = Date.now() - t;
  totalMs += ms;
  const answer = (out as unknown as Array<{ generated_text: Array<{ content: string }> }>)[0].generated_text.at(
    -1
  )!.content;
  const parsed = parseRewrite(answer, isGood);
  const g = parsed ? isGroundedIn(`${parsed.problem} ${parsed.idea}`, sourceText(parts)) : false;
  total++;
  if (parsed) ok++;
  if (g) grounded++;
  console.log(
    `\n## ${name} — ${(ms / 1000).toFixed(1)} s — format ${parsed ? 'OK' : 'KO'} — fidèle ${g ? 'OUI' : 'NON'}`
  );
  const rules = composeExplanation(parts);
  console.log('RÈGLES  :', [rules.whyPlayedIsBad, rules.whyBestIsBetter].filter(Boolean).join(' || '));
  console.log('MODÈLE  :', answer.replace(/\n+/g, ' / '));
  if (parsed && g) {
    const f = composeExplanation(applyRewrite(parts, parsed));
    console.log('FINAL   :', [f.whyPlayedIsBad, f.whyBestIsBetter].filter(Boolean).join(' || '));
  }
}
console.log(
  `\n# format ${ok}/${total}, fidèle ${grounded}/${total}, ${(totalMs / total / 1000).toFixed(1)} s par texte`
);
