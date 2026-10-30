import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor: any = null;

export type EmbeddingWorkerIncoming =
  | { type: 'load'; model: string }
  | { type: 'embed'; id: string; texts: string[] };

export type EmbeddingWorkerOutgoing =
  | { type: 'ready' }
  | { type: 'progress'; progress: number; file: string }
  | { type: 'embeddings'; id: string; vectors: number[][] }
  | { type: 'error'; id?: string; message: string };

self.onmessage = async (event: MessageEvent<EmbeddingWorkerIncoming>) => {
  const msg = event.data;

  if (msg.type === 'load') {
    try {
      extractor = await pipeline('feature-extraction', msg.model, {
        progress_callback: (p: any) => {
          if (p.status === 'progress') {
            self.postMessage({
              type: 'progress',
              progress: p.progress || 0,
              file: p.file || '',
            } satisfies EmbeddingWorkerOutgoing);
          }
        },
      });
      self.postMessage({ type: 'ready' } satisfies EmbeddingWorkerOutgoing);
    } catch (err: any) {
      self.postMessage({
        type: 'error',
        message: err?.message || 'Failed to load embedding model',
      } satisfies EmbeddingWorkerOutgoing);
    }
  } else if (msg.type === 'embed') {
    if (!extractor) {
      self.postMessage({
        type: 'error',
        id: msg.id,
        message: 'Embedding model is not loaded yet',
      } satisfies EmbeddingWorkerOutgoing);
      return;
    }

    try {
      const vectors: number[][] = [];
      for (const text of msg.texts) {
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        // output.data is Float32Array
        vectors.push(Array.from(output.data));
      }
      self.postMessage({
        type: 'embeddings',
        id: msg.id,
        vectors,
      } satisfies EmbeddingWorkerOutgoing);
    } catch (err: any) {
      self.postMessage({
        type: 'error',
        id: msg.id,
        message: err?.message || 'Embedding extraction failed',
      } satisfies EmbeddingWorkerOutgoing);
    }
  }
};

