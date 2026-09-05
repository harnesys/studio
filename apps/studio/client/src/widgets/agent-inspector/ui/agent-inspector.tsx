import { type InspectorTab, useDeskStore, useSelectedAgent } from '@/features/desk';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { InspectorPane } from './inspector-pane';
import { MemoryPane } from './memory-pane';

export function AgentInspector({ width }: { width: number }) {
  const agent = useSelectedAgent();
  const inspectorTab = useDeskStore((state) => state.inspectorTab);

  if (!agent) {
    return null;
  }

  return (
    <aside
      className="flex h-svh shrink-0 flex-col self-stretch bg-background"
      style={{ width }}
      data-testid="agent-inspector"
    >
      <div className="flex h-11 shrink-0 items-center px-3">
        <Tabs
          value={inspectorTab}
          className="min-w-0 flex-1 gap-0"
          onValueChange={(value) => {
            if (value === 'inspector' || value === 'memory') {
              useDeskStore.getState().setInspectorTab(value satisfies InspectorTab);
            }
          }}
        >
          <TabsList className="h-8 w-full">
            <TabsTrigger
              value="inspector"
              className="flex-1 text-xs"
              data-testid="inspector-tab-inspector"
            >
              Inspector
            </TabsTrigger>
            <TabsTrigger
              value="memory"
              className="flex-1 text-xs"
              data-testid="inspector-tab-memory"
            >
              Memory
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 px-3 py-3 pb-8">
          {inspectorTab === 'memory' ? (
            <MemoryPane agent={agent} />
          ) : (
            <InspectorPane agent={agent} />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
