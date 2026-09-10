#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
PACKAGE_ROOT=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)
SOURCE="$PACKAGE_ROOT/bin/qb-trace"
TARGET_DIR="${HOME:?HOME is required}/.local/bin"
TARGET="$TARGET_DIR/qb-trace"

mkdir -p "$TARGET_DIR"
chmod 700 "$TARGET_DIR" 2>/dev/null || true
chmod +x "$SOURCE"

if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  if [ -L "$TARGET" ] && [ "$(readlink "$TARGET")" = "$SOURCE" ]; then
    printf 'qb-trace already installed: %s\n' "$TARGET"
  else
    printf 'refusing to overwrite non-package target: %s\n' "$TARGET" >&2
    exit 1
  fi
else
  ln -s "$SOURCE" "$TARGET"
  printf 'installed qb-trace: %s -> %s\n' "$TARGET" "$SOURCE"
fi

case ":${PATH:-}:" in
  *":$TARGET_DIR:"*) ;;
  *) printf 'warning: add %s to PATH\n' "$TARGET_DIR" >&2 ;;
esac
