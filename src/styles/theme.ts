// Aviation Quality Control App - Enhanced Theme
export const COLORS = {
  // Primary Brand Colors
  primary: '#1A73E8', // Google Blue - professional and trustworthy
  primaryLight: '#4285F4',
  primaryDark: '#1557B0',
  
  // Secondary Colors
  secondary: '#34A853', // Green for success states
  secondaryLight: '#5BB974',
  secondaryDark: '#2D8B43',
  
  // Status Colors
  success: '#34A853',
  warning: '#F9AB00',
  error: '#EA4335',
  info: '#4285F4',
  
  // Neutral Colors
  white: '#FFFFFF',
  black: '#000000',
  
  // Gray Scale (better contrast ratios)
  grey50: '#F8F9FA',
  grey100: '#F1F3F4',
  grey200: '#E8EAED',
  grey300: '#DADCE0',
  grey400: '#BDC1C6',
  grey500: '#9AA0A6',
  grey600: '#80868B',
  grey700: '#5F6368',
  grey800: '#3C4043',
  grey900: '#202124',
  
  // Background Colors
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',
  backgroundTertiary: '#F1F3F4',
  
  // Surface Colors
  surface: '#FFFFFF',
  surfaceVariant: '#F1F3F4',
  
  // Text Colors
  text: '#202124',
  textSecondary: '#5F6368',
  textTertiary: '#80868B',
  textInverse: '#FFFFFF',
  
  // Component-specific Colors
  card: '#FFFFFF',
  border: '#E8EAED',
  divider: '#DADCE0',
  accent: '#FF6D01', // Orange for action items
  
  // Upload Status Colors
  uploadPending: '#F9AB00',
  uploadSuccess: '#34A853',
  uploadError: '#EA4335',
  uploadInProgress: '#1A73E8',
  
  // Photo Capture Colors
  captureButton: '#1A73E8',
  defectButton: '#EA4335',
  defectHighlight: 'rgba(234, 67, 53, 0.2)',
  
  // Batch Status Colors
  batchComplete: '#34A853',
  batchInProgress: '#F9AB00',
  batchError: '#EA4335',
  batchPending: '#80868B',
};

export const FONTS = {
  // Font Sizes
  tiny: 10,
  small: 12,
  regular: 14,
  medium: 16,
  large: 18,
  xLarge: 20,
  xxLarge: 24,
  xxxLarge: 28,
  
  // Font Weights
  light: '300' as const,
  normal: '400' as const,
  mediumWeight: '500' as const,
  bold: '600' as const,
  black: '700' as const,
  
  // Line Heights (based on font sizes)
  lineHeightTiny: 14,
  lineHeightSmall: 16,
  lineHeightRegular: 20,
  lineHeightMedium: 24,
  lineHeightLarge: 28,
  lineHeightXLarge: 32,
};

export const SPACING = {
  // Base spacing unit (4px)
  unit: 4,
  
  // Common spacing values
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  
  // Screen margins and padding
  screenHorizontal: 16,
  screenVertical: 24,
  
  // Component-specific spacing
  cardPadding: 16,
  buttonPadding: 12,
  iconSpacing: 8,
  listItemSpacing: 12,
};

export const BORDER_RADIUS = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  round: 50,
  
  // Component-specific radii
  button: 8,
  card: 12,
  input: 8,
  badge: 16,
  avatar: 50,
  fab: 28,
};

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  small: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  large: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  fab: {
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
  },
};

export const CARD_STYLES = {
  default: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.cardPadding,
    ...SHADOWS.small,
  },
  elevated: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.cardPadding,
    ...SHADOWS.medium,
  },
  interactive: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.cardPadding,
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
};

export const BUTTON_STYLES = {
  primary: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.button,
    paddingVertical: SPACING.buttonPadding,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.small,
  },
  secondary: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.button,
    paddingVertical: SPACING.buttonPadding,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  danger: {
    backgroundColor: COLORS.error,
    borderRadius: BORDER_RADIUS.button,
    paddingVertical: SPACING.buttonPadding,
    paddingHorizontal: SPACING.md,
    ...SHADOWS.small,
  },
  fab: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.fab,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.fab,
  },
};

export const ANIMATIONS = {
  // Duration constants
  fast: 150,
  normal: 250,
  slow: 350,
  
  // Easing curves
  easeOut: 'ease-out',
  easeIn: 'ease-in',
  easeInOut: 'ease-in-out',
  
  // Spring configurations
  spring: {
    damping: 15,
    stiffness: 150,
  },
  springFast: {
    damping: 20,
    stiffness: 200,
  },
};

export const LAYOUT = {
  // Screen dimensions helpers
  isSmallScreen: false, // Will be set at runtime
  headerHeight: 56,
  tabBarHeight: 60,
  fabSize: 56,
  
  // Grid system
  containerMaxWidth: 1200,
  gridGutter: SPACING.md,
  
  // Z-index layers
  zIndex: {
    modal: 1000,
    overlay: 900,
    fab: 800,
    header: 700,
    card: 100,
    base: 0,
  },
};

// Accessibility helpers
export const ACCESSIBILITY = {
  minTouchTarget: 44,
  focusColor: COLORS.primary,
};

// Component-specific theme objects for consistency
export const STATUS_THEME = {
  success: {
    backgroundColor: COLORS.success,
    color: COLORS.white,
    icon: 'checkmark-circle',
  },
  warning: {
    backgroundColor: COLORS.warning,
    color: COLORS.white,
    icon: 'warning',
  },
  error: {
    backgroundColor: COLORS.error,
    color: COLORS.white,
    icon: 'alert-circle',
  },
  pending: {
    backgroundColor: COLORS.grey400,
    color: COLORS.white,
    icon: 'time',
  },
  uploading: {
    backgroundColor: COLORS.primary,
    color: COLORS.white,
    icon: 'cloud-upload',
  },
};

export const PHOTO_CAPTURE_THEME = {
  captureButton: {
    backgroundColor: COLORS.captureButton,
    size: 72,
    borderRadius: 36,
    ...SHADOWS.medium,
  },
  defectButton: {
    backgroundColor: COLORS.defectButton,
    size: 56,
    borderRadius: 28,
    ...SHADOWS.small,
  },
  scanOverlay: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(26, 115, 232, 0.1)',
  },
};
