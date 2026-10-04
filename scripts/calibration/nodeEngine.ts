import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { StockfishService } from '../../src/services/stockfishEngine';

/** The build the app serves (see vite/stockfishPlugin.ts): lite, single-threaded, WebAssembly. */
export const ENGINE_FILE = resolve(import.meta.dirname, '../../node_modules/stockfish/bin/stockfish-19-lite-single.js');

type Listener = (event: { data: string }) => void;

/**
 * Stands in for a browser `Worker` running Stockfish: the same engine file, run as a Node process that speaks UCI
 * on its standard input and output. It offers what `StockfishService` uses of a worker, so the real service (opening
 * book, cache, search limits, partial results) runs unchanged outside the browser.
 */
class NodeEngineWorker {
  onerror: ((event: Event) => void) | null = null;
  private readonly process: ChildProcessByStdio<Writable, Readable, null>;
  private readonly listeners = new Map<string, Set<Listener>>();
  private buffer = '';

  constructor() {
    this.process = spawn(process.execPath, [ENGINE_FILE], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.process.stdout.setEncoding('utf-8');
    this.process.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) this.emit(line.trim());
    });
    // A closed pipe after `terminate` is expected; the service restarts a worker that stays silent
    this.process.stdin.on('error', () => {});
  }

  private emit(data: string) {
    for (const listener of [...(this.listeners.get('message') ?? [])]) listener({ data });
  }

  postMessage(command: string) {
    this.process.stdin.write(`${command}\n`);
  }

  addEventListener(type: string, listener: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  terminate() {
    this.process.kill();
  }
}

/** The app's own engine service, driven by Stockfish processes (all cores but one by default). */
export function createNodeStockfishService(workerCount = Math.max(1, availableParallelism() - 1)): StockfishService {
  return new StockfishService({
    workerCount,
    createWorker: () => new NodeEngineWorker() as unknown as Worker,
  });
}
