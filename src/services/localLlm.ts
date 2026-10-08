import type { ChatMessage } from '../utils/coachRewrite';
import {
  UNSUPPORTED_DEVICE,
  type LocalModelPreset,
  type WorkerRequest,
  type WorkerResponse,
} from './localLlm.protocol';

/**
 * The local model, seen from the page: a worker that downloads the model the first time and writes texts after that.
 * Nothing here runs until `generateLocally` is called, and the worker is created once.
 */

export interface LocalProgress {
  /** Bytes of the model downloaded so far and in all (0 until the first file is known). */
  loaded: number;
  total: number;
}

export type LocalDevice = 'webgpu' | 'wasm';

/** Whether this browser may be able to run the model: a worker and WebGPU (the device is checked when it is asked). */
export function isLocalModelSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/** Whether an error from the model means that this device cannot run it (as opposed to a failure on the way). */
export const isUnsupportedDevice = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(UNSUPPORTED_DEVICE);

/**
 * The model sits in memory (from several hundred MB to a few GB) for as long as the worker lives. A coach that is not
 * asked for a while lets it go; the next text loads it again from the browser's cache, without downloading it.
 */
export const IDLE_RELEASE_MS = 120_000;

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
let onProgress: ((progress: LocalProgress) => void) | null = null;
let onDevice: ((device: LocalDevice) => void) | null = null;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./localLlm.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === 'progress') onProgress?.({ loaded: message.loaded, total: message.total });
    else if (message.type === 'device') onDevice?.(message.device);
    else {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.type === 'result') entry?.resolve(message.text);
      else entry?.reject(new Error(message.message));
      scheduleIdleRelease();
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Le modèle local a échoué');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
    clearTimeout(idleTimer);
  };
  return worker;
}

/** Lets the worker go when no text is being written and none was asked for during `IDLE_RELEASE_MS`. */
function scheduleIdleRelease(): void {
  clearTimeout(idleTimer);
  idleTimer = undefined;
  if (!worker) return;
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    if (pending.size > 0) return scheduleIdleRelease();
    releaseLocalModel();
  }, IDLE_RELEASE_MS);
}

/**
 * Stops the worker and with it the model it holds in memory (the next text starts a new one). Used when a model is
 * deleted, so that it is not still taking the memory it was just taken out of the cache for.
 */
export function releaseLocalModel(): void {
  clearTimeout(idleTimer);
  idleTimer = undefined;
  worker?.terminate();
  worker = null;
  const error = new DOMException('Aborted', 'AbortError');
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
}

/** Asks the local model for a text. The first call downloads the model (`progress` follows it). */
export function generateLocally(
  messages: ChatMessage[],
  options: {
    model: LocalModelPreset;
    maxNewTokens?: number;
    signal?: AbortSignal;
    onProgress?: (progress: LocalProgress) => void;
    onDevice?: (device: LocalDevice) => void;
  }
): Promise<string> {
  if (options.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  onProgress = options.onProgress ?? null;
  onDevice = options.onDevice ?? null;
  const id = nextId++;
  clearTimeout(idleTimer);
  idleTimer = undefined;
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    options.signal?.addEventListener(
      'abort',
      () => {
        pending.delete(id);
        reject(new DOMException('Aborted', 'AbortError'));
        scheduleIdleRelease();
      },
      { once: true }
    );
    const request: WorkerRequest = {
      type: 'generate',
      id,
      messages,
      maxNewTokens: options.maxNewTokens ?? 260,
      model: { repo: options.model.repo, gpuDtype: options.model.gpuDtype, cpuDtype: options.model.cpuDtype },
    };
    ensureWorker().postMessage(request);
  });
}
