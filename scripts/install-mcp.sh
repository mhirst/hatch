#!/usr/bin/env bash
# Build the MCP server and register it with Claude Code.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/mcp-server"

if [ ! -d node_modules ]; then
  npm install
fi
npm run build

claude mcp add hatch -- node "$ROOT/mcp-server/dist/server.js"
echo "✓ Installed. Open any project in Claude Code and try: 'deploy this app to my team'"
