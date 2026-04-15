#!/bin/sh
# Install git hooks for this repository.
# Run once after cloning: bash scripts/setup_hooks.sh

HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/sh
echo "[pre-commit] Running lint..."
npm run lint
if [ $? -ne 0 ]; then
    echo "[pre-commit] Lint failed. Fix errors before committing."
    exit 1
fi
echo "[pre-commit] Lint passed."
EOF
chmod +x "$HOOKS_DIR/pre-commit"

echo "Hooks installed."
