import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateLocally, IDLE_RELEASE_MS, releaseLocalModel } from './localLlm';
import type { WorkerRequest, WorkerResponse } from './localLlm.protocol';

const model = { repo: 'org/model', gpuDtype: 'q4f16', cpuDtype: null } as never;

class FakeWorker {
  static all: FakeWorker[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: WorkerRequest[] = [];
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(request: WorkerRequest) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  answer(text: string) {
    const { id } = this.requests.at(-1) as { id: number };
    this.onmessage?.({ data: { type: 'result', id, text } } as MessageEvent<WorkerResponse>);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWorker.all = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  releaseLocalModel();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('local model memory', () => {
  it('releases the model after a while without a text, and loads it again for the next one', async () => {
    const first = generateLocally([], { model });
    FakeWorker.all[0].answer('un');
    await expect(first).resolves.toBe('un');

    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS - 1000);
    expect(FakeWorker.all[0].terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeWorker.all[0].terminated).toBe(true);

    const second = generateLocally([], { model });
    expect(FakeWorker.all).toHaveLength(2);
    FakeWorker.all[1].answer('deux');
    await expect(second).resolves.toBe('deux');
  });

  it('does not release it while a text is being written', async () => {
    const text = generateLocally([], { model });
    await vi.advanceTimersByTimeAsync(IDLE_RELEASE_MS * 3);
    expect(FakeWorker.all[0].terminated).toBe(false);
    FakeWorker.all[0].answer('fini');
    await expect(text).resolves.toBe('fini');
  });
});
