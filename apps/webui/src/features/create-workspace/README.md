# create-workspace

Workspace details dialog: host → name → folder, one form for create and edit. New host linking — real redeem `POST /api/host/pair/redeem` in `hosts.store.ts` (Phase 6). CLI `harnesys host pair` — Phase 7.

**API:** `openCreateWorkspaceDialog`, `openEditWorkspaceDialog`, `confirmDeleteWorkspace`, `WorkspaceDetailsDialog`, `WorkspaceFields`, `HostPairFields`.

**Depends on:** `entities/workspace`, `shared/services/overlay`, `shared/ui`.

**Server:** `POST /workspaces` (path/name), `PATCH /workspaces/:id`, `POST /api/workspaces/pick` (local picker).
