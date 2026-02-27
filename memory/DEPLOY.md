# Deployment Info

## Vercel Deploy Hook
URL: https://api.vercel.com/v1/integrations/deploy/prj_ZDH4AJkNcf2vricEvD4KATpgRJZb/RXnUhbxeDr
Method: POST
Branch: main

## Workflow
1. User pushes to GitHub ("Save to GitHub")
2. Agent triggers deploy: `curl -X POST <deploy hook URL>`
3. Vercel builds and deploys to app.carryon.us
