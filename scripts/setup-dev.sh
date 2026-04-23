#!/usr/bin/env bash
# CarryOn™ — Setup dev environment hooks
# ============================================================================
# One-time setup: wires the pre-commit hook and makes scripts executable.
# Run once after cloning the repo:
#   bash scripts/setup-dev.sh
# ============================================================================

set -e
cd "$(dirname "$0")/.."

echo "Setting up CarryOn dev environment..."

# 1. Make all scripts executable
chmod +x scripts/check.sh scripts/git-hooks/pre-commit scripts/git-hooks/pre-push scripts/setup-dev.sh 2>/dev/null || true

# 2. Wire pre-commit + pre-push hooks (both live in scripts/git-hooks/)
if [ -d .git ]; then
  git config core.hooksPath scripts/git-hooks
  echo "✓ Pre-commit hook wired  (scripts/git-hooks/pre-commit — lint/format auto-fix)"
  echo "✓ Pre-push hook wired    (scripts/git-hooks/pre-push — housekeeping --strict)"
else
  echo "⚠ Not a git repo — skipping hook setup"
fi

# 3. Verify dependencies
echo ""
echo "Verifying dev dependencies..."
command -v ruff > /dev/null || { echo "⚠ ruff not installed — run: pip install 'ruff>=0.15,<1.0'"; }
command -v node > /dev/null || { echo "⚠ node not installed"; }
command -v yarn > /dev/null || { echo "⚠ yarn not installed"; }

echo ""
echo "✓ Setup complete. Before every push, run: bash scripts/check.sh"
echo "  To also run tests:       HK_RUN_TESTS=1 bash scripts/check.sh"
echo "  To skip pre-commit hook: git commit --no-verify"
