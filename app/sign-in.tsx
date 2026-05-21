import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, TextInput, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { user, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/(tabs)');
    }
  }, [user, loading]);

  const submit = async () => {
    if (!email || !password) {
      Alert.alert('Email and password required');
      return;
    }
    setBusy(true);
    try {
      const fn = mode === 'sign-in' ? signIn : signUp;
      const { error } = await fn(email.trim(), password);
      if (error) {
        Alert.alert(mode === 'sign-in' ? 'Sign-in failed' : 'Sign-up failed', error.message);
        return;
      }
      if (mode === 'sign-up') {
        Alert.alert(
          'Check your inbox',
          'A confirmation email was sent. After confirming, sign in with the same credentials.',
        );
        setMode('sign-in');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {t('common.appName')}
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        {mode === 'sign-in' ? 'Sign in to continue' : 'Create an account'}
      </ThemedText>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
      />

      <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={busy}>
        <ThemedText style={styles.primaryButtonText}>
          {busy ? '...' : mode === 'sign-in' ? 'Sign in' : 'Sign up'}
        </ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        disabled={busy}
      >
        <ThemedText style={styles.switchModeText}>
          {mode === 'sign-in' ? 'No account? Sign up' : 'Have an account? Sign in'}
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { textAlign: 'center', marginBottom: 4 },
  subtitle: { textAlign: 'center', marginBottom: 24, opacity: 0.7 },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
  primaryButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchModeText: { textAlign: 'center', marginTop: 16, opacity: 0.7 },
});
