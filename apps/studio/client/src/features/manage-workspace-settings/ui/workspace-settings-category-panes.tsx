import type { WorkspaceSettingsCategory } from '../model/workspace-settings-nav';
import { ExportsPane } from './exports-pane';
import { GeneralPane } from './general-pane';
import { GitPane } from './git-pane';
import { McpPane } from './mcp-pane';
import { MemoryPane } from './memory-pane';
import { ModePresetsPane } from './mode-presets-pane';
import { ModelsPane } from './models-pane';
import { PluginsPane } from './plugins-pane';
import { SkillsPane } from './skills-pane';
import { ToolsPane } from './tools-pane';

export function WorkspaceSettingsCategoryPanes({
  category,
  workspaceId,
  onClose,
}: {
  category: WorkspaceSettingsCategory;
  workspaceId: string;
  onClose: () => void;
}) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div
        className="flex min-w-0 flex-col gap-4 pe-3"
        data-testid={`workspace-settings-pane-${category}`}
      >
        <CategoryPane category={category} workspaceId={workspaceId} onClose={onClose} />
      </div>
    </div>
  );
}

function CategoryPane({
  category,
  workspaceId,
  onClose,
}: {
  category: WorkspaceSettingsCategory;
  workspaceId: string;
  onClose: () => void;
}) {
  switch (category) {
    case 'general':
      return <GeneralPane workspaceId={workspaceId} onClose={onClose} />;
    case 'providers':
      return <ModelsPane workspaceId={workspaceId} />;
    case 'skills':
      return <SkillsPane workspaceId={workspaceId} />;
    case 'mcp':
      return <McpPane workspaceId={workspaceId} />;
    case 'plugins':
      return <PluginsPane workspaceId={workspaceId} />;
    case 'tools':
      return <ToolsPane workspaceId={workspaceId} />;
    case 'mode-presets':
      return <ModePresetsPane workspaceId={workspaceId} />;
    case 'memory':
      return <MemoryPane workspaceId={workspaceId} />;
    case 'git':
      return <GitPane workspaceId={workspaceId} />;
    case 'exports':
      return <ExportsPane workspaceId={workspaceId} />;
  }
}
