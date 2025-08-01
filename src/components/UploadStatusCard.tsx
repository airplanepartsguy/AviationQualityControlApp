import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS, STATUS_THEME } from '../styles/theme';

interface UploadStatusCardProps {
  title: string;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'syncing';
  count: number;
  lastUpdate?: string;
  onPress?: () => void;
  subtitle?: string;
}

const UploadStatusCard: React.FC<UploadStatusCardProps> = ({
  title,
  status,
  count,
  lastUpdate,
  onPress,
  subtitle
}) => {
  const statusConfig = STATUS_THEME[status === 'syncing' ? 'uploading' : status];
  
  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return `${count} pending`;
      case 'uploading':
      case 'syncing':
        return `${count} syncing`;
      case 'success':
        return `${count} uploaded`;
      case 'error':
        return `${count} failed`;
      default:
        return `${count} items`;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return 'time-outline';
      case 'uploading':
      case 'syncing':
        return 'cloud-upload-outline';
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'alert-circle';
      default:
        return 'document-outline';
    }
  };

  return (
    <TouchableOpacity 
      style={styles.card} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.backgroundColor }]}>
          <Ionicons 
            name={getStatusIcon()} 
            size={16} 
            color={statusConfig.color} 
          />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.countContainer}>
          <Text style={styles.count}>{count}</Text>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
        {lastUpdate && (
          <Text style={styles.lastUpdate}>
            Last updated: {lastUpdate}
          </Text>
        )}
      </View>

      {status === 'uploading' && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { backgroundColor: statusConfig.backgroundColor }]} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.badge,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  content: {
    marginBottom: SPACING.xs,
  },
  countContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.xs,
  },
  count: {
    fontSize: FONTS.xxLarge,
    fontWeight: FONTS.black,
    color: COLORS.text,
    marginRight: SPACING.xs,
  },
  statusText: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    fontWeight: FONTS.mediumWeight,
  },
  lastUpdate: {
    fontSize: FONTS.small,
    color: COLORS.textTertiary,
  },
  progressContainer: {
    marginTop: SPACING.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: COLORS.grey200,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '60%', // This would be dynamic in a real implementation
  },
});

export default UploadStatusCard; 