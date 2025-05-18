import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../styles/theme';

// This is a simple logo component that can be used instead of an image file
// It creates a stylized "QC" text logo with a circular background

interface LogoProps {
  size?: number;
  color?: string;
  backgroundColor?: string;
}

const Logo: React.FC<LogoProps> = ({ 
  size = 60, 
  color = COLORS.white, 
  backgroundColor = COLORS.primaryDark 
}) => {
  return (
    <View style={[
      styles.container, 
      { 
        width: size, 
        height: size, 
        borderRadius: size / 2,
        backgroundColor
      }
    ]}>
      <Text style={[
        styles.text, 
        { 
          color,
          fontSize: size * 0.5
        }
      ]}>
        QC
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: FONTS.bold,
    letterSpacing: 1,
  }
});

export default Logo;
