# Deploying the web build to Vercel

The Expo web export is a static single-page app. `vercel.json` at the repository
root holds the build command, output directory, and the SPA rewrite, so the
deploy is mostly Vercel project setup.

## One-time setup

1. At <https://vercel.com>, sign in and create a new project, importing this
   GitHub repository.
2. Leave **Root Directory** as the repository root (the default). Vercel reads
   `vercel.json` from there. Framework preset can be left as "Other"; the build
   command and output directory come from `vercel.json`.
3. Add two environment variables (Project Settings → Environment Variables),
   for the Production and Preview environments:

   | Name                            | Value                          |
   | ------------------------------- | ------------------------------ |
   | `EXPO_PUBLIC_SUPABASE_URL`      | the Supabase project URL       |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the Supabase anon / public key |

   Do **not** add `SUPABASE_SERVICE_ROLE_KEY`. It is for server-side seeding
   only and must never reach the client bundle.

4. Deploy. Every push to `main` then redeploys automatically.

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
