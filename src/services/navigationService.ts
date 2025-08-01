import { NavigationContainerRef, CommonActions } from '@react-navigation/native';
import { createRef } from 'react';
import { RootStackParamList } from '../types/navigation';

// Create a ref for the navigation container
export const navigationRef = createRef<NavigationContainerRef<RootStackParamList>>();

// Navigation service functions
export const NavigationService = {
  // Navigate to a route
  navigate: (name: string, params?: any) => {
    if (navigationRef.current) {
      navigationRef.current.navigate(name as any, params);
    }
  },

  // Go back
  goBack: () => {
    navigationRef.current?.goBack();
  },

  // Reset navigation state
  reset: (routes: any) => {
    navigationRef.current?.dispatch(
      CommonActions.reset({
        index: 0,
        routes,
      })
    );
  },

  // Quick capture navigation
  quickCapture: (userId: string) => {
    if (navigationRef.current) {
      navigationRef.current.navigate('PhotoCapture' as any, {
        mode: 'Single',
        userId,
        quickCapture: true,
      });
    }
  },

  // Navigate to batch preview
  openBatch: (batchId: number) => {
    if (navigationRef.current) {
      navigationRef.current.navigate('BatchPreview' as any, {
        batchId,
      });
    }
  },

  // Navigate to settings
  openSettings: () => {
    if (navigationRef.current) {
      navigationRef.current.navigate('MainTabs' as any, {
        screen: 'SettingsTab',
      });
    }
  },

  // Navigate to ERP screen
  openERP: () => {
    if (navigationRef.current) {
      navigationRef.current.navigate('MainTabs' as any, {
        screen: 'ERPTab',
      });
    }
  },

  // Get current route name
  getCurrentRoute: () => {
    return navigationRef.current?.getCurrentRoute()?.name;
  },

  // Check if navigation is ready
  isReady: () => {
    return navigationRef.current?.isReady() ?? false;
  },
};

export default NavigationService; 