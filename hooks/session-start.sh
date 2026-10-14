#!/bin/sh
# Forge session-start check. Prints context for Claude only when something is
# missing; silent otherwise. Never installs, clones, or creates anything.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# The project's .forge.json (searched upward from here, stopping at $HOME) wins
# over the machine config, exactly as the CLI resolves it.
project=""
dir="$PWD"
while :; do
  if [ -f "$dir/.forge.json" ]; then project="$dir/.forge.json"; break; fi
  [ "$dir" = "$HOME" ] || [ "$dir" = "/" ] && break
  dir="$(dirname "$dir")"
done

missing=""
[ -x "$ROOT/node_modules/.bin/tsx" ] || missing="dependencies"
if [ -n "$project" ]; then
  # the clone path named in the project file, ~ expanded (no JSON parser needed for one field)
  path="$(sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$project" | head -n 1)"
  case "$path" in "~"*) path="$HOME${path#\~}";; esac
  if [ -n "$path" ] && [ ! -d "$path" ]; then
    missing="${missing:+$missing and }lesson library for this project (named in $project, not cloned at $path)"
  fi
elif [ ! -f "$HOME/.claude/forge/config.json" ]; then
  missing="${missing:+$missing and }lesson library"
fi

[ -z "$missing" ] && exit 0
echo "Forge is installed but its $missing is not set up on this machine. If the user starts Forge work (/forge:scope, /forge:harvest, lessons), suggest /forge:setup once first. Do not run it unprompted."
