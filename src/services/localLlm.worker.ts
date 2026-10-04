/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from './localLlm.protocol';
import { LOCAL_MODEL, UNSUPPORTED_DEVICE } from './localLlm.protocol';

/**
 * Runs the local language model off the page's thread. The library (and the model, downloaded once and kept in the
 * browser's cache) is only loaded when the first text is asked for.
 */

type Generator = (
  messages: unknown,
  options: Record<string, unknown>
) => Promise<Array<{ generated_text: Array<{ content: string }> }>>;

let generator: Promise<Generator> | null = null;
let generatorModel = '';

const send = (message: WorkerResponse) => (self as unknown as Worker).postMessage(message);

/**
 * The default model needs a GPU with 16-bit floats: on the processor its weights (1.8 GB) do not fit in the memory
 * WebAssembly can address. Another model, chosen by hand, may use the processor.
 */
async function pickDevice(experiment: boolean): Promise<'webgpu' | 'wasm'> {
  try {
    const gpu = (
      navigator as unknown as {
        gpu?: { requestAdapter(): Promise<{ features: { has(name: string): boolean } } | null> };
      }
    ).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    if (adapter && adapter.features.has('shader-f16')) return 'webgpu';
  } catch {
    // no usable GPU
  }
  if (experiment) return 'wasm';
  throw new Error(UNSUPPORTED_DEVICE);
}

function load(model: string): Promise<Generator> {
  if (generatorModel !== model) generator = null;
  generatorModel = model;
  generator ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    // The runtime of the model comes with the app (cached by the service worker, so that it works offline), not from a
    // public CDN, which is where the library looks by default
    // (Two literal URLs: a computed one makes the bundler take the whole folder of the library.)
    (env.backends.onnx as { wasm: { wasmPaths: unknown } }).wasm.wasmPaths = {
      mjs: new URL('../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
      wasm: new URL('../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url)
        .href,
    };
    const device = await pickDevice(model !== LOCAL_MODEL);
    send({ type: 'device', device });
    // WebGPU runs 16-bit floats; the processor's runtime does better with the 4-bit weights as they are
    const dtype = device === 'webgpu' ? 'q4f16' : 'q4';
    const files = new Map<string, { loaded: number; total: number }>();
    const made = await pipeline('text-generation', model, {
      device,
      dtype,
      progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (info.status !== 'progress' || !info.file) return;
        files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
        let loaded = 0;
        let total = 0;
        for (const entry of files.values()) {
          loaded += entry.loaded;
          total += entry.total;
        }
        send({ type: 'progress', file: info.file, loaded, total });
      },
    } as never);
    return made as unknown as Generator;
  })();
  generator.catch(() => {
    generator = null; // a failed download can be tried again
  });
  return generator;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type !== 'generate') return;
  try {
    const run = await load(request.model ?? LOCAL_MODEL);
    const output = await run(request.messages, { max_new_tokens: request.maxNewTokens, do_sample: false });
    send({ type: 'result', id: request.id, text: output[0]?.generated_text.at(-1)?.content ?? '' });
  } catch (error) {
    send({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
  }
};
