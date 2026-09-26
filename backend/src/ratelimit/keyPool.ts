import { env } from '../config/env.js';

export class KeyPool {
  private readonly keys: string[];
  private index = 0;

  constructor(keys: string[]) {
    const filtered = keys.filter((k) => k.length > 0);
    if (filtered.length === 0) {
      throw new Error('KeyPool requires at least one non-empty API key');
    }
    this.keys = filtered;
  }

  next(): string {
    const key = this.keys[this.index]!;
    this.index = (this.index + 1) % this.keys.length;
    return key;
  }
}

export const groqPool = new KeyPool([
  env.GROQ_API_KEY_1,
  env.GROQ_API_KEY_2,
  env.GROQ_API_KEY_3,
]);

export const geminiPool = new KeyPool([env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2]);

/** HuggingFace inference keys (embeddings + optional SQLCoder later). */
export const hfPool = new KeyPool([env.HF_API_KEY_1, env.HF_API_KEY_2]);
