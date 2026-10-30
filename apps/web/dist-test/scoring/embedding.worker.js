import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false;
env.useBrowserCache = true;
let extractor = null;
self.onmessage = async (event) => {
    const msg = event.data;
    if (msg.type === 'load') {
        try {
            extractor = await pipeline('feature-extraction', msg.model, {
                progress_callback: (p) => {
                    if (p.status === 'progress') {
                        self.postMessage({
                            type: 'progress',
                            progress: p.progress || 0,
                            file: p.file || '',
                        });
                    }
                },
            });
            self.postMessage({ type: 'ready' });
        }
        catch (err) {
            self.postMessage({
                type: 'error',
                message: err?.message || 'Failed to load embedding model',
            });
        }
    }
    else if (msg.type === 'embed') {
        if (!extractor) {
            self.postMessage({
                type: 'error',
                id: msg.id,
                message: 'Embedding model is not loaded yet',
            });
            return;
        }
        try {
            const vectors = [];
            for (const text of msg.texts) {
                const output = await extractor(text, { pooling: 'mean', normalize: true });
                // output.data is Float32Array
                vectors.push(Array.from(output.data));
            }
            self.postMessage({
                type: 'embeddings',
                id: msg.id,
                vectors,
            });
        }
        catch (err) {
            self.postMessage({
                type: 'error',
                id: msg.id,
                message: err?.message || 'Embedding extraction failed',
            });
        }
    }
};
