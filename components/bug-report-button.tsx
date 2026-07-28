/**
 * Floating bug-report button rendered above every screen.
 *
 * Tap → modal with a free-text field. On submit the description plus the
 * current route is written to `bug_reports`. Errors fall back to AsyncStorage
 * so a ticket filed while offline is not lost; the next online submission
 * flushes the queue.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createBugReport } from '@/lib/db/bugReports';

const OFFLINE_QUEUE_KEY = 'bug-reports:offline-queue:v1';

interface QueuedReport {
  description: string;
  context: Record<string, unknown>;
  queuedAt: string;
}

async function pushOffline(report: QueuedReport): Promise<void> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  const queue: QueuedReport[] = raw ? (JSON.parse(raw) as QueuedReport[]) : [];
  queue.push(report);
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function flushOffline(userId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return;
  const queue = JSON.parse(raw) as QueuedReport[];
  if (queue.length === 0) return;
  const remaining: QueuedReport[] = [];
  for (const r of queue) {
    try {
      await createBugReport({ userId, description: r.description, context: r.context });
    } catch {
      remaining.push(r);
    }
  }
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
}

export function BugReportButton() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const pathname = usePathname();
  const isJa = i18n.language === 'ja';
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Quietly drain any reports queued while offline as soon as we have a user
  // session. Single attempt on mount; nothing user-visible.
  useEffect(() => {
    if (!user) return;
    void flushOffline(user.id);
  }, [user]);

  if (!user) return null;

  const close = () => {
    setOpen(false);
    setText('');
    setNotice(null);
  };

  const submit = async () => {
    const desc = text.trim();
    if (!desc || !user || submitting) return;
    setSubmitting(true);
    setNotice(null);
    const context: Record<string, unknown> = {
      route: pathname ?? 'unknown',
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? null,
      language: i18n.language,
      reportedAt: new Date().toISOString(),
    };
    try {
      await createBugReport({ userId: user.id, description: desc, context });
      setNotice(isJa ? '送信しました。ありがとうございます！' : 'Thanks — your report was sent.');
      setText('');
      // Auto-close shortly after success so the floating button is reachable
      // again without an extra tap.
      setTimeout(close, 1200);
    } catch {
      // Offline or RLS error → keep it locally so it's not lost.
      await pushOffline({ description: desc, context, queuedAt: new Date().toISOString() });
      setNotice(
        isJa
          ? 'オフラインのようなので端末に保存しました。次回オンライン時に送信します。'
          : 'Looks offline. Saved on this device and will sync next time you are online.',
      );
      setText('');
      setTimeout(close, 1600);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setOpen(true)}
        accessibilityLabel={isJa ? 'バグを報告' : 'Report a bug'}
      >
        <ThemedText style={styles.fabIcon}>🐞</ThemedText>
      </TouchableOpacity>

      <Modal visible={open} animationType="fade" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ThemedText type="subtitle">{isJa ? 'バグを報告' : 'Report a bug'}</ThemedText>
            <ThemedText style={styles.hint}>
              {isJa
                ? '気づいた問題を書いてください。何をしていてどう動いたか、画面名なども役立ちます。'
                : 'Describe what went wrong. What you were doing, what you saw vs. expected, the screen name — anything helps.'}
            </ThemedText>

            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={isJa ? 'ここに書く...' : 'Type here...'}
              placeholderTextColor="#888"
              multiline
              numberOfLines={6}
              editable={!submitting}
              autoFocus
            />

            {notice ? <ThemedText style={styles.notice}>{notice}</ThemedText> : null}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancel} onPress={close} disabled={submitting}>
                <ThemedText>{isJa ? 'キャンセル' : 'Cancel'}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submit, (!text.trim() || submitting) && styles.disabled]}
                onPress={submit}
                disabled={!text.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.submitText}>{isJa ? '送信' : 'Send'}</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Positioned top-right so it stays out of the way of the in-card thumb
  // zone (rate buttons, back button at top-left, tab bar at the bottom).
  // The top inset accounts for the system status bar / notch on iOS.
  fab: {
    position: 'absolute',
    right: 12,
    top: Platform.OS === 'ios' ? 56 : 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10,126,164,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
  },
  fabIcon: { fontSize: 16 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 18,
    gap: 12,
  },
  hint: { opacity: 0.6, fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 12,
    minHeight: 140,
    color: '#fff',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  notice: { fontSize: 13, color: '#7aa8ff' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  cancel: { paddingVertical: 10, paddingHorizontal: 14 },
  submit: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  disabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontWeight: '700' },
});
