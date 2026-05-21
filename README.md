# German Vocab App

A mobile vocabulary learning app for German learners, built around the **SEKI 7×7 method**: a fixed 49-day schedule where each word is reviewed exactly 7 times across 7 weekly cycles.

> Personal learning tool + portfolio project. Built with Expo (React Native) + Supabase.

## Why SEKI 7×7 over adaptive SRS (FSRS, SM-2)?

Most flashcard apps use adaptive spaced repetition where each card has its own due date. The SEKI method takes the opposite approach: a fixed batch schedule that guarantees every word is seen the same number of times, regardless of difficulty. This simplifies session UX (the user always knows exactly what to do today) and matches the preferred study rhythm. See [`docs/decisions/0001-seki-method-over-fsrs.md`](docs/decisions/0001-seki-method-over-fsrs.md) for the full rationale.

## Stack

| Area             | Choice                                                           |
| ---------------- | ---------------------------------------------------------------- |
| Framework        | Expo SDK 54 (React Native, expo-router)                          |
| Language         | TypeScript strict mode                                           |
| Backend          | Supabase (Postgres + Auth + Storage + Realtime + RLS)            |
| Learning engine  | Custom SEKI 7×7 scheduler (pure functions, unit-tested)          |
| Offline          | Mutation outbox (AsyncStorage) + sync engine (see ADR 0004)      |
| TTS              | `expo-speech` (device built-in), Google Cloud TTS WaveNet (v1.1) |
| i18n             | `expo-localization` + `i18next` + `react-i18next` (ja / en)      |
| Error monitoring | `@sentry/react-native`                                           |
| Tests            | Jest + jest-expo (scheduler & DB wrapper only; no UI tests)      |
| CI               | GitHub Actions (typecheck + lint + test + format check)          |

## Project structure

```
app/                   # expo-router screens (file-based routing)
features/              # screen-level feature modules
  seki/                # review session UI
  decks/               # deck list, create, activate
  cards/               # card list, edit
  tags/                # tag management
  triage/              # known-word triage UI (bulk / progressive)
  stats/               # dashboard tabs
lib/                   # framework-agnostic core
  seki/                # SEKI scheduler & weak-deck logic (pure functions)
  db/                  # Supabase client + repository layer
  tts/                 # expo-speech wrapper
  sync/                # offline sync queue
  i18n/                # i18next setup
  sentry.ts            # Sentry init
locales/
  ja.json, en.json     # translations
supabase/
  migrations/          # SQL migrations
  seed/                # vocab.json + extract_vocab.py (data prep)
docs/
  decisions/           # ADRs (Architecture Decision Records)
```

## Setup

```bash
npm install
npm run start        # Expo dev server
npm run android      # Android device / emulator
npm run ios          # iOS device / simulator (macOS only)
npm run web          # Web build
```

## Verification

```bash
npm run typecheck    # TypeScript strict
npm run lint         # ESLint
npm run format:check # Prettier
npm test             # Jest unit tests
```

## Data

Vocabulary lives in a single curated master spreadsheet,
`supabase/seed/german_vocab_master.xlsx`, covering CEFR levels A1 to C1 (2,488
unique entries: A1 569, A2 619, B1 521, B2 436, C1 347). Each entry carries the
German term, part of speech, article, Japanese and English translations, verb
forms, plural, and a tag list (theme, part of speech, level).

The pipeline turns the spreadsheet into the seed data and loads it:

```bash
python supabase/seed/extract_vocab.py        # xlsx -> vocab.json + vocab.csv
node --env-file=.env supabase/seed/seed_cards.mjs   # vocab.json -> Supabase
```

Adding a level is a one-shot script (`add_a1_to_master.py` ... `add_c1_to_master.py`)
that appends curated entries to the master spreadsheet; rerun the pipeline after.

## Supabase setup (one-time)

1. Create a free project at <https://supabase.com> (region close to you).
2. Copy `.env.example` to `.env` and fill in:
   - `EXPO_PUBLIC_SUPABASE_URL` — _Settings → API → Project URL_
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — _Settings → API → Project API keys → `anon` `public`_
   - `SUPABASE_SERVICE_ROLE_KEY` — _Settings → API → Project API keys → `service_role` `secret`_ (used by seed and migration scripts only; never ship this to the app)
3. Apply the migrations in `supabase/migrations/` in numeric order. Either paste
   each file into the dashboard **SQL Editor**, or run them with the helper
   script (requires the DB password):

   ```bash
   SUPABASE_DB_PASSWORD=... node --env-file=.env supabase/seed/apply_migration.mjs supabase/migrations/0001_init.sql
   ```

4. Seed the shared dictionary:

   ```bash
   node --env-file=.env supabase/seed/seed_cards.mjs
   ```

   Expected: `Upserted 2488, failed: 0`.

## Web deploy

The Expo web export is a static SPA. `vercel.json` holds the build config and
SPA rewrite. See [`docs/deploy-web.md`](docs/deploy-web.md) for the one-time
Vercel setup.

## Architecture decisions

Significant design choices are recorded as ADRs in
[`docs/decisions/`](docs/decisions/README.md): the SEKI method, the weak-deck
rule, the data model, offline sync, the framework choice, and the RLS policy.
