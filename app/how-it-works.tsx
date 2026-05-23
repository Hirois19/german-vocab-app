/**
 * In-app guide screen. Explains the SEKI 7×7 method and how to use the app.
 * Content is bilingual (see `lib/content/howItWorks.ts`) and follows the
 * active i18next language.
 */

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getGuideContent } from '@/lib/content/howItWorks';
import { setLanguage } from '@/lib/i18n';

export default function HowItWorksScreen() {
  const { i18n } = useTranslation();
  const guide = getGuideContent(i18n.language);
  const isJa = i18n.language === 'ja';

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">{guide.title}</ThemedText>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => void setLanguage(isJa ? 'en' : 'ja')}
            style={styles.langButton}
          >
            <ThemedText style={styles.langButtonText}>{isJa ? 'English' : '日本語'}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <ThemedText style={styles.closeText}>{isJa ? '閉じる' : 'Close'}</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText style={styles.intro}>{guide.intro}</ThemedText>

        {guide.sections.map((section) => (
          <View
            key={section.heading}
            style={[styles.section, section.highlight && styles.highlightSection]}
          >
            <ThemedText type="subtitle" style={styles.heading}>
              {section.heading}
            </ThemedText>
            {section.body ? <ThemedText style={styles.body}>{section.body}</ThemedText> : null}
            {section.bullets?.map((bullet, i) => (
              <View key={i} style={styles.bulletRow}>
                <ThemedText style={styles.bulletDot}>•</ThemedText>
                <ThemedText style={styles.bulletText}>{bullet}</ThemedText>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  langButtonText: { color: '#0a7ea4', fontWeight: '700', fontSize: 13 },
  closeButton: { paddingHorizontal: 12, paddingVertical: 8 },
  closeText: { color: '#0a7ea4', fontWeight: '600' },
  scrollContent: { gap: 20, paddingBottom: 40 },
  intro: { fontSize: 15, lineHeight: 22, opacity: 0.85 },
  section: { gap: 8 },
  highlightSection: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0a7ea4',
    backgroundColor: 'rgba(10,126,164,0.08)',
  },
  heading: { marginBottom: 2 },
  body: { fontSize: 14, lineHeight: 21, opacity: 0.85 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  bulletDot: { fontSize: 14, lineHeight: 21, opacity: 0.6 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 21, opacity: 0.85 },
});
