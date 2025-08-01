import React, { useRef } from 'react';
import { Animated, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, BUTTON_STYLES, SHADOWS, LAYOUT, ANIMATIONS } from '../styles/theme';

interface FloatingActionButtonProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  backgroundColor?: string;
  style?: any;
  disabled?: boolean;
}

const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onPress,
  icon = 'camera',
  size = 56,
  color = COLORS.white,
  backgroundColor = COLORS.primary,
  style,
  disabled = false
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      ...ANIMATIONS.springFast,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...ANIMATIONS.springFast,
    }).start();
  };

  const handlePress = () => {
    if (!disabled) {
      onPress();
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: disabled ? COLORS.grey400 : backgroundColor,
        },
        style
      ]}
    >
      <TouchableOpacity
        style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={disabled}
      >
        <Ionicons 
          name={icon} 
          size={size * 0.4} 
          color={disabled ? COLORS.grey600 : color} 
        />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    zIndex: LAYOUT.zIndex.fab,
    ...SHADOWS.fab,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Quick access component for common use case
export const QuickCaptureButton: React.FC<{ onPress: () => void; disabled?: boolean }> = ({ 
  onPress, 
  disabled = false 
}) => (
  <FloatingActionButton
    onPress={onPress}
    icon="camera"
    disabled={disabled}
  />
);

export default FloatingActionButton; 