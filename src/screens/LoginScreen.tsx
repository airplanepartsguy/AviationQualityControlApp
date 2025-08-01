// src/screens/LoginScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { AuthStackParamList } from '../../App';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import Logo from '../../assets/QCpics logo.svg';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  
  const { login, isLoading, authError } = useAuth();
  const navigation = useNavigation<LoginScreenNavigationProp>();

  // Animation values
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    // Entrance animations
    Animated.sequence([
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Input Required', 'Please enter both email and password.');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    await login(email, password);
  };

  const renderInputField = (
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    icon: string,
    secureTextEntry: boolean = false,
    focused: boolean,
    onFocus: () => void,
    onBlur: () => void
  ) => (
    <View style={[styles.inputContainer, focused && styles.inputContainerFocused]}>
      <View style={styles.inputIcon}>
        <Ionicons name={icon as any} size={20} color={focused ? COLORS.primary : COLORS.grey500} />
      </View>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={COLORS.grey500}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry && !showPassword}
        keyboardType={secureTextEntry ? 'default' : 'email-address'}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!isLoading}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {secureTextEntry && (
        <TouchableOpacity
          style={styles.eyeIcon}
          onPress={() => setShowPassword(!showPassword)}
          disabled={isLoading}
        >
          <Ionicons
            name={showPassword ? 'eye-off' : 'eye'}
            size={20}
            color={COLORS.grey500}
          />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      {/* Background */}
      <View style={styles.backgroundGradient} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo Section */}
          <Animated.View
            style={[
              styles.logoSection,
              {
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <View style={styles.logoContainer}>
              <Logo width={120} height={120} />
            </View>
            <Text style={styles.appTitle}>QCPics</Text>
            <Text style={styles.appSubtitle}>Aviation Quality Control</Text>
          </Animated.View>

          {/* Login Form */}
          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: formOpacity,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>Welcome Back</Text>
              <Text style={styles.formSubtitle}>Sign in to continue your quality control work</Text>
            </View>

            <View style={styles.formBody}>
              {/* Email Input */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Email</Text>
                {renderInputField(
                  email,
                  setEmail,
                  'Enter your email address',
                  'mail',
                  false,
                  emailFocused,
                  () => setEmailFocused(true),
                  () => setEmailFocused(false)
                )}
              </View>

              {/* Password Input */}
              <View style={styles.fieldContainer}>
                <Text style={styles.fieldLabel}>Password</Text>
                {renderInputField(
                  password,
                  setPassword,
                  'Enter your password',
                  'lock-closed',
                  true,
                  passwordFocused,
                  () => setPasswordFocused(true),
                  () => setPasswordFocused(false)
                )}
              </View>

              {/* Error Message */}
              {authError && (
                <Animated.View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                  <Text style={styles.errorText}>
                    {authError.message || 'Login failed. Please try again.'}
                  </Text>
                </Animated.View>
              )}

              {/* Login Button */}
              <TouchableOpacity
                style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                <View style={styles.loginButtonGradient}>
                  {isLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={COLORS.white} />
                      <Text style={styles.loadingText}>Signing In...</Text>
                    </View>
                  ) : (
                    <Text style={styles.loginButtonText}>Sign In</Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Additional Options */}
              <View style={styles.additionalOptions}>
                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={() => Alert.alert('Forgot Password', 'Password reset feature coming soon!')}
                  disabled={isLoading}
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>

          {/* Sign Up Link */}
          <View style={styles.signUpSection}>
            <Text style={styles.signUpPrompt}>Don't have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('SignUp')}
              disabled={isLoading}
              style={styles.signUpButton}
            >
              <Text style={styles.signUpButtonText}>Create Account</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Secure • Reliable • Professional</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: screenHeight * 0.4,
    backgroundColor: COLORS.primary,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContainer: {
    minHeight: screenHeight,
    paddingHorizontal: SPACING.lg,
  },

  // Logo Section
  logoSection: {
    alignItems: 'center',
    paddingTop: screenHeight * 0.08,
    paddingBottom: SPACING.xl,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.medium,
  },
  appTitle: {
    fontSize: FONTS.xxxLarge,
    fontWeight: FONTS.black,
    color: COLORS.white,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: FONTS.regular,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },

  // Form Container
  formContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.large,
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  formTitle: {
    fontSize: FONTS.xxLarge,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  formSubtitle: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  formBody: {
    gap: SPACING.lg,
  },

  // Input Fields
  fieldContainer: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.mediumWeight,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  inputContainerFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    ...SHADOWS.small,
  },
  inputIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: FONTS.regular,
    color: COLORS.text,
    paddingVertical: SPACING.xs,
  },
  eyeIcon: {
    padding: SPACING.xs,
    marginLeft: SPACING.sm,
  },

  // Error Message
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  errorText: {
    fontSize: FONTS.regular,
    color: COLORS.error,
    marginLeft: SPACING.sm,
    flex: 1,
  },

  // Login Button
  loginButton: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    ...SHADOWS.medium,
  },
  loginButtonDisabled: {
    ...SHADOWS.small,
  },
  loginButtonGradient: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: COLORS.primary,
  },
  loginButtonText: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
    color: COLORS.white,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FONTS.regular,
    color: COLORS.white,
    marginLeft: SPACING.sm,
    fontWeight: FONTS.mediumWeight,
  },

  // Additional Options
  additionalOptions: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  forgotPasswordButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  forgotPasswordText: {
    fontSize: FONTS.regular,
    color: COLORS.primary,
    fontWeight: FONTS.mediumWeight,
  },

  // Sign Up Section
  signUpSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  signUpPrompt: {
    fontSize: FONTS.regular,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: SPACING.sm,
  },
  signUpButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  signUpButtonText: {
    fontSize: FONTS.regular,
    color: COLORS.white,
    fontWeight: FONTS.bold,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingBottom: SPACING.xl,
  },
  footerText: {
    fontSize: FONTS.small,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
});

export default LoginScreen;
