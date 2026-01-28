/**
 * Card Component
 * 
 * Modern immersive card component with NativeWind styling.
 * Supports edge-to-edge images with gradient overlays.
 * 
 * @example
 * <Card onPress={handlePress}>
 *   <Card.Cover source={{ uri }} />
 *   <Card.Content>
 *     <Card.Title>Roll #042</Card.Title>
 *     <Card.Subtitle>Portra 400 • 2025-01-28</Card.Subtitle>
 *   </Card.Content>
 * </Card>
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../../theme';

/**
 * Card Container
 */
function Card({ 
  children, 
  onPress, 
  style,
  variant = 'elevated', // 'elevated' | 'outlined' | 'filled'
  className = '',
  ...props 
}) {
  const cardStyles = [
    styles.card,
    variant === 'outlined' && styles.cardOutlined,
    variant === 'filled' && styles.cardFilled,
    style,
  ];

  if (onPress) {
    return (
      <Pressable 
        onPress={onPress} 
        style={({ pressed }) => [
          ...cardStyles,
          pressed && styles.cardPressed,
        ]}
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={cardStyles} {...props}>
      {children}
    </View>
  );
}

/**
 * Card Cover - Full-width image with optional gradient overlay
 */
function CardCover({ 
  source, 
  height = 200, 
  showGradient = true,
  gradientColors = ['transparent', 'rgba(0,0,0,0.7)'],
  style,
  ...props 
}) {
  return (
    <View style={[styles.coverContainer, { height }, style]}>
      <Image 
        source={source} 
        style={styles.coverImage}
        contentFit="cover"
        transition={200}
        {...props}
      />
      {showGradient && (
        <LinearGradient
          colors={gradientColors}
          style={styles.coverGradient}
        />
      )}
    </View>
  );
}

/**
 * Card Content - Overlay content container
 */
function CardContent({ 
  children, 
  position = 'bottom', // 'bottom' | 'top' | 'center'
  style,
  ...props 
}) {
  const positionStyles = {
    bottom: styles.contentBottom,
    top: styles.contentTop,
    center: styles.contentCenter,
  };

  return (
    <View style={[styles.content, positionStyles[position], style]} {...props}>
      {children}
    </View>
  );
}

/**
 * Card Title
 */
function CardTitle({ children, style, ...props }) {
  return (
    <Text style={[styles.title, style]} numberOfLines={1} {...props}>
      {children}
    </Text>
  );
}

/**
 * Card Subtitle
 */
function CardSubtitle({ children, style, ...props }) {
  return (
    <Text style={[styles.subtitle, style]} numberOfLines={1} {...props}>
      {children}
    </Text>
  );
}

/**
 * Card Body - Standard padded content area (not overlay)
 */
function CardBody({ children, style, ...props }) {
  return (
    <View style={[styles.body, style]} {...props}>
      {children}
    </View>
  );
}

// Attach sub-components
Card.Cover = CardCover;
Card.Content = CardContent;
Card.Title = CardTitle;
Card.Subtitle = CardSubtitle;
Card.Body = CardBody;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: '#fff',
    overflow: 'hidden',
    marginBottom: spacing.lg,
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    // Elevation for Android
    elevation: 4,
  },
  cardOutlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.outline,
    elevation: 0,
    shadowOpacity: 0,
  },
  cardFilled: {
    backgroundColor: colors.surfaceVariant,
    elevation: 0,
    shadowOpacity: 0,
  },
  cardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },
  coverContainer: {
    position: 'relative',
    width: '100%',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    padding: spacing.lg,
  },
  contentBottom: {
    bottom: 0,
  },
  contentTop: {
    top: 0,
  },
  contentCenter: {
    top: '50%',
    transform: [{ translateY: -50 }],
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
  },
  body: {
    padding: spacing.lg,
  },
});

export default Card;
