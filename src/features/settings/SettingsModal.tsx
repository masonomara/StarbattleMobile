import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../shared/ui/Text';
import X from 'lucide-react-native/dist/cjs/icons/x';
import { Linking } from 'react-native';
import { useSettingsStore } from '../../shared/stores/settingsStore';
import { useScrollBorder } from '../../shared/hooks/useScrollBorder';
import { useTheme } from '../../shared/theme/useTheme';
import { AccountSection } from './AccountSection';
import { GameplaySection } from './GameplaySection';
import { AppearanceSection } from './AppearanceSection';
import { AccountActions } from './AccountActions';
import {
  PRIVACY_POLICY_URL,
  TERMS_URL,
  CREDITS_URL,
} from '../../shared/lib/config';
import type { Theme } from '../../types';

// Visibility is driven by Zustand so any screen can open this modal without prop drilling.
export function SettingsModal() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = createStyles(theme);
  const settingsModalVisible = useSettingsStore(s => s.settingsModalVisible);
  const closeSettings = useSettingsStore(s => s.closeSettings);
  // Shows the header's bottom hairline once the settings list scrolls.
  const { scrolled, onScroll } = useScrollBorder();

  return (
    <Modal
      visible={settingsModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeSettings}
    >
      <View style={styles.container}>
        <View style={[styles.modalHeader, scrolled && styles.headerBorder]}>
          <View style={styles.modalHeaderSide} />
          <View style={styles.modalHeaderCenter}>
            <Text role="title3" style={styles.title}>
              {t('settings.title')}
            </Text>
          </View>
          <View style={styles.modalHeaderSide}>
            <Pressable onPress={closeSettings} hitSlop={8}>
              <X size={24} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <AccountSection />
          <GameplaySection />
          <AppearanceSection />
          <AccountActions />

          <View style={styles.legalSection}>
            <View style={styles.legalLinks}>
              <Pressable
                onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
                hitSlop={8}
              >
                <Text role="caption1" style={styles.legalLinkText}>
                  {t('settings.terms')}
                </Text>
              </Pressable>
              <Text role="footnote" style={styles.legalSep}>
                ·
              </Text>
              <Pressable
                onPress={() =>
                  Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})
                }
                hitSlop={8}
              >
                <Text role="caption1" style={styles.legalLinkText}>
                  {t('settings.privacy')}
                </Text>
              </Pressable>
              <Text role="caption1" style={styles.legalSep}>
                ·
              </Text>
              <Pressable
                onPress={() => Linking.openURL(CREDITS_URL).catch(() => {})}
                hitSlop={8}
              >
                <Text role="caption1" style={styles.legalLinkText}>
                  {t('settings.credits')}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    modalHeader: {
      height: 70,
      paddingTop: 24,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    // Bottom hairline shown once the settings list scrolls off the top.
    headerBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalHeaderSide: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalHeaderCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: theme.text,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: theme.spacingXl,
    },
    legalSection: { marginTop: 40 },
    legalLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: theme.spacingLg,
      gap: 6,
    },
    legalLinkText: { color: theme.textSecondary, fontWeight: '500' },
    legalSep: { color: theme.textSecondary },
  });
