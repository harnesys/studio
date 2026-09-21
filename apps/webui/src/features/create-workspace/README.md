# create-workspace

Workspace details dialog: host → name → folder, one form for create and edit. New host linking — real redeem `POST /api/host/pair/redeem` in `hosts.store.ts` (Phase 6). CLI `harnesys host pair` — Phase 7. Settings hosts pane: connect-host form (`HostPairFields`) and pairing-code card (`HostPairingCodeCard`, `POST /api/host/pair/start` against the local host). Redeem failures are distinct: `pairing_code_missing`, `pairing_code_expired`, `pairing_code_invalid` — mapped to human messages in the store.

**API:** `openCreateWorkspaceDialog`, `openEditWorkspaceDialog`, `confirmDeleteWorkspace`, `WorkspaceDetailsDialog`, `WorkspaceFields`, `HostPairFields`, `HostPairingCodeCard`.

**Depends on:** `entities/workspace`, `shared/services/overlay`, `shared/ui`.

**Server:** `POST /workspaces` (path/name), `PATCH /workspaces/:id`, `POST /api/workspaces/pick` (local picker).
