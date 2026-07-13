#!/usr/bin/env bash
# Build Meeting Reminder Join and install it into a Thunderbird profile.
#
# Uses the Mozilla "extension proxy file" developer install method:
# a text file named with the add-on ID, containing the absolute path to
# dist/extension/. Thunderbird then loads the built add-on from that directory.
#
# Usage:
#   ./scripts/install-in-thunderbird.sh
#   ./scripts/install-in-thunderbird.sh --profile dbexqcex.default-esr
#   ./scripts/install-in-thunderbird.sh --no-build
#   ./scripts/install-in-thunderbird.sh --launch
#   ./scripts/install-in-thunderbird.sh --uninstall
#   ./scripts/install-in-thunderbird.sh --list-profiles
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_ID="meeting-reminder-join@thunderbird-meeting-toolkit.local"
EXTENSION_DIR="$ROOT/dist/extension"
DO_BUILD=1
DO_LAUNCH=0
DO_UNINSTALL=0
LIST_PROFILES=0
FORCE_REINSTALL=1
PROFILE_ARG=""

usage() {
  cat <<'EOF'
Install Meeting Reminder Join into a Thunderbird profile (developer proxy install).

Options:
  --profile <name|path>  Profile directory name or absolute path
  --no-build             Skip npm install/build (use existing dist/extension)
  --launch               Launch Thunderbird with the selected profile after install
  --uninstall            Remove the proxy install from the selected profile
  --no-force-reinstall   Keep existing extensions.json entry (not recommended)
  --list-profiles        List detected Thunderbird profiles and exit
  -h, --help             Show this help

Examples:
  ./scripts/install-in-thunderbird.sh
  ./scripts/install-in-thunderbird.sh --profile dbexqcex.default-esr --launch
  npm run install:thunderbird
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE_ARG="${2:-}"
      if [[ -z "$PROFILE_ARG" ]]; then
        echo "error: --profile requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    --no-build)
      DO_BUILD=0
      shift
      ;;
    --launch)
      DO_LAUNCH=1
      shift
      ;;
    --uninstall)
      DO_UNINSTALL=1
      shift
      ;;
    --no-force-reinstall)
      FORCE_REINSTALL=0
      shift
      ;;
    --list-profiles)
      LIST_PROFILES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

profiles_root() {
  case "$(uname -s)" in
    Darwin)
      echo "$HOME/Library/Thunderbird/Profiles"
      ;;
    Linux)
      if [[ -d "$HOME/.thunderbird" ]]; then
        echo "$HOME/.thunderbird"
      else
        echo "$HOME/.thunderbird"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      echo "${APPDATA:-}/Thunderbird/Profiles"
      ;;
    *)
      echo "$HOME/.thunderbird"
      ;;
  esac
}

find_thunderbird_bin() {
  if [[ -n "${THUNDERBIRD_BIN:-}" && -x "$THUNDERBIRD_BIN" ]]; then
    echo "$THUNDERBIRD_BIN"
    return 0
  fi
  if command -v thunderbird >/dev/null 2>&1; then
    command -v thunderbird
    return 0
  fi
  local mac_bin="/Applications/Thunderbird.app/Contents/MacOS/thunderbird"
  if [[ -x "$mac_bin" ]]; then
    echo "$mac_bin"
    return 0
  fi
  return 1
}

list_profile_dirs() {
  local root
  root="$(profiles_root)"
  if [[ ! -d "$root" ]]; then
    return 0
  fi
  # Prefer directories that look like Thunderbird profiles (contain prefs.js).
  find "$root" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while read -r dir; do
    if [[ -f "$dir/prefs.js" || -f "$dir/times.json" || -d "$dir/calendar-data" ]]; then
      printf '%s\n' "$dir"
    fi
  done | sort
}

print_profiles() {
  local root
  root="$(profiles_root)"
  echo "Thunderbird profiles root: $root"
  local found=0
  while IFS= read -r dir; do
    found=1
    printf '  - %s\n' "$(basename "$dir")"
  done < <(list_profile_dirs)
  if [[ "$found" -eq 0 ]]; then
    echo "  (none found — start Thunderbird once to create a profile)"
  fi
}

