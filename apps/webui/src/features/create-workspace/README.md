# create-workspace

Workspace details dialog: host → name → folder, одна форма на create и edit. Связка нового хоста — реальный redeem `POST /api/host/pair/redeem` в `hosts.store.ts` (Phase 6). CLI `harnesys host pair` — Phase 7.

**API:** `openCreateWorkspaceDialog`, `openEditWorkspaceDialog`, `confirmDeleteWorkspace`, `WorkspaceDetailsDialog`, `WorkspaceFields`, `HostPairFields`.

**Зависит от:** `entities/workspace`, `shared/services/overlay`, `shared/ui`.

**Server:** `POST /workspaces` (path/name), `PATCH /workspaces/:id`, `POST /api/workspaces/pick` (локальный picker).
