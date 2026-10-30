import { RuntimeProfile } from '@interviewsense/schemas';
import { HttpLLMAdapter } from './http.js';
import { OllamaLLMAdapter } from './ollama.js';
import { LLMAdapter } from './types.js';
import { WebLLMAdapter } from './webllm.js';

export * from './types.js';
export * from './http.js';
export * from './ollama.js';
export * from './webllm.js';

export function createLLMAdapter(profile: RuntimeProfile): LLMAdapter {
  switch (profile) {
    case 'dev':
      return new OllamaLLMAdapter();
    case 'local-gpu':
      return new WebLLMAdapter();
    case 'local-cpu':
    case 'thin':
    default:
      return new HttpLLMAdapter();
  }
}

