import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, ActivityIndicator, useTheme } from 'react-native-paper'; // Assuming react-native-paper for UI consistency
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../App'; // Adjust path if App.tsx is elsewhere or AuthStackParamList is defined differently

type SignUpScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

const SignUpScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  
  const { signUp, isLoading, authError } = useAuth();
  const navigation = useNavigation<SignUpScreenNavigationProp>();
  const theme = useTheme(); // For react-native-paper theming

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (!email || !password) {
      Alert.alert('Error', 'Email and password are required.');
      return;
    }
    // The signUp function in AuthContext will handle navigation on success
    await signUp(email, password);
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={[styles.title, { color: theme.colors.primary }]}>Create Account</Text>
        <Text style={styles.subtitle}>Join Quality Control PIC</Text>

        {authError && <Text style={styles.errorText}>{authError.message || 'An unexpected error occurred.'}</Text>}

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          mode="outlined"
          left={<TextInput.Icon icon="email" />}
        />
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!isPasswordVisible}
          style={styles.input}
          autoCapitalize="none"
          mode="outlined"
          left={<TextInput.Icon icon="lock" />}
          right={<TextInput.Icon icon={isPasswordVisible ? "eye-off" : "eye"} onPress={() => setIsPasswordVisible(!isPasswordVisible)} />}
        />
        <TextInput
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!isConfirmPasswordVisible}
          style={styles.input}
          autoCapitalize="none"
          mode="outlined"
          left={<TextInput.Icon icon="lock-check" />}
          right={<TextInput.Icon icon={isConfirmPasswordVisible ? "eye-off" : "eye"} onPress={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)} />}
        />

        {isLoading ? (
          <ActivityIndicator animating={true} color={theme.colors.primary} size="large" style={styles.button} />
        ) : (
          <Button 
            mode="contained" 
            onPress={handleSignUp} 
            style={styles.button}
            labelStyle={styles.buttonLabel}
            disabled={isLoading}
          >
            Sign Up
          </Button>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLinkContainer}>
          <Text style={[styles.loginLink, { color: theme.colors.primary }]}>Already have an account? Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5', // Light grey background for a professional feel
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    marginBottom: 15,
    backgroundColor: '#fff', // White background for inputs
  },
  button: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8, // Rounded corners for button
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  loginLinkContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginLink: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 14,
  },
});

export default SignUpScreen;
