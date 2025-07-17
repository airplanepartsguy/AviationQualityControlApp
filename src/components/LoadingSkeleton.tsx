/**
 * Loading Skeleton Component for Day 7 Polish
 * Provides smooth loading states throughout the app
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, SPACING } from '../styles/theme';

interface LoadingSkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  animated?: boolean;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
  animated = true
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [animatedValue, animated]);

  const backgroundColor = animated
    ? animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [COLORS.backgroundSecondary, COLORS.border],
      })
    : COLORS.backgroundSecondary;

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
    />
  );
};

// Pre-built skeleton components for common UI patterns
export const CardSkeleton: React.FC = () => (
  <View style={styles.card}>
    <LoadingSkeleton height={24} width="60%" style={{ marginBottom: SPACING.small }} />
    <LoadingSkeleton height={16} width="80%" style={{ marginBottom: SPACING.small }} />
    <LoadingSkeleton height={16} width="40%" />
  </View>
);

export const ListItemSkeleton: React.FC = () => (
  <View style={styles.listItem}>
    <LoadingSkeleton width={40} height={40} borderRadius={20} />
    <View style={styles.listItemContent}>
      <LoadingSkeleton height={18} width="70%" style={{ marginBottom: SPACING.small }} />
      <LoadingSkeleton height={14} width="50%" />
    </View>
  </View>
);

export const PhotoGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <View style={styles.photoGrid}>
    {Array.from({ length: count }).map((_, index) => (
      <LoadingSkeleton
        key={index}
        width="48%"
        height={120}
        borderRadius={8}
        style={styles.photoItem}
      />
    ))}
  </View>
);

export const DashboardSkeleton: React.FC = () => (
  <View style={styles.dashboard}>
    {/* Stats Cards */}
    <View style={styles.statsRow}>
      <CardSkeleton />
      <CardSkeleton />
    </View>
    
    {/* Recent Activity */}
    <View style={styles.section}>
      <LoadingSkeleton height={24} width="40%" style={{ marginBottom: SPACING.medium }} />
      <ListItemSkeleton />
      <ListItemSkeleton />
      <ListItemSkeleton />
    </View>
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: COLORS.backgroundSecondary,
  },
  card: {
    backgroundColor: COLORS.surface,
    padding: SPACING.medium,
    borderRadius: 12,
    marginBottom: SPACING.medium,
    flex: 1,
    marginHorizontal: SPACING.small,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.medium,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.small,
    borderRadius: 8,
  },
  listItemContent: {
    flex: 1,
    marginLeft: SPACING.medium,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: SPACING.medium,
  },
  photoItem: {
    marginBottom: SPACING.medium,
  },
  dashboard: {
    padding: SPACING.medium,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: SPACING.large,
  },
  section: {
    marginBottom: SPACING.large,
  },
});
