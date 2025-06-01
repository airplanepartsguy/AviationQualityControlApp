import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../styles/theme';
import { useNetworkStatus } from '../services/networkService';

/**
 * NetworkStatusIndicator Component
 * 
 * A visual indicator that shows the current network connectivity status.
 * Displays as a small badge that can be positioned in headers or other UI elements.
 * 
 * Features:
 * - Real-time network status updates
 * - Animated transitions between states
 * - Color-coded for quick recognition (green for online, red for offline)
 * - Optional detailed view with connection type
 */
interface NetworkStatusIndicatorProps {
  showLabel?: boolean;
  showConnectionType?: boolean;
  size?: 'small' | 'medium' | 'large';
  style?: object;
}

const NetworkStatusIndicator: React.FC<NetworkStatusIndicatorProps> = ({
  showLabel = true,
  showConnectionType = false,
  size = 'medium',
  style = {},
}) => {
  const { isConnected, connectionType } = useNetworkStatus();
  const [fadeAnim] = useState(new Animated.Value(1));
  const [scaleAnim] = useState(new Animated.Value(1));
  
  // Get dimensions based on size prop
  const getDimensions = () => {
    switch (size) {
      case 'small':
        return { iconSize: 12, height: 20, fontSize: FONTS.tiny };
      case 'large':
        return { iconSize: 18, height: 28, fontSize: FONTS.small };
      case 'medium':
      default:
        return { iconSize: 14, height: 24, fontSize: FONTS.tiny };
    }
  };
  
  const { iconSize, height, fontSize } = getDimensions();
  
  // Animate when connection status changes
  useEffect(() => {
    // Flash animation
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.4,
        duration: 200,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
    ]).start();
    
    // Pulse animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.1,
        duration: 150,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isConnected, fadeAnim, scaleAnim]);
  
  // Format connection type for display
  const getConnectionTypeLabel = () => {
    if (!connectionType) return 'Unknown';
    
    // Map connection types to more user-friendly labels
    switch (connectionType) {
      case 'wifi':
        return 'WiFi';
      case 'cellular':
        return 'Cellular';
      case 'ethernet':
        return 'Ethernet';
      case 'bluetooth':
        return 'Bluetooth';
      case 'wimax':
        return 'WiMax';
      case 'vpn':
        return 'VPN';
      case 'other':
      default:
        return 'Connected';
    }
  };
  
  return (
    <Animated.View 
      style={[
        styles.container,
        { 
          backgroundColor: isConnected ? COLORS.success + '20' : COLORS.error + '20',
          borderColor: isConnected ? COLORS.success : COLORS.error,
          height,
        },
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      <Ionicons 
        name={isConnected ? 'wifi-outline' : 'cloud-offline-outline'} 
        size={iconSize} 
        color={isConnected ? COLORS.success : COLORS.error} 
      />
      
      {showLabel ? (
        <Text 
          style={[
            styles.statusText, 
            { 
              color: isConnected ? COLORS.success : COLORS.error,
              fontSize,
              marginLeft: SPACING.tiny,
            }
          ]}
        >
          {isConnected ? 'Online' : 'Offline'}
        </Text>
      ) : null}
      
      {showConnectionType && isConnected ? (
        <Text 
          style={[
            styles.connectionTypeText,
            { fontSize }
          ]}
        >
          ({getConnectionTypeLabel()})
        </Text>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.small,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
  },
  statusText: {
    fontWeight: FONTS.semiBold,
  },
  connectionTypeText: {
    color: COLORS.textLight,
    marginLeft: 2,
  },
});

export default NetworkStatusIndicator;
