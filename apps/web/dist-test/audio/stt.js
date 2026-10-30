import { CONFIG } from '../config.js';
export class STTManager {
    onProgress;
    worker = null;
    pendingRequests = new Map();
    isReady = false;
    loadPromise = null;
    constructor(onProgress) {
        this.onProgress = onProgress;
    }
    async initialize(profile) {
        if (this.loadPromise) {
            return this.loadPromise;
        }
        this.loadPromise = new Promise((resolve, reject) => {
            try {
                // Instantiate Web Worker using Vite standard syntax
                this.worker = new Worker(new URL('./stt.worker.ts', import.meta.url), {
                    type: 'module',
                });
                this.worker.onmessage = (event) => {
                    const msg = event.data;
                    if (msg.type === 'ready') {
                        this.isReady = true;
                        resolve();
                    }
                    else if (msg.type === 'progress') {
                        this.onProgress?.({ progress: msg.progress, file: msg.file });
                    }
                    else if (msg.type === 'result') {
                        const pending = this.pendingRequests.get(msg.id);
                        if (pending) {
                            this.pendingRequests.delete(msg.id);
                            pending.resolve({
                                id: msg.id,
                                text: msg.text,
                                wordCount: msg.wordCount,
                                fillerRate: msg.fillerRate,
                                wpm: msg.wpm,
                                durationMs: msg.durationMs,
                            });
                        }
                    }
                    else if (msg.type === 'error') {
                        if (msg.id) {
                            const pending = this.pendingRequests.get(msg.id);
                            if (pending) {
                                this.pendingRequests.delete(msg.id);
                                pending.reject(new Error(msg.message));
                            }
                        }
                        else {
                            this.isReady = false;
                            reject(new Error(msg.message));
                        }
                    }
                };
                this.worker.onerror = (err) => {
                    this.isReady = false;
                    reject(new Error(`STT Worker error: ${err.message}`));
                };
                // Determine model and device based on profile
                const model = profile === 'local-gpu'
                    ? CONFIG.stt.models.gpu
                    : CONFIG.stt.models.cpu;
                const device = profile === 'local-gpu' ? 'webgpu' : 'wasm';
                this.worker.postMessage({
                    type: 'load',
                    model,
                    device,
                });
            }
            catch (err) {
                reject(err);
            }
        });
        return this.loadPromise;
    }
    async transcribe(audio) {
        if (!this.worker || !this.isReady) {
            throw new Error('STT Worker is not initialized or ready.');
        }
        const id = `stt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({
                type: 'transcribe',
                id,
                audio,
            });
            // Safety timeout: 15s
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Transcription timed out after 15 seconds.'));
                }
            }, 15000);
        });
    }
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.isReady = false;
        this.loadPromise = null;
        this.pendingRequests.clear();
    }
}
