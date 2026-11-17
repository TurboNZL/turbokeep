#!/usr/bin/env bash
# Move TurboKeep from its own service account (made by an older install-pi.sh) onto YOUR account, then (optionally) remove the extra account.
# Run it as the account that should own TurboKeep (the one you log in with, not root). It only SHOWS the plan unless you add --yes.
#
#   bash scripts/move-to-owner.sh              # look: what would change (changes nothing)
#   bash scripts/move-to-owner.sh --yes        # do it
#   bash scripts/move-to-owner.sh --yes --remove-account   # also delete the old account afterwards (its files are kept, now yours)
#
# What it does: stops the service, gives the program, data (and the old account's home, when the program lives there) to you, changes the
# service file to run as you, removes the old passwordless-restart sudoers entry (the app's Update server button does not need it),
# starts the service and checks /api/health. If the check fails it puts everything back (owner, service file) and starts it as before.
# It never deletes data or the old home folder.
set -euo pipefail

APP="turbokeep"; APPU="TURBOKEEP"; PORT_DEFAULT="47901"
YES=0; REMOVE=0; OWNER="${USER:-$(id -un)}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"; SUDOERS_DIR="${SUDOERS_DIR:-/etc/sudoers.d}"; SYSTEMCTL="${SYSTEMCTL:-systemctl}"; SUDO="${SUDO:-sudo}"
say() { printf '\n== %s\n' "$*"; }
note() { printf '   %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) YES=1; shift ;;
    --remove-account) REMOVE=1; shift ;;
    --owner) OWNER="${2:?--owner needs an account name}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done
[ "$(id -u)" != 0 ] || die "run this as the account that should own $APP (your own login), not as root. sudo is asked for when it is needed."
id "$OWNER" >/dev/null 2>&1 || die "no account called $OWNER"
GROUP="$(id -gn "$OWNER")"

UNIT="$UNIT_DIR/$APP.service"
[ -f "$UNIT" ] || die "no $UNIT, so there is nothing to move (is $APP installed as a system service on this machine?)"
field() { sed -n "s/^$1=//p" "$UNIT" | head -1; }
OLD="$(field User)"; WD="$(field WorkingDirectory)"; DATA="$(sed -n "s/^Environment=${APPU}_DATA=//p" "$UNIT" | head -1)"; PORT="$(sed -n "s/^Environment=${APPU}_PORT=//p" "$UNIT" | head -1)"
PORT="${PORT:-$PORT_DEFAULT}"
[ -n "$OLD" ] || die "$UNIT has no User= line"
if [ "$OLD" = "$OWNER" ]; then note "$APP already runs as $OWNER. Nothing to move."; exit 0; fi
[ "$OLD" != root ] || die "the service runs as root; this script moves services off a dedicated account"

APP_DIR="$(git -C "$WD" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$WD")"
OLD_HOME="$(getent passwd "$OLD" | cut -d: -f6 || true)"

# every folder to hand over: the program, the data, the old home (only when the program or the data lives inside it), the one-folder install
PATHS=()
add() { local p="$1" q; [ -n "$p" ] && [ -e "$p" ] || return 0; p="$(realpath -m -- "$p")"
  for q in "${PATHS[@]:-}"; do [ -n "$q" ] || continue; case "$p/" in "$q"/*) return 0 ;; esac; done   # already inside one we have
  PATHS+=("$p"); }
inside() { case "$1/" in "$2"/*) return 0 ;; *) return 1 ;; esac; }
MARK_DIR="$(dirname "$APP_DIR")"; [ -e "$MARK_DIR/.$APP-install" ] && add "$MARK_DIR"
if [ -n "$OLD_HOME" ] && [ -d "$OLD_HOME" ] && { inside "$APP_DIR" "$OLD_HOME" || { [ -n "$DATA" ] && inside "$DATA" "$OLD_HOME"; }; }; then add "$OLD_HOME"; fi
add "$APP_DIR"; add "$DATA"

say "$APP: move from '$OLD' to '$OWNER'"
note "Service file:  $UNIT   (User=$OLD becomes User=$OWNER; a copy is kept as $APP.service.before-move)"
note "Program:       $APP_DIR"
note "Data:          ${DATA:-"(not set in the unit)"}"
for p in "${PATHS[@]}"; do note "Gets owner:    $p  (everything inside, recursively)"; done
[ -e "$SUDOERS_DIR/$APP" ] && note "Removes:       $SUDOERS_DIR/$APP (the old passwordless-restart entry)"
[ "$REMOVE" = 1 ] && note "Then:          deletes the account '$OLD' (its files stay, they are yours now)"
note "Port:          $PORT (checked after the restart)"
if [ "$YES" != 1 ]; then printf '\nThis was only a look: nothing was changed. Run again with --yes to do it.\n'; exit 0; fi

say "Doing it"
$SUDO -v || die "sudo is needed"
ROLLBACK=0
undo() {
  printf '\nSomething failed: putting it back as it was.\n' >&2
  [ -f "$UNIT.before-move" ] && $SUDO cp "$UNIT.before-move" "$UNIT"
  for p in "${PATHS[@]}"; do $SUDO chown -R "$OLD:$(id -gn "$OLD" 2>/dev/null || echo "$OLD")" "$p" 2>/dev/null || true; done
  $SUDO "$SYSTEMCTL" daemon-reload || true; $SUDO "$SYSTEMCTL" start "$APP" || true
}
trap 'if [ "$ROLLBACK" = 1 ]; then undo; fi' EXIT
ROLLBACK=1
$SUDO "$SYSTEMCTL" stop "$APP"
[ -e "$UNIT.before-move" ] || $SUDO cp "$UNIT" "$UNIT.before-move"
for p in "${PATHS[@]}"; do note "chown $OWNER $p"; $SUDO chown -R "$OWNER:$GROUP" "$p"; done
# a folder the old account kept private must be reachable by you now (the old home is usually mode 700 and is now yours)
$SUDO sed -i "s/^User=.*/User=$OWNER/" "$UNIT"
if grep -q '^Group=' "$UNIT"; then $SUDO sed -i "s/^Group=.*/Group=$GROUP/" "$UNIT"; else $SUDO sed -i "/^User=/a Group=$GROUP" "$UNIT"; fi
[ -e "$SUDOERS_DIR/$APP" ] && $SUDO rm -f "$SUDOERS_DIR/$APP"
$SUDO "$SYSTEMCTL" daemon-reload
$SUDO "$SYSTEMCTL" start "$APP"
OK=0
for _ in $(seq 1 25); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done
[ "$OK" = 1 ] || { note "http://127.0.0.1:$PORT/api/health did not answer in 25 seconds. See: journalctl -u $APP -n 50"; exit 1; }
ROLLBACK=0
note "$APP runs as $OWNER and answers on port $PORT."

if [ "$REMOVE" = 1 ]; then
  say "Removing the account '$OLD'"
  if pgrep -u "$OLD" >/dev/null 2>&1; then note "'$OLD' still has running processes ($(pgrep -u "$OLD" | tr '\n' ' ')), so the account was left in place. Stop them, then: sudo userdel $OLD"
  else $SUDO userdel "$OLD" && note "removed the account '$OLD'; its files were not touched"; fi
  [ -n "$OLD_HOME" ] && [ -d "$OLD_HOME" ] && note "Its old home folder is still at $OLD_HOME. Once you are happy, delete it yourself if it is empty or unwanted."
fi
say "Done"
note "Restart: sudo systemctl restart $APP      Logs: journalctl -u $APP -n 50"
note "The in-app Update server button keeps working: it runs as you now and needs no sudo."
