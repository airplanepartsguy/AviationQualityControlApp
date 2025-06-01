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
        <View style={styles.formContainer}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your username"
            placeholderTextColor={COLORS.grey600}
            value={username}
            onChangeText={setUsername}
            autoCorrect={false}
            keyboardType="default"
            editable={!isLoading}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor={COLORS.grey600}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!isLoading}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.signUpLinkContainer} onPress={() => navigation.navigate('SignUp')} disabled={isLoading}>
            <Text style={styles.signUpLinkText}>
              Don't have an account? <Text style={styles.signUpLinkTextBold}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
          {authError && <Text style={styles.errorText}>{authError.message || 'An unexpected error occurred.'}</Text>}
        </View>
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
    marginBottom: SPACING.xlarge,
  },
  title: {
    fontSize: FONTS.xlarge,
    fontWeight: FONTS.bold,
    color: COLORS.primary,
    marginTop: SPACING.medium,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.card,
    padding: SPACING.large,
    borderRadius: BORDER_RADIUS.medium,
    ...SHADOWS.medium,
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
