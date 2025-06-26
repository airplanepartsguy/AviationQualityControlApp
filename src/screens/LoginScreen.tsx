// src/screens/LoginScreen.tsx
import React, { useState } from 'react';
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
} from 'react-native';
import { TextInput as PaperTextInput, Button as PaperButton, Card as PaperCard } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import CustomInput from '../components/CustomInput';
import { useAuth } from '../contexts/AuthContext';
import { AuthStackParamList } from '../../App'; // Import the AuthStackParamList
import { COLORS, SPACING, FONTS, BORDER_RADIUS, SHADOWS } from '../styles/theme';
// import { SvgUri } from 'react-native-svg'; // No longer needed for local SVG
import Logo from '../../assets/QCpics logo.svg'; // Import SVG as a component

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

const LoginScreen: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const { login, isLoading, authError } = useAuth(); // Added authError for consistency, though not used in this snippet directly for navigation
  const navigation = useNavigation<LoginScreenNavigationProp>();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Input Required', 'Please enter both username and password.');
      return;
    }
    await login(username, password);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.logoContainer}>
          <Logo width="80%" height={150} />
          <Text style={styles.title}>Quality Control PIC</Text>
        </View>
        <PaperCard style={styles.formCard}>
          <PaperCard.Content>
            <PaperTextInput
              mode="outlined"
              label="Username"
              placeholder="Enter your username"
              value={username}
              onChangeText={setUsername}
              autoCorrect={false}
              keyboardType="default"
              disabled={isLoading}
              left={<PaperTextInput.Icon icon="account-outline" />}
              style={styles.paperInput}
            />
            <PaperTextInput
              mode="outlined"
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!isPasswordVisible}
              disabled={isLoading}
              left={<PaperTextInput.Icon icon="lock-outline" />}
              right={<PaperTextInput.Icon
                icon={isPasswordVisible ? "eye-off" : "eye"}
                onPress={() => setIsPasswordVisible(!isPasswordVisible)}
              />}
              style={styles.paperInput}
            />
            <PaperButton
              mode="contained"
              onPress={handleLogin}
              disabled={isLoading}
              loading={isLoading}
              style={styles.paperButton}
              labelStyle={styles.paperButtonLabel}
            >
              Login
            </PaperButton>
            <TouchableOpacity style={styles.signUpLinkContainer} onPress={() => navigation.navigate('SignUp')} disabled={isLoading}>
              <Text style={styles.signUpLinkText}>
                Don't have an account? <Text style={styles.signUpLinkTextBold}>Sign Up</Text>
              </Text>
            </TouchableOpacity>
            {authError && <Text style={styles.errorText}>{authError.message || 'An unexpected error occurred.'}</Text>}
          </PaperCard.Content>
        </PaperCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.large,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xlarge * 1.5, // Increased spacing between logo and form
  },
  title: {
    fontSize: 28, // Increased from FONTS.xlarge
    fontWeight: '800', // Increased from FONTS.bold
    color: COLORS.primary,
    marginTop: SPACING.medium,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.card,
    padding: SPACING.large,
    borderRadius: BORDER_RADIUS.medium,
    ...SHADOWS.medium,
  },
  formCard: {
    width: '100%',
    maxWidth: 400,
    elevation: 8,
    borderRadius: BORDER_RADIUS.medium,
  },
  label: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.small,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    fontSize: FONTS.medium,
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  paperInput: {
    marginBottom: SPACING.medium,
  },
  paperButton: {
    marginTop: SPACING.small,
  },
  paperButtonLabel: {
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.medium,
    borderRadius: BORDER_RADIUS.small,
    alignItems: 'center',
    marginTop: SPACING.small,
    ...SHADOWS.small,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONTS.large,
    fontWeight: FONTS.bold,
  },
  signUpLinkContainer: {
    marginTop: SPACING.medium,
    alignItems: 'center',
  },
  signUpLinkText: {
    fontSize: FONTS.medium,
    color: COLORS.textLight,
  },
  signUpLinkTextBold: {
    fontWeight: FONTS.bold,
    color: COLORS.primary, // Or your preferred link color
  },
  errorText: {
    marginTop: SPACING.medium,
    color: COLORS.error, // Use existing COLORS.error from theme
    textAlign: 'center',
    fontSize: FONTS.small,
  },
});

export default LoginScreen;
