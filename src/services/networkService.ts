/**
 * networkService.ts
 * Service for monitoring network connectivity and providing network status information
 * throughout the application.
 */
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';
import { useState, useEffect, useCallback } from 'react';
import { logAnalyticsEvent } from './analyticsService';

// Network state singleton for use outside of React components
let isConnected = false;
let connectionType: string | null = null;
let listeners: Array<(isConnected: boolean) => void> = [];

/**
 * Initialize network monitoring
 * Call this from App.tsx to start monitoring network changes
 */
export const initNetworkMonitoring = (): NetInfoSubscription => {
  console.log('[NetworkService] Initializing network monitoring');
  
  return NetInfo.addEventListener((state: NetInfoState) => {
    const prevConnected = isConnected;
    isConnected = !!state.isConnected;
    connectionType = state.type;
    
    console.log(`[NetworkService] Network status changed: ${isConnected ? 'Connected' : 'Disconnected'} (${connectionType})`);
    
    // Log network state changes to analytics
    if (prevConnected !== isConnected) {
      logAnalyticsEvent('network_status_change', {
        isConnected,
        connectionType,
        timestamp: new Date().toISOString()
      });
    }
    
    // Notify all listeners
    listeners.forEach(listener => listener(isConnected));
  });
};

/**
 * Get current network state
 * @returns Current network connection state
 */
export const getNetworkState = async (): Promise<NetInfoState> => {
  return await NetInfo.fetch();
};

/**
 * Check if device is currently connected
 * @returns Boolean indicating if device has network connectivity
 */
export const isNetworkConnected = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return !!state.isConnected;
};

/**
 * Add a listener for network state changes
 * @param listener Function to call when network state changes
 * @returns Function to remove the listener
 */
export const addNetworkListener = (listener: (isConnected: boolean) => void): (() => void) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
};

/**
 * React hook for network connectivity
 * @returns Object with isConnected and connectionType
 */
export const useNetworkStatus = () => {
  const [networkStatus, setNetworkStatus] = useState({
    isConnected,
    connectionType
  });
  
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setNetworkStatus({
        isConnected: !!state.isConnected,
        connectionType: state.type
      });
    });
    
    return () => unsubscribe();
  }, []);
  
  return networkStatus;
};

/**
 * React hook that executes a callback when network status changes
 * @param onConnected Function to call when device connects to network
 * @param onDisconnected Function to call when device disconnects from network
 */
export const useNetworkCallback = (
  onConnected?: () => void,
  onDisconnected?: () => void
) => {
  const handleNetworkChange = useCallback((state: NetInfoState) => {
    if (state.isConnected && onConnected) {
      onConnected();
    } else if (!state.isConnected && onDisconnected) {
      onDisconnected();
    }
  }, [onConnected, onDisconnected]);
  
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(handleNetworkChange);
    
    // Check current state on mount
    NetInfo.fetch().then(handleNetworkChange);
    
    return () => unsubscribe();
  }, [handleNetworkChange]);
};

export default {
  initNetworkMonitoring,
  getNetworkState,
  isNetworkConnected,
  addNetworkListener,
  useNetworkStatus,
  useNetworkCallback
};
