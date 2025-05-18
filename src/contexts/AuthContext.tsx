import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

// Define keys for secure storage
const TOKEN_KEY = 'userToken';
const USER_ID_KEY = 'userId';

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading

  useEffect(() => {
    // Check initial auth status on app load
    const bootstrapAsync = async () => {
      try {
        // Check for both token and userId
        const userToken = await SecureStore.getItemAsync(TOKEN_KEY);
        const storedUserId = await SecureStore.getItemAsync(USER_ID_KEY);

        if (userToken && storedUserId) {
          // In a real app, validate the token here
          setIsAuthenticated(true);
          setUserId(storedUserId);
        } else {
          // If either is missing, ensure logged out state
          setIsAuthenticated(false);
          setUserId(null);
        }
      } catch (e) {
        console.error('[AuthContext] Failed to load token:', e);
        // Handle error, maybe clear token
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    // Simple static validation for now
    if (username.toLowerCase() === 'test' && password === 'password') {
      try {
        // Store a dummy token for session persistence
        // Also store the username as userId
        const loggedInUserId = username.toLowerCase(); // Use username as userId
        await SecureStore.setItemAsync(TOKEN_KEY, 'dummy-auth-token');
        await SecureStore.setItemAsync(USER_ID_KEY, loggedInUserId);
        setIsAuthenticated(true);
        setUserId(loggedInUserId); // Set userId state
        setIsLoading(false);
        return true;
      } catch (e) {
        console.error('[AuthContext] Failed to save token:', e);
        Alert.alert('Login Error', 'Could not save login session.');
        setIsLoading(false);
        return false;
      }
    } else {
      Alert.alert('Login Failed', 'Invalid username or password.');
      setIsLoading(false);
      return false;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      // Clear both token and userId
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_ID_KEY);
    } catch (e) {
      console.error('[AuthContext] Failed to delete token:', e);
      // Still log out the user on the client side
    } finally {
      setIsAuthenticated(false);
      setUserId(null); // Clear userId state
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ isLoading, isAuthenticated, userId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
