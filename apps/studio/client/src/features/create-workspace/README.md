# create-workspace

Workspace details dialog: host → name → folder, одна форма на create и edit. Связка нового хоста — стаб (`harnesys host pair` приходит с remote-host v1).

**API:** `openCreateWorkspaceDialog`, `openEditWorkspaceDialog`, `confirmDeleteWorkspace`, `WorkspaceDetailsDialog`, `WorkspaceFields`, `HostPairFields`.

**Зависит от:** `entities/workspace`, `shared/services/overlay`, `shared/ui`.

**Server:** `POST /workspaces` (path/name), `PATCH /workspaces/:id`, `POST /api/workspaces/pick` (локальный picker).
