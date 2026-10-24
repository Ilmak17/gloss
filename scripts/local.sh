#!/bin/sh
# Prefer a modern Node already on PATH; use Codex's bundled runtime if needed.
set -eu
cd "$(dirname "$0")/.."
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
  gloss_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [ ! -x "$gloss_runtime/node" ]; then
    echo 'Gloss needs Node.js 22 or newer. Install it, then run this script again.' >&2
    exit 1
  fi
  PATH="$gloss_runtime:$PATH"
  export PATH
fi
exec npm run dev:local
