# 0005. Expo (managed React Native) over Flutter or bare React Native

- Status: Accepted
- Date: 2026-05-21

## Context

The app targets iPhone and Android. It also needs a web build, both as a free
portfolio demo URL and as a quick way to test during development. The framework
choice had to cover all three from one codebase.

## Decision

Build with Expo, the managed React Native toolchain (SDK 54), using
`expo-router` for file-based navigation.

Reasons:

- One TypeScript codebase produces iOS, Android, and web builds.
- `expo-router` gives file-based routing, which keeps screens and navigation
  obvious.
- EAS Build and over-the-air updates remove most native build-chain work.
- The web export is a static site that deploys to Vercel for free, which is the
  portfolio demo.
- It reuses existing TypeScript and React knowledge rather than introducing a
  new language.

## Consequences

- The project tracks the Expo SDK release cadence. New native APIs must be read
  from the versioned SDK 54 docs, not from older snippets, because APIs shift
  between SDKs.
- Some native modules need Expo config plugins rather than direct linking.
- The web target has development-mode caveats. The dev bundle is served live by
  Metro, so a page reload while offline fails. This affects only local
  development; a production web export with a service worker, and the native
  apps where JavaScript ships on device, do not have this limitation.
- The EAS Build free tier allows 30 builds per month. This is managed by
  shipping JavaScript changes through OTA updates and reserving native builds
  for changes that actually touch native code.

## Alternatives considered

- **Flutter.** A strong cross-platform framework, but it would mean writing the
  app in Dart, with no code or library reuse with the TypeScript and React
  ecosystem the rest of the toolchain already uses, and no straightforward path
  to the same web build.
- **Bare React Native.** Keeps React and TypeScript but reintroduces manual
  native tooling: CocoaPods, Gradle, and Xcode upkeep. Expo's managed workflow
  exists specifically to remove that cost.
- **Native iOS plus native Android.** Two separate codebases in two languages,
  with no shared web target. Rejected for a solo-built project.
