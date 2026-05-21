import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { registerServiceWorker } from '@/lib/pwa/registerServiceWorker';
import { SyncProvider } from '@/lib/sync/SyncProvider';
import '@/lib/i18n';
import '@/lib/sentry';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Register the web service worker so the app can launch offline (web only,
// production only). No-op on native and in development.
registerServiceWorker();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <SyncProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="decks/new" options={{ title: 'New deck', presentation: 'modal' }} />
            <Stack.Screen name="decks/[id]/triage" options={{ title: 'Triage' }} />
            <Stack.Screen name="decks/[id]/session" options={{ title: 'Session' }} />
            <Stack.Screen name="tags" options={{ title: 'Tags', presentation: 'modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SyncProvider>
    </AuthProvider>
  );
}
