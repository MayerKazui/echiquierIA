import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AnalysisEngine,
  AnalysisUnavailableError,
  MAX_DEPTH,
  UPDATE_INTERVAL_MS,
  type LiveAnalysis,
  type LiveRequest,
} from './analysisEngine';

/** A worker that records what it is sent, and prints the answers the test gives it. */
class FakeWorker {
  sent: string[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  postMessage(command: string) {
    this.sent.push(command);
  }
  terminate() {
    this.terminated = true;
  }
  print(line: string) {
    this.onmessage?.({ data: line } as MessageEvent);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const engine = new AnalysisEngine({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  return { engine, workers };
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function request(over: Partial<LiveRequest> = {}) {
  const updates: LiveAnalysis[] = [];
  const req: LiveRequest = { fen: START, lines: 3, onUpdate: (a) => updates.push(a), ...over };
  return { req, updates };
}

const info = (depth: number, rank: number, cp: number, pv: string) =>
  `info depth ${depth} seldepth ${depth + 4} multipv ${rank} score cp ${cp} nodes 1000 nps 400000 time 10 pv ${pv}`;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AnalysisEngine', () => {
  it('starts its worker with the first request, and searches the position with the lines asked for', () => {
    const { engine, workers } = setup();
    expect(workers).toHaveLength(0);
    engine.analyze(request().req);
    expect(workers).toHaveLength(1);
    expect(workers[0].sent).toEqual([
      'uci',
      'setoption name Threads value 1',
      'setoption name Hash value 32',
      'setoption name MultiPV value 3',
      `position fen ${START}`,
      `go depth ${MAX_DEPTH}`,
    ]);
  });

  it('keeps the number of lines between 1 and 5', () => {
    const { engine, workers } = setup();
    engine.analyze(request({ lines: 12 }).req);
    expect(workers[0].sent).toContain('setoption name MultiPV value 5');
    engine.analyze(request({ lines: 0 }).req);
    workers[0].print('bestmove e2e4');
    expect(workers[0].sent).toContain('setoption name MultiPV value 1');
  });

  it('reports the lines best first, as they come, at most every interval', () => {
    const { engine, workers } = setup();
    const { req, updates } = request();
    engine.analyze(req);
    workers[0].print(info(10, 1, 30, 'e2e4 e7e5'));
    expect(updates).toHaveLength(1); // the first one goes out at once
    workers[0].print(info(10, 2, 25, 'd2d4 d7d5'));
    workers[0].print(info(10, 3, 20, 'g1f3 d7d5'));
    expect(updates).toHaveLength(1); // the next ones wait
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    expect(updates).toHaveLength(2);
    expect(updates[1].depth).toBe(10);
    expect(updates[1].nps).toBe(400000);
    expect(updates[1].fen).toBe(START);
    expect(updates[1].lines.map((l) => [l.rank, l.cp, l.pv[0]])).toEqual([
      [1, 30, 'e2e4'],
      [2, 25, 'd2d4'],
      [3, 20, 'g1f3'],
    ]);
  });

  it('gives the score from the side of White, whoever has the move', () => {
    const { engine, workers } = setup();
    const { req, updates } = request({ fen: AFTER_E4 });
    engine.analyze(req);
    // The engine says +40 for the side to move: Black
    workers[0].print(info(12, 1, 40, 'e7e5'));
    workers[0].print('info depth 12 multipv 2 score mate 3 pv d7d5');
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    const [first, second] = updates[updates.length - 1].lines;
    expect(first.cp).toBe(-40);
    expect(first.mate).toBeNull();
    expect(second.mate).toBe(-3);
    expect(second.cp).toBeLessThan(-9000);
  });

  it('ignores what is not a line: bounds, other info, noise', () => {
    const { engine, workers } = setup();
    const { req, updates } = request();
    engine.analyze(req);
    workers[0].print('info depth 12 multipv 1 score cp 90 lowerbound pv e2e4');
    workers[0].print('info depth 12 currmove e2e4 currmovenumber 1');
    workers[0].print('info string NNUE evaluation using nn-1234.nnue');
    workers[0].print('readyok');
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    expect(updates).toHaveLength(0);
  });

  it('stops the search it replaces and waits for its bestmove before starting the next one', () => {
    const { engine, workers } = setup();
    const first = request();
    engine.analyze(first.req);
    workers[0].print(info(8, 1, 30, 'e2e4'));
    const second = request({ fen: AFTER_E4 });
    engine.analyze(second.req);

    expect(workers[0].sent[workers[0].sent.length - 1]).toBe('stop');
    expect(workers[0].sent.filter((c) => c.startsWith('position'))).toHaveLength(1); // not yet

    // The old search still prints a few lines before it ends: they are nobody's
    workers[0].print(info(9, 1, 33, 'e2e4'));
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    workers[0].print('bestmove e2e4');
    expect(workers[0].sent.slice(-3)).toEqual([
      'setoption name MultiPV value 3',
      `position fen ${AFTER_E4}`,
      `go depth ${MAX_DEPTH}`,
    ]);
    expect(first.updates.every((a) => a.depth <= 8)).toBe(true);

    workers[0].print(info(5, 1, 20, 'e7e5'));
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS);
    expect(second.updates[second.updates.length - 1].fen).toBe(AFTER_E4);
    expect(workers).toHaveLength(1);
  });

  it('only searches the last position when several are asked for while the engine stops', () => {
    const { engine, workers } = setup();
    engine.analyze(request().req);
    engine.analyze(request({ fen: AFTER_E4 }).req);
    const last = request({ fen: '8/8/8/8/8/8/8/K1k5 w - - 0 1' });
    engine.analyze(last.req);
    expect(workers[0].sent.filter((c) => c === 'stop')).toHaveLength(1);
    workers[0].print('bestmove e2e4');
    expect(workers[0].sent.filter((c) => c.startsWith('position'))).toEqual([
      `position fen ${START}`,
      'position fen 8/8/8/8/8/8/8/K1k5 w - - 0 1',
    ]);
  });

  it('stops for good when asked to, and starts again with a new request', () => {
    const { engine, workers } = setup();
    const { req, updates } = request();
    engine.analyze(req);
    engine.stop();
    expect(workers[0].sent[workers[0].sent.length - 1]).toBe('stop');
    workers[0].print(info(9, 1, 33, 'e2e4'));
    workers[0].print('bestmove e2e4');
    vi.advanceTimersByTime(UPDATE_INTERVAL_MS * 2);
    expect(updates).toHaveLength(0);
    expect(workers[0].sent.filter((c) => c.startsWith('position'))).toHaveLength(1);

    engine.analyze(request().req);
    expect(workers[0].sent.filter((c) => c.startsWith('position'))).toHaveLength(2);
    expect(workers).toHaveLength(1);
  });

  it('says when a search ends by itself, with its last lines, and does not start it again', () => {
    const { engine, workers } = setup();
    const done = vi.fn();
    const { req, updates } = request({ onDone: done });
    engine.analyze(req);
    workers[0].print(info(40, 1, 55, 'e2e4 e7e5'));
    workers[0].print('bestmove e2e4 ponder e7e5');
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0].lines[0]).toMatchObject({ rank: 1, depth: 40, cp: 55 });
    expect(updates.length).toBeGreaterThan(0);
    expect(workers[0].sent.filter((c) => c.startsWith('go'))).toHaveLength(1);
  });

  it('replaces a worker that stays silent after a stop', () => {
    const { engine, workers } = setup();
    engine.analyze(request().req);
    engine.analyze(request({ fen: AFTER_E4 }).req);
    expect(workers).toHaveLength(1);
    vi.advanceTimersByTime(1600);
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1].sent).toContain(`position fen ${AFTER_E4}`);
  });

  it('tells the request when the engine stops, and starts a new worker for the next one', () => {
    const { engine, workers } = setup();
    const onError = vi.fn();
    engine.analyze(request({ onError }).req);
    workers[0].onerror?.(new Event('error'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(AnalysisUnavailableError);
    expect(workers[0].terminated).toBe(true);

    engine.analyze(request().req);
    expect(workers).toHaveLength(2);
    expect(workers[1].sent).toContain(`go depth ${MAX_DEPTH}`);
  });

  it('releases the worker on dispose', () => {
    const { engine, workers } = setup();
    engine.analyze(request().req);
    engine.dispose();
    expect(workers[0].terminated).toBe(true);
  });

  it('reports an error when no worker can be created', () => {
    const engine = new AnalysisEngine({
      createWorker: () => {
        throw new Error('no worker');
      },
    });
    const onError = vi.fn();
    engine.analyze(request({ onError }).req);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
