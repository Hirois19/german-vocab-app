import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';

type Mode = 'sign-in' | 'sign-up' | 'reset';

export default function SignInScreen() {
  const { t, i18n } = useTranslation();
  const { user, loading, signIn, signUp, resetPasswordForEmail } = useAuth();
  const isJa = i18n.language === 'ja';
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/(tabs)');
    }
  }, [user, loading]);

  // Clear any banner when the user switches modes so the previous outcome
  // does not stay glued to a different action.
  const switchMode = (next: Mode) => {
    setMode(next);
    setErrorMsg(null);
    setNotice(null);
  };

  const submit = async () => {
    setErrorMsg(null);
    setNotice(null);
    if (!email.trim()) {
      setErrorMsg(isJa ? 'メールアドレスを入力してください。' : 'Please enter an email address.');
      return;
    }
    if (mode !== 'reset' && !password) {
      setErrorMsg(isJa ? 'パスワードを入力してください。' : 'Please enter a password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'reset') {
        const { error } = await resetPasswordForEmail(email.trim());
        if (error) {
          setErrorMsg(error.message);
          return;
        }
        setNotice(
          isJa
            ? `${email.trim()} 宛にパスワード再設定用のメールを送信しました。受信箱と迷惑メールフォルダをご確認ください。`
            : `A password-reset email has been sent to ${email.trim()}. Check your inbox and spam folder.`,
        );
        return;
      }
      const fn = mode === 'sign-in' ? signIn : signUp;
      const { error } = await fn(email.trim(), password);
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      if (mode === 'sign-up') {
        setNotice(
          isJa
            ? `${email.trim()} 宛に確認メールを送信しました。メール本文のリンクをクリックしてアカウントを有効化したあと、同じメール・パスワードでサインインしてください。受信箱に見つからない場合は迷惑メールフォルダもご確認ください。`
            : `A confirmation email has been sent to ${email.trim()}. Click the link in the email to activate your account, then sign in with the same credentials. Check your spam folder if you do not see it.`,
        );
        setMode('sign-in');
        setPassword('');
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

  const title = t('common.appName');
  const subtitle =
    mode === 'sign-in'
      ? isJa
        ? 'サインインして続行'
        : 'Sign in to continue'
      : mode === 'sign-up'
        ? isJa
          ? 'アカウントを作成'
          : 'Create an account'
        : isJa
          ? 'パスワードを再設定'
          : 'Reset your password';

  const primaryLabel = busy
    ? '...'
    : mode === 'sign-in'
      ? isJa
        ? 'サインイン'
        : 'Sign in'
      : mode === 'sign-up'
        ? isJa
          ? 'サインアップ'
          : 'Sign up'
        : isJa
          ? '再設定メールを送信'
          : 'Send reset email';

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>

      {notice ? (
        <View style={styles.noticeBanner}>
          <ThemedText style={styles.noticeText}>{notice}</ThemedText>
        </View>
      ) : null}
      {errorMsg ? (
        <View style={styles.errorBanner}>
          <ThemedText style={styles.errorText}>{errorMsg}</ThemedText>
        </View>
      ) : null}

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
      {mode !== 'reset' ? (
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
      ) : null}

      <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={busy}>
        <ThemedText style={styles.primaryButtonText}>{primaryLabel}</ThemedText>
      </TouchableOpacity>

      {mode === 'sign-in' ? (
        <>
          <TouchableOpacity onPress={() => switchMode('reset')} disabled={busy}>
            <ThemedText style={styles.linkText}>
              {isJa ? 'パスワードをお忘れですか？' : 'Forgot your password?'}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => switchMode('sign-up')} disabled={busy}>
            <ThemedText style={styles.linkText}>
              {isJa ? 'アカウントをお持ちでない方はこちら' : 'No account? Sign up'}
            </ThemedText>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity onPress={() => switchMode('sign-in')} disabled={busy}>
          <ThemedText style={styles.linkText}>
            {isJa ? 'サインインに戻る' : 'Back to sign in'}
          </ThemedText>
        </TouchableOpacity>
      )}
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
  linkText: { textAlign: 'center', marginTop: 12, opacity: 0.8, color: '#0a7ea4' },
  noticeBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a8a4f',
    backgroundColor: 'rgba(58,138,79,0.15)',
  },
  noticeText: { fontSize: 13, lineHeight: 19 },
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a63a3a',
    backgroundColor: 'rgba(166,58,58,0.15)',
  },
  errorText: { fontSize: 13, lineHeight: 19, color: '#ff8888' },
});
