import type { DiscoveredModel, DiscoverInput, Driver } from '../../../ports/models.ts';
import { DRIVERS } from '../../../ports/models.ts';
import { DiscoverError } from '../binding.ts';
import { listAlibabaModels } from './alibaba.ts';
import { listAnthropicModels } from './anthropic.ts';
import { listCerebrasModels } from './cerebras.ts';
import { listGoogleModels } from './google.ts';
import { listGroqModels } from './groq.ts';
import { listKimiModels } from './kimi.ts';
import { listMinimaxModels } from './minimax.ts';
import { listMistralModels } from './mistral.ts';
import { listMoonshotAIModels } from './moonshotai.ts';
import { listNvidiaModels } from './nvidia.ts';
import { listOllamaCloudModels, listOllamaModels } from './ollama.ts';
import { listOpenAIModels } from './openai.ts';
import { listOpenAICompatibleModels } from './openai-compatible.ts';
import { listOpenRouterModels } from './openrouter.ts';
import { listQwenModels } from './qwen.ts';
import { listTogetherModels } from './together.ts';
import { listXaiModels } from './xai.ts';
import { listXiaomiModels } from './xiaomi.ts';
import { listZaiModels } from './zai.ts';

export type ListModels = (input: DiscoverInput) => Promise<DiscoveredModel[]>;

type DriverDiscover = {
  defaultApiUrl: string;
  list: ListModels;
};

const drivers: Record<Driver, DriverDiscover> = {
  openai: { defaultApiUrl: 'https://api.openai.com/v1', list: listOpenAIModels },
  'openai-compatible': {
    defaultApiUrl: 'https://host/v1',
    list: listOpenAICompatibleModels,
  },
  anthropic: { defaultApiUrl: 'https://api.anthropic.com/v1', list: listAnthropicModels },
  openrouter: { defaultApiUrl: 'https://openrouter.ai/api/v1', list: listOpenRouterModels },
  google: {
    defaultApiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    list: listGoogleModels,
  },
  groq: { defaultApiUrl: 'https://api.groq.com/openai/v1', list: listGroqModels },
  mistral: { defaultApiUrl: 'https://api.mistral.ai/v1', list: listMistralModels },
  xai: { defaultApiUrl: 'https://api.x.ai/v1', list: listXaiModels },
  together: { defaultApiUrl: 'https://api.together.xyz/v1', list: listTogetherModels },
  kimi: { defaultApiUrl: 'https://api.moonshot.ai/v1', list: listKimiModels },
  zai: { defaultApiUrl: 'https://api.z.ai/api/paas/v4', list: listZaiModels },
  ollama: { defaultApiUrl: 'http://localhost:11434', list: listOllamaModels },
  'ollama-cloud': { defaultApiUrl: 'https://ollama.com', list: listOllamaCloudModels },
  nvidia: { defaultApiUrl: 'https://integrate.api.nvidia.com/v1', list: listNvidiaModels },
  cerebras: { defaultApiUrl: 'https://api.cerebras.ai/v1', list: listCerebrasModels },
  minimax: { defaultApiUrl: 'https://api.minimax.io/v1', list: listMinimaxModels },
  xiaomi: { defaultApiUrl: 'https://api.xiaomimimo.com/v1', list: listXiaomiModels },
  qwen: {
    defaultApiUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    list: listQwenModels,
  },
  alibaba: {
    defaultApiUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    list: listAlibabaModels,
  },
  moonshotai: { defaultApiUrl: 'https://api.moonshot.ai/v1', list: listMoonshotAIModels },
};

export function discoverAdapter(driver: string): DriverDiscover {
  if (!(DRIVERS as readonly string[]).includes(driver)) {
    throw new DiscoverError(`unknown driver ${driver}`);
  }
  return drivers[driver as Driver];
}
