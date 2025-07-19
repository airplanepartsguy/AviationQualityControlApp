/**
 * ERP Sync Status Indicator Component
 * Shows sync status for batches with visual indicators
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING } from '../styles/theme';

export interface ErpSyncStatusProps {
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  erpSystem?: string;
  onPress?: () => void;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const ErpSyncStatusIndicator: React.FC<ErpSyncStatusProps> = ({
  syncStatus,
  erpSystem = 'ERP',
  onPress,
  size = 'medium',
  showLabel = true
}) => {
  const getStatusConfig = () => {
    switch (syncStatus) {
      case 'synced':
        return {
          icon: 'checkmark-circle' as const,
          color: COLORS.success,
          backgroundColor: COLORS.success + '20',
          label: 'Synced',
          description: `Synced to ${erpSystem}`
        };
      case 'syncing':
        return {
          icon: 'sync' as const,
          color: COLORS.primary,
          backgroundColor: COLORS.primary + '20',
          label: 'Syncing',
          description: `Syncing to ${erpSystem}...`
        };
      case 'failed':
        return {
          icon: 'alert-circle' as const,
          color: COLORS.error,
          backgroundColor: COLORS.error + '20',
          label: 'Failed',
          description: `Sync to ${erpSystem} failed`
        };
      case 'pending':
      default:
        return {
          icon: 'ellipse-outline' as const,
          color: COLORS.warning,
          backgroundColor: COLORS.warning + '20',
          label: 'Pending',
          description: `Pending sync to ${erpSystem}`
        };
    }
  };

  const getSizeConfig = () => {
    switch (size) {
      case 'small':
        return {
          iconSize: 16,
          containerSize: 24,
          fontSize: 10
        };
      case 'large':
        return {
          iconSize: 28,
          containerSize: 40,
          fontSize: 14
        };
      case 'medium':
      default:
        return {
          iconSize: 20,
          containerSize: 32,
          fontSize: 12
        };
    }
  };

  const statusConfig = getStatusConfig();
  const sizeConfig = getSizeConfig();

  const Component = onPress ? TouchableOpacity : View;

  return (
    <Component
      style={[
        styles.container,
        { opacity: onPress ? 1 : 0.9 }
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: statusConfig.backgroundColor,
            width: sizeConfig.containerSize,
            height: sizeConfig.containerSize,
            borderRadius: sizeConfig.containerSize / 2
          }
        ]}
      >
        <Ionicons
          name={statusConfig.icon}
          size={sizeConfig.iconSize}
          color={statusConfig.color}
        />
      </View>
      
      {showLabel && (
        <Text
          style={[
            styles.label,
            {
              color: statusConfig.color,
              fontSize: sizeConfig.fontSize
            }
          ]}
        >
          {statusConfig.label}
        </Text>
      )}
    </Component>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent'
  },
  label: {
    marginTop: SPACING.tiny,
    fontFamily: FONTS.mediumWeight,
    textAlign: 'center'
  }
});

export default ErpSyncStatusIndicator;
