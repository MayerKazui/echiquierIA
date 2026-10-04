import type { ChatMessage } from '../utils/coachRewrite';

/**
 * A model the coach can use. Every one is a small instruction-tuned model converted for the browser (ONNX, 4-bit weights).
 * `gpuDtype` is the file run on a GPU with 16-bit floats; `cpuDtype` the one the processor can run, for the models small
 * enough to fit in the memory WebAssembly can address (4 GB: the 1.5 Md models and above cannot).
 */
export interface LocalModelPreset {
  id: string;
  label: string;
  repo: string;
  /** Download size, for the screen that asks for it. */
  sizeLabel: string;
  /** Graphics memory that makes it comfortable. */
  memoryLabel: string;
  gpuDtype: 'q4f16';
  cpuDtype: 'q4' | null;
  /** The model reasons out loud first unless told not to (Qwen3). */
  noThink: boolean;
  /** What the tests of `bun run bench:coach-model` showed, in a sentence. */
  note: string;
}

export const LOCAL_MODELS: readonly LocalModelPreset[] = [
  {
    id: 'qwen2.5-0.5b',
    label: 'Léger : Qwen2.5 0,5 Md',
    repo: 'onnx-community/Qwen2.5-0.5B-Instruct',
    sizeLabel: '0,5 Go',
    memoryLabel: '2 Go',
    gpuDtype: 'q4f16',
    cpuDtype: 'q4',
    noThink: false,
    note: 'Le seul qui tourne sans carte graphique (très lentement). Mais ses phrases sont souvent fausses : déconseillé, utile pour vérifier que tout fonctionne sur une petite machine.',
  },
  {
    id: 'qwen2.5-1.5b',
    label: 'Qwen2.5 1,5 Md',
    repo: 'onnx-community/Qwen2.5-1.5B-Instruct',
    sizeLabel: '1,2 Go',
    memoryLabel: '4 Go',
    gpuDtype: 'q4f16',
    cpuDtype: null,
    noThink: false,
    note: 'Correct, mais dans environ 3 essais sur 8 le texte est moins juste que celui des règles.',
  },
  {
    id: 'qwen3-1.7b',
    label: 'Qwen3 1,7 Md (recommandé)',
    repo: 'onnx-community/Qwen3-1.7B-ONNX',
    sizeLabel: '1,4 Go',
    memoryLabel: '4 Go',
    gpuDtype: 'q4f16',
    cpuDtype: null,
    noThink: true,
    note: 'Le meilleur compromis mesuré : 8 textes sur 8 acceptés et justes à la lecture, à un côté inversé près.',
  },
  {
    id: 'qwen3-4b',
    label: 'Confort : Qwen3 4 Md',
    repo: 'onnx-community/Qwen3-4B-ONNX',
    sizeLabel: '2,2 Go',
    memoryLabel: '6 Go',
    gpuDtype: 'q4f16',
    cpuDtype: null,
    noThink: true,
    note: 'Le plus gros : 8 textes sur 8 acceptés, un peu plus soignés, pour un gain peu net sur les essais. Pour les machines confortables.',
  },
];

export const DEFAULT_LOCAL_MODEL = 'qwen3-1.7b';

/**
 * The model for an id: one of the catalogue, or (an experiment, set by hand in `localStorage`) any Hugging Face
 * repository, which may then use the processor too.
 */
export function resolveLocalModel(id: string | null | undefined): LocalModelPreset {
  const known = LOCAL_MODELS.find((preset) => preset.id === id);
  if (known) return known;
  if (id && /^[\w.-]+\/[\w.-]+$/.test(id)) {
    return {
      id,
      label: id,
      repo: id,
      sizeLabel: '?',
      memoryLabel: '?',
      gpuDtype: 'q4f16',
      cpuDtype: 'q4',
      noThink: /qwen3/i.test(id),
      note: 'Modèle choisi à la main : non mesuré.',
    };
  }
  return LOCAL_MODELS.find((preset) => preset.id === DEFAULT_LOCAL_MODEL)!;
}

/** Raised, before anything is downloaded, when this device cannot run the model. */
export const UNSUPPORTED_DEVICE = 'UNSUPPORTED_DEVICE';

/** What the worker needs to know of the model: where it is and which of its files each device runs. */
export type WorkerModel = Pick<LocalModelPreset, 'repo' | 'gpuDtype' | 'cpuDtype'>;

export type WorkerRequest = {
  type: 'generate';
  id: number;
  messages: ChatMessage[];
  maxNewTokens: number;
  model: WorkerModel;
};

export type WorkerResponse =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'device'; device: 'webgpu' | 'wasm' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id: number; message: string };
