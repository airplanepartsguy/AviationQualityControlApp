import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Device Information Utility
 * Provides device identification and metadata for licensing system
 */

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  platform: string;
  appVersion: string;
  osVersion: string;
  manufacturer?: string;
  model?: string;
}

/**
 * Generate a unique device identifier
 */
const generateDeviceId = (): string => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substr(2, 9);
  const platform = Platform.OS;
  
  return `${platform}_${timestamp}_${random}`;
};

/**
 * Get comprehensive device information
 */
export const getDeviceInfo = async (): Promise<DeviceInfo> => {
  try {
    const deviceInfo: DeviceInfo = {
      deviceId: generateDeviceId(),
      deviceName: Device.deviceName || 'Unknown Device',
      deviceType: Device.deviceType?.toString() || 'Unknown',
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version || '1.0.0',
      osVersion: Device.osVersion || 'Unknown',
      manufacturer: Device.manufacturer || undefined,
      model: Device.modelName || undefined
    };

    console.log('[DeviceInfo] Device information collected:', {
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      platform: deviceInfo.platform
    });

    return deviceInfo;
  } catch (error) {
    console.error('[DeviceInfo] Error getting device info:', error);
    
    // Fallback device info
    return {
      deviceId: generateDeviceId(),
      deviceName: 'Unknown Device',
      deviceType: 'Unknown',
      platform: Platform.OS,
      appVersion: '1.0.0',
      osVersion: 'Unknown'
    };
  }
};

/**
 * Get a persistent device identifier (stored locally)
 */
export const getPersistentDeviceId = async (): Promise<string> => {
  try {
    const AsyncStorage = await import('@react-native-async-storage/async-storage');
    const DEVICE_ID_KEY = 'persistent_device_id';
    
    let deviceId = await AsyncStorage.default.getItem(DEVICE_ID_KEY);
    
    if (!deviceId) {
      deviceId = generateDeviceId();
      await AsyncStorage.default.setItem(DEVICE_ID_KEY, deviceId);
      console.log('[DeviceInfo] Generated new persistent device ID:', deviceId);
    }
    
    return deviceId;
  } catch (error) {
    console.error('[DeviceInfo] Error getting persistent device ID:', error);
    return generateDeviceId();
  }
};

export default {
  getDeviceInfo,
  getPersistentDeviceId
};
