/**
 * SyncStatusIndicator.tsx
 * A component that displays the current synchronization status.
 * It can be used in headers, footers, or as a floating indicator.
 */

import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  Animated,
  Easing
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../contexts/SyncContext';
import { useNetworkStatus } from '../services/networkService';
import { COLORS, SPACING, FONTS, SHADOWS, BORDER_RADIUS } from '../styles/theme';

interface SyncStatusIndicatorProps {
  variant?: 'compact' | 'detailed';
  showControls?: boolean;
  style?: object;
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  variant = 'compact',
  showControls = false,
  style = {}
}) => {
  const { isSyncing, syncStats, lastSyncTime, syncNow, retryFailedItems } = useSync();
  const { isConnected } = useNetworkStatus();
  const [expanded, setExpanded] = useState(false);
  
  // Animation for the sync icon
  const spinValue = new Animated.Value(0);
  
  // Start spinning animation when syncing
  useEffect(() => {
    if (isSyncing) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true
        })
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [isSyncing, spinValue]);
  
  // Calculate rotation for the sync icon
  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });
  
  // Get status text and color
  const getStatusInfo = () => {
    if (!isConnected) {
      return {
        text: 'Offline',
        color: COLORS.warning,
        icon: 'cloud-offline-outline'
      };
    }
    
    if (isSyncing) {
      return {
        text: 'Syncing...',
        color: COLORS.primary,
        icon: 'sync-outline'
      };
    }
    
    if (syncStats.failed > 0) {
      return {
        text: `${syncStats.failed} Failed`,
        color: COLORS.error,
        icon: 'alert-circle-outline'
      };
    }
    
    if (syncStats.pending > 0) {
      return {
        text: `${syncStats.pending} Pending`,
        color: COLORS.warning,
        icon: 'time-outline'
      };
    }
    
    return {
      text: 'Synced',
      color: COLORS.success,
      icon: 'checkmark-circle-outline'
    };
  };
  
  const { text, color, icon } = getStatusInfo();
  
  // Format last sync time
  const getLastSyncText = () => {
    if (!lastSyncTime) return 'Never synced';
    
    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();
    
    // Less than a minute
    if (diff < 60000) {
      return 'Just now';
    }
    
    // Less than an hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
    
    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
    
    // Format as date
    return lastSyncTime.toLocaleDateString();
  };
  
  // Render compact variant
  if (variant === 'compact' && !expanded) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, { borderColor: color }, style]}
        onPress={() => setExpanded(true)}
        activeOpacity={0.7}
      >
        {isSyncing ? (
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons name="sync-outline" size={16} color={color} />
          </Animated.View>
        ) : (
          <Ionicons name={icon as any} size={16} color={color} />
        )}
        <Text style={[styles.statusText, { color }]}>{text}</Text>
      </TouchableOpacity>
    );
  }
  
  // Render detailed or expanded variant
  return (
    <View style={[styles.detailedContainer, style]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {isSyncing ? (
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="sync-outline" size={24} color={color} />
            </Animated.View>
          ) : (
            <Ionicons name={icon as any} size={24} color={color} />
          )}
          <Text style={[styles.statusTextLarge, { color }]}>{text}</Text>
        </View>
        
        {variant === 'compact' && (
          <TouchableOpacity onPress={() => setExpanded(false)}>
            <Ionicons name="close-outline" size={24} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={styles.statValue}>{syncStats.pending}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>In Progress</Text>
          <Text style={styles.statValue}>{syncStats.inProgress}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Completed</Text>
          <Text style={styles.statValue}>{syncStats.completed}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Failed</Text>
          <Text style={[styles.statValue, syncStats.failed > 0 ? styles.errorText : {}]}>
            {syncStats.failed}
          </Text>
        </View>
      </View>
      
      <Text style={styles.lastSyncText}>
        Last synced: {getLastSyncText()}
      </Text>
      
      {showControls && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.button, !isConnected && styles.disabledButton]}
            onPress={syncNow}
            disabled={!isConnected || isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Ionicons name="sync-outline" size={16} color={COLORS.white} />
            )}
            <Text style={styles.buttonText}>Sync Now</Text>
          </TouchableOpacity>
          
          {syncStats.failed > 0 && (
            <TouchableOpacity
              style={[styles.button, styles.retryButton, !isConnected && styles.disabledButton]}
              onPress={retryFailedItems}
              disabled={!isConnected || isSyncing}
            >
              <Ionicons name="refresh-outline" size={16} color={COLORS.white} />
              <Text style={styles.buttonText}>Retry Failed</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.medium,
    borderWidth: 1,
    ...SHADOWS.small
  },
  detailedContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.medium,
    padding: SPACING.medium,
    ...SHADOWS.medium
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.small
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusText: {
    marginLeft: SPACING.tiny,
    fontSize: FONTS.small,
    fontWeight: FONTS.semiBold
  },
  statusTextLarge: {
    marginLeft: SPACING.small,
    fontSize: FONTS.medium,
    fontWeight: FONTS.semiBold
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.small
  },
  statItem: {
    alignItems: 'center'
  },
  statLabel: {
    fontSize: FONTS.tiny,
    color: COLORS.textLight
  },
  statValue: {
    fontSize: FONTS.small,
    fontWeight: FONTS.bold,
    color: COLORS.text
  },
  errorText: {
    color: COLORS.error
  },
  lastSyncText: {
    fontSize: FONTS.tiny,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: SPACING.small
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: SPACING.small
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.small,
    ...SHADOWS.small
  },
  retryButton: {
    backgroundColor: COLORS.accent
  },
  disabledButton: {
    opacity: 0.5
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: FONTS.semiBold,
    marginLeft: SPACING.tiny
  }
});

export default SyncStatusIndicator;
