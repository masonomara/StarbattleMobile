import React, { useState } from 'react';
import { Modal, View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import X from 'lucide-react-native/dist/cjs/icons/x';
import { Linking } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { useTheme } from '../hooks/useTheme';
import { AccountSection } from './settings/AccountSection';
import { SubscriptionSection } from './settings/SubscriptionSection';
import { GameplaySection } from './settings/GameplaySection';
import { AppearanceSection } from './settings/AppearanceSection';
import { PRIVACY_POLICY_URL, TERMS_URL, CREDITS_URL } from '../config';
import type { Theme } from '../types';

// Visibility is driven by Zustand so any screen can open this modal without prop drilling.
export function SettingsModal() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const settingsModalVisible = useSettingsStore(s => s.settingsModalVisible);
  const closeSettings = useSettingsStore(s => s.closeSettings);

  const [scrolled, setScrolled] = useState(false);

  return (
    <Modal
      visible={settingsModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeSettings}
    >
      <View style={styles.container}>
        <View
          style={[styles.modalHeader, scrolled && styles.modalHeaderBorder]}
        >
          <View style={styles.modalHeaderSide} />
          <View style={styles.modalHeaderCenter}>
            <Text style={styles.title}>Settings</Text>
          </View>
          <View style={styles.modalHeaderSide}>
            <Pressable onPress={closeSettings} hitSlop={8}>
              <X size={24} color={theme.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 0)}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <AccountSection />
          <SubscriptionSection />
          <GameplaySection />
          <AppearanceSection />

          <View style={styles.legalSection}>
            <View style={styles.legalLinks}>
              <Pressable
                onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
                hitSlop={8}
              >
                <Text style={styles.legalLinkText}>Terms of Use</Text>
              </Pressable>
              <Text style={styles.legalSep}>·</Text>
              <Pressable
                onPress={() =>
                  Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})
                }
                hitSlop={8}
              >
                <Text style={styles.legalLinkText}>Privacy Policy</Text>
              </Pressable>
              <Text style={styles.legalSep}>·</Text>
              <Pressable
                onPress={() => Linking.openURL(CREDITS_URL).catch(() => {})}
                hitSlop={8}
              >
                <Text style={styles.legalLinkText}>Credits</Text>
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
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'transparent',
    },
    modalHeaderBorder: { borderBottomColor: theme.border },
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
      fontSize: 25,
      fontFamily: 'Bricolage Grotesque',
      fontWeight: '900',
      letterSpacing: -0.25,
      lineHeight: 28,
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
    legalLinkText: { fontSize: 13, color: theme.textSecondary },
    legalSep: { fontSize: theme.fontSizeSubhead, color: theme.textSecondary },
  });
