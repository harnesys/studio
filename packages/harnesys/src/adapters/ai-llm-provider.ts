import { createAlibaba } from '@ai-sdk/alibaba';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMiniMax } from '@ai-sdk/minimax';
import { createMistral } from '@ai-sdk/mistral';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import type { ModelBinding } from '../ports/models.ts';

export function buildProvider(binding: ModelBinding): (modelId: string) => unknown {
  const opts = {
    apiKey: binding.apiKey,
    baseURL: binding.apiUrl,
    headers: binding.headers,
  };
  const driver = binding.driver as string;
  switch (driver) {
    case 'openai':
      return (m: string) => createOpenAI(opts as never)(m);
    case 'openai-compatible':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? 'http://localhost',
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'anthropic':
      return (m: string) => createAnthropic(opts as never)(m);
    case 'google':
      return (m: string) => createGoogleGenerativeAI(opts as never)(m);
    case 'mistral':
      return (m: string) => createMistral(opts as never)(m);
    case 'xai':
      return (m: string) => createXai(opts as never)(m);
    case 'minimax':
      return (m: string) => createMiniMax(opts as never)(m);
    case 'alibaba':
    case 'qwen':
      return (m: string) => createAlibaba(opts as never)(m);
    case 'moonshotai':
    case 'moonshot':
    case 'kimi':
      return (m: string) => createMoonshotAI(opts as never)(m);
    case 'xiaomi':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? 'https://api.xiaomimimo.com/v1',
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    default:
      throw Object.assign(new Error(`unsupported driver ${driver}`), {
        code: 'model_unresolved',
      });
  }
}
