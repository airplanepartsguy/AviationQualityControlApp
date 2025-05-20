import React, { useRef, useEffect, memo } from 'react';
import { View, TextInput, StyleSheet, Keyboard, Platform } from 'react-native';
import { COLORS } from '../styles/theme';

interface TextInputOverlayProps {
  visible: boolean;
  position: { x: number, y: number };
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: (text: string) => void;
  onDismiss: () => void;
  color: string;
}

/**
 * A component for handling text input at a specific position on the screen
 * Optimized to prevent unnecessary re-renders
 */
const TextInputOverlay = memo(({
  visible,
  position,
  value,
  onChangeText,
  onSubmit,
  onDismiss,
  color
}: TextInputOverlayProps) => {
  const inputRef = useRef<TextInput>(null);
  
  // Focus the text input when it becomes visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [visible]);
  
  // Handle keyboard events
  useEffect(() => {
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        if (visible) {
          if (value.trim()) {
            onSubmit(value);
          } else {
            onDismiss();
          }
        }
      }
    );
    
    return () => {
      keyboardDidHideListener.remove();
    };
  }, [visible, value, onSubmit, onDismiss]);
  
  if (!visible) return null;
  
  return (
    <View 
      style={[
        styles.container, 
        { 
          left: position.x - 100, // Center the input around the tap position
          top: position.y - 20 
        }
      ]}
    >
      <TextInput
        ref={inputRef}
        style={[styles.input, { color }]}
        value={value}
        onChangeText={onChangeText}
        placeholder="Enter text..."
        placeholderTextColor={COLORS.placeholder}
        multiline={false}
        maxLength={50}
        returnKeyType="done"
        blurOnSubmit={true}
        onSubmitEditing={() => {
          if (value.trim()) {
            onSubmit(value);
          } else {
            onDismiss();
          }
        }}
        autoCapitalize="sentences"
        autoCorrect={true}
        selectionColor={color}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 200,
    zIndex: 1000,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  input: {
    padding: 10,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: 'bold',
  },
});

export default TextInputOverlay;
