#!/bin/bash
# setup-em-team.sh — Symlink vendored EM-Team to ~/.claude/em-team/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/em-team"
CLAUDE_DIR="$HOME/.claude"
TARGET="$CLAUDE_DIR/em-team"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[setup]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "  EM-Team Setup — Symlink vendored content to ~/.claude/em-team/"
echo ""

# Step 1: Verify submodule exists
if [[ ! -f "$VENDOR_DIR/CLAUDE.md" ]]; then
  echo "Error: EM-Team submodule not found at $VENDOR_DIR" >&2
  echo "Run: git submodule update --init --recursive" >&2
  exit 1
fi
ok "Submodule found at $VENDOR_DIR"

# Step 2: Handle existing target
if [[ -L "$TARGET" ]]; then
  CURRENT=$(readlink "$TARGET")
  if [[ "$CURRENT" == "$VENDOR_DIR" ]]; then
    ok "Symlink already correct: $TARGET -> $VENDOR_DIR"
    echo ""
    echo "  Nothing to do. EM-Team is ready."
    exit 0
  fi
  warn "Removing old symlink: $TARGET -> $CURRENT"
  rm "$TARGET"
elif [[ -d "$TARGET" ]]; then
  warn "Backing up existing directory: $TARGET -> ${TARGET}.bak"
  mv "$TARGET" "${TARGET}.bak"
fi

# Step 3: Create symlink
ln -s "$VENDOR_DIR" "$TARGET"
ok "Created symlink: $TARGET -> $VENDOR_DIR"

# Step 4: Verify
AGENT_COUNT=$(ls "$VENDOR_DIR/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
WORKFLOW_COUNT=$(ls "$VENDOR_DIR/workflows/"*.md 2>/dev/null | wc -l | tr -d ' ')
SKILL_COUNT=$(find "$VENDOR_DIR/skills" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "  Installed:"
echo "    Agents:    $AGENT_COUNT"
echo "    Workflows: $WORKFLOW_COUNT"
echo "    Skills:    $SKILL_COUNT"
echo ""
echo "  EM-Team commands available via /em:* prefix"
echo ""
