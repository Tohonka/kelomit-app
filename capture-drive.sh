#!/usr/bin/env bash
# capture-drive.sh — robust logcat capture for a Kelomit GPS test drive.
#
# Streams the native `KelomitLoc` tag (every fix: lat/lon/speed/acc + ctx=
# whether JS is reachable, plus the mirrored diag events) to a timestamped
# file, and AUTO-RECONNECTS across USB blips — the usual reason a plain
# `adb logcat` "crashes" mid-drive is the cable jostling and dropping the
# connection, which kills logcat instantly. This loop just waits and resumes.
#
# logcat is a live stream, not a poll — there's no interval to tune; you get
# every line the moment the app logs it. The app ALSO writes its own diag log
# on-device (extract from realUserData as usual); this is the real-time
# supplement that shows native background fixes as they happen.
#
# Usage:  ./capture-drive.sh
#         Ctrl-C when the drive is done. Output: drive-YYYYmmdd-HHMM.log
#
# Prep (do once, so it survives the whole drive):
#   - Developer options → "Stay awake" ON (screen won't sleep while charging)
#   - When the USB-debugging prompt shows, tick "Always allow from this computer"

set -uo pipefail

ADB="${ADB:-adb}"
OUT="drive-$(date +%Y%m%d-%H%M).log"
# Keep only our tag (all priorities); silence everything else. Add ReactNativeJS:I
# too if you want the JS-side console lines from handleNativeFix.
FILTER=(KelomitLoc:V '*:S')

log_marker() { printf '=== %s %s ===\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$OUT"; }

echo "Waiting for device (authorize USB debugging on the phone if prompted)..."
"$ADB" wait-for-device
"$ADB" logcat -c 2>/dev/null || true   # start the file at drive time, not old buffer

echo "Capturing to: $OUT"
echo "Confirm a few 'KelomitLoc ... fix' lines scroll by before you pull out,"
echo "then ignore this window and drive. Ctrl-C to stop."
echo "----"
log_marker "capture started"

while true; do
  # -v threadtime = wall-clock timestamps. tee so you can glance and see life.
  "$ADB" logcat -v threadtime "${FILTER[@]}" | tee -a "$OUT"
  # Reached only if logcat exited: USB blip / device asleep. Note it and resume
  # WITHOUT clearing the buffer, so nothing logged in the meantime is lost.
  log_marker "logcat dropped — reconnecting"
  echo "  [$(date '+%H:%M:%S')] disconnected — waiting for device to come back..."
  "$ADB" wait-for-device
  sleep 1
  log_marker "reconnected"
done
