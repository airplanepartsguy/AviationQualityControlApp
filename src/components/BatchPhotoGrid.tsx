import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../styles/theme';
import { PhotoData } from '../types/data';

interface BatchPhotoGridProps {
  photos: PhotoData[];
  onPhotoPress: (photo: PhotoData) => void;
  onPhotoDelete?: (photoId: string) => void;
  onPhotoAnnotate?: (photo: PhotoData) => void;
  selectionMode?: boolean;
  selectedPhotos?: string[];
  onPhotoSelect?: (photoId: string) => void;
  showUploadStatus?: boolean;
}

const { width: screenWidth } = Dimensions.get('window');
const GRID_PADDING = SPACING.md;
const PHOTO_SPACING = SPACING.sm;
const PHOTOS_PER_ROW = 3;
const PHOTO_SIZE = (screenWidth - (GRID_PADDING * 2) - (PHOTO_SPACING * (PHOTOS_PER_ROW - 1))) / PHOTOS_PER_ROW;

const BatchPhotoGrid: React.FC<BatchPhotoGridProps> = ({
  photos,
  onPhotoPress,
  onPhotoDelete,
  onPhotoAnnotate,
  selectionMode = false,
  selectedPhotos = [],
  onPhotoSelect,
  showUploadStatus = false,
}) => {
  const { defectPhotos, regularPhotos } = useMemo(() => {
    const defects: PhotoData[] = [];
    const regular: PhotoData[] = [];
    
    photos.forEach(photo => {
      if (photo.metadata?.hasDefects || photo.photoTitle === 'Defect') {
        defects.push(photo);
      } else {
        regular.push(photo);
      }
    });
    
    return { defectPhotos: defects, regularPhotos: regular };
  }, [photos]);

  const getUploadStatusColor = (photo: PhotoData) => {
    const status = photo.syncStatus;
    switch (status) {
      case 'synced':
        return COLORS.success;
      case 'error':
        return COLORS.error;
      case 'pending':
        return COLORS.warning;
      default:
        return COLORS.grey400;
    }
  };

  const getUploadStatusIcon = (photo: PhotoData) => {
    const status = photo.syncStatus;
    switch (status) {
      case 'synced':
        return 'checkmark-circle';
      case 'error':
        return 'alert-circle';
      case 'pending':
        return 'time';
      default:
        return 'cloud-upload-outline';
    }
  };

  const renderPhoto = ({ item, index }: { item: PhotoData; index: number }) => {
    const isSelected = selectedPhotos.includes(item.id);
    const isDefect = item.metadata?.hasDefects || item.photoTitle === 'Defect';
    const hasAnnotations = item.annotations && item.annotations.length > 0;

    return (
      <TouchableOpacity
        style={[
          styles.photoContainer,
          isSelected && styles.selectedPhoto,
          isDefect && styles.defectPhoto,
        ]}
        onPress={() => {
          if (selectionMode && onPhotoSelect) {
            onPhotoSelect(item.id);
          } else {
            onPhotoPress(item);
          }
        }}
        activeOpacity={0.8}
      >
        <Image source={{ uri: item.uri }} style={styles.photoImage} />
        
        {/* Overlays */}
        <View style={styles.photoOverlay}>
          {/* Top indicators */}
          <View style={styles.topIndicators}>
            {isDefect && (
              <View style={[styles.indicator, { backgroundColor: COLORS.error }]}>
                <Ionicons name="warning" size={12} color={COLORS.white} />
              </View>
            )}
            {hasAnnotations && (
              <View style={[styles.indicator, { backgroundColor: COLORS.info }]}>
                <Ionicons name="create" size={12} color={COLORS.white} />
              </View>
            )}
          </View>

          {/* Upload status */}
          {showUploadStatus && (
            <View style={styles.uploadStatus}>
              <View style={[
                styles.uploadStatusBadge,
                { backgroundColor: getUploadStatusColor(item) }
              ]}>
                <Ionicons 
                  name={getUploadStatusIcon(item)} 
                  size={10} 
                  color={COLORS.white} 
                />
              </View>
            </View>
          )}

          {/* Selection indicator */}
          {selectionMode && (
            <View style={styles.selectionOverlay}>
              <View style={[
                styles.selectionIndicator,
                isSelected && styles.selectedIndicator
              ]}>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color={COLORS.white} />
                )}
              </View>
            </View>
          )}

          {/* Action buttons */}
          {!selectionMode && (
            <View style={styles.actionButtons}>
              {onPhotoAnnotate && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: COLORS.info }]}
                  onPress={() => onPhotoAnnotate(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="create-outline" size={14} color={COLORS.white} />
                </TouchableOpacity>
              )}
              {onPhotoDelete && (
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: COLORS.error }]}
                  onPress={() => onPhotoDelete(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={14} color={COLORS.white} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Photo info */}
        <View style={styles.photoInfo}>
          <Text style={styles.photoType} numberOfLines={1}>
            {item.photoTitle || 'Photo'}
          </Text>
          {item.partNumber && (
            <Text style={styles.partNumber} numberOfLines={1}>
              {item.partNumber}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSection = (title: string, photos: PhotoData[], color: string) => {
    if (photos.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIndicator, { backgroundColor: color }]} />
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionCount}>({photos.length})</Text>
        </View>
        <FlatList
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={(item) => item.id}
          numColumns={PHOTOS_PER_ROW}
          scrollEnabled={false}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={photos.length > 1 ? styles.row : undefined}
        />
      </View>
    );
  };

  if (photos.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="images-outline" size={48} color={COLORS.grey400} />
        <Text style={styles.emptyStateText}>No photos in this batch</Text>
        <Text style={styles.emptyStateSubtext}>
          Photos will appear here as you capture them
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderSection('Defect Photos', defectPhotos, COLORS.error)}
      {renderSection('Standard Photos', regularPhotos, COLORS.primary)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  sectionIndicator: {
    width: 4,
    height: 16,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    flex: 1,
  },
  sectionCount: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    fontWeight: FONTS.mediumWeight,
  },
  gridContainer: {
    paddingHorizontal: SPACING.md,
  },
  row: {
    justifyContent: 'space-between',
  },
  photoContainer: {
    width: PHOTO_SIZE,
    aspectRatio: 1,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.grey200,
    ...SHADOWS.small,
  },
  selectedPhoto: {
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  defectPhoto: {
    borderWidth: 2,
    borderColor: COLORS.error,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topIndicators: {
    position: 'absolute',
    top: SPACING.xs,
    left: SPACING.xs,
    flexDirection: 'row',
  },
  indicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.xs,
  },
  uploadStatus: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
  },
  uploadStatusBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.white,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIndicator: {
    backgroundColor: COLORS.primary,
  },
  actionButtons: {
    position: 'absolute',
    bottom: SPACING.xs,
    right: SPACING.xs,
    flexDirection: 'row',
  },
  actionButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.xs,
  },
  photoInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: SPACING.xs,
  },
  photoType: {
    fontSize: FONTS.small,
    color: COLORS.white,
    fontWeight: FONTS.bold,
  },
  partNumber: {
    fontSize: FONTS.tiny,
    color: COLORS.grey300,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyStateText: {
    fontSize: FONTS.medium,
    fontWeight: FONTS.bold,
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyStateSubtext: {
    fontSize: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },
});

export default BatchPhotoGrid; 