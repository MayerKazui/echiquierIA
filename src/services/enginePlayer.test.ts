import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { levelById } from '../utils/playLevels';
import { EnginePlayer, EngineUnavailableError } from './enginePlayer';
import { STANDARD_START_FEN } from '../utils/playGame';

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
  const player = new EnginePlayer({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  return { player, workers };
}

const request = (extra: Partial<Parameters<EnginePlayer['chooseMove']>[0]> = {}) => ({
  startFen: STANDARD_START_FEN,
  moves: ['e2e4'],
  level: levelById('club'),
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('EnginePlayer', () => {
  it('starts its worker with the first request, and sets the level before searching', async () => {
    const { player, workers } = setup();
    expect(workers).toHaveLength(0);
    const answer = player.chooseMove(request());
    expect(workers).toHaveLength(1);
    expect(workers[0].sent).toEqual([
      'uci',
      'setoption name Threads value 1',
      'setoption name Hash value 16',
      'setoption name Skill Level value 20',
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 1600',
      'isready',
      `position fen ${STANDARD_START_FEN} moves e2e4`,
      'go movetime 500',
    ]);
    workers[0].print('info depth 5 score cp 20 pv e7e5');
    workers[0].print('bestmove e7e5 ponder g1f3');
    await expect(answer).resolves.toBe('e7e5');
  });

  it('sends the position alone when no move was played', async () => {
    const { player, workers } = setup();
    const answer = player.chooseMove(request({ moves: [] }));
    expect(workers[0].sent).toContain(`position fen ${STANDARD_START_FEN}`);
    workers[0].print('bestmove d2d4');
    await expect(answer).resolves.toBe('d2d4');
  });

  it('keeps one worker for every request', async () => {
    const { player, workers } = setup();
    const first = player.chooseMove(request());
    workers[0].print('bestmove e7e5');
    await first;
    const second = player.chooseMove(request({ moves: ['e2e4', 'e7e5', 'g1f3'] }));
    workers[0].print('bestmove b8c6');
    await expect(second).resolves.toBe('b8c6');
    expect(workers).toHaveLength(1);
  });

  it('stops a search that was aborted, and ignores its late answer', async () => {
    const { player, workers } = setup();
    const controller = new AbortController();
    const aborted = player.chooseMove(request({ signal: controller.signal }));
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].sent).toContain('stop');

    const next = player.chooseMove(request({ moves: [] }));
    workers[0].print('bestmove a2a3'); // the aborted search ends: nobody is waiting for it
    let settled = false;
    void next.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    workers[0].print('bestmove e2e4');
    await expect(next).resolves.toBe('e2e4');
  });

  it('replaces the search in progress by a new request', async () => {
    const { player, workers } = setup();
    const first = player.chooseMove(request());
    const second = player.chooseMove(request({ moves: [] }));
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    workers[0].print('bestmove x0x0'); // the first search, stopped
    workers[0].print('bestmove g1f3');
    await expect(second).resolves.toBe('g1f3');
  });

  it('refuses a request that was already aborted', async () => {
    const { player, workers } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(player.chooseMove(request({ signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(workers).toHaveLength(0);
  });

  it('fails when the engine has no move', async () => {
    const { player, workers } = setup();
    const answer = player.chooseMove(request());
    workers[0].print('bestmove (none)');
    await expect(answer).rejects.toThrow('no move');
  });

  it('fails, and starts afresh next time, when the worker breaks', async () => {
    const { player, workers } = setup();
    const answer = player.chooseMove(request());
    workers[0].onerror?.(new Event('error'));
    await expect(answer).rejects.toBeInstanceOf(EngineUnavailableError);
    expect(workers[0].terminated).toBe(true);

    const again = player.chooseMove(request());
    expect(workers).toHaveLength(2);
    workers[1].print('bestmove e7e5');
    await expect(again).resolves.toBe('e7e5');
  });

  it('gives up on an engine that does not answer', async () => {
    const { player, workers } = setup();
    const answer = player.chooseMove(request());
    const assertion = expect(answer).rejects.toBeInstanceOf(EngineUnavailableError);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(workers[0].terminated).toBe(true);
  });

  it('releases its worker once idle, and starts another for the next request', async () => {
    const { player, workers } = setup();
    const first = player.chooseMove(request());
    workers[0].print('bestmove e7e5');
    await first;
    await vi.advanceTimersByTimeAsync(59_000);
    expect(workers[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(workers[0].terminated).toBe(true);

    const second = player.chooseMove(request());
    expect(workers).toHaveLength(2);
    workers[1].print('bestmove d7d5');
    await expect(second).resolves.toBe('d7d5');
  });

  it('counts the idle time from the last answer', async () => {
    const { player, workers } = setup();
    const first = player.chooseMove(request());
    workers[0].print('bestmove e7e5');
    await first;
    await vi.advanceTimersByTimeAsync(50_000);
    const second = player.chooseMove(request());
    workers[0].print('bestmove d7d5');
    await second;
    await vi.advanceTimersByTimeAsync(50_000); // 100 s after the first answer, 50 s after the last
    expect(workers[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(workers[0].terminated).toBe(true);
  });
});
