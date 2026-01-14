/**
 * BadgeOverlay Component - TypeScript Migration
 * 
 * A badge overlay component for displaying icons or text badges on elements.
 */

import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface BadgeOverlayProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  icon?: IconName;
  text?: string;
  color?: string;
  textColor?: string;
}

export default function BadgeOverlay({
  children,
  style,
  icon,
  text,
  color = 'rgba(0,0,0,0.45)',
  textColor = '#fff',
}: BadgeOverlayProps): React.JSX.Element {
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.badge, { backgroundColor: color }]}>
        {icon ? (
          <MaterialCommunityIcons name={icon} size={14} color={textColor} />
        ) : (
          <Text style={[styles.text, { color: textColor }]}>{text}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 12,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 12, fontWeight: '600' },
});
