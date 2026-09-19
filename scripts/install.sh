#!/bin/sh
# harnesys installer: downloads the harnesys CLI plus the host and web binaries
# from GitHub releases into ${HARNESYS_PREFIX:-$HOME/.local/bin}. No prompts.
#
#   curl -fsSL https://harnesys.dev/install | sh
#
# Env:
#   HARNESYS_REPO    GitHub repository (default: harnesys/studio)
#   HARNESYS_PREFIX  install directory   (default: $HOME/.local/bin)
#
# Asset naming matches `harnesys update` (apps/cli/src/update.ts):
#   <bin>-<os>-<arch>   with os darwin|linux and arch x64|arm64
#
# Releases do not exist yet; while that is true the script fails with an honest
# message — build from a checkout instead (docs/deploy.md, "Build from a checkout").

set -u

REPO="${HARNESYS_REPO:-harnesys/studio}"
PREFIX="${HARNESYS_PREFIX:-$HOME/.local/bin}"
BASE_URL="https://github.com/${REPO}/releases/latest/download"
BINARIES="harnesys harnesys-host harnesys-web"

say() {
  printf 'harnesys: %s\n' "$1"
}

die() {
  printf 'harnesys: %s\n' "$1" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) die "unsupported OS \"$(uname -s)\" — this installer covers macOS and Linux" ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) die "unsupported architecture \"$(uname -m)\" — assets exist for x64 and arm64" ;;
esac

# curl -f fails on HTTP >= 400 (exit 22); wget fails on server errors (exit 8).
fetch_to() {
  fetch_to_target="$1"
  fetch_to_url="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$fetch_to_target" "$fetch_to_url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$fetch_to_target" "$fetch_to_url"
  else
    die "need curl or wget to download binaries"
  fi
}

download_failed() {
  cat >&2 <<MESSAGE
harnesys: download failed for $1
  url: $2

If $REPO has no published releases yet, this is the expected 404 —
build the binaries from a checkout instead:
  git clone "https://github.com/$REPO" && cd harnesys
  bun install && bun run build:client && bun run build:host && bun run build:web && bun run build:cli
See docs/deploy.md ("Build from a checkout") for the full paths.
MESSAGE
}

# Staging lives inside the target directory (not /tmp) so the final mv is
# same-filesystem and atomic.
mkdir -p "$PREFIX" || die "cannot create install directory $PREFIX"
tmp_dir=$(mktemp -d "${PREFIX}/.tmp.XXXXXXXX") || die "cannot create a staging directory in $PREFIX"
trap 'rm -rf "$tmp_dir"' EXIT

for bin in $BINARIES; do
  asset="${bin}-${os}-${arch}"
  say "downloading ${asset} ..."
  if ! fetch_to "${tmp_dir}/${bin}" "${BASE_URL}/${asset}"; then
    download_failed "$asset" "${BASE_URL}/${asset}"
    exit 1
  fi
done

for bin in $BINARIES; do
  chmod 0755 "${tmp_dir}/${bin}" || die "cannot chmod ${tmp_dir}/${bin}"
  mv -f "${tmp_dir}/${bin}" "${PREFIX}/${bin}" || die "cannot move ${bin} into $PREFIX"
  say "installed ${PREFIX}/${bin}"
done

case ":${PATH}:" in
  *":${PREFIX}:"*) ;;
  *)
    say ""
    say "add ${PREFIX} to your PATH, e.g.:"
    say "  export PATH=\"${PREFIX}:\$PATH\"    # put this line in ~/.profile or ~/.zshrc"
    ;;
esac

say ""
say "done. run \`harnesys\` for the interactive setup (Server / WebUI),"
say "or \`harnesys up --with-ui\` to start both right away."
say "docs: docs/deploy.md in the repository."
