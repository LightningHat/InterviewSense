import { pipeline, env } from '@huggingface/transformers';
import { postProcessTranscript } from './postprocess.js';
env.allowLocalModels = false;
env.useBrowserCache = true;
let transcriber = null;
self.onmessage = async (event) => {
    const message = event.data;
    if (message.type === 'load') {
        try {
            const progressCallback = (p) => {
                if (p.status === 'progress') {
                    self.postMessage({
                        type: 'progress',
                        progress: p.progress || 0,
                        file: p.file || '',
                    });
                }
            };
            transcriber = await pipeline('automatic-speech-recognition', message.model, {
                device: message.device === 'webgpu' ? 'webgpu' : 'wasm',
                progress_callback: progressCallback,
                dtype: message.device === 'webgpu' ? 'fp32' : 'q8',
            });
            self.postMessage({ type: 'ready' });
        }
        catch (err) {
            self.postMessage({
                type: 'error',
                message: err?.message || 'Failed to initialize speech recognition model',
            });
        }
    }
    else if (message.type === 'transcribe') {
        if (!transcriber) {
            self.postMessage({
                type: 'error',
                id: message.id,
                message: 'STT pipeline is not loaded yet',
            });
            return;
        }
        try {
            const startTime = performance.now();
            const output = await transcriber(message.audio, {
                language: 'en',
                task: 'transcribe',
                chunk_length_s: 30,
                stride_length_s: 5,
            });
            const durationMs = Math.round(performance.now() - startTime);
            const rawText = typeof output.text === 'string' ? output.text : (output[0]?.text || '');
            const processed = postProcessTranscript(rawText, durationMs);
            self.postMessage({
                type: 'result',
                id: message.id,
                text: processed.text,
                wordCount: processed.wordCount,
                fillerRate: processed.fillerRate,
                wpm: processed.wpm,
                durationMs,
            });
        }
        catch (err) {
            self.postMessage({
                type: 'error',
                id: message.id,
                message: err?.message || 'Transcription failed',
            });
        }
    }
};
