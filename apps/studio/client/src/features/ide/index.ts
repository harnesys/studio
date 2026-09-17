export {
  firstGroupOfLayout,
  type IdeGroup,
  type IdeSplitNode,
  type IdeSplitSide,
  type IdeTab,
  type IdeTabKind,
  ideTabId,
  lastGroupOfLayout,
  useIdeGroup,
  useIdeStore,
  useIdeTabs,
  type VisibleDesk,
} from './model/ide.store';
export { parkToIdeState } from './model/ide-persist';
export { navigateAfterPark, useIdeSync } from './model/ide-sync';
export { pathForIdeTab, useOpenIdeTab, useOpenSpawnTab, useOpenThreadTab } from './model/open-ide';
export { useVisibleDesk, visibleDeskActiveTab } from './model/visible-desk';
