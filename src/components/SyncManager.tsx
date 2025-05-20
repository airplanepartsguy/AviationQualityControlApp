/**
 * SyncManager.tsx
 * A component that manages synchronization throughout the app.
 * It handles:
 * - Initializing the sync service
 * - Displaying a global sync status indicator
 * - Providing sync status notifications
 */

import React, { useEffect, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  Text,
  Animated,
  Easing,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSync } from '../contexts/SyncContext';
import { useNetworkStatus } from '../services/networkService';
import SyncStatusIndicator from './SyncStatusIndicator';
import { COLORS, SPACING, FONTS, SHADOWS, BORDER_RADIUS } from '../styles/theme';
import { Ionicons } from '@expo/vector-icons';

interface SyncManagerProps {
  children: React.ReactNode;
}

const SyncManager: React.FC<SyncManagerProps> = ({ children }) => {
  const { syncStats, isSyncing } = useSync();
  const { isConnected } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'success' | 'warning' | 'error'>('success');
  
  // Animation for notification
  const notificationAnim = new Animated.Value(0);
  
  // Show notification when sync status changes
  useEffect(() => {
    if (isSyncing) {
      showSyncNotification('Syncing data...', 'warning');
    } else if (!isConnected && syncStats.pending > 0) {
      showSyncNotification('You are offline. Changes will sync when connection is restored.', 'warning');
    } else if (syncStats.failed > 0) {
      showSyncNotification(`Failed to sync ${syncStats.failed} items. Tap to retry.`, 'error');
    }
  }, [isSyncing, isConnected, syncStats.pending, syncStats.failed]);
  
  // Show notification
  const showSyncNotification = (message: string, type: 'success' | 'warning' | 'error') => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    
    // Animate notification in
    Animated.timing(notificationAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease)
    }).start();
    
    // Auto-hide after 5 seconds for success and warning notifications
    if (type !== 'error') {
      setTimeout(hideNotification, 5000);
    }
  };
  
  // Hide notification
  const hideNotification = () => {
    Animated.timing(notificationAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.in(Easing.ease)
    }).start(() => {
      setShowNotification(false);
    });
  };
  
  // Get notification background color
  const getNotificationColor = () => {
    switch (notificationType) {
      case 'success':
        return COLORS.success;
      case 'warning':
        return COLORS.warning;
      case 'error':
        return COLORS.error;
      default:
        return COLORS.primary;
    }
  };
  
  // Get notification icon
  const getNotificationIcon = () => {
    switch (notificationType) {
      case 'success':
        return 'checkmark-circle-outline';
      case 'warning':
        return 'alert-outline';
      case 'error':
        return 'close-circle-outline';
      default:
        return 'information-circle-outline';
    }
  };
  
  return (
    <View style={styles.container}>
      {children}
      
      {/* Floating sync status indicator */}
      <View style={[styles.indicatorContainer, { bottom: insets.bottom + SPACING.medium }]}>
        <SyncStatusIndicator variant="compact" />
      </View>
      
      {/* Sync notification */}
      {showNotification && (
        <Animated.View
          style={[
            styles.notification,
            { 
              backgroundColor: getNotificationColor(),
              transform: [{ 
                translateY: notificationAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-100, 0]
                }) 
              }],
              opacity: notificationAnim,
              top: Platform.OS === 'ios' ? insets.top : SPACING.medium
            }
          ]}
        >
          <View style={styles.notificationContent}>
            <Ionicons name={getNotificationIcon() as any} size={24} color={COLORS.white} />
            <Text style={styles.notificationText}>{notificationMessage}</Text>
          </View>
          
          <TouchableOpacity onPress={hideNotification} style={styles.closeButton}>
            <Ionicons name="close-outline" size={20} color={COLORS.white} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  indicatorContainer: {
    position: 'absolute',
    right: SPACING.medium,
    zIndex: 100
  },
  notification: {
    position: 'absolute',
    left: SPACING.medium,
    right: SPACING.medium,
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.medium,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1000,
    ...SHADOWS.medium
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  notificationText: {
    color: COLORS.white,
    marginLeft: SPACING.small,
    fontSize: FONTS.small,
    fontWeight: FONTS.semiBold,
    flex: 1
  },
  closeButton: {
    padding: SPACING.tiny
  }
});

export default SyncManager;
