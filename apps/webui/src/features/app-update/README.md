# app-update

Desktop auto-update for the Tauri shell.

`useAppUpdateStore()` drives the Update settings pane: current and available version,
release notes, download progress, auto-update preference (localStorage). 
`runStartupUpdateCheck(openUpdateSettings)` runs once per app start inside Tauri:
checks GitHub Releases `latest.json`, downloads in the background when auto-update
is on, and toasts the result. Browser builds are a no-op (`isDesktop()`).

Endpoint and signing: `apps/desktop/src-tauri/tauri.conf.json`, artifacts and
`latest.json` are produced by `.github/workflows/release.yml`. deb installs are
not covered by the Tauri updater.
