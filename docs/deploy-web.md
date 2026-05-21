# Deploying the web build to Vercel

The Expo web export is a static single-page app. `vercel.json` in this folder
already holds the build command, output directory, and the SPA rewrite, so the
deploy is mostly Vercel project setup.

## One-time setup

1. Push the repository to GitHub (if it is not already there).
2. At <https://vercel.com>, create a new project and import the repository.
3. In the project settings, set **Root Directory** to:

   ```
   02_projects/portfolio/german-vocab-app
   ```

   Vercel then reads `vercel.json` from that folder. Framework preset can be
   left as "Other"; the build command and output directory come from
   `vercel.json`.

4. Add two environment variables (Project Settings → Environment Variables),
   for the Production and Preview environments:

   | Name                            | Value                          |
   | ------------------------------- | ------------------------------ |
   | `EXPO_PUBLIC_SUPABASE_URL`      | the Supabase project URL       |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the Supabase anon / public key |

   Do **not** add `SUPABASE_SERVICE_ROLE_KEY`. It is for server-side seeding
   only and must never reach the client bundle.

5. Deploy. Every push to `main` then redeploys automatically.

## Local check before deploying

```bash
npx expo export --platform web   # writes dist/
npx serve dist                   # or any static server, to smoke-test
```

## Notes

- `output: "single"` in `app.json` makes the web build a SPA. The
  `rewrites` rule in `vercel.json` sends every non-asset path to `index.html`
  so client-side routing works on a hard refresh.
- The production web build registers a service worker (`public/service-worker.js`)
  that caches the app shell and JavaScript bundle. After one online visit the
  app launches with no network, including a hard refresh. The service worker is
  not registered in development, where it would fight Metro's fast refresh.
