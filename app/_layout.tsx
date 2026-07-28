import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BugReportButton } from '@/components/bug-report-button';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { registerServiceWorker } from '@/lib/pwa/registerServiceWorker';
import { SyncProvider } from '@/lib/sync/SyncProvider';
import { applyWebViewportFix } from '@/lib/web/viewportFix';
import { loadSavedLanguage } from '@/lib/i18n';
import '@/lib/sentry';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Register the web service worker so the app can launch offline (web only,
// production only). No-op on native and in development.
registerServiceWorker();

// Size the web app box to the visible viewport so mobile browser toolbars stop
// covering bottom-anchored controls. No-op on native.
applyWebViewportFix();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Apply the saved language preference (if any) after the device-locale default.
  useEffect(() => {
    void loadSavedLanguage();
  }, []);

  return (
    // Screens read the bottom inset from here to keep their action buttons
    // clear of the iOS home indicator and the Safari toolbar.
    <SafeAreaProvider>
      <AuthProvider>
        <SyncProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
              <Stack.Screen name="reset-password" options={{ headerShown: false }} />
              <Stack.Screen
                name="decks/new"
                options={{ title: 'New deck', presentation: 'modal' }}
              />
              <Stack.Screen name="decks/[id]/triage" options={{ title: 'Triage' }} />
              <Stack.Screen name="decks/[id]/session" options={{ title: 'Session' }} />
              <Stack.Screen name="tags" options={{ title: 'Tags', presentation: 'modal' }} />
              <Stack.Screen
                name="how-it-works"
                options={{ title: 'How it works', presentation: 'modal' }}
              />
              <Stack.Screen
                name="settings"
                options={{ title: 'Settings', presentation: 'modal' }}
              />
              <Stack.Screen name="bugs" options={{ title: 'Bug reports', presentation: 'modal' }} />
            </Stack>
            <BugReportButton />
            <StatusBar style="auto" />
          </ThemeProvider>
        </SyncProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
