#!/bin/sh
# Production build script for CarryOn frontend
# Removes Emergent-specific development scripts from index.html before building
# Sets CI=false to prevent React Hook warnings from failing the build

set -e

echo "Preparing production build..."

# Prevent CI from treating warnings as errors
export CI=false

# Create a backup of index.html (outside public/ so it doesn't get included in build)
cp public/index.html /tmp/index.html.carryon.bak

# Use Python to cleanly strip Emergent-specific code from index.html
# Try python3, then python, then fall back to sed
PYTHON_CMD=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
fi

if [ -n "$PYTHON_CMD" ]; then
$PYTHON_CMD -c "
import re

with open('public/index.html', 'r') as f:
    html = f.read()

# 1. Remove DataCloneError handler script (single-line script tag)
html = re.sub(r'<script>window\.addEventListener\(\"error\".*?DataCloneError.*?</script>\s*\n?', '', html)

# 2. Remove emergent-main.js script tag
html = re.sub(r'\s*<script src=\"https://assets\.emergent\.sh/scripts/emergent-main\.js\"></script>\s*\n?', '\n', html)

# 3. Remove the visual edits comment + script block
html = re.sub(r'\s*<!--\s*These two scripts.*?</script>\s*\n?', '\n', html, flags=re.DOTALL)

# 4. Remove the Emergent badge (the entire <a id=\"emergent-badge\"...>...</a> block)
html = re.sub(r'\s*<a\s[^>]*id=\"emergent-badge\"[^>]*>.*?</a>\s*\n?', '\n', html, flags=re.DOTALL)

# 5. Remove PostHog analytics script block
html = re.sub(r'\s*<script>\s*!\(function\s*\(t,\s*e\).*?posthog\.init\(.*?</script>\s*\n?', '\n', html, flags=re.DOTALL)

# Clean up any double blank lines
html = re.sub(r'\n{3,}', '\n\n', html)

with open('public/index.html', 'w') as f:
    f.write(html)

print('Emergent-specific scripts stripped from index.html')
" || {
    echo "Python stripping failed, falling back to sed..."
    cp /tmp/index.html.carryon.bak public/index.html
    sed -i '/DataCloneError/d' public/index.html
    sed -i '/assets\.emergent\.sh/d' public/index.html
    sed -i '/posthog\.init/d' public/index.html
    sed -i '/emergent-badge/d' public/index.html
}
else
    echo "Python not available, using sed fallback..."
    sed -i '/DataCloneError/d' public/index.html
    sed -i '/assets\.emergent\.sh/d' public/index.html
    sed -i '/posthog\.init/d' public/index.html
    sed -i '/emergent-badge/d' public/index.html
fi

echo "Building production bundle..."

# Run the build (use yarn if available, fall back to npm)
if command -v yarn >/dev/null 2>&1; then
    yarn build
else
    npm run build
fi
BUILD_EXIT=$?

# Restore original index.html
mv /tmp/index.html.carryon.bak public/index.html

if [ $BUILD_EXIT -eq 0 ]; then
    echo "Production build complete! Output in ./build/"

    # ── SEO prerender ────────────────────────────────────────────────────
    # 1) Keep a pristine SPA shell: vercel.json rewrites every non-static
    #    route (all logged-in pages) to /shell.html, so app routes never
    #    serve prerendered marketing markup.
    cp build/index.html build/shell.html
    # 2) Snapshot every public page into static HTML with real text so
    #    crawlers and AI agents don't see an empty shell. Chromium comes
    #    from @sparticuz/chromium (built for Vercel/AWS build machines).
    #    Fail-soft: a Chromium problem must never block a deploy.
    echo "Prerendering public pages..."
    node scripts/prerender.js || true
    if [ -f build/about/index.html ] && ! grep -q '<div id="root"></div>' build/about/index.html; then
        echo "PRERENDER VERIFIED: public pages contain real static HTML"
    else
        echo "############################################################"
        echo "# WARNING: PRERENDER DID NOT PRODUCE STATIC HTML.          #"
        echo "# Public pages will be client-rendered only (empty shell   #"
        echo "# for crawlers). Check the prerender log lines above.      #"
        echo "############################################################"
    fi
else
    echo "Build failed with exit code $BUILD_EXIT"
    exit $BUILD_EXIT
fi
