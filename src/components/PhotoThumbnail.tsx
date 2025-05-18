import React from 'react';
import { View, Image, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, ImageStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // For delete/edit icons
import { PhotoData } from '../types/data'; // Assuming PhotoData type is defined here
import { COLORS, SPACING, BORDER_RADIUS, FONTS, SHADOWS } from '../styles/theme'; // Assuming theme structure

interface PhotoThumbnailProps {
  photo: PhotoData;
  onPress?: (photo: PhotoData) => void; // For viewing/editing
  onDelete?: (photoId: string) => void; // For deletion
  onAnnotate?: (photo: PhotoData) => void; // For re-annotating
  style?: StyleProp<ViewStyle>;
}

const PhotoThumbnail: React.FC<PhotoThumbnailProps> = ({ 
  photo, 
  onPress, 
  onDelete, 
  onAnnotate,
  style 
}) => {
  const hasAnnotations = photo.annotations && photo.annotations.length > 0;
  const imageUri = photo.compressedUri || photo.uri; // Prefer compressed URI for thumbnail

  return (
    <TouchableOpacity 
      style={[styles.container, style]}
      onPress={() => onPress?.(photo)} 
      activeOpacity={onPress ? 0.7 : 1.0} // Only change opacity if pressable
      disabled={!onPress}
    >
      <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
      
      {/* Optional: Overlay indicating annotations */}
      {hasAnnotations && (
        <View style={styles.annotationIndicator}>
          <Ionicons name="brush-outline" size={16} color={COLORS.white} />
        </View>
      )}

      {/* Action buttons overlay */}
      <View style={styles.actionsOverlay}>
        {onAnnotate && (
          <TouchableOpacity style={styles.actionButton} onPress={() => onAnnotate(photo)} activeOpacity={0.7}>
            <Ionicons name="create-outline" size={22} color={COLORS.white} />
          </TouchableOpacity>
        )}
        {onDelete && (
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDelete(photo.id)} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={22} color={COLORS.white} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.small,
    overflow: 'hidden', // Ensure image stays within bounds
    margin: SPACING.small,
    position: 'relative', // Needed for absolute positioning of overlays
    backgroundColor: COLORS.grey200, // Placeholder background
    ...SHADOWS.small,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  annotationIndicator: {
    position: 'absolute',
    top: SPACING.tiny,
    left: SPACING.tiny,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: SPACING.tiny,
    borderRadius: BORDER_RADIUS.small,
  },
  actionsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Semi-transparent background
    paddingVertical: SPACING.tiny,
  },
  actionButton: {
    padding: SPACING.tiny,
  },
  deleteButton: {
    // Optional: Add specific styling for delete, e.g., slight red tint on hover (not directly possible in RN)
  },
});

export default PhotoThumbnail;
