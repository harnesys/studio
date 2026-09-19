import type { Driver } from '@harnesys/studio-shared';
import { DRIVERS } from '@harnesys/studio-shared';
export const DRIVER_LABELS: Record<Driver, string> = {
  openai: 'OpenAI',
  'openai-compatible': 'OpenAI compatible',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  google: 'Google Gemini',
  groq: 'Groq',
  mistral: 'Mistral',
  xai: 'xAI',
  together: 'Together',
  kimi: 'Kimi',
  zai: 'Z.ai',
  ollama: 'Ollama',
  'ollama-cloud': 'Ollama Cloud',
  nvidia: 'NVIDIA',
  cerebras: 'Cerebras',
  minimax: 'MiniMax',
  xiaomi: 'Xiaomi MiMo',
  qwen: 'Qwen (Alibaba)',
  alibaba: 'Alibaba',
  moonshotai: 'Moonshot AI',
};
export const DRIVER_ITEMS = DRIVERS.map((value) => ({ value, label: DRIVER_LABELS[value] }));
