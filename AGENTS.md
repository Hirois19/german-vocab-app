# Agent notes for this project

## Expo version

This project uses **Expo SDK 54**. Read the exact versioned docs at <https://docs.expo.dev/versions/v54.0.0/> before writing any new native or Expo-API code. APIs have shifted across SDKs and older snippets are not safe to copy.

## Design source of truth

Significant architectural decisions are recorded in `docs/decisions/` as ADRs. The SEKI 7×7 specification, the data model, and the dashboard tabs are summarized in `README.md`. Treat the ADRs as authoritative; if an implementation diverges, record the change as a new or updated ADR.

## Code conventions

- TypeScript strict mode is mandatory. No `any` except where bridging untyped third-party code, and even then prefer `unknown`.
- Pure logic lives in `lib/` and is unit-tested with Jest. UI lives in `app/` and `features/` and is **not** unit-tested (per design decision: ROI too low).
- No `Atomic Design`-style component hierarchies. Group by feature, not by component class.
- Path alias `@/*` is configured in `tsconfig.json`. Use it for cross-folder imports.
- Run `npm run format` before committing. Conventional Commits are required.

## Hard rules

- Never add an adaptive SRS algorithm (FSRS, SM-2) — the SEKI 7×7 fixed schedule is the explicit design choice.
- Never store user-specific progress on the shared `cards` table. Use `user_cards` and `reviews`.
- Supabase Row Level Security must be enabled on every user-data table from the first migration.
