import type { JobParams, Modality, ModelDef, ProviderKind } from '@zsi/shared';

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: ModelDef[];
}

export interface InputImage {
  path: string;
  mime: string;
  /** base64 data URL, built lazily because files can be large */
  dataUrl(): string;
}

export interface RunInput {
  model: string;
  modality: Modality;
  prompt: string;
  images: InputImage[];
  params: JobParams;
}

export interface MediaOut {
  url?: string;
  data?: Buffer;
  mime?: string;
}

export interface RunOutput {
  text?: string;
  media: MediaOut[];
}

export interface RunContext {
  signal: AbortSignal;
  progress(p: number): void;
}

export interface ProviderAdapter {
  /** Cheap call that proves the key works. Returns a human-readable message. */
  test(cfg: ProviderConfig): Promise<string>;
  run(cfg: ProviderConfig, input: RunInput, ctx: RunContext): Promise<RunOutput>;
}
