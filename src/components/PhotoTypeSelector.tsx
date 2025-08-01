import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';

interface PhotoType {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isDefect?: boolean;
}

interface PhotoTypeSelectorProps {
  selectedType: string;
  onTypeSelect: (type: string) => void;
  isDefectMode: boolean;
  onDefectModeToggle: () => void;
}

const PHOTO_TYPES: PhotoType[] = [
  {
    id: 'general',
    title: 'General',
    description: 'Standard quality photo',
    icon: 'camera-outline',
    color: COLORS.primary,
  },
  {
    id: 'defect',
    title: 'Defect',
    description: 'Issue or defect found',
    icon: 'warning-outline',
    color: COLORS.error,
    isDefect: true,
  },
  {
    id: 'before',
    title: 'Before',
    description: 'Pre-maintenance state',
    icon: 'time-outline',
    color: COLORS.warning,
  },
  {
    id: 'after',
    title: 'After',
    description: 'Post-maintenance state',
    icon: 'checkmark-circle-outline',
    color: COLORS.success,
  },
  {
    id: 'detail',
    title: 'Detail',
    description: 'Close-up detail shot',
    icon: 'search-outline',
    color: COLORS.info,
  },
  {
    id: 'serial',
    title: 'Serial',
    description: 'Serial number/label',
    icon: 'barcode-outline',
    color: COLORS.accent,
  },
];

const PhotoTypeSelector: React.FC<PhotoTypeSelectorProps> = ({
  selectedType,
  onTypeSelect,
  isDefectMode,
  onDefectModeToggle,
}) => {
  const renderPhotoType = (type: PhotoType) => {
    const isSelected = selectedType === type.id;
    const isDefectType = type.isDefect || false;

    return (
      <TouchableOpacity
        key={type.id}
        style={[
          styles.typeCard,
          isSelected && [styles.selectedCard, { borderColor: type.color }],
          isDefectType && styles.defectCard,
        ]}
        onPress={() => onTypeSelect(type.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.typeIcon, { backgroundColor: isSelected ? type.color : COLORS.grey200 }]}>
          <Ionicons 
            name={type.icon} 
            size={20} 
            color={isSelected ? COLORS.white : type.color} 
          />
        </View>
        <View style={styles.typeInfo}>
          <Text style={[styles.typeTitle, isSelected && { color: type.color }]}>
            {type.title}
          </Text>
          <Text style={styles.typeDescription}>{type.description}</Text>
        </View>
        {isSelected && (
          <View style={[styles.selectedIndicator, { backgroundColor: type.color }]}>
            <Ionicons name="checkmark" size={16} color={COLORS.white} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Photo Type</Text>
        <TouchableOpacity
          style={[
            styles.defectToggle,
            isDefectMode && styles.defectToggleActive,
          ]}
          onPress={onDefectModeToggle}
          activeOpacity={0.7}
        >
          <Ionicons 
            name={isDefectMode ? 'alert' : 'alert-outline'} 
            size={16} 
            color={isDefectMode ? COLORS.white : COLORS.error} 
          />
          <Text style={[
            styles.defectToggleText,
            isDefectMode && styles.defectToggleTextActive,
          ]}>
            Defect Mode
          </Text>
        </TouchableOpacity>
      </View>

      {/* Photo Types Grid */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.typesContainer}
      >
        {PHOTO_TYPES.map(renderPhotoType)}
      </ScrollView>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={[styles.quickAction, { backgroundColor: COLORS.primary }]}
          onPress={() => onTypeSelect('general')}
          activeOpacity={0.7}
        >
          <Text style={styles.quickActionText}>Quick General</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickAction, { backgroundColor: COLORS.error }]}
          onPress={() => {
            onTypeSelect('defect');
            if (!isDefectMode) onDefectModeToggle();
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.quickActionText}>Flag Defect</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
  },
  defectToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  defectToggleActive: {
    backgroundColor: COLORS.error,
  },
  defectToggleText: {
    fontSize: FONTS.small,
    color: COLORS.error,
    marginLeft: SPACING.xs,
    fontWeight: FONTS.mediumWeight,
  },
  defectToggleTextActive: {
    color: COLORS.white,
  },
  typesContainer: {
    paddingRight: SPACING.md,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginRight: SPACING.sm,
    marginBottom: SPACING.xs,
    borderWidth: 2,
    borderColor: COLORS.border,
    minWidth: 140,
  },
  selectedCard: {
    backgroundColor: COLORS.backgroundSecondary,
    borderWidth: 2,
  },
  defectCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  typeInfo: {
    flex: 1,
  },
  typeTitle: {
    fontSize: FONTS.regular,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginBottom: 2,
  },
  typeDescription: {
    fontSize: FONTS.small,
    color: COLORS.textSecondary,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.xs,
  },
  quickActions: {
    flexDirection: 'row',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  quickAction: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  quickActionText: {
    color: COLORS.white,
    fontSize: FONTS.regular,
    fontWeight: FONTS.bold,
  },
});

export default PhotoTypeSelector; 