resolve_profile_dir() {
  local root arg="$1"
  root="$(profiles_root)"

  if [[ -z "$arg" ]]; then
    local -a profiles=()
    while IFS= read -r dir; do
      profiles+=("$dir")
    done < <(list_profile_dirs)

    if [[ ${#profiles[@]} -eq 0 ]]; then
      echo "error: no Thunderbird profiles found under $root" >&2
      echo "Start Thunderbird once to create a profile, then re-run this script." >&2
      exit 1
    fi

    if [[ ${#profiles[@]} -eq 1 ]]; then
      echo "${profiles[0]}"
      return 0
    fi

    # Prefer *.default-esr, then *.default*
    local preferred=""
    local p
    for p in "${profiles[@]}"; do
      case "$(basename "$p")" in
        *.default-esr) preferred="$p"; break ;;
      esac
    done
    if [[ -z "$preferred" ]]; then
      for p in "${profiles[@]}"; do
        case "$(basename "$p")" in
          *.default*) preferred="$p"; break ;;
        esac
      done
    fi

    if [[ -n "$preferred" ]]; then
      echo "Multiple profiles found; using preferred: $(basename "$preferred")" >&2
      echo "Pass --profile <name> to choose another." >&2
      echo "$preferred"
      return 0
    fi

    echo "error: multiple Thunderbird profiles found:" >&2
    for p in "${profiles[@]}"; do
      echo "  - $(basename "$p")" >&2
    done
    echo "Re-run with --profile <name>" >&2
    exit 1
  fi

  if [[ -d "$arg" ]]; then
    echo "$arg"
    return 0
  fi

  if [[ -d "$root/$arg" ]]; then
    echo "$root/$arg"
    return 0
  fi

  echo "error: profile not found: $arg" >&2
  echo "Use --list-profiles to see available profiles." >&2
  exit 1
}

ensure_unsigned_pref() {
  local profile_dir="$1"
  local user_js="$profile_dir/user.js"
  local pref='user_pref("xpinstall.signatures.required", false);'

  mkdir -p "$profile_dir"
  if [[ -f "$user_js" ]] && grep -Fq 'xpinstall.signatures.required' "$user_js"; then
    # Keep existing explicit setting; do not silently override true→false if user set it.
    if grep -Fq "$pref" "$user_js"; then
      echo "Signature check already relaxed in user.js"
      return 0
    fi
    echo "warning: user.js already mentions xpinstall.signatures.required; leaving it unchanged." >&2
    echo "         If the add-on is blocked as unsigned, set that pref to false in about:config." >&2
    return 0
  fi

  {
    echo ""
    echo "// Added by Meeting Reminder Join install-in-thunderbird.sh"
    echo "$pref"
  } >>"$user_js"
  echo "Wrote $pref to user.js (needed for local unsigned installs)"
}

install_proxy() {
  local profile_dir="$1"
  local extensions_dir="$profile_dir/extensions"
  local proxy_file="$extensions_dir/$EXTENSION_ID"
  local target_path="$EXTENSION_DIR"

  if [[ ! -f "$EXTENSION_DIR/manifest.json" ]]; then
    echo "error: missing $EXTENSION_DIR/manifest.json — run a build first" >&2
    exit 1
  fi

  # Proxy file must be an absolute path ending with a directory separator.
  case "$target_path" in
    */) ;;
    *) target_path="${target_path}/" ;;
  esac

  mkdir -p "$extensions_dir"

  # If a previous real install directory exists with this ID, remove it so the proxy can win.
  if [[ -d "$proxy_file" ]]; then
    echo "Removing existing extension directory install at $proxy_file"
    rm -rf "$proxy_file"
  fi

  printf '%s\n' "$target_path" >"$proxy_file"
  echo "Installed proxy:"
  echo "  $proxy_file"
  echo "  -> $target_path"
}

uninstall_proxy() {
  local profile_dir="$1"
  local proxy_file="$profile_dir/extensions/$EXTENSION_ID"
  if [[ -e "$proxy_file" ]]; then
    rm -rf "$proxy_file"
    echo "Removed $proxy_file"
  else
    echo "No proxy install found at $proxy_file"
  fi
}

clear_cached_addon_entry() {
  local profile_dir="$1"
  local extensions_json="$profile_dir/extensions.json"
  if [[ ! -f "$extensions_json" ]]; then
    return 0
  fi

  if pgrep -if "Thunderbird|thunderbird" >/dev/null 2>&1; then
    echo "warning: Thunderbird appears to be running." >&2
    echo "         Quit it completely before install so permissions (alarms/etc.) refresh." >&2
  fi

  python3 - "$extensions_json" "$EXTENSION_ID" <<'PY'
import json, sys
path, ext_id = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
addons = data.get("addons", [])
kept = [a for a in addons if a.get("id") != ext_id]
if len(kept) == len(addons):
    print(f"No cached extensions.json entry for {ext_id}")
else:
    data["addons"] = kept
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"Removed cached extensions.json entry for {ext_id} (permissions will reload)")
PY
}

build_extension() {
  cd "$ROOT"
  if [[ ! -d node_modules ]]; then
    echo "Installing npm dependencies (ignore-scripts)…"
    npm install --ignore-scripts
  fi
  echo "Building extension…"
  npm run build
}

if [[ "$LIST_PROFILES" -eq 1 ]]; then
  print_profiles
  exit 0
fi

PROFILE_DIR="$(resolve_profile_dir "$PROFILE_ARG")"
echo "Using Thunderbird profile: $PROFILE_DIR"

if [[ "$DO_UNINSTALL" -eq 1 ]]; then
  uninstall_proxy "$PROFILE_DIR"
  clear_cached_addon_entry "$PROFILE_DIR"
  echo "Restart Thunderbird (or start it) to finish uninstall."
  exit 0
fi

if [[ "$DO_BUILD" -eq 1 ]]; then
  build_extension
else
  echo "Skipping build (--no-build)"
fi

ensure_unsigned_pref "$PROFILE_DIR"
if [[ "$FORCE_REINSTALL" -eq 1 ]]; then
  uninstall_proxy "$PROFILE_DIR"
  clear_cached_addon_entry "$PROFILE_DIR"
fi
install_proxy "$PROFILE_DIR"

echo
echo "Next steps:"
echo "  1. Fully quit Thunderbird if it is running (required; experiment APIs cache aggressively)."
echo "  2. Relaunch with cache purge, e.g.:"
echo "       /Applications/Thunderbird.app/Contents/MacOS/thunderbird -P $(basename "$PROFILE_DIR") -purgecaches"
echo "     Or: npm run install:thunderbird -- --profile $(basename "$PROFILE_DIR") --launch"
echo "  3. Confirm 'Meeting Reminder Join' appears under Tools → Add-ons and Themes."
echo "  4. In about:debugging → Inspect, confirm logs show:"
echo "       hasCalendarItemsPing: true, hasFindDueReminders: true, ReminderWatcher ping { version: \"0.1.6\", build: \"due-v1\" }"
echo "  5. After code changes: rebuild/install, fully quit, then relaunch with -purgecaches."
echo
echo "If Thunderbird still won't load it, use temporary install instead:"
echo "  about:debugging → This Thunderbird → Load Temporary Add-on → dist/extension/manifest.json"

if [[ "$DO_LAUNCH" -eq 1 ]]; then
  if TB_BIN="$(find_thunderbird_bin)"; then
    PROFILE_NAME="$(basename "$PROFILE_DIR")"
    if pgrep -if "Thunderbird|thunderbird" >/dev/null 2>&1; then
      echo "warning: Thunderbird is still running; quit it first so -purgecaches can reload experiments." >&2
    fi
    echo "Launching Thunderbird (-P $PROFILE_NAME -purgecaches)…"
    # -purgecaches forces experiment parent scripts to reload from disk.
    "$TB_BIN" -P "$PROFILE_NAME" -purgecaches >/dev/null 2>&1 &
  else
    echo "warning: could not find Thunderbird binary; start it manually." >&2
    echo "Set THUNDERBIRD_BIN to override." >&2
    exit 1
  fi
fi
