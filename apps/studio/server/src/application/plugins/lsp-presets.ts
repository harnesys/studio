import type { LspServerSpec } from 'harnesys';

export type LspPresetSpec = Omit<LspServerSpec, 'serverId'>;

export const TYPESCRIPT_PRESET: Record<string, LspPresetSpec> = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    extensionToLanguage: {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
    },
  },
};

export const PRESET_INSTALL_HINT: Record<string, string> = {
  typescript: 'npm i -g typescript-language-server typescript',
  python: 'pipx install pyright && npm i -g pyright (preset not yet)',
  rust: 'rustup component add rust-analyzer (preset not yet)',
  go: 'go install golang.org/x/tools/gopls@latest (preset not yet)',
};
