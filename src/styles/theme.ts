// src/styles/theme.ts
// Modern enterprise theme with a professional color palette

export const COLORS = {
  // Primary Palette (Professional Blue)
  primary: '#00529B',        // A strong, corporate blue
  primaryDark: '#003C75',     // Darker shade for pressed states, etc.
  primaryLight: '#4D8AC0',    // Lighter shade for highlights

  // Secondary & Accents
  secondary: '#607D8B',      // Muted Blue-Grey for secondary actions/info
  accent: '#00796B',         // Teal accent for specific highlights (optional)

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  grey50: '#FAFAFA',       // Very light grey (backgrounds)
  grey100: '#F5F5F5',      // Light grey (alt backgrounds)
  grey200: '#EEEEEE',      // Borders, dividers
  grey300: '#E0E0E0',      // Lighter borders
  grey400: '#BDBDBD',      // Medium grey (icons, disabled text)
  grey500: '#9E9E9E',      // Standard grey
  grey600: '#757575',      // Darker grey (secondary text)
  grey700: '#616161',
  grey800: '#424242',      // Dark grey (primary text)
  grey900: '#212121',      // Near black

  // Semantic Colors
  error: '#D32F2F',         // Standard Material Design error red
  warning: '#FFA000',       // Standard Material Design warning amber
  success: '#388E3C',       // Standard Material Design success green
  info: '#1976D2',          // Standard Material Design info blue

  // Functional Colors
  background: '#F5F5F5',   // App background
  text: '#424242',          // Default text color
  textLight: '#757575',   // Lighter text (subtitles, etc.)
  border: '#E0E0E0',       // Default border color
  disabled: '#BDBDBD',     // Disabled state color
  overlay: 'rgba(0, 0, 0, 0.5)', // Screen overlays

  // Transparent colors
  transparent: 'transparent',
  semiTransparent: 'rgba(0, 0, 0, 0.5)',

  // Defect severity colors
  criticalDefect: '#D32F2F',  // Red
  moderateDefect: '#FFA000',  // Amber
  minorDefect: '#388E3C',     // Green

  // Background colors
  card: '#FFFFFF',
};

export const FONTS = {
  // Font sizes
  tiny: 10,
  small: 12,
  regular: 14,
  medium: 16,
  large: 18,
  xlarge: 20,
  xxlarge: 24,
  xxxlarge: 30,
  
  // Font weights
  thin: '100' as const,
  light: '300' as const,
  normal: '400' as const,
  mediumWeight: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extraBold: '800' as const,
};

export const SPACING = {
  tiny: 4,
  small: 8,
  medium: 16,
  large: 24,
  xlarge: 32,
  xxlarge: 48,
  xxxlarge: 64,
};

export const BORDER_RADIUS = {
  tiny: 2,
  small: 4,
  medium: 8,
  large: 12,
  xlarge: 16,
  round: 999,
};

export const SHADOWS = {
  small: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  medium: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  large: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
};

export const ANIMATIONS = {
  duration: {
    short: 200,
    medium: 300,
    long: 500,
  },
};

// Common button styles
export const BUTTON_STYLES = {
  primary: {
    backgroundColor: COLORS.primary,
    textColor: COLORS.white,
  },
  secondary: {
    backgroundColor: COLORS.secondary,
    textColor: COLORS.white,
  },
  accent: {
    backgroundColor: COLORS.accent,
    textColor: COLORS.white,
  },
  outline: {
    backgroundColor: COLORS.transparent,
    borderColor: COLORS.primary,
    borderWidth: 1,
    textColor: COLORS.primary,
  },
  danger: {
    backgroundColor: COLORS.error,
    textColor: COLORS.white,
  },
  ghost: {
    backgroundColor: COLORS.transparent,
    textColor: COLORS.primary,
  },
  disabled: {
    backgroundColor: COLORS.grey300,
    textColor: COLORS.grey600,
  },
};

// Common text input styles
export const INPUT_STYLES = {
  regular: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.grey300,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    fontSize: FONTS.regular,
    color: COLORS.text,
  },
  focused: {
    borderColor: COLORS.primary,
  },
  error: {
    borderColor: COLORS.error,
  },
};

// Common card styles
export const CARD_STYLES = {
  regular: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    ...SHADOWS.small,
  },
  elevated: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    ...SHADOWS.medium,
  },
  flat: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
  },
};

// Common header styles
export const HEADER_STYLES = {
  regular: {
    backgroundColor: COLORS.primary,
    paddingTop: SPACING.large,
    paddingBottom: SPACING.medium,
    paddingHorizontal: SPACING.medium,
  },
  transparent: {
    backgroundColor: COLORS.transparent,
    paddingTop: SPACING.large,
    paddingBottom: SPACING.medium,
    paddingHorizontal: SPACING.medium,
  },
};

// Layout constants
export const LAYOUT = {
  screenPadding: SPACING.medium,
  contentWidth: '100%',
  maxContentWidth: 800,
};

export default {
  COLORS,
  FONTS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  ANIMATIONS,
  BUTTON_STYLES,
  INPUT_STYLES,
  CARD_STYLES,
  HEADER_STYLES,
  LAYOUT,
};
