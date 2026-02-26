#!/bin/bash
# Production build script for CarryOn frontend
# Removes Emergent-specific development scripts from index.html before building

echo "Preparing production build..."

# Create a backup of index.html
cp public/index.html public/index.html.bak

# Remove Emergent badge (the <a id="emergent-badge"> block)
python3 -c "
import re
with open('public/index.html', 'r') as f:
    content = f.read()

# Remove Emergent badge link
content = re.sub(r'<a\s+id=\"emergent-badge\".*?</a>', '', content, flags=re.DOTALL)

# Remove Emergent main script
content = re.sub(r'<script src=\"https://assets.emergent.sh/scripts/emergent-main.js\"></script>\n?', '', content)

# Remove visual edits iframe loader
content = re.sub(r'<script>\s*// Only load visual edit scripts.*?</script>', '', content, flags=re.DOTALL)

# Remove PostHog analytics
content = re.sub(r'<script>\s*!\(function.*?posthog\.init\(.*?\);\s*</script>', '', content, flags=re.DOTALL)

# Remove DataCloneError handler
content = re.sub(r'<script>window\.addEventListener\(\"error\".*?</script>\n?', '', content)

# Clean up extra whitespace
content = re.sub(r'\n{3,}', '\n\n', content)

with open('public/index.html', 'w') as f:
    f.write(content)

print('Cleaned index.html for production')
"

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
