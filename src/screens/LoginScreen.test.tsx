// src/screens/LoginScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import LoginScreen from './LoginScreen';
import { AuthProvider } from '../contexts/AuthContext';

// Mock the AuthContext
const mockLogin = jest.fn();
const mockAuthContext = {
  login: mockLogin,
  isLoading: false,
  authError: null,
  user: null,
  logout: jest.fn(),
  isAuthenticated: false,
};

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthContext,
  AuthProvider: ({ children }: any) => children,
}));

// Mock the SVG component
jest.mock('../../assets/QCpics logo.svg', () => 'Logo');

const Stack = createStackNavigator();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <PaperProvider>
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Login" component={() => <React.Fragment>{children}</React.Fragment>} />
      </Stack.Navigator>
    </NavigationContainer>
  </PaperProvider>
);

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with react-native-paper components', () => {
    const { getByText, getByLabelText } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    // Check if title is rendered
    expect(getByText('Quality Control PIC')).toBeTruthy();

    // Check if form fields are rendered with correct labels
    expect(getByLabelText('Username')).toBeTruthy();
    expect(getByLabelText('Password')).toBeTruthy();

    // Check if login button is rendered
    expect(getByText('Login')).toBeTruthy();

    // Check if sign up link is rendered
    expect(getByText(/Don't have an account\?/)).toBeTruthy();
    expect(getByText('Sign Up')).toBeTruthy();
  });

  it('handles input changes correctly', () => {
    const { getByLabelText } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    const usernameInput = getByLabelText('Username');
    const passwordInput = getByLabelText('Password');

    // Test username input
    fireEvent.changeText(usernameInput, 'testuser');
    expect(usernameInput.props.value).toBe('testuser');

    // Test password input
    fireEvent.changeText(passwordInput, 'testpassword');
    expect(passwordInput.props.value).toBe('testpassword');
  });

  it('toggles password visibility when eye icon is pressed', () => {
    const { getByLabelText, getByTestId } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    const passwordInput = getByLabelText('Password');

    // Initially password should be hidden (secureTextEntry should be true)
    expect(passwordInput.props.secureTextEntry).toBe(true);

    // Find and press the eye icon (password visibility toggle)
    // Note: This might need adjustment based on how react-native-paper renders the icon
    const eyeIcon = passwordInput.findByProps({ icon: 'eye' });
    if (eyeIcon) {
      fireEvent.press(eyeIcon);
      expect(passwordInput.props.secureTextEntry).toBe(false);
    }
  });

  it('calls login function when login button is pressed with valid inputs', async () => {
    const { getByLabelText, getByText } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    const usernameInput = getByLabelText('Username');
    const passwordInput = getByLabelText('Password');
    const loginButton = getByText('Login');

    // Fill in the form
    fireEvent.changeText(usernameInput, 'testuser');
    fireEvent.changeText(passwordInput, 'testpassword');

    // Press login button
    fireEvent.press(loginButton);

    // Wait for the login function to be called
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'testpassword');
    });
  });

  it('shows loading state when isLoading is true', () => {
    // Mock loading state
    const loadingAuthContext = {
      ...mockAuthContext,
      isLoading: true,
    };

    jest.mocked(require('../contexts/AuthContext').useAuth).mockReturnValue(loadingAuthContext);

    const { getByText, getByLabelText } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    // Check if inputs are disabled during loading
    const usernameInput = getByLabelText('Username');
    const passwordInput = getByLabelText('Password');
    
    expect(usernameInput.props.disabled).toBe(true);
    expect(passwordInput.props.disabled).toBe(true);

    // Check if button shows loading state
    const loginButton = getByText('Login');
    expect(loginButton.props.disabled).toBe(true);
  });

  it('displays error message when authError is present', () => {
    // Mock error state
    const errorAuthContext = {
      ...mockAuthContext,
      authError: { message: 'Invalid credentials' },
    };

    jest.mocked(require('../contexts/AuthContext').useAuth).mockReturnValue(errorAuthContext);

    const { getByText } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    // Check if error message is displayed
    expect(getByText('Invalid credentials')).toBeTruthy();
  });

  it('shows alert for empty inputs', () => {
    // Mock Alert.alert
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert');

    const { getByText } = render(
      <TestWrapper>
        <LoginScreen />
      </TestWrapper>
    );

    const loginButton = getByText('Login');

    // Press login button without filling inputs
    fireEvent.press(loginButton);

    // Check if alert is shown
    expect(alertSpy).toHaveBeenCalledWith(
      'Input Required',
      'Please enter both username and password.'
    );

    alertSpy.mockRestore();
  });
});
