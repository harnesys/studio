import { ArrowLeftIcon } from 'lucide-react';
import { useParams } from 'react-router';

import { useStudioNavigation } from '@/shared/config/navigation';
import { parseWindowSettingsCategory } from '@/shared/config/routes';
import { WINDOW_SETTINGS_GROUPS, type WindowSettingsCategory } from '@/shared/config/settings-nav';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SettingsNav } from '@/widgets/settings-nav';

import { AppearancePane } from './appearance-pane';
import { ChatPane } from './chat-pane';

export function SettingsPage() {
  const { category } = useParams();
  const { openDesk, openSettings } = useStudioNavigation();
  const active = parseWindowSettingsCategory(category);
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
              openDesk();
            }}
            data-testid="settings-back"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Back to desk
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <SettingsNav active={active} onSelect={(next) => openSettings(next)} />
        </ScrollArea>
      </aside>
      <main className="min-w-0 flex-1">
        <ScrollArea className="h-full">
          <div
            className="flex w-full max-w-xl flex-col gap-8 px-8 py-10 md:px-10"
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

function findSettingsItem(id: WindowSettingsCategory) {
  for (const group of WINDOW_SETTINGS_GROUPS) {
    for (const item of group.items) {
      if (item.id === id) {
        return item;
      }
    }
  }
  return undefined;
}

function SettingsPane({ category }: { category: WindowSettingsCategory }) {
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
  }
}
