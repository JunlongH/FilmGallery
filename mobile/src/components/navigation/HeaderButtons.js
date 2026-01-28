/**
 * Header Buttons
 * 
 * Reusable header button components for navigation.
 * Includes settings button and quick meter button.
 */

import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
import { Icon } from '../ui';

/**
 * Settings button for navigation header
 */
export function SettingsButton() {
  const navigation = useNavigation();
  const theme = useTheme();
  
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Settings')}
      style={styles.headerButton}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Icon name="settings" size={22} color={theme.colors.onSurface} />
    </TouchableOpacity>
  );
}

/**
 * Quick Meter button for navigation header
 * Opens shot log / quick meter functionality
 */
export function QuickMeterButton() {
  const navigation = useNavigation();
  const theme = useTheme();
  
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('ShotLog')}
      style={styles.headerButton}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <View style={[styles.meterIcon, { backgroundColor: theme.colors.primaryContainer }]}>
        <Icon name="gauge" size={18} color={theme.colors.primary} />
      </View>
    </TouchableOpacity>
  );
}

/**
 * Header right component combining multiple buttons
 */
export function HeaderRight({ showQuickMeter = false, showSettings = true }) {
  return (
    <View style={styles.headerRight}>
      {showQuickMeter && <QuickMeterButton />}
      {showSettings && <SettingsButton />}
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    padding: 8,
    marginHorizontal: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  meterIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
