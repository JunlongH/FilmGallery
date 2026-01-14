/**
 * SkeletonBox Component - TypeScript Migration
 * 
 * A simple skeleton loading placeholder.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, DimensionValue } from 'react-native';

interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}

export default function SkeletonBox({
  width = '100%',
  height = 16,
  style,
}: SkeletonBoxProps): React.JSX.Element {
  return <View style={[styles.base, { width, height }, style]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#e6e6e6',
    borderRadius: 6,
  },
});
