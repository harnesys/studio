# Desktop auto-update

How the Harnesys desktop app updates itself and what the maintainer has to do.
Built on [tauri-plugin-updater](https://v2.tauri.app/plugin/updater/): the app
fetches a `latest.json` manifest from GitHub Releases, verifies the minisign
signature against a public key baked into the binary, downloads and installs.

Split of responsibilities:

- **Maintainer** — owns the signing key (in `keys/`, gitignored) and the
  `TAURI_SIGNING_PRIVATE_KEY` GitHub secret. Cuts releases with
  `bun run release <version>`; CI does the rest.
- **Users** — do nothing. Install once, after that every startup check brings
  updates. No keys, no GitHub accounts, no settings required.

## One-time setup (done)

1. Keypair generated with `bunx @tauri-apps/cli signer generate` (no password):
   `keys/updater.key` (private, never commit, never lose) and
   `keys/updater.key.pub`. The `keys/` directory is in `.gitignore`.
2. The public key is embedded in `apps/desktop/src-tauri/tauri.conf.json`
   (`plugins.updater.pubkey`). Every build carries it — this is what lets any
   install verify updates without knowing anything about the private key.
3. The private key is stored as the `TAURI_SIGNING_PRIVATE_KEY` secret in
   `harnesys/studio` (no `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the key has no
   password). CI reads it in the desktop build job of
   `.github/workflows/release.yml`.

Keep a backup of `keys/updater.key` outside the machine (password manager,
encrypted storage). The local file is a copy; the secret is what CI uses.

## Cutting a release

```sh
bun run release 0.1.9
```

Bumps versions across the desktop/server/webui/cli manifests, commits, tags
`v<version>`, pushes. The tag starts `.github/workflows/release.yml`:

1. The desktop job builds bundles on five targets. Because
   `bundle.createUpdaterArtifacts` is `true` and the signing env var is set,
   every bundle gets an updater artifact and a detached `.sig` signature:
   `Harnesys_{aarch64|x64}.app.tar.gz` (macOS), `Harnesys_{x64|arm64}-setup.exe`
   (Windows), `Harnesys_amd64.AppImage` (Linux).
2. The release job flattens and renames everything, creates the GitHub release
   with `--generate-notes`, then builds `latest.json` (version from the tag,
   `notes` from the release body, one `url` + `signature` pair per platform:
   `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, `windows-aarch64`,
   `linux-x86_64`) and uploads it to the same release.

The first release after enabling the updater does not update older installs —
it seeds the first `latest.json`. Installs of that release and later update
themselves from then on.

## What users see

- On every startup (Tauri builds only; the browser SPA is unaffected) the app
  checks `https://github.com/harnesys/studio/releases/latest/download/latest.json`.
- No update — nothing happens. Update available:
  - **Auto update on** (default): the app downloads in the background, then
    shows a toast with a **Restart** button. The update applies on restart.
  - **Auto update off**: a toast with an **Open** button leads to
    Settings → Update.
- Settings → Update shows the current version with a link to its release notes,
  a card for the available version (notes rendered, Update button, download
  progress, Restart to update), the Auto update toggle, and Check for updates.
  The preference persists in `localStorage` (`harnesys.app-update.auto`).
- deb installs are not covered: the Tauri updater does not update Debian
  packages. AppImage, DMG and NSIS are covered.

Frontend implementation: `apps/webui/src/features/app-update/` (store, startup
check, toasts) and `apps/webui/src/pages/settings/ui/update-pane.tsx`.

## Key rules

- The private key is irreplaceable once a release signed with it is out.
  Existing installs verify signatures with the embedded public key; a new key
  means they reject every update from then on.
- Rotation is only free before the first updater-enabled release ships: nothing
  out there carries the old public key yet, so regenerating and replacing the
  key in `tauri.conf.json` and the GitHub secret costs nothing.
- There is no supported rotation after that. Lose the key — lose the update
  channel; users would have to reinstall manually.
- If a check or install fails with a signature error, suspect a key mismatch
  first: compare `keys/updater.key.pub` with `plugins.updater.pubkey` in
  `tauri.conf.json` and with the secret in GitHub Settings → Secrets → Actions.
