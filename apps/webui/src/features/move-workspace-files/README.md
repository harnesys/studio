# move-workspace-files

Moving and renaming Explorer files: drag-and-drop onto directory, batch from selection, rename.

**API:** `useMoveWorkspaceFiles`, `buildMoveItems`, `buildRenameItem`, `canDropInto`, `collapseToRoots`, `isValidFileName`, `setMoveDrag` / `moveDrag` / `takeMoveDrag`.

**UI:** `widgets/workspace-sidebar` (`FileRow`). **Server:** `application/workspaces/move-workspace-files.use-case.ts`, `POST /api/workspaces/:id/files/move`.

IDE tabs and open files of desk are remapped via `remapPaths` / `remapWorkspaceFiles`; URL focus and cache `workspace-file-content` go to new path. Import recalculation is not done in this version.