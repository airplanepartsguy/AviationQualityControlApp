import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient'; // Adjusted path
import { Session, User, AuthChangeEvent } from '@supabase/supabase-js';

import { AuthError } from '@supabase/supabase-js'; // Import AuthError for better typing

interface AuthContextType {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  session: Session | null;
  authError: AuthError | null; // Changed from any to AuthError
  login: (email: string, password: string) => Promise<{ success: boolean; error?: any }>;
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: any; requiresConfirmation?: boolean }>;
  logout: () => Promise<{ success: boolean; error?: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<AuthError | null>(null);

  useEffect(() => {
    setIsLoading(true);
    // Check for an existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    }).catch(error => {
      console.error('[AuthContext] Error getting initial session:', error);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('[AuthContext] Auth event:', event, session);
        setSession(session);
        setUser(session?.user ?? null);
        // No need to set isLoading here as it's for initial load or explicit actions
      }
    );

    return () => {
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  const login = async (email: string, password: string) => {
    setAuthError(null); // Clear previous errors
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });
      if (error) {
        setAuthError(error);
        Alert.alert('Login Failed', error.message);
        return { success: false, error };
      }
      // onAuthStateChange will handle setting user and session
      return { success: true };
    } catch (error: any) {
      setAuthError(error as AuthError); // Cast to AuthError
      Alert.alert('Login Error', error.message || 'An unexpected error occurred.');
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setAuthError(null); // Clear previous errors
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        // You can add options here, like redirect URLs or metadata
        // options: {
        //   emailRedirectTo: 'yourapp://auth-callback',
        // }
      });

      if (error) {
        setAuthError(error);
        Alert.alert('Sign Up Failed', error.message);
        return { success: false, error };
      }
      
      // Check if user exists and session is null - indicates email confirmation might be needed
      const requiresConfirmation = data.user && !data.session;
      if (requiresConfirmation) {
        Alert.alert('Sign Up Successful', 'Please check your email to confirm your account.');
      }
      // onAuthStateChange will handle setting user and session if signup is immediate
      return { success: true, requiresConfirmation: !!requiresConfirmation };
    } catch (error: any) {
      setAuthError(error as AuthError);
      Alert.alert('Sign Up Error', error.message || 'An unexpected error occurred.');
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setAuthError(null); // Clear previous errors
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setAuthError(error);
        Alert.alert('Logout Failed', error.message);
        return { success: false, error };
      }
      // onAuthStateChange will handle clearing user and session
      return { success: true };
    } catch (error: any) {
      setAuthError(error as AuthError);
      Alert.alert('Logout Error', error.message || 'An unexpected error occurred.');
      return { success: false, error };
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated: !!user, // Derived from user state
        user,
        session,
        authError,
        login,
        signUp,
        logout,
      }}
    >
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
