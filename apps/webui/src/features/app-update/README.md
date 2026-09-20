# app-update

Desktop auto-update for the Tauri shell.

`useAppUpdateStore()` drives the Update settings pane: current and available version,
release notes, download progress, auto-update preference (localStorage). 
`runStartupUpdateCheck()` runs once per app start inside Tauri and, when auto-update
is on, checks GitHub Releases `latest.json`. `AppUpdateToaster` shows a persistent
toast (closed only by the user) at each stage: available (Update action), downloading,
ready (Restart action). Installation never starts without an explicit click. Before
installing, the host sidecar is stopped (`stop_host` command) so the updater can
replace its binary. Browser builds are a no-op (`isDesktop()`).

Endpoint and signing: `apps/desktop/src-tauri/tauri.conf.json`, artifacts and
`latest.json` are produced by `.github/workflows/release.yml`. deb installs are
not covered by the Tauri updater.
