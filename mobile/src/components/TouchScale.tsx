/**
 * TouchScale Component - TypeScript Migration
 * 
 * A simple pressable component that scales down on press.
 */

import React, { useRef, ReactNode } from 'react';
import { Animated, Pressable, ViewStyle, StyleProp, PressableProps } from 'react-native';

export interface TouchScaleProps extends Omit<PressableProps, 'onPressIn' | 'onPressOut'> {
  children: ReactNode;
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

const TouchScale: React.FC<TouchScaleProps> = ({
  children,
  scaleTo = 0.97,
  style,
  onPress,
  ...rest
}) => {
  const anim = useRef(new Animated.Value(1)).current;

  const onPressIn = (): void => {
    Animated.spring(anim, { toValue: scaleTo, useNativeDriver: true, speed: 20 }).start();
  };
  const onPressOut = (): void => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} {...rest}>
      <Animated.View style={[{ transform: [{ scale: anim }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

export default TouchScale;
