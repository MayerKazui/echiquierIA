import type { ChatMessage } from '../utils/coachRewrite';

/** The model the "local model" coach downloads: small enough for a browser, the best of those tried for this job. */
export const LOCAL_MODEL = 'onnx-community/Qwen2.5-1.5B-Instruct';

/** Approximate size of the download, for the screen that asks for it. */
export const LOCAL_MODEL_SIZE_LABEL = '1,2 Go';

/** Raised, before anything is downloaded, when this device cannot run the model. */
export const UNSUPPORTED_DEVICE = 'UNSUPPORTED_DEVICE';

/**
 * `model` is another model to try (an experiment, set by hand in `localStorage`); with it the processor is allowed
 * to run it, which the default model cannot do (its weights do not fit in the memory WebAssembly can address).
 */
export type WorkerRequest = {
  type: 'generate';
  id: number;
  messages: ChatMessage[];
  maxNewTokens: number;
  model?: string;
};

export type WorkerResponse =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'device'; device: 'webgpu' | 'wasm' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id: number; message: string };
