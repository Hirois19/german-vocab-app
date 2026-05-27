/**
 * Reset-password landing page.
 *
 * The user arrives here via the password-reset email Supabase sent. The link
 * places a recovery token in the URL hash; the Supabase JS client handles it
 * automatically and creates a temporary session so `auth.updateUser` can set
 * a new password. The page itself just renders the form.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function ResetPasswordScreen() {
  const { i18n } = useTranslation();
  const { updatePassword } = useAuth();
  const isJa = i18n.language === 'ja';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setErrorMsg(null);
    if (password.length < 8) {
      setErrorMsg(
        isJa ? 'パスワードは8文字以上にしてください。' : 'Password must be at least 8 characters.',
      );
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg(isJa ? 'パスワードが一致しません。' : 'Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>
          {isJa ? 'パスワードを更新しました' : 'Password updated'}
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          {isJa
            ? '新しいパスワードでサインインできます。'
            : 'You can now sign in with the new password.'}
        </ThemedText>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/sign-in')}>
          <ThemedText style={styles.primaryButtonText}>
            {isJa ? 'サインインへ' : 'Go to sign in'}
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {isJa ? 'パスワードを再設定' : 'Reset your password'}
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        {isJa ? '新しいパスワードを入力してください。' : 'Enter a new password.'}
      </ThemedText>

      {errorMsg ? (
        <View style={styles.errorBanner}>
          <ThemedText style={styles.errorText}>{errorMsg}</ThemedText>
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder={isJa ? '新しいパスワード (8文字以上)' : 'New password (at least 8 characters)'}
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
      />
      <TextInput
        style={styles.input}
        placeholder={isJa ? '新しいパスワード（確認）' : 'Confirm new password'}
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!busy}
      />

      <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={busy}>
        <ThemedText style={styles.primaryButtonText}>
          {busy ? '...' : isJa ? 'パスワードを更新' : 'Update password'}
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { textAlign: 'center', marginBottom: 4 },
  subtitle: { textAlign: 'center', marginBottom: 16, opacity: 0.7 },
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
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a63a3a',
    backgroundColor: 'rgba(166,58,58,0.15)',
  },
  errorText: { fontSize: 13, lineHeight: 19, color: '#ff8888' },
});
