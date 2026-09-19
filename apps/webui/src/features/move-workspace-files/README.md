# move-workspace-files

Перенос и переименование файлов Explorer: drag-and-drop на каталог, batch из выделения, rename.

**API:** `useMoveWorkspaceFiles`, `buildMoveItems`, `buildRenameItem`, `canDropInto`, `collapseToRoots`, `isValidFileName`, `setMoveDrag` / `moveDrag` / `takeMoveDrag`.

**UI:** `widgets/workspace-sidebar` (`FileRow`). **Server:** `application/workspaces/move-workspace-files.use-case.ts`, `POST /api/workspaces/:id/files/move`.

Вкладки IDE и открытые файлы desk ремапятся через `remapPaths` / `remapWorkspaceFiles`; URL focus и cache `workspace-file-content` едут на новый path. Пересчёт импортов в этой версии не делается.