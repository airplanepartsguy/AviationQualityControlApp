// src/services/authService.ts
import * as SecureStore from 'expo-secure-store';

const USER_ID_KEY = 'qc_app_user_id';
const AUTH_TOKEN_KEY = 'qc_app_auth_token';

/**
 * Simulates a login process.
 * In a real app, this would involve calling an authentication server.
 * Here, we just store a mock user ID and token.
 */
export const login = async (username: string): Promise<{ userId: string; token: string }> => {
  // Simulate successful login
  const mockUserId = `user_${username}_${Date.now()}`;
  const mockToken = `fake-token-${Math.random().toString(36).substring(2)}`;

  try {
    await SecureStore.setItemAsync(USER_ID_KEY, mockUserId);
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, mockToken);
    console.log(`[Auth] User ${mockUserId} logged in successfully.`);
    return { userId: mockUserId, token: mockToken };
  } catch (error) {
    console.error('[Auth] Error storing credentials:', error);
    throw new Error('Failed to save login credentials.');
  }
};

/**
 * Retrieves the stored user ID and token.
 * Returns null if not logged in.
 */
export const getCredentials = async (): Promise<{ userId: string; token: string } | null> => {
  try {
    const userId = await SecureStore.getItemAsync(USER_ID_KEY);
    const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);

    if (userId && token) {
      return { userId, token };
    } else {
      return null;
    }
  } catch (error) {
    console.error('[Auth] Error retrieving credentials:', error);
    return null;
  }
};

/**
 * Simulates a logout process by deleting stored credentials.
 */
export const logout = async (): Promise<void> => {
  try {
    const userId = await SecureStore.getItemAsync(USER_ID_KEY); // Get user ID for logging
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    console.log(`[Auth] User ${userId || 'Unknown'} logged out successfully.`);
  } catch (error) {
    console.error('[Auth] Error deleting credentials during logout:', error);
    // Optionally, still proceed as if logout was successful on the client side
    // throw new Error('Failed to clear login credentials.');
  }
};
