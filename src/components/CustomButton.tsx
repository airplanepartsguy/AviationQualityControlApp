import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import { Ionicons } from '@expo/vector-icons'; // Assuming Ionicons are used for icons

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'text';

interface CustomButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactElement; // Allow passing custom icon components (like <Ionicons.../>)
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>; // Allow passing custom container styles
  textStyle?: StyleProp<TextStyle>; // Allow passing custom text styles
}

const CustomButton: React.FC<CustomButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle
}) => {
  const getVariantStyles = () => {
    let containerStyle: ViewStyle = {};
    let buttonTextStyle: TextStyle = {};
    let iconColor = COLORS.white;

    switch (variant) {
      case 'primary':
        containerStyle = { backgroundColor: COLORS.primary };
        buttonTextStyle = { color: COLORS.white };
        iconColor = COLORS.white;
        break;
      case 'secondary':
        containerStyle = { backgroundColor: COLORS.secondary };
        buttonTextStyle = { color: COLORS.white };
        iconColor = COLORS.white;
        break;
      case 'outline':
        containerStyle = { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.primary };
        buttonTextStyle = { color: COLORS.primary };
        iconColor = COLORS.primary;
        break;
      case 'danger':
        containerStyle = { backgroundColor: COLORS.error };
        buttonTextStyle = { color: COLORS.white };
        iconColor = COLORS.white;
        break;
      case 'text':
        containerStyle = { backgroundColor: 'transparent' };
        buttonTextStyle = { color: COLORS.primary };
        iconColor = COLORS.primary;
        break;
    }

    if (disabled || loading) {
      containerStyle = { backgroundColor: COLORS.disabled, borderColor: COLORS.disabled };
      buttonTextStyle = { color: COLORS.grey600 }; // Use a slightly darker grey for disabled text
      iconColor = COLORS.grey600;
    }

    // Specific case for outline disabled
    if (variant === 'outline' && (disabled || loading)) {
      containerStyle = { backgroundColor: COLORS.grey100, borderWidth: 1, borderColor: COLORS.disabled };
      buttonTextStyle = { color: COLORS.disabled };
      iconColor = COLORS.disabled;
    }

    // Specific case for text disabled
    if (variant === 'text' && (disabled || loading)) {
      containerStyle = { backgroundColor: 'transparent' };
      buttonTextStyle = { color: COLORS.disabled };
      iconColor = COLORS.disabled;
    }

    return { containerStyle, buttonTextStyle, iconColor };
  };

  const { containerStyle, buttonTextStyle, iconColor } = getVariantStyles();

  // Clone the icon to apply the correct color
  const renderIcon = icon ? React.cloneElement(icon, { color: iconColor, size: 20 }) : null;

  return (
    <TouchableOpacity
      style={[styles.baseContainer, containerStyle, style]} // Apply base, variant, and custom styles
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8} // Slightly more opacity change
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <View style={styles.contentContainer}>
          {renderIcon && iconPosition === 'left' && <View style={styles.iconWrapper}>{renderIcon}</View>}
          <Text style={[styles.baseText, buttonTextStyle, textStyle]}>{title}</Text>
          {renderIcon && iconPosition === 'right' && <View style={styles.iconWrapper}>{renderIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    paddingVertical: SPACING.large, // Increase vertical padding slightly
    paddingHorizontal: SPACING.large,
    borderRadius: BORDER_RADIUS.medium,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...SHADOWS.small, // Keep subtle shadow
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseText: {
    fontSize: FONTS.medium,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  iconWrapper: {
    marginHorizontal: SPACING.small,
  },
});

export default CustomButton;
