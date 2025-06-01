// src/lib/supabaseClient.ts
import 'react-native-url-polyfill/auto'; // Required for Supabase to work in React Native
import 'react-native-get-random-values'; // Polyfill for crypto.getRandomValues
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// It's highly recommended to use environment variables for these
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Supabase URL or Anon Key is missing. Please ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in your environment variables (e.g., in a .env file).'
  );
  // Depending on the app's needs, you might throw an error here or disable features that rely on Supabase.
}

// Custom SecureStoreAdapter for Supabase to use expo-secure-store
// This allows Supabase to securely persist session data on the device.
const SecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    return SecureStore.deleteItemAsync(key);
  },
};

// Initialize the Supabase client
// The exclamation marks assert that supabaseUrl and supabaseAnonKey are non-null.
// If they are null (due to missing env vars), createClient will throw an error.
export const supabase: SupabaseClient = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    storage: SecureStoreAdapter, // Supabase expects a Storage object; SecureStoreAdapter fits this role
    autoRefreshToken: true,      // Automatically refresh the session token
    persistSession: true,        // Persist session across app restarts
    detectSessionInUrl: false,   // Crucial for React Native; session detection is not URL-based
  },
});

// Optional: Log initialization status or perform a quick check
if (supabaseUrl && supabaseAnonKey) {
  console.log('Supabase client configured. Attempting to connect...');
  // You could add a small check here, like fetching server time, if needed,
  // but typically, errors will surface when you make your first auth/database call.
} else {
  console.warn('Supabase client is NOT configured due to missing URL or Anon Key. Supabase-dependent features will fail.');
}
