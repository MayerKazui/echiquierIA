import { Chess } from 'chess.js';

/**
 * Position -> [bestSan, bestUci, eco, name, pv, nextSans]
 *
 * - `eco` / `name`: the opening that ENDS exactly on this position ('' when no named line ends here).
 * - `bestSan` / `bestUci`: the most common continuation among the known lines ('' when none).
 * - `pv`: that main line followed for up to 5 plies.
 * - `nextSans`: every known continuation, most common first.
 *
 * Keys are FENs without the move counters (transpositions share an entry).
 */
export type OpeningEntry = [string, string, string, string, string[], string[]];
export type OpeningsDataset = Record<string, OpeningEntry>;

const PV_LENGTH = 5;

const normalizeFen = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

interface Edge {
  uci: string;
  to: string;
  count: number;
}

interface Node {
  eco: string;
  name: string;
  edges: Map<string, Edge>;
}

/** Parses the `eco<TAB>name<TAB>pgn` lines of the lichess chess-openings TSV files. */
export function parseTsv(text: string): Array<{ eco: string; name: string; pgn: string }> {
  return text
    .split(/\r?\n/)
    .slice(1) // header
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [eco, name, pgn] = line.split('\t');
      return { eco, name, pgn };
    });
}

export function buildOpeningsDataset(lines: Array<{ eco: string; name: string; pgn: string }>): OpeningsDataset {
  const nodes = new Map<string, Node>();
  const nodeOf = (key: string) => {
    let node = nodes.get(key);
    if (!node) {
      node = { eco: '', name: '', edges: new Map() };
      nodes.set(key, node);
    }
    return node;
  };

  for (const { eco, name, pgn } of lines) {
    const source = new Chess();
    source.loadPgn(pgn);
    const replay = new Chess();

    for (const move of source.history({ verbose: true })) {
      const from = nodeOf(normalizeFen(replay.fen()));
      replay.move(move.san);
      const toKey = normalizeFen(replay.fen());

      const edge = from.edges.get(move.san);
      if (edge) edge.count++;
      else from.edges.set(move.san, { uci: `${move.from}${move.to}${move.promotion ?? ''}`, to: toKey, count: 1 });
    }

    // The line's last position carries its name; on a transposition the first line in file order wins
    const last = nodeOf(normalizeFen(replay.fen()));
    if (!last.name) {
      last.eco = eco;
      last.name = name;
    }
  }

  // Most common continuation first (stable: ties keep file order)
  const sortedEdges = (node: Node) => [...node.edges.entries()].sort((a, b) => b[1].count - a[1].count);

  const dataset: OpeningsDataset = {};
  for (const [key, node] of nodes) {
    const edges = sortedEdges(node);
    const pv: string[] = [];
    let current: Node | undefined = node;
    const seen = new Set<string>();
    while (current && pv.length < PV_LENGTH) {
      const [san] = sortedEdges(current)[0] ?? [];
      if (!san) break;
      pv.push(san);
      const nextKey: string = current.edges.get(san)!.to;
      if (seen.has(nextKey)) break;
      seen.add(nextKey);
      current = nodes.get(nextKey);
    }

    const [bestSan, bestEdge] = edges[0] ?? ['', undefined];
    dataset[key] = [bestSan, bestEdge?.uci ?? '', node.eco, node.name, pv, edges.map(([san]) => san)];
  }
  return dataset;
}
