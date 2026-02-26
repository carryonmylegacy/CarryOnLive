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
python3 -c "
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
    # Fallback: just remove the known script lines
    cp public/index.html.bak public/index.html
    sed -i '/DataCloneError/d' public/index.html
    sed -i '/assets\.emergent\.sh/d' public/index.html
}

echo "Building production bundle..."

# Run the build
yarn build
BUILD_EXIT=$?

# Restore original index.html
mv public/index.html.bak public/index.html

if [ $BUILD_EXIT -eq 0 ]; then
    echo "Production build complete! Output in ./build/"
else
    echo "Build failed with exit code $BUILD_EXIT"
    exit $BUILD_EXIT
fi
