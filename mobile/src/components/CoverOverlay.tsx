/**
 * CoverOverlay Component - TypeScript Migration
 * 
 * An overlay component for displaying title and metadata on covers.
 */

import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { Text, Title } from 'react-native-paper';

interface CoverOverlayProps {
  title?: string;
  leftText?: string;
  rightText?: string;
  style?: StyleProp<ViewStyle>;
}

export default function CoverOverlay({
  title,
  leftText,
  rightText,
  style,
}: CoverOverlayProps): React.JSX.Element {
  return (
    <View
      style={[
        {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(0,0,0,0.40)',
          padding: 8,
        },
        style,
      ]}
    >
      {title ? (
        <Title
          style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}
          numberOfLines={1}
        >
          {title}
        </Title>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {leftText ? (
          <Text style={{ color: '#eee', fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
            {leftText}
          </Text>
        ) : (
          <View />
        )}
        {rightText ? (
          <Text style={{ color: '#eee', fontSize: 12 }} numberOfLines={1}>
            {rightText}
          </Text>
        ) : (
          <View />
        )}
      </View>
    </View>
  );
}
