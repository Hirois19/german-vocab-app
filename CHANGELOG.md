# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## [Unreleased]

### Added

- Initial Expo SDK 54 scaffold (TypeScript strict, expo-router, ESLint flat config, Prettier).
- Jest + jest-expo for unit testing the SEKI scheduler and pure logic (93 tests).
- `@sentry/react-native` wired into the app root, gated on `EXPO_PUBLIC_SENTRY_DSN`.
- `i18next` + `react-i18next` + `expo-localization` for Japanese/English UI.
- SEKI 7×7 scheduler, triage logic, and weak-deck detection as pure functions in `lib/seki/`.
- Supabase schema, Row Level Security, and the repository layer in `lib/db/`.
- Six dashboard tabs: Today, Progress, Decks, Mastered, Category, Trend.
- Deck creation, bulk and progressive triage, review sessions, and automatic weak-deck generation.
- Progressive triage mode with backfill: known words are replaced from the candidate pool so the deck fills to W.
- Per-level coverage bar on the Progress tab (learned vs studying vs remaining).
- Curated A1-C1 vocabulary master (`german_vocab_session_new.xlsx`, 2,488 entries) and the extract/seed pipeline.
- Source-data tagging: theme, part of speech, and CEFR-level tags computed at extraction and editable per card.
- Offline support: a mutation outbox, a sync engine, and a session snapshot so reviews work without a connection.
- Web service worker so the production web build launches offline after one online visit.
- Architecture Decision Records in `docs/decisions/` (ADRs 0001-0006).
- GitHub Actions workflow for typecheck, lint, format check, and test.

[Unreleased]: https://example.com
