#!/usr/bin/env bash
# First-time setup for Argota.
# - Verifies Node version
# - Installs npm dependencies
# - Creates .env from .env.example if missing
set -euo pipefail

cd "$(dirname "$0")/.."

REQUIRED_NODE_MAJOR=18

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is not installed. Install Node ${REQUIRED_NODE_MAJOR}+ from https://nodejs.org" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR}" -lt "${REQUIRED_NODE_MAJOR}" ]; then
  echo "error: node ${REQUIRED_NODE_MAJOR}+ required (found $(node -v))" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — fill in NOTION_TOKEN and NOTION_DATABASE_ID."
fi

if command -v npm >/dev/null 2>&1; then
  npm install
else
  echo "error: npm not found" >&2
  exit 1
fi

cat <<'EOF'

Bootstrap complete.

Next steps:
  1. Edit .env and add your Notion credentials.
  2. Run: npm run dev
  3. Open: http://localhost:4321

EOF
