import { ArrowLeftIcon } from 'lucide-react';
import { useParams } from 'react-router';

import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { parseSettingsCategory } from '@/shared/config/routes';
import { SETTINGS_GROUPS, type SettingsCategory } from '@/shared/config/settings-nav';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SettingsNav } from '@/widgets/settings-nav';

import { AppearancePane } from './appearance-pane';
import { ChatPane } from './chat-pane';
import { GitPane } from './git-pane';
import { McpPane } from './mcp-pane';
import { MemoryPane } from './memory-pane';
import { ModePresetsPane } from './mode-presets-pane';
import { ModelsPane } from './models-pane';
import { PluginsPane } from './plugins-pane';
import { SkillsPane } from './skills-pane';
import { ToolsPane } from './tools-pane';

export function SettingsPage() {
  const { category } = useParams();
  const { workspaceId, settingsProviderId } = useStudioLocation();
  const { openWorkspace, openSettings } = useStudioNavigation();
  const active = parseSettingsCategory(category);
  const meta = findSettingsItem(active);

  return (
    <div
      className="flex h-svh min-h-0 w-full flex-col bg-background md:flex-row"
      data-testid="settings-page"
    >
      <aside className="flex w-full shrink-0 flex-col border-b bg-sidebar md:h-full md:w-56 md:border-r md:border-b-0">
        <div className="flex h-12 items-center px-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => {
              if (workspaceId) {
                openWorkspace(workspaceId);
              }
            }}
            data-testid="settings-back"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Back to workspace
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <SettingsNav
            active={active}
            onSelect={(category) =>
              openSettings(
                category,
                undefined,
                category === 'providers' ? (settingsProviderId ?? undefined) : undefined,
              )
            }
          />
        </ScrollArea>
      </aside>
      <main className="min-w-0 flex-1">
        <ScrollArea className="h-full">
          <div
            className={cn(
              'flex w-full flex-col gap-8 px-8 py-10 md:px-10',
              active === 'providers' ||
                active === 'skills' ||
                active === 'mcp' ||
                active === 'plugins' ||
                active === 'memory' ||
                active === 'tools' ||
                active === 'mode-presets'
                ? 'max-w-3xl'
                : 'max-w-xl',
            )}
            data-testid={`settings-pane-${active}`}
          >
            <div className="flex flex-col gap-1">
              <h1 className="font-medium text-lg tracking-tight">{meta?.label ?? active}</h1>
              <p className="text-muted-foreground text-sm">{meta?.description}</p>
            </div>
            <SettingsPane key={active} category={active} />
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function findSettingsItem(id: SettingsCategory) {
  for (const group of SETTINGS_GROUPS) {
    for (const item of group.items) {
      if (item.id === id) {
        return item;
      }
    }
  }
  return undefined;
}

function SettingsPane({ category }: { category: SettingsCategory }) {
  switch (category) {
    case 'profile':
      return (
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="display-name">Display name</FieldLabel>
            <Input id="display-name" defaultValue="Mike" />
          </Field>
          <Field>
            <FieldLabel htmlFor="handle">Handle</FieldLabel>
            <Input id="handle" defaultValue="@mike" />
            <FieldDescription>Not saved. Agents do not read this yet.</FieldDescription>
          </Field>
          <Badge variant="secondary">Stub</Badge>
        </FieldGroup>
      );
    case 'appearance':
      return <AppearancePane />;
    case 'chat':
      return <ChatPane />;
    case 'providers':
      return <ModelsPane />;
    case 'skills':
      return <SkillsPane />;
    case 'mcp':
      return <McpPane />;
    case 'plugins':
      return <PluginsPane />;
    case 'tools':
      return <ToolsPane />;
    case 'mode-presets':
      return <ModePresetsPane />;
    case 'memory':
      return <MemoryPane />;
    case 'git':
      return <GitPane />;
    case 'exports':
      return (
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel>Transcripts</FieldLabel>
            <FieldDescription>Export is a stub. It does not write files yet.</FieldDescription>
          </Field>
          <Badge variant="secondary">Stub</Badge>
        </FieldGroup>
      );
  }
}
