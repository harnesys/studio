import { definePack } from '../../domain/pack.ts';
import type { LspPort } from '../../ports/lsp.ts';
import { createLspTools } from './create-lsp-tools.ts';

export type LspCapabilityPorts = {
  lsp: LspPort;
};

export const lspCapability = definePack<LspCapabilityPorts, Record<string, unknown>>({
  name: 'lsp',
  version: '1.0.0',
  description:
    'Language server tools: lsp_diagnostics / lsp_definition / lsp_references / lsp_hover',
  icon: 'lsp',
  meta: {
    tools: [
      {
        name: 'lsp_diagnostics',
        description: 'Language-server diagnostics for a file.',
      },
      {
        name: 'lsp_definition',
        description: 'Go to definition via LSP.',
      },
      {
        name: 'lsp_references',
        description: 'Find references via LSP.',
      },
      {
        name: 'lsp_hover',
        description: 'Hover / type info via LSP.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({ tools: createLspTools(ctx.ports.lsp) }),
});
