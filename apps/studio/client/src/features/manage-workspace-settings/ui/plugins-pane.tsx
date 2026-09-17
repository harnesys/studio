import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { PluginsDiscoverTab } from './plugins-discover-tab';
import { PluginsInstalledTab } from './plugins-installed-tab';
import { PluginsMarketplacesTab } from './plugins-marketplaces-tab';

export function PluginsPane({ workspaceId }: { workspaceId: string }) {
  return (
    <div className="flex flex-col gap-4" data-testid="plugins-pane">
      <Tabs defaultValue="installed">
        <TabsList className="h-8 w-full">
          <TabsTrigger value="installed" className="flex-1">
            Installed
          </TabsTrigger>
          <TabsTrigger value="discover" className="flex-1">
            Discover
          </TabsTrigger>
          <TabsTrigger value="marketplaces" className="flex-1">
            Marketplaces
          </TabsTrigger>
        </TabsList>
        <TabsContent value="installed" className="mt-4">
          <PluginsInstalledTab workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="discover" className="mt-4">
          <PluginsDiscoverTab />
        </TabsContent>
        <TabsContent value="marketplaces" className="mt-4">
          <PluginsMarketplacesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
