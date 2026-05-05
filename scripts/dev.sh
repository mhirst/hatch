#!/usr/bin/env bash
# Run the daemon and the web UI together for local development.
# In two terminals you can use this; in one terminal it backgrounds the daemon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

(cd "$ROOT/daemon" && go run ./cmd/hatchd) &
DAEMON_PID=$!
trap "kill $DAEMON_PID 2>/dev/null || true" EXIT

(cd "$ROOT/web" && npm run dev)
