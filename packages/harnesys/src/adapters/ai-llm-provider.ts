import { createAlibaba } from '@ai-sdk/alibaba';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMiniMax } from '@ai-sdk/minimax';
import { createMistral } from '@ai-sdk/mistral';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import {
  CEREBRAS_DEFAULT_URL,
  GROQ_DEFAULT_URL,
  NVIDIA_DEFAULT_URL,
  OLLAMA_CLOUD_DEFAULT_URL,
  OLLAMA_DEFAULT_URL,
  OPENROUTER_DEFAULT_URL,
  TOGETHER_DEFAULT_URL,
  ZAI_DEFAULT_URL,
} from '../constants.ts';
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
    case 'openrouter':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? OPENROUTER_DEFAULT_URL,
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'groq':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? GROQ_DEFAULT_URL,
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'together':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? TOGETHER_DEFAULT_URL,
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'cerebras':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? CEREBRAS_DEFAULT_URL,
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'nvidia':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? NVIDIA_DEFAULT_URL,
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'zai':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: binding.apiUrl ?? ZAI_DEFAULT_URL,
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'ollama':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: ollamaChatBase(binding.apiUrl, OLLAMA_DEFAULT_URL),
          apiKey: binding.apiKey,
          headers: binding.headers,
          name: binding.name,
        } as never)(m);
    case 'ollama-cloud':
      return (m: string) =>
        createOpenAICompatible({
          baseURL: ollamaChatBase(binding.apiUrl, OLLAMA_CLOUD_DEFAULT_URL),
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

function ollamaChatBase(apiUrl: string | undefined, fallback: string): string {
  const base = (apiUrl ?? fallback).replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}
