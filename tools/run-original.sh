#!/usr/bin/env bash
# Launch the original 1992 game from your own GOG install via DOSBox Staging.
# Reuses GOG's base/graphics confs when present; game files stay in game/ (git-ignored).
#   brew install dosbox-staging
#   tools/run-original.sh            # play
#   SJ_TIMEOUT=15 tools/run-original.sh   # timed smoke test (kills after N seconds)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GAME="$ROOT/game"
[ -f "$GAME/GAME/SPELLJAM/SJ.EXE" ] || { echo "SJ.EXE not found under $GAME/GAME/SPELLJAM"; exit 1; }
DOSBOX="$(command -v dosbox-staging || command -v dosbox || true)"
[ -n "$DOSBOX" ] || { echo "Install DOSBox Staging: brew install dosbox-staging"; exit 1; }
CONF="$(mktemp -t sjconf).conf"
cat > "$CONF" <<CFG
[sdl]
fullscreen=false
[dosbox]
machine=svga_s3
memsize=16
[cpu]
core=auto
cpu_cycles=4000
[mixer]
rate=44100
[autoexec]
mount c "$GAME/GAME"
c:
cd SPELLJAM
SJ.EXE
exit
CFG
ARGS=(-conf "$CONF")
if [ -n "${SJ_TIMEOUT:-}" ]; then
  "$DOSBOX" "${ARGS[@]}" & PID=$!
  sleep "$SJ_TIMEOUT"
  if kill -0 "$PID" 2>/dev/null; then echo "OK: DOSBox still running after ${SJ_TIMEOUT}s"; kill "$PID"; else wait "$PID"; echo "DOSBox exited early ($?)"; exit 1; fi
else
  exec "$DOSBOX" "${ARGS[@]}"
fi
