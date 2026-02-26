#!/bin/sh
# Production build script for CarryOn frontend
# Removes Emergent-specific development scripts from index.html before building
# Sets CI=false to prevent React Hook warnings from failing the build

echo "Preparing production build..."

# Prevent CI from treating warnings as errors
export CI=false

# Create a backup of index.html
cp public/index.html public/index.html.bak

# Remove Emergent-specific scripts using sed
# 1. Remove the emergent-main.js script tag
sed -i '/<script src="https:\/\/assets.emergent.sh/d' public/index.html

# 2. Remove DataCloneError handler (single line script)
sed -i '/DataCloneError/d' public/index.html

# 3. Remove the visual edits iframe loader block
sed -i '/\/\/ Only load visual edit scripts/,/<\/script>/d' public/index.html

# 4. Remove the Emergent badge
sed -i '/<a$/,/<\/a>/{ /id="emergent-badge"/,/<\/a>/d }' public/index.html

# 5. Remove PostHog analytics
sed -i '/posthog/,/<\/script>/d' public/index.html

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
