#!/usr/bin/env bash
# Force X11/XWayland so always-on-top works (Wayland blocks it).
set -euo pipefail
cd "$(dirname "$0")/.."
unset WAYLAND_DISPLAY
export GDK_BACKEND=x11
export XDG_SESSION_TYPE=x11
export DISPLAY="${DISPLAY:-:0}"

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
fi

exec npm run tauri:dev
