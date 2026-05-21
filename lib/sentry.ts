/**
 * Sentry init. No-op unless EXPO_PUBLIC_SENTRY_DSN is set, which lets the app
 * boot cleanly in dev / Expo Go without Sentry native modules being touched.
 */

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

if (dsn) {
  try {
    // Defer the import so the native module is only resolved when actually needed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
    Sentry.init({
      dsn,
      enabled: true,
      tracesSampleRate: 0.2,
    });
  } catch (err) {
    console.warn('[sentry] init skipped:', err);
  }
}

export {};